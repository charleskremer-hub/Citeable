// Lecture d'attribution — tests de `scripts/lire-attribution.mjs`.
//
// Le test qui porte tout le reste est le PREMIER : le script ne doit jamais
// construire ni appeler l'URL de la page de rapport d'un prospect. Cette page
// émet `report_viewed` par un beacon client ; un outil de lecture qui l'ouvrirait
// fabriquerait le chiffre qu'il prétend rapporter, et notre north star
// deviendrait le compteur de nos propres vérifications. La régression est
// silencieuse par nature — le rapport resterait parfaitement lisible, seulement
// faux — donc elle ne peut être attrapée que par un test.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  abregerAuditId,
  collecterAttribution,
  extractAuditIds,
  formaterTableau,
  funnelUrl,
  main,
  parseArgs,
  parseCsv,
  parseCsvLine,
  readFunnelPayload,
  readRegistre,
  synthetiser,
} from "./lire-attribution.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const CHEMIN_SCRIPT = resolve(ICI, "lire-attribution.mjs");

/** Le motif interdit : le chemin de la page de rapport. */
const CHEMIN_PAGE_RAPPORT = ["/", "audit", "/"].join("");

// ─── Outillage : retirer les commentaires SANS toucher au code ────────────────

/**
 * Retire les commentaires `//` et le bloc, en respectant les chaînes.
 *
 * POURQUOI CE N'EST PAS UNE EXPRESSION RÉGULIÈRE. Le piège a déjà été posé sur
 * ce dépôt : si on cherche le motif interdit dans le fichier BRUT, il suffit de
 * commenter un appel pour que le test reste vert alors que le code est encore
 * là, prêt à être décommenté ; et si on retire les commentaires avec un
 * `replace(/\/\/.*$/gm, "")`, le `//` de `https://www.getpick.ai` fait
 * disparaître la fin de la ligne — donc du CODE — et le test devient vert pour
 * la mauvaise raison. Il faut un vrai automate qui sache dans quel état il est.
 */
export function retirerCommentaires(source: string): string {
  const APOSTROPHE = String.fromCharCode(39);
  const GUILLEMET = String.fromCharCode(34);
  const ACCENT_GRAVE = String.fromCharCode(96);

  let out = "";
  let etat: "code" | "ligne" | "bloc" | "chaine" = "code";
  let delimiteur = "";

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const suivant = source[i + 1];

    if (etat === "ligne") {
      if (c === "\n") {
        etat = "code";
        out += c;
      }
      continue;
    }
    if (etat === "bloc") {
      if (c === "*" && suivant === "/") {
        etat = "code";
        i += 1;
      }
      continue;
    }
    if (etat === "chaine") {
      out += c;
      if (c === "\\") {
        out += suivant ?? "";
        i += 1;
        continue;
      }
      if (c === delimiteur) etat = "code";
      continue;
    }

    // état « code »
    if (c === "/" && suivant === "/") {
      etat = "ligne";
      i += 1;
      continue;
    }
    if (c === "/" && suivant === "*") {
      etat = "bloc";
      i += 1;
      continue;
    }
    if (c === APOSTROPHE || c === GUILLEMET || c === ACCENT_GRAVE) {
      etat = "chaine";
      delimiteur = c;
    }
    out += c;
  }

  return out;
}

// ─── Fabriques de doublures ───────────────────────────────────────────────────

type Reponse = { status: number; body: string };

function corpsFunnel(
  options: {
    human?: number;
    internal?: number;
    teaser?: number;
    checkout?: number;
    last?: string | null;
  } = {}
): string {
  const human = options.human ?? 0;
  const internal = options.internal ?? 0;
  return JSON.stringify({
    ok: true,
    window: "all",
    counts: {
      report_viewed: human + internal,
      teaser_cta_click: options.teaser ?? 0,
      checkout_opened: options.checkout ?? 0,
    },
    counts_by_traffic_class: {
      report_viewed: { human, bot: 0, internal, unknown: 0 },
    },
    traffic_classes: [],
    traffic_class_since: null,
    last_event_at: options.last ?? null,
  });
}

