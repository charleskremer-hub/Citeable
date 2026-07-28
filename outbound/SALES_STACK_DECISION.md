# Décision — stack de vente

**28 juillet 2026**

> **Note reconstituée.** La rédaction d'origine n'a jamais touché le disque : elle
> n'existe ni dans l'arbre de travail, ni dans l'historique d'aucune branche, ni
> dans les worktrees. Ce texte a été réécrit à partir du lot de code qu'il
> commandait et des faits établis dans `outbound/GTM_RUN_2026-07-28.md`. Les
> décisions techniques ci-dessous sont donc exactes — c'est ce qui a été codé —
> mais si un arbitrage d'origine était différent, c'est cette note qu'il faut
> corriger, pas le code.

---

## Le constat qui déclenche tout

Au soir du 28/07, la machine de vente produit trois nombres et aucune décision :

| | |
|---|---|
| Emails envoyés (cycle 1) | 5 |
| Réponses | 0 |
| `report_viewed` attribuables à un prospect | 0 prouvé |

Le zéro réponse à n = 5 n'est pas une information sur le message : à 8 % de taux
de réponse attendu, P(0 sur 5) ≈ 66 %. C'est une information sur le **protocole**.
Et le protocole ne pourra pas être corrigé tant que quatre choses restent vraies :

1. **La north star ne mesure rien.** `report_viewed` était enregistré côté
   serveur à chaque rendu de `/audit/<id>` — donc à chaque F5, à chaque passage
   de crawler, et à chacun des sondages de `AuditPoller` toutes les 3 secondes.
   Le 27/07, nos propres vérifications de liens ont injecté **+10 vues sur un
   total de 59**. Pire : `userAgent` et `referrer` étaient `None` sur 100 % des
   lignes, parce que la page serveur n'appelait jamais `clientContext()`. Trier
   les bots était impossible — pas mal réglé, **jamais collecté**.
2. **Instantly est un angle mort.** Ouvertures et clics figuraient au tableau de
   bord GTM comme « non mesuré — angle mort assumé ». La seule métrique jugée
   fiable, « réponses », se relève à la main dans l'interface. Rien ne relie
   « cet email est parti » à « ce rapport a été ouvert ».
3. **La prospection n'a pas de couche de conformité.** Les adresses viennent de
   sources publiques (annuaire Cosmébio, pages contact), mais rien n'enregistre
   *laquelle*, ni quand, ni à quel titre. Une demande d'accès ou une plainte se
   traiterait à la main, dans des CSV.
4. **Aucune mesure d'audience.** `HomeClient.tsx` appelle
   `window.posthog?.capture(...)` à **sept endroits**, `FunnelCheckoutLink` pose
   des attributs `data-ph-capture-attribute-*` sur le clic le plus cher du site —
   et depuis la sortie de l'infrastructure d'origine, plus aucun script
   d'analytics n'est chargé. Les sept capteurs sont écrits, corrects, et ne
   remontent nulle part. L'optionnel `?.` les fait échouer en silence.

**Décision cadre : aucun cycle 2 ne part avant que ces quatre points soient
fermés.** Augmenter le volume d'envoi sur un instrument cassé ne produit pas plus
d'information, seulement plus de bruit — et, sur les points 3, un risque qui
grandit avec le volume.

---

## 1. Registre de prospection — migration `001_prospection_compliance`

**Décision.** Trois tables, une seule question à laquelle savoir répondre : *d'où
vient cette adresse, à quel titre l'avons-nous contactée, et que s'est-il passé
ensuite ?*

- `prospection_contacts` — registre : source de la donnée (URL publique), date de
  collecte, base légale, statut, échéance de purge.
- `prospection_opt_outs` — oppositions (email ou domaine), interrogées avant tout
  envoi.
- `instantly_webhook_events` — journal brut des envois et des retours, dédupliqué.

**Trois choix qui méritent d'être justifiés.**

