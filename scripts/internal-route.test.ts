import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { INTERNAL_COOKIE, hasInternalCookie } from "@/lib/traffic-filter";
import { GET, dynamic } from "@/app/api/internal/route";

/**
 * `GET /api/internal` — la route qui marque un navigateur comme interne.
 *
 * Aucun `mock.module` ici, contrairement aux autres tests de route : la route
 * n'importe que `next/server` et `@/lib/traffic-filter`, lequel ne dépend que de
 * `node:crypto`. Aucun chemin n'atteint `@/lib/db`, donc l'import statique
 * n'ouvre aucune connexion Postgres.
 *
 * Le contexte, pour qui lira ces tests dans six mois : le 14/08/2026,
 * `report_viewed.human` est passé de 0 à 1 alors qu'aucun email de prospection
 * n'était parti depuis 22 jours. La classification n'étant pas rétroactive, une
 * vue interne mal classée ne se répare jamais. Ces assertions gardent le seul
 * geste qui empêche que ça recommence.
 */

const BASE = "https://getpick.test/api/internal";

/** Découpe un `Set-Cookie` en paire `nom=valeur` + attributs normalisés. */
function parseSetCookie(header: string | null) {
  assert.ok(header, "la réponse doit porter un Set-Cookie");
  const [pair, ...rest] = header.split(";").map((part) => part.trim());
  const attributes = new Map<string, string>();
  for (const attribute of rest) {
    const index = attribute.indexOf("=");
    if (index === -1) attributes.set(attribute.toLowerCase(), "");
    else attributes.set(attribute.slice(0, index).trim().toLowerCase(), attribute.slice(index + 1).trim());
  }
  return { pair, attributes, raw: header };
}

async function call(url: string) {
  const response = await GET(new NextRequest(url));
  return { response, cookie: parseSetCookie(response.headers.get("set-cookie")) };
}

test("GET /api/internal pose gp_internal=1 pour un an, sur tout le site", async () => {
  const { response, cookie } = await call(BASE);

  assert.equal(response.status, 200);
  // Le nom vient de la constante partagée, jamais d'une chaîne réécrite à la
  // main : c'est cette duplication-là qui finit par diverger du classificateur.
  assert.equal(cookie.pair, `${INTERNAL_COOKIE}=1`);
  assert.equal(cookie.attributes.get("path"), "/");
  assert.equal(cookie.attributes.get("max-age"), "31536000");
  assert.equal(cookie.attributes.get("samesite"), "Lax");
});

test("le cookie n'est PAS HttpOnly — PostHogInit.tsx le lit en JavaScript", async () => {
  // C'est le piège principal de ce chantier, et il est silencieux. `HttpOnly`
  // rendrait le cookie invisible à `document.cookie`, donc à `isInternalBrowser()`
  // dans `src/app/PostHogInit.tsx`. Le filtrage serveur continuerait de marcher —
  // rien n'échouerait, aucun log — mais PostHog se rechargerait sur nos propres
  // navigateurs : les deux mesures divergeraient sans que personne le voie.
  const { cookie } = await call(BASE);
  assert.equal(cookie.attributes.has("httponly"), false, "gp_internal doit rester lisible en JS");
});

test("?off=1 retire le cookie avec le MÊME Path que la pose", async () => {
  const { response, cookie } = await call(`${BASE}?off=1`);

  assert.equal(response.status, 200);
  assert.equal(cookie.pair, `${INTERNAL_COOKIE}=`);
  assert.equal(cookie.attributes.get("max-age"), "0");
  // Piège classique : un `Set-Cookie` de suppression portant un `Path` différent
  // de celui de la pose ne supprime RIEN — le navigateur garde les deux cookies
  // et continue d'envoyer l'ancien. On compare donc au Path réellement posé.
  const posed = await call(BASE);
  assert.equal(cookie.attributes.get("path"), posed.cookie.attributes.get("path"));
  assert.equal(cookie.attributes.get("path"), "/");
});

test("le Set-Cookie produit est reconnu par hasInternalCookie() du classificateur", async () => {
  // LE test qui compte : il prouve que la route parle la même langue que
  // `classifyTraffic`. On reconstruit l'en-tête `Cookie` exactement comme le
  // ferait le navigateur — la paire nom=valeur, sans les attributs — et on la
  // donne au classificateur. Si l'un des deux change de forme, ça casse ici et
  // pas trois semaines plus tard dans un compteur qu'on croit propre.
  const { cookie } = await call(BASE);
  assert.equal(hasInternalCookie(cookie.pair), true);
  // Et dans un en-tête réaliste, mêlé à d'autres cookies.
  assert.equal(hasInternalCookie(`ph_session=abc; ${cookie.pair}; locale=fr`), true);
});

test("le Set-Cookie de ?off=1 n'est PAS reconnu comme interne", async () => {
  // Sans ça, Charles ne pourrait plus jamais voir le produit comme le voit un
  // prospect : le retrait doit vraiment reclasser le navigateur en `human`.
  const { cookie } = await call(`${BASE}?off=1`);
  assert.equal(hasInternalCookie(cookie.pair), false);
  assert.equal(hasInternalCookie(`ph_session=abc; ${cookie.pair}`), false);
});

test("la réponse n'est ni mise en cache ni indexée, et reste lisible par un humain", async () => {
  for (const url of [BASE, `${BASE}?off=1`]) {
    const { response } = await call(url);
    // Une réponse qui pose un cookie ne doit jamais sortir d'un cache partagé.
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);

    const body = await response.text();
    assert.match(body, /^<!doctype html>/i);
    // Pas de JS, pas de CSS externe : la page est ouverte à la main, souvent sur
    // un téléphone, et ne doit dépendre de rien pour dire son état.
    assert.equal(/<script/i.test(body), false);
    assert.equal(/<link[^>]+stylesheet/i.test(body), false);
  }

  const on = await call(BASE);
  const onBody = await on.response.text();
  assert.match(onBody, /Ce navigateur est marqué INTERNE/);
  // La page doit rappeler l'URL inverse, sinon le retrait est introuvable.
  assert.match(onBody, /\/api\/internal\?off=1/);

  const off = await call(`${BASE}?off=1`);
  const offBody = await off.response.text();
  assert.match(offBody, /Ce navigateur n'est plus marqué interne/);
  assert.match(offBody, /href="\/api\/internal"/);
});

test("Secure n'est posé qu'en production — sinon le cookie ne se poserait pas sur http://localhost", async () => {
  // Un cookie `Secure` sur `http://localhost` est ignoré SANS message : la page
  // dirait « marqué INTERNE » et rien ne serait posé. Exactement la panne
  // silencieuse que cette route existe pour supprimer.
  const initial = process.env.NODE_ENV;
  try {
    Reflect.set(process.env, "NODE_ENV", "development");
    assert.equal((await call(BASE)).cookie.attributes.has("secure"), false);
    assert.equal((await call(`${BASE}?off=1`)).cookie.attributes.has("secure"), false);

    Reflect.set(process.env, "NODE_ENV", "production");
    assert.equal((await call(BASE)).cookie.attributes.has("secure"), true);
    assert.equal((await call(`${BASE}?off=1`)).cookie.attributes.has("secure"), true);
  } finally {
    Reflect.set(process.env, "NODE_ENV", initial);
  }
});

test("la route est force-dynamic : jamais pré-rendue, jamais servie depuis un cache de build", async () => {
  assert.equal(dynamic, "force-dynamic");
});
