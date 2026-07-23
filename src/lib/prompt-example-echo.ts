/**
 * Garde anti-écho de l'exemple de format du prompt moteur.
 *
 * Contexte : le prompt des moteurs de réponse (audit-engine.ts,
 * answerEnginePrompt) contient un exemple JSON qui montre la forme attendue.
 * Lors du re-run de l'étude du 23/07/2026, gpt-4o-mini a recopié mot pour mot
 * l'ancien exemple ("On","Hoka","Veja" + "described as a trusted premium
 * option") dans 29 réponses sur 252 — y compris pour des questions logiciel,
 * café ou compléments — et chaque écho a été compté à tort « marque non
 * citée ». Trois défenses désormais :
 *   1. l'exemple n'utilise plus que des placeholders impossibles à confondre
 *      avec une vraie marque (ce module les définit) ;
 *   2. le prompt interdit explicitement de recopier ces placeholders ;
 *   3. answerEchoesPromptExample invalide toute réponse qui les recopie —
 *      le provider retente puis marque la surface indisponible, jamais
 *      « non cité ».
 *
 * Module volontairement sans dépendance : il est importé par le moteur, par
 * les tests unitaires (node --test) et par le script de re-run de l'étude
 * pour le criblage a posteriori des données déjà collectées.
 */

export const PROMPT_EXAMPLE_BRAND_PLACEHOLDERS = ["ExampleBrandOne", "ExampleBrandTwo"] as const;
export const PROMPT_EXAMPLE_SENTIMENT_REASON = "example reason phrase";
export const PROMPT_EXAMPLE_CATEGORY = "example category";

const PROMPT_EXAMPLE_BRAND_PATTERN = /^example\s*brand/i;

function isPromptExamplePlaceholderBrand(name: string) {
  return PROMPT_EXAMPLE_BRAND_PATTERN.test(name.trim());
}

export function answerEchoesPromptExample(rawBrands: string[], sentimentReason: string | undefined, category: string | undefined) {
  if (rawBrands.some(isPromptExamplePlaceholderBrand)) return true;
  if ((sentimentReason ?? "").trim().toLowerCase() === PROMPT_EXAMPLE_SENTIMENT_REASON) return true;
  return (category ?? "").trim().toLowerCase() === PROMPT_EXAMPLE_CATEGORY;
}

/**
 * Signature de l'ANCIEN exemple (avant le correctif) — sert uniquement au
 * criblage a posteriori des réponses déjà collectées avec l'ancien prompt.
 * Le trio seul ne suffit pas : "On, Hoka, Veja" est une réponse légitime pour
 * une marque de chaussures. C'est la conjonction exacte trio (même ordre) +
 * justification recopiée qui identifie l'artefact — vérifiée sur les 29 échos
 * du re-run, dont 17 répondent à des questions hors catégorie chaussures
 * (logiciel GEO, café, compléments, sacs, cocktails sans alcool).
 */
export const LEGACY_PROMPT_EXAMPLE_BRANDS = ["On", "Hoka", "Veja"] as const;
export const LEGACY_PROMPT_EXAMPLE_SENTIMENT_REASON = "described as a trusted premium option";

export function matchesLegacyPromptExample(competitors: readonly string[], sentimentJustification: string | undefined) {
  if (competitors.length !== LEGACY_PROMPT_EXAMPLE_BRANDS.length) return false;
  if (!LEGACY_PROMPT_EXAMPLE_BRANDS.every((brand, index) => competitors[index] === brand)) return false;
  return (sentimentJustification ?? "").trim().toLowerCase() === LEGACY_PROMPT_EXAMPLE_SENTIMENT_REASON;
}
