// Tests de copy de la landing pour la story « ChatGPT vend de la pub — la
// réponse en une phrase vraie ». Lecture des constantes réelles (`homeCopy`) et
// des fichiers expédiés (`public/llms.txt`, `src/lib/i18n.ts`). Fonctions pures,
// ZÉRO réseau. Lancer : npm test  (Node >= 23.6).
//
// Couvre AC1 (entrée FAQ FR/EN avec les 3 faits vérifiés), AC2 (portée
// géographique + tiers, pour qu'un lecteur français ne se croie pas concerné),
// AC3 (discipline de sourcing : aucune donnée non tranchée publiée + journal de
// run mentionnant la revérification), AC4 (phrase ajoutée au TL;DR, parité
// FR/EN, non-régression des affirmations existantes), AC5 (section ads + question
// d'achat dans llms.txt), AC6 (la formulation obsolète n'est plus nulle part
// dans la copy expédiée).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homeCopy, type Locale } from "@/lib/i18n";

const LOCALES = ["en", "fr"] as const satisfies readonly Locale[];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = (...segments: string[]) => readFileSync(resolve(repoRoot, ...segments), "utf8");

const llmsTxt = readRepoFile("public", "llms.txt");
const i18nSource = readRepoFile("src", "lib", "i18n.ts");
// `llms.txt` est encolonné à ~78 caractères : une phrase y est coupée par des
// retours à la ligne. Les assertions de contenu portent donc sur une version
// à espaces normalisés, pour ne pas dépendre du point de coupure.
const llmsTxtFlat = llmsTxt.replace(/\s+/g, " ");

// L'entrée FAQ « ads » est retrouvée par sa question, pas par son index : la
// position dans le tableau ne doit pas être un contrat de test.
const adsFaqItem = (locale: Locale) => {
  const item = homeCopy[locale].faqItems.find((entry) => /(pub|ads)/i.test(entry.question));
  assert.ok(item, `${locale}: une entrée FAQ dont la question parle de pub/ads doit exister`);
  return item!;
};

// Découpage en phrases pour la parité FR/EN du TL;DR.
const splitSentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((part) => part.trim().length > 0);

// --- AC1 : l'entrée FAQ énonce les trois faits vérifiés, FR et EN ------------

const AC1_MILESTONES = {
  en: ["below the answer", "carousel"],
  fr: ["sous la réponse", "carrousel"],
} as const;

for (const locale of LOCALES) {
  test(`AC1 — ${locale}: la FAQ porte une entrée « ChatGPT vend de la pub »`, () => {
    const item = adsFaqItem(locale);
    if (locale === "fr") {
      assert.match(item.question, /organique est mort/i);
    } else {
      assert.match(item.question, /is organic dead/i);
    }
  });

  test(`AC1 — ${locale}: la réponse énonce placement sous la réponse + label sponsorisé`, () => {
    const { answer } = adsFaqItem(locale);
    for (const milestone of AC1_MILESTONES[locale]) {
      assert.ok(answer.includes(milestone), `${locale}: la réponse doit contenir « ${milestone} »`);
    }
    assert.match(answer, /sponsor/i, `${locale}: la réponse doit dire que le placement est étiqueté sponsorisé`);
  });

  test(`AC1 — ${locale}: la réponse porte l'ancrage prix 3-5 $ contre 9 €/mois`, () => {
    const { answer } = adsFaqItem(locale);
    // Trait d'union ASCII imposé : le fichier utilise ailleurs des tirets
    // demi-cadratins, qui casseraient l'ancrage recherché par les IA.
    assert.ok(answer.includes("3-5"), `${locale}: le CPC sponsorisé « 3-5 » doit apparaître`);
    assert.ok(answer.includes("9"), `${locale}: l'ancrage « 9 » (€/mois Monitor) doit apparaître`);
  });
}

// --- AC2 : portée réelle — un lecteur français ne doit pas se croire concerné -

// Les marchés sont matchés par expression régulière : la forme longue
// (« United States ») et la forme courte usuelle en copy (« the US ») sont
// toutes deux acceptables, seul compte que le marché soit nommé.
const AC2_MARKETS = {
  en: [/\b(the US|United States)\b/, /\b(the UK|United Kingdom)\b/, /\bCanada\b/, /\bAustralia\b/, /\bNew Zealand\b/],
  fr: [/\b(États-Unis|US)\b/, /\b(Royaume-Uni|UK)\b/, /\bCanada\b/, /\bAustralie\b/, /\bNouvelle-Zélande\b/],
} as const;

