/**
 * Le contrat du lot 1 (28/08) : « la page d'audit dit une chose et propose un
 * geste ». Trois critères de recette EXÉCUTABLES, prouvés par mutation :
 *
 *   1. `page.tsx` tient SOUS 600 LIGNES — le rapport ne peut plus regrossir en
 *      silence vers les 1 133 lignes mesurées par le CEO.
 *   2. UN SEUL lien de paiement dans le DOM du rapport OUVERT : Monitor 9 €.
 *      Agent 19 € a quitté la page (il vit sur la landing et les relances).
 *   3. AUCUN contenu de fichier machine (JSON-LD, llms.txt, robots.txt) servi
 *      à un tier gratuit — le gratuit voit des NOMS et des COMPTES, jamais un
 *      extrait.
 *
 * Le runner (`node --test`) ne transforme pas le JSX : comme
 * scripts/report-access.test.ts, on prouve la STRUCTURE sur la source
 * commentaires retirés, et la LOGIQUE sur les fonctions pures de
 * report-insights.ts.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { publishTeaserItems, verdictRival } from "@/app/audit/[id]/report-insights";
import type { BuyerIntentPromptResult } from "@/lib/audit-engine";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rawPage = readFileSync(resolve(repoRoot, "src/app/audit/[id]/page.tsx"), "utf8");

/** Source commentaires retirés : une mutation commentée doit rester détectée. */
function stripped(relPath: string) {
  return readFileSync(resolve(repoRoot, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const pageSource = stripped("src/app/audit/[id]/page.tsx");
// Tout ce que le rapport OUVERT rend en dehors de page.tsx. Un lien de paiement
// ajouté dans l'un d'eux serait un deuxième bouton invisible pour le scan de la
// page seule.
const OPEN_REPORT_COMPONENTS = [
  "src/app/audit/[id]/PublishContent.tsx",
  "src/app/audit/[id]/QuestionList.tsx",
  "src/app/audit/[id]/VisibilityMonitorCard.tsx",
  "src/app/audit/[id]/AgentAuditChat.tsx",
  "src/app/audit/[id]/CopyBlock.tsx",
  "src/app/audit/[id]/AuditPoller.tsx",
  "src/app/audit/[id]/ReportViewBeacon.tsx",
];

// --- 1. La page tient sous 600 lignes ----------------------------------------

test("AC1 — page.tsx reste sous 600 lignes", () => {
  const lines = rawPage.split("\n").length;
  assert.ok(
    lines < 600,
    `page.tsx fait ${lines} lignes (>= 600) : la page recommence à empiler — le lot 1 exige une page qui dit UNE chose`
  );
});

// --- 2. Un seul lien de paiement dans le rapport ouvert ----------------------

test("AC2 — Agent 19 € a entièrement quitté la page d'audit", () => {
  assert.ok(
    !pageSource.includes("AGENT_CHECKOUT_URL"),
    "AGENT_CHECKOUT_URL réapparaît dans page.tsx : deux offres sur un écran, c'est aucune décision prise"
  );
  for (const relPath of OPEN_REPORT_COMPONENTS) {
    assert.ok(
      !stripped(relPath).includes("AGENT_CHECKOUT_URL"),
      `${relPath} : AGENT_CHECKOUT_URL ne doit exister dans aucun composant du rapport ouvert`
    );
  }
});

test("AC2 — exactement UN lien de paiement dans le DOM du rapport ouvert : Monitor", () => {
  // Les liens de paiement du rapport passent tous par FunnelCheckoutLink (qui
  // rend UN <a>) ou par un href={*_CHECKOUT_URL} direct. On compte les deux.
  const funnelLinks = pageSource.match(/<FunnelCheckoutLink/g) ?? [];
  // `<a href={*_CHECKOUT_URL}` : un lien de paiement posé sans passer par
  // FunnelCheckoutLink (c'était le cas des 3 CTA supprimés). Le href passé en
  // prop à FunnelCheckoutLink n'est pas recompté : c'est le même <a>.
  const directHrefs = pageSource.match(/<a[^>]*href=\{[A-Z_]*CHECKOUT_URL\}/g) ?? [];
  const paymentAnchors = funnelLinks.length + directHrefs.length;
  assert.equal(
    paymentAnchors,
    1,
    `${paymentAnchors} liens de paiement dans page.tsx — le rapport propose UN geste : Monitor 9 €`
  );

  // Et ce lien unique est bien Monitor : une occurrence d'import, une d'usage.
  const monitorUses = pageSource.match(/MONITOR_CHECKOUT_URL/g) ?? [];
  assert.equal(monitorUses.length, 2, "MONITOR_CHECKOUT_URL : un import + un seul usage");

  // Aucun composant du rapport ouvert ne porte de lien de paiement.
  for (const relPath of OPEN_REPORT_COMPONENTS) {
    const source = stripped(relPath);
    assert.ok(
      !source.includes("CHECKOUT_URL") && !source.includes("FunnelCheckoutLink"),
      `${relPath} : un lien de paiement s'est glissé hors de page.tsx`
    );
  }
});

// --- 3. Aucun contenu de fichier machine pour le tier gratuit ----------------

test("AC3 — le tier gratuit ne CALCULE même pas les fichiers machine", () => {
  assert.match(
    pageSource,
    /const technicalAssets = complete && !failed && !isFreeReport\s*\?/,
    "generateGeoAgentAssetsFromAudit doit rester gardé par !isFreeReport : sans cette garde, le contenu existe dans le HTML du gratuit"
  );
  const generations = pageSource.match(/generateGeoAgentAssetsFromAudit\(/g) ?? [];
  assert.equal(generations.length, 1, "une seule génération des fichiers machine, sous la garde de tier");
});

test("AC3 — la branche gratuite du bloc « À publier » ne référence aucun contenu", () => {
  // Structure imposée : le bloc `publish-block` ouvre sur la branche gratuite
  // (teaser) et bascule sur <PublishContent> pour les tiers payants. Tout ce
  // qui se trouve AVANT <PublishContent est servi au tier gratuit.
  const start = pageSource.indexOf('data-testid="publish-block"');
  assert.ok(start !== -1, "le bloc « À publier » doit exister");
  const end = pageSource.indexOf("<PublishContent", start);
  assert.ok(end !== -1, "la branche payante doit passer par <PublishContent>");
  const freeBranch = pageSource.slice(start, end);

  for (const banned of ["technicalAssets", "jsonLdSnippet", "robotsFix", "llmsTxt", "CopyBlock", "extractPasteable", ".doThis", ".draft", ".google", "monitorContentBlocks", "proof"]) {
    assert.ok(
      !freeBranch.includes(banned),
      `la branche gratuite du bloc « À publier » référence « ${banned} » : un extrait de contenu payant fuit vers le tier gratuit`
    );
  }
});

test("AC3 — publishTeaserItems nomme et compte, ne livre jamais un extrait", () => {
  for (const locale of ["fr", "en"] as const) {
    const items = publishTeaserItems({
      lostQuestions: ["quelles sneakers pour la ville ?", "sneakers lavables ?"],
      questionCount: 6,
      blockedBots: ["GPTBot", "ClaudeBot"],
      locale,
    });
    const text = items.map((item) => `${item.name} ${item.detail}`).join("\n");

    // Nommé et compté : la réponse rédigée, le schéma FAQ, le llms.txt.
    assert.match(text, /2 réponses|2 written answers/, `${locale} : le compte des réponses rédigées doit être annoncé`);
    assert.match(text, /FAQ/, `${locale} : le schéma FAQ doit être nommé`);
    assert.match(text, /llms\.txt/, `${locale} : le llms.txt doit être nommé`);
    assert.match(text, /robots\.txt/, `${locale} : robots.txt est annoncé quand des crawlers sont bloqués`);
    assert.match(text, /6/, `${locale} : le compte de questions auditées doit apparaître`);

    // Jamais leur contenu.
    for (const marker of ["<script", "application/ld+json", '"@context"', "User-agent:", "Allow:", "Disallow:"]) {
      assert.ok(!text.includes(marker), `${locale} : le teaser contient un extrait de fichier machine (« ${marker} »)`);
    }
  }
});

test("AC3 — pas d'étape sans objet : robots.txt absent quand rien n'est bloqué", () => {
  const items = publishTeaserItems({ lostQuestions: [], questionCount: 6, blockedBots: [], locale: "fr" });
  assert.ok(!items.some((item) => item.name.includes("robots")), "aucun crawler bloqué => pas de ligne robots.txt");
  assert.ok(!items.some((item) => /réponse/i.test(item.name)), "aucune question perdue => pas de promesse de réponse rédigée");
});

// --- Le verdict ouvert respecte le plancher de stabilité ---------------------

const prompt = (patch: Partial<BuyerIntentPromptResult>): BuyerIntentPromptResult =>
  ({ prompt: "q", available: true, brandMentioned: false, competitors: [], surfaces: [], ...patch }) as BuyerIntentPromptResult;

test("PLANCHER — un rival sous le plancher n'est jamais nommé par le verdict ouvert", () => {
  // 4 questions vérifiées, plancher = max(2, ceil(4/3)) = 2 ; Loomera n'en a qu'une.
  const questions = [
    prompt({ prompt: "q1", competitors: ["Loomera"] }),
    prompt({ prompt: "q2" }),
    prompt({ prompt: "q3", brandMentioned: true }),
    prompt({ prompt: "q4", brandMentioned: true }),
  ];
  assert.equal(verdictRival(questions), null);
});

test("PLANCHER — un rival structurel est nommé, avec la question qu'il gagne", () => {
  const questions = [
    prompt({ prompt: "quelles sneakers pour la ville ?", competitors: ["Loomera"] }),
    prompt({ prompt: "q2", competitors: ["Loomera"] }),
    prompt({ prompt: "q3", brandMentioned: true }),
    prompt({ prompt: "q4", brandMentioned: true }),
  ];
  const rival = verdictRival(questions);
  assert.ok(rival, "un rival au plancher doit être nommé");
  assert.equal(rival.name, "Loomera");
  assert.equal(rival.prompt, "quelles sneakers pour la ville ?");
  assert.equal(rival.replacement, true, "la question retenue est une question PERDUE");
});
