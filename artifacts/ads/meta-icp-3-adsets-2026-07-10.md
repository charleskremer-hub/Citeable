# Citeable Meta Ads — 3 ICP ad sets separated (2026-07-10)

## Platform status
- Worker access is read-only via `nanocorp ads list`; no worker command exists to create, edit, pause, or budget Meta ad sets.
- Current applied state observed on 2026-07-10: one active traffic campaign `49b54812-ad64-42d0-bcd2-09344457d29f`, daily cap `$5/day`, countries `US`, `GB`, `CA`, `AU`, destination `https://getciteable.nanocorp.app?utm_source=facebook&utm_medium=paid_social&utm_campaign=49b54812-ad64-42d0-bcd2-09344457d29f`.
- Therefore the 3-ad-set split below is the exact structure Charles must apply in Meta Ads Manager / NanoCorp owner Ads UI. Total budget remains unchanged at `$5/day`.

## Campaign rule
Never run one broad mixed audience. Use three separate ad sets so CPA is measured by segment and losers can be cut independently. Creator/influencer is the risk segment to watch first.

## Ad set A — petites marques / e-commerce
- Name: `ICP A — Small brands ecommerce — AI brand recommendations`
- Daily budget: `$1.67/day`
- Audience: founders/operators of small ecommerce brands, DTC brands, Shopify/WooCommerce stores, product brands, boutique online stores.
- Intent in creative: “best [product] brand” / “meilleure marque de [produit]”.
- Primary copy: `When buyers ask AI “best [product] brand”, does it recommend you — or a competitor? Citeable checks real AI answers, then gives FAQ, product-page, review, and listicle fixes.`
- Headline: `Does AI recommend your brand?`
- Creative concept: screenshot-style card with prompt `best sustainable sneaker brand` → `Not cited yet` → `Fix FAQ + product proof + listicles`.
- CTA: `Run free audit` / `Audit gratuit`.
- Landing URL: `https://getciteable.nanocorp.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=icp_3_segments&utm_content=small_brands`

## Ad set B — indépendants / professions libérales locales
- Name: `ICP B — Local independents — near me recommendations`
- Daily budget: `$1.67/day`
- Audience: coaches, therapists, psychologists, physios/kines, consultants, lawyers, local agencies, and service pros with a city/local catchment.
- Intent in creative: “best [profession] in [city]” / “meilleur [métier] à [ville]” / “near me”.
- Primary copy: `When someone asks AI “best coach near me” or “best therapist in [city]”, are you mentioned? Citeable checks the real answer and tells you what to fix: Google Business Profile, directories, “why choose me” page, and reviews.`
- Headline: `Do local AI searches mention you?`
- Creative concept: local map/profile card with prompt `best fitness coach near me` → `Google Business + directories + reviews`.
- CTA: `Run free audit` / `Audit gratuit`.
- Landing URL: `https://getciteable.nanocorp.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=icp_3_segments&utm_content=local_independents`

## Ad set C — créateurs / influenceurs
- Name: `ICP C — Creators influencers — top creators to follow`
- Daily budget: `$1.66/day`
- Audience: creators, influencers, YouTubers, TikTok/Instagram creators, newsletter writers, podcasters, educators, and niche experts.
- Intent in creative: “best [niche] creator to follow” / “top [niche] creators”.
- Primary copy: `When AI lists “top [niche] creators to follow”, are you in the answer? Citeable checks real AI answers and gives fixes for your bios, social profiles, listicle mentions, press, and Wikipedia/entity proof.`
- Headline: `Are you in AI’s creator lists?`
- Creative concept: creator profile/listicle card with prompt `top fitness creators to follow` → `Bio + profiles + listicles + press`.
- CTA: `Run free audit` / `Audit gratuit`.
- Landing URL: `https://getciteable.nanocorp.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=icp_3_segments&utm_content=creators`

## Measurement and cut rules
- Measure CPA per ad set only; do not blend results across segments.
- Keep total campaign budget at `$5/day` split `$1.67 / $1.67 / $1.66`.
- If Meta requires campaign budget optimization instead of ad-set budgets, set campaign budget `$5/day` and use ad-set spend limits/caps to preserve the split as closely as possible.
- Cut/disable the worst CPA segment after enough spend to compare; watch creators first because Charles flagged it as risk #1.
- Do not reallocate saved budget into a broad mixed audience; reallocate only into winning separate segment ad sets.

## Applied vs Charles to do
- Applied in repo/product: audit now detects 3 ICP segments and changes questions/fixes per segment.
- Applied in repo/artifacts: this 3-ad-set structure and copy is documented for handoff.
- Charles to do in Meta Ads Manager: create or duplicate into the three ad sets above, paste segment-specific copy/creative, split the unchanged `$5/day` budget, add UTMs, publish, then monitor CPA per segment.
