# Citeable funnel diagnostic — 2026-07-16

## Executive diagnosis

The landing page form is not hidden or technically broken. On a fresh 390px mobile viewport, the business input, website input, email input, and submit button are all visible without scrolling, and a real submission for `Allbirds / allbirds.com` generated audit `3e389183-385d-46b7-bc49-0c3c6f66dbbc`. The `audit_requested` PostHog event also fired during that successful submit.

The likely Step 1 failure is not a routing bug; it is friction/trust plus an analytics blind spot. Facebook traffic lands on `/`, but cold visitors are asked for business name, website, and email before seeing any value. On mobile, the form card hides its own title/subtitle/free badge, so the card appears as three bare fields plus a button. Current analytics only records successful captures as `audit_requested`, so it cannot tell whether visitors clicked and failed validation, rage-clicked fields/buttons, or never attempted the form.

## Evidence

- Mobile above-the-fold screenshot: `artifacts/diagnostics/funnel-2026-07-16/mobile-above-fold.png`.
- Desktop above-the-fold screenshot: `artifacts/diagnostics/funnel-2026-07-16/desktop-above-fold.png`.
- Filled mobile form screenshot: `artifacts/diagnostics/funnel-2026-07-16/mobile-filled-form.png`.
- PostHog event sequence from successful mobile submit: `artifacts/diagnostics/funnel-2026-07-16/mobile-posthog-event-sequence.json`.
- Analytics/ad destination export: `artifacts/diagnostics/funnel-2026-07-16/analytics-and-ad-destination.json`.

## Findings

1. **Not hidden on mobile:** at 390x844, element boxes were `#brand-name` y=248, `#website-url` y=312, `#email` y=376, and submit y=440, all above the fold. Desktop boxes were also above the fold (`#brand-name` y=206, submit y=398).
2. **Form works:** entering `Allbirds`, `allbirds.com`, and a diagnostic email redirected to `/audit/3e389183-385d-46b7-bc49-0c3c6f66dbbc`, where the report rendered with score `100/100`.
3. **`audit_requested` is wired after success, not raw submit:** `src/app/HomeClient.tsx:33` handles submit, `src/app/HomeClient.tsx:39` posts to `/api/capture-email`, and `src/app/HomeClient.tsx:49` emits `window.posthog?.capture("audit_requested", ...)` only after a successful API response and redirect URL.
4. **Analytics can undercount attempts:** required fields live at `src/app/HomeClient.tsx:110` through `src/app/HomeClient.tsx:150`; if browser validation blocks submit, the API returns an error, PostHog is unavailable, or a user rage-clicks/abandons while incomplete, no `audit_requested` event records that attempt.
5. **Mobile trust/context is weaker than desktop:** the form title/subtitle/free badge are inside a `hidden ... sm:flex` block at `src/app/HomeClient.tsx:96` through `src/app/HomeClient.tsx:103`, so mobile visitors see placeholders only, with email required before value at `src/app/HomeClient.tsx:134` through `src/app/HomeClient.tsx:143`.
6. **No client-side load errors found:** `agent-browser console --clear` and `agent-browser errors --clear` returned no page errors on fresh mobile or desktop load.
7. **Ad destination is root:** `nanocorp ads list` reports destination `https://getciteable.nanocorp.app?utm_source=facebook&utm_medium=paid_social&utm_campaign=49b54812-ad64-42d0-bcd2-09344457d29f`, with active countries `US`, `GB`, `CA`, `AU`; this lands on `/`, not a hidden form route.
8. **30-day analytics match the failure:** `/` has 701 pageviews / 357 unique visitors; `l.facebook.com` has 247 visits / 193 unique visitors; `audit_requested` has 24 events / 1 unique visitor; `$rageclick` has 11 events / 2 unique visitors.

## Top likely reasons visitors do not submit

1. **Cold-traffic trust/form friction:** the first conversion asks for three fields including email before showing any sample result. On mobile the card omits the reassuring title/subtitle/free badge, so the form feels more like a lead gate than an instant audit.
2. **No measurement of failed attempts:** because `audit_requested` fires only after successful `/api/capture-email`, the current funnel cannot reveal whether the 11 rageclicks were on form fields, the submit button, nav CTA, or validation/API failure states.
3. **Offer/message mismatch is more likely than a technical break:** the FB ad lands on the correct `/` page, the form is visible, console is clean, submit works, and the event fires. With those ruled out, the 0 real ad submissions likely come from low-intent ad traffic not trusting or understanding the value exchange enough to give email.

## Recommended focused follow-ups

1. Add explicit funnel events for `audit_form_started`, `audit_submit_clicked`, `audit_validation_blocked`, and `audit_submit_failed`, with field-completion properties and source/referrer/UTM.
2. Run a tiny mobile-first friction fix: show the form title/subtitle/free badge on mobile and test a two-step flow that asks for email only after showing a preview/sample value.
3. Pull raw `$rageclick` properties/session recordings if available, or add capture attributes to the form fields, submit button, and nav CTA so the next 48 hours identifies the exact rage-click target.
