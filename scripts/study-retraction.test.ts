// Retrait des chiffres de l'étude 21 marques — tests de surfaces publiées.
// Lecture des constantes réelles (`STUDY_DATA_STATUS`, `studyPageCopy`,
// `homeCopy`) et des fichiers expédiés (`public/llms.txt`, la source de
// `/study`). Fonctions pures, ZÉRO réseau. Lancer : npm test (Node >= 23.6).
//
// Couvre AC1 (source de vérité unique), AC2 (les 4 surfaces de /study), AC3
// (landing FR/EN + llms.txt à parité), AC4 (le retrait est affirmé et daté —
// garde contre le « ban vert par suppression »), AC5 (le ban se lève par la
// constante, jamais par édition de ce fichier).
//
// POURQUOI ON NE REND PAS LA PAGE. Le runner du repo (`node --test` + type
// stripping natif) ne transforme pas le JSX : `src/app/study/page.tsx` n'est pas
// importable ici. La page n'écrit donc aucune phrase en propre — toute sa copy
// vit dans `src/lib/study-status.ts`, que ce test importe —, et la source de la
// page est scannée en filet de sécurité pour interdire qu'un chiffre y soit
// réintroduit en dur.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homeCopy, type Locale } from "@/lib/i18n";
import {
  STUDY_DATA_STATUS,
  STUDY_RETRACTION_REASON,
  studyArticleSchema,
  studyPageCopy,
  studyRetractionNote,
} from "@/lib/study-status";
import { vsCopy } from "@/lib/vs-comparison";

const LOCALES = ["en", "fr"] as const satisfies readonly Locale[];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = (...segments: string[]) => readFileSync(resolve(repoRoot, ...segments), "utf8");

const STUDY_PAGE_PATH = ["src", "app", "study", "page.tsx"] as const;
const studyPageSource = readRepoFile(...STUDY_PAGE_PATH);
const llmsTxt = readRepoFile("public", "llms.txt");
// `llms.txt` est encolonné à ~78 caractères : les assertions de contenu portent
// sur une version à espaces normalisés, pour ne pas dépendre du point de coupure.
const llmsTxtFlat = llmsTxt.replace(/\s+/g, " ");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// L'état du jour, lu depuis le module réel. C'est le SEUL interrupteur de ce
// fichier : basculer `status` à "published" dans `src/lib/study-status.ts`
// désactive les bans et active l'exigence de `datasetDate`, sans qu'une seule
// ligne de test change.
const withdrawn = STUDY_DATA_STATUS.status === "withdrawn";
const skipUnlessWithdrawn = withdrawn ? false : "jeu de données republié (status !== withdrawn)";
const skipUnlessPublished = withdrawn ? "jeu de données retiré (status !== published)" : false;

// Les dates de la constante sont retirées du texte AVANT le ban numérique :
// `withdrawnOn` porte un « 31 » qui est aussi un score de l'ancien tableau, et
// `instrumentFixedOn` un « 30 ». Sans ce masquage, dater le retrait ferait
// échouer le retrait.
const maskedDates = [STUDY_DATA_STATUS.withdrawnOn, STUDY_DATA_STATUS.instrumentFixedOn, STUDY_DATA_STATUS.datasetDate]
  .filter((value): value is string => typeof value === "string" && value.length > 0);

const mask = (text: string) => maskedDates.reduce((acc, date) => acc.split(date).join(" "), text);

// --- Valeurs bannies ---------------------------------------------------------
// Les 18 scores distincts du tableau `ROWS` de l'ancienne page, plus les motifs
// et les noms propres qu'elle publiait. Bornage Unicode plutôt que `\b` : en JS
// `\b` ne s'amorce qu'entre un `\w` ASCII et un non-`\w`, ce qui laisse passer
// les voisinages accentués.
const OLD_SCORES = [31, 35, 46, 47, 50, 51, 55, 57, 61, 63, 65, 66, 69, 74, 75, 81, 85, 88] as const;
const bounded = (body: string, flags = "u") => new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags);

// Motifs multi-caractères : sûrs à appliquer même sur du source brut, où un
// nombre nu matcherait une classe Tailwind (`leading-[1.75]`).
const BANNED_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ["l'étendue de scores « 31 à 88 »", /31\s*(?:-|–|to|à)\s*88/i],
  ["le ratio « 14 / 21 »", /14\s*(?:of|\/|sur)\s*21/i],
  ["un compte de mentions « n/12 »", bounded("\\d{1,2}\\s*/\\s*12", "u")],
  ["un score « n sur 100 »", bounded("\\d{1,3}\\s*(?:/|out of|sur)\\s*100", "iu")],
];

