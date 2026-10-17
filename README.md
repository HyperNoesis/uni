# CAMPUS

Your life. Your campus. Your world. A browser-first campus social world: pick a campus, build an avatar, walk into a live shared plaza, and earn Campus Coins and reputation for your campus.

This repo is the **CAMPUS browser-game MVP codebase**: landing → identity → live multiplayer plaza → verified activities → rewards/ledger → weekly Campus Wars → recurring events/social systems → room-cosmetic shop. Three activities (Reaction Challenge, Campus Quiz and a clue-based Scavenger Hunt) are wired in source. Verified on 12 Oct 2026: install, type checks, all unit tests, production build, the realtime/API end-to-end tests and a real-browser play-through all pass (see *Verification* below).

## Run it

```bash
pnpm install
cp .env.example .env     # optional for local dev; defaults work
pnpm dev                 # web :3000, api :4000, realtime :4001
```

Open http://localhost:3000, enter campus, and open a second window to see two players together.

Controls: WASD / arrows or the on-screen stick to move, `E` or the action button to interact. The Commons has a `!` Reaction Challenge marker, a `Q` quiz board, and an `H` Scavenger Hunt board. Start the hunt there and follow the in-world clue card to three ordered campus checkpoints.

```bash
pnpm typecheck && pnpm test   # workspace type checks and unit tests
pnpm check:repo               # repo structure + env hygiene gate
pnpm smoke                    # end-to-end against running api + realtime
pnpm load                     # join/movement burst against running servers
pnpm migrate                  # apply SQL migrations (needs DATABASE_URL + psql)
docker compose up -d          # Postgres + Redis (used from the persistence milestone)
```

## Deploy to Render (free)

1. Push this folder to a GitHub repo (the repo root must contain `render.yaml`).
2. Render > **New > Blueprint** > pick the repo > **Apply**. It creates three services: `campus-ng-web`, `campus-ng-api`, `campus-ng-realtime`. Secrets are generated automatically.
3. Wait for all three to go green, then open `https://campus-ng-web.onrender.com`.

Service names become public URLs and must be unique on Render. If a name is taken, rename it in `render.yaml` and update the URL values (`API_ORIGIN`, `API_INTERNAL_URL`, `REALTIME_INTERNAL_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_REALTIME_URL`), then redeploy the web service (the `NEXT_PUBLIC_*` values are baked in at build time). Details: `docs/DEPLOY_RENDER.md`.

Free-plan limits: services sleep after ~15 minutes idle (first load can take about a minute), and there is no disk, so player progress resets on restart. For permanent data use a paid plan with a Disk and set `DATA_DIR`.

## Verification (12 Oct 2026)

| Check | Result |
|---|---|
| `pnpm install` (frozen lockfile), `pnpm typecheck`, `pnpm lint`, `pnpm build` | pass |
| `pnpm test` (domain, api, realtime, web, game-core, content, analytics, ui, worker, admin) | pass |
| `pnpm check:repo`, `check:ui`, `check:3d`, `check:assets`, `check:sports`, `check:minigames` | pass |
| `pnpm smoke`, `pnpm e2e:realtime`, `pnpm e2e:phase4`, `CLIENTS=15 pnpm load` against the production build | pass |
| Headless Chromium: landing, onboarding, 3D campus renders, movement, all pages load, no console errors | pass |

Not verified: real phones/GPUs and the live Render deployment.

## Art direction and asset vision (AI agents: read this before touching visuals)

**Goal:** a bright, tropical, Nigerian-campus world that reads like a well-funded studio game, in a browser, on phones. Free Fire-class stylised-realistic, not photoreal. Real 3D geometry only, no unexplained cubes.

**Renderer fact:** the game uses its own raw WebGL renderer (`apps/web/lib/world-3d-render.ts`), NOT Three.js. Buildings are built from the `P` primitives (`box`, `cyl`, `sph`, `rbox`, `lbox`), baked into batched meshes. Do not add Three.js. Details: `docs/GRAPHICS_VISION.md`.

**How the look is made (decision, 15 Oct 2026):**
1. **Hero landmarks are custom and code-built** (Grand Gate, library, student centre, arena, Commons): breezeblock screens, deep sunshades and brise-soleil fins, terrazzo, terracotta accents, navy and electric-blue HUD colours. First one shipped: `apps/web/lib/world-hero-gate.ts` (`grandGate`, wired into Gate Road in `world-architecture-ext.ts`). Build the next ones the same way, one file per landmark, with a test.
2. **Secondary buildings and skyline use CC0 kits** (Kenney City Kit Commercial is already the backdrop ring, `public/assets/kenney/`). Background only. Keep glass towers off campus grounds.
3. **Lighting does most of the work:** clear-sky daylight only (no overcast), soft shadows, warm window glow. Next: HDRI-derived sky, AO, light bloom.
4. **Street life makes it Nigerian:** palms, mango and neem trees, bougainvillea, kiosks, food canopies, danfo bus, keke, okada, generators, painted walls.
5. **Materials:** CC0 terrazzo, concrete and plaster detail textures; the loader (`apps/web/lib/glb.ts`) ignores textures today, so adding texture support plus a Low/Medium/High toggle is open work.

