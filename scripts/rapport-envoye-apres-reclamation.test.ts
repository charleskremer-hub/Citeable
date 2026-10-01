/**
 * BUG PROD 01/10/2026 — audit 9591fb6e (Cabinet R-P Avocats).
 *
 * Charles lance un diagnostic SANS email (audit anonyme), voit le verdict,
 * donne son adresse dans la porte « Rapport complet ». Résultat : aucun email,
 * et la page affiche « On n'a pas réussi à t'envoyer ce rapport par email ».
 * `/api/audit-status` rendait `email_error: "Suppressed: internal/test domain."`
 * — l'erreur de l'adresse ANONYME (anon-…@anonymous.citeable.invalid).
 *
 * CAUSE RACINE, en deux temps :
 *   1. /api/claim-audit rattachait l'email (UPDATE audits SET email) et ne
 *      déclenchait AUCUN envoi : le seul envoi tenté était celui de fin de run,
 *      vers l'adresse .invalid, supprimé à juste titre.
 *   2. Ce run anonyme posait le verrou `emailSendStartedAt` : même un renvoi
 *      ultérieur via `sendAuditEmail` aurait été refusé (« already claimed »).
 *   + course : si l'email était donné PENDANT le run, `runAudit` envoyait à
 *     `args.email` (l'adresse anonyme lue au lancement).
 *
 * Pourquoi aucun test ne l'a vu : les E2E du flux payant/email partaient tous
 * d'un audit lancé AVEC email (capture-email). Le chemin anonyme → réclamation,
 * qui est le chemin par défaut de la landing, n'avait aucun verrou.
 *
 * Ces verrous sont des tests de COUTURE (pas de Postgres dans le bac à sable) :
 * ils prouvent que chaque maillon appelle le suivant. La preuve bout-en-bout se
 * fait en prod (audit anonyme → réclamation → email reçu).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");
const claimRoute = readFileSync(resolve(repoRoot, "src/app/api/claim-audit/route.ts"), "utf8");
const engine = readFileSync(resolve(repoRoot, "src/lib/audit-engine.ts"), "utf8");

function functionBody(source: string, signature: string) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `introuvable : ${signature}`);
  // Assez large pour couvrir la fonction, sans déborder sur tout le fichier.
  return source.slice(start, start + 4000);
}

test("R1 — la réclamation ENVOIE le rapport à l'adresse donnée", () => {
  assert.match(claimRoute, /deliverClaimedAuditEmail\(auditId\)/, "claim-audit doit déclencher l'envoi");
  const updateIdx = claimRoute.indexOf("UPDATE audits SET email");
  const sendIdx = claimRoute.lastIndexOf("deliverClaimedAuditEmail(auditId)");
  assert.ok(updateIdx > -1 && sendIdx > updateIdx, "l'envoi doit suivre le rattachement de l'adresse, pas le précéder");
});

test("R2 — une adresse déjà rattachée et redonnée déclenche le rattrapage", () => {
  const alreadyBlock = claimRoute.slice(claimRoute.indexOf("if (!isAnonymousEmail(audit.email))"), claimRoute.indexOf("UPDATE audits SET email"));
  assert.match(alreadyBlock, /=== email/, "seule la MÊME adresse peut relancer l'envoi (jamais une réattribution)");
  assert.match(alreadyBlock, /deliverClaimedAuditEmail\(auditId\)/);
});

test("R3 — l'envoi après réclamation relâche le verrou hérité du run anonyme, jamais après un envoi réussi", () => {
  const body = functionBody(engine, "export async function deliverClaimedAuditEmail");
  const sentGuard = body.indexOf("emailSent === true");
  const lockRelease = body.indexOf("- 'emailSendStartedAt'");
  const send = body.indexOf("sendAuditEmail(row.email");
  assert.ok(sentGuard > -1, "garde « déjà envoyé » absente : risque de double envoi");
  assert.ok(lockRelease > sentGuard, "le verrou doit être relâché APRÈS la garde « déjà envoyé »");
  assert.ok(send > lockRelease, "sans relâcher le verrou, sendAuditEmail refuse l'envoi");
  assert.match(body, /isAnonymousEmail\(row\.email\)/, "jamais d'envoi vers une adresse anonyme");
  assert.match(body, /schedulePostAuditSequence\(auditId\)/, "la séquence J+1/J+3 n'avait pas pu être programmée en anonyme");
});

test("R4 — la fin de run relit l'adresse en base (réclamation pendant le run)", () => {
  const idx = engine.indexOf("sendAuditEmail(recipientEmail, args.brandName");
  assert.ok(idx > -1, "runAudit doit envoyer à l'adresse relue, pas à args.email");
  const before = engine.slice(Math.max(0, idx - 900), idx);
  assert.match(before, /SELECT email FROM audits WHERE id = \$1/);
  assert.doesNotMatch(engine, /sendAuditEmail\(args\.email, args\.brandName, args\.websiteUrl, reportWithoutEmail/);
});
