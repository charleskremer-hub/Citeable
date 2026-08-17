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

/** `true` si `token` a bien été signé pour `auditId` et n'est pas expiré. */
export function verifyAuditShareToken(
  auditId: string,
  token: string | null | undefined,
  now: number = Date.now()
): boolean {
  const secret = shareSecret();
  if (!secret) return false;
  if (typeof token !== "string") return false;

  const id = String(auditId ?? "").trim();
  if (!id) return false;

  // Le HMAC est en base64url : son alphabet ne contient pas de point, donc le
  // PREMIER point sépare sans ambiguïté l'expiration de la signature.
  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const rawExpiry = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  if (!/^\d+$/.test(rawExpiry) || !provided) return false;

  const expirySeconds = Number.parseInt(rawExpiry, 10);
  if (!Number.isSafeInteger(expirySeconds)) return false;
  if (expirySeconds * 1000 <= now) return false;

  const expected = signature(id, expirySeconds, secret);
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  // `timingSafeEqual` lève sur des longueurs différentes : on écarte ce cas
  // avant, ce qui ne fuit que la longueur — publique par construction.
  if (providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
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
