# CareBridge REST API

Base path: `/api/v1` (service health endpoints are `/api/health` and `/api/health/db`). Requests/responses use JSON. If MongoDB is disconnected, versioned API requests return HTTP 503 `{ "error": "The database is currently unavailable. Please try again later." }`. Protected routes use the HttpOnly `carebridge_token` cookie; the server also accepts an Authorization Bearer token for API clients. Errors use `{ "error": "message" }`. Lists return `{<items>: [], "pagination": {"page": 1, "limit": 12, "total": 0, "pages": 0}}` where noted.

## Health and external educational information

| Method/path | Access | Response |
| --- | --- | --- |
| `GET /api/health` | Public | `{ "status": "ok" }` while the backend responds; does not imply database readiness |
| `GET /api/health/db` | Public | Runs a MongoDB ping and returns `{ "status": "ok", "database": "connected" }`; HTTP 503 when disconnected/unusable |
| `GET /health-information/search?q=diabetes` | Public, rate-limited | Up to 10 safe JSON health-topic records, source attribution, language and cache status; English MedlinePlus only |
| `POST /health-information/guidance` | Public, rate-limited | `{symptoms}` up to 600 plain-text characters; returns the matched `keywords`, `emergency` warning-sign flag, up to 10 attributed MedlinePlus topics, and `available: false` when the upstream lookup fails. The description is not stored or echoed. |

## Authentication and account

| Method/path | Access | Body / response |
| --- | --- | --- |
| `POST /auth/register/patient` | Public, rate-limited | `{name,email,password,phone?}`; 201 `{user}` and sets session cookie |
| `POST /auth/register/doctor` | Public, rate-limited | `{name,email,password,phone?,specialization,qualification,experienceYears,consultationFee,district,hospital?,biography?}`; 201 `{user,profile}` with pending verification |
| `POST /auth/login` | Public, rate-limited | `{email,password}`; 200 `{user}` and sets session cookie |
| `POST /auth/logout` | Public | Clears session cookie |
| `GET /auth/me` | Signed-in | `{user}` |
| `PATCH /auth/profile` | Signed-in | Optional `{name,phone}`; returns `{user}` |

Registration never accepts a role or password for an administrator. Email is normalized to lowercase. Password minimum is 8 characters; administrator seed password minimum is 12. The safe user projection is `{id,name,email,role,phone,status,createdAt}` and never contains a password hash.

## Doctors

| Method/path | Access | Parameters/body |
| --- | --- | --- |
| `GET /doctors` | Public | Filters: `name`, `specialization`, `district`, `hospital`; `sort=name|fee|experience`; `page`, `limit` (max 50). Approved profiles only. Returns `{doctors,pagination}`. |
| `GET /doctors/:id` | Public | `:id` is the doctor's **user** ID. Approved profile only. Returns canonical `name`, resolved `hospital`/`hospitalName` and an `availability` array (empty when none is stored). Account email is not returned. 400 invalid ID, 404 unknown or unapproved profile. |
| `GET /doctors/:id/availability` | Public | Upcoming slots with `available` computed from active appointments; returns an empty array for profiles stored without an `availability` field. |
| `GET /doctors/me/profile` | Doctor | Current doctor's own profile, including pending/rejected data; `{profile}` |
| `GET /doctors/me/availability` | Doctor | Current doctor's own availability and reserved flags; `{availability}` |
| `PATCH /doctors/me/profile` | Doctor | Allowed profile fields only; `{profile}` |
| `PUT /doctors/me/availability` | Doctor | `{availability:[{date:"YYYY-MM-DD",startTime:"HH:mm",endTime:"HH:mm"}]}`; validates future dates, times and duplicates |

## Appointments

| Method/path | Access | Parameters/body |
| --- | --- | --- |
| `POST /appointments` | Patient | `{doctorId,appointmentDate,startTime,reason,consultationMode?}`; mode is `in-person` or `online`; creates `Pending`; 201 `{appointment}` |
| `GET /appointments` | Patient, doctor, admin | Own patient records, own doctor records, or all for admin; optional `status`, `page`, `limit`; `{appointments,pagination}` |
| `GET /appointments/:id` | Patient, doctor, admin | Owner or admin only; `{appointment}` |
| `PATCH /appointments/:id/status` | Patient, doctor, admin | `{status}`; constrained transitions listed below; `{appointment}` |

Transitions: patients can cancel `Pending` or `Confirmed`; doctors can set `Pending` to `Confirmed` or `Rejected`, and `Confirmed` to `Completed`; admins can manage pending/confirmed records as implemented in the transition map. Attempts to change an invalid state return HTTP 409. The database unique partial index prevents concurrent active reservation duplicates. An unavailable slot returns HTTP 409.

## Hospitals

| Method/path | Access | Parameters/body |
| --- | --- | --- |
| `GET /hospitals` | Public | `q` searches name/address; `district`, `service`, `page`, `limit`; published records only; `{hospitals,pagination}` |
| `GET /hospitals/:id` | Public | Published record only; `{hospital}` |
| `GET /admin/hospitals` | Admin | All records, including unpublished; `{hospitals}` |
| `POST /admin/hospitals` | Admin | `{name,address,district,contact?,services?:[],published?:boolean}`; 201 `{hospital}` |
| `PATCH /admin/hospitals/:id` | Admin | Editable hospital fields; `{hospital}` |
| `DELETE /admin/hospitals/:id` | Admin | Deletes record; `{message}` |

## Patient reminders

| Method/path | Access | Parameters/body |
| --- | --- | --- |
| `GET /reminders` | Patient | Own reminders only; `{reminders}` |
| `POST /reminders` | Patient | `{medicineName,reminderTime:"HH:mm",startDate:"YYYY-MM-DD",endDate:"YYYY-MM-DD",instructions?}`; 201 `{reminder}` |
| `PATCH /reminders/:id` | Patient | Own record only; `medicineName`, `instructions`, `reminderTime`, dates, `active`; `{reminder}` |
| `DELETE /reminders/:id` | Patient | Own record only; `{message}` |

Reminder content is patient-entered and does not generate a prescription or notification.

## Administration

| Method/path | Access | Parameters/body |
| --- | --- | --- |
| `GET /admin/stats` | Admin | MongoDB counts for patients/doctors/verification/appointments/hospitals |
| `GET /admin/users` | Admin | Optional `q`, `role`, `status`, `page`, `limit`; passwords excluded; `{users,pagination}` |
| `PATCH /admin/users/:id/status` | Admin | `{status:"active"|"inactive"}`; admins cannot deactivate their own account |
| `GET /admin/doctors?status=pending|approved|rejected` | Admin | `{doctors}` with limited user fields |
| `PATCH /admin/doctors/:id/verification` | Admin | `{status:"approved"|"rejected"}`; `{profile}` |
| `GET /admin/appointments` | Admin | Optional `status`, `page`, `limit`; `{appointments,pagination}` |

## Status/error codes

- `400`: invalid input, date, ID or enum.
- `401`: missing/invalid/expired session or invalid login credentials.
- `403`: wrong role, inactive account, or access to another user's appointment.
- `404`: requested resource is unavailable.
- `409`: duplicate account, occupied slot, or prohibited state transition.
- `429`: authentication rate limit exceeded.
- `500`: unexpected server error (generic message).
- `503 /api/health`: database disconnected.

Pagination is capped to 50 per page. Health-topic summaries are text-only and links are restricted to HTTPS MedlinePlus hostnames. MedlinePlus requests time out after 7 seconds and successful queries are cached in process memory for 18 hours; the endpoint does not forward patient information. Endpoint implementation is in `routes/api.js`.
