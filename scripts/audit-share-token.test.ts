// Jeton signé de partage d'un rapport d'audit — unitaires.
//
// Fonctions pures + `node:crypto`, ZÉRO base, ZÉRO réseau. Lancer : npm test.
//
// Ce qui est prouvé ici : l'aller-retour signe/vérifie, le fait qu'un jeton soit
// lié à UN audit, l'expiration, la falsification d'un seul caractère, et le
// fail-safe quand `AUDIT_SHARE_SECRET` est absent. Plus la PARITÉ du script
// `scripts/audit-share-url.mjs`, qui réimplémente le schéma et pourrait diverger.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  AUDIT_SHARE_TOKEN_PARAM,
  AUDIT_SHARE_TOKEN_TTL_DAYS,
  auditShareTokenState,
  auditShareUrl,
  signAuditShareToken,
  verifyAuditShareToken,
} from "@/lib/audit-share-token";

const SECRET = "secret-de-test-suffisamment-long-pour-un-hmac";
const AUDIT_A = "2422444f-4a92-458c-b5a9-6f280ef8e18d";
const AUDIT_B = "0f9a1c2b-1111-2222-3333-444455556666";
const DAY_MS = 86_400_000;

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const before = process.env.AUDIT_SHARE_SECRET;
  if (value === undefined) delete process.env.AUDIT_SHARE_SECRET;
  else process.env.AUDIT_SHARE_SECRET = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.AUDIT_SHARE_SECRET;
    else process.env.AUDIT_SHARE_SECRET = before;
  }
}

/** Change UN caractère de la signature, en gardant la longueur. */
function tamperSignature(token: string): string {
  const separator = token.indexOf(".");
  const expiry = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const first = signature[0];
  const replacement = first === "A" ? "B" : "A";
  return `${expiry}.${replacement}${signature.slice(1)}`;
}

test("aller-retour : un jeton fraîchement signé valide l'audit pour lequel il l'a été", () => {
  withSecret(SECRET, () => {
    const token = signAuditShareToken(AUDIT_A);
    assert.equal(verifyAuditShareToken(AUDIT_A, token), true);
  });
});

test("un jeton signé pour l'audit A ne valide PAS l'audit B", () => {
  withSecret(SECRET, () => {
    const token = signAuditShareToken(AUDIT_A);
    assert.equal(verifyAuditShareToken(AUDIT_B, token), false);
  });
});

test("un jeton expiré n'ouvre rien", () => {
  withSecret(SECRET, () => {
    const now = Date.UTC(2026, 7, 5);
    const token = signAuditShareToken(AUDIT_A, 30, now);

    assert.equal(verifyAuditShareToken(AUDIT_A, token, now + 29 * DAY_MS), true, "encore valide à J+29");
    assert.equal(verifyAuditShareToken(AUDIT_A, token, now + 31 * DAY_MS), false, "expiré à J+31");
  });
});

test("un jeton falsifié d'un seul caractère n'ouvre rien", () => {
  withSecret(SECRET, () => {
    const token = signAuditShareToken(AUDIT_A);
    const tampered = tamperSignature(token);

    assert.notEqual(tampered, token);
    assert.equal(tampered.length, token.length, "la falsification garde la longueur");
    assert.equal(verifyAuditShareToken(AUDIT_A, tampered), false);
  });
});

test("repousser l'expiration invalide la signature : elle est DANS la charge signée", () => {
  withSecret(SECRET, () => {
    const now = Date.UTC(2026, 7, 5);
    const token = signAuditShareToken(AUDIT_A, 1, now);
    const signature = token.slice(token.indexOf(".") + 1);
    const forged = `${Math.floor(now / 1000) + 10 * 86_400}.${signature}`;

    assert.equal(verifyAuditShareToken(AUDIT_A, forged, now), false);
  });
});

test("un jeton signé avec un AUTRE secret n'ouvre rien", () => {
  const token = withSecret(SECRET, () => signAuditShareToken(AUDIT_A));
  withSecret("un-tout-autre-secret-de-la-meme-famille", () => {
    assert.equal(verifyAuditShareToken(AUDIT_A, token), false);
  });
});

test("FAIL-SAFE : sans AUDIT_SHARE_SECRET, on ne signe pas et on ne vérifie rien", () => {
  const token = withSecret(SECRET, () => signAuditShareToken(AUDIT_A));

  withSecret(undefined, () => {
    assert.throws(() => signAuditShareToken(AUDIT_A), /AUDIT_SHARE_SECRET/);
    assert.equal(verifyAuditShareToken(AUDIT_A, token), false);
  });
  // Un secret vide ou blanc ne vaut jamais « pas de contrôle ».
  withSecret("", () => assert.equal(verifyAuditShareToken(AUDIT_A, token), false));
  withSecret("   ", () => assert.equal(verifyAuditShareToken(AUDIT_A, token), false));
});

test("les jetons malformés sont refusés sans lever", () => {
  withSecret(SECRET, () => {
    for (const value of [
      "",
      ".",
      "abc",
      "abc.def",
      ".signature",
      "1788000000.",
      "-1788000000.signature",
      "1788000000",
      "99999999999999999999.signature",
      null,
      undefined,
    ]) {
      assert.equal(verifyAuditShareToken(AUDIT_A, value as string | null | undefined), false, JSON.stringify(value));
    }
  });
});

