import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PROMPT_CONCURRENCY, mapWithConcurrency } from "../src/lib/audit-engine";

test("l'ordre des resultats suit l'ordre des entrees, pas l'ordre d'achevement", async () => {
  // Le premier element est le plus LENT : s'il finissait dernier dans la liste,
  // la question d'achat n°1 serait rendue au prospect a la place de la n°6.
  const delays = [40, 5, 30, 1, 20, 2];
  const out = await mapWithConcurrency(delays, 3, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms));
    return `${i}:${ms}`;
  });
  assert.deepEqual(out, ["0:40", "1:5", "2:30", "3:1", "4:20", "5:2"]);
});

test("la borne est respectee : jamais plus de N appels de front", async () => {
  let inFlight = 0;
  let peak = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
  });
  assert.equal(peak, 4, `pic de concurrence observe : ${peak}`);
});

test("LE GAIN : 12 appels lents tiennent en ~3 vagues, pas en 12", async () => {
  const t0 = Date.now();
  await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  const elapsed = Date.now() - t0;
  // Sequentiel : 12 x 30 = 360 ms. Parallele borne a 4 : 3 vagues = ~90 ms.
  assert.ok(elapsed < 200, `attendu ~90 ms (3 vagues), mesure ${elapsed} ms`);
});

test("une liste plus courte que la borne ne cree pas de worker inutile", async () => {
  const out = await mapWithConcurrency([1, 2], 8, async (n) => n * 2);
  assert.deepEqual(out, [2, 4]);
});

test("liste vide : aucun appel, aucun blocage", async () => {
  let called = 0;
  const out = await mapWithConcurrency([], 4, async () => {
    called += 1;
    return 1;
  });
  assert.deepEqual(out, []);
  assert.equal(called, 0);
});

test("une borne a 0 ou negative ne bloque pas — on retombe sur 1", async () => {
  assert.deepEqual(await mapWithConcurrency([1, 2, 3], 0, async (n) => n), [1, 2, 3]);
  assert.deepEqual(await mapWithConcurrency([1, 2, 3], -5, async (n) => n), [1, 2, 3]);
});

test("un rejet remonte, il n'est pas avale en silence", async () => {
  await assert.rejects(
    () => mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
    /boom/
  );
});

test("la borne reste sous le compte de questions payantes", () => {
  // Si un jour la borne depassait 12, on relancerait les 12 appels d'un coup et
  // on aurait troque un depassement de budget contre un throttling fournisseur.
  assert.ok(PROMPT_CONCURRENCY >= 2 && PROMPT_CONCURRENCY <= 6, `borne = ${PROMPT_CONCURRENCY}`);
});
