#!/usr/bin/env bash
# Writes a compressed custom-format dump. Usage: DATABASE_URL=... bash infra/db/backup.sh [outfile]
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT="${1:-campus-$(date -u +%Y%m%dT%H%M%SZ).dump}"
pg_dump --format=custom --no-owner --file "$OUT" "$DATABASE_URL"
echo "backup written: $OUT"
