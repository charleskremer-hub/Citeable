import { strict as assert } from "node:assert";
import { test } from "node:test";

import { AUDIT_TIER_KEY_HEADER, auditTierFromPayload, resolveAuditTier } from "../src/lib/audit-engine";

const headers = (value?: string) => ({
  get: (name: string) => (name === AUDIT_TIER_KEY_HEADER && value !== undefined ? value : null),
});

const KEY = "cle-de-test-suffisamment-longue";

function withKey<T>(value: string | undefined, fn: () => T): T {
  const before = process.env.INTERNAL_AUDIT_KEY;
  if (value === undefined) delete process.env.INTERNAL_AUDIT_KEY;
  else process.env.INTERNAL_AUDIT_KEY = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.INTERNAL_AUDIT_KEY;
    else process.env.INTERNAL_AUDIT_KEY = before;
  }
}

test("LE TROU : un tier payant demande sans cle est servi en free", () => {
  withKey(KEY, () => {
    for (const payload of [
      { audit_tier: "monitor_9eur" },
      { tier: "monitor_9eur" },
      { paid_tier: "monitor_9eur" },
      { monitor_9eur: true },
      { audit_tier: "agent_19eur" },
      { audit_tier: "agent_49eur" },
    ]) {
      const r = resolveAuditTier(payload, headers());
      assert.equal(r.tier, "free", JSON.stringify(payload));
      assert.notEqual(r.downgradedFrom, null, "le downgrade doit etre trace");
    }
  });
});

test("une cle valide autorise le tier demande", () => {
  withKey(KEY, () => {
    const r = resolveAuditTier({ audit_tier: "monitor_9eur" }, headers(KEY));
    assert.equal(r.tier, "monitor_9eur");
    assert.equal(r.downgradedFrom, null);
  });
});

test("FAIL-SAFE : sans INTERNAL_AUDIT_KEY dans l'environnement, aucun tier payant n'est servi", () => {
  withKey(undefined, () => {
    assert.equal(resolveAuditTier({ audit_tier: "monitor_9eur" }, headers(KEY)).tier, "free");
    assert.equal(resolveAuditTier({ audit_tier: "monitor_9eur" }, headers("")).tier, "free");
  });
  // Une cle vide ne doit jamais valoir "pas de controle".
  withKey("", () => {
    assert.equal(resolveAuditTier({ audit_tier: "monitor_9eur" }, headers("")).tier, "free");
  });
  withKey("   ", () => {
    assert.equal(resolveAuditTier({ audit_tier: "monitor_9eur" }, headers("   ")).tier, "free");
  });
});

test("une cle fausse, ou de longueur differente, ne passe pas", () => {
  withKey(KEY, () => {
    assert.equal(resolveAuditTier({ audit_tier: "monitor_9eur" }, headers("mauvaise")).tier, "free");
    assert.equal(resolveAuditTier({ audit_tier: "monitor_9eur" }, headers(KEY + "x")).tier, "free");
    assert.equal(resolveAuditTier({ audit_tier: "monitor_9eur" }, headers(KEY.slice(0, -1))).tier, "free");
  });
});

test("le tier gratuit n'a jamais besoin de cle et n'est jamais marque downgrade", () => {
  withKey(KEY, () => {
    const r = resolveAuditTier({ audit_tier: "free" }, headers());
    assert.equal(r.tier, "free");
    assert.equal(r.downgradedFrom, null);
    assert.equal(resolveAuditTier({}, headers()).tier, "free");
  });
});

test("auditTierFromPayload reste une LECTURE d'intention, elle n'autorise rien", () => {
  // Le parseur ne doit pas changer : c'est resolveAuditTier qui porte le droit.
  assert.equal(auditTierFromPayload({ audit_tier: "monitor_9eur" }), "monitor_9eur");
  assert.equal(auditTierFromPayload({ audit_tier: "agent_49eur" }), "agent_19eur");
  assert.equal(auditTierFromPayload({}), "free");
});
