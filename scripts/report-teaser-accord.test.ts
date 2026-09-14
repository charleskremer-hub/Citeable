/**
 * Accord du teaser « déblocage » : « GPTBot ne peut pas » quand un seul crawler
 * est bloqué, « GPTBot, ClaudeBot ne peuvent pas » quand il y en a plusieurs.
 *
 * Défaut relevé le 14/09 sur l'audit de contrôle 2f1bccd9 (un seul bot bloqué,
 * pluriel figé). Un client qui lit une faute dans la ligne qui lui demande de
 * payer ne lit pas la suite.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { publishTeaserItems } from "@/app/audit/[id]/report-insights";

function unblockItem(blockedBots: string[], locale: "fr" | "en") {
  const items = publishTeaserItems({ lostQuestions: [], questionCount: 6, blockedBots, locale });
  const item = items.find((entry) => entry.detail.includes("robots.txt"));
  assert.ok(item, "l'étape de déblocage doit exister quand un crawler est bloqué");
  return item;
}

test("un seul crawler bloqué → singulier en français", () => {
  const item = unblockItem(["GPTBot"], "fr");
  assert.ok(item.detail.startsWith("GPTBot ne peut pas lire"), item.detail);
  assert.ok(!item.detail.includes("peuvent"), item.detail);
});

test("plusieurs crawlers bloqués → pluriel en français", () => {
  const item = unblockItem(["GPTBot", "ClaudeBot"], "fr");
  assert.ok(item.detail.startsWith("GPTBot, ClaudeBot ne peuvent pas lire"), item.detail);
});

test("l'anglais est invariable dans les deux cas", () => {
  assert.ok(unblockItem(["GPTBot"], "en").detail.startsWith("GPTBot cannot read"));
  assert.ok(unblockItem(["GPTBot", "ClaudeBot"], "en").detail.startsWith("GPTBot, ClaudeBot cannot read"));
});

test("aucun crawler bloqué → aucune étape de déblocage", () => {
  const items = publishTeaserItems({ lostQuestions: [], questionCount: 6, blockedBots: [], locale: "fr" });
  assert.equal(items.filter((entry) => entry.detail.includes("robots.txt")).length, 0);
});
