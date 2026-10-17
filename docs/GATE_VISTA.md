# Gate vista, entry and Lagos time (17 Oct 2026)
Scope of this pass: logo/icons, front page, entry flow, Grand Gate as real GLB kit, Lagos day/night. Nothing else in the world was touched (avatars and library belong to other passes).

## What changed
- **Lagos sun** `apps/web/lib/lagos-time.ts` (+ `tests/visual/lagos-time.mjs`): solar elevation for Lagos from the real date/time -> `night` (0..1), golden-hour `warmth`, label, greeting. The landing page AND `/play` follow it (`/play` pill cycles Lagos time / Day / Night / Festival; default Lagos time).
- **Renderer** (`world-3d-render.ts`, `world-shaders.ts`): new optional inputs `nightBlend`, `warmth`, `sunElevation` (shadow direction follows the sun, clamped 17-52 deg), `snapLight`, and `camMode:"free"` (+ `camEye/camTarget/camFov`). Old `lighting` values still work.
- **Gate kit**: `scripts/models/build-gate-kit.mjs` (+ `lib/mk.mjs`) authors 18 original GLBs into `apps/web/public/assets/gate/` (pier with jali screens, timber brise-soleil canopy, lit lettering, booth, lamps, benches, planters, neem, royal palm, forecourt, shelter...). 11.3k tris, ~1.0 MB. Registered in `assets.json`; resident budget raised to 6 MB / 140k tris.
- **Placement manifest**: `scripts/world/build-gate-vista.mjs` (rules -> `gate_road.json` decor), validates against buildings/world bounds and fails if GLB share < 90%. Result: 77 GLB instances, 0 procedural props (`pnpm check:vista`, `docs/evidence/gate-vista-placements.json`). When the kit has streamed in, Gate Road bakes only ground surfaces (road deck, centre line, zebra); otherwise the old primitive gate is the fallback.
- **Entry**: new landing (`app/page.tsx`, `landing.css`, `components/GateScene.tsx`, `BrandMark.tsx`): live gate scene, Lagos clock chip, time-aware headline, one dominant CTA. `/start`: school selection REMOVED (campus fixed to `unity_heights`), 2 steps (name, look). New logo/icon (`public/icon.svg`, icon PNGs).
- Orientation: gate FRONT (lit CAMPUS lettering) faces +y (arrival side). Spawn is still at Main Gate (60,74); consider spawning new players at the gate forecourt (~60,146) so the first view is this one.

## Verified (run here)
check:repo, check:assets (91 GLBs), 3d contract + runtime smoke, zone/camera/landmarks/district/skinned/avatar-paint tests, lagos-time, ui-tokens, onboarding-draft, check:vista: all PASS. Real renders (headless Chromium, software GL): gate day/dusk/night, landing day/dusk (desktop) and night (phone) with real walkers.
## NOT verified
`pnpm install/typecheck/build/test` and Next runtime (npm registry unreachable here); the landing/start pages were run through an esbuild harness with stubbed next/link, not `next build`. No real-phone FPS. Decor has no collision (players can walk through piers; server colliders untouched). Mobile night framing and `/start` screenshot not reviewed after the last tweak.
