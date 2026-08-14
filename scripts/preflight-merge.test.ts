// Préflight merge — unitaires des fonctions PURES exportées par
// scripts/preflight-merge.mjs : le parseur de keys.env, le détecteur de liens
// nus, le classement fichier→gravité, et l'agrégation du verdict. Zéro base,
// zéro réseau (hormis les tests qui spawnent le script lui-même, seul moyen
// de prouver la sortie --json et le code de sortie réels).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateVerdict,
  checkAuditShareSecret,
  checkCommitChain,
  checkOutboundLinks,
  classifyOutboundFile,
  extractAuditId,
  groupLinksByAuditId,
  normalizeSecretValue,
  readKeysEnvValue,
  scanAuditLinks,
  STATUT,
} from "./preflight-merge.mjs";

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "preflight-merge.mjs");

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "preflight-merge-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- 1. Le parseur de keys.env ------------------------------------------------

test("readKeysEnvValue : clé absente -> null", () => {
  assert.equal(readKeysEnvValue("AUTRE_CLE=valeur\n", "AUDIT_SHARE_SECRET"), null);
  assert.equal(readKeysEnvValue("", "AUDIT_SHARE_SECRET"), null);
});

test("readKeysEnvValue : valeur vide (ou blanche) -> null", () => {
  assert.equal(readKeysEnvValue("AUDIT_SHARE_SECRET=\n", "AUDIT_SHARE_SECRET"), null);
  assert.equal(readKeysEnvValue("AUDIT_SHARE_SECRET=   \n", "AUDIT_SHARE_SECRET"), null);
});

test("readKeysEnvValue : [SENSITIVE] -> null (masque posé par vercel env pull)", () => {
  assert.equal(readKeysEnvValue("AUDIT_SHARE_SECRET=[SENSITIVE]\n", "AUDIT_SHARE_SECRET"), null);
});

test("readKeysEnvValue : clé normale -> la valeur, y compris une valeur qui contient un =", () => {
  assert.equal(readKeysEnvValue("AUDIT_SHARE_SECRET=abc123\n", "AUDIT_SHARE_SECRET"), "abc123");
  // Seul le PREMIER `=` sépare clé et valeur : le reste appartient à la valeur.
  assert.equal(readKeysEnvValue("AUDIT_SHARE_SECRET=abc=def==ghi\n", "AUDIT_SHARE_SECRET"), "abc=def==ghi");
});

test("readKeysEnvValue : ignore les lignes vides et les commentaires #", () => {
  const content = ["# secrets de prospection", "", "RESEND_API_KEY=[SENSITIVE]", "AUDIT_SHARE_SECRET=le-vrai-secret", ""].join(
    "\n"
  );
  assert.equal(readKeysEnvValue(content, "AUDIT_SHARE_SECRET"), "le-vrai-secret");
  assert.equal(readKeysEnvValue(content, "RESEND_API_KEY"), null, "RESEND_API_KEY est masqué, donc null");
});

test("normalizeSecretValue : absent/vide/masqué -> null, une valeur normale est trimée", () => {
  assert.equal(normalizeSecretValue(undefined), null);
  assert.equal(normalizeSecretValue(null as unknown as string), null);
  assert.equal(normalizeSecretValue(""), null);
  assert.equal(normalizeSecretValue("   "), null);
  assert.equal(normalizeSecretValue("[SENSITIVE]"), null);
  assert.equal(normalizeSecretValue("  un-secret  "), "un-secret");
});

// --- 2. Le détecteur d'URL nues -------------------------------------------------

