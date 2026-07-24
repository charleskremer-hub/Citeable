// Tests unitaires de la page comparative /vs (« GetPick vs les outils GEO
// nommés » / « alternative à Otterly »). Fonctions pures, aucun réseau, tout
// déterministe. Lancer : npm test  (Node >= 23.6).
//
// Couvre AC1 (rivaux nommés + ancrage 9 €), AC2 (JSON-LD FAQPage + ItemList
// parsables, question de catégorie), AC3 (prix datés 2026-07 + source https),
// AC5 (aucun score figé, aucun import de l'étude).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildVsFaqJsonLd,
  buildVsItemListJsonLd,
  formatVsPrice,
  VS_COMPETITORS,
  VS_GETPICK,
  VS_TOOLS,
  vsBillingSuffix,
  vsCopy,
} from "@/lib/vs-comparison";

const LOCALES = ["en", "fr"] as const;
const RIVALS = ["Otterly", "Peec", "Rankscale", "Profound"] as const;

// --- AC1 : les 4 rivaux nommés + ligne GetPick à 9 € + ancrage agence --------

test("AC1 — les 4 rivaux GEO sont nommés dans les données", () => {
  for (const rival of RIVALS) {
    assert.ok(
      VS_TOOLS.some((tool) => tool.name === rival),
      `le rival ${rival} doit figurer dans VS_TOOLS`
    );
  }
});

test("AC1 — VS_COMPETITORS = exactement les 4 rivaux (GetPick exclu)", () => {
  assert.equal(VS_COMPETITORS.length, 4);
  assert.ok(!VS_COMPETITORS.some((tool) => tool.isUs));
  assert.deepEqual(
    VS_COMPETITORS.map((tool) => tool.name).sort(),
    [...RIVALS].sort()
  );
});

test("AC1 — la ligne GetPick porte le prix d'entrée 9 € (EUR)", () => {
  assert.equal(VS_GETPICK.name, "GetPick");
  assert.equal(VS_GETPICK.entryPrice, 9);
  assert.equal(VS_GETPICK.currency, "EUR");
  assert.equal(VS_GETPICK.isUs, true);
  assert.equal(formatVsPrice(VS_GETPICK, "fr"), "9 €");
  assert.equal(formatVsPrice(VS_GETPICK, "en"), "€9");
});

test("AC1 — l'ancrage « travail d'une agence GEO » + « 9 € » est présent, FR et EN", () => {
  assert.match(vsCopy.fr.agencyAnchor, /agence GEO/i);
  assert.match(vsCopy.fr.agencyAnchor, /9\s?€/);
  assert.match(vsCopy.en.agencyAnchor, /GEO agency/i);
  assert.match(vsCopy.en.agencyAnchor, /€9/);
});

// --- AC2 : JSON-LD FAQPage + ItemList parsables, question de catégorie -------

for (const locale of LOCALES) {
  test(`AC2 — buildVsFaqJsonLd(${locale}) parse et contient un nœud FAQPage`, () => {
    const raw = buildVsFaqJsonLd(locale);
    const parsed = JSON.parse(raw) as { "@graph": Array<{ "@type": string; mainEntity?: unknown }> };
    assert.ok(Array.isArray(parsed["@graph"]), "@graph doit être un tableau");
    const faq = parsed["@graph"].find((node) => node["@type"] === "FAQPage");
    assert.ok(faq, "un nœud FAQPage doit être présent");
    assert.ok(
      parsed["@graph"].some((node) => node["@type"] === "Organization"),
      "un nœud Organization doit être présent"
    );
  });

  test(`AC2 — la 1re question ${locale} reprend « meilleur outil GEO / alternative à Otterly »`, () => {
    const parsed = JSON.parse(buildVsFaqJsonLd(locale)) as {
      "@graph": Array<{ "@type": string; mainEntity?: Array<{ name: string }> }>;
    };
    const faq = parsed["@graph"].find((node) => node["@type"] === "FAQPage");
    const firstQuestion = faq?.mainEntity?.[0]?.name ?? "";
    if (locale === "fr") {
      assert.match(firstQuestion, /meilleur outil GEO/i);
      assert.match(firstQuestion, /alternative.*Otterly/i);
    } else {
      assert.match(firstQuestion, /best GEO tool/i);
      assert.match(firstQuestion, /alternative to Otterly/i);
    }
  });

  test(`AC2 — buildVsItemListJsonLd(${locale}) parse en ItemList valide avec offres`, () => {
    const parsed = JSON.parse(buildVsItemListJsonLd(locale)) as {
      "@type": string;
      itemListElement: Array<{ item: { name: string; offers: { price: number; priceCurrency: string } } }>;
    };
    assert.equal(parsed["@type"], "ItemList");
    assert.equal(parsed.itemListElement.length, VS_TOOLS.length);
    for (const element of parsed.itemListElement) {
      assert.ok(typeof element.item.name === "string" && element.item.name.length > 0);
      assert.equal(typeof element.item.offers.price, "number");
      assert.match(element.item.offers.priceCurrency, /^(EUR|USD)$/);
    }
  });
}