// Noms propres publiés par l'ancienne étude : les marques auditées dont un score
// nominatif circulait, et les rivaux nommés — qui sortaient du même appel amorcé
// et tombent donc avec les scores.
const BANNED_NAMES = [
  "Tilit",
  "Aesop",
  "Cocokind",
  "Ghia",
  "Ollie",
  "Calpak",
  "Kosas",
  "Allbirds",
  "Ridge Wallet",
  "Hedley & Bennett",
] as const;

const BANNED_NAME_PATTERNS: readonly (readonly [string, RegExp])[] = BANNED_NAMES.map(
  (name) => [`le nom « ${name} »`, bounded(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu")] as const
);

const BANNED_NUMBERS: readonly (readonly [string, RegExp])[] = OLD_SCORES.map(
  (score) => [`le score « ${score} » de l'ancien tableau`, bounded(String(score))] as const
);

// Ban STRICT : nombres nus compris. Réservé aux chaînes de copy (de la prose),
// jamais au source brut.
const assertNoBannedValue = (surface: string, text: string) => {
  const masked = mask(text);
  for (const [label, pattern] of [...BANNED_NUMBERS, ...BANNED_PATTERNS, ...BANNED_NAME_PATTERNS]) {
    assert.doesNotMatch(
      masked,
      pattern,
      `surface « ${surface} » : ${label} vient de l'instrument contaminé et ne peut pas être publié`
    );
  }
};

// Réduit un source TSX à ce qui peut atterrir dans le HTML rendu.
//
// CE QU'ON EFFACE, ET RIEN D'AUTRE :
//   1. les commentaires (`/* … */`, `// …`, `{/* … */}`) — jamais rendus ;
//   2. les valeurs de DEUX attributs NOMMÉS, `className` et `style` — les seuls
//      qui portent légitimement des nombres (`leading-[1.75]`, `px-5`).
//
// On n'efface PAS la forme générique `identifiant = "…"`. C'est exactement sous
// cette forme qu'un chiffre se réintroduit — `const SUMMARY = "Scores ranged
// from 31 to 88…"` suivi de `<p>{SUMMARY}</p>` est un chiffre publié, pas une
// classe. Une constante de chaîne dans `page.tsx` est donc scannée comme le
// reste ; le test « aucune déclaration de chaîne » plus bas la refuse d'emblée,
// pour que l'échec nomme la cause au lieu de dénoncer un faux « score 75 » lu
// dans une liste de classes extraite en constante.
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // `[^:]` protège les `//` d'URL (`https://…`), qui ne sont pas des commentaires.
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const renderableSource = (source: string) =>
  stripComments(source)
    .replace(/\bclassName\s*=\s*(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})/g, " ")
    .replace(/\bstyle\s*=\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, " ");

// Ban de source : STRICT, appliqué au source réduit à son texte rendu.
const assertNoBannedValueInSource = (surface: string, text: string) => {
  assertNoBannedValue(surface, renderableSource(text));
};

// Déclarations de chaîne (`const X = "…"`, `let X: T = \`…\``). Interdites dans
// `/study` : toute la copy vient de `@/lib/study-status`, et les classes restent
// en ligne dans `className`. Seuls les champs de configuration de segment de
// route de Next (`export const dynamic = "force-static"`) sont admis.
const STRING_DECLARATION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*["'`]/g;
const ROUTE_SEGMENT_CONFIG = new Set([
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
]);

// --- AC1 : source de vérité unique ------------------------------------------
// L'import en tête de fichier fait déjà échouer TOUTE la suite si le module ou
// la constante disparaît. Ce bloc en vérifie la forme.

test("AC1 — STUDY_DATA_STATUS déclare un statut connu", () => {
  assert.ok(
    STUDY_DATA_STATUS.status === "withdrawn" || STUDY_DATA_STATUS.status === "published",
    `status doit valoir "withdrawn" ou "published" (lu : ${JSON.stringify(STUDY_DATA_STATUS.status)})`
  );
});

for (const field of ["withdrawnOn", "instrumentFixedOn"] as const) {
  test(`AC1 — ${field} est une date ISO valide`, () => {
    const value = STUDY_DATA_STATUS[field];
    assert.match(value, ISO_DATE, `${field} doit être au format ISO AAAA-MM-JJ (lu : ${JSON.stringify(value)})`);
    assert.ok(Number.isFinite(Date.parse(value)), `${field} doit être une date réelle (lu : ${JSON.stringify(value)})`);
  });
}

test("AC1 — le motif du retrait est renseigné", () => {
  assert.ok(STUDY_DATA_STATUS.reason.trim().length > 0, "reason doit énoncer le motif du retrait en une phrase");
  assert.equal(
    STUDY_DATA_STATUS.reason,
    STUDY_RETRACTION_REASON.en,
    "reason doit être la version EN du motif bilingue — une seule rédaction, pas deux à maintenir"
  );
});

test("AC1 — le correctif de l'instrument précède le retrait", () => {
  assert.ok(
    Date.parse(STUDY_DATA_STATUS.instrumentFixedOn) <= Date.parse(STUDY_DATA_STATUS.withdrawnOn),
    "on ne peut pas retirer les chiffres avant d'avoir corrigé l'instrument qui les a produits"
  );
});

// --- AC2 : les quatre surfaces de /study ------------------------------------

// Toute chaîne de `studyPageCopy` est une chaîne rendue par /study : la page
// n'écrit rien en propre. On les collecte donc TOUTES, récursivement, au lieu de
// tenir une liste à la main — une clé ajoutée demain (un CTA, un chapeau, un
// intertitre) est bannie sans qu'on ait pensé à l'inscrire ici.
const collectStrings = (value: unknown, path: string): readonly (readonly [string, string])[] => {
  if (typeof value === "string") return [[path, value] as const];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => collectStrings(item, `${path}.${key}`));
  }
  return [];
};

