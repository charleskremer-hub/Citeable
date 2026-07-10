# ICP 3 segments — real audit smoke reports (2026-07-10)

All three examples were run through the local production build against real public sites with real Gemini calls (`realLlmCall=true`).

## A — petites marques / e-commerce

- Audit ID: `31ba43a1-b1f4-47df-ac4d-3db70ef71ab6`
- Brand/site: `Allbirds` — `https://www.allbirds.com/`
- Detected category: `DTC footwear brand`
- Detected segment: `small_brand_ecommerce` / Small brand / ecommerce
- Intended question family: `best brand of [product]`
- Engine: Gemini `gemini-flash-latest`, real call: `True`
- Score: `96/100`

### Questions asked

- `What is the best sustainable sneaker brand?` → brand mentioned `True`; competitors: Veja, Cariuma, Thousand Fell
- `Best eco-friendly running shoe brand?` → brand mentioned `True`; competitors: Veja, Hylo Athletics, On
- `Is Allbirds a good sustainable shoe brand?` → brand mentioned `True`; competitors: Veja, Cariuma

### Segment-fit fixes / remediation focus

- Add Organization JSON-LD schema and complete OpenGraph title/description tags on the homepage.
- Segment focus: FAQ
- Segment focus: product pages
- Segment focus: reviews
- Segment focus: third-party listicles

## B — indépendants / professions libérales locales

- Audit ID: `6c5bb3f0-cf4e-450b-b9ad-f935498446b5`
- Brand/site: `TrainMe Coach` — `https://www.trainme.coach/`
- Detected category: `fitness coach`
- Detected segment: `local_independent` / Local independent / professional service
- Intended question family: `best [profession] in [city] / near me`
- Engine: Gemini `gemini-flash-latest`, real call: `True`
- Score: `79/100`

### Questions asked

- `meilleur coach sportif près de moi` → brand mentioned `True`; competitors: Superprof, ProTrainer, Just Coaching
- `coach sportif près de moi` → brand mentioned `True`; competitors: Ownsport, ProTrainer, Superprof, Just Coaching
- `coach sportif recommandé près de moi` → brand mentioned `True`; competitors: Ownsport, ProTrainer, Superprof, Just Coaching

### Segment-fit fixes / remediation focus

- Add Organization JSON-LD schema and complete OpenGraph title/description tags on the homepage.
- Complete Google Business Profile, professional directories, and local citation pages with the same profession, city, services, and booking link.
- Publish accessible robots.txt and sitemap.xml files so search and answer engines can discover key pages.
- Build authoritative third-party coverage and Wikidata-style entity consistency before pursuing encyclopedia visibility.
- Segment focus: why choose me page
- Segment focus: local reviews

## C — créateurs / influenceurs

- Audit ID: `9160bc2d-b1b0-4a31-a065-3d4350b4c876`
- Brand/site: `Marques Brownlee` — `https://mkbhd.com/`
- Detected category: `creator`
- Detected segment: `creator_influencer` / Creator / influencer
- Intended question family: `best [niche] creator to follow / top [niche] creators`
- Engine: Gemini `gemini-flash-latest`, real call: `True`
- Score: `100/100`

### Questions asked

- `best tech creator to follow` → brand mentioned `True`; competitors: Linus Tech Tips, MrWhoTheBoss, Dave2D, Austin Evans
- `top tech creators` → brand mentioned `True`; competitors: Linus Tech Tips, Mrwhosetheboss, Dave2D
- `best tech influencer to follow` → brand mentioned `True`; competitors: Linus Tech Tips, Mrwhosetheboss, Austin Evans

### Segment-fit fixes / remediation focus

- Maintain social bios, creator profiles, top-creator listicle mentions, press, and entity proof so AI keeps recommending the creator.
- Segment focus: social profiles
- Segment focus: top creator listicles
- Segment focus: press / Wikipedia eligibility
