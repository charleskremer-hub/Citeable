import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTraffic,
  clientIpFromHeaders,
  hasInternalCookie,
  hashIp,
  isBotUserAgent,
  isInternalIp,
  parseInternalIps,
} from "@/lib/traffic-filter";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

test("un vrai navigateur n'est jamais pris pour un bot", () => {
  assert.equal(isBotUserAgent(CHROME_MAC), false);
  assert.equal(isBotUserAgent(SAFARI_IPHONE), false);
  assert.equal(
    isBotUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0"
    ),
    false
  );
  assert.equal(
    isBotUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"),
    false
  );
});

test("le mot « bot » n'est cherché qu'en token entier — CUBOT reste un téléphone", () => {
  assert.equal(
    isBotUserAgent("Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36"),
    false
  );
  assert.equal(isBotUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; ClaudeBot/1.0)"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; PerplexityBot/1.0)"), true);
});

test("les clients scriptés et les sondes sont écartés", () => {
  for (const userAgent of [
    "curl/8.4.0",
    "Wget/1.21.4",
    "python-requests/2.32.3",
    "node-fetch/1.0",
    "Go-http-client/2.0",
    "okhttp/4.12.0",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/139.0.0.0 Safari/537.36",
    "Mozilla/5.0 Chrome-Lighthouse",
    "Scrapy/2.11 (+https://scrapy.org)",
  ]) {
    assert.equal(isBotUserAgent(userAgent), true, userAgent);
  }
});

test("un User-Agent absent compte comme non humain", () => {
  // C'est exactement l'état des report_viewed d'avant le correctif : userAgent
  // None sur 100 % des lignes, donc impossible à trier.
  assert.equal(isBotUserAgent(null), true);
  assert.equal(isBotUserAgent(undefined), true);
  assert.equal(isBotUserAgent("   "), true);
});

test("l'IP client est la première entrée de x-forwarded-for", () => {
  const headers = new Headers({ "x-forwarded-for": "88.120.4.17, 10.0.0.1, 172.16.0.3" });
  assert.equal(clientIpFromHeaders(headers), "88.120.4.17");
});

test("x-real-ip sert de repli, et l'absence des deux donne null", () => {
  assert.equal(clientIpFromHeaders(new Headers({ "x-real-ip": "88.120.4.17" })), "88.120.4.17");
  assert.equal(clientIpFromHeaders(new Headers()), null);
});

test("les IP internes se déclarent en exact, en joker ou en préfixe", () => {
  const patterns = parseInternalIps("88.120.4.17, 92.184.100.*, 2a01:cb00:");
  assert.deepEqual(patterns, ["88.120.4.17", "92.184.100.*", "2a01:cb00:"]);

  assert.equal(isInternalIp("88.120.4.17", patterns), true);
  assert.equal(isInternalIp("92.184.100.230", patterns), true);
  assert.equal(isInternalIp("2a01:cb00:dead:beef::1", patterns), true);

  assert.equal(isInternalIp("88.120.4.18", patterns), false);
  assert.equal(isInternalIp("92.184.101.230", patterns), false);
  assert.equal(isInternalIp(null, patterns), false);
  assert.equal(isInternalIp("88.120.4.17", []), false);
});

test("le cookie interne exige la valeur exacte", () => {
  assert.equal(hasInternalCookie("gp_internal=1"), true);
  assert.equal(hasInternalCookie("a=b; gp_internal=1; c=d"), true);
  assert.equal(hasInternalCookie("gp_internal=0"), false);
  assert.equal(hasInternalCookie("gp_internal_other=1"), false);
  assert.equal(hasInternalCookie(null), false);
});

test("l'IP n'est hachée que s'il y a un sel, sinon rien n'est écrit", () => {
  const hashed = hashIp("88.120.4.17", "sel-de-prod");
  assert.equal(typeof hashed, "string");
  assert.equal(hashed?.length, 16);
  // Déterministe : c'est ce qui permet de reconnaître un même visiteur.
  assert.equal(hashIp("88.120.4.17", "sel-de-prod"), hashed);
  // Un sel différent produit une empreinte différente.
  assert.notEqual(hashIp("88.120.4.17", "autre-sel"), hashed);
  // Sans sel, on préfère ne rien stocker qu'un condensat inversable.
  assert.equal(hashIp("88.120.4.17", undefined), null);
  assert.equal(hashIp(null, "sel-de-prod"), null);
});

test("un visiteur ordinaire passe, avec son empreinte d'IP", () => {
  const verdict = classifyTraffic({
    userAgent: CHROME_MAC,
    cookieHeader: null,
    ip: "88.120.4.17",
    internalIps: [],
    ipSalt: "sel",
  });

  assert.equal(verdict.accepted, true);
  assert.equal(verdict.rejectedBy, null);
  assert.equal(typeof verdict.ipHash, "string");
});

test("les trois motifs de refus sont distingués, du plus sûr au plus heuristique", () => {
  const internalByCookie = classifyTraffic({
    userAgent: CHROME_MAC,
    cookieHeader: "gp_internal=1",
    ip: "88.120.4.17",
    internalIps: [],
  });
  assert.deepEqual([internalByCookie.accepted, internalByCookie.rejectedBy], [false, "internal_cookie"]);

  const internalByIp = classifyTraffic({
    userAgent: CHROME_MAC,
    cookieHeader: null,
    ip: "88.120.4.17",
    internalIps: ["88.120.4.17"],
  });
  assert.deepEqual([internalByIp.accepted, internalByIp.rejectedBy], [false, "internal_ip"]);

  const bot = classifyTraffic({
    userAgent: "Googlebot/2.1",
    cookieHeader: null,
    ip: "66.249.66.1",
    internalIps: [],
  });
  assert.deepEqual([bot.accepted, bot.rejectedBy], [false, "bot"]);
});

test("un navigateur interne est écarté même s'il ressemble à un prospect", () => {
  // Le cas concret du 27/07 : nos propres vérifications de liens, depuis un vrai
  // navigateur, ont gonflé report_viewed de 10 unités sur un total de 59.
  const verdict = classifyTraffic({
    userAgent: CHROME_MAC,
    cookieHeader: "gp_internal=1",
    ip: "88.120.4.17",
    internalIps: [],
  });
  assert.equal(verdict.accepted, false);
});
