#!/usr/bin/env bash
# Restores a dump into a SEPARATE database and checks it. Never targets the live database.
# Usage: DATABASE_URL=<live> RESTORE_DATABASE_URL=<scratch> bash infra/db/restore.sh backup.dump
set -euo pipefail
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
DUMP="${1:?path to dump file required}"
if [ "${RESTORE_DATABASE_URL}" = "${DATABASE_URL:-}" ]; then echo "refusing to restore over DATABASE_URL" >&2; exit 1; fi
pg_restore --no-owner --exit-on-error --dbname "$RESTORE_DATABASE_URL" "$DUMP"
tables="$(psql "$RESTORE_DATABASE_URL" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
ledger="$(psql "$RESTORE_DATABASE_URL" -tA -c "SELECT count(*) FROM ledger_entries")"
echo "restore ok: $tables tables, $ledger ledger entries"
[ "$tables" -ge 10 ] || { echo "restore drill failed: too few tables" >&2; exit 1; }
