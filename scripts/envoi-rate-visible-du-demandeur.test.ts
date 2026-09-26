/**
 * G2 — UN ENVOI RATÉ EST VISIBLE DU DEMANDEUR (commande CEO 25/09, montée P0
 * par l'addendum du même jour).
 *
 * LE DÉFAUT MESURÉ : `/api/audit-status`, `/api/run-audit` et
 * `/api/capture-email` exposent tous `email_sent` et `email_error` depuis le
 * 25/09 — et AUCUN `.tsx` du dépôt ne lisait ces champs. `grep -rn email_error
 * src/app --include=*.tsx` rendait zéro ligne. Autrement dit : l'information
 * existait, circulait, et mourait avant l'écran. Le prospect dont le rapport
 * n'était pas parti attendait un email qui n'arriverait jamais, et seul
 * `/admin/emails`, derrière une clé, savait pourquoi.
 *
 * CE QUE CES VERROUS PROUVENT, ET OÙ LA PREUVE S'ARRÊTE.
 * Il n'y a dans ce bac à sable ni Postgres ni serveur Next, et le lanceur
 * (`node --test` + type stripping) n'exécute pas de JSX : on ne peut donc pas
 * « entrer par la route » et lire le HTML rendu de `/audit/<id>`. La preuve est
 * donc découpée en jambes qui ne se recouvrent pas :
 *
 *   G2.1  la RÈGLE, exécutée pour de vrai, avec CHAQUE dimension variée
 *         séparément (leçon MG1e du 25/09 : un test qui n'en fait varier
 *         qu'une laisse un garde voisin répondre à sa place) ;
 *   G2.2  la COUTURE : `page.tsx` rend le composant ET l'alimente depuis
 *         `audit.raw_results` — une règle juste que personne n'appelle livre
 *         quand même le défaut ;
 *   G2.3  le LIEN donné au demandeur est ABSOLU — un chemin relatif ne se
 *         copie ni dans un SMS ni dans un pense-bête ;
 *   G2.4  la COPIE existe dans les deux langues et dit les deux choses
 *         attendues : que l'envoi a raté, et où est le rapport.
 *
 * Ce qui n'est PAS couvert, et qui se vérifie en production : que Resend
 * écrive bien `emailSent: false` dans `raw_results` lors d'un refus, et le
 * rendu visuel du bloc.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { emailDeliveryNoticeVisible, type EmailDeliveryNoticeState } from "@/lib/email-delivery-notice";
import { reportUrlForAudit } from "@/lib/audit-engine";
import { auditCopy } from "@/lib/i18n";

const repoRoot = resolve(import.meta.dirname, "..");
const pageSource = readFileSync(resolve(repoRoot, "src/app/audit/[id]/page.tsx"), "utf8");

/** L'état d'un vrai demandeur dont l'envoi a raté : c'est le seul cas visible. */
const DEMANDEUR_COUPE: EmailDeliveryNoticeState = {
  complete: true,
  failed: false,
  emailIsAnonymous: false,
  emailSent: false,
};

test("G2.1 — le bloc n'apparaît QUE pour un demandeur réel dont l'envoi a raté, et chaque dimension est variée seule", () => {
  assert.equal(emailDeliveryNoticeVisible(DEMANDEUR_COUPE), true, "le cas nominal doit s'afficher, sinon les jambes suivantes ne prouvent rien");

  // Une dimension à la fois : si un garde répondait à la place d'un autre,
  // au moins une de ces quatre lignes resterait verte à tort.
  assert.equal(
    emailDeliveryNoticeVisible({ ...DEMANDEUR_COUPE, complete: false }),
    false,
    "rapport en cours : rien à annoncer, l'envoi n'a pas encore eu lieu"
  );
  assert.equal(
    emailDeliveryNoticeVisible({ ...DEMANDEUR_COUPE, failed: true }),
    false,
    "audit échoué : la vraie cause a déjà son bloc, on ne la noie pas sous une histoire d'email"
  );
  assert.equal(
    emailDeliveryNoticeVisible({ ...DEMANDEUR_COUPE, emailIsAnonymous: true }),
    false,
    "audit anonyme : personne n'attend d'email, l'avertir serait un faux positif"
  );
  assert.equal(
    emailDeliveryNoticeVisible({ ...DEMANDEUR_COUPE, emailSent: true }),
    false,
    "envoi réussi : rien à signaler"
  );
  assert.equal(
    emailDeliveryNoticeVisible({ ...DEMANDEUR_COUPE, emailSent: undefined }),
    false,
    "`undefined` = PAS ENCORE TENTÉ. Le confondre avec un échec ferait crier au loup sur chaque rapport en cours de livraison"
  );
});

