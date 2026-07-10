# Citeable — handoff Meta Ads REGENERATE FR

Date de préparation: 2026-07-11  
Campagne NanoCorp Ads active: `49b54812-ad64-42d0-bcd2-09344457d29f`  
Budget actuel à conserver: `$5/day`  
Objectif: quand Charles clique sur **REGENERATE**, la publicité doit être 100% française et ciblée France / Belgique / Luxembourg.

## Statut d'application directe

- **Créa publicitaire**: non appliquée directement par le worker. `nanocorp ads --help` indique que les commandes Ads disponibles aux workers sont en lecture seule: `list` et `insights` uniquement.
- **Ciblage géographique**: non appliqué directement par le worker pour la même raison. Le ciblage reste à modifier par Charles dans NanoCorp Ads / Meta Ads Manager.
- **Budget**: inchangé côté NanoCorp Ads (`daily_cap_usd: 5.0`).
- **Kill-switch**: à configurer ou surveiller manuellement: si CPA `> 49 EUR`, mettre la campagne / l'ensemble de publicités en pause.

## État actuel lu dans NanoCorp Ads

Snapshot `nanocorp ads list` enregistré dans `artifacts/ads/meta-fr-regen-current-state-2026-07-11.json`:

- Statut: `ACTIVE`
- Creative status: `READY`
- Budget: `$5/day`
- Pays actifs actuels: `US`, `GB`, `CA`, `AU`
- URL actuelle: `https://getciteable.nanocorp.app?utm_source=facebook&utm_medium=paid_social&utm_campaign=49b54812-ad64-42d0-bcd2-09344457d29f`

Insights `nanocorp ads insights 49b54812-ad64-42d0-bcd2-09344457d29f` enregistrés dans `artifacts/ads/meta-fr-regen-insights-2026-07-11.json`:

- Spend: `$16.35`
- Impressions: `37,181`
- Clicks: `196`
- Inline link clicks: `225`
- CTR: `0.527151%`
- CPC: `$0.083418`

## Créa FR finale à utiliser

- Visuel PNG: `artifacts/ads/meta-fr-regen-creative-2026-07-11.png`
- Source HTML éditable: `artifacts/ads/meta-fr-regen-creative-2026-07-11.html`
- Format visuel: carré 1080 × 1080 px
- Direction artistique: fond sombre `#0a0a0a`, accent vert `#22c55e`, score `47/100` visible, concurrents floutés, style cohérent avec Citeable.

### Champs Meta à renseigner

**Primary text / Texte principal**

```text
Quand tes clients demandent conseil à ChatGPT ou Google IA — est-ce que ton nom apparaît ? Ou celui de ton concurrent ?
Fais l'audit gratuit en 60 secondes. Sans carte, sans installation.
```

**Headline / Titre**

```text
L'IA recommande-t-elle ton entreprise ?
```

**CTA / Bouton**

```text
Audit gratuit
```

Si Meta ne propose pas de bouton exactement nommé `Audit gratuit`, choisir le bouton disponible le plus proche, dans cet ordre: `En savoir plus`, puis `S'inscrire`.

**Destination URL / URL de destination**

```text
https://getciteable.nanocorp.app?utm_campaign=fr_regen&utm_source=meta&utm_medium=paid
```

## Ciblage géographique exact

### Ajouter / conserver uniquement

- France
- Belgique
- Luxembourg

### Retirer explicitement

- United States / États-Unis
- United Kingdom / Royaume-Uni
- Canada
- Australia / Australie
- Switzerland / Suisse, si présent

### Budget et règle de pause

- Garder le budget inchangé: `$5/day`.
- Ne pas créer de nouvelle campagne parallèle sauf si Meta force techniquement la duplication.
- Surveiller le CPA en EUR; mettre en pause dès que CPA `> 49 EUR`.

## Étapes ultra précises — Meta Ads Manager

1. Ouvrir Meta Ads Manager et sélectionner le compte publicitaire de Citeable.
2. Dans l'onglet **Campagnes**, chercher la campagne NanoCorp/Citeable active correspondant à `49b54812-ad64-42d0-bcd2-09344457d29f` ou à l'ancienne URL contenant `utm_campaign=49b54812-ad64-42d0-bcd2-09344457d29f`.
3. Vérifier que le budget affiché est `$5/day`; ne pas modifier ce montant.
4. Ouvrir l'onglet **Ensembles de publicités / Ad sets** de cette campagne.
5. Ouvrir l'ensemble actif unique. S'il y en a plusieurs, modifier uniquement l'ensemble actif qui dépense actuellement.
6. Aller dans **Audience** puis **Lieux / Locations**.
7. Supprimer `United States`, `United Kingdom`, `Canada`, `Australia`.
8. Supprimer `Switzerland` / `Suisse` si ce pays apparaît.
9. Ajouter exactement `France`, `Belgium` / `Belgique`, et `Luxembourg`.
10. Si Meta affiche l'option de type de lieu, choisir **Personnes vivant dans ce lieu** plutôt que voyageurs / visiteurs récents.
11. Enregistrer l'ensemble de publicités sans changer le budget, le calendrier ou l'objectif.
12. Ouvrir l'onglet **Publicités / Ads** de la même campagne.
13. Ouvrir la publicité active qui pointe vers `getciteable.nanocorp.app`.
14. Dans **Identité**, conserver la page / le compte Instagram actuels de Citeable.
15. Dans **Format**, conserver le format image unique si déjà sélectionné.
16. Dans **Média / Creative**, remplacer l'image par `artifacts/ads/meta-fr-regen-creative-2026-07-11.png`.
17. Dans **Texte principal / Primary text**, coller exactement le texte principal FR ci-dessus, avec le saut de ligne entre les deux phrases.
18. Dans **Titre / Headline**, coller exactement `L'IA recommande-t-elle ton entreprise ?`.
19. Dans **Bouton d'appel à l'action / CTA**, choisir `Audit gratuit` si disponible; sinon `En savoir plus`.
20. Dans **URL du site web / Destination URL**, remplacer l'URL par `https://getciteable.nanocorp.app?utm_campaign=fr_regen&utm_source=meta&utm_medium=paid`.
21. Vérifier l'aperçu mobile et desktop: tout le texte visible doit être en français, le score `47/100` doit être lisible, et le badge géographique doit afficher `FR · BE · LU`.
22. Cliquer **Publier / Publish**.
23. Après publication, contrôler les colonnes de performance au moins quotidiennement. Si le CPA dépasse `49 EUR`, sélectionner l'ensemble de publicités ou la campagne et basculer le statut sur **Pause**.

## Checklist avant publication

- [ ] Texte principal en français, sans anglais.
- [ ] Headline: `L'IA recommande-t-elle ton entreprise ?`.
- [ ] CTA: `Audit gratuit` ou fallback Meta le plus proche.
- [ ] URL: `https://getciteable.nanocorp.app?utm_campaign=fr_regen&utm_source=meta&utm_medium=paid`.
- [ ] Image: `meta-fr-regen-creative-2026-07-11.png`.
- [ ] Pays actifs: France, Belgique, Luxembourg uniquement.
- [ ] Pays retirés: US, GB, CA, AU, Suisse si présente.
- [ ] Budget resté à `$5/day`.
- [ ] Règle opérationnelle notée: pause si CPA `> 49 EUR`.
