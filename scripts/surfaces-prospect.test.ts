// Verrou « surfaces prospect » — 22/09/2026, lot 2 du pivot d'offre.
//
// POURQUOI CE FICHIER EXISTE. Le lot 1 du pivot (commit `6156e61`, même jour) a
// réaligné la LANDING sur l'offre unique « Fait pour toi » à
// `SERVICE_PLAN_PRICE_EUR`, et `offre-services.test.ts` verrouille ces surfaces.
// Il n'a délibérément pas touché au PARCOURS D'APRÈS : le bloc verrouillé de la
// page de rapport et les deux emails post-audit. Ceux-là vendaient encore
// « Monitor 9 €/mois » et « Agent 19 €/mois », et le bloc verrouillé ouvrait sur
// « Un seul geste : tu colles ce qui suit sur ton site » — exactement ce que la
// home jure de ne jamais demander.
//
// Un prospect qui lance le diagnostic gratuit voyait donc, dans la même heure,
// 69 € et « tu ne touches à rien » sur la home, puis 9 € et « colle ça » dans son
// rapport. Chacune des deux surfaces était cohérente isolément : c'est la
// signature de cette famille de fautes (28/07, llms.txt 6 questions contre
// JSON-LD 3 ; 16/08, cadence promise non servie).
//
// L'INVARIANT TESTÉ n'est pas « le prix vaut 69 ». C'est :
//   1. aucune surface vue par un NON-CLIENT ne publie un palier retiré ;
//   2. ces surfaces DÉRIVENT de `SERVICE_OFFER_COPY`, donc du même endroit que
//      la landing — changer le prix, le métier ou la cadence reste un geste ;
//   3. la promesse « zéro technique » n'est contredite nulle part sur ce
//      parcours ;
//   4. quand il n'y a pas de caisse, `checkout_opened` NE PART PAS.
//
// OÙ S'ARRÊTE LA PREUVE. Les quatre premiers blocs lisent des valeurs réelles
// (`auditCopy`, `SERVICE_OFFER_COPY`). Les trois derniers lisent la SOURCE de
// `audit-engine.ts`, de la route de relance et d'un composant `.tsx` : le runner
// `node --test` ne charge pas le JSX et la route tire `next/server`. Un scan de
// source prouve qu'un littéral n'est pas écrit là ; il ne prouve pas le
// comportement à l'exécution. C'est dit ici plutôt qu'ailleurs.
//
// Fonctions pures, ZÉRO réseau, ZÉRO base. Lancer : npm test  (Node >= 23.6).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { auditCopy, type Locale } from "@/lib/i18n";
import { SERVICE_OFFER_COPY, SERVICE_PLAN_PRICE_EUR } from "@/lib/plan-promises";

const LOCALES = ["en", "fr"] as const satisfies readonly Locale[];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = (...segments: string[]) => readFileSync(resolve(repoRoot, ...segments), "utf8");

