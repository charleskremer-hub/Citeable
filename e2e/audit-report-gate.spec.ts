import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { AUDIT_SHARE_TOKEN_PARAM, signAuditShareToken } from "../src/lib/audit-share-token";
import { E2E_AUDIT_SHARE_SECRET } from "../playwright.report-gate.config";

/**
 * E2E — « Le détail du rapport ne s'ouvre que sur un droit ».
 *
 * Ce qui est vérifié est le HTML RENDU par le serveur réel, pour des audits
 * réellement en base. Aucun audit n'est lancé : les lignes sont posées en
 * fixtures, donc zéro appel d'API payante.
 *
 * L'ANCIENNE RÈGLE ÉTAIT `isAnonymousEmail(audit.email) && complete && !failed`.
 * Le scénario AC2 ci-dessous — tier payant, vrai email, aucun abonnement —
 * ÉCHOUE contre cette règle : elle rendait `false`, donc « ouvert ». C'est le
 * test qui met le trou en évidence.
 *
 * CE QUI EST « LE DÉTAIL ». La porte est posée sous le verdict et le score, qui
 * restent visibles (lot P0 : on ne touche pas au contenu au-dessus de la porte).
 * Sous la porte : concurrents + part de voix, questions d'achat testées,
 * contenus à coller, fichiers techniques, chat agent.
 */

// Site audité inexistant, et c'est voulu : la page rend alors « site
// injoignable », état déjà géré, et la suite ne dépend d'aucun bouchon réseau.
const AUDITED_SITE = "http://127.0.0.1:3398";
const DAY_MS = 86_400_000;

// Le secret du serveur, pour signer des jetons que le serveur reconnaîtra.
process.env.AUDIT_SHARE_SECRET = E2E_AUDIT_SHARE_SECRET;

// --- Marqueurs de détail -----------------------------------------------------
// `data-testid` posés sur les sections gardées : leur présence/absence dans le
// HTML est exactement le critère « le détail est présent / absent ».
const DETAIL_COMPETITORS = 'data-testid="report-competitors"';
const DETAIL_PROMPTS = 'data-testid="buyer-intent-prompts"';
const DETAIL_MONITOR_CONTENT = 'data-testid="monitor-content-blocks"';
const DETAIL_TECHNICAL = 'data-testid="technical-files"';
const DETAIL_SHARE_OF_VOICE = 'data-testid="share-of-voice"';
const GATE_CLAIM = 'data-testid="claim-report-gate"';
const GATE_PAYWALL = 'data-testid="paid-report-gate"';

// Le texte d'une question d'achat testée. Il n'apparaît QUE sous la porte pour un
// rapport de tier payant.
const SECRET_PROMPT = "PROMPT-SOUS-LA-PORTE-quelle-huile-d-olive-bio-choisir";

const TEASER_PROMPT = "PROMPT-VITRINE-ou-acheter-de-l-huile-d-olive";

const COMPETITOR_IN_SECRET_PROMPT = "Cachetus";

/**
 * EXPOSITION RÉSIDUELLE, CONNUE ET ASSUMÉE DANS CE LOT.
 *
 * `VisibilityMonitorCard` est rendue AU-DESSUS de la porte (variante `teaser` en
 * gratuit, `dashboard` en Monitor) et y nomme déjà les concurrents cités, la
 * part de voix et le nombre de mentions. Le périmètre P0 est explicite : « ne
 * change pas le contenu au-dessus de la porte », la refonte éditoriale est un
 * lot séparé. On ne teste donc PAS l'absence des noms de concurrents ; on teste
 * l'absence des sections de détail, qui sont ce que la porte protège.
 */

function buyerIntentPrompts() {
  const surface = (brandMentioned: boolean) => [
    { kind: "ai_engine", engine: "Gemini", status: "checked", brandMentioned, unavailableReason: null },
  ];
  return [
    {
      prompt: TEASER_PROMPT,
      available: true,
      brandMentioned: false,
      competitors: ["Rivalis"],
      surfaces: surface(false),
    },
    {
      prompt: SECRET_PROMPT,
      available: true,
      brandMentioned: false,
      competitors: [COMPETITOR_IN_SECRET_PROMPT],
      surfaces: surface(false),
    },
  ];
}

type Fixture = { id: string; email: string; tier: string };

let db: Client;

