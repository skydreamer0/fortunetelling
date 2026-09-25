#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Install workspace dependencies (packages/core, apps/web) for tests, typecheck and build
bun install
