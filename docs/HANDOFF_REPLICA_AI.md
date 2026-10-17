# HANDOFF: become a replica of the previous AI, carrying the owner's vision

Read this whole file before touching code. Then read `docs/GRAPHICS_VISION.md` (the "READ FIRST" sections at the end).
Last updated 2026-10-16 (wardrobe + stage, v14).

## 1. Who the owner is and how to work with them

- The owner is building a **Nigerian-campus social game**, playable **in the browser on phones**. The target look is
  **"Free Fire-class"**: mature, realistic-proportion, textured characters and a gritty, believable world.
  Their word is **"hyper real"**. Cartoon, chibi, pastel or "snow human" looks are what they reject.
- They have rejected the current painted Quaternius avatar. Do not defend it or polish it further. It is a placeholder.
- They write in short, casual, sometimes typo-heavy messages. Read intent, not spelling. "Be fast" means skip ceremony.
- They pay for download size. **Keep screenshots small (JPEG, few of them), keep zips small (about 8 MB now), delete old evidence.**
- Standing requests: package a zip each time you finish a chunk, and leave a note for the next AI (this file plus the
  `GRAPHICS_VISION.md` sections).
- They accept unlicensed models ("even if it isn't licensed it is still a model"). Still **record every source and licence
  in the credits** and flag the risk once, briefly. Do not lecture.
- They like honest percentages and honest limits. When asked "how ready is it", give a number and what is missing.
- Decide and proceed. Ask at most one short question, and only for decisions that are expensive to undo.

## 2. Vision rules (do not violate)

1. Realistic proportions, adult characters, real textures (albedo and normal), not flat vertex colour.
2. Black Nigerian characters are the main cast. Skin tones from the existing palette (`#f1d3b5` to `#3d2518`) must be
   reachable by tinting. Hair should include afro, braids, locs, fade.
3. It must run on mid-range phones: triangle budgets are enforced (`pnpm check:budget`).
4. Server-authoritative movement is untouched. Rendering only decides how a validated avatar looks.
5. Never throw in the character loader: any failure falls back to the built-in box avatar.

## 3. Repo map

pnpm + turbo monorepo at `campus_v6/`:

- `apps/web` Next.js client; the renderer is `apps/web/lib/world-3d-render.ts` (custom raw **WebGL1**, `@ts-nocheck`,
  about 1.4k lines) plus `world-shaders.ts`.
- `apps/api` Fastify, `apps/realtime` ws, `apps/worker`, `apps/admin`.
- `packages/domain` (avatar catalog in `src/avatar.ts`), `game-core`, `game-content`, `ui`.
- Character pipeline:
  - `apps/web/lib/skinned-glb.ts`: GLB parser, clip sampling, blending, FK, CPU skinning (`skinToSoup`).
    Constraints: one primitive, no external buffers, no Draco, no cubic-spline, joints parent-before-child, TRS joints only.
  - `apps/web/lib/skinned-character.ts`: `pickClip`, `stepAnimation`, `createCharacterAnimator`, `CHARACTER_LIMITS`.
    The animator expects clips named `Stand_Loop, Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Sprint_Loop, Sitting_Enter,
    Sitting_Idle_Loop, Sitting_Exit, Dance_Loop, Interact, Idle_Talking_Loop` on a 23-joint Quaternius rig.
  - `apps/web/lib/avatar-paint.ts`: material ids to colours (placeholder system).
  - `scripts/models/paint-character.py`: generator for the painted body (placeholder).
  - Assets: `apps/web/public/assets/characters/` (`campus_body.glb`, `campus_body_lod.glb`, README).
- Renderer facts: static geometry is baked into batches with vertex colours; the **dynamic batch (`recorder` arrays
  p/n/c) holds avatars and has no UVs or textures**; 4 detail texture units exist; `uPlain` marks non-masonry; culling is
  disabled. Quality profiles low/medium/high; avatars use full body for the nearest 3 (medium) or 6 (high), then a
  900-tri LOD.
- Triangle governor: `TRI_BUDGET`, `govScale`, `CULL_D`, far-LOD distances.

## 4. Commands and test harness

- `pnpm check:3d`, `pnpm check:repo`, `pnpm check:assets` all pass at last run. `pnpm check:budget` (takes about 10 minutes, run with
  `nohup`) does not fully pass yet.
- Visual harness `tests/visual/harness/run.mjs` needs:
  `CHROMIUM_PATH=/opt/pw-browsers/chromium PLAYWRIGHT_PKG=/opt/npm-tools/node_modules/playwright-core
  ESBUILD=/opt/npm-tools/node_modules/esbuild/bin/esbuild NODE_PATH=/opt/npm-tools/node_modules`
- SwiftShader means timings are not device numbers; triangle counts are exact. At high quality keep frames low (screenshot
  timeout 150 s). Lab view uses `camMode:"fp"`.
- Zip: `cd /home/claude/v9 && zip -qr <name>.zip campus_v6 -x '*/node_modules/*'`.
- Network: public GitHub works (sparse clones with `--filter=blob:none --sparse`); npm is flaky; other asset sites blocked;
  pip has no `meshoptimizer` (use Blender-free Python: numpy plus a hand-written quadric decimator, or `gltfpack` if npm
  `gltfpack` installs; `/home/claude/mrdoob/three.js` has `SimplifyModifier` as a fallback).

## 5. Current state (updated 2026-10-16)