/** Source commentaires retirés : une mutation commentée doit rester détectée. */
function strippedSource(...segments: string[]) {
  return readRepoFile(...segments)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/** Ce qu'un prospect NON CLIENT lit sur son rapport. Les autres clés d'`auditCopy`
 *  décrivent le livrable d'un tier déjà payé : elles ne sont pas de la vente. */
const lockedBlock = (locale: Locale) => [
  auditCopy[locale].publishLockedEyebrow,
  auditCopy[locale].publishLockedTitle,
  auditCopy[locale].publishLockedBody,
  auditCopy[locale].publishLockedCta,
];

// --- 1. aucun palier retiré sur le parcours d'un non-client -----------------

// Bornes obligatoires : « 69 € » CONTIENT « 9 € », et « €69 » contient « €6 ».
// Un ban naïf sur la sous-chaîne interdirait le prix courant lui-même — une
// suite rouge pour la bonne intention et la mauvaise raison.
const OBSOLETE_PRICES = [/(?<!\d)(9|19)\s?€/, /€\s?(9|19)(?!\d)/, /(?<!\d)(9|19) EUR\b/] as const;

for (const locale of LOCALES) {
  test(`${locale} — le bloc verrouillé du rapport ne publie aucun ancien palier`, () => {
    const text = lockedBlock(locale).join("\n");
    for (const forbidden of OBSOLETE_PRICES) {
      assert.doesNotMatch(text, forbidden, `${locale}: « ${forbidden.source} » survit sur le rapport`);
    }
  });

  test(`${locale} — le bloc verrouillé ne nomme plus un palier retiré`, () => {
    // « Monitor » et « Agent » restent des noms de TIERS INTERNES (droits,
    // webhook, rapport payant) : ils sont bannis de la VENTE, pas du code.
    const text = lockedBlock(locale).join("\n");
    assert.doesNotMatch(text, /\bMonitor\b/, `${locale}: le rapport vend encore « Monitor »`);
    assert.doesNotMatch(text, /\bAgent\b/, `${locale}: le rapport vend encore « Agent »`);
  });
}

// --- 2. le rapport dérive de la même source que la landing ------------------

for (const locale of LOCALES) {
  test(`${locale} — le bloc verrouillé EST SERVICE_OFFER_COPY, il ne le recopie pas`, () => {
    const offer = SERVICE_OFFER_COPY[locale];
    assert.equal(auditCopy[locale].publishLockedEyebrow, offer.badge);
    assert.equal(auditCopy[locale].publishLockedTitle, offer.title);
    assert.equal(auditCopy[locale].publishLockedBody, offer.body);
    assert.equal(auditCopy[locale].publishLockedCta, offer.cta);
  });

  test(`${locale} — le prix vendu sur le rapport est celui de la constante`, () => {
    assert.ok(
      lockedBlock(locale).join("\n").includes(String(SERVICE_PLAN_PRICE_EUR)),
      `${locale}: le rapport doit publier ${SERVICE_PLAN_PRICE_EUR}`
    );
  });
}

// --- 3. « zéro technique » n'est contredit nulle part sur ce parcours -------

const TOUCHES_THE_CLIENT_SITE = [
  /copier-coller|copy-paste|copy\/paste/i,
  /à coller|prêts? à coller|ready to paste|to paste\b/i,
  /tu colles|you paste|paste what follows|paste it/i,
  /robots\.txt/i,
  /llms\.txt/i,
  /schéma FAQ|FAQ schema|JSON-LD/i,
  /plugin|snippet/i,
] as const;

for (const locale of LOCALES) {
  test(`${locale} — le bloc verrouillé ne demande aucun geste technique`, () => {
    for (const forbidden of TOUCHES_THE_CLIENT_SITE) {
      const offender = lockedBlock(locale).find((text) => forbidden.test(text));
      assert.equal(
        offender,
        undefined,
        `${locale}: « ${forbidden.source} » contredit la promesse « tu ne touches à rien » — chaîne fautive : ${offender}`
      );
    }
  });
}

// --- 4. les emails post-audit vendent la même offre -------------------------

const auditEngineSource = strippedSource("src", "lib", "audit-engine.ts");

test("emails — la note du rapport et la relance J+3 dérivent de SERVICE_OFFER_COPY", () => {
  // Deux emplacements, deux assertions : la note de bas d'email (tout audit) et
  // le corps de la relance `j3_offer`. Compter les usages plutôt que chercher
  // une phrase rend le test insensible à une reformulation LÉGITIME de la copy,
  // et rouge à sa réécriture EN DUR — c'est cette seconde faute qu'on traque.
  const uses = auditEngineSource.match(/SERVICE_OFFER_COPY\[fr \? "fr" : "en"\]/g) ?? [];
  assert.ok(
    uses.length >= 3,
    `les surfaces email doivent dériver de SERVICE_OFFER_COPY (phrase + phrase de relance + bouton) — trouvé ${uses.length}`
  );
});

test("emails — aucun ancien palier écrit en dur dans les constructeurs d'email", () => {
  // Borné aux littéraux de prix : `audit-engine.ts` DÉCRIT encore légitimement
  // les tiers `monitor_9eur` / `agent_19eur` à leurs ACHETEURS (`tierSummary`),
  // ce qui n'est pas de la vente à un prospect. On bannit donc les libellés
  // commerciaux de bouton et de relance, pas le nom des tiers.
  assert.doesNotMatch(auditEngineSource, /Démarrer Agent/, "le bouton « Démarrer Agent » est revenu");
  assert.doesNotMatch(auditEngineSource, /Start Agent —/, "le bouton « Start Agent » est revenu");
  assert.doesNotMatch(
    auditEngineSource,
    /GetPick Agent \(1?9 ?€\/mois\)|GetPick Agent \(€1?9\/month\)/,
    "la phrase de vente « GetPick Agent (19 €/mois) » est revenue"
  );
});

test("relance — la cible du lien est la caisse de l'offre unique, sans casser les emails déjà envoyés", () => {
  assert.match(
    auditEngineSource,
    /followupClickUrl\(report\.audit_id, step, "service_checkout"\)/,
    "les emails NEUFS doivent pointer sur `service_checkout`"
  );
  const routeSource = strippedSource("src", "app", "api", "funnel", "followup-click", "route.ts");
  // Le scan est borné À LA LIGNE QUI ANALYSE le paramètre, pas au fichier. Un
  // `includes` sur tout le fichier restait vert quand la reconnaissance de
  // `agent_checkout` disparaissait de l'analyse : la chaîne survivait plus bas,
  // dans le choix de l'URL. Trou réel, trouvé par la mutation M7, corrigé ici.
  // Chercher une chaîne prouve qu'un mot est écrit ; il faut chercher LÀ OÙ il
  // décide.
  const targetLine = routeSource.split("\n").find((line) => line.includes("const target ="));
  assert.ok(targetLine, "la route doit analyser le paramètre `target`");
  assert.ok(
    targetLine.includes('"service_checkout"'),
    "l'analyse du paramètre doit reconnaître `service_checkout`"
  );
  assert.ok(
    targetLine.includes('"agent_checkout"'),
    "l'analyse doit CONTINUER de reconnaître `agent_checkout` : ce paramètre est écrit dans des emails déjà envoyés, que personne ne peut réécrire"
  );
  assert.ok(
    routeSource.includes("SERVICE_CHECKOUT_URL"),
    "la route doit rediriger vers la caisse de l'offre unique"
  );
});

// --- 5. pas de caisse ⇒ pas de `checkout_opened` ----------------------------

test("caisse — le CTA du rapport n'émet `checkout_opened` que si une caisse existe", () => {
  // Faute que ce test empêche, mesurée le 14/09 : un `checkout_opened` est parti
  // avec `checkout_url: ""`. Un compteur de caisse qui bouge sans caisse est pire
  // qu'un compteur à zéro — il fabrique une conversion qui n'existe pas.
  const linkSource = strippedSource("src", "app", "audit", "[id]", "FunnelCheckoutLink.tsx");
  assert.match(
    linkSource,
    /if \(checkoutConfigured\) \{\s*events\.push\(\{\s*event_name: "checkout_opened"/,
    "`checkout_opened` doit être conditionné par `checkoutConfigured`"
  );
  assert.ok(
    linkSource.includes('event_name: "teaser_cta_click"') &&
      linkSource.indexOf('event_name: "teaser_cta_click"') < linkSource.indexOf("if (checkoutConfigured)"),
    "`teaser_cta_click` doit partir DANS TOUS LES CAS : c'est l'intérêt qu'il mesure, pas la caisse"
  );

  const pageSource = strippedSource("src", "app", "audit", "[id]", "page.tsx");
  assert.ok(
    pageSource.includes("checkoutConfigured={isCheckoutConfigured(SERVICE_CHECKOUT_URL)}"),
    "la page doit transmettre l'état réel de la caisse, jamais une valeur en dur"
  );
});

test("caisse — un href vide n'est attribué à aucun plan", () => {
  // `SERVICE_CHECKOUT_URL`, `MONITOR_CHECKOUT_URL` et `AGENT_CHECKOUT_URL` valent
  // toutes les trois "" aujourd'hui (fail-safe). Sans la garde sur la chaîne
  // vide, `planFromHref("")` rendrait `service_69eur` par simple égalité de
  // chaînes vides, et le repli `#pricing` remonterait comme un clic sur la caisse.
  const linkSource = strippedSource("src", "app", "audit", "[id]", "FunnelCheckoutLink.tsx");
  assert.match(
    linkSource,
    /function planFromHref\(href: string\) \{\s*if \(!href\) return "none";/,
    "planFromHref doit refuser d'attribuer un plan à un href vide"
  );
});
