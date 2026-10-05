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

Kid Pix-inspired picture buttons open visual choices for scenes, shapes, mirrors,
pitch snapping, views, and erasers. Scene tiles preview the actual editable vectors.
The nine colored pens show instrument pictures and short names. Main controls have
48-pixel or larger touch targets; Tune holds the detailed music settings and Share
holds WAV and MIDI. Drawing, song files, and audio use the same controls underneath.

The workspace fits one viewport: teal drawing tools on the left, gold music and
song controls on the right, and a copper player below. Phone layouts stack compact
bars around the canvas; short screens scroll inside the tool bars. Pause preserves
the audio-clock position and remaining held-note pitch changes; Stop resets it.
The Drawing menu holds Surprise me, three scenes, and four geometric presets.
Surprise me chooses from the same menu and replaces the selected loop.
It leaves other pages intact, rejects changes at capacity, and records one Undo.
Drawing presets add Mountains & cloud, Forest, and Sailboat as ordinary editable
contours. Each replacement records one Undo and checks the shared stroke capacity.
Dots mark the scan line’s crossings during idle hover and audio-clock playback.
The hover line and dots hide during drawing and erasing; Pause
keeps the dots in place and Stop clears them.
Grid editor projects the same vectors into time columns and scale-note rows without
changing saved drawings or playback. New grid marks snap horizontally to time cells; a tap fills
one time column, and brush erase cuts the selected cell. Pitch snapping is independent
of view: Free leaves the pen unsnapped, Whole uses scale notes, Half uses semitones,
and Quarter uses quarter tones. New strokes keep their chosen pitch resolution.
Existing strokes retain their pitches when the snapping control changes. Free timing uses 32
columns per eight beats; other timing settings follow their note divisions. The
view preference is local browser state.

Brush erase cuts lines. Object erase selects the nearest contour once per tap and
removes its full gesture, including mirrored copies. Old ungrouped lines erase alone.

Shape tools borrow Kid Pix's drag-preview interaction: Line, Circle, Oval,
Rectangle, Triangle, and Diamond. Drag from one corner to the opposite corner;
circles stay round in screen pixels. Outlines become ordinary stroke data.
The upper and lower halves of an oval have separate voices, producing two melodies.
Symmetry mirrors new gestures across the time axis, pitch axis, or both.
Time mirror gives a phrase and its reverse; pitch mirror adds an inverted melody.
Each full gesture is one Undo action. At capacity, the whole gesture is rejected.
Canceling an unfinished shape discards its preview. Shapes retain their selected
instrument and work with page thumbnails, song files, erasing, and audio exports.

Add loop creates another drawing. Duplicate copies the selected loop. Arrow buttons
move it in the sequence; Remove loop and drawing edits can be undone. Song mode plays
the pages in order and repeats the sequence. Loop mode plays only the selected page.
WAV and MIDI export the chosen playback scope, including enabled backing parts.

Run `node test.mjs` for geometry, note generation, drawing files, and export checks.
Run `node browser-test.mjs` for touch-drawn arpeggios and rendered instrument audio
in Chromium, plus page editing, saved song round trips, legacy imports, song playback,
backing audio, touch shapes, circle proportions, mirrored Undo, capacity, and cancellation.
It also checks control bounds and hit targets at desktop and phone sizes, preset
Undo, saved-object erasing, brush erasing, Pause/resume, and Stop.
Physical iPhone output remains unverified on this host.
Set `CHROMIUM_BINARY` if Chromium lives outside the NixOS system path.
Run `bash deploy.sh` on hwc-work to publish through the existing `hwc-publish` service.
The app uses reserved port 14000. Source files live in `dist/`; no build is needed.
The published copy is `/opt/business/webapps/music-canvas/`.
The primary repository is `/home/eric/600_apps/music-canvas` on hwc-work.
Project work uses `ws create --resume music-grid /home/eric/600_apps/music-canvas`.

Drawings are ephemeral browser state. Save song produces an editable version-3 JSON
file managed by the user. Version-1 and version-2 files remain readable and retain
their explicit instruments. Version 3 accepts an optional per-stroke pitchStep (1 for semitones, 0.5 for quarter tones), and
optional per-page stroke object number (1–64) to preserve gesture groups. Missing pitchStep retains the original scale-note mapping. Current readers preserve
resolution in song files; legacy readers ignore it and play scale notes.
MIDI uses separate pitch-bend channels for quarter tones. It rejects exports that
need more than 15 non-drum instrument/tuning combinations; WAV has no MIDI channel
restriction. Missing groups remain independent strokes;
older readers can ignore the field while preserving the drawable contours and audio.
No server database, hosted service, or external runtime
asset is required. MIDI uses the compiled scale notes with instrument programs and
percussion channel 10; live audio and WAV share the sustained voice timeline.

Capacity limits are defined in `dist/music.mjs`: 16 pages, 64 total strokes, 1024 points
per stroke, 24 history entries, 4096 events per loop, and 16384 events per song.
Adding or copying pages and drawing further strokes reject work at capacity;
history drops its oldest entry; compiled events and eraser pieces
drop later entries; live audio stops its oldest voice. Playback pauses in hidden tabs.

To remove only this deployment, run `hwc-publish --remove music-canvas`.
