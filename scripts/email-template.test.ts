/**
 * Les emails GetPick sont-ils lisibles par un humain qui n'a pas écrit le brief ?
 *
 * L'ACCIDENT QU'ON EMPÊCHE DE REVENIR (28/08/2026)
 *
 * Le corps expédié aux prospects portait, en toutes lettres, les étiquettes de
 * la checklist de rédaction : « CTA unique: », « Réassurance : », « Correctif
 * échantillon: », et un « # 47/100 » en markdown que tout client mail affiche
 * dièse compris. Personne ne l'a vu pendant des semaines parce qu'AUCUN TEST NE
 * LISAIT LE CORPS — les tests vérifiaient qu'un email partait, jamais ce qu'il
 * disait.
 *
 * Ces tests lisent le corps.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { renderEmail, renderEmailText, renderEmailHtml, escapeHtml, quoted, type EmailContent } from "@/lib/email-template";
import { buildAuditResultEmail, buildPostAuditEmail, type AuditReport } from "@/lib/audit-engine";

const sample = (overrides: Partial<EmailContent> = {}): EmailContent => ({
  lead: "Ton audit Marque est prêt.",
  figure: { value: "47/100", caption: "3 citations sur 12 questions d'achat posées à ChatGPT" },
  paragraphs: ["Sur « quelles sneakers pour la ville ? », ChatGPT recommande Loomera. Pas toi."],
  quote: { title: "À publier en premier", body: "Ajoute une FAQ lavage sur la fiche produit." },
  button: { label: "Voir le rapport", url: "https://www.getpick.ai/audit/abc" },
  footnote: "Tu peux tout appliquer toi-même.",
  unsubscribe: { label: "Se désinscrire", url: "https://www.getpick.ai/unsubscribe?t=x" },
  locale: "fr",
  ...overrides,
});

// --- Le jargon interne ne franchit pas la porte ------------------------------

// Chaque motif ci-dessous a RÉELLEMENT été expédié à des prospects.
const BRIEF_LABELS = [
  /CTA unique/i,
  /\bR[ée]assurance\s*:/i,
  /Correctif [ée]chantillon/i,
  /\bSample fix\b/i,
  /\bOne CTA\b/i,
  /\bReassurance\s*:/i,
  /Score r[ée]el de l'audit/i,
  /\bReal audit score\b/i,
];

// Markdown expédié en texte : le lecteur voit le caractère, pas la mise en forme.
const RAW_MARKUP = [/^#{1,6}\s/m, /\*\*/, /^\s*[-*]\s+\S+\s*$/m];

test("un email ne contient aucune étiquette de brief", () => {
  const { text, html } = renderEmail(sample(), "Objet");
  for (const pattern of BRIEF_LABELS) {
    assert.doesNotMatch(text, pattern, `le corps texte porte une étiquette de brief : ${pattern}`);
    assert.doesNotMatch(html, pattern, `le corps HTML porte une étiquette de brief : ${pattern}`);
  }
});

test("un email ne contient pas de markdown brut", () => {
  const { text } = renderEmail(sample(), "Objet");
  for (const pattern of RAW_MARKUP) {
    assert.doesNotMatch(text, pattern, `le corps texte porte du markdown non rendu : ${pattern}`);
  }
});

// --- Le texte doit se suffire à lui-même -------------------------------------

test("la version texte porte seule le chiffre, le fait, le correctif et le lien", () => {
  const content = sample();
  const text = renderEmailText(content);
  assert.ok(text.includes("47/100"), "le chiffre doit être lisible sans HTML");
  assert.ok(text.includes("Loomera"), "le fait doit être lisible sans HTML");
  assert.ok(text.includes(content.quote!.body), "le correctif doit être lisible sans HTML");
  assert.ok(text.includes(content.button.url), "l'URL doit être en clair : un bouton n'existe pas en texte");
  assert.ok(text.includes(content.unsubscribe.url), "le lien de désinscription doit rester atteignable");
});

test("la version texte ne laisse ni ligne vide double ni espace en fin de ligne", () => {
  const text = renderEmailText(sample({ quote: undefined, footnote: undefined }));
  assert.doesNotMatch(text, /\n{3,}/, "trous de mise en page hérités d'un champ absent");
  assert.doesNotMatch(text, /[ \t]+\n/, "espaces en fin de ligne");
});

// --- Un seul appel à l'action ------------------------------------------------

test("un email ne propose qu'un seul bouton", () => {
  const html = renderEmailHtml(sample(), "Objet");
  const anchors = html.match(/<a\s/g) ?? [];
  assert.equal(anchors.length, 2, "exactement deux liens : le bouton et la désinscription");
});

// --- HTML compatible clients mail --------------------------------------------

