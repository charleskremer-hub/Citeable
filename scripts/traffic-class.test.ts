import assert from "node:assert/strict";
import test from "node:test";
import {
  TRAFFIC_CLASSES,
  classifyTraffic,
  isTrafficClass,
  trafficClassFromVerdict,
  trafficClassOrUnknown,
} from "@/lib/traffic-filter";
import { FUNNEL_EVENTS, foldFunnelCounts } from "@/lib/funnel";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const GPT_BOT = "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const INTERNAL_IPS = ["88.120.4.17", "2a01:cb00:"];

function classOf(input: { userAgent?: string | null; cookieHeader?: string | null; ip?: string | null }) {
  return trafficClassFromVerdict(
    classifyTraffic({
      userAgent: input.userAgent ?? CHROME_MAC,
      cookieHeader: input.cookieHeader ?? null,
      ip: input.ip ?? "203.0.113.9",
      internalIps: INTERNAL_IPS,
      ipSalt: "sel-de-test",
    })
  );
}

// AC2 — les trois classes sont DÉRIVÉES de `classifyTraffic`, aucune règle nouvelle.
test("AC2 — les quatre cas d'entrée donnent human / bot / internal / internal", () => {
  assert.equal(classOf({ userAgent: CHROME_MAC }), "human");
  assert.equal(classOf({ userAgent: GPT_BOT }), "bot");
  assert.equal(classOf({ cookieHeader: "gp_internal=1" }), "internal");
  assert.equal(classOf({ ip: "88.120.4.17" }), "internal");
});

test("AC2 — la projection colle exactement au verdict, pour les 4 verdicts possibles", () => {
  assert.equal(trafficClassFromVerdict({ accepted: true, rejectedBy: null, ipHash: null }), "human");
  assert.equal(trafficClassFromVerdict({ accepted: false, rejectedBy: "bot", ipHash: null }), "bot");
  assert.equal(trafficClassFromVerdict({ accepted: false, rejectedBy: "internal_cookie", ipHash: null }), "internal");
  assert.equal(trafficClassFromVerdict({ accepted: false, rejectedBy: "internal_ip", ipHash: null }), "internal");
});

test("AC2 — l'ordre de priorité de classifyTraffic est conservé : interne avant bot", () => {
  // Un crawler qui porterait notre cookie interne reste « nous », pas « bot » —
  // c'est déjà l'ordre de `classifyTraffic`, on ne le réécrit pas ici.
  assert.equal(classOf({ userAgent: GPT_BOT, cookieHeader: "gp_internal=1" }), "internal");
  assert.equal(classOf({ userAgent: GPT_BOT, ip: "2a01:cb00:1234::1" }), "internal");
});

// AC6 — rien n'est jamais promu `human` par défaut.
test("AC6 — tout ce qui n'est pas une classe connue retombe sur unknown", () => {
  for (const value of [undefined, null, "", "HUMAN", "human ", "humain", 1, {}, [], true]) {
    assert.equal(trafficClassOrUnknown(value), "unknown", JSON.stringify(value));
  }
  for (const klass of TRAFFIC_CLASSES) {
    assert.equal(trafficClassOrUnknown(klass), klass);
  }
  assert.equal(isTrafficClass("human"), true);
  assert.equal(isTrafficClass("HUMAN"), false);
});

// AC3 — aller-retour `raw_results` → `audit_completed`.
//
// `completeQueuedAudit` n'est PAS exécuté ici : il appelle `runAudit` (Gemini)
// sans point d'injection. Ce qu'on verrouille est la seule opération qu'il fait
// sur la classe — relire `row.raw_results.trafficClass` avec la lecture
// défensive — pour les 4 valeurs qui peuvent s'y trouver, plus l'historique.
test("AC3 — la classe écrite dans raw_results est relue à l'identique", () => {
  for (const klass of TRAFFIC_CLASSES) {
    const rawResults: { trafficClass?: unknown } = JSON.parse(JSON.stringify({ status: "queued", trafficClass: klass }));
    assert.equal(trafficClassOrUnknown(rawResults.trafficClass), klass);
  }

  // Audit démarré avant le 29/07 : `audit_completed` sort en `unknown`, jamais `human`.
  const legacy: { trafficClass?: unknown } = JSON.parse(JSON.stringify({ status: "queued" }));
  assert.equal(trafficClassOrUnknown(legacy.trafficClass), "unknown");
});

// AC5 — la ventilation est exhaustive et sa somme est structurelle.
test("AC5 — les 9 événements portent toujours les 4 clés, même sans aucune ligne", () => {
  const { counts, countsByTrafficClass } = foldFunnelCounts([]);

  assert.equal(Object.keys(countsByTrafficClass).length, FUNNEL_EVENTS.length);
  for (const eventName of FUNNEL_EVENTS) {
    assert.deepEqual(Object.keys(countsByTrafficClass[eventName]).sort(), ["bot", "human", "internal", "unknown"]);
    assert.equal(counts[eventName], 0);
  }
});

test("AC5 — human + bot + internal + unknown === counts[event], pour chaque événement", () => {
  const rows = [
    { event_name: "audit_started", traffic_class: "human", count: "12" },
    { event_name: "audit_started", traffic_class: "bot", count: "130" },
    { event_name: "audit_started", traffic_class: "internal", count: "5" },
    { event_name: "audit_started", traffic_class: null, count: "7" },
    { event_name: "report_viewed", traffic_class: "human", count: 3 },
    { event_name: "checkout_opened", traffic_class: "internal", count: "1" },
    // Événement inconnu : ignoré, il ne doit pas créer de clé hors FUNNEL_EVENTS.
    { event_name: "pas_un_evenement", traffic_class: "human", count: "999" },
  ];

  const { counts, countsByTrafficClass } = foldFunnelCounts(rows);

  for (const eventName of FUNNEL_EVENTS) {
    const bucket = countsByTrafficClass[eventName];
    assert.equal(bucket.human + bucket.bot + bucket.internal + bucket.unknown, counts[eventName], eventName);
  }
  assert.equal(counts.audit_started, 154);
  assert.equal(countsByTrafficClass.audit_started.human, 12);
  assert.equal(countsByTrafficClass.audit_started.unknown, 7);
  assert.equal(counts.report_viewed, 3);
  assert.equal(counts.checkout_opened, 1);
  assert.equal("pas_un_evenement" in countsByTrafficClass, false);
});

test("AC6 — l'historique sans trafficClass compte en unknown, JAMAIS en human", () => {
  const { counts, countsByTrafficClass } = foldFunnelCounts([
    { event_name: "audit_started", traffic_class: null, count: "147" },
    // Valeurs qui ressemblent à `human` sans en être : elles ne doivent pas
    // ouvrir une porte dérobée vers le compteur humain.
    { event_name: "audit_started", traffic_class: "HUMAN", count: "2" },
    { event_name: "audit_started", traffic_class: "human ", count: "3" },
  ]);

  assert.equal(countsByTrafficClass.audit_started.human, 0);
  assert.equal(countsByTrafficClass.audit_started.unknown, 152);
  assert.equal(counts.audit_started, 152);
});

test("une valeur de comptage non numérique n'empoisonne pas l'agrégat", () => {
  const { counts } = foldFunnelCounts([
    { event_name: "audit_started", traffic_class: "human", count: "n/a" },
    { event_name: "audit_started", traffic_class: "human", count: "4" },
  ]);

  assert.equal(counts.audit_started, 4);
});