// Huit occurrences de /audit/<id>, dans des habillages différents (texte brut,
// markdown, parenthèses, HTML, fin de phrase) — comme un vrai email d'envoi.
const AUDIT_LINKS_SAMPLE = `
Bonjour,

Voici votre rapport : https://www.getpick.ai/audit/355a807c-e6fb-42de-b003-e3a34d85dcf1
Un deuxième : https://www.getpick.ai/audit/471dae77-f031-489c-a2b3-1a28e62b9634.
Format markdown : [voir le rapport](https://www.getpick.ai/audit/c4d97e91-665b-4d14-9088-92f951e43a11)
Chemin relatif : /audit/0f9a1c2b-1111-2222-3333-444455556666
Avec parenthèses (https://www.getpick.ai/audit/aaaa1111-2222-3333-4444-555566667777)
En HTML : <a href="https://www.getpick.ai/audit/bbbb1111-2222-3333-4444-555566667777">rapport</a>
Fin de phrase : https://www.getpick.ai/audit/cccc1111-2222-3333-4444-555566667777, envoyé hier.
Dernier : https://www.getpick.ai/audit/dddd1111-2222-3333-4444-555566667777
`;

test("scanAuditLinks trouve les 8 URL nues d'un texte d'exemple", () => {
  const links = scanAuditLinks(AUDIT_LINKS_SAMPLE);
  assert.equal(links.length, 8);
  assert.ok(
    links.every((link) => link.signed === false),
    JSON.stringify(links)
  );
});

test("scanAuditLinks : 0 en manque quand les mêmes URL portent ?k=…", () => {
  const signedSample = AUDIT_LINKS_SAMPLE.replace(
    /(\/audit\/[A-Za-z0-9_-]+)/g,
    "$1?k=1788000000.dGVzdC1zaWduYXR1cmU"
  );
  const links = scanAuditLinks(signedSample);
  assert.equal(links.length, 8);
  const unsigned = links.filter((link) => !link.signed);
  assert.equal(unsigned.length, 0, JSON.stringify(unsigned));
});

test("scanAuditLinks : texte sans lien -> tableau vide, jamais d'erreur", () => {
  assert.deepEqual(scanAuditLinks("Aucun lien ici."), []);
  assert.deepEqual(scanAuditLinks(""), []);
});

// --- 3. Le classement fichier -> gravité ---------------------------------------

test("classifyOutboundFile : une URL nue dans ENVOI_*.md est BLOQUANT", () => {
  const links = [{ url: "https://www.getpick.ai/audit/xyz", signed: false }];
  const result = classifyOutboundFile("ENVOI_LOT1_2026-08-01.md", links);
  assert.equal(result.statut, STATUT.BLOQUANT);
  assert.equal(result.naked, 1);
});

test("classifyOutboundFile : la MÊME URL nue dans drafts_*.md est un AVERTISSEMENT", () => {
  const links = [{ url: "https://www.getpick.ai/audit/xyz", signed: false }];
  const result = classifyOutboundFile("drafts_lot2.md", links);
  assert.equal(result.statut, STATUT.AVERTISSEMENT);
  assert.equal(result.naked, 1);
});

test("classifyOutboundFile : que des liens signés -> OK, même dans un ENVOI_*", () => {
  const links = [{ url: "https://www.getpick.ai/audit/xyz?k=abc", signed: true }];
  const result = classifyOutboundFile("ENVOI_LOT1_2026-08-01.md", links);
  assert.equal(result.statut, STATUT.OK);
  assert.equal(result.naked, 0);
});

test("classifyOutboundFile : la gravité regarde le NOM du fichier, pas son dossier", () => {
  const links = [{ url: "https://www.getpick.ai/audit/xyz", signed: false }];
  assert.equal(classifyOutboundFile("outbound/ENVOI_LOT2.md", links).statut, STATUT.BLOQUANT);
  assert.equal(classifyOutboundFile("outbound/compte-rendu.md", links).statut, STATUT.AVERTISSEMENT);
});

// --- 4. L'agrégation du verdict --------------------------------------------------

function check(statut: string) {
  return { id: "x", nom: "x", statut, details: [] as string[], commande: null as string | null };
}

test("aggregateVerdict : un seul BLOQUANT suffit à faire NO-GO", () => {
  assert.equal(aggregateVerdict([check(STATUT.OK), check(STATUT.AVERTISSEMENT), check(STATUT.BLOQUANT)]), "NO-GO");
});

test("aggregateVerdict : que des OK et des AVERTISSEMENT -> GO", () => {
  assert.equal(aggregateVerdict([check(STATUT.OK), check(STATUT.AVERTISSEMENT), check(STATUT.AVERTISSEMENT)]), "GO");
});

