# CAMPUS Grand Finale status - baseline audit (Prompt A)
Date: 2026-10-17. Tree: live `main` @ d4680ea (15 Oct "graphics pass v11") + 17 Oct deploy-delta overlay (uncommitted, branch `audit/grand-finale-baseline`). Node 22.22, pnpm 10.28. Cloud sandbox: no GPU, no phone.

## Commands actually run
| Check | Result | Notes |
|---|---|---|
| pnpm install --frozen-lockfile | PASS | 5.6 s |
| pnpm typecheck / lint / test / build | PASS | 13/13, 10/10, 13/13, all builds ok |
| check:repo, check:ui, check:assets, check:sports, check:minigames | PASS | |
| check:3d | PASS (after fix, step 1) |  was: `tests/visual/3d-renderer-contract.mjs`: "Unexpected renderer dependency ./avatar-gl" (`world-3d-render.ts:15`, new in the delta; contract allow-list not updated). Later checks in the chain did not run. |
| check:budget | PASS (after fix, step 1) | was: alley low 66002/60000, boulevard medium 123441/120000, alley medium 135736/120000, alley high 236608/200000 |
| check:vista | REMOVED (step 1) | was: `scripts/world/build-gate-vista.mjs` missing (referenced by delta package.json; not in delta or main) |
| gen:gate-kit | REMOVED (step 1) | `scripts/models/build-gate-kit.mjs` also missing |
| smoke, e2e:realtime, e2e:phase4 | PASS | api + realtime started with `pnpm --filter ... start`, memory store |
| CLIENTS=15 load | PASS | p95 join 68 ms, 0 errors |
| Browser screenshots, two real browser sessions, mobile viewports | NOT RUN | |
| Real Android / GPU performance | BLOCKED | no device |
| Postgres/Redis mode, backup/restore | NOT RUN | |

## Conflicts and risks
1. The delta is not self-contained: `check:vista` and `gen:gate-kit` point at scripts that are in neither the delta nor main. Uploading it as-is leaves those scripts broken.
2. HANDOFF_NEXT_AI.md says typecheck/build were not run after the merge. They now pass, but `check:3d` and `check:budget` regress.
3. Alley and boulevard triangle budgets are exceeded; the new textured avatar atlases are not yet size-checked for mobile.
4. Free-tier Render has no disk, so persistence across restart is unverified.

## Prioritized list
- P0: fix check:3d (allow-list `./avatar-gl` if intended); ship or remove the vista/gen-gate-kit scripts; get tri budgets under limit (alley first); two-browser play-through of landing -> first activity -> reward -> reload persistence (needs DATA_DIR or Postgres).
- P1: Grand Gate -> Boulevard -> Commons evidence at 1440x900, 390x844, 360x800.
- P2: HUD/panel states, texture compression for phones, safety/moderation verification, real-device performance table.

## Step 1 result (2026-10-17): baseline fixed
- All gates green on this branch: typecheck, lint, test, build, check:repo/ui/3d/assets/budget/sports/minigames (commands re-run, exit 0). Server untouched, so smoke/e2e results above still stand.
- check:3d: runtime-smoke stub now knows `./avatar-gl`; `avatar-paint.mjs` no longer demands Wardrobe-v2 hair/accessory groups on the legacy painted body; wrote the two tests the delta referenced but never shipped (`tests/visual/lagos-time.mjs`, `tests/visual/realistic-character.mjs`, loads with the game's real CHARACTER_LIMITS).
- check:budget: alley was ALREADY over on original main (66002 / 135736 / 236608). Fixes in `world-3d-render.ts`: fewer full-detail avatars per tier (high 3, medium 1), governor cull floor 0.55 -> 0.3, prop radius now scales with the governor (floor 0.7). Worst view now 191999/200000 (high alley). Visual effect: dense junctions shed distant detail sooner on phones; needs eyes-on review and a real-device check.
- Harness caveat: `tests/visual/harness` loads the legacy ~5k-tri body, not campus_m/f (7k/1.9k tris), so avatar cost with the realistic bodies is still unmeasured. NOT RUN: measure with campus_m/f.
- Removed `check:vista` and `gen:gate-kit` from package.json because their generators (`scripts/world/build-gate-vista.mjs`, `scripts/models/build-gate-kit.mjs`) were never delivered. The shipped GLBs and `gate_road.json` are unaffected. Restore the generators if you still have them (docs/GATE_VISTA.md).

## NEW release blocker found
`apps/web/public/assets/characters/README.md`: `campus_m.glb` comes from an AvatarSDK "MetaPerson" sample with a **non-commercial licence**. Replace it (or obtain a licence) before any public/commercial launch. Also: README notes neither source avatar is a Black person; skin tone comes from tint only (face detail flat on darkest tones).
