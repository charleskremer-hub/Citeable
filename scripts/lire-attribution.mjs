#!/usr/bin/env node
/**
 * Croise le registre de prospection avec les compteurs de l'entonnoir, prospect
 * par prospect, en UNE commande.
 *
 * LE PROBLÈME QU'IL RÈGLE. `GET /api/funnel?audit_id=<uuid>` rend les compteurs
 * d'UN audit, et le registre de prospection dit quel prospect porte quel audit.
 * Croiser les deux se faisait à la main, un appel par audit, avec un copier-
 * coller d'uuid entre deux fenêtres : le résultat d'une campagne se lisait donc
 * rarement, et jamais deux fois de la même façon.
 *
 * CE QU'IL NE FAIT PAS, ET C'EST LE POINT LE PLUS IMPORTANT. Il ne construit
 * JAMAIS, n'appelle jamais et ne suggère jamais l'URL de la page de rapport d'un
 * prospect. Ouvrir cette page dans un navigateur émet `report_viewed` via un
 * beacon CLIENT ; un outil de LECTURE qui ouvrirait la page qu'il mesure
 * fabriquerait lui-même le chiffre qu'il prétend rapporter, et la north star
 * `report_viewed.human` deviendrait le compteur de nos propres vérifications.
 * Ce script ne parle donc qu'à `/api/funnel`, qui lit et n'écrit rien.
 * `scripts/lire-attribution.test.ts` vérifie cette propriété sur le SOURCE, les
 * commentaires retirés, ET sur les URL réellement appelées pendant un run.
 *
 * USAGE
 *   node scripts/lire-attribution.mjs
 *   node scripts/lire-attribution.mjs --registre=/chemin/vers/registre.csv
 *   node scripts/lire-attribution.mjs --base=https://preview.example
 *   node scripts/lire-attribution.mjs --json
 *
 * DONNÉES PERSONNELLES. Le registre porte des noms et des adresses e-mail de
 * prospects (base légale : intérêt légitime). Ce script ne journalise QUE les
 * quatre colonnes nécessaires à la lecture — marque, destinataire, date d'envoi,
 * identifiants d'audit — et jamais le reste de la ligne.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_BASE_URL = "https://www.getpick.ai";
export const DEFAULT_REGISTRE_PATH = "outbound/REGISTRE_PROSPECTION.csv";

/**
 * Marquage du trafic interne, par cohérence avec le reste de notre outillage :
 * nos propres appels ne doivent jamais se retrouver comptés en `human`.
 */
export const INTERNAL_COOKIE_HEADER = "gp_internal=1";

/** Les seules colonnes que ce script lit — et donc les seules qu'il affiche. */
export const COLONNES_LUES = Object.freeze([
  "marque",
  "destinataire_email",
  "date_envoi",
  "audit_id",
]);

// ─── 1. Lecture du CSV ────────────────────────────────────────────────────────

const GUILLEMET = '"';

/**
 * Parseur CSV complet (RFC 4180) écrit à la main : le dépôt n'en porte aucun et
 * n'a aucune dépendance de parsing.
 *
 * Un découpage naïf sur la virgule est FAUX sur ce fichier précis, et faux d'une
 * façon silencieuse : la colonne `audit_id` contient du texte libre avec des
 * virgules et des parenthèses, protégé par des guillemets. Un découpage naïf
 * décale toutes les colonnes suivantes d'un cran, ce qui associe l'e-mail d'un
 * prospect aux compteurs d'un autre — un rapport d'attribution faux, mais
 * parfaitement lisible.
 *
 * Gère : les guillemets, les virgules internes, les guillemets doublés, et les
 * retours à la ligne à l'intérieur d'un champ protégé.
 *
 * @param {string} text
 * @returns {string[][]} les lignes non vides, chacune découpée en champs
 */
