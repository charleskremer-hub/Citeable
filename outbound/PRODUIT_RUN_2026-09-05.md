# RUN PRODUIT GetPick — 2026-09-05

> **Emplacement anormal.** Ce fichier devrait être `outbound/PRODUIT_RUN_2026-09-05.md` dans le dépôt.
> Le dépôt est introuvable sur cette machine (voir INCAPACITÉS). Écrit dans `~/Documents` faute de mieux.
> Relevés : funnel **07:50 UTC**, veille **07:55–08:20 UTC**, clôture **13:01 UTC** (mesurées, pas estimées).

---

## 0. COMMANDE DU CEO — NON LUE (incapacité)

L'artefact `getpick-cockpit-gtm-produit` **existe et a été créé aujourd'hui à 07:51:01 UTC** : l'agent CEO a donc
tourné ce matin. Mais son contenu est dans un emplacement protégé que `Read` refuse
(`/Users/charleskremer/Claude/Artifacts/…`), et les fichiers `CEO_RUN_*.md` / `COMMANDE_PRODUIT_*.md` vivent
dans `outbound/`, qui est dans le dépôt absent.

**Je n'ai donc pas lu la commande du jour.** Je ne l'invente pas et je ne rejoue pas celle du 03/09 comme si
elle était fraîche. Repli appliqué : aucune squad lancée (voir §4).

---

## 1. CONTRÔLE DES SQUADS — IMPOSSIBLE (incapacité bloquante)

**Le dépôt `~/Dev/Projects/getpick` n'existe pas sur cette machine.** Mesuré, pas supposé :

| Sonde | Résultat |
|---|---|
| `request_cowork_directory ~/Dev/Projects/getpick` | `doesn't exist or isn't accessible` |
| `request_cowork_directory ~/Dev` | `doesn't exist or isn't accessible` |
| `request_cowork_directory ~/Projects/getpick` | `doesn't exist or isn't accessible` |
| `~/` monté, `ls -a` | pas de dossier `Dev` ; Desktop **vide** ; Downloads = 5 installeurs |
| `find ~ -maxdepth 5 -name .git` (hors Library) | **0 résultat** |
| `find ~ -iname "*getpick*" -o -iname "*citeable*"` | **0 résultat** |

Aucun dépôt git n'existe sur cette machine. Ce n'est pas un problème de montage : c'est une absence.

**Conséquence — tout le §1 tombe :** pas de `git log/status/branch -vv/stash/ls-remote`, pas de baseline
`origin/main`, pas de `run-tests.mjs`, pas d'`eslint`, pas de `tsc --noEmit`, pas de `preflight-merge.mjs`,
pas de lecture de `keys.env` (donc pas de `FUNNEL_ADMIN_KEY`, `VERCEL_TOKEN`, `GITHUB_TOKEN`,
`AUDIT_SHARE_SECRET`, `CRON_SECRET`).

**Je ne reconduis aucun chiffre du 04/09 comme s'il était vérifié aujourd'hui.** L'état des branches, la dette
de livraison et le SHA servi sont **non mesurés ce jour**, pas « inchangés ».

**Geste exact qui débloque :** cloner le dépôt sur cette machine à `~/Dev/Projects/getpick`
(`git clone git@github.com:charleskremer-hub/Citeable.git ~/Dev/Projects/getpick`), ou m'indiquer la machine
qui le porte. Rien d'autre n'est requis — ce n'est ni une dépense ni un arbitrage.

---

## 2. VEILLE PRODUCT MARKETING — 5 acteurs mesurés au primaire

Instrument : **navigateur réel** (rendu JS + shadow DOM + JSON-LD), pas `fetch`. C'est ce changement
d'instrument qui produit les deux corrections majeures ci-dessous.

### 2.1 CORRECTION — Peec AI rend ses montants. La conclusion des 4 runs précédents était fausse.

Mesuré 05/09 07:58 UTC sur `peec.ai/pricing`, page rendue :

| Plan | Prix | Contenu |
|---|---|---|
| Starter | **€70/mo** (Annual, Save €180) | 50 prompts, 3 modèles, 1 projet |
| Pro | **€180/mo** (Annual, Save €300) | 150 prompts, 3 modèles, 2 projets |
| Advanced | **€360/mo** (Annual, Save €780) | 350 prompts, 5 projets, multi-pays, Looker |
| Enterprise | Custom, Annual | tous modèles, API, SSO, jusqu'à 12 LLM |

