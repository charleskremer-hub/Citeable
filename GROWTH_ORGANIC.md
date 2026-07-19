# Citeable — Stratégie de croissance organique

Établie le 2026-07-19. Inspirée de ce que font réellement les concurrents (Peec.ai,
Profound, Otterly.ai, Ahrefs Brand Radar, Scrunch, Athena HQ), filtrée pour notre
ICP (marques DTC / e-commerce moyennes) et notre value prop (tout-en-un simple).

Tenue à jour par `citeable-product-agent`. Voir aussi `PRODUCT_BACKLOG.md`.

---

## Le constat qui fonde la stratégie

On a audité Citeable avec Citeable (audit `a7984710`, tier Monitor, 19/07/2026).
Résultat brut :

- **Score 61/100. Gemini cite Citeable sur 9 des 12 questions d'achat testées.**
  La visibilité IA existe déjà, elle n'est pas à créer.
- **Mais elle est mal ciblée.** Sentiment relevé : *« presented as an intuitive
  no-code solution for local businesses »*. Les questions générées pour nous
  parlaient de *« local restaurant or food brand »*. Les IA nous rangent dans le
  SEO local — pas dans l'e-commerce DTC, qui est l'ICP retenu.
- **Et le socle technique était absent** : `llms.txt` en 404, zéro JSON-LD sur la
  home, `robots.txt` réduit au boilerplate Cloudflare sans aucune directive ni
  référence au sitemap. Un outil qui vend de la visibilité IA échouait à ses
  propres checks.

**Conclusion : le problème organique n'est pas « se faire citer », c'est « se faire
citer dans la bonne catégorie ».** C'est exactement ce que notre produit mesure —
d'où la stratégie ci-dessous, dont le pilier 1 est le dogfooding.

---

## Pilier 1 — Dogfooding : être le cas d'école de son propre produit

**Inspiration** : aucun concurrent ne le fait de façon crédible et publique. C'est
la position la plus défendable qu'on puisse prendre, et la moins copiable : un
outil GEO qui publie son propre score, ses propres échecs et sa progression.

**Pourquoi ça marche pour nous** : c'est mesurable avec notre produit, ça produit
du contenu en continu, et ça règle un vrai problème (le mauvais cadrage catégorie).

**Fait le 19/07** :
- `public/llms.txt` — déclare ce qu'est Citeable, **pour qui** (DTC/e-commerce,
  explicitement « pas un outil de SEO local »), le pricing, et les questions
  d'achat auxquelles on répond.
- `src/app/robots.ts` — autorise explicitement GPTBot, OAI-SearchBot,
  ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, CCBot + déclare le
  sitemap.
- JSON-LD `SoftwareApplication` dans `layout.tsx` avec `audienceType`
  = « Direct-to-consumer and e-commerce brands » et les 3 offres.

**Suite** : ré-auditer Citeable chaque semaine et suivre deux métriques —
le score, et surtout **la catégorie dans laquelle les IA nous rangent**. Objectif :
passer de « local business tool » à « AI visibility for DTC brands ».

---

## Pilier 2 — Audit sans friction (produit = acquisition)

**Inspiration** : Otterly publie des outils gratuits sans inscription (AI keyword
research, Query Fan Out, GEO Content Check, AI Crawler Simulation). Ahrefs a un
AI Visibility Checker gratuit et un modèle « zéro setup » où l'on interroge
n'importe quelle marque instantanément.