export function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    // Une ligne vide (un seul champ vide) n'est pas une ligne de données.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  const source = String(text ?? "").replace(/^﻿/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char === GUILLEMET) {
        // Un guillemet doublé à l'intérieur d'un champ protégé vaut UN guillemet
        // littéral ; un guillemet seul ferme le champ.
        if (source[index + 1] === GUILLEMET) {
          field += GUILLEMET;
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === GUILLEMET && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }
    if (char === ",") {
      endField();
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      endRow();
      continue;
    }
    field += char;
    fieldStarted = true;
  }

  // Dernière ligne, quand le fichier ne finit pas par un retour chariot.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Découpe UNE ligne de CSV en champs. Utilitaire de confort au-dessus de
 * `parseCsv`, pour les appelants qui n'ont qu'une ligne à lire.
 *
 * @param {string} line
 * @returns {string[]}
 */
export function parseCsvLine(line) {
  const rows = parseCsv(line);
  return rows.length > 0 ? rows[0] : [];
}

// ─── 2. Extraction des identifiants d'audit ───────────────────────────────────

/**
 * uuid v4 COMPLET, et rien d'autre.
 *
 * Même forme que `isAuditUuidV4` (src/lib/funnel.ts), volontairement recopiée :
 * ce fichier est un `.mjs` que le runtime de Node exécute sans outillage, il ne
 * peut pas importer un module TypeScript. La différence tient aux ancres : là où
 * la route ancre sur début et fin parce qu'elle valide une valeur ENTIÈRE, on
 * cherche ici des occurrences DANS du texte libre. Les deux gardes de voisinage
 * remplacent les ancres et jouent le même rôle : un uuid tronqué, un préfixe, ou
 * une chaîne hexadécimale plus longue ne sont PAS extraits. Sans elles, un
 * identifiant amputé produirait un appel qui rend 400, donc une ligne en erreur,
 * donc un prospect qu'on croirait non mesurable.
 */
const UUID_V4_RE =
  /(?<![0-9a-f-])[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![0-9a-f-])/gi;

/**
 * Tous les uuid v4 portés par une cellule, dans l'ordre d'apparition, sans
 * doublon.
 *
 * La colonne `audit_id` du registre n'est PAS un uuid propre : c'est du texte
 * libre, saisi à la main, qui peut porter plusieurs identifiants et leur
 * historique (« … mis en lien ; entree initiale … »). Les deux comptent : le
 * prospect a pu ouvrir l'un ou l'autre.
 *
 * @param {string | null | undefined} cell
 * @returns {string[]}
 */
export function extractAuditIds(cell) {
  if (typeof cell !== "string" || cell === "") return [];
  const found = cell.match(UUID_V4_RE);
  if (!found) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const raw of found) {
    const id = raw.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Transforme le texte du registre en entrées exploitables.
 *
 * Ne retient QUE les quatre colonnes utiles : tout le reste de la ligne (notes
 * commerciales, historique de relance…) n'est ni lu, ni conservé, ni affiché.
 * Une colonne absente de l'en-tête rend une valeur vide plutôt qu'une erreur :
 * le registre est tenu à la main et gagne des colonnes au fil du temps.
 *
 * @param {string} csvText
 * @returns {{ marque: string, destinataire_email: string, date_envoi: string, audit_ids: string[] }[]}
 */
export function readRegistre(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];

  const header = rows[0].map((name) => name.trim().toLowerCase());
  const at = (row, name) => {
    const index = header.indexOf(name);
    return index === -1 ? "" : String(row[index] ?? "").trim();
  };

  return rows.slice(1).map((row) => ({
    marque: at(row, "marque"),
    destinataire_email: at(row, "destinataire_email"),
    date_envoi: at(row, "date_envoi"),
    audit_ids: extractAuditIds(at(row, "audit_id")),
  }));
}

// ─── 3. Interrogation de l'entonnoir ──────────────────────────────────────────

/**
 * @param {string} base
 * @returns {string}
 */
