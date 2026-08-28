/**
 * Défaut n°1 du test de bout en bout du 28/08 : LE CORRECTIF PARTAIT EN ANGLAIS
 * DANS UN MAIL FRANÇAIS.
 *
 * Sur un audit gratuit, `monitoring.actions` est vide et `postAuditActionLines`
 * retombait sur `report.fixes[0]` — une chaîne machine, non localisée, en
 * jargon (« Wikidata-style entity consistency »). Un prospect français recevait
 * un email soigné qui se terminait sur une phrase qu'il ne comprenait pas.
 *
 * Ces tests lisent CE QUI PART, sur les vraies fonctions de composition, et
 * échouent si le repli redevient `fixes[0]` (mutation : restaurer les 6 lignes
 * supprimées dans `postAuditActionLines` remet ces tests au rouge).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildAuditResultEmail, buildPostAuditEmail, type AuditReport } from "@/lib/audit-engine";

// Le jargon RÉELLEMENT expédié le 28/08, plus deux variantes du même moteur.
const JARGON_FIXES = [
  "Ensure Wikidata-style entity consistency across your structured data",
  "Implement schema.org FAQPage markup with entity disambiguation",
];

const reportFixture = (overrides: Partial<AuditReport> = {}): AuditReport =>
  ({
    audit_id: "11111111-2222-3333-4444-555555555555",
    score: 47,
    engines: [],
    competitors: ["Loomera"],
    fixes: JARGON_FIXES,
    formula: "",
    structuredDataFound: false,
    category: "sneakers",
    icpSegment: { key: "small_brand_ecommerce", label: "Small brand", buyerIntent: "", remediationFocus: [] },
    buyerIntentPrompts: [
      { prompt: "quelles sneakers pour la ville ?", available: true, brandMentioned: false, competitors: ["Loomera"], surfaces: [] },
      { prompt: "sneakers lavables en machine ?", available: true, brandMentioned: false, competitors: ["Loomera"], surfaces: [] },
    ],
    emailSent: false,
    checks: [],
    // LE cas du défaut : audit gratuit, aucune action Monitor.
    monitoring: { trend: [], scoreDelta: null, competitorMovements: [], actions: [], sources: [] },
    auditTier: "free",
    brandSentiment: { label: "neutral", justification: "" },
    categoryPerception: { status: "match", perceived: "sneakers", actual: "sneakers" },
    locale: "fr",
    ...overrides,
  }) as AuditReport;

const mailsFor = (locale: "fr" | "en") => {
  const report = reportFixture({ locale });
  return [
    { name: `audit_result/${locale}`, ...buildAuditResultEmail("a@b.co", "Marque", report, locale) },
    { name: `j1_value/${locale}`, ...buildPostAuditEmail("j1_value", "a@b.co", "Marque", report, locale) },
    { name: `j3_offer/${locale}`, ...buildPostAuditEmail("j3_offer", "a@b.co", "Marque", report, locale) },
  ];
};

test("sans action Monitor, aucun email ne recopie le jargon de fixes[]", () => {
  for (const locale of ["fr", "en"] as const) {
    for (const mail of mailsFor(locale)) {
      for (const jargon of ["Wikidata", "entity consistency", "entity disambiguation", "schema.org FAQPage"]) {
        assert.ok(
          !mail.body.includes(jargon) && !String(mail.html ?? "").includes(jargon),
          `${mail.name} : le corps recopie le jargon machine « ${jargon} » — le repli fixes[0] est revenu`
        );
      }
    }
  }
});

test("le repli est rédigé en langue claire, dans la langue du destinataire", () => {
  const fr = buildAuditResultEmail("a@b.co", "Marque", reportFixture({ locale: "fr" }), "fr");
  assert.match(
    fr.body,
    /relis les questions d'achat du rapport/,
    "FR : le repli doit être la ligne claire localisée, pas une chaîne machine"
  );
  assert.doesNotMatch(fr.body, /Free action to do today|What to do:/, "FR : aucune étiquette anglaise dans un mail français");

  const en = buildAuditResultEmail("a@b.co", "Marque", reportFixture({ locale: "en" }), "en");
  assert.match(en.body, /review the report's buyer questions/, "EN : le repli clair existe aussi en anglais");
});

test("quand une action Monitor existe, c'est ELLE qui part (localisée), pas le repli", () => {
  const action = {
    title: "Add a FAQ page for the questions your buyers ask",
    doThis: "Answer the exact audited questions.",
    where: "On your site.",
    basedOn: ["quelles sneakers pour la ville ?"],
  };
  const report = reportFixture({
    locale: "fr",
    monitoring: { trend: [], scoreDelta: null, competitorMovements: [], actions: [action], sources: [] },
  } as Partial<AuditReport>);

  const mail = buildAuditResultEmail("a@b.co", "Marque", report, "fr");
  assert.match(mail.body, /page FAQ/i, "l'action réelle doit partir, traduite via localizePlainAction");
  assert.doesNotMatch(mail.body, /relis les questions d'achat du rapport/, "le repli ne doit pas écraser une vraie action");
});
