# CareBridge — Rural Healthcare Support Platform

**Project 14 · Full Stack Development · Academic Year 2026–2027**  
Kumaraguru College of Technology, Coimbatore

CareBridge is a student academic project for discovering administrator-verified doctors and published healthcare centres, requesting appointments, maintaining personal medicine reminders, and viewing basic educational symptom guidance. The React application communicates with a Node/Express REST API backed by MongoDB and Mongoose.

> **Medical disclaimer:** CareBridge provides general healthcare-support information only. It does not provide a medical diagnosis and is not a replacement for a qualified healthcare professional. In a medical emergency, contact local emergency services immediately. CareBridge is an academic demonstration, not a certified clinical platform.

## Problem statement and objectives

Rural and underserved communities can face difficulty finding nearby care and coordinating appointments. This project demonstrates a web-based directory and workflow that can help users search professional profiles, see doctor-provided time slots, request appointments, and manage basic personal reminders. Objectives include a clear multi-role MERN architecture, secure role-aware data access, a demonstrable booking workflow, and a clear English/Tamil patient interface.

## Student team

| Student | ID | Project role |
| --- | --- | --- |
| Akhilon S | 24BAD008 | Team Lead |
| Jeevanandham K | 24BAD047 | Member -1 |
| Jeevadharan G | 24BAD046 | Member -2 |
| Gowtham S | 24BAD028 | Member -3 |

Suggested responsibilities, not a record of completed contributions, are in [docs/TEAM.md](docs/TEAM.md).

## Features implemented

- Login-first responsive application: unauthenticated visitors land on `/login`; doctor discovery, hospital directory, About, dashboards, and all account pages require a valid session.
- One clinical blue-on-paper interface shared by every role: a single authenticated header, role-specific sidebar navigation, consistent page headings, buttons, forms, cards, tables, status badges and compact empty states, with an off-canvas drawer on small screens. Page titles use an editorial serif against a humanist UI face, both self-hosted so the interface renders the same offline and under the production CSP.
- English and Tamil interfaces with password-based patient and doctor registration and sign-in. Only patient accounts can switch language: the selector appears in the patient header and the choice is remembered for that account, so doctor, administrator and signed-out interfaces stay English. Navigation, the patient dashboard, directories, appointments, profile and help are translated.
- Patient and doctor registration; administrator accounts are created only through the protected seed script.
- Password hashing (bcryptjs), HttpOnly JWT cookie sessions, account status, authentication rate limits, exact-origin CORS, Helmet security headers, request validation, and role-checked APIs.
- Doctor registration creates a **pending** profile. An administrator can review, approve or reject doctors. Only approved profiles are public.
- Server-backed doctor filtering and sorting; doctor-managed available slots.
- Patient appointment requests, doctor accept/reject/complete actions, patient cancellation, per-role appointment access, and unique active doctor/date/start-time index to prevent duplicate bookings.
- Patient-owned medicine reminder create/list/edit(active)/delete.
- Published hospital search, list and optional coordinate-based Leaflet map; admins can record directory coordinates/source, create, publish/unpublish, and delete records.
- Admin statistics, user account deactivation/reactivation, doctor verification, and appointment listing.
- Patient and doctor dashboards; local non-diagnostic symptom guidance plus an English MedlinePlus health-topic search through a rate-limited, cached backend endpoint.
- Separate backend and live MongoDB ping health checks (`/api/health`, `/api/health/db`).

- Upgraded patient and doctor profile pages: identity summary with avatar, editable account or practice details, profile completeness, directory visibility, and sign-in method status.
- Patient dashboard with quick access to doctors, hospitals, healthcare-service search, appointments, profile and help.
- Healthcare-services page that searches published centres by service and nearby OpenStreetMap facilities with directions links and source attribution.
- Help and support page with emergency guidance, common questions, privacy information and limitations, plus a real 404 page for unknown routes.

