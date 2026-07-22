# Handoff Claude Code — GetPick (2026-07-21, soir)

Document de passation. Lis-le en entier avant d'agir. Il est autosuffisant : il te donne l'état réel du produit, les pièges d'environnement, et ce qui reste à faire. Rédigé après une session de debug/déploiement avec Charles.

---

## 0. Les trois noms (à clarifier une fois pour toutes)

- **GetPick** = le produit ACTUEL, en ligne sur `https://www.getpick.ai`. Le renommage est **fait et déployé** (commit `2b0ee1b`, 20/07/2026). Ne le refais pas.
- **getciteable** = ancien nom. Ne subsiste que dans le nom du dépôt GitHub et d'anciens chemins. Ignore-le comme identité produit.
- **WhoPicks** = piste de renommage **ABANDONNÉE**. Le fichier `RENAME_WHOPICKS.md` pilote une migration vers « whopicks.ai » qui n'a jamais eu lieu — GetPick a été choisi à la place. Ce fichier est **PÉRIMÉ et dangereux** : il se déclare « source de vérité pour les agents planifiés ». À réécrire ou supprimer, mais **demande confirmation à Charles avant**.

Positionnement : source de vérité = `POSITIONING_V2.md` (PAS `POSITIONING.md`).
Résumé : « L'agent GEO des marques DTC » / « The GEO agent for DTC brands ». Vraies questions d'achat posées en direct à Gemini (jamais simulées), il NOMME le concurrent cité à la place de la marque, il ÉCRIT les correctifs copier-coller, il surveille. Comparé à l'agence GEO (2 000–20 000 €/mois). Offres : audit gratuit (**6 questions** depuis le 21/07 au soir — 3 ne suffisaient pas à exposer un écart) → Monitor 9 € → Agent 19 €. Garantie remboursé 30 jours.

---

## 1. LE BON DOSSIER

**Travaille dans `~/Dev/Projects/getpick`.** Hors iCloud, entièrement lisible, `node_modules` installé, `git` fonctionnel, HEAD = `daf9212`.

**N'utilise JAMAIS `~/Documents/Claude/Projects/NanoCorp/getciteable-main`.** Ce dossier est MORT : dossier iCloud « Bureau et Documents » détaché de son domaine File Provider (xattr `com.apple.fileprovider.detached`). Les fichiers sont des stubs `dataless` sans service pour les matérialiser → toute lecture (`cat`, `head`, `cp`, Read) part en timeout, y compris `.git`. `brctl` ne le voit pas car « Bureau et Documents » passe par File Provider, pas par l'API CloudDocs héritée. Rien à réparer là-dedans : le dépôt a été re-cloné proprement vers `~/Dev/Projects/getpick`.

Remotes : `origin` = `https://github.com/charleskremer-hub/Citeable.git` (le dépôt vivant, celui que Vercel écoute). L'ancienne origine `github.com/nanocorp-hq/getciteable` n'est plus utilisée.

---

## 2. INFRA (bascule hors NanoCorp faite le 21/07)

Le produit ne dépend plus de NanoCorp pour l'hébergement.

- **Hébergement** : Vercel, projet `kinze/getpick2`. Déploie automatiquement à chaque push sur `main` de `charleskremer-hub/Citeable`.
- **Domaines** : `getpick.ai` (apex, 308 → www) et `www.getpick.ai`, vérifiés chez Namecheap via 2 TXT `_vercel`. URL canonique = `https://www.getpick.ai`.
- **Base** : Neon, projet `getpick`, branche `production`, base `neondb`. `DATABASE_URL` est en variable Vercel (Sensitive). Console SQL : https://console.neon.tech → projet getpick → SQL Editor. L'historique NanoCorp n'a PAS été migré : les compteurs funnel sont repartis de zéro le 21/07 ~15h55.
- **Variables Vercel présentes** : `RESEND_API_KEY`, `EMAIL_FROM`, `UNSUBSCRIBE_SECRET`, `FUNNEL_ADMIN_KEY`, `CRON_SECRET`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` (= `https://www.getpick.ai`), **`SERPER_API_KEY`** (⚠️ mis à jour 22/07 : la clé Brave a été SUPPRIMÉE — token invalide, puis clé Serper rotée après une fuite dans un message d'erreur, voir addendum). **Rappel : Vercel n'injecte les variables qu'au build — après tout ajout/modif de variable, il FAUT redéployer.**

