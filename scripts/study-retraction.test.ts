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
// Import de NAMESPACE, en plus des imports nommés. Les bans de l'AC2 balaient
// TOUT ce que le module exporte, pas les deux objets qu'on avait pensé à citer :
// `page.tsx` ne déclare aucune chaîne en propre (test plus bas), donc un chiffre
// republié atterrit forcément dans un export de ce module — et jusqu'ici il
// suffisait de le poser à côté de `studyPageCopy` (`export const studyHighlights
// = ["…31 to 88…"]`, rendu par `{studyHighlights.map(…)}`) pour passer au
// travers. Balayer le namespace ferme le contournement par construction :
// l'export ajouté demain est scanné sans qu'on ait à l'inscrire ici.
import * as studyStatusModule from "@/lib/study-status";
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

// Noms propres publiés par l'ancienne étude — la LISTE ENTIÈRE du tableau `ROWS`
// (`git show main:src/app/study/page.tsx`, l.29-51), pas les seuls noms qui
// voisinaient un score dans la copy. Les 21 marques auditées ET les rivaux
// « recommandés à la place » sortent du même appel amorcé : une paire
// marque→rival republiée en prose (« Cuts s'est fait battre par Lululemon »)
// republie l'instrument contaminé, même sans un chiffre pour l'accompagner.
//
// GetPick est absent de la liste, pour une raison : c'est nous, et notre nom est
// écrit partout sur ces surfaces. Son rival nommé, lui, est banni comme les
// autres.
//
// Certains de ces noms sont aussi des mots courants (« Cuts », « Versed »,
// « Recess », « Jot », « Bubble »). Le ban ne porte que sur les surfaces de
// l'étude, où un tel mot est presque sûrement la marque ; et une collision
// donnerait un rouge à reformuler, pas un chiffre republié — l'échec va dans le
// bon sens.
const AUDITED_BRANDS = [
  "Allbirds",
  "Arrae",
  "Baboon to the Moon",
  "Brooklinen",
  "Bubble",
  "Cometeer",
  "Cuts",
  "Dagne Dover",
  "De Soi",
  "Hedley & Bennett",
  "Moon Juice",
  "Necessaire",
  "Ollie",
  "Our Place",
  "Recess",
  "Ridge Wallet",
  "Spot & Tango",
  "Topicals",
  "Tower 28",
  "Versed",
] as const;

const NAMED_RIVALS = [
  "Aesop",
  "BrightLocal",
  "Calpak",
  "CeraVe",
  "Cocokind",
  "Ghia",
  "Jot",
  "Kosas",
  "Love Wellness",
  "Lululemon",
  "Nom Nom",
  "Paula's Choice",
  "Tilit",
] as const;

const BANNED_NAMES = [...new Set<string>([...AUDITED_BRANDS, ...NAMED_RIVALS])];

