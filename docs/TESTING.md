# Testing, verification and remaining defects

The first results below are from the profile round executed in the workspace on 2026-11-03; the bilingual patient-interface and Vercel-preparation round is recorded at the end of this document. Every claim is tied to a command that was actually run.

## Automated tests

`tests/api.test.js` uses Node's built-in runner and Supertest against the configured workspace MongoDB. Each test creates unique synthetic records and teardown deletes only the records created by that run; collections and the database are never cleared or dropped.

Latest execution:

```sh
npm test
# tests 12, pass 12, fail 0 (2026-11-04, health guidance round)
```

Coverage includes:

- Patient registration validation, email normalisation, duplicate handling, bcrypt hashing, login, cookie flags, and persisted profile updates (name, phone).
- Backend role restrictions, pending-doctor exclusion from the public directory, administrator approval, filtered search.
- **Doctor details** for a profile stored without an `availability` field (the reported server error): HTTP 200, canonical name, resolved hospital name, empty availability array, account email absent.
- **Doctor availability** loads for the authenticated doctor (`GET /doctors/me/availability`, previously shadowed by `/doctors/:id/availability`).
- Invalid and unknown doctor identifiers return 400 and 404; unauthenticated availability returns 401.
- Appointment booking, duplicate active slot rejection, status transitions, ownership checks, cancellation.
- Reminder validation, ownership, deactivate and delete.
- Hospital publication gating, admin CRUD, statistics, coordinate validation.
- Health endpoints and live MedlinePlus parsing/caching.
- **Symptom guidance**: derived keyword extraction, server-side emergency-warning flag, live attributed MedlinePlus topics, and rejection of empty, oversized (601 characters) and markup input.

Two original assertions assumed an empty database and failed against this workspace, which stores 162 approved demo doctor profiles and 38 published demo hospitals. They were corrected to assert that the specific pending doctor / unpublished hospital is absent, then present after approval or publication. The behaviour under test is unchanged.

The authentication rate limiter is skipped only when `NODE_ENV === 'test'`, because the suite creates many accounts from one address. It remains active in development and production.

## Frontend checks

```sh
cd client && npm run lint    # exit 0, no warnings
cd client && npm run build   # Vite production build succeeded
```

Production serving was verified against the running Express server: `/`, `/doctors` (SPA fallback) and the built JS/CSS assets all returned HTTP 200.

A class-name audit of the rebuilt components found no missing styles; the only unmatched tokens were the intended template prefixes `alert-${tone}` and `tone-${tone}`.

## End-to-end workflow check

An HTTP workflow script (removed after execution, synthetic records deleted) against the live API passed 24/24 checks:

- Administrator sign-in.
- Doctor registration creating a pending profile; doctor dashboard profile load; profile update.
- Administrator approval; doctor publishes a future slot.
- Doctor appears in approved search.
- Doctor details load without a server error, canonical name, resolved hospital, no email exposure.
- Doctor availability returns the published slot.
- Patient registration and booking (201, Pending); duplicate slot rejected (409).
- Doctor sees the request, confirms it; patient sees Confirmed and cancels.
- Administrator sees the appointment record; patient creates a reminder.
- Published hospital directory returns records; MedlinePlus endpoint responds; SPA route served.

## Browser and responsive verification

**Not performed.** This workspace has no Chrome/Chromium system libraries (`libnss3`, `libglib-2.0`, `libX11`, and others were reported missing) and no root access to install them. A Playwright Chromium binary was downloaded, but the browser cannot launch. Therefore no screenshot, browser-console or viewport evidence exists for 360/390/768/1024/1440px layouts.

What was verified instead: the responsive CSS is defined for 1100/900/720/520px breakpoints (off-canvas navigation, stacked forms, table-to-card conversion, single-column grids), and the production bundle compiles. Layout defects that only appear in a real browser may remain.

## Fixes applied in this round