test("G2.2 — la couture : la page rend le bloc ET l'alimente depuis raw_results", () => {
  assert.match(
    pageSource,
    /<EmailDeliveryNotice\b/,
    "page.tsx ne rend pas <EmailDeliveryNotice> : la règle serait juste et jamais appelée — exactement l'état d'avant le correctif"
  );

  const balise = pageSource.match(/<EmailDeliveryNotice\b[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(
    balise,
    /emailSent=\{audit\.raw_results\?\.emailSent\}/,
    "le prop `emailSent` doit venir de `audit.raw_results` — la seule source qui porte le verdict d'envoi. Le câbler sur autre chose rendrait le bloc muet ou permanent"
  );
  assert.match(
    balise,
    /emailIsAnonymous=\{isAnonymousEmail\(audit\.email\)\}/,
    "l'exclusion des audits anonymes doit se décider sur l'adresse réelle de l'audit"
  );
  assert.match(
    balise,
    /reportUrl=\{reportUrlForAudit\(audit\.id\)\}/,
    "le lien offert doit être celui de CET audit"
  );

  // Le champ doit aussi être déclaré dans le type de la ligne, sinon la page
  // lirait `undefined` en silence et le bloc ne s'afficherait jamais.
  assert.match(
    pageSource,
    /emailSent\?: boolean;/,
    "`raw_results.emailSent` doit être déclaré dans le type AuditRow"
  );
});

test("G2.3 — le lien donné au demandeur est absolu", () => {
  const url = reportUrlForAudit("11111111-2222-3333-4444-555555555555");
  assert.match(url, /^https?:\/\//, "un lien relatif ne se copie pas hors du navigateur — c'est pourtant tout ce qu'on demande au demandeur de faire");
  assert.ok(url.endsWith("/audit/11111111-2222-3333-4444-555555555555"), `le lien doit pointer sur l'audit demandé, reçu : ${url}`);
  assert.ok(!url.includes("//audit/"), `double slash dans ${url} : la base doit être normalisée`);
});

test("G2.4 — la copie dit les deux choses attendues, dans les deux langues", () => {
  for (const locale of ["fr", "en"] as const) {
    const copy = auditCopy[locale];
    for (const key of ["emailUndeliveredTitle", "emailUndeliveredBody", "emailUndeliveredLinkLabel"] as const) {
      const value = copy[key];
      assert.equal(typeof value, "string", `${locale}.${key} manquant`);
      assert.ok((value as string).trim().length > 0, `${locale}.${key} vide`);
    }
    // Le message doit annoncer l'échec ET rediriger vers le rapport : dire
    // seulement « erreur » laisserait le demandeur sans issue.
    assert.match(
      `${copy.emailUndeliveredTitle} ${copy.emailUndeliveredBody}`.toLowerCase(),
      locale === "fr" ? /rapport/ : /report/,
      `${locale} : le message doit nommer le rapport, pas seulement l'erreur`
    );
  }

  // Une chaîne française qui serait restée en anglais passerait les tests
  // d'existence : on vérifie que les deux locales DIFFÈRENT réellement.
  assert.notEqual(
    auditCopy.fr.emailUndeliveredTitle,
    auditCopy.en.emailUndeliveredTitle,
    "la version française est identique à l'anglaise : la traduction n'a pas été faite"
  );
});
