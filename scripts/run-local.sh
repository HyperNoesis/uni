#!/usr/bin/env bash
# One command to install, verify and run CAMPUS locally.
# Usage: bash scripts/run-local.sh          (install + checks + start api, realtime, web)
#        bash scripts/run-local.sh --no-checks   (skip the verification step)
# Needs: Node 22, pnpm 10.28 (corepack enable), network access to the npm registry.
set -euo pipefail
cd "$(dirname "$0")/.."
corepack enable >/dev/null 2>&1 || true
echo ">> installing (lockfile is repaired automatically if out of sync)"
pnpm install
if git rev-parse --git-dir >/dev/null 2>&1 && ! git diff --quiet -- pnpm-lock.yaml; then
  echo ">> pnpm-lock.yaml was regenerated. Commit it: git add pnpm-lock.yaml && git commit -m 'sync lockfile'"
fi
if [ "${1:-}" != "--no-checks" ]; then
  echo ">> checks"; pnpm check:repo; pnpm check:3d; pnpm typecheck
fi
echo ">> starting api :4000, realtime :4001, web :3000 (Ctrl+C stops all)"
trap 'kill 0' EXIT
pnpm --filter @campus/api dev &
pnpm --filter @campus/realtime dev &
pnpm --filter @campus/web dev &
wait