1. `GET /v1/doctors/:id/availability` threw `TypeError: Cannot read properties of undefined (reading 'filter')` for profiles inserted directly into MongoDB without an `availability` field. Because the doctor-details page requested profile and availability together, this 500 was shown as “An unexpected server error occurred.” Both availability endpoints and the details response now treat a missing array as empty.
2. `GET /v1/doctors/me/availability` was matched by `/v1/doctors/:id/availability` and returned “Invalid doctor ID” to authenticated doctors. The `/doctors/me/*` routes are now declared first.
3. Doctor details no longer return the doctor account email, and `hospital` is normalised to a display name instead of an ObjectId string.
4. Doctor name search also matches legacy profile-level `name` when no populated user name exists.
5. The client no longer duplicates headings or crashes when `hospital` is an ObjectId or when availability is missing. The broken `isDemo` expression was replaced with an explicit demonstration-profile flag.

## Remaining limitations

- No browser-level visual or accessibility audit in this environment (see above).
- Demo doctor profiles stored in the workspace have no availability slots, so booking can only be demonstrated with a newly registered, administrator-approved doctor that publishes slots.
- Tamil covers patient-facing navigation, dashboard, doctor and hospital directories, doctor details, appointments, reminders, profile, healthcare services, authentication and help. Doctor/admin workspaces and long-form educational/legal copy remain in English; server validation messages returned by the API are English.
- Medicine reminders do not send push, SMS or email notifications.
- Online consultation is a request mode only; no meeting link or video service exists.
- Appointments and hospitals are listed with server-side pagination (12 doctors per page, 20 users per page, 50 appointments per request); there is no calendar view.
- External MedlinePlus/GDELT/PubMed services may be unavailable; the UI shows the error and preserves the rest of the page.

## Verification on 2026-11-04 (bilingual patient UI and Vercel preparation)

- `npm --prefix client run lint`: exit 0, no warnings.
- `npm --prefix client run build`: succeeded after retrying in this memory-constrained workspace; JavaScript 552.09 kB (168.39 kB gzip), CSS 61.20 kB (15.62 kB gzip). Vite warns that the JS chunk exceeds 500 kB; the workspace's 2 GB cgroup required `NODE_OPTIONS=--max-old-space-size=384` for the build.
- `npm test`: 11 tests, 11 pass, 0 fail against the configured MongoDB. Test records are removed afterwards.
- Production-mode Express smoke test: `/api/health` 200, `/api/health/db` 200 (`connected`), `/patient` 200, `/doctors/:id` 200, and an unknown path 200 with the SPA fallback that renders the 404 page. The production Content-Security-Policy header is present.
- Translation audit: 299 statically referenced keys exist in both the English and Tamil dictionaries.
- Vercel CLI 65.11.0 is installed but logged out in this environment, so no preview or production deployment was created. `vercel.json`, `api/index.js` and `lib/database.js` are prepared; see [DEPLOYMENT.md](DEPLOYMENT.md).
- Browser-level visual, console and viewport checks remain unperformed because no Chrome/Chromium is available.

## Verification on 2026-11-04 (interface redesign)

The visual layer was rebuilt rather than re-tinted: a deep clinical-blue palette on cool paper, hairline borders in place of gradients and glow shadows, an editorial serif (Newsreader) for page titles with Instrument Sans for UI text, and a custom bridge-and-cross brand mark. All three faces are bundled from Fontsource as variable WOFF2 files, so the interface does not depend on a font CDN and still satisfies the production `font-src 'self' data:` policy.