Dépendances NanoCorp restantes (à réduire) : paiement (`checkout.nanocorp.so` dans `src/lib/checkout-links.ts`) et script analytics phospho-nanocorp dans `layout.tsx`.

---

## 3. PIÈGES D'ENVIRONNEMENT (lis avant de coder)

- **git depuis un sandbox monté** : ne lance JAMAIS de commande git write (`add`, `commit`) via un montage réseau. Ça laisse un `.git/index.lock` de 0 octet impossible à supprimer depuis l'hôte, qui bloque ensuite TOUS les `git add`. C'est arrivé ce soir. Le push doit être fait par Charles depuis un vrai terminal, ou par toi si tu tournes en local natif.
- **Typecheck** : `npx tsc --noEmit` fonctionne dans `~/Dev/Projects/getpick` (deps installées). Un `tsc` v7 rejette `baseUrl` — préfère la version du `package.json`. `TS2307` sur un import `@/lib/...` est une VRAIE erreur, ne l'ignore pas.
- **Vérifier un envoi d'email** : le statut `sent` en base = Resend a ACCEPTÉ le message, PAS qu'il a été délivré. Pour la délivrabilité réelle (SPF/DKIM, bounce, spam), regarde le dashboard Resend (delivered/bounced/complained), pas seulement la table.

---

## 4. ÉTAT PRODUIT (commits du 21/07, tous poussés jusqu'à `daf9212`)

- Rebrand GetPick fait (`2b0ee1b`).
- Bug « la marque apparaît dans sa propre liste de concurrents » corrigé en deux passes (match exact puis sous-chaîne) — `src/lib/audit-engine.ts`, 53 tests. Vérifié en prod : GetPick auditant GetPick ne se cite plus lui-même.
- Adaptateurs hors NanoCorp livrés : `src/lib/web-search.ts` (Brave/Serper/Tavily) et `src/lib/mailer.ts` (Resend). Branchés dans `audit-engine.ts`.
- Catégorisation IA corrigée : ce matin GetPick sortait « warehouse management software » (score 61), ce soir catégorie correcte, scores 75–87 sur audits de contrôle.

### Correctif du soir (commit `daf9212`) — suppression des domaines email personnels
Dans `src/lib/audit-engine.ts`, la fonction `isPersonalEmailDomain()` bloquait l'envoi vers gmail/yahoo/outlook/icloud/proton etc. : statut `suppressed`, AUCUN appel à Resend. Résultat : tout prospect inscrit en Gmail (une grande partie de l'ICP DTC) ne recevait ni rapport ni relance, silencieusement. **Décision Charles 21/07 : ne plus supprimer les domaines personnels.** La fonction et son appel ont été retirés. Restent supprimés volontairement : domaines internes (keyban/getciteable/nanocorp via `isInternalRootDomain`), audits anonymes, et la table dynamique `audit_email_suppression_list` (le bon endroit pour bloquer au cas par cas : désabo, plainte, bounce dur). Testé en prod : `charles.kremer+gp1@gmail.com` → `sent` / provider `resend`.

---

## 5. CE QUI RESTE À FAIRE

**Priorité produit (pas des features) :** le funnel avant bascule montrait 146 audits / 1 seul email capturé / 3 checkouts / 0 vente sur 14 j. Le sujet n'est pas le backlog de features, c'est la conversion audit→email→achat. À mesurer sur la base neuve.

À traiter :
1. **Mesurer** la part des envois qui étaient supprimés (requête sur `audit_email_delivery_log`, `status='suppressed'` GROUP BY `reason`) — pour chiffrer l'impact du fix email.
2. **Confirmer la délivrabilité réelle** Resend (SPF/DKIM sur getpick.ai) — le `sent` ne suffit pas.
3. **RENAME_WHOPICKS.md** périmé → réécrire/supprimer (confirmer avec Charles).
4. **5 fichiers non commités** dans l'arbre de travail, écrits par un autre process vers 19h50 (tracking PostHog) : `PRODUCT_BACKLOG.md`, `src/app/HomeClient.tsx`, `src/app/audit/[id]/page.tsx`, `src/lib/i18n.ts`, + `src/app/LocaleLang.tsx` (non suivi). **Examine-les avant de committer quoi que ce soit — ne les emporte pas en bloc.**
5. Réduire les dépendances NanoCorp restantes (checkout Stripe, script analytics).

