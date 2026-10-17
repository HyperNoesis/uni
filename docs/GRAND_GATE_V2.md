# Grand Gate v2.1 (17 Oct 2026), sequence step 1 of the blueprint's hero slice (grander pass)

Scope: ONLY the Grand Gate and its arrival court. Boulevard (y < 126), Commons, avatars, library, renderer code and server data are untouched.

## What it is (all original GLBs, no third-party assets)
| Piece | Size (m) | Notes |
|---|---|---|
| `gate_tower` x2 | 12.3 w x 11.2 d x 28.4 h | paired pylons: stone base, fluted corner columns, jali (breeze-block) panels on all 4 faces, glazed light-slot, belt + gold band, glowing attic slits, flat roof, lit lantern beacon |
| `gate_span` | 22.5 w x 9.2 d, beam 13.6-18.7 m, crest to 26.7 m | roof bridge: navy fascia, timber brise-soleil fins, uplight strips, star-in-roundel crest |
| `gate_letters_grand` x2 | 16.8 w x 2.3 h | ONE dominant sign "UNITY HEIGHTS" (front + campus side), stroke font, emissive |
| `gate_wing` x2 | 17.4 long, steps 5.4 -> 2.4 m | jali screen walls, gold caps, lanterns |
| `gate_pavilion` x2 | 7.1 x 5.9 x 4.2 | gatehouse / welcome desk, off-axis so the vista stays open |
| `gate_pool` x2 | 9 x 8, jets to 4.5 m | twin reflecting pools + fountains flank the lane |
| `gate_plaza` | 80 x 24 | arrival court: terrazzo, paving bands, navy inlay, gold lane edges, medallion, bollards, kerb |
| `gate_mast` x6, `gate_lamp_tall` x6, `gate_kiosk` x2, `gate_monument` x2, `gate_garden_bed` x4 | | flags, twin-arm lamps, wayfinding, crest monument (no extra text), planting |
Clear walking lane: 20 m between tower faces (~19 m at corner columns). Headroom under the span: 13.6 m. v1 tower was 6.6 m tall, 16 m apart (v2.0: 21 m / 15 m).
Kit: 17.8k tris, 1.26 MB (12 GLBs). Gate-area decor: 50 placements.

## First view (intro)
`apps/web/lib/gate-intro.ts`: pure camera path `gateIntroCamera(t)` (7 s): wide low horizon shot -> tilt up to crest + lit sign -> glide past the fountains -> settle behind the player. Meant for the renderer's `camMode:"free"` (`camEye/camTarget/camFov`), skippable, then hand over to the third-person camera at `GATE_INTRO_SPAWN` (60,156, facing the gate). NOT wired in yet; spawn data untouched. Filmstrip: `docs/evidence/grand-gate/intro_filmstrip.png`. v1 kit stays registered as fallback (`gate_pier` must stay: the renderer uses `decor:gate_pier` as the "kit streamed in" flag).

## Rebuild (from repo root)
```
node scripts/models/build-grand-gate.mjs          # writes 11 GLBs + docs/evidence/grand-gate-kit.json
node scripts/world/build-grand-gate-manifest.mjs  # rewrites gate-area decor (y >= 126) in gate_road.json, registers assets.json (idempotent)
python3 scripts/world/preview-grand-gate.py       # numpy preview -> docs/evidence/grand-gate/*.png
```
Conventions: emissive = vertex colour + 2.0; front = +z (arrival, +y in domain); span/letters are authored at height so the GLB sits on y=0 and `assets.json` carries `yOffset`.

## Verified here
All 12 GLBs generated; finite positions, unit normals, bytes <= declared maxBytes; lane clearance checked on placed geometry; six preview views (approach, front 3/4, back, side, aerial, lane-into-campus) in `docs/evidence/grand-gate/`.
## NOT verified (status = NOT RUN, do not mark PASS)
- The previews come from a numpy software rasteriser (flat light, no shadows/shader detail), NOT the game renderer. No Chromium/GPU here.
- `pnpm install/typecheck/build/test`, Next runtime, `check:assets`, `check:vista` (the vista script's old rules may not know the new ids).
- Low/Balanced/High profiles, real Android frame time, shadows on the new geometry, how the renderer's brick-coursing treats the tower shells.
- Decor has NO collision: towers/wings/pavilions are walk-through. Server colliders are untouched.
## Next (still inside the gate step)
1. Run the real renderer screenshots (approach/front/back/side x 3 profiles) and compare with these previews.
2. Add collision footprints for towers/wings/pavilions (server authority) leaving the 19 m lane open.
3. Spawn new players at the forecourt (~60,146) so the first view is this one.
Then the next sequence step: Academic Boulevard.
