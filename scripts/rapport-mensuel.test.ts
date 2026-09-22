// Le rapport mensuel — le seul livrable récurrent que l'abonnement paie.
//
// POURQUOI CE FICHIER EXISTE (22/09/2026). Le mail de suivi partait déjà après
// chaque rescan, et personne ne l'avait relu depuis le pivot : il était en
// anglais en dur pour un beachhead français, il nommait un palier retiré de la
// vente, et il donnait au client une liste de gestes à faire pendant que la
// page d'accueil lui jure qu'il ne touche à rien. Aucun test ne regardait son
// corps — il n'était vérifiable que par lecture de source, ce qui revient à
// n'être vérifiable par personne.
//
// Ce que ce fichier verrouille, et pourquoi chaque verrou a coûté quelque chose
// une fois :
//   - la LANGUE suit le client (le mail du 28/08 nommait un rival que le
//     rapport ne nommait pas : la surface qui part par la poste avait tort) ;
//   - le PLANCHER du 14/08 s'applique au mail comme au rapport ;
//   - une question indisponible n'est NI gagnée NI perdue ;
//   - aucune promesse hebdomadaire, aucune liste de gestes pour le client,
//     aucune affirmation de publication tant que le moteur off-site n'existe
//     pas. Le mail rapporte ce qui est mesuré, rien de plus.
//
// Fonctions pures, ZÉRO réseau, ZÉRO base. Lancer : npm test  (Node >= 23.6).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { BuyerIntentPromptResult, MonitoringSnapshot } from "@/lib/audit-engine";
import { buildMonthlyMonitoringEmail, monthLabel, namingCounts } from "@/lib/monitoring-email";
import { RECHECK_INTERVAL_DAYS } from "@/lib/plan-promises";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineSource = readFileSync(resolve(repoRoot, "src", "lib", "audit-engine.ts"), "utf8");

const SEPTEMBER = new Date("2026-09-22T08:00:00.000Z");

const emptySnapshot: MonitoringSnapshot = {
  trend: [],
  scoreDelta: null,
  competitorMovements: [],
  actions: [],
  sources: [],
};

function prompt(overrides: Partial<BuyerIntentPromptResult> & { prompt: string }): BuyerIntentPromptResult {
  return { available: true, brandMentioned: false, competitors: [], surfaces: [], ...overrides };
}

/** 6 questions : 2 nommées, 3 perdues avec le même rival, 1 indisponible. */
function sixQuestions(): BuyerIntentPromptResult[] {
  return [
    prompt({ prompt: "q1", brandMentioned: true }),
    prompt({ prompt: "q2", brandMentioned: true }),
    prompt({ prompt: "q3", competitors: ["Cabinet Merisier"] }),
    prompt({ prompt: "q4", competitors: ["Cabinet Merisier"] }),
    prompt({ prompt: "q5", competitors: ["Cabinet Merisier", "Cabinet Ponsard"] }),
    prompt({ prompt: "q6", available: false }),
  ];
}

// --- 1. le compte : une question indisponible n'est ni gagnée ni perdue ------

test("compte — une question indisponible sort du dénominateur", () => {
  const counts = namingCounts(sixQuestions());
  assert.deepEqual(counts, { asked: 5, named: 2, lost: 3 });
});

test("compte — aucune question posée ne produit pas de division ni de NaN", () => {
  assert.deepEqual(namingCounts([]), { asked: 0, named: 0, lost: 0 });
  const mail = buildMonthlyMonitoringEmail({
    brandName: "Cabinet Test", auditId: "a1", score: 0, locale: "fr",
    monitoring: emptySnapshot, buyerIntentPrompts: [], now: SEPTEMBER,
  });
  assert.doesNotMatch(mail.body, /NaN|Infinity|undefined/);
});

// --- 2. la langue suit le client --------------------------------------------

