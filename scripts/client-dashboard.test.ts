/**
 * Contrat du tableau de bord client (UI des 3 briques off-site).
 *
 * Invariants :
 *   - accès par LIEN SIGNÉ (jeton HMAC lié à l'audit), jamais en accès libre ;
 *   - la page est noindex (livrable privé) ;
 *   - elle agrège les 3 briques (présence, basculement, page-réponse) sans
 *     aucun gating de paiement (le paiement se joue en amont, pas ici).
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { dashboardShareUrl, verifyAuditShareToken, AUDIT_SHARE_TOKEN_PARAM } from "@/lib/audit-share-token";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stripped(relPath: string) {
  return readFileSync(resolve(repoRoot, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const SECRET = "secret-de-test-suffisamment-long-pour-un-hmac";
const AUDIT_A = "2422444f-4a92-458c-b5a9-6f280ef8e18d";
const AUDIT_B = "0f9a1c2b-1111-2222-3333-444455556666";

function withSecret<T>(value: string, fn: () => T): T {
  const before = process.env.AUDIT_SHARE_SECRET;
  process.env.AUDIT_SHARE_SECRET = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.AUDIT_SHARE_SECRET;
    else process.env.AUDIT_SHARE_SECRET = before;
  }
}

test("dashboardShareUrl — lien signé vers /tableau-de-bord, jeton lié à l'audit", () => {
  withSecret(SECRET, () => {
    const url = dashboardShareUrl("https://www.getpick.ai", AUDIT_A);
    assert.match(url, new RegExp(`/tableau-de-bord/${AUDIT_A}\\?${AUDIT_SHARE_TOKEN_PARAM}=`));
    const token = new URL(url).searchParams.get(AUDIT_SHARE_TOKEN_PARAM);
    assert.equal(verifyAuditShareToken(AUDIT_A, token), true, "le jeton doit valider son audit");
    assert.equal(verifyAuditShareToken(AUDIT_B, token), false, "le jeton d'un audit ne doit pas ouvrir un autre");
  });
});

const page = stripped("src/app/tableau-de-bord/[id]/page.tsx");

test("dashboard — accès gardé par jeton signé", () => {
  assert.match(page, /verifyAuditShareToken/);
  assert.match(page, /AUDIT_SHARE_TOKEN_PARAM/);
});

test("dashboard — livrable privé : noindex", () => {
  assert.match(page, /index:\s*false/);
});

test("dashboard — agrège les 3 briques", () => {
  assert.match(page, /buildPresencePack/);
  assert.match(page, /computeShiftProof/);
  assert.match(page, /hostedAnswerPageSlug/);
});

test("dashboard — aucun gating de paiement dans l'espace client", () => {
  assert.equal(/checkout|stripe|PaidReport|resolveReportAccess|entitlement/i.test(page), false);
});
