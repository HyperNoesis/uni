# Pass L: architecture for the 12 remaining quarters
New file: `apps/web/lib/world-architecture-ext.ts` (registered via `...EXT_ARCH` in `world-architecture.ts`).
Zones: engineering (lattice tower + gear ring), science (observatory dome + atom), medical (green-roof cross pavilion + helix),
arts (amphitheatre + sculptures), business_law (clock tower + portico), hostel_estate_east (courtyards, laundry, kiosk),
admin (fountain roundabout + flags), research (solar canopies + mast), innovation (container pods + neon arch + turbine),
hostel_village (volleyball court, laundry), market_town (striped stalls + market arch), gate_road (zebra, palms, bus shelter).
Every zone also gets a framed avenue, lamps, trees, benches, planters and a colour band.
Verified: stub-recorder run of all 22 zone builders at low/medium/high, 0 NaN, new zones 0 out-of-zone prims.
NOT verified: pnpm typecheck/test/build, real-GL render, device FPS. All geometry is visual only (no collision changes).
Run: `pnpm test && pnpm build`, then `pnpm dev` and walk /play through each quarter.

## Pass L2
- NPC routes in 9 zones re-cut so ambient NPCs stop short of the new landmarks instead of walking through them (data only: `zones/*.json`, paths stay inside zone rects).
- Added `apps/web/lib/world-architecture-ext.test.ts` (Vitest): registration, finite/deterministic geometry, quality ordering. NOT run here (no deps); run `pnpm test`.
- Audit finding: orbit camera, day/night/festival, minimap, joystick, diagnostics, ambient (birds/flags/fountain) and interiors by building kind already exist in code; they are unverified on a real GPU.
- Still open: real-GL render proof, device perf numbers, GLB hero models (renderer is custom WebGL; needs a loader decision), avatar clip polish, evidence package.

## Pass L3
- Avatar: heading-based facing (smoothed yaw), limbs in the body-local frame, wave/dance/laugh/cheer emote poses, idle breathing (`world-3d-render.ts`).
- Perf: `lib/perf-sampler.ts` (FrameSampler, QualityGovernor) + 60 s route recorder button in the diagnostics panel (backtick) that downloads a JSON report with device info.
- Auto quality now raises as well as lowers (needs 10 calm seconds with 45% headroom; stops after 2 downgrades; 2 min cooldown).
- Extension architecture is registered at runtime from the renderer (`registerArchitecture`), so `world-architecture.ts` stays plain-Node testable.
- `scripts/capture-evidence.mjs`: per-zone screenshots at 1440x900, 390x844, 360x800 + console/network error log.
- Ran and passed: all 5 `tests/visual/*.mjs`, `scripts/check-repo.mjs`, sampler/governor assertions (compiled). NOT run: pnpm test/build/typecheck, GPU render, two-client E2E.