- **Rétention tenue par trigger, jamais à la main.** 3 ans après le dernier
  contact (recommandation CNIL, prospection B2B), recalculés à chaque `UPDATE`.
  Une échéance saisie à la main est une échéance qu'on oublie.
- **Les oppositions n'expirent jamais.** Une opposition qui se purge est une
  opposition qu'on va violer au sourcing suivant. On garde l'adresse pour ne plus
  jamais écrire, pas pour écrire.
- **Le SQL est écrit une seule fois.** Il vit dans `src/lib/prospection-schema.ts`,
  d'où `scripts/emit-migration.mjs` régénère le `.sql`, et
  `scripts/prospection-schema.test.ts` échoue si les deux divergent. La raison :
  le runtime doit pouvoir rejouer ce schéma sans lire le disque
  (`ensureProspectionSchema()`), exactement comme `ensureAuditSchema()` le fait
  déjà. Deux copies manuscrites auraient dérivé en trois semaines.

**Écarté.** Étendre `ensureAuditSchema()` et s'arrêter là. Une couche de
conformité doit pouvoir répondre à « depuis quand » — donc être datée, donc être
une migration numérotée, journalisée dans `schema_migrations`.

**Duplication assumée, et temporaire.** `recordOptOut()` écrit dans la table neuve
**et** dans `audit_email_suppression_list`, que les chemins d'envoi existants
(relances J+1/J+3, monitoring hebdo) interrogent déjà. Tant qu'ils n'ont pas migré
vers `prospection_is_suppressed()`, n'écrire que dans la table neuve laisserait
partir un email à quelqu'un qui vient de se désinscrire. C'est le prix de la
sécurité, et c'est la prochaine dette à rembourser.

## 2. Le capteur `report_viewed`

**Décision.** L'événement quitte le serveur et part du navigateur, une fois par
session, filtré.

- **Événement client.** Il n'existe donc que si une page a réellement été peinte,
  et il porte enfin un `User-Agent` et un `referrer` réels.
- **Dédup par session.** Clé `report_viewed:<auditId>:<sessionId>`, absorbée par
  le `ON CONFLICT (dedupe_key) DO NOTHING` que `recordFunnelEvent` supportait
  déjà depuis des semaines sans que personne s'en serve. F5 et retour arrière ne
  comptent plus.
- **Filtre bot.** Sur le User-Agent, avec un garde-fou : le mot « bot » est
  cherché en **token entier**, pas en sous-chaîne, sinon les téléphones CUBOT
  (`CUBOT_X30` dans leur UA) seraient jetés. Un UA **vide** est refusé : un vrai
  navigateur en envoie toujours un.
- **Exclusion du trafic interne.** Deux mécanismes, du plus sûr au plus faillible :
  le cookie `gp_internal=1` (déclaratif, zéro faux positif, survit à une IP
  dynamique) puis la liste `INTERNAL_IPS`. Le même cookie coupe aussi PostHog —
  un seul geste nettoie les deux mesures, ce qui les empêche de diverger.
- **Refus silencieux, jamais un 4xx.** Un crawler qui reçoit une erreur réessaie.
  On répond 200 avec `skipped` et `skipped_reason`, ce qui rend le débruitage
  lisible dans les logs au lieu d'un CSV tenu à la main comme le 28/07.

**Ce qui n'est PAS stocké : l'IP.** Seulement `sha256(sel + ip)` tronqué à 16
caractères, et **rien du tout** tant que `IP_HASH_SALT` n'est pas défini — un
condensat non salé d'une IPv4 s'inverse par force brute en quelques minutes, ce
serait stocker l'IP en prétendant le contraire.

**Conséquence à assumer : les compteurs vont baisser.** C'est le but. Le chiffre
d'après le correctif et celui d'avant ne sont pas comparables, et toute lecture de
tendance qui enjambe le 28/07 est fausse.

## 3. Récepteur de webhooks Instantly v2 → Neon

