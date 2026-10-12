# Run CAMPUS locally

Needs Node 22+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev                    # web :3000, api :4000, realtime :4001
# or: pnpm start:local      # install + checks, then start everything
```
Open http://localhost:3000, click Play now, and open a second window to see two players together.

Production-style run: `pnpm build`, then start `apps/api`, `apps/realtime` (`pnpm --filter @campus/api start`, `pnpm --filter @campus/realtime start`) and `cd apps/web && npx next start`.

## Useful commands
`pnpm typecheck`, `pnpm test`, `pnpm check:repo`, `pnpm check:ui`, `pnpm check:3d`, `pnpm smoke` (needs api + realtime running), `pnpm e2e:realtime`, `pnpm e2e:phase4`, `pnpm load`.

## Lockfile
`pnpm-lock.yaml` is committed and in sync; installs use it as-is (`frozen-lockfile=true` in `.npmrc`). After editing any `package.json`, run `pnpm install` and commit the updated lockfile.
