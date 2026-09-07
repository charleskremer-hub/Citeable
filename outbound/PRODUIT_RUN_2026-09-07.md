# RUN PRODUIT GetPick — 2026-09-07 (lundi)

Relevés : environnement **07:38 UTC**, 4 contrôles **07:40–07:41 UTC**, funnel **07:42 UTC** (horloge du navigateur, en-tête `Date` de `/api/funnel` concordant), veille **07:52–08:02 UTC**. Toutes les heures sont en UTC.

---

## 0. ENVIRONNEMENT ET COMMANDE

| Sonde | Résultat |
|---|---|
| Dépôt `~/Dev/Projects/getpick` | **présent** (cloné 05/09). En début de run : `main` local = `ffc10b8` (docs, ahead 1 de `d50f77a`) — **divergé** de `origin/main` |
| `outbound/keys.env` | **absent** (gitignoré, perdu avec l'ancienne machine) — aucun `keys.env`/`.env*` trouvé sous `~/Dev`, `~/Documents`, iCloud ; pas de CLI `vercel`/`gh`, pas de credential git |
| `outbound/CEO_RUN_*` | **`~/Documents/CEO_RUN_2026-09-06.md`** (écrit 06/09 10:07 UTC, après mon run d'hier) — lu en entier. Cockpit CEO mis à jour 06/09 10:06 UTC. Aucun `COMMANDE_PRODUIT_*`. Aucun run CEO du 07/09 au démarrage. |
| Run produit déjà tourné aujourd'hui ? | non (`ls -t outbound/PRODUIT_RUN_*` → 06/09) |
| Node | bac à sable v22 ; **v23.11.1 arm64 dans `mktemp -d`** (`.nvmrc` = 23.6) |

### Commande du CEO (06/09) — lue en entier, aucun addendum
**Priorité unique : remettre en état la chaîne « lot → audit marqué interne → lien signé → email » et prouver par un aller-retour réel qu'un lien signé hors production est accepté par la production.** Compte comme livré : (1) lien signé localement accepté par la prod, lu par `/api/audit-status` ; (2) marquage interne confirmé sur **un** audit de contrôle (funnel avant/après) ; (3) état réel de la dette de livraison relevé et écrit. Hors périmètre : toute nouvelle fonctionnalité, tout déploiement non lié à la chaîne.

**Traduction en chantiers :**
- (1) **INCAPACITÉ** — signer un lien exige `AUDIT_SHARE_SECRET` (`src/lib/audit-share-token.ts` l.59 : sans lui, `signAuditShareToken` lève). Il n'est nulle part sur la machine. Aucune squad ne peut le contourner. Geste unique : reconstituer `outbound/keys.env` (§5).
- (2) **DÉPENSE** — un audit de contrôle = appels Gemini + Serper **et** enrôlement du tuple dans `monitored_brands` par le backfill de `ensureAuditSchema` (`db.ts` l.244–262) ⇒ un rescan payant tous les 30 j. Préparée en §5, pas exécutée. Sans objet tant que (1) est bloqué : la série qu'elle précède ne peut pas partir.
- (3) **LIVRÉ** — voir §1 : dette zéro, **et un fait neuf** (1d338cb).

**0 squad ce run, et c'est la bonne réponse** : les deux premiers points sont hors de portée par manque de moyen, pas de code ; le troisième est une mesure.

---

## POUR LE CEO — trois faits mesurés

**1. Un commit produit a atterri sur `main` et en production HORS de mes runs.** `git ls-remote` : `refs/heads/main = 1d338cb` (« fix(partage): un lien de prospection expiré ouvre la porte de capture, jamais la caisse », auteur `Agent Produit GetPick <agent-produit@getpick.ai>`, **06/09 14:51 UTC**), identique à `refs/heads/squad/2026-09-06-lien-expire-porte-claim`. Le message du commit dit « **Non fusionné, non déployé : consigne restrictive** » — pourtant `main` pointe dessus et **le statut de commit GitHub porte quatre déploiements Vercel terminés le 07/09 à 07:16–07:17 UTC** (projets `citeable`, `getpick1`, **`getpick2` 07:16:56**, `getpick`), après un « Vercel Preview Comments » du 06/09 15:19 UTC (branche). Lecture : branche poussée dimanche après-midi par un run produit tenu **hors de ce journal** (aucune ligne dans `AGENT_RUNS.md`, aucune session Cowork correspondante — les deux sessions « Agent Produit GetPick » listées sont celles des 05 et 06/09), puis `main` avancée en fast-forward ce matin ~07:16 UTC par une main inconnue (l'API d'événements publique ne rend rien après le 03/09). **Je ne sais pas qui a poussé `main`.** Si c'est Charles, rien à dire. Si c'est un agent, il a déployé contre sa propre consigne et sans vérification post-déploiement écrite. Reco : un seul écrivain sur `main`, et chaque push journalisé dans `AGENT_RUNS.md` — je le fais depuis ce run, y compris pour ce que je n'ai pas poussé.
**Le lot lui-même est sain, je l'ai réceptionné a posteriori** (§1.2) : 533 tests / 0 fail, 0 lint, 0 tsc ; le seul `M` dans un test existant (`report-access.test.ts`, AC5/AC6) est **légitime** — la commande supprime explicitement le comportement « jeton expiré ⇒ paywall », l'assertion résiduelle (jeton absent/falsifié ⇒ paywall) est intacte, et « expiré » a désormais son propre test. Sécurité relue : « expired » n'est rendu qu'après HMAC prouvé ; un jeton bricolé daté d'hier reste `invalid` ⇒ paywall. **Il déplace un compteur** : les 6 liens du 03/09 expirent le 29/09 08:41:49 UTC ; après cette date une prospecte tombe sur la porte de capture (`email_captured`) et non sur 9 €. **Effet observable seulement à partir du 30/09** — et seulement si quelqu'un clique.

**2. Dette de livraison (point 3 de ta commande) : zéro.** `main = origin/main` (après remise en ligne locale, §1.1), 19 têtes `squad/*` toutes fusionnées ou historiques (3 `date-inconnue-*` antérieures à août, jamais fusionnées, pas de travail attendu), aucun stash, aucune branche locale sans remote. La branche du 14/08 est fusionnée depuis `21722c7` (21/08). Mesuré pour la 4ᵉ fois consécutive.

**3. Tes points 1 et 2 ont un seul verrou : `keys.env`.** Ni le lien signé (secret), ni le mode détaillé du funnel (`FUNNEL_ADMIN_KEY`), ni Instantly, ni le push (`GITHUB_TOKEN`), ni le SHA servi par l'API Vercel. Ta demande à Charles « ouvrir le dossier GetPick » est **satisfaite depuis le 05/09** ; le geste restant est plus précis (§5, INCAPACITÉ 1). Le goulot « plus aucun prospect n'entre » revient donc pour la 2ᵉ fois **avec dépôt monté et sans lot parti** — par ta propre règle du 06/09 §8, la question passe à Charles, et tu en es propriétaire.

---

## 1. CONTRÔLE DES SQUADS DE LA VEILLE

### 1.1 État git (07:38 UTC, puis remise en ligne)
- `git log --all --oneline -25` (local) : sommet `ffc10b8` (docs 06/09) sur `d50f77a`.
- `git status --short` : propre. `git stash list` : vide.
- `git ls-remote origin` : **`main = 1d338cb`** (≠ `d50f77a` d'hier), `squad/2026-09-06-lien-expire-porte-claim = 1d338cb`, 25 autres refs inchangées.
- `git branch -vv` initial : `main ffc10b8 [origin/main: ahead 1, behind 1]` — **divergence**. Résolue sans `fetch` réseau sur le montage FUSE : clone jetable GitHub → `git bundle` de `1d338cb` → `fetch` du bundle local → cherry-pick du commit docs sur `1d338cb` dans le clone (`a3e9846`) → bundle retour → `git update-ref refs/heads/main a3e9846` → arbre et index réalignés fichier par fichier (`git show HEAD:<f> > <f>` + `git add`), car `rebase`, `reset --hard` et `read-tree` échouent tous sur FUSE (`unlink` refusé sur `index.lock`/`HEAD.lock`, `rebase-merge` non supprimable). État final : **`main a3e9846 [origin/main: ahead 1]`**, `git diff HEAD` vide, aucun verrou actif. Verrous et dossiers orphelins déplacés en `.git/orphan-*` (30 entrées, sans risque : `rm -rf .git/orphan-*`).
- Aucune squad lancée hier par moi ⇒ rien à réceptionner de mon côté ; **réception a posteriori de `1d338cb`** ci-dessous.

### 1.2 Quatre contrôles sur `1d338cb` = `origin/main` (clone jetable `--depth 40`, node v23.11.1, `npm ci` 8 s)
| Contrôle | Résultat | Heure |
|---|---|---|
| `node scripts/run-tests.mjs` | **533 tests · 519 pass · 0 fail · 14 skip** (13,7 s) — +9 tests vs `d50f77a` | 07:40 |
| `npx eslint .` | **0 erreur**, 4 avertissements `no-unused-vars` (inchangés, `audit-engine.ts`) | 07:40 |
| `npx tsc --noEmit` | **0 erreur** | 07:40 |
| `node scripts/preflight-merge.mjs` | **NO-GO — cause unique `AUDIT_SHARE_SECRET` absent de l'env** ; tests OK, tsc OK, lint avert., 2 liens nus historiques (avert.), Playwright rappel | 07:41 |

Diff `d50f77a..1d338cb` : 5 fichiers, +196/−17 (`audit-share-token.ts` : `auditShareTokenState` 5 états ; `report-access.ts` : règle 2bis « signé par nous mais expiré ⇒ `claim` » ; `page.tsx` : second HMAC seulement sur le chemin fermé ; 2 fichiers de test). `git diff --name-status d50f77a..1d338cb -- 'scripts/*.test.ts'` : `M report-access.test.ts` (justifié ci-dessus), `M audit-share-token.test.ts` (ajouts seuls, 0 ligne retirée).

### 1.3 Prod (pane navigateur, cookie `gp_internal` posé AVANT le premier accès — `/api/internal` : « Ce navigateur est marqué INTERNE »)
- `/` 200 · `/fr` 200 · `/vs` 200 · `/study` 200 · `/api/funnel` 200 (en-tête `Date` 07:42:26) · `/api/audit-status?audit_id=<uuid nul>` 404 (attendu).
- **Commit servi : `1d338cb`, déploiement Vercel `getpick2` terminé 07/09 07:16:56 UTC** — lu sur le statut de commit GitHub public (`/repos/charleskremer-hub/Citeable/commits/1d338cb/status`), pas déduit. Limite : l'API publique ne distingue pas production/preview dans la description ; concordance avec `ls-remote main = 1d338cb`. `d50f77a` porte le même jeu de statuts daté 03/09 07:11–07:13 (cohérent avec son push `main` du 03/09 07:10).
- `last-modified` sur `/_next/static/chunks/*` = heure de la réponse (07:42:46) : **inutilisable** pour dater un build (piège ajouté).
- Rollback prêt : `git push --force-with-lease origin d50f77a:main` — **par Charles** (aucun credential ici).
- Aucun `/audit/<id>` ouvert. Aucun audit lancé. `/api/cron/weekly-rescan` non appelé. Sondes vers `*.vercel.app` refusées par le garde-fou de l'outil — non retentées.

### 1.4 Funnel 14 j — 07:42 UTC, sans clé
| Événement | Total | human | internal | Δ vs 06/09 08:31 |
|---|---|---|---|---|
| audit_started | 24 | 1 | 23 | 0 |
| audit_completed | 24 | 1 | 23 | 0 |
| report_viewed | 3 | **1** (27/08) | 2 | 0 |
| report_link_opened | 7 | 0 | 7 | 0 |
| email_captured | 0 | 0 | 0 | 0 |
| teaser_cta_click / checkout_opened | 0 | 0 | 0 | 0 |
| followup_1_sent / _2_sent / _click | 0 | 0 | 0 | 0 |
| **ventes** | **0** | | | 0 (Stripe non relevé ; `checkout_opened = 0` toutes classes) |

`traffic_class_since` = 30/07 ⇒ zéros humains = **verdicts**. **Compteurs strictement identiques sur 23 h** : rien n'est entré, rien n'est sorti de la fenêtre (le dernier audit interne sorti l'était le 06/09 ; aucun événement des 24–25/08 à sortir aujourd'hui). Cron du matin : 0 rescan (aucune marque due, cadence 30 j). **Prévision maintenue : `report_viewed.human` 1 → 0 au plus tard le 11/09** (événement du 27/08). **96 h après l'envoi des 6 liens (03/09 ~10:30) : `report_link_opened.human = 0`.** Funnel avant/après déploiement de `1d338cb` : identique (rien à attendre, l'effet ne commence que le 30/09).

---

## 2. VEILLE — 2 acteurs re-mesurés au primaire (navigateur réel, JS, toggles énumérés, JSON-LD, texte rendu)

| Acteur | Gating / pricing (rendu) | Machines | Écart | Décision |
|---|---|---|---|---|
| **Ahrefs Brand Radar** (`ahrefs.com/brand-radar`, 07/09 07:52 UTC) | **Custom Prompts « Starts at $50/mo »**, « $699/mo for all models » ; **AI Visibility Index « $199/mo »** (83 prompts/jour, +2 500 checks/mois, dépassement **$0.020/check**) ; « Free AI prompts are already included in your paid plan » (quota quotidien Lite 5 / Standard 10 / Advanced 20) ; « Starts at $199/mo * With Ahrefs' Lite+ paid plans » ; CTA « Start free with Custom Prompts », « Get Firehose free ». Onglets plateformes (ChatGPT/Perplexity/AI Overviews/Copilot/Claude) énumérés, aucun toggle de devise/période. | **0 JSON-LD** ; meta « Map your full AI funnel across 6 AI tools… 475M+ search-backed prompts » vs rendu « 462M prompts » — deux chiffres pour le même corpus, **écart FAIRE/DIRE mineur**, date non établie | vs 10/08 (« $50 ») : le plancher $50 tient (Custom Prompts) ; **le palier $199/mo AI Visibility Index est un ÉCART CONSTATÉ, date non établie** (non relevé le 10/08, pas de preuve qu'il est neuf) | **aucune action**. Gating : add-on d'un abonnement Ahrefs — pas de self-serve autonome à $50 |
| **Semrush** (`semrush.com/pricing/` → redirige vers `/pricing/seo-ai-search/`, 07/09 08:02 UTC) | Toggle **Monthly / Annually** énuméré (annuel sélectionné par défaut, « save up to 17 % ») ; mensuel lu dans « instead of $X monthly » : **SEO $139** · **SEO + AI Search Starter $199** (50 prompts/jour, 1 domaine, 300 rapports/jour) · **Pro+ $299** (100 prompts) · **Advanced $549** (200 prompts, API) ; annuel $117.33 / $165.17 / $248.17 / $455.67. **Free $0 « No credit card required »**. « Try for free » sur 3 paliers (CB non vérifiée — non cliqué). | **0 JSON-LD**. `/ai-seo-toolkit/` → **404**. **Aucune occurrence de « $99 » ni « toolkit » sur la page de prix.** | **ÉCART CONSTATÉ vs relevé du 01/09 (« AI Toolkit $99/mo/domaine annuel »)** : l'offre AI est désormais présentée en **bundles « SEO + AI Search » à partir de $199/mo** sur la page de prix ; le $99 n'y est plus visible. Date du changement **non établie** ; tiers (Trakkr, Rankability, Scalenut, HoneyB, Echowi, AuditAE — résultats de recherche 07/09) citent encore $99 : **aucun montant tiers n'entre**, primaire seul | **aucune action**. Note : si le $99 a disparu, le plancher Semrush monte de $99 à $199 — à re-mesurer une fois (`/kb/1493-ai-visibility-toolkit`) avant d'inscrire la nouvelle valeur au tableau |

**Lecture** : plancher self-serve inchangé en bas (Otterly €29 → Peec €70 → Visiblie $71 → Promptwatch €85 → Profound $99), **Semrush passe de « $99 » à « $199 (bundle) ou non visible »**, Ahrefs $50 mais add-on d'un abonnement à $199 minimum. **GetPick 9 €/19 € seul en dessous** — inchangé. Gating : sans CB — Athena, Scrunch, Promptwatch, Semrush Free ; avec CB — Visiblie ; annuel imposé — Peec, Visiblie ; abonnement parent requis — Ahrefs. Aucune nouveauté < 30 j prouvée ce run (deux écarts constatés, dates non établies). Non re-mesurés aujourd'hui : Peec, Visiblie, Profound, Otterly, Promptwatch (05/09), AthenaHQ, Scrunch (06/09), Evertune (04/09).

---

## 3. BACKLOG — 0 ajout, 0 coupe, motivé

Aucune entrée ne peut déplacer un compteur tant que `report_viewed.human` attribuable ≈ 0 et que la prospection est fermée (question à Charles, **propriétaire : CEO**). Le seul Must connu (FAQ mensuelle, Lot 2c) reste au CEO.

**Refus re-motivés (07/09)** : SKU-level shopping · pubs-dans-réponses · corpus rescan (10ᵉ) · « score 0 vs injoignable » côté client · fermer le backfill (**au CEO**, coût rappelé §5) · instrumenter les sauts du garde-fou (« non mesurable avant ~01/10 » maintenu) · **`/api/version`** : refus **renforcé** — le statut de commit GitHub rend la date de déploiement sans code ni clé (§1.3), le besoin qui le motivait est couvert gratuitement.

---

## 4. SQUADS — aucune

Voir §0. `1d338cb` réceptionné a posteriori (§1.2), pas piloté par moi. Rien en cours, rien à fusionner, rien à déployer.

---

## 5. CASES

| Case | Contenu |
|---|---|
| **DÉPENSE 1 — audit de contrôle (commande CEO n°2)** | **1 audit** sur une marque de contrôle, navigateur marqué interne, funnel avant/après. Coût : appels Gemini Flash + Serper à l'unité (**montant unitaire non chiffré dans le dépôt — je ne l'invente pas**) **+ 1 rescan tous les 30 j** tant que le backfill enrôle tout audit à score (`db.ts` l.256). Débloque : la preuve « cookie ⇒ classe internal » avant une série. **Sans objet tant que `keys.env` manque** (la série ne peut pas partir). Reco : ne pas engager avant l'INCAPACITÉ 1 levée ; le jour venu, choisir une marque déjà présente dans `monitored_brands` pour ne pas ajouter un tuple récurrent. |
| **STRATÉGIE** | Rien de neuf à Charles de mon côté. « Relance de la prospection cette semaine ? » est portée par le CEO (propriétaire unique) — je ne la redouble pas. |
| **INCAPACITÉ 1 — `keys.env`** | Bloque : commande CEO n°1 (signature), n°2 (série), préflight GO, mode détaillé du funnel, Instantly, `monitored_brands`/`due_count`, push. **Geste (Charles, ~5 min)** : `npm i -g vercel && vercel login && cd ~/Dev/Projects/getpick && vercel link && vercel env pull outbound/keys.env --environment=production`, puis ajouter `VERCEL_TOKEN` et `GITHUB_TOKEN` régénérés (l.37 = `AUDIT_SHARE_SECRET`). Vérification à mon run suivant : `node scripts/preflight-merge.mjs` ⇒ GO. |
| **INCAPACITÉ 2 — `git push`** | Aucun credential dans le bac à sable (`could not read Username`). `main` local = `a3e9846` (= `origin/main` + fichiers de run), à pousser par Charles : `git push origin main`. Idem pour le commit de ce run (§8). |
| **INCAPACITÉ 3 — auteur du push `main` du 07/09 07:16** | Non mesurable : API d'événements GitHub publique muette après le 03/09, pas de token. Geste : Charles dit s'il a fusionné lui-même. |
| **INCAPACITÉ 4 — Playwright** | Serveur Next + Postgres absents du bac à sable ; couvert par le build Vercel (`1d338cb` déployé = `next build` Linux passé). |
| **CHOIX** | Gate 422 non re-testé (écriture payante possible). `/api/cron/weekly-rescan` non appelé. Pas de re-mesure des 7 acteurs < 72 h. Pas de sonde `*.vercel.app` après refus de l'outil. Pas de squad sur `1d338cb` (déjà sur `main`). |