**Décision.** `POST /api/webhooks/instantly` reçoit les événements v2 et les
persiste dans Neon. Les désinscriptions, bounces, « pas intéressé » et « mauvaise
personne » créent une opposition **immédiatement**.

**Deux trous dans la documentation Instantly, comblés ici.**

- **Aucun identifiant d'événement.** Ni `id`, ni `delivery_id`. Un rejeu sur
  timeout serait invisible et compterait deux envois pour un. On fabrique donc une
  clé déterministe : `sha256(type | campagne | destinataire | horodatage | email_id
  | step)`. Deux livraisons du même événement produisent la même clé ; deux
  événements distincts n'en produisent jamais la même. C'est ce qui rend le
  compteur d'envois honnête.
- **Aucune signature ni secret documenté.** On pose donc le nôtre dans l'URL
  enregistrée côté Instantly (`?key=…`), avec un header `x-instantly-secret`
  accepté en alternative. Comparaison à temps constant. **Sans
  `INSTANTLY_WEBHOOK_SECRET` défini, la route répond 503** : un récepteur ouvert
  accepterait de n'importe qui des désinscriptions et des bounces, donc laisserait
  un tiers pourrir notre registre d'oppositions.

**Minimisation.** `email_html`, `email_text`, `reply_html` et `reply_text` sont
jetés avant écriture. On garde `reply_text_snippet`, qui suffit à décider s'il
faut ouvrir la réponse dans Instantly. Sur `reply_received`, le corps complet,
c'est ce qu'un prospect nous a écrit — ça n'a rien à faire dans une base
d'analytics.

**Le registre n'est jamais créé par un webhook, seulement mis à jour.** Une ligne
née d'un webhook n'aurait pas de provenance — exactement la ligne qu'on serait
incapable de justifier le jour où on nous la demande. Les lignes naissent au
sourcing.

**`email_bounced` vaut opposition.** Instantly ne distingue pas hard et soft
bounce dans le webhook, et re-solliciter une adresse qui rebondit abîme la
délivrabilité des deux domaines de chauffe (`freegetpick.com`,
`trygetciteable.com`). On préfère perdre un contact récupérable que brûler un
domaine.

## 4. Page politique de prospection — `/prospection`

**Décision.** Une page publique, bilingue, liée depuis le pied de page et destinée
au pied de chaque email sortant.

Ce n'est pas de la conformité de façade : la base légale retenue est l'**intérêt
légitime** (art. 6.1.f), et cette base suppose une mise en balance — notre intérêt
à présenter un constat vérifiable contre le droit de la personne à ne pas être
sollicitée. Ce sont cette page, le lien de désinscription et le traitement
immédiat de l'opposition qui font pencher la balance. Sans elles, la base légale
est une affirmation, pas un raisonnement.

**Règle de rédaction : la page ne promet que ce que le code fait.** Elle dit que
la source exacte de chaque adresse est enregistrée — c'est
`prospection_contacts.source_url`. Elle dit que le corps des réponses n'est pas
conservé — c'est `minimizePayload()`. Elle dit que l'opposition est vérifiée avant
chaque envoi — c'est `prospection_is_suppressed()`. Rien n'y est écrit qui ne soit
adossé à une ligne de code.

**⚠️ Point bloquant avant mise en ligne.** La mention du responsable de traitement
(raison sociale, forme juridique, adresse du siège) est **obligatoire** et
n'existe nulle part dans le dépôt. `LEGAL_ENTITY.postalAddress` vaut `null` et
n'affiche rien plutôt qu'un placeholder. C'est le seul élément de la page qui ne
peut pas être déduit du code — à compléter à la main.

## 5. PostHog Cloud EU

**Décision.** PostHog, région **EU**, chargé via un relais sur notre propre
domaine (`/gp-relay` → `eu.i.posthog.com`).

- **EU, pas US.** Prospects et clients européens, prospection encadrée par le
  RGPD : passer par l'instance US ajouterait un transfert hors UE à documenter
  pour zéro gain.
