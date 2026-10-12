# Deploying CAMPUS on Render

CAMPUS is three Node services that talk to each other, so Render needs all three:

| Service | What it is | Start command |
|---|---|---|
| `campus-ng-web` | Next.js game client | `cd apps/web && npx next start -p $PORT` |
| `campus-ng-api` | Fastify API (accounts, rewards, ledger) | `pnpm --filter @campus/api start` |
| `campus-ng-realtime` | WebSocket server (live multiplayer) | `pnpm --filter @campus/realtime start` |

Vercel/Netlify cannot host the realtime WebSocket server, so use Render for all three.

## Steps
1. Put the project on GitHub (`render.yaml` at the repo root).
2. Render > New > Blueprint > select the repo > Apply.
3. Wait for three green deploys. Open the web URL.

## If a service name is taken
Render makes the public URL from the service name. If `campus-ng-*` is taken, either rename in `render.yaml` or, after the first deploy, read the real URLs from the Render dashboard and set:

- `campus-ng-api`: `API_ORIGIN` = web URL, `REALTIME_INTERNAL_URL` = realtime URL
- `campus-ng-realtime`: `API_ORIGIN` = web URL, `API_INTERNAL_URL` = api URL
- `campus-ng-web`: `NEXT_PUBLIC_API_URL` = api URL, `NEXT_PUBLIC_REALTIME_URL` = realtime URL with `wss://`

`NEXT_PUBLIC_*` values are baked in at build, so trigger a new deploy of the web service after changing them. `API_ORIGIN` must match the web URL exactly (no trailing slash) or the browser will be blocked by CORS.

## Free plan behaviour
- Services sleep after ~15 minutes without traffic. The first visit afterwards can take about a minute; open the API and realtime `/healthz` URLs first to wake them.
- No persistent disk: accounts, coins and progress reset whenever the API restarts. For permanent data, use a paid plan, add a 1 GB Disk to the API mounted at `/var/data` and set `DATA_DIR=/var/data`.

## Verify after deploy
- `https://<api>/healthz` and `https://<realtime>/healthz` return ok
- Web opens, onboarding works, `/play` shows the 3D campus
- A second browser sees the first player
