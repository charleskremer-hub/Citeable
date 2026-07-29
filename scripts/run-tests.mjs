#!/usr/bin/env node
/**
 * Lanceur de la suite `node --test`, avec vérification EXPLICITE de la version
 * de Node avant de lancer quoi que ce soit.
 *
 * Pourquoi ce fichier existe. La commande réelle porte deux exigences qui ne
 * sont satisfaites que par un Node récent :
 *   - le *type stripping* activé par défaut (import direct des `.test.ts` et du
 *     code applicatif TypeScript) → Node >= 23.6 ;
 *   - `--experimental-test-module-mocks` (`mock.module`, indispensable pour
 *     importer un `route.ts` sans ouvrir de connexion Postgres) → Node >= 22.3.
 *
 * Sur un Node trop ancien, `npm test` répondait `node: bad option:
 * --experimental-test-module-mocks`, exit non nul, ZÉRO test exécuté — un échec
 * de toolchain strictement indistinguable d'un échec de suite pour qui lit le
 * code de sortie. Le garde-fou de vérification devenait un faux rouge.
 *
 * On ne déclare pas `engines` dans `package.json` : ce champ contraindrait aussi
 * le runtime choisi par Vercel pour le BUILD et le RUNTIME de l'application,
 * lesquels n'ont besoin d'aucune de ces deux fonctionnalités. La contrainte est
 * celle de l'outillage de test, elle est donc portée par l'outillage de test.
 * `.nvmrc` donne la version attendue en local.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_NODE = [23, 6, 0];

function parseVersion(value) {
  return value
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isOlderThan(current, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if ((current[index] ?? 0) < minimum[index]) return true;
    if ((current[index] ?? 0) > minimum[index]) return false;
  }
  return false;
}

if (isOlderThan(parseVersion(process.versions.node), MIN_NODE)) {
  console.error(
    [
      `Node ${MIN_NODE.join(".")} minimum est requis pour lancer les tests (détecté : ${process.versions.node}).`,
      "",
      "Raisons : type stripping des .ts activé par défaut (>= 23.6) et",
      "--experimental-test-module-mocks (>= 22.3).",
      "",
      "AUCUN TEST N'A ÉTÉ EXÉCUTÉ — ce n'est pas un échec de la suite.",
      "Corriger avec : nvm use   (voir .nvmrc)",
    ].join("\n")
  );
  process.exit(1);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const child = spawn(
  process.execPath,
  [
    "--test",
    "--experimental-test-module-mocks",
    "--import",
    "./scripts/test-loader.mjs",
    ...(process.argv.slice(2).length ? process.argv.slice(2) : ["scripts/**/*.test.ts"]),
  ],
  { cwd: repoRoot, stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
