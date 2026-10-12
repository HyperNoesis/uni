# Pass E (2026-10-10): gate, commons landmark, interiors, night/festival, birds, batched avatars

**Added** (all in `apps/web/lib/world-architecture.ts` + `world-3d-render.ts`, HUD toggle in `app/play/page.tsx`)
- Grand Gate: paired pylons with breezeblock screens, lintel with real 3D block lettering "CAMPUS" on both faces (no text textures), flag masts, two gatehouse booths, perimeter wall + screens, two wayfinding totems, planting beds, palms, zebra crossing.
- Transport Edge (inside the gate zone): kerb, bay paint, bollards, fictional shuttle, covered waiting shelter, route sign. Static, visual only.
- Student Commons: paving rings around the fountain, "Unity Beacon" tower (visible down the boulevard), 3 garden/seating islands with shade trees and ring benches, cafe parasols, pennant poles.
- Interiors (visual dressing inside existing enterable buildings): student_centre, library_hall, food_hall, creator_studio, lecture*. Real walk-in spaces already existed; hostels have no dressing yet.
- Lighting mode Day / Night / Festival (HUD pill, smoothly blended). Shader `uNight`. Windows, lamps, LED screens, stage lights, gate lettering and interiors live in a separate baked GLOW mesh per bake, lit at night. Festival adds 5 sweeping sky beams over the stage (not on Low).
- Birds: 2/5/8 by quality, daytime only. Avatars + birds now go through ONE dynamic batch (1 draw call instead of ~9 per avatar).
- Tests updated: zone-architecture covers 9 zones; smoke test floor lowered (batching reduced calls).

**Verified** (mock GL only): `check:3d` suite and `check-repo` pass. Fragment shader read by eye, NOT compiled on a GPU.
**NOT verified**: no real browser frame seen. Likely first-look issues: placements (beacon at 66,41; shuttle bay 63-70 x 73-79; gate z=70.4) were set from zone data, not a screenshot; the glow blend at night; cone beam orientation; `typecheck`/`lint` not run (no node_modules here).
**Known gaps**: no hostel/academic interior dressing, no NPC routes, no HUD design-token pass, no quality-ladder changes, no real performance numbers, no enterable-door animation.
**Next**: run `pnpm install && pnpm typecheck && pnpm dev`, open /play, toggle Night/Festival, send a screenshot or console errors.

## Pass E addendum
- Hostels (scenic-only, no door in data): lit window grid on the courtyard face, clothes line, bike racks. Tests re-run: zone architecture, mock-GL smoke, check-repo all pass. Still no real frame seen.

## Pass F addendum
- 9 more ambient NPCs (commons x3, gate, academic x2, food x2, library, event crew) with deterministic paths in zone JSON; path check: only pre-existing indoor NPCs enter buildings. IDs unchanged.
- New docs: CAMPUS_VISUAL_BIBLE.md, CAMPUS_ASSET_REGISTRY.md, CAMPUS_GATE_SCORECARD.md.

## Pass K (2026-10-11): first REAL browser frames
- Chromium (swiftshader) loaded /play: gate, Student Centre, commons, sports field, minimap, HUD all render. Screenshots desktop 1280x720 and phone 390x844.
- Fixed: 26 TypeScript errors (next build now passes; apps/web tsconfig sets noUncheckedIndexedAccess=false, Avatar casts, FloorTheme local type, quiz narrowing).
- Fixed: backdrop hills sat 70-100 units inside the camera view as giant dark blobs; pushed out to ~230 and shrunk.
- Fixed: phone HUD pills overlapped (wrapping rows, compact pills, zone tag moved down).
- Still open: Next hydration warning on /play (dev overlay), software-GL only so no real FPS, no night/festival frame viewed.

## Pass K addendum
- Night/Festival frames viewed (software GL). Night glow was too weak: raised emissive night gain 4x -> 9x; lettering, beacon, lamps and windows now visibly lit. Festival sky beams not seen (stage out of view).
- Walked south->north/west by keyboard: movement and zone label change (Main Gate -> Campus Paths) work.

## Pass K addendum 2 (HUD)
- /play now has a bottom nav (Home, World, Social, Events, Profile) so players can leave the world; consistent SVG HUD icons (components/HudIcons.tsx); the action button only shows when an interaction is in range; phone minimap shrunk; SSR hydration mismatch (tasks panel) fixed.
- Next: view library/hostel/academic/creator/arena (needs debug teleport), festival beams, design-token file, real-GPU perf numbers.

