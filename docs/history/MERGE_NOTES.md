# Merge notes (2026-10-10)
Base: CAMPUS_Implementation_2026-10-10.zip (Phase 5 + 3D renderer + events + shop + quiz + hunt + basic Wars).
Added: progression/levels, daily quests, streaks (apps/api/src/progress*.ts, packages/domain/src/progression.ts), campus jobs (jobs.ts, JobsSheet, ShiftSheet),
Campus Wars v2 (apps/api/src/wars.ts), event check-in, Today's Tasks HUD panel, restyle, landing tiles, migration 0005.
NOT run in the authoring environment (no network): pnpm install, typecheck, lint, tests, build, any browser. Run:
  pnpm install && pnpm typecheck && pnpm test && pnpm build
Offline logic checks that DID pass: jobs content integrity, shift building/scoring, progression/streaks, Wars caps/fairness/snapshots, interaction-point collision check.
