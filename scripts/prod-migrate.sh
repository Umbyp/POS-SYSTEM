#!/usr/bin/env bash
# One-shot: apply pending Prisma migrations to the PRODUCTION database.
#
# Why this exists: prod was originally set up with `prisma db push` (no migration
# history), so `migrate deploy` can't apply new migrations until the 0_init
# baseline is recorded once. This script does that baseline (idempotently) and
# then applies every pending migration — fixing the 500s caused by prod missing
# the loyalty / stamp-card / menu-option-group tables & columns.
#
# You provide the prod DB URLs via env (copy them from Render → pos-api → Environment).
# They are NEVER printed or committed.
#
# Usage:
#   export DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true"   # Supabase pooled
#   export DIRECT_URL="postgresql://...:5432/postgres"                    # Supabase direct
#   bash scripts/prod-migrate.sh
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" || -z "${DIRECT_URL:-}" ]]; then
  echo "✗ Set DATABASE_URL and DIRECT_URL first (copy from Render → pos-api → Environment)." >&2
  echo "  export DATABASE_URL=\"...6543/postgres?pgbouncer=true\"" >&2
  echo "  export DIRECT_URL=\"...5432/postgres\"" >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/../apps/api"

echo "→ Current migration status (before):"
npx prisma migrate status || true

echo "→ Baselining 0_init (records it as already-applied; runs no SQL)…"
# Tolerate "already recorded" if a previous run baselined it.
npx prisma migrate resolve --applied 0_init || echo "  (0_init already baselined — continuing)"

echo "→ Applying pending migrations to production…"
npx prisma migrate deploy

echo "→ Final status:"
npx prisma migrate status

echo "✓ Done. Reload the app — /products, /stores/me and menu options should be back."