export function normalizeBase(base) {
  return String(base || DEFAULT_BASE_URL).replace(/\/$/, "");
}

/**
 * L'URL de LECTURE des compteurs d'un audit. C'est la SEULE URL que ce script
 * sache produire, et c'est délibéré : voir l'en-tête du fichier.
 *
 * @param {string} base
 * @param {string} auditId
 * @returns {string}
 */
export function funnelUrl(base, auditId) {
  const url = new URL("/api/funnel", normalizeBase(base));
  url.searchParams.set("audit_id", auditId);
  return url.toString();
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asRecord(value) {
  return value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Extrait de la charge utile les seuls compteurs qu'on rapporte.
 *
 * `report_viewed` est lu dans la ventilation par classe de trafic, JAMAIS dans
 * le total : le total additionne `human`, `bot`, `internal` et `unknown`, et nos
 * propres ouvertures de contrôle y figurent. Un audit à
 * `{human: 0, internal: 3}` est un audit que le prospect n'a PAS ouvert.
 *
 * @param {unknown} payload
 * @returns {{ report_viewed_human: number, report_viewed_internal: number, teaser_cta_click: number, checkout_opened: number, last_event_at: string | null }}
 */
export function readFunnelPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("charge utile inattendue : ce n'est pas un objet JSON");
  }
  const body = asRecord(payload);
  if (body.ok !== true) {
    const message =
      typeof body.message === "string" ? body.message : String(body.error ?? "refus sans motif");
    throw new Error(message);
  }

  const counts = asRecord(body.counts);
  const byClass = asRecord(body.counts_by_traffic_class);
  const reportViewed = asRecord(byClass.report_viewed);

  return {
    report_viewed_human: asNumber(reportViewed.human),
    report_viewed_internal: asNumber(reportViewed.internal),
    teaser_cta_click: asNumber(counts.teaser_cta_click),
    checkout_opened: asNumber(counts.checkout_opened),
    last_event_at: typeof body.last_event_at === "string" ? body.last_event_at : null,
  };
}

/**
 * Interroge UN audit. Ne jette JAMAIS : un audit qui répond mal doit produire
 * une ligne en erreur, pas interrompre la lecture des autres prospects. Un run
 * qui s'arrête à la première erreur rend un rapport partiel qui ressemble trait
 * pour trait à un rapport complet.
 *
 * @param {string} base
 * @param {string} auditId
 * @param {typeof fetch} fetchImpl
 */
export async function lireAudit(base, auditId, fetchImpl) {
  const url = funnelUrl(base, auditId);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { cookie: INTERNAL_COOKIE_HEADER, "user-agent": "getpick-lire-attribution" },
    });
  } catch (error) {
    return { ok: false, erreur: `réseau : ${messageOf(error)}` };
  }

  let text;
  try {
    text = await response.text();
  } catch (error) {
    return { ok: false, erreur: `corps illisible : ${messageOf(error)}` };
  }

  if (!response.ok) return { ok: false, erreur: `HTTP ${response.status}` };

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, erreur: "JSON invalide" };
  }

  try {
    return { ok: true, data: readFunnelPayload(payload) };
  } catch (error) {
    return { ok: false, erreur: messageOf(error) };
  }
}

/**
 * Une ligne de rendu par couple (prospect, audit). Un prospect dont la cellule
 * ne porte aucun uuid exploitable produit tout de même une ligne, en erreur : le
 * silence le ferait disparaître du rapport sans que personne s'en aperçoive.
 *
 * @param {ReturnType<typeof readRegistre>} entrees
 * @param {{ base?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function collecterAttribution(entrees, options = {}) {
  const base = normalizeBase(options.base ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;

  /** @type {Record<string, unknown>[]} */
  const lignes = [];

  for (const entree of entrees) {
    const commun = {
      marque: entree.marque,
      destinataire_email: entree.destinataire_email,
      date_envoi: entree.date_envoi,
    };

    if (entree.audit_ids.length === 0) {
      lignes.push({
        ...commun,
        audit_id: null,
        erreur: "aucun identifiant d'audit exploitable dans le registre",
      });
      continue;
    }

    for (const auditId of entree.audit_ids) {
      const resultat = await lireAudit(base, auditId, fetchImpl);
      lignes.push(
        resultat.ok
          ? { ...commun, audit_id: auditId, ...resultat.data, erreur: null }
          : { ...commun, audit_id: auditId, erreur: resultat.erreur }
      );
    }
  }

  return lignes;
}

