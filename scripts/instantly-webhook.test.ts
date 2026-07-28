import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeKeyFor,
  isKnownEventType,
  minimizePayload,
  optOutReasonFor,
  parseInstantlyEvent,
} from "@/lib/instantly-webhook";

const REPLY_EVENT = {
  timestamp: "2026-07-28T09:12:44.000Z",
  event_type: "reply_received",
  workspace: "8f2b6f1e-1a2b-4c3d-9e8f-0a1b2c3d4e5f",
  campaign_id: "419e33c5-f930-4b13-aee8-83b2395c19a1",
  campaign_name: "[Outbound] Perdantes FR",
  lead_email: "Contact@Douceur-Cerise.FR",
  email_account: "charles@freegetpick.com",
  step: "1",
  variant: "A",
  is_first: true,
  email_id: "em_9f3c",
  reply_subject: "Re: Avril est recommandée à votre place",
  reply_text_snippet: "Bonjour, intéressant — on peut en parler jeudi ?",
  reply_text: "Bonjour, intéressant — on peut en parler jeudi ? Cordialement, ...",
  reply_html: "<div>Bonjour, intéressant...</div>",
};

test("un événement de réponse est lu champ par champ", () => {
  const event = parseInstantlyEvent(REPLY_EVENT);
  assert.ok(event);
  assert.equal(event.eventType, "reply_received");
  assert.equal(event.occurredAt, "2026-07-28T09:12:44.000Z");
  assert.equal(event.campaignId, "419e33c5-f930-4b13-aee8-83b2395c19a1");
  assert.equal(event.campaignName, "[Outbound] Perdantes FR");
  assert.equal(event.emailAccount, "charles@freegetpick.com");
  assert.equal(event.step, "1");
  assert.equal(event.variant, "A");
  assert.equal(event.isFirst, true);
  assert.equal(event.emailId, "em_9f3c");
  assert.equal(event.replySnippet, "Bonjour, intéressant — on peut en parler jeudi ?");
});

test("l'email du prospect est normalisé en minuscules", () => {
  // Sinon « Contact@Douceur-Cerise.FR » et « contact@douceur-cerise.fr » vivent
  // comme deux prospects distincts, et une opposition posée sur l'un laisse
  // partir un email à l'autre.
  const event = parseInstantlyEvent(REPLY_EVENT);
  assert.equal(event?.leadEmail, "contact@douceur-cerise.fr");
});

test("le sujet de réponse prime sur le sujet d'origine", () => {
  const event = parseInstantlyEvent({ ...REPLY_EVENT, email_subject: "Avril est recommandée à votre place" });
  assert.equal(event?.subject, "Re: Avril est recommandée à votre place");

  const sent = parseInstantlyEvent({
    timestamp: "2026-07-28T08:00:00.000Z",
    event_type: "email_sent",
    email_subject: "Avril est recommandée à votre place",
  });
  assert.equal(sent?.subject, "Avril est recommandée à votre place");
});

test("les corps complets ne sont jamais conservés", () => {
  const event = parseInstantlyEvent(REPLY_EVENT);
  assert.ok(event);
  assert.equal("reply_text" in event.payload, false);
  assert.equal("reply_html" in event.payload, false);
  assert.equal("email_text" in minimizePayload({ email_text: "x", step: "1" }), false);
  assert.equal("email_html" in minimizePayload({ email_html: "x", step: "1" }), false);
  // Ce qui n'est pas un corps de message reste.
  assert.equal(minimizePayload({ email_html: "x", step: "1" }).step, "1");
  // L'extrait, lui, est bien gardé : c'est ce qui permet de trier sans ouvrir.
  assert.equal(event.replySnippet, "Bonjour, intéressant — on peut en parler jeudi ?");
});

test("la clé de dédup est stable sur un rejeu et distincte sur un autre événement", () => {
  const key = dedupeKeyFor(REPLY_EVENT);
  // Instantly ne fournit aucun id d'événement : deux livraisons identiques
  // doivent produire la même clé, sinon un retry double la mesure.
  assert.equal(dedupeKeyFor({ ...REPLY_EVENT }), key);
  // Le corps expurgé ne change pas la clé : elle ne dépend que des identifiants.
  assert.equal(dedupeKeyFor({ ...REPLY_EVENT, reply_html: "<p>autre rendu</p>" }), key);

  assert.notEqual(dedupeKeyFor({ ...REPLY_EVENT, timestamp: "2026-07-28T09:12:45.000Z" }), key);
  assert.notEqual(dedupeKeyFor({ ...REPLY_EVENT, event_type: "email_opened" }), key);
  assert.notEqual(dedupeKeyFor({ ...REPLY_EVENT, lead_email: "autre@marque.fr" }), key);
  assert.notEqual(dedupeKeyFor({ ...REPLY_EVENT, step: "2" }), key);
});

test("la clé de dédup reste bornée, quelle que soit la taille du corps", () => {
  const key = dedupeKeyFor({ ...REPLY_EVENT, lead_email: `${"a".repeat(400)}@exemple.fr` });
  assert.ok(key.length < 60, key);
  assert.ok(key.startsWith("instantly:"));
});

test("un horodatage absent ou illisible ne fait pas échouer la lecture", () => {
  assert.equal(parseInstantlyEvent({ event_type: "email_sent" })?.occurredAt, null);
  assert.equal(parseInstantlyEvent({ event_type: "email_sent", timestamp: "pas une date" })?.occurredAt, null);
});

test("un corps inexploitable est refusé sans faire tomber la route", () => {
  assert.equal(parseInstantlyEvent(null), null);
  assert.equal(parseInstantlyEvent("email_sent"), null);
  assert.equal(parseInstantlyEvent([]), null);
  assert.equal(parseInstantlyEvent({}), null);
  assert.equal(parseInstantlyEvent({ event_type: "   " }), null);
});

test("un libellé personnalisé de workspace est journalisé, pas jeté", () => {
  // Instantly fait passer les labels custom dans event_type. Les refuser
  // rouvrirait l'angle mort qu'on est en train de fermer.
  const event = parseInstantlyEvent({ event_type: "a_rappeler_septembre", lead_email: "x@y.fr" });
  assert.equal(event?.eventType, "a_rappeler_septembre");
  assert.equal(isKnownEventType("a_rappeler_septembre"), false);
  assert.equal(isKnownEventType("reply_received"), true);
});

test("seuls les événements qui valent opposition en déclenchent une", () => {
  assert.equal(optOutReasonFor("lead_unsubscribed"), "unsubscribed");
  assert.equal(optOutReasonFor("email_bounced"), "bounced");
  assert.equal(optOutReasonFor("lead_not_interested"), "not_interested");
  assert.equal(optOutReasonFor("lead_wrong_person"), "wrong_person");

  for (const eventType of ["email_sent", "email_opened", "link_clicked", "reply_received", "lead_interested", "lead_out_of_office"]) {
    assert.equal(optOutReasonFor(eventType), null, eventType);
  }
});