// Nom de la surface publiée pour les clés qui en portent une — les autres sont
// nommées par leur chemin dans le module, qui les localise tout aussi bien.
const SURFACE_OF: Readonly<Record<string, string>> = {
  "studyPageCopy.metaTitle": "metadata.title",
  "studyPageCopy.metaDescription": "metadata.description",
  "studyPageCopy.ogTitle": "openGraph.title",
  "studyPageCopy.ogDescription": "openGraph.description",
};

const STUDY_SURFACES = (): readonly (readonly [string, string])[] => [
  ...collectStrings(studyPageCopy, "studyPageCopy").map(
    ([path, text]) => [SURFACE_OF[path] ?? path, text] as const
  ),
  ["JSON-LD Article", JSON.stringify(studyArticleSchema)],
];

for (const [surface, text] of STUDY_SURFACES()) {
  test(`AC2 — ${surface} ne porte aucune valeur de l'ancien instrument`, { skip: skipUnlessWithdrawn }, () => {
    assertNoBannedValue(surface, text);
  });
}

test("AC2 — la source de /study ne réintroduit aucune valeur en dur", { skip: skipUnlessWithdrawn }, () => {
  assertNoBannedValueInSource("src/app/study/page.tsx", studyPageSource);
  assert.doesNotMatch(studyPageSource, /const ROWS/, "le tableau de scores `ROWS` ne doit plus exister");
  assert.match(
    studyPageSource,
    /study-status/,
    "la page doit lire son état dans `@/lib/study-status`, seule source de vérité"
  );
});

// Sans ce test, le ban de source resterait contournable de bonne foi : une liste
// de classes extraite en `const P = "… leading-[1.75] …"` déclencherait un faux
// rouge (« score 75 »), et la tentation serait de ré-exempter les déclarations —
// c'est-à-dire de rouvrir le trou par lequel `const SUMMARY = "…31 to 88…"`
// passe. On tranche en amont : /study ne déclare aucune chaîne, point.
test("AC2 — /study ne déclare aucune chaîne : toute sa copy vient de study-status", () => {
  const declared = [...stripComments(studyPageSource).matchAll(STRING_DECLARATION)].map(([, name]) => name);
  const offending = declared.filter((name) => !ROUTE_SEGMENT_CONFIG.has(name));
  assert.deepEqual(
    offending,
    [],
    `src/app/study/page.tsx déclare ${offending.map((name) => `\`${name}\``).join(", ")} : toute chaîne rendue par /study doit venir de \`@/lib/study-status\`, et les classes Tailwind rester en ligne dans \`className\` — une constante de chaîne ici sort du seul endroit où un nombre est lisible comme une classe et non comme un chiffre publié`
  );
});

