# CAMPUS graphics vision and pass log (13 Oct 2026) - READ BEFORE TOUCHING VISUALS

**Owner's goal:** Free Fire-class "stylised-realistic" look in the browser. Quality over quantity: the owner explicitly accepts rebuilding or replacing existing visuals to get there. CoD-level photorealism is NOT achievable on phones in a browser; do not promise it. Stay on the Nigerian campus niche (no off-topic assets). Original or CC0 assets only; record every source in `docs/ASSET_SOURCES.md`.

## What exists (renderer facts)
- Custom raw WebGL1 renderer: `apps/web/lib/world-3d-render.ts` (`@ts-nocheck`), shaders in `apps/web/lib/world-shaders.ts`. Geometry is baked into static batches with vertex colours; there is NO per-draw material id, so shaders classify surfaces heuristically (`wall`, `paving`, `grassy`, `foliage`, `roofSlope`, `glass` from normal, height and colour).
- Detail textures (units 1-4): `detail_paving`, `detail_grass`, `detail_wall`, `detail_roof` in `apps/web/public/assets/textures/`. Packing: R albedo multiplier (0.5 neutral, shader uses R*2), G/B tangent normal xy, A cavity (also drives specular via `dSpec`). Registered in `texUnits` in `world-3d-render.ts`.
- Regenerate with `python3 scripts/textures/build-pbr-textures.py` (deterministic, original, seamless 512px). v1 script `build-detail-textures.py` is superseded.
- Shadow: sun shadow map with rotated Poisson PCF (6 taps medium, 12 high), radius 34/40/48 m.

## This pass (all pushed to HyperNoesis/uni main)
1. Smooth shadow penumbra (was blocky stair-steps) and tighter shadow radius. `world-shaders.ts#shadowAt`, `world-3d-render.ts#shadowPass`.
2. Minimap bug: every unlisted zone was labelled "LIBRARY"; now real names, tiny zones unlabelled. `app/play/page.tsx`.
3. Activity markers (QUIZ/REACTION...) capped per quality (3/5/7), nearest first, de-overlapped, distance-faded. They used to pile up dozens. `overlayLabels` in `world-3d-render.ts`.
4. Foliage translucency + sheen on paving/roofs. `world-shaders.ts` after `vec3 col=albedo*(...)`.
5. PBR-style structured textures: concrete-block coursing (400x200 mm, half-bond, mortar grooves) on building walls, pantile roof texture with normal relief, stronger paving/grass detail with a second finer tap at close range, specular driven by cavity. Verified by real renders (docs/evidence) BEFORE the final wall mask below.
6. UNVERIFIED last edit: `wallT` mask (shader) so block coursing skips brown timber/palm trunks and near-black poles (first render showed brick on trunks/lamp posts/CAMPUS sign). Shader compiles in headless WebGL; the visual result was NOT re-rendered. First thing to do: render and confirm trunks/poles are clean; tune `brown`/`lumB` thresholds or, better, add a real per-draw material flag (see below).

## Verified vs not
- Verified: shader compiles (headless Chromium/SwiftShader), `pnpm check:3d`, `check:repo`, `check:assets` pass, renders of commons/gate/academic views. Render deployed build is live from main (web/api/realtime).
- NOT verified: real phone FPS with the extra texture taps (4 more taps on high); full typecheck/lint/tests this session (npm registry unreachable).

## Known issues to fix next (in order)
1. Confirm the `wallT` mask visually; stop coursing hitting the CAMPUS sign letters. Proper fix: vertex-colour flag or separate draw path for "building shell" geometry so textures apply only where intended.
2. First-person/walk camera clips into colonnade pillars: `solveFirstPersonCamera` and chase camera only test building footprints (`CamBox`). Add pillars/props to the collision data.
3. Palm and tree silhouettes are crude (hard polygon fronds). Rebuild as leaf cards with alpha-cut texture + wind sway; add trunk bark texture.
4. Avatars: low-poly, no face/clothing detail. Needs authored/CC0 character with textures, hair cards, face texture (user will upload packs; sandbox shell cannot download).
5. Hero buildings (Pass C): Grand Gate -> Boulevard -> Student Commons. Add windows with frames/sills, balconies, AC units, parapets, signage, canopies as real geometry. Texture alone will not reach the bar.
6. Post: baked AO for hero zones, cascade or tighter shadow near camera, bloom for signage/night, SSAO-lite. Measure on a real phone first; keep Low/Balanced/High profiles.
7. Day/night look pass; wet-ground, dust, heat haze optional.

## Asset sources (verified reachable this session)
- Shell cannot reach ambientCG, Poly Haven, Quaternius, Kenney sites. The GitHub MCP connector CAN read public GitHub repos (listings and files) but binary files come back through the model context, so large downloads are impractical; `git clone` through the session proxy works for repos added with `add_repo`.
- Found on GitHub: Quaternius building packs (CC0; FBX/OBJ/Blend, not GLB) in `beep2bleep/FreeAssetsByKenneyNLandQuaternius` under "FreeModels by Quaternius[Patreon]/Home and Buildings"; Kenney set already staged in `assets-library/kenney/`; three.js `examples/textures` (brick, hardwood, terrain only; its `ambientcg` folder has just 5 ice maps); Khronos glTF-Sample-Assets (Sponza, VirtualCity: textured but not campus). No real ambientCG/Poly Haven mirror exists on GitHub.
- Best path: the owner uploads CC0 PBR packs (ambientCG, Poly Haven) as a zip; convert to the 4-channel packing above (or extend the loader for separate albedo/normal/roughness).

## Rules for the next AI (do not spoil the vision)
- Do not restart or rewrite. Keep Phase 4 server authority. No street traffic. Fictional campus only.
- Never claim "verified" without a render or test you actually ran. Save renders to `docs/evidence/`.
- Visual harness: `tests/visual/harness/run.mjs` (see HANDOFF_NEXT_AI.md; env: CHROMIUM_PATH, PLAYWRIGHT_PKG, ESBUILD, NODE_PATH). In this sandbox: CHROMIUM_PATH=/opt/pw-browsers/chromium PLAYWRIGHT_PKG=/opt/npm-tools/node_modules/playwright-core ESBUILD=/opt/npm-tools/node_modules/esbuild/bin/esbuild NODE_PATH=/opt/npm-tools/node_modules. Cfg needs width,height,quality,character,frames,me{x,y,heading}; assets:"manifest" loads props; zone rects are in `packages/domain/src/world-data/zones/*.json`.
- Render deploys automatically from `main` (services campus-ng-web/api/realtime). Free plan: progress resets on restart.
