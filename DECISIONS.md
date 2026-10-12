# Decisions

- **D-001 Monorepo with pnpm + Turborepo.** Shared Zod contracts keep client, API and realtime in lockstep.
- **D-002 Fastify + `ws` instead of a game framework.** Smallest thing that supports authoritative rooms; swap for Colyseus if room logic outgrows it.
- **D-003 In-memory `Store` first.** Keeps the vertical slice runnable with zero infrastructure. Postgres/Redis adapters are the next milestone; `docker-compose.yml` is ready. Ledger semantics are already the production ones.
- **D-004 Anonymous signed sessions.** HMAC token with 30-day expiry, intended to be replaced by real auth (email/phone/OAuth). No personal data is collected today.
- **D-005 2D canvas world, not 3D.** Fastest path to a smooth mobile experience; the protocol is renderer-agnostic so a Three.js client can replace it.
- **D-006 Fictional currency only.** Campus Coins have no cash value, cannot be bought or withdrawn, and there is no gambling mechanic.
- **D-007 Reaction challenge as first activity.** Chosen because its anti-cheat story (server-measured time, human floor, cooldown, daily cap) exercises the whole reward pipeline.

## Known gaps (updated after Phase 2)

No chat or moderation tooling, no account recovery, no seasons/events/shop/creator studio (world is 2.5D canvas, see D-020), persistence is a single-instance file snapshot (D-016), single-process realtime, no end-to-end browser tests in CI (only the API/realtime smoke test).

- **D-008 Phase 1 is additive.** App shell, tokens, PWA service worker and pages were added without touching `api`, `realtime`, `domain` or `/play`. Auth stays the anonymous signed session (D-004); credentialed login needs API changes and is deferred until approved.

