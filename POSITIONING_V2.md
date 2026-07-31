# Positionnement V2 — travail rigoureux (remplace la section 2 de POSITIONING.md)

2026-07-19. Méthode : alternatives réelles de l'acheteur → différenciateurs
prouvables → segment → catégorie → message → et SEULEMENT ENSUITE le nom.

---

## 0. L'erreur corrigée

Les itérations de naming (WhoPicks → Outpicked → RivalScore → RivalBoost)
échouaient parce qu'elles cherchaient un nom qui PORTE le positionnement.
Mauvaise division du travail : chez les gagnants de la catégorie, le nom est
distinctif et la ligne de catégorie fait l'explication (Peec ne veut rien dire,
Profound est abstrait, Qonto/Alan idem — leur tagline travaille). Le nom doit
être court, possédable, neutre FR/EN. Le positionnement vit dans la phrase qui
suit le nom.

---

## 1. Contre quoi l'acheteur nous compare (alternatives réelles)

L'acheteur = fondateur ou head of growth d'une marque DTC/e-commerce moyenne,
FR ou US. Face au problème « les IA recommandent-elles ma marque ? », ses
options réelles sont :

| Alternative | Coût réel | Ce qui cloche pour lui |
|---|---|---|
| **Ne rien faire** (le défaut, ~95 % du marché) | 0 | Il ne sait même pas qu'il perd des ventes — nos audits à l'aveugle nomment régulièrement un rival à la place de la marque (chiffre agrégé retiré le 31/07/2026, rerun en cours) |
| **Demander lui-même à ChatGPT** | 0 | Anecdotique, une question, pas de suivi, pas de correctifs |
| **Outils de monitoring** (Peec, Profound, Otterly, Scrunch…) | 99–400 $/mois | Dashboards, crédits, calculateurs — conçus pour des équipes marketing, pas pour un fondateur seul. Et ils INFORMENT, ils n'agissent pas |
| **Générateurs one-shot** (citeable.eu) | 39 € une fois | Un fichier statique, aucune boucle : les réponses IA bougent, le fichier non |
| **Agence GEO** | 2 000–20 000 €/mois | Le seul acteur qui FAIT le travail — mais à un prix inaccessible pour une DTC moyenne |

**Lecture exigeante du tableau** : la seule alternative qui délivre le résultat
(être recommandé) est l'agence. Tout le reste délivre de l'information. Or notre
propre veille a conclu : « plus personne ne vend du monitoring pur » et « un DTC
ne construit pas de workflow, il veut le résultat ». L'espace vide n'est donc pas
« mieux mesurer » — il est « **faire le travail de l'agence, au prix d'un outil** ».

## 2. Ce qu'on peut prouver (différenciateurs vérifiés, pas déclarés)

1. **On écrit les correctifs** — Monitor livre du contenu à copier-coller, généré
   depuis le VRAI écart mesuré (la question précise où le rival est cité). Aucun
   outil de monitoring ne fait ça à notre prix ; l'agence le fait à 300× notre prix.
2. **On nomme le rival** — l'audit nomme le concurrent recommandé à la place, quand
   il y en a un. C'est le déclencheur émotionnel. ⛔️ **Le ratio « 14/21 » est RETIRÉ le 2026-07-31 — instrument corrigé le 2026-07-30, en attente du rerun**
   (mesure contaminée, cf. `src/lib/study-status.ts` et `/study`) :
   ne le remettre dans aucun contenu tant que le rerun aveugle n'a pas publié. Preuve
   utilisable en attendant : un audit aveugle nominatif (ex. Skintips, 0 mention sur
   12 questions, rivaux CeraVe 7/12 et La Roche-Posay 7/12 —
   `outbound/CEO_RUN_2026-07-31.md` l. 191).
3. **Vrais appels LLM en direct** — jamais de prompts simulés (différenciateur vs
   Semrush, documenté).
4. **Zéro unité de compte** — pas de crédits, pas de calculateur, 9 €. Le marché
   entier a dû construire des calculateurs pour expliquer ses prix.
5. **Dogfooding public** — on publie notre propre score et nos propres erreurs
   (étude /study). Personne d'autre ne le fait.

## 3. Le segment (resserré, pas « les marques »)

Fondateur/head of growth DTC-ecommerce, 1–50 personnes, FR + US, qui n'a NI
analyste NI budget agence. Signal d'achat : il vient de découvrir qu'un rival
est recommandé à sa place (c'est exactement ce que produit notre outbound et
notre audit gratuit).

## 4. La catégorie choisie : **agent GEO** (pas « outil de visibilité IA »)

Trois catégories possibles, une seule tenable :

- ~~« Outil de visibilité IA »~~ → nous range face à Peec/Profound, guerre de
  features et de moteurs qu'on perd (ils ont 11 moteurs, des millions levés).
- ~~« Générateur llms.txt »~~ → nous range face à citeable.eu, course au moins-cher
  sur un one-shot sans récurrence.
- **« Agent GEO »** → la catégorie qui n'existe pas encore en self-serve : l'agent
  qui fait recommander ta marque par les IA. Fait le diagnostic, écrit les
  correctifs, surveille, recommence. L'alternative de référence devient l'AGENCE
  (2 000–20 000 €/mois), pas l'outil — et face à l'agence, 9-19 €/mois n'a pas
  besoin d'argumentaire.

Cohérences fortes : le produit s'appelle déjà « Agent » au tier 19 € ; la roadmap
(M2 chat interactif) va dans ce sens ; Profound met « agents » au cœur de sa
V2026 mais à 399 $/mois pour du mid-market+ ; et le timing narratif (commerce
agentique) est déjà dans notre landing.

Conséquence produit assumée : cette promesse exige que Monitor tienne « l'agent
fait le travail ». C'est déjà vrai (correctifs copier-coller auto-générés) mais
chaque évolution produit doit renforcer « il AGIT », jamais « il affiche ».

## 5. Le message (structure fixe, bilingue)

- **Catégorie** : FR « L'agent GEO des marques DTC » · EN « The GEO agent for DTC brands »
- **Promesse** : FR « Il fait recommander ta marque par ChatGPT et Gemini —
  diagnostic, contenu, suivi. Sans agence. » · EN « It gets your brand recommended
  by ChatGPT and Gemini — diagnosis, content, monitoring. No agency needed. »
- **Douleur d'ouverture** (hero) : FR « Quand un client demande quoi acheter,
  l'IA répond [Rival]. » · EN « When a shopper asks what to buy, AI answers
  [Rival]. »
- **Ancrage prix** : « Le travail d'une agence GEO (2 000–20 000 €/mois). 9 €. »
- **Preuve** : ⛔️ plus l'étude 21 marques (chiffres retirés le 2026-07-31, rerun
  aveugle en cours). En attendant : « live checks, never simulated », un audit
  aveugle nominatif traçable, et la page de retrait elle-même — constater plutôt
  que déclarer, y compris sur soi.

## 6. Le nom (dérivé, enfin, du positionnement)

Critères hérités du positionnement — et plus l'inverse :
distinctif et possédable (pas descriptif), neutre FR/EN (coiné > mot anglais),
2-3 syllabes, évoque si possible la recommandation ou l'action déléguée,
zéro collision catégorie (check systématique), domaine disponible.

Le nom n'a PLUS à dire « agent » ni « GEO » : la ligne de catégorie le dit.
