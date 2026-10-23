# Handoff note for the next AI: Rejuvini Campus gate rework (22 Oct 2026)

Repo: HyperNoesis/uni, branch `gate-security-pass`, base commit `bd5cb68`. Everything below is committed and pushed as WIP; Render staging services redeploy from the branch.
The owner (John) asked for: remove the other gates, expand the front of the Grand Gate, rename it "Rejuvini Campus" with his logo,
and fix the gate choreography (pass thrown / "fat" / not held, guards looking sideways, could not enter the small gate). He wants it realistic, calm, polite.

## DONE
- Other gates removed: old "CAMPUS" arch (`gate()` call removed from `main_gate` in world-architecture.ts, `gate_arch` decor, pillar props, old leaf block in world-3d-render.ts, `gateOpen`, NPC Mr. Bello). `gate_arch`/`gate_pillar` assets deleted.
- Front expanded +24 m: world height 168->192 (world.json, world-environment.ts), gate_road rect h=112, spawn (60,184), new `gate_promenade` GLB (with big logo medallion on the ground), more lamps/palms/benches/beds/neem trees.
- Name + logo: sign is now "REJUVINI CAMPUS" (stroke font in scripts/models/build-grand-gate.mjs). The logo was traced from his screenshot (scripts/brand/trace-logo.py -> apps/web/lib/brand-logo.json) and is used on the gate crest (both faces), the ground medallion and the new `gate_pass_card` GLB.
- Small gate: 3.5 m two-leaf wicket (gate-layout.json, gate_road.json props, drawGateLeaves). The old usable gap was only ~1.2 m, a big reason he "could not enter". Entry button + status lamp on the pier.
- Server-pass reliability: play/page.tsx re-sends `gate_pass` every 1.2 s for 40 s after approval (a lost first message made the server rubber-band him at the wicket).
- Choreography rewrite: apps/web/lib/gate-security.ts. Guards walk straight at the player FACING him (renderer now uses `face` for staff even while walking), lead greets, card is drawn from the pocket, passed hand to hand (lead steps to 1.28 m), inspected, handed back, pocketed, thumbs up, gate man presses the pier button, wicket opens, he steps aside. No flying card. `wave` gesture added (gesture-pose.ts). Police: no sunglasses, faces the road unless player within 10 m, small wave after approval.
- Card drawing: `drawPass` in gate-security-draw.ts (thin 0.2 x 0.125 m, attached to the hand joint, smoothed in the renderer via `passMemo`, no billboard).
- Staff nameplates only show while talking.
- Tests updated: gate-security.test.ts rewritten (passes), world-data.test.ts counts (42 NPCs, 84 solids), realtime room.test.ts collision test (uses west tower), asset-loader.ts budget now read from assets.json `residentBudget` (24 MB / 450k) instead of the world-view zip's hard-coded floor (that floor broke a domain test).
- Last checks green before packaging: web tsc, web gate tests, domain 74/74, realtime 21/21, audit-glb.

## NOT DONE / NOT VERIFIED (do these first)
1. (DONE 23 Oct: GateUI/GateCheck now say Rejuvini Campus / Grand Gate, PassCard carries the logo via BrandMark.) Old text: GateUI.tsx still shows the profile campus name + "Main Gate" in the intro; change to "Rejuvini Campus" / "Grand Gate". `PassCard` in GateCheck.tsx should carry the logo (SVG from brand-logo.json `layers[*].path`). Welcome copy should say Rejuvini Campus.
2. (DONE 23 Oct: spawn y=184 keyframes, aspect-aware FOV; not yet seen on a screenshot.) Old text: `gate-intro.ts` camera keyframes still assume spawn y=162 / camera up to y=190: retune for spawn y=184 and make it aspect-aware (he is on a PORTRAIT phone, 720x1640; a 40 m wide gate does not fit the horizontal FOV from 50 m).
3. Screenshots reviewed so far: spawn view (good), approach + greeting (good), handover (card small and at the hand, but the test camera was badly placed). NOT yet seen: inspect, return, thumbs, wicket open. Run: `PLAYWRIGHT_PKG=/home/claude/.npm-global/lib/node_modules/playwright node tests/visual/harness/run.mjs out.png '<json>' workdir` (see tests/visual/harness/gate-entry.ts; new `cam.follow:"mid"` perpendicular side view). About 1 min per run, software GL.
4. Card grip: no thumb/fingers are drawn over the card yet; check it reads as "held" up close and tune offsets in `inHand` in world-3d-render.ts.
5. Check the wicket leaf swing visually (hinges on pier x=66.4 and tower face x=69.9, swing inward) and that the gate man stands clear at (64.2,133.6).
6. Smoke test and web build now pass. Committed and pushed (WIP). Render auto-deploys the `campus-ng3-*` services from this branch.
7. Confirm other buildings' labels stay hidden before approval (renderer hides them via `gate.quiet`, set while not passed).
8. Known pre-existing issues: `check:3d` references missing tests, avatar-paint hair_ponytail, check:budget alley/boulevard, `check:vista` script missing.

## Interpretations (tell John if wrong)
"those gates" = old CAMPUS arch + its pillars/guard NPC; "expand the front" = deeper, grander forecourt; guards are client-side scenery; only the pass (one item) is in the pocket.

## Don'ts
Do not re-run scripts/world/build-grand-gate-manifest.mjs (it rewrites gate decor and drops the new promenade/lamps). Do not put the Render secrets or his screenshot-derived source anywhere public beyond scripts/brand/.
