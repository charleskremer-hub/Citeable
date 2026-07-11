# Rapport final Charles — Citeable ICP 3 segments + ad sets Meta

Date de vérification : 2026-07-11 UTC  
Site live : `https://getciteable.nanocorp.app`

## 1) Commits vérifiés

- Tâche ICP 3 segments / audit multi-intention : `f269177` — `Add ICP segment-specific audits and ad sets`.
- Correctif route française `/fr` : `522d49c` — `fix French landing route`.
- Note tâche `453d6c69` : l'ID exact n'existe pas comme ref git locale, mais l'implémentation demandée est bien présente sur `origin/main` via le commit ICP ci-dessus et documentée dans `DOCS.md`.

## 2) Landing A2 live — preuves cache-bustées

- EN : `https://getciteable.nanocorp.app/?cb=20260711133212`
  - Snippet visible : `DONE-FOR-YOU, NOT ANOTHER DASHBOARD`.
  - Autre preuve visible : `Other tools give you another dashboard. Citeable tells you exactly what to fix - and writes the fixes for you.`
- FR : `https://getciteable.nanocorp.app/fr?cb=20260711133212`
  - Snippet visible : `Visibilité IA, réglée pour vous.`
  - Autre preuve visible : `DONE-FOR-YOU, PAS UN DASHBOARD DE PLUS`.
- Artefacts navigateur : `artifacts/final-delivery/browser/a2-en-20260711133212.txt` et `artifacts/final-delivery/browser/a2-fr-20260711133212.txt`.

## 3) Audits live réels générés

### Segment A — Marques / e-commerce

- Entité réelle auditée : Allbirds, `https://www.allbirds.com`.
- Rapport live : `https://getciteable.nanocorp.app/audit/f6b169fe-e582-4aaf-849a-c5eff162776e`.
- Score réel : `75/100`.
- Segment détecté : `small_brand_ecommerce` / `Small brand / ecommerce`.
- Intention visible : `meilleure marque de DTC shoe brand`.
- Concurrents réels : `Cariuma`, `Veja`, `On`, `Koio`.
- Top correctif affiché : FAQ / product pages / reviews / listicles, avec snippet visible `FAQ draft to publish after review`.
- Preuve Gemini : `realLlmCall=true`, moteur `Gemini`, modèle `gemini-flash-latest`.
- Artefacts : `artifacts/final-delivery/live-audit-segment-a-allbirds-final-20260711132946.json` et `artifacts/final-delivery/browser/audit-A-f6b169fe-e582-4aaf-849a-c5eff162776e-20260711133212.txt`.

### Segment B — Indépendants / pros locaux

- Entité réelle auditée : Coach Parangon, `https://www.coach-parangon.com`.
- Rapport live : `https://getciteable.nanocorp.app/audit/003f89f4-4e64-4009-8c08-aa7eb0ca67e4`.
- Score réel : `87/100`.
- Segment détecté : `local_independent` / `Local independent / professional service`.
- Intentions visibles : `meilleur coach sportif à Paris`, `coach sportif près de moi`.
- Concurrents réels : `Ownsport`, `ProTrainer`, `Just Coaching`.
- Top correctif affiché : `Google Business / local page fix: “coach sportif recommandé à Paris”`.
- Preuve Gemini : `realLlmCall=true`, moteur `Gemini`, modèle `gemini-flash-latest`.
- Artefacts : `artifacts/final-delivery/live-audit-segment-b-coachparangon-final-20260711132902.json` et `artifacts/final-delivery/browser/audit-B-003f89f4-4e64-4009-8c08-aa7eb0ca67e4-20260711133212.txt`.

### Segment C — Créateurs / influenceurs