**Notre écart** : notre audit gratuit demande un email **avant** de montrer quoi
que ce soit. C'est très probablement la cause du problème que l'agent NanoCorp
cherche à diagnostiquer (« le trafic pub n'envoie pas le formulaire »).

**À faire** : montrer un premier résultat réel (le verdict + le concurrent cité à
notre place) **avant** de demander l'email, et ne demander l'email que pour
débloquer le détail. Le signal est notre meilleur argument commercial : il faut
le donner, pas le cacher derrière un formulaire.

Effort M. **C'est la priorité n°1 du pilier acquisition.**

**Fait le 19/07** :
- `validateAuditInputAllowAnonymous()` dans `audit-engine.ts` — l'email devient
  facultatif pour LANCER un audit. Un identifiant synthétique
  (`anon-<uuid>@anonymous.citeable.invalid`) satisfait le schéma ; son domaine est
  dans la liste de suppression, donc **aucun email ne part vers un audit anonyme**.
- `/api/capture-email` — n'insère plus de lead quand l'audit est anonyme, et marque
  `raw_results.anonymous = true`. Le chemin avec email est **inchangé** (rétro-compatible).
- `/api/claim-audit` (nouveau) — rattache un email à un audit anonyme, crée le lead,
  émet l'event funnel `email_captured`. Idempotent : un audit déjà nominatif n'est
  jamais réattribué.
- `ClaimReportGate.tsx` (nouveau) — la porte affichée sur le rapport anonyme.
- `page.tsx` — `reportLocked` : le verdict reste visible, le bloc concurrents est
  échangé contre l'email.
- `HomeClient.tsx` — champ email marqué « (optionnel) », plus de `required`.

**Garde-fou coût** : le quota `checkFreeAuditQuota` limite déjà par **domaine audité**
en plus de l'email. La limitation par domaine subsiste donc en anonyme, et le cache
`findFreshFreeGeminiAudit` évite de relancer Gemini sur une marque déjà auditée.

**À surveiller après déploiement** : le volume d'audits anonymes (coût Gemini) et le
taux de réclamation (part des audits anonymes qui donnent un email). Si le taux de
réclamation est faible, durcir la porte ; s'il est élevé, l'assouplir encore.

---

## Pilier 3 — Étude de données originales

**Inspiration** : Ahrefs a fait parler de lui avec une étude sur 75 000 marques
(les mentions YouTube comme signal le plus corrélé à la visibilité IA). Profound
publie ses volumes de prompts. C'est le format qui génère des backlinks, des
reprises presse — et, surtout pour nous, **des citations par les IA elles-mêmes**,
ce qui alimente le pilier 1.

**Notre actif** : on a déjà audité une vingtaine de marques DTC réelles avec de
vrais appels Gemini. Extraits : Hedley & Bennett 31, Necessaire 35, Allbirds 46,
Bubble 47, Cuts 50, Topicals 51, Spot & Tango 55, De Soi 57, Versed 63,
Cometeer 66, Tower 28 / Arrae / Dagne Dover 69, Recess 74, Our Place 75,
Ridge Wallet 81, Moon Juice 85, Brooklinen 88.

**Angle** : « Nous avons demandé à ChatGPT et Gemini quoi acheter dans 20
catégories DTC. Voici les marques que l'IA recommande — et celles qu'elle ignore. »
Données réelles, vérifiables, avec la méthodologie publiée.

Effort M. Double effet : contenu linkable **et** matière première pour être cité.

---

## Pilier 4 — Programme agences / partenaires

**Inspiration** : c'est universel dans la catégorie. Peec a un pricing agence
dédié et des « Instant Pitch Projects », Otterly un Agency Partner (+50 % de
prompts, workspaces de pitch, Looker en marque blanche), Rankscale un plan
« Agency's Choice » à 385 $ avec commissions à vie et annuaire public, Athena un
Pitch Workspace. Les agences sont un canal de distribution majeur, pas un segment
secondaire.

**Pour nous** : une agence qui gère 20 marques DTC est un multiplicateur. Notre
audit est un outil de pitch idéal — elle le fait tourner sur un prospect et arrive
avec « l'IA recommande votre concurrent ».

Effort L. **À garder pour quand le self-serve convertit** — pas avant, sinon on
construit un programme partenaire pour un produit qui ne vend pas encore.

---

## Ce qu'on ne fait pas

- **Multiplier les moteurs suivis.** Les volumes publiés par Ahrefs (371 M de
  prompts indexés) donnent AI Overviews à 281,9 M contre 14,6 M pour Perplexity et
  14,5 M pour ChatGPT. ChatGPT + Google AI suffisent pour notre ICP ; ajouter
  9 moteurs serait de la complexité pure.
- **Du contenu SEO générique sur « qu'est-ce que le GEO ».** Le sujet est déjà
  saturé par des acteurs qui ont 100× notre autorité de domaine.
- **Un blog publié à la fréquence.** Mieux vaut trois contenus qui s'appuient sur
  nos données propriétaires que trente qui paraphrasent la concurrence.

---

## Ordre d'exécution

1. **Socle GEO** (pilier 1) — fait le 19/07, à déployer.
2. **Audit sans friction** (pilier 2) — priorité suivante, c'est le goulot
   d'étranglement de l'acquisition.
3. **Étude 20 marques DTC** (pilier 3) — dès que le pilier 2 est en ligne, pour
   que le trafic généré tombe sur un funnel qui convertit.
4. **Programme agences** (pilier 4) — quand le self-serve convertit.
