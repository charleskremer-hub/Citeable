/**
 * LES GUIDES PROPOSÉS SUR LA LANDING PARLENT DU MÉTIER QUE LA LANDING VEND.
 *
 * Fuite mesurée le 23/09/2026 à 06:2x UTC, en production, sur le commit
 * `20015aa` : la section « Guides IA » de `/fr` et `/en` proposait cinq pages
 * de l'ancien ICP (sneakers DTC, café de spécialité, cosmétique clean, mode
 * éthique, coworking) à une landing qui, depuis le 22/09, vend un service aux
 * expert-comptables. « DTC » apparaissait 2 fois sur `/fr` et 2 fois sur `/en`
 * — alors que le run du 22/09 avait conclu « DTC = 0 partout » après avoir
 * corrigé les `<title>`. La raison est écrite dans le ban ICP lui-même : il ne
 * lit que quatre fichiers, et `answer-pages.ts` n'en fait pas partie.
 *
 * Ce que ce test verrouille, et ce qu'il NE verrouille PAS :
 *   - il verrouille la SÉLECTION (`landingAnswerPages`) et le fait que
 *     `HomeClient` passe par elle plutôt que de filtrer lui-même ;
 *   - il ne rend pas le composant : `node --test` ne charge pas les `.tsx`.
 *     La preuve s'arrête donc au source de `HomeClient.tsx`, relu en clair.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { answerPages, landingAnswerPages } from "@/lib/answer-pages";
import { BEACHHEAD_TRADE } from "@/lib/plan-promises";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const homeClientSource = readFileSync(resolve(repoRoot, "src", "app", "HomeClient.tsx"), "utf8");

const LOCALES = ["fr", "en"] as const;
const OLD_ICP_WORDS = [/\bDTC\b/, /direct-to-consumer/i, /\bshopper/i, /Shopify/i] as const;

test("landing — chaque langue propose au moins un guide, et aucun de l'ancien ICP", () => {
  for (const locale of LOCALES) {
    const pages = landingAnswerPages(locale);
    assert.ok(pages.length > 0, `${locale}: la section « Guides IA » serait vide`);
    for (const page of pages) {
      assert.equal(page.audience, "beachhead", `${locale}/${page.slug}: page hors métier sur la landing`);
      const text = [page.category, page.title, page.metaTitle, page.metaDescription].join(" | ");
      for (const forbidden of OLD_ICP_WORDS) {
        assert.doesNotMatch(text, forbidden, `${locale}/${page.slug}: vocabulaire de l'ancienne cible`);
      }
      assert.ok(
        page.category.includes(BEACHHEAD_TRADE[locale]),
        `${locale}/${page.slug}: la catégorie doit porter le métier « ${BEACHHEAD_TRADE[locale]} »`
      );
    }
  }
});

test("landing — le métier des guides dérive de BEACHHEAD_TRADE, jamais écrit en dur", () => {
  // Le pivot tient sur une propriété : le métier est un paramètre. Si le
  // slug ou la catégorie du guide est écrit en dur, un changement de métier
  // laisse derrière lui une page qui vend l'ancien.
  const source = readFileSync(resolve(repoRoot, "src", "lib", "answer-pages.ts"), "utf8");
  const beachheadBlock = source.slice(source.indexOf('audience: "beachhead"'), source.indexOf('audience: "legacy"'));
  assert.ok(beachheadBlock.length > 0, "aucun seed beachhead trouvé");
  for (const trade of Object.values(BEACHHEAD_TRADE)) {
    assert.ok(!beachheadBlock.includes(trade), `« ${trade} » est écrit en dur dans le seed beachhead`);
  }
  for (const locale of LOCALES) {
    assert.ok(
      landingAnswerPages(locale)[0]?.slug.includes(BEACHHEAD_TRADE[locale]),
      `${locale}: le slug du guide ne dérive pas du métier`
    );
  }
});

test("landing — HomeClient passe par le sélecteur, il ne refiltre pas lui-même", () => {
  // La couture est ici : une page peut être correctement étiquetée et quand
  // même s'afficher si le composant refiltre la liste complète.
  assert.match(homeClientSource, /landingAnswerPages\(locale\)/, "HomeClient doit appeler landingAnswerPages(locale)");
  assert.doesNotMatch(
    homeClientSource,
    /answerPages\s*\.\s*filter/,
    "HomeClient refiltre answerPages : la sélection doit rester dans answer-pages.ts"
  );
});

test("legacy — les cinq pages d'avant le pivot restent servies, elles ne sont pas détruites", () => {
  // Retirer une page de la landing n'est pas la dépublier : leurs URL sont
  // indexées et restent dans le sitemap. Ce test échoue si un run suivant
  // confond « ne plus mettre en avant » et « supprimer ».
  const legacyKeys = new Set(answerPages.filter((p) => p.audience === "legacy").map((p) => p.categoryKey));
  for (const key of ["dtc-sneakers", "specialty-coffee", "clean-beauty", "ethical-fashion", "coworking"]) {
    assert.ok(legacyKeys.has(key), `la page « ${key} » a disparu du catalogue`);
  }
  for (const locale of LOCALES) {
    assert.equal(answerPages.filter((p) => p.locale === locale).length, 6, `${locale}: 5 pages legacy + 1 beachhead attendues`);
  }
});

test("legacy — le sujet des pages d'avant le pivot n'a pas changé de mot", () => {
  // La copy générique parle désormais du « sujet » de la page. Sur les pages
  // legacy, ce sujet doit rester « marques » / « brands » : le refactor ne
  // doit rien avoir changé au texte déjà publié et indexé.
  const fr = answerPages.find((p) => p.locale === "fr" && p.categoryKey === "dtc-sneakers");
  const en = answerPages.find((p) => p.locale === "en" && p.categoryKey === "dtc-sneakers");
  assert.match(fr?.directAnswer ?? "", /les marques dont les preuves/);
  assert.match(en?.directAnswer ?? "", /cite brands with evidence/);
  const beachheadFr = landingAnswerPages("fr")[0];
  assert.match(beachheadFr?.directAnswer ?? "", /les cabinets dont les preuves/);
});
