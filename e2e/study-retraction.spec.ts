import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Imports relatifs volontaires : Playwright ne garantit pas le mapping de l'alias `@/`.
import { STUDY_DATA_STATUS, STUDY_RETRACTION_REASON } from "../src/lib/study-status";
import { homeCopy, type Locale } from "../src/lib/i18n";

// E2E — story « Retirer des surfaces publiées les chiffres produits par l'instrument
// contaminé — et le dire, daté ».
//
// Un scénario exécutable par critère d'acceptation, joué sur l'APPLICATION SERVIE
// (next dev, port 3311 — voir playwright.config.ts), pas sur des constantes lues
// hors contexte : on inspecte le HTML réellement expédié aux moteurs et aux
// lecteurs (corps rendu, <meta name="description">, <meta property="og:description">,
// JSON-LD Article, landing FR/EN, /llms.txt servi).
//
// Le fichier ne contient AUCUNE date ni AUCUN état en dur : tout vient de
// `STUDY_DATA_STATUS`. Basculer la constante à "published" bascule les assertions
// sans éditer une ligne d'ici (AC5).

const LOCALES = ["en", "fr"] as const satisfies readonly Locale[];
const withdrawn = STUDY_DATA_STATUS.status === "withdrawn";

// --- Détecteur de valeurs bannies --------------------------------------------
// Les 18 scores distincts du tableau `ROWS` de l'ancienne page, les motifs de
// l'AC2, et les noms propres (marques auditées + rivaux « recommandés à la
// place ») — tous sortis du même appel amorcé.

const OLD_SCORES = [31, 35, 46, 47, 50, 51, 55, 57, 61, 63, 65, 66, 69, 74, 75, 81, 85, 88] as const;

const AUDITED_BRANDS = [
  "Allbirds",
  "Arrae",
  "Baboon to the Moon",
  "Brooklinen",
  "Cometeer",
  "Dagne Dover",
  "De Soi",
  "Hedley & Bennett",
  "Moon Juice",
  "Necessaire",
  "Our Place",
  "Ridge Wallet",
  "Spot & Tango",
  "Topicals",
  "Tower 28",
] as const;

// Les rivaux explicitement nommés par l'AC2, plus ceux de la même colonne `instead`.
const NAMED_RIVALS = [
  "Tilit",
  "Aesop",
  "Cocokind",
  "Ghia",
  "Ollie",
  "Calpak",
  "Kosas",
  "Lululemon",
  "Paula's Choice",
  "Nom Nom",
  "Love Wellness",
  "BrightLocal",
] as const;

// Bornage Unicode plutôt que `\b` : `\b` ne s'amorce qu'entre un `\w` ASCII et un
// non-`\w`, il laisserait passer les voisinages accentués.
const bounded = (body: string, flags = "u") =>
  new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags);

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type BannedRule = readonly [label: string, pattern: RegExp];

const BANNED_SHAPES: readonly BannedRule[] = [
  ["l'étendue de scores « 31-88 » / « 31 to 88 »", /31\s*(?:-|–|—|to|à)\s*88/i],
  ["le ratio « 14 of 21 » / « 14 / 21 »", /14\s*(?:of|\/|sur)\s*21/i],
  ["un compte de mentions « n/12 »", bounded("\\d{1,2}\\s*/\\s*12")],
  ["un score « n sur 100 »", bounded("\\d{1,3}\\s*(?:/|out of|sur)\\s*100", "iu")],
];

const BANNED_SCORES: readonly BannedRule[] = OLD_SCORES.map(
  (score) => [`le score « ${score} » du tableau ROWS`, bounded(String(score))] as const
);

const BANNED_NAMES: readonly BannedRule[] = [...AUDITED_BRANDS, ...NAMED_RIVALS].map(
  (name) => [`le nom « ${name} » publié par l'ancienne étude`, bounded(escape(name), "iu")] as const
);

