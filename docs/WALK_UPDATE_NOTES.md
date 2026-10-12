# Walk update (12 Oct 2026) - status and how to continue

## Done in this pass
- First-person walking camera (default), plus "Behind me" chase view and the old Overview (top menu button, or key V).
  - Drag the world to look (touch or mouse; click the world on desktop for mouse-look, Esc releases). WASD / joystick move relative to where you look. Arrows, Q and R turn. Shift or the lightning button sprints (within server speed tolerance).
  - Files: apps/web/lib/world-camera.ts (solvers, tested in tests/visual/camera-solver.mjs), world-3d-render.ts (camMode fp/chase, view-cone culling, own body hidden in first person), app/play/page.tsx.
- Lag fixes: shader detail layers run only on pixels of their own material, bump maps only on High (about 4.6x faster frame in a software-GL test); view-cone culling; no React re-render while walking (minimap updated on the DOM); zero camera smoothing lag.
- Connection: you can walk while the server wakes; retries for about 2 minutes (was 14 s); small chip instead of the dark overlay; health pings wake the free Render services early (warmServers in lib/api.ts).
- Phone HUD collapsed behind a menu button; minimap shows a view cone.

## Still to do next
- Move the sprint button to the left above the joystick (it overlaps Pocket/Phone buttons in landscape); collapse the HUD behind the menu in short landscape screens (max-height 520px).
- Run full checks: pnpm typecheck, pnpm test, pnpm check:3d (renderer contract test may need new camera input names), pnpm build.
- Real-phone FPS check (Record 60s route button, backtick key). Software GL numbers are relative only.
- Lagos street life: danfo buses, okada, hawkers, denser walking crowds, ambient sound; interaction prompt on the reticle.
- Unbuilt vision list: see VISION_GAPS.md.

## Pass 2 (12 Oct 2026) - third-person default + street life
- Default view is now third-person (you see your own avatar walk, Free Fire style). V cycles Third-person -> First-person -> Overview.
- Chase camera pulled back/raised (4.3 m) so the whole avatar is visible; idle avatar now turns to face where the camera looks.
- Sprint sits beside the joystick on short landscape phones (no overlap with Pocket/Phone buttons); smaller stick there.
- (Removed) danfo/okada traffic: off-vision, CAMPUS is campus life. Do not re-add street-traffic scenery.
- Verified: camera-solver test, renderer contract, mock-WebGL runtime smoke, zone/landmark/district tests all pass.
- NOT verified: pnpm typecheck/test/build (no node_modules in this sandbox, no network), real-phone FPS, visuals on a real GPU.
- Still unbuilt: campus ambient sound, student crowds, skeletal 3D avatars, extra activities, moderation console (see VISION_GAPS.md).

## Pass 3 - articulated skeleton avatars (12 Oct 2026)
- Legs: hip-knee-ankle forward kinematics (thigh/shin as box chains), knee flexes on the swing leg, pelvis drops to keep the planted foot on the ground, stride grows with a walk->run blend (mo.rn).
- Arms: shoulder-elbow-wrist chains swing opposite the same-side leg; elbows bend more when running. Cheer/dance/wave/sit emotes unchanged.
- Cost: ~8 extra boxes per avatar on Medium/High, ~4 on Low. Only runs for drawn avatars (view-cone culled, NPC limit applies).
- Test: tests/visual/3d-renderer-runtime-smoke.cjs now renders walk/run/sit/dance at all quality levels (mock WebGL; checks stable frames, NOT how it looks).
- Limitation: boxes cannot pitch in this renderer, so limbs are stepped box chains, not smooth skinned meshes. True skinned GLB characters need a skinning pass in the shader (next step if you want the Free Fire look).
- NOT verified: visual result on a real GPU/phone. Please check the walk in game and send a screenshot or video.
