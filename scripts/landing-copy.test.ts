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

// `\b` ne fonctionne pas ici : en JS il ne s'amorce qu'entre un `\w` ASCII et
// un non-`\w`, donc `/\bÉtats-Unis\b/` ne matche JAMAIS (« É » n'est pas `\w`,
// même avec le drapeau `u`). On borne donc avec des lookarounds sur les
// propriétés Unicode Lettre/Nombre, qui traitent « É » comme une lettre.
const namesMarket = (text: string, aliases: readonly string[]) =>
  aliases.some((alias) => new RegExp(`(?<![\\p{L}\\p{N}])${alias}(?![\\p{L}\\p{N}])`, "u").test(text));

// Les 7 marchés servis, vérifiés à la source le 2026-07-28 (bloc « Claims
// publiés » du backlog). La forme longue (« United States ») et la forme
// courte usuelle en copy (« the US ») sont toutes deux acceptables ; seul
// compte que le marché soit nommé. La liste est exhaustive et le test l'exige
// entièrement : un seuil partiel laisserait disparaître un marché en silence.
const AC2_MARKETS = {
  en: [["the US", "United States"], ["the UK", "United Kingdom"], ["Canada"], ["Australia"], ["New Zealand"], ["Japan"], ["South Korea"]],
  fr: [["États-Unis"], ["Royaume-Uni"], ["Canada"], ["Australie"], ["Nouvelle-Zélande"], ["Japon"], ["Corée du Sud"]],
} as const satisfies Record<Locale, readonly (readonly string[])[]>;

const EXCLUDES_FRANCE = { en: /not (in )?France/, fr: /pas (la |en )France/ } as const;
const RESTRICTS_TIERS = { en: /Free and Go tiers/, fr: /tiers Free et Go/ } as const;

// Qualificatif temporel accepté : soit un adverbe/nom de portée courante
// (« currently », « current rollout », « diffusion actuelle »), soit une date
// explicite au format publié (« as of 28 July 2026 », « au 28 juillet 2026 »).
const TEMPORAL_QUALIFIER = {
  en: /current(ly| rollout)|as of \d{1,2} \p{L}+ 20\d{2}/iu,
  fr: /actuel(le|lement)|à ce jour|au \d{1,2} \p{L}+ 20\d{2}/iu,
} as const satisfies Record<Locale, RegExp>;

// La portée est exigée sur CHAQUE surface publiée séparément : le bloc « EN
// BREF » est cité isolément par les moteurs, il ne peut pas s'appuyer sur la
// portée présente dans l'entrée FAQ.
const AC2_SURFACES = (locale: Locale) =>
  [
    ["réponse FAQ", adsFaqItem(locale).answer],
    ["TL;DR", homeCopy[locale].tldrBody],
  ] as const;