- DONE: realistic textured characters are in the game. Male (AvatarSDK, non-commercial) and female (MPFB, CC0), about 7k tris hero /
  1.9k LOD, one atlas + tint mask each, 22-joint rig renamed to the Quaternius joint names, the 11 UAL clips retargeted by bone
  direction (`scripts/models/build-realistic.py`). Renderer: separate textured avatar pass (`lib/avatar-shader.ts`,
  `drawTexAvatars` / `setSkinnedCharacters` in `world-3d-render.ts`); per-avatar tint uniforms; shadows; `bodyKind(avatar)` picks the
  body from hair style. Tests: `tests/visual/realistic-character.mjs` (in `check:3d`, all green). Evidence: `docs/evidence/*.jpg`.
- The painted Quaternius body is retired (fixtures only). `avatar-paint.ts` / `paint-character.py` still exist for those tests.
- NOT done: triangle budget was last measured BEFORE the heavier avatars (7k vs 3.3k): re-run `pnpm check:budget`
  (nohup, ~10 min) and, if over, lower `hi` counts in the entity loop or the part targets in CONFIG. Earlier failures: low alley 66k,
  medium alley 136k, high boulevard 203k, high alley 237k; levers: cheaper `arch:*` zone bakes, drop building interiors beyond about
  25 m, merge distant props, apply `govScale` to buildings and props.
- Owner asked for Black Nigerian look: sources are not Black. Tint approximates tone only. Better: find or author Black-featured
  sources (face shape, hair), or edit the atlas head tile.


## 5b. WARDROBE + STAGE (added 2026-10-16, v14) - READ THIS FIRST, v15: `pnpm check:3d` PASSES after these changes

Visually confirmed in the game lab and stage harness; `check:3d` green. NOT yet run: `check:assets`, `check:repo`, `check:budget`, typecheck/build, API/domain tests.

- Domain catalog (`packages/domain/src/avatar.ts`): new parts `headwear` (none/fila/beanie/bucket), `bottom` (jeans/chinos/joggers/shorts), `body` (m/f); more hair/tops/accessories. Optional on input with legacy defaults. Check `schemas.ts`, API tests and the manifest `avatarSlots` accept them. The "creator" preset may want `body: "f"`.
- Geometry: `scripts/models/wardrobe.py` builds optional skinned groups (hair styles, hats, glasses, headphones, bags, hood, skirt) with UVs in flat swatch tiles of the atlas; `build-realistic.py` appends them after the base mesh (`extras.campus.groups`, atlas rects topRect/botRect/shoeRect/botCut). Outputs `apps/web/public/assets/characters/campus_{m,f}*.glb` (~1MB each; ~18k tris in file, ~7-9k drawn).
- Runtime: `avatar-wardrobe.ts` (`wardrobeGroups`, `styleFor`), `avatar-shader.ts` (patterns: stripes/ankara/camo/polo/jersey; trousers kinds; shoe colour), `avatar-gl.ts` (shared program/atlas/uniform helpers), renderer uses them in `drawTexAvatars`. `CHARACTER_LIMITS` raised to 24000 tris / 1400KB.
- Stage: `apps/web/lib/avatar-stage.ts` (standalone WebGL front-view lobby, walks in place on a scrolling floor, drag to turn, poses Walk/Run/Idle/Dance/Wave/Sit, settings Lobby/Campus lawn/Sunset/Studio), `components/AvatarStage.tsx` (2D fallback), `AvatarBuilder.tsx` now uses it and lists body/hat/trousers. Test harness: `tests/visual/harness/stage-run.mjs` (+ `stage-entry.ts`, `stage.html`).
- KNOWN TODO: (1) DONE in v15: stage floor fade softened, camera reframed (feet visible). (2) DONE: test limits raised, wardrobe asserts added; legacy painted-body tests skip newer hair/accessories. (3) Add deeper wardrobe tests (every catalog option maps to a group in the GLB). (4) Smoke stubs added and passing. (5) Run typecheck/build, `check:3d`, `check:assets`, `check:repo`, `check:budget` (nohup). (6) Update characters README + CREDITS for new items. (7) MPFB female mouth shows a tongue. (8) Skin tones are tints only; no Black-featured source models yet. (9) Male model is non-commercial (AvatarSDK).

## 6. Next jobs (in order)

1. Run the budget check, fix overruns. 2. Real phone test (FPS on a mid-range Android). 3. Add a `body` (gender) field to the avatar
catalog + server schema instead of the hair rule, and give the customiser real options for these bodies (outfit colour, skin tone,
hair colour work now; hair styles, accessories, tops do not). 4. More outfits/hair as extra atlas tiles or swappable parts.
5. Normal maps for avatars (the source normal maps were dropped to save size; needs a derivative-based tangent frame in
`avatar-shader.ts`). 6. Credits screen from `docs/CREDITS.md`. 7. Swap the non-commercial male for a CC0 one before launch.

## 7. Remaining backlog (from the old list)

Real phone test; typecheck/build/API tests/e2e after edits; glass and transparency; hero Grand Gate and Student Commons;
remove generic district buildings; normal-map textures; AO, bloom, day/night; broadleaf trees; west-side backdrop check;
two-browser server-validated skinned movement; check the other 20 zones; credits screen; Render deploy.

## 8. Style of work to replicate

Narrate little. Create a task list. Build in stages. Verify with the harness and tests, not by eye alone. Report outcome in
one or two sentences with a percent and the one next step. Leave this file updated before every zip.
