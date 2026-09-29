/**
 * LE SOUS-DOMAINE « ai. » DU CABINET — la page que l'IA lit, sur SON domaine.
 *
 * Pourquoi (Charles, 29/09/2026) : une page hébergée sur getpick.ai est une page
 * tierce, sans autorité, que rien ne garantit qu'un moteur lise. Le cabinet,
 * lui, est l'autorité sur ses propres faits. `ai.cabinet.fr` porte ces faits,
 * sous une forme que les moteurs lisent facilement (page sobre, JSON-LD,
 * `llms.txt`), sur le domaine du cabinet.
 *
 * LE GESTE CLIENT, RÉDUIT AU MINIMUM : un seul enregistrement DNS (CNAME `ai` →
 * `cname.vercel-dns.com`). Tout le reste est fait par GetPick : ajout du domaine
 * au projet, certificat, contenu, `llms.txt`, sitemap, notification IndexNow.
 *
 * RÈGLES DE CONTENU — la leçon de /reponses : aucun « pourquoi recommander X »,
 * aucun « objectif de faire basculer », aucune liste de concurrents, aucune
 * promotion de GetPick. Des FAITS, dans les mots du cabinet. La même page est
 * servie aux humains et aux robots (pas de cloaking).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const AI_SUBDOMAIN = "ai";
export const AI_CNAME_TARGET = "cname.vercel-dns.com";

export function normalizeRootDomain(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(raw)) return null;
  if (raw.startsWith(`${AI_SUBDOMAIN}.`)) return raw.slice(AI_SUBDOMAIN.length + 1);
  return raw;
}

/** `ai.cabinet.fr` → `cabinet.fr` ; tout autre hôte → null. */
export function rootDomainFromAiHost(host: string): string | null {
  const clean = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!clean.startsWith(`${AI_SUBDOMAIN}.`)) return null;
  return normalizeRootDomain(clean.slice(AI_SUBDOMAIN.length + 1));
}

// --- Lien d'onboarding signé (le client n'a pas de compte) -------------------

function secret(env: Record<string, string | undefined> = process.env) {
  return env.AUDIT_SHARE_SECRET ?? env.UNSUBSCRIBE_SECRET ?? "getpick-ai-site-local";
}

export function aiSiteToken(domain: string, env?: Record<string, string | undefined>): string {
  return createHmac("sha256", secret(env)).update(`ai-site:${domain}`).digest("base64url").slice(0, 24);
}

