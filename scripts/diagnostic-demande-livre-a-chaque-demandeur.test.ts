/**
 * LE DIAGNOSTIC QUE L'UTILISATEUR DEMANDE LUI-MÊME PART À CHAQUE DEMANDEUR — LOT G1.
 *
 * Mesuré en production le 25/09 par le CEO (07:03–07:04Z, trois audits `free`,
 * `COMMANDE_PRODUIT_2026-09-25_ADDENDUM.md`) : une adresse JAMAIS VUE s'est vu
 * refuser son PREMIER diagnostic sur `inoxem.fr` puis sur `kapsens.com`
 * (`email_sent: false`, « Skipped: … already claimed. »), pendant qu'une
 * troisième adresse neuve passait sur `excilio.fr`. Ce n'est donc pas l'index
 * à vie `(email, step)` qui coupe — c'est
 * `audit_email_delivery_one_brand_step_day_idx`, unique sur
 * `(brand_domain, step, send_day)`, DONT LA CLÉ NE CONTIENT PAS LE
 * DESTINATAIRE :
 *
 *   le premier qui demande un diagnostic sur un domaine, un jour donné, est le
 *   seul à le recevoir ; tous les suivants reçoivent le silence.
 *
 * COMMENT CE TEST PROUVE QUELQUE CHOSE, ET OÙ IL S'ARRÊTE. Il n'affirme pas
 * qu'un texte SQL contient une chaîne : il **lit les `CREATE UNIQUE INDEX` que
 * `ensureAuditSchema` émet réellement**, en dérive les clés et les prédicats,
 * puis fait passer de vrais appels à `claimEmailDelivery` à travers ces
 * contraintes-là. Le comportement testé est donc celui que le schéma déclare,
 * pas celui que le test aurait redit. Ce qu'il ne couvre pas : l'exécution du
 * DDL par Postgres lui-même (aucune base ici) et la sémantique exacte de
 * `CURRENT_DATE` — le jour est constant dans ce test, ce qui est précisément le
 * cas qui casse.
 *
 * Le `pg.Pool` est remplacé au niveau du module (précédent :
 * `email-delivery-guard.test.ts`) : aucune connexion n'est ouverte, et la
 * doublure LÈVE sur ce qu'elle ne sait pas interpréter plutôt que d'inventer
 * une réponse.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const pgUrl = pathToFileURL(resolve(repoRoot, "node_modules/pg/lib/index.js")).href;

// `send_day` vaut `CURRENT_DATE` en base : la doublure le pilote, parce que la
// seule chose que le garde À VIE fait de plus que le garde du jour, c'est de
// tenir D'UN JOUR SUR L'AUTRE. Un test qui ne change jamais de jour ne peut pas
// le distinguer — c'est le trou que la mutation MG1e a trouvé dans la première
// version de ce fichier, verte alors que l'index à vie avait disparu.
let jourCourant = "2026-09-25";
const TABLE = "audit_email_delivery_log";

type Ligne = Record<string, string | null>;
type Index = { nom: string; colonnes: string[]; predicat: string };

const indexes: Index[] = [];
let lignes: Ligne[] = [];

/** `CREATE UNIQUE INDEX … nom ON table (a, b) WHERE <predicat>` → structure. */
function lireIndexUnique(sql: string): Index | null {
  const compact = sql.replace(/\s+/g, " ").trim();
  const motif = new RegExp(
    `CREATE UNIQUE INDEX (?:IF NOT EXISTS )?([a-z0-9_]+) ON ${TABLE} \\(([^)]*)\\)(?: WHERE (.*))?$`,
    "i"
  );
  const trouve = compact.match(motif);
  if (!trouve) return null;
  return {
    nom: trouve[1],
    colonnes: trouve[2].split(",").map((colonne) => colonne.trim()),
    predicat: (trouve[3] ?? "").trim(),
  };
}

/**
 * Interprète les seules formes de prédicat que ce schéma emploie. Toute autre
 * forme LÈVE : une doublure qui « ne sait pas » doit arrêter le test, pas
 * rendre `true` et laisser passer une régression.
 */
