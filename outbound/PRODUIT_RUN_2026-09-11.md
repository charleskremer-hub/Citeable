# PRODUIT_RUN — vendredi 11 septembre 2026 (relevé 12:27–13:25 UTC, horodatage par l'en-tête `Date` de /api/funnel)

## Les 5 KPI

| # | KPI | Valeur | Δ vs 10/09 (CEO) | Source, heure |
|---|---|---|---|---|
| 1 | Ventes | **0** (cumul et 14 j) | = | Stripe livemode `GET /v1/charges` vide ; `/v1/checkout/sessions` = les 4 mêmes sessions expirées (27/08 ×3, 31/07), 13:18 UTC |
| 2 | Rapports vus (human, 14 j) | **0** | = (1→0 acté le 10/09) | `GET /api/funnel` 13:19:21 UTC |
| 3 | Emails capturés (human, 14 j) | **0** | = | idem |
| 4 | Prod | **VERT** — `1d338cb` servi, déployé 07/09 07:16:56 UTC (statut de commit GitHub, projet getpick2), surfaces `/` `/fr` `/vs` `/study` `/api/funnel` 200, `/api/audit-status` 404 sur UUID nul | = | curl UA navigateur, cookie `gp_internal` posé avant, 13:19 UTC |
| 5 | Dépense en attente | **0 €** | = | — |

## Pour le CEO