for (const locale of LOCALES) {
  for (const [surface, text] of AC2_SURFACES(locale)) {
    test(`AC2 — ${locale} / ${surface}: les 7 marchés servis sont nommés`, () => {
      const missing = AC2_MARKETS[locale].filter((aliases) => !namesMarket(text, aliases));
      assert.equal(
        missing.length,
        0,
        `${locale} / ${surface}: marché(s) non nommé(s) : ${missing.map((aliases) => aliases[0]).join(", ")}`
      );
    });

    test(`AC2 — ${locale} / ${surface}: la France est explicitement exclue`, () => {
      assert.match(text, EXCLUDES_FRANCE[locale], `${locale} / ${surface}: l'exclusion explicite de la France est obligatoire`);
    });

    test(`AC2 — ${locale} / ${surface}: la diffusion est restreinte aux tiers Free et Go`, () => {
      assert.match(text, RESTRICTS_TIERS[locale], `${locale} / ${surface}: la restriction aux tiers Free et Go est obligatoire`);
    });

    // La liste des marchés est périssable : elle est passée de 5 à 7 en 24 h
    // pendant la rédaction de cette story. Publiée au présent permanent, elle
    // devient une affirmation exhaustive fausse dès la prochaine ouverture — et
    // le TL;DR est notre surface la plus citée verbatim par les moteurs, donc
    // celle où une liste sans date fait le plus de dégâts. Le test des 7 marchés
    // fige le contenu mais ne détecte aucune péremption : on exige donc en plus
    // qu'un qualificatif temporel soit attaché à la liste, sur CHAQUE surface.
    // Le « Depuis le 22 juillet 2026 » en tête de phrase ne compte pas : il
    // porte sur l'ouverture self-serve, pas sur la portée géographique.
    test(`AC2 — ${locale} / ${surface}: la portée porte un qualificatif temporel`, () => {
      assert.match(
        text,
        TEMPORAL_QUALIFIER[locale],
        `${locale} / ${surface}: la liste de marchés doit être datée ou qualifiée (« current rollout », « currently », « diffusion actuelle », « au JJ mois AAAA »)`
      );
    });
  }
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

// Le chiffre n'est que la forme la plus visible du claim interdit. Sa forme
// PROSE — « n'importe quel annonceur peut acheter » / « any advertiser can
// buy » — affirme la même chose : que le seuil d'entrée est nul. Elle est donc
// bannie au même titre, sinon le ban ne tient que sur la ponctuation.
const FORBIDDEN_PROSE = [
  /n'importe quel annonceur/i,
  /tout annonceur peut/i,
  /à tous les annonceurs/i,
  /any advertiser/i,
  /all advertisers/i,
  /anyone can (buy|advertise)/i,
] as const;

const shippedCopy = () =>
  [
    ...LOCALES.flatMap((locale) => [
      homeCopy[locale].tldrBody,
      ...homeCopy[locale].faqItems.flatMap((item) => [item.question, item.answer]),
    ]),
    llmsTxt,
  ].join("\n");

test("AC3 — aucune donnée non tranchée (seuil d'entrée annonceur) dans la copy expédiée", () => {
  const shipped = shippedCopy();
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    assert.ok(
      !shipped.toLowerCase().includes(forbidden.toLowerCase()),
      `la sous-chaîne non tranchée « ${forbidden} » ne doit pas être publiée`
    );
  }
});

test("AC3 — le seuil d'entrée annonceur n'est pas publié non plus en prose", () => {
  const shipped = shippedCopy();
  for (const forbidden of FORBIDDEN_PROSE) {
    assert.ok(
      !forbidden.test(shipped),
      `la formulation « ${forbidden.source} » affirme un seuil d'entrée nul, claim non tranché : interdit de publication`
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
    "shopping carousel",
    "paid ads are ignored",
    "not France",
    "Free and Go tiers",
    "3 to 5 USD",
    "9 EUR per month",
  ]) {
    assert.ok(llmsTxtFlat.includes(milestone), `llms.txt doit contenir « ${milestone} »`);
  }
});

// Le carrousel shopping : la source (Peec AI) observe que la SÉLECTION ignore
// le payant. Elle n'établit pas qu'OpenAI ne VEND pas ce placement — c'est une
// affirmation sur sa politique commerciale, que rien ne tranche. La landing
// FR/EN attribue correctement ; `llms.txt` doit en faire autant, d'autant que
// c'est le fichier que nous demandons explicitement aux moteurs de citer : la
// première phrase d'une puce est la plus courte, donc la plus citable.
test("AC5 — le claim sur le carrousel est attribué, jamais affirmé en voix propre", () => {
  assert.ok(
    llmsTxtFlat.includes("Independent research published in June 2026 by Peec AI"),
    "llms.txt doit attribuer nommément la recherche sur le carrousel shopping"
  );
  assert.doesNotMatch(
    llmsTxtFlat,
    /carousel (is|was|are) not (sold|for sale)|does not sell the (shopping )?carousel/i,
    "llms.txt ne doit pas affirmer en voix propre qu'OpenAI ne vend pas le carrousel — aucune source ne l'établit"
  );
});