// --- AC3 : landing FR/EN et llms.txt, à parité ------------------------------

const localeSurfaces = (locale: Locale): readonly (readonly [string, string])[] => {
  const copy = homeCopy[locale];
  return [
    [`homeCopy.${locale}.studyTitle`, copy.studyTitle],
    [`homeCopy.${locale}.studyCta`, copy.studyCta],
    ...copy.studyStats.map(
      (stat, index) => [`homeCopy.${locale}.studyStats[${index}]`, `${stat.value} ${stat.label}`] as const
    ),
  ];
};

for (const locale of LOCALES) {
  for (const [surface, text] of localeSurfaces(locale)) {
    test(`AC3 — ${surface} ne porte aucune valeur de l'ancien instrument`, { skip: skipUnlessWithdrawn }, () => {
      assertNoBannedValue(surface, text);
    });
  }

  test(`AC3 — ${locale}: aucun studyStats ne porte de valeur chiffrée`, { skip: skipUnlessWithdrawn }, () => {
    for (const [index, stat] of homeCopy[locale].studyStats.entries()) {
      assert.doesNotMatch(
        mask(stat.value),
        /\d/,
        `homeCopy.${locale}.studyStats[${index}].value = « ${stat.value} » : plus aucun chiffre de l'étude n'est publiable`
      );
    }
  });
}

test("AC3 — parité FR/EN : même nombre de studyStats", () => {
  const [en, fr] = LOCALES.map((locale) => homeCopy[locale].studyStats.length);
  assert.equal(en, fr, `parité rompue : en=${en} stat(s), fr=${fr} stat(s)`);
});

// Découpage en phrases, comme pour la parité du TL;DR de la story du 28/07.
const splitSentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((part) => part.trim().length > 0);

const studyAssertions = (locale: Locale) =>
  [homeCopy[locale].studyTitle, ...homeCopy[locale].studyStats.map((stat) => stat.label), homeCopy[locale].studyCta]
    .flatMap(splitSentences)
    .length;

test("AC3 — parité FR/EN : même nombre d'affirmations dans le bloc étude", () => {
  const [en, fr] = LOCALES.map(studyAssertions);
  assert.equal(en, fr, `parité rompue : en=${en} affirmation(s), fr=${fr} affirmation(s)`);
});

// `llms.txt` n'est pas dérivé de la constante : c'est un fichier statique
// expédié tel quel. C'est ce test qui le raccroche à `study-status.ts` — d'où
// des messages d'échec qui nomment explicitement le fichier.
const llmsSection = (heading: string, nextHeading: string) => {
  const start = llmsTxt.indexOf(heading);
  assert.notEqual(start, -1, `public/llms.txt doit porter la section « ${heading} »`);
  const end = llmsTxt.indexOf(nextHeading, start);
  return llmsTxt.slice(start, end === -1 ? undefined : end).replace(/\s+/g, " ");
};

const llmsStudyBullet = () => {
  const line = llmsTxt.split("\n").find((entry) => entry.startsWith("- [Study]"));
  assert.ok(line, "public/llms.txt doit porter la puce « - [Study] » dans la section « ## Pages »");
  return String(line);
};

for (const [surface, text] of [
  ["public/llms.txt § Original research", llmsSection("## Original research", "## Pages")],
  ["public/llms.txt puce [Study]", llmsStudyBullet()],
] as const) {
  test(`AC3 — ${surface} ne porte aucune valeur de l'ancien instrument`, { skip: skipUnlessWithdrawn }, () => {
    assertNoBannedValue(surface, text);
  });
}

// --- AC4 : le retrait est affirmé positivement et daté ----------------------
// Sans ce bloc, effacer purement et simplement les chiffres suffirait à faire
// passer les bans de l'AC2/AC3 — c'est le « ban vert par suppression » trouvé en
// review le 28/07.

// Le bloc « étude » de la landing, tel qu'il est rendu : titre, statistiques
// (valeur ET libellé), CTA. C'est la surface où le ban vert par suppression
// serait le plus tentant — deux `value` neutres et un CTA muet suffiraient à
// faire passer l'AC3 sans que la landing dise jamais que les chiffres sont
// retirés, ni quand, ni pourquoi.
const homeStudyBlock = (locale: Locale) =>
  [
    homeCopy[locale].studyTitle,
    ...homeCopy[locale].studyStats.map((stat) => `${stat.value} ${stat.label}`),
    homeCopy[locale].studyCta,
  ].join(" ");