- **D-009 Render Blueprint.** `render.yaml` deploys web, api and realtime from one repo. Free-tier services sleep when idle and the in-memory store resets on restart (D-003).
- **D-010 Phase 0 completed against the master prompt.** Added `apps/worker`, `apps/admin`, `packages/{ui,game-core,game-content,analytics}`, `infra/`, `tests/{unit,integration,e2e,load}`, `CONTRIBUTING.md`, a shared logger, flags, SQL baseline migration, backup/restore scripts, a Dockerfile and a repo conformance check.
- **D-011 `packages/ui` is the token source of truth; web adopts it in Phase 2.** `apps/web/lib/tokens.ts` is an identical copy for now so Phase 1 stays untouched; Phase 2 replaces it with a re-export.
- **D-012 Lint is `tsc --noEmit` plus `pnpm check:repo`.** ESLint needs new dependencies and a regenerated lockfile, so it is deferred until a networked install; the gate is recorded here so it is not forgotten.
- **D-013 No new third-party dependencies in Phase 0.** Migrations use `psql`, queues are in-process, and everything else uses packages already in the lockfile.
- **D-014 Feature flags default off** and resolve from `FEATURE_FLAGS` JSON; unknown or malformed values are ignored.
- **D-015 Phase 2 identity rules live in `packages/domain`, dependency-free.** Avatar catalog, item catalog, home-room validation, text hygiene and achievements are plain TypeScript (no zod) so web, API and realtime share one implementation. The server runs `validateLayout` on every save; the client runs the same function for instant feedback. New avatar parts (`hairColor`, `top`) default to what Phase 1 drew, so stored and older-client avatars keep parsing.
- **D-016 Durability is a debounced atomic JSON snapshot behind a `Persistence` interface.** `DATA_DIR` enables it; unset means memory-only with a loud warning. Writes are coalesced, atomic (temp, fsync, `.bak`, rename) and retried with backoff; `/readyz` returns 503 while saves fail; boot refuses unreadable or other-version data instead of starting an empty world. Guarantees: a clean restart loses nothing; a hard crash can lose up to the last debounce window (about 250 ms). It needs a persistent disk and a single API instance. The relational Postgres adapter (migrations 0001/0002 are ready) replaces it next; ledger, grant and unlock rules already match the SQL constraints.
- **D-017 Text policy is server-enforced and conservative.** Names and bios are Unicode-normalised (invisible/bidi characters stripped), reject emails, phone numbers and links (safety for a young audience), staff-impersonation names and operator `BLOCKED_TERMS` (leetspeak-aware, 3+ letter terms to limit false positives). Renames are limited to once a week. Campus is deliberately not editable so reputation cannot move between campuses.
- **D-018 Rewards come only from server events.** Achievements unlock from `IdentityEvent`s emitted by the API (identity created, look changed, room saved, bio set, reaction reward granted), grant reputation and an item exactly once, and are recorded in append-only, idempotent logs. Room saves use optimistic concurrency (`revision`, HTTP 409) so two tabs cannot silently overwrite each other.
- **D-019 Activation analytics are emitted server-side.** `avatar_created`, `campus_joined` and `item_earned` fire from the API using the anonymous player id as session id; the tracker rejects PII-looking keys and a failing sink can never break a request. `ANALYTICS=console` prints them as JSON logs; a PostHog sink replaces it later.
- **D-020 (historical) Phase 3 originally used a procedural 2.5D canvas renderer.** This remains the fallback path and keeps the game usable when WebGL is missing or unstable.
- **D-024 3D renderer is a lightweight geometry-based WebGL path, not an external engine dependency.** `/play` now creates 3D meshes for campus floors, open-roof buildings, props, activity markers and player/NPC avatars, while preserving the original 2D renderer. Players can switch render modes; WebGL startup/frame failure switches to 2D. This avoids adding a large library/network dependency, but the renderer is an early low-poly implementation and must pass the app build, browser visual tests, WebGL context-loss checks and Android performance budgets before the 3D path is called production-ready.
- **D-021 Collision is shared pure geometry and the server is the authority.** `packages/domain/campus-map.ts` defines buildings (4 walls, south door gap), props, `collides()` and `slideMove()`. The client predicts with `slideMove` (axis-separated sliding); `validateMove` rejects any claimed position inside a solid, so a modified client cannot walk through walls. Step size per input (<0.3 units) is far below wall thickness (0.8), so there is no tunnelling. Interiors are real walkable rooms in the same world (no loading screen); roofs fade while the player is under or behind them.
- **D-022 Ambient NPCs are deterministic loops computed from the clock.** `npcAt(npc, Date.now())` is pure, so every client and the server agree with zero network traffic or server tick cost. Tests walk every path for 2 minutes and assert no NPC enters a wall. Generative dialogue stays a Phase 10 layer on top of this shell.
- **D-023 Quality profiles low/medium/high with auto-detect and runtime downgrade.** Start level comes from cores, device memory and Save-Data; if frames stay over budget for about 3 seconds the client drops one level and tells the player. The choice is saved in `localStorage` (`campus.quality`). A developer diagnostics panel (backtick key; on in dev, or when `NEXT_PUBLIC_DEBUG_PANEL=1`) shows fps, frame time, objects drawn and culled, players and quality. Not yet measured: websocket RTT, snapshot size, API latency and texture memory.
- **D-024 Snapshots are deltas.** After the first full view (`welcome`), each viewer only receives new entities in full (`players`), changed ones as `{id,x,y,emote?}` (`moved`) and departed ids (`gone`). The server remembers a fingerprint per viewer and visible entity; the viewer is never echoed to themselves. Idle viewers get nothing except a keepalive about once per second (population, ack). Avatars travel once per sighting. Interest radius still applies, so leaving range sends `gone`. The client treats `welcome` as a full resync, so reconnects cannot leave ghosts.
- **D-025 Connection health and abuse signals.** Server pings every 15 s and terminates connections that stop answering (silent mobile drops). Repeated movement corrections are counted in a 10 s window: 30 logs a warning, 120 closes the connection. Emotes have a 400 ms cooldown. Zone changes and disconnects feed the `zone_joined` and `websocket_disconnect` analytics events (`ANALYTICS=console`). Departed players are removed from the room map after the 30 s reconnect grace, and empty overflow rooms are pruned.
- **D-026 Rooms stay in-process for now.** One authoritative `Room` per 60 players with overflow instances (existing), no Redis presence or cross-process sharding yet. This keeps a single realtime instance correct and simple; Phase 12 moves presence and room routing to Redis. Activity and event rooms arrive with Phases 6 and 7.


