# Journal AC6 — ajustement de la landing après le re-run

**Landing ajustée : OUI.**

**Pourquoi** : trois claims chiffrées de la section « The proof » (`studyStats`
dans `src/lib/i18n.ts`, EN + FR) provenaient de l'édition du 19/07 et sont
devenues fausses après le re-run du 23/07 avec le moteur corrigé :

| Claim | Avant (19/07) | Après (23/07) |
|---|---|---|
| Écart des scores | 31–88 | 13–100 |
| Contraste notoriété/visibilité | 46 vs 81 (Allbirds vs Ridge Wallet) | 25 vs 100 (Allbirds vs Ollie) |
| Audits où l'IA nomme un rival | 14 / 21 | 19 / 21 |

Le libellé « 21 marques » a été précisé en « (édition juillet 2026) » pour
dater la claim. `public/llms.txt` (section Original research) portait les mêmes
chiffres et a été aligné. Aucun autre élément de la landing ne citait de
chiffre de l'étude.

Source des nouveaux chiffres : `artifacts/study-rerun-2026-07/results.json`
(21 audits, promptDebug `ai:12` pour chacun, base Neon).