test("aggregateVerdict : un seul INDÉTERMINÉ suffit à faire NO-GO", () => {
  assert.equal(aggregateVerdict([check(STATUT.OK), check(STATUT.INDETERMINE)]), "NO-GO");
});

test("aggregateVerdict : liste vide -> GO (rien à bloquer)", () => {
  assert.equal(aggregateVerdict([]), "GO");
});

// --- 5. La sortie --json ---------------------------------------------------------

test("--json : du JSON valide sur stdout, contenant le verdict et la liste des contrôles", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--json"], { encoding: "utf8" });
  assert.ok(result.stdout && result.stdout.length > 0, "le script doit produire du JSON sur stdout");

  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed && typeof parsed === "object", "la sortie est un objet JSON");
  assert.ok(["GO", "NO-GO"].includes(parsed.verdict), `verdict inattendu : ${parsed.verdict}`);
  assert.ok(Array.isArray(parsed.checks), "la liste des contrôles est un tableau");
  assert.ok(parsed.checks.length >= 6, "les six contrôles doivent être présents");
  for (const c of parsed.checks) {
    assert.ok(typeof c.id === "string" && c.id.length > 0);
    assert.ok(typeof c.nom === "string" && c.nom.length > 0);
    assert.ok(Object.values(STATUT).includes(c.statut), `statut inattendu : ${c.statut}`);
  }

  // process.exit(1) sur NO-GO, process.exit(0) sur GO : cohérence code/verdict.
  assert.equal(result.status, parsed.verdict === "GO" ? 0 : 1);
});

test("--json : ne produit RIEN d'autre que le JSON sur stdout (le cockpit ne parsera rien d'autre)", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--json"], { encoding: "utf8" });
  assert.doesNotThrow(() => JSON.parse(result.stdout), "stdout doit être EXACTEMENT du JSON, sans texte autour");
});

// --- Comportement mesuré : sans .git, le contrôle 1 rend INDÉTERMINÉ sans planter ---

test("checkCommitChain : ne lève JAMAIS, même hors d'un dépôt git", () => {
  withTempDir((dir) => {
    const result = checkCommitChain(dir);
    assert.equal(result.statut, STATUT.INDETERMINE);
    assert.ok(result.commande, "un contrôle indéterminé documente la commande à relancer");
  });
});

// --- checkAuditShareSecret : présent / absent / masqué, avec de vrais fichiers ---

test("checkAuditShareSecret : OK si présent dans process.env", () => {
  const result = checkAuditShareSecret({ AUDIT_SHARE_SECRET: "un-secret-suffisamment-long" }, "/nonexistent");
  assert.equal(result.statut, STATUT.OK);
});

test("checkAuditShareSecret : BLOQUANT si absent de l'env ET du fichier keys.env", () => {
  withTempDir((dir) => {
    const result = checkAuditShareSecret({}, dir);
    assert.equal(result.statut, STATUT.BLOQUANT);
    assert.ok(result.commande?.includes("randomBytes"), "la commande de génération est fournie");
  });
});

test("checkAuditShareSecret : BLOQUANT si keys.env porte [SENSITIVE], OK si un vrai secret y est posé", () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, "outbound"));
    writeFileSync(join(dir, "outbound", "keys.env"), "AUDIT_SHARE_SECRET=[SENSITIVE]\n", "utf8");
    assert.equal(checkAuditShareSecret({}, dir).statut, STATUT.BLOQUANT);

    writeFileSync(join(dir, "outbound", "keys.env"), "AUDIT_SHARE_SECRET=un-secret-de-32-octets-au-moins\n", "utf8");
    assert.equal(checkAuditShareSecret({}, dir).statut, STATUT.OK);
  });
});

// --- checkOutboundLinks : classement complet sur des fichiers réels ------------

