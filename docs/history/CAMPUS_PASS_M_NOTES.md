# Pass M — world polish, performance, sit, showcase camera (11 Oct 2026)

## Repo reality (measured, not assumed)
22 zones, 160 buildings, 158 enterable rooms, all reachable from spawn (`tests/visual/world-expansion.mjs`). The "100+ rooms" goal was already met before this pass.

## Changes
- **Performance (mock/software GL draw calls, same camera, same scene):** High 297 -> 186, Medium 182 -> 136 (under the ~150 target), Low 88. How: decal shadows batched to one call per alpha bucket; window-glow geometry merged into each baked mesh (per-vertex flag, shader reads it) so every building/zone/lamp is 1 call not 2. Not a GPU or phone measurement.
- **Labels:** non-activity markers showed a generic "WELCOME"; they now show the real marker name (Job Center, Welcome Notice...). Building names are nearest-first, capped per quality (3/6/9), numbered rooms de-prioritised, and never overlap.
- **Sit (server-validated):** new `sit` emote. Server accepts it only within 2.2 tiles of a bench (`canSit` in domain), holds 20 s, ends when the player walks away. Client shows a Sit button only near a bench; renderer draws a seated pose. Tests added in `apps/realtime/src/room.test.ts`.
- **Showcase camera:** first entry of a session eases from a low wide view down to the play camera in ~5 s; any drag/wheel/Q/R cancels it; skipped for reduced-motion; once per session.
- **Ground:** grass tonal variation + faint mowing stripes in the shader (no extra calls).
- **Ambient:** campus shuttle on Gate Road's west lane (visual only, in the existing dynamic batch).
- **Fixed:** smoke test loader (blocked `check:3d` after Pass L3), stale realtime block test (c joined after b), API typecheck (`store.ts` cast, `app.test.ts` fixtures).
- Dev aid: `globalThis.__campusCallTrace = true` adds per-call-site counts to render stats.

## Evidence (software GL / SwiftShader, NOT a GPU or phone) — `docs/evidence/*.jpg`
hero-boulevard-day, commons-night (window glow works after the merge), gate-road-hostel-village (label fix), gate-road-shuttle. event-arena-festival and library-forecourt were captured before this pass's shader/label changes.

## Test status (run in this session)
PASS: `pnpm check:3d` (all 6 scripts), `check-repo`, domain vitest 70/70, realtime vitest 17/17, typecheck for api/realtime/domain/web (web only reports missing `vitest` types in two test files).
FAIL (pre-existing, outside the world work): 5 `apps/api` tests are stale vs newer features (avatar defaults, war-point caps, layout validation, hunt, jobs). Not touched beyond type fixes.
NOT RUN: `pnpm build`, two-client E2E, real-device FPS.

## Next three fixes
1. Run `node scripts/capture-evidence.mjs` and the 60 s route recorder on a real phone for p50/p95 numbers.
2. Interior polish for the hero rooms (library reading hall, student centre atrium); real GLB/PBR hero assets need a loader decision.
3. Repair the 5 stale API tests so `pnpm test` is green.
