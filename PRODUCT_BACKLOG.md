# Citeable — Product Backlog

Backlog tenu à jour par l'agent produit autonome (run quotidien 7h). Ne garder que ce qui sert la value prop "GEO tout-en-un simple" pour marques DTC/e-commerce moyennes. Écarter le jargon/features usine à gaz réservées aux gros comptes.

Format : {titre} — source/concurrent inspirant — valeur ICP — effort (S/M/L) — priorité (Must/Should/Nice) — statut (Todo/Done/Blocked)

## Veille — signaux notés (2026-07-17)

- **Peec.ai** — "Actions" (fév. 2026) : transforme les données de visibilité en liste priorisée d'actions, groupe les sources similaires, montre où les concurrents gagnent. "AI Shopping Analytics" (juin 2026) : visibilité produit par produit dans les réponses shopping IA. [peec.ai/changelog, peec.ai/blog/introducing-actions]
- **Profound** — Levée de $96M (Series C, $1Md valo, fév. 2026) → catégorie GEO qui devient mainstream/compétitive. Feature "Personas" : voir les réponses IA du point de vue de segments d'audience (rôle/industrie). Étude : LinkedIn est devenu le domaine #1 cité pour les requêtes pro sur ChatGPT (nov 2025 → fév 2026). [tryprofound.com]
- **Otterly.ai** — "GEO Audit" analyse 25+ facteurs on-page + calculateur de prompts gratuit. Pricing très accessible (29€/mois pour 15 prompts) — reste un concurrent direct sur le segment small brand. [otterly.ai/pricing]
- **Ahrefs Brand Radar** — Étude sur 75 000 marques : les mentions YouTube sont le signal le plus corrélé à la visibilité IA (plus que tout autre facteur). Ajout tracking custom prompts (janv. 2026) + extension à YouTube/TikTok/Reddit. Pricing élevé : 199€/mois par plateforme IA, 699-828€/mois tout compris — hors budget de notre ICP. [businesswire.com, ahrefs.com/brand-radar]
- **Semrush AI Visibility Toolkit** — Lancé oct. 2025, add-on 99€/mois/domaine sur abonnement Semrush existant. Limite notée par les reviewers : modélise la présence de marque avec des **prompts simulés**, pas des sessions utilisateur réelles — critiqué comme peu représentatif. **→ différenciateur direct pour nous : Citeable envoie de vraies requêtes en direct aux moteurs IA (Gemini/ChatGPT), jamais de simulation.**
- **Scrunch AI** — "Agent Experience Platform" (AXP) : sert du contenu optimisé IA directement aux agents au niveau CDN. Infra lourde, hors cible pour notre ICP simple/self-serve.
- **Agences GEO/AEO** — Retainers mensuels 2 000–20 000€, souvent 5 000–10 000€/mois pour le mid-market. Confirme que notre positionnement à 9€/mois (Monitor) est une rupture de prix radicale sur ce marché — argument à répéter dans le copy.

## Backlog

### Must

- **Badge "vérification en direct, pas simulée"** — Semrush (prompts simulés, critiqué) — Trust signal directement exploitable : on envoie déjà de vraies requêtes LLM (`realLlmCall`), il suffisait de le rendre visible. — Effort S — **Done (2026-07-17)** : badge ajouté sur `src/app/audit/[id]/page.tsx` (visible dans le header du rapport quand `answerEngine.realLlmCall` est vrai) + copy FR/EN dans `src/lib/i18n.ts` (`liveCheckLabel`, `liveCheckDetail`).
- **Liste d'actions priorisées façon "Actions" de Peec** — Peec.ai — On a déjà les 3 actions Monitor ; manque le "pourquoi cette action d'abord" (regroupement par source/impact). — Effort M — Todo.
- **Check llms.txt / robots IA** — Tendance GEO générale (standard émergent llms.txt) — Ajouter un check simple "ton site expose-t-il un llms.txt ?" au même titre que structured_data/wikipedia. Objectif score plus complet sans complexifier l'UX. — Effort S — Todo (attention : touche `audit-engine.ts`, tester avant de livrer pour ne pas casser le scoring).

### Should

- **Mention "share of voice" (déjà calculé, `shareOfVoicePct`) mise en avant visuellement** — inspiré des dashboards concurrents (Peec/Profound) mais gardé simple — un seul chiffre clé, pas un dashboard complexe. — Effort S — Todo.
- **Rappel du delta de prix vs agences GEO** sur la landing/page pricing ("Les agences GEO facturent 2 000 à 10 000€/mois pour ça. Monitor : 9€.") — issu de la veille agences — renforce le positionnement prix. — Effort S — Todo.
- **Segment "AI Shopping" léger pour DTC/e-commerce** — Peec AI Shopping Analytics — trop lourd à répliquer tel quel, mais on pourrait ajouter 1-2 prompts "shopping" (ex: "où acheter [produit] pas cher") dans le buyer prompt set pour les marques e-commerce. — Effort M — Todo.

### Nice

- **Tip contenu "YouTube = signal #1"** — étude Ahrefs 75k marques — ajouter une recommandation ponctuelle dans les actions Monitor quand pertinent (marque sans présence vidéo) suggérant du contenu YouTube. — Effort S — Todo.
- **Segmentation "Personas" façon Profound** — trop enterprise/complexe pour notre ICP self-serve, à ne considérer que si demandé explicitement par des clients Agent. — Effort L — Todo (probablement à écarter, hors value prop simplicité).

## Écarté (hors value prop "simple")

- AXP / infra CDN pour agents (Scrunch) — trop lourd, pas notre marché.
- Dashboard multi-plateforme 17+ moteurs (Rankscale) — sur-complexifie l'offre self-serve à 9€.
- Brand Radar multi-index à 199-828€/mois (Ahrefs) — hors budget ICP.
