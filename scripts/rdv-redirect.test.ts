import { strict as assert } from "node:assert";
import { test } from "node:test";

import { GET, RDV_TARGET } from "../src/app/rdv/route";

test("getpick.ai/rdv redirige (307) vers l'agenda de Charles", () => {
  const response = GET();
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), RDV_TARGET);
});