test("auditShareUrl produit /audit/<id>?k=<jeton> et le jeton se vérifie", () => {
  withSecret(SECRET, () => {
    const url = new URL(auditShareUrl("https://www.getpick.ai", AUDIT_A));

    assert.equal(url.pathname, `/audit/${AUDIT_A}`);
    const token = url.searchParams.get(AUDIT_SHARE_TOKEN_PARAM);
    assert.ok(token, "le paramètre de partage est présent");
    assert.equal(verifyAuditShareToken(AUDIT_A, token), true);
  });
});

test("la validité par défaut est de 30 jours", () => {
  withSecret(SECRET, () => {
    assert.equal(AUDIT_SHARE_TOKEN_TTL_DAYS, 30);
    const now = Date.UTC(2026, 7, 5);
    const expiry = Number.parseInt(signAuditShareToken(AUDIT_A, undefined, now).split(".")[0], 10);
    assert.equal(expiry, Math.floor(now / 1000) + 30 * 86_400);
  });
});

test("PARITÉ : le lien produit par scripts/audit-share-url.mjs est reconnu par le serveur", () => {
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "audit-share-url.mjs");
  const stdout = execFileSync(process.execPath, [scriptPath, AUDIT_A], {
    encoding: "utf8",
    env: { ...process.env, AUDIT_SHARE_SECRET: SECRET, AUDIT_SHARE_BASE_URL: "https://www.getpick.ai" },
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

  const url = new URL(stdout);
  assert.equal(url.pathname, `/audit/${AUDIT_A}`);
  withSecret(SECRET, () => {
    assert.equal(verifyAuditShareToken(AUDIT_A, url.searchParams.get(AUDIT_SHARE_TOKEN_PARAM)), true);
    assert.equal(verifyAuditShareToken(AUDIT_B, url.searchParams.get(AUDIT_SHARE_TOKEN_PARAM)), false);
  });
});

// --- États du jeton : « expiré » n'est pas « falsifié » ----------------------
// Le booléen les confondait. La distinction porte une décision produit (un lien
// de prospection expiré ouvre la porte de capture, un jeton bricolé non), donc
// elle se prouve ici, à la source, et pas seulement chez son appelant.

test("auditShareTokenState : un jeton frais est `valid`, le même est `expired` passé son TTL", () => {
  withSecret(SECRET, () => {
    const now = Date.UTC(2026, 8, 6, 10, 0, 0);
    const token = signAuditShareToken(AUDIT_A, 30, now);
    assert.equal(auditShareTokenState(AUDIT_A, token, now), "valid");
    assert.equal(auditShareTokenState(AUDIT_A, token, now + 29 * DAY_MS), "valid", "encore valide à J+29");
    assert.equal(auditShareTokenState(AUDIT_A, token, now + 31 * DAY_MS), "expired", "expiré à J+31");
    // Et le booléen historique dit toujours la même chose que l'état.
    assert.equal(verifyAuditShareToken(AUDIT_A, token, now + 31 * DAY_MS), false);
  });
});

test("auditShareTokenState : une signature falsifiée est `invalid`, JAMAIS `expired`", () => {
  withSecret(SECRET, () => {
    const now = Date.UTC(2026, 8, 6, 10, 0, 0);
    // Le piège exact du lot : un jeton daté d'HIER et signé n'importe comment.
    // S'il ressortait « expiré », il ouvrirait la porte de capture d'un rapport
    // payant à qui sait écrire un timestamp.
    const perime = signAuditShareToken(AUDIT_A, 30, now - 40 * DAY_MS);
    assert.equal(auditShareTokenState(AUDIT_A, perime, now), "expired", "témoin : celui-là est vraiment expiré");
    assert.equal(auditShareTokenState(AUDIT_A, tamperSignature(perime), now), "invalid");
    // Signé pour un AUTRE audit : invalide, pas expiré, même si la date est bonne.
    const pourB = signAuditShareToken(AUDIT_B, 30, now);
    assert.equal(auditShareTokenState(AUDIT_A, pourB, now), "invalid");
  });
});

test("auditShareTokenState : absence, forme cassée et secret manquant ont chacun leur état", () => {
  withSecret(SECRET, () => {
    assert.equal(auditShareTokenState(AUDIT_A, undefined), "absent");
    assert.equal(auditShareTokenState(AUDIT_A, null), "absent");
    assert.equal(auditShareTokenState(AUDIT_A, ""), "absent");
    assert.equal(auditShareTokenState(AUDIT_A, "sans-point"), "malformed");
    assert.equal(auditShareTokenState(AUDIT_A, ".signature-sans-date"), "malformed");
    assert.equal(auditShareTokenState(AUDIT_A, "1790671309."), "malformed");
    assert.equal(auditShareTokenState(AUDIT_A, "pas-un-nombre.abc"), "malformed");
    assert.equal(auditShareTokenState("", "1790671309.abc"), "invalid");
  });
  // Sans secret on ne reconnaît rien comme nôtre : surtout pas « expiré ».
  const token = withSecret(SECRET, () => signAuditShareToken(AUDIT_A));
  withSecret(undefined, () => assert.equal(auditShareTokenState(AUDIT_A, token), "invalid"));
  withSecret("", () => assert.equal(auditShareTokenState(AUDIT_A, token), "invalid"));
});
