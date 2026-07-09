# Citeable Meta Ads SMB Refresh — 2026-07-09

## NanoCorp ads status
- `nanocorp ads --help` says ads commands are read-only and owner-controlled from the NanoCorp dashboard; no CLI command is available to regenerate/apply creative, targeting, budgets, or pauses.
- Active campaign snapshot captured in `artifacts/ads/meta-smb-campaign-state-2026-07-09.json`.
- Insights snapshot captured in `artifacts/ads/meta-smb-insights-2026-07-09.json`.
- Current campaign local ID: `49b54812-ad64-42d0-bcd2-09344457d29f`.
- Current budget/cap: `$5/day`; leave unchanged.
- Current status: `ACTIVE`; current creative status: `READY`.
- Current countries from CLI: `FR`, `BE`, `CH`, `DE`, `NL`, `GB`, `US`, `CA`.
- Current measured performance from CLI: spend `$9.51`, impressions `30,349`, clicks `133`, inline link clicks `152`, CTR `0.438235%`, CPC `$0.071504`.

## Creative to apply

### FR default
- Headline: `L'IA recommande-t-elle ton entreprise ?`
- Primary text: `Quand tes clients demandent conseil a une IA, est-ce qu'elle te cite - ou ton concurrent ? Fais l'audit gratuit en 60 secondes. Sans carte, sans installation. Tu vois ton score, qui l'IA choisit a ta place, et quoi corriger.`
- CTA button: `Audit gratuit` preferred; use `En savoir plus` only if Meta/NanoCorp does not support custom CTA text.
- Visual: use `artifacts/ads/meta-smb-creative-fr-2026-07-09.png` or regenerate from `artifacts/ads/meta-smb-creative-fr-2026-07-09.html`.

### EN variant
- Headline: `Does AI recommend your business?`
- Primary text: `When your customers ask AI for advice, does it name you - or your competitor? Run the free 60-second audit. No card, no setup. See your score, who AI picks instead, and what to fix.`
- CTA button: `Free audit` if available; otherwise `Learn More`.
- Visual: use `artifacts/ads/meta-smb-creative-en-2026-07-09.png` or regenerate from `artifacts/ads/meta-smb-creative-en-2026-07-09.html`.

## Targeting to apply manually in Meta Ads Manager
- Locations: prioritize France and English-speaking countries only. Remove `BE`, `CH`, `DE`, and `NL`; keep `FR`, `GB`, `US`, `CA`; add `AU`.
- France traffic priority: if Meta setup allows separate ad sets without increasing spend, split budget/cap as FR `$3.50/day` and EN `$1.50/day`; otherwise keep one ad set with `FR`, `GB`, `US`, `CA`, `AU` and monitor delivery mix.
- Age: `25-55`.
- Languages: French for the FR creative/ad set; English for the EN creative/ad set.
- Detailed targeting: small business owners, business owners, entrepreneurship, small business, e-commerce, Shopify, local business/local marketing, TPE/PME, solo founders.
- Remove broad targeting: no unrestricted all-adults audience; avoid broad standalone AI/technology/marketing interests unless combined with SMB/e-commerce/local-business intent.
- Keep destination URL on `https://getciteable.nanocorp.app` with the existing paid social UTM structure.

## Guardrails
- Budget remains `$5/day`; do not increase.
- Kill-switch remains unchanged: if CPA rises above `€49`, pause the campaign/ad set.
- No model-name jargon in creative or visuals.