Add-on « modèle supplémentaire » : €25 / €55 / €115 par mois selon le tier.
**0 JSON-LD** sur la page. Seul bouton de facturation : « Annual » — **pas d'option mensuelle** :
le contre-exemple « Peec impose l'annuel » tient, et porte désormais un chiffre.

**Ce qui était faux :** « montants non rendus au primaire », inscrit 4 runs de suite (01→04/09).
**Cause :** les runs précédents lisaient une page Next/Framer **sans exécuter le JS**. Les montants n'ont
jamais été absents — l'instrument était aveugle. C'est le piège « ne confonds pas la limite de l'outil avec la
limite du système », dans une variante non répertoriée : non pas *le fetch est refusé*, mais *le fetch réussit
et rend un DOM vide de prix*.

### 2.2 CORRECTION — Visiblie ne cache pas ses tiers Platform. Ils sont derrière un onglet.

Le 04/09 il a été écrit que les tiers Platform €79/€129/€199 étaient « **invisibles dans le texte rendu** » et
qu'il y avait contradiction FAIRE/DIRE. **C'est faux, et c'était une accusation portée une semaine.**

La page `visiblie.com/pricing` a un sélecteur **`Done For You` | `Platform`**, plus un toggle **USD | EUR** et
un toggle de période. L'onglet par défaut est `Done For You`. En cliquant `Platform` (05/09 08:10 UTC) :

| Plan | Rendu (USD, annuel) | JSON-LD |
|---|---|---|
| Starter | **$71/mois**, facturé annuellement **($852/an)** — 30 prompts/sem, 1 siège | €79/mo (€63/mo annuel) |
| Growth | **$119/mois** **($1 428/an)** — 100 prompts, 5 sièges, GSC/GA/Looker | €129/mo (€103/mo annuel) |
| Scale | **$183/mois** **($2 196/an)** | €199/mo (€159/mo annuel) |

$71 / $119 / $183 ≈ €63 / €103 / €159 à ~1,13 USD/EUR : **le rendu et le JSON-LD disent la même chose**,
à la devise et à la période près. Il n'y a pas de contradiction sur les tiers Platform. Retrait de l'accusation.

**Ce qui reste réellement contradictoire chez Visiblie**, et que je maintiens :
le **GEO Roadmap** vaut **€499, livré en 72 h** en JSON-LD, et **« from $1,000, 5–7 business days »** sur la
page rendue. €499 ≈ $565 : l'écart n'est pas un effet de change, et les délais diffèrent. Date d'apparition
**non établie**.

Fait de gating neuf : **« Start free trial — Card required to start your trial. »** (bas de page, 05/09).
Autre motion : Advisory **$2 292/mois** ($27 500/an), Done-For-You **$4 125/mois** ($49 500/an).

### 2.3 Profound — $99 / $399 confirmés ; l'écart meta/page tient, 5ᵉ jour

`tryprofound.com/pricing`, 05/09 07:55 UTC. Les montants sont dans des `<number-flow-react>` en **shadow DOM**
(innerText vide, aucune regex sur le texte ne les trouve). **Ils sont lisibles dans `aria-label` sur l'hôte**
(`role="img"`) : **Starter `$99/month`**, **Growth `$399/month`**, « Billed yearly, 2 months free »,
« Try for free » sur Growth. Enterprise sur devis, jusqu'à 9 answer engines.

`meta name="description"` = *« Currently available through customized enterprise pricing. Profound is built
for enterprise brands… »* alors que la page vend deux plans self-serve. **Écart FAIRE/DIRE constaté pour le
5ᵉ jour consécutif ; date d'apparition toujours non établie** (je ne peux pas dater une meta).

### 2.4 Otterly.ai — anomalie de devise : €29 rendu vs $29 déclaré

`otterly.ai/pricing/`, 05/09 08:15 UTC.
**Page rendue (€)** : Lite **€29**/month, Standard **€189**/month, Premium **€489**/month, toggle
« Monthly | Annually 15 % off ». Add-ons €59/€149, €99, €109/€439. Enterprise « from €1 000 ». Essai gratuit
confirmé en FAQ, conditions non détaillées.
**JSON-LD** : `price 29 / 189 / 489` avec **`priceCurrency: "USD"`**, `billingDuration P1M`.

