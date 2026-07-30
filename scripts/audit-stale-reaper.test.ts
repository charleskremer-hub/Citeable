import { strict as assert } from "node:assert";
import { test } from "node:test";

import { isStaleRunningAudit } from "../src/app/api/audit-status/route";

const NOW = Date.parse("2026-07-30T12:00:00.000Z");
const min = (n: number) => new Date(NOW - n * 60_000).toISOString();

test("un audit running depuis plus de 3 min est declare mort", () => {
  assert.equal(isStaleRunningAudit({ status: "running", startedAt: min(4) }, NOW), true);
  assert.equal(isStaleRunningAudit({ status: "running", startedAt: min(50) }, NOW), true);
});

test("un audit running dans la fenetre d'execution ne l'est pas", () => {
  // maxDuration = 60 s : a 30 s et meme a 2 min, l'invocation peut etre vivante.
  assert.equal(isStaleRunningAudit({ status: "running", startedAt: min(0.5) }, NOW), false);
  assert.equal(isStaleRunningAudit({ status: "running", startedAt: min(2) }, NOW), false);
});

test("le seuil est strict : exactement 3 min n'est pas encore mort", () => {
  assert.equal(isStaleRunningAudit({ status: "running", startedAt: min(3) }, NOW), false);
});

test("aucun autre statut n'est reape, meme tres ancien", () => {
  for (const status of ["queued", "completed", "failed", undefined]) {
    assert.equal(isStaleRunningAudit({ status, startedAt: min(999) }, NOW), false, `statut ${status}`);
  }
});

test("sans startedAt exploitable on ne conclut pas — on ne tue jamais a l'aveugle", () => {
  assert.equal(isStaleRunningAudit({ status: "running" }, NOW), false);
  assert.equal(isStaleRunningAudit({ status: "running", startedAt: "" }, NOW), false);
  assert.equal(isStaleRunningAudit({ status: "running", startedAt: "pas une date" }, NOW), false);
  assert.equal(isStaleRunningAudit(null, NOW), false);
  assert.equal(isStaleRunningAudit(undefined, NOW), false);
});

test("un startedAt dans le futur (horloge desynchro) ne declenche rien", () => {
  assert.equal(isStaleRunningAudit({ status: "running", startedAt: min(-10) }, NOW), false);
});