// --- AC3 : prix concurrents datés 2026-07 + source vérifiable https ----------

test("AC3 — chaque rival a priceAsOf=2026-07 et une sourceUrl https vérifiable", () => {
  for (const competitor of VS_COMPETITORS) {
    assert.equal(competitor.priceAsOf, "2026-07", `${competitor.name} doit être daté 2026-07`);
    assert.ok(
      competitor.sourceUrl.startsWith("https://"),
      `${competitor.name} doit pointer une sourceUrl https`
    );
    assert.ok(competitor.sourceUrl.length > "https://".length, `${competitor.name} sourceUrl non vide`);
    assert.ok(competitor.sourceLabel.length > 0, `${competitor.name} doit avoir un sourceLabel`);
    assert.equal(typeof competitor.entryPrice, "number");
    assert.ok(competitor.entryPrice > 0, `${competitor.name} prix d'entrée > 0`);
  }
});

// --- AC3 (couche machine) : les caveats prix voyagent dans le JSON-LD + la FAQ -
// Régression review adverse : la mention « billed yearly » ne doit pas vivre
// UNIQUEMENT dans le tableau HTML. Un LLM qui parse l'Offer ou la FAQ doit voir la
// condition d'engagement, sinon il cite « dès $25/mois » (faux en mensuel).

test("AC3 — chaque Offer JSON-LD porte le caveat de facturation de son outil (FR+EN)", () => {
  for (const locale of LOCALES) {
    const parsed = JSON.parse(buildVsItemListJsonLd(locale)) as {
      itemListElement: Array<{ item: { name: string; offers: { description: string } } }>;
    };
    for (const tool of VS_TOOLS) {
      if (!tool.billing) continue;
      const offer = parsed.itemListElement.find((el) => el.item.name === tool.name);
      assert.ok(offer, `${tool.name} doit avoir une Offer`);
      assert.ok(
        offer!.item.offers.description.includes(tool.billing[locale]),
        `${locale}: la description de l'Offer ${tool.name} doit inclure « ${tool.billing[locale]} »`
      );
    }
  }
});

test("AC3 — la FAQ nomme la facturation annuelle à côté des prix Otterly & Profound (FR+EN)", () => {
  for (const locale of LOCALES) {
    const parsed = JSON.parse(buildVsFaqJsonLd(locale)) as {
      "@graph": Array<{ "@type": string; mainEntity?: Array<{ acceptedAnswer: { text: string } }> }>;
    };
    const faq = parsed["@graph"].find((node) => node["@type"] === "FAQPage");
    const answer = faq?.mainEntity?.[0]?.acceptedAnswer.text ?? "";
    for (const name of ["Otterly", "Profound"] as const) {
      const tool = VS_TOOLS.find((t) => t.name === name)!;
      assert.ok(tool.billing, `${name} doit porter une note de facturation`);
      assert.ok(
        answer.includes(tool.billing![locale]),
        `${locale}: la réponse FAQ doit disclore « ${tool.billing![locale]} » pour ${name}`
      );
    }
  }
});