## Phase 5: social + safety

- **D-027 Social state lives in `SocialState` (`apps/api/src/social.ts`), persisted inside the existing snapshot as an optional `social` field.** Snapshot version stays 2, so pre-Phase-5 data loads unchanged (tested). Presence is in memory only and exposes online/offline to friends, never a zone or location. Postgres tables are in migration 0003 (not yet used at runtime, like 0001/0002).
- **D-028 No open DMs.** Private chat is friends-only; group chat is members-only and groups are scoped to one campus. Chat uses the name/bio text policy plus: no links, emails or phone numbers, 200 chars, 1 s gap, 15/min, duplicate suppression. Chat is HTTP polling (4 s while a thread is open); realtime push is deferred until measured need.
- **D-029 Blocking is symmetric and leak-free.** A block deletes any friendship, hides both players from search, group lists and group history for each other, refuses requests and DMs, and answers `unavailable` so the blocked side cannot detect it. The API pushes the pair to realtime (`/internal/blocks`, shared secret) and realtime also loads peers at join; `Room.visibleTo` skips hidden pairs, so the next snapshot sends `gone`. If the push fails the pair still applies at next join (logged, not fail-closed).
- **D-030 Reports carry server-snapshotted evidence and feed an admin queue.** A reported message must be visible to the reporter and written by the target; its text is copied into the report because the chat buffer (200 per conversation) rolls over. Moderator actions: dismiss, warn, 24 h or 7 d chat mute, all appended to a moderation log. Three distinct reporters in 24 h trigger an automatic 1 h chat hold pending review (never a ban). Admin routes proxy to API internals, are audited, and answer 503 if `API_INTERNAL_URL`/`INTERNAL_SECRET` are unset.
- Achievements `good_neighbour` and `joiner` are awarded only from server events (friendship accepted, group joined).

Known gaps after Phase 5: no admin web UI (API only), no appeal flow, no in-world tap-to-report/add-friend on the canvas yet, no message push, no image/UGC moderation, account-level bans not implemented.

## Phase 6-7 merge: progression, jobs, Campus Wars v2 (on top of the uploaded 3D/events/shop tree)

- **D-031 Merge base is the uploaded tree** (3D renderer, events, shop, existing quiz and scavenger hunt). The earlier standalone multi-question quiz was not ported; the existing quiz and hunt now feed levels, quests, streaks and Wars points instead. Migration numbering: 0004 stays the shop catalogue, progression/jobs/Wars is 0005.
- **D-032 One reputation, ten levels, campus-year titles** (Fresher … Campus Legend); level n starts at 12·(n-1)² reputation. Reaction daily reward cap lowered 40 to 15 so reputation cannot be farmed. Daily quests (`play_any` plus two hash-picked) are driven only by server events and claimed through the ledger (key `quest:<day>:<id>`). A Lagos-time streak awards `regular` at 3 days.
- **D-033 Campus jobs.** Four jobs (Campus Cleaner L1, Food Vendor L2, Library Assistant L2, Event Staff L3), each with a workplace point. Apply at the Job Center (proximity + level checked server-side). A shift is 5 server-timed tasks (12 s each, answers held by the server, sub-250 ms answers count as wrong), resumable, retries replay without double pay, 30 s cooldown, 3 paid shifts per Lagos day. Pay scales with accuracy (+20% for a perfect shift) via the ledger (key `shift:<run>`). No rent or needs pressure by design.
- **D-034 Campus Wars v2.** Every point is an append-only contribution (season, rule version, source, key). Caps: 40 points per player per day, plus per-source caps (quiz 20, reaction 10, hunt 10, event 20, social 10, quest 10, job 10). Campus score is average points per active contributor; a campus needs 3 contributors to be ranked, otherwise it is shown as Rising. Last week's final standings are frozen the first time anyone reads after rollover. Players see their own contribution, daily cap use, scoring rules and a share button. Event check-in (once per player per occurrence, only at the arena board while an event is live) adds Wars points.
- **D-035 Visual refresh toward the concept art:** glass cards, gold coin/level accents, green-white-green logo stripe, in-world Today's Tasks panel, level pill, 8 feature tiles on the landing page. Real art and animation are still the main gap to the concept image.