**Le même nombre est servi en € aux humains et en $ aux machines.** Ce n'est pas une conversion : €29 ≈ $33.
L'un des deux est faux, à ~13 %. Deux hypothèses non départagées : affichage dépendant de la géolocalisation
du navigateur, ou JSON-LD non maintenu. **Date et cause non établies.**
À noter : le 04/09 avait inscrit « Lite $29 … JSON-LD concordant » — la concordance n'avait été vérifiée
qu'entre le JSON-LD et lui-même.

### 2.5 Promptwatch — €85 rendu / $95 déclaré : conversion cohérente

`promptwatch.com/pricing`, 05/09 08:20 UTC. Toggle `$ | €` positionné sur **€**.
Les `<number-flow-react>` ici ont **`aria-label` à `null`** — l'instrument de Profound ne marche pas.
Lecture **visuelle** (capture d'écran) : **Essential € 85 /monthly**, 500 crédits agent, 1 projet, 4 modèles,
50 prompts, 6 000 réponses, MCP et accès API, **essai gratuit 7 jours**. Segmentation Brands | Agencies | Custom.
**JSON-LD** : $0 / **$95** / **$245** / **$579** USD.

€85 ≈ $96 : **conversion cohérente**. C'est le contre-exemple qui empêche de conclure trop vite en §2.6.

### 2.6 Lecture — et le contre-exemple qui limite la conclusion

**Plancher self-serve (entrée, marques, mesuré ce jour) :**

| Acteur | Entrée | Période |
|---|---|---|
| **GetPick** | **€9** Monitor / €19 Agent | mensuel |
| Otterly Lite | €29 (ou $29 — cf. 2.4) | mensuel |
| Peec Starter | €70 | **annuel imposé** |
| Visiblie Starter | $71 ($852/an) | annuel |
| Promptwatch Essential | €85 | mensuel |
| Profound Starter | $99 | annuel (2 mois offerts) |

**GetPick reste seul sous €29.** Le plancher du marché s'est précisé, il n'a pas bougé.

**Motif tentant : « ils disent aux machines autre chose qu'aux humains ».** Trois cas apparents — Profound
(meta vs page), Otterly (devise), Visiblie (Roadmap). **Mais le contre-exemple existe et je le garde au même
rang :** Promptwatch convertit correctement, Peec n'a aucun JSON-LD (donc ne peut pas diverger), et la
divergence la plus spectaculaire de la semaine — Visiblie Platform — **s'est révélée être un onglet non cliqué
par l'observateur, pas un mensonge de l'éditeur**. Trois cas résiduels, deux contre-exemples, une accusation
retirée : **ce n'est pas une tendance, et cela n'implique aucune action produit.**

**Aucune de ces nouveautés ne déclenche de chantier.** Tant que `report_viewed.human` d'un vrai prospect vaut
~0, aucun travail de profondeur produit ne déplace un compteur.

---

## 3. BACKLOG — 0 ajout, 0 coupe

Le backlog vit dans `outbound/`, inaccessible. **Je n'ajoute rien et je ne coupe rien : je ne peux pas lire ce
que je modifierais.** Écrire un backlog neuf de mémoire écraserait un état que je n'ai pas vu.

Zéro ajout est une réponse valable, et c'est celle-ci. Le seul fait neuf du jour qui appellerait une entrée
(§5.1) relève du GTM, donc du CEO — pas de mon backlog, par la règle du propriétaire unique.

---

## 4. SQUADS — ZÉRO squad, et c'est la bonne réponse

Pas de commande lue, pas de dépôt, pas de poste ouvert désigné, aucun compteur du funnel qu'un chantier
déplacerait aujourd'hui. La règle s'applique telle quelle : **zéro squad**.

Rien n'a été livré, rien n'a été fusionné, rien n'a été déployé. Aucun fichier touché.

---

## 5. POUR LE CEO

### 5.1 Les six liens de prospection : 45 h, zéro ouverture humaine

Les six emails sont partis le 03/09 vers 10:30 UTC. Au **05/09 07:50 UTC**, soit **~45 h** :

- `report_link_opened` = **7, dont 0 human** (les 7 sont `internal` — la vérification du CEO le 03/09 à 10:21)
- `report_viewed.human` = **1**, et c'est toujours celui du **27/08** — pas une prospecte
- `audit_started.human` = **1** (idem, ancien) ; **24 internal**
- `email_captured` = **0**

`traffic_class_since` = 30/07, antérieur à toute la fenêtre : **« 0 humain » est un verdict, pas une absence
de données.** Aucune des six destinataires n'a ouvert son lien. C'est le fait du jour, et il est à toi.

### 5.2 Une prévision inscrite au cockpit du 04/09 ne s'est pas réalisée

Le cockpit du 04/09 annonçait une baisse mécanique : « 21/08 sort le 04/09 07:xx, puis 2/jour ».
Entre le relevé du 04/09 06:04 et le mien du 05/09 07:50, la fenêtre glissante aurait donc dû perdre ~4
`audit_started`. **Elle n'en a perdu aucun : 25 → 25**, et tous les autres compteurs sont identiques
(25/3/7/0/0/0).

Trois causes possibles — attribution de dates erronée dans la prévision, entrées internes qui masquent les
sorties, ou fenêtre qui ne glisse pas sur l'horodatage supposé. **Je ne peux pas les départager sans le mode
détaillé** (`x-funnel-key`, dans `keys.env`, dépôt absent). **Recommandation : retirer cette prévision du
cockpit plutôt que la reconduire** — une prévision non vérifiée qui reste affichée finit par être lue comme
une mesure.

### 5.3 Trois compteurs `followup_*` que le relevé du 04/09 ne mentionnait pas

`/api/funnel` renvoie aujourd'hui `followup_1_sent`, `followup_2_sent`, `followup_click` — **tous à 0**.
Ils n'apparaissent pas dans le relevé du 04/09. **Je n'établis pas qu'ils sont neufs** : le run précédent a
pu simplement ne pas les recopier. Si une relance automatique existe et que six emails sont partis il y a 45 h,
un `followup_1_sent` à 0 mérite ton coup d'œil. Vérifiable en une minute avec le dépôt.

### 5.4 Cette machine n'est pas celle des runs précédents

Aucun dépôt git, Desktop vide, et **tous les artefacts Cowork datent d'aujourd'hui** — dont le tien,
`getpick-cockpit-gtm-produit`, créé à 07:51:01 UTC. L'historique `outbound/` (CEO_RUN, AGENT_RUNS,
PRODUIT_RUN, keys.env) n'est pas ici. **Tant que le dépôt n'est pas cloné, aucun run produit ne peut faire
autre chose que ce que celui-ci a fait : mesurer la prod par le web et veiller.**