/**
 * Synthèse.
 *
 * « A ouvert » veut dire `report_viewed` en classe `human` au moins une fois,
 * sur AU MOINS UN des audits du prospect. Jamais `internal` : nos propres
 * passages de contrôle ne sont pas des prospects, et les compter reviendrait à
 * mesurer notre activité en croyant mesurer la leur.
 *
 * Le dénominateur est le nombre de DESTINATAIRES du registre, pas le nombre de
 * lignes rendues — un prospect à deux audits reste un prospect.
 *
 * @param {ReturnType<typeof readRegistre>} entrees
 * @param {Record<string, unknown>[]} lignes
 */
export function synthetiser(entrees, lignes) {
  const ouverts = new Set();
  for (const ligne of lignes) {
    if (asNumber(ligne.report_viewed_human) >= 1) ouverts.add(String(ligne.destinataire_email));
  }
  const destinataires = new Set(entrees.map((entree) => entree.destinataire_email));
  return {
    prospects_envoyes: destinataires.size,
    prospects_ayant_ouvert: ouverts.size,
    lignes_en_erreur: lignes.filter((ligne) => ligne.erreur !== null && ligne.erreur !== undefined)
      .length,
  };
}

// ─── 4. Rendu ─────────────────────────────────────────────────────────────────

const COLONNES_TABLEAU = Object.freeze([
  { cle: "marque", titre: "marque", largeur: 20 },
  { cle: "destinataire", titre: "destinataire", largeur: 30 },
  { cle: "date_envoi", titre: "envoyé le", largeur: 12 },
  { cle: "audit", titre: "audit", largeur: 10 },
  { cle: "vu", titre: "report_viewed", largeur: 24 },
  { cle: "teaser", titre: "teaser", largeur: 7 },
  { cle: "checkout", titre: "checkout", largeur: 9 },
  { cle: "dernier", titre: "dernier événement", largeur: 26 },
]);

/**
 * @param {string} value
 * @param {number} width
 */