See the acceptance checklist and limitations in [docs/TESTING.md](docs/TESTING.md). The hospital directory shows a Leaflet/OpenStreetMap map only for records with explicitly entered coordinates; no public geocoder is used. Government directory import, medicine reminder notifications, video calls, and clinical diagnosis are not implemented.

## Technology stack

- **Frontend:** React 18, Vite, JavaScript, React Router, Axios, Lucide React, CSS, self-hosted Instrument Sans / Newsreader / Noto Sans Tamil variable fonts (Fontsource).
- **Backend:** Node.js, Express 4, Mongoose, bcryptjs, jsonwebtoken, cookie-parser, Helmet, CORS, express-rate-limit, fast-xml-parser.
- **Database:** MongoDB (MongoDB Atlas or a compatible MongoDB server).
- **Tests:** Node's built-in test runner and Supertest against the configured workspace MongoDB.

The code retains the Nimbus starter layout: root `index.js`, `routes/`, `models/`, `client/`; documentation and the admin script have their own folders. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATABASE.md](docs/DATABASE.md).

## Requirements and Nimbus setup

Node.js 20+ and npm are recommended. A reachable MongoDB database is required for persisted application workflows. In Nimbus, use the existing workspace terminal and preview its frontend port.

1. Install packages from the project root (dependencies may already be installed in the workspace):
   ```sh
   npm install
   npm --prefix client install
   ```
2. Configure a private root `.env` using `.env.example` as the template. Never commit `.env` or share its secrets. Set `MONGODB_URI` to the Nimbus-provided or Atlas URI and create a random `JWT_SECRET` of at least 32 characters. The legacy `MONGO_DB_URI` name remains supported for existing workspaces. `FRONTEND_ORIGIN` defaults to `http://localhost:5173`; same-host website/API requests are allowed automatically. If the frontend and API are hosted on different domains, set the frontend's exact origin in this comma-separated allowlist. 
3. Start both applications:
   ```sh
   npm run dev
   ```
   The Vite frontend listens on port 5173 and proxies `/api` to Express on port 5000. Open the Vite preview in Nimbus. Alternatively, `npm run server` and `npm run client` start each service separately.
4. `GET http://localhost:5000/api/health` confirms the backend responds. `GET http://localhost:5000/api/health/db` performs a MongoDB ping and returns HTTP 200 when the database is usable or HTTP 503 when disconnected.
5. For a production-style single server, build the client with `npm --prefix client run build`, configure environment variables, then run `npm start`. Express serves `client/dist`. The MedlinePlus feature uses a public, keyless endpoint and needs no credential. Optional `VITE_MAP_TILE_URL` configures a compatible tile template; default is OpenStreetMap's public standard tile URL, subject to its usage policy.

### Vercel deployment

The repository includes `vercel.json`, which deploys CareBridge as two Vercel services: an Express service (`index.js`, the existing API) and a Vite service (`client`) serving the React build from Vercel's CDN. `/api/*` rewrites to the Express service, and every other path rewrites to the Vite service, whose SPA fallback serves `index.html` so `/patient` and other deep links work on refresh.

1. Link the existing Git repository to the existing Vercel project rather than creating a duplicate.
2. Add `MONGODB_URI`, `JWT_SECRET` and `NODE_ENV=production` to Preview and Production environment variables, then redeploy (existing deployments keep their old variables). To show the same data as local development, paste the exact `MONGODB_URI` and `JWT_SECRET` values from your private `.env`; that database is remote, so Vercel can reach it directly. Do not prefix server secrets with `VITE_`. See `.env.example` and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#sharing-the-database-used-in-development).
3. Leave the project-level build command and output directory empty: install, build and output settings live per service in `vercel.json` (the Vite service builds `client/dist`).
4. Deploy a preview, verify `/api/health`, `/api/health/db`, sign-in, directories and direct access to `/patient`, then promote it to production.

