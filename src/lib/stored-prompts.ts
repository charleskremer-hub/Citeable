import { pool } from "./db";

/**
 * LOT A de la commande du 20/09 — PERSISTER LES QUESTIONS.
 *
 * Le défaut corrigé ici. `generateBuyerIntentPromptsAI` tourne à
 * `temperature: 0.7` et le moteur l'appelait à CHAQUE exécution, rescan
 * compris. Deux audits de la même marque ne posaient donc pas les mêmes
 * questions — et `compareCompetitorMovement` apparie les mois PAR LE TEXTE de
 * la question (`normalizePromptKey`). Pour toute question régénérée,
 * l'historique était vide, donc chaque concurrent passait pour un
 * `new_competitor` « apparu ce mois-ci ». Le client paie 9 €/mois pour suivre
 * une évolution et recevait du bruit.
 *
 * Ce module porte la DÉCISION (fonction pure, testable sans base) et son
 * STOCKAGE (trois requêtes, frontière technique unique). Le moteur d'audit ne
 * décide plus lui-même s'il régénère : il consulte `planBuyerIntentPrompts`.
 *
 * Règle, telle que la commande l'écrit : « La régénération ne survient que sur
 * un déclencheur explicite : nouvelle marque, changement de catégorie, ou
 * demande du client. Jamais en silence. »
 */

export type StoredPromptSet = {
  prompts: string[];
  category: string;
  count: number;
};

/**
 * Pourquoi le plan a été pris. Un seul motif signifie « on rejoue »
 * (`stored`) ; tous les autres sont des déclencheurs EXPLICITES de
 * régénération, et le motif est écrit dans `promptDebug` puis persisté avec
 * l'audit — une régénération silencieuse ne doit pas exister.
 */
export type PromptPlanReason =
  | "stored"
  | "new_brand"
  | "category_changed"
  | "tier_changed"
  | "client_request";

export type PromptPlan = {
  action: "replay" | "regenerate";
  reason: PromptPlanReason;
  prompts: string[];
};

/**
 * Décide, sans aucun appel réseau ni base, si l'audit rejoue les questions
 * stockées ou les régénère.
 *
 * L'ordre des tests est intentionnel : la demande explicite du client
 * (`force`) l'emporte sur tout le reste, y compris sur un jeu stocké valide —
 * c'est le seul chemin par lequel un client peut reprendre la main.
 *
 * `tier_changed` n'est PAS un chemin vivant aujourd'hui (tous les tiers non
 * gratuits demandent 12 questions, et une marque surveillée n'est jamais
 * gratuite) : c'est une garde. Elle est nommée plutôt que muette pour que, le
 * jour où un tier change le compte, la régénération porte un motif lisible au
 * lieu de ressembler à la dérive que ce lot corrige.
 */
export function planBuyerIntentPrompts(
  stored: StoredPromptSet | null | undefined,
  context: { category: string; count: number; force?: boolean }
): PromptPlan {
  if (context.force === true) {
    return { action: "regenerate", reason: "client_request", prompts: [] };
  }

  if (!stored || stored.prompts.length === 0) {
    return { action: "regenerate", reason: "new_brand", prompts: [] };
  }

  if (stored.category !== context.category) {
    return { action: "regenerate", reason: "category_changed", prompts: [] };
  }

  if (stored.count !== context.count) {
    return { action: "regenerate", reason: "tier_changed", prompts: [] };
  }

  // « Rejouées TELLES QUELLES » : même contenu, même ORDRE. La copie évite
  // qu'un appelant mute le jeu stocké en mémoire ; l'ordre compte parce que la
  // règle d'arrêt du moteur parcourt les questions dans l'ordre.
  return { action: "replay", reason: "stored", prompts: [...stored.prompts] };
}

export type ResolvedPromptSet = {
  prompts: string[];
  promptDebug: string;
  /** GELÉ : voir le commentaire dans `resolveBuyerIntentPromptSet`. */
  promptSet: Readonly<StoredPromptSet>;
  promptSetSource: "stored" | "generated";
};

/**
 * Applique le plan : rejoue, ou appelle `generate`.
 *
 * `generate` est INJECTÉ — c'est tout l'intérêt de cette fonction. Le moteur
 * d'audit lui passe la closure qui appelle Gemini ; un test lui passe une
 * doublure qui LÈVE. Un rejeu qui régénérerait quand même fait alors tomber le
 * test, au lieu d'être seulement démenti par la lecture du fichier.
 *
 * *Écrit après une preuve de mutation ratée : la première version gardait la
 * décision enfouie dans `analyzeBuyerIntentPrompts`, et supprimer purement et
 * simplement la branche de rejeu laissait la suite au vert. Un verrou qui lit
 * la source ne tombe que sur l'orthographe de la faute ; une décision
 * exécutable tombe sur la faute.*
 */
