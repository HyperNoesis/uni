# Security notes

- Secrets: `SESSION_SECRET` and `INTERNAL_SECRET` must be set in production; both servers refuse to start with the dev defaults when `NODE_ENV=production`.
- Tokens: HMAC-SHA256, constant-time compare, expiry enforced.
- Input: every request body and WebSocket message is validated with Zod; bodies capped at 16 KB (API) and 2 KB (WS).
- Abuse: global and per-route rate limits on the API; per-connection message cap on realtime; cooldown and daily reward cap on activities.
- Anti-cheat: movement speed clamp, replayed input rejection, server-measured activity timing, proximity attestation, idempotent ledger.
- Browser: nosniff, referrer policy and frame denial headers; CORS and WebSocket origin restricted to `API_ORIGIN`.
- Privacy: display names are public and chosen by the player; no email, phone, location or contact data is collected in this slice.

Before real users: add real authentication, name moderation, chat reporting, CSRF review if cookies are adopted, a TLS terminator, and structured logging with correlation ids (the API already emits `x-correlation-id`).

- Admin console: bearer token compared in constant time, failed logins throttled per address, every privileged request and failed attempt audited; production refuses to start without a 32+ character `ADMIN_TOKEN`.
- Logging: secrets (tokens, passwords, authorization headers, cookies, API keys) are redacted by the shared logger and the API's pino config.
- Database: `ledger_entries` and `audit_logs` reject UPDATE and DELETE; `currencies.is_redeemable` is pinned to false.
