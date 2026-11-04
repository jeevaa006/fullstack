# CareBridge database design

CareBridge uses MongoDB with Mongoose schemas and timestamps. `MONGODB_URI` selects the database (`MONGO_DB_URI` remains supported for existing Nimbus configurations); this repository does not contain credentials or automatic fictional provider seed data. The current Nimbus workspace had `MONGO_DB_URI` configured and its running API returned a successful MongoDB health result during inspection; the prior reported outage was therefore not reproducible at inspection time.

## Collections and relationships

### `users`

- `name`, normalized unique `email`, `password`, `role`, `phone`, `status`, timestamps.
- Roles: `patient`, `doctor`, `admin`; public registration can only create patient/doctor records. Role is immutable after model creation.
- Password has a bcryptjs pre-save hash hook and is excluded from default queries and JSON output.

### `doctorprofiles`

- Unique `user` reference to a doctor user; `specialization`, `qualification`, `experienceYears`, `consultationFee`, `hospital`, `district`, `biography`, `verificationStatus`, `availability`, timestamps.
- `verificationStatus` is `pending`, `approved`, or `rejected`; default `pending`.
- Availability is an embedded list of `{date,startTime,endTime}` slots. Date/time strings are ISO date and 24-hour time, validated in model/API.
- Compound index on `{verificationStatus,specialization,district}` supports common directory filters.

### `appointments`

- `patient` and `doctor` references to users; `appointmentDate`, `startTime`, `endTime`, limited `reason`, `consultationMode`, `status`, timestamps.
- Status enum: `Pending`, `Confirmed`, `Rejected`, `Cancelled`, `Completed`.
- Unique **partial** index on `{doctor,appointmentDate,startTime}` applies only to `Pending` and `Confirmed` rows. MongoDB enforces one active booking per slot under concurrent requests; terminal statuses release the key.
- The REST transition map and ownership checks apply before status changes.

### `hospitals`

- `name`, `address`, `district`, `contact`, `services`, optional GeoJSON `coordinates`, `source`, `sourceUpdatedAt`, `published`, timestamps.
- Index `{district,published}`. Public reads include published records only; admins manage all records. A Leaflet map uses only stored, range-validated coordinates; absent coordinates stay list-only.

### `medicinereminders`

- `patient` reference; patient-entered `medicineName`, `instructions`, `reminderTime`, `startDate`, `endDate`, `active`, timestamps.
- Patient ownership is applied to every read, update, and delete. A model validator checks the date range.
- Records are display reminders only; there is no prescription engine or notification scheduler.

## Relationships

```text
User(patient) 1 ── * Appointment * ── 1 User(doctor)
User(doctor) 1 ── 1 DoctorProfile (availability embedded in profile)
User(patient) 1 ── * MedicineReminder
Hospital: independent directory record; doctor affiliation currently stored as a display string.
```

## Connection and index setup

On startup, Mongoose connects using `MONGODB_URI` (or legacy `MONGO_DB_URI`) with bounded selection/connect/socket timeouts before the listener starts. `/api/health` checks service response only; `/api/health/db` performs a MongoDB ping and returns HTTP 503 if unavailable. Database workflows return HTTP 503 while disconnected; no in-memory persistence fallback is used. MongoDB creates declared schema indexes; ensure database users have permission to create indexes. Connection logs include status/error class only, never the connection URI.

The appointment unique index is the conflict safeguard; no transaction or multi-document slot update is assumed. If an existing database has historical duplicate active slots, index creation may fail and requires admin review of those records before the index can be created. The workspace test suite connects to the configured workspace MongoDB and creates unique synthetic records; it deletes only test-run IDs and does not clear collections. Review `docs/DATABASE_TROUBLESHOOTING.md` before changing Atlas/Nimbus access settings.