test("langue — le rapport d'un client français est en français, mois compris", () => {
  const mail = buildMonthlyMonitoringEmail({
    brandName: "Cabinet Test", auditId: "a1", score: 42, locale: "fr",
    monitoring: emptySnapshot, buyerIntentPrompts: sixQuestions(), now: SEPTEMBER,
  });
  assert.equal(mail.subject, "Ton rapport GetPick — Cabinet Test, septembre");
  assert.ok(mail.body.includes("L'IA te nomme : 2 / 5"), mail.body);
  assert.ok(mail.body.includes("Quelqu'un d'autre est nommé : 3 / 5"), mail.body);
  assert.doesNotMatch(mail.body, /\b(you|your|report:)\b/i);
});

test("langue — le rapport d'un client anglophone est en anglais", () => {
  const mail = buildMonthlyMonitoringEmail({
    brandName: "Test Firm", auditId: "a1", score: 42, locale: "en",
    monitoring: emptySnapshot, buyerIntentPrompts: sixQuestions(), now: SEPTEMBER,
  });
  assert.equal(mail.subject, "Your GetPick report — Test Firm, September");
  assert.ok(mail.body.includes("AI names you: 2 / 5"), mail.body);
});

test("mois — il est lu en UTC, pas sur l'horloge de la machine qui envoie", () => {
  // 23:30 UTC le 31 août : une lecture en heure locale (UTC+2) dirait septembre.
  assert.equal(monthLabel(new Date("2026-08-31T23:30:00.000Z"), "fr"), "août");
  assert.equal(monthLabel(new Date("2026-09-01T00:30:00.000Z"), "fr"), "septembre");
});

// --- 3. le plancher du 14/08 s'applique au mail comme au rapport -------------

test("plancher — un rival structurel est nommé, un rival isolé ne l'est pas", () => {
  const mail = buildMonthlyMonitoringEmail({
    brandName: "Cabinet Test", auditId: "a1", score: 42, locale: "fr",
    monitoring: emptySnapshot, buyerIntentPrompts: sixQuestions(), now: SEPTEMBER,
  });
  // Merisier : 3 questions perdues sur 5 disponibles ⇒ au-dessus du tiers.
  assert.ok(mail.body.includes("Cabinet Merisier"), mail.body);
  // Ponsard : 1 seule question ⇒ sous le plancher, il ne doit pas être nommé.
  assert.doesNotMatch(mail.body, /Ponsard/, "un rival sous le plancher ne se nomme pas");
});

test("plancher — sans rival structurel, le mail le dit au lieu de nommer quelqu'un", () => {
  const mail = buildMonthlyMonitoringEmail({
    brandName: "Cabinet Test", auditId: "a1", score: 42, locale: "fr",
    monitoring: emptySnapshot,
    buyerIntentPrompts: [
      prompt({ prompt: "q1", competitors: ["Cabinet Ponsard"] }),
      prompt({ prompt: "q2", brandMentioned: true }),
      prompt({ prompt: "q3", brandMentioned: true }),
      prompt({ prompt: "q4", brandMentioned: true }),
    ],
    now: SEPTEMBER,
  });
  assert.doesNotMatch(mail.body, /Ponsard/);
  assert.ok(mail.body.includes("la place est ouverte"), mail.body);
});

// --- 4. le mail ne contredit pas la promesse vendue sur la landing -----------

const BOTH_LOCALES = ["fr", "en"] as const;

test("promesse — aucune cadence hebdomadaire dans le mail", () => {
  if (RECHECK_INTERVAL_DAYS === 7) return;
  for (const locale of BOTH_LOCALES) {
    const mail = buildMonthlyMonitoringEmail({
      brandName: "Cabinet Test", auditId: "a1", score: 42, locale,
      monitoring: emptySnapshot, buyerIntentPrompts: sixQuestions(), now: SEPTEMBER,
    });
    for (const weekly of [/\bweekly\b/i, /this week/i, /cette semaine/i, /chaque semaine/i, /hebdo/i]) {
      assert.doesNotMatch(`${mail.subject}\n${mail.body}`, weekly, `${locale}: ${weekly.source}`);
    }
  }
});