- **Relais first-party.** Un seul domaine à déclarer, aucune requête tierce vers
  un domaine d'analytics. Le chemin n'est ni `/ingest` ni `/e` — ces deux-là sont
  dans toutes les listes de filtrage publiques, les proxifier ne sert à rien.
- **Aucune dépendance npm.** Le chargeur officiel `array.js` pose `window.posthog`,
  qui est **exactement** le contrat que les sept sites d'appel existants utilisent
  déjà et que déclare `posthog.d.ts`. Passer par le paquet `posthog-js` aurait
  imposé soit de réécrire les sept appelants, soit un cast sur `window`. Zéro
  dépendance pour le même résultat, et les sept capteurs se rallument sans qu'une
  seule ligne d'appelant bouge.
- **`person_profiles: "identified_only"`.** On mesure un funnel, on ne constitue
  pas une base de profils.

---

## Ce qu'il reste à faire, et par qui

**Variables d'environnement (Vercel, projet `kinze/getpick2`) — Charles**

| Variable | Sans elle |
|---|---|
| `INSTANTLY_WEBHOOK_SECRET` | la route webhook répond **503** — rien n'est reçu |
| `NEXT_PUBLIC_POSTHOG_KEY` | aucun script chargé (état normal en preview, pas une panne) |
| `IP_HASH_SALT` | `ipHash` reste `null` — dégradation propre, volontaire |
| `INTERNAL_IPS` | seul le cookie `gp_internal` filtre le trafic interne |

**Gestes ponctuels — Charles**

1. Appliquer la migration : `DATABASE_URL="…" npm run migrate`
   (`npm run migrate:dry` liste sans écrire). Impossible depuis la session Cowork :
   `outbound/keys.env` contient `DATABASE_URL="[SENSITIVE]"`, Vercel masque cette
   variable au `env pull`.
2. Enregistrer le webhook côté Instantly sur
   `https://www.getpick.ai/api/webhooks/instantly?key=<INSTANTLY_WEBHOOK_SECRET>`,
   avec au minimum : `email_sent`, `email_opened`, `link_clicked`,
   `reply_received`, `email_bounced`, `lead_unsubscribed`.
   Vérification : `GET` sur la même URL renvoie `{"configured": true}` sans
   révéler le secret.
3. Poser `gp_internal=1` sur nos navigateurs et sur les runners d'agents :
   `document.cookie = "gp_internal=1; path=/; max-age=31536000"`.
4. Compléter le responsable de traitement dans `src/app/prospection/page.tsx`.
5. Confirmer l'adresse de contact de la page : `charles@freegetpick.com` a été
   retenue parce que c'est un domaine d'envoi actif et vérifiable, pas parce que
   c'est un arbitrage connu.

**Dette identifiée, non traitée dans ce lot**

- Faire migrer les chemins d'envoi existants vers `prospection_is_suppressed()`,
  et retirer la double écriture de `recordOptOut()`.
- Alimenter `prospection_contacts` au sourcing (`outbound/sdr_agent.py`) : le
  registre est en place mais vide, donc les mises à jour de statut par webhook
  n'ont encore rien à mettre à jour.
- `outbound/sdr_agent.py:131-149` — `qualify()` exige ratio < 0,75 **et**
  score < 75, donc aurait jeté les 3 perdantes du cycle 1 (5/6, scores 76–82).
  Sans correctif, automatiser la qualification au cycle 2 sous-estimerait
  structurellement le taux de perdantes. Hors périmètre de ce lot, à traiter avant
  le cycle 2.

---

## Ce que cette note ne prétend pas

Elle ne dit pas que le message est bon : à n = 5, il n'est ni validé ni invalidé.
Elle ne dit pas que le cycle 2 convertira. Elle dit une chose plus étroite et plus
solide : **jusqu'ici, un résultat nul n'était pas interprétable, parce que
l'instrument ne distinguait pas un prospect d'un crawler ni un envoi d'un silence.
Après ce lot, il le distingue.** C'est la seule chose que du code pouvait régler.
