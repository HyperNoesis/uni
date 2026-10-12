# CAMPUS 3D renderer integration — 10 October 2026

## What changed

- Integrated a low-poly WebGL renderer into the real `/play` render loop.
- The renderer draws geometry-based campus zones, campus paths, open-roof buildings, building trim/windows, benches, trees, fountain, stage, activity boards/markers, and stylised avatars using the existing saved avatar colours and hair styles.
- Added a screen-space canvas for entity and activity labels.
- Added a player-accessible 3D/2D graphics switch. The original `world-render.ts` remains in use as a lightweight fallback and can be reselected when WebGL is available.
- Added fallback to 2D when WebGL startup or a 3D frame throws, plus a renderer indicator and render-mode diagnostics. A WebGL context-loss handler also switches to 2D defensively.
- Raised the in-world HUD above the canvas layers so the controls remain visible and usable.
- Kept game state, movement prediction, authoritative server movement, collision and activity rules independent of the renderer.
- Avoided adding an external rendering dependency or downloading models/textures.

## Validation performed for this pass

- `node scripts/check-repo.mjs` — passed.
- Global TypeScript `transpileModule` syntax pass — 77 `.ts`/`.tsx` files, zero syntax diagnostics.
- `node tests/visual/3d-renderer-contract.mjs` — passed. This confirms source wiring, geometry primitive presence, fallback existence, renderer switch and HUD layering.
- `NODE_PATH=$(npm root -g) node tests/visual/3d-renderer-runtime-smoke.cjs` — passed against the actual project domain geometry using a mock WebGL API: 9 zones, 7 buildings, 53 solids, 86 visible objects, 10 culled objects, 6 projected labels, 137 mesh draw calls, and resource cleanup. The test also verifies explicit failure when WebGL is unavailable.

## Not verified

- Workspace semantic TypeScript checking and package-backed tests.
- Next.js production build and browser runtime.
- WebGL startup/render on a real browser from this environment. A headless Chromium attempt could not initialise its WebGL/GPU context, so no browser screenshot or real-GPU result is claimed.
- Actual WebGL context loss, GPU resets and long-session browser cleanup. The context-loss fallback is implemented but not exercised on a real GPU.
- Actual 3D view quality and frame rate on low-end Android devices, battery use, memory, and mobile browser compatibility.
- The overall game's two-player multiplayer, activity/reward flow, and release gates.

The rendering module is an early low-poly 3D scene implementation, not the concept image, not a full asset streaming engine, and not evidence of production readiness. Keep the 2D path available until runtime and device acceptance gates pass.

## Pass H — collision-aware orbit camera (10 Oct 2026)
- New `apps/web/lib/world-camera.ts`: pure solver. Yaw (drag sideways), pitch (drag up/down, clamped 0.32–1.25 rad), zoom (pinch/wheel). A binary search along the player→eye ray pulls the camera in when a building or the ground is in the way; the renderer eases in fast and out slowly (no popping).
- HUD: compass button (rotates with camera yaw) resets the camera.
- Tests: `tests/visual/camera-solver.mjs` (in `pnpm check:3d`); smoke loader registers the new module.
- Verified: contract, mock-GL smoke, zone-architecture, camera-solver, check-repo all pass. NOT verified: real browser frames, GPU, typecheck/build (dependencies not installable here), low-end Android feel.

## Pass I — Quiet Garden, water tower, NPC wave + honest scorecard vs the Worldbuilding brief
Added: `quietGarden` + `waterTower` (east strip x100-116, y40-62; one baked mesh, near-camera only; visual only, NO collision yet), idle NPCs wave at nearby real players.
Scorecard (brief §4 spatial sequence, 12 places): all 12 now exist in code (boulevard = lamps/planters only, PARTIAL). Brief §15 gates: Live 3D proof PARTIAL (mock GL only) · Hero vista PARTIAL · Architectural quality PARTIAL · Continuity PARTIAL · Human scale PARTIAL (garden has no collision) · Interactions PARTIAL · Material/lighting PARTIAL (flat colours, no PBR/normal maps) · UI PARTIAL · Animation PARTIAL · Population PARTIAL · Performance NOT MEASURED · Network NOT RE-RUN · Asset hygiene NOT TESTED · IP PASS (fictional, no real marks).
Estimate: ~50–55% of the world CONTENT is built in code; ~5% is PROVEN (no real frame, GPU or device numbers yet). Next: real screenshots + perf, garden/tower collision, map + showcase cameras, sit interaction, real GLB/PBR hero assets.

