import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { homeCopy } from "../src/lib/i18n";

// Inspiré de Pinniq Legal (01/10) : la formule du score est publique. Ce test
// lie la FAQ au code — si les poids de computeScore changent, la FAQ ment.
test("la FAQ publie la vraie formule du score (75 % questions, 25 % fondations)", () => {
  const engine = readFileSync("src/lib/audit-engine.ts", "utf8");
  assert.match(engine, /\(buyerIntentScore \* 0\.6\) \+ \(aiSurfaceScore \* 0\.15\) \+ \(foundationScore \* 0\.25\)/);
  for (const locale of ["fr", "en"] as const) {
    const item = homeCopy[locale].faqItems.find((entry) => /score/i.test(entry.question));
    assert.ok(item, `FAQ score absente (${locale})`);
    assert.match(item!.answer, /75\s?%/);
    assert.match(item!.answer, /25\s?%/);
  }
});
