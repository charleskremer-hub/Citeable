#!/usr/bin/env node
/**
 * Instrument de mesure avant merge/déploiement — pas un outil, pas une CI.
 *
 * POURQUOI CE SCRIPT EXISTE. Cinq commits testés (`40417a1` lien signé,
 * `af4238b` gate, `0fd47bc` verdict 3 blocs, `aa00943` impact/phase, `f41db71`
 * basedOn) forment une chaîne linéaire prête à merger, et deux pièges MESURÉS
 * rendent ce merge dangereux si personne ne les vérifie au moment de cliquer :
 *
 *   1. `AUDIT_SHARE_SECRET` est absent de `outbound/keys.env` (0 occurrence,
 *      confirmé plusieurs jours de suite). `src/lib/audit-share-token.ts`
 *      refuse de signer ET de vérifier sans lui (fail-safe fermé), et
 *      `src/lib/report-access.ts` verrouille tout audit en tier payant sans
 *      abonnement ni jeton. Déployer le gate sans ce secret ferme le rapport
 *      pour tout le monde, y compris les prospects qui n'ont rien demandé.
 *   2. Les liens de prospection déjà envoyés (`outbound/ENVOI_*.md`) sont des
 *      URL NUES vers `/audit/<id>`, sans `?k=` : mesuré 8 occurrences, 0 avec
 *      un jeton, sur le lot 1. Le jour où le gate part en prod, ces liens
 *      n'ouvrent plus un rapport mais une porte de paiement, pour un prospect
 *      qui a cliqué un lien qu'ON lui a envoyé.
 *
 * Personne ne peut tenir ces deux vérifications de tête au moment de merger.
 * Ce script les dit, avec un verdict binaire et la commande exacte qui lève
 * chaque blocage.
 *
 * CE QUE CE SCRIPT NE FAIT JAMAIS : il n'écrit aucun fichier, ne lance aucune
 * commande git mutante (pas de checkout/merge/push/commit/stash), n'appelle
 * aucun réseau, et n'imprime jamais la VALEUR d'un secret — seulement son
 * état (présent / absent / masqué). Un contrôle qui ne peut pas conclure
 * (commande absente, origin injoignable) rend INDÉTERMINÉ et compte comme
 * BLOQUANT : aucun chiffre n'est inventé pour combler un blanc.
 *
 * USAGE
 *   node scripts/preflight-merge.mjs           rapport lisible + process.exit
 *   node scripts/preflight-merge.mjs --json     même résultat, en JSON pur sur stdout
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// --- Statuts -----------------------------------------------------------------

export const STATUT = Object.freeze({
  OK: "OK",
  AVERTISSEMENT: "AVERTISSEMENT",
  BLOQUANT: "BLOQUANT",
  INDETERMINE: "INDÉTERMINÉ",
});

/** BLOQUANT et INDÉTERMINÉ bloquent tous les deux le verdict : jamais d'OK par défaut. */
function isBlocking(statut) {
  return statut === STATUT.BLOQUANT || statut === STATUT.INDETERMINE;
}

/** Un seul contrôle bloquant ou indéterminé suffit à faire basculer en NO-GO. */
export function aggregateVerdict(checks) {
  return checks.some((check) => isBlocking(check.statut)) ? "NO-GO" : "GO";
}

// --- Contrôle 1 : chaîne de commits linéaire ---------------------------------

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) return { ok: false, stdout: "", stderr: String(result.error.message) };
  return { ok: result.status === 0, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim() };
}

