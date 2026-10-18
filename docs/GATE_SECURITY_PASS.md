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

## Pass 2 (polish)
- Real Toyota Hilux double-cab in Nigeria Police livery as a GLB (`scripts/models/build-police-hilux.mjs`): blue body, white roof, POLICE on doors/tailgate, bull bar, caged bed, blinking light bar.
- Guards walk (never run), stand upright, greet by name ("All good, Daniel! Welcome to Unity Heights. 👍"), nameplate only while talking; always real skinned bodies; police officer stays relaxed.
- Pocket holds only the Campus Pass; the UI says so and offers a clear "Show my Campus Pass (E)" button.
- New UI: `components/GateUI.tsx` + `app/gate.css` (intro title, controls hint, 4-step glass card with captions, welcome pass card; reduced-motion aware; left-docked on desktop, top on phones).
- World extended 18 m south: paved avenue with lamps and palms, spawn at y=160, side walls extended.

## Not done
- Not run on a real phone/GPU; only software-GL screenshots and a static render of the UI over them.
- Side walls are collision only (no visible railings yet). Police car is a stand-alone prop (no driver/interior).
- `build-grand-gate-manifest.mjs` still rewrites decor only; the avenue props, spawn and building removals are hand-edited in the zone JSON.
- "Only the pass in your pocket" was implemented as: the pocket holds one item and nothing else can be presented. If you wanted a decoy-item rejection mini-game, say so.
- `check:3d`/`check:vista` reference missing files; avatar-paint fails on campus_body.glb; `check:budget` alley/boulevard over budget (untouched by this work).
- e2e scripts not run. Guards are client-side scenery (other players do not see your check).
