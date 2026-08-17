#!/usr/bin/env node
/**
 * Génère l'URL SIGNÉE d'un rapport d'audit, à envoyer à un prospect nommé.
 *
 * POURQUOI. Depuis que la porte du rapport dépend de ce qui a été payé (et non
 * plus de l'anonymat de l'email), un audit de prospection en tier payant est
 * gaté comme n'importe quel autre. Le lien signé est le chemin prévu pour la
 * prospection : il ouvre UN rapport, pour une durée bornée, sans paiement et
 * sans capture d'email.
 *
 * USAGE
 *   AUDIT_SHARE_SECRET=… node scripts/audit-share-url.mjs <audit_id> [jours]
 *
 *   <audit_id>  l'identifiant de l'audit (UUID).
 *   [jours]     validité, 30 par défaut.
 *
 * VARIABLES D'ENVIRONNEMENT
 *   AUDIT_SHARE_SECRET   OBLIGATOIRE. Même secret que celui du serveur, sinon
 *                        le lien produit ne sera pas reconnu. Jamais en dur ici.
 *   AUDIT_SHARE_BASE_URL base du site, défaut https://www.getpick.ai
 *
 * EXEMPLE
 *   $ AUDIT_SHARE_SECRET="$(grep '^AUDIT_SHARE_SECRET=' outbound/keys.env | cut -d= -f2-)" \
 *       node scripts/audit-share-url.mjs 2422444f-4a92-458c-b5a9-6f280ef8e18d
 *   https://www.getpick.ai/audit/2422444f-…?k=1788000000.HpZ…
 *
 * N'OUVRE PAS L'URL PRODUITE depuis un agent ou un script : une visite émet
 * `report_viewed` et pollue la north star. Le lien est fait pour le prospect.
 */
import { createHmac } from "node:crypto";

const DEFAULT_TTL_DAYS = 30;
const SECONDS_PER_DAY = 86_400;

const [auditId, rawTtl] = process.argv.slice(2);

if (!auditId) {
  console.error("Usage : AUDIT_SHARE_SECRET=… node scripts/audit-share-url.mjs <audit_id> [jours]");
  process.exit(1);
}

const secret = (process.env.AUDIT_SHARE_SECRET ?? "").trim();
if (!secret) {
  console.error(
    [
      "AUDIT_SHARE_SECRET est absent de l'environnement.",
      "Sans lui, le lien serait signé avec un secret vide et le serveur le refuserait.",
      "Le secret vit dans outbound/keys.env — jamais dans le code.",
    ].join("\n")
  );
  process.exit(1);
}

const ttlDays = rawTtl === undefined ? DEFAULT_TTL_DAYS : Number.parseFloat(rawTtl);
if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
  console.error(`Durée de validité invalide : ${rawTtl}`);
  process.exit(1);
}

const baseUrl = process.env.AUDIT_SHARE_BASE_URL ?? "https://www.getpick.ai";

// Même schéma que src/lib/audit-share-token.ts : HMAC-SHA256 de
// `<audit_id>.<expiry_unix>`, en base64url, l'expiration étant DANS la charge
// signée. Réimplémenté ici en 3 lignes plutôt que d'importer un module .ts, que
// le runtime Node de ce script ne sait pas charger sans outillage.
const expirySeconds = Math.floor(Date.now() / 1000) + Math.round(ttlDays * SECONDS_PER_DAY);
const signature = createHmac("sha256", secret).update(`${auditId}.${expirySeconds}`, "utf8").digest("base64url");

const url = new URL(`/audit/${encodeURIComponent(auditId)}`, baseUrl);
url.searchParams.set("k", `${expirySeconds}.${signature}`);

console.log(url.toString());
console.error(`Valide jusqu'au ${new Date(expirySeconds * 1000).toISOString()} (${ttlDays} j).`);