function fauxFetch(routeur: (url: string) => Reponse): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (entree: RequestInfo | URL) => {
    const url = String(entree);
    urls.push(url);
    const { status, body } = routeur(url);
    return new Response(body, { status });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

const UUID_A = "6d5c27df-8e3c-40a8-a698-5a0b1d550c11";
const UUID_B = "0537a40c-8dfb-46e2-9523-8a802fa72d8a";
const UUID_C = "2422444f-4a92-458c-b5a9-6f280ef8e18d";

/**
 * Fixture ÉCRITE ICI, jamais lue depuis `outbound/` : le vrai registre n'est pas
 * suivi par git (il porte des données personnelles de prospects), donc un test
 * qui en dépendrait serait rouge partout ailleurs que sur le Mac de son auteur.
 */
const REGISTRE_FIXTURE = [
  "marque,destinataire_email,date_envoi,audit_id,notes",
  `Alpha,contact@alpha.example,2026-08-17,"${UUID_A} (audit du 16/08 mis en lien ; entree initiale ${UUID_B})","relance prévue, si pas de réponse"`,
  `Beta,hello@beta.example,2026-08-17,${UUID_C},premier envoi`,
  "Gamma,team@gamma.example,2026-08-18,,audit pas encore lancé",
].join("\n");

// ─── 1. LE TEST QUI COMPTE ────────────────────────────────────────────────────

test("le SOURCE du script, commentaires retirés, ne contient JAMAIS le chemin de la page de rapport", () => {
  const source = readFileSync(CHEMIN_SCRIPT, "utf8");
  const code = retirerCommentaires(source);

  // Garde-fou du garde-fou : si le retrait des commentaires avalait le code, le
  // test passerait sur un fichier vide. On exige que le code utile survive.
  assert.ok(code.includes("/api/funnel"), "le retrait des commentaires a mangé la route interrogée");
  assert.ok(code.includes("funnelUrl"), "le retrait des commentaires a mangé la construction d'URL");
  assert.ok(
    code.includes("report_viewed_human"),
    "le retrait des commentaires a mangé la lecture des compteurs"
  );
  // La base de prod est écrite dans une chaîne : elle contient un `//` qui ne
  // doit surtout pas être pris pour un début de commentaire.
  assert.ok(
    code.includes("https://www.getpick.ai"),
    "le // de l'URL de base a été pris pour un commentaire — l'automate est faux"
  );

  assert.equal(
    code.includes(CHEMIN_PAGE_RAPPORT),
    false,
    `le script construit ou mentionne ${CHEMIN_PAGE_RAPPORT} dans son CODE : ouvrir cette page émet report_viewed et pollue la mesure qu'il produit`
  );
});

test("le retrait des commentaires sait distinguer un appel commenté d'un appel réel", () => {
  // Commenter un appel ne doit PAS suffire à faire passer le test 1 : c'est
  // exactement le piège déjà rencontré sur ce dépôt.
  const ligne = `// const u = ${CHEMIN_PAGE_RAPPORT}xyz;\nconst v = 1;`;
  assert.equal(retirerCommentaires(ligne).includes(CHEMIN_PAGE_RAPPORT), false);
  assert.ok(retirerCommentaires(ligne).includes("const v = 1;"));

  const bloc = `/* on avait fait ${CHEMIN_PAGE_RAPPORT}xyz */ const v = 2;`;
  assert.equal(retirerCommentaires(bloc).includes(CHEMIN_PAGE_RAPPORT), false);
  assert.ok(retirerCommentaires(bloc).includes("const v = 2;"));

  // Dans une CHAÎNE, en revanche, le motif doit rester visible : c'est du code.
  const guillemet = String.fromCharCode(34);
  const enChaine = `const u = ${guillemet}${CHEMIN_PAGE_RAPPORT}xyz${guillemet};`;
  assert.ok(retirerCommentaires(enChaine).includes(CHEMIN_PAGE_RAPPORT));

  // Et un `//` DANS une chaîne ne doit pas avaler la fin de la ligne.
  const urlEnChaine = `const b = ${guillemet}https://www.getpick.ai${guillemet}; const w = 3;`;
  assert.ok(retirerCommentaires(urlEnChaine).includes("const w = 3;"));
});

test("un run COMPLET n'appelle que /api/funnel?audit_id= et jamais la page de rapport", async () => {
  const { fetchImpl, urls } = fauxFetch(() => ({ status: 200, body: corpsFunnel({ human: 1 }) }));
  const sorties: string[] = [];

  const code = await main([], {
    fetchImpl,
    readFile: () => REGISTRE_FIXTURE,
    log: (line) => sorties.push(line),
    logError: (line) => sorties.push(line),
    env: {},
  });

  assert.equal(code, 0);
  assert.ok(urls.length >= 3, `attendu au moins 3 appels, obtenu ${urls.length}`);
  for (const url of urls) {
    assert.ok(
      url.includes("/api/funnel?audit_id="),
      `URL appelée hors de la route de lecture : ${url}`
    );
    assert.equal(
      url.includes(CHEMIN_PAGE_RAPPORT),
      false,
      `le script a appelé la page de rapport : ${url}`
    );
  }

  // Et il ne la SUGGÈRE pas non plus dans ce qu'il affiche.
  assert.equal(sorties.join("\n").includes(CHEMIN_PAGE_RAPPORT), false);
});

test("funnelUrl ne sait produire QUE la route de lecture", () => {
  const url = funnelUrl("https://www.getpick.ai", UUID_A);
  assert.equal(url, `https://www.getpick.ai/api/funnel?audit_id=${UUID_A}`);
  assert.equal(url.includes(CHEMIN_PAGE_RAPPORT), false);
  // Une base avec barre oblique finale ne doit pas produire une double barre.
  assert.equal(
    funnelUrl("https://preview.example/", UUID_A),
    `https://preview.example/api/funnel?audit_id=${UUID_A}`
  );
});

// ─── 2. Extraction des uuid ───────────────────────────────────────────────────

test("une cellule à DEUX uuid en rend deux, dans l'ordre", () => {
  const cellule = `${UUID_A} (audit du 16/08 mis en lien ; entree initiale ${UUID_B})`;
  assert.deepEqual(extractAuditIds(cellule), [UUID_A, UUID_B]);
});

test("une cellule à UN uuid en rend un ; une cellule vide en rend zéro", () => {
  assert.deepEqual(extractAuditIds(UUID_C), [UUID_C]);
  assert.deepEqual(extractAuditIds(`envoyé le 17/08, audit ${UUID_C}.`), [UUID_C]);
  assert.deepEqual(extractAuditIds(""), []);
  assert.deepEqual(extractAuditIds("audit pas encore lancé"), []);
  assert.deepEqual(extractAuditIds(null), []);
  assert.deepEqual(extractAuditIds(undefined), []);
});

test("un uuid TRONQUÉ ou un PRÉFIXE n'est PAS extrait", () => {
  // Tronqué par la fin.
  assert.deepEqual(extractAuditIds("6d5c27df-8e3c-40a8-a698-5a0b1d550c"), []);
  // Préfixe seul.
  assert.deepEqual(extractAuditIds("6d5c27df"), []);
  assert.deepEqual(extractAuditIds("6d5c27df-8e3c-"), []);
  // Rallongé : ce n'est plus l'identifiant, on ne doit pas en découper un.
  assert.deepEqual(extractAuditIds(`${UUID_A}ab`), []);
  assert.deepEqual(extractAuditIds(`ab${UUID_A}`), []);
  // Mauvaise version (v1) : nous n'émettons que des v4.
  assert.deepEqual(extractAuditIds("6d5c27df-8e3c-10a8-a698-5a0b1d550c11"), []);
  // Mauvais variant.
  assert.deepEqual(extractAuditIds("6d5c27df-8e3c-40a8-c698-5a0b1d550c11"), []);
});

test("un uuid répété dans la même cellule ne compte qu'une fois", () => {
  assert.deepEqual(extractAuditIds(`${UUID_A} puis encore ${UUID_A}`), [UUID_A]);
});

// ─── 3. Le parseur CSV ────────────────────────────────────────────────────────

test("un champ entre guillemets contenant des virgules ne casse pas les colonnes", () => {
  const ligne = `Alpha,contact@alpha.example,2026-08-17,"${UUID_A}, puis ${UUID_B}","relance, si pas de réponse"`;
  const champs = parseCsvLine(ligne);
  assert.equal(champs.length, 5, `attendu 5 colonnes, obtenu ${champs.length} : ${JSON.stringify(champs)}`);
  assert.equal(champs[1], "contact@alpha.example");
  assert.equal(champs[3], `${UUID_A}, puis ${UUID_B}`);
  assert.equal(champs[4], "relance, si pas de réponse");
});

test("les guillemets doublés valent un guillemet littéral", () => {
  const champs = parseCsvLine(`a,"il a dit ""oui"", puis rien",c`);
  assert.deepEqual(champs, ["a", `il a dit "oui", puis rien`, "c"]);
});

test("un retour à la ligne DANS un champ protégé ne coupe pas la ligne", () => {
  const rows = parseCsv(`a,"deux\nlignes",c\nd,e,f`);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ["a", "deux\nlignes", "c"]);
  assert.deepEqual(rows[1], ["d", "e", "f"]);
});