test("AC3 — vsBillingSuffix : suffixe pour un outil facturé à l'année, vide sinon", () => {
  const otterly = VS_TOOLS.find((t) => t.name === "Otterly")!;
  const rankscale = VS_TOOLS.find((t) => t.name === "Rankscale")!;
  assert.ok(vsBillingSuffix(otterly, "en").includes("billed yearly"));
  assert.ok(vsBillingSuffix(otterly, "fr").includes("facturé à l'année"));
  assert.equal(vsBillingSuffix(rankscale, "en"), "");
  assert.equal(vsBillingSuffix(rankscale, "fr"), "");
});

// Régression review adverse (finding 2) : quand la sourceUrl primaire n'est pas
// lisible par un crawler (Peec, page JS), l'Offer JSON-LD doit DISCLORE ce caveat,
// pour ne pas laisser un lecteur machine croire que le prix est confirmé à la
// source qu'il vient de suivre.
test("AC3 — un sourceNote est propagé dans la description de l'Offer (FR+EN)", () => {
  for (const locale of LOCALES) {
    const parsed = JSON.parse(buildVsItemListJsonLd(locale)) as {
      itemListElement: Array<{ item: { name: string; offers: { description: string } } }>;
    };
    for (const tool of VS_TOOLS) {
      if (!tool.sourceNote) continue;
      const offer = parsed.itemListElement.find((el) => el.item.name === tool.name);
      assert.ok(
        offer!.item.offers.description.includes(tool.sourceNote[locale]),
        `${locale}: la description de l'Offer ${tool.name} doit inclure son sourceNote`
      );
    }
  }
});

// --- AC5 : garde anti-régression — aucun score figé, aucune preuve dupliquée -

test("AC5 — le module ne contient aucun champ `score` et n'importe rien de l'étude", () => {
  const modulePath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "lib",
    "vs-comparison.ts"
  );
  const source = readFileSync(modulePath, "utf8");
  // On retire les commentaires : le mot « score » y apparaît légitimement pour
  // documenter l'interdit. Les imports (code) restent scrutés ici.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  // Aucun import de la page study ou de ses artefacts.
  assert.ok(!/from\s+["'][^"']*study/i.test(code), "aucun import depuis study");
  assert.ok(!/from\s+["'][^"']*artifacts/i.test(code), "aucun import depuis artifacts");
  assert.ok(!/results\.json/i.test(code), "aucun résultat figé de l'étude importé");
  // Aucun CHAMP score : on retire aussi les littéraux chaîne (le mot « scores »
  // apparaît dans la copie UI qui, justement, dit qu'on ne réimprime pas les
  // scores). La garde vise une propriété de données figée, pas de la prose.
  const codeNoStrings = code
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  assert.ok(
    !/\bscore\b/i.test(codeNoStrings),
    "vs-comparison.ts ne doit contenir aucun champ score figé"
  );
});

test("AC5 — aucune donnée d'outil ne porte de propriété `score`", () => {
  for (const tool of VS_TOOLS) {
    assert.ok(!("score" in tool), `${tool.name} ne doit pas porter de score figé`);
  }
});

// L'intro « voir l'étude » renvoie vers /study : elle ne doit figer AUCUNE preuve
// périssable (nombre de marques auditées, moteurs testés). Sinon un rerun de
// l'étude (ex. édition juillet 2026, autre échantillon/moteurs) contredirait /vs.
test("AC5 — studyIntro ne fige ni chiffre de preuve ni moteur nommé (FR + EN)", () => {
  for (const locale of LOCALES) {
    const intro = vsCopy[locale].studyIntro;
    assert.ok(
      !/\d/.test(intro),
      `${locale}: studyIntro ne doit figer aucun chiffre (nb de marques, scores) — renvoyer vers /study`
    );
    assert.ok(
      !/\b(ChatGPT|Gemini|Perplexity|Claude|Copilot|Grok)\b/i.test(intro),
      `${locale}: studyIntro ne doit nommer aucun moteur figé — la liste vit dans /study`
    );
  }
});
