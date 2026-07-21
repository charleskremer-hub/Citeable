# Sortie de NanoCorp — plan de migration GetPick

Décidé par Charles le 2026-07-21. Objectif : GetPick ne dépend plus d'un tiers
pour son hébergement, ses données, ses paiements et ses appels IA.

---

## 1. Inventaire réel des dépendances (audité le 21/07)

| Dépendance | Où | Criticité | Sortie |
|---|---|---|---|
| **Hébergement** | Projet Vercel appartenant à NanoCorp | 🔴 Bloquante | Compte Vercel de Charles |
| **Base de données** | `DATABASE_URL` (Postgres, fournisseur à confirmer) | 🔴 Bloquante — contient TOUS les audits | Neon / Supabase, avec dump + restore |
| **`web_search`** | Outil NanoCorp via `POST {NANOCORP_BACKEND_URL}/internal/tools/execute` (audit-engine.ts:1325) | 🟠 Dégrade le score | Brave Search API / Serper / Tavily |
| **`send_email`** | Outil NanoCorp, même endpoint (audit-engine.ts:3296) | 🟠 Casse les emails de rapport et les relances | Resend (offre gratuite 3 000 mails/mois) |
| **Paiement** | Liens `checkout.nanocorp.so` (`src/lib/checkout-links.ts`) | 🟠 Casse l'encaissement | Stripe direct — **débloque aussi l'essai gratuit** |
| **Analytics** | Script phospho-nanocorp dans `layout.tsx` | 🟢 Cosmétique | PostHog, ou suppression |
| **Appels LLM** | ✅ **Déjà indépendants** — `GEMINI_API_KEY` / `OPENAI_API_KEY` en priorité, `NANO_USER_*` en simple repli | 🟢 | Rien à faire, fournir nos propres clés |
| **Crons** | 2 crons Vercel (`weekly-rescan` quotidien, `post-audit-emails` horaire) | 🟢 | ⚠️ Le plan Vercel Hobby limite les crons à 1/jour — le cron horaire impose **Vercel Pro (20 $/mois)** |

**Bonne nouvelle** : le cœur du produit (moteur d'audit, appels Gemini/OpenAI) est
déjà autonome. NanoCorp n'intervient que sur deux outils périphériques
(`web_search`, `send_email`), l'hébergement, la base et le paiement.

## 2. Variables d'environnement à recréer

Indispensables : `DATABASE_URL`, `GEMINI_API_KEY`, `OPENAI_API_KEY`,
`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `UNSUBSCRIBE_SECRET`, `AGENT_SECRET`,
`FUNNEL_ADMIN_KEY` (nouvelle, jamais posée).

**Nouvelles depuis les adaptateurs (2026-07-21)** — tant qu'elles sont absentes,
le code retombe sur NanoCorp, donc sur rien puisque les crédits sont épuisés :

| Variable | Effet si absente |
|---|---|
| `BRAVE_SEARCH_API_KEY` (ou `SERPER_API_KEY`, ou `TAVILY_API_KEY`) | `search_visibility` reste à 0/25 et la surface « recherche web » est marquée non connectée. Le reste de l'audit fonctionne. |
| `RESEND_API_KEY` | Aucun email envoyé : rapport, relances J+1/J+3, monitoring hebdo. Les échecs sont tracés dans `audit_email_delivery_log`, rien n'est perdu en silence. |
| `EMAIL_FROM` | Défaut `GetPick <hello@getpick.ai>` — le domaine doit être vérifié côté Resend. |
| `EMAIL_REPLY_TO` | Optionnelle. |
| `WEB_SEARCH_PROVIDER` | Optionnelle, force `brave`/`serper`/`tavily`. Ignorée si la clé correspondante manque. |

Optionnelles : `GEMINI_MODEL`, `OPENAI_MODEL`, `POST_AUDIT_OUTBOUND_PAUSED`.
À abandonner : tous les `NANOCORP_*` et `NANO_USER_*`.

⚠️ **Charles doit récupérer les valeurs actuelles depuis le projet Vercel de
NanoCorp AVANT toute bascule** — surtout `DATABASE_URL`, `UNSUBSCRIBE_SECRET`
(changer ce dernier invaliderait les liens de désinscription déjà envoyés) et
`CRON_SECRET`.

## 3. Ordre d'exécution recommandé

**Étape 1 — Compte Vercel + déploiement en parallèle (aucun risque).**
Charles crée son compte Vercel, importe le repo GitHub, renseigne les variables
d'env, déploie sur l'URL `*.vercel.app` par défaut. L'ancienne prod continue de
tourner. On teste le funnel complet sur la nouvelle URL avant de basculer quoi
que ce soit.

**Étape 2 — Base de données.** Deux options : (a) garder le Postgres actuel si
Charles en a l'URL et qu'il n'est pas résilié avec les crédits — le plus simple ;
(b) créer un Neon/Supabase et migrer (`pg_dump` puis `pg_restore`). Vérifier le
nombre de lignes des tables `audits`, `email_captures`, `audit_funnel_events`
avant/après. **C'est l'étape la plus risquée : ne jamais la faire sans dump préalable.**

**Étape 3 — Remplacer `web_search` et `send_email`. ✅ FAIT le 2026-07-21 (code).**
Deux modules autonomes : `src/lib/web-search.ts` (Brave / Serper / Tavily) et
`src/lib/mailer.ts` (Resend). Branchés dans `audit-engine.ts` via
`fetchSearchSurface()` et `sendNativeEmail()` : notre fournisseur d'abord, NanoCorp
en repli hérité, échec explicite si aucune voie n'existe — jamais de résultat inventé.
`fetch` et `env` sont injectables, d'où 44 tests sans réseau.
**Reste à faire : poser les clés en prod** (voir tableau §2), puis supprimer
`fetchNanoCorpSearch()` / `sendNanoCorpEmail()`.

**Étape 4 — Bascule DNS.** Pointer `getpick.ai` (apex ET www) sur le nouveau
projet. C'est le moment d'**enfin déclarer l'apex** et de repasser les canonicals
de `www.getpick.ai` à `https://getpick.ai` (une constante par fichier, voir le
commentaire dans `src/app/robots.ts`).

**Étape 5 — Stripe.** Compte Stripe, deux produits (Monitor 9 €/mois, Agent
19 €/mois), liens de paiement, mise à jour de `src/lib/checkout-links.ts`.
Activer l'essai 7 jours au passage — c'était l'item Must bloqué.

**Étape 6 — Analytics et nettoyage.** PostHog ou rien, retrait du script
phospho-nanocorp, suppression des variables `NANOCORP_*`, réactivation ou
suppression définitive de la tâche `citeable-nanocorp-check`.

## 4. Coût cible

Vercel Pro 20 $/mois (imposé par le cron horaire), Neon/Supabase gratuit à ce
volume, Resend gratuit jusqu'à 3 000 mails/mois, Brave Search ~5 $/mois, Stripe
à la commission. **Environ 25–30 $/mois** pour une autonomie complète.

## 5. Règle de sécurité

Les valeurs de variables d'environnement et les clés API ne transitent jamais par
l'agent : Charles les copie lui-même du panneau Vercel source vers le panneau
Vercel cible. L'agent prépare le code, les adaptateurs et les tests — jamais les secrets.
