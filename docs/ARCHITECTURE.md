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

MedlinePlus is called server-side only for a separately entered English health-topic search; symptoms and patient data are not transmitted. Leaflet renders stored, source-provided coordinates with OpenStreetMap tiles and attribution; it does not geocode. Symptom guidance remains local rule-based educational copy. Patient-facing screens support English and Tamil; administrator and clinical-review workspaces remain in English. Authentication uses a password hash and an HttpOnly JWT session cookie.

## Runtime

`index.js` attempts MongoDB connection with bounded timeouts before starting its HTTP listener. `/api/health` reports backend service response independently of database readiness; `/api/health/db` pings MongoDB. Database-dependent routes return HTTP 503 while MongoDB is unavailable. Production availability requires a valid reachable MongoDB URI and a JWT secret with at least 32 characters.
