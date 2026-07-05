
## 2026-07-05 — Meta Ads geo-targeting access check

### Findings
- `nanocorp ads list` is read-only; its help text says ads are controlled by the owner from the company dashboard and the CLI can only list campaigns/view performance.
- No local environment variables or repo references were found for Meta/Facebook/Graph API credentials.
- `nanocorp docs list` showed only the LinkedIn launch-post document; no Meta access notes were available.
- Meta Ads Manager browser access reached a login wall at `business.facebook.com`, with options to continue with Facebook/Instagram or a managed Meta account; no authenticated session was available in the worker browser.
- Active Citeable ads data available through the read-only CLI:
  - Campaign local ID: `49b54812-ad64-42d0-bcd2-09344457d29f`
  - Status/effective status: `ACTIVE` / `ACTIVE`
  - Creative status: `READY`
  - Destination URL: `https://getciteable.nanocorp.app?utm_source=facebook&utm_medium=paid_social&utm_campaign=49b54812-ad64-42d0-bcd2-09344457d29f`
  - Daily cap: `$4/day`
  - Countries returned by read-only CLI: `FR`, `BE`, `CH`, `DE`, `NL`, `GB`, `US`, `CA`
  - Latest sync timestamp returned by CLI: `2026-07-05T12:00:31.354116`

### Result
- Programmatic/API write access was unavailable, so the targeting was not changed by the worker.
- As of the read-only CLI snapshot, `FR`, `BE`, `CH`, `DE`, and `NL` were still present and need to be removed by the owner/admin.
- `US`, `GB`, and `CA` were present in the read-only CLI data. `AU` was not returned by the CLI snapshot, so Charles should verify/add Australia in Ads Manager if it is missing.
- Daily budget/cap remained `$4/day`; no budget change was made.

### Manual steps for Charles
1. Open Meta Ads Manager for Citeable and log in with the Meta account that owns or administers the Citeable ad account.
2. Go to the campaign/ad set table and filter to active items only.
3. Open each active ad set that sends traffic to `getciteable.nanocorp.app`.
4. Click `Edit`, then open the `Audience` or `Advantage+ audience` section that contains location targeting.
5. In included locations, remove exactly these countries: France (`FR`), Belgium (`BE`), Switzerland (`CH`), Germany (`DE`), and Netherlands (`NL`).
6. Confirm the included locations contain only the intended English-speaking markets: United States (`US`), United Kingdom (`GB`), Canada (`CA`), and Australia (`AU`). If Australia is missing, add Australia only.
7. Check the budget field before publishing and leave it unchanged at `$4/day`.
8. Publish the ad set changes without changing campaign status, ad set status, creative, copy, optimization, placements, or any other settings.
9. After publish, reopen the edited active ad set and verify the included locations and `$4/day` daily budget are still correct.

## 2026-07-05 — English SMB landing page rewrite

### Findings
- Current homepage used a technical hero (`AI Visibility · GEO/AEO`) and French-local placeholders (`Acme SAS`, `https://acme.fr`) above the fold.
- Audit prompts still included a France-specific small-business query template.
- Per `AGENTS.md`, dependencies were installed and relevant local Next.js 16 docs were read from `node_modules/next/dist/docs/01-app/` before editing: layouts/pages, server/client components, forms, and route handlers.

### Changes made
- Rewrote `src/app/page.tsx` for English-speaking SMB owners with the owner-approved H1, subhead, and CTA copy verbatim.
- Reworked the hero into a mobile-first layout with plain-English copy above the fold and the audit form immediately visible on mobile.
- Removed French-local form placeholders and replaced them with generic English SMB placeholders.
- Replaced the below-fold “How it works” section with the requested 3-step plain-English sequence.
- Reframed pricing as `Get found by AI — €49/month` while keeping the existing €49/month price and checkout link unchanged.
- Moved technical `GEO`/`AEO` wording into a small below-fold FAQ only.
- Updated `src/lib/audit-engine.ts` prompt templates to:
  - `best [category] for small businesses`
  - `who is [brand] and are they good`
  - `alternatives to [brand]`
  - `top [category] recommendations`
- Updated homepage metadata in `src/app/layout.tsx` to match the English SMB positioning.

### Verification
- `npm run build` passed.
- Local mobile QA at 375×667 with `agent-browser`: audit panel top `340px`, first input top `357px`, CTA text `Run my free audit`.
- Page scan found no French-local copy or forbidden above-fold jargon in `src/app/page.tsx` / `src/app/layout.tsx`.

# Citeable Worker Notes

## 2026-07-05 — J+1 French agency follow-up emails

### Findings
- Original July 4 outbound emails were present in NanoCorp email history for the 10 requested agency recipients, all from `getciteable@nanocorp.app` with subject `Votre visibilité dans ChatGPT et Perplexity — audit gratuit`.
- `nanocorp emails send` supports `--reply-to`, so the July 5 follow-ups were sent as threaded replies to the original outbound email IDs while using a different subject.

