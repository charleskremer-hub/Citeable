# GTM Playbook — GetPick

Document du Head of Growth. Une décision par cycle, des métriques sourcées, et ce
qui a échoué documenté (même esprit que `ICP.md`). Références : `ICP.md`,
`POSITIONING_V2.md`, `GROWTH_ORGANIC.md`, `outbound/conversion_sprint_2026-07-22.md`,
`outbound/AGENT_RUNS.md`.

Créé le 2026-07-23 — premier cycle.

---

## Invariants (rappel — non négociables sans décision de Charles)

1. Le déclencheur d'achat est **fabriqué** : le prospect doit VOIR le rival que
   l'IA recommande à sa place. Chaque canal se juge sur les « moments rival
   nommé » qu'il produit chez de vraies cibles ICP.
2. Sourcer **hors des réponses IA** (leçon du 22/07 : 94 % de mention sur le lot
   sourcé dans les réponses IA — des gagnantes, pas des prospects).
3. **France d'abord, challengers seulement.**
4. Anti-ICP strict : ni local/libéral, ni créateurs, ni mid-market avec équipe
   marketing, ni B2B SaaS.
5. 9 €, zéro unité de compte, catégorie « agent GEO » — comparaison à l'agence
   (2 000–20 000 €/mois), jamais aux outils de monitoring.

---

## Cycle 1 — semaine du 23 au 29 juillet 2026

### État des lieux au 2026-07-23 (tout sourcé)

| Fait | Source |
|---|---|
| **0 utilisateur réel en base** ; base Neon neuve depuis la bascule hors NanoCorp (21/07 15:55), compteurs funnel repartis de la baseline smoke-test (1/1/1) | `ICP.md` §9 ; `AGENT_RUNS.md` 21/07 16:01 |
| Sprint outbound 22/07 : 9 marques auditées, **3 perdantes qualifiées** (Lemahieu 76, Ekyog 82, Soeur 82 — chacune ≥ 1 question perdue avec rival nommé), 6 gagnantes écartées | `outbound/conversion_sprint_2026-07-22.md` |
| Les 3 drafts sont **enrichis (Hunter 3/3, contacts décideurs nominatifs)** mais **PAS ENVOYÉS** | sprint 22/07 « Exécution » ; `AGENT_RUNS.md` 23/07 07:29 |
| ⚠️ **Contradiction Instantly à lever** : le sprint dit « leads chargés, campagne `802b9b61` en pause » ; le run du 23/07 07:29 voit cette campagne en `status=-1` (brouillon) avec `email_list` **vide**. L'autre campagne (`419e33c5`) est en pause avec les 2 boîtes assignées mais rien n'indique qu'elle porte nos drafts | `AGENT_RUNS.md` 23/07 07:29 vs sprint 22/07 |
| Boîte d'envoi : `charles@freegetpick.com`, warmup depuis 20/07, score 100 (jeune — volume max 3-5/jour) ; `charles@trygetciteable.com` score 96, maturité ~31/07 | `AGENT_RUNS.md` 23/07 07:29 |
| Pitchs presse : 6 pitchs prêts (21/07) mais **0 email destinataire vérifié** sur 10 cibles — et les 10 cibles sont **toutes US**, en contradiction avec « France d'abord » | `outbound/pr_pitches_2026-07-21.md` ; `outbound/pr_targets.csv` |
| Checkout affiche encore « Citeable Monitor » (brand mismatch au paiement) ; paiement effectif jamais testé | sprint 22/07 « chemin de l'argent » |
| `RESEND_API_KEY` / `EMAIL_FROM` à poser sur Vercel — tant que c'est absent, **aucun email transactionnel ne part** (rapports, relances) | `AGENT_RUNS.md` 21/07 16:10 |
| Rendement de qualification observé : 3 perdantes / 9 auditées (33 %) — sur un lot **mal sourcé** (biais gagnantes). Hypothèse : le sourcing hors réponses IA donnera ≥ 40 % | sprint 22/07 ; hypothèse marquée comme telle |

### Arbitrage du cycle