const ALL_BANNED: readonly BannedRule[] = [...BANNED_SHAPES, ...BANNED_SCORES, ...BANNED_NAMES];

// Les dates de la constante sont retirées AVANT le scan numérique : `withdrawnOn`
// porte un « 31 » qui est aussi un score de l'ancien tableau, `instrumentFixedOn`
// un « 30 ». Sans ce masquage, dater le retrait ferait échouer le retrait.
const MASKED_DATES = [
  STUDY_DATA_STATUS.withdrawnOn,
  STUDY_DATA_STATUS.instrumentFixedOn,
  STUDY_DATA_STATUS.datasetDate,
].filter((value): value is string => typeof value === "string" && value.length > 0);

const maskDates = (text: string) =>
  MASKED_DATES.reduce((acc, date) => acc.split(date).join(" [DATE] "), text);

/** Renvoie la liste des valeurs bannies trouvées, avec leur libellé et l'extrait fautif. */
function findBanned(text: string): string[] {
  const haystack = maskDates(text);
  return ALL_BANNED.flatMap(([label, pattern]) => {
    const hit = haystack.match(pattern);
    return hit ? [`${label} → « ${hit[0]} »`] : [];
  });
}

/** Ce qu'une note de retrait doit porter : les deux dates ET le motif. */
function missingFromNote(text: string, locale: Locale): string[] {
  const missing: string[] = [];
  if (!text.includes(STUDY_DATA_STATUS.withdrawnOn)) missing.push(`withdrawnOn (${STUDY_DATA_STATUS.withdrawnOn})`);
  if (!text.includes(STUDY_DATA_STATUS.instrumentFixedOn))
    missing.push(`instrumentFixedOn (${STUDY_DATA_STATUS.instrumentFixedOn})`);
  if (!/retract|withdraw|withdrew|withdrawn|retir/i.test(text)) missing.push("le verbe de retrait");
  if (!text.includes(STUDY_RETRACTION_REASON.gist[locale])) missing.push(`le motif (${locale})`);
  return missing;
}

// --- Lecture des surfaces servies --------------------------------------------

type StudySurfaces = {
  status: number;
  redirected: boolean;
  finalUrl: string;
  bodyText: string;
  metaDescription: string;
  ogDescription: string;
  jsonLd: string;
  jsonLdParsed: Record<string, unknown>;
};

async function readStudySurfaces(page: Page): Promise<StudySurfaces> {
  const response = await page.goto("/study");
  const bodyText = await page.locator("body").innerText();
  const metaDescription =
    (await page.locator('meta[name="description"]').first().getAttribute("content")) ?? "";
  const ogDescription =
    (await page.locator('meta[property="og:description"]').first().getAttribute("content")) ?? "";
  const ldBlocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const jsonLd = ldBlocks.join("\n");
  const articleRaw = ldBlocks
    .map((raw) => JSON.parse(raw) as Record<string, unknown>) // JSON invalide => throw => échec
    .find((node) => node["@type"] === "Article");

  return {
    status: response?.status() ?? 0,
    redirected: response?.request().redirectedFrom() !== null,
    finalUrl: page.url(),
    bodyText,
    metaDescription,
    ogDescription,
    jsonLd,
    jsonLdParsed: articleRaw ?? {},
  };
}

/** Section « ## Original research » du llms.txt servi, jusqu'au titre suivant. */
async function readOriginalResearch(request: APIRequestContext): Promise<string> {
  const response = await request.get("/llms.txt");
  expect(response.status(), "/llms.txt doit être servi en 200").toBe(200);
  const text = await response.text();
  const start = text.indexOf("## Original research");
  expect(start, "llms.txt doit porter une section « ## Original research »").toBeGreaterThan(-1);
  const rest = text.slice(start + "## Original research".length);
  const end = rest.indexOf("\n## ");
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, " ").trim();
}

/** Le bloc « preuve » de la landing, celui qui portait les 4 studyStats. */
function studySection(page: Page, locale: Locale) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: homeCopy[locale].studyTitle }) })
    .last();
}