- `npm --prefix client run lint`: exit 0, no warnings.
- `npm --prefix client run build`: succeeded. JavaScript 552.53 kB (168.58 kB gzip), CSS 63.16 kB (15.64 kB gzip), plus 8 subset WOFF2 assets (about 250 kB total, loaded on demand by `unicode-range`). The existing Vite >500 kB chunk warning remains.
- Class-name audit across `App.jsx` and `LanguageSwitcher.jsx`: 196 class tokens checked; the only selectors without rules are the intended `alert-${tone}` / `tone-${tone}` / `quick-icon-${key}` prefixes, the unused `logout-button` hook and an `option` token produced by the audit's HTML parsing. No layout-critical class is unstyled.
- Contrast review of the new pairs: primary `#0f5580` on white, secondary `#4d6172` on `#f2f6fa`, and the success/warning/error/info text-on-tint pairs all clear 4.5:1. Focus indicators use a 2 px `#0f5580` ring at 2 px offset.
- Not verified: browser rendering, screenshots and viewport behaviour. No Chrome/Chromium can launch in this workspace, so the typography, grid and drawer behaviour are confirmed only by compilation and CSS review.

## Verification on 2026-11-04 (health guidance functionality)

The health guidance page no longer runs a local rule stub. `POST /api/v1/health-information/guidance` validates 1–600 plain-text characters, flags emergency warning phrases server-side, reduces the description to at most five keywords joined with OR, and returns real MedlinePlus topics with attribution. The description itself is neither stored nor echoed; only the derived keywords leave the server.

- MedlinePlus reachability: direct `wsearch.nlm.nih.gov` request returned HTTP 200/XML without any credential — the service is documented as free with no registration, licence or API key, so no key was invented or configured.
- `npm test`: 12 tests, 12 pass, 0 fail. The new guidance test exercises live MedlinePlus results, the emergency flag for “chest pain / difficulty breathing”, and 400 responses for empty, markup and oversized input.
- `npm --prefix client run lint`: exit 0, no warnings. `npm --prefix client run build`: succeeded (Vite >500 kB warning unchanged).
- GDELT: a repeated request returned HTTP 429 with “Please limit requests to one every 5 seconds”. Outbound GDELT calls are now serialized to one per 5.2 seconds; this workspace's earlier timeout was rate-limit related, not a code fault.
- Not verified: browser rendering of the new guidance results and the live news/research cards. No Chrome/Chromium can launch here.

## Verification on 2026-11-04 (role-scoped language and Enter-key navigation)

Tamil is now a patient-only choice: `client/src/i18n/languagePreference.js` resolves the language from the authenticated role, stores the preference per patient account, and never stores one for staff. The selector renders only in the patient header. Forms now share `client/src/smartEnter.js` through `useSmartEnter`, so Enter validates and advances field by field and submits only from the last field.

- `npm test`: 28 tests, 28 pass, 0 fail. The new unit tests cover the role and per-account storage rules, English/Tamil key and placeholder parity, and Enter behaviour for inputs, checkboxes, textareas, selects, radios, hidden/disabled fields, IME composition, modifier keys and the duplicate-submit guard.
- `npm --prefix client run lint`: exit 0, no warnings.
- Static translation audit: every `t('…')` key referenced in `client/src` resolves in the English dictionary.
- `npm --prefix client run build`: **not run to completion in this session.** The container's 2 GB cgroup killed the bundler during the transform step (`oom_kill`), including with `NODE_OPTIONS=--max-old-space-size=384`, the setting recorded as sufficient earlier. Every changed file was transformed individually with esbuild instead (exit 0), which confirms syntax only; bundling and chunk sizes are unverified since the last successful build above.
- Not verified: browser rendering of the translated patient screens and of the new Shift-free Enter flow. No Chrome/Chromium can launch here.

## Manual verification steps

1. `npm run dev`, then open the Vite preview.
2. Sign in as administrator; approve a doctor under **Doctor verification**.
3. Sign in as that doctor; add a future slot under **Availability**.
4. Sign in as a patient; **Find a doctor**, open the profile, request the slot.
5. Confirm as the doctor, then view the status and cancel as the patient.
6. Check the patient overview, appointments, reminders, profile, hospital directory and health guidance at mobile and desktop widths.