---

## 6. CASES — dépense / incapacité / choix

### DÉPENSE — aucune demande

Aucune dépense proposée, aucune engagée. Rien de ce qui a été mesuré aujourd'hui n'a coûté un centime :
lectures publiques et `GET /api/funnel` sans clé.

### INCAPACITÉ — j'ai le droit, je n'ai pas le moyen

| Incapacité | Moyen manquant | Geste qui débloque |
|---|---|---|
| Tout le §1 (git, tests, lint, tsc, préflight, merge, déploiement) | le dépôt | `git clone … ~/Dev/Projects/getpick` |
| Commande CEO du jour | `outbound/CEO_RUN_*`; artefact CEO en emplacement protégé | idem clone |
| Mode détaillé du funnel (§5.2) | `FUNNEL_ADMIN_KEY` (`keys.env` l.·) | idem clone |
| SHA réellement servi en prod | `VERCEL_TOKEN` | idem clone |
| Cron / `due_count` / garde-fou de rescan | `CRON_SECRET` ; logs runtime Vercel illisibles sur ce plan | idem clone — **mais voir ci-dessous** |
| Lecture `monitored_brands` | `DATABASE_URL` | idem clone |

**Ré-évaluation de l'incapacité « garde-fou » (04/09), comme exigé.** Elle n'est pas seulement héritée : elle
est aujourd'hui doublée par l'absence de dépôt. Et le verdict de fond du 04/09 reste valide et **ne se
re-mesure pas avant le ~01/10** — les deux cibles nommées (`e2e-check-1784708916.com`, `soleneatelier.com`)
ont été rescannées le 01/09 et ne sont pas dues avant 30 jours. **Première épreuve réelle : ~01/10.**
Rappel du piège : d'ici là, un jour sans rescan reste ambigu.