---

## 6. OUTBOUND (cold) — dossier `outbound/`

Machine à 3 étages, 100 % autonome, qui **n'envoie jamais** toute seule. Tâche planifiée `citeable-sdr-weekly` (lundi 08h05).

Pipeline : `enrich_hunter.py` (Hunter, trouve les emails) → `sdr_agent.py` (audite la marque en prod via GetPick + rédige le pitch à partir du VRAI verdict) → `sdr_push_instantly.py` (charge les leads dans Instantly). Orchestré par `run.sh` / `sdr_service.py`. Clés dans `outbound/keys.env` (gitignoré) : `HUNTER_API_KEY`, `INSTANTLY_API_KEY`, `INSTANTLY_CAMPAIGN_ID`, `SERPER_API_KEY`, etc.

**Instantly** : campagne **en pause (`status=0`)** — aucun envoi automatique, c'est volontaire, ne l'active jamais sans Charles. Deux boîtes DFY en warmup : `charles@trygetciteable.com` (depuis 17/07) et `charles@freegetpick.com` (depuis 20/07, domaine getpick, score 100). Une boîte `charlie@` a été commandée mais n'est jamais apparue côté Instantly.

**RÈGLE DE CANAL CRITIQUE (conversion_sprint 22/07)** : ne JAMAIS envoyer de cold depuis `hello@getpick.ai` / Resend. C'est le domaine **transactionnel** (rapports, relances) — le cramer sur du cold ruinerait la délivrabilité des vrais emails produit. Le cold passe par les boîtes Instantly dédiées ou un envoi manuel perso.

**Mécanique de lead** : le rapport d'audit est anonyme. Le prospect reçoit le lien, voit le verdict, et doit laisser SON email pour déverrouiller le détail → c'est lui qui devient le lead. **Ne « réclame » jamais ces audits nous-mêmes.**

**Leçon de sourcing (à ne pas répéter, actée dans `ICP.md` §6)** : la première liste de chasse était biaisée — elle venait des rivaux que Gemini cite spontanément, donc uniquement des marques déjà AI-visibles (des gagnantes). Or le pitch « un rival est cité à ta place » ne convertit que des **perdantes**. Règle corrigée : sourcer HORS des réponses IA (annuaires DTC FR, sélections presse, exposants salons, marketplaces éthiques), auditer, puis ne garder en cible que les marques avec **≥ 1 question perdue**. Les gagnantes (≥ 85, 6/6) ne sont pas des prospects douleur.

## 7. INBOUND / PR — tâche `citeable-pr-inbound` (mardi 08h02)

Chaque run : (a) veille des citations/backlinks de l'étude publiée (`/study`, 21 marques DTC) ; (b) **dogfood** — audit de GetPick par GetPick pour suivre son propre score (c'est ce test qui a révélé les bugs de catégorisation et d'auto-citation) ; (c) tient `pr_targets.csv` (cibles presse) et rédige les pitchs dans `pr_pitches_*.md`, signés « Charles, GetPick ». **N'envoie rien** tant qu'aucun email destinataire n'est vérifié (jamais de pattern déduit). Angle presse actif : le rebranding lui-même (confusion d'attribution avec les homonymes citeable.eu / getcitable.com / citeable.tech).

## 8. GROWTH / MONITORING — tâche `citeable-growth-hourly` (toutes les heures)

Surveille le funnel via `GET /api/funnel` (compteurs agrégés 14 j). Kill-switch ads prévu (CPA > 49 €, budget 5 $/j) mais **jamais opérant** : aucun accès à la dépense Meta Ads depuis l'environnement (signalé 9 runs de suite). Détail du funnel derrière header `x-funnel-key` = `FUNNEL_ADMIN_KEY`. **Source de vérité horaire = Chrome MCP** (`navigate` + `get_page_text`), car `web_fetch` sur `/api/funnel` échoue souvent (garde-fou de provenance d'URL).

