#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  bun install
fi
if [ ! -f dist/index.html ]; then
  bun x vite build
fi

cd launcher
nohup bun serve.ts > /tmp/paiju.log 2>&1 &
