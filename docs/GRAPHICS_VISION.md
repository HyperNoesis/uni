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
6. FIXED + VERIFIED (follow-up session): the `wallT` colour heuristic never worked. The CAMPUS letters are the `gate_arch.glb` prop (plain vertex colours), not `text3d`, so no colour/emissive test could separate them from walls. Replaced by a real per-draw flag: `uPlain` uniform (`world-shaders.ts`, set in `world-3d-render.ts` from the `plainMesh` set filled by `registerMesh`: every GLB mesh whose slot does not start with `building:`; the instanced path sets it too). Masonry coursing now applies only to baked building shells and `facade_*` models. Renders: `docs/evidence/gate-uplain-fix-2026-10-13.png`, `walls-uplain-fix-2026-10-13.png`. Side effect to review: GLB props such as `gate_pillar` are now smooth (no coursing); decide per prop whether they should be masonry.

## Verified vs not
- Verified: shader compiles (headless Chromium/SwiftShader), `pnpm check:3d`, `check:repo`, `check:assets` pass, renders of commons/gate/academic views. Render deployed build is live from main (web/api/realtime).
- Verified in follow-up session (npm reachable): `pnpm install --frozen-lockfile`, `pnpm -r typecheck` (clean), `pnpm -r test` (all pass), `check:repo`, `check:3d`, `check:assets`.
- NOT verified: real phone FPS with the extra texture taps (4 more taps on high). A single 404 for an unidentified resource is logged on every harness render (not an asset in the manifest; find it with a `page.on('response')` log).

## Known issues to fix next (in order)
1. (done) wall mask / CAMPUS sign: see item 6 above.
2. (done, camera-only) Pillar/trunk/post clipping: while each zone's architecture is baked, `draw()` in `world-3d-render.ts` collects pillar-like boxes/cylinders (h>=2.2 m, footprint <=2.4 m, standing on the ground, non-emissive) into `CAM_PROPS`. The chase camera tests them with the building walls; the first-person eye is pushed out through the nearest face (`solveFirstPersonCamera` now takes `boxes`, tested in `tests/visual/camera-solver.mjs`). Evidence: `docs/evidence/fp-pillar-pushout-before-after-2026-10-13.png`. Limits: only architecture-baked geometry is collected (not GLB-instanced palms/lamps, not chunked solids); the player can still physically walk through decorative pillars, because server colliders were deliberately not touched.
3. (palms done; broadleaf trees still open) Palms are now pinnate: arched rachis + tapered leaflet triangles, in code (`world-flora.ts`, via the new optional `P.tri()` primitive baked by `pushTri` in `world-3d-render.ts`) and in `palm_tree.glb`/`palm_royal.glb` (`generate-props.mjs`, `Mesh.leaf`). Wind: green vertices above ~2.2 m sway via `uTime` in both vertex shaders (avatars/hedges/grass unaffected; the shadow pass does not sway, so shadows are static: acceptable). Evidence: `docs/evidence/palms-pinnate-2026-10-13.png`. STILL OPEN: broadleaf trees (`case "tree"` in the renderer) are still stacked spheres; apply the same leaf-triangle approach. WARNING: `generate-props.mjs` is destructive (rewrites every `zones/*.json`, `assets.json` and emits ~150 extra props); use `scripts/models/regen-palm-only.sh` (needs `ORIG=` pristine checkout) or `git checkout` the collateral afterwards.
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


