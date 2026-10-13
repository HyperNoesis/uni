# Road to "finished" - CAMPUS (13 Oct 2026)
Source of truth: the Master Build Checklist (1,081 items, items stay open until verified with evidence), Master Implementation Prompt section 21 (Definition of done), Phase 4+ Addendum (release gate), Art Direction + Graphics prompts. Detailed per-gate list: `docs/history/CAMPUS_STATUS_2026-10-12.md` section 5 (still accurate except for the updates below).

## Verified this session (commands run, outputs seen)
check:repo, check:ui, check:sports, check:minigames, check:3d, check:assets: 6/6 PASS. (Earlier today, with npm: typecheck 13/13, build 10/10, tests 13/13, smoke, e2e:realtime, e2e:phase4 PASS against the real API in memory-only mode.) Real-renderer screenshots: skinned avatars + LOD, fountain, gate roof, Boulevard planters, detail textures.
Estimated completion (same method as the 12 Oct status, +-5 pts): whole vision built ~68 %, verified ~36 %; world sections 05-09 built ~66 %, verified ~28 %. Nothing is formally PASS yet.

## Very next steps, in order (each closes a checklist gate)
**Gate 0 / A - release health (needs a networked machine; ~1 day)**
1. `pnpm install`, commit lockfile, `pnpm gate:a` (typecheck, lint, API tests, `next build`). Lint and the stale API tests have not been run.
2. Run e2e + `pnpm load` against Postgres/Redis mode, two real browsers, one real Android phone; save screenshots and logs.
**Gate B - the first-session loop (the core product)**
3. Time landing -> first input -> first activity on throttled 4G / low-end Android; prove the full loop persists across refresh (avatar, progress, ledger, Campus Wars).
4. Same account in two tabs, reward double-grant test against the real API, invite link, "what changed since you left" screen, analytics funnel events visible.
**Gate C - the world (largest block)**
5. Renderer: roughness/specular maps, textures for roofs/timber/metal, compress textures (KTX2/WebP), real CC0 PBR sets (you upload; ambientCG/Poly Haven blocked here).
6. Finish the hero slice: Grand Gate portal detail, Boulevard rhythm, Commons seating islands + cafe, hand-modelled hero buildings (gate, student centre, library).
7. Filter Kenney library to campus-appropriate pieces only (no fantasy/off-topic), register under budgets, replace weak props.
8. Capture all 22 zones x close/medium/far x Low/Balanced/High; fix what is wrong; human-scale check; walk all 158 enterable rooms (doors, interiors, collision).
9. Avatars: tune head/hair, seat height on real benches, foot sliding on a device; confirm 2-browser animation from server-validated movement; NPC collision-aware routes.
10. Real-device performance table (FPS, frame time, memory, bytes), WebGL context-loss and 2D fallback tests, responsive HUD captures at 1440x900, 390x844, 360x800, PASS/PARTIAL/FAIL per visual gate.
**Gate D - safety (before any public growth)**
11. Moderator console UI, appeals, report evidence access, quarantine; admin MFA/least privilege + audit log; two-account block/report/rate-limit tests; privacy/age policy; rehearsed backup/restore + incident runbook.
**Gate E - retention**
12. Campus Wars season presentation, fairness and appeal path, season-reset test; events RSVP/cancel and next-event surfacing; audit shootout/delivery/rhythm for server authority; economy end-to-end idempotency, shop <-> room editor.
**Gate F - production backend**
13. Postgres adapter + migrations + restore test; shared grants/presence (Redis) only if measured load needs it; rollback path, health/readiness, release docs.
**After V1 (deliberately deferred by your documents):** Creator Studio, bounded AI helpers, sponsorship placements, multi-city, subscriptions.

## Definition of done per feature (Prompt section 21)
Reachable via normal UI; server-side authorization; persists across refresh; loading/empty/success/failure states; mobile + desktop verified; tests; logs/analytics; no console errors; no committed secrets (`.env.example` updated); docs updated; performance budget checked.

## Always-on rules from the user
Campus niche only (nothing off-topic); original/licensed assets only; do not restart or rewrite; protect Phase 4 server authority; never claim verified/complete without evidence; no street-traffic scenery.