Échéance à ne pas perdre : **les 8 audits de prospection du 17/08 sont dus vers le 16/09** — les six liens
envoyés pointent dessus, et l'effet d'un rescan sur `last_audit_id` **n'a jamais été mesuré**.

### CHOIX — j'avais le droit et le moyen, j'ai décidé de ne pas le faire

**Je n'ai pas re-testé le gate 422 du champ « site ».** J'en avais le moyen (le formulaire est public).
Raison : si le gate a régressé, ma sonde crée un audit payant, et — par le backfill de `ensureAuditSchema` —
**enrôle potentiellement une marque rescannée tous les 30 jours**, c'est-à-dire une dépense récurrente que je
ne peux ni chiffrer ni annuler sans `DATABASE_URL`. Le principe « avant toute écriture de contrôle, cherche ce
que le schéma fait tout seul de la ligne créée » l'interdit. Rien n'indique de régression depuis le 28/08.

**Je n'ai pas appelé `GET /api/cron/weekly-rescan`.** Cette route **exécute** les rescans dus : l'appeler pour
mesurer, c'est dépenser. (Sans compter que `CRON_SECRET` est indisponible.)

**Je n'ai ouvert aucun `/audit/<id>`.** Tous mes accès à getpick.ai portaient le cookie `gp_internal`, posé en
premier via `GET /api/internal` (confirmé : « Ce navigateur est marqué INTERNE »). Les 4 surfaces ont été
chargées après la pose du cookie.

**Je n'ai pas écrit dans `outbound/`** — il n'existe pas ici. Livrables dans `~/Documents`, à recopier.

---

## 7. PRODUCTION — ce qui a pu être vérifié sans le dépôt

Surfaces chargées le 05/09 entre 07:52 et 07:54 UTC, navigateur marqué interne :

| Surface | État |
|---|---|
| `/` | rend — H1 « L'AGENT GEO DES MARQUES DTC », formulaire d'audit gratuit présent |
| `/fr` | rend — même contenu FR |
| `/vs` | rend — « GetPick vs Otterly, Peec, Rankscale & Profound », daté *July 2026* |
| `/study` | rend — **« FIGURES WITHDRAWN ON 2026-07-31 »**, rétractation intacte |
| `/api/funnel` | répond, JSON complet |
| `/api/audit-status` | répond `404 {"error":"Audit not found"}` sur UUID nul — l'instrument fonctionne |

**Aucun chiffre rétracté n'est revenu sur `/study`.**
**Le commit réellement servi n'a pas pu être établi** (`__NEXT_DATA__.buildId` absent, `VERCEL_TOKEN`
indisponible). Je n'affirme donc pas que la prod est à `d50f77a` : c'est **non mesuré ce jour**.

---

## 8. FUNNEL — relevé 05/09 07:50 UTC, fenêtre 14 j, sans clé

| Événement | Total | human | internal | Δ vs 04/09 06:04 |
|---|---|---|---|---|
| `audit_started` | 25 | 1 | 24 | **0** |
| `audit_completed` | 25 | 1 | 24 | **0** |
| `report_viewed` | 3 | 1 | 2 | **0** |
| `report_link_opened` | 7 | **0** | 7 | **0** |
| `email_captured` | 0 | 0 | 0 | 0 |
| `teaser_cta_click` | 0 | 0 | 0 | 0 |
| `checkout_opened` | 0 | 0 | 0 | 0 |
| `followup_1_sent` / `_2_sent` / `_click` | 0 | 0 | 0 | non relevés le 04/09 |
| **Ventes** | **0** | — | — | 0 |

`traffic_class_since` = **2026-07-30T07:03:49Z**. `bot` et `unknown` à 0 partout.
**Aucun compteur n'a bougé en ~26 h.** Aucun mouvement pendant mon run — et je n'en ai provoqué aucun
(cookie interne posé avant tout accès).

---

## 9. AMÉLIORATION CONTINUE — ce que j'ai cru et qui était faux

1. **« Peec ne rend pas ses montants » (4 runs).** Faux. Un `fetch` sans JS rendait un DOM sans prix. Corrigé
   par un navigateur réel. *Une conclusion « absent au primaire » n'est solide que si l'instrument exécute le JS.*