## Pass L (2026-10-11)
- Buildings were roofless boxes seen from outside; added real roofs (deck, parapet, fascia) that lift off while the player is inside (cached per roof state). Typecheck clean; zone frames viewed after the change looked solid.
- Dev-only `?view=x,y` camera override on /play (visual only) to inspect any zone without walking.
- NOT applied (interrupted): roof skylights/solar, arena ground colour (still teal, looks like water), saturation/contrast shader lift. Next up.

## Pass M (2026-10-11)
- Reset pill emoji replaced by SVG compass. check:3d contract/architecture/camera tests pass (mock GL). Still unviewed on real GPU: library/hostel/academic/creator/arena frames, festival beams, perf numbers.

## Pass N
- Remaining HUD/panel emoji (hunt, quiz, shift, jobs, tasks) replaced by HudIcon SVGs or plain words; 8 icons added. Not typechecked (no node_modules in sandbox).

## Pass O
- Added Transport Edge: shuttleBay() (lane, painted kerb, zebra, shuttle model, shelter, route board, bollards) west of the gate court, registered under main_gate. Visual only, no collision. zone-architecture + renderer-contract tests pass (mock). Unviewed.

## Pass Q (real Chromium frames via snapshot_tool, software GL)
- Distant faculty wings: piers, terracotta bands, roof plant. Library: grand glazed portal + brise-soleil + shade canopy. Arena: paved apron, crowd-pen lines, runway, spectator bank, lawn, pennants. Frames viewed: gate, library, arena (festival). Unviewed: creator hub, academic close-up, hostel courtyard street level, interiors, phone viewport, real-GPU perf.

## Pass R (2026-10-11): world expanded to 240x150, 158 enterable rooms
- World 120x80 -> 240x150. `scripts/world/generate-districts.mjs` (deterministic, idempotent) writes 12 new district zones + registers them in `world-data/index.ts`: Engineering Quarter, Science Complex, College of Medicine, Arts Row, Business & Law, East Hostel Estate (east block, x120-240), Hostel Village, Gate Road (town boulevard outside the gate), Market Town, Admin & Staff Quarter, Research Park, Innovation Village (south block, y80-150).
- 152 new enterable rooms (160 buildings, 158 with doors). Each has a `kind` (classroom, lab, workshop, dorm, office, clinic, shop, canteen, studio, gym, lounge, hall) that drives generic interior dressing (`roomInterior` in world-architecture.ts) and a door awning colour.
- `apps/web/lib/world-districts.ts`: data-driven district dressing (walkways, spine promenade, lamps, plaza, trees, park, boulevard) baked into one mesh per zone. Any zone with no bespoke architecture function gets it automatically.
- Environment rim (wings, skyline, ground, clouds) rescaled for the bigger world; far ambient NPCs (>70 units) are no longer drawn.
- 2 ambient NPCs per district (24 new).
- Tests: `tests/visual/world-expansion.mjs` (in `check:3d`): no zone/building overlaps, >=100 rooms, BFS reachability of every room from spawn, NPC legs unobstructed, render-stub budgets, interior items stay inside rooms and off the doorway strip. All pass. Smoke test registers world-districts.
- Real Chromium (software GL) frames viewed: Engineering Quarter, Hostel Village. Not viewed: interiors at close range, night in the new districts, phone viewport, real-GPU FPS.
- NOT run (no registry access in this sandbox): `pnpm typecheck`, vitest. `world-data.test.ts` counts were updated by hand (22 zones, 160 buildings, 43 NPCs); please run `pnpm test` and `pnpm typecheck`.
- No server-side gameplay (quests/activities) was added to the new rooms yet; they are explorable spaces.

## Pass S: "less Lego" rendering upgrade
- Meshes: spheres/cylinders/cones now use smooth per-vertex normals and higher resolution; new `wedge` (gable prism) primitive; baked normals respect non-uniform scale.
- Shader: procedural plaster grain + damp staining, glass detection with sky reflection and sharp specular, soft sun specular, ground bounce light, sky fresnel sheen.
- Architecture: pitched tiled roofs on dorm/shop/lounge/canteen/clinic/hall rooms (flat decks stay on labs/offices), hall porticos with round columns + entablature, rooftop plant hidden when the roof lifts.
- Verified: real Chromium frames (software GL) of Market Town, Admin Quarter; check:3d suite. Not verified: real-GPU shader compile/perf, night blend in the new districts.
