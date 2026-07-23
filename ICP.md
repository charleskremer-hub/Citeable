# GetPick — ICP (Ideal Customer Profile)

Établi le 2026-07-21, **recentré le même jour après lecture de la base de production**
(Neon `getpick`). Dérivé de `POSITIONING_V2.md`, de l'étude 21 marques et — pour la
première fois — des audits réels. Ce document est la référence de priorisation :
`PRODUCT_BACKLOG.md` s'y adosse, et tout item qui ne sert pas cet ICP est un item à
écarter, pas un item à repousser.

---

## 0. Ce que la base dit, et qui change l'ICP

Sept audits, tous du 21/07, **tous des tests de Charles** — aucun utilisateur réel.
Marques testées : Away, Vuori, Le Slip Français, Asphalte, Loom Paris, Sezane,
GetPick. Trois faits en sortent, et ils commandent tout le reste :

1. **Le produit ne montrait jamais de douleur.** `ai_visibility` = 100/100 sur
   7 audits sur 7, marque citée sur **21 questions sur 21**. Cause : le générateur
   recopiait le pitch de la marque (« hardshell carry-on with built-in USB chargers »
   pour Away, « coastal California aesthetic » pour Vuori). Un fondateur qui lançait
   l'audit gratuit apprenait qu'il est parfaitement visible — donc n'avait aucune
   raison de payer. Corrigé le 21/07.
2. **Les marques établies n'ont pas le problème.** Away, Vuori, Sezane sortent en
   tête de leur catégorie sans nous. Les cibler, c'est vendre un antidouleur à
   quelqu'un qui n'a pas mal.
3. **Le tissu concurrentiel français est dense et nommable.** Sur Asphalte et Loom,
   le moteur cite spontanément Hopaal, BonneGueule, Maison Standards, Hast, Arket —
   des rivaux directs, comparables, à taille de challenger. C'est exactement le
   terrain où « voici qui est recommandé à ta place » a du sens.

## 1. La définition (recentrée)

> **Le fondateur — ou le head of growth — d'une marque DTC / e-commerce
> CHALLENGER de 1 à 50 personnes, en France d'abord, qui vend dans une catégorie
> encombrée où six à dix marques comparables se disputent la même réponse, et qui
> n'est pas encore le nom que l'IA cite en premier.**

Trois resserrements par rapport à la version du matin, chacun payé par une donnée :

- **Challenger, pas établi.** Le critère d'entrée n'est pas la taille, c'est de
  *perdre*. Une marque déjà citée n'a rien à acheter.
- **France d'abord.** Le seul marché où nos audits montrent des sets concurrentiels
  denses et nommables, où 9 € n'a pas d'équivalent local, et où l'outbound peut
  nommer un rival que le fondateur connaît personnellement. Les US restent ouverts
  mais ne sont plus le front prioritaire : on y affronte Peec et Profound avec zéro
  notoriété et sans avantage de langue.
- **Catégorie encombrée.** S'il n'y a pas six rivaux crédibles, il n'y a pas de
  rival à nommer, donc pas de produit.

Une seule personne décide, teste et paie. Pas de comité d'achat, pas de POC. C'est
ce qui rend un prix à 9 € viable.

## 2. Critères qualifiants (vérifiables, pas déclaratifs)

Un prospect est dans l'ICP si les cinq sont vrais :

| # | Critère | Comment on le vérifie |
|---|---|---|
| 1 | Vend un **produit physique en direct** au consommateur | Présence d'un panier / Shopify / WooCommerce sur le domaine |
| 2 | Sa catégorie est **comparative** — l'acheteur hésite entre marques | Une question « meilleure marque de X » a du sens et renvoie plusieurs noms |
| 3 | **1 à 50 personnes** | LinkedIn, page équipe, mentions légales |
| 4 | **Pas d'agence GEO/SEO en cours** ni d'analyste dédié | Absence d'équipe growth affichée ; retainer agence = hors cible prix |
| 5 | **Un rival est nommé à sa place** par l'IA | Notre propre audit gratuit — c'est le critère décisif |
| 6 | **Six rivaux crédibles ou plus** dans sa catégorie | Le set concurrentiel que l'audit remonte spontanément |

