import { createHash } from "node:crypto";

/**
 * Classement du trafic à l'entrée des événements funnel.
 *
 * Ce module ne TRIE plus, il CLASSE (29/07). Jusque-là, `classifyTraffic` n'était
 * appelé que par le `POST /api/funnel`, qui REFUSAIT d'écrire l'événement rejeté :
 * numérateur filtré, dénominateur (les `audit_started` serveur) non filtré, et
 * aucune donnée récupérable a posteriori puisque la ligne n'existait nulle part.
 * Désormais chaque événement porte sa classe dans `metadata.trafficClass` et le
 * filtrage se fait à la LECTURE (`counts_by_traffic_class`), ce qui rend le
 * numérateur et le dénominateur comparables.
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

/**
 * Classes de trafic écrites dans `metadata.trafficClass`.
 *
 * `unknown` n'est JAMAIS produit par une classification : c'est la valeur de
 * lecture pour tout ce qui n'a pas été classé — les événements écrits avant le
 * 29/07, et les chemins encore non couverts (`followup_*`, `email_captured` de
 * `/api/claim-audit`). Une ligne non classée ne doit jamais être promue `human`,
 * sinon l'agrégat raconte l'inverse de ce qu'on cherche à mesurer.
 */
export const TRAFFIC_CLASSES = ["human", "bot", "internal", "unknown"] as const;

export type TrafficClass = (typeof TRAFFIC_CLASSES)[number];

/**
 * Les seules valeurs qu'une CLASSIFICATION peut produire.
 *
 * `unknown` est une valeur de LECTURE, mais elle est aussi réellement ÉCRITE en
 * base par `trafficClassOrUnknown` sur les chemins où la classe d'origine n'a pas
 * pu être retrouvée (`completeQueuedAudit` sur un audit mis en file avant le
 * 29/07). Un `metadata->>'trafficClass' IS NOT NULL` ne suffit donc pas à
 * reconnaître un événement classé : il faut tester l'appartenance à cette liste,
 * sinon la date de rupture publiée par `traffic_class_since` peut pointer sur un
 * événement explicitement NON classé.
 */
export const CLASSIFIED_TRAFFIC_CLASSES = TRAFFIC_CLASSES.filter(
  (klass): klass is Exclude<TrafficClass, "unknown"> => klass !== "unknown"
);

/**
 * Projection du verdict existant sur les trois classes. Aucune règle nouvelle :
 * `classifyTraffic` reste la seule source de vérité de la détection.
 */
export function trafficClassFromVerdict(verdict: TrafficVerdict): Exclude<TrafficClass, "unknown"> {
  if (verdict.accepted) return "human";
  if (verdict.rejectedBy === "bot") return "bot";
  // `internal_cookie` et `internal_ip` répondent à la même question — « est-ce
  // nous ? » — et se distinguent déjà par `rejectedBy` côté logs.
  return "internal";
}

export function isTrafficClass(value: unknown): value is TrafficClass {
  return typeof value === "string" && (TRAFFIC_CLASSES as readonly string[]).includes(value);
}

/**
 * Lecture défensive : tout ce qui n'est pas exactement une des 4 classes retombe
 * sur `unknown`. Vaut aussi bien pour l'historique (clé absente) que pour une
 * valeur envoyée par un client (`"HUMAN"`, `"human "`, un objet…).
 */
export function trafficClassOrUnknown(value: unknown): TrafficClass {
  return isTrafficClass(value) ? value : "unknown";
}

/**
 * Raccourci pour les routes : classe la requête courante en une ligne.
 *
 * NON PUR (lit `process.env`), volontairement gardé sans I/O ni `await` : une
 * exception ici tomberait dans le `catch` global des routes d'audit et ferait
 * échouer une création d'audit pour un besoin de mesure.
 */
export function requestTrafficClass(headers: { get(name: string): string | null }): {
  trafficClass: Exclude<TrafficClass, "unknown">;
  ipHash: string | null;
} {
  const verdict = classifyTraffic({
    userAgent: headers.get("user-agent"),
    cookieHeader: headers.get("cookie"),
    ip: clientIpFromHeaders(headers),
    internalIps: parseInternalIps(process.env.INTERNAL_IPS),
    ipSalt: process.env.IP_HASH_SALT,
  });

  return { trafficClass: trafficClassFromVerdict(verdict), ipHash: verdict.ipHash };
}