function predicatVrai(predicat: string, ligne: Ligne): boolean {
  if (!predicat) return true;

  return predicat
    .split(/\s+AND\s+/i)
    .map((clause) => clause.trim())
    .every((clause) => {
      const dansListe = clause.match(/^([a-z_]+) IN \(([^)]*)\)$/i);
      if (dansListe) {
        const valeurs = dansListe[2].split(",").map((valeur) => valeur.trim().replace(/^'|'$/g, ""));
        return valeurs.includes(String(ligne[dansListe[1]]));
      }
      const nonNul = clause.match(/^([a-z_]+) IS NOT NULL$/i);
      if (nonNul) return ligne[nonNul[1]] !== null && ligne[nonNul[1]] !== undefined;

      const egal = clause.match(/^([a-z_]+) = '([^']*)'$/i);
      if (egal) return ligne[egal[1]] === egal[2];

      const different = clause.match(/^([a-z_]+) <> '([^']*)'$/i);
      if (different) return ligne[different[1]] !== different[2];

      throw new Error(`prédicat non interprété par la doublure : « ${clause} »`);
    });
}

/** Rejoue `ON CONFLICT DO NOTHING` sur les index unique réellement déclarés. */
function conflit(candidate: Ligne): Index | null {
  for (const index of indexes) {
    if (!predicatVrai(index.predicat, candidate)) continue;
    // Une clé dont une colonne est NULL n'entre pas en conflit (sémantique
    // Postgres) — c'est la raison pour laquelle le prédicat `brand_domain IS
    // NOT NULL` existe, et il faut la respecter ici.
    if (index.colonnes.some((colonne) => candidate[colonne] === null || candidate[colonne] === undefined)) continue;

    const existe = lignes.some(
      (ligne) =>
        predicatVrai(index.predicat, ligne) &&
        index.colonnes.every((colonne) => ligne[colonne] === candidate[colonne])
    );
    if (existe) return index;
  }
  return null;
}

