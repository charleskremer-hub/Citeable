/**
 * UN DÉPLOIEMENT QUI N'EST PAS LA PRODUCTION NE PRODUIT PAS D'ÉVÉNEMENT
 * « HUMAIN ».
 *
 * Mesuré le 22/09/2026 : le north star (`report_viewed.human`) a bougé pour la
 * première fois en 26 jours pendant qu'une preview du pivot était poussée et
 * testée. Deux hypothèses sont restées ouvertes et le sont toujours — un vrai
 * prospect, ou un test sur `*.vercel.app` — parce que rien dans la donnée ne
 * les sépare : la preview partage `DATABASE_URL` avec la production, et le
 * cookie `gp_internal` est posé par domaine, donc absent d'un domaine de
 * preview. `INTERNAL_IPS` ne suffit pas : il dépend d'une IP qui change.
 *
 * Ce chantier ne fait pas monter le north star, IL LE REND VRAI.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyTraffic, trafficClassFromVerdict } from "@/lib/traffic-filter";

const visitor = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36",
  cookieHeader: null,
  ip: "203.0.113.7",
  internalIps: [] as string[],
  ipSalt: "sel-de-test",
};

test("preview et development : un visiteur sans cookie ni IP interne est classé internal", () => {
  for (const env of ["preview", "development", " preview "]) {
    const verdict = classifyTraffic({ ...visitor, vercelEnv: env });
    assert.equal(verdict.accepted, false, `VERCEL_ENV=${env}`);
    assert.equal(verdict.rejectedBy, "non_production", `VERCEL_ENV=${env}`);
    assert.equal(trafficClassFromVerdict(verdict), "internal", `VERCEL_ENV=${env}`);
  }
});

test("production : le comportement d'avant est intact, le visiteur reste humain", () => {
  const verdict = classifyTraffic({ ...visitor, vercelEnv: "production" });
  assert.deepEqual([verdict.accepted, verdict.rejectedBy], [true, null]);
  assert.equal(trafficClassFromVerdict(verdict), "human");
});

test("variable absente ou vide : comportement INCHANGÉ, jamais internal par défaut", () => {
  // Le mode de panne qu'on refuse : une `VERCEL_ENV` perdue en production
  // mettrait le north star à zéro pour toujours, sans erreur nulle part.
  for (const env of [undefined, null, ""]) {
    const verdict = classifyTraffic({ ...visitor, vercelEnv: env });
    assert.equal(verdict.accepted, true, `vercelEnv=${String(env)}`);
    assert.equal(trafficClassFromVerdict(verdict), "human", `vercelEnv=${String(env)}`);
  }
  // Et sans le champ du tout : la signature reste compatible.
  assert.equal(classifyTraffic(visitor).accepted, true);
});

test("hors production prime sur le bot et sur l'IP interne — une seule raison lisible", () => {
  const bot = classifyTraffic({ ...visitor, userAgent: "Googlebot/2.1", vercelEnv: "preview" });
  assert.equal(bot.rejectedBy, "non_production");
  const interne = classifyTraffic({ ...visitor, internalIps: ["203.0.113.7"], vercelEnv: "preview" });
  assert.equal(interne.rejectedBy, "non_production");
  // En production, ces deux chemins gardent leur raison d'origine.
  assert.equal(classifyTraffic({ ...visitor, userAgent: "Googlebot/2.1", vercelEnv: "production" }).rejectedBy, "bot");
  assert.equal(classifyTraffic({ ...visitor, internalIps: ["203.0.113.7"], vercelEnv: "production" }).rejectedBy, "internal_ip");
});

test("câblage — requestTrafficClass lit vraiment VERCEL_ENV, pas seulement classifyTraffic", async () => {
  // La couture est ici : une fonction pure correcte ne dit rien du câblage.
  // `requestTrafficClass` est ce que les routes appellent ; c'est donc elle
  // qu'on interroge, avec de vrais en-têtes de requête.
  const { requestTrafficClass } = await import("@/lib/traffic-filter");
  const headers = new Headers({
    "user-agent": visitor.userAgent,
    "x-forwarded-for": "203.0.113.7",
  });
  const avant = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.equal(requestTrafficClass(headers).trafficClass, "internal");
    process.env.VERCEL_ENV = "production";
    assert.equal(requestTrafficClass(headers).trafficClass, "human");
    delete process.env.VERCEL_ENV;
    assert.equal(requestTrafficClass(headers).trafficClass, "human");
  } finally {
    if (avant === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = avant;
  }
});