// =============================================================================
// AC1 — Source de vérité unique, lue depuis le module réel
// =============================================================================

test("AC1 — Given STUDY_DATA_STATUS lue depuis le module réel, Then status ∈ {withdrawn, published} et dates ISO valides", async ({
  page,
}) => {
  expect(STUDY_DATA_STATUS, "la constante doit être exportée par src/lib/study-status.ts").toBeTruthy();
  expect(["withdrawn", "published"]).toContain(STUDY_DATA_STATUS.status);

  for (const field of ["withdrawnOn", "instrumentFixedOn"] as const) {
    const value = STUDY_DATA_STATUS[field];
    expect(value, `${field} doit être une chaîne`).toEqual(expect.any(String));
    expect(value, `${field} doit être une date ISO YYYY-MM-DD`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(value)), `${field} doit être une date réelle`).toBe(false);
  }
  expect(STUDY_DATA_STATUS.reason.length, "reason doit porter un motif non vide").toBeGreaterThan(20);

  // La page servie DÉRIVE de la constante : les dates du HTML sont celles-ci.
  const surfaces = await readStudySurfaces(page);
  expect(surfaces.bodyText).toContain(STUDY_DATA_STATUS.withdrawnOn);
  expect(surfaces.bodyText).toContain(STUDY_DATA_STATUS.instrumentFixedOn);
});

// =============================================================================
// AC2 — /study : aucune valeur bannie sur les quatre surfaces
// =============================================================================

test(`AC2 — Given status = ${STUDY_DATA_STATUS.status}, When on inspecte les 4 surfaces servies de /study, Then aucune valeur bannie`, async ({
  page,
}) => {
  const surfaces = await readStudySurfaces(page);
  test.skip(!withdrawn, "jeu de données republié : les bans de l'AC2 ne s'appliquent plus");

  const toScan: readonly [string, string][] = [
    ["texte rendu (corps de la page)", surfaces.bodyText],
    ["metadata.description", surfaces.metaDescription],
    ["openGraph.description", surfaces.ogDescription],
    ["JSON-LD Article", surfaces.jsonLd],
  ];

  const failures: string[] = [];
  for (const [surface, content] of toScan) {
    expect(content.length, `la surface « ${surface} » ne doit pas être vide`).toBeGreaterThan(0);
    for (const violation of findBanned(content)) failures.push(`[${surface}] ${violation}`);
  }

  expect(failures, `surfaces fautives :\n${failures.join("\n")}`).toEqual([]);
});

// =============================================================================
// AC3 — Landing FR/EN et llms.txt nettoyés, à parité
// =============================================================================

for (const { locale, path } of [
  { locale: "en" as const, path: "/" },
  { locale: "fr" as const, path: "/fr" },
]) {
  test(`AC3 (${locale.toUpperCase()}) — Given ${path} servie, Then le bloc preuve ne porte plus aucun chiffre de l'ancien instrument`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    expect(response?.status(), `${path} doit répondre 200`).toBe(200);

    const section = studySection(page, locale);
    await expect(section, "le bloc preuve doit être rendu").toBeVisible();
    const sectionText = await section.innerText();

    test.skip(!withdrawn, "jeu de données republié : les bans de l'AC3 ne s'appliquent plus");

    const violations = findBanned(sectionText);
    expect(violations, `bloc preuve ${path} :\n${violations.join("\n")}`).toEqual([]);

    // Aucun `studyStats` restant ne porte de valeur numérique issue de l'étude.
    for (const stat of homeCopy[locale].studyStats) {
      expect(await section.getByText(stat.value, { exact: true }).count()).toBeGreaterThan(0);
      expect(/\d/.test(stat.value), `studyStats.value « ${stat.value} » ne doit porter aucun chiffre`).toBe(false);
    }
  });
}

