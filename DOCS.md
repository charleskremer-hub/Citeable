# Citeable Worker Notes

## 2026-07-04 — Free AI Visibility Audit Engine

### Codebase findings
- Next.js 16.2.10 App Router project at repo root with `src/app/page.tsx`, API route handlers under `src/app/api`, and Tailwind/global CSS in `src/app/globals.css`.
- Per `AGENTS.md`, relevant Next docs were read from `node_modules/next/dist/docs/`: route handlers, layouts/pages, server/client components, fetching data, and dynamic route params. Dynamic route `params` are a `Promise` in this version.
- Existing capture API stored only `email` in PostgreSQL table `email_captures`; table already had `id`, `email`, `created_at`, `source`, and a unique constraint on `email`.
- Existing Citeable Pro checkout URL is the per-product checkout for the active `Citeable Pro` product: `https://checkout.nanocorp.so/c/xkA3ynsSsBvwhaUaVlZG`.

### Changes made
- Expanded the landing-page audit form in `src/app/page.tsx` to collect `brand_name`, `website_url`, and `email`, then queue an audit and redirect to `/audit/[id]`.
- Added shared PostgreSQL setup in `src/lib/db.ts`, including idempotent creation/altering of `email_captures` and `audits`.
- Added audit logic in `src/lib/audit-engine.ts`:
  - Fetches homepage through NanoCorp `web_fetch` to detect category and schema.org/JSON-LD markup.
  - Runs four brand prompts through reachable live tools: Brave `web_search` snippets and Perplexity public search pages via `web_fetch`.
  - Records unavailable engines honestly: ChatGPT web answer, You.com AI answer, Phind AI search, Google AI Overviews, Gemini web answer, and Microsoft Copilot web answer, each with a reason.
  - Computes score using the requested formula: mention coverage × 60 + structured-data bonus + averaged citation-quality bonus.
  - Extracts competitor-like brand names from snippets/URLs and generates 3–5 prioritized fixes.
  - Sends the report email through NanoCorp `send_email` internal tool and records email success/error in `raw_results`.
- Updated `src/app/api/capture-email/route.ts` to validate/store all three fields and create a queued audit row.
- Added `src/app/api/run-audit/route.ts` for idempotent live audit execution; it uses a PostgreSQL advisory lock to avoid duplicate work when the landing page and report page both trigger the run.
- Added `/audit/[id]` report UI in `src/app/audit/[id]/page.tsx` with score circle, formula, engine breakdown, competitors, fixes, and Pro CTA.
- Added `src/app/audit/[id]/AuditPoller.tsx` to start/retry an incomplete audit from the result page and refresh every 3 seconds until complete.

### Database changes applied
- Ran idempotent migration against the company PostgreSQL database:
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto`
  - `ALTER TABLE email_captures ADD COLUMN IF NOT EXISTS brand_name TEXT`
  - `ALTER TABLE email_captures ADD COLUMN IF NOT EXISTS website_url TEXT`
  - `CREATE TABLE IF NOT EXISTS audits (...)` matching the task schema.

### Runtime environment notes
- `NANOCORP_BACKEND_URL` and `NANOCORP_TOKEN` are required server-side for NanoCorp `web_search`, `web_fetch`, and `send_email` calls.
- Vercel env vars were set for `NANOCORP_BACKEND_URL` and the current worker `NANOCORP_TOKEN` for immediate deployment testing.
- Attempting to mint a durable runtime token with `nanocorp token create --name citeable-site-runtime` failed with `403: Cannot access this conglomerate`; do not retry without changed permissions. A CEO/admin should provision a durable company token or platform-provided server credential before relying on this long-term.

### Validation results
- `npm run build` passes.
- Local live audit test for brand `Citeable`, website `https://getciteable.nanocorp.app`, email `test@example.com` returned score `23/100`.
- Test audit engines checked/reported:
  - Reachable: `Brave web_search snippets`, `Perplexity.ai public search page`.
  - Unavailable with reasons: `ChatGPT web answer`, `You.com AI answer`, `Phind AI search`, `Google AI Overviews`, `Gemini web answer`, `Microsoft Copilot web answer`.
- Test audit ID: `fca1de1c-6b6e-4147-8cca-2b343e2af349`.

