/**
 * llms.txt à la RACINE du site WordPress connecté (GO Charles 01/10/2026).
 * Faux WordPress en mémoire : chaque cas vérifie QUELS appels partent — c'est
 * ce qui touche le site du client.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { ensureLlmsTxtPlugin, LLMS_TXT_PLUGIN_SLUG } from "@/lib/wp-connect";

const REST = "https://cabinet.fr/wp-json/";
const SITE = "https://cabinet.fr/";
const CREDS = { login: "admin", password: "xxxx" };

function fakeWp(routes: { llms?: { status: number; body: string }; list?: { status: number; body: unknown }; install?: { status: number; body: unknown }; activate?: { status: number } }) {
  const calls: string[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.replace("https://cabinet.fr", "")}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/llms.txt")) return new Response(routes.llms?.body ?? "", { status: routes.llms?.status ?? 404 });
    if (method === "GET" && url.includes("wp/v2/plugins")) return json(routes.list?.status ?? 200, routes.list?.body ?? []);
    if (method === "POST" && url.endsWith("wp/v2/plugins")) return json(routes.install?.status ?? 201, routes.install?.body ?? { plugin: `${LLMS_TXT_PLUGIN_SLUG}/website-llms-txt` });
    if (method === "POST" && url.includes("wp/v2/plugins/")) return json(routes.activate?.status ?? 200, {});
    return json(404, {});
  }) as typeof fetch;
  return { impl, calls };
}

test("site qui sert DÉJÀ un vrai llms.txt : aucun appel d'écriture", async () => {
  const wp = fakeWp({ llms: { status: 200, body: "# Cabinet\n\n## Pages\n- [Accueil](https://cabinet.fr/)" } });
  assert.deepEqual(await ensureLlmsTxtPlugin(REST, SITE, CREDS, wp.impl), { status: "already_present" });
  assert.ok(!wp.calls.some((call) => call.startsWith("POST")), wp.calls.join("\n"));
});

test("soft 404 HTML sur /llms.txt : ce n'est pas un llms.txt, on installe", async () => {
  const wp = fakeWp({ llms: { status: 200, body: "<!DOCTYPE html><html>introuvable</html>" } });
  const result = await ensureLlmsTxtPlugin(REST, SITE, CREDS, wp.impl);
  assert.equal(result.status, "activated");
  const install = wp.calls.find((call) => call === "POST /wp-json/wp/v2/plugins");
  assert.ok(install, "installation depuis l'annuaire officiel attendue");
});

test("extension déjà installée mais désactivée : on l'active, on ne réinstalle pas", async () => {
  const wp = fakeWp({ list: { status: 200, body: [{ plugin: "website-llms-txt/website-llms-txt", status: "inactive" }] } });
  assert.deepEqual(await ensureLlmsTxtPlugin(REST, SITE, CREDS, wp.impl), { status: "activated", plugin: "website-llms-txt/website-llms-txt" });
  assert.ok(wp.calls.includes("POST /wp-json/wp/v2/plugins/website-llms-txt/website-llms-txt"));
  assert.ok(!wp.calls.includes("POST /wp-json/wp/v2/plugins"));
});

test("compte sans droit d'installer (éditeur, multisite) : statut honnête, aucune tentative d'installation", async () => {
  const wp = fakeWp({ list: { status: 403, body: { code: "rest_cannot_view_plugins" } } });
  const result = await ensureLlmsTxtPlugin(REST, SITE, CREDS, wp.impl);
  assert.equal(result.status, "no_permission");
  assert.ok(!wp.calls.includes("POST /wp-json/wp/v2/plugins"));
});

test("installation refusée par l'hébergeur (DISALLOW_FILE_MODS) : échec non bloquant, code conservé", async () => {
  const wp = fakeWp({ install: { status: 500, body: { code: "fs_unavailable" } } });
  const result = await ensureLlmsTxtPlugin(REST, SITE, CREDS, wp.impl);
  assert.deepEqual(result, { status: "failed", detail: "install_http_500_fs_unavailable" });
});

test("publication : extension AVANT la page (la page déclenche la génération), « live » seulement prouvé, client prévenu", () => {
  const store = readFileSync(resolve(import.meta.dirname, "../src/lib/cms-connection-store.ts"), "utf8");
  assert.ok(store.indexOf("ensureLlmsTxtPlugin(") < store.indexOf("upsertWpPage("), "l'extension doit précéder la publication");
  assert.match(store, /llmsStatus === "activated" && \(await siteServesLlmsTxt/);
  assert.match(store, /Website LLMs\.txt/);
  const brancher = readFileSync(resolve(import.meta.dirname, "../src/app/brancher/[domain]/page.tsx"), "utf8");
  assert.match(brancher, /Website LLMs\.txt/, "annoncé AVANT que le cabinet approuve");
});

test("le cron quotidien confirme « live » avant de rafraîchir les pages", () => {
  const store = readFileSync(resolve(import.meta.dirname, "../src/lib/cms-connection-store.ts"), "utf8");
  const refresh = store.slice(store.indexOf("export async function refreshDueConnectedSites"));
  assert.match(refresh.slice(0, 400), /confirmPendingLlmsTxt\(\)/);
  assert.match(store, /llms_txt_status = 'live'/);
  assert.match(store, /wp-cron\.php\?doing_wp_cron/);
});
