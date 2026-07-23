import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { matchesLegacyPromptExample } from "../src/lib/prompt-example-echo";

/**
 * E2E — Story « Étude 21 marques : re-run moteur corrigé + republication /study
 * édition juillet 2026 ». Un bloc de tests par critère d'acceptation.
 *
 * - AC1 est validé contre la VRAIE base Neon, via l'API de production
 *   (www.getpick.ai/api/audit-status interroge `audits` directement) + les
 *   artefacts bruts versionnés du re-run.
 * - AC2/AC3 sont validés sur l'app buildée depuis la branche (next start).
 * - AC4 valide que chaque URL référencée par la branche (canonical, sitemap,
 *   llms.txt) répond 200 sur www.getpick.ai.
 * - AC5 valide la consignation de la veille sponsorisée.
 */

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "artifacts", "study-rerun-2026-07");
const PROD = "https://www.getpick.ai";

type StudyResult = {
  brand: string;
  websiteUrl: string;
  auditId: string;
  score: number;
  questionsAsked: number;
  validAnswers: number;
  echoAnswers: number;
  citedCount: number;
  promptDebug: string;
  sponsoredMarkers: unknown[];
};

type Results = {
  echoScreening: {
    totalAnswers: number;
    echoAnswersDiscarded: number;
    brandsAffected: { brand: string; echoAnswers: number }[];
  };
  results: StudyResult[];
  failures: unknown[];
};

type RawSurface = {
  kind: string;
  competitors?: string[];
  brandSentiment?: { justification?: string };
};
type RawAudit = {
  audit_id: string;
  brand_name: string;
  website_url: string;
  prompt_debug: string;
  buyer_intent_prompts: { prompt: string; surfaces: RawSurface[] }[];
};

const results: Results = JSON.parse(readFileSync(path.join(ARTIFACTS, "results.json"), "utf8"));
const rawFiles = readdirSync(path.join(ARTIFACTS, "raw")).filter((f) => f.endsWith(".json"));
const rawAudits: RawAudit[] = rawFiles.map((f) =>
  JSON.parse(readFileSync(path.join(ARTIFACTS, "raw", f), "utf8"))
);

/** Nom affiché dans le tableau /study pour chaque marque du results.json. */
const displayName = (brand: string) => (brand === "GetPick" ? "GetPick (us)" : brand);

/** Clé compacte façon moteur : minuscules, alphanumérique uniquement. */
const compact = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Réimplémentation fidèle (fenêtres de 1 à 4 tokens, clés compactes) du
 * garde-fou promptMentionsAuditedBrand : une question est « brandée » si une
 * fenêtre de tokens compactée égale le nom de marque compacté, ou si elle
 * contient le domaine nu.
 */
