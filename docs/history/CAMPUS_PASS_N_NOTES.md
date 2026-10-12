# Pass N — district building character (11 Oct 2026)
Repo reality: 22 zones, 160 buildings, 158 enterable rooms (already past the 100+ goal), all reachable from spawn.
Gap found: the ~140 generated district rooms differed only by colour/door awning (visual clones).
Added `apps/web/lib/world-district-kinds.ts`: a distinct silhouette + facade grammar for each of 12 room kinds
(dorm tank/balcony/laundry, lab fins/plant/solar, workshop saw-tooth + stack, classroom louvres, office flagpole, clinic lit cross + bay,
shop striped awning + sign, canteen umbrellas/tables, studio canopy + fins, gym clerestory, lounge pergola, hall pediment + dome).
Hooked into the per-building bake in `world-3d-render.ts` (district ids only). Roof-level pieces are dropped when the player is inside
(same rule as the existing rooftop plant); pitched-roof kinds place roof items on the ridge. Seeded variation, deterministic.
Tests: new `tests/visual/district-kinds.mjs` (in `pnpm check:3d`); all check:3d scripts and check-repo pass here.
NOT verified: no real browser/GPU frame was seen, so draw-call impact and visual look are unmeasured. `pnpm build` and typecheck not run (no node_modules offline).
Next: view hero-boulevard and a district in a real browser; if a district looks cluttered, lower counts in `low`/`medium`.

## Pass N2 — avatar, gate pass, pocket + phone
- Avatar: articulated body (thigh/shin/boot, belt, waist, chest, tactical plate carrier + pouches, shoulders, neck, head/jaw/ears/eyes/brows/nose, 2-segment arms with gloves, knee pads, small pack). Anchor heights kept so streamed GLB parts still align. Still primitives: NOT Free Fire/COD fidelity (that needs authored skinned GLB characters + a PBR renderer).
- Main Gate: iron gate leaves that swing open (renderer `input.gateOpen`), two navy-uniform officers, and `GateCheck`: officer walks to you, checks your Campus Pass (unique `CMP-xxxx` from your id), gates open. Once per tab session. CLIENT-SIDE/ceremonial: no server-enforced pass yet, gate has no collision.
- Pocket (coins, rep, inventory items from /api/v1/inventory) and Phone (Chats = existing safe SocialHub: friends-only DMs/groups/block/report; Pass; Wallet). Not real WhatsApp (no phone numbers, links or open DMs by design).
- Unverified: not seen in a browser; gate swing direction/leaf orientation and avatar proportions need a visual check. tsc/build not run (no node_modules).

## Pass N7 — landmark buildings + test-harness repair (11 Oct 2026)
Landmarks (library, lecture blocks, food hall, hostels A/B, creator studio, student centre) now use plastered walls (`mixHex("#ece4d2", colour, .26)`) instead of full-saturation paint, plus a painted base band, a cream cornice, and shutters near the camera.
Per-building: lecture blocks get pilasters + flagpole/pennant; library gets end pilasters + clerestory cornice; food hall gets a kitchen chimney + yellow fascia under the awning.
Sports ground (`world-architecture.ts`): grandstand rear cladding + end walls (+ aisle rails at medium/high), west entrance arch, ticket booth with awning.
Event arena: stage skirt with LED strip, entry steps, acoustic back shell (roof left open so performers stay visible from above), banner over the front truss, FOH mixing desk, shell side wings (medium/high).
Renderer bug fixed: `destroy()` leaked the sky dome program/buffer, sun-shadow programs/buffer and shadow FBO/textures (runtime smoke: 173 created vs 171 deleted; it failed the same way on N6).
Test harness: the zone-architecture failure that got cut off last pass was `ERR_MODULE_NOT_FOUND ./world-flora` (extensionless import, plain Node can't resolve). Added `tests/visual/ts-resolve.mjs` + `ts-resolve-hooks.mjs` (test-only resolver) and wired every `.mjs` test in `check:3d` through it; the runtime-smoke stub now also provides `./world-flora` and `./world-shaders`.
Results here: `pnpm check:3d` all pass (contract, runtime smoke with mock GL, zone-architecture low 1084/1100 budget, camera, expansion, landmarks, district-kinds); `pnpm check:repo` passes.
Visual: `n7_library.png`, `n7_lecture.png`, `n7_foodcourt.png`, `n7_sports.png`, `n7_stage.png` rendered with the repo's snapshot tool in headless Chromium on SOFTWARE GL (SwiftShader), `high` quality, no console/page errors.
NOT verified: no real GPU/phone frame rates (software GL only); full `tsc`/`pnpm typecheck`/`pnpm build` not run; the lockfile is out of sync (`three`, `@types/three` in apps/web/package.json but not in pnpm-lock.yaml) so `pnpm install --frozen-lockfile` fails; I did not regenerate it. Low-quality zone-architecture budget has only 16 primitives of headroom.
Close-up check done (software GL, camera zoom 0.32; NOTE `zoom` scales camera distance, so smaller = closer): `n7_close_library.png`, `n7_close_lecture.png`, `n7_close_food.png` look right; admin district (`n7_admin_district.png`) is already muted (cream walls, navy roofs), no change needed. Creator studio roof slab and market flat-room parapets remain bright pink/purple by design; soften only if you want a calmer palette.
Next: real-device frame-rate check, then fix the lockfile (`pnpm install`) and run typecheck/build.
