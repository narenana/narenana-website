#!/usr/bin/env bash
# Point latest.narenana.com at a specific branch preview deployment.
#
# Usage:
#   ./scripts/use-branch.sh viewer  feat-mweb-ui-polish
#   ./scripts/use-branch.sh website feat-some-branch
#   ./scripts/use-branch.sh reset
#
# Pages and Workers Builds normalize branch names by replacing slashes and
# anything that isn't [a-z0-9-] with a dash. `feat/foo` → `feat-foo`.
#
# This script does the slug conversion for you and pushes the secret via
# `wrangler secret put`. No Worker redeploy is needed — secrets propagate
# to all running edges within seconds.

set -euo pipefail
cd "$(dirname "$0")/.."

slug() {
  # Lowercase + replace anything not [a-z0-9] with a dash, collapse repeats,
  # trim leading/trailing dashes. Matches Cloudflare's branch slug rule.
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//'
}

cmd="${1:-}"
branch="${2:-}"

case "$cmd" in
  viewer)
    [[ -z "$branch" ]] && { echo "usage: $0 viewer <branch-name>" >&2; exit 1; }
    host="$(slug "$branch").edgetx-log-parser.pages.dev"
    echo "→ Pointing latest's /log-viewer/* at: $host"
    echo "$host" | npx wrangler secret put VIEWER_HOST
    ;;
  website)
    [[ -z "$branch" ]] && { echo "usage: $0 website <branch-name>" >&2; exit 1; }
    # Workers Builds previews follow a similar pattern. Adjust if your
    # account uses a different preview URL convention.
    host="$(slug "$branch").narenana-website.narenana.workers.dev"
    echo "→ Pointing latest's website at: $host"
    echo "$host" | npx wrangler secret put WEBSITE_HOST
    ;;
  reset)
    echo "→ Resetting to production hosts (deleting secret overrides)"
    npx wrangler secret delete VIEWER_HOST 2>/dev/null || true
    npx wrangler secret delete WEBSITE_HOST 2>/dev/null || true
    ;;
  *)
    echo "usage: $0 {viewer|website|reset} [branch-name]" >&2
    exit 1
    ;;
esac

echo "Done. https://latest.narenana.com/ is updating now (~5s edge propagation)."