test("readRegistre ne retient que les colonnes utiles, et sait les retrouver quel que soit leur rang", () => {
  const entrees = readRegistre(REGISTRE_FIXTURE);
  assert.equal(entrees.length, 3);
  assert.deepEqual(entrees[0], {
    marque: "Alpha",
    destinataire_email: "contact@alpha.example",
    date_envoi: "2026-08-17",
    audit_ids: [UUID_A, UUID_B],
  });
  assert.deepEqual(entrees[1].audit_ids, [UUID_C]);
  assert.deepEqual(entrees[2].audit_ids, []);
  // La colonne `notes` existe dans la fixture et ne doit ressortir NULLE PART :
  // le registre porte des données personnelles, on n'en journalise que le strict
  // nécessaire.
  for (const entree of entrees) {
    assert.deepEqual(Object.keys(entree).sort(), [
      "audit_ids",
      "date_envoi",
      "destinataire_email",
      "marque",
    ]);
  }
});

test("un registre vide ou réduit à son en-tête ne rend aucune entrée", () => {
  assert.deepEqual(readRegistre(""), []);
  assert.deepEqual(readRegistre("marque,destinataire_email,date_envoi,audit_id"), []);
});

// ─── 4. Robustesse : une erreur n'interrompt pas le run ───────────────────────