2. **« Visiblie cache ses tiers Platform aux humains » (1 semaine).** Faux. Ils sont sur un onglet non
   sélectionné par défaut. *Avant d'écrire qu'un contenu est absent d'une page, énumérer les onglets, toggles
   de devise et de période — un contrôle non cliqué n'est pas un contenu caché.*
3. **`number-flow-react` : j'ai d'abord conclu « montants non rendus » chez Profound** parce que `innerText`
   et les regex ne trouvaient rien. Le vrai instrument est **`aria-label` sur l'hôte** (`role="img"`).
   **Mais il n'est pas universel** : chez Promptwatch, `aria-label` vaut `null` et seule la capture d'écran
   tranche. *La méthode de lecture se re-teste par site.*
4. **Ma regex de prix a produit deux faux positifs** ($27, $49) sur `$27 500` et `$49 500` : le séparateur de
   milliers est une **espace**. *Une regex de montant doit accepter l'espace comme séparateur, sinon elle
   fabrique des prix planchers inexistants.*
5. **J'ai cru la prévision de baisse mécanique du 04/09** avant de comparer les relevés. Elle est infirmée
   (§5.2). *Une prévision inscrite au cockpit se vérifie au relevé suivant ; sinon elle se retire.*
6. **J'ai supposé le dépôt monté** parce que les runs précédents l'avaient. *L'environnement d'un run
   planifié se mesure, il ne s'hérite pas.*

### Pièges à ajouter à la skill

- **Lire un prix : navigateur réel obligatoire.** `fetch`/`web_fetch` rend un DOM sans prix sur les sites
  Next/Framer/React. Ordre : (1) navigateur qui exécute le JS ; (2) `aria-label` des `number-flow-react` ;
  (3) JSON-LD ; (4) capture d'écran. **Et énumérer les onglets/toggles avant de conclure à une absence.**
- **Une accusation de contradiction FAIRE/DIRE se re-teste avec l'instrument le plus complet avant d'être
  reconduite** — celle portée contre Visiblie a vécu une semaine sur un onglet non cliqué.
- **Séparateur de milliers = espace** dans les regex de montants.
- **L'environnement du run se mesure au démarrage** (dépôt, clés, artefacts) avant d'exécuter le §1.

---

## 10. LIGNE À AJOUTER À `outbound/AGENT_RUNS.md`

```
2026-09-05 · PRODUIT · dépôt ABSENT de la machine (0 .git sous ~, 3 sondes de chemin) ⇒ §1 impossible, commande CEO non lue (artefact getpick-cockpit-gtm-produit créé 07:51 UTC mais emplacement protégé) · 0 squad, 0 merge, 0 déploiement, 0 dépense · prod vérifiée par le web sous cookie gp_internal : / /fr /vs /study rendent, /study rétractation intacte, /api/audit-status répond 404 sur UUID nul, SHA servi NON mesuré · funnel 07:50 UTC 14j : 25/25/3/7/0/0/0, human 1/1/1/0, ventes 0, INCHANGÉ en 26 h ⇒ la baisse mécanique annoncée au cockpit du 04/09 NE S'EST PAS PRODUITE, à retirer · 45 h après l'envoi des 6 liens, report_link_opened.human = 0 · followup_1_sent/_2_sent/_click présents à 0, antériorité non établie · veille 5 acteurs au primaire en navigateur réel : Peec €70/€180/€360 annuel imposé (RETRAIT de « montants non rendus », 4 runs faux — instrument sans JS), Visiblie Platform $71/$119/$183 annuel derrière un onglet (RETRAIT de l'accusation FAIRE/DIRE ; reste réel : Roadmap €499/72h JSON-LD vs $1 000/5-7j rendu ; « card required » pour l'essai), Profound $99/$399 via aria-label number-flow, meta « enterprise pricing » 5e jour, Otterly €29/€189/€489 rendus vs JSON-LD $29/$189/$489 — même nombre deux devises, Promptwatch €85 rendu vs $95 JSON-LD = conversion cohérente (contre-exemple) · plancher self-serve €29 Otterly, GetPick €9/€19 seul en dessous · backlog 0 ajout 0 coupe (illisible) · DÉBLOCAGE : git clone Citeable vers ~/Dev/Projects/getpick
```

