#!/usr/bin/env bash
# Show what latest.narenana.com is currently pointing at by reading
# the active secrets (overrides) and the wrangler.toml [vars] (defaults).

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== latest.narenana.com config ==="
echo
echo "Active secret overrides:"
npx wrangler secret list 2>&1 | grep -E "VIEWER_HOST|WEBSITE_HOST" || echo "  (none — using defaults from wrangler.toml)"
echo
echo "Defaults from wrangler.toml [vars]:"
grep -E "VIEWER_HOST|WEBSITE_HOST" wrangler.toml | sed 's/^/  /'
echo
echo "Live URL:"
curl -sI https://latest.narenana.com/ | head -1 | sed 's/^/  /'
