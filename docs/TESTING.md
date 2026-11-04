# Testing, verification and remaining defects

Results below are from the profile and English-only interface round executed in the workspace on 2026-11-03. Every claim is tied to a command that was actually run.

## Automated tests

`tests/api.test.js` uses Node's built-in runner and Supertest against the configured workspace MongoDB. Each test creates unique synthetic records and teardown deletes only the records created by that run; collections and the database are never cleared or dropped.

Latest execution:

```sh
npm test
# tests 11, pass 11, fail 0
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
- The interface is English-only.
- Medicine reminders do not send push, SMS or email notifications.
- Online consultation is a request mode only; no meeting link or video service exists.
- Appointments and hospitals are listed with server-side pagination (12 doctors per page, 20 users per page, 50 appointments per request); there is no calendar view.
- External MedlinePlus/GDELT/PubMed services may be unavailable; the UI shows the error and preserves the rest of the page.

## Manual verification steps

1. `npm run dev`, then open the Vite preview.
2. Sign in as administrator; approve a doctor under **Doctor verification**.
3. Sign in as that doctor; add a future slot under **Availability**.
4. Sign in as a patient; **Find a doctor**, open the profile, request the slot.
5. Confirm as the doctor, then view the status and cancel as the patient.
6. Check the patient overview, appointments, reminders, profile, hospital directory and health guidance at mobile and desktop widths.