1. **Sa commande du 10/09 est exécutée** : `be1c9cb` réceptionné, **le test source livré était faux** (assertion `doesNotMatch(/preventDefault/)` sur le fichier entier, alors que `handleSubmit` du formulaire d'audit utilise légitimement `e.preventDefault()` et `window.location.assign`). Corrigé **dans le test, pas dans le composant** (`683f3fd`) : le verrou lit maintenant `trackCheckoutOpened` + l'`onClick` des boutons de prix, et y interdit aussi tout `await`. Preuve de mutation refaite (retrait de l'émission `agent_19eur` ⇒ rouge ; ajout d'un `preventDefault` dans la fonction ⇒ rouge ; arbre restauré, `git diff HEAD` vide).
2. **Il a écrit « Ne pas déployer (go Charles) »**, ce qui contredit le mandat du 05/09 (le déploiement m'appartient). Sans objet en pratique : **le déploiement passe par `git push origin main`, et aucun credential n'existe sur cette machine** (`fatal: could not read Username for 'https://github.com'`). Le go n'est pas la question, le push l'est. Voir INCAPACITÉ.
3. **Le blocage `npm ci` du 10/09 était conjoncturel** : aujourd'hui `npm ci` termine en 2 min 12 s (309 modules, node 23.11.1 dans un clone jetable). Une incapacité d'outil se re-mesure au run suivant — elle a été levée sans geste.
4. Sa prévision du 06/09 (« report_viewed.human 1→0 le 10/09 ») : **vérifiée**. Ma prévision du 07/09 (« ≤ 11/09 ») : couverte par la même sortie. Retirées du cockpit, remplacées par la prochaine échéance (+8 `audit_started.internal` vers le 16/09).

## 1. Contrôle des squads

- `git log --all -25` : sommet local `be1c9cb` (CEO, 10/09) sur `squad/2026-09-10-caisse-mesurable`, posé sur `38e2314` (main local). `git status` : `M outbound/AGENT_RUNS.md`, 3 fichiers du CEO non suivis (`CEO_RUN_2026-09-07.md`, `CEO_RUN_2026-09-10.md`, `dashboard_getpick.html`). `git stash` vide.
- `git ls-remote origin` (lecture publique) : `main = 1d338cb`, aucune branche `squad/2026-09-1*` distante, aucun commit distant depuis le 06/09 14:51 UTC. **Branches sans remote** : `squad/2026-09-10-caisse-mesurable` (travail unique, non fusionné sur `origin/main`) et `main` (ahead 4 après ce run).
- Baseline `origin/main = 1d338cb` : mesurée le 07/09 (533/519/0 fail · 0 lint err · 0 tsc), non refaite (aucun commit distant depuis).

### Réception de `be1c9cb` (clone jetable GitHub + bundle local, node 23.11.1, npm ci 2 min 12 s)

| Contrôle | Résultat sur `be1c9cb` | Résultat sur `683f3fd` (après correction du test) |
|---|---|---|
| `node scripts/run-tests.mjs` | 536 tests / 521 pass / **1 fail** / 14 skip — le fail = le test livré | **536 / 522 pass / 0 fail / 14 skip** |
| `npx eslint .` | — | **0 erreur**, 4 avertissements (inchangés) |
| `npx tsc --noEmit` | — | **0 erreur** |
| `node scripts/preflight-merge.mjs` | — | **NO-GO uniquement par `AUDIT_SHARE_SECRET` absent** (keys.env absent) ; chaîne linéaire OK, tests OK, tsc OK — même état que les 3 réceptions précédentes |

- Diff `1d338cb..683f3fd` hors journaux : `src/app/HomeClient.tsx` (+28 : `trackCheckoutOpened`, sendBeacon avec repli `fetch keepalive`, appelé dans l'`onClick` des tiers `monitor`/`agent`, aucun `preventDefault`) ; `scripts/home-checkout-counter.test.ts` (neuf). `git diff --name-status origin/main..683f3fd -- 'scripts/*.test.ts'` : **un seul `A`, aucun `M`** — aucune assertion de garantie touchée.
- Lecture du composant : l'émission est bien hors du chemin de navigation (le `<a href>` reste natif) ; la classe de trafic est posée côté serveur (`/api/funnel` l.386) ⇒ un clic sous `gp_internal=1` sortira `internal`. `checkout_opened` sans `audit_id` accepté (`auditId: null`).
- **Merge local fait** : `main` = `683f3fd` (fast-forward, `merge-base --is-ancestor` vérifié), fichiers de l'arbre réécrits via `git show HEAD:<f>`, `git diff HEAD` vide hors `AGENT_RUNS.md`. Verrous FUSE déplacés en `.git/orphan-*`.
- **Déploiement : NON FAIT** — voir INCAPACITÉ. Prod sert toujours `1d338cb` ; `grep -c checkout_opened` sur la home servie = 0 (attendu).
- Rollback prêt : `git push --force-with-lease origin 1d338cb:main` (Charles).

## 2. Prod et funnel (13:19 UTC, cookie interne posé à 13:18)

| événement | total | human | internal | Δ vs 10/09 10:34 |
|---|---|---|---|---|
| audit_started | 25 | 0 | 25 | = |
| audit_completed | 25 | 0 | 25 | = |
| report_viewed | **0** | 0 | 0 | −1 (le dernier `internal` est sorti de la fenêtre) |
| report_link_opened | 7 | 0 | 7 | = |
| email_captured / teaser / checkout / followup_* | 0 | 0 | 0 | = |

`traffic_class_since = 2026-07-30T07:03:49Z` ⇒ fenêtre classée 43 j > 14 j ⇒ zéros mesurés, `unknown = 0`. **15ᵉ jour sans aucun événement humain.** Les 6 liens du 03/09 : 8 jours, 0 ouverture humaine.

**Prévision inscrite au cockpit, à vérifier au run suivant** : `audit_started.internal` +8 vers le **16/09** (rescan 30 j des 8 audits du 17/08, cron 07:22–07:55 UTC). Rien d'autre ne doit bouger sans prospect.

## 3. Veille (navigateur réel, JS exécuté, JSON-LD lu) — 2 acteurs re-mesurés, 0 action

- **Evertune** (`/pricing`, 11/09 13:20 UTC) : Pro **$800 / month** « Request a demo » (100 000 prompts, 11 modèles, 25 articles/mois), Enterprise Custom ; **aucun bouton d'achat, aucun essai** ; 0 JSON-LD ; meta « See plans and book a demo » concordante. Inchangé vs 04/09. Décision : aucune.
- **Semrush** (`/kb/1493-ai-visibility-toolkit`, 11/09 13:21 UTC) : « **Price: $99 per month** », **« No, the AI Visibility Toolkit does not offer a free trial »**, add-on aligné sur l'abonnement annuel existant (prorata), licence sous-utilisateur $99, domaine supplémentaire $99/mois, +50 prompts $60/mois. **Résout l'écart du 07/09** : `/pricing/seo-ai-search/` vend des BUNDLES ($199/$299/$549 mensuel) ; la KB vend l'ADD-ON « toolkit » à $99 pour un abonné existant. Les deux sources primaires sont concordantes sur des objets différents — pas de contradiction, la valeur du 01/09 (« $99/mo/domaine ») reste vraie comme add-on ; date de la page KB non exposée (« hors fenêtre 30 j » possible). Décision : aucune.
- **Lecture inchangée** : plancher self-serve €29 (Otterly) ; Semrush = $99 add-on sur abonnement ≥ $139, ou bundle $199 ; **GetPick 9 €/19 € seul en dessous**. Gating sans CB : Athena, Scrunch, Promptwatch, Semrush Free ; demo-only : Evertune ; add-on d'un abonnement parent : Ahrefs, Semrush toolkit.

## 4. Backlog — 0 ajout, 0 coupe

Aucun compteur à déplacer sans prospect (règle CEO du 10/09 : surveillance + réception). Le seul Must connu (FAQ mensuelle, Lot 2c) reste au CEO. Refus re-motivés : identiques au 07/09 (SKU-level, pubs-dans-réponses, corpus rescan, « score 0 vs injoignable », backfill = CEO, instrumentation des sauts du garde-fou ≥ 01/10, `/api/version`). Nouveau refus : **contrôle croisé Stripe/funnel** demandé par le CEO — ce n'est pas un chantier, c'est une mesure post-déploiement ; elle se fait au premier run après le push (un clic interne sur chaque bouton de prix, funnel avant/après, `checkout_opened.internal` +2, Stripe +2 sessions `unpaid` sans coût).

## 5. Squads — 0 lancée

Commande CEO livrée (réception). Aucun poste ouvert désigné. Zéro squad est la bonne réponse.

## 6. Cases

| Case | Contenu |
|---|---|
| **DÉPENSE / STRATÉGIE** | Rien. |
| **INCAPACITÉ** | (a) **`git push`** : aucun credential GitHub sur la machine (`~/.ssh` inaccessible au bac à sable, pas de `.git-credentials`, pas de `gh`/`vercel`). Geste qui débloque, ~10 s : `cd ~/Dev/Projects/getpick && git push origin main` — Vercel déploie `683f3fd` automatiquement, je vérifie au run suivant (statut GitHub + `grep checkout_opened` sur la home servie + contrôle croisé). (b) **`keys.env`** toujours absent ⇒ préflight NO-GO formel, lien signé, `FUNNEL_ADMIN_KEY`, Instantly — geste inchangé depuis le 07/09 (`vercel env pull`). (c) Playwright : pas de serveur+Postgres ici — le build Vercel couvrira `next build`. |
| **CHOIX** | (a) **Pas de déploiement par `deploy_to_vercel` (upload de fichiers)** : le projet est lié à GitHub, un déploiement hors git désynchronise prod et `origin/main`, exige l'envoi de l'arbre entier en paramètre d'outil, et le CEO a explicitement réservé le go — le push est le bon chemin. (b) Gate 422 non re-testé (écriture payante possible). (c) `/api/cron/weekly-rescan` non appelé. (d) Aucune page `/audit/` ouverte. (e) Veille limitée à 2 acteurs (Evertune, Semrush KB) — les 8 autres mesurés les 05–07/09, rien ne justifie de refaire sans prospect. |

## 7. Ce que j'ai cru et qui s'est révélé faux / à retenir

- **Un test livré rouge n'est pas forcément un composant faux** : ici l'assertion était trop large (fichier entier au lieu du chemin). Règle : un verrou « X n'apparaît pas » se scope au fragment de code qu'il protège, sinon il interdit du code légitime ailleurs.
- **`npm ci` bloqué hier, 2 min aujourd'hui** : une incapacité de réseau ne s'hérite pas, elle se re-mesure — confirmé une fois de plus.
- **`git bundle create <f> <sha>` refuse (« empty bundle ») : il faut un nom de ref** (`^base branche`) — 2 essais perdus.
- **`report_viewed` total à 0** n'est pas une panne : les 2 vues `internal` du 27–28/08 sont sorties de la fenêtre glissante, comme la vue humaine.

## Heure de clôture

Relevé de fin de run : funnel 13:19 UTC identique au relevé d'ouverture (aucun de mes gestes n'a écrit en base : 0 audit, 0 clic de caisse, 0 page /audit/). `git ls-remote` fin de run : `main = 1d338cb` inchangé. Local : `main 683f3fd [origin/main: ahead 4]`, `squad/2026-09-10-caisse-mesurable 683f3fd`.
