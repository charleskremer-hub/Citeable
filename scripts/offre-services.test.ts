// Verrou du pivot d'offre du 22/09/2026 — « un seul prix public, une seule
// promesse, sur toutes les surfaces ».
//
// POURQUOI CE FICHIER EXISTE. Le 22/09 la landing est passée de trois paliers
// outil pour marques DTC (gratuit / Monitor 9 € / Agent 19 €) à UNE offre
// fait-pour-toi pour professionnels de service, à 69 €/mois, où le client ne
// touche ni à son site ni à son code. Ce changement traverse SIX surfaces
// publiques qui se citent les unes les autres : la copy FR et EN
// (`src/lib/i18n.ts`), le JSON-LD `SoftwareApplication` rendu sur toutes les
// pages (`src/app/layout.tsx`), le fichier que nous demandons explicitement aux
// moteurs de lire (`public/llms.txt`) et la page de comparaison
// (`src/lib/vs-comparison.ts`).
//
// La faute que ce fichier empêche n'est pas hypothétique, elle est documentée
// deux fois dans ce dépôt : le 28/07, `llms.txt` annonçait 6 questions pendant
// que le JSON-LD en annonçait 3 — deux chiffres produit contradictoires sur le
// même domaine, chacun vrai isolément. Un prix se propage exactement pareil, en
// pire : un montant périmé qui survit sur une seule surface est une promesse
// commerciale fausse, et c'est précisément la surface machine qu'une IA cite.
//
// L'invariant testé n'est donc PAS « le prix vaut 69 ». C'est :
//   1. toutes les surfaces publiques publient LE MÊME montant, celui de
//      `SERVICE_PLAN_PRICE_EUR` — changer le prix reste un seul geste ;
//   2. aucun ancien palier ne survit quelque part ;
//   3. la promesse « zéro technique » n'est contredite nulle part — la copy ne
//      peut pas, dans la même page, jurer qu'on ne touche à rien et demander de
//      coller un fichier ;
//   4. le vocabulaire DTC ne revient pas par la bande.
//
// Fonctions pures, ZÉRO réseau, ZÉRO base. Lancer : npm test  (Node >= 23.6).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homeCopy, type Locale } from "@/lib/i18n";
import { BEACHHEAD_TRADE, SERVICE_PLAN_PRICE_EUR } from "@/lib/plan-promises";
import { VS_GETPICK, vsCopy } from "@/lib/vs-comparison";

const LOCALES = ["en", "fr"] as const satisfies readonly Locale[];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = (...segments: string[]) => readFileSync(resolve(repoRoot, ...segments), "utf8");

const llmsTxt = readRepoFile("public", "llms.txt");
const llmsTxtFlat = llmsTxt.replace(/\s+/g, " ");
const layoutSource = readRepoFile("src", "app", "layout.tsx");

/** Toutes les chaînes d'un dictionnaire de copy, à plat. */
function shippedStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) shippedStrings(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) shippedStrings(item, out);
  return out;
}

const homeStrings = (locale: Locale) => shippedStrings(homeCopy[locale]);
const homeFlat = (locale: Locale) => homeStrings(locale).join("\n");

// --- 1. une seule offre payante publiée, au prix unique ---------------------

for (const locale of LOCALES) {
  test(`${locale} — la landing publie exactement deux blocs : le diagnostic gratuit et l'offre unique`, () => {
    const tiers = homeCopy[locale].pricingTiers;
    assert.equal(tiers.length, 2, `${locale}: deux blocs de prix attendus`);
    assert.equal(tiers.filter((tier) => tier.plan === "free").length, 1, `${locale}: un bloc gratuit`);
    const paid = tiers.filter((tier) => tier.plan !== "free");
    assert.equal(paid.length, 1, `${locale}: une seule offre payante`);
    assert.ok(
      paid[0].price.includes(String(SERVICE_PLAN_PRICE_EUR)),
      `${locale}: le prix affiché doit être ${SERVICE_PLAN_PRICE_EUR} (lu: ${paid[0].price})`
    );
  });
}

// --- 2. le même montant sur toutes les surfaces publiques -------------------

test("prix — le JSON-LD ne publie que le gratuit et l'offre unique, au montant de la constante", () => {
  // Le JSON-LD est lu EN SOURCE : il est construit à la compilation et rendu sur
  // TOUTES les pages. C'est la surface de plus haute confiance pour un crawler.
  assert.ok(
    layoutSource.includes("price: String(SERVICE_PLAN_PRICE_EUR)"),
    "le JSON-LD doit dériver son prix de SERVICE_PLAN_PRICE_EUR, jamais d'un littéral"
  );
  const offers = layoutSource.match(/"@type": "Offer"/g) ?? [];
  assert.equal(offers.length, 2, "exactement deux offres publiées : 0 € et l'offre unique");
  assert.doesNotMatch(layoutSource, /name: "Monitor"|name: "Agent"/, "aucun ancien palier dans le JSON-LD");
});

test("prix — llms.txt publie le montant de la constante et une seule offre payante", () => {
  assert.ok(
    llmsTxtFlat.includes(`${SERVICE_PLAN_PRICE_EUR} EUR per month`),
    `llms.txt doit annoncer « ${SERVICE_PLAN_PRICE_EUR} EUR per month »`
  );
  assert.doesNotMatch(llmsTxtFlat, /Monitor — \d+ EUR|Agent — \d+ EUR/, "aucun ancien palier dans llms.txt");
});