class FakePool {
  async query(text: string, params: unknown[] = []) {
    const index = lireIndexUnique(text);
    if (index) {
      const existant = indexes.findIndex((connu) => connu.nom === index.nom);
      if (existant >= 0) indexes[existant] = index;
      else indexes.push(index);
      return { rows: [], rowCount: 0 };
    }
    if (/^\s*DROP INDEX IF EXISTS ([a-z0-9_]+)/i.test(text)) {
      const nom = text.match(/DROP INDEX IF EXISTS ([a-z0-9_]+)/i)![1];
      const position = indexes.findIndex((connu) => connu.nom === nom);
      if (position >= 0) indexes.splice(position, 1);
      return { rows: [], rowCount: 0 };
    }
    if (text.includes(`INSERT INTO ${TABLE}`) && text.includes("'claimed'")) {
      const candidate: Ligne = {
        email: params[1] as string,
        brand_domain: (params[2] as string | null) ?? null,
        step: params[3] as string,
        status: "claimed",
        audience: (params[5] as string) ?? "prospect",
        send_day: jourCourant,
      };
      if (conflit(candidate)) return { rows: [], rowCount: 0 };
      lignes.push(candidate);
      return { rows: [{ id: `id-${lignes.length}` }], rowCount: 1 };
    }
    if (text.includes(`INSERT INTO ${TABLE}`)) return { rows: [], rowCount: 1 };
    if (text.includes("FROM subscriptions")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  }
}

mock.module(pgUrl, { namedExports: { Pool: FakePool } });

const { ensureAuditSchema } = await import("@/lib/db");
const { claimEmailDelivery } = await import("@/lib/audit-engine");

await ensureAuditSchema();

function reset() {
  lignes = [];
}

const demande = (email: string, websiteUrl: string, step = "audit_result") =>
  claimEmailDelivery({ email, websiteUrl, step: step as "audit_result", subject: "Ton diagnostic GetPick" });

test("la doublure a bien lu les index du schéma — sinon les trois tests suivants ne prouvent rien", () => {
  const noms = indexes.map((index) => index.nom);
  // Seuil volontairement BAS : ce test mesure que la doublure a lu le schéma,
  // pas que le correctif est là — c'est le rôle de G1.1 et G1.2. Un seuil calé
  // sur le nombre d'index d'aujourd'hui ferait rougir deux tests pour une seule
  // cause et rendrait la preuve de mutation illisible.
  assert.ok(indexes.length >= 3, `index unique lus sur ${TABLE} : ${noms.join(", ")}`);
  assert.ok(
    noms.some((nom) => /brand_step_day/.test(nom)),
    `le garde de marque doit exister : ${noms.join(", ")}`
  );
});

test("G1.1 — deux adresses DIFFÉRENTES, même domaine, même jour : les DEUX reçoivent", async () => {
  // La régression mesurée en production : le second demandeur recevait le
  // silence parce que le destinataire n'est pas dans la clé de l'index de
  // marque.
  reset();
  const premier = await demande("dirigeante@cabinet-lyon.fr", "https://inoxem.fr");
  const second = await demande("associe@cabinet-lyon.fr", "https://inoxem.fr");

  assert.equal(premier.allowed, true, "le premier demandeur doit recevoir");
  assert.equal(
    second.allowed,
    true,
    "un second demandeur du MÊME domaine le même jour doit recevoir son propre diagnostic"
  );
});

test("G1.2 — une MÊME adresse, deux domaines différents, même jour : les DEUX partent", async () => {
  // Le curieux qui accroche et teste un second domaine. Aujourd'hui il ne
  // recevait rien la seconde fois et concluait que le produit est cassé.
  reset();
  const premier = await demande("curieux@exemple.fr", "https://inoxem.fr");
  const second = await demande("curieux@exemple.fr", "https://kapsens.com");

  assert.equal(premier.allowed, true);
  assert.equal(second.allowed, true, "un second domaine le même jour doit produire un envoi");
});

test("G1.3 — la même adresse, le même domaine, le même jour, n'est servie qu'UNE fois", async () => {
  // La protection qui doit RESTER sur le diagnostic demandé : le destinataire
  // est dans la clé, mais la clé existe.
  reset();
  const premier = await demande("curieux@exemple.fr", "https://inoxem.fr");
  const rejoue = await demande("curieux@exemple.fr", "https://inoxem.fr");

  assert.equal(premier.allowed, true);
  assert.equal(rejoue.allowed, false, "un doublon strict du même jour ne doit pas repartir");
});

test("G1.4 — LA PROTECTION ANTI-SPAM NE PART PAS AVEC LE CORRECTIF : les relances restent tenues", async () => {
  // Les gardes ont été posés contre la prospection NON SOLLICITÉE. Ils doivent
  // rester entiers sur `j1_value` / `j3_offer` / `weekly_monitoring`, où la clé
  // sans destinataire est exactement ce qu'on veut.
  reset();
  const premiere = await demande("un@prospect.fr", "https://inoxem.fr", "j1_value");
  const seconde = await demande("autre@prospect.fr", "https://inoxem.fr", "j1_value");

  assert.equal(premiere.allowed, true);
  assert.equal(
    seconde.allowed,
    false,
    "une relance non sollicitée sur un domaine déjà servi le jour même doit rester bloquée"
  );

  // Et le garde À VIE reste entier lui aussi — ce qui ne se démontre qu'en
  // CHANGEANT DE JOUR, sinon c'est le garde `(email, send_day)` qui répond et
  // l'index à vie pourrait disparaître sans que rien ne rougisse.
  reset();
  jourCourant = "2026-09-25";
  assert.equal((await demande("un@prospect.fr", "https://a.fr", "j3_offer")).allowed, true);
  jourCourant = "2026-10-08";
  assert.equal(
    (await demande("un@prospect.fr", "https://b.fr", "j3_offer")).allowed,
    false,
    "le garde à vie (email, step) doit tenir une relance UN AUTRE JOUR, sur un autre domaine"
  );
  jourCourant = "2026-09-25";
});