test("un audit qui répond 500 n'interrompt pas le run ; les autres lignes sortent quand même", async () => {
  const { fetchImpl, urls } = fauxFetch((url) =>
    url.includes(UUID_B)
      ? { status: 500, body: "Internal Server Error" }
      : { status: 200, body: corpsFunnel({ human: 2, teaser: 1 }) }
  );

  const lignes = await collecterAttribution(readRegistre(REGISTRE_FIXTURE), { fetchImpl });

  assert.equal(urls.length, 3, "les trois audits doivent être interrogés malgré l'échec du deuxième");
  assert.equal(lignes.length, 4, "trois audits + un prospect sans audit exploitable");
  assert.equal(lignes[1].erreur, "HTTP 500");
  assert.equal(lignes[0].report_viewed_human, 2);
  assert.equal(lignes[2].report_viewed_human, 2);
  assert.equal(lignes[3].audit_id, null);
});

test("du JSON invalide sur un audit n'interrompt pas le run", async () => {
  const { fetchImpl } = fauxFetch((url) =>
    url.includes(UUID_C)
      ? { status: 200, body: "<html>oups</html>" }
      : { status: 200, body: corpsFunnel({ human: 1 }) }
  );

  const lignes = await collecterAttribution(readRegistre(REGISTRE_FIXTURE), { fetchImpl });

  assert.equal(lignes.length, 4);
  assert.equal(lignes[2].erreur, "JSON invalide");
  assert.equal(lignes[0].report_viewed_human, 1);
  assert.equal(lignes[1].report_viewed_human, 1);
});