export function verifyAiSiteToken(domain: string, token: string, env?: Record<string, string | undefined>): boolean {
  const expected = Buffer.from(aiSiteToken(domain, env));
  const given = Buffer.from(token ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// --- Fournisseur DNS : le guidage pas à pas dépend de lui --------------------

export type DnsProvider = { key: string; name: string; zoneUrl: string | null };

const PROVIDERS: Array<{ match: RegExp } & DnsProvider> = [
  { match: /ovh\.(net|com)/, key: "ovh", name: "OVHcloud", zoneUrl: "https://www.ovh.com/manager/#/web/domain" },
  { match: /ui-dns|1and1|ionos/, key: "ionos", name: "IONOS", zoneUrl: "https://my.ionos.fr/domains" },
  { match: /gandi\.net/, key: "gandi", name: "Gandi", zoneUrl: "https://admin.gandi.net/domain/" },
  { match: /o2switch/, key: "o2switch", name: "o2switch", zoneUrl: null },
  { match: /cloudflare\.com/, key: "cloudflare", name: "Cloudflare", zoneUrl: "https://dash.cloudflare.com/" },
  { match: /domaincontrol\.com/, key: "godaddy", name: "GoDaddy", zoneUrl: "https://dcc.godaddy.com/control/portfolio" },
  { match: /hostinger|dns-parking/, key: "hostinger", name: "Hostinger", zoneUrl: "https://hpanel.hostinger.com/domains" },
  { match: /wixdns/, key: "wix", name: "Wix", zoneUrl: "https://manage.wix.com/account/domains" },
  { match: /squarespacedns|googledomains/, key: "squarespace", name: "Squarespace", zoneUrl: "https://account.squarespace.com/domains" },
  { match: /lwsdns|lws\.fr/, key: "lws", name: "LWS", zoneUrl: "https://panel.lws.fr/" },
];

export function dnsProviderFromNameservers(nameservers: string[]): DnsProvider {
  const joined = nameservers.join(" ").toLowerCase();
  const hit = PROVIDERS.find((provider) => provider.match.test(joined));
  return hit ? { key: hit.key, name: hit.name, zoneUrl: hit.zoneUrl } : { key: "other", name: "ton hébergeur", zoneUrl: null };
}

/** Requête DNS-over-HTTPS (Google). Rend les valeurs brutes, ou [] si échec. */
export async function dohLookup(name: string, type: "NS" | "CNAME", fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const response = await fetchImpl(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { Answer?: Array<{ data?: string }> };
    return (body.Answer ?? []).map((answer) => (answer.data ?? "").replace(/\.$/, "").toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

// --- Contenu -----------------------------------------------------------------

export type AiSiteAnswer = { question: string; answer: string };

export type AiSiteFacts = {
  /** Réponses écrites par l'agent (stockées) — prioritaires sur le gabarit. */
  answers?: AiSiteAnswer[];
  services?: string[];
  brandName: string;
  domain: string;
  tradeLabel: string; // « cabinet d'expertise comptable »
  city: string | null;
  description: string; // les propres mots du cabinet (meta description / JSON-LD)
  questions: string[]; // les questions d'achat du diagnostic
};

export type AiSiteContent = {
  title: string;
  summary: string;
  facts: Array<{ label: string; value: string }>;
  faq: Array<{ question: string; answer: string }>;
  jsonLd: Record<string, unknown>;
  llmsTxt: string;
};

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function sentence(text: string) {
  const value = clean(text);
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

export function aiSiteContent(facts: AiSiteFacts): AiSiteContent {
  const where = facts.city ? ` à ${facts.city}` : "";
  const site = `https://${facts.domain}`;
  const summary = clean(
    `${facts.brandName} est un ${facts.tradeLabel}${where}. ${sentence(facts.description)} Site officiel : ${site}.`
  );
  const faq = facts.answers?.length
    ? facts.answers.slice(0, 10).map((item) => ({ question: clean(item.question), answer: clean(item.answer) }))
    : facts.questions.slice(0, 8).map((question) => ({
        question: clean(question),
        answer: clean(
          `${facts.brandName} est un ${facts.tradeLabel}${where}${facts.description ? ` : ${sentence(facts.description).replace(/^./, (c) => c.toLowerCase())}` : "."} Pour un premier contact : ${site}.`
        ),
      }));
  const factsList = [
    { label: "Nom", value: facts.brandName },
    { label: "Activité", value: facts.tradeLabel },
    ...(facts.city ? [{ label: "Ville", value: facts.city }] : []),
    ...(facts.services?.length ? [{ label: "Services", value: facts.services.slice(0, 8).join(", ") }] : []),
    { label: "Site officiel", value: site },
  ];
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AccountingService",
        name: facts.brandName,
        url: site,
        description: clean(facts.description) || undefined,
        ...(facts.city ? { address: { "@type": "PostalAddress", addressLocality: facts.city, addressCountry: "FR" }, areaServed: facts.city } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
      },
    ],
  };
  const llmsTxt = [
    `# ${facts.brandName}`,
    "",
    `> ${summary}`,
    "",
    "## Faits",
    ...factsList.map((fact) => `- ${fact.label} : ${fact.value}`),
    "",
    "## Questions fréquentes",
    ...faq.map((item) => `- ${item.question}\n  ${item.answer}`),
    "",
    "## Liens",
    `- [Site officiel](${site})`,
    `- [Fiche détaillée](https://${AI_SUBDOMAIN}.${facts.domain}/)`,
    "",
  ].join("\n");
  return { title: `${facts.brandName} — ${facts.tradeLabel}${where}`, summary, facts: factsList, faq, jsonLd, llmsTxt };
}

// --- Vercel : rattacher `ai.<domaine>` au projet (certificat automatique) -----

/** Ajoute le domaine au projet Vercel. Sans jeton configuré : rien, et on le dit. */
export async function addDomainToVercel(
  host: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; detail: string }> {
  const token = env.VERCEL_API_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID_GETPICK?.trim() ?? env.VERCEL_PROJECT_ID?.trim();
  const teamId = env.VERCEL_TEAM_ID?.trim();
  if (!token || !projectId) return { ok: false, detail: "VERCEL_API_TOKEN / VERCEL_PROJECT_ID not configured" };
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: host }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    if (response.ok || body.error?.code === "domain_already_in_use_by_project" || body.error?.code === "domain_already_exists") {
      return { ok: true, detail: body.error?.code ?? "added" };
    }
    return { ok: false, detail: body.error?.message ?? `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Notifie Bing (IndexNow) — Bing alimente la recherche web de ChatGPT. */
export async function pingIndexNow(host: string, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch) {
  const key = env.INDEXNOW_KEY?.trim();
  if (!key) return { ok: false, detail: "INDEXNOW_KEY not configured" };
  try {
    const response = await fetchImpl("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/indexnow-key.txt`,
        urlList: [`https://${host}/`, `https://${host}/llms.txt`],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: response.status === 200 || response.status === 202, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Le CNAME pointe-t-il chez nous ? (lecture DNS publique) */
export function cnamePointsToUs(values: string[]): boolean {
  return values.some((value) => value.replace(/\.$/, "") === AI_CNAME_TARGET || value.endsWith(".vercel-dns.com"));
}

/** Les étapes exactes chez le fournisseur détecté — le client ne cherche rien. */
export function providerSteps(provider: DnsProvider, domain: string): string[] {
  const record = `Type CNAME · Nom « ${AI_SUBDOMAIN} » · Cible « ${AI_CNAME_TARGET}. »`;
  switch (provider.key) {
    case "ovh":
      return [`Espace client OVHcloud → Noms de domaine → ${domain}`, "Onglet « Zone DNS » → « Ajouter une entrée » → « CNAME »", `Sous-domaine : ${AI_SUBDOMAIN} · Cible : ${AI_CNAME_TARGET}.  (avec le point final) → Suivant → Valider`];
    case "ionos":
      return [`Espace IONOS → Domaines & SSL → ${domain} → DNS`, "« Ajouter un enregistrement » → CNAME", `Nom d'hôte : ${AI_SUBDOMAIN} · Pointe vers : ${AI_CNAME_TARGET} → Enregistrer`];
    case "gandi":
      return [`Gandi → Nom de domaine → ${domain} → Enregistrements DNS`, "« Ajouter un enregistrement » → CNAME", `Nom : ${AI_SUBDOMAIN} · Nom d'hôte : ${AI_CNAME_TARGET}. → Créer`];
    case "cloudflare":
      return [`Cloudflare → ${domain} → DNS → Records → Add record`, `Type CNAME · Name ${AI_SUBDOMAIN} · Target ${AI_CNAME_TARGET}`, "Proxy status : « DNS only » (nuage GRIS) → Save"];
    default:
      return [`Ouvre la gestion DNS de ${domain} chez ${provider.name}`, "Ajoute un enregistrement :", record];
  }
}

export function webmasterMessage(domain: string): string {
  return [
    "Bonjour,",
    "",
    `Peux-tu ajouter cet enregistrement DNS sur ${domain} ?`,
    "",
    `Type : CNAME`,
    `Nom : ${AI_SUBDOMAIN}`,
    `Cible : ${AI_CNAME_TARGET}.`,
    "",
    `Il crée ${AI_SUBDOMAIN}.${domain}, une fiche d'informations sur le cabinet destinée aux assistants IA (ChatGPT, Gemini). Il ne touche ni au site, ni aux emails.`,
    "",
    "Merci !",
  ].join("\n");
}


// --- Agent de contenu ----------------------------------------------------------

/**
 * Consigne de l'agent qui écrit les réponses de la fiche `ai.`. Règles dures :
 * uniquement les faits du site du cabinet (aucune invention : ni chiffre, ni
 * client, ni tarif) ; pas de superlatif ni de comparaison avec des confrères
 * (déontologie de la profession) ; si un fait manque, dire comment prendre
 * contact plutôt que l'inventer.
 */
export function aiSiteAnswersPrompt(args: { brandName: string; tradeLabel: string; city: string | null; domain: string; questions: string[]; siteText: string }) {
  return [
    `Tu rédiges la fiche d'information officielle de « ${args.brandName} », ${args.tradeLabel}${args.city ? ` à ${args.city}` : ""} (site : https://${args.domain}).`,
    "Cette fiche est lue par des assistants IA (ChatGPT, Gemini) quand un client pose une question.",
    "Règles STRICTES :",
    "- Utilise UNIQUEMENT les faits présents dans le TEXTE DU SITE ci-dessous. N'invente aucun chiffre, client, tarif, délai, label ni spécialité.",
    "- Pas de superlatif (« meilleur », « leader »), pas de comparaison avec d'autres cabinets.",
    "- Si le site ne permet pas de répondre précisément, dis ce que le cabinet fait d'après le site et invite à le contacter via son site.",
    "- Chaque réponse : 60 à 140 mots, en français, factuelle, qui commence par répondre directement à la question en nommant le cabinet et la ville.",
    'Rends UNIQUEMENT ce JSON : {"summary":"2 phrases","services":["…"],"answers":[{"question":"…","answer":"…"}]}',
    "Questions (une réponse par question, dans cet ordre) :",
    ...args.questions.map((question, index) => `${index + 1}. ${question}`),
    "TEXTE DU SITE :",
    args.siteText.slice(0, 6000),
  ].join("\n");
}

export function parseAiSiteAnswers(raw: string | null): { summary?: string; services: string[]; answers: AiSiteAnswer[] } | null {
  if (!raw) return null;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const data = JSON.parse(raw.slice(start, end + 1)) as { summary?: unknown; services?: unknown; answers?: unknown };
    const answers = Array.isArray(data.answers)
      ? data.answers
          .map((item) => item as { question?: unknown; answer?: unknown })
          .filter((item) => typeof item.question === "string" && typeof item.answer === "string" && item.answer.trim().length > 40)
          .map((item) => ({ question: String(item.question).trim(), answer: String(item.answer).trim() }))
      : [];
    const services = Array.isArray(data.services) ? data.services.filter((x): x is string => typeof x === "string" && x.trim().length > 1).slice(0, 10) : [];
    if (!answers.length) return null;
    // Garde-fou déontologie : aucune réponse avec superlatif ou comparaison.
    const clean = answers.filter((item) => !/\b(le meilleur|la meilleure|n°\s?1|numéro un|leader|mieux que)\b/i.test(item.answer));
    return clean.length ? { summary: typeof data.summary === "string" ? data.summary.trim() : undefined, services, answers: clean } : null;
  } catch {
    return null;
  }
}

/** Mail de bienvenue (offre agent GEO, 30/09) : le seul geste = transférer au webmaster. */
export function buildGeoWelcomeEmail(args: { domain: string | null; onboardingUrl: string | null }) {
  const subject = "Bienvenue chez GetPick — un seul email à transférer";
  const text = args.domain && args.onboardingUrl
    ? [
        "Bonjour,",
        "",
        `Merci pour ta confiance. Notre agent écrit déjà les réponses aux questions de tes clients ; elles seront publiées sur ai.${args.domain}, ta fiche pour les assistants IA.`,
        "",
        "Ton seul geste : transférer le message ci-dessous à ton webmaster (ou à la personne qui gère ton site). Rien à faire toi-même.",
        "",
        "----",
        webmasterMessage(args.domain),
        "----",
        "",
        `Le suivi en direct et le pas-à-pas par hébergeur : ${args.onboardingUrl}`,
        "",
        "Ensuite, chaque mois, on repose les questions de tes clients à l'IA et tu vois quelles pages elle a lues et qui elle cite.",
        "",
        "Charles — GetPick",
      ].join("\n")
    : [
        "Bonjour,",
        "",
        "Merci pour ta confiance. Réponds simplement à cet email avec l'adresse de ton site : on prépare ta fiche pour les assistants IA et on t'envoie le message à transférer à ton webmaster.",
        "",
        "Charles — GetPick",
      ].join("\n");
  return { subject, text };
}