test("checkOutboundLinks : BLOQUANT dès qu'un ENVOI_*.md porte une URL nue", () => {
  withTempDir((dir) => {
    const outboundDir = join(dir, "outbound");
    mkdirSync(outboundDir);
    writeFileSync(
      join(outboundDir, "ENVOI_LOT1_2026-08-01.md"),
      "Lien 1 : https://www.getpick.ai/audit/aaa\nLien 2 : https://www.getpick.ai/audit/bbb\n",
      "utf8"
    );
    const result = checkOutboundLinks(dir);
    assert.equal(result.statut, STATUT.BLOQUANT);
    assert.ok(result.commande?.includes("audit-share-url.mjs"));
  });
});

test("checkOutboundLinks : AVERTISSEMENT (pas BLOQUANT) quand seul un draft porte une URL nue", () => {
  withTempDir((dir) => {
    const outboundDir = join(dir, "outbound");
    mkdirSync(outboundDir);
    writeFileSync(join(outboundDir, "drafts_lot2.md"), "Lien : https://www.getpick.ai/audit/ccc\n", "utf8");
    const result = checkOutboundLinks(dir);
    assert.equal(result.statut, STATUT.AVERTISSEMENT);
  });
});

test("checkOutboundLinks : OK quand tous les liens sont signés", () => {
  withTempDir((dir) => {
    const outboundDir = join(dir, "outbound");
    mkdirSync(outboundDir);
    writeFileSync(join(outboundDir, "ENVOI_LOT1.md"), "Lien : https://www.getpick.ai/audit/aaa?k=1788000000.sig\n", "utf8");
    const result = checkOutboundLinks(dir);
    assert.equal(result.statut, STATUT.OK);
  });
});

test("checkOutboundLinks : OK (rien à scanner) quand outbound/ n'existe pas", () => {
  withTempDir((dir) => {
    const result = checkOutboundLinks(dir);
    assert.equal(result.statut, STATUT.OK);
  });
});

// --- 6. Regroupement des liens par identifiant d'audit (dédoublonnage relatif/URL) ---

test("groupLinksByAuditId : le même identifiant vu deux fois (relatif + URL complète) compte pour 1 audit, 2 occurrences", () => {
  const links = [
    { url: "https://www.getpick.ai/audit/abc-123", signed: false },
    { url: "/audit/abc-123", signed: false },
  ];
  const groups = groupLinksByAuditId(links);
  assert.equal(groups.length, 1, "un seul audit distinct");
  assert.equal(groups[0].id, "abc-123");
  assert.equal(groups[0].occurrences, 2, "deux occurrences textuelles du même audit");
});

test("groupLinksByAuditId : une occurrence signée + une occurrence nue -> l'audit entier est classé nu", () => {
  const links = [
    { url: "https://www.getpick.ai/audit/abc-123?k=1788000000.sig", signed: true },
    { url: "/audit/abc-123", signed: false },
  ];
  const groups = groupLinksByAuditId(links);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].occurrences, 2);
  assert.equal(groups[0].signed, false, "une seule occurrence nue casse l'audit entier — c'est celle-là qui cassera pour le prospect");
});

test("groupLinksByAuditId : toutes les occurrences signées -> l'audit est classé signé", () => {
  const links = [
    { url: "https://www.getpick.ai/audit/abc-123?k=1788000000.sig", signed: true },
    { url: "/audit/abc-123?k=1788000000.sig", signed: true },
  ];
  const groups = groupLinksByAuditId(links);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].occurrences, 2);
  assert.equal(groups[0].signed, true);
});

test("groupLinksByAuditId : la liste des identifiants nus est exacte et sans doublon", () => {
  const links = [
    { url: "https://www.getpick.ai/audit/aaa", signed: false },
    { url: "/audit/aaa", signed: false }, // même id qu'au-dessus : ne doit PAS créer une deuxième entrée nue
    { url: "https://www.getpick.ai/audit/bbb?k=x", signed: true },
    { url: "https://www.getpick.ai/audit/ccc", signed: false },
  ];
  const groups = groupLinksByAuditId(links);
  const nakedIds = groups.filter((g) => !g.signed).map((g) => g.id);
  assert.deepEqual(nakedIds.sort(), ["aaa", "ccc"]);
  assert.equal(new Set(nakedIds).size, nakedIds.length, "pas de doublon dans la liste des identifiants nus");
});