const BANNED_NAME_PATTERNS: readonly (readonly [string, RegExp])[] = BANNED_NAMES.map(
  (name) => [`le nom « ${name} »`, bounded(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu")] as const
);

const BANNED_NUMBERS: readonly (readonly [string, RegExp])[] = OLD_SCORES.map(
  (score) => [`le score « ${score} » de l'ancien tableau`, bounded(String(score))] as const
);

// Ban de NOMS SEULS, sans les nombres. Sert à couvrir des surfaces ENTIÈRES —
// toute la landing, tout `llms.txt` — et pas seulement leur bloc « étude ».
// Le scénario est une story de copy qui écrit demain, n'importe où sur la page,
// « dans notre audit, Cuts s'est fait battre par Lululemon » : une paire
// marque→rival de l'instrument contaminé, republiée sans un seul chiffre pour
// la trahir. Les nombres restent hors de ce ban : ces surfaces publient
// légitimement des prix, des durées et des dates.
const assertNoBannedName = (surface: string, text: string) => {
  const masked = mask(text);
  for (const [label, pattern] of BANNED_NAME_PATTERNS) {
    assert.doesNotMatch(
      masked,
      pattern,
      `surface « ${surface} » : ${label} sort de l'étude retirée — le nommer republie une paire marque→rival produite par l'instrument contaminé, chiffre ou pas`
    );
  }
};

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

// Le balayage porte sur le MODULE ENTIER, export par export — pas sur la liste
// des exports qu'on a pensé à citer. Les chemins gardent leur nom d'export en
// tête (`studyPageCopy.metaTitle`, `studyHighlights[0]`), donc un échec localise
// la chaîne fautive aussi précisément qu'avant.
const STUDY_SURFACES = (): readonly (readonly [string, string])[] => [
  ...Object.entries(studyStatusModule)
    .flatMap(([exportName, value]) => collectStrings(value, exportName))
    .map(([path, text]) => [SURFACE_OF[path] ?? path, text] as const),
  ["JSON-LD Article", JSON.stringify(studyArticleSchema)],
];

// Filet du filet : le balayage ci-dessus ne voit que des chaînes déjà exportées.
// Si le module cesse un jour d'exporter `studyPageCopy`, les surfaces de /study
// disparaîtraient du scan sans qu'une assertion bronche.
test("AC2 — le balayage des surfaces couvre bien le module de copy", () => {
  const scanned = STUDY_SURFACES().length;
  assert.ok(
    scanned >= collectStrings(studyPageCopy, "studyPageCopy").length + 1,
    `le balayage ne voit que ${scanned} chaîne(s) : il doit couvrir au moins toute la copy de /study plus le JSON-LD`
  );
});

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

// --- Le bloc « étude » a quitté la landing le 28/08/2026 --------------------
//
// Décision de Charles : la home ne porte plus le bloc de rétractation. Les
// assertions qui le surveillaient sont retirées AVEC LA SURFACE, et non pour
// devenir vertes — une assertion sur une surface qui n'est plus publiée
// n'échoue jamais et n'atteste plus rien : elle ment en silence.
//
// Ce que le retrait NE fait pas disparaître, et qui reste couvert ci-dessous :
// la rétractation, ses deux dates et son motif restent publiés sur /study, dans
// ses métadonnées, dans le JSON-LD, dans `public/llms.txt` et sur /vs ; la
// landing ENTIÈRE reste interdite de valeur bannie et de nom de marque de
// l'étude (test `collectStrings(homeCopy)` conservé juste en dessous) ; et la
// home garde un lien vers /study en pied de page — la page n'est pas orpheline.

// Le ban chiffré ci-dessus ne couvre que le bloc « étude ». Une marque de
// l'étude est bannie de la landing ENTIÈRE : le hero, la FAQ ou un témoignage
// sont des surfaces publiées comme les autres.
for (const locale of LOCALES) {
  test(`AC3 — ${locale}: aucune surface de la landing ne nomme une marque de l'étude`, { skip: skipUnlessWithdrawn }, () => {
    for (const [path, text] of collectStrings(homeCopy[locale], `homeCopy.${locale}`)) {
      assertNoBannedName(path, text);
    }
  });
}

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

// Idem pour `llms.txt` : le ban chiffré vise ses deux sections « étude », le ban
// de noms vise le fichier entier — c'est le fichier que les assistants lisent en
// premier, une marque de l'étude nommée dans « ## Notes for AI assistants » y
// circulerait aussi bien que dans « ## Original research ».
test("AC3 — public/llms.txt ne nomme aucune marque de l'étude, section par section", { skip: skipUnlessWithdrawn }, () => {
  assertNoBannedName("public/llms.txt", llmsTxtFlat);
});

// --- AC4 : le retrait est affirmé positivement et daté ----------------------
// Sans ce bloc, effacer purement et simplement les chiffres suffirait à faire
// passer les bans de l'AC2/AC3 — c'est le « ban vert par suppression » trouvé en
// review le 28/07.

const DATED_SURFACES = (): readonly (readonly [string, string, string])[] => [
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

// Le CTA compte autant que l'intro, et il compte même davantage : c'est le
// libellé cliqué. « See the study → » / « Voir l'étude → » promettait une étude
// au-dessus d'une page qui n'en est plus une — l'intro disait le retrait, le
// bouton le reniait sur la même ligne.
for (const locale of LOCALES) {
  for (const [field, text] of [
    ["studyIntro", vsCopy[locale].studyIntro],
    ["studyCta", vsCopy[locale].studyCta],
  ] as const) {
    test(`AC4 — vsCopy.${locale}.${field} ne promet pas une preuve retirée`, { skip: skipUnlessWithdrawn }, () => {
      assertNoBannedValue(`vsCopy.${locale}.${field}`, text);
      assert.match(
        text,
        /retract|withdraw|withdrew|withdrawn|retir/i,
        `vsCopy.${locale}.${field} : le lien vers /study doit annoncer le retrait, pas une preuve — sinon la page tient une promesse que /study dément au clic`
      );
    });
  }
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

// La garde ci-dessus ne regardait QUE les lignes portant « 14/21 ». Elle laissait
// donc passer ce qui s'était glissé juste à côté : une preuve de remplacement
// chiffrée (« ex. <marque>, 0 mention sur 12 questions, rivaux CeraVe 7/12 »),
// qui republie le format banni ET nomme un rival de l'étude — dans le document
// même que la prochaine story de copy prend pour source. Le ban de noms et les
// motifs multi-caractères couvrent maintenant le fichier ENTIER.
//
// Le ban de nombres NUS en est volontairement absent : ce document publie des
// prix (« 99–400 $ », « 39 € ») et des dates en écriture française
// (« 31/07/2026 »), qui ne sont ni des scores ni des comptes de mentions. Ce
// qu'on interdit ici, c'est le format d'un résultat d'audit et le nom d'une
// marque de l'étude — les deux formes sous lesquelles la mesure contaminée
// revient en copy.
test("périmètre — POSITIONING_V2.md ne porte ni nom de l'étude ni format de résultat d'audit", { skip: skipUnlessWithdrawn }, () => {
  const positioning = readRepoFile("POSITIONING_V2.md");
  assertNoBannedName("POSITIONING_V2.md", positioning);
  for (const [label, pattern] of BANNED_PATTERNS) {
    const offending = positioning
      .split("\n")
      .map((line, index) => [index + 1, line] as const)
      // Le ratio « 14/21 » a sa propre garde juste au-dessus : elle l'autorise
      // sur une ligne qui le marque retiré, ce que ce ban-ci ignorerait.
      .filter(([, line]) => pattern.test(line) && !/14\s*\/\s*21/.test(line));
    assert.deepEqual(
      offending.map(([lineNumber]) => lineNumber),
      [],
      `POSITIONING_V2.md l.${offending.map(([lineNumber]) => lineNumber).join(", ")} : ${label} est un format de résultat d'audit produit par l'instrument contaminé — il ne peut pas servir de preuve de remplacement, même en note interne : c'est ce document que la copy recopie`
    );
  }
});

// --- AC5 : republier passe par la constante, jamais par ce fichier ----------

// Ce test tourne dans LES DEUX états, exprès. Tant que les chiffres sont
// retirés, `datasetDate` n'est pas défini et rien ne rend cette ligne — mais
// c'est justement à ce moment-là qu'on peut la perdre sans s'en apercevoir.
// L'AC5 de `e2e/vs-comparative.spec.ts` exige `datasetDate` dans le corps de
// /study dès que `status` bascule ; si la page ne sait pas le rendre, le
// basculement de la constante rougit la CI e2e au lieu de lever le cliquet.
test("AC5 — /study sait dater le jeu de données dès qu'il est republié", () => {
  assert.match(
    studyPageSource,
    /STUDY_DATA_STATUS\.status\s*!==\s*"published"|status\s*!==\s*"published"/,
    "src/app/study/page.tsx doit conditionner la ligne de datation à `status`"
  );
  assert.match(
    studyPageSource,
    /datasetDate/,
    "src/app/study/page.tsx doit rendre `STUDY_DATA_STATUS.datasetDate` : sans elle, republier fait échouer l'AC5 e2e au lieu de lever le cliquet"
  );
  for (const locale of LOCALES) {
    assert.match(
      studyPageSource,
      new RegExp(`studyPageCopy\\.datasetLabel\\.${locale}\\b`),
      `la ligne de datation doit être rendue en ${locale} : /study est bilingue`
    );
  }
});

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

// --- AC5, l'autre moitié : republier RETIRE l'aveu des surfaces --------------
//
// Le trou que ce bloc ferme. Jusqu'ici, basculer `status` à "published" ne
// faisait que LEVER des bans : toute la copy de ce module raconte le retrait en
// dur, et rien n'exigeait qu'elle change. On obtenait donc, CI verte, une page
// qui titrait « figures withdrawn on <date> », affichait « Dataset produced on
// <date postérieure> », promettait « nothing is republished until it has landed »
// — et deux cartes « Withdrawn » / « Retiré » sur la landing, plus un
// « RETRACTED » dans llms.txt. Exactement la faute que la story interdit : que
// la surface publiée soit fausse le jour où elle est publiée.
//
// Ces tests ne tournent QUE dans l'état republié. Ils rendent la bascule du
// drapeau seule ROUGE, et forcent la réécriture de la copy avec la republication.
// Ils n'interdisent pas de raconter l'histoire : le corps de /study peut dire
// « ces chiffres avaient été retirés le <date>, les voici rejoués ». Ce qui est
// interdit, c'est de continuer à AFFIRMER le retrait — sur les surfaces courtes
// qui donnent son identité à la page, et par le marqueur que lisent les machines.

const CURRENTLY_WITHDRAWN = /retract|withdraw|withdrew|withdrawn|retir/i;

// Surfaces d'IDENTITÉ : titre, accroche, cartes de la landing, intro de /vs.
// Chacune tient en une ligne et étiquette l'étude ; aucune n'a la place de
// nuancer. Le corps de page en est absent EXPRÈS.
const IDENTITY_SURFACES = (): readonly (readonly [string, string])[] => [
  ["metadata.title", studyPageCopy.metaTitle],
  ["openGraph.title", studyPageCopy.ogTitle],
  ...LOCALES.flatMap(
    (locale) =>
      [
        [`studyPageCopy.eyebrow.${locale}`, studyPageCopy.eyebrow[locale]],
        [`studyPageCopy.headline.${locale}`, studyPageCopy.headline[locale]],
        [`vsCopy.${locale}.studyIntro`, vsCopy[locale].studyIntro],
        [`vsCopy.${locale}.studyCta`, vsCopy[locale].studyCta],
      ] as const
  ),
];

for (const [surface, text] of IDENTITY_SURFACES()) {
  test(`AC5 — republié : ${surface} n'étiquette plus l'étude comme retirée`, { skip: skipUnlessPublished }, () => {
    assert.doesNotMatch(
      text,
      CURRENTLY_WITHDRAWN,
      `${surface} affirme encore le retrait alors que status = "published" : « ${text} ». Republier n'est pas lever un drapeau — la copy de \`src/lib/study-status.ts\` (et le bloc étude de \`src/lib/i18n.ts\`) est à réécrire avec les nouveaux chiffres, sinon la surface publiée se contredit le jour même`
    );
  });
}

for (const locale of LOCALES) {
  test(`AC5 — republié : le corps ${locale} ne promet plus « rien n'est republié »`, { skip: skipUnlessPublished }, () => {
    const note = studyRetractionNote[locale];
    assert.ok(
      !studyPageCopy.body[locale].some((paragraph) => paragraph.includes(note)),
      `le corps ${locale} de /study rend encore la note de retrait mot pour mot alors que status = "published" — elle se termine par « rien n'est republié tant qu'il n'a pas rendu », ce que la page dément d'un paragraphe plus bas`
    );
  });
}

test("AC5 — republié : public/llms.txt ne porte plus le marqueur RETRACTED", { skip: skipUnlessPublished }, () => {
  assert.doesNotMatch(
    llmsSection("## Original research", "## Pages"),
    /\bRETRACTED\b/,
    "public/llms.txt annonce encore RETRACTED en tête de « ## Original research » : c'est le marqueur que les assistants lisent en premier, il dément l'étude republiée"
  );
});