const DATED_SURFACES = (): readonly (readonly [string, string, string])[] => [
  ["homeCopy.en (bloc étude)", homeStudyBlock("en"), STUDY_RETRACTION_REASON.gist.en],
  ["homeCopy.fr (bloc étude)", homeStudyBlock("fr"), STUDY_RETRACTION_REASON.gist.fr],
  ["metadata.description", studyPageCopy.metaDescription, STUDY_RETRACTION_REASON.gist.en],
  ["openGraph.description", studyPageCopy.ogDescription, STUDY_RETRACTION_REASON.gist.en],
  ["JSON-LD Article", JSON.stringify(studyArticleSchema), STUDY_RETRACTION_REASON.gist.en],
  ["corps de /study (en)", studyPageCopy.body.en.join(" "), STUDY_RETRACTION_REASON.en],
  ["corps de /study (fr)", studyPageCopy.body.fr.join(" "), STUDY_RETRACTION_REASON.fr],
  ["public/llms.txt", llmsTxtFlat, STUDY_RETRACTION_REASON.en],
];

for (const [surface, text, motive] of DATED_SURFACES()) {
  test(`AC4 — ${surface} porte les deux dates et le motif`, { skip: skipUnlessWithdrawn }, () => {
    assert.ok(
      text.includes(STUDY_DATA_STATUS.withdrawnOn),
      `${surface} : la date de retrait ${STUDY_DATA_STATUS.withdrawnOn} doit être affichée`
    );
    assert.ok(
      text.includes(STUDY_DATA_STATUS.instrumentFixedOn),
      `${surface} : la date de correctif ${STUDY_DATA_STATUS.instrumentFixedOn} doit être affichée`
    );
    assert.ok(text.includes(motive), `${surface} : le motif du retrait doit être énoncé, pas seulement le fait`);
    assert.match(
      text,
      /retract|withdraw|withdrew|withdrawn|retir/i,
      `${surface} : le retrait doit être nommé, pas sous-entendu`
    );
  });
}

// `studyPageCopy` n'est une image des surfaces publiées que si la page rend
// TOUT ce qu'il déclare. Sans ce test, la divergence est muette dans les deux
// sens : une clé peut être déclarée et jamais rendue (`cta.fr` l'était), et le
// bloc <section> français peut disparaître de la page sans qu'une seule
// assertion bronche — les tests scanneraient encore `body.fr`, chaîne devenue
// morte. Les deux trous se ferment par la même exigence.
//
// « Rendue » signifie : la page cite le chemin d'accès (`studyPageCopy.body.fr`),
// ou la valeur part dans le JSON-LD, que la page rend en bloc via
// `studyArticleSchema`.
const schemaJson = JSON.stringify(studyArticleSchema);
const accessorOf = (path: string) => path.replace(/\[\d+\]/g, "");

test("AC4 — /study rend TOUTE chaîne déclarée par studyPageCopy : aucune chaîne morte", () => {
  const dead = collectStrings(studyPageCopy, "studyPageCopy")
    .filter(([path, text]) => !studyPageSource.includes(accessorOf(path)) && !schemaJson.includes(text))
    .map(([path]) => accessorOf(path));

  assert.deepEqual(
    [...new Set(dead)],
    [],
    `chaîne(s) déclarée(s) dans studyPageCopy et rendue(s) nulle part par src/app/study/page.tsx : ${[
      ...new Set(dead),
    ].join(", ")} — le test des surfaces de /study les scanne comme publiées alors qu'aucun lecteur ne les voit ; soit la page les rend, soit elles sortent du module`
  );
});

for (const locale of LOCALES) {
  test(`AC4 — la note de retrait ${locale} est rendue par la page`, { skip: skipUnlessWithdrawn }, () => {
    const note = studyRetractionNote[locale];
    assert.ok(note.trim().length > 0, `studyRetractionNote.${locale} ne peut pas être vide`);
    assert.ok(
      studyPageCopy.body[locale].includes(note),
      `la note de retrait ${locale} doit être un paragraphe du corps de /study, pas une chaîne morte`
    );
    // Le maillon manquant : le paragraphe existe dans le module, encore faut-il
    // que la page le rende. Effacer le bloc <section> français passait sans ça.
    assert.match(
      studyPageSource,
      new RegExp(`studyPageCopy\\.body\\.${locale}\\b`),
      `src/app/study/page.tsx doit rendre studyPageCopy.body.${locale} : sans ce bloc, la note de retrait ${locale} n'est publiée nulle part`
    );
  });
}