test("extractAuditId : lit l'identifiant aussi bien depuis un chemin relatif que depuis une URL complète", () => {
  assert.equal(extractAuditId("/audit/abc-123"), "abc-123");
  assert.equal(extractAuditId("https://www.getpick.ai/audit/abc-123?k=xyz"), "abc-123");
  assert.equal(extractAuditId("pas une URL /audit/"), null);
});

// --- 7. classifyOutboundFile dédoublonne par audit, pas par occurrence -----------

test("classifyOutboundFile : le même audit en relatif + URL complète compte pour 1 audit, pas 2", () => {
  const links = [
    { url: "https://www.getpick.ai/audit/xyz", signed: false },
    { url: "/audit/xyz", signed: false },
  ];
  const result = classifyOutboundFile("ENVOI_LOT1_2026-08-01.md", links);
  assert.equal(result.statut, STATUT.BLOQUANT);
  assert.equal(result.total, 2, "2 occurrences textuelles");
  assert.equal(result.distinctAudits, 1, "1 seul audit distinct");
  assert.equal(result.naked, 1, "naked compte les AUDITS nus, pas les occurrences");
  assert.deepEqual(result.nakedIds, ["xyz"]);
});

test("classifyOutboundFile : un audit avec une occurrence signée et une nue reste nu (naked=1)", () => {
  const links = [
    { url: "https://www.getpick.ai/audit/xyz?k=1788000000.sig", signed: true },
    { url: "/audit/xyz", signed: false },
  ];
  const result = classifyOutboundFile("ENVOI_LOT1.md", links);
  assert.equal(result.statut, STATUT.BLOQUANT);
  assert.equal(result.distinctAudits, 1);
  assert.equal(result.naked, 1);
  assert.deepEqual(result.nakedIds, ["xyz"]);
});

// --- 8. checkOutboundLinks : le message et la sortie --json distinguent audits et occurrences ---

test("checkOutboundLinks : le message distingue audits distincts et occurrences, et compte 0 signé si l'unique occurrence signée partage son id avec une occurrence nue", () => {
  withTempDir((dir) => {
    const outboundDir = join(dir, "outbound");
    mkdirSync(outboundDir);
    writeFileSync(
      join(outboundDir, "ENVOI_LOT1_2026-08-01.md"),
      [
        "Lien relatif : /audit/aaa",
        "Lien complet : https://www.getpick.ai/audit/aaa",
        "Autre relatif : /audit/bbb",
        "Autre complet : https://www.getpick.ai/audit/bbb",
      ].join("\n"),
      "utf8"
    );
    const result = checkOutboundLinks(dir);
    assert.equal(result.statut, STATUT.BLOQUANT);
    assert.ok(
      result.details.some(
        (line) => line.includes("2 audit(s) distinct(s) sur 4 occurrence(s)") && line.includes("0 signé(s), 2 nu(s)")
      ),
      JSON.stringify(result.details)
    );
  });
});

test("checkOutboundLinks : expose par fichier le nombre d'audits distincts, d'occurrences, et la liste des identifiants nus", () => {
  withTempDir((dir) => {
    const outboundDir = join(dir, "outbound");
    mkdirSync(outboundDir);
    writeFileSync(
      join(outboundDir, "ENVOI_LOT1_2026-08-01.md"),
      [
        "/audit/aaa",
        "https://www.getpick.ai/audit/aaa",
        "/audit/bbb",
        "https://www.getpick.ai/audit/bbb",
      ].join("\n"),
      "utf8"
    );
    const result = checkOutboundLinks(dir);
    assert.ok(Array.isArray(result.fichiers), "checkOutboundLinks doit exposer une liste structurée par fichier");
    const fichier = result.fichiers.find((f) => f.fichier === "outbound/ENVOI_LOT1_2026-08-01.md");
    assert.ok(fichier, "le fichier attendu doit apparaître dans la sortie structurée");
    assert.equal(fichier.auditsDistincts, 2);
    assert.equal(fichier.occurrences, 4);
    assert.deepEqual([...fichier.identifiantsNus].sort(), ["aaa", "bbb"]);
  });
});