test("le HTML n'utilise ni CSS moderne ni police distante", () => {
  const html = renderEmailHtml(sample(), "Objet");
  for (const banned of ["display:flex", "display:grid", "@media", "fonts.googleapis", "<link", "position:absolute"]) {
    assert.ok(!html.includes(banned), `${banned} : ignoré ou cassé par Outlook et Gmail`);
  }
  assert.ok(html.includes('role="presentation"'), "les tables de mise en page doivent être ignorées des lecteurs d'écran");
  assert.ok(html.includes("max-width:600px"), "largeur de lecture bornée");
});

test("le HTML échappe le contenu injecté", () => {
  const html = renderEmailHtml(sample({ paragraphs: ['<script>alert("x")</script> & "Marque"'] }), "Objet");
  assert.ok(!html.includes("<script>"), "une balise venue du contenu ne doit jamais être rendue");
  assert.ok(html.includes("&lt;script&gt;"), "elle doit être échappée");
});

test("escapeHtml couvre les cinq caractères", () => {
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

// --- Les guillemets se ferment ----------------------------------------------

// Le code d'origine écrivait `“…"` : ouvrante typographique, fermante droite.
test("les guillemets sont appariés dans les deux langues", () => {
  assert.equal(quoted("x", "fr"), "« x »");
  assert.equal(quoted("x", "en"), "“x”");
});

// --- Les champs optionnels ne laissent pas de cicatrice ----------------------

test("un email sans chiffre, sans citation et sans note reste bien formé", () => {
  const { text, html } = renderEmail(
    sample({ figure: undefined, quote: undefined, footnote: undefined }),
    "Objet"
  );
  assert.ok(text.startsWith("Ton audit"), "le corps commence par la phrase d'accroche");
  assert.ok(text.includes("Voir le rapport : https://"), "le lien reste présent");
  assert.doesNotMatch(text, /undefined|null|\[object/, "un champ absent ne doit jamais fuiter");
  assert.doesNotMatch(html, /undefined|null|\[object/, "un champ absent ne doit jamais fuiter");
});


// =============================================================================
// LES CORPS RÉELLEMENT EXPÉDIÉS
//
// Tout ce qui précède teste le gabarit avec un contenu fabriqué ici. Ça ne
// protège RIEN : la première version de ce fichier passait au vert alors que
// j'avais réinjecté « Correctif échantillon » et « # 47/100 » dans
// `audit-engine.ts` — la mutation n'a cassé aucun test. Le jargon ne vit pas
// dans le gabarit, il vit dans les fonctions qui le remplissent.
//
// Les trois tests ci-dessous appellent les VRAIES fonctions de composition,
// dans les deux langues et sur les trois emails, et lisent ce qui part.
// =============================================================================

const reportFixture = (overrides: Partial<AuditReport> = {}): AuditReport =>
  ({
    audit_id: "11111111-2222-3333-4444-555555555555",
    score: 47,
    engines: [],
    competitors: ["Loomera"],
    fixes: [],
    formula: "",
    structuredDataFound: false,
    category: "sneakers",
    icpSegment: { key: "small_brand_ecommerce", label: "Small brand", buyerIntent: "", remediationFocus: [] },
    buyerIntentPrompts: [
      {
        prompt: "quelles sneakers pour la ville ?",
        available: true,
        brandMentioned: false,
        competitors: ["Loomera"],
        surfaces: [],
      },
      { prompt: "sneakers lavables en machine ?", available: true, brandMentioned: true, competitors: [], surfaces: [] },
    ],
    emailSent: false,
    checks: [],
    monitoring: { trend: [], scoreDelta: null, competitorMovements: [], actions: [], sources: [] },
    auditTier: "free",
    brandSentiment: { label: "neutral", justification: "" },
    categoryPerception: { status: "match", perceived: "sneakers", actual: "sneakers" },
    locale: "fr",
    ...overrides,
  }) as AuditReport;

const realBodies = () => {
  const out: Array<{ name: string; subject: string; body: string; html?: string }> = [];
  for (const locale of ["fr", "en"] as const) {
    const report = reportFixture({ locale });
    out.push({ name: `audit_result/${locale}`, ...buildAuditResultEmail("a@b.co", "Marque", report, locale) });
    for (const step of ["j1_value", "j3_offer"] as const) {
      out.push({ name: `${step}/${locale}`, ...buildPostAuditEmail(step, "a@b.co", "Marque", report, locale) });
    }
  }
  return out;
};

test("CORPS RÉEL — aucun email expédié ne porte d'étiquette de brief", () => {
  for (const mail of realBodies()) {
    for (const pattern of BRIEF_LABELS) {
      assert.doesNotMatch(mail.body, pattern, `${mail.name} : le corps porte ${pattern}`);
      assert.doesNotMatch(mail.subject, pattern, `${mail.name} : l'objet porte ${pattern}`);
      if (mail.html) assert.doesNotMatch(mail.html, pattern, `${mail.name} : le HTML porte ${pattern}`);
    }
  }
});

test("CORPS RÉEL — aucun email expédié ne porte de markdown brut", () => {
  for (const mail of realBodies()) {
    for (const pattern of RAW_MARKUP) {
      assert.doesNotMatch(mail.body, pattern, `${mail.name} : le corps porte du markdown non rendu (${pattern})`);
    }
  }
});

test("CORPS RÉEL — chaque email a un objet, un corps texte, un HTML et un lien de désinscription", () => {
  for (const mail of realBodies()) {
    assert.ok(mail.subject.trim().length > 10, `${mail.name} : objet vide ou trop court`);
    assert.ok(mail.body.includes("http"), `${mail.name} : aucun lien en clair dans le texte`);
    assert.match(mail.body, /désinscrire|Unsubscribe/i, `${mail.name} : pas de désinscription`);
    assert.ok(mail.html && mail.html.startsWith("<!doctype html>"), `${mail.name} : HTML absent`);
    assert.doesNotMatch(mail.body, /undefined|\[object/, `${mail.name} : un champ absent a fuité`);
    assert.doesNotMatch(String(mail.html), /undefined|\[object/, `${mail.name} : un champ absent a fuité dans le HTML`);
  }
});

// =============================================================================
// L'EMAIL NE NOMME PAS UN RIVAL QUE LE RAPPORT REFUSERAIT DE NOMMER
//
// La faute du 14/08 (nommer le rival d'UNE question perdue) avait été corrigée
// dans le rapport et nulle part ailleurs. L'email la commettait encore : le
// prospect lisait « X est recommandé à ta place », cliquait, et le rapport ne
// nommait personne. Une seule source de plancher désormais.
// =============================================================================

test("RIVAL — un rival cité sur une seule question perdue n'est jamais nommé", () => {
  // 4 questions vérifiées, plancher = max(2, ceil(4/3)) = 2. Loomera n'en occupe qu'une.
  const report = reportFixture({
    buyerIntentPrompts: [
      { prompt: "q1", available: true, brandMentioned: false, competitors: ["Loomera"], surfaces: [] },
      { prompt: "q2", available: true, brandMentioned: false, competitors: [], surfaces: [] },
      { prompt: "q3", available: true, brandMentioned: true, competitors: [], surfaces: [] },
      { prompt: "q4", available: true, brandMentioned: true, competitors: [], surfaces: [] },
    ],
  });

  for (const locale of ["fr", "en"] as const) {
    for (const mail of [
      buildAuditResultEmail("a@b.co", "Marque", report, locale),
      buildPostAuditEmail("j1_value", "a@b.co", "Marque", report, locale),
      buildPostAuditEmail("j3_offer", "a@b.co", "Marque", report, locale),
    ]) {
      assert.ok(!mail.subject.includes("Loomera"), `objet : rival sous le plancher nommé — « ${mail.subject} »`);
      assert.ok(!mail.body.includes("Loomera"), "corps : rival sous le plancher nommé");
    }
  }
});

test("RIVAL — un rival qui tient sur deux questions perdues est nommé", () => {
  const report = reportFixture({
    buyerIntentPrompts: [
      { prompt: "q1", available: true, brandMentioned: false, competitors: ["Loomera"], surfaces: [] },
      { prompt: "q2", available: true, brandMentioned: false, competitors: ["Loomera"], surfaces: [] },
      { prompt: "q3", available: true, brandMentioned: true, competitors: [], surfaces: [] },
      { prompt: "q4", available: true, brandMentioned: true, competitors: [], surfaces: [] },
    ],
  });

  const mail = buildAuditResultEmail("a@b.co", "Marque", report, "fr");
  assert.ok(mail.body.includes("Loomera"), "un rival structurel doit être nommé");
});

test("MOTEUR — le repli ne produit jamais « AI recommande »", () => {
  const report = reportFixture({ answerEngine: undefined, buyerIntentPrompts: [
    { prompt: "q1", available: true, brandMentioned: false, competitors: ["Loomera"], surfaces: [] },
    { prompt: "q2", available: true, brandMentioned: false, competitors: ["Loomera"], surfaces: [] },
  ] });

  const fr = buildAuditResultEmail("a@b.co", "Marque", report, "fr");
  const en = buildAuditResultEmail("a@b.co", "Marque", report, "en");
  assert.doesNotMatch(fr.body, /(^|\s)AI\s(recommande|cite|t'a)/, "« AI recommande » : personne n'écrit ça");
  assert.ok(fr.body.includes("L'IA"), "le repli FR doit nommer la catégorie");
  assert.ok(en.body.includes("The AI"), "le repli EN doit nommer la catégorie");
});