test("prix — la page /vs publie le même montant que la home", () => {
  assert.equal(VS_GETPICK.entryPrice, SERVICE_PLAN_PRICE_EUR);
  assert.equal(VS_GETPICK.currency, "EUR");
  for (const locale of LOCALES) {
    assert.ok(
      vsCopy[locale].metaDescription.includes(String(SERVICE_PLAN_PRICE_EUR)),
      `${locale}: la meta description de /vs doit porter le prix public`
    );
  }
});

// --- 3. aucun ancien palier ne survit sur une surface publique --------------

// Bornes obligatoires : « 69 € » CONTIENT « 9 € », et « €69 » contient « €6 ».
// Un ban naïf sur la sous-chaîne interdirait le prix courant lui-même — une
// suite rouge pour la bonne intention et la mauvaise raison.
const OBSOLETE_PRICES = [/(?<!\d)(9|19)\s?€/, /€\s?(9|19)(?!\d)/, /(?<!\d)(9|19) EUR\b/] as const;

test("aucun ancien palier (9 €, 19 €) ne survit sur une surface publique", () => {
  const surfaces: readonly (readonly [string, string])[] = [
    ...LOCALES.map((locale) => [`homeCopy.${locale}`, homeFlat(locale)] as const),
    ["public/llms.txt", llmsTxtFlat],
    ["src/app/layout.tsx", layoutSource],
    ...LOCALES.map((locale) => [`vsCopy.${locale}`, shippedStrings(vsCopy[locale]).join("\n")] as const),
  ];
  for (const [label, text] of surfaces) {
    for (const forbidden of OBSOLETE_PRICES) {
      assert.doesNotMatch(text, forbidden, `${label}: un ancien palier « ${forbidden.source} » survit`);
    }
  }
});

// --- 4. la promesse « zéro technique » n'est contredite nulle part ----------

// Ces formulations demandent toutes un GESTE au client sur son propre site.
// Elles étaient justes tant que le produit vendait des correctifs à coller ;
// depuis le pivot, chacune contredit le hero dans la même page. Le risque n'est
// pas cosmétique : c'est exactement le motif de remboursement du 16/08, où la
// landing promettait ce que le produit ne servait pas — ici, l'inverse, la
// landing demande ce que la promesse jure de ne pas demander.
const TOUCHES_THE_CLIENT_SITE = [
  /copier-coller|copy-paste|copy\/paste/i,
  /à coller|prêts? à coller|ready to paste|to paste\b/i,
  /robots\.txt/i,
  /llms\.txt/i,
  /schéma FAQ|FAQ schema|JSON-LD/i,
  /plugin|snippet/i,
] as const;

for (const locale of LOCALES) {
  test(`${locale} — la copy de la home ne demande aucun geste technique au client`, () => {
    for (const forbidden of TOUCHES_THE_CLIENT_SITE) {
      const offender = homeStrings(locale).find((text) => forbidden.test(text));
      assert.equal(
        offender,
        undefined,
        `${locale}: « ${forbidden.source} » contredit la promesse « tu ne touches à rien » — chaîne fautive : ${offender}`
      );
    }
  });
}

// --- 5. le vocabulaire de l'ancienne cible ne revient pas -------------------

const OLD_ICP_WORDS = [/\bDTC\b/, /direct-to-consumer/i, /\bshopper/i, /Shopify/i, /\bcatalogue\b/i] as const;

test("ICP — le vocabulaire DTC ne survit ni sur la home ni sur llms.txt", () => {
  const surfaces: readonly (readonly [string, string])[] = [
    ...LOCALES.map((locale) => [`homeCopy.${locale}`, homeFlat(locale)] as const),
    ["public/llms.txt", llmsTxtFlat],
  ];
  for (const [label, text] of surfaces) {
    for (const forbidden of OLD_ICP_WORDS) {
      assert.doesNotMatch(text, forbidden, `${label}: vocabulaire de l'ancienne cible « ${forbidden.source} »`);
    }
  }
});

// --- 6. le métier du beachhead reste un paramètre ---------------------------

test("beachhead — le métier n'est jamais écrit en dur dans la copy de la home", () => {
  // La copy interpole `BEACHHEAD_TRADE`. Si quelqu'un réécrit « expert-comptable »
  // en dur dans `i18n.ts`, changer de métier cesse d'être un mot et redevient une
  // chasse au texte — ce que ce test rend visible immédiatement.
  // Le scan est borné au littéral `homeCopy`, pas au fichier : `i18n.ts` porte
  // aussi une table de traduction de CATÉGORIES d'audit (« accounting firm » ->
  // « expert-comptable ») qui n'est pas de la copy de landing et doit rester
  // écrite en clair. Scanner le fichier entier faisait échouer ce test sur une
  // ligne parfaitement correcte — un faux positif est une dette de test.
  const i18nSource = readRepoFile("src", "lib", "i18n.ts");
  const start = i18nSource.indexOf("export const homeCopy = {");
  assert.notEqual(start, -1, "i18n.ts doit porter `export const homeCopy = {`");
  // `homeCopy` se ferme sur `} as const;` en début de ligne, pas sur `};` : la
  // première borne trouvée sans ce détail tombait bien plus loin dans le
  // fichier et ramenait la table de catégories dans le scan.
  const end = i18nSource.indexOf("\n} as const;", start);
  assert.notEqual(end, -1, "le littéral homeCopy doit se fermer sur une ligne `} as const;`");
  const homeCopySource = i18nSource.slice(start, end);
  for (const trade of Object.values(BEACHHEAD_TRADE)) {
    assert.ok(
      !homeCopySource.includes(trade),
      `« ${trade} » est écrit en dur dans homeCopy : le métier doit être interpolé depuis BEACHHEAD_TRADE`
    );
  }
  assert.ok(homeCopySource.includes("BEACHHEAD_TRADE"), "homeCopy doit consommer BEACHHEAD_TRADE");
});
