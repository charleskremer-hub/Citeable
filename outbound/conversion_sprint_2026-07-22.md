# Sprint conversion — 2026-07-22

Objectif : fabriquer le déclencheur d'achat (ICP.md §3) à l'échelle. 9 marques de la
liste de chasse auditées en prod, verdicts réels, drafts prêts à envoyer.

## Les chiffres, sans maquillage

| Marque | Score | Cité | Rivaux sur les questions perdues |
|---|---|---|---|
| BonneGueule | 94 | 6/6 | — |
| Hast | 94 | 6/6 | — |
| Archiduchesse | 94 | 6/6 | — |
| Hopaal | 87 | 6/6 | — |
| Maison Standards | 84 | 6/6 | — |
| **Ekyog** | 82 | **5/6** | Girlfriend Collective, Pact, Universal Standard |
| **Soeur** | 82 | **5/6** | Clarks, Geox, Pikolinos |
| Balzac Paris | 76 | 6/6 | — |
| **Lemahieu** | 76 | **5/6** | ARMEDANGELS, DEDICATED, Nudie Jeans |

**Taux de mention global : 51/54 (94 %).** Vérifié sans effet d'écho (questions
BonneGueule inspectées : pures questions de catégorie). Ces marques gagnent vraiment.

## La leçon de sourcing — à ne plus jamais oublier

**La liste de chasse était biaisée par construction : elle venait des rivaux que
Gemini cite spontanément — donc des marques AI-visibles, donc des gagnantes.**
Le pitch « un rival est cité à ta place » ne peut convertir que des perdantes.

Règle corrigée (reportée dans `ICP.md` §6) :
1. Sourcer les prospects HORS des réponses IA : annuaires DTC FR, sélections presse
   (« marques françaises éco-responsables »), exposants de salons, catalogues
   marketplaces éthiques — puis les auditer.
2. Ne garder en cible outbound que les marques avec ≥ 1 question perdue.
3. Les gagnantes (≥ 85, 6/6) ne sont PAS des prospects douleur. Angle B éventuel,
   plus tard : « tu es la réponse de l'IA aujourd'hui — Monitor te prévient le jour
   où ça change ». Non prioritaire, ne pas mélanger les deux discours.

## Drafts prêts à envoyer (3 cibles qualifiées)

⚠️ Canal d'envoi : PAS depuis hello@getpick.ai / Resend (domaine transactionnel —
le cramer sur du cold ruinerait la délivrabilité des rapports). Boîte outbound
dédiée ou envoi manuel depuis une adresse perso.

Mécanique : le rapport est anonyme → le destinataire voit le verdict, et doit
laisser SON email pour déverrouiller le détail. Le prospect qui clique devient le
lead. Ne pas « réclamer » ces audits nous-mêmes.

---

### 1. Lemahieu — contact fondateur/direction (lemahieu.com)

Objet : **Sur cette question, l'IA recommande ARMEDANGELS — pas Lemahieu**

> Bonjour,
>
> J'ai fait tourner un audit de visibilité IA sur Lemahieu — le test : quand un
> acheteur demande à une IA quoi acheter, est-ce qu'elle vous cite ?
>
> Bonne nouvelle d'abord : sur 5 questions d'achat sur 6, vous êtes dans la
> réponse. Mais sur « ethical apparel brands similar to Patagonia, focused on
> casual urban streetwear », l'IA recommande ARMEDANGELS, DEDICATED et Nudie
> Jeans. Pas vous. C'est une question internationale — le segment exact où vous
> avez le plus à gagner.
>
> Le rapport complet est ici, avec les correctifs à copier-coller :
> https://www.getpick.ai/audit/355a807c-e6fb-42de-b003-e3a34d85dcf1
>
> Je suis Charles, je construis GetPick — l'agent qui fait ce travail chaque
> semaine pour 9 €/mois, ce qu'une agence GEO facture 2 000 €. Si le sujet vous
> parle, répondez-moi, c'est moi qui lis.
>
> Charles — GetPick

---

### 2. Ekyog — contact fondateur/direction (ekyog.com)

Objet : **L'IA recommande Girlfriend Collective à votre place sur une question précise**

