// Tout code d'erreur que l'API peut renvoyer doit avoir un message dans le front.
//
// POURQUOI CE FICHIER EXISTE (22/09/2026). Charles remplit le formulaire de sa
// propre landing et reçoit « Un problème est survenu. Réessaie dans un
// instant. » — avec ou sans email. Rien n'était en panne : la limite est d'UN
// diagnostic gratuit par email ET par site et par jour, et le refus partait en
// HTTP 429 avec une phrase en dur et AUCUN `error_code`. Le front ne sait
// mapper que des CODES ; sans code, il retombe sur son message générique.
//
// Le défaut n'est donc pas le quota, c'est le message : il dit à l'utilisateur
// de RECOMMENCER TOUT DE SUITE une action qui ne peut pas réussir avant 24 h,
// et il la présente comme une panne de notre côté. Le fondateur en a conclu que
// son produit était cassé. Un visiteur, lui, serait parti.
//
// La leçon est structurelle, pas ponctuelle : un `error_code` ajouté côté API
// sans ligne côté front ne casse RIEN, ne lève AUCUN test — il dégrade
// silencieusement le message en « réessaie dans un instant ». Ce fichier rend
// ce silence impossible : il lit les codes émis EN SOURCE par les deux routes
// du funnel et exige une entrée pour chacun, avec sa copy FR et EN.
//
// Fonctions pures, ZÉRO réseau, ZÉRO base. Lancer : npm test  (Node >= 23.6).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homeCopy, type Locale } from "@/lib/i18n";

const LOCALES = ["en", "fr"] as const satisfies readonly Locale[];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...segments: string[]) => readFileSync(resolve(repoRoot, ...segments), "utf8");

const homeClientSource = read("src", "app", "HomeClient.tsx");
const engineSource = read("src", "lib", "audit-engine.ts");
const routeSources = [
  ["src/app/api/capture-email/route.ts", read("src", "app", "api", "capture-email", "route.ts")],
  ["src/app/api/run-audit/route.ts", read("src", "app", "api", "run-audit", "route.ts")],
] as const;

/** Le bloc `gateMessages` de HomeClient, lu en source : c'est la table de
 *  mapping réelle, pas une liste recopiée dans le test. */
function mappedCodes(): string[] {
  const block = homeClientSource.match(/const gateMessages: Record<string, string> = \{([\s\S]*?)\};/);
  assert.ok(block, "le bloc gateMessages est introuvable dans HomeClient.tsx");
  return [...block[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
}

/** Les codes que le PRODUIT peut réellement émettre, lus dans les unions de
 *  types — jamais une liste écrite à la main, qui périmerait en silence. */
function emittedCodes(): string[] {
  const gate = engineSource.match(/export type WebsiteGateCode = ([^;]+);/);
  assert.ok(gate, "WebsiteGateCode introuvable");
  const quota = engineSource.match(/export type FreeAuditQuotaCode = ([^;]+);/);
  assert.ok(quota, "FreeAuditQuotaCode introuvable");
  const pick = (union: string) => [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  return [...pick(gate[1]), ...pick(quota[1])];
}

test("chaque code émis par l'API a un message dans le front", () => {
  const mapped = new Set(mappedCodes());
  const missing = emittedCodes().filter((code) => !mapped.has(code));
  assert.deepEqual(
    missing,
    [],
    `code(s) sans message : ${missing.join(", ")} — le front dirait « réessaie dans un instant » pour une erreur qui n'est pas passagère`
  );
});

test("le front ne mappe aucun code que l'API n'émet plus", () => {
  const emitted = new Set(emittedCodes());
  const stale = mappedCodes().filter((code) => !emitted.has(code));
  assert.deepEqual(stale, [], `mapping(s) mort(s) : ${stale.join(", ")}`);
});

test("les deux routes du funnel propagent le code du refus de quota", () => {
  for (const [label, source] of routeSources) {
    const refusal = source.match(/status: 429[\s\S]{0,40}/);
    assert.ok(refusal, `${label}: aucun refus 429 trouvé`);
    assert.match(
      source,
      /error_code: quota\.errorCode/,
      `${label}: le 429 doit porter error_code, sinon le front retombe sur le message générique`
    );
  }
});

for (const locale of LOCALES) {
  test(`${locale} — chaque message d'erreur mappé existe et ne renvoie pas à un réessai immédiat`, () => {
    const copy = homeCopy[locale] as unknown as Record<string, unknown>;
    for (const code of mappedCodes()) {
      // La clé de copy est déduite du code : free_quota_email -> errorFreeQuotaEmail.
      const key = "error" + code.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join("");
      const message = copy[key];
      assert.equal(typeof message, "string", `${locale}: ${key} manquant pour le code ${code}`);
      assert.ok((message as string).length > 20, `${locale}: ${key} est trop court pour être utile`);
    }
    // Le message des refus de quota doit dire QUAND revenir : « réessaie » seul
    // est exactement ce qui a fait croire à une panne.
    for (const key of ["errorFreeQuotaEmail", "errorFreeQuotaDomain"] as const) {
      assert.match(
        copy[key] as string,
        locale === "fr" ? /demain/i : /tomorrow/i,
        `${locale}: ${key} doit dire quand l'action redevient possible`
      );
    }
  });
}