### Follow-up email sent
- Sender: `getciteable@nanocorp.app`.
- Subject used for all recipients: `Re: Citeable — une idée pour vos clients`.
- Body was 9 short lines in French, covering the Citeable reminder, free 2-3 SME client audit offer, 10% recurring affiliate commission on Citeable Pro at 49 €/month, and CTA to reply `intéressé` for details + affiliate link within 24h.
- `test@example.com` was not used.

### Send results
| Agency | Email | Status | NanoCorp email ID |
| --- | --- | --- | --- |
| Newp | `contact@newp.fr` | HTTP 200 | `a9becd27-2e74-4980-9202-458663dee204` |
| ASB Digital | `contact@asb-digital.fr` | HTTP 200 | `a12ceeed-3de8-4969-ba12-c8a5485c8dd9` |
| Pickers | `contact@agence-pickers.fr` | HTTP 200 | `8a77526c-1cae-41db-9506-2d9ace5fed91` |
| Adveris | `contact@adveris.fr` | HTTP 200 | `241b054d-9197-43b5-8a50-29ff03ef9069` |
| Digitale Paris | `contact@digitaleparis.fr` | HTTP 200 | `8c4f0635-12c4-4293-b537-f35774dc6f08` |
| SW Agency | `contact@swagency.fr` | HTTP 200 | `25413dc7-03d2-4fbc-bc55-d5f373ff4b6c` |
| WYBE | `contact@wybe.fr` | HTTP 200 | `b60962d7-92d1-4804-9c60-d2ca5017d6f6` |
| The Digital Counsel | `contact@thedigitalcounsel.com` | HTTP 200 | `aa22e78c-7cfe-4c16-9991-cfcef50a985c` |
| Pixalione | `contact@pixalione.com` | HTTP 200 | `13c1340e-7486-4eda-9904-317aa61557cd` |
| Numewoo | `contact@numewoo.com` | HTTP 200 | `6c870a78-5d25-453c-9e3a-86577d050dfe` |

## 2026-07-05 — NANOCORP_TOKEN production auth audit

### Findings
- Exact runtime env var for server-side NanoCorp calls: `NANOCORP_TOKEN`.
- Header format in `src/lib/audit-engine.ts`: `Authorization: Bearer ${process.env.NANOCORP_TOKEN}` plus `Content-Type: application/json`.
- NanoCorp tool endpoint base: `process.env.NANOCORP_BACKEND_URL`, falling back to `https://phospho-nanocorp-prod--nanocorp-api-fastapi-app.modal.run`; requests go to `/internal/tools/{web_fetch|web_search|send_email}/execute`.
- Repo has no `.env`, `.env.local`, or `vercel.json` fallback file checked in; local worker env contains masked `NANOCORP_TOKEN`, `NANOCORP_BACKEND_URL`, and `DATABASE_URL` values.

### Fix status
- No source-code auth fix was needed: all NanoCorp calls already read `process.env.NANOCORP_TOKEN` and pass it as a Bearer token.
- Verified the masked worker `NANOCORP_TOKEN` against the same internal `web_fetch` endpoint: HTTP `200`, `success: true`, result present.
- Updated Vercel env var `NANOCORP_TOKEN` with the masked worker token via `nanocorp site env set` (`updated: 1`) as a temporary replacement; Charles should still provision a durable company/server token.
- Pre-redeploy production smoke still showed the old runtime auth failure: capture HTTP `200`, run-audit HTTP `200`, score `0`, `web_search`/`web_fetch` unavailable with HTTP `401`.
- Post-redeploy production smoke passed for `charles@getciteable.nanocorp.app`: capture HTTP `200`, audit ID `cf528319-fffe-4aeb-9dd5-ba37da773848`, run-audit HTTP `200`, score `23`, `raw_results.emailSent` = `true`.
- DB verification for audit `cf528319-fffe-4aeb-9dd5-ba37da773848`: `score = 23`, `email_sent = true`, `email_error` empty, completed at `2026-07-05T07:38:54.457Z`.
- Outbound email verification: `nanocorp emails list --direction outbound --limit 10` showed email ID `7e212cd4-5760-46bc-ac97-ae6024e2f846` to `charles@getciteable.nanocorp.app` with subject `Your Citeable AI Visibility Report — Citeable` at `2026-07-05T07:38:53.938027`.

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

## 2026-07-04 — Fix capture form fold position

### Problem
On 1280×577px viewport, the email capture form was positioned at ~587px from the top — just below the fold, making it invisible without scroll.

