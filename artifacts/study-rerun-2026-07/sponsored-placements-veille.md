# Veille — marqueurs d'emplacements sponsorisés dans les réponses IA

Re-run étude 21 marques, édition juillet 2026 — collecte du 2026-07-23.

Chaque réponse brute des moteurs (snippets stockés par audit, champ
`rawAnswerSnippet` des surfaces `ai_engine`) a été scannée avec le motif :

```
\b(sponsored|sponsorisé|sponsorship|paid\s+(?:placement|partnership|promotion|listing)|promoted|advertisement|#ad|publicité|annonce\s+sponsorisée)\b
```

## Verdict : AUCUN marqueur d'emplacement sponsorisé détecté

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
le point de comparaison daté. Limite connue : les snippets stockés sont
tronqués (~900 caractères par réponse) ; un marqueur situé au-delà de la
troncature ne serait pas détecté.
