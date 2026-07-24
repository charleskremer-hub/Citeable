#!/usr/bin/env node
// Vérification systématique EN LIGNE du site déployé (production par défaut).
//
// Ne se contente pas d'un « HTTP 200 » : pour chaque route, contrôle le statut,
// la fraîcheur du cache Vercel, la présence de contenu attendu, le canonical,
// la validité des blocs JSON-LD, et surtout la DÉCOUVRABILITÉ (lien depuis la
// home + présence dans sitemap.xml et llms.txt) — le trou qui a rendu /vs
// invisible malgré un déploiement réussi.
//
// Usage :
//   node scripts/verify-live.mjs                 # https://www.getpick.ai
//   BASE_URL=https://preview.example node scripts/verify-live.mjs
//   node scripts/verify-live.mjs --base https://www.getpick.ai
//
// Sort en code 1 si au moins un contrôle bloquant échoue (utilisable en CI /
// en étape post-déploiement du cycle squad). Les contrôles de découvrabilité
// non tenus sont des AVERTISSEMENTS (n'empêchent pas le déploiement d'être
// « live », mais signalent qu'un humain ne trouvera pas la page).

const argBase = (() => {
  const i = process.argv.indexOf("--base");
  return i !== -1 ? process.argv[i + 1] : undefined;
})();
const BASE = (argBase || process.env.BASE_URL || "https://www.getpick.ai").replace(/\/$/, "");

// ─── Config : ce qu'on vérifie. Ajouter une route = une entrée ici. ───────────
const ROUTES = [
  {
    path: "/vs",
    mustContain: ["<table", "Otterly", "Peec", "Rankscale", "Profound"],
    canonical: `${BASE}/vs`,
    jsonLdMustInclude: ["FAQPage", "ItemList"],
    // Découvrabilité : la page doit être atteignable par un humain ET une machine.
    linkedFromHome: true,
    inSitemap: `${BASE}/vs`,
    inLlmsTxt: "/vs",
  },
  {
    path: "/fr/vs",
    mustContain: ["<table", "Otterly", "Peec", "Rankscale", "Profound"],
    canonical: `${BASE}/fr/vs`,
    jsonLdMustInclude: ["FAQPage", "ItemList"],
    linkedFromHome: false, // la home EN ne lie pas forcément la route FR
    inSitemap: `${BASE}/fr/vs`,
    inLlmsTxt: "/fr/vs",
  },
];

// ─── Utilitaires ──────────────────────────────────────────────────────────────
const results = [];
const rec = (route, name, ok, detail, blocking = true) =>
  results.push({ route, name, ok, detail, blocking });

async function fetchText(url) {
  const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "getpick-verify-live" } });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks;
}

function extractCanonical(html) {
  const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i);
  if (!m) return null;
  const href = m[0].match(/href=["']([^"']+)["']/i);
  return href ? href[1] : null;
}

// ─── Contexte partagé : home, sitemap, llms.txt (récupérés une fois) ──────────
let homeHtml = "", sitemap = "", llmsTxt = "";
async function loadContext() {
  for (const [label, url, set] of [
    ["home", `${BASE}/`, (v) => (homeHtml = v)],
    ["sitemap.xml", `${BASE}/sitemap.xml`, (v) => (sitemap = v)],
    ["llms.txt", `${BASE}/llms.txt`, (v) => (llmsTxt = v)],
  ]) {
    try {
      const { status, body } = await fetchText(url);
      set(body);
      rec("(contexte)", `${label} accessible`, status === 200, `HTTP ${status}`, false);
    } catch (e) {
      rec("(contexte)", `${label} accessible`, false, e.message, false);
    }
  }
}

// ─── Contrôles par route ──────────────────────────────────────────────────────
async function checkRoute(r) {
  const url = `${BASE}${r.path}`;
  let res;
  try {
    res = await fetchText(url);
  } catch (e) {
    rec(r.path, "réponse", false, e.message);
    return;
  }
  const { status, headers, body } = res;

  rec(r.path, "HTTP 200", status === 200, `HTTP ${status}`);

  const vercelCache = headers.get("x-vercel-cache");
  const matched = headers.get("x-matched-path");
  rec(r.path, "servi par Vercel", vercelCache !== null, `x-vercel-cache=${vercelCache ?? "absent"} x-matched-path=${matched ?? "?"}`, false);

  for (const needle of r.mustContain) {
    rec(r.path, `contient « ${needle} »`, body.includes(needle), body.includes(needle) ? "ok" : "ABSENT");
  }

  if (r.canonical) {
    const canon = extractCanonical(body);
    rec(r.path, "canonical correct", canon === r.canonical, `attendu ${r.canonical} — trouvé ${canon ?? "aucun"}`);
  }

  const blocks = extractJsonLd(body);
  let parsedOk = blocks.length > 0;
  const merged = [];
  for (const b of blocks) {
    try {
      merged.push(JSON.stringify(JSON.parse(b)));
    } catch {
      parsedOk = false;
    }
  }
  rec(r.path, "JSON-LD parse", parsedOk, `${blocks.length} bloc(s), parse ${parsedOk ? "ok" : "ÉCHEC"}`);
  const allLd = merged.join(" ");
  for (const type of r.jsonLdMustInclude || []) {
    rec(r.path, `JSON-LD contient ${type}`, allLd.includes(type), allLd.includes(type) ? "ok" : "ABSENT");
  }

  // Découvrabilité — AVERTISSEMENTS (non bloquants) : une page live mais
  // introuvable par un humain est un déploiement « réussi » qui ne sert à rien.
  if (r.linkedFromHome) {
    const linked = new RegExp(`href=["'][^"']*${r.path.replace(/[/]/g, "\\/")}(["'/?#])`).test(homeHtml);
    rec(r.path, "liée depuis la home", linked, linked ? "ok" : `AUCUN lien vers ${r.path} sur ${BASE}/`, false);
  }
  if (r.inSitemap) {
    rec(r.path, "dans sitemap.xml", sitemap.includes(r.inSitemap), sitemap.includes(r.inSitemap) ? "ok" : "ABSENT", false);
  }
  if (r.inLlmsTxt) {
    rec(r.path, "dans llms.txt", llmsTxt.includes(r.inLlmsTxt), llmsTxt.includes(r.inLlmsTxt) ? "ok" : "ABSENT", false);
  }
}

// ─── Exécution ────────────────────────────────────────────────────────────────
console.log(`\n🔎 Vérification en ligne — ${BASE}\n`);
await loadContext();
for (const r of ROUTES) await checkRoute(r);

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
let blockingFails = 0, warnFails = 0;
for (const { route, name, ok, detail, blocking } of results) {
  const icon = ok ? "✅" : blocking ? "❌" : "⚠️ ";
  if (!ok) blocking ? blockingFails++ : warnFails++;
  console.log(`${icon} ${pad(route, 10)} ${pad(name, 26)} ${detail}`);
}

console.log("");
if (blockingFails === 0 && warnFails === 0) {
  console.log("✅ VERDICT : tout est vert en ligne.\n");
} else {
  console.log(`${blockingFails > 0 ? "🔴" : "🟠"} VERDICT : ${blockingFails} échec(s) bloquant(s), ${warnFails} avertissement(s) découvrabilité.\n`);
}
process.exit(blockingFails > 0 ? 1 : 0);
