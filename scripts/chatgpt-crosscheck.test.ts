import { strict as assert } from "node:assert";
import { test } from "node:test";

import { chatGPTSearchBody, createChatGPTSearchProvider, openAIResponsesEvidence } from "../src/lib/audit-engine";
import { crossCheckFor, platformCoverage, questionBoardRows } from "../src/app/audit/[id]/report-insights";

// Contre-vérification ChatGPT (01/10, inspiré de Pinniq Legal : 4 plateformes
// interrogées, pas une). Ce que ces tests verrouillent : la question part TELLE
// QUELLE avec recherche web, les cabinets cités sont lus dans la vraie réponse,
// et le verdict principal (Gemini) n'est jamais modifié.

const responsesBody = {
  output: [
    { type: "web_search_call", action: { query: "expert-comptable freelance Bordeaux" } },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "Pour un freelance à Bordeaux : Cabinet Merisier, puis Fiducial.",
          annotations: [
            { type: "url_citation", url: "https://www.cabinet-merisier.fr/freelance", title: "Merisier" },
            { type: "url_citation", url: "https://www.fiducial.fr/", title: "Fiducial" },
            { type: "url_citation", url: "https://cabinet-merisier.fr/autre", title: "doublon" },
          ],
        },
      ],
    },
  ],
};

test("la question part telle quelle, recherche web activee, ancree en France", () => {
  const body = chatGPTSearchBody("gpt-4.1-mini", "Quel expert-comptable a Bordeaux pour un freelance ?");
  assert.equal(body.input, "Quel expert-comptable a Bordeaux pour un freelance ?");
  assert.equal(body.tools[0].type, "web_search");
  assert.equal(body.tools[0].user_location.country, "FR");
});

test("texte, pages citees (dedoublonnees) et requetes sont lus dans la reponse", () => {
  const evidence = openAIResponsesEvidence(responsesBody);
  assert.match(evidence.text, /Cabinet Merisier/);
  assert.deepEqual(evidence.queries, ["expert-comptable freelance Bordeaux"]);
  assert.ok(evidence.searched);
  assert.equal(evidence.sources.length, 2);
});

test("le fournisseur rend les cabinets cites dans l'ordre, via l'extracteur commun", async () => {
  process.env.OPENAI_API_KEY = "test";
  let sentBody = "";
  const fakeFetch = (async (_url: string, init?: RequestInit) => {
    sentBody = String(init?.body ?? "");
    return new Response(JSON.stringify(responsesBody), { status: 200 });
  }) as typeof fetch;
  const provider = createChatGPTSearchProvider(fakeFetch, async () => '{"recommended_brands":["Cabinet Merisier","Fiducial"]}');
  const answer = await provider.ask("Quel expert-comptable a Bordeaux pour un freelance ?", { brandName: "X", domain: "x.fr" });
  assert.ok(!("error" in answer));
  if ("error" in answer) return;
  assert.deepEqual(answer.competitorBrands, ["Cabinet Merisier", "Fiducial"]);
  assert.equal(answer.grounded, true);
  assert.match(sentBody, /web_search/);
});

test("une erreur OpenAI devient une erreur propre, jamais un faux verdict", async () => {
  process.env.OPENAI_API_KEY = "test";
  const fakeFetch = (async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 })) as unknown as typeof fetch;
  const provider = createChatGPTSearchProvider(fakeFetch, async () => null);
  const answer = await provider.ask("q ?", { brandName: "X", domain: "x.fr" });
  assert.ok("error" in answer);
});

const surface = (over: Record<string, unknown>) => ({ surface: "x", reachable: true, brandMentioned: false, competitors: [], rawAnswerSnippet: "", status: "checked", ...over });

test("le rapport lit la contre-verification sans toucher au verdict Gemini", () => {
  const questions = [
    {
      prompt: "Expert-comptable pour une SCI a Bordeaux ?",
      available: true,
      brandMentioned: false,
      competitors: ["Fiducial"],
      surfaces: [
        surface({ kind: "ai_engine", engine: "Gemini", competitors: ["Fiducial"] }),
        surface({ kind: "cross_check", engine: "ChatGPT", brandMentioned: true, rawAnswerSnippet: "recommended_brands: Excilio, Fiducial" }),
      ],
    },
    {
      prompt: "Comptable pour la paie a Bordeaux ?",
      available: true,
      brandMentioned: true,
      competitors: [],
      surfaces: [surface({ kind: "ai_engine", engine: "Gemini", brandMentioned: true }), surface({ kind: "cross_check", engine: "ChatGPT", status: "failed", reachable: false })],
    },
  ] as never;
  const rows = questionBoardRows(questions, "excilio.fr", "Excilio");
  const sci = rows.find((row) => row.prompt.includes("SCI"))!;
  assert.equal(sci.state, "missing", "verdict principal inchange");
  assert.equal(sci.crossCheck?.state, "recommended");
  assert.deepEqual(sci.crossCheck?.position, { rank: 1, of: 2 });
  assert.deepEqual(platformCoverage(rows, "Gemini"), [
    { engine: "Gemini", cited: 1, checked: 2 },
    { engine: "ChatGPT", cited: 1, checked: 1 },
  ]);
  assert.equal(crossCheckFor({ prompt: "q", available: true, brandMentioned: false, competitors: [], surfaces: [] }), null);
});

test("sans contre-verification, une seule plateforme (rapports d'avant inchanges)", () => {
  const rows = questionBoardRows([{ prompt: "q ?", available: true, brandMentioned: false, competitors: [], surfaces: [surface({ kind: "ai_engine", engine: "Gemini" })] }] as never, "x.fr", "X");
  assert.equal(platformCoverage(rows, "Gemini").length, 1);
});
