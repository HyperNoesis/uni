# Deploy CAMPUS from a phone

## Honest limits
- **Render cannot deploy from a ZIP.** It needs a Git repo. Fastest phone route: create a GitHub repo in the GitHub app/website, upload the unzipped files (Add file > Upload files), then Render > New > Blueprint > pick the repo. `render.yaml` creates 3 services (api, realtime, web).
- **Free plan:** services sleep after ~15 min idle (first load ~1 min, players disconnected). Free Render has **no persistent disk**, so accounts/progress/economy (stored in files under `DATA_DIR`) are **lost on every restart/redeploy**. For permanent data use a paid plan and add a Disk (1 GB) mounted at `/var/data` on `campus-api`, then set `DATA_DIR=/var/data`. No SQL database is wired in; storage is file-based.
- **Vercel cannot run the realtime WebSocket server.**
- Service names must be unique: if `campus-web` etc. are taken, rename them in `render.yaml` (also in the URL env vars).

## Steps
1. Unzip, upload to a new GitHub repo.
2. Render > New > Blueprint > select repo > Apply. `SESSION_SECRET`/`INTERNAL_SECRET` are auto-generated (never put real secrets in the repo).
3. Wait for 3 green deploys.
4. If URLs differ from `campus-*.onrender.com`, fix `API_ORIGIN`, `API_INTERNAL_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_REALTIME_URL` (use `wss://`) and redeploy web (NEXT_PUBLIC values are baked at build).

## Verify checklist
- [ ] `https://<api>/healthz` and `https://<realtime>/healthz` return ok
- [ ] `https://<api>/readyz`-style status shows persistence kind (`/healthz` variants in app.ts)
- [ ] Web opens, create player, `/play` shows the 3D campus (no red console errors)
- [ ] Open a second phone/browser: you see each other
- [ ] Toggle airplane mode 5 s: game reconnects, no duplicate avatar
- [ ] Redeploy API: progress survives only if a Disk + `DATA_DIR` is set

## Local run / tests
`pnpm install && pnpm dev` . Tests: `pnpm test`, `pnpm check:3d`.
Last run here: web production build PASS, check:3d PASS, domain 70/70, realtime 17/17; 5 API tests stale-failing; deployed app NOT verified (no Render access).