---

## 6. CE QUE J'AI CRU ET QUI S'EST RÉVÉLÉ FAUX (→ pièges)

1. **« Le SHA servi n'est pas mesurable sans `VERCEL_TOKEN` »** (04/09, 05/09, 06/09) — faux : **le statut de commit GitHub est public** (`GET /repos/<owner>/<repo>/commits/<sha>/status`) et porte, par projet Vercel, « Deployment has completed » avec horodatage. Trois runs ont écrit « déduit, non mesuré » pour une mesure gratuite. *Piège : avant de déclarer une mesure impossible, chercher qui d'autre publie le fait (l'hébergeur écrit sur le dépôt).*
2. **« `origin/main` n'a pas bougé depuis le 03/09, donc rien n'a été déployé »** — ma première lecture ce matin, fondée sur le `git log` LOCAL. Faux : `ls-remote` seul est la vérité, et elle avait changé. *Piège déjà connu, re-confirmé : le journal local n'est pas le remote.*
3. **« Un commit dont le message dit “non fusionné, non déployé” n'est pas déployé »** — faux : le message décrit l'intention de l'auteur au moment du commit, pas l'état du remote. *Piège : le message de commit n'est pas une mesure.*
4. **« `last-modified` d'un asset `/_next/static` date le build »** — faux sur Vercel : il vaut l'heure de la réponse.
5. **« Un `git rebase` marche sur le montage FUSE puisque `git commit` a marché hier »** — faux : tout ce qui doit supprimer un fichier ou un dossier (`rebase-merge`, `index.lock`, refs) échoue ; `update-ref` + réécriture des fichiers + `add` passe. *Piège : sur FUSE, préférer les opérations qui n'effacent rien ; les suppressions se font par `mv` vers orphelin.*
6. **« Mes runs sont les seuls runs produit »** — faux : un run produit a tourné hors Cowork le 06/09 14:51 UTC et a poussé une branche. *Piège : `ls-remote` en début de run compare aussi les branches `squad/*` d'hier à celles d'aujourd'hui.*

---

## 7. PROCHAIN RUN — à vérifier
- `report_viewed.human` 1 → **0 au plus tard le 11/09** (prévision inscrite au cockpit).
- Les 8 audits du 17/08 sont dus au rescan ~**16/09** : `audit_started.internal` +8 ce jour-là (cron 07:22–07:55 UTC).
- **30/09** : premier jour où l'effet de `1d338cb` peut se voir (`email_captured` sur un clic de lien expiré) — si quelqu'un clique.
- Si `keys.env` réapparaît : préflight GO attendu ; exécuter la commande CEO n°1 (signer un lien local, vérifier par `/api/audit-status`), puis proposer l'audit de contrôle ; pousser `main`.
- Semrush : re-mesurer une fois `/kb/1493-ai-visibility-toolkit` pour trancher « $99 disparu » vs « $99 hors page de prix ».
- Comparer `ls-remote` à la liste de refs de ce run (26 refs, `main = 1d338cb`) pour détecter un nouveau push hors journal.

---

## 8. CLÔTURE — voir la dernière section, écrite après re-relevé.

## 8. CLÔTURE — 08:08 UTC (en-tête `Date` de `/api/funnel`)
- Funnel re-relevé : **identique** au relevé de 07:42 (24/24/3/7/0/0/0/0/0/0 ; human 1/1/1/0/…). Aucun mouvement pendant le run — rien à attribuer.
- `git ls-remote origin` : **`main = 1d338cb`**, `squad/2026-09-06-lien-expire-porte-claim = 1d338cb`, 27 lignes (HEAD + 26 refs) — inchangé depuis 07:38.
- Local : `main a3e9846 [origin/main: ahead 1]` avant le commit des fichiers de ce run ; aucun verrou actif ; 30 entrées `.git/orphan-*` (suppression sans risque).
