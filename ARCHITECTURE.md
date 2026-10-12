# Architecture

```
 browser (Next.js, canvas)
   │  HTTPS /api/v1            │  WebSocket
   ▼                           ▼
 api (Fastify) ◄──────────── realtime (ws rooms)
   ▲   internal proximity grant  (shared secret)
   │
 Store (in-memory now → Postgres + Redis)
```

## Authority rules

1. **The client sends intent, never outcomes.** Movement is a claimed position that the server clamps to max speed (`validateMove`); activity completion carries only a run id.
2. **Time is measured by the server.** The reaction activity returns a server-chosen delay; reward is computed from server timestamps. Sub-human (<90 ms) or pre-signal taps earn nothing.
3. **Proximity is attested, not claimed.** Realtime checks distance to an interaction point and posts a short-lived grant to the API (`/internal/proximity-grant`, shared secret). The API refuses to start an activity without it.
4. **Money-like state is a ledger.** `Store.appendLedger` is append-only and idempotent per `(actor, key)`. Balance is a cache that `reconcile()` can recompute from entries. Responses to completion calls are replayed for the same `Idempotency-Key`.

## Realtime

One `Room` per ≤60 players; overflow spawns another instance. Snapshots at 12 Hz are filtered by interest radius (40 units). Input carries a sequence number; stale/replayed sequences are ignored; corrections return the authoritative position. Disconnected players are held 30 s and can resume with a reconnect token. Per-connection message cap is 40/s; payloads are capped at 2 KB; WebSocket origin is checked; SIGTERM closes sockets with 1012 so clients reconnect.

## Scaling path

Rooms are in-process today. To go horizontal: sticky room assignment via Redis, presence in Redis, and the proximity grant moved to a Redis key with TTL so API and realtime can scale independently.

## Workspace map (Phase 0 baseline)

| Path | Role |
|---|---|
| `apps/web` | Next.js client and PWA shell |
| `apps/api` | Fastify `/api/v1` domain API |
| `apps/realtime` | Authoritative WebSocket rooms |
| `apps/worker` | Async jobs: idempotent in-process `JobQueue` with retry, backoff and dead-letter (Redis/BullMQ adapter later) |
| `apps/admin` | Operations console API: token auth, throttled failed logins, every privileged request audited |
| `packages/domain` | Zod contracts, world geometry, campus map (buildings, collision, ambient NPCs, quality profiles), rules, token signing, structured logger and `AppError` |
| `packages/game-core` | Activity contract and runner, interpolation helpers, feature flags, token bucket |
| `packages/game-content` | Validated zone, activity and season content |
| `packages/analytics` | Typed events, anonymous sessions, PII guard |
| `packages/ui` | Design tokens |
| `infra/` | Dockerfile, SQL migrations, backup/restore scripts, deployment notes |

## Operations

- **Logging:** one JSON line per event with service name and correlation id; secrets are redacted. API uses Fastify's logger with the same redaction on auth headers.
- **Errors:** 4xx keep their message; anything unexpected returns `internal_error` plus a correlation id and is logged server-side.
- **Health:** every process exposes `/healthz` and `/readyz`. Realtime and worker flip `/readyz` to 503 while draining.
- **Data:** `infra/db/migrations/0001_baseline.sql` defines users, profiles, campuses, currencies, wallets, the append-only `ledger_entries` and `audit_logs`, flags, job runs and webhook events. The running services still use the in-memory store until the Postgres adapter lands.

## World rendering and collision (Phase 3)

`domain/campus-map.ts` is the single source for buildings, props, collision and NPC loops. The realtime server uses `collides()` through `validateMove` (authority); the web client uses `slideMove()` for prediction and `apps/web/lib/world-render.ts` for the 2.5D canvas view. Replacing the renderer later (R3F) does not change gameplay or the server. See D-020 to D-023.

## Realtime protocol (Phase 4)

`hello` (token, optional reconnect token) -> `welcome` (full visible set, reconnect token) -> `snapshot` deltas at 12 Hz when something changed, plus a 1 s keepalive. Client sends `input` (seq, x, y), `emote`, `interact`, `ping`. The server validates speed, bounds and collisions, answers bad moves with `correct`, counts corrections per player, and attests proximity to the API before any reward. See D-024 to D-026.

