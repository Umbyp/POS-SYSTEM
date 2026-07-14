#!/usr/bin/env bash
# Kill stale dev processes, clear the Next.js build cache, then start both apps.
# Fixes the two dev-only errors that show up after an abrupt restart:
#   - API: "EADDRINUSE :::4000" (a previous process still holds the port)
#   - Web: "ENOENT .next/server/.../page.js" or "_document.js" (corrupt .next cache)
#
# Usage:  npm run dev:fresh
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ Killing anything on ports 3000 / 4000…"
lsof -ti:3000 -ti:4000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
pkill -9 -f "ts-node-dev.*src/server" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true

echo "→ Clearing Next.js build cache (apps/web/.next)…"
rm -rf "$ROOT/apps/web/.next"

echo "→ Starting dev servers…"
cd "$ROOT"
exec npm run dev