> **Canal prioritaire : outbound « audit-first » 1:1 sur des perdantes sourcées
> hors des réponses IA.** C'est le seul canal opérationnel cette semaine qui
> fabrique le déclencheur d'achat (le rival nommé, par écrit, avec le rapport en
> preuve) chez une vraie cible ICP — la presse n'a zéro contact vérifié et des
> cibles US hors stratégie, et le trafic organique part de zéro sur une base neuve.

Ce qui est explicitement **gelé** ce cycle :
- **Presse / PR** : pas d'envoi, pas de recherche de contacts US. Le canal ne
  revient que re-sourcé FR (presse DTC/retail française), et après premier signal
  outbound. Décision motivée : 0 « moment rival nommé » productible cette semaine
  par ce canal.
- **Programme agences** : gelé tant que le self-serve ne convertit pas
  (`GROWTH_ORGANIC.md` pilier 4).
- **Paid** : aucun accès CPA/dépense vérifiable (9 runs consécutifs le signalent),
  on ne pilote pas un canal aveugle.
- Seule activité inbound conservée : le **dogfooding hebdo automatisé**
  (ré-audit GetPick, suivi de la catégorie perçue) — déjà porté par
  `citeable-pr-inbound`, coût marginal nul.

### Objectifs chiffrés (23–29/07)

| # | Objectif | Cible | Mesure |
|---|---|---|---|
| 1 | Envoi du lot 1 (Lemahieu, Ekyog, Soeur) après checklist Charles | 3 emails partis avant le 25/07 | Instantly (campagne active, 3 sent) |
| 2 | Sourcing hors réponses IA + audits | 20 marques FR auditées | audits en base + fichier de lot |
| 3 | Perdantes qualifiées (≥ 1 question perdue, rival nommé) | ≥ 6 | verdicts d'audit |
| 4 | Drafts enrichis (contact décideur vérifié Hunter) soumis à Charles | ≥ 5 validés | CSV enrichi + validation écrite |
| 5 | Premier signal de conversion | ≥ 1 clic sur un lien de rapport OU 1 réponse | Instantly + `/api/funnel` (`report_viewed`, `email_captured`) |

**North star du cycle : 1 audit réclamé (email laissé) par un prospect réel.**
Ce serait le premier utilisateur non-Charles de l'histoire de la base.

### Préalables côté Charles (bloquants pour l'objectif 1)

- [x] Contradiction Instantly levée le 23/07 : Charles a désigné `419e33c5` comme
      campagne cible. 10 leads US retirés (backup
      `outbound/instantly_leads_backup_2026-07-23.json`), 3 leads doublons purgés
      de `802b9b61` (DELETE de la campagne refusé par l'API — « AI Sales Agent
      managed » ; coquille vide, à supprimer à la main dans le dashboard), 3 leads
      lot 1 chargés avec variables, vérifiés par relecture API
      (`outbound/instantly_apply_lot1_2026-07-23.py`).
- [x] Séquence vérifiée conforme : Subject = `{{sdr_subject}}`, Body =
      `{{sdr_body}}` + `{{unsubscribeLink}}` — signature EN du template retirée
      (double signature sinon, décision Charles 23/07).
- [x] `INSTANTLY_CAMPAIGN_ID` = `419e33c5` dans `outbound/keys.env`.
- [x] Boîte unique `charles@freegetpick.com` (trygetciteable désassignée —
      warmup jusqu'au ~31/07, décision Charles 23/07).
- [x] `RESEND_API_KEY` + `EMAIL_FROM` : vérifiés présents en Production sur
      Vercel (`vercel env ls`, 23/07) — le signalement du 21/07 était périmé,
      les variables ont été posées le 21/07 au soir.
- [ ] (Non bloquant envoi, bloquant vente) : renommer « Citeable Monitor » sur
      le checkout — session de fix lancée le 23/07 — ou basculer Stripe.
- [x] **Campagne `419e33c5` ACTIVÉE par Charles le 23/07** (dashboard Instantly).
      Vérifié par API : status=1, 3 leads actifs, boîte unique freegetpick.
      → Objectif 1 du cycle en cours d'exécution (envois étalés par Instantly,
      boîte en warmup, 3-5/jour max).

### Briefs du cycle

Brief gtm-outbound : voir §Briefs ci-dessous. Brief gtm-inbound : canal gelé,
pas de brief actif ce cycle.

### Signaux remontés à Charles / pmm-analyst