test("AC3 (parité) — Given les deux landings servies, Then FR et EN portent le même nombre d'affirmations", async ({
  page,
}) => {
  const counts: Record<Locale, number> = { en: 0, fr: 0 };
  for (const { locale, path } of [
    { locale: "en" as const, path: "/" },
    { locale: "fr" as const, path: "/fr" },
  ]) {
    await page.goto(path);
    counts[locale] = await studySection(page, locale).locator("> div > div").count();
  }
  expect(counts.fr, "parité FR/EN sur le nombre de studyStats rendus").toBe(counts.en);
  expect(counts.en, "le bloc preuve doit rendre au moins une affirmation").toBeGreaterThan(0);
  expect(homeCopy.fr.studyStats.length, "parité FR/EN dans la copy source").toBe(homeCopy.en.studyStats.length);
});

test("AC3 (llms.txt) — Given /llms.txt servi, Then la section Original research ne porte aucune valeur bannie", async ({
  request,
}) => {
  const section = await readOriginalResearch(request);
  test.skip(!withdrawn, "jeu de données republié : les bans de l'AC3 ne s'appliquent plus");
  const violations = findBanned(section);
  expect(violations, `llms.txt § Original research :\n${violations.join("\n")}`).toEqual([]);
});

// =============================================================================
// AC4 — Le retrait est affirmé positivement et daté
// =============================================================================

test("AC4 — Given status = withdrawn, Then /study répond 200 sans redirection et affiche la note datée en EN et FR", async ({
  page,
}) => {
  const surfaces = await readStudySurfaces(page);
  expect(surfaces.status, "/study doit répondre 200 (ni 404, ni 3xx)").toBe(200);
  expect(surfaces.redirected, "/study ne doit pas être une redirection").toBe(false);
  expect(surfaces.finalUrl, "/study ne doit pas être redirigée ailleurs").toMatch(/\/study$/);

  test.skip(!withdrawn, "jeu de données republié : la note de retrait n'est plus exigée");

  for (const locale of LOCALES) {
    const missing = missingFromNote(surfaces.bodyText, locale);
    expect(missing, `note de retrait ${locale.toUpperCase()} incomplète : ${missing.join(", ")}`).toEqual([]);
  }

  // Le motif est aussi porté par les surfaces machine (un moteur qui a le chiffre
  // en cache ne lit pas forcément le corps).
  expect(surfaces.metaDescription).toContain(STUDY_DATA_STATUS.withdrawnOn);
  expect(surfaces.ogDescription).toContain(STUDY_RETRACTION_REASON.gist.en);
  expect(JSON.stringify(surfaces.jsonLdParsed)).toContain(STUDY_DATA_STATUS.withdrawnOn);
  expect(JSON.stringify(surfaces.jsonLdParsed)).toContain(STUDY_RETRACTION_REASON.gist.en);
});

test("AC4 (llms.txt) — Given le fichier servi, Then il porte l'équivalent daté de la note de retrait", async ({
  request,
}) => {
  const section = await readOriginalResearch(request);
  test.skip(!withdrawn, "jeu de données republié : la note de retrait n'est plus exigée");
  const missing = missingFromNote(section, "en");
  expect(missing, `llms.txt § Original research : ${missing.join(", ")}`).toEqual([]);
  expect(section.length, "la section ne doit pas être vidée (aveu, pas effacement)").toBeGreaterThan(200);
});

test("AC4 (landings) — Given les landings servies, Then la note datée existe en FR comme en EN", async ({
  page,
}) => {
  test.skip(!withdrawn, "jeu de données republié : la note de retrait n'est plus exigée");
  for (const { locale, path } of [
    { locale: "en" as const, path: "/" },
    { locale: "fr" as const, path: "/fr" },
  ]) {
    await page.goto(path);
    const sectionText = await studySection(page, locale).innerText();
    const missing = missingFromNote(sectionText, locale);
    expect(missing, `landing ${path} : note incomplète (${missing.join(", ")})`).toEqual([]);
  }
});