export async function resolveBuyerIntentPromptSet(
  stored: StoredPromptSet | null | undefined,
  context: { category: string; count: number; force?: boolean },
  generate: () => Promise<{ prompts: string[]; promptDebug: string }>
): Promise<ResolvedPromptSet> {
  const plan = planBuyerIntentPrompts(stored, context);

  if (plan.action === "replay") {
    return {
      prompts: plan.prompts,
      promptDebug: `stored:${plan.prompts.length}`,
      // GELÉ. L'audit adversarial du 21/09 a montré qu'une ligne ajoutée après
      // coup (`resolved.promptSet.prompts = probed.prompts.map(...)`) rétablit
      // la faute que le verrou prétendait interdire, en satisfaisant toutes ses
      // assertions de source. Un objet figé fait LEVER cette réécriture : la
      // propriété devient une propriété du code, pas de son orthographe.
      promptSet: Object.freeze({ prompts: plan.prompts, category: context.category, count: context.count }),
      promptSetSource: "stored",
    };
  }

  const generated = await generate();

  // Le jeu persisté est la liste rendue par la génération, AVANT tout sondage.
  // Le sondage s'arrête au premier appel non « checked » et rend une liste
  // tronquée : la persister ferait rétrécir le jeu du client à chaque incident
  // moteur, sans qu'aucune régénération ne soit jamais déclenchée.
  return {
    prompts: generated.prompts,
    promptDebug: `${generated.promptDebug}|regen:${plan.reason}`,
    promptSet: Object.freeze({ prompts: generated.prompts, category: context.category, count: context.count }),
    promptSetSource: "generated",
  };
}

/**
 * Charge le jeu stocké d'un audit, DÉPENDANCES INJECTÉES.
 *
 * Écrit après l'audit adversarial du 21/09, qui a démontré trois
 * contournements — inverser le test de tier, jeter le jeu chargé, désactiver
 * la garde d'écriture — qui restauraient INTÉGRALEMENT le défaut d'origine
 * tout en laissant la suite au vert, parce que le câblage n'était vérifié que
 * par lecture de la source. *Un verrou de source ne prouve pas qu'une ligne
 * est atteinte.* Cette orchestration est donc sortie de `completeQueuedAudit`
 * pour devenir exécutable en test.
 */
export async function loadPromptSetForAudit(
  ctx: { auditTier: string; email: string; brandName: string; websiteUrl: string },
  deps: {
    findMonitoredBrandId: (email: string, brandName: string, websiteUrl: string) => Promise<string | null>;
    loadStoredPromptSet: (monitoredBrandId: string) => Promise<StoredPromptSet | null>;
  }
): Promise<{ monitoredBrandId: string | null; storedPromptSet: StoredPromptSet | null }> {
  // Tier gratuit : aucune marque surveillée, aucun historique à respecter,
  // aucune requête inutile.
  if (ctx.auditTier === "free") return { monitoredBrandId: null, storedPromptSet: null };

  const monitoredBrandId = await deps.findMonitoredBrandId(ctx.email, ctx.brandName, ctx.websiteUrl);

  if (!monitoredBrandId) return { monitoredBrandId: null, storedPromptSet: null };

  return { monitoredBrandId, storedPromptSet: await deps.loadStoredPromptSet(monitoredBrandId) };
}

/**
 * Persiste le jeu de questions APRÈS l'audit, DÉPENDANCES INJECTÉES.
 *
 * Rend un verdict explicite (`saved` + `reason`) plutôt qu'un `void` : un test
 * peut ainsi distinguer « rien à écrire » de « écriture sautée par erreur »,
 * ce qu'un effet de bord silencieux ne permet pas.
 */
