#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[[ "$(hostname)" = "hwc-work" ]] || { echo "Run this deployment on hwc-work." >&2; exit 1; }
node --check dist/app.mjs
node test.mjs
node browser-test.mjs
# Deploy is an explicit, idempotent replacement of this app only; no retry loop.
hwc-publish music-canvas ./dist/ --port 14000
