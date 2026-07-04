# Citeable — Codebase Documentation

## Project Overview
Citeable is an AI-powered GEO/AEO tool that audits and optimizes how brands appear in AI answer engines (ChatGPT, Perplexity, Google AI Overviews, Gemini, Copilot).

**Live URL:** https://getciteable.nanocorp.app

## Stack
- **Framework:** Next.js 16.2.10 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** PostgreSQL (via `pg` npm package, `DATABASE_URL` env var set on Vercel)
- **Deploy:** Vercel (auto-deploy from GitHub `main` branch)

## File Structure
```
src/
  app/
    page.tsx           # Main landing page (client component)
    layout.tsx         # Root layout: DM Serif Display + DM Sans fonts, analytics script
    globals.css        # Global CSS vars, keyframe animations
    posthog.d.ts       # TypeScript declaration for window.posthog
    api/
      capture-email/
        route.ts       # POST /api/capture-email — stores email in DB
```

## Database
- **Table:** `email_captures`
  - `id` SERIAL PK
  - `email` VARCHAR(255) UNIQUE NOT NULL
  - `created_at` TIMESTAMP DEFAULT NOW()
  - `source` VARCHAR(100) DEFAULT 'landing_page'

## Landing Page Sections
1. **Nav** — Citeable brand + "Get free audit →" CTA link
2. **Hero** — Bold headline, subheadline listing AI engines, email capture form
3. **Social proof strip** — AI engine names
4. **How it works** — 3-step grid (Enter brand, Run prompts, Get action plan)
5. **Pricing** — Free audit (€0) + Ongoing Monitoring (€49/mo) cards
6. **Footer** — Brand name + tagline

## Design
- Dark theme: `#09090B` background, `#F0F0EC` text
- Accent: `#CAFF3C` (electric citron)
- Display font: DM Serif Display (italic for key word in headline)
- Body font: DM Sans
- CSS animations: staggered fade-up on hero elements

## Analytics
PostHog analytics script added to `<head>` in `layout.tsx`.
Custom event: `audit_requested` fired on successful email capture.

## Environment Variables (Vercel)
- `DATABASE_URL` — PostgreSQL connection string (already configured)

## Task History
- **2026-07-04:** Scaffolded Next.js app from empty repo, built landing page, deployed to Vercel. Commit: `8de1b83`.
