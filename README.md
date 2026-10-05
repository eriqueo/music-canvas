# Music Canvas

Self-hosted drawing instrument on hwc-work. Canvas strokes keep normalized coordinates;
horizontal position sets time and vertical position selects a pitch in the current scale.
Completed strokes are immutable and keep their pen color and selected sound.

Run `node test.mjs` for geometry, note generation, drawing files, and export checks.
Run `bash deploy.sh` on hwc-work to publish through the existing `hwc-publish` service.
The app uses reserved port 14000. Source files live in `dist/`; no build is needed.
The published copy is `/opt/business/webapps/music-canvas/`.

Drawings are ephemeral browser state. Save drawing produces an editable version-1 JSON
file managed by the user. No server database, hosted service, or external runtime asset
is required. MIDI and WAV exports use the same compiled stroke notes as playback.

Capacity limits are defined in `dist/music.mjs`: drawing rejects further strokes or
points at capacity; history drops its oldest entry; compiled events and eraser pieces
drop later entries; live audio stops its oldest voice. Playback pauses in hidden tabs.

To remove only this deployment, run `hwc-publish --remove music-canvas`.