for (const locale of LOCALES) {
  test(`AC2 — ${locale}: la réponse nomme la portée géographique et exclut la France`, () => {
    const { answer } = adsFaqItem(locale);
    const named = AC2_MARKETS[locale].filter((market) => market.test(answer));
    assert.ok(
      named.length >= 4,
      `${locale}: au moins 4 des marchés servis doivent être nommés (trouvés : ${named.length})`
    );
    assert.ok(
      locale === "fr" ? answer.includes("pas la France") : answer.includes("not France"),
      `${locale}: l'exclusion explicite de la France est obligatoire`
    );
  });

  test(`AC2 — ${locale}: la réponse restreint la diffusion aux tiers Free et Go`, () => {
    const { answer } = adsFaqItem(locale);
    assert.ok(
      locale === "fr" ? answer.includes("tiers Free et Go") : answer.includes("Free and Go tiers"),
      `${locale}: la restriction aux tiers Free et Go est obligatoire`
    );
  });
}

// --- AC3 : discipline de sourcing — aucune donnée non tranchée publiée -------
// Le seuil d'entrée annonceur est contradictoire selon les sources (« 50 000 $ »
// vs « pas de minimum ») : il est interdit de publication tant qu'il n'est pas
// tranché. Le test scanne TOUTE la copy expédiée par cette story.

const FORBIDDEN_SUBSTRINGS = [
  "50 000",
  "50,000",
  "$50,000",
  "50000",
  "sans minimum",
  "no minimum",
  "minimum spend",
] as const;

test("AC3 — aucune donnée non tranchée (seuil d'entrée annonceur) dans la copy expédiée", () => {
  const shipped = [
    ...LOCALES.flatMap((locale) => [
      homeCopy[locale].tldrBody,
      ...homeCopy[locale].faqItems.flatMap((item) => [item.question, item.answer]),
    ]),
    llmsTxt,
  ].join("\n");
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    assert.ok(
      !shipped.toLowerCase().includes(forbidden.toLowerCase()),
      `la sous-chaîne non tranchée « ${forbidden} » ne doit pas être publiée`
    );
  }
});

test("AC3 — le journal de run atteste la revérification à la source des chiffres publiés", () => {
  const runs = readRepoFile("outbound", "AGENT_RUNS.md");
  const line = runs
    .split("\n")
    .find((entry) => entry.includes("2026-07-28") && /revérifi/i.test(entry) && /chatgpt/i.test(entry));
  assert.ok(
    line,
    "outbound/AGENT_RUNS.md doit porter une entrée du 2026-07-28 attestant la revérification des chiffres ChatGPT Ads"
  );
});