Known gaps: no browser or device verification of any of this; check-in only testable during a live event window; Wars history has no UI beyond a one-line last-season note; shop and 3D renderer unchanged from the uploaded tree; quiz question bank is still the uploaded one.

## 2026-10-10 — World as data (architecture step 1)
Zones, buildings, solid props, spawn points, interaction points and ambient NPC routes moved from code
(`world.ts`, `campus-map.ts`) to `packages/domain/src/world-data/` (one JSON per zone), validated by zod at load
(`world-schema.ts`, `world-compile.ts`). Public exports (`ZONES`, `BUILDINGS`, `SOLIDS`, `INTERACTION_POINTS`,
`AMBIENT_NPCS`, `SPAWN`, `WORLD`) are unchanged, so server/client code did not change. `ZoneId` widened from a
union to `string` so new rooms need no code edit. Tradeoff: a registry import line in `world-data/index.ts` is still
needed per room (kept explicit for tsx/Next/vitest portability); a test catches an unregistered file.

## 2026-10-10 — Asset pipeline (architecture step 2)
Manifest (`world-data/assets.json`, schema in `packages/domain/src/assets.ts`) lists same-origin GLBs with slot, zones and
byte/triangle budgets. `apps/web/lib/glb.ts` is a dependency-free GLB reader (the renderer is raw WebGL, no three.js, so
adding one was not justified); `asset-loader.ts` streams per zone, enforces per-asset and resident budgets, evicts old
zones and never throws into the render loop (failure = built-in shape stays). Renderer gained a vertex-colour attribute and
`registerMesh/unregisterMesh`; `prop:<kind>` slots are wired, building/NPC/avatar slots are reserved. Textures/Draco/animation are not supported yet.
Tests for the web modules live in `packages/domain/src/web-assets.test.ts` (web has no test runner; adding one changes the lockfile).

## 2026-10-10 — First original model set + decor layer
`scripts/models/generate-props.mjs` generates 14 original low-poly GLBs (no third-party assets, so no licence obligations) into
`apps/web/public/assets/props/` and rewrites the manifest: 7 replace solid props (palm, bench, library shelf, market stall,
gate pillar, fountain, event stage) and 7 are non-solid scenery (lamp post, hedge, flower bed, umbrella table, goal post,
shrub, signboard). Zone files gained a `decor` list (`model,x,y,rot,scale`); the generator seeds 75 placements and drops any
that collide with solids; after that the JSON is hand-editable. Decor draws only if its GLB streamed in (graceful fallback).
Verified by rendering the real `world-3d-render.ts` + streamer in headless Chromium (software GL). Not verified on a real phone GPU.

