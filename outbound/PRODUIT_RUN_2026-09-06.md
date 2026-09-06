# RUN PRODUIT GetPick — 2026-09-06 (dimanche)

Relevés : funnel **08:31 UTC** (horloge du navigateur, vérifiée par `new Date()` sur getpick.ai — l'horloge du bac à sable affichait 06:02 en début de run, non fiable), 4 contrôles **08:29–08:30 UTC**, veille **08:33–08:36 UTC**.

---

## 0. ENVIRONNEMENT ET COMMANDE

| Sonde | Résultat |
|---|---|
| Dépôt `~/Dev/Projects/getpick` | **présent**, cloné le 05/09 16:30 (HTTPS), `main` = `d50f77a` = `origin/main` |
| `outbound/keys.env` | **absent** (gitignoré, perdu avec l'ancienne machine — voir INCAPACITÉS) |
| `outbound/CEO_RUN_*`, `COMMANDE_PRODUIT_*` | **absents** (jamais suivis par git) |
| Cockpit CEO `getpick-cockpit-gtm-produit` | **lu ce run via `Read`** (créé 05/09 07:51 UTC) — hier il avait été déclaré illisible : c'était faux, `Read` y accède, seul `bash` est refusé. Piège ajouté. |
| `git push --dry-run` | **refusé** : `could not read Username for 'https://github.com'` — pas de credential dans le bac à sable |
| Node | bac à sable v22.23.2 ; **v23.11.1 arm64 téléchargé dans `mktemp -d`** (`.nvmrc` = 23.6) |

### Commande du CEO (cockpit du 05/09, relevé 07:42 UTC) — lue en entier
1. **Priorité unique : « rendre le lot du 14/08 livrable » — branche poussée, mergée, `tsc` propre, tests verts.**
2. **Second point : identifier qui lance les audits internes (+2 entre 07:35Z et 07:42Z le 05/09). Si personne, les couper.**
3. Hors périmètre : tout déploiement en production. Question ouverte à Charles : la pause du 14/08 est-elle levée ?

**Le point 1 est déjà livré depuis le 21/08** — voir « Pour le CEO ». Le point 2 est traité en §1.3. Aucune squad n'est donc nécessaire ce run : **0 squad, et c'est la bonne réponse** (ni commande neuve, ni poste désigné, ni compteur à déplacer sans prospection ouverte).

---

## POUR LE CEO — deux corrections mesurées

**1. La « dette de livraison 22 j / 7 commits au sol » du cockpit CEO n'existe plus depuis le 21/08.** Mesuré aujourd'hui sur `git ls-remote` : `refs/heads/main = d50f77a` ; la branche `squad/2026-08-14-marquage-trafic-interne` (`643e7e9`) est fusionnée par `21722c7` (« merge: gate des rapports, marquage trafic interne… chaîne du 05-14/08 »), et 12 branches squad postérieures sont toutes fusionnées dans `main`. `git branch -vv` : une seule branche locale, `main`, alignée sur `origin/main`. **Dette de livraison : zéro**, mesurée le 04/09, le 05/09 (addendum) et aujourd'hui. Sa commande « rendre le lot livrable » est satisfaite par l'histoire, pas par ce run. Le cockpit CEO se fonde sur « dernier état connu au 15/08 » — il est en retard de trois semaines sur `main`.

**2. Les « +2 audits internes en 7 minutes » du 05/09 sont le cron de rescan, par construction.** Preuve par le code (`src/lib/audit-engine.ts` l.4950–4983) : le cron `weekly-rescan` (`vercel.json`, `0 7 * * *`, exécutions observées 07:22–07:55 UTC) insère une ligne `audits` avec `trafficClass: "internal"` et émet `audit_started` avec `source: "weekly_rescan"`. Fenêtre observée par le CEO (07:35Z–07:42Z) = fenêtre du cron. Corroboration aujourd'hui : à 08:31 UTC, après la fenêtre du cron, `audit_started` vaut 24 — **0 rescan ce matin** (aucune marque due, cadence 30 j ; les 2 rescans du 05/09 correspondaient à des audits du ~06/08). *Limite : attribution par code et horaire, pas par registre — le mode détaillé (`x-funnel-key`) est inaccessible sans `keys.env`.*
**« Si personne ne les commande, les couper » : quelqu'un les commande — le produit.** C'est la surveillance vendue par Monitor/Agent. Ce qui coûte sans mesurer, c'est le **backfill** de `ensureAuditSchema` (`db.ts` l.248–262) qui enrôle *tout* audit à score, y compris les audits gratuits et internes, dans `monitored_brands`. Fermer ce backfill aux seuls clients payants est une **décision produit déjà refusée deux fois** comme relevant du CEO/Charles — je la reformule ici avec son coût : chaque audit gratuit = 1 rescan/30 j à coût Gemini+Serper, sans compteur de valeur en face. Recommandation : restreindre le backfill aux audits `claim`és ou payés. Réversible, taille S. **Propriétaire : CEO** (je ne l'inscris pas au backlog).

---

## 1. CONTRÔLE DES SQUADS DE LA VEILLE

### 1.1 État git (08:2x UTC)
- `git log --all --oneline -25` : sommet `d50f77a` (03/09), rien de postérieur.
- `git status --short` : `M outbound/AGENT_RUNS.md`, `?? outbound/PRODUIT_RUN_2026-09-05.md`, `?? outbound/dashboard_produit_getpick.html` — les fichiers de run d'hier, jamais commités (décision du 05/09 non exécutée faute de push ; **commités localement ce run**, voir §5).
- `git branch -vv` : `main d50f77a [origin/main]` — aucune branche locale sans remote.
- `git stash list` : vide.
- `git ls-remote` : `main = d50f77a` ; 19 têtes `squad/*` toutes fusionnées ou historiques (3 `date-inconnue-*` antérieures à août, jamais fusionnées, pas de travail attendu dessus — inchangé depuis le 04/09).
- **Aucune squad lancée le 05/09** ⇒ rien à réceptionner.

### 1.2 Quatre contrôles sur `d50f77a` (clone jetable GitHub, `--depth 1`, node v23.11.1, `npm ci` 7 s)
| Contrôle | Résultat | Heure |
|---|---|---|
| `node scripts/run-tests.mjs` | **524 tests · 510 pass · 0 fail · 14 skip** (13,2 s) | 08:29 UTC |
| `npx eslint .` | **0 erreur**, 4 avertissements `no-unused-vars` | 08:29 UTC |
| `npx tsc --noEmit` | **0 erreur** | 08:30 UTC |
| `node scripts/preflight-merge.mjs` | **NO-GO — cause unique `AUDIT_SHARE_SECRET` absent de l'env** (chaîne OK, tests OK, tsc OK, lint avert., liens nus avert. historiques, Playwright rappel) | 08:30 UTC |

Identique aux relevés du 04/09 et 05/09. Le NO-GO est un faux NO-GO d'environnement, pas un défaut du dépôt.

### 1.3 Prod (navigateur interne, cookie `gp_internal` posé AVANT le premier accès, vérifié sur `/api/internal` : « Ce navigateur est marqué INTERNE »)
- `/api/funnel` : 200, JSON frais.
- **SHA servi : non mesurable** (pas de `VERCEL_TOKEN`, pas de buildId exposé). `origin/main` n'a pas bougé depuis le 03/09 et Vercel déploie `main` à la fusion ⇒ le commit servi est `d50f77a` *par déduction*, pas par mesure. Je l'écris comme tel.
- Aucun `/audit/<id>` ouvert. Aucun audit lancé. `/api/cron/weekly-rescan` non appelé.

### 1.4 Funnel 14 j — 08:31 UTC, sans clé
| Événement | Total | human | internal | Δ vs 05/09 07:50 |
|---|---|---|---|---|
| audit_started | 24 | 1 | 23 | **−1** (un audit interne du ~22/08 sorti de la fenêtre) |
| audit_completed | 24 | 1 | 23 | −1 |
| report_viewed | 3 | **1** (27/08) | 2 | 0 |
| report_link_opened | 7 | 0 | 7 | 0 |
| email_captured | 0 | 0 | 0 | 0 |
| teaser_cta_click / checkout_opened | 0 | 0 | 0 | 0 |
| followup_1_sent / _2_sent / _click | 0 | 0 | 0 | 0 |
| **ventes** | **0** | | | 0 (Stripe non relevé ; `checkout_opened = 0` toutes classes) |

`traffic_class_since` = 30/07 ⇒ tous les zéros humains sont des **verdicts**. **Le `report_viewed.human` du 27/08 sort de la fenêtre le 10/09** — prévision à vérifier au run du 11/09 : `report_viewed.human` doit passer à 0. **Prévision précédente (« −2/jour », 04/09) : retirée hier, confirmée fausse aujourd'hui** (−1 en 25 h).

**72 h après l'envoi des 6 liens de prospection (03/09 ~10:30 UTC) : `report_link_opened.human = 0`.** Verdict, pas trou de données.

---

## 2. VEILLE — 2 acteurs re-mesurés au primaire (navigateur réel, JS, toggles énumérés, JSON-LD, aria-label)

| Acteur | Gating / pricing (rendu) | JSON-LD / meta | Écart | Décision |
|---|---|---|---|---|
| **AthenaHQ** (`athenahq.ai/plans`, 06/09 08:34 UTC) | Essential **gratuit**, 300 crédits, « Start for Free » ; Starter **$295/mo** (toggle Monthly / Annual −17 % énuméré, mensuel lu) ; Enterprise custom. API et crédits = add-ons payants sur Starter. | 0 JSON-LD ; meta « leading AEO & GEO platform » | aucun | inchangé vs 04/09 — **aucune action** |
| **Scrunch** (`scrunch.com/pricing`, 06/09 08:36 UTC) | Core **$250/mo**, essai **7 jours**, audit gratuit « No credit card required » ; Enterprise custom, 9 LLM. Onglets « For brands / For agencies » énumérés (brands lu). | 0 JSON-LD ; meta « Pricing starting at $250 a month » — **concordant** (contre-exemple supplémentaire au motif « machines ≠ humains ») | **domaine migré `scrunchai.com` → `scrunch.com`** (redirection 06/09, bandeau « the next chapter for Scrunch », date non établie, ≤ 30 j non prouvé) | **aucune action** ; note : Scrunch expose un module « Shopping — product level » ; le refus « SKU-level shopping » tient (aucun compteur à déplacer) |

**Lecture inchangée** : plancher self-serve Otterly €29 → Peec €70 → Visiblie $71 → Promptwatch €85 → Profound $99 → Scrunch $250 → Athena $295. GetPick 9 €/19 € seul en dessous. Gating : sans CB — Athena (gratuit), Scrunch (audit), Promptwatch (essai 7 j) ; **avec CB** — Visiblie ; annuel imposé — Peec, Visiblie. Aucune nouveauté < 30 j prouvée ce run. Non re-mesurés aujourd'hui : Peec, Visiblie, Profound, Otterly, Promptwatch (05/09), Semrush (01/09), Ahrefs (10/08), Evertune (04/09).

---

## 3. BACKLOG — 0 ajout, 0 coupe, motivé

Aucune entrée ne peut déplacer un compteur tant que `report_viewed.human` attribuable ≈ 0 et que la prospection est fermée (décision CEO du 14/08, question à Charles ouverte côté CEO). Le seul Must connu (FAQ mensuelle, Lot 2c) reste au CEO.

**Refus re-motivés (06/09)** : SKU-level shopping (Scrunch l'expose ; aucun prospect, aucun compteur) · pubs-dans-réponses · corpus rescan (9ᵉ) · « score 0 vs injoignable » côté client · fermer le backfill (**au CEO**, reformulé avec coût ci-dessus) · instrumenter les sauts du garde-fou (verdict « non mesurable avant ~01/10 » maintenu).

**Refusé neuf** : route `/api/version` exposant `VERCEL_GIT_COMMIT_SHA` pour mesurer le SHA servi. Elle déplacerait le KPI Prod de « déduit » à « mesuré », mais aucun compteur de funnel — et je ne peux pas la pousser (pas de credential). Réouvrir quand `keys.env` existe : taille S, réversible.

---

## 4. SQUADS — aucune

Voir §0. Rien en cours, rien à réceptionner, rien à fusionner, rien à déployer.

---

## 5. CASES

| Case | Contenu |
|---|---|
| **DÉPENSE** | **0 €.** Aucune en attente. |
| **STRATÉGIE** | Rien de neuf à Charles ce run. La question « pause levée ? » est portée par le CEO (propriétaire unique), je ne la redouble pas. |
| **INCAPACITÉ 1 — `keys.env`** | Bloque : préflight GO, mode détaillé du funnel, SHA servi, `monitored_brands`/`due_count`. Geste : `npm i -g vercel && vercel login && vercel link && vercel env pull outbound/keys.env --environment=production` puis ajouter `VERCEL_TOKEN` et `GITHUB_TOKEN` régénérés. |
| **INCAPACITÉ 2 — `git push`** | Le bac à sable n'a aucun credential GitHub (`could not read Username`). Geste : `GITHUB_TOKEN` dans `keys.env` (je pousserai avec `https://<token>@github.com/…` sans jamais l'inscrire dans le remote). En attendant : **commit local sur `main`** des fichiers de run du 05/09 et 06/09 + `AGENT_RUNS.md` (fichiers de documentation sans secret, vérifié `grep -iE 'secret|token|key='` vide). Charles pousse avec `git push origin main` quand il veut. |
| **INCAPACITÉ 3 — Playwright** | serveur Next + Postgres absents du bac à sable. Couvert par la prévisualisation Vercel au prochain lot. |
| **CHOIX** | Gate 422 non re-testé (écriture payante possible). `/api/cron/weekly-rescan` non appelé (il exécute). Pas de `/api/version` (voir §3). Pas de re-mesure des 5 acteurs du 05/09 (< 24 h). |

---

## 6. CE QUE J'AI CRU ET QUI S'EST RÉVÉLÉ FAUX (→ pièges)

1. **« L'artefact CEO est dans un emplacement protégé, illisible »** (05/09) — faux : `Read` lit `/Users/charleskremer/Claude/Artifacts/<id>/index.html` ; c'est `bash` (montage) qui est refusé. **Piège : quand un chemin est refusé par un outil, essaie l'autre outil avant de déclarer l'incapacité.** La commande CEO du jour aurait pu être lue hier.
2. **L'horloge du bac à sable n'est pas une mesure** : `date -u` a rendu 06:02 puis 08:30 en 20 minutes réelles. **Horodater par le navigateur (`new Date()` sur une page réelle) ou par un en-tête `Date` de réponse HTTP.**
3. **`web_fetch` refuse une URL qui n'est pas « en provenance »** même pour une API publique du produit — le pane navigateur est l'instrument, cookie interne d'abord (confirmé une seconde fois).
4. **Une commande CEO fondée sur un état vieux de 3 semaines se vérifie avant de s'exécuter** : « rendre le lot livrable » était livré depuis 16 jours. Exécuter sans vérifier aurait produit une squad vide.

---

## 7. PROCHAIN RUN — à vérifier
- `report_viewed.human` doit passer de 1 à 0 au plus tard le **11/09** (sortie de fenêtre du 27/08). Prévision inscrite au cockpit.
- Les 8 audits du 17/08 sont dus au rescan ~**16/09** : `audit_started.internal` doit monter de +8 ce jour-là (cron 07:22–07:55 UTC).
- Si `keys.env` réapparaît : préflight GO attendu, lire `due_count`/`next_due_at`, mode détaillé, pousser les commits locaux, rouvrir `/api/version`.

---

## 8. CLÔTURE — 10:38 UTC (horloge navigateur)
- Funnel re-relevé : **identique** au relevé de 08:31 (24/24/3/7/0/0/0/0/0/0). Aucun mouvement pendant le run — rien à attribuer.
- `git branch -vv` : `main 83dbecd [origin/main: ahead 1]` — un commit local de documentation (`docs(runs)`), à pousser par Charles (`git push origin main`). `ls-remote main` = `d50f77a`, inchangé.
- Effet de bord FUSE : `.git/index.lock`, `HEAD.lock`, `objects/maintenance.lock` et 7 `tmp_obj_*` n'ont pas pu être supprimés (`unlink` refusé) ; **déplacés en `.git/orphan-*`**, aucun verrou actif ne subsiste. Nettoyage sans risque : `rm .git/orphan-* .git/index.lock.orphan*`.