### Changes made (commit `0d1bd94`)
- `src/app/page.tsx` hero section only; no copywriting changes.
- Hero `padding-top`: `7rem` → `2rem` (saved 80px)
- Eyebrow `marginBottom`: `2rem` → `1rem` (saved 16px)
- H1 `font-size`: `clamp(2.8rem, 7vw, 5.5rem)` → `clamp(2.5rem, 5vw, 3.75rem)` (saved ~58px of vertical height)
- H1 `marginBottom`: `1.75rem` → `1rem` (saved 12px)
- Subheadline `font-size`: `1.15rem` → `1.05rem`, `lineHeight`: `1.7` → `1.6`, `marginBottom`: `3rem` → `1.5rem`

### Result
- Form top measured at **396.9px** on 1280×577 viewport (below 400px target ✓).
- All inputs + "Get free audit →" button fully visible within 577px viewport height.
- Mobile (375px) layout remains centered and readable.

## 2026-07-05 — Fix website URL field and production audit queue

### Findings
- Per `AGENTS.md`, installed dependencies and read local Next.js 16.2 docs before route changes:
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`
- The homepage website field was `type="url"`, so browsers rejected bare domains like `www.keyban.fr` before the app could normalize them.
- The audit was queued by `/api/capture-email`, then started by a client-side fire-and-forget `/api/run-audit` call from `src/app/page.tsx`; this is unreliable in production because the browser can navigate before the request runs.
- Production had `NANOCORP_TOKEN`, `NANOCORP_BACKEND_URL`, and `DATABASE_URL` configured, but recent failed audits showed `NanoCorp web_fetch failed with HTTP 401` and `NanoCorp send_email failed with HTTP 401`, indicating the production `NANOCORP_TOKEN` secret is invalid/expired.
- The worker sandbox `NANOCORP_TOKEN` successfully called the internal NanoCorp `web_search` and `web_fetch` tools, but `nanocorp whoami --json` showed it expires at `2026-07-05T19:18:17.451958Z`, so it must not be used as a durable production secret.

### Changes made
- Changed the homepage website input in `src/app/page.tsx` from `type="url"` to `type="text"` with URL-friendly input hints so bare domains are accepted by the browser.
- Strengthened `normalizeWebsiteUrl()` in `src/lib/audit-engine.ts` to accept `keyban.fr`, `www.keyban.fr`, and `https://keyban.fr`, prepend `https://` when no scheme is present, lowercase the hostname, and reject only clearly invalid/non-domain values.
- Removed the client fire-and-forget audit start from the homepage submit handler.
- Updated `/api/capture-email` to use Next.js `after()` and start `runQueuedAudit()` server-side after returning the queued audit id.
- Added `runQueuedAudit()` with a Postgres advisory lock so the capture route and audit poller can safely race without double-running prompts.
- Changed `runAudit()` to hard-fail if zero NanoCorp prompts run, instead of completing a misleading `0/100` report with `0/0 prompts`.
- Updated `/api/run-audit` to use the shared queued runner and surface failed audit state instead of repeatedly retrying silently.
- Updated the audit report page to stop polling and display a clear failed state when server-side NanoCorp tools cannot run.

### Verification
- `npm run build` passed on Next.js 16.2.10.
- Local built-server smoke test posted `website_url: "www.keyban.fr"` to `/api/capture-email`; the stored URL normalized to `https://www.keyban.fr/`.
- Local built-server smoke audit completed with audit ID `5a6545c7-0147-4cba-b02a-38256f06092d`, score `90/100`, 2 reachable engines out of 8 listed engines, and `emailSent=true` using the sandbox token.

### Production follow-up
- A durable production NanoCorp API token is still required in the existing `NANOCORP_TOKEN` Vercel secret if live production tests continue to return HTTP 401 from NanoCorp tools.

### Production verification after deploy
- Commit `036550b` was pushed to `main` and the live homepage DOM showed `#website-url` as `type="text"`.
- Live browser check set `#website-url` to `www.keyban.fr`; `checkValidity()` returned `true` with an empty validation message, confirming the browser no longer rejects the bare domain.
- Live Shopify E2E submission created audit ID `885b2fd2-55bd-4e44-a3dc-db55a4fb789c` for `Shopify`, normalized `www.shopify.com` to `https://www.shopify.com/`, then failed honestly before scoring because no NanoCorp prompts could run.
- Live failure stored in Postgres: `No NanoCorp prompts ran. Check NANOCORP_TOKEN production secret and NanoCorp tool access. Brave web_search snippets: NanoCorp web_search failed with HTTP 401: API key expired; Perplexity.ai public search page: NanoCorp web_fetch failed with HTTP 401: API key expired`.
- Live score remained `NULL`, reachable engines `0`, and no report email was sent for `worker-live@getciteable.nanocorp.app` because the audit stopped before `send_email`.
- Required owner action: replace the existing production/preview Vercel secret `NANOCORP_TOKEN` in Company Settings > Secrets with a durable NanoCorp service token that can execute `web_search`, `web_fetch`, and `send_email`, then redeploy/retest.
