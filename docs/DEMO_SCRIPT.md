# Faculty demonstration script

## Before the demo

1. Configure a reachable MongoDB URI and a random 32+ character JWT secret in the private workspace `.env`.
2. Configure `FRONTEND_ORIGIN` to the exact Nimbus preview origin when it is not `http://localhost:5173`.
3. Start with `npm run dev`, open the Vite preview, and check `GET /api/health` reports HTTP 200 and `database: connected`.
4. Set a private `ADMIN_NAME`, `ADMIN_EMAIL`, and strong `ADMIN_PASSWORD` (12+ characters), then run `npm run seed:admin`. Do not put the password in slides, source or checked-in docs. No sample doctor/hospital records are inserted by the project.

## Walkthrough (about 8–12 minutes)

1. **Public discovery:** Show the home page, the approved-only doctor directory and the hospital search/list. Before records exist, the honest empty states are expected.
2. **Doctor review gate:** Register a doctor via the doctor registration form. Explain that normal registration cannot request an admin role and doctor profiles begin pending. Confirm the doctor is absent from public search.
3. **Admin controls:** Sign in with the workspace-seeded admin account. Open the admin overview and explain statistics are database counts. Review and approve the test doctor. Demonstrate that user listing excludes password hashes; show hospital add/publish/unpublish using only clearly labelled test directory data, not a claim that it is a real care centre.
4. **Availability and booking:** As the doctor, add a future slot, save it, and sign out. As a patient, register, locate the approved test doctor, select that slot and submit a short reason. Show the patient-only appointment list.
5. **State transition and collision:** As the doctor, confirm or reject the request. As the patient, refresh and verify persisted status; cancel only an eligible request. Optionally send two requests for the same active slot (different test patients) and show the unique index returns a conflict for one.
6. **Patient reminders:** Add a personal reminder, view it in the patient workspace, deactivate/reactivate it, and remove it. Explain it does not trigger background notifications or prescribe medicine.
7. **Safety and accessibility:** Open symptom guidance, show the mandatory disclaimer and explain the local rule example is not AI or clinical triage. Review the upgraded profile pages and their account summary.
8. **Wrap up:** Explain the React → API → Mongoose/MongoDB flow, HttpOnly cookie authentication, backend role checks, and current limits. Mention maps, video calls and push notifications are not included.

## Clean up

Use fictional test accounts and sample data only in a dedicated development database. Remove demo records through authorized admin actions if the database will be reused. Never use actual patient health data or real passwords in the academic demonstration.
