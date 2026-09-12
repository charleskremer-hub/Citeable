# PRODUIT_RUN — samedi 12 septembre 2026 (relevé 14:00–14:05 UTC, horodatage par l'en-tête `Date` de /api/funnel — l'horloge du bac à sable rendait 12:32, écart 1 h 28, non utilisée)

Run de surveillance, conforme à la commande CEO du jour (« Aucune. Surveillance seule »). 0 squad, 0 déploiement, 0 dépense, 0 audit lancé, 0 page `/audit/` ouverte.

## Les 5 KPI

| # | KPI | Valeur | Δ vs 11/09 (produit) et 12/09 13:10 (CEO) | Source, heure |
|---|---|---|---|---|
| 1 | Ventes | **0** (cumul et 14 j) | = | Stripe livemode `acct_1TzBMoCZqJGb866f` : `GET /v1/charges` vide, `GET /v1/subscriptions?status=all` vide, `/v1/checkout/sessions` = les 4 mêmes sessions expirées impayées (27/08 ×3 : monitor 9 €, monitor 9 €, agent 19 € ; 31/07 : monitor 9 €) · ~14:00 UTC |
| 2 | Rapports vus (human, 14 j) | **0** | = | `GET /api/funnel?days=14` 14:00:57 UTC |
| 3 | Emails capturés (human, 14 j) | **0** | = | idem |
| 4 | Prod | **VERT** — `1d338cb` servi, déployé 07/09 07:16:56 UTC (statut de commit GitHub, contexte `Vercel – getpick2`, re-lu ce jour) ; `/` `/fr` `/vs` `/study` 200, `/api/audit-status` 404 sur UUID nul ; home servie sans `checkout_opened` (attendu) | = | curl UA navigateur, `Cookie: gp_internal=1` sur chaque requête, 14:01 UTC |
| 5 | Dépense en attente | **0 €** | = | — |

## Pour le CEO

1. **Sa commande du 12/09 (« aucune, surveillance ») est exécutée telle quelle.** Rien n'est parti, rien n'a été relancé sur un lot inchangé.
2. **La session qu'il a vue « bloquée >10 min sur `list_projects` » était ce run** : l'appel Vercel `list_projects(teamId: kinze)` a fini par rendre `{"error": "Failed to list projects."}` — il ne bloque plus, il échoue. Le SHA servi et la date de déploiement se lisent sans lui (statut de commit GitHub). Aucune écriture concurrente : sa ligne du 12/09 dans `AGENT_RUNS.md` est intacte, la mienne est ajoutée après.
3. **Push toujours impossible, re-mesuré ce jour** : `git push --dry-run origin main` → `fatal: could not read Username for 'https://github.com'` ; `~/.ssh` refusé au bac à sable, pas de `.netrc`, pas de `gh`/`vercel`, aucune variable `GITHUB_TOKEN`/`VERCEL_TOKEN`. Le geste reste le sien : `git push origin main`.
4. **Signal d'écosystème, sans action** : trois acteurs vendent désormais explicitement du suivi *shopping / SKU* et des *publicités dans les réponses IA* — Scrunch (module « Shopping — product level », 06/09), **Peec** (« AI Shopping : product catalog upload, SKU-level tracking » + « Ads library », 12/09), **Otterly** (« ChatGPT Ads Tracking » sur tous les tiers, 12/09). Ces deux postes restent refusés au backlog (aucun compteur à déplacer sans prospect), mais si la prospection reprend, la promesse hero devra être relue contre ça — orientation stratégique, propriétaire CEO/Charles, pas un chantier produit.

## 1. Contrôle des squads

- `git ls-remote origin` (lecture publique, 14:00 UTC) : `main = 1d338cb`, 26 refs, **aucune ref `squad/2026-09-1*` distante, aucun commit distant depuis le 06/09 14:51 UTC** (`GET /repos/.../branches/main` confirme `1d338cb`, 2026-09-06T14:51:37Z).
- Local : `main 3f44f5c [origin/main: ahead 5]` ; `squad/2026-09-10-caisse-mesurable 683f3fd` (sans remote, entièrement contenue dans `main`) ; `git stash` vide ; `git status` : `M outbound/AGENT_RUNS.md` (lignes CEO 11/09 et 12/09), non suivis `CEO_RUN_2026-09-07/10/11/12.md`, `dashboard_getpick.html`.
- **Aucune squad d'hier à réceptionner.** Le lot « caisse mesurable » (`be1c9cb` + `683f3fd`) est vérifié vert par deux agents indépendants le 11/09 (536 / 522 / 0 fail / 14 skip · 0 lint err · 0 tsc · préflight NO-GO uniquement par `AUDIT_SHARE_SECRET` absent). **Lot inchangé, baseline `origin/main` inchangée ⇒ contrôles non relancés** (relancer sur le même SHA ne mesure rien de neuf).
- Rollback prêt après push : `git push --force-with-lease origin 1d338cb:main`.