Le critère 5 est le seul qui compte vraiment : c'est à la fois la qualification et
l'argument de vente. Les autres prédisent seulement qu'il sera vrai.

**Critère de sortie, ajouté le 21/07 :** une marque qui obtient plus de ~80/100 dès
l'audit gratuit n'est pas un prospect, c'est une référence. On ne la travaille pas
en vente — on lui demande un témoignage ou on l'ignore.

## 3. Le déclencheur d'achat

Il n'y a **pas** de douleur latente exploitable. Un fondateur DTC ne se réveille
pas en se demandant s'il est cité par ChatGPT — l'étude montre que 14 marques sur
21 avaient un rival nommé à leur place **sans le savoir**.

Le déclencheur doit donc être **fabriqué par nous** : le moment où il voit, écrit,
le nom du concurrent que l'IA recommande dans sa catégorie. C'est la seule chose
qui transforme un curieux en acheteur, et c'est exactement ce que produisent
l'audit gratuit et l'outbound.

**Conséquence de priorisation :** toute feature qui rend ce moment plus rapide,
plus crédible ou plus précis prime sur toute feature qui ajoute de la donnée après
l'achat.

## 4. Le job à faire

Ce qu'il achète n'est pas de la mesure, c'est un résultat délégué :

1. **Dis-moi si je perds des ventes** au profit d'un rival dans les réponses IA.
2. **Dis-moi lequel**, nommément.
3. **Écris ce que je dois publier** pour reprendre la place — pas un conseil, le contenu.
4. **Recommence chaque semaine** sans que j'aie à y penser.

Il ne veut ni dashboard, ni crédits, ni onze moteurs. Sa mesure de succès est
« mon nom sort dans la réponse », pas « mon score a gagné 4 points ».

## 5. L'anti-ICP — qui on refuse servir, et pourquoi c'est une décision

Ces segments peuvent utiliser l'outil ; on ne construit pas pour eux, on ne
communique pas pour eux, et on n'accepte pas de dette produit à cause d'eux.

- **Le commerce local / profession libérale** (plombier, dentiste, coach, avocat).
  C'est le marché de `citeable.eu`. C'est surtout la catégorie dans laquelle les
  IA nous rangeaient à tort (`GROWTH_ORGANIC.md` : *« presented as an intuitive
  no-code solution for local businesses »*). Servir ce segment renforce
  activement une mauvaise catégorisation qu'on paie déjà cher.
- **Le créateur / influenceur.** Pas de catégorie d'achat comparative, pas de
  concurrent nommable au sens commercial. Le mécanisme de valeur ne s'applique pas.
- **Le mid-market avec équipe marketing** (> 50 personnes, analyste dédié). C'est
  le terrain de Peec et Profound, qui ont onze moteurs et des millions levés. On
  perd cette guerre de features et notre prix devient un signal de faiblesse.
- **Les marques de service pur B2B / SaaS.** L'acheteur ne pose pas de question
  d'achat comparative de la même façon ; nos jeux de questions sont calibrés produit.

✅ **Tranché le 21/07 — un seul segment servi.** Le code servait
`small_brand_ecommerce`, `local_independent` et `creator_influencer`. Les deux
derniers sont supprimés : `detectIcpSegment()` renvoie désormais toujours la marque
DTC, et leurs jeux de questions (63 lignes) sont retirés. Deux raisons de trancher
plutôt que de geler : la base ne contient **aucun client**, donc le risque de revenu
invoqué n'existe pas ; et le détecteur classait **GetPick lui-même** en
`local_independent`, ce qui lui valait des recommandations Google Business Profile
et Doctolib. Un classificateur qui se trompe sur nous se trompe sur nos clients.

## 6. Où il se trouve — corrigé le 22/07 après test en réel

**La version d'hier était fausse, et le sprint du 22/07 l'a prouvée** : sourcer les
prospects parmi « les rivaux que l'IA cite » sélectionne par construction des
marques AI-visibles — des GAGNANTES. Les 9 marques de cette liste auditées en prod :
taux de mention 51/54 (94 %), six à 6/6. Un antidouleur ne se vend pas à qui n'a
pas mal.

