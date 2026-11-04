# MongoDB troubleshooting

## Workspace diagnosis (2026-10-28)

The existing Nimbus workspace had a private `.env` with the legacy variable `MONGO_DB_URI` present (the value is intentionally not displayed or recorded). The already-running backend returned HTTP 200 from `GET /api/health` with the database reporting connected. After the ping-based endpoint was implemented, `GET /api/health/db` also succeeded against the configured workspace database. The application's previous MongoDB failure could not be reproduced during this inspection; available shell inspection did not expose Nimbus startup logs or an Atlas/network error. Do not infer a password, network allowlist, database-name, or server outage cause from this evidence.

A concrete configuration mismatch was found: the project used `MONGO_DB_URI` while the requested standard was `MONGODB_URI`. The server and admin bootstrap now prefer `MONGODB_URI` and accept `MONGO_DB_URI` as a compatibility alias, so the existing Nimbus configuration continues to work. Startup uses bounded selection/connect/socket timeouts and does not log a URI or credentials. A failed connection leaves the HTTP process available for health reporting while database-dependent API requests return HTTP 503; no in-memory data fallback is used.

## Health checks

- `GET /api/health`: HTTP 200 `{ "status": "ok" }` when the backend can respond. This does not prove MongoDB is ready.
- `GET /api/health/db`: runs MongoDB's `ping`; HTTP 200 `{ "status": "ok", "database": "connected" }` when usable, HTTP 503 with a non-sensitive status otherwise.
- Versioned database-backed routes return HTTP 503 with a generic availability message when the Mongoose connection is disconnected.
- Connection logs report connected, disconnected, reconnected, or an error class only. They must never include the connection string, password, stack trace, or credential-bearing URL.

## Required private configuration

Set one database variable in Nimbus's private environment (do not paste its value into chat or source files):

```text
MONGODB_URI=mongodb+srv://<database-user>:<URL-encoded-password>@<cluster-host>/<database-name>?retryWrites=true&w=majority
```

For local MongoDB use the provider-supplied URI format, commonly `mongodb://127.0.0.1:27017/carebridge`. If a username/password contains reserved URI characters, URL-encode those credential components in the provider dashboard/configuration. Do not URL-encode the entire URI. `MONGO_DB_URI` remains accepted for the currently configured older Nimbus variable.

Also configure `JWT_SECRET` with a private random value of at least 32 characters. Do not use either secret in frontend environment variables or commit `.env`.

## If the ping fails

1. Check in Nimbus that `MONGODB_URI` or `MONGO_DB_URI` exists for the backend service (not just the frontend build), and verify the exact variable spelling. Do not reveal its value in logs.
2. Confirm the provider URI's host, database path, authentication database/options and TLS requirements in the provider console.
3. Confirm the database user is active and has appropriate read/write permissions for the intended CareBridge database. The application creates declared indexes, so ensure index-management permission is allowed by provider policy.
4. For Atlas, inspect the provider's Network Access rules and Nimbus's outbound IP/network setup. Add only the specific required Nimbus egress range or provider-supported private network. Do not open access to `0.0.0.0/0` as a debugging shortcut.
5. Check the backend's deployment/runtime logs for the generic connection error class and run `/api/health/db` again. Never print environment values, raw driver error messages, or URI-bearing stack traces.
6. Only after database connectivity works, run the integration tests. They add unique synthetic records and delete only records they created; still prefer the project's designated academic/test database.

No Atlas or Nimbus firewall/security setting was changed during this repair. The source change itself cannot supply missing credentials, grant database privileges, or modify provider network rules.