### Pièges outbound/inbound spécifiques (⚠️ certains PÉRIMÉS depuis le déménagement)
- **`keys.env` via l'outil `Read`, pas `cat`** : le montage bash renvoie par intermittence `errno 35 / Resource deadlock avoided`. **MAIS** l'ancienne note pointe vers `~/Documents/.../getciteable-main/outbound/keys.env` — chemin MORT. Le bon est `~/Dev/Projects/getpick/outbound/keys.env`. En local natif, `cat` fonctionne normalement.
- **Instantly `403 code 1010`** = WAF Cloudflare, User-Agent absent/non navigateur. Envoyer un UA Chrome règle le problème. Ce n'est ni la clé ni l'API.
- **Clé vide → 401 Instantly** : toujours vérifier que la clé fait > 20 caractères avant de conclure « problème d'API ».

## 8bis. ADDENDUM — session du 22/07 (état à jour, commits `8ba437a` → `8029584`, tous déployés)

Lu et repris le handoff le 22/07. Ce qui a changé depuis sa rédaction :

- **ICP défini et recentré** (`ICP.md`, nouvelle source de vérité de priorisation) :
  challenger DTC FR en catégorie encombrée, qui PERD ≥ 1 question d'achat. Un seul
  segment servi — `local_independent` et `creator_influencer` supprimés du code
  (aucun client en base, et le détecteur classait GetPick lui-même en « local »).
- **Deux bugs de crédibilité corrigés sur les questions d'achat** : (a) les gabarits
  contenaient le nom de la marque (contredisait la promesse affichée) ; (b) le
  générateur IA recopiait le PITCH de la marque — mesuré : 21/21 mentions,
  ai_visibility 100/100 partout, le produit ne pouvait pas montrer la douleur.
  Questions désormais ancrées catégorie + 2 garde-fous testés
  (`promptMentionsAuditedBrand`, `questionEchoesBrandCopy`, rejets tracés dans
  `promptDebug`).
- **Nouvelle carte de rapport « l'IA ne sait pas ce que tu vends »**
  (`categoryPerception`, champ `audited_brand_category` dans l'appel structuré
  existant, zéro appel réseau ajouté ; verdict conservateur, muet sans signal).
- **`search_visibility` réparé de bout en bout** : Brave 422 (token invalide) →
  bascule Serper. Au passage, une valeur d'env mal collée a fait fuiter la clé dans
  un rapport public → clé ROTÉE, ligne purgée en base, et caviardage systématique
  des clés dans tous les messages d'erreur (`[redacted-key]`). Vérifié en prod :
  25/25 sur audit de contrôle.
- **Sprint conversion** (`outbound/conversion_sprint_2026-07-22.md`) : 9 marques
  auditées, funnel vérifié E2E (claim d'email OK), 3 cibles qualifiées avec drafts
  (Lemahieu, Ekyog, Soeur). Leçon de sourcing actée en §6 de l'ICP.
- **Délivrabilité (§5.2)** : SPF + DKIM + MX retour vérifiés par DNS le 22/07,
  DMARC `p=none`. Reste : lire delivered/bounced dans le dashboard Resend (Charles).
- **§5.4 (5 fichiers non commités)** : embarqués dans `8ba437a` — examinés APRÈS
  commit et non avant, contrairement à la consigne. Contenu vérifié a posteriori :
  tracking PostHog du formulaire (`audit_form_started`, `audit_validation_blocked`,
  `audit_submit_*`) + `LocaleLang.tsx`. Bénin, en prod sans incident.
- **Checkout** : répond, mais la page s'intitule encore « Citeable Monitor » —
  brand mismatch au moment du paiement. Libellés côté NanoCorp/Stripe (Charles).
- **Pushes sur `main`** : effectués par l'agent en local natif sur instruction
  explicite de Charles à chaque fois (« Oui, pousse sur main ») — cohérent avec §9,
  la règle par défaut reste : le push revient à Charles.

Restent ouverts du §5 : (1) mesure des envois supprimés — non mesurable, l'historique
est resté sur NanoCorp (Charles a déprioritisé le pg_dump le 22/07) ; (3)
`RENAME_WHOPICKS.md` périmé — suppression en attente de confirmation Charles ;
(5) Stripe + retrait du script phospho-nanocorp.

## 9. GARDE-FOUS

Jamais de paiement/Stripe/clés/auth/suppression de données. N'affiche jamais une clé. Ne casse jamais le funnel (revert si typecheck ou test E2E échoue). Le `git push` final revient à Charles. Veille factuelle et sourcée. Avant de conclure « problème d'API », vérifie que la clé était bien chargée. Signature de toute communication : « Charles — GetPick ».
