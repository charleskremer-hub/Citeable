# Citeable — bascule pub NanoCorp FR / France

Date: 2026-07-10
Campagne active: `49b54812-ad64-42d0-bcd2-09344457d29f`

## Statut d'application

- **Créa FR**: non appliquée en production par le worker, car `nanocorp ads --help` indique que les commandes Ads sont en lecture seule pour les workers et que les campagnes sont contrôlées par le propriétaire depuis le dashboard / Meta Ads Manager.
- **Geo FR**: non appliquée en production par le worker pour la même raison.
- **Budget**: inchangé côté campagne active (`daily_cap_usd: 5`).
- **Kill-switch**: à appliquer/contrôler manuellement dans Meta Ads Manager: pause si CPA `> 49 EUR`.

## État actuel lu dans NanoCorp Ads

Snapshot `nanocorp ads list` du 2026-07-10:

- Statut: `ACTIVE`
- Creative status: `READY`
- Budget: `$5/day`
- Pays actifs: `US`, `GB`, `CA`, `AU`
- Destination: `https://getciteable.nanocorp.app?utm_source=facebook&utm_medium=paid_social&utm_campaign=49b54812-ad64-42d0-bcd2-09344457d29f`

Insights lus via `nanocorp ads insights 49b54812-ad64-42d0-bcd2-09344457d29f`:

- Spend: `$16.32`
- Impressions: `37,176`
- Clicks: `195`
- Inline link clicks: `224`
- CTR: `0.524532%`
- CPC: `$0.083692`

## Créa FR à remplacer

- Titre: `L'IA recommande-t-elle ton entreprise ?`
- Texte: `Quand tes clients demandent conseil a une IA, est-ce qu'elle te cite - ou ton concurrent ? Fais l'audit gratuit en 60 secondes. Sans carte, sans installation.`
- CTA demandé: `Audit gratuit`
- CTA Meta si `Audit gratuit` n'existe pas dans la liste: `En savoir plus`
- Visuel régénéré: `artifacts/ads/meta-fr-switch-creative-2026-07-10.png`
- Source éditable du visuel: `artifacts/ads/meta-fr-switch-creative-2026-07-10.html`

## Ciblage demandé

Remplacer le ciblage actuel par:

- France: `FR`
- Francophone si possible: `BE`, `CH`, `LU`

Retirer explicitement:

- `US`
- `GB`
- `CA`
- `AU`

Budget:

- Garder `$5/day` total, sans créer de campagne/ad set parallèle.

Kill-switch:

- Surveiller le CPA en EUR et couper/mettre en pause si CPA `> 49 EUR`.

## Marche à suivre Charles — Meta Ads Manager

1. Ouvrir Meta Ads Manager et sélectionner le compte publicitaire de Citeable.
2. Onglet **Campaigns / Campagnes**: ouvrir la campagne active NanoCorp/Citeable correspondant à l'URL UTM `utm_campaign=49b54812-ad64-42d0-bcd2-09344457d29f`.
3. Vérifier qu'il n'y a qu'une seule publicité/ad set actif pour Citeable; ne pas dupliquer la campagne et ne pas lancer de version EN en parallèle.
4. Onglet **Ad sets / Ensembles de publicités**: ouvrir l'ensemble actif.
5. Section **Budget & schedule / Budget et calendrier**: laisser le budget à `$5/day`.
6. Section **Audience / Locations / Lieux**: supprimer `United States`, `United Kingdom`, `Canada`, `Australia`.
7. Ajouter `France`; si Meta permet l'extension francophone dans le même ad set, ajouter aussi `Belgium`, `Switzerland`, `Luxembourg`.
8. Conserver uniquement les personnes résidant dans ces lieux, pas les voyageurs si l'option est affichée.
9. Onglet **Ads / Publicités**: ouvrir la publicité active et remplacer le texte principal par le texte FR ci-dessus.
10. Remplacer le headline par `L'IA recommande-t-elle ton entreprise ?`.
11. Mettre le CTA sur `Audit gratuit`; si l'option n'existe pas, utiliser `En savoir plus`.
12. Remplacer l'image par `artifacts/ads/meta-fr-switch-creative-2026-07-10.png`.
13. Garder l'URL de destination existante avec ses UTMs.
14. Publier les changements, puis contrôler le CPA quotidien; mettre en pause si CPA dépasse `49 EUR`.
