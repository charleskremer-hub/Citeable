/**
 * ALERTE LEAD + ACTION « SERVICE » LISIBLE — 28/09/2026.
 *
 * Deux défauts constatés en production sur un audit réel (Gendrot, cookie
 * interne) :
 * 1. le fondateur n'était jamais prévenu qu'un prospect avait laissé son email ;
 * 2. l'email de rapport (et /audit/[id]) affichait « Action prioritaire » à la
 *    place de l'action réelle : les actions service, déjà en français, étaient
 *    re-traduites et tombaient dans le repli générique.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildLeadAlert, leadAlertRecipient, sendLeadAlert, type LeadAlertInput } from "@/lib/lead-alert";
import { localizePlainAction } from "@/lib/i18n";
import { buildPlainActions, detectIcpSegment, type BuyerIntentPromptResult } from "@/lib/audit-engine";
import { ANONYMOUS_EMAIL_DOMAIN } from "@/lib/anonymous-email";

const lead: LeadAlertInput = {
  auditId: "0c2a2208-8caf-4a8c-8044-4e08ab58e6c9",
  prospectEmail: "contact@cabinet-exemple.fr",
  brandName: "Gendrot",
  websiteUrl: "https://www.gendrot-ec.fr/",
  score: 15,
  category: "accounting firm",
  competitors: ["Fiducial"],
  firstQuestion: "quel expert-comptable choisir à Palaiseau pour la création d'une SCI familiale ?",
  trafficClass: "human",
  prospectEmailSent: true,
};

test("alerte lead — destinataire uniquement depuis LEAD_ALERT_TO, jamais en dur", () => {
  assert.equal(leadAlertRecipient({}), null);
  assert.equal(leadAlertRecipient({ LEAD_ALERT_TO: "  " }), null);
  assert.equal(leadAlertRecipient({ LEAD_ALERT_TO: "pas-une-adresse" }), null);
  assert.equal(leadAlertRecipient({ LEAD_ALERT_TO: " fondateur@exemple.fr " }), "fondateur@exemple.fr");
});

test("alerte lead — le corps porte ce qu'il faut pour rappeler le prospect", () => {
  const { subject, text } = buildLeadAlert(lead);
  assert.equal(subject, "Nouveau lead GetPick : Gendrot (15/100)");
  for (const needle of ["contact@cabinet-exemple.fr", "gendrot-ec.fr", "15/100", "Fiducial", "Palaiseau", "Rapport envoyé au prospect : oui", "/audit/0c2a2208", "/api/internal"]) {
    assert.ok(text.includes(needle), `absent du corps : ${needle}`);
  }
});

test("alerte lead — un test interne part, mais marqué comme tel", () => {
  assert.match(buildLeadAlert({ ...lead, trafficClass: "internal" }).subject, /^\[test interne\] /);
  assert.match(buildLeadAlert({ ...lead, trafficClass: "bot" }).subject, /^\[test interne\] /);
  assert.doesNotMatch(buildLeadAlert(lead).subject, /test interne/);
});

test("alerte lead — un échec d'envoi du rapport au prospect se voit dans l'alerte", () => {
  const { text } = buildLeadAlert({ ...lead, prospectEmailSent: false, prospectEmailError: "Suppressed: internal/test domain." });
  assert.match(text, /Rapport envoyé au prospect : NON \(Suppressed/);
});

test("alerte lead — envoi : sans destinataire ou audit anonyme, rien ne part ; sinon un seul envoi", async () => {
  const sent: Array<{ to: string; subject: string }> = [];
  const send = async (message: { to: string; subject: string }) => {
    sent.push(message);
    return { sent: true };
  };

  assert.deepEqual(await sendLeadAlert(lead, { env: {}, send }), { sent: false, skipped: "LEAD_ALERT_TO not configured" });
  assert.equal(
    (await sendLeadAlert({ ...lead, prospectEmail: `x@${ANONYMOUS_EMAIL_DOMAIN}` }, { env: { LEAD_ALERT_TO: "f@exemple.fr" }, send })).skipped,
    "anonymous audit",
  );
  assert.equal(sent.length, 0);

  assert.deepEqual(await sendLeadAlert(lead, { env: { LEAD_ALERT_TO: "f@exemple.fr" }, send }), { sent: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "f@exemple.fr");
});

test("alerte lead — une panne du fournisseur ne lève pas", async () => {
  const result = await sendLeadAlert(lead, {
    env: { LEAD_ALERT_TO: "f@exemple.fr" },
    send: async () => {
      throw new Error("resend down");
    },
  });
  assert.deepEqual(result, { sent: false, error: "resend down" });
});

const prompts: BuyerIntentPromptResult[] = [
  { prompt: "quel expert-comptable à Palaiseau pour une SCI ?", available: true, brandMentioned: false, competitors: ["Fiducial"], surfaces: [] },
];

test("action service — en français, le titre réel survit à la localisation (plus d'« Action prioritaire »)", () => {
  const actions = buildPlainActions(prompts, "accounting firm", ["Fiducial"], detectIcpSegment("accounting firm"), "fr");
  assert.ok(actions.length > 0);
  for (const action of actions) {
    const localized = localizePlainAction(action, "fr");
    assert.notEqual(localized.title, "Action prioritaire", `titre écrasé : « ${action.title} »`);
    assert.equal(localized.title, action.title);
    assert.equal(localized.doThis, action.doThis);
  }
});

test("action historique — une action anglaise connue reste traduite", () => {
  const localized = localizePlainAction({ title: "Update Google Business Profile for local intent", doThis: "x", where: "y" }, "fr");
  assert.match(localized.title, /Google Business/);
  assert.notEqual(localized.title, "Update Google Business Profile for local intent");
});