const fixtures = {
  freeUnclaimed: { id: "11111111-1111-4111-8111-111111111111", email: "", tier: "free" },
  freeClaimed: { id: "22222222-2222-4222-8222-222222222222", email: "claire@exemple-e2e.test", tier: "free" },
  paidNoSub: { id: "33333333-3333-4333-8333-333333333333", email: "prospect@exemple-e2e.test", tier: "monitor_9eur" },
  paidWithSub: { id: "44444444-4444-4444-8444-444444444444", email: "abonne@exemple-e2e.test", tier: "monitor_9eur" },
} satisfies Record<string, Fixture>;

async function seedAudit(fixture: Fixture, brandName: string) {
  await db.query(
    `INSERT INTO audits (id, email, brand_name, website_url, score, engines_checked, competitors_found, raw_results)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
     ON CONFLICT (id) DO UPDATE SET raw_results = EXCLUDED.raw_results`,
    [
      fixture.id,
      fixture.email,
      brandName,
      AUDITED_SITE,
      42,
      JSON.stringify(["gemini"]),
      JSON.stringify(["Rivalis", "Confidor", "Secretus"]),
      JSON.stringify({
        status: "complete",
        locale: "fr",
        category: "huile d'olive",
        auditTier: fixture.tier,
        structuredDataFound: true,
        buyerIntentPrompts: buyerIntentPrompts(),
        answerEngine: { engine: "Gemini", model: "gemini-2.0", realLlmCall: true },
      }),
    ]
  );
}

