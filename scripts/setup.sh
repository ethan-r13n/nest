#!/usr/bin/env bash
# First-time setup: checks Node, installs dependencies, generates Worker types and migrates the local D1.
set -euo pipefail

cd "$(dirname "$0")/.."

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 24 ]; then
  echo "Node 24 or later is required (found $(node -v)). Run: nvm use" >&2
  exit 1
fi

corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm --filter @nest/worker types
pnpm --filter @nest/worker db:migrate:local

echo "Ready. Start everything with: pnpm dev"