test("AC3 — chaque chiffre publié est adossé à une source datée dans le backlog", () => {
  const backlog = readRepoFile("PRODUCT_BACKLOG.md");
  const start = backlog.indexOf("Claims publiés");
  assert.notEqual(start, -1, "le backlog doit porter le bloc « Claims publiés »");
  // Le bloc s'arrête au prochain item de backlog de premier niveau, sinon on
  // validerait des claims empruntés à un item voisin.
  const end = backlog.indexOf("\n- **", start);
  const block = backlog.slice(start, end === -1 ? undefined : end);
  for (const claim of ["22 juillet 2026", "3-5", "Free et Go", "carrousel"]) {
    assert.ok(block.includes(claim), `le claim « ${claim} » doit figurer dans le bloc sourcé du backlog`);
  }
  // Un claim sans URL n'est pas un claim sourcé.
  assert.ok(
    (block.match(/https:\/\//g) ?? []).length >= 4,
    "le bloc de claims doit porter au moins une URL par claim publié"
  );
});

// --- AC4 : TL;DR — phrase ajoutée, parité FR/EN, non-régression --------------

for (const locale of LOCALES) {
  test(`AC4 — ${locale}: le TL;DR porte la phrase « organique gratuit vs clic sponsorisé »`, () => {
    const { tldrBody } = homeCopy[locale];
    assert.ok(tldrBody.includes("3-5"), `${locale}: le CPC sponsorisé « 3-5 » doit figurer au TL;DR`);
    assert.match(tldrBody, locale === "fr" ? /sponsoris/i : /sponsored/i);
    assert.match(tldrBody, locale === "fr" ? /gratuit/i : /free/i);
  });
}

test("AC4 — parité FR/EN : les deux TL;DR portent le même nombre de phrases", () => {
  const counts = LOCALES.map((locale) => splitSentences(homeCopy[locale].tldrBody).length);
  assert.equal(
    counts[0],
    counts[1],
    `parité rompue : en=${counts[0]} phrase(s), fr=${counts[1]} phrase(s) — une seule phrase doit être ajoutée de chaque côté`
  );
});

// Non-régression : aucune affirmation existante du TL;DR n'a été supprimée en
// ajoutant la phrase du jour.
const AC4_EXISTING_CLAIMS = {
  en: ["€2,000 to €20,000", "€9/month", "€19/month", "llms.txt", "robots.txt", "30 days", "never simulated", "category"],
  fr: ["2 000 à 20 000", "9 €/mois", "19 €/mois", "llms.txt", "robots.txt", "30 jours", "jamais simulées", "catégorie"],
} as const;

for (const locale of LOCALES) {
  test(`AC4 — ${locale}: non-régression, les affirmations existantes du TL;DR sont intactes`, () => {
    const { tldrBody } = homeCopy[locale];
    for (const claim of AC4_EXISTING_CLAIMS[locale]) {
      assert.ok(tldrBody.includes(claim), `${locale}: l'affirmation « ${claim} » ne doit pas disparaître du TL;DR`);
    }
  });
}

// --- AC5 : llms.txt — section dédiée + question d'achat ---------------------

test("AC5 — llms.txt porte une section dédiée aux ads ChatGPT", () => {
  assert.ok(
    llmsTxt.includes("## ChatGPT ads and organic recommendation"),
    "la section « ChatGPT ads and organic recommendation » doit exister"
  );
});

test("AC5 — la section reprend la formulation corrigée (placement, carrousel, portée, tiers, prix)", () => {
  for (const milestone of [
    "below the end of a ChatGPT response",
    "sponsored",
    "shopping carousel is not sold",
    "paid ads are ignored",
    "not France",
    "Free and Go tiers",
    "3 to 5 USD",
    "9 EUR per month",
  ]) {
    assert.ok(llmsTxtFlat.includes(milestone), `llms.txt doit contenir « ${milestone} »`);
  }
});

test("AC5 — la question d'achat ads figure exactement une fois dans « Buyer questions »", () => {
  const question = "- Do ChatGPT ads change which brands the AI recommends?";
  const occurrences = llmsTxt.split(question).length - 1;
  assert.equal(occurrences, 1, "la question d'achat doit figurer exactement une fois");
  const buyerBlock = llmsTxt.slice(
    llmsTxt.indexOf("## Buyer questions GetPick answers"),
    llmsTxt.indexOf("## Original research")
  );
  assert.ok(buyerBlock.includes(question), "la question doit vivre dans le bloc « Buyer questions GetPick answers »");
});

// --- AC6 : la formulation obsolète n'est plus dans la copy expédiée ----------

test("AC6 — la formulation « quand les emplacements payants arriveront » n'est plus expédiée", () => {
  for (const [label, source] of [
    ["src/lib/i18n.ts", i18nSource],
    ["public/llms.txt", llmsTxt],
  ] as const) {
    assert.ok(
      !/emplacements payants arriveront/i.test(source),
      `${label}: la formulation FR obsolète ne doit plus apparaître`
    );
    assert.ok(!/paid placements arrive/i.test(source), `${label}: la formulation EN obsolète ne doit plus apparaître`);
  }
});

// Garde de fond : la copy ne doit jamais laisser croire que GetPick vend,
// revend ou gère des ads ChatGPT — c'est la défense de catégorie qui motive
// toute la story.
test("AC6 — la copy ne positionne jamais GetPick comme un acheteur/revendeur d'ads", () => {
  assert.ok(
    llmsTxtFlat.includes("GetPick does not buy, resell or manage ChatGPT ads"),
    "llms.txt doit démarquer explicitement GetPick de l'achat d'ads"
  );
});