export function checkCommitChain(cwd = process.cwd()) {
  const id = "commits";
  const nom = "Chaîne de commits linéaire";

  const inside = runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok || inside.stdout !== "true") {
    return {
      id,
      nom,
      statut: STATUT.INDETERMINE,
      details: [
        "Git est indisponible ici, ou ce dossier n'est pas un dépôt (git rev-parse --is-inside-work-tree a échoué).",
        "Lancer ce script depuis le dépôt getpick réel, avec origin/main accessible.",
      ],
      commande: "git rev-parse --is-inside-work-tree",
    };
  }

  const originMain = runGit(["rev-parse", "--verify", "origin/main"], cwd);
  if (!originMain.ok) {
    return {
      id,
      nom,
      statut: STATUT.INDETERMINE,
      details: [
        "origin/main est injoignable ou absent localement (git rev-parse --verify origin/main a échoué).",
        "Impossible de savoir ce qui va réellement partir en prod sans cette référence.",
      ],
      commande: "git fetch origin main",
    };
  }

  const countResult = runGit(["rev-list", "--count", "origin/main..HEAD"], cwd);
  const count = countResult.ok ? Number.parseInt(countResult.stdout, 10) : Number.NaN;
  if (!Number.isFinite(count)) {
    return {
      id,
      nom,
      statut: STATUT.INDETERMINE,
      details: ["Impossible de compter les commits en avance sur origin/main (git rev-list --count a échoué)."],
      commande: "git rev-list --count origin/main..HEAD",
    };
  }

  const logResult = runGit(["log", "--reverse", "--oneline", "origin/main..HEAD"], cwd);
  const commitLines = logResult.ok && logResult.stdout ? logResult.stdout.split("\n") : [];

  const branchesResult = runGit(["for-each-ref", "--format=%(refname:short)", "refs/heads/squad/*"], cwd);
  const branches = branchesResult.ok && branchesResult.stdout ? branchesResult.stdout.split("\n").filter(Boolean) : [];

  const orphanBranches = [];
  for (const branch of branches) {
    const branchAhead = runGit(["rev-list", "--count", `origin/main..${branch}`], cwd);
    const aheadCount = branchAhead.ok ? Number.parseInt(branchAhead.stdout, 10) : Number.NaN;
    if (!Number.isFinite(aheadCount) || aheadCount === 0) continue; // rien sur cette branche qu'on ne merge déjà
    const ancestor = runGit(["merge-base", "--is-ancestor", branch, "HEAD"], cwd);
    if (!ancestor.ok) orphanBranches.push(branch);
  }

  const details = [
    `${count} commit(s) vont partir en prod (origin/main..HEAD) :`,
    ...(commitLines.length ? commitLines.map((line) => `  ${line}`) : ["  (aucun — HEAD est déjà égal à origin/main)"]),
  ];

  if (orphanBranches.length > 0) {
    details.push(
      "",
      `Branche(s) squad/* avec du travail NON contenu dans HEAD — ce travail serait PERDU par ce merge : ${orphanBranches.join(", ")}`
    );
    return {
      id,
      nom,
      statut: STATUT.BLOQUANT,
      details,
      commande: `git merge-base --is-ancestor ${orphanBranches[0]} HEAD`,
    };
  }

  return { id, nom, statut: STATUT.OK, details, commande: null };
}

// --- Contrôle 2 : AUDIT_SHARE_SECRET ------------------------------------------

/** `[SENSITIVE]` est le masque posé par `vercel env pull` sur les variables sensibles — pas un secret. */
const MASKED_VALUE = "[SENSITIVE]";

/** Absent, vide et masqué rendent tous `null` : aucun des trois n'est un secret utilisable. */
export function normalizeSecretValue(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === MASKED_VALUE) return null;
  return trimmed;
}

/**
 * Lit `key` dans le contenu d'un fichier `.env` simple (`CLE=valeur`, un couple
 * par ligne, `#` et lignes vides ignorées). Ne coupe que sur le PREMIER `=` :
 * une valeur qui contient elle-même un `=` reste intacte.
 */
export function readKeysEnvValue(content, key) {
  if (typeof content !== "string") return null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const lineKey = line.slice(0, eq).trim();
    if (lineKey !== key) continue;
    return normalizeSecretValue(line.slice(eq + 1));
  }
  return null;
}

const SECRET_KEY = "AUDIT_SHARE_SECRET";
const GEN_SECRET_CMD = "node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"";