// La liste de marchés sur la surface machine doit porter une date EXPLICITE,
// pas un simple « currently » : llms.txt est lu hors contexte et sans page
// d'origine, un adverbe de portée n'y date rien. La liste est passée de 5 à 7
// marchés en 24 h pendant la rédaction de cette story — sans date, elle devient
// une affirmation exhaustive fausse à la prochaine ouverture de marché.
test("AC5 — la portée géographique de llms.txt est datée et complète", () => {
  assert.match(
    llmsTxtFlat,
    /as of \d{1,2} \p{L}+ 20\d{2}/iu,
    "llms.txt doit dater explicitement la liste des marchés (« As of JJ Month AAAA »)"
  );

  const missing = AC2_MARKETS.en.filter((aliases) => !namesMarket(llmsTxtFlat, aliases));
  assert.equal(missing.length, 0, `llms.txt: marché(s) non nommé(s) : ${missing.map((a) => a[0]).join(", ")}`);

  assert.match(llmsTxtFlat, EXCLUDES_FRANCE.en, "llms.txt doit exclure explicitement la France");
  assert.match(llmsTxtFlat, RESTRICTS_TIERS.en, "llms.txt doit restreindre la diffusion aux tiers Free et Go");
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

// Cohérence produit ↔ surfaces machine. Deux surfaces annoncent le compte de
// questions par tier à un lecteur non humain : `public/llms.txt` (le fichier
// que nous demandons explicitement aux IA de lire) et le JSON-LD
// `SoftwareApplication` de `src/app/layout.tsx` (rendu sur TOUTES les pages,
// donc le signal structuré de plus haute confiance). Les verrouiller sur une
// seule des deux laisse l'autre diverger en silence — c'est exactement ce qui
// s'est produit le 28/07 : llms.txt corrigé à 6, JSON-LD resté à 3, soit deux
// chiffres produit contradictoires sur le même domaine. Les deux sont donc
// exigées ici, contre la constante réelle du moteur lue dans la source (aucun
// import : `audit-engine` tire des dépendances réseau).
//
// La regex est ancrée sur `const count =` : `audit-engine.ts` contient un
// SECOND ternaire de même forme deux lignes plus bas (`const minAi = tier ===
// "free" ? 3 : 4;`). Un `match` non ancré prend la première occurrence dans
// l'ordre du fichier et lirait 3/4 au moindre réordonnancement — c'est-à-dire
// qu'il exigerait précisément le chiffre faux que cette story vient de retirer.
const TIER_COUNT_RE = /const count = tier === "free" \? (\d+) : (\d+);/;

test("surfaces machine — le nombre de questions par tier est celui du moteur d'audit", () => {
  const engineSource = readRepoFile("src", "lib", "audit-engine.ts");
  const match = engineSource.match(TIER_COUNT_RE);
  assert.ok(match, 'audit-engine.ts doit porter `const count = tier === "free" ? N : M;`');
  const [, free, paid] = match!;

  assert.ok(
    llmsTxtFlat.includes(`Free audit: ${free} buyer questions`),
    `llms.txt doit annoncer « Free audit: ${free} buyer questions » (valeur du moteur)`
  );
  assert.ok(
    llmsTxtFlat.includes(`${paid} buyer questions`),
    `llms.txt doit annoncer « ${paid} buyer questions » pour le tier payant (valeur du moteur)`
  );

  const layoutSource = readRepoFile("src", "app", "layout.tsx");
  assert.ok(
    layoutSource.includes(`AI visibility audit on ${free} real buyer questions.`),
    `le JSON-LD de layout.tsx doit annoncer « ${free} real buyer questions » pour l'offre gratuite (valeur du moteur)`
  );
  assert.ok(
    layoutSource.includes(`${paid} buyer questions, weekly tracking`),
    `le JSON-LD de layout.tsx doit annoncer « ${paid} buyer questions » pour Monitor (valeur du moteur)`
  );
});

// Aucune surface ne doit porter un autre compte que celui du moteur : le test
// ci-dessus vérifie la présence du bon chiffre, celui-ci interdit la survivance
// de l'ancien. Sans lui, une surface pourrait annoncer « 6 » quelque part et
// garder « 3 » ailleurs dans le même fichier sans que rien n'échoue.
test("surfaces machine — aucun compte de questions périmé ne survit", () => {
  const engineSource = readRepoFile("src", "lib", "audit-engine.ts");
  const [, free, paid] = engineSource.match(TIER_COUNT_RE)!;
  const surfaces = [
    ["public/llms.txt", llmsTxtFlat],
    ["src/app/layout.tsx", readRepoFile("src", "app", "layout.tsx")],
  ] as const;
  for (const [label, source] of surfaces) {
    for (const [, count] of source.matchAll(/(\d+)\s+(?:real\s+)?buyer questions/g)) {
      assert.ok(
        count === free || count === paid,
        `${label}: « ${count} buyer questions » ne correspond à aucun compte du moteur (${free} gratuit / ${paid} payant)`
      );
    }
  }
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