Full details and a verification checklist are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Vercel account login and dashboard configuration require the account owner and cannot be completed from the repository alone.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes for persistence | MongoDB connection URI (legacy `MONGO_DB_URI` is accepted) |
| `JWT_SECRET` | Yes for sign-in | Random secret, 32+ characters |
| `PORT` | No | Express port; default `5000` |
| `NODE_ENV` | No | Set `production` for production cookie/security behavior |
| `FRONTEND_ORIGIN` | No | Exact allowed frontend origins, comma-separated; default Vite localhost origin |
| `ADMIN_NAME` | Seed only | Initial administrator display name |
| `ADMIN_EMAIL` | Seed only | Initial administrator email |
| `ADMIN_PASSWORD` | Seed only | Initial administrator password, at least 12 characters |

## Administrator and demo data

No administrator login or sample patient, doctor, or hospital records are hardcoded. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD` privately, then run:

```sh
npm run seed:admin
```

This creates the first admin, or explicitly rotates the password for an already-admin account with that email. It refuses to promote an existing non-admin account. Keep the seed credentials private and change them after a demonstration if needed. Patient and doctor accounts can be registered in the UI. Doctor profiles require admin approval. Admins can add hospital records; the directory intentionally remains empty until real, reviewed information has been entered. Do not use fictional provider details as real healthcare advice.

## Main workflows to demonstrate

1. Sign in as an admin created by the seed script.
2. Register a doctor using `/register?role=doctor`; show that the profile remains pending and does not appear in public search.
3. As admin, approve the doctor under **Doctor verification**.
4. Sign in as that doctor, add future availability under **Manage availability**, and review appointment requests.
5. Register/sign in as a patient, search the approved doctor, select an available slot, and request an appointment.
6. Sign in as the doctor, confirm or reject the request; as patient, show the updated status and optionally cancel an eligible request.
7. Add a patient-owned reminder and inspect it on the dashboard. Add/publish a hospital as admin and search the public directory.
8. Sign out and back in, then open the clearly labelled educational symptom-guidance page and review the upgraded profile pages.

More details: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## API and security

APIs are under `/api/v1` and respond with JSON. All admin mutations and personal record endpoints check the authenticated role on the server. Sessions use HttpOnly cookies; the client uses `withCredentials`, same-site `Lax`, and secure cookies in production. The login endpoints are rate-limited. Never put passwords, JWT secrets, or database credentials into source control. Full endpoint summaries are in [docs/API.md](docs/API.md).

## Known limitations and future enhancements

- Database credentials and availability are workspace-specific. The application can start without MongoDB to expose its health status, but MongoDB-backed workflows will not persist or succeed until a database is reachable.
- There are no prefilled fictional doctors or hospitals. Admins must add reviewed directory data.
- The hospital map displays only coordinates recorded by an administrator; listings without coordinates remain searchable in the directory. Browser location is optional and not stored. OpenStreetMap public tiles are best-effort and must not be bulk-fetched.
- Medicine reminders are saved and shown in the application; they do not trigger background, push, SMS, or email notifications.
- Online consultation is a request mode only. No video-call service, meeting link, or telemedicine workflow is implemented.
- Symptom guidance is a small local rule-based educational example, not AI, a validated triage tool, or a diagnosis.
- Automated API workflow tests connect to the configured workspace MongoDB using unique synthetic records and clean up only those created records. A visual/browser accessibility audit has not been performed.

Potential future work includes reviewed provider onboarding, map/list enhancements, calendar slots, notifications with consent, profile photo uploads, and broader browser automation. These are not current capabilities.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Authentication and login-first routing](docs/AUTHENTICATION.md)
- [External APIs and map attribution](docs/EXTERNAL_APIS.md)
- [REST API](docs/API.md)
- [Database](docs/DATABASE.md)
- [Database troubleshooting](docs/DATABASE_TROUBLESHOOTING.md)
- [Vercel deployment](docs/DEPLOYMENT.md)
- [Testing and acceptance checklist](docs/TESTING.md)
- [Faculty demo script](docs/DEMO_SCRIPT.md)
- [Team and learning topics](docs/TEAM.md)