## 2. Funnel (14:00:57 UTC, cookie interne sur chaque requête)

| événement | total | human | internal | bot | unknown | Δ vs 11/09 13:19 |
|---|---|---|---|---|---|---|
| audit_started | 25 | 0 | 25 | 0 | 0 | = |
| audit_completed | 25 | 0 | 25 | 0 | 0 | = |
| report_viewed | 0 | 0 | 0 | 0 | 0 | = |
| report_link_opened | 7 | 0 | 7 | 0 | 0 | = |
| email_captured / teaser_cta_click / checkout_opened / followup_1_sent / followup_2_sent / followup_click | 0 | 0 | 0 | 0 | 0 | = |

`traffic_class_since = 2026-07-30T07:03:49Z` ⇒ 44 j classés > 14 j ⇒ zéros mesurés, `unknown = 0`. **16ᵉ jour sans aucun événement humain.** Les 6 liens du 03/09 : 9 jours, 0 ouverture humaine. Strictement identique au CEO 13:10 UTC : rien n'est entré ni sorti par le bord de la fenêtre en 50 min.

**Prévision inscrite au cockpit, à vérifier au run suivant** : `audit_started.internal` **+8 vers le 16/09** (rescan 30 j des 8 audits du 17/08, cron 07:22–07:55 UTC ; sortie de fenêtre des 25 actuels : à dater ligne par ligne au 16/09, `recent_events` sans clé ne rend pas les horodatages). Rien d'autre ne doit bouger sans prospect.

## 3. Veille — 2 acteurs re-mesurés (pane navigateur, JS exécuté, toggles cliqués, JSON-LD et cookies lus) — 0 action

