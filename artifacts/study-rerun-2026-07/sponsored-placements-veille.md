# Veille — marqueurs d'emplacements sponsorisés dans les réponses IA

Re-run étude 21 marques, édition juillet 2026 — collecte du 2026-07-23.

Ce qui a été scanné : le champ `rawAnswerSnippet` de chaque surface
`ai_engine` stockée par audit. Ce champ ne contient PAS la prose brute du
modèle : le moteur instruit le modèle de répondre uniquement en JSON
structuré et remplace la réponse par la liste extraite
« recommended_brands: X, Y, Z » (voir la limite structurelle plus bas).
Motif appliqué :

```
\b(sponsored|sponsorisé|sponsorship|paid\s+(?:placement|partnership|promotion|listing)|promoted|advertisement|#ad|publicité|annonce\s+sponsorisée)\b
```

## Verdict : AUCUN marqueur détecté dans les listes de marques recommandées

| Marque | Moteur | Questions scannées | Marqueurs trouvés |
|---|---|---|---|
| GetPick | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Baboon to the Moon | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Cuts | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Dagne Dover | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Bubble | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Allbirds | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Topicals | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Versed | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Brooklinen | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Necessaire | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| De Soi | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Our Place | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Tower 28 | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Spot & Tango | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Arrae | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Cometeer | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Ridge Wallet | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Moon Juice | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Hedley & Bennett | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Recess | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |
| Ollie | ChatGPT (gpt-4o-mini-2024-07-18) | 12 | aucun |

## Pourquoi ce journal existe

Prérequis de l'item Should « veille armée » (zéro dev produit associé) :
si un moteur commence à insérer des emplacements sponsorisés dans ses
recommandations d'achat, la promesse GEO change de nature. Ce journal est
le point de comparaison daté — dans les limites de portée ci-dessous.

## Limite structurelle — portée réelle de ce scan

Le pipeline d'audit ne stocke aucune réponse rédigée du modèle. Chaque
`rawAnswerSnippet` est la liste structurée des marques recommandées
(25 à 72 caractères sur ce run), produite côté moteur en remplacement de
la réponse brute (`parseStructuredBrandResponse` dans
`src/lib/audit-engine.ts`). Ce scan ne peut donc détecter un marqueur
sponsorisé QUE s'il apparaît dans un nom de marque recommandé — jamais
dans la prose d'une réponse, qui n'existe nulle part en base.

Conséquence assumée : ce journal établit l'absence de marqueurs dans les
listes de marques recommandées à la date de collecte, et rien de plus.
Pour armer réellement la veille (détecter un emplacement sponsorisé
inséré dans la prose d'un moteur), il faut d'abord persister la réponse
brute complète du modèle par surface — dev côté moteur, hors périmètre
de cette story, consigné ici comme prérequis restant de l'item Should
« veille armée ».