function questionIsBranded(question: string, brandName: string, websiteUrl: string): boolean {
  const bareDomain = new URL(websiteUrl).hostname.replace(/^www\./i, "").toLowerCase();
  if (question.toLowerCase().includes(bareDomain)) return true;

  const brandKey = compact(brandName);
  const domainKey = compact(bareDomain.split(".")[0]);
  const keys = new Set([brandKey, domainKey].filter((k) => k.length >= 4));

  const tokens = question.split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean);
  for (let start = 0; start < tokens.length; start += 1) {
    for (let size = 1; size <= 4 && start + size <= tokens.length; size += 1) {
      const windowKey = compact(tokens.slice(start, start + size).join(""));
      if (windowKey && keys.has(windowKey)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// AC1 — Re-run stocké en base Neon, promptDebug prouvant le chemin corrigé
// ---------------------------------------------------------------------------

test.describe("AC1 — audits du re-run en base Neon avec promptDebug", () => {
  test("les 21 audits existent, results.json et raw/ sont cohérents (21 marques, 12 questions, promptDebug ai:12)", () => {
    expect(results.results).toHaveLength(21);
    expect(results.failures).toHaveLength(0);
    expect(rawAudits).toHaveLength(21);

    for (const r of results.results) {
      expect(r.promptDebug, r.brand).toBe("ai:12");
      expect(r.questionsAsked, r.brand).toBe(12);
      const raw = rawAudits.find((a) => a.audit_id === r.auditId);
      expect(raw, `artefact brut manquant pour ${r.brand}`).toBeTruthy();
      expect(raw!.prompt_debug, r.brand).toBe("ai:12");
      expect(raw!.buyer_intent_prompts, r.brand).toHaveLength(12);
    }
  });

  test("chaque audit du re-run est bien stocké dans Neon (API prod audit-status) avec prompt_debug ai:12 et 12 questions", async ({ request }) => {
    test.setTimeout(180_000);
    for (const r of results.results) {
      const res = await request.get(`${PROD}/api/audit-status?audit_id=${r.auditId}`);
      expect(res.status(), `${r.brand} (${r.auditId})`).toBe(200);
      const body = await res.json();
      expect(body.prompt_debug, r.brand).toBe("ai:12");
      expect(body.buyer_intent_prompts, r.brand).toHaveLength(12);
      expect(body.score, r.brand).toBe(r.score);
      expect(compact(body.brand_name), r.brand).toBe(compact(r.brand));
    }
  });

  test("zéro question brandée sur les 252 questions servies (garde promptMentionsAuditedBrand)", () => {
    const branded: string[] = [];
    for (const raw of rawAudits) {
      for (const p of raw.buyer_intent_prompts) {
        if (questionIsBranded(p.prompt, raw.brand_name, raw.website_url)) {
          branded.push(`${raw.brand_name}: ${p.prompt}`);
        }
      }
    }
    expect(branded, branded.join("\n")).toHaveLength(0);
  });

  test("zéro écho de l'exemple du prompt servi comme donnée : les 29 échos sont détectés et exclus, comptes par marque conformes", () => {
    const echoCounts = new Map<string, number>();
    let total = 0;
    for (const raw of rawAudits) {
      let count = 0;
      for (const p of raw.buyer_intent_prompts) {
        for (const s of p.surfaces.filter((s) => s.kind === "ai_engine")) {
          total += 1;
          if (matchesLegacyPromptExample(s.competitors ?? [], s.brandSentiment?.justification)) count += 1;
        }
      }
      if (count > 0) echoCounts.set(raw.brand_name, count);
    }
    expect(total).toBe(results.echoScreening.totalAnswers); // 252
    const detected = [...echoCounts.values()].reduce((a, b) => a + b, 0);
    expect(detected).toBe(results.echoScreening.echoAnswersDiscarded); // 29

    // Les comptes publiés (results.json + note † de /study) correspondent à la détection.
    for (const affected of results.echoScreening.brandsAffected) {
      expect(echoCounts.get(affected.brand), affected.brand).toBe(affected.echoAnswers);
    }
    expect(echoCounts.size).toBe(results.echoScreening.brandsAffected.length);

    // Et validAnswers/citedCount publiés excluent bien ces échos.
    for (const r of results.results) {
      const echoes = echoCounts.get(r.brand) ?? 0;
      expect(r.validAnswers + echoes, r.brand).toBe(12);
      expect(r.echoAnswers, r.brand).toBe(echoes);
      expect(r.citedCount, r.brand).toBeLessThanOrEqual(r.validAnswers);
    }
  });

  test("scénario négatif : un audit_id inconnu répond 404 (le 200 des 21 audits n'est pas un faux positif)", async ({ request }) => {
    const res = await request.get(`${PROD}/api/audit-status?audit_id=00000000-0000-4000-8000-000000000000`);
    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// AC2 — /study affiche les scores recalculés, datés, édition juillet 2026
// ---------------------------------------------------------------------------

test.describe("AC2 — /study : scores recalculés + date + édition juillet 2026", () => {
  test("la page affiche la mention édition + date de collecte", async ({ page }) => {
    await page.goto("/study");
    await expect(page.getByText("Study · July 2026 edition — data collected July 23, 2026")).toBeVisible();
    await expect(
      page.getByText("Current edition: scores recalculated with the corrected methodology, all data collected July 23, 2026")
    ).toBeVisible();
  });

  test("le tableau affiche les 21 marques avec exactement les scores du re-run (source : results.json)", async ({ page }) => {
    await page.goto("/study");
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(21);

    for (const r of results.results) {
      const row = page.locator("table tbody tr", { hasText: displayName(r.brand) });
      await expect(row, r.brand).toHaveCount(1);
      await expect(row.locator("td").nth(1), r.brand).toHaveText(String(r.score));
    }
  });

  test("scénario négatif : aucun score ni claim pré-correctif ne subsiste sur la page", async ({ page }) => {
    await page.goto("/study");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    // Claims chiffrées de l'édition du 19/07 (avant correctif) — aucune ne doit rester.
    for (const legacy of [
      "31 to 88",
      "31–88",
      "Allbirds scored 46",
      "Ridge Wallet 81",
      "scored 81",
      "14 of the 21",
      "14 of 21",
      "median of 65",
    ]) {
      expect(body, `claim pré-correctif encore présente : "${legacy}"`).not.toContain(legacy);
    }

    // L'ancienne médiane 65 n'apparaît que comme divulgation du correctif.
    expect(body).toContain("median score fell from 65 to 38");
  });
});

// ---------------------------------------------------------------------------
// AC3 — Méthodologie : non brandé + 12 questions + live + correctif assumé
// ---------------------------------------------------------------------------

test.describe("AC3 — section méthodologie de /study", () => {
  test("décrit questions non brandées, 12 questions, vérification en direct", async ({ page }) => {
    await page.goto("/study");
    await expect(page.getByRole("heading", { name: "How we ran this" })).toBeVisible();
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    expect(body).toContain("not brand-name searches, but demand-side questions");
    expect(body).toContain("Twelve questions per brand, for all 21 brands");
    expect(body).toContain("live AI assistant at audit time — no simulated prompts, no cached guesses");
    // Les deux garde-fous en code (promptMentionsAuditedBrand + questionEchoesBrandCopy).
    expect(body).toMatch(/must not contain the audited brand.s name or domain/);
    expect(body).toMatch(/must not echo the brand.s own homepage copy/);
  });

  test("assume explicitement le recalcul post-correctif du 21/07 — pas de réécriture silencieuse", async ({ page }) => {
    await page.goto("/study");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    expect(body).toContain("This edition corrects our own methodology — openly.");
    expect(body).toContain("first published on July 19, 2026");
    expect(body).toContain("On July 21–22 we found and fixed a flaw in our engine");
    expect(body).toContain("on July 23 we re-ran all 21 audits from scratch with the corrected engine");
    expect(body).toContain("no pre-fix score remains anywhere on this page");
    expect(body).toContain("publishing the corrected numbers instead of quietly editing the old ones");
  });
});

// ---------------------------------------------------------------------------
// AC4 — canonical + sitemap + llms.txt : toutes les URLs répondent 200 en prod
// ---------------------------------------------------------------------------

test.describe("AC4 — URLs référencées par la page republiée", () => {
  test("le canonical de /study pointe vers www.getpick.ai/study et répond 200 en prod", async ({ page, request }) => {
    await page.goto("/study");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toBe(`${PROD}/study`);
    const res = await request.get(canonical!, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("toutes les URLs du sitemap de la branche répondent 200 (sans redirection) sur www.getpick.ai", async ({ request }) => {
    test.setTimeout(120_000);
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(4);
    expect(urls).toContain(`${PROD}/study`);

    for (const url of urls) {
      expect(url.startsWith(PROD), `URL hors canonique www : ${url}`).toBe(true);
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status(), url).toBe(200);
    }
  });

  test("toutes les URLs du llms.txt de la branche répondent 200 sur www.getpick.ai", async ({ request }) => {
    test.setTimeout(120_000);
    const llms = await request.get("/llms.txt");
    expect(llms.status()).toBe(200);
    const text = await llms.text();
    const urls = [...new Set([...text.matchAll(/https:\/\/www\.getpick\.ai[^\s)\]]*/g)].map((m) => m[0]))];
    expect(urls).toContain(`${PROD}/study`);

    for (const url of urls) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status(), url).toBe(200);
    }
  });

  test("scénario négatif : une URL non référencée répond 404 en prod (les 200 ne sont pas un blanket)", async ({ request }) => {
    const res = await request.get(`${PROD}/page-inexistante-e2e-check`, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// AC5 — veille des marqueurs sponsorisés consignée
// ---------------------------------------------------------------------------

test.describe("AC5 — veille emplacements sponsorisés", () => {
  test("la présence/absence de marqueurs est consignée par marque dans le journal de veille", () => {
    const veillePath = path.join(ARTIFACTS, "sponsored-placements-veille.md");
    expect(existsSync(veillePath)).toBe(true);
    const veille = readFileSync(veillePath, "utf8");

    expect(veille).toContain("collecte du 2026-07-23");
    expect(veille).toMatch(/sponsored|sponsoris/);
    expect(veille).toContain("AUCUN marqueur détecté");
    // Une ligne de verdict par marque auditée.
    for (const r of results.results) {
      expect(veille, r.brand).toContain(`| ${r.brand} |`);
    }
    // La limite de portée du scan est assumée (prérequis « veille armée » consigné).
    expect(veille).toContain("Limite structurelle");
    expect(veille).toContain("veille armée");
  });

  test("results.json consigne sponsoredMarkers pour chacun des 21 audits", () => {
    for (const r of results.results) {
      expect(Array.isArray(r.sponsoredMarkers), r.brand).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AC6 (volet landing) — claims ajustées et journalisées
// ---------------------------------------------------------------------------

test.describe("AC6 — landing ajustée uniquement car des claims changeaient, et journalisé", () => {
  test("la landing affiche les claims recalculées de l'édition juillet 2026", async ({ page }) => {
    await page.goto("/");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body).toContain("(July 2026 edition)");
    expect(body).toContain("19–100");
    expect(body).toContain("29 vs 100");
    expect(body).toContain("18 / 21");
    // Scénario négatif : aucune claim pré-correctif.
    for (const legacy of ["31–88", "46 vs 81", "14 / 21"]) {
      expect(body, `claim pré-correctif : ${legacy}`).not.toContain(legacy);
    }
  });

  test("l'ajustement de la landing est journalisé (oui/non + pourquoi)", () => {
    const journalPath = path.join(ARTIFACTS, "landing-adjustment-journal.md");
    expect(existsSync(journalPath)).toBe(true);
    const journal = readFileSync(journalPath, "utf8");
    expect(journal).toContain("Landing ajustée : OUI");
    expect(journal).toContain("**Pourquoi**");
    expect(journal).toContain("19–100");
  });
});
