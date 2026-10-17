# Lessons from past passes and the first deploy (15 Oct 2026) - READ BEFORE PUSHING

Distilled from `docs/history/*`, `docs/ROAD_TO_FINISHED.md`, `docs/DEPLOY_RENDER.md` and the owner's own notes. Short on purpose.

## 1. Deploy lessons (first deploy to Render, from `HyperNoesis/uni` main)
- Three services must all be green: `campus-ng-web`, `campus-ng-api`, `campus-ng-realtime`. Vercel/Netlify cannot host the WebSocket server (known, ignore).
- Pushing to `main` auto-deploys. So nothing reaches `main` without the gates in section 3.
- `NEXT_PUBLIC_*` values are baked at build time: change one, redeploy web. `API_ORIGIN` must equal the web URL exactly (no trailing slash) or CORS blocks the browser.
- Free plan: services sleep after ~15 min (first load ~1 min; open `/healthz` on api and realtime first) and there is NO disk, so accounts, coins and progress reset on every restart. Tell testers; do not read a reset as a bug.
- After deploy check: `/healthz` ok on api + realtime, onboarding works, `/play` shows the campus, a second browser sees the first player.

## 2. What the owner has actually seen (use as the baseline)
- v3 on a REAL phone: FPS good, no lag, but the avatar clipped into buildings. Since then the scene got much heavier (about 110k to 190k tris in normal views at Medium, `docs/GRAPHICS_VISION.md`). Nobody has re-tested on a phone since. Treat phone FPS as UNKNOWN and the likeliest thing to have regressed.
- The owner wants: third-person Free Fire-style walking (default, keep), entering most buildings, a bigger world with 100+ rooms (158 exist), campus-niche assets only, no road traffic (do not re-add), CoD/Free Fire-level look as the target (be honest that phones in a browser cap this).
- The owner uploads free asset packs because the sandbox cannot reach ambientCG, Poly Haven, Kenney or Quaternius. Ask for uploads; do not fake them.
- The owner is on free tokens: deliver one whole-game zip per pass, small JPEG evidence only, no long narration.

## 3. Mistakes that repeated, and the rule that stops them
| What went wrong before | Rule |
|---|---|
| Gate A (`pnpm install/typecheck/lint/build`) failed or was blocked several times; lockfile went stale (`three`, `vitest`) | After any dependency or import change run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, then the web build, on a networked machine, BEFORE push. This sandbox has no `node_modules`; its edits were only checked with esbuild + tsc on single files. |
| Speed-hack hole: server credited 50 ms per input, so a client moved at 2x speed | Keep the server authoritative. Never move validation to the client. Re-run `e2e:phase4` after touching movement. |
| Renderer leaked GL programs and buffers on `destroy()` | Any new GL resource needs a matching delete. |
| Extensionless imports broke plain-Node tests | Use the `tests/visual/ts-resolve*.mjs` hooks or esbuild bundling. |
| Triangle counts crept up pass after pass (550k, 220k, 190k per view) | Run `pnpm check:budget` after any visual change. Over-budget views today: low alley, medium alley, high boulevard/alley. |
| A flat colour box in the P builder gets brick coursing from the wall shader | Thin (< .26 m) boxes with face area >= 1 m^2 are flat panels. Use them for concrete, glass, painted surfaces. |
| Earlier handoffs said "Three.js"; the owner approved a Three.js upgrade (plan step 2), but the vision docs later decided to keep the custom WebGL renderer | Do NOT add Three.js unless the owner says so again. If a feature needs it, ask first. |
| Claims of "verified" without evidence | Say "built" until a command or render proves it. Save evidence in `docs/evidence/`. |

## 4. Order of work that the history supports
1. Hero landmarks one at a time, each with a render: Grand Gate (done, v14), library, student centre, arena, Commons. Method: `world-hero-gate.ts` + test + render.
2. Materials and lighting: texture support in `glb.ts`, HDRI-derived sky, AO, bloom, glass transparency.
3. Street life: palms, kiosks, food canopies, danfo, keke, okada (campus niche; keep roads free of traffic).
4. Budget gate green on all views and qualities, then a real-phone test.
5. Then the release gates in `docs/ROAD_TO_FINISHED.md` (first-session loop, safety, retention, Postgres).
