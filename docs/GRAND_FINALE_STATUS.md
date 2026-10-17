# CAMPUS Grand Finale status - baseline audit (Prompt A)
Date: 2026-10-17. Tree: live `main` @ d4680ea (15 Oct "graphics pass v11") + 17 Oct deploy-delta overlay (uncommitted, branch `audit/grand-finale-baseline`). Node 22.22, pnpm 10.28. Cloud sandbox: no GPU, no phone.

## Commands actually run
| Check | Result | Notes |
|---|---|---|
| pnpm install --frozen-lockfile | PASS | 5.6 s |
| pnpm typecheck / lint / test / build | PASS | 13/13, 10/10, 13/13, all builds ok |
| check:repo, check:ui, check:assets, check:sports, check:minigames | PASS | |
| check:3d | FAIL | `tests/visual/3d-renderer-contract.mjs`: "Unexpected renderer dependency ./avatar-gl" (`world-3d-render.ts:15`, new in the delta; contract allow-list not updated). Later checks in the chain did not run. |
| check:budget | FAIL | alley low 66002/60000, boulevard medium 123441/120000, alley medium 135736/120000, alley high 236608/200000 |
| check:vista | FAIL | `scripts/world/build-gate-vista.mjs` missing (referenced by delta package.json; not in delta or main) |
| gen:gate-kit | NOT RUN | `scripts/models/build-gate-kit.mjs` also missing |
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