function pad(value, width) {
  const text = String(value ?? "");
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

/**
 * Un uuid abrégé suffit à reconnaître un audit dans une liste de six, et un
 * tableau qui déborde ne se relit pas.
 *
 * @param {unknown} auditId
 */
export function abregerAuditId(auditId) {
  if (typeof auditId !== "string" || auditId === "") return "—";
  return auditId.length > 8 ? `${auditId.slice(0, 8)}…` : auditId;
}

/**
 * @param {Record<string, unknown>[]} lignes
 * @param {ReturnType<typeof synthetiser>} synthese
 * @param {string} base
 * @returns {string}
 */
export function formaterTableau(lignes, synthese, base) {
  const out = [];
  out.push("");
  out.push(`Attribution de prospection — ${base}`);
  out.push("");
  out.push(COLONNES_TABLEAU.map((col) => pad(col.titre, col.largeur)).join(" "));
  out.push(COLONNES_TABLEAU.map((col) => "─".repeat(col.largeur)).join(" "));

  for (const ligne of lignes) {
    const enErreur = ligne.erreur !== null && ligne.erreur !== undefined;
    /** @type {Record<string, string>} */
    const cellules = {
      marque: String(ligne.marque ?? ""),
      destinataire: String(ligne.destinataire_email ?? ""),
      date_envoi: String(ligne.date_envoi ?? ""),
      audit: abregerAuditId(ligne.audit_id),
      vu: enErreur
        ? `! ${String(ligne.erreur)}`
        : `${asNumber(ligne.report_viewed_human)} human / ${asNumber(ligne.report_viewed_internal)} internal`,
      teaser: enErreur ? "—" : String(asNumber(ligne.teaser_cta_click)),
      checkout: enErreur ? "—" : String(asNumber(ligne.checkout_opened)),
      dernier: enErreur ? "—" : String(ligne.last_event_at ?? "jamais"),
    };
    out.push(COLONNES_TABLEAU.map((col) => pad(cellules[col.cle], col.largeur)).join(" "));
  }

  out.push("");
  out.push(
    `${synthese.prospects_ayant_ouvert} / ${synthese.prospects_envoyes} prospects ont ouvert leur rapport ` +
      `(report_viewed en classe human, au moins une fois, sur au moins un de leurs audits).`
  );
  if (synthese.lignes_en_erreur > 0) {
    out.push(
      `${synthese.lignes_en_erreur} ligne(s) non mesurée(s) : elles portent leur motif dans la colonne report_viewed.`
    );
  }
  out.push("");
  return out.join("\n");
}

// ─── 5. Ligne de commande ─────────────────────────────────────────────────────

/**
 * Accepte les deux écritures d'option, avec un signe égal et avec une espace :
 * la seconde est celle de `scripts/verify-live.mjs`, et deux outils internes qui
 * ne se pilotent pas pareil font perdre du temps à chaque usage.
 *
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} [env]
 */
export function parseArgs(argv, env = {}) {
  let registre = DEFAULT_REGISTRE_PATH;
  let base = env.BASE_URL || DEFAULT_BASE_URL;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("--registre=")) {
      registre = arg.slice("--registre=".length);
    } else if (arg === "--registre") {
      registre = argv[index + 1] ?? registre;
      index += 1;
    } else if (arg.startsWith("--base=")) {
      base = arg.slice("--base=".length);
    } else if (arg === "--base") {
      base = argv[index + 1] ?? base;
      index += 1;
    }
  }

  return { registre, base: normalizeBase(base), json };
}

/**
 * @param {string[]} argv
 * @param {{ fetchImpl?: typeof fetch, readFile?: (path: string) => string, log?: (line: string) => void, logError?: (line: string) => void, env?: Record<string, string | undefined> }} [deps]
 * @returns {Promise<number>} le code de sortie
 */
export async function main(argv, deps = {}) {
  const readFile = deps.readFile ?? ((path) => readFileSync(path, "utf8"));
  const log = deps.log ?? ((line) => console.log(line));
  const logError = deps.logError ?? ((line) => console.error(line));
  const { registre, base, json } = parseArgs(argv, deps.env ?? process.env);

  let csvText;
  try {
    csvText = readFile(registre);
  } catch (error) {
    // Un message, pas une trace de pile : le cas normal est « le fichier n'est
    // pas là où tu crois », et une trace de pile ne dit pas ça.
    logError(
      [
        `Registre de prospection illisible : ${registre}`,
        messageOf(error),
        "",
        "Indiquer un autre chemin avec --registre=<chemin>. Ce fichier n'est pas suivi par git.",
      ].join("\n")
    );
    return 1;
  }

  const entrees = readRegistre(csvText);
  if (entrees.length === 0) {
    logError(
      `Aucune ligne de prospection dans ${registre} (en-tête attendu, entre autres : ${COLONNES_LUES.join(", ")}).`
    );
    return 1;
  }

  const lignes = await collecterAttribution(entrees, { base, fetchImpl: deps.fetchImpl });
  const synthese = synthetiser(entrees, lignes);

  log(json ? JSON.stringify({ base, registre, lignes, synthese }, null, 2) : formaterTableau(lignes, synthese, base));

  return 0;
}

const isMainModule =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  process.exit(await main(process.argv.slice(2)));
}
