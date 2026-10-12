#!/usr/bin/env bash
# Applies infra/db/migrations/*.sql in order, once each, each in its own transaction. Safe to re-run.
# Usage: DATABASE_URL=postgres://... bash infra/db/migrate.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
DIR="$(cd "$(dirname "$0")/migrations" && pwd)"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
for file in "$DIR"/*.sql; do
  version="$(basename "$file" .sql)"
  applied="$("${PSQL[@]}" -tA -c "SELECT 1 FROM schema_migrations WHERE version = '$version'")"
  if [ -n "$applied" ]; then echo "skip   $version"; continue; fi
  "${PSQL[@]}" --single-transaction -f "$file" -c "INSERT INTO schema_migrations (version) VALUES ('$version')"
  echo "applied $version"
done