Règle corrigée :
1. **Sourcer HORS des réponses IA** : annuaires DTC FR, sélections presse, salons,
   marketplaces éthiques — puis auditer chaque marque.
2. **Ne garder en cible que les perdantes** (≥ 1 question d'achat perdue avec un
   rival nommé). Sur le premier lot : Lemahieu, Ekyog, Soeur — 3 sur 9.
3. Les gagnantes ne sont pas des prospects douleur ; angle B éventuel (« Monitor te
   prévient le jour où tu perds ta place »), à ne pas mélanger au discours principal.

Voir `outbound/conversion_sprint_2026-07-22.md` pour les verdicts et les drafts.

- Catégories prioritaires : mode éco-responsable, sous-vêtement/basique, soin,
  bagagerie, alimentation — celles où l'audit remonte six rivaux ou plus.
- Signal d'intention : refonte de site, levée, ou prise de parole sur l'IA.
- Canaux : outbound sur audit gratuit (le rapport EST l'accroche), presse DTC FR,
  reprise de l'étude. Le programme agences reste gelé tant que le self-serve ne
  convertit pas.

## 7. Ce que l'ICP dit sur le prix

Face à l'alternative de référence — l'**agence GEO à 2 000–20 000 €/mois** — un
prix de 9 € n'a pas besoin d'argumentaire. Face aux outils de monitoring à
99–400 $/mois, il en aurait un (« pourquoi si peu ? »), et c'est précisément
pourquoi la catégorie affichée doit rester « agent GEO » et jamais « outil de
visibilité IA ».

Corollaire : **aucune unité de compte.** Pas de crédits, pas de prompts vendus à
l'unité, pas de calculateur. Tout le marché a dû en construire un ; c'est l'aveu
que son modèle est trop complexe pour notre acheteur.

## 8. Ce que cet ICP a invalidé dans le produit — et ce qui a été fait

Constats du 2026-07-21, tous reportés au backlog :

1. **Les jeux de questions contenaient le nom de la marque** — alors que le rapport,
   la FAQ et l'étude promettent l'inverse. **Corrigé.**
2. **Les questions générées par l'IA recopiaient le pitch de la marque**, ce qui
   garantissait mécaniquement une mention : 21/21 en base. **Corrigé** (génération
   depuis la catégorie + garde-fou d'écho mesuré et tracé).
3. **L'audit gratuit à 3 questions ne pouvait pas exposer d'écart.** Porté à 6.
4. **Deux des trois segments servis étaient l'anti-ICP.** **Supprimés.**
5. **La catégorie perçue par l'IA n'était pas mesurée. Livré.**

Constat du 2026-07-23 (run outbound, 20 audits) :

6. **L'inférence de catégorie déraillait sur 2 audits sur 20** — Dear Muesli
   (granola) auditée en « DTC footwear brand », Les Toiles du Large (sacs en voile
   recyclée) en « food & beverage », Nénés Paris (lingerie) étiquetée « analytics
   platform » avec des questions pourtant cohérentes. Trois causes dans
   `categoryFromHomepageText` : substring non borné (« tea » matchait « ba-TEA-u »),
   matcheurs de bruit (« analytics » du bandeau cookies, « newsletter »,
   « instagram »), et une catégorie **codée en dur** « DTC footwear brand » sur
   collision tech-stack. **Corrigé** (règles bornées + règles sacs/lingerie FR,
   re-dérivation produit au lieu du codage en dur, garde-fou croisé règle/LLM qui
   préfère le LLM en cas de désaccord conceptuel, tripwire `catdiv` dans
   `promptDebug` quand label et questions divergent — 20 tests,
   `src/lib/audit-engine.category.test.ts`, `npm test`).

## 9. La question ouverte, qui n'est pas un problème produit

Aucun utilisateur réel n'a lancé d'audit à ce jour. Tant que c'est vrai, le goulot
n'est ni la conversion ni la feature : c'est **le trafic**. Toute optimisation de
funnel se pilote à l'aveugle avec sept lignes de test. La prochaine décision utile
est un choix de canal, pas un choix de roadmap.