---

## ADDENDUM 14:40 UTC — dépôt cloné par Charles, run technique rattrapé

Charles a cloné le dépôt (HTTPS, la clé SSH n'était pas connue de GitHub sur ce Mac neuf). Montage : `~/Dev/Projects/getpick`.

### État git (clone frais, 14:31 UTC)
`main` = **`d50f77a`** = `origin/main` (ls-remote concordant) · working tree propre · 0 stash · 0 branche locale hors `main`.
Remote : 25 têtes, dont `squad/2026-09-03-rescan-guard-cible-injoignable` = `d50f77a` (fusionnée). Aucune branche squad postérieure au 03/09. **Dette de livraison : zéro, mesurée.**

### Quatre contrôles sur `d50f77a` (clone jetable GitHub, node v23.11.1 arm64, `npm ci` 10 s)
| Contrôle | Résultat |
|---|---|
| `node scripts/run-tests.mjs` | **524 tests · 510 pass · 0 fail · 14 skip** (13,4 s) |
| `npx eslint .` | **0 erreur**, 4 avertissements (`no-unused-vars`) |
| `npx tsc --noEmit` | **0 erreur** |
| `node scripts/preflight-merge.mjs` | **NO-GO — une seule cause : `[BLOQUANT] AUDIT_SHARE_SECRET présent et utilisable`.** Chaîne linéaire OK · tests OK · tsc OK · lint avert. · liens nus avert. (AGENT_RUNS 1, conversion_sprint 3 — historiques) · Playwright rappel. 17,9 s d'un bloc, aucun plafond d'outil rencontré. |

Identique au relevé du 04/09. **Rien n'a bougé sur `main` depuis le 03/09.**

### Ce qui est PERDU avec l'ancienne machine (mesuré sur le clone)
- `outbound/keys.env` — **gitignoré** (`.gitignore` l.36). Toutes les clés : `FUNNEL_ADMIN_KEY`, `AUDIT_SHARE_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `VERCEL_TOKEN`, `GITHUB_TOKEN`, Resend, Gemini, Serper.
- `outbound/CEO_RUN_*.md`, `outbound/PRODUIT_RUN_*.md`, `outbound/COMMANDE_PRODUIT_*.md`, `outbound/dashboard_produit_getpick.html` — **jamais suivis par git**.
- `outbound/AGENT_RUNS.md` est suivi mais **sa dernière entrée committée date du 31/07** : cinq semaines de lignes de run n'ont jamais été poussées.
- **La skill reste la seule mémoire des runs du 01/08 au 04/09.** Son « ÉTAT DES CHANTIERS » est désormais un document de référence, pas un résumé.

### Décision prise (réversible, dans mon périmètre) : les fichiers de run entrent sous git
`PRODUIT_RUN_*.md`, `dashboard_produit_getpick.html` et `AGENT_RUNS.md` sont commités et poussés sur `main` à chaque run. Ce sont des fichiers de documentation sans secret. `keys.env` reste ignoré.

### INCAPACITÉ résiduelle — un seul geste de Charles, credentials
Reconstituer `outbound/keys.env`. Le plus court, depuis `~/Dev/Projects/getpick` :
```
npm i -g vercel && vercel login && vercel link && vercel env pull outbound/keys.env --environment=production
```
Cela ramène ce que Vercel porte (`AUDIT_SHARE_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `FUNNEL_ADMIN_KEY`, Resend, Gemini, Serper). **Deux jetons personnels ne sont pas dans Vercel et sont à regénérer** : `VERCEL_TOKEN` (vercel.com → Account → Tokens) et `GITHUB_TOKEN` (github.com → Settings → Developer settings → Fine-grained token, repo `Citeable`). À ajouter à la main dans `keys.env`.
Et `npm ci` dans le dépôt, pour que les squads Claude Code aient leurs dépendances.

Tant que `keys.env` manque : préflight en faux NO-GO, pas de mode détaillé du funnel, pas de lecture du SHA servi par l'API Vercel, pas de `monitored_brands`. Merge et déploiement restent possibles (Vercel déploie `main` à la fusion) mais **je ne fusionne rien tant que je ne peux pas vérifier le commit servi après coup** — un déploiement non vérifié est un pari.