### Production verification after deploy
- Commit `c739249` deployed to `https://getciteable.nanocorp.app` and the homepage snapshot showed the three required fields: `Acme SAS`, `https://acme.fr`, and `your@company.com`.
- Production API test audit for `Citeable` / `https://getciteable.nanocorp.app` returned score `23/100` with audit ID `54d030c6-6ddb-4f1c-aa18-1e17f113a1b1`.
- Production reachable engines: `Brave web_search snippets`, `Perplexity.ai public search page`.
- Production unavailable engines were reported with reasons: `ChatGPT web answer`, `You.com AI answer`, `Phind AI search`, `Google AI Overviews`, `Gemini web answer`, `Microsoft Copilot web answer`.

## 2026-07-04 — French web agency cold outreach

### Research findings
- Used NanoCorp `web search` and `web fetch --fresh` to identify French web/digital agencies with public contact emails on official pages.
- Verified only addresses visible in fetched page content or `mailto:` links; ignored placeholder/boilerplate addresses such as `example@treethemes.com`.
- Skipped agencies/pages without a usable public email: Web Paris (`webparis.fr`, no email on fetched contact page), Agence Web Paris (`agence-web-paris.com`, fetched contact URL was 404/no email), Evolyon (`evolyon.fr`, fetched contact URL was 404/no email), Digitalweb Agence (`digitalweb-agence.com`, fetched contact URL was 404), Simplébo (`simplebo.fr`, no email found on fetched contact/about pages), SM Agency (`sm-agency.fr`, DNS resolution failed), JSanchez (`jsanchez.fr`, email was obfuscated as `infoweb(@)jsanchez.fr`, not sent).

### Outreach sent
- Sent subject: `Votre visibilité dans ChatGPT et Perplexity — audit gratuit`.
- Sent body exactly as requested in French, plain text, offering a free Citeable audit at `https://getciteable.nanocorp.app`.
- All sends used `nanocorp emails send --debug`; each returned CLI exit code `0`, API HTTP status `200`, and send status `sent`.

| Agency | Domain | Verified email | Fetched verification URL | HTTP status | Send status | NanoCorp email ID |
| --- | --- | --- | --- | --- | --- | --- |
| Newp | `newp.fr` | `contact@newp.fr` | `https://www.newp.fr/contact/` | 200 | sent | `e1684dac-153f-4e99-98f1-596509dd2249` |
| ASB Digital | `asb-digital.fr` | `contact@asb-digital.fr` | `https://www.asb-digital.fr/` | 200 | sent | `40bf30d6-7b82-46a7-a13a-1792204da64a` |
| Pickers | `agence-pickers.fr` | `contact@agence-pickers.fr` | `https://www.agence-pickers.fr/` | 200 | sent | `89a5fa45-bff0-4f98-9d0a-8710ca0d7963` |
| Adveris | `adveris.fr` | `contact@adveris.fr` | `https://www.adveris.fr/contact/` | 200 | sent | `d637a2b4-9e31-441a-be13-0ac5cc8c6e97` |
| Digitale Paris Marketing Agency | `digitaleparis.fr` | `contact@digitaleparis.fr` | `https://digitaleparis.fr/contact/` | 200 | sent | `0d7ac69d-be65-487e-b387-b9e144569864` |
| SW Agency | `sw-siteinternet.com` | `contact@swagency.fr` | `https://sw-siteinternet.com/contact/` | 200 | sent | `b811479d-0a0c-46d4-976f-e084596f3d2b` |
| WYBE | `wybe.fr` | `contact@wybe.fr` | `https://wybe.fr/contact/` | 200 | sent | `b1e194f8-29aa-4728-bd07-57b1057d3b34` |
| The Digital Counsel | `thedigitalcounsel.com` | `contact@thedigitalcounsel.com` | `https://thedigitalcounsel.com/contact/` | 200 | sent | `7e49615a-900a-4a95-a529-381e02f95a80` |
| Pixalione | `pixalione.fr` | `contact@pixalione.com` | `https://www.pixalione.fr/contact/` | 200 | sent | `d61d7a01-6c92-46a1-9cf1-18fe64448271` |
| Numewoo | `numewoo.fr` | `contact@numewoo.com` | `https://www.numewoo.fr/contact` | 200 | sent | `a619b399-b441-455d-8af6-b778029e61db` |

### Verification notes
- `nanocorp emails list --direction outbound --limit 12` showed the 10 outbound messages from `getciteable@nanocorp.app` with the requested subject.
- `nanocorp emails list --direction inbound --limit 5` returned no inbound emails immediately after sending; no bounces or errors were observed during the task window.
