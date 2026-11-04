# CareBridge architecture

## Component flow

```text
Browser (React 18, Vite, React Router)
  ├─ shared Axios client (`/api/v1`, credentials enabled)
  ├─ AuthContext restores and holds the current user
  └─ responsive pages, role-aware routes, English/Tamil patient copy
             │ HTTP/JSON + HttpOnly cookie
             ▼
Express (`index.js`, port 5000)
  ├─ Helmet, exact-origin CORS, JSON limit, cookie parser
  ├─ `routes/api.js`: validation, authentication, role access, domain queries
  ├─ Mongoose models in `models/`
  └─ consistent JSON errors and `/api/health` + `/api/health/db`
             │ MongoDB wire protocol
             ▼
MongoDB (configured by private `MONGODB_URI`, with legacy `MONGO_DB_URI` support)
```

In development, Vite on port 5173 proxies `/api` requests to port 5000. Cookies use `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`; Axios sends credentials. For browser cross-origin previews, configure the exact frontend origin in `FRONTEND_ORIGIN`. In the production-style setup, Express serves the built Vite assets from `client/dist`.

## Authentication and authorization

Registration accepts only patient or doctor account types. Mongoose hashes passwords before persistence via bcryptjs; comparison is performed at login. The JWT contains the subject ID and expiration, and is stored only in an HttpOnly cookie. On each protected request the server verifies the token, reloads the active user, and checks roles. Role-specific endpoints and ownership filters enforce access again at the API, independent of hidden UI controls. The seed script is the only supported first-admin initializer; user registration cannot set a role.

## Booking consistency

Doctor availability is a stored set of `{date,startTime,endTime}` entries. The booking endpoint checks approval and exact offered slot. Active (`Pending`, `Confirmed`) appointment records have a unique partial MongoDB index on `{doctor, appointmentDate, startTime}`. MongoDB's unique constraint makes concurrent requests for one slot conflict even if both clients saw it as free. `Rejected`, `Cancelled`, and `Completed` appointments do not hold the unique index slot; the API transition rules still determine whether the current actor is allowed to change a state.

## Privacy and boundaries

Passwords are excluded from default reads and user serialization. Patient appointment and reminder queries scope to the signed-in user's ID. Doctors see only appointments addressed to their account; patient identity fields are populated only on authorized appointment surfaces. Public doctor APIs return approved profiles only; public hospital APIs return published records only. Error messages avoid returning internal details for server failures.

MedlinePlus is called server-side only for a separately entered English health-topic search; symptoms and patient data are not transmitted. Leaflet renders stored, source-provided coordinates with OpenStreetMap tiles and attribution; it does not geocode. Symptom guidance remains local rule-based educational copy. Patient-facing screens support English and Tamil; the language is resolved from the authenticated role, so only patient accounts can switch and administrator and clinical-review workspaces remain in English. Authentication uses a password hash and an HttpOnly JWT session cookie.

Forms share one Enter-key convention in `client/src/smartEnter.js`: Enter in a text field validates it and moves to the next enabled, visible field, and Enter in the last field submits through the browser's normal submit path so React handlers and native validation still run. Textareas keep new lines, selects and radio groups keep native behaviour, and IME composition is never intercepted.

## Runtime

`npm start` connects to MongoDB with bounded timeouts before its HTTP listener starts. The Express app also connects on demand: middleware under `/api` awaits the cached connection in `lib/database.js` before the first database-backed `/api/v1` request. That lazy path is what makes Vercel work, because a serverless invocation imports the app instead of running `index.js` as a script, so no process startup hook runs and a connection opened there would never exist.

The cache is stored on `globalThis`, so warm invocations reuse one Mongoose connection and concurrent requests share a single in-flight handshake. A failure clears the cached promise, is reused for two seconds to avoid a handshake per request, is retried on the next request after that, and is logged at most once per thirty seconds with the connection string redacted. `/api/health` reports backend service response independently of database readiness; `/api/health/db` opens the connection and pings MongoDB, reporting `connected` only when the ping succeeds. Database-dependent routes return HTTP 503 while MongoDB is unavailable. Production availability requires a valid reachable MongoDB URI and a JWT secret with at least 32 characters.
