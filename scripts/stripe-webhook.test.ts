import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { ENTITLING_STATUSES, isEntitling, planFromStripeObject, verifyStripeSignature } from "../src/lib/stripe-webhook";

const SECRET = "whsec_test_secret";
const sign = (body: string, ts: number, secret = SECRET) =>
  `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex")}`;

test("AC1 — une signature valide et fraiche est acceptee", () => {
  const body = '{"id":"evt_1","type":"customer.subscription.updated"}';
  const now = 1_700_000_000;
  assert.equal(verifyStripeSignature(body, sign(body, now), SECRET, now).ok, true);
});

test("AC2 — le corps reserialise ne passe plus : c'est pour ca qu'on lit le brut", () => {
  const raw = '{"id":"evt_1","type":"x"}';
  const now = 1_700_000_000;
  const header = sign(raw, now);
  const reserialized = JSON.stringify(JSON.parse(raw).id ? { type: "x", id: "evt_1" } : {});
  assert.equal(verifyStripeSignature(reserialized, header, SECRET, now).ok, false);
});

test("AC3 — une requete valide mais rejouee plus tard est refusee (anti-rejeu)", () => {
  const body = '{"id":"evt_1"}';
  const signedAt = 1_700_000_000;
  const header = sign(body, signedAt);
  assert.equal(verifyStripeSignature(body, header, SECRET, signedAt + 301).ok, false);
  assert.equal(verifyStripeSignature(body, header, SECRET, signedAt + 299).ok, true);
});

test("AC4 — un mauvais secret ne passe pas, meme avec un corps identique", () => {
  const body = '{"id":"evt_1"}';
  const now = 1_700_000_000;
  assert.equal(verifyStripeSignature(body, sign(body, now, "whsec_autre"), SECRET, now).ok, false);
});

test("AC5 — en-tete absent, malforme, ou sans v1 : refus explicite, jamais d'acceptation par defaut", () => {
  const now = 1_700_000_000;
  // On verifie le MOTIF, pas seulement le refus : un refus pour la mauvaise
  // raison masquerait une regression (ex. tout tomber en "mismatch").
  const refusalReason = (header: string | null) => {
    const verdict = verifyStripeSignature("{}", header, SECRET, now);
    return verdict.ok ? "accepte_a_tort" : verdict.reason;
  };
  assert.equal(refusalReason(null), "missing_header");
  assert.equal(refusalReason("v1=deadbeef"), "malformed_header");
  assert.equal(refusalReason(`t=${now}`), "no_signature");
});

test("AC6 — rotation de secret : plusieurs v1, une seule doit correspondre", () => {
  const body = '{"id":"evt_1"}';
  const now = 1_700_000_000;
  const good = createHmac("sha256", SECRET).update(`${now}.${body}`, "utf8").digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${"0".repeat(64)},v1=${good}`, SECRET, now).ok, true);
});

test("AC7 — la metadonnee prime sur l'identifiant de prix, pour survivre a un prix recree", () => {
  assert.equal(planFromStripeObject({ metadata: { getpick_plan: "agent_19eur" } }), "agent_19eur");
  assert.equal(
    planFromStripeObject({ items: { data: [{ price: { id: "price_1TzBZoCZqJGb866fjK9GMVkv" } }] } }),
    "monitor_9eur"
  );
  assert.equal(planFromStripeObject({ metadata: { getpick_plan: "plan_inconnu" } }), null);
  assert.equal(planFromStripeObject({}), null);
});

test("AC8 — past_due donne encore droit, unpaid et canceled non", () => {
  assert.equal(isEntitling("active"), true);
  assert.equal(isEntitling("trialing"), true);
  assert.equal(isEntitling("past_due"), true, "Smart Retries tourne encore : couper punirait une carte expiree");
  assert.equal(isEntitling("unpaid"), false);
  assert.equal(isEntitling("canceled"), false);
  assert.equal(isEntitling(null), false);
  assert.equal(ENTITLING_STATUSES.size, 3);
});