## 2026-10-10 — Reference-image pass (landmarks, facades, sky)
Taken from the CAMPUS reference board: bright sky + brighter lighting (renderer clear colour/ambient), a blue "CAMPUS" gate arch with
crown (pixel-letter geometry, no textures), "Dream/Learn/Build"-style banner poles, patterned plaza paving, many more palms, building
facades (windows, cornices, door canopies; clock tower on the library; glass strip on lecture halls; closed roofs on hostels) generated
per building from zone data. `building:<id>` slots are now wired in the renderer. Streamer also loads zones within ~30 units of the
player so buildings never pop in on approach. NOT taken: statue/hero tower building, vehicles, crowds, photoreal textures, the UI
board (those need new solids/layout, animation or art we can't generate procedurally). Verified in headless Chromium only.

## 2026-10-10 — Avatar parts (step 3) — IN PROGRESS snapshot
Avatar gained `face`, `shoes`, `backpack` (optional in the type, defaulted by `parseAvatar`/`AvatarSchema`, so old saved avatars keep working).
27 original avatar-part GLBs (`avatar:*` slots, `tint` + `anchor` in the manifest) are drawn by the 3D renderer over the code-drawn body, which
remains the fallback. The 2D customizer preview and picker know the new parts. Domain tests: 63/63 pass in a stand-in runner. NOT yet done:
visual QA of the 3D avatars beyond one render, API/realtime tests not run (no installable deps in the sandbox), `next build` not run.

## 2026-10-11 — Master checklist sections 01-05, first pass
- **D-040 Lockfile policy.** `pnpm-lock.yaml` lacked `three`/`@types/three`, so every frozen install failed. `.npmrc` now sets `frozen-lockfile=false` and CI/Render/Docker no longer pass `--frozen-lockfile`; after the first successful install the regenerated lockfile must be committed, then strict installs can return. `pnpm start:local` is the one-command run.
- **D-041 Primary navigation.** Exactly five destinations in this order: World, Home, Social, Events, Profile (checklist 0068/0136). Shop is secondary (topbar link and Home card). `pnpm check:ui` enforces it.
- **D-042 Tokens.** `apps/web/lib/tokens.ts` is the single source; `app/tokens.css` is generated (`pnpm gen:tokens`); legacy `--bg`/`--brand`/`--touch` variables are checked against it. Gold is for rewards only.
- **D-043 Onboarding resume.** Draft (step, campus, name, avatar) lives in sessionStorage, validated on read, cleared on success; storage failure means no resume, never an error.
- **D-044 War caps in tests.** API tests assert the live Wars rules (D-034): per-source caps and the 40/day player cap. Hunt requests 15 but is capped at 10.
- **Not verified:** typecheck, lint, vitest, `next build`, API/realtime and real-device checks did not run (npm registry unreachable). See SECTIONS_01_05_STATUS.md.

## 2026-10-12 — Phase 4 audit pass (realtime authority)
- **D-045 Movement time bank.** `validateMove` credited a minimum 50 ms per input. With the 40 msg/s rate cap a client could be accepted at 2x max speed (measured: 16.2 u/s vs 8.1 u/s limit). `Room.input` now meters real elapsed time in a per-player bank (max 500 ms, start 50 ms); accepted movement spends it, and `validateMove` takes an optional `floorMs` (default 50, unchanged for other callers; the room passes 0). Honest jitter bursts are covered by the bank. Tests: `room.test.ts` (burst, jitter), `tests/e2e/phase4-gates.mjs`.
- **D-046 Single hello per socket.** A second `hello` that arrives while the first is still authenticating is ignored (`helloing` flag), so concurrent hellos cannot create two joins for one player.
- **D-047 Developer diagnostics.** Realtime exposes `GET /metrics` (requires `x-internal-secret`; aggregate only, no names or positions): room count/capacity, connected vs ghost players, corrections, rejected actions by reason, tick time (last/max/>50 ms), rate-limited and malformed message counts, disconnect close codes. `Room.stats()` backs it.
- **D-048 Stale content test.** `game-content` asserted 9 zones; the world has 22. The test now compares against `ZONES` (content is generated from it, so coverage was already correct).
- **Not verified in this pass (no registry access):** `pnpm install` (lockfile still lacks `three`, `@types/three`), API tests, web typecheck/build, load test, real browser/device. Run `pnpm gate:a` on a networked machine and commit the regenerated `pnpm-lock.yaml`.
- **D-049 Release cleanup (12 Oct 2026).** Verified install/typecheck/test/build and runtime checks on a networked machine. Lockfile regenerated and committed; `.npmrc` now uses `frozen-lockfile=true`. Removed screenshots, gate logs, the local snapshot tool and `gate:a`; moved status/pass notes to `docs/history/`. Fixed 3 web type errors and 5 stale API tests (hard-coded dates, achievement bonuses, response shapes); no game rules changed. Render blueprint renamed to `campus-ng-*` (unique URLs) and pins Node 22. Known quirk: the starter room already has 10 items, so the first home save unlocks Home Sweet Home (+3 rep, neon lamp).