test("un refus applicatif (ok:false) devient une ligne en erreur, pas un compteur à zéro", () => {
  assert.throws(() => readFunnelPayload({ ok: false, error: "audit_id_invalid", message: "uuid COMPLET requis" }), {
    message: "uuid COMPLET requis",
  });
  assert.throws(() => readFunnelPayload("pas du JSON objet"));
});

test("le run rend 0 dès qu'une ligne a été lue, même si un audit a échoué", async () => {
  const { fetchImpl } = fauxFetch(() => ({ status: 500, body: "boom" }));
  const code = await main([], {
    fetchImpl,
    readFile: () => REGISTRE_FIXTURE,
    log: () => {},
    logError: () => {},
    env: {},
  });
  assert.equal(code, 0);
});

test("registre absent : message clair, code 1, aucune trace de pile", async () => {
  const erreurs: string[] = [];
  const code = await main(["--registre=/nulle/part/registre.csv"], {
    fetchImpl: fauxFetch(() => ({ status: 200, body: corpsFunnel() })).fetchImpl,
    readFile: (path) => {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    },
    log: () => {},
    logError: (line) => erreurs.push(line),
    env: {},
  });

  assert.equal(code, 1);
  const texte = erreurs.join("\n");
  assert.ok(texte.includes("/nulle/part/registre.csv"), "le message doit nommer le chemin cherché");
  assert.ok(texte.includes("--registre="), "le message doit dire comment en indiquer un autre");
  assert.equal(texte.includes("    at "), false, "une trace de pile a fuité dans la sortie d'erreur");
});

// ─── 5. La synthèse compte human, jamais internal ─────────────────────────────

test("un audit à {human: 0, internal: 3} ne compte PAS comme « le prospect a ouvert »", async () => {
  const { fetchImpl } = fauxFetch(() => ({ status: 200, body: corpsFunnel({ human: 0, internal: 3 }) }));
  const entrees = readRegistre(REGISTRE_FIXTURE);
  const lignes = await collecterAttribution(entrees, { fetchImpl });
  const synthese = synthetiser(entrees, lignes);

  assert.equal(lignes[0].report_viewed_internal, 3);
  assert.equal(lignes[0].report_viewed_human, 0);
  assert.equal(
    synthese.prospects_ayant_ouvert,
    0,
    "nos propres passages de contrôle (internal) ont été comptés comme des ouvertures de prospects"
  );
  assert.equal(synthese.prospects_envoyes, 3);
});

test("un seul human sur un seul des deux audits d'un prospect suffit à le compter une fois", async () => {
  const { fetchImpl } = fauxFetch((url) =>
    url.includes(UUID_B)
      ? { status: 200, body: corpsFunnel({ human: 1, internal: 9 }) }
      : { status: 200, body: corpsFunnel({ human: 0, internal: 9 }) }
  );
  const entrees = readRegistre(REGISTRE_FIXTURE);
  const lignes = await collecterAttribution(entrees, { fetchImpl });
  const synthese = synthetiser(entrees, lignes);

  assert.equal(synthese.prospects_envoyes, 3);
  assert.equal(synthese.prospects_ayant_ouvert, 1, "le prospect Alpha porte deux audits et compte pour un");
});

