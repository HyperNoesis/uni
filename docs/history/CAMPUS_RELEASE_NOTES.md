# CAMPUS build delivery — 9 October 2026

This is an implementation pass on the uploaded Phase 5 codebase, not a claim that every future item in the 12-phase plan is already complete or that a production release has passed.

## Implemented or extended in source

- Campus Quiz: server-held answer key, proximity grant, one-use timed run, server-side validation, bounded rewards, idempotent completion and five-start daily cap.
- Scavenger Hunt: server-attested start, three sequential clue checkpoints, visible active-clue marker, ten-minute expiry, three-start daily cap, final-only rewards and retry-safe checkpoints.
- Campus Wars: weekly UTC season, contributor-normalized leaderboard, persistent points and a daily per-player score cap.
- Virtual room shop: eight cosmetics, server-owned prices, API purchase path, append-only ledger debit, idempotent inventory grant/retry and responsive catalogue UI. Added `0004_shop_catalog.sql` without changing older migrations.
- Recurring campus events: schedule/occurrence keys, RSVP and cancel endpoints, persisted attendance and client dashboard.
- UI additions: minimap, activity overlays, quiz/war UI, events hub, shop previews/navigation, clue tracker and completion view.
- Documentation and catalog parity tests updated to distinguish source implementation from verified runtime behavior and future work.

## Checks actually run in this environment

- `node scripts/check-repo.mjs` — passed.
- TypeScript/TSX transpile-only syntax check — 76 files, zero syntax diagnostics.
- JSON parsing — 23 files, zero errors.
- Node script syntax checks — 5 files, zero errors.
- Dependency-free runtime checks using transpiled source — account creation, store shop purchase, retry/no-double-charge, conflicting idempotency key, insufficient balance, ledger reconciliation and snapshot restore passed.
- Domain-content checks — all eight offers resolve to valid shop items, all seven interaction points are walkable in the collision map, and all three ordered hunt checkpoints are configured.

## Not yet verified

Workspace dependencies are not installed in this execution environment, and `pnpm` could not be fetched. The full Vitest suite, TypeScript semantic typecheck, Next.js production build, API smoke test, two-client realtime E2E test, actual browser session and Android-device performance check have **not** run. The new Fastify route tests are source-added, not claimed as passing. No live session was tested.

## Architecture limits that remain

- The world is the existing lightweight 2.5D canvas renderer, not the true 3D scene in the promotional concept image.
- The running store still uses a single-process JSON snapshot; database/Redis deployment and horizontal realtime routing require more work.
- Full moderator tools/appeals, account recovery, notification delivery, creator publishing, penalty-shootout/delivery/rhythm minigames, AI characters and sponsorship surfaces are still future work.

## Recommended verification sequence

From a network-enabled clean checkout, run:

```bash
pnpm install
pnpm check:repo
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke
pnpm e2e:realtime
```

Then test the initial loop in two browser sessions and on an ordinary Android phone: identity → enter campus → see another player → interaction → verified reward → Campus Wars → event RSVP/cancel → buy an item → place it in the room editor. Do not launch publicly until those gates pass and moderation/persistence operations are ready.

## Pass Q — playable Sports Ground (11 Oct 2026)
- Basketball court added (x103-115) beside a resized futsal pitch (x81-100); baked into one draw (mock-GL calls 217 -> 203).
- New game mode: walk into either court area -> "Play Football/Basketball" -> full-screen practice match vs AI (football 3v3, basketball 2v2, 2 min). Engine `apps/web/lib/sports-game.ts` (pure), UI `components/SportsGame.tsx`. Awards nothing, so no server authority needed.
- Controls: WASD/arrows move, Shift sprint, hold Space/J + release to shoot (basketball: release near the top of the meter for best odds), K pass, L steal (basketball), Q switch player (football), Esc pause. Touch: stick + SHOOT/PASS/SPRINT/STEAL|SWITCH.
- `pnpm check:sports` (headless: bounds, scoring, timers, shot odds). Not verified: real browser/phone feel, typecheck/build (deps blocked).

## Pass R — Beat Stage + Delivery Dash minigames (11 Oct 2026)
- `apps/web/lib/minigames.ts` (pure engines) + `components/MiniGame.tsx`. Beat Stage: walk into the Event Arena -> 4-lane rhythm, 45 s, keys D F J K / arrows or touch lanes, perfect/good/miss, combo, S-D grade. Delivery Dash: Food Court -> top-down order runs, WASD + Shift or stick + SPRINT, dodge students, +3 s per delivery (hard cap 120 s).
- Practice only (awards nothing, no server authority). `pnpm check:minigames` (bot gets S / idle gets D; delivery bounds and timer). Not verified: real browser/phone feel, typecheck/build (deps blocked).

## Pass S — event-night lighting (11 Oct 2026)
- Night/festival now add one baked emissive mesh ("nightlights|quality"): 8 floodlight towers + light pools on the football/basketball courts, lamp pools along the Grand Boulevard, Food Court string lights, Event Arena lanterns in zone colours (medium+), lamp halos (high). Low quality keeps only courts + boulevard pools.
- Smoke test now renders night + festival at low/medium/high with resource-release checks. Mock GL only: not verified on a real GPU, bloom/emissive look, or phones.

## Pass T — verification only (11 Oct 2026)
- Draw-call finding: the "~200 calls" figure counted the shadow pass too. Main-pass calls in the smoke view are 127 (`SHOW_SHAPES=1 node tests/visual/3d-renderer-runtime-smoke.cjs` prints the per-shape breakdown), under the 150 target; the rest are ~21 per-building baked meshes (kept separate so roofs can lift off), 12 zone meshes and 11 prop buckets. Merging is not worth the roof-lift cost. Mock GL only: real-GPU frame time still unmeasured.
- `sports-game.ts` and `minigames.ts` pass `tsc --strict --noUncheckedIndexedAccess`; the new/edited .tsx files have 0 syntax diagnostics (full semantic typecheck still needs `pnpm install`).
