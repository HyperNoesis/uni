# CAMPUS — Build & Release Plan

**Product:** CAMPUS — *Your life. Your campus. Your world.*  
**Scope:** Browser-first, mobile-first Nigerian campus social game.  
**Date:** 9 October 2026  
**Status:** Existing project extended in-place. This is a delivery plan, not a claim that every future phase is already implemented or that a production build has passed.

## Product direction

CAMPUS should win through campus identity, recurring community participation, and inter-campus competition—not by copying another product's brand or maximising feature count. The initial playable experience should be a compact, welcoming campus where a player can create an identity, move smoothly, meet real players, finish an activity, contribute to Campus Wars, and invite friends in one short session.

### The first-session loop

1. **Arrive:** choose a fictional campus identity and create an avatar.
2. **Explore:** enter a shared campus world; locate the Commons, Library, Academic Block, Hostels, Food Court, Sports Ground, Creator Hub, and Event Arena.
3. **Participate:** use an in-world marker to complete a server-verified activity.
4. **Contribute:** earn a transparent reward and contribute to the weekly campus competition within server-side limits.
5. **Connect:** RSVP to a campus event, meet players, make friends, or join a campus group.
6. **Return:** weekly events, rotating questions, social activity, and future creator-led challenges provide a reason to return.

## What this implementation pass added

- A server-authoritative Campus Quiz with answer choices separated from the server answer key, one-use run IDs, short-run expiry, a minimum answer time, completion idempotency, bounded rewards and a daily start-attempt limit.
- A three-checkpoint Scavenger Hunt: server-attested start board, ordered clue locations, ten-minute route expiry, three-start daily cap, idempotent checkpoint responses, and a final-only reward.
- A server-priced room-cosmetic shop with eight purchasable furnishings, ledger debits, idempotent purchase keys, inventory grants, and a mobile-responsive catalogue UI wired to the Home room editor.
- Weekly Campus Wars with UTC season boundaries, persistent contributions, server-enforced daily caps and an explicit average-contribution leaderboard.
- Four recurring official community events with local-time presentation, live/upcoming state, RSVP/cancel actions, per-occurrence attendance counts, and JSON-snapshot persistence.
- A Campus Quiz interaction marker and in-world quiz/result UI, a Campus Wars standings overlay, an in-world minimap, upgraded landing art, home-page navigation cards, and an activity/event dashboard.
- First WebGL 3D renderer integrated into the actual play loop, with a selectable 2D fallback, screen-space labels and a static/runtime-mocked renderer smoke test. This is source-verified only, not browser/device certified.
- API/store tests for proximity requirements, server-side answer handling, reward idempotency, the daily no-reroll limit, seasonal score caps and persistence, plus event RSVP persistence and cancellation.

These are code changes. The full dependency-backed tests and browser/live-server behavior still need to be run in a working development environment.

## Phase plan and acceptance gates

| Phase | Goal | Current state | Acceptance gate before calling it done |
|---|---|---|---|
| 0. Reproducible foundation | Repo, contracts, CI, logging, config and deployment skeleton | Code present; repo check passes | Clean install; full build, typecheck, lint, unit tests and secret scan pass in CI |
| 1. First arrival | Landing, onboarding, avatar identity and app navigation | Implemented in source; not freshly browser-verified here | Fresh mobile user can sign up, choose a campus and arrive without console/network errors |
| 2. Identity + room | Profile, achievements, inventory starter kit, saveable room, persistent balances | Implemented in source; persistence is JSON snapshot | Restart test; ledger reconciliation; conflicting room edits handled; browser UX verified |
| 3. Flagship campus | Nine connected zones, landmarks, NPCs, collision, camera, quality settings | Low-poly WebGL 3D renderer now wired into the play loop; 2D renderer remains selectable fallback. Runtime not certified | Walkable paths and doors verified on touch + desktop; 3D labels/camera checked in browser; no stuck spawns; target-device FPS/memory budgets pass |
| 4. Multiplayer | Server-authoritative movement, shared players, reconnect, rooms and interactions | Substantial code exists; must run E2E | Two browser sessions see/move independently; reconnect restores state; spoofed positions are rejected; empty rooms cleaned up |
| 5. Social + safety | Friends, campus groups, chat, block/mute, reports and moderator actions | APIs/UI present in source; moderation product still incomplete | Integration/E2E tests pass; blocked users cannot message; report evidence is safe; abuse flows are reviewable; appeals/moderator UI planned before public scale |
| 6. Activity loop | Reaction Challenge + Campus Quiz + Scavenger Hunt; then more minigames | Three activities implemented in source; tests added but not executed | Proximity must be server-attested; answers are server-only; hunt checkpoints are ordered; replay/expired-run abuse rejected; reward ledger reconciles; daily limits survive restart |
| 7. Events + Campus Wars | Weekly season, fair scoring, events and RSVPs | Weekly scoring/UI and recurring RSVP endpoints implemented in source | UTC boundary tests; daily-cap and idempotency tests; RSVP counts persist and cancel; scoring reviewed with real player data before large public competition |
| 8. Economy/shop | Useful cosmetics, prices, purchases, inventory and refunds/corrections | Eight-item server-priced shop and purchase UI/flow implemented in source; automated purchase tests added but unexecuted. Refund/correction tooling remains absent. | Every purchase uses server prices and an idempotency key; no client-granted items; ledger and inventory reconcile; retry recovery does not double-charge; no cash-value claims for virtual coins |
| 9. Creator system | Start with safe templates for quizzes, scavenger hunts, talent showcases and events | Room editor exists; publishing workflow not done | Draft → validation/moderation → publish → play → result loop works; limits, reporting and creator attribution are enforced server-side |
| 10. AI characters/tools | Optional campus NPC helpers or safe creator assistance | Not implemented as a player-facing feature | Clear AI disclosure; age-appropriate outputs; privacy minimisation; spend/rate limits; no false claims of official university information |
| 11. Sponsorship | Clearly labelled campus-safe sponsorship placements | Not implemented | Only after product retention and safety are validated; visible ad labels; placement limits; no deceptive ads or sale of private messages/location data |
| 12. Scale + operations | Database adapter, horizontal realtime routing, backups, moderation ops, observability and load testing | Foundations exist; active store still uses JSON snapshots | Tested Postgres adapter, backups/restores, secret rotation, multi-instance presence/routing, load test and real Android/network profiling pass agreed budgets |