test("la synthèse compte les lignes non mesurées séparément, sans les faire passer pour des zéros", async () => {
  const { fetchImpl } = fauxFetch((url) =>
    url.includes(UUID_C) ? { status: 500, body: "boom" } : { status: 200, body: corpsFunnel({ human: 1 }) }
  );
  const entrees = readRegistre(REGISTRE_FIXTURE);
  const lignes = await collecterAttribution(entrees, { fetchImpl });
  const synthese = synthetiser(entrees, lignes);

  // Beta est en erreur, Gamma n'a pas d'audit : 2 lignes non mesurées.
  assert.equal(synthese.lignes_en_erreur, 2);
  assert.equal(synthese.prospects_ayant_ouvert, 1);
});

// ─── 6. Rendu et ligne de commande ────────────────────────────────────────────

test("le tableau porte les colonnes annoncées et la ligne de synthèse", async () => {
  const { fetchImpl } = fauxFetch(() => ({
    status: 200,
    body: corpsFunnel({ human: 1, internal: 2, teaser: 3, checkout: 4, last: "2026-08-20T10:00:00.000Z" }),
  }));
  const entrees = readRegistre(REGISTRE_FIXTURE);
  const lignes = await collecterAttribution(entrees, { fetchImpl });
  const texte = formaterTableau(lignes, synthetiser(entrees, lignes), "https://www.getpick.ai");

  for (const attendu of ["marque", "destinataire", "report_viewed", "teaser", "checkout"]) {
    assert.ok(texte.includes(attendu), `colonne « ${attendu} » absente du tableau`);
  }
  assert.ok(texte.includes("Alpha"));
  assert.ok(texte.includes("contact@alpha.example"));
  assert.ok(texte.includes("1 human / 2 internal"));
  assert.ok(texte.includes("2 / 3 prospects ont ouvert"), texte);
  assert.equal(texte.includes(CHEMIN_PAGE_RAPPORT), false);
});

test("--json rend la même mesure, exploitable par une machine", async () => {
  const { fetchImpl } = fauxFetch(() => ({ status: 200, body: corpsFunnel({ human: 1 }) }));
  const sorties: string[] = [];
  const code = await main(["--json", "--base=https://preview.example"], {
    fetchImpl,
    readFile: () => REGISTRE_FIXTURE,
    log: (line) => sorties.push(line),
    logError: (line) => sorties.push(line),
    env: {},
  });

  assert.equal(code, 0);
  const charge = JSON.parse(sorties.join("\n")) as {
    base: string;
    lignes: { audit_id: string | null; report_viewed_human?: number }[];
    synthese: { prospects_envoyes: number; prospects_ayant_ouvert: number };
  };
  assert.equal(charge.base, "https://preview.example");
  assert.equal(charge.lignes.length, 4);
  assert.equal(charge.synthese.prospects_envoyes, 3);
  // Gamma n'a aucun identifiant exploitable : 2 prospects mesurés sur 3 envoyés.
  assert.equal(charge.synthese.prospects_ayant_ouvert, 2);
});

test("parseArgs : les deux écritures d'option, et les valeurs par défaut", () => {
  const defauts = parseArgs([], {});
  assert.equal(defauts.registre, "outbound/REGISTRE_PROSPECTION.csv");
  assert.equal(defauts.base, "https://www.getpick.ai");
  assert.equal(defauts.json, false);

  assert.equal(parseArgs(["--registre=/tmp/r.csv"], {}).registre, "/tmp/r.csv");
  assert.equal(parseArgs(["--registre", "/tmp/r.csv"], {}).registre, "/tmp/r.csv");
  assert.equal(parseArgs(["--base=https://a.example/"], {}).base, "https://a.example");
  assert.equal(parseArgs(["--base", "https://a.example"], {}).base, "https://a.example");
  assert.equal(parseArgs(["--json"], {}).json, true);
  assert.equal(parseArgs([], { BASE_URL: "https://env.example" }).base, "https://env.example");
});

test("abregerAuditId rend un uuid reconnaissable sans le tronquer en silence dans le JSON", () => {
  assert.equal(abregerAuditId(UUID_A), "6d5c27df…");
  assert.equal(abregerAuditId(null), "—");
  assert.equal(abregerAuditId(""), "—");
});