async function get(path: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${process.env.E2E_GATE_PORT ?? 3313}${path}`, {
    // `gp_internal=1` sur tout appel automatisé : sans lui, l'événement serait
    // classé `human` et fausserait le funnel (ici en local, mais la règle vaut
    // partout et on ne prend pas l'habitude inverse).
    headers: { Cookie: "gp_internal=1" },
  });
  expect(response.status, `GET ${path}`).toBe(200);
  return response.text();
}

test.beforeAll(async () => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url || /neon|amazonaws|supabase|vercel/i.test(url)) {
    throw new Error("E2E_DATABASE_URL doit pointer sur une base LOCALE jetable.");
  }

  // Le serveur crée le schéma des audits au premier rendu de la page. On
  // provoque ce rendu sur un identifiant inexistant (404 attendu) plutôt que de
  // dupliquer le DDL de `ensureAuditSchema()` ici.
  await fetch(`http://127.0.0.1:${process.env.E2E_GATE_PORT ?? 3313}/audit/00000000-0000-4000-8000-000000000000`, {
    headers: { Cookie: "gp_internal=1" },
  });

  db = new Client({ connectionString: url });
  await db.connect();

  // Table des abonnements : même forme que `ensureSubscriptionSchema()`
  // (src/lib/subscriptions.ts), réduite aux colonnes dont dépend
  // `entitlementForEmail`. Si ce DDL diverge, ce test tombe — bruyamment, ce qui
  // est le comportement voulu.
  await db.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT NOT NULL,
      stripe_customer_email TEXT,
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (stripe_subscription_id)
    )
  `);

  // Audit lancé sans email : l'identifiant synthétique est celui que produit
  // `validateAuditInputAllowAnonymous`.
  fixtures.freeUnclaimed.email = `anon-${fixtures.freeUnclaimed.id}@anonymous.citeable.invalid`;

  await seedAudit(fixtures.freeUnclaimed, "Oliveto Gratuit");
  await seedAudit(fixtures.freeClaimed, "Oliveto Reclame");
  await seedAudit(fixtures.paidNoSub, "Oliveto Prospect");
  await seedAudit(fixtures.paidWithSub, "Oliveto Abonne");

  await db.query(
    `INSERT INTO subscriptions (email, stripe_subscription_id, plan, status)
     VALUES ($1, 'sub_e2e_actif', 'monitor_9eur', 'active')
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = EXCLUDED.status`,
    [fixtures.paidWithSub.email]
  );

  // On rend la main à l'application : les fixtures sont posées une fois pour
  // toutes, les tests ne lisent plus que du HTML. Garder une connexion ouverte
  // pendant les requêtes ne servirait à rien et impose une contrainte inutile au
  // Postgres de test.
  await db.end();
});

test("AC1 — audit gratuit non réclamé : le détail est ABSENT, la porte de capture d'email est là", async () => {
  const html = await get(`/audit/${fixtures.freeUnclaimed.id}`);

  expect(html).not.toContain(DETAIL_COMPETITORS);
  expect(html).not.toContain(DETAIL_SHARE_OF_VOICE);
  expect(html).toContain(GATE_CLAIM);

  // Le verdict reste au-dessus de la porte : on gate le détail, pas le diagnostic.
  expect(html).toContain("Oliveto Gratuit");
});

test("AC1bis — audit gratuit réclamé : le détail est PRÉSENT", async () => {
  const html = await get(`/audit/${fixtures.freeClaimed.id}`);

  expect(html).toContain(DETAIL_COMPETITORS);
  expect(html).toContain(DETAIL_SHARE_OF_VOICE);
  expect(html).not.toContain(GATE_CLAIM);
  expect(html).not.toContain(GATE_PAYWALL);
});

test("AC2 — LE TROU : tier payant SANS abonnement actif, le détail est ABSENT", async () => {
  const html = await get(`/audit/${fixtures.paidNoSub.id}`);

  expect(html).not.toContain(DETAIL_COMPETITORS);
  expect(html).not.toContain(DETAIL_PROMPTS);
  expect(html).not.toContain(DETAIL_MONITOR_CONTENT);
  expect(html).not.toContain(DETAIL_TECHNICAL);
  expect(html).not.toContain(DETAIL_SHARE_OF_VOICE);
  expect(html).not.toContain(SECRET_PROMPT);

  expect(html).toContain(GATE_PAYWALL);
});

test("AC3 — tier payant AVEC abonnement actif : le détail est PRÉSENT", async () => {
  const html = await get(`/audit/${fixtures.paidWithSub.id}`);

  expect(html).toContain(DETAIL_COMPETITORS);
  expect(html).toContain(DETAIL_PROMPTS);
  expect(html).toContain(DETAIL_MONITOR_CONTENT);
  expect(html).toContain(DETAIL_TECHNICAL);
  expect(html).toContain(SECRET_PROMPT);
  expect(html).not.toContain(GATE_PAYWALL);
});

test("AC4 — jeton de partage VALIDE : le détail est PRÉSENT, sans paiement", async () => {
  const token = signAuditShareToken(fixtures.paidNoSub.id);
  const html = await get(`/audit/${fixtures.paidNoSub.id}?${AUDIT_SHARE_TOKEN_PARAM}=${encodeURIComponent(token)}`);

  expect(html).toContain(DETAIL_COMPETITORS);
  expect(html).toContain(DETAIL_PROMPTS);
  expect(html).toContain(SECRET_PROMPT);
  expect(html).not.toContain(GATE_PAYWALL);
});

test("AC5 — jeton EXPIRÉ : le détail est ABSENT, sans message d'erreur", async () => {
  // Signé il y a 40 jours pour 30 jours de validité.
  const token = signAuditShareToken(fixtures.paidNoSub.id, 30, Date.now() - 40 * DAY_MS);
  const html = await get(`/audit/${fixtures.paidNoSub.id}?${AUDIT_SHARE_TOKEN_PARAM}=${encodeURIComponent(token)}`);

  expect(html).not.toContain(DETAIL_COMPETITORS);
  expect(html).not.toContain(SECRET_PROMPT);
  expect(html).toContain(GATE_PAYWALL);
  // Repli silencieux : on ne crache pas « jeton invalide » à la figure du prospect.
  expect(html.toLowerCase()).not.toContain("jeton");
});

test("AC6 — jeton FALSIFIÉ d'un caractère : le détail est ABSENT", async () => {
  const token = signAuditShareToken(fixtures.paidNoSub.id);
  const separator = token.indexOf(".");
  const signature = token.slice(separator + 1);
  const tampered = `${token.slice(0, separator)}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  expect(tampered).not.toBe(token);
  expect(tampered.length).toBe(token.length);

  const html = await get(`/audit/${fixtures.paidNoSub.id}?${AUDIT_SHARE_TOKEN_PARAM}=${encodeURIComponent(tampered)}`);

  expect(html).not.toContain(DETAIL_COMPETITORS);
  expect(html).not.toContain(SECRET_PROMPT);
  expect(html).toContain(GATE_PAYWALL);
});

test("AC7 — un jeton signé pour l'audit A n'ouvre PAS l'audit B", async () => {
  const tokenForOther = signAuditShareToken(fixtures.paidWithSub.id);
  const html = await get(
    `/audit/${fixtures.paidNoSub.id}?${AUDIT_SHARE_TOKEN_PARAM}=${encodeURIComponent(tokenForOther)}`
  );

  expect(html).not.toContain(DETAIL_COMPETITORS);
  expect(html).not.toContain(SECRET_PROMPT);
  expect(html).toContain(GATE_PAYWALL);
});
