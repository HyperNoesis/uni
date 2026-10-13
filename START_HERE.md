# START HERE (next AI)
1. Read `docs/HANDOFF_NEXT_AI.md` first, then `docs/ASSET_SOURCES.md`, `DECISIONS.md` (D-045..D-051), `docs/history/CAMPUS_STATUS_2026-10-12.md`.
2. Do NOT restart or rewrite. Keep server authority (Phase 4) intact. CAMPUS = campus life, fictional campus, original/CC0 assets only.
3. Sandbox had NO npm access: `pnpm install`, typecheck, build, API tests were never run this session. Run them first on a networked machine.
4. Verified here: `pnpm check:repo`, `check:assets`, `check:3d` (includes tests/visual/skinned-glb.mjs). Real renders: `tests/visual/harness/run.mjs` -> docs/evidence/.
5. Next: tune the skinned avatar (head/hair scale, seat height, foot sliding vs game speeds, phone performance, 900-tri LOD), then Pass C hero slice (Grand Gate -> Boulevard -> Student Commons) with custom landmarks; Kenney only as filler.
