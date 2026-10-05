# Reused implementation

Authorized by Eric, the owner, for Music Canvas. Sibling applications remain unchanged.

- `vendor/ibeetkidz/pwa-update.ts` and protocol: adapted from iBeetKidz a3632fa305295c692a970f5c841e8d6f7738c089. Compiled by esbuild. Startup retries are bounded to three jittered delays within the boot deadline; timeout removes the reload listener. Adult update activation runs after saving, before navigation, so an in-progress navigation does not compete with worker activation. License retained beside source.
- Worker message responder and sibling activation guard in build.mjs adapted from iBeetKidz vite-plugins/pwa-handshake-migration.template.js at that revision. Legacy migration omitted because Music Canvas has no earlier worker.
- Workbox generated full precache and revision checking adapted from iBeetKidz vite.config.ts/check-pwa-build.mjs. Integrity added for this app's static publisher.
- Store interface, memory test adapter, injected IDB factory and keyPath storage in dist/library.mjs adapted from Kid Pix src/colorme/saved-store.ts and src/slideshow/store.ts, 8fb50e26c0afe0078929f366e2b4516992d05482. Transaction completion, reopen, metadata separation and conflict handling added.
- Autosave trouble states and load-last behavior adapted from iBeetKidz app/context.tsx. Serialized writes replace its debounce.
- Two-tap sharing adapted from iBeetKidz components/Track.tsx SEND flow. No React, Phaser or Tone dependency added.

Workbox and its bundled dependencies retain generated license comments in release/. Their dependency licenses are available in node_modules after npm ci.
