import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Jeton signé qui ouvre UN rapport d'audit, et un seul.
 *
 * POURQUOI CE MODULE EXISTE. La prospection envoie à un prospect nommé un lien
 * vers son propre rapport. Ce prospect n'a rien payé et n'a rien réclamé : sans
 * jeton, il tomberait sur la porte. Avant ce module, la « solution » était que
 * le rapport n'était pas gaté du tout dès qu'un vrai email était renseigné —
 * c'est-à-dire pour TOUS les audits de prospection, en tier payant, ouverts à
 * qui possédait l'URL. On remplace un trou par une clé.
 *
 * FORME. `/audit/<id>?k=<expiry_unix>.<hmac base64url>`, la signature portant
 * sur `<audit_id>.<expiry_unix>`. L'expiration est DANS la charge signée : la
 * repousser d'une seconde invalide la signature. Le jeton est autoporteur, il
 * n'y a rien à stocker et rien à révoquer côté base.
 *
 * TROIS RÈGLES, ET ELLES SE DÉFENDENT TOUTES SEULES :
 * 1. **Sans `AUDIT_SHARE_SECRET`, on ne vérifie rien et on n'ouvre rien.** Une
 *    variable d'environnement absente ne doit jamais valoir « pas de contrôle » —
 *    c'est exactement la panne qui avait ouvert le tier payant le 30/07.
 * 2. **Comparaison en temps constant.** `===` sur un HMAC fuit, octet par octet,
 *    de quoi le reconstruire.
 * 3. **Échec silencieux.** Un jeton expiré, falsifié ou signé pour un autre
 *    audit rend `false` : l'appelant retombe sur le comportement gaté normal. On
 *    n'affiche pas « jeton invalide » à un prospect qui a juste cliqué un vieux
 *    lien.
 */

/** Nom du paramètre d'URL. `k` reste court : ces liens passent en email. */
export const AUDIT_SHARE_TOKEN_PARAM = "k";

/** Validité par défaut d'un lien de partage. */
export const AUDIT_SHARE_TOKEN_TTL_DAYS = 30;

const SECONDS_PER_DAY = 86_400;

function shareSecret(): string | null {
  const value = process.env.AUDIT_SHARE_SECRET?.trim();
  return value ? value : null;
}

function signature(auditId: string, expirySeconds: number, secret: string): string {
  return createHmac("sha256", secret).update(`${auditId}.${expirySeconds}`, "utf8").digest("base64url");
}

/**
 * Signe un jeton de partage pour `auditId`, valable `ttlDays` jours.
 *
 * Lève si le secret est absent : un appelant qui SIGNE doit savoir tout de suite
 * qu'il produit un lien mort, plutôt que de l'envoyer à un prospect.
 */
export function signAuditShareToken(
  auditId: string,
  ttlDays: number = AUDIT_SHARE_TOKEN_TTL_DAYS,
  now: number = Date.now()
): string {
  const secret = shareSecret();
  if (!secret) throw new Error("AUDIT_SHARE_SECRET est absent : aucun lien de partage ne peut être signé.");

  const id = String(auditId ?? "").trim();
  if (!id) throw new Error("Un identifiant d'audit est requis pour signer un lien de partage.");
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) throw new Error("La durée de validité doit être un nombre de jours positif.");

  const expirySeconds = Math.floor(now / 1000) + Math.round(ttlDays * SECONDS_PER_DAY);
  return `${expirySeconds}.${signature(id, expirySeconds, secret)}`;
}

/**
 * L'état d'un jeton, en QUATRE valeurs et non plus en un booléen.
 *
 * POURQUOI CETTE FONCTION EXISTE, ALORS QU'UN BOOLÉEN SUFFISAIT. Le booléen
 * confond deux situations qui n'ont RIEN à voir pour la personne au bout du
 * lien :
 *
 *   - `expired`  : la signature est bonne, c'est bien NOUS qui avons envoyé ce
 *     lien à cette personne, il a simplement vécu plus que son TTL ;
 *   - `invalid`  : la signature ne tient pas — jeton bricolé, recopié d'un autre
 *     audit, tronqué. Personne ne lui a jamais rien promis.
 *
 * Les traiter pareil coûte cher : les six liens de prospection envoyés le
 * 03/09/2026 expirent le 29/09 à 08:41:49 UTC, et leurs audits sont en tier
 * `monitor_9eur`. Sans cette distinction, une prospecte qui clique le 30/09 se
 * voit demander 9 € — un paywall qui protège un droit que personne n'a payé.
 *
 * NOTE DE SÉCURITÉ. `expired` est rendu APRÈS vérification de la signature, et
 * jamais avant : sinon n'importe qui obtiendrait l'état « expiré » — et donc la
 * porte ouverte par `report-access` — en fabriquant un jeton daté d'hier.
 * L'expiration est DANS la charge signée, elle ne se falsifie pas.
 */
export type AuditShareTokenState = "absent" | "malformed" | "invalid" | "expired" | "valid";

export function auditShareTokenState(
  auditId: string,
  token: string | null | undefined,
  now: number = Date.now()
): AuditShareTokenState {
  const secret = shareSecret();
  // Sans secret on ne vérifie rien : tout jeton est traité comme non signé par
  // nous. Une variable absente ne vaut jamais « pas de contrôle ».
  if (!secret) return "invalid";
  if (typeof token !== "string" || token === "") return "absent";

  const id = String(auditId ?? "").trim();
  if (!id) return "invalid";

  // Le HMAC est en base64url : son alphabet ne contient pas de point, donc le
  // PREMIER point sépare sans ambiguïté l'expiration de la signature.
  const separator = token.indexOf(".");
  if (separator <= 0) return "malformed";

  const rawExpiry = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  if (!/^\d+$/.test(rawExpiry) || !provided) return "malformed";

  const expirySeconds = Number.parseInt(rawExpiry, 10);
  if (!Number.isSafeInteger(expirySeconds)) return "malformed";

  const expected = signature(id, expirySeconds, secret);
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  // `timingSafeEqual` lève sur des longueurs différentes : on écarte ce cas
  // avant, ce qui ne fuit que la longueur — publique par construction.
  if (providedBytes.length !== expectedBytes.length) return "invalid";
  if (!timingSafeEqual(providedBytes, expectedBytes)) return "invalid";

  // Signature prouvée. C'est SEULEMENT ici que la date peut parler.
  return expirySeconds * 1000 <= now ? "expired" : "valid";
}

/** `true` si `token` a bien été signé pour `auditId` et n'est pas expiré. */
export function verifyAuditShareToken(
  auditId: string,
  token: string | null | undefined,
  now: number = Date.now()
): boolean {
  return auditShareTokenState(auditId, token, now) === "valid";
}

/** L'URL complète à envoyer à un prospect. */
export function auditShareUrl(
  baseUrl: string,
  auditId: string,
  ttlDays: number = AUDIT_SHARE_TOKEN_TTL_DAYS,
  now: number = Date.now()
): string {
  const token = signAuditShareToken(auditId, ttlDays, now);
  const url = new URL(`/audit/${encodeURIComponent(auditId)}`, baseUrl);
  url.searchParams.set(AUDIT_SHARE_TOKEN_PARAM, token);
  return url.toString();
}
