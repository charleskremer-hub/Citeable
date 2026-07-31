import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Import relatif volontaire : Playwright ne garantit pas le mapping de l'alias `@/`.
import { STUDY_DATA_STATUS } from "../src/lib/study-status";
import { vsCopy } from "../src/lib/vs-comparison";

// E2E — parcours utilisateur réel de la page comparative citable /vs et /fr/vs.
// Un scénario exécutable par critère d'acceptation (Given/When/Then), + scénarios
// négatifs (route inexistante, état vide).
//
// Serveur : next dev (voir playwright.config.ts, port 3311).

const CANONICAL_HOST = "https://www.getpick.ai";
const RIVALS = ["Otterly", "Peec", "Rankscale", "Profound"] as const;

// Récupère tous les blocs <script type="application/ld+json"> parsés d'une page.
async function readJsonLd(page: Page): Promise<unknown[]> {
  const raw = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return raw.map((text) => JSON.parse(text)); // throw = échec du test (parsing invalide)
}

// --- AC1 : tableau comparatif, rivaux nommés, colonne prix, ancrage 9 € -------

for (const { locale, path, agencyWord, priceAnchor } of [
  { locale: "EN", path: "/vs", agencyWord: /GEO agency/i, priceAnchor: /€9/ },
  { locale: "FR", path: "/fr/vs", agencyWord: /agence GEO/i, priceAnchor: /9\s?€/ },
]) {
  test(`AC1 (${locale}) — Given ${path} ouverte, Then tableau GetPick vs Otterly/Peec/Rankscale/Profound nommés + colonne prix + ancrage agence 9€`, async ({
    page,
  }) => {
    const resp = await page.goto(path);
    expect(resp?.status(), `${path} doit répondre 200`).toBe(200);

    // GetPick + les 4 rivaux nommés dans un vrai <table>.
    const table = page.locator("table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("GetPick");
    for (const rival of RIVALS) {
      await expect(table, `${rival} doit être nommé dans le tableau`).toContainText(rival);
    }

    // Au minimum une colonne « prix d'entrée » en en-tête.
    const priceHeader = locale === "FR" ? /Prix d'entrée/i : /Entry price/i;
    await expect(table.locator("thead")).toContainText(priceHeader);

    // Ancrage prix « travail d'une agence GEO … 9 € » présent dans la page.
    const body = page.locator("body");
    await expect(body).toContainText(agencyWord);
    await expect(body).toContainText(priceAnchor);

    // Le prix d'entrée GetPick 9 € figure sur la ligne GetPick.
    const getpickRow = table.locator("tr", { hasText: "GetPick" }).first();
    await expect(getpickRow).toContainText(priceAnchor);
  });
}

// --- AC2 : JSON-LD FAQPage + comparaison, parsables, question de catégorie ----

for (const { locale, path, bestQ, altQ } of [
  { locale: "EN", path: "/vs", bestQ: /best GEO tool/i, altQ: /alternative to Otterly/i },
  { locale: "FR", path: "/fr/vs", bestQ: /meilleur outil GEO/i, altQ: /alternative.*Otterly/i },
]) {
  test(`AC2 (${locale}) — Given un crawler, When il parse le ld+json, Then FAQPage + ItemList valides + question de catégorie`, async ({
    page,
  }) => {
    await page.goto(path);
    const blocks = await readJsonLd(page); // parsing strict : JSON invalide => throw

    // Deux blocs : (1) Organization + FAQPage via @graph, (2) ItemList comparatif.
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const graphBlock = blocks.find(
      (b): b is { "@graph": Array<Record<string, unknown>> } =>
        typeof b === "object" && b !== null && Array.isArray((b as Record<string, unknown>)["@graph"])
    );
    expect(graphBlock, "un bloc avec @graph (Organization + FAQPage) doit exister").toBeTruthy();

    const nodes = graphBlock!["@graph"];
    expect(nodes.some((n) => n["@type"] === "Organization")).toBe(true);
    const faq = nodes.find((n) => n["@type"] === "FAQPage") as
      | { mainEntity?: Array<{ name: string; acceptedAnswer?: { text?: string } }> }
      | undefined;
    expect(faq, "un nœud FAQPage doit être présent").toBeTruthy();

    // La 1re question reprend « meilleur outil GEO / alternative à Otterly ».
    const firstQuestion = faq!.mainEntity?.[0]?.name ?? "";
    expect(firstQuestion).toMatch(bestQ);
    expect(firstQuestion).toMatch(altQ);

    // Le 2e bloc est un ItemList de comparaison avec 5 offres (GetPick + 4 rivaux).
    const itemList = blocks.find(
      (b): b is { "@type": string; itemListElement: unknown[] } =>
        typeof b === "object" && b !== null && (b as Record<string, unknown>)["@type"] === "ItemList"
    );
    expect(itemList, "un bloc ItemList doit être présent").toBeTruthy();
    expect(itemList!.itemListElement.length).toBe(5);
  });
}

// --- AC3 : prix concurrent daté « relevé 2026-07 » + source vérifiable --------

for (const { locale, path, dated } of [
  { locale: "EN", path: "/vs", dated: /recorded 2026-07/i },
  { locale: "FR", path: "/fr/vs", dated: /relevé 2026-07/i },
]) {
  test(`AC3 (${locale}) — Given chaque prix concurrent, Then daté 2026-07 + source https vérifiable, aucun prix nu`, async ({
    page,
  }) => {
    await page.goto(path);

    // Chaque rival possède une ligne avec la date de relevé et un lien source https.
    for (const rival of RIVALS) {
      const row = page.locator("table tr", { hasText: rival }).first();
      await expect(row, `${rival}: date de relevé affichée`).toContainText(dated);
      const source = row.locator('a[href^="https://"]');
      await expect(source, `${rival}: lien source vérifiable`).toHaveCount(1);
      const href = await source.getAttribute("href");
      expect(href, `${rival}: href source non vide`).toBeTruthy();
      expect(href!.length).toBeGreaterThan("https://".length);
    }

    // Le JSON-LD ItemList porte la même datation dans la description des Offers.
    const blocks = await readJsonLd(page);
    const itemList = blocks.find(
      (b): b is { itemListElement: Array<{ item: { name: string; offers: { description: string; url: string; priceCurrency: string } } }> } =>
        typeof b === "object" && b !== null && (b as Record<string, unknown>)["@type"] === "ItemList"
    )!;
    for (const rival of RIVALS) {
      const el = itemList.itemListElement.find((e) => e.item.name === rival)!;
      expect(el.item.offers.description).toMatch(/2026-07/);
      expect(el.item.offers.url).toMatch(/^https:\/\//);
      expect(el.item.offers.priceCurrency).toMatch(/^(EUR|USD)$/);
    }
  });
}

// --- AC4 : sitemap + llms.txt + canonical www + 200 ---------------------------

test("AC4 — Given la page publiée, Then FR+EN dans sitemap.xml & llms.txt, canonical www, 200", async ({
  page,
  request,
}: {
  page: Page;
  request: APIRequestContext;
}) => {
  // Les deux URLs répondent 200.
  for (const path of ["/vs", "/fr/vs"]) {
    const r = await request.get(path);
    expect(r.status(), `${path} doit répondre 200`).toBe(200);
  }

  // sitemap.xml contient les deux URLs canoniques www.
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(`${CANONICAL_HOST}/vs`);
  expect(xml).toContain(`${CANONICAL_HOST}/fr/vs`);

  // public/llms.txt maille les deux pages.
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  const llmsTxt = await llms.text();
  expect(llmsTxt).toContain(`${CANONICAL_HOST}/vs`);
  expect(llmsTxt).toContain(`${CANONICAL_HOST}/fr/vs`);

  // Canonical www sur chaque page.
  await page.goto("/vs");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${CANONICAL_HOST}/vs`
  );
  await page.goto("/fr/vs");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${CANONICAL_HOST}/fr/vs`
  );
});

// --- AC5 : lien « voir l'étude » → /study (200), preuve NON dupliquée ---------

// Le libellé du CTA est LU dans `vsCopy`, jamais réécrit ici. Il était figé en
// dur (`/See the study/i`) : le jour où la copy a cessé de promettre une étude
// au-dessus d'une page de rétractation, ces deux scénarios sont devenus rouges
// alors que le parcours marchait. Un spec qui recopie la copy teste sa propre
// copie ; branché sur le module, il suit la reformulation et ne garde son rouge
// que pour ce qu'il vérifie vraiment — que le lien mène bien à /study.
for (const { locale, path, cta } of [
  { locale: "EN", path: "/vs", cta: vsCopy.en.studyCta },
  { locale: "FR", path: "/fr/vs", cta: vsCopy.fr.studyCta },
]) {
  test(`AC5 (${locale}) — Given le lien « voir l'étude », When je le suis, Then /study 200 et preuve non figée sur /vs`, async ({
    page,
  }) => {
    await page.goto(path);
    const link = page.getByRole("link", { name: cta });
    await expect(link).toHaveAttribute("href", "/study");

    await link.click();
    await page.waitForURL("**/study");
    expect(page.url()).toMatch(/\/study$/);
    // Ce que /study doit porter dépend de l'état du jeu de données, pas de ce
    // fichier : `studyPageCopy` cesse d'écrire la note de retrait le jour où le
    // rerun republie. Brancher sur `status` est ce qui rend la promesse de l'AC5
    // vraie — republier passe par la constante, jamais par l'édition d'un spec.
    if (STUDY_DATA_STATUS.status === "withdrawn") {
      // Retrait affirmé et daté : les deux dates et le mot, pas de chiffre d'étude.
      await expect(page.locator("body")).toContainText(STUDY_DATA_STATUS.withdrawnOn);
      await expect(page.locator("body")).toContainText(STUDY_DATA_STATUS.instrumentFixedOn);
      await expect(page.locator("body")).toContainText(/retract|withdraw|withdrew|withdrawn|retir/i);
    } else {
      // Republié : la page doit dater le jeu de données qu'elle publie, sans quoi
      // on ne saurait pas s'il vient d'avant ou d'après le correctif d'instrument.
      const datasetDate = STUDY_DATA_STATUS.datasetDate;
      expect(datasetDate, "status = published exige un datasetDate dans STUDY_DATA_STATUS").toBeTruthy();
      await expect(page.locator("body")).toContainText(String(datasetDate));
    }

    // La preuve n'est PAS dupliquée sur /vs : aucun nom de marque de l'étude,
    // aucun score /100 figé recopié dans la page comparative.
    await page.goto(path);
    const vsBody = await page.locator("body").innerText();
    expect(vsBody, "aucun nom de marque de l'étude recopié sur /vs").not.toContain("Hedley & Bennett");
    expect(vsBody, "aucun nom de marque de l'étude recopié sur /vs").not.toContain("Ridge Wallet");
    expect(vsBody, "aucun score /100 figé recopié sur /vs").not.toMatch(/\b\d{1,3}\s*\/\s*100\b/);
  });
}

// --- Scénarios négatifs (au moins un par parcours) ----------------------------

test("Négatif — une sous-route inexistante sous /vs répond 404", async ({ request }) => {
  const r = await request.get("/vs/does-not-exist");
  expect(r.status()).toBe(404);
});

test("Négatif — une route FR comparative inexistante répond 404", async ({ request }) => {
  const r = await request.get("/fr/vs/otterly-only");
  expect(r.status()).toBe(404);
});

test("Négatif — aucun prix concurrent n'est affiché sans date de relevé (état incohérent interdit)", async ({
  page,
}) => {
  await page.goto("/vs");
  // Chaque ligne rival doit porter « recorded 2026-07 » ; l'absence serait un
  // prix non daté (interdit par AC3). On vérifie qu'aucun rival n'y échappe.
  for (const rival of RIVALS) {
    const row = page.locator("table tr", { hasText: rival }).first();
    await expect(row).toContainText(/recorded 2026-07/i);
  }
});