## Pass J — environment, Quiet Garden zone, palms, sky (10 Oct 2026, evening)
- New zone `quiet_garden` (x100-116, y42-62) with real collision: pond (fountain solid), gazebo posts, water-tower legs, trees, bench, gardener NPC. Registered in world-data index, game-content ambient map.
- New solid kind `palm` (schema, SolidKind, 3D draw, 2D fallback): 11 palms line the boulevard (commons/gate/academic).
- `world-environment.ts`: treeline belt, distant faculty wings, city skyline, hills, outer ground (one baked mesh). Sun disc + halo and a baked drifting cloud bank (one call).
- Fixed pre-existing defects: IdentityEvent union (STREAK/JOB_STARTED were unreachable), missing Avatar import in schemas.ts, game-content AMBIENT typing, stale domain tests (zone/NPC/solid counts, asset budget caps), NPC waypoint inside a tree, smoke loader JSON default under local TypeScript.
- Verified: domain tests 70/70; check:3d (contract, mock-GL smoke, zone-architecture, camera solver); check-repo. Typecheck: domain/web clean; apps/api still has PRE-EXISTING Avatar type errors in store.ts / app.test.ts (not touched).
- NOT done / honest gaps: intro fly-through + map camera; draw calls ~185 on medium in mock GL (target <150) — needs merging (NPC avatar batching, per-zone glow meshes); no real browser frame, GPU or device numbers; PBR/GLB hero assets; sit interaction.

## Pass K — district landmarks, gateways, south lawns (11 Oct 2026)
- New `apps/web/lib/world-landmarks.ts` (pure, recorder-based like world-architecture):
  - `roofCrown()` — signature rooftop landmark per district + room kind (observatory domes, clock towers, red-cross pylons, tower crane + cooling stacks, solar rows + dishes, radomes, water tanks, billboards, sail masts, green roofs). Baked into each building's mesh, so it lifts off with the roof when the player walks in. 111 of 160 buildings get one.
  - `zoneGateway()` — portal arch across each of the 11 districts' spine with its own emblem and colour band (no baked text).
  - `southLawn()` + `lawnLayout()` — Convocation Green (admin), Solar Field + radio dish + turbine (research), Maker Yard with container stage (innovation). `scripts/world/generate-landmark-solids.mjs` writes the matching collision props (42 solids) into zone JSON; `tests/visual/landmarks.mjs` fails if data and layout drift.
  - `gateRoadExtras()` — shuttle shelters, zebra crossings, wayfinding totem, banner poles on Gate Road.
- `world-districts.ts` skips its default park for the three lawn zones; renderer calls the landmark builders (no draw-call growth: all baked into existing per-building / per-zone meshes).
- Domain test expectation updated by hand: non-wall solids 44 -> 86 (+42 lawn props). NOT re-run (workspace deps not installable here).
- Verified: `pnpm check:3d` (contract, mock-GL smoke, zone-architecture, camera solver, world-expansion incl. BFS reachability + NPC legs with the new solids, landmarks), `check-repo`.
- First REAL frames: rendered with the repo's SwiftShader snapshot tool (tools/snapshot, software GL, not a GPU/phone): science, medical, business, engineering, market, gate road, admin/research/innovation lawns. Domes, clock towers, cross pylons, crane, solar canopies, obelisk all visible; no console errors. Not measured: FPS, memory, low-end Android, real GPU.
- Still open: interiors beyond the existing set, event-night lighting pass for districts, real GLB/PBR hero assets, sit interaction, perf numbers, typecheck/build/vitest (need network install).

## Pass N4 — visual bible v2 (11 Oct 2026)
- New `apps/web/lib/world-shaders.ts`: linear-light shading, ACES tone map, sun SHADOW MAP (WEBGL_depth_texture; 2048 high / 1024 med+low; texel-snapped, 1-frame-lag casters, falls back to old decals if unsupported), sky dome with sun glow + stars, aerial perspective, procedural materials (paving bond+joints, roof tiles, plaster/soot, grass blades+patches, leaf bump), candy-colour desaturation grade.
- Renderer: chamfered boxes in static batches (`pushBevelBox`), clustered leafy trees, shared `world-flora.ts` palm (leaf-shaped fronds) used by all zones, natural grass/leaf palette, sun direction constant SUN_DIR.
- Stats now include `tris` and `shadows`. Measured (SwiftShader, high, commons view): ~0.96M tris (was 1.5M; env treeline now uses a 5x8 low-poly sphere), 200 calls. Bevels cost only ~2%.
- NOT verified: real GPU FPS, phones, typecheck/vitest/build (deps not installable here), updated check:3d suite not re-run after final edits, night/festival look with shadows, hostel/market buildings still plain gables.

## Pass N5 — house/shop architecture
- Pitched-roof rooms: cream plaster walls (tinted by room colour), ridge cap, eave gutters, painted plinth, window shutters + sills (near LOD). District flat-roof rooms: softened plaster walls instead of full-saturation paint. Screens: market.png, hostel.png.
- Env treeline uses 5x8 low-poly sphere (tris 1.5M -> ~0.9M). Still NOT measured on a real GPU/phone; check:3d suite and typecheck/build not re-run.
