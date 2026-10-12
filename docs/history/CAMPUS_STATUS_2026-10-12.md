# CAMPUS status audit — 12 October 2026

Scope: the `campus_gateA_pass_t` archive, checked against the Master Implementation Prompt, the Phase 4+ Addendum and the Master Build Checklist (1,081 items). Nothing here is a claim of "production-ready".

## 1. Completion rating

Two numbers per area: **Built** = the code/feature exists in the repo. **Verified** = there is test or runtime evidence I (or the repo's own logs) can point to. The checklist itself says an item is only done when verified, so **Verified** is the honest one.

| Scope | Built | Verified |
|---|---|---|
| **Whole game, full vision (all 20 checklist sections)** | **~65 %** | **~34 %** |
| **V1 public-launch scope (everything except Creator Studio / AI)** | ~68 % | ~35 % |
| **"The world" only (sections 05–09: renderer, assets, architecture, 22 zones, avatars/NPCs)** | ~62 % | ~24 % |

Method: each checklist section has a fixed weight (sums to 100); built/verified % per section is my judgement from the code, the dated notes and the evidence below. Treat it as ±5 points, not a measurement. Checklist tag counts for reference: 47 SOURCE, 224 SOURCE/PARTIAL, 486 PARTIAL, 182 PLANNED/MISSING, 142 VERIFY, 0 formally PASS.

| Section | Weight | Built | Verified |
|---|---|---|---|
| 01 Foundation / process | 4 | 75 | 45 |
| 02 Onboarding / navigation | 5 | 85 | 35 |
| 03 Avatar / home / inventory | 5 | 70 | 25 |
| 04 UI / HUD | 6 | 70 | 35 |
| 05 3D renderer / camera / lighting | 7 | 75 | 30 |
| 06 Asset pipeline | 5 | 45 | 30 |
| 07 Architecture / dressing | 5 | 65 | 25 |
| 08 All 22 zones | 8 | 65 | 20 |
| 09 Avatars / NPCs / animation | 5 | 55 | 15 |
| 10 Activities / minigames | 6 | 65 | 45 |
| 11 Realtime multiplayer | 7 | 92 | 78 |
| 12 Social / events | 5 | 75 | 40 |
| 13 Campus Wars / progression | 5 | 75 | 45 |
| 14 Economy / shop / housing | 4 | 75 | 45 |
| 15 Creator Studio / AI | 4 | 0 | 0 |
| 16 Safety / moderation / legal | 6 | 50 | 25 |
| 17 Backend / data / ops | 5 | 70 | 40 |
| 18 Performance / analytics / infra | 6 | 50 | 20 |
| 19 Testing / evidence | 2 | 45 | 45 |

## 2. What I ran this session (exact results)

Environment: Node 22.22, pnpm 10.28. **The npm registry is blocked by this session's egress policy (403), so `pnpm install` could not run.** Everything below was run without it, using the machine's pre-installed `zod`, `ws`, `tsx` and TypeScript, plus a small `node:test` shim for the ~12 vitest matchers the tests use.

| Check | Result |
|---|---|
| `pnpm check:repo`, `check:3d`, `check:ui`, `check:sports`, `check:minigames`, `check:assets` | **6/6 PASS** (22 zones, 160 buildings, 158 enterable rooms, all reachable from spawn; 58 GLBs, 2,361 KiB, 20,783 tris, 0 warnings) |
| Unit tests: domain 70, game-core 8, game-content 3, analytics 3, ui 3, realtime 20, worker 4, admin 5 | **116/116 PASS** |
| Web lib tests (perf-sampler 6, world-architecture-ext 14) — previously never run by CI | **20/20 PASS** |
| API `store.test.ts` (persistence, ledger, idempotency) | **15/15 PASS** |
| Real realtime server + real WebSockets: `tests/e2e/two-clients.mjs` | **PASS** (join, mutual visibility, delta movement, emote sync, reconnect-resume) |
| Real realtime server: new `tests/e2e/phase4-gates.mjs` | **13/13 PASS** (speed-hack burst, double hello, ghost removal, fuzzed payloads, oversize frame, out-of-range interaction, `/metrics`) |
| `tsc --noEmit` on all non-web packages | no real type errors in source (only noise from the shim's missing typings and missing `@types/ws`) |
| The E2E ran against a **throwaway stub of the 5 API endpoints** the realtime server calls (scratchpad, not in the repo). It proves the realtime layer, **not** the real API. | |

**Not run (blocked, not failed):** `pnpm install`, `pnpm typecheck/lint/build` for web + api, API tests `app.test.ts`, `social.test.ts`, `jobs-wars.test.ts` (need Fastify), `pnpm smoke`, `pnpm load`, any real browser or phone.

## 3. Defects found and fixed

1. **Speed-hack hole (server authority).** `validateMove` credited a minimum 50 ms per input; the server allows 40 inputs/s, so a client could be accepted at **2× max speed** (measured 16.2 u/s vs 8.1 u/s limit). Fixed with a per-player movement time bank in `Room.input` (D-045). Regression tests: a flood test and an honest-jitter test (late burst of packets is *not* punished).
2. **Concurrent `hello` race.** Three `hello`s sent before the first finished authenticating could create multiple joins. Fixed with a `helloing` guard (D-046); verified over the wire.
3. **No diagnostics** (Phase 4 gate "Observability"). Added `Room.stats()` and developer-only `GET /metrics` (secret-protected, aggregate only, no names): connected/ghost players, corrections, rejected actions by reason, tick time, rate-limited and malformed counts, disconnect codes (D-047).
4. **Stale test.** `game-content` asserted 9 zones; the world has 22. Fixed (D-048).
5. **Orphaned tests.** `apps/web` test script was an `echo`, so its 20 tests never ran. It now runs `vitest run lib` (needs `pnpm install` once to add vitest to the lockfile).
6. **Gate A.** Added `pnpm e2e:phase4` and a gate step for it.

Files changed: `packages/domain/src/rules.ts`, `apps/realtime/src/room.ts`, `apps/realtime/src/server.ts`, `apps/realtime/src/room.test.ts`, `packages/game-content/src/content.test.ts`, `tests/e2e/phase4-gates.mjs` (new), `package.json`, `apps/web/package.json`, `scripts/gate-a.sh`, `DECISIONS.md`.

## 4. Things I found but did NOT change

- **Lockfile is stale** (`three`, `@types/three` — and now `vitest` in web). Cannot be fixed without registry access. This is why your previous Gate A run failed every step.
- **Persistence is a JSON file snapshot** (well built: atomic write, `.bak`, refuses to boot over unreadable data) and **needs a persistent disk**. The Postgres migrations exist but no adapter uses them. On a host with an ephemeral disk, player progress is lost on redeploy.
- **Proximity grants live in API memory** (`store.grants`), so the realtime→API reward handshake only works with a single API instance.
- **Checklist items 0735–0737 (penalty shootout, delivery, rhythm) are stale**: `check:sports` and `check:minigames` pass, so these exist as logic. They still need a server-authority review, UI evidence and a decision against the "one polished loop first" rule.
- `CAMPUS_GATE_SCORECARD.md` correctly says nothing is PASS; I have not changed it.

## 5. Everything left until the game is "complete"

Ordered by the Addendum's rule: make the current phase undeniably work, then finish one differentiated loop, then widen.

### Gate 0 — you must do these (I cannot, no network/device)
1. On a networked machine: `pnpm install` → **commit the regenerated `pnpm-lock.yaml`** → set `frozen-lockfile` back to true.
2. Run `pnpm gate:a`. Fix whatever fails: web/api typecheck + lint, **API tests** (notes say 5 were stale), production `next build`.
3. Run `pnpm e2e:realtime`, `pnpm e2e:phase4`, `pnpm load` (15 clients) against the **real** API; record the observed room limit.
4. Open two real browsers (and one real Android phone) on the same room; capture screenshots + console/network logs.

### Phase 4 exit (realtime)
5. Real-phone touch controls and safe-area check (390×844, 360×800).
6. Document the measured load limit and overflow behaviour (cap is 60/room; no measured claim yet).
7. Show RTT/p95 in a developer view; confirm reconnect + duplicate-action idempotency against the real API (reward double-grant test).
8. Handle "same account in two tabs" so the two tabs don't keep kicking each other.

### Gate B — first-session loop (the core product)
9. Time landing → first input → world-ready → first activity on a throttled 4G / low-end Android.
10. Verify the full path: avatar → campus → move → meet a real player → complete an activity → server reward → Campus Wars contribution → safe social connection → refresh → everything persisted.
11. Verify the analytics funnel events (checklist 0993–1003) are really emitted and viewable; add D1/D7/weekly-meaningful-session.
12. Invite link and "what changed since you left" return screen.

### Gate C — the world (largest remaining block)
13. Capture every one of the 22 zones at close/medium/far in Low/Balanced/High (the project's own scorecard says only a handful have ever been reviewed in a real frame) and fix what looks wrong.
14. Finish the Grand Gate → Academic Boulevard → Student Commons vista as one polished walkable slice.
15. Human-scale check (2 m avatar, 2.4 m door, 3 m storey) and door/interior/collision walk-through for all 158 enterable rooms.
16. Real art: authored/imported GLB/PBR hero assets, LODs, texture budget (512/1K/2K), evaluate Draco/KTX2, lazy-load zones.
17. Real rigged avatars with walk/run/idle/sit/emote synced in multiplayer (current avatars are stylised parts).
18. NPC collision-aware routes; day/night and event lighting reviewed on a real GPU.
19. Measure FPS, frame time, memory, download bytes on real Android; tune instancing/culling; test WebGL context loss on a real GPU.

### Gate D — safety (before any public growth)
20. Moderator console UI, appeals, report evidence access control, quarantine/suppress, repeat-offender policy.
21. Admin MFA/least privilege; complete audit log (economy, moderation, privileged changes).
22. Two-account safety tests (block suppresses chat/discovery/presence instantly, report reaches the queue, rate limits).
23. Age/safety policy, privacy disclosures, restricted open DMs, log scrubbing (no tokens/messages).
24. Backup/restore and incident runbooks — rehearsed, not just written.

### Gate E — retention systems
25. Campus Wars: season presentation, fairness analysis, snapshots, small-campus fairness, correction/appeal path, published scoring explanation, season-reset test that preserves lifetime achievements.
26. Events: schedule, RSVP/cancel, "next event" surfacing, participation history.
27. Decide the second activity from telemetry; audit shootout/delivery/rhythm for server authority before promoting any.
28. Economy: confirm idempotent ledger end-to-end, no purchasable competitive advantage, shop ↔ room editor item-by-item.

### Gate F — production backend
29. Postgres adapter + controlled migrations; restore tests proving rooms, inventory, ledger, wars, events survive restart.
30. Multi-instance presence/grants (Redis or equivalent) only when measured load needs it.
31. Deploy rollback path, health/readiness on all services, release docs.

### Post-V1 (explicitly deferred by your own documents)
32. Creator Studio v1: templates for room decoration, quiz/quest/scavenger, events; schema validation, moderation, publish/rollback; analytics.
33. Optional bounded AI assist (structured drafts, spend caps, deterministic fallback).
34. Sponsorship placements (labelled, approved, scheduled, reported).
35. Scale hardening from measured load; cost monitoring.
36. Only after retention is proven: multi-city map, general editor, subscriptions/premium pass.

### Evidence pack to close each gate
Screenshots at 1440×900 / 390×844 / 360×800 (state renderer, device, commit, software vs hardware GL), console + network logs, a performance table, exact commands and results, known gaps, and the next three fixes.
