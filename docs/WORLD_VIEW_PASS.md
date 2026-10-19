# World view pass (19 Oct 2026)
- Whole world drawn at once: removed distance culling (props 26/48/72 m, chunks 80-140 m, 150 m far plane) and the heading-cone cull. Only frustum culling remains; far chunks use their light variants. Far plane 480, fog starts ~95 m and thins to 80% at 430 m. Every zone's GLBs now stream and stay resident (asset-loader budget raised to 24 MB / 450k tris).
- New static meshes are baked time-sliced (nearest first, ~9 ms/frame) so loading never freezes; the previous variant keeps showing meanwhile.
- Third-person camera rewritten (`chaseView` in world-3d-render.ts): over-the-shoulder, aimed ahead, only buildings block it, min 1.9 m then rises. Your avatar is always drawn with the full skinned body (also on Low) and even before the profile loads.
- Emoji strip removed from the play HUD (Sit is a text pill, sprint is an SVG bolt).
- Graphics: pixel ratio caps low/med/high 0.85/1.2/1.5 -> 1.4/1.8/2.25; soft PCF shadows and detail textures at every level; 2048 shadow map on Medium/High; triangle budgets raised (LOD distance only, never visibility); quality auto-start no longer pins 4-core phones to Low; saved quality key bumped to `campus.quality.v2`.
- NOT verified: real phone/GPU (software-GL renders only), pnpm typecheck/test/build. Test harness: `tests/visual/harness/gate-entry.ts` (+ `domain-shim.ts`, a stand-in for GATE).
