# PRODUIT_RUN — lundi 14 septembre 2026 (run automatisé, relevés 06:46–06:53 UTC, en-tête `Date` de `/api/funnel`)

Run de **réception a posteriori** du déploiement de la veille et de surveillance. Charles a poussé le 13/09 à 20:08 UTC (go nommé « Pousse »), Vercel a servi `65dd297` à 20:31:18 UTC. Aucune commande CEO du jour, aucune squad lancée, zéro dépense, zéro page `/audit/` ouverte.

## 0. Environnement (mesuré, pas hérité)

| élément | état |
|---|---|
| Dépôt `~/Dev/Projects/getpick` | présent, monté |
| `outbound/keys.env` | **ABSENT** (re-cherché) |
| `git push` depuis le bac à sable | **IMPOSSIBLE** — remote SSH `git@github.com:…` → `Host key verification failed` (aucune clé, aucun known_hosts) ; HTTPS sans credential |
| Node bac à sable | v22.23.2 arm64 → Node **v23.11.1** linux-arm64 téléchargé dans `mktemp -d` ; `npm ci` 6 s (réseau OK aujourd'hui) |
| Clone jetable | `git clone --depth 50 https://github.com/charleskremer-hub/Citeable.git` OK — rien fetché depuis le montage FUSE |
| Connecteur Stripe | **absent de cette session** (ToolSearch « stripe » : rien) — Ventes non relevées ici, dernier relevé CEO 13/09 15:12 : 0 charge, 4 sessions expirées |
| CEO du jour | aucun `CEO_RUN_2026-09-14`, cockpit CEO `updatedAt` 13/09 20:33 → la commande du 13/09 (§5 + §10) est la commande |
| Verrous git | `index.lock` orphelin (résidu CEO 22:33) neutralisé par `mv` → `.git/orph8-2026-09-14-index.lock` ; 9 orphelins antérieurs non nettoyés (FUSE refuse `unlink`) |
| `/tmp` | `home.html` / `chunks.txt` de la session CEO (13/09 22:32, propriétaire `nobody`) — écriture refusée ⇒ `mktemp -d` (piège confirmé) |

## 1. Contrôle des squads / réception de `65dd297`

- `git ls-remote https://github.com/charleskremer-hub/Citeable.git` : **`origin/main` = `65dd297`**. 25 refs `squad/*` sur origin, liste **identique** au 12/09. `squad/2026-09-10-caisse-mesurable` (`683f3fd`) toujours locale, contenue dans `main` — pas de dette.
- Local `main` = `9dc62df` (CEO, 13/09 22:33, journaux seuls) — **1 commit devant**, docs uniquement. Arbre propre, stash vide.
- Statut GitHub du commit `65dd297` : `Vercel – getpick2` **success, « Deployment has completed », 2026-09-13T20:31:18Z** (prod) ; getpick 20:30:55Z, citeable 20:31:34Z, getpick1 20:31:57Z (dormant, était *pending* hier — résolu).
- Diff code `1d338cb..65dd297` hors `outbound/` : `A scripts/home-checkout-counter.test.ts`, `M src/app/HomeClient.tsx`, `M src/app/audit/[id]/report-insights.ts`. **Diff tests : 1 A, 0 M.** Diff `f5a70f9` relu ligne à ligne : 3 libellés FR+EN du teaser, aucune logique touchée, `blockedBots` toujours conditionnel.

**Les quatre contrôles, sur le clone jetable de `65dd297`, Node 23.11.1 :**

| contrôle | résultat |
|---|---|
| `node scripts/run-tests.mjs` | **536 tests / 522 pass / 0 fail / 14 skip** (12,9 s) |
| `npx eslint .` | **0 erreur**, 4 avertissements (`audit-engine.ts`, inchangés) |
| `npx tsc --noEmit` | **0 erreur** |
| `node scripts/preflight-merge.mjs` | **VERDICT : GO** — *avec `AUDIT_SHARE_SECRET=placeholder` dans l'env* : le contrôle ne teste que la présence, le vrai secret est dans `keys.env` absent. Avertissements : 4 liens nus historiques, lint 4 avert., Playwright non lancé (serveur + Postgres absents) |

**Prod vérifiée :** `/`, `/fr`, `/vs`, `/study` → 200 ; `/api/audit-status` sans paramètre → 400. **Instrument corrigé du CEO ré-appliqué** : 10 chunks extraits du HTML servi, `/_next/static/chunks/1uj6n_doqneqo.js` contient `checkout_opened` ×1 et `pricing_card` ×2 ⇒ la prod sert bien le build de `be1c9cb`+. HTML serveur : 0 `checkout_opened` (normal, composant client).

**Relecture « à l'œil » du bloc verrouillé (commande CEO §5), sans ouvrir la page :** `/api/audit-status` ne rend PAS les `teaserItems` (calculés dans `page.tsx` au rendu). Fait à la place : `publishTeaserItems()` de `65dd297` exécutée localement sur les données réelles de l'audit de contrôle `2f1bccd9` (Solene Atelier, `completed`, score 75, 6 questions, `free`, en) via `node scripts/run-tests.mjs` sur un fichier de test jetable (retiré, arbre propre). Rendu FR : « Ta FAQ dans le format que les IA lisent » / « Ta fiche d'identité pour les assistants IA » / « Le déblocage qui laisse les IA entrer sur ton site » ; EN équivalent — conforme au commit. **Défaut relevé** : accord pluriel figé, « GPTBot ne peuvent pas lire ton site » quand un seul bot est bloqué (pré-existant, non introduit par `f5a70f9`) — fusionné dans le poste CEO §9.3, pas un chantier neuf.

**Contrôle croisé par clic interne : NON fait, même choix que le CEO** — un clic sur un bouton de prix crée une session Stripe. La preuve par le bundle suffit.

## 2. Métriques

### Ventes
Stripe **non relevé ce run** (connecteur absent de la session produit). Dernier relevé CEO 13/09 15:12 UTC : 0 charge, 4 sessions expirées (27/08 ×3, 31/07). `checkout_opened` = 0 toutes classes depuis que l'instrument est en prod (13/09 20:31 → 14/09 06:53 = 10 h de mesure). **Ventes : 0.**

### Funnel `GET /api/funnel?days=14` — 06:49:09 UTC, re-relevé 06:53:27 UTC (identique)

| événement | total | human | internal | bot | unknown | Δ vs CEO 13/09 15:12 |
|---|---|---|---|---|---|---|
| audit_started | **26** | 0 | 26 | 0 | 0 | **+1 internal** |
| audit_completed | **26** | 0 | 26 | 0 | 0 | **+1 internal** |
| report_viewed | **1** | 0 | **1** | 0 | 0 | **+1 internal** |
| report_link_opened | 6 | 0 | 6 | 0 | 0 | = |
| email_captured | **1** | 0 | 0 | 0 | **1** | **+1 unknown** |
| teaser_cta_click / checkout_opened / followup_* | 0 | 0 | 0 | 0 | 0 | = |

`traffic_class_since` 30/07 ⇒ zéros humains **mesurés**. **18ᵉ jour sans aucun événement humain.**

**Premier mouvement north-star en 4 runs — auteur cherché avant tout :**
- Fenêtre du mouvement : entre 13/09 15:12 et 14/09 06:49 UTC. **Pas le cron** (07:22–07:55 UTC, hors fenêtre) — et un rescan n'émet pas de `report_viewed`.
- Pas moi : aucune page `/audit/` ouverte, aucun `capture-email`/`claim-audit`, aucun audit lancé ; funnel identique entre mes deux relevés.
- `email_captured.unknown` = signature de **`/api/claim-audit`** (`report_gate`), qui n'écrit pas `trafficClass` (piège connu) ; `/api/capture-email` aurait écrit la classe.
- Lecture cohérente, **inférence et non mesure** : un navigateur marqué `gp_internal` (Charles, après le push de 20:31 — il a donné le retour terrain sur cette page le 13/09) lance un audit anonyme → voit le rapport → réclame avec un email. Les trois compteurs bougent de +1 sur le même chemin.
- **Attribution nominative : INCAPACITÉ** — `x-funnel-key` (`recent_events`) est dans `keys.env`, absent. Les 5 UUID connus des journaux interrogés par `/api/funnel?audit_id=` : 4 à zéro, `2f1bccd9` porte 1/1/1 en classe `unknown` = ses événements de juillet (l'endpoint par audit ignore `days`), pas le mouvement du jour.
- **Conséquence sur les KPI** : `report_viewed.human` = 0, `email_captured.human` = 0 — inchangés. Aucun prospect n'est entré.
- **Conséquence dépense** : si cet audit a un score, il est **enrôlé dans `monitored_brands`** (backfill) → rescan à 30 j, à coût d'API. Non annulable sans `DATABASE_URL`. Pour le CEO.

**Prévisions :** (a) `audit_started.internal` **+8 vers le 16/09** (rescan des 8 audits du 17/08) — maintenue, à vérifier au run du 16 ou 17/09 ; (b) `report_link_opened` 6 → sorties par le bord : les 6 liens du 03/09 sortent de la fenêtre **le 17/09** ⇒ attendu 0 ; (c) `report_viewed.internal` 1 et `email_captured.unknown` 1 sortent vers le **27/09**.

## 3. Veille Product Marketing — navigateur réel (JS + onglets + toggles + aria-label + JSON-LD), 14/09 06:51–06:53 UTC

**Profound** (`tryprofound.com/pricing`, `aria-label` number-flow) : onglet **For brands** — Starter **$99/month**, Growth **$399/month**, « Billed yearly, 2 months free », « Try for free » sur Growth, Enterprise custom ; **inchangé vs 05/09**. **Onglet « For agencies », jamais lu jusqu'ici (date non établie)** : Agency Growth **$99/month + add-ons** — **10 « pitch workspaces »/mois pour auditer des prospects (7 jours)**, client workspace **+$399/mois**, +5 trial workspaces $199/mois ; Agency Enterprise custom. Ligne « ChatGPT Shopping : No » sur Starter (grille des features). JSON-LD : Organization/WebSite seulement, **0 `Offer`**.
→ *Lecture :* Profound vend l'audit de prospect **comme outil de vente d'agence** (pitch workspace). C'est exactement le geste « audit gratuit → rapport → vente » de GetPick, mais packagé pour l'agence, pas pour le fondateur DTC. Un canal agence serait une **orientation stratégique** (cible), pas un chantier — 0 action tant que `report_viewed.human` = 0.

**Visiblie** (`visiblie.com/pricing`, EUR/USD + toggle « Yearly billing, Save 20 % » + onglets Done For You / Platform, JSON-LD `Offer` lu) — **CHANGÉ vs 05/09** :
- Platform, **mensuel par défaut** : Starter **€79/mo** (€63 annuel) · Growth **€129** (€103) · Scale **€199** (€159) · « Enterprise + Agencies » custom. USD : **$89 / $149 / $229** mensuel, $71 / $119 / $183 annuel. **JSON-LD concordant** (EUR 79/63, 129/103, 199/159, `billingDuration` implicite dans la description).
- **« Annuel imposé » (05/09) ne tient plus** : le toggle existe, mensuel par défaut — les $71/$119/$183 du 05/09 étaient la colonne annuelle USD (piège 8 : un toggle non cliqué). Date du changement **non établie**.
- **CB toujours requise** : « Card required to start your trial. Cancel anytime. »
- Done For You : Audit + Roadmap « Starting from **€900** » (USD $1,000) rendu **vs JSON-LD `price: 499 EUR`** — écart FAIRE/DIRE **persistant** ; Advisory « from €2,300/mo » ($2,292, $27 500/an) ; DFY « from €4,100/mo » ($4,125, $49 500/an).
- Bandeau « **Funding news : €500K** for AI search visibility » (date non établie, < 30 j non prouvé).
- Bloc **« Compare Visiblie against Tracking tools Otterly · Peec · Promptwatch — More data. No action. »** : Visiblie se positionne contre les trackers sur l'EXÉCUTION (« Measure. Fix. Re-test. Prove. », « Proof of lift : before/after on identical prompts »). Contre-exemple aux « trackers purs » ; à relire contre la promesse hero de GetPick (« fichiers prêts à installer » = exécution aussi) **si** la prospection reprend — orientation, pas chantier.

**Plancher self-serve mensuel (état 14/09)** : **€29 Otterly** · **€79 Visiblie** (nouveau plancher Visiblie, était lu $71 annuel) · €85 Peec · €85 Promptwatch · $99 Profound · $99 Semrush add-on · $250 Scrunch · $295 Athena · $800 Evertune (demo-only). **GetPick 9 €/19 € toujours seul sous 29.** Gating : CB requise Visiblie ; annuel imposé **plus personne** (Visiblie était la dernière) ; « pitch/prospect audit » packagé : Profound (agence) — 1 acteur, pas une tendance.

Non rafraîchis ce run (état 05–12/09 reconduit, daté) : Otterly, Peec (12/09), Promptwatch (05/09), Athena, Scrunch (06/09), Ahrefs, Semrush (07–11/09), Evertune (11/09).

## 4. Backlog — 0 ajout, 0 coupe, 1 fusion

- **Must connu** : FAQ mensuelle (Lot 2c) — au CEO, inchangé.
- **Poste CEO §9.3** (dé-jargonisation des libellés payants `techJsonLdLabel`/`techLlmsLabel`/`techRobotsLabel` + puce de prix « Fichiers machine prêts à installer ») : **désigné par le CEO comme candidat de son prochain run → je ne me l'auto-commande pas.** J'y **fusionne** l'accord pluriel du teaser (« GPTBot ne peuvent pas ») — même fichier de copy, même passe. Compteur visé : `teaser_cta_click` puis `checkout_opened`. Taille S.
- Refus re-motivés (inchangés depuis le 12/09, `report_viewed.human` = 0) : SKU-level shopping, pubs-dans-réponses, canal agence « pitch workspace » (Profound — stratégique, pas chantier), corpus rescan, « score 0 vs injoignable » client, fermer le backfill (CEO), instrumenter les sauts du garde-fou (≥ 01/10), `/api/version` (statut GitHub suffit), contrôle croisé Stripe/funnel par clic (salit le compteur).

## 5. Squads — ZÉRO

Commande CEO 13/09 : surveillance seule, interdiction de lancer un lot. Commande déjà exécutée (push par Charles, réception faite ci-dessus). Pas de commande neuve, poste suivant désigné par le CEO comme le sien, aucun compteur à déplacer sans humain dans le funnel ⇒ zéro squad est la bonne réponse. De toute façon **push impossible d'ici** (clé SSH absente) : un lot livré resterait local.

## 6. Cases

| case | contenu |
|---|---|
| **DÉPENSE / STRATÉGIE** | aucune dépense demandée (0 €). Rien de stratégique neuf à trancher côté produit ; les deux questions ouvertes (prospection oui/non, `keys.env`) sont au CEO. |
| **INCAPACITÉ** | (1) `git push` — geste : Charles pousse (`git push origin main`, remote déjà en SSH) ; (2) attribution nominative du mouvement funnel — geste : `vercel env pull outbound/keys.env --environment=production` (rend `FUNNEL_ADMIN_KEY`, `AUDIT_SHARE_SECRET`, `DATABASE_URL`) ; (3) Stripe — connecteur absent de la session produit (présent côté CEO) ; (4) Playwright — pas de serveur+Postgres, couvert par le build Vercel READY. |
| **CHOIX** | pas de clic interne sur les boutons de prix (crée une session Stripe) ; pas de re-test du gate 422 (écriture) ; cron non appelé (exécute) ; aucune page `/audit/` ouverte ; orphelins `.git/orph*` non nettoyés ; contrôles relancés malgré le rapport CEO (le CEO n'avait pas passé lint ni préflight) ; 2 acteurs seulement rafraîchis en veille (les 2 plus anciens à écart potentiel). |

## 7. Pour le CEO

1. **Dette de livraison soldée et RÉCEPTIONNÉE** : 4 contrôles verts sur `65dd297`, statut Vercel getpick2 20:31:18Z, chunk `1uj6n_doqneqo.js` porte `checkout_opened`. Ton diagnostic « la caisse n'est plus aveugle » est **renforcé** : preuve reproduite indépendamment.
2. **Le funnel a bougé de +1/+1/+1 (audit_started.int, report_viewed.int, email_captured.unknown) entre 13/09 15:12 et 14/09 06:49** — très probablement le test de Charles après le push (inférence, pas mesure ; nominatif impossible sans `keys.env`). Rien d'humain. **Coût** : l'audit créé est enrôlé dans `monitored_brands` (rescan 30 j payant) — à retirer si tu as `DATABASE_URL`, sinon à assumer.
3. `/api/audit-status` ne rend pas le teaser : la « relecture à l'œil » demandée s'est faite en exécutant `publishTeaserItems` du commit déployé sur les données de l'audit de contrôle — conforme. **Un défaut de copy** à fusionner dans ton poste §9.3 : accord pluriel figé (« GPTBot ne peuvent pas »).
4. **Visiblie n'impose plus l'annuel** (toggle, mensuel par défaut, Starter €79) — la ligne « annuel imposé : Visiblie seule » du 12/09 est **fausse aujourd'hui** ; plus aucun acteur n'impose l'annuel. Visiblie se positionne explicitement contre Otterly/Peec/Promptwatch sur l'exécution (« More data. No action. »).
5. **Profound vend un « pitch workspace » aux agences** ($99/mo, 10 audits de prospect/mois) — le geste audit→rapport→vente packagé pour un canal agence. Stratégique (cible/canal), à Charles si la prospection reprend ; 0 action produit.
6. Prévision maintenue : `audit_started.internal` +8 vers le 16/09 ; `report_link_opened` → 0 le 17/09.

## 8. Ce que j'ai cru et qui s'est révélé faux

- **« Relecture du bloc verrouillé via `/api/audit-status` » supposait que l'API rend le teaser** — faux : `teaserItems` n'existe qu'au rendu de `page.tsx`. La relecture se fait en exécutant la fonction pure du commit déployé sur les données réelles de l'API. *Avant de promettre une lecture par une route, vérifier ce que la route rend.*
- **« Un run précédent a passé les tests ⇒ le lot est réceptionné »** — le CEO avait passé tsc + tests, pas lint ni préflight. Les quatre, pas deux.
- **`/api/funnel?audit_id=` ignore `days`** : il rend le cumul de l'audit depuis l'origine — un 1/1/1 sur un vieil audit n'est pas un mouvement du jour.
- **`/tmp` portait des fichiers de la session CEO (propriétaire `nobody`)** : `> /tmp/home.html` refusé. `mktemp -d`, toujours — piège déjà écrit, re-vérifié à mes dépens.
- **`git ls-remote origin` sur un remote SSH échoue dans le bac à sable** (`Host key verification failed`) : passer l'URL HTTPS publique en clair à `ls-remote`, la vérité du remote reste lisible sans credential.