// =============================================================================
// AC5 — Le ban se lève par la constante, jamais par édition du test
// =============================================================================

test(`AC5 — Given le fichier de test inchangé, When status = ${STUDY_DATA_STATUS.status}, Then les assertions basculent seules`, async ({
  page,
}) => {
  const surfaces = await readStudySurfaces(page);

  if (withdrawn) {
    // Retiré : aucun jeu de données daté ne doit être publié.
    expect(
      surfaces.bodyText.includes("Dataset produced on"),
      "aucune ligne de datation tant que les chiffres sont retirés"
    ).toBe(false);
    expect(findBanned(surfaces.bodyText), "les bans sont actifs tant que status = withdrawn").toEqual([]);
    return;
  }

  // Republié : `datasetDate` obligatoire, ET strictement postérieure au correctif.
  const datasetDate = STUDY_DATA_STATUS.datasetDate;
  expect(datasetDate, "status = published exige un datasetDate dans STUDY_DATA_STATUS").toBeTruthy();
  expect(datasetDate!).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(
    Date.parse(datasetDate!) > Date.parse(STUDY_DATA_STATUS.instrumentFixedOn),
    `datasetDate (${datasetDate}) doit être strictement postérieure à instrumentFixedOn (${STUDY_DATA_STATUS.instrumentFixedOn})`
  ).toBe(true);
  // Et la page doit VRAIMENT dater ce qu'elle republie.
  expect(surfaces.bodyText).toContain(datasetDate!);
});

// =============================================================================
// Scénarios négatifs
// =============================================================================

test("Négatif — une sous-route inexistante sous /study répond 404 (mais /study, elle, reste servie)", async ({
  request,
}) => {
  const missing = await request.get("/study/21-brands");
  expect(missing.status(), "/study/21-brands ne doit pas exister").toBe(404);
  const kept = await request.get("/study");
  expect(kept.status(), "/study doit rester servie en 200").toBe(200);
});

test("Négatif — le détecteur n'est pas vide : la copy réellement publiée avant le retrait est rejetée", async () => {
  // Extraits exacts des surfaces de /study telles qu'expédiées jusqu'au 30/07
  // (git show main:src/app/study/page.tsx et main:public/llms.txt).
  const oldBody =
    "A study of 21 direct-to-consumer brands audited with live ChatGPT and Gemini calls. " +
    "Scores ranged from 31 to 88 out of 100. In 14 of 21 audits, the assistant named a " +
    "specific competitor instead of the brand. Hedley & Bennett 31, cited 3/12, Tilit " +
    "recommended instead. Allbirds scored 46, Ridge Wallet 81.";
  const violations = findBanned(oldBody);
  expect(violations.length, "le détecteur doit rejeter l'ancienne copy").toBeGreaterThan(5);
  for (const expected of ["31 to 88", "14 of 21", "3/12", "Tilit", "Allbirds", "Ridge Wallet"]) {
    expect(violations.join(" | "), `« ${expected} » doit être détecté`).toContain(expected);
  }
});

test("Négatif — effacer les chiffres SANS note de retrait est rejeté (garde anti « ban vert par suppression »)", async () => {
  const erased =
    "This page used to carry an audit of direct-to-consumer brands. The results are no longer available.";
  expect(findBanned(erased), "aucun chiffre : le ban seul serait vert").toEqual([]);
  const missing = missingFromNote(erased, "en");
  expect(missing.length, "mais la note datée manque : le test doit rougir").toBeGreaterThan(0);
  expect(missing.join(" | ")).toContain(STUDY_DATA_STATUS.withdrawnOn);
});

test("Négatif — état vide interdit : la section Original research de llms.txt n'est ni absente ni vide", async ({
  request,
}) => {
  const section = await readOriginalResearch(request);
  expect(section.length, "section Original research vide = trace effacée").toBeGreaterThan(200);
  expect(section, "l'URL de /study doit rester citée").toContain("https://www.getpick.ai/study");
});