/**
 * `process.env` est typé `NodeJS.ProcessEnv`, dont `NODE_ENV` est REQUIS dans ce
 * dépôt. Sans cette annotation, tout appelant qui passe un environnement
 * partiel — c'est-à-dire chaque test de cette fonction — est une erreur TS2345.
 * Ce n'est pas cosmétique : `next build` type-vérifie aussi le dossier `scripts`
 * (le `include` du tsconfig couvre tous les fichiers TypeScript du dépôt, et
 * `next.config.ts` ne pose pas `ignoreBuildErrors`), donc ces erreurs FONT
 * ÉCHOUER LE BUILD DE PRODUCTION. Elles ne sont vues ni par la suite de tests
 * ni par eslint.
 *
 * @param {Record<string, string | undefined>} processEnv
 * @param {string} cwd
 */
export function checkAuditShareSecret(processEnv = process.env, cwd = process.cwd()) {
  const id = "secret";
  const nom = "AUDIT_SHARE_SECRET présent et utilisable";

  const fromEnv = normalizeSecretValue(processEnv[SECRET_KEY]);
  if (fromEnv) {
    return { id, nom, statut: STATUT.OK, details: ["Présent dans process.env (valeur non affichée)."], commande: null };
  }

  const keysEnvPath = resolve(cwd, "outbound", "keys.env");
  let content = null;
  try {
    content = readFileSync(keysEnvPath, "utf8");
  } catch {
    content = null;
  }

  const fromFile = content !== null ? readKeysEnvValue(content, SECRET_KEY) : null;
  if (fromFile) {
    return { id, nom, statut: STATUT.OK, details: ["Présent dans outbound/keys.env (valeur non affichée)."], commande: null };
  }

  const raison =
    content === null
      ? "outbound/keys.env est introuvable, et AUDIT_SHARE_SECRET n'est pas dans l'environnement."
      : "AUDIT_SHARE_SECRET est absent, vide, ou masqué (\"[SENSITIVE]\") dans outbound/keys.env, et absent de l'environnement.";

  return {
    id,
    nom,
    statut: STATUT.BLOQUANT,
    details: [
      raison,
      "Déployer le gate sans ce secret verrouille TOUS les rapports d'audit pour tout le monde : signature et vérification refusent sans lui (fail-safe fermé, src/lib/audit-share-token.ts).",
      `Générer un secret : ${GEN_SECRET_CMD}`,
      "Le poser dans outbound/keys.env, ET SÉPARÉMENT dans l'environnement Vercel (Project Settings → Environment Variables) — keys.env seul ne suffit pas en production.",
    ],
    commande: GEN_SECRET_CMD,
  };
}

// --- Contrôle 3 : liens de prospection nus -------------------------------------