test("AC4 — la route /study existe toujours et n'est ni supprimée ni redirigée", () => {
  assert.ok(existsSync(resolve(repoRoot, ...STUDY_PAGE_PATH)), "src/app/study/page.tsx doit exister");
  assert.match(studyPageSource, /export default function/, "/study doit exporter un composant de page");
  assert.doesNotMatch(studyPageSource, /\bredirect\s*\(/, "/study ne doit pas rediriger : la page EST l'aveu");
  assert.doesNotMatch(studyPageSource, /\bnotFound\s*\(/, "/study ne doit pas répondre 404 : la page EST l'aveu");
});

test("AC4 — /study reste indexable et listée dans le sitemap", () => {
  assert.doesNotMatch(
    studyPageSource,
    /index:\s*false/,
    "un noindex empêcherait les moteurs de remplacer par le démenti le chiffre déjà en cache"
  );
  assert.match(readRepoFile("src", "app", "sitemap.ts"), /\/study/, "l'entrée /study doit rester dans le sitemap");
});

// --- AC4, périmètre /vs : la page qui pointe vers l'étude n'en promet pas la preuve
// `/vs` et `/fr/vs` rendent `vsCopy[locale].studyIntro` juste au-dessus d'un CTA
// vers /study. Tant que les chiffres sont retirés, annoncer une preuve puis
// renvoyer vers la page qui la déclare impubliable est une promesse démentie au
// clic — c'est ce que disait « The proof lives in our study » avant ce correctif.

for (const locale of LOCALES) {
  test(`AC4 — vsCopy.${locale}.studyIntro ne promet pas une preuve retirée`, { skip: skipUnlessWithdrawn }, () => {
    const intro = vsCopy[locale].studyIntro;
    assertNoBannedValue(`vsCopy.${locale}.studyIntro`, intro);
    assert.match(
      intro,
      /retract|withdraw|withdrew|withdrawn|retir/i,
      `vsCopy.${locale}.studyIntro : le lien vers /study doit annoncer le retrait, pas une preuve — sinon la page tient une promesse que /study dément au clic`
    );
  });
}

// --- Garde de périmètre : le claim « 14/21 » de POSITIONING_V2.md -----------
// Sans elle, la prochaine story de copy republierait le ratio de bonne foi.

test("périmètre — chaque ligne de POSITIONING_V2.md portant « 14/21 » le marque retiré", { skip: skipUnlessWithdrawn }, () => {
  const lines = readRepoFile("POSITIONING_V2.md").split("\n");
  for (const [index, line] of lines.entries()) {
    if (!/14\s*\/\s*21/.test(line)) continue;
    assert.ok(
      /RETIR/i.test(line) || line.includes(STUDY_DATA_STATUS.withdrawnOn),
      `POSITIONING_V2.md l.${index + 1} : le ratio « 14/21 » doit être marqué retiré sur la ligne même`
    );
  }
});

// --- AC5 : republier passe par la constante, jamais par ce fichier ----------

test(
  "AC5 — republier exige un jeu de données postérieur au correctif de l'instrument",
  { skip: skipUnlessPublished },
  () => {
    const datasetDate = STUDY_DATA_STATUS.datasetDate;
    assert.ok(
      typeof datasetDate === "string" && datasetDate.length > 0,
      "status = published exige un datasetDate : on ne republie pas sans déclarer d'où viennent les chiffres"
    );
    const value = String(datasetDate);
    assert.match(value, ISO_DATE, `datasetDate doit être au format ISO AAAA-MM-JJ (lu : ${JSON.stringify(value)})`);
    assert.ok(Number.isFinite(Date.parse(value)), "datasetDate doit être une date réelle");
    assert.ok(
      Date.parse(value) > Date.parse(STUDY_DATA_STATUS.instrumentFixedOn),
      `datasetDate (${value}) doit être STRICTEMENT postérieure au correctif de l'instrument (${STUDY_DATA_STATUS.instrumentFixedOn}) : republier un chiffre produit avant le correctif, c'est republier le défaut`
    );
  }
);
