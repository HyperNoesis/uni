# Pass D (2026-10-10): zone architecture, baked props, orbit camera

**Added**
- `apps/web/lib/world-architecture.ts`: static architecture for 7 zones (library forecourt/steps/colonnade/reading pergola, hostel balconies/tanks/courtyard, food canopy/stalls, sports fence/goals/grandstand/scoreboard/floodlights, event stage/truss/LED/speakers/backstage, creator hub neon facade/yard/gallery, academic arcade/steps/flag). Each zone is baked into ONE mesh per quality (cached, released on destroy). Visual only; collision still comes from domain data.
- Props (trees, benches, shelves, counters...) are baked per 30x30 chunk; avenue lamps and planters baked once. Fountain spray, flags, avatars and streamed GLBs stay per-frame. Baked trees no longer sway; their shadow is baked opaque.
- Orbit camera: drag (mouse or touch) to rotate, wheel or pinch to zoom, `Q`/`R` keys rotate. Movement is camera-relative in 3D mode. Zoom is clamped 0.55-1.6. 2D fallback ignores rotation.
- Fix: `destroy()` now releases the instancing program and buffer (leaked before).
- Tests: `tests/visual/zone-architecture.mjs` (new), mock-GL smoke test repaired for the data-driven domain (zod stubbed, `getExtension`, avatar module, dynamic resource-release check).

**Measured (mock GL, real campus JSON, 1 player, steady state after bake, camera yaw 0.6)**
Draw calls per frame: low 50-68, medium 81-109, high 99-117 (was ~142-245 medium before this pass). Avatars are NOT batched yet (about 9 draws each), so a crowd of 20 adds about 180. This is a call-count model, not a GPU or device measurement.

**Not verified**: no real browser frame has been seen. Check zone placement visually (steps, canopy, grandstand positions were set from zone rects, not from a screenshot).
**Next**: batch avatars, event-night lighting, interiors, NPC life, HUD, obstruction-aware camera (buildings are low, so the camera is high enough not to clip today).