**Licence rules:** CC0 or original only. The repo is public and browsers download every model, so anything forbidding redistribution is out. Rejected and why: Quaternius Downtown (Boston/NYC brick, textures only), KayKit City Builder (too cartoonish), Kenney Modular Buildings (European houses, loose pieces only), Low Poly Beach Resort and CrazyDrPants (no redistribution), Low Poly Tropical City ($19.99, bars sharing), Sketchfab (mostly CC-BY, one non-commercial), Meshy community (messy topology), Unity Asset Store (EULA). Poly Haven is CC0 (hand-download, no scraping). Log every asset in `docs/ASSET_SOURCES.md`.

**Before you push to `main` (Render auto-deploys it):** read `docs/LESSONS_FROM_PAST_PASSES.md` (deploy gotchas, repeated mistakes, order of work).

**Do not:** replace working multiplayer, zones, collisions or the server-authoritative design; claim performance or tests you did not run; promise CoD-level realism.

**Honest status:** `grandGate` passes a unit test (finite, deterministic, quality-scaled, walking lane open; run with a standalone shim, full `pnpm test` not run). It was rendered (`docs/evidence/08-grand-gate-medium-2026-10-15.jpg`) and reads as a tropical-modernist gate; piers no longer look like brick. Tip: a `P` box thinner than .26 m with face area >= 1 m^2 renders as a flat panel without brick coursing. Not typechecked in the full build; phone FPS unmeasured; back view and booth unchecked. First job for the next AI: view the back side, then repeat this recipe for the next hero landmark (library, student centre, arena, Commons); render with `tests/visual/harness/run.mjs` (camera `me {x:60,y:112,heading:0}` and `{x:60,y:150,heading:3.14159}`), look at it, fix proportions, then run `pnpm check:3d`, `pnpm check:budget` and the web build.

## Layout

| Path | Purpose |
|---|---|
| `apps/web` | Next.js client: landing, onboarding, avatar builder, home room editor, profile, WebGL 3D campus with 2D fallback, HUD |
| `apps/api` | Fastify `/api/v1`: sessions, profile, activities, ledger, leaderboard |
| `apps/realtime` | WebSocket rooms: authoritative movement, interest management, reconnect |
| `apps/worker` | Async job runner (retry, backoff, dead-letter) |
| `apps/admin` | Operations console API with audited, token-protected routes |
| `packages/domain` | Zod contracts, world geometry, pure game rules, token signing, logger |
| `packages/game-core` | Activity contract, interpolation, feature flags |
| `packages/game-content` | Validated zone, activity and season content |
| `packages/analytics` | Typed analytics events with PII guard |
| `packages/ui` | Design tokens |
| `infra` | Dockerfile, SQL migrations, backup/restore, deployment notes |

## What is real vs. stubbed

Real: server-authoritative movement validation, server-measured rewards, idempotent append-only ledger, proximity attestation (realtime → API), rate limits, reconnect tokens, graceful drain, mobile joystick, PWA manifest.

Known limitations (see `DECISIONS.md`): persistence is a JSON snapshot on disk (`DATA_DIR`) behind a `Store` class, not yet a tested Postgres adapter; auth is an anonymous signed session (no email/phone or account recovery); the world now has an integrated low-poly WebGL 3D renderer with a selectable 2D canvas fallback; runtime/build/device performance are not yet verified. Social/chat and moderation APIs/UI are present. Reaction Challenge, Campus Quiz and the ordered Scavenger Hunt are implemented in source with server-attested proximity, bounded rewards and daily attempt limits, but dependency-backed tests and live browser/multiplayer verification are still required. Weekly Campus Wars, recurring events/RSVPs and a server-priced room-cosmetic shop are also implemented in source. Notifications, event-host tools, creator publishing, AI NPCs and ad placements remain future work.

## Build status by phase

| Phase | Status |
|---|---|
| 0 Baseline, CI, Docker, docs | Done |
| 1 Landing, PWA, onboarding, nav | Done |
| 2 Identity, avatar, profile, home room, persistence | Done (verify with `pnpm install && pnpm typecheck && pnpm test` and a browser pass) |
| 3 Flagship campus | 3D WebGL renderer integrated with the existing 2D fallback; 9 zones, 7 buildings (4 enterable interiors), collision, follow camera, 8 ambient NPCs, quality settings, diagnostics. Needs browser/build/real-device verification |
| 4 Realtime multiplayer | Done: authoritative rooms with overflow instances, delta snapshots with interest management, reconnect resume, emotes, proximity, wall collision, liveness pings, abuse signals, RTT and snapshot size in diagnostics, two-client e2e test (`pnpm e2e:realtime`). Needs a run with real deps |
| 5 Social + safety | Implemented in code: friends, campus-scoped groups, friend/group chat, blocking, muting, reports, moderation API and social UI. Runtime/browser verification, appeals and a complete moderator UI still required. |
| 6 Activities | Reaction Challenge, Campus Quiz and a three-stop ordered Scavenger Hunt have server-side validation, proximity attestation and reward ledger integration. Quiz/hunt daily attempts and Campus Wars points are bounded. Penalty shootout, delivery and rhythm remain planned. |
| 7 Events + Campus Wars | Weekly Campus Wars endpoint and UI with season windows, contributor-normalized ranking and 30-point/player/day ceiling. Four recurring official events support live/upcoming status, RSVP/cancel and snapshot persistence. Reminders, host tooling and custom events remain future work. |
| 8 Shop | Server-owned catalogue and prices, authenticated purchase endpoint, idempotency, ledger debit, inventory grant, persistence and room-shop UI are implemented in source; purchase tests are written but not run in this environment. Real-money monetization is not implemented. |
| 9 Creator | Room editor exists; reusable public challenge/event publishing remains future work. |
| 10 AI | Not implemented as a player-facing system. |
| 11 Ads | Not implemented; design only after retention and safety are validated. |
| 12 Scale | Worker, health/readiness, deployment and load-test foundations exist. Production database adapter, multi-instance realtime routing and verified load/performance targets remain incomplete. |