- Entité réelle auditée : Ali Abdaal, `https://aliabdaal.com`.
- Rapport live : `https://getciteable.nanocorp.app/audit/c1c13245-ce8d-4c84-8b98-d9d6f739f7da`.
- Score réel : `59/100`.
- Segment détecté : `creator_influencer` / `Creator / influencer`.
- Intentions visibles : `meilleur créateur tech à suivre`, `top créateurs tech`.
- Concurrents réels : `Marques Brownlee`, `Linus Tech Tips`, `MrMobile`, `Mrwhosetheboss`, `Leo Duff`.
- Top correctif affiché : `Social bio / listicle fix: “top créateurs tech”`.
- Preuve Gemini : `realLlmCall=true`, moteur `Gemini`, modèle `gemini-flash-latest`.
- Artefacts : `artifacts/final-delivery/live-audit-segment-c-aliabdaal-final-20260711133104.json` et `artifacts/final-delivery/browser/audit-C-c1c13245-ce8d-4c84-8b98-d9d6f739f7da-20260711133212.txt`.

## 4) Structure des 3 ad sets Meta — instructions pour Charles uniquement

Important : le budget total reste inchangé à `$5/j`. Aucun worker/CEO agent ne touche au budget Meta, ne crée, n'active, ni ne modifie de campagne. Charles applique manuellement dans Meta Ads Manager.

### AD SET 1 — Marques / E-commerce

- Audience : Shopify merchants, WooCommerce users, DTC brand owners, `e-commerce entrepreneur`.
- Accroche : `ChatGPT recommande tes concurrents. Pas toi. Vois pourquoi — gratis.`
- Visuel : audit score `62/100`, concurrents listés.
- Budget : `$2/j`.
- CTA : `Run free audit`.
- URL avec tracking : `https://getciteable.nanocorp.app/?utm_source=meta&utm_campaign=seg_marques`.

### AD SET 2 — Indépendants / Pros locaux

- Audience : `life coach`, `personal trainer`, `psychologue`, `kinésithérapeute`, `avocat indépendant`, petites entreprises locales.
- Accroche : `Quand quelqu'un cherche [ton métier] à [ta ville] sur ChatGPT — tu apparais ?`
- Visuel : audit d'un coach, Google Business manquant signalé.
- Budget : `$2/j`.
- CTA : `Vérifie ta visibilité IA`.
- URL avec tracking : `https://getciteable.nanocorp.app/fr?utm_source=meta&utm_campaign=seg_indepros`.

### AD SET 3 — Créateurs / Influenceurs

- Audience : `content creator`, `YouTuber`, `podcaster`, `newsletter creator`, `influencer`.
- Accroche : `Les IA font des listes de créateurs. Tu es dedans ?`
- Visuel : audit d'un créateur, bio faible signalée.
- Budget : `$1/j` — segment risque n°1, budget réduit.
- CTA : `Teste ta visibilité`.
- URL avec tracking : `https://getciteable.nanocorp.app/fr?utm_source=meta&utm_campaign=seg_createurs`.

## 5) Mesure CPA par segment

- Utiliser un `utm_campaign` unique par ad set : `seg_marques`, `seg_indepros`, `seg_createurs`.
- Dans Meta Ads Manager : garder les trois ad sets séparés, puis exporter `Spend` par ad set.
- Côté Citeable/NanoCorp analytics : filtrer les événements `audit_requested` et/ou les pages vues d'arrivée par `utm_source=meta` + `utm_campaign`.
- Formule : `CPA segment = spend Meta du segment / nombre d'audits demandés avec l'utm_campaign du segment`.
- Lecture utile après trafic : `nanocorp analytics top-events` pour vérifier `audit_requested`, puis `nanocorp analytics events-over-time --granularity day --event-name audit_requested` pour suivre la tendance.

## 6) Garde-fous confirmés

- Données réelles uniquement : audits live sur Allbirds, Coach Parangon, Ali Abdaal.
- Outreach Wave 2 : gelé.
- Posts sociaux : gelés.
- Budget ads : décision Charles uniquement, aucune activation worker.
- Meta : rapport prêt à appliquer manuellement dans Ads Manager, sans action automatique.