## Follow-up 2026-10-14 (backdrop, tree leaves, masonry scope)
- Masonry scope is now: building shells + `facade_*` only. `uPlain` (GLB props, decor, primitive shapes, `dyn` avatar batch) and a normal-length flag (|n|=2 set in the baker for thin signboard/banner panels >=1 m^2) switch it off. Evidence: `docs/evidence/avatar-banner-masonry-fix-2026-10-14.png`.
- Model buildings: Kenney backdrop ring + skyline (see ASSET_SOURCES.md). Evidence: `backdrop-orbit-rims-2026-10-14.png`, `backdrop-north-eyelevel-2026-10-14.png`. UNVERIFIED: that every model's front faces the campus on all four sides (south/east/north rims looked right; west not confirmed at eye level). Enterable campus buildings were deliberately NOT replaced by Kenney shells: the roof lifts off when you enter and a solid shell would hide the interior. Hero buildings need a facade with a real door gap + interior cutaway.
- Trees: `leafFringe()` (shared in `world-flora.ts`, plus a renderer copy) adds drooping shingle-leaf triangles to district, architecture-ext, environment-belt and renderer trees. Subtle gain only (`tree-leaf-shingles-2026-10-14.png`); tune or zero the counts if it reads as noise. Gotcha found: every builder object passed to a tree function needs `tri` (environment's did not, so the fringe was silently a no-op).
- Not measured: phone FPS with the backdrop (~1.1-2k tris per model, culled by view cone, every second one skipped on low) and the leaf triangles.

## Follow-up 2026-10-14 (b): all-round fenestration
- Buildings only had windows on the FRONT wall (door side). The bake in `world-3d-render.ts` (search "All-round fenestration") now puts the same glowing windows on the east, west and back walls; in the near-detail LOD it adds sills, lintels, window awnings, shutters (pitched kinds), 4 corner pilasters and a base plinth broken at the door. Evidence: `docs/evidence/facades-all-round-windows-2026-10-14.png`.
- Triangle budget snapshot, alley view `me {120,100} heading pi`, medium, harness: original upload 550,659 tris / 340 drawn; this build 493,107 tris / 375 drawn (palm rebuild saved more than the new detail added). Harness CPU p50 went 32 ms -> 52 ms but that is SwiftShader software GL, NOT a device number. ~490k tris in one view is still far above a safe phone budget: reducing it (merge/LOD far buildings, cheaper shadow pass, drop the interior meshes of buildings that are far away) is a real next step before claiming mobile readiness.
- Hero buildings: `library_hall` and `student_centre` already have bespoke facade GLBs (tower, curtain wall, portico) and looked good; the remaining hero work is the ~150 generic district buildings (now less flat) and avatars.

## Follow-up 2026-10-14 (c): triangle budget pass (v7)
- Big static bakes (environment ring, whole-zone architecture `arch:*`, avenue lamps) are now split into spatial chunks (`splitChunks`/`commitChunks`/`drawChunks` in `world-3d-render.ts`: 40 m cells for env, 24 m for zones/lamps) with bounding boxes; each frame only chunks inside the view frustum draw (`setFrustum`, `chunkVisible`). Baked buildings are frustum-culled too. Off-screen chunks/buildings within the shadow reach still go into the shadow pass, so shadows from unseen casters are kept.
- Sphere tessellation: below High, `sphere` draws use a 224-tri `midsphere` (or 80-tri `lowsphere` when < 0.45 m); High keeps 480.
- Harness now reports `topTris` (triangles per shape/chunk) in its stats.
- Harness numbers (medium, SwiftShader, NOT a device): alley view `me{120,100,pi}` 492,949 -> 219,640 tris (original upload 550,659); boulevard `{60,128,pi}` 224,216; commons `{60,62,pi}` 168,816; phone-low 390x844 `{60,62,pi}` 52,938. Pictures compared before/after for the alley: visually identical.
- All earlier evidence screenshots were deleted on request; new set in `docs/evidence/` (01-04, 2026-10-14). References to old file names above are historical.
- Network this session: raw.githubusercontent.com and npm reachable; ambientCG, Poly Haven, Kenney, Quaternius sites refused by the proxy. GitHub search found only tiny personal repos claiming CC0 PBR textures (unverifiable provenance), so none were pulled. Three.js was NOT added (renderer stays custom, per the vision docs).
- Still open: far-chunk LOD (arch is still ~115k tris in long views), real-phone FPS, avatars/hero facades, a large teal slab on the left of the boulevard (visible in evidence 01) looks like an unfinished shelter/glass box - inspect.

## Follow-up 2026-10-14 (d): distance LOD for big bakes (v8)
- Env ring and zone architecture are baked twice at medium/high: the normal variant and a "low"-quality variant (same builder, `q="low"`). Per 24/40 m cell, cells farther than 46 m (medium) / 70 m (high) draw the low variant (`commitChunks(..., farRec)`, `drawChunks(..., farD)`). Low quality has a single variant.
- Harness medium tris: boulevard 224k -> 188k, commons 169k -> 146k, alley 220k -> 190k (original alley 551k). Phone-size 390x844: low 53k, medium boulevard 110k. SwiftShader numbers, not device numbers. Bevelled boxes were measured at only ~2% of tris (cfg `nobevel:true`), so they are not the lever.
- The "teal slab" in the boulevard is the Gate Road shuttle shelter seen from behind (glass back panel, bench, blue roof). Panel split into 4 framed panes in `world-landmarks.ts#gateRoadExtras`; from a distance it still reads as a pale box: a transparency/alpha pass for glass would fix it properly.
- Evidence in `docs/evidence/` replaced again (01-05).

## Follow-up 2026-10-14 (e): Low-quality avatar + showcase captures (v9)
- Low quality now draws the 3 nearest people (incl. you) with the 900-tri skinned LOD body (was blocky boxes). +~1k tris. Needs `characterLod` loaded (play/page.tsx already does).
- Showcase captures (high, 1920x1080, SwiftShader): `06-showcase-commons-high-*.png` (275k tris), `07-showcase-gate-high-*.png` (348k tris; high has a 70 m LOD distance and no tri cap - phone must NOT use High).
- Honest look verdict: clean stylised low-poly with textured masonry and soft shadows; NOT Free Fire class yet. See the to-do list in the 2026-10-14 final message / ROAD_TO_FINISHED.md.

## Follow-up 2026-10-15: painted, dressed, faced characters (v10, to-do item 5)
- Why: the skinned body had 4 flat colour regions and ignored top/shoes/backpack/hair/face choices (props sat inside the head). Now `scripts/models/paint-character.py` (numpy, deterministic; inputs `scripts/models/base/*_base.glb`, the previous decimated Quaternius bodies) builds `campus_body.glb` / `_lod.glb`:
  head egg-shaped +8%, slimmer neck, chunkier shoes; plane-sliced seams (duplicated cut vertices = crisp hem/cuff/sole/hairline edges); `_PAINT` attribute (material id + baked AO ray-cast on the Stand_Loop pose); always-on collar, ears, nose; optional skinned groups: hood, kaftan skirt, backpack, satchel, chain, 6 hair styles, 4 face expressions, glasses/sunglasses/headphones (LOD has hair/pack/skirt/hood/chain only).
- Runtime: `apps/web/lib/avatar-paint.ts` maps the saved avatar to palette + groups (tee/hoodie/jersey/kaftan, shoe types, hair/skin/outfit colours); `skinned-glb.ts` only skins base + enabled groups; renderer no longer draws the old head props on the painted body. Test: `tests/visual/avatar-paint.mjs` (in `check:3d`).
- Budget: full body 3.3k tris base + only the groups worn (about +0.2-0.6k); stored file 382 KiB. LOD 1.2k base. Per-avatar cost is small next to the 300k-tri scene; the scene remains the phone problem.
- Harness: avatar part props now load (`avatarParts:false` to disable). Lab view: `camMode:"fp"` with extras 1-2.5 m ahead walking toward the camera.
- Known: base-mesh deltoids read as puffy sleeves; hands are mitts; hair is flat-coloured; faces are decals (no lip/eye depth). Not verified on a real phone or in two live browsers. Hair/face/acc geometry follows the head joint only.
- Evidence replaced with 4 small JPEGs (docs/evidence).

## Follow-up 2026-10-15 (b): triangle budget + handoff (v11)
- Added `pnpm check:budget` (`tests/visual/tri-budget.mjs`): real renderer, 390x844, 4 views x low/medium/high, fails over 60k / 120k / 200k tris. Needs Chromium env vars (see HANDOFF_NEXT_AI.md). Takes ~10 min (run in background with nohup).
- Renderer changes: per-quality chunk cull distance (`CULL_D`), near-detail range cut to 16 m medium / 34 m high, cloud spheres now 80-tri, and a triangle governor (`govScale`, `TRI_BUDGET` 52k/105k/175k) that shrinks near-detail/cull distance when the previous frame was over budget.
- RESULT (last full run, honest): PASS low commons/gate/boulevard, medium commons/gate/boulevard, high commons/gate. STILL OVER: low alley 66k, medium alley ~136k (a later single run after speeding the governor gave 116k, not re-run in full), high boulevard 203k, high alley 237k. Floor causes in the alley: `arch:*` zone bakes (market_town, admin_quarter, arts_row), baked buildings (~1.6-3.3k tris each), props, 5k dyn avatars. Next levers: cheaper near variant of arch bakes, drop building interiors beyond ~25 m, merge distant props, apply govScale to baked-building/props distance.
- Tried a 4.2k-tri character base (`build-character.py --src <ual>/glTF --tris 4200`; source repo J-Ponzo/gltf-universal-animation-library @ e24c23c is cloneable via add_repo): almost no visible gain, +2k tris, so NOT used. Body shape (puffy shoulders, mitt hands) is the Quaternius model's limit; a better character must be authored/purchased.
- NOT done / not verified: real phone FPS, typecheck/build/API tests/e2e on this edit (only `check:3d`, `check:assets`, `check:repo`, strict tsc of the 3 avatar modules), two real browsers, glass/transparency, hero Gate/Commons rework, normal-map textures, AO/bloom, trees, credits screen, Render deploy. Remaining to-do list is items 5(rest)-16 of the previous message in ROAD_TO_FINISHED.md order.
- Rules: avatar files are GENERATED (`scripts/models/paint-character.py`, inputs `scripts/models/base/`); never hand-edit the GLBs. Evidence goes in `docs/evidence/` as small JPEGs only (user pays for zip size).