1. **`pr_targets.csv` 100 % US** contredit l'invariant « France d'abord » — à
   re-sourcer FR avant toute réactivation du canal presse (pmm-analyst : valider
   la liste FR cible).
2. **Contradiction d'état Instantly** (voir préalables) — risque d'envoyer le
   template par défaut ou de croire envoyé ce qui ne l'est pas.
3. Hypothèse de rendement 40 % sur sourcing hors-IA : à confirmer/infirmer avec
   le lot de 20 — si < 20 %, le coût d'audit par perdante double et il faudra
   revoir les catégories ciblées.

### Résultats du lot 2 (run du 23/07, journal complet dans `AGENT_RUNS.md`)

- 20 marques sourcées hors réponses IA (annuaires MIF, presse, marketplaces
  éthiques), 18 audits valides (2 invalidés par un bug d'inférence de catégorie —
  remonté à la squad produit).
- **5 perdantes / 18 = 28 %** — hypothèse « ≥ 40 % » **non confirmée**, mais
  au-dessus du seuil d'alerte de 20 %. Lecture : les annuaires éditorialisés
  sélectionnent des marques déjà bien documentées (10 gagnantes à 6/6). Piste
  cycle 2 : sources moins éditorialisées (exposants salons, levées seed).
- Perdantes : Nénés Paris (79), Bertille Isabeau (82), Le T-Shirt Propre (82),
  Aatise (70), Marilou Bio (71). Drafts : `outbound/drafts_2026-07-23.md`.
  Contacts décideurs vérifiés : Nénés Paris et Marilou Bio uniquement.
- 3 marques « perdue sans rival nommé » (Le Regard Français, Omie, Bleu de
  Chauffe) : pas de hook, hors séquence.

### Journal des décisions

- **2026-07-23 (soir) — Validation Charles sur les drafts** :
  - **Lot 1 (Lemahieu, Ekyog, Soeur) : VALIDÉ pour envoi** — sous réserve des
    préalables Instantly (checklist ci-dessus).
  - **Bertille Isabeau, Le T-Shirt Propre, Aatise : mises en réserve** — pas
    d'envoi sans contact décideur vérifié (ni formulaire ni LinkedIn pour
    l'instant).
  - **Nénés Paris, Marilou Bio : en attente de relecture** des drafts par
    Charles avant validation.
- **2026-07-23 — Cycle 1 : outbound audit-first prioritaire, presse et paid
  gelés.** Justification : seul canal capable de produire le « moment rival
  nommé » cette semaine ; les 3 premiers drafts existent déjà et le pipeline
  (audit anonyme → claim → lead) est vérifié E2E en prod (sprint 22/07).
- **2026-07-23 — Invalidé (hérité du 22/07, consigné ici pour mémoire GTM)** :
  sourcer les prospects dans les réponses IA. 94 % de mention sur le lot = des
  gagnantes. Règle permanente : sourcing hors réponses IA uniquement.

### Métriques à suivre (revue au 29/07)

| Métrique | Baseline 23/07 | Résultat 29/07 |
|---|---|---|
| Marques auditées (lot 2) | 0 | |
| Perdantes qualifiées | 3 (lot 1) | |
| Emails envoyés (validés Charles) | 0 | |
| Taux d'ouverture / réponse | — | |
| Clics rapport (`report_viewed` source outbound) | 0 | |
| Audits réclamés par de vrais prospects (`email_captured`) | 0 | |
| Ventes | 0 | |

---

## Cycles suivants (backlog de canaux, non actifs)

- **Presse DTC FR** : re-sourcer des cibles françaises avec emails vérifiés ;
  angle étude 21 marques + rebranding. Ne s'active qu'après premier signal outbound.
- **Étude v2 orientée FR** (pilier 3 `GROWTH_ORGANIC.md`) : rejouer l'étude sur
  des marques FR challengers — produit à la fois du contenu linkable et une liste
  de perdantes pour l'outbound. Candidat sérieux pour le cycle 2.
- **Angle B « gagnantes »** (« Monitor te prévient le jour où tu perds ta
  place ») : interdit de mélange avec le discours principal ; à tester seulement
  quand le discours A aura des chiffres.
- **Programme agences** : quand le self-serve convertit.
