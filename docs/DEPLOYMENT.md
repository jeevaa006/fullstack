# CareBridge deployment

CareBridge is a Vite single-page application plus an Express API and MongoDB database.
The API is deployed as the Express service declared in `vercel.json` (`index.js`), which Vercel
runs as one Vercel Function. The React build is served by a separate Vite service from Vercel's
CDN. No long-running Express process is required.

## How the deployment is wired

| Part | Configuration |
| --- | --- |
| Install | Per service in `vercel.json`: `npm install` at the root, `npm install` inside `client/` |
| Build | The Vite service runs `npm run build`; the Express service rebuilds `client/dist` for its own static fallback |
| Output | `client/dist`, served by the Vite service |
| API | The Express service (`index.js`) mounts every route from `routes/api.js` under `/api` |
| API routing | `vercel.json` rewrites `/api/*` to the Express service, which receives the original `/api/...` path |
| Deep links | every other path rewrites to the Vite service, whose SPA fallback serves `index.html`, so `/patient`, `/doctors/:id` and refreshes work |
| Database | cached Mongoose connection in `lib/database.js`, reused across invocations |

There is no `api/` functions directory. When `services` is present Vercel ignores `api/`, so the
Express service is the single API entry point and `/api/*` must keep rewriting to it.

`GET /api/health` stays available even when MongoDB is unreachable. Database-backed endpoints
return HTTP 503 with a JSON error instead of crashing the function.

## Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for Preview and Production.
All of them are server-side; none may use a `VITE_`/`NEXT_PUBLIC_` prefix.

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Atlas or compatible URI. Restrict network access to Atlas's allowed IP list or use the provider's serverless access option. |
| `JWT_SECRET` | Yes | At least 32 random characters. Rotating it signs every user out. |
| `NODE_ENV` | Yes | Set to `production` so cookies are `Secure` and the production CSP applies. |
| `FRONTEND_ORIGIN` | Optional | Only needed if the API is ever served from a different host. Same-host requests are allowed automatically. |
| `NCBI_EMAIL`, `NCBI_API_KEY` | Optional | Improves PubMed rate-limit compliance. |

## Sharing the database used in development

Local development connects with the private root `.env`, which holds a MongoDB Atlas
`mongodb+srv://` URI for the `carebridge` database. Vercel builds never read `.env` (it is
gitignored), so a deployment without a project environment variable keeps `/api/health` at 200
while every database-backed route returns HTTP 503: the hospital and doctor directories are
empty and sign-in fails.

The Atlas cluster accepts connections from the internet, so the same connection string works
from Vercel unchanged:

1. Copy `MONGODB_URI` from the local `.env` exactly. Do not retype it: the username, password
   and database name are already URL-encoded inside it. The database name is part of the path
   (`mongodb+srv://…/carebridge?retryWrites=true&w=majority`); without it the driver silently
   uses the `test` database and the site stays empty.
2. In **Vercel → Project → Settings → Environment Variables**, add `MONGODB_URI` for Production
   and Preview (choose all environments), then save.
3. Add `JWT_SECRET` with the **same value as local**, so cookies issued before the deployment
   stay valid. A different secret does not touch data; it only forces users to sign in again.
4. Add `NODE_ENV=production`.
5. In **Atlas → Network Access**, allow Vercel. Serverless egress IPs are dynamic, so they cannot
   be pinned; use `0.0.0.0/0` (Atlas enables TLS for `mongodb+srv` URIs) and keep a strong
   database-user password scoped to the `carebridge` database.
6. Redeploy (`Deployments → ⋯ → Redeploy`). Editing a variable does not change deployments that
   already exist, so the new value is only live after a new build.

Environment variables are project-wide, so both services receive them; only the Express service
reads them at runtime.

Verify on the deployed URL and compare with this database's current contents:

| Request | Expected |
| --- | --- |
| `GET /api/health/db` | `{"status":"ok","database":"connected"}` |
| `GET /api/v1/hospitals` | `pagination.total` is 20 (12 per page) |
| `GET /api/v1/doctors` | `pagination.total` is 42 approved profiles (12 per page) |

If `/api/health` returns 200 but `/api/health/db` returns 503, either the variable is missing or
misspelled, or Atlas is refusing Vercel's IP address in Network Access. If it returns 200 but the
directories are empty, the URI points at the wrong database (usually a missing `/carebridge`).

One database shared by development and production means writes on the live site change local
data and vice versa: test accounts, appointments and deletions are shared. For a real launch,
provision a second database, export the current collections with `npm run db:backup` and import
them into it, then point `MONGODB_URI` at the copy. The URI grants full read/write access to
user records with password hashes, so it must stay a server-side variable and never be prefixed
with `VITE_`.

`ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` are for the one-time `npm run seed:admin`
script. Do not add them to Vercel unless you run the seed step locally against the production
database. Remove them afterwards.

`VITE_MAP_TILE_URL` is the only public variable. It is baked in at build time and must never
contain a secret.

## Known build warnings

`npm warn Unknown env config "cache-dir"` is emitted by the npm cache directory that Vercel's
build environment injects as `NPM_CONFIG_CACHE_DIR`. No `.npmrc` exists in this repository and
no script sets it. npm ignores the value (the cache still resolves normally) and only warns, so
installs and builds succeed; the warning disappears only when Vercel stops exporting the
variable.

## Deployment procedure

1. Confirm the repository and production branch in Vercel.
2. Set the environment variables above for Preview and Production.
3. Deploy a preview, then verify:
   - `/` redirects to `/login` when signed out.
   - `/patient` loads directly (SPA deep link).
   - `/api/health` returns `{"status":"ok"}`.
   - `/api/health/db` returns `{"status":"ok","database":"connected"}`.
   - Sign-in sets an `HttpOnly; Secure` cookie.
   - Doctor and hospital directories return database records.
4. Promote the verified deployment to production.
5. Re-check `/patient` and authentication on the production URL.

## Vercel CLI

```sh
npx vercel link      # select the existing project; do not create a duplicate
npx vercel           # preview deployment
npx vercel --prod    # production deployment (after verification)
```

Deployment requires an authenticated Vercel account. Account login and dashboard settings
cannot be performed by the repository itself.

## Not handled by Vercel configuration

- **Database hosting:** MongoDB Atlas or equivalent must be provisioned separately.
- **File uploads:** CareBridge does not currently accept uploads. If added, use object storage
  rather than the serverless filesystem.
- **Background notifications:** medicine reminders are stored only; no scheduler or email/SMS
  worker exists.
- **Long external requests:** Overpass/MedlinePlus calls are capped by the function's 30-second
  timeout. Failures return JSON errors and are cached where supported.
