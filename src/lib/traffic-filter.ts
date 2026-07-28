import { createHash } from "node:crypto";

/**
 * Tri du trafic à l'entrée des événements funnel.
 *
 * Pourquoi ce module existe. Jusqu'au 28/07, `report_viewed` — la north star —
 * était enregistré côté serveur à CHAQUE rendu de `/audit/<id>`, sans dédup, sans
 * `userAgent`, sans `referrer`, sans notion de session. Conséquences constatées
 * dans le journal du run GTM : un rafraîchissement de page comptait comme une vue,
 * nos propres vérifications de liens ont injecté +10 vues en une matinée, et il
 * était impossible de distinguer un prospect d'un crawler puisque le contexte
 * client n'était jamais collecté. Un capteur indiscernable de notre automatisation
 * ne mesure rien.
 *
 * Les trois filtres ci-dessous sont volontairement conservateurs et ordonnés du
 * plus sûr au plus faillible : cookie interne (déclaratif, zéro faux positif),
 * IP interne (liste explicite), puis User-Agent (heuristique). Aucun ne devine :
 * un UA vide est rejeté parce qu'un vrai navigateur en envoie toujours un.
 */

/**
 * Motifs de User-Agent non humains. Volontairement SANS les mots trop courants
 * qui produisent des faux positifs sur de vrais navigateurs : « preview »
 * (Edge/Chrome canary), « monitor » (certaines webviews), « mobile ».
 *
 * Les crawlers des moteurs IA sont dans la liste : on les AUTORISE dans
 * robots.txt (on vend de la visibilité IA, on ne va pas se bloquer nous-mêmes),
 * mais leur passage n'est pas une vue de rapport par un prospect.
 */
const BOT_PATTERNS = [
  "crawl",
  "spider",
  "slurp",
  "headless",
  "phantomjs",
  "puppeteer",
  "playwright",
  "selenium",
  "webdriver",
  "curl/",
  "wget",
  "python-requests",
  "python-urllib",
  "node-fetch",
  "axios/",
  "got/",
  "undici",
  "okhttp",
  "go-http-client",
  "java/",
  "libwww",
  "httpclient",
  "scrapy",
  "bytespider",
  "applebot",
  "amazonbot",
  "facebookexternalhit",
  "embedly",
  "quora link preview",
  "pingdom",
  "uptimerobot",
  "lighthouse",
  "gtmetrix",
  "vercel-screenshot",
  "vercel-favicon",
  "chrome-lighthouse",
  "ahrefs",
  "semrush",
  "dataforseo",
  "petalbot",
  "yandex",
  "baiduspider",
] as const;

/**
 * Le mot « bot » ne peut pas être cherché en sous-chaîne : ça rejetterait les
 * téléphones CUBOT, qui écrivent « CUBOT_X30 » dans leur User-Agent. On exige
 * donc un token complet (`\b…bot\b`), ce qui attrape googlebot / gptbot /
 * claudebot / bingbot / perplexitybot sans toucher aux vrais navigateurs, et on
 * garde une courte liste d'exceptions pour les marques qui finissent en « bot ».
 */
const BOT_TOKEN = /\b[a-z0-9-]*bot\b/;
const BOT_TOKEN_ALLOWLIST = ["cubot"];

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const value = userAgent?.trim().toLowerCase() ?? "";
  // Un navigateur envoie toujours un User-Agent. Vide = script, pas un humain.
  if (!value) return true;
  if (BOT_PATTERNS.some((pattern) => value.includes(pattern))) return true;

  const token = value.match(BOT_TOKEN)?.[0];
  return Boolean(token) && !BOT_TOKEN_ALLOWLIST.includes(token as string);
}

/**
 * IP du client derrière le proxy Vercel. `x-forwarded-for` peut contenir une
 * chaîne « client, proxy1, proxy2 » : la PREMIÈRE entrée est le client.
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || headers.get("x-vercel-forwarded-for")?.trim() || null;
}

/**
 * Liste d'IP internes, lue depuis `INTERNAL_IPS` (séparateur virgule).
 *
 * Deux écritures acceptées :
 *   - IP exacte            « 88.120.4.17 »
 *   - préfixe avec joker   « 88.120.4.* » ou « 2a01:cb00: »
 *
 * Pas de CIDR : le calcul de masque sur IPv6 est une source de bugs silencieux
 * pour un besoin qui se règle avec un préfixe. Si un jour il faut du CIDR, il
 * faudra une lib et des tests, pas une implémentation maison à l'arrache.
 */
export function parseInternalIps(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isInternalIp(ip: string | null | undefined, patterns: string[]): boolean {
  const value = ip?.trim().toLowerCase();
  if (!value) return false;

  return patterns.some((pattern) => {
    if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
    // Un préfixe se termine par un séparateur d'IP : « 88.120. » ou « 2a01:cb00: ».
    if (pattern.endsWith(".") || pattern.endsWith(":")) return value.startsWith(pattern);
    return value === pattern;
  });
}

/**
 * Cookie posé à la main sur nos propres navigateurs et sur les runners d'agents :
 *
 *   document.cookie = "gp_internal=1; path=/; max-age=31536000"
 *
 * C'est le filtre le plus fiable des trois — déclaratif, aucune heuristique — et
 * le seul qui survit à une IP dynamique (box FR, VPN, 4G, CI).
 */
export const INTERNAL_COOKIE = "gp_internal";

export function hasInternalCookie(cookieHeader: string | null | undefined): boolean {
  const value = cookieHeader ?? "";
  if (!value) return false;
  return value
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${INTERNAL_COOKIE}=1` || part.startsWith(`${INTERNAL_COOKIE}=1;`));
}

/**
 * Empreinte d'IP, jamais l'IP.
 *
 * On a besoin de savoir « est-ce le même visiteur » pour débruiter, pas de savoir
 * QUI. Une IP est une donnée personnelle ; un SHA-256 salé ne l'est plus dès lors
 * que le sel n'est pas public. Sans sel configuré on ne hache rien plutôt que de
 * produire un condensat réversible par force brute (l'espace IPv4 se parcourt en
 * quelques minutes).
 */
export function hashIp(ip: string | null | undefined, salt: string | undefined | null): string | null {
  if (!ip || !salt) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}

export type TrafficVerdict = {
  accepted: boolean;
  /** Renseigné uniquement quand `accepted` est faux. */
  rejectedBy: "bot" | "internal_cookie" | "internal_ip" | null;
  ipHash: string | null;
};

export function classifyTraffic(input: {
  userAgent: string | null | undefined;
  cookieHeader: string | null | undefined;
  ip: string | null | undefined;
  internalIps: string[];
  ipSalt?: string | null;
}): TrafficVerdict {
  const ipHash = hashIp(input.ip, input.ipSalt ?? null);

  // Ordre délibéré : du plus sûr au plus heuristique, pour que la raison
  // remontée soit la plus explicative possible quand on débruite à la main.
  if (hasInternalCookie(input.cookieHeader)) {
    return { accepted: false, rejectedBy: "internal_cookie", ipHash };
  }
  if (isInternalIp(input.ip, input.internalIps)) {
    return { accepted: false, rejectedBy: "internal_ip", ipHash };
  }
  if (isBotUserAgent(input.userAgent)) {
    return { accepted: false, rejectedBy: "bot", ipHash };
  }
  return { accepted: true, rejectedBy: null, ipHash };
}
