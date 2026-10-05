#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[[ "$(hostname)" = "hwc-work" ]] || { echo "Run this deployment on hwc-work." >&2; exit 1; }
npm ci --ignore-scripts
node --check dist/app.mjs
node build.mjs
node test.mjs
node storage-test.mjs
node pwa-test.mjs
node browser-test.mjs
node offline-test.mjs
# Deploy is an explicit, idempotent replacement of this app only; no retry loop.
hwc-publish music-canvas ./release/ --port 14000
