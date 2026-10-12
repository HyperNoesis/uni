# CAMPUS continuation report — 10 October 2026

## Delivered in this continuation pass

1. Integrated the geometry-based WebGL 3D renderer into the real `/play` loop. It consumes the game's current world data rather than the separate promotional concept image.
2. Kept the 2D canvas renderer active as a fallback and added a player-accessible renderer switch. Startup failure or a frame exception falls back to 2D.
3. Added the independent label layer for player and activity markers, retained saved avatar colours/features, raised navigation/HUD controls above the renderer layers, and added WebGL context-loss fallback.
4. Added source-contract checks plus a mocked WebGL render smoke test using `packages/domain/src/world.ts` and `campus-map.ts` from the actual project.
5. Found and fixed an initialization-order error in the 3D renderer's visibility-culling counter.
6. Added a low-quality renderer budget check: the WebGL pass limits ambient NPC meshes and labels to the three-NPC profile on low settings. Updated README, build plan, decision record and implementation notes while preserving the 9 October audit as a dated historical snapshot.

## Verification results

| Check | Result | Meaning |
|---|---|---|
| `node scripts/check-repo.mjs` | PASS | Repository structure and hygiene checks passed |
| `node tests/visual/3d-renderer-contract.mjs` | PASS | Static integration/fallback/UI-wiring checks passed |
| `NODE_PATH=$(npm root -g) node tests/visual/3d-renderer-runtime-smoke.cjs` | PASS | The renderer JavaScript path ran with actual project world geometry and a mock WebGL API |
| TypeScript/TSX transpile syntax | PASS — 77 files, 0 diagnostics | Syntax transpilation only; not semantic type-checking |
| Package typecheck/full tests/Next production build | BLOCKED | Workspace dependencies are not installed; fetching pinned pnpm failed in this network environment |
| Headless Chromium WebGL screenshot | BLOCKED | Chromium could not initialise the WebGL/GPU context in this environment |
| Actual Android/browser multiplayer test | NOT RUN | Requires a runnable deployment/browser/device environment |

The medium-quality mocked render observed 9 campus zones, 7 buildings, 53 solids, 86 visible scene objects, 10 culled objects, 6 screen-space labels, 137 mesh draw calls, and cleanup of 9 generated buffers/program resources. A second low-quality pass with eight ambient NPC test entities confirmed the configured three-NPC mesh and label cap and resource cleanup. These are mock-test observations, not FPS, visual-fidelity, or hardware-GPU measurements.

## Still not complete

- The project has not passed a clean package-backed typecheck/test/build cycle.
- The integrated WebGL renderer still needs real browser screenshots and shader/GPU validation. The code now handles context-loss events, but that handler has not been tested against a real lost GPU context. Low-end Android performance also remains unmeasured.
- Two-client multiplayer and the full first-player journey remain unverified.
- Production Postgres/Redis deployment, scale tests, backup/restore drills, moderation console/appeals, creator publishing, push notifications, AI NPCs, sponsorship surfaces and additional minigames remain unfinished or not release-verified as described by the build plan.

## Immediate next release gate

In a network-enabled clean checkout, install from `pnpm-lock.yaml`; run `pnpm check:repo`, `pnpm check:3d`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm smoke`, and `pnpm e2e:realtime`. Then capture browser screenshots in both graphics modes, test the two-client movement/reconnect/activity flow, and profile low-end Android before expanding 3D detail or introducing more minigames.
