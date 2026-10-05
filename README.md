# Music Canvas

Self-hosted drawing instrument on hwc-work. Canvas strokes keep normalized coordinates;
horizontal position sets time and vertical position selects a pitch in the current scale.
Completed strokes are immutable and keep their pen color and selected sound.
Free timing follows each pitch crossing along the stroke without a timing grid.
The optional timing settings quantize playback. Nine pen colors select Keys, Pluck,
Bell, Marimba, Flute, Strings, Chime, Bass, and 8-bit. Sustained instruments keep one
voice through contiguous pitch changes in Free timing. Supported iPhones
use the playback audio session so the silent switch does not mute the instrument.
Each loop has eight beats, matching the reference: 120 BPM gives four seconds.
Independent dot buttons add bass, drums, and a scale-aware arpeggio.

Add loop creates another drawing. Duplicate copies the selected loop. Arrow buttons
move it in the sequence; Remove loop and drawing edits can be undone. Song mode plays
the pages in order and repeats the sequence. Loop mode plays only the selected page.
WAV and MIDI export the chosen playback scope, including enabled backing parts.

Run `node test.mjs` for geometry, note generation, drawing files, and export checks.
Run `node browser-test.mjs` for touch-drawn arpeggios and rendered instrument audio
in Chromium, plus page editing, saved song round trips, legacy imports, song playback,
and backing audio. Physical iPhone output remains unverified on this host.
Set `CHROMIUM_BINARY` if Chromium lives outside the NixOS system path.
Run `bash deploy.sh` on hwc-work to publish through the existing `hwc-publish` service.
The app uses reserved port 14000. Source files live in `dist/`; no build is needed.
The published copy is `/opt/business/webapps/music-canvas/`.

Drawings are ephemeral browser state. Save song produces an editable version-3 JSON
file managed by the user. Version-1 and version-2 files remain readable and retain
their explicit instruments. No server database, hosted service, or external runtime
asset is required. MIDI uses the compiled scale notes with instrument programs and
percussion channel 10; live audio and WAV share the sustained voice timeline.

Capacity limits are defined in `dist/music.mjs`: 16 pages, 64 total strokes, 1024 points
per stroke, 24 history entries, 4096 events per loop, and 16384 events per song.
Adding or copying pages and drawing further strokes reject work at capacity;
history drops its oldest entry; compiled events and eraser pieces
drop later entries; live audio stops its oldest voice. Playback pauses in hidden tabs.

To remove only this deployment, run `hwc-publish --remove music-canvas`.