> Bonjour,
>
> Test réel de ce matin : quand on demande à une IA « une marque de mode durable
> fiable, avec des tailles inclusives et des retours faciles », elle répond
> Girlfriend Collective, Pact et Universal Standard. Ekyog n'est pas dans la
> réponse — alors que vous êtes cités sur 5 des 6 autres questions d'achat testées.
>
> Le détail, avec ce qu'il faudrait publier pour reprendre cette question :
> https://www.getpick.ai/audit/471dae77-f031-489c-a2b3-1a28e62b9634
>
> Je suis Charles, fondateur de GetPick : l'agent qui surveille ça chaque semaine
> et écrit les correctifs, pour 9 €/mois. Une réponse à cet email suffit si vous
> voulez en parler.
>
> Charles — GetPick

---

### 3. Soeur — contact fondateur/direction (soeur.fr)

Objet : **« Quelles chaussures femme taillent bien ? » — l'IA répond Clarks, pas Soeur**

> Bonjour,
>
> J'ai testé la visibilité de Soeur dans les réponses des IA (le canal où vos
> clientes demandent déjà quoi acheter). Sur 6 questions d'achat, vous êtes
> recommandées 5 fois — solide. Mais sur « quelles marques de chaussures pour
> femme taillent parfaitement et sont confortables », l'IA répond Clarks, Geox et
> Pikolinos. Vos chaussures sont invisibles sur leur propre terrain.
>
> Le rapport, avec les actions concrètes :
> https://www.getpick.ai/audit/c4d97e91-665b-4d14-9088-92f951e43a11
>
> Charles, fondateur de GetPick — l'agent GEO des marques DTC, 9 €/mois là où une
> agence facture 2 000. Répondez-moi directement si ça vous intéresse.
>
> Charles — GetPick

---

## Vérifié pendant le sprint (funnel opérationnel de bout en bout)

- **Chemin du lead** : claim anonyme → email → `email_captured` : testé E2E en prod, OK.
- **Chemin de l'argent** : `checkout.nanocorp.so` répond (HTTP 200)… mais la page
  s'intitule **« Citeable Monitor - Secure Checkout »**. Brand mismatch au moment
  du paiement = tueur de conversion classique. → Action Charles : renommer les
  produits côté NanoCorp, ou basculer Stripe (étape 5 du plan de migration).
  Le paiement effectif (la carte passe-t-elle ?) reste NON testé — personne ne
  peut le vérifier sans payer.

## Exécution (22/07, soir) — boucle fermée

1. **Enrichissement Hunter : 3/3, contacts décideurs nominatifs** (dont une
   cofondatrice pour Soeur). Zéro email générique, zéro pattern deviné.
   Fichier : `sdr_conversion_2026-07-22_enriched.csv` — **volontairement non
   commité** (données personnelles). Greetings personnalisés au prénom.
2. **Leads chargés dans Instantly** par Charles, campagne
   `802b9b61-b1ca-4fc6-9fb8-aefe90d2acf7` (« [AI SDR] … Fully Personalized »).
   Campagne EN PAUSE — l'activation reste le geste de Charles.
3. Pannes rencontrées et corrigées en route : clé Hunter morte (régénérée),
   clé Instantly v1→v2 (régénérée), `INSTANTLY_CAMPAIGN_ID` qui valait
   littéralement `...` dans `keys.env` (placeholder jamais rempli — à remplacer
   par l'UUID ci-dessus, sinon le cron `citeable-sdr-weekly` de lundi recassera).

### Avant activation (checklist Charles)
- [ ] Séquence de la campagne : Subject = `{{sdr_subject}}`, Body = `{{sdr_body}}`
      (sinon c'est le template par défaut qui partirait, pas nos drafts).
- [ ] `INSTANTLY_CAMPAIGN_ID` corrigé dans `outbound/keys.env`.
- [ ] Boîte d'envoi : `charles@freegetpick.com` (warmup depuis le 20/07, score 100).

## Prochaine itération du sprint

1. Sourcer 20 marques hors réponses IA (annuaires/presse/salons) → auditer → ne
   garder que les perdantes → drafts → même pipeline.
2. Mesurer : ouvertures/réponses des 3 premiers envois avant d'industrialiser.
