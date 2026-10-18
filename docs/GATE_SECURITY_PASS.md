# Grand Gate entry check — pass notes (2026-10-18)

You spawn on the forecourt in front of a **closed** Grand Gate. Walk toward it:

1. 2–5 blue-uniformed guards (random each time; caps, glasses, batons) run out and surround you. The lead says "Stop! Stop there!" then "Where's your pass?".
2. Your avatar reaches to its pocket and holds the **3D pass** out (a glowing card in the world, not a screen overlay). Tap it (or press E).
3. The pass flies to the lead guard, is scanned ("Hmm… let me see"), then "Approved! 👍" (thumbs-up) and the card goes back to you.
4. The Gate Man walks to the latch and opens the **small pedestrian gate** beside the big gate ("Come in, oga"). The big gate is for cars and stays shut.
5. One police officer + one Nigeria Police Hilux (white/blue, bull bar, caged bed, flashing roof bar) stay parked beside the gate.

Code map: `packages/domain/src/gate-security.ts` + `world-data/gate-layout.json` (shared geometry/rules) · `apps/web/lib/gate-security.ts` (state machine) · `gesture-pose.ts` (arm poses) · `gate-security-draw.ts` (pass, leaves, car, kit) · `gate-entities.ts` · renderer hooks in `world-3d-render.ts` · `app/play/page.tsx` · server `gate_pass` in `apps/realtime`.
Server: unapproved players cannot cross the wicket (segment-checked, no tunnelling); approval is soft authority (accepted only within 20 m of the gate).

Screenshot harness: `node tests/visual/harness/run.mjs <out.png> '{"entry":"gate-entry.ts","shots":[...]}' <workdir>` (see `tests/visual/harness/gate-entry.ts`).

## Not done in this pass
- Not run on a real phone/GPU; only SwiftShader screenshots.
- Forecourt is only ~13 m deep (world ends at y=150): extend WORLD.height + plaza for a longer approach.
- Side walls (x≈19.6 / 99.6) and wing closures exist as invisible collision only; add visible railings/walls.
- `build-grand-gate-manifest.mjs` still rewrites decor only; props, spawn and building removals were edited by hand in the zone JSON (re-running it will not undo them, but does not know about them).
- Police car is code-drawn primitives; a proper GLB would look better.
- "olcat" interpreted as ONE police officer + ONE patrol car. Tell me if you meant something else.
- At Low quality only 3 skinned bodies are allowed, so extra guards render as the older box bodies.
- Guard AI: no collision/avoid between guards; pass tap needs the 3D card on screen (first-person camera hides your own body/card).
- Intro camera runs once per page load (skippable); not tuned on device.
- `check:3d` references missing test files (realistic-character, lagos-time) and `avatar-paint` fails on campus_body.glb hair_ponytail; `check:budget` reports alley low over budget. None touch gate code; not fixed.
- e2e scripts were not run (they may assume the old spawn).
- No multiplayer visibility of other players' guard interactions (client-side scene; guards are not server entities).