// Le préfixe `[\w.:/-]*` ne capture QUE des caractères plausibles dans une URL
// (lettres, chiffres, `.`, `:`, `/`, `-`) : il s'arrête net sur un guillemet ou
// un `<`, ce qui isole l'URL propre même collée dans du markdown ou du HTML
// (`[texte](url)`, `href="url"`). Capture aussi bien une URL complète
// (https://www.getpick.ai/audit/…) qu'un chemin relatif (/audit/…).
const AUDIT_LINK_RE = /[\w.:/-]*\/audit\/[A-Za-z0-9_-]+(?:\?[^\s"'<>)\]]*)?/g;

// Ponctuation de fin de phrase ou de markdown qui se colle parfois à l'URL
// (`.`, `,`, `)`, `]`, guillemets…) et n'en fait pas partie.
const TRAILING_PUNCTUATION_RE = /[)\].,;:'">]+$/;

/** Trouve toute occurrence `/audit/<id>` dans `text`, et dit si elle porte `?k=…`. */
export function scanAuditLinks(text) {
  if (typeof text !== "string") return [];
  const matches = text.match(AUDIT_LINK_RE) ?? [];
  return matches.map((raw) => {
    const url = raw.replace(TRAILING_PUNCTUATION_RE, "");
    return { url, signed: /[?&]k=[^&\s]/.test(url) };
  });
}

// Un même audit apparaît souvent DEUX fois dans un envoi : une fois en chemin
// relatif (/audit/<id>), une fois en URL complète (https://.../audit/<id>).
// Ce sont deux OCCURRENCES du même AUDIT, pas deux audits distincts.
const AUDIT_ID_RE = /\/audit\/([A-Za-z0-9_-]+)/;

/** Extrait l'identifiant d'audit (segment après `/audit/`) d'une URL scannée par `scanAuditLinks`. */
export function extractAuditId(url) {
  if (typeof url !== "string") return null;
  const match = AUDIT_ID_RE.exec(url);
  return match ? match[1] : null;
}

/**
 * Regroupe des liens (sortie de `scanAuditLinks`) par identifiant d'audit.
 * Un identifiant compte comme SIGNÉ seulement si TOUTES ses occurrences
 * portent `?k=…` ; une seule occurrence nue suffit à classer l'audit entier
 * comme nu — c'est celle-là qui cassera pour le prospect qui clique dessus.
 * Ordre de sortie : ordre de première apparition dans `links`.
 */
export function groupLinksByAuditId(links) {
  const order = [];
  const byId = new Map();
  for (const link of links) {
    const id = extractAuditId(link.url) ?? link.url;
    let entry = byId.get(id);
    if (!entry) {
      entry = { id, occurrences: 0, signed: true };
      byId.set(id, entry);
      order.push(id);
    }
    entry.occurrences += 1;
    if (!link.signed) entry.signed = false;
  }
  return order.map((id) => byId.get(id));
}

/**
 * Classe la gravité d'un fichier selon ses AUDITS DISTINCTS, pas selon ses
 * occurrences textuelles (un même audit posté en chemin relatif ET en URL
 * complète compte pour un seul audit — voir `groupLinksByAuditId`). Un
 * fichier `ENVOI_*` est un envoi RÉEL déjà parti — un audit nu dedans est
 * BLOQUANT. Ailleurs (drafts, comptes rendus), c'est un AVERTISSEMENT.
 */
export function classifyOutboundFile(filename, links) {
  const groups = groupLinksByAuditId(links);
  const nakedGroups = groups.filter((group) => !group.signed);
  const naked = nakedGroups.length;
  const distinctAudits = groups.length;
  const nakedIds = nakedGroups.map((group) => group.id);
  if (naked === 0) return { statut: STATUT.OK, naked, total: links.length, distinctAudits, nakedIds };
  const isRealSend = basename(filename).startsWith("ENVOI_");
  return {
    statut: isRealSend ? STATUT.BLOQUANT : STATUT.AVERTISSEMENT,
    naked,
    total: links.length,
    distinctAudits,
    nakedIds,
  };
}

const REGEN_LINK_CMD = "AUDIT_SHARE_SECRET=… node scripts/audit-share-url.mjs <audit_id>";

export function checkOutboundLinks(cwd = process.cwd()) {
  const id = "liens";
  const nom = "Aucun lien de prospection nu";
  const outboundDir = resolve(cwd, "outbound");

  let entries = [];
  try {
    entries = readdirSync(outboundDir, { withFileTypes: true });
  } catch {
    return { id, nom, statut: STATUT.OK, details: ["Aucun dossier outbound/ trouvé — rien à scanner."], commande: null };
  }

  const files = entries
    .filter((entry) => entry.isFile() && /\.(md|html)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const details = [];
  const fichiers = [];
  let worstStatut = STATUT.OK;

  for (const name of files) {
    const content = readFileSync(resolve(outboundDir, name), "utf8");
    const links = scanAuditLinks(content);
    if (links.length === 0) continue;
    const classification = classifyOutboundFile(name, links);
    // Signé(s) compté en AUDITS DISTINCTS, symétrique à classification.naked
    // (lui aussi en audits distincts) — jamais un mélange audits/occurrences.
    const signedAudits = classification.distinctAudits - classification.naked;
    details.push(
      `  outbound/${name} : ${classification.distinctAudits} audit(s) distinct(s) sur ${classification.total} occurrence(s) — ${signedAudits} signé(s), ${classification.naked} nu(s) [${classification.statut}]`
    );
    fichiers.push({
      fichier: `outbound/${name}`,
      auditsDistincts: classification.distinctAudits,
      occurrences: classification.total,
      identifiantsNus: classification.nakedIds,
      statut: classification.statut,
    });
    if (classification.statut === STATUT.BLOQUANT) worstStatut = STATUT.BLOQUANT;
    else if (classification.statut === STATUT.AVERTISSEMENT && worstStatut !== STATUT.BLOQUANT) worstStatut = STATUT.AVERTISSEMENT;
  }

  if (details.length === 0) details.push("Aucune URL /audit/ trouvée dans outbound/*.md ou outbound/*.html.");
  if (worstStatut !== STATUT.OK) details.push("", `Régénérer un lien signé : ${REGEN_LINK_CMD}`);

  return {
    id,
    nom,
    statut: worstStatut,
    details,
    commande: worstStatut !== STATUT.OK ? REGEN_LINK_CMD : null,
    fichiers,
  };
}

// --- Contrôle 4 : suite de tests ----------------------------------------------

/** Lit le résumé `node --test` (`ℹ pass N` / `ℹ fail N`). `null` si illisible — jamais un chiffre inventé. */
export function parseTestCounts(output) {
  const passMatch = /^ℹ pass (\d+)/m.exec(output);
  const failMatch = /^ℹ fail (\d+)/m.exec(output);
  if (!passMatch || !failMatch) return null;
  const totalMatch = /^ℹ tests (\d+)/m.exec(output);
  return {
    pass: Number.parseInt(passMatch[1], 10),
    fail: Number.parseInt(failMatch[1], 10),
    total: totalMatch ? Number.parseInt(totalMatch[1], 10) : null,
  };
}

export function checkTestSuite(cwd = process.cwd()) {
  const id = "tests";
  const nom = "Suite de tests verte";
  const commande = "node scripts/run-tests.mjs";

  const result = spawnSync(process.execPath, ["scripts/run-tests.mjs"], { cwd, encoding: "utf8" });
  if (result.error || result.status === null) {
    return {
      id,
      nom,
      statut: STATUT.INDETERMINE,
      details: ["Impossible de lancer node scripts/run-tests.mjs (processus introuvable ou interrompu)."],
      commande,
    };
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const counts = parseTestCounts(output);
  const countsLine = counts
    ? `${counts.pass} pass / ${counts.fail} fail${counts.total !== null ? ` sur ${counts.total} tests` : ""}.`
    : "le décompte pass/fail n'a pas pu être lu dans la sortie.";

  if (result.status !== 0) {
    return { id, nom, statut: STATUT.BLOQUANT, details: [`node scripts/run-tests.mjs a quitté avec le code ${result.status}.`, countsLine], commande };
  }

  return { id, nom, statut: STATUT.OK, details: [countsLine], commande: null };
}

// --- Contrôle 5 : lint ---------------------------------------------------------

/** Lit le résumé standard d'eslint (`N problems (E errors, W warnings)`). `null` si illisible. */
export function parseEslintSummary(output) {
  const match = /(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/.exec(output);
  if (!match) return null;
  return { problems: Number.parseInt(match[1], 10), errors: Number.parseInt(match[2], 10), warnings: Number.parseInt(match[3], 10) };
}

export function checkLint(cwd = process.cwd()) {
  const id = "lint";
  const nom = "Lint";
  const commande = "npx eslint";

  const localBin = resolve(cwd, "node_modules", ".bin", "eslint");
  const useLocalBin = existsSync(localBin);
  const bin = useLocalBin ? localBin : "npx";
  const args = useLocalBin ? [] : ["--no-install", "eslint"];

  const result = spawnSync(bin, args, { cwd, encoding: "utf8" });
  if (result.error) {
    return {
      id,
      nom,
      statut: STATUT.INDETERMINE,
      details: ["eslint est introuvable (ni node_modules/.bin/eslint, ni npx --no-install eslint)."],
      commande,
    };
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const summary = parseEslintSummary(output);

  if (summary) {
    if (summary.errors > 0) {
      return { id, nom, statut: STATUT.BLOQUANT, details: [`${summary.problems} problème(s) : ${summary.errors} erreur(s), ${summary.warnings} avertissement(s).`], commande };
    }
    if (summary.warnings > 0) {
      return { id, nom, statut: STATUT.AVERTISSEMENT, details: [`${summary.problems} problème(s) : 0 erreur, ${summary.warnings} avertissement(s).`], commande };
    }
    return { id, nom, statut: STATUT.OK, details: ["0 erreur, 0 avertissement."], commande: null };
  }

  // Résumé illisible : on se fie au seul code de sortie, sans inventer de chiffre.
  if (result.status !== 0) {
    return {
      id,
      nom,
      statut: STATUT.BLOQUANT,
      details: ["eslint a quitté avec un code non nul, mais le décompte erreurs/avertissements n'a pas pu être lu dans la sortie."],
      commande,
    };
  }
  return { id, nom, statut: STATUT.OK, details: ["eslint a quitté avec le code 0 (résumé non standard, décompte non lu)."], commande: null };
}

// --- Contrôle 6 : type-check TypeScript (tsc --noEmit) -------------------------

/**
 * POURQUOI CE CONTRÔLE EXISTE — et pourquoi il est au même rang que les autres.
 * Le 14/08/2026, ce préflight a rendu un verdict sur une chaîne qui portait 4
 * erreurs TS2345 dans `scripts/preflight-merge.test.ts`, et AUCUN de ses
 * contrôles ne les voyait :
 *   - `node scripts/run-tests.mjs` ne les voit pas : le type stripping de Node
 *     SUPPRIME les annotations de type sans jamais les vérifier ;
 *   - `npx eslint .` ne les voit pas : eslint ne type-vérifie pas ;
 *   - or `next build` type-vérifie AUSSI le dossier `scripts/` (le `include` du
 *     tsconfig couvre tous les `.ts` du dépôt et `next.config.ts` ne pose pas
 *     `ignoreBuildErrors`), donc ces erreurs FONT ÉCHOUER LE BUILD DE PRODUCTION.
 * Cinq runs consécutifs ont donc écrit « prêt à merger » sur une chaîne qui
 * n'aurait pas buildé. C'est la seule classe d'erreur qui faisait réellement
 * échouer le déploiement, et c'était le seul angle mort de l'instrument.
 */

/** Au-delà, on renonce à MESURER plutôt que de faire attendre le préflight sans fin. */
export const TYPECHECK_TIMEOUT_MS = 180_000;

/** Nombre maximum de lignes de diagnostic tsc recopiées dans le rapport. */
export const TYPECHECK_MAX_LINES = 10;

const TYPECHECK_CMD = "npx tsc --noEmit";

/**
 * Ce que ce contrôle mesure, et que RIEN d'autre dans ce préflight ne mesure.
 * Affiché dès que le contrôle n'est pas OK : un lecteur qui voit ce blocage doit
 * comprendre en une lecture pourquoi il compte, sans aller chercher ailleurs.
 */
const TYPECHECK_POURQUOI = Object.freeze([
  "Pourquoi ça compte : `next build` type-vérifie AUSSI le dossier scripts/ — le `include` du tsconfig couvre tous les .ts du dépôt et next.config.ts ne pose pas `ignoreBuildErrors`. Une erreur de type ici FAIT ÉCHOUER LE BUILD DE PRODUCTION.",
  "Et rien d'autre ici ne la voit : `node scripts/run-tests.mjs` SUPPRIME les types sans les vérifier (type stripping de Node), et `npx eslint .` ne type-vérifie pas. Sans ce contrôle, le préflight rend GO sur une chaîne qui ne build pas.",
]);

/** Une ligne de diagnostic tsc en mode non-pretty : `fichier(ligne,col): error TS1234: message`. */
const TSC_ERROR_LINE_RE = /(?:^|\s)error TS\d+/;

/**
 * Extrait les lignes d'erreur de la sortie de `tsc --pretty false`.
 * Aucun chiffre inventé : on compte exactement les lignes qu'on sait lire.
 *
 * @param {string} output
 * @returns {string[]}
 */
export function extractTscErrorLines(output) {
  if (typeof output !== "string") return [];
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => TSC_ERROR_LINE_RE.test(line));
}

/**
 * Résultat brut d'une tentative d'exécution de tsc.
 * `ran: false` veut dire « je n'ai PAS pu mesurer », pas « 0 erreur ».
 *
 * @typedef {{ ran: boolean, timedOut: boolean, status: number | null, output: string, raison: string | null }} TypecheckRun
 */

/**
 * Lance `tsc --noEmit`.
 * `--incremental false` : ce script n'écrit AUCUN fichier, pas même un
 * `tsconfig.tsbuildinfo` (et deux préflights concurrents ne se marchent pas
 * dessus). `--pretty false` : une erreur = une ligne, lisible et comptable.
 *
 * @param {string} cwd
 * @returns {TypecheckRun}
 */
function runTypecheckCommand(cwd) {
  const localBin = resolve(cwd, "node_modules", ".bin", "tsc");
  const useLocalBin = existsSync(localBin);
  const bin = useLocalBin ? localBin : "npx";
  const tscArgs = ["--noEmit", "--incremental", "false", "--pretty", "false"];
  const args = useLocalBin ? tscArgs : ["--no-install", "tsc", ...tscArgs];

  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    timeout: TYPECHECK_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const secondes = Math.round(TYPECHECK_TIMEOUT_MS / 1000);

  if (result.error) {
    const timedOut = /** @type {NodeJS.ErrnoException} */ (result.error).code === "ETIMEDOUT";
    return {
      ran: false,
      timedOut,
      status: null,
      output,
      raison: timedOut
        ? `tsc n'a rien rendu en moins de ${secondes} s et a été interrompu.`
        : `tsc est introuvable ou n'a pas pu s'exécuter (${result.error.message}).`,
    };
  }
  if (result.status === null) {
    return {
      ran: false,
      timedOut: true,
      status: null,
      output,
      raison: `tsc a été interrompu avant de rendre un résultat (signal ${result.signal ?? "inconnu"}, délai ${secondes} s).`,
    };
  }
  return { ran: true, timedOut: false, status: result.status, output, raison: null };
}

/**
 * Traduit une exécution de tsc en contrôle.
 *
 * INVARIANT : un tsc qui n'a pas pu MESURER ne rend JAMAIS [OK]. Un instrument
 * silencieux n'est pas un feu vert — c'est exactement la faute que ce contrôle
 * corrige. Il rend AVERTISSEMENT et dit noir sur blanc qu'il n'a pas mesuré.
 *
 * @param {TypecheckRun | null | undefined} run
 */
export function classifyTypecheckRun(run) {
  const id = "types";
  const nom = "Type-check TypeScript (npx tsc --noEmit)";

  const nonMesure = (raison) => ({
    id,
    nom,
    statut: STATUT.AVERTISSEMENT,
    details: [
      `Ce contrôle N'A PAS PU MESURER le type-check : ${raison}`,
      "Aucune erreur n'a donc été comptée. Ce n'est PAS un « 0 erreur », et ce contrôle ne vaut pas feu vert : à relancer à la main avant de merger.",
      ...TYPECHECK_POURQUOI,
    ],
    commande: TYPECHECK_CMD,
    erreurs: /** @type {number | null} */ (null),
  });

  if (!run || run.ran !== true) {
    return nonMesure(run?.raison ?? "tsc n'a pas pu être exécuté.");
  }

  const lignes = extractTscErrorLines(run.output);
  const erreurs = lignes.length;

  if (erreurs > 0) {
    const montrees = lignes.slice(0, TYPECHECK_MAX_LINES);
    const details = [
      `${erreurs} erreur(s) de type relevée(s) par ${TYPECHECK_CMD} (code de sortie ${run.status}).`,
      ...montrees.map((ligne) => `  ${ligne}`),
    ];
    if (erreurs > montrees.length) {
      details.push(`  … et ${erreurs - montrees.length} autre(s) ligne(s) — tout voir avec : ${TYPECHECK_CMD}`);
    }
    details.push("", ...TYPECHECK_POURQUOI);
    return { id, nom, statut: STATUT.BLOQUANT, details, commande: TYPECHECK_CMD, erreurs };
  }

  if (run.status !== 0) {
    return nonMesure(
      `tsc a quitté avec le code ${run.status} sans qu'aucune ligne « error TSxxxx » soit lisible dans sa sortie (binaire absent, configuration illisible…).`
    );
  }

  return {
    id,
    nom,
    statut: STATUT.OK,
    details: [`0 erreur de type sur l'ensemble du dépôt (${TYPECHECK_CMD}, code de sortie 0).`],
    commande: null,
    erreurs,
  };
}

/**
 * @param {string} cwd
 * @param {(cwd: string) => TypecheckRun} runTsc  injecté par les tests ; en vrai, tsc.
 */
export function checkTypecheck(cwd = process.cwd(), runTsc = runTypecheckCommand) {
  return classifyTypecheckRun(runTsc(cwd));
}

// --- Contrôle 7 : rappel e2e Playwright, non automatisé -----------------------

export function checkPlaywrightReminder() {
  return {
    id: "e2e",
    nom: "e2e Playwright — rappel non automatisé",
    statut: STATUT.AVERTISSEMENT,
    details: [
      "npx playwright test n'a PAS été exécuté par ce script : il exige un serveur Next et Postgres, que ce script ne lance pas.",
      "À lancer À LA MAIN avant tout déploiement.",
    ],
    commande: "npx playwright test",
  };
}

// --- Rapport -------------------------------------------------------------------

function printReport(checks, verdict) {
  const line = "=".repeat(78);
  console.log(line);
  console.log("PRÉFLIGHT MERGE — GetPick");
  console.log(line);

  for (const check of checks) {
    console.log("");
    console.log(`[${check.statut}] ${check.nom}`);
    for (const detail of check.details) console.log(detail ? `  ${detail}` : "");
    if (check.commande && isBlocking(check.statut)) {
      console.log(`  → Commande : ${check.commande}`);
    }
  }

  console.log("");
  console.log(line);
  console.log(`VERDICT : ${verdict}`);
  console.log(line);
}

// --- Orchestration ---------------------------------------------------------------

export function runAllChecks(cwd = process.cwd(), processEnv = process.env) {
  return [
    checkCommitChain(cwd),
    checkAuditShareSecret(processEnv, cwd),
    checkOutboundLinks(cwd),
    checkTestSuite(cwd),
    checkLint(cwd),
    checkTypecheck(cwd),
    checkPlaywrightReminder(),
  ];
}

function main() {
  const jsonMode = process.argv.slice(2).includes("--json");
  const cwd = process.cwd();

  const checks = runAllChecks(cwd, process.env);
  const verdict = aggregateVerdict(checks);

  if (jsonMode) {
    console.log(JSON.stringify({ verdict, checks }, null, 2));
  } else {
    printReport(checks, verdict);
  }

  process.exit(verdict === "GO" ? 0 : 1);
}

const isMainModule = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  main();
}
