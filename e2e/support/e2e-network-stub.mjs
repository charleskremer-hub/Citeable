/**
 * Bouchon réseau E2E — chargé par `--import` dans le PROCESS DU SERVEUR next dev
 * (voir `playwright.funnel.config.ts`). Aucun fichier applicatif n'est modifié :
 * le code d'audit appelle `fetch` comme en production, seule la frontière réseau
 * vers un tiers payant est remplacée.
 *
 * Ce qui est bouché : `generativelanguage.googleapis.com` (Gemini) UNIQUEMENT.
 * Tout le reste — la base Postgres locale, le site audité servi en local — passe
 * par le vrai chemin. Sans ce bouchon, `runAudit` lève
 * « moteur de réponse indisponible » et l'événement `audit_completed` du chemin
 * `runQueuedAudit` (AC3) ne serait jamais émis en local, faute de clé Gemini.
 */
const realFetch = globalThis.fetch;

function geminiEnvelope(payload) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function promptTextFrom(init) {
  try {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    return (
      body?.contents
        ?.flatMap((content) => content?.parts ?? [])
        .map((part) => part?.text ?? "")
        .join("\n") ?? ""
    );
  } catch {
    return "";
  }
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);

  if (url.includes("generativelanguage.googleapis.com")) {
    const prompt = promptTextFrom(init);

    // 1) Inférence de catégorie : {"category":"..."}
    if (prompt.includes('{"category"')) {
      return geminiEnvelope({ category: "olive oil" });
    }

    // 2) Questions d'intention d'achat : {"questions":[...]}
    if (prompt.includes('{"questions"')) {
      return geminiEnvelope({
        questions: [
          "What is the best cold pressed olive oil for everyday cooking?",
          "Which olive oil brands deliver quickly in France?",
          "What olive oil should I buy under 20 euros?",
          "Which olive oil is best for a gift?",
          "What are the most trusted organic olive oil brands?",
          "Which olive oil brand has the best reviews?",
        ],
      });
    }

    // 3) Réponse du moteur : marques recommandées + sentiment.
    return geminiEnvelope({
      recommended_brands: ["Aceites Del Sur", "Monini", "Colavita"],
      audited_brand_sentiment: "neutral",
      audited_brand_sentiment_reason: "not enough signal",
      audited_brand_category: "olive oil",
    });
  }

  return realFetch(input, init);
};

console.log("[e2e] bouchon réseau Gemini actif");