export async function persistPromptSetAfterAudit(
  ctx: { auditTier: string; email: string; brandName: string; websiteUrl: string; monitoredBrandId: string | null },
  report: { promptSet?: StoredPromptSet; promptSetSource?: "stored" | "generated" },
  deps: {
    findMonitoredBrandId: (email: string, brandName: string, websiteUrl: string) => Promise<string | null>;
    saveStoredPromptSet: (monitoredBrandId: string, set: StoredPromptSet) => Promise<void>;
  }
): Promise<{ saved: boolean; reason: "free_tier" | "replayed" | "no_prompt_set" | "brand_not_found" | "saved" }> {
  if (ctx.auditTier === "free") return { saved: false, reason: "free_tier" };
  // On ne persiste QUE ce qui vient d'être généré. Réécrire un jeu rejoué à
  // l'identique à chaque cycle serait une écriture inutile, et surtout une
  // porte par laquelle une dérive future repasserait sans qu'aucun motif de
  // régénération n'ait jamais été enregistré.
  if (report.promptSetSource !== "generated") return { saved: false, reason: "replayed" };
  if (!report.promptSet || report.promptSet.prompts.length === 0) return { saved: false, reason: "no_prompt_set" };

  // L'identifiant est re-cherché quand il manquait avant le pipeline : c'est le
  // cas du TOUT PREMIER audit payant, où la ligne de surveillance vient d'être
  // créée par l'upsert. Sans ce second passage, la première exécution ne
  // stockerait rien et la deuxième régénérerait — le défaut serait décalé d'un
  // mois, pas supprimé.
  const brandId = ctx.monitoredBrandId ?? (await deps.findMonitoredBrandId(ctx.email, ctx.brandName, ctx.websiteUrl));

  if (!brandId) return { saved: false, reason: "brand_not_found" };

  await deps.saveStoredPromptSet(brandId, report.promptSet);
  return { saved: true, reason: "saved" };
}

/**
 * Détecte la contradiction que AUCUN test unitaire ne peut attraper : un jeu
 * stocké a été chargé, et le rapport revient quand même « régénéré ».
 *
 * L'audit du 21/09 a montré qu'une seule ligne de `runAudit` — jeter
 * `args.storedPromptSet` — suffit à annuler tout le lot, et qu'elle n'est pas
 * atteignable depuis une suite unitaire (le pipeline exige réseau + base).
 * *Ce qui ne peut pas être prouvé par un test reçoit un invariant
 * OBSERVABLE* : l'anomalie est écrite dans `raw_results`, donc lisible sur
 * n'importe quel audit de production, au lieu d'être silencieuse.
 */
export function detectPromptSetAnomaly(
  storedPromptSet: StoredPromptSet | null,
  report: { promptSetSource?: "stored" | "generated"; promptDebug?: string }
): string | null {
  if (!storedPromptSet || storedPromptSet.prompts.length === 0) return null;
  if (report.promptSetSource === "stored") return null;

  return `jeu stocké de ${storedPromptSet.prompts.length} questions chargé, rapport rendu en "${report.promptSetSource ?? "inconnu"}" (${report.promptDebug ?? "sans motif"})`;
}

/**
 * Identifie la ligne `monitored_brands` d'un audit. Rend `null` quand la marque
 * n'est pas (encore) surveillée — cas du tout premier audit payant, où la ligne
 * n'est créée qu'APRÈS le rendu du rapport par `upsertMonitoredBrandForAudit`.
 */
export async function findMonitoredBrandId(email: string, brandName: string, websiteUrl: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM monitored_brands WHERE email = $1 AND brand_name = $2 AND website_url = $3 LIMIT 1`,
    [email, brandName, websiteUrl]
  );

  return result.rows[0]?.id ?? null;
}

export async function loadStoredPromptSet(monitoredBrandId: string): Promise<StoredPromptSet | null> {
  const result = await pool.query<{ prompts: unknown; category: string; prompt_count: number }>(
    `SELECT prompts, category, prompt_count FROM monitored_brand_prompts WHERE monitored_brand_id = $1`,
    [monitoredBrandId]
  );
  const row = result.rows[0];

  if (!row) return null;

  // `prompts` est un JSONB. Un contenu qui n'est pas une liste de chaînes est
  // traité comme une ABSENCE de jeu stocké, pas comme un jeu vide : le plan
  // régénérera avec le motif `new_brand` au lieu de rejouer du vide, et une
  // ligne corrompue ne peut donc pas éteindre les questions d'un client.
  const prompts = Array.isArray(row.prompts) ? row.prompts.filter((item): item is string => typeof item === "string") : [];

  if (prompts.length === 0) return null;

  return { prompts, category: row.category, count: Number(row.prompt_count) };
}

export async function saveStoredPromptSet(monitoredBrandId: string, set: StoredPromptSet): Promise<void> {
  // Écriture refusée sur un jeu vide : stocker `[]` rendrait la marque
  // définitivement muette, et `loadStoredPromptSet` le relirait comme une
  // absence à chaque exécution — une boucle de régénération silencieuse,
  // exactement ce que ce lot supprime.
  if (set.prompts.length === 0) return;

  await pool.query(
    `INSERT INTO monitored_brand_prompts (monitored_brand_id, prompts, category, prompt_count)
     VALUES ($1, $2::jsonb, $3, $4)
     ON CONFLICT (monitored_brand_id) DO UPDATE
     SET prompts = EXCLUDED.prompts,
         category = EXCLUDED.category,
         prompt_count = EXCLUDED.prompt_count,
         updated_at = now()`,
    [monitoredBrandId, JSON.stringify(set.prompts), set.category, set.count]
  );
}
