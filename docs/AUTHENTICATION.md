# CareBridge authentication and access control

## Session design

CareBridge uses the existing Express authentication API, MongoDB user records and signed JWT session cookie. Passwords are hashed with bcryptjs at persistence and never placed in browser storage. The JWT is stored in an `HttpOnly`, `SameSite=Lax` cookie; production cookies set `Secure`. The client restores the session with `GET /api/v1/auth/me` during application startup and renders a loading state until that request settles. A private page is not rendered while the session status is unknown.

The patient-facing interface is available in English and Tamil, with the choice stored in the browser and a language selector on both the sign-in card and the authenticated header. Accounts are created with an email/password form and sign in with a password; administrator and clinical-review screens remain in English.

Use the API endpoints below; the backend reloads the active account on protected requests, so client-side role/state edits do not grant access:

- `POST /api/v1/auth/register/patient`: creates a patient account, persists it, and establishes its cookie session.
- `POST /api/v1/auth/register/doctor`: creates a doctor user plus a `pending` verification profile. Public registration cannot create administrators.
- `POST /api/v1/auth/login`: validates a persisted user's password and establishes a session cookie.
- `GET /api/v1/auth/me`: validates the cookie and returns a safe public user projection.
- `POST /api/v1/auth/logout`: clears the cookie. The client clears its in-memory user state and navigates to `/login` even when the request fails.

Administrator accounts are initialized with the private `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` settings using `npm run seed:admin`. The seed script refuses to promote an existing non-admin account. Do not expose a public admin-registration option.

## Route behavior

- An unauthenticated visit to `/` redirects to `/login`.
- `/login` is the password sign-in form. It includes patient/doctor registration links, password visibility control, errors, loading state, privacy link, and the healthcare-support disclaimer.
- After login, an internal previously requested route is restored when supplied; external/open redirects are rejected. Otherwise the user is sent to their role dashboard.
- Authenticated visits to `/login` or `/register` redirect to the signed-in user's role dashboard.
- `/home`, `/dashboard`, doctor discovery/details, hospitals, About, and patient/doctor/admin workspaces require an authenticated session. The existing project role paths (`/patient/*`, `/doctor/*`, `/admin/*`) are retained.
- `/privacy` remains available without an account so the login page's privacy link works.
- Navigation links are rendered for the signed-in role only. Backend route authorization and ownership rules remain authoritative.

## Role and data boundaries

Patients can read their own appointments/reminders and may request/cancel eligible appointments. Doctors can read/update their own profile and availability and manage appointments assigned to them. Administrators use server-protected `/api/v1/admin/*` operations. Public doctor searches include approved profiles only. Requests that target another user's private appointment or reminder are rejected by the API. Changing browser state or manually calling an endpoint does not bypass server checks.

## Deployment checks

1. Configure a private `JWT_SECRET` (32+ random characters), MongoDB URI, HTTPS deployment and exact `FRONTEND_ORIGIN` when the UI and API are cross-origin.
2. Verify `/api/health/db`, then register synthetic patient and doctor accounts, approve the doctor through an admin account, and test a booking.
3. Confirm login refresh restoration, invalid credentials, patient/doctor/admin role boundaries, logout and browser back navigation on the actual Nimbus preview.
4. The current automation does not include browser E2E tooling, so route rendering/back-button behavior still needs a manual Nimbus preview check. API role enforcement and database persistence tests run separately.
