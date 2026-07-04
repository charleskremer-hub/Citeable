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
