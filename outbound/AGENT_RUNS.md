# Journal des runs d'agents Citeable

Une ligne par run, écrite par chaque agent. Lu chaque matin par `citeable-product-agent`,
qui supervise, diagnostique et répare les agents en échec.

Format : `- [AAAA-MM-JJ HH:MM] <agent> — <OK | BLOQUÉ | RIEN À FAIRE> — <résumé>`

## Pièges connus (à consulter avant de diagnostiquer une panne)

- **`keys.env` illisible / "Resource deadlock avoided" (OSError errno 35)** — le montage disque
  refuse par intermittence la lecture, pour TOUTES les méthodes (bash source, cat, dd, python),
  parfois plusieurs minutes d'affilée. Conséquence : la clé arrive vide, Instantly répond
  `401 Invalid authorization header`, et on conclut à tort à un « problème d'API ».
  **Toujours vérifier que la clé est chargée (>20 caractères) avant d'incriminer l'API.**
- **`403 error code: 1010`** — WAF Cloudflare d'Instantly. Cause : User-Agent absent ou non
  navigateur. Ni la clé ni l'API. Envoyer un UA Chrome règle le problème.
- **`.git` invisible depuis le sandbox** — les opérations git doivent être faites par Charles.
- **✅ CONTOURNEMENT TROUVÉ (2026-07-20) pour le deadlock `keys.env`** — le blocage errno 35 touche le **montage bash uniquement**. L'**outil fichier `Read`** (chemin `/Users/charles.kremer/Documents/Claude/Projects/NanoCorp/getciteable-main/outbound/keys.env`) lit le fichier sans erreur, y compris quand `cat` échoue 3 fois d'affilée. **Règle : lire les clés avec `Read`, écrire ce journal avec `Edit`. bash = fallback seulement.** Prompts de `citeable-sdr-weekly` et `citeable-inbox-assign` mis à jour en conséquence.

## Runs

- [2026-07-18 08:40] citeable-inbox-assign — BLOQUÉ — keys.env illisible (montage, errno 35) : faux diagnostic « problème d'API » remonté à Charles. Prompt de la tâche corrigé (lecture robuste 10×15s, garde-fou anti-clé-vide, attribution correcte de l'erreur).
- [2026-07-18 08:45] citeable-product-agent — OK — supervision ajoutée au prompt ; journal partagé créé.
- [2026-07-19 22:10] citeable-pr-inbound — OK — 0 citation/backlink de l'étude trouvée. Dogfood 65 (vs 61 publié) : ai_visibility 75/100, mais search_visibility 0/25 (le web search natif remonte NanoCorp, pas Citeable) et catégorie perçue toujours fausse — passée de « commerces locaux » à « food & beverage ». 10 cibles presse ajoutées (pr_targets.csv), 6 pitchs rédigés (pr_pitches_2026-07-19.md). AUCUN email destinataire vérifiable : web_fetch bloqué sur les pages contact, tous marqués « à trouver » — rien chargé dans Instantly (rien à charger). keys.env illisible (montage, errno 35) — PAS un problème d'API. Concurrent identifié : 5W AI Visibility Index / DTC Graveyard (50 marques, 5 moteurs, PR Newswire, depuis mai 2026).
- [2026-07-20 07:04] citeable-product-agent — OK — SUPERVISION : cause racine du deadlock `keys.env` trouvée (bash KO / outil `Read` OK) ; prompts `citeable-sdr-weekly` et `citeable-inbox-assign` corrigés (lecture via `Read`, journalisation via `Edit`). `citeable-inbox-assign` n'a pas journalisé les 19 et 20/07 — écriture bash silencieusement en échec, corrigé. `citeable-sdr-weekly` n'a jamais tourné (aucun `lastRunAt`), 1er run attendu ce lundi 08:05. PRODUIT : bloc « Comment ces questions ont été choisies » livré (page-only). Typecheck OK, funnel E2E OK (audit live Finisterre, score 22, 2 questions réelles, aucune fuite JSON). BUG relevé : la marque apparaît dans sa propre liste de concurrents — mis en Must au backlog. 2 features non déployées en attente de push (repère part équitable du 19/07 + bloc méthodo du 20/07).
- [2026-07-20 09:15] citeable-inbox-assign — OK — Clé lue du 1er coup via l'outil `Read` (contournement confirmé, 0 retry). 1 boîte provisionnée et active : charles@trygetciteable.com (setup_pending=false, status=1, warmup démarré le 17/07, score 100, tracking domain inst.trygetciteable.com CTD_ACTIVE). La campagne avait DÉJÀ email_list=[charles@] avant tout PATCH — assignation déjà effective, mon PATCH (HTTP 200) l'a simplement confirmée. Campagne toujours status=0 (en pause) — non touchée. La boîte charlie@ n'existe pas encore côté Instantly (1 seul compte retourné sur /accounts?limit=50) : à re-vérifier demain. Objectif de la tâche atteint pour charles@.