test("promesse — le mail ne donne aucune liste de gestes à faire au client", () => {
  for (const locale of BOTH_LOCALES) {
    const mail = buildMonthlyMonitoringEmail({
      brandName: "Cabinet Test", auditId: "a1", score: 42, locale,
      monitoring: {
        ...emptySnapshot,
        actions: [{ title: "Publier une FAQ", doThis: "Colle ce bloc", where: "Sur ta page d'accueil" }],
      },
      buyerIntentPrompts: sixQuestions(),
      now: SEPTEMBER,
    });
    // Le snapshot PORTE une action ; le mail ne doit pas la transmettre comme
    // une consigne : c'est la contradiction que le pivot interdit.
    // Le ban vise une CONSIGNE, pas la chaîne « à faire » : la clôture du mail
    // dit « Tu n'as rien à faire », et un `/à faire\s*:/` naïf la refusait —
    // c'est-à-dire qu'il interdisait la phrase qui porte la promesse. Deuxième
    // fois aujourd'hui qu'une négation tombe sous un ban écrit trop court.
    for (const todo of [/what to do/i, /choses à faire/i, /ce que tu dois faire/i, /à faire cette/i, /colle /i, /paste /i]) {
      assert.doesNotMatch(mail.body, todo, `${locale}: ${todo.source}`);
    }
  }
});

test("promesse — le mail n'affirme pas avoir publié quoi que ce soit", () => {
  // Le moteur off-site n'existe pas encore. Le jour où il existe, ce test
  // doit être modifié EXPRÈS, avec le lien de la page publiée en preuve.
  for (const locale of BOTH_LOCALES) {
    const mail = buildMonthlyMonitoringEmail({
      brandName: "Cabinet Test", auditId: "a1", score: 42, locale,
      monitoring: emptySnapshot, buyerIntentPrompts: sixQuestions(), now: SEPTEMBER,
    });
    for (const claim of [/on a publié/i, /nous avons publié/i, /we published/i, /published for you/i, /publiée pour toi/i]) {
      assert.doesNotMatch(mail.body, claim, `${locale}: ${claim.source}`);
    }
  }
});

test("clôture — le mail dit que le client n'a rien à faire, et la cadence servie", () => {
  const mail = buildMonthlyMonitoringEmail({
    brandName: "Cabinet Test", auditId: "a1", score: 42, locale: "fr",
    monitoring: emptySnapshot, buyerIntentPrompts: sixQuestions(), now: SEPTEMBER,
  });
  assert.ok(mail.body.includes(`dans ${RECHECK_INTERVAL_DAYS} jours`), mail.body);
});

// --- 5. la couture : le chemin de rescan utilise bien ce module --------------

// `audit-engine.ts` ne s'importe pas dans un test (il tire `pg` et le réseau) :
// la couture se lit EN SOURCE. Une suite verte sur le module pur ne dirait rien
// du câblage — c'est exactement la faute contre laquelle ce dépôt s'est déjà
// fait prendre sur le lien de caisse le 14/09.
test("couture — le rescan construit son mail avec ce module, dans la langue du rapport", () => {
  assert.match(engineSource, /import \{ buildMonthlyMonitoringEmail \} from "\.\/monitoring-email";/);
  const fn = engineSource.match(/export async function sendMonthlyMonitoringEmail[\s\S]*?\n}/);
  assert.ok(fn, "sendMonthlyMonitoringEmail introuvable");
  assert.match(fn[0], /buildMonthlyMonitoringEmail\(\{/);
  assert.match(fn[0], /locale: report\.locale/, "la langue du mail doit venir du rapport, jamais d'une constante");
  assert.match(fn[0], /buyerIntentPrompts: report\.buyerIntentPrompts/);
  assert.match(fn[0], /step: "weekly_monitoring"/, "l'étape journalisée est persistée : elle ne se renomme pas");
  assert.match(engineSource, /await sendMonthlyMonitoringEmail\(brand\.email/, "le rescan doit appeler l'envoi");
});