## Implementation order from here

### Gate A — Make the current archive reproducible

Run from a clean checkout in a network-enabled development environment:

```bash
pnpm install
pnpm check:repo
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke
pnpm e2e:realtime
```

Then fix all failures and write down exact output. The current execution environment lacked installed workspace dependencies and could not fetch the pinned `pnpm`, so only syntax transpilation and the repository conformance check were completed for this pass. Do not ship just because the source looks plausible.

### Gate B — Test the first-session loop on real browsers

- Fresh account → campus pick → avatar → load `/play`.
- Keyboard and touch joystick both move; collision and camera remain stable.
- Walk into each marker; only the correct marker opens the activity.
- Correct/incorrect quiz answers produce the expected result; rapid submits, replayed requests and expired runs cannot generate more rewards.
- Campus Wars reflects verified rewards, daily caps, season reset and persisted contribution state.
- Two sessions see each other, and reconnect after a forced disconnect.
- Home navigation, event list and RSVP/cancel all work on mobile portrait layout.

### Gate C — Improve retention before multiplying content

Ship one additional complete minigame at a time (next recommended: penalty shootout, then delivery). The Scavenger Hunt now supplies a three-stop location-based loop. Each activity must use server-validated state and the existing ledger. Track anonymous activation/completion/return events without adding personal information. Review first-session completion and Day-1/Day-7 return before widening the map.

### Gate D — Finish safety, creator and economy workflows

Complete the moderator console and appeal pathway; test block/mute/report actions with two accounts. The first eight-item virtual shop is now implemented in source; verify the purchase tests, ledger reconciliation, retry recovery and actual room placement before launch, then build a narrow template-based creator flow. Avoid a general-purpose world editor until the publish/review/play/result loop is safe and useful.

### Gate E — Make the world visually richer without breaking mobile

A low-poly WebGL 3D renderer is now integrated into `/play`, with selectable 2D fallback; it is a real geometry-based scene, not the promotional image. This is a first 3D milestone, not a full asset-rich engine. The project still needs a working production build, browser visual pass, WebGL context-loss testing, and baseline/3D comparisons for load time, frame pacing, memory and battery on ordinary Android devices. Keep automatic fallback available and do not claim the 3D path is release-ready until those budgets pass.

### Gate F — Prepare a real public launch

Move persistence to a tested database adapter; run migrations, backup/restore drills, rate-limit/load checks and secret hygiene; configure CORS, TLS, logs and error monitoring; establish support/moderation operations and incident procedures. Use a small closed test before inviting a broad audience.

## Quality rules

- **No fake completion:** UI cards marked live must lead to a working flow; planned items say planned.
- **Server is authoritative:** clients request actions; server owns answers, scores, prices, rewards, inventory and permissions.
- **Bounded rewards:** per-activity limits, rate limits and idempotency are required for every reward path.
- **Mobile first:** touch targets, safe-area insets, readable text, reduced-motion support and low-bandwidth graceful behavior matter as much as desktop polish.
- **Safe by design:** blocking, reporting and chat controls are visible; moderation decisions are logged; user-generated content is constrained and reviewed before wider publication.
- **Performance budgets before spectacle:** do not add large textures, effects or a 3D engine without real-device profiling.
- **Honest status:** static checks, unit tests, integration tests, browser checks and production observations are reported separately.

## Known limitations in the current pass

1. A low-poly WebGL 3D renderer is wired into the play loop, with the original 2D renderer as fallback; visual correctness and target-device performance remain unverified.
2. The workspace dependency-backed suite, `next build`, typecheck, `pnpm test`, API smoke tests and two-client realtime tests could not be executed here because workspace dependencies were absent and the pinned package manager could not be fetched.
3. Store data still uses one-process JSON snapshots rather than an active Postgres/Redis production adapter.
4. Social systems exist in source, but moderation appeals, a full moderator web UI, image/UGC moderation, and account recovery remain incomplete.
5. Events are recurring official schedules; push reminders, event hosts, custom events and event notifications remain future work.
6. Three activity loops are wired in source today: Reaction Challenge, Campus Quiz and the ordered Scavenger Hunt. The eight-item virtual shop is wired in source too, but tests/browser use remain unverified. Penalty shootout, delivery, rhythm challenges, creator publishing, AI NPCs and sponsorship surfaces remain future work.

**Definition of the next successful milestone:** the source installs cleanly, all existing tests/typechecks/build pass, the two-client browser test passes, and a tester can complete the first-session loop on both desktop and a typical Android phone without blocking defects.
