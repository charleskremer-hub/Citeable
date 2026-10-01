/**
 * MESURE ANCRÉE + SOUS-DOMAINE `ai.` DU CABINET — 29/09/2026.
 *
 * Question de Charles : « comment est-on sûr que le LLM va aller voir la page
 * hébergée par GetPick ? » Réponse trouvée en relisant le code : on ne l'était
 * pas — l'audit interrogeait Gemini sans recherche web (mémoire du modèle), et
 * la page était sur un domaine tiers, auto-promotionnelle. Ces tests verrouillent
 * les deux corrections : la mesure suit le web réel ET relève les pages lues ;
 * la fiche vit sur le domaine du cabinet, en un seul geste DNS.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { geminiExtractionPrompt, geminiGroundedBody, geminiGroundingEvidence, geminiGroundingSources, resolveGroundingSources } from "@/lib/audit-engine";
import { sourcesSummary } from "@/app/audit/[id]/report-insights";
import {
  AI_CNAME_TARGET,
  aiSiteContent,
  aiSiteToken,
  cnamePointsToUs,
  dnsProviderFromNameservers,
  normalizeRootDomain,
  providerSteps,
  rootDomainFromAiHost,
  verifyAiSiteToken,
  webmasterMessage,
} from "@/lib/ai-site";

test("mesure — l'appel Gemini est ANCRÉ sur Google Search par défaut", () => {
  const body = geminiGroundedBody("q", true) as { tools?: unknown[]; generationConfig: Record<string, unknown> };
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.equal(body.generationConfig.responseMimeType, undefined, "pas de JSON forcé avec un outil");
  const fallback = geminiGroundedBody("q", false) as { tools?: unknown[] };
  assert.equal(fallback.tools, undefined);
  const engine = readFileSync("src/lib/audit-engine.ts", "utf8");
  assert.match(engine, /JSON\.stringify\(geminiGroundedBody\(question, true\)\)/, "la question est posée telle quelle, recherche activée");
  assert.match(engine, /COMPETITOR_EXTRACTION_VERSION = "gemini_grounded_two_step_v(8|9_chatgpt_crosscheck|10_nom_metier|11_nom_compose)"/, "cache invalidé : la mesure a changé de nature");
});

test("mesure — les pages lues sont relevées, dédoublonnées, sans lien de redirection", () => {
  const sources = geminiGroundingSources({
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "pagesjaunes.fr" } },
            { web: { uri: "https://vertexaisearch.cloud.google.com/x", title: "www.fiducial.fr" } },
            { web: { uri: "https://vertexaisearch.cloud.google.com/y", title: "pagesjaunes.fr" } },
            { web: { title: "Un titre qui n'est pas un domaine" } },
          ],
        },
      },
    ],
  });
  assert.deepEqual(sources, [{ domain: "pagesjaunes.fr" }, { domain: "fiducial.fr" }]);
});

test("rapport — on compte où l'IA a lu, et si le site du cabinet (ou ai.) en fait partie", () => {
  const q = (domains: string[], grounded = true) => ({
    prompt: "p",
    available: true,
    brandMentioned: false,
    competitors: [],
    surfaces: [{ surface: "Gemini", reachable: true, brandMentioned: false, competitors: [], rawAnswerSnippet: "", grounded, sources: domains.map((domain) => ({ domain })) }],
  });
  const summary = sourcesSummary([q(["pagesjaunes.fr", "cabinet.fr"]), q(["pagesjaunes.fr", "ai.cabinet.fr"]), q(["fiducial.fr"]), q(["x.fr"], false)], "www.cabinet.fr");
  assert.equal(summary.groundedCount, 3, "une réponse non ancrée ne compte pas");
  assert.equal(summary.ownDomainReadCount, 2, "le sous-domaine ai. compte comme le site du cabinet");
  assert.deepEqual(summary.top[0], { domain: "pagesjaunes.fr", count: 2 });
});

test("ai. — hôte, domaine racine, lien signé", () => {
  assert.equal(rootDomainFromAiHost("ai.cabinet-durand.fr"), "cabinet-durand.fr");
  assert.equal(rootDomainFromAiHost("www.getpick.ai"), null);
  assert.equal(normalizeRootDomain("https://www.Cabinet.fr/contact"), "cabinet.fr");
  const env = { AUDIT_SHARE_SECRET: "s" };
  const token = aiSiteToken("cabinet.fr", env);
  assert.equal(verifyAiSiteToken("cabinet.fr", token, env), true);
  assert.equal(verifyAiSiteToken("autre.fr", token, env), false);
});

test("ai. — le geste client : fournisseur détecté, clics exacts, message webmaster", () => {
  assert.equal(dnsProviderFromNameservers(["dns200.anycast.me", "ns200.anycast.me"]).key, "other");
  const ovh = dnsProviderFromNameservers(["dns11.ovh.net", "ns11.ovh.net"]);
  assert.equal(ovh.key, "ovh");
  const steps = providerSteps(ovh, "cabinet.fr").join(" ");
  assert.match(steps, /Zone DNS/);
  assert.match(steps, new RegExp(AI_CNAME_TARGET.replace(/\./g, "\\.")));
  assert.match(providerSteps(dnsProviderFromNameservers(["x.ns.cloudflare.com"]), "cabinet.fr").join(" "), /DNS only/);
  const message = webmasterMessage("cabinet.fr");
  assert.match(message, /CNAME/);
  assert.match(message, /ne touche ni au site, ni aux emails/);
  assert.equal(cnamePointsToUs(["cname.vercel-dns.com"]), true);
  assert.equal(cnamePointsToUs(["cabinet.fr"]), false);
});

test("ai. — contenu factuel : aucun concurrent, aucune intention déclarée, llms.txt valide", () => {
  const content = aiSiteContent({
    brandName: "Cabinet Durand",
    domain: "cabinet-durand.fr",
    tradeLabel: "cabinet d'expertise comptable",
    city: "Troyes",
    description: "Expert-comptable pour TPE, artisans et professions libérales de l'Aube",
    questions: ["quel expert-comptable à Troyes pour une SCI ?", "expert-comptable pour artisan à Troyes ?"],
  });
  const all = JSON.stringify(content);
  assert.doesNotMatch(all, /faire basculer|pourquoi recommander|doit être le nom|GetPick|Fiducial/i);
  assert.match(content.llmsTxt, /^# Cabinet Durand\n/);
  assert.match(content.llmsTxt, /Troyes/);
  assert.equal(content.faq.length, 2);
  assert.match(JSON.stringify(content.jsonLd), /AccountingService/);
});

test("ai. — servi avant le système de fichiers, et sans le JSON-LD ni la mesure de GetPick", () => {
  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /beforeFiles/);
  assert.match(config, /ai\\\\\.\(\?<aidomain>/);
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /isClientAiSite \? null/);
});

test("mesure — « ancré » exige la preuve d'une recherche (requêtes ou pages), pas seulement l'outil", () => {
  assert.equal(geminiGroundingEvidence({ candidates: [{}] }).searched, false);
  assert.equal(geminiGroundingEvidence({ candidates: [{ groundingMetadata: { webSearchQueries: ["expert-comptable Troyes"] } }] }).searched, true);
  const body = geminiGroundedBody("quel expert-comptable à Troyes ?", true) as { contents: Array<{ parts: Array<{ text: string }> }> };
  assert.equal(body.contents[0].parts[0].text, "quel expert-comptable à Troyes ?", "la question du client, sans consigne JSON");
  const extraction = geminiExtractionPrompt("q", "Je vous recommande Sadec Akelys et A2N Expertise.");
  assert.match(extraction, /recommended_brands/);
  assert.match(extraction, /Sadec Akelys et A2N Expertise/);
});

test("mesure — pages lues : titre-domaine, URL directe, ou cible du lien de redirection Google", async () => {
  const fakeFetch = (async (url: string) => ({
    headers: new Headers({ location: url.endsWith("/a") ? "https://www.pagesjaunes.fr/pros/123" : "https://sadec-akelys.fr/cabinet" }),
  })) as unknown as typeof fetch;
  const sources = await resolveGroundingSources(
    [
      { title: "fiducial.fr", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x" },
      { title: "Sadec Akelys | Expert-comptable Troyes", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/b" },
      { title: "PagesJaunes", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a" },
      { title: "fiducial.fr", uri: "" },
    ],
    fakeFetch,
  );
  assert.deepEqual(sources.map((source) => source.domain), ["fiducial.fr", "sadec-akelys.fr", "pagesjaunes.fr"]);
});
