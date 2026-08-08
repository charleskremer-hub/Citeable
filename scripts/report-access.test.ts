// La porte du rapport d'audit — unitaires de la DÉCISION, plus un scan de la page.
//
// Fonctions pures, ZÉRO base, ZÉRO réseau. Lancer : npm test (Node >= 23.6).
//
// POURQUOI ON NE REND PAS LA PAGE ICI. Le runner du dépôt (`node --test` + type
// stripping natif) ne transforme pas le JSX : `src/app/audit/[id]/page.tsx`
// n'est pas importable dans cette suite — même raison que
// `scripts/study-retraction.test.ts`. On prouve donc deux choses distinctes :
//   1. la DÉCISION, ici, sur `resolveReportAccess` ;
//   2. le HTML RENDU, dans `e2e/audit-report-gate.spec.ts`, contre une vraie
//      base et le vrai serveur.
// Et on ajoute un scan de la source de la page en filet de sécurité, pour qu'une
// section de détail ne puisse pas être réintroduite hors de la porte.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { PAID_AUDIT_TIERS, isPaidAuditTier, resolveReportAccess, type ReportAccessInput } from "@/lib/report-access";

const base: ReportAccessInput = {
  auditTier: "free",
  emailIsAnonymous: false,
  complete: true,
  failed: false,
  hasActiveSubscription: false,
  shareTokenValid: false,
};

const access = (patch: Partial<ReportAccessInput>) => resolveReportAccess({ ...base, ...patch });

test("AC1 — audit gratuit non réclamé : gaté, porte de capture d'email", () => {
  const verdict = access({ auditTier: "free", emailIsAnonymous: true });
  assert.equal(verdict.locked, true);
  assert.equal(verdict.reason, "claim");

  // Sans `auditTier` en base (audits antérieurs au tiering), on est en gratuit.
  assert.equal(access({ auditTier: undefined, emailIsAnonymous: true }).locked, true);
  assert.equal(access({ auditTier: null, emailIsAnonymous: true }).locked, true);
});

test("AC1bis — audit gratuit réclamé : ouvert (comportement conservé)", () => {
  assert.equal(access({ auditTier: "free", emailIsAnonymous: false }).locked, false);
});

test("AC2 — LE TROU : tier payant sans abonnement actif, il est GATÉ", () => {
  for (const tier of PAID_AUDIT_TIERS) {
    const verdict = access({ auditTier: tier, emailIsAnonymous: false, hasActiveSubscription: false });
    assert.equal(verdict.locked, true, tier);
    assert.equal(verdict.reason, "paywall", tier);
  }
});

test("AC3 — tier payant avec abonnement actif : ouvert", () => {
  for (const tier of PAID_AUDIT_TIERS) {
    assert.equal(access({ auditTier: tier, hasActiveSubscription: true }).locked, false, tier);
  }
});

test("AC4 — jeton de partage valide : ouvert, quel que soit le tier et sans paiement", () => {
  for (const tier of [...PAID_AUDIT_TIERS, "free"]) {
    assert.equal(access({ auditTier: tier, shareTokenValid: true }).locked, false, tier);
  }
  // Y compris sur un audit anonyme jamais réclamé : c'est le chemin de la prospection.
  assert.equal(access({ auditTier: "monitor_9eur", emailIsAnonymous: true, shareTokenValid: true }).locked, false);
});

test("AC5/AC6 — jeton absent, expiré ou falsifié : l'appelant passe `false`, et la porte se referme", () => {
  // `verifyAuditShareToken` rend `false` pour un jeton expiré comme pour un jeton
  // falsifié (voir scripts/audit-share-token.test.ts). Ici on prouve que ce
  // `false` suffit à re-gater, sans message d'erreur ni cas particulier.
  const verdict = access({ auditTier: "monitor_9eur", shareTokenValid: false });
  assert.equal(verdict.locked, true);
  assert.equal(verdict.reason, "paywall");
});

test("FAIL-SAFE : abonnement indécidable (base en panne) = pas d'abonnement", () => {
  // L'appelant rattrape ses erreurs et passe `false`. On vérifie qu'il n'existe
  // aucun troisième état qui ouvrirait par défaut.
  assert.equal(access({ auditTier: "agent_19eur", hasActiveSubscription: false }).locked, true);
});

test("un audit incomplet ou en échec n'est pas gaté : il n'y a rien à protéger", () => {
  assert.equal(access({ auditTier: "monitor_9eur", complete: false }).locked, false);
  assert.equal(access({ auditTier: "monitor_9eur", failed: true }).locked, false);
  assert.equal(access({ auditTier: "free", emailIsAnonymous: true, complete: false }).locked, false);
});

test("L'ANONYMAT DE L'EMAIL NE DÉCIDE PLUS SEUL : un vrai email n'ouvre pas un tier payant", () => {
  // C'est littéralement l'ancienne règle : `isAnonymousEmail(email) && complete && !failed`.
  // Elle rendait `false` — donc « ouvert » — sur exactement cette entrée.
  assert.equal(access({ auditTier: "monitor_9eur", emailIsAnonymous: false }).locked, true);
});

test("isPaidAuditTier ne reconnaît que les tiers vendus", () => {
  for (const tier of PAID_AUDIT_TIERS) assert.equal(isPaidAuditTier(tier), true, tier);
  for (const tier of ["free", "", "  ", "monitor", "agent_9eur", null, undefined]) {
    assert.equal(isPaidAuditTier(tier as string | null | undefined), false, JSON.stringify(tier));
  }
});

// --- Filet de sécurité sur la source de la page ------------------------------
// Les sections de DÉTAIL doivent rester conditionnées par `!reportLocked`. Sans
// ce scan, en ajouter une nouvelle hors de la porte rouvrirait le trou sans
// qu'aucun unitaire ne bouge.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = readFileSync(resolve(repoRoot, "src", "app", "audit", "[id]", "page.tsx"), "utf8");

test("la page décide par resolveReportAccess, et plus par isAnonymousEmail seul", () => {
  assert.ok(pageSource.includes("resolveReportAccess({"), "la page appelle resolveReportAccess");
  assert.ok(
    !/const reportLocked = isAnonymousEmail\(/.test(pageSource),
    "l'ancienne règle `reportLocked = isAnonymousEmail(...)` ne doit plus exister"
  );
  assert.ok(pageSource.includes("verifyAuditShareToken(audit.id"), "le jeton est vérifié contre l'id de CET audit");
});

test("chaque section de détail reste derrière la porte", () => {
  // Les gardes exactes attendues dans la source, une par section de détail.
  const guards = [
    "{complete && !failed && !reportLocked ?", // concurrents + part de voix
    "{complete && !failed && isAgentReport && !reportLocked ?", // chat agent
    "{complete && !failed && isMonitorReport && !reportLocked ?", // contenus à coller
    "{complete && !failed && !isFreeReport && !reportLocked ?", // questions d'achat testées
    "{isAgentReport && proof && !reportLocked ?", // preuve de traitement
  ];
  for (const guard of guards) {
    assert.ok(pageSource.includes(guard), `garde manquante dans la page : ${guard}`);
  }
  // Les fichiers techniques sont gardés par le calcul de `technicalAssets`.
  assert.ok(/technicalAssets =[\s\S]{0,200}!reportLocked/.test(pageSource), "technicalAssets doit dépendre de !reportLocked");
});