## Phase 6 status (activities + Campus Wars)

The Campus Quiz is a code-level vertical slice. The quiz marker is server-attested through the realtime server; the start endpoint returns prompt/choices without the answer; completion binds to a one-use run, rejects instant answers, expires old runs, requires an idempotency key, and grants rewards only after the server checks the answer. Attempts are limited to five started questions per UTC day (including abandoned/expired runs, to prevent unlimited rerolls), and the attempt count survives JSON snapshots. Correct quiz answers award 12 Campus Coins, 5 reputation and up to 10 Campus Wars points. The Scavenger Hunt requires an attested start-board visit and three sequential attested checkpoints inside a ten-minute run; it has a three-start daily cap, retry-safe per-checkpoint responses, and pays 25 coins, 8 reputation and up to 15 Campus Wars points only on the final step. The current shop catalogue has eight server-priced room cosmetics; purchases debit the immutable ledger and grant inventory with replay protection, and items can be placed through the existing Home editor.

Campus Wars rotates on an ISO-style weekly UTC window, shows season start/end timestamps and rules, and calculates the rank from average contribution among actual contributors. Contributions are persisted in snapshots and capped at 30 points per player per UTC day. Verified Reaction Challenge rewards also add 5 competition points subject to the same cap. The Events tab is a Campus Wars/activity hub with four recurring official event types, upcoming/live timestamps, and persisted RSVP counts/status. Push reminders, host tools, custom user-created events and attendance rewards are not yet built.

These are implementation notes, not claims of successful runtime verification. The dependency-backed unit suite, API integration checks, two-browser world test and Android performance pass remain release gates; see `docs/history/CAMPUS_AUDIT.md`.

## Phase 5 status (social + safety)

The social UI and API are present in this archive. Implemented code includes friend requests, campus-scoped groups, friends-only DMs, group chat, block/mute controls, report evidence snapshots, moderator actions, and snapshot persistence. Known gaps include an admin web UI, appeals, in-world report/add-friend actions, push messaging, image/UGC moderation, and account-level bans. These are code/documentation claims, not a substitute for a successful test run; see `docs/history/CAMPUS_AUDIT.md`.

## Phase 4 status (realtime multiplayer)

Done: delta snapshots (D-024), interest management, reconnect tokens with a 30 s grace and full resync, population-capped instances with empty-room pruning, heartbeat termination of dead connections, movement-abuse logging and kick (D-025), emote cooldown, zone and disconnect analytics, client ping with RTT and snapshot bytes in the diagnostics panel, `tests/e2e/two-clients.mjs` wired into CI.
Not done: Redis presence and multi-process routing (D-026), binary or compressed payloads (deltas only), activity and event rooms (Phases 6-7), a 2-browser manual check on real devices.

## Phase 3 status (flagship campus)

Done in source: low-poly WebGL 3D scene renderer for campus zones, buildings, props, activity markers and customisable avatars; selectable 3D/2D mode; original procedural 2.5D renderer retained as a graceful fallback; quality levels and existing gameplay/world geometry are shared across renderers. The original renderer still supplies the fallback and remains useful for low-end hardware.
Not yet verified: browser screenshot/visual quality, full app production build, real-device Android frame rate and battery/memory, accessibility under WebGL context loss, and whether the 3D mode meets target performance. High-detail 3D assets, textures, shadow maps and a large streaming world are deliberately not claimed as done.

## Phase 2 status (identity)

Done: avatar builder (presets, surprise me, 6 parts), profile (bio, weekly rename, titles, achievements), starter inventory, home room editor, achievements that grant items and reputation, durable snapshot persistence (`DATA_DIR`), migration `0002`.
Analytics: `avatar_created`, `campus_joined` and `item_earned` are emitted server-side (set `ANALYTICS=console` to log them).
Not done: tested Postgres/Redis adapters (migrations ready), real login/account recovery, full browser E2E coverage, published creator challenges and AI NPCs. The virtual shop is implemented in source, but its purchase flow still needs dependency-backed tests and browser verification.