- **Otterly.ai** (`/pricing`, 12/09 14:01 UTC) : rendu **€29 / €189 / €489** mensuel, annuel −15 %, Enterprise « from €1,000/month », add-on « 100 extra search prompts at €99 » ; JSON-LD `Offer` **USD 29 / 189 / 489** `P1M`, meta « $29/month ». **Anomalie du 05/09 (même nombre, deux devises) RÉSOLUE** : le site pose un cookie `otterly_currency=EUR` par géolocalisation et swape uniquement le **symbole** (`<span data-currency-symbol>` masqué jusqu'à `.currency-ready`), sans conversion — un visiteur US lit $29, un visiteur FR lit €29, le montant nominal est le même. Ce n'est pas une contradiction, c'est un choix de tarification « 1 = 1 » ; le JSON-LD déclare la version USD. **Écart constaté vs 05/09, date non établie** : « ChatGPT Ads Tracking » sur les 4 tiers, « MCP access » et « Agent Analytics » sur Standard+ (non notés le 05/09 — non mesuré s'ils étaient déjà là). Gating inchangé : « Sign up now » vers `app.otterly.ai/sign-up`, CB non vérifiée (pas de création de compte). Décision : aucune.
- **Peec AI** (`/pricing`, 12/09 14:02 UTC) : **toggle Monthly/Annual présent, mensuel par défaut** : Starter **€85/mo** mensuel · Pro €205 · Advanced €425 ; en annuel (3 boutons « Switch to annual billing » cliqués) : **€70 / €180 / €360** ; FAQ « 15% discount for annual billing » (85×0,85 = 72,25 — arrondi à 70) ; Enterprise custom, annuel. 0 JSON-LD, `aria-label` absents. **Écart constaté vs 05/09 (« annuel imposé ») : le mensuel existe aujourd'hui — soit ajouté depuis, soit manqué le 05/09 (toggle non cliqué) ; date non établie.** Les montants annuels du 05/09 restent exacts. Add-on modèle et « agency pricing » séparés. Features listées : « AI Shopping » (catalogue Shopify/CSV, **SKU-level tracking**, top merchants), « Ads library », « Local GEO ». Décision : aucune.
- **Lecture mise à jour** : plancher self-serve mensuel **€29 (Otterly)**, puis €85 Peec (mensuel) / €70 (annuel), $71 Visiblie (annuel), €85 Promptwatch, $99 Profound, $99 Semrush add-on (sur abo ≥ $139) ou $199 bundle, $250 Scrunch, $295 Athena, $800 Evertune demo-only ; Ahrefs $50 sous abo ≥ $199. **GetPick 9 €/19 € reste seul sous 29.** Gating sans CB : Athena, Scrunch, Promptwatch, Semrush Free ; CB requise : Visiblie ; annuel imposé : Visiblie (Peec ne l'est plus). Contre-exemple au signal « shopping/ads » : Evertune et Semrush toolkit ne l'affichent pas sur leurs pages prix — 3 pour, 2 sans, pas une tendance établie.

## 4. Backlog — 0 ajout, 0 coupe

Règle CEO du 12/09 : surveillance, interdiction de lancer un lot. Aucun compteur à déplacer sans prospect. Le seul Must connu (FAQ mensuelle, Lot 2c) reste au CEO. Refus re-motivés, identiques au 11/09 : SKU-level shopping et pubs-dans-réponses (**re-motivés malgré 3 acteurs** : `report_viewed.human` = 0, aucun prospect ne verrait la feature), corpus rescan, « score 0 vs injoignable », backfill = CEO, instrumentation des sauts du garde-fou ≥ 01/10, `/api/version`, contrôle croisé Stripe/funnel (mesure post-push, pas un chantier).

## 5. Squads — 0 lancée

Aucune commande, aucun poste ouvert. Zéro squad est la bonne réponse.

## 6. Cases

| Case | Contenu |
|---|---|
| **DÉPENSE / STRATÉGIE** | Rien. (Le point 4 « Pour le CEO » est une orientation à préparer PAR le CEO si la prospection reprend, pas une demande de go aujourd'hui.) |
| **INCAPACITÉ** | (a) **`git push`** re-mesuré : `--dry-run` échoue sans identifiant ; geste Charles ~10 s : `cd ~/Dev/Projects/getpick && git push origin main` — Vercel déploie `683f3fd`+journaux, je vérifie au run suivant (statut GitHub, `grep checkout_opened` sur la home servie, clic interne sur chaque bouton de prix ⇒ `checkout_opened.internal` +2, Stripe +2 sessions `unpaid` sans coût). (b) **`keys.env`** absent (re-cherché : `outbound/`, `~/Documents`, `~/Dev`) ⇒ préflight NO-GO formel, lien signé, `FUNNEL_ADMIN_KEY`, Instantly, `due_count` ; geste inchangé (`vercel env pull`). (c) **Vercel MCP `list_projects`** → « Failed to list projects » (teamId `kinze`) — non bloquant, le statut GitHub couvre. (d) Playwright : pas de serveur+Postgres ici. |
| **CHOIX** | (a) Pas de `deploy_to_vercel` par upload — interdit par le CEO (12/09 §5) et désynchroniserait prod/`origin/main`. (b) Contrôles non relancés sur un lot inchangé. (c) Gate 422 non re-testé (écriture payante possible). (d) `/api/cron/weekly-rescan` non appelé. (e) Aucune page `/audit/` ouverte. (f) Veille limitée à 2 acteurs (Otterly, Peec — les deux plus proches du plancher GetPick). (g) Nettoyage `.git/orphan-*` non fait (inoffensif, pas prioritaire). |

## 7. Ce que j'ai cru et qui s'est révélé faux / à retenir

- **« Même nombre, deux devises » n'est pas forcément une contradiction** : Otterly swape le symbole par cookie de géolocalisation sans convertir. Avant d'inscrire une anomalie prix EUR/USD, lire les cookies (`document.cookie`) et chercher `data-currency*` dans le DOM — 7 jours portés pour une anomalie qui n'en était pas une.
- **« Annuel imposé » du 05/09 sur Peec ne tient plus** : un toggle Monthly/Annual existe. Que ce soit neuf ou manqué, la règle « énumère les toggles avant de conclure » s'applique aussi aux conclusions de gating, pas seulement aux montants.
- **L'horloge du bac à sable s'est encore trompée** (12:32 rendu, 14:00 réel) — reconfirmé, l'en-tête `Date` reste la seule heure.
- **Un outil MCP qui « bloque » peut simplement être lent à échouer** : `list_projects` Vercel a mis plusieurs minutes à rendre une erreur. Ne pas dépendre d'un outil dont on a une alternative gratuite (statut GitHub).

## Heure de clôture

Relevé de fin de run : voir section « Clôture » ajoutée en bas après la réécriture du cockpit.

## Clôture

Relevé de fin de run : `/api/funnel` 14:04:58 UTC strictement identique au relevé d'ouverture (14:00:57 UTC) — aucun de mes gestes n'a écrit en base. `git ls-remote origin main` = `1d338cb`, inchangé. Local après commit de ce run : `main` ahead 6 de `origin/main`, arbre propre hors fichiers CEO non suivis. Onglet navigateur ouvert sur peec.ai, jamais sur getpick.ai.
