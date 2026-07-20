# Renommage : Citeable → WhoPicks (whopicks.ai)

Décidé le 2026-07-19. Ce document pilote la migration. À jour = source de vérité
pour les agents planifiés (`citeable-product-agent`, `citeable-pr-inbound`,
`citeable-inbox-assign`), qui doivent s'y référer avant toute production de contenu.

## Pourquoi

« Citeable » était déjà occupé deux fois sur la catégorie exacte : `citeable.eu`
(orthographe identique, outil GEO/AEO) et `getcitable.com` (Citable Inc., une lettre
d'écart, plateforme GEO avec traction). On ne peut pas vendre de la visibilité IA
sous un nom que les IA attribuent à des concurrents — notre propre audit le mesurait :
`search_visibility 0/25`, catégorie perçue fausse, attribution à NanoCorp.

## Ce qui bloque tout le reste

1. **Acheter `whopicks.ai`** (Charles — paiement).
2. **Rattacher le domaine au déploiement** — Charles n'a pas de compte Vercel,
   ça passe donc par NanoCorp.
3. **Arbitrer les inboxes Instantly** en provisioning sur le domaine « citeable » :
   annuler/refaire avant la fin du warmup, sinon 2-3 semaines perdues.

Tant que 1 et 2 ne sont pas faits, ne PAS déployer le renommage : le site tournerait
sous un nom sans domaine correspondant.

## À migrer une fois le domaine actif

- `src/lib/i18n.ts` — toutes les occurrences visibles du nom.
- `src/app/layout.tsx` — metadata (title, description) + JSON-LD `SoftwareApplication`
  (name, url, offers).
- `public/llms.txt` — nom, URLs, résumé de l'étude.
- `src/app/robots.ts` et `src/app/sitemap.ts` — `BASE_URL` / `siteUrl`.
- `src/app/study/page.tsx` — re-signature de l'étude : auteur, `ARTICLE_SCHEMA`,
  URL canonique, mention « Citeable (us) » dans le tableau, CTA.
- `src/lib/checkout-links.ts` — vérifier les libellés produits côté NanoCorp/Stripe.
- `outbound/` — signature des séquences, `sdr_agent.py` (corps d'email), pitchs presse.
- Docs : `GROWTH_ORGANIC.md`, `PRODUCT_BACKLOG.md`, `AGENT_RUNS.md`.
- Les 3 prompts de tâches planifiées (via `update_scheduled_task`).

## Redirections

Garder `getciteable.nanocorp.app` actif en redirection 301 vers le nouveau domaine :
l'étude est déjà indexable et les rares liens existants doivent suivre. Ne pas
supprimer l'ancienne URL.

## Étude publiée

L'étude `/study` doit être re-signée WhoPicks, mais **les données ne changent pas**.
La ligne « Citeable (us) — 61 » du tableau devient « WhoPicks (us) », avec une note
expliquant le renommage : c'est cohérent avec la transparence méthodologique qui fait
la crédibilité de l'étude, et ça évite qu'un lecteur croie à deux produits différents.
