import { STEPS, ROWS, KEYS, SCALES, SOUNDS, emptyGrid, starterGrid, notesFor, stepDuration, loopEvents, midiFile, wavFile } from './music.mjs';
const $ = id => document.getElementById(id);
let grid = starterGrid(), key = 0, scale = 'major', octave = 4, bpm = 100, swing = 0, sound = 'sine';
let context, master, timer, running = false, nextStep = 0, nextTime = 0, frame, displayedStep = -1;
let click = false, dragging = null, history = [], visualQueue = [], voices = new Set();
const cells = [], stepLabels = [];
// All state is ephemeral. History is capped at 30 edits; at capacity drop the oldest.
function remember() { history.push(grid.map(row => [...row])); if (history.length > 30) history.shift(); $('undo').disabled = false; }
function status(text) { $('status').textContent = text; }
function notes() { return notesFor(key, scale, octave); }
for (const [id, options] of [['key', KEYS.map((name, i) => [i, name])], ['scale', Object.entries(SCALES).map(([id, s]) => [id, s.label])], ['sound', Object.entries(SOUNDS)]]) {
  for (const [value, label] of options) { const option = document.createElement('option'); option.value = value; option.textContent = label; $(id).append(option); }
}
for (let row = 0; row < ROWS; row++) {
  for (let step = 0; step < STEPS; step++) {
    const cell = document.createElement('button'); cell.className = 'cell' + (step % 4 === 0 ? ' beat' : '');
    cell.dataset.row = row; cell.dataset.step = step; cell.type = 'button'; cells.push(cell); $('grid').append(cell);
  }
}
for (let step = 0; step < STEPS; step++) {
  const label = document.createElement('span'); label.textContent = step % 4 === 0 ? step / 4 + 1 : '·'; label.className = step % 4 === 0 ? 'beat' : '';
  stepLabels.push(label); $('steps').append(label);
}
function render() {
  const pitches = notes(); $('labels').replaceChildren();
  pitches.forEach(n => { const label = document.createElement('div'); label.className = 'note-label' + (n.degree === 1 ? ' root' : ''); label.append(n.label); const sup = document.createElement('sup'); sup.textContent = n.octave; label.append(sup); $('labels').append(label); });
  cells.forEach(cell => { const r = Number(cell.dataset.row), s = Number(cell.dataset.step), n = pitches[r]; cell.classList.toggle('active', grid[r][s]); cell.setAttribute('aria-pressed', String(grid[r][s])); cell.setAttribute('aria-label', `${n.label}${n.octave}, step ${s + 1}`); });
  $('note-count').textContent = `${grid.flat().filter(Boolean).length} notes`;
  $('octave').textContent = octave; $('octave-down').disabled = octave <= 2; $('octave-up').disabled = octave >= 6;
}
async function audio() {
  if (!context) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('AUDIO_UNAVAILABLE');
    context = new Audio(); master = context.createGain(); master.gain.value = Number($('volume').value) / 100; master.connect(context.destination);
  }
  await context.resume();
  if (context.state !== 'running') throw new Error('AUDIO_SUSPENDED');
  return context;
}
function synth(ctx, destination, midi, when, duration, type, level = .12, track = false) {
  // Live voices are capped at 32. At capacity shed the oldest voice.
  if (track && voices.size >= 32) { const oldest = voices.values().next().value; oldest.stop(); voices.delete(oldest); }
  const oscillator = ctx.createOscillator(), envelope = ctx.createGain(); oscillator.type = type;
  oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  envelope.gain.setValueAtTime(0, when); envelope.gain.linearRampToValueAtTime(level, when + .008);
  envelope.gain.exponentialRampToValueAtTime(.001, when + duration + .12);
  oscillator.connect(envelope); envelope.connect(destination); oscillator.start(when); oscillator.stop(when + duration + .14);
  if (track) voices.add(oscillator);
  oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
}
async function preview(row) { try { const ctx = await audio(); synth(ctx, master, notes()[row].midi, ctx.currentTime, .16, sound, .12, true); } catch { status('Sound could not start. Try Play loop in a browser with audio support.'); } }
function paint(cell) {
  const row = Number(cell.dataset.row), step = Number(cell.dataset.step);
  if (grid[row][step] === dragging.value) return;
  grid[row][step] = dragging.value; cell.classList.toggle('active', dragging.value); cell.setAttribute('aria-pressed', String(dragging.value));
  $('note-count').textContent = `${grid.flat().filter(Boolean).length} notes`;
  if (dragging.value && !running) preview(row);
}
$('grid').addEventListener('pointerdown', event => {
  const cell = event.target.closest('.cell'); if (!cell || event.button !== 0) return;
  remember(); dragging = { value: !grid[Number(cell.dataset.row)][Number(cell.dataset.step)], pointerId: event.pointerId }; paint(cell);
  if (event.pointerType === 'mouse') event.preventDefault();
});
document.addEventListener('pointermove', event => {
  if (!dragging || dragging.pointerId !== event.pointerId) return;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell'); if (cell) paint(cell);
});
function endDrag() { dragging = null; }
document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);
$('grid').addEventListener('keydown', event => {
  const cell = event.target.closest('.cell'); if (!cell) return;
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); remember(); dragging = { value: !grid[Number(cell.dataset.row)][Number(cell.dataset.step)] }; paint(cell); endDrag(); }
  const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  if (moves[event.key]) { event.preventDefault(); const [dr, ds] = moves[event.key]; const r = Math.max(0, Math.min(ROWS - 1, Number(cell.dataset.row) + dr)); const s = Math.max(0, Math.min(STEPS - 1, Number(cell.dataset.step) + ds)); cells[r * STEPS + s].focus(); }
});
function showStep(step) {
  if (step === displayedStep) return;
  displayedStep = step; cells.forEach(cell => cell.classList.toggle('playhead', Number(cell.dataset.step) === step));
  stepLabels.forEach((label, s) => label.classList.toggle('current', s === step));
}
function animate() {
  if (!running) return;
  while (visualQueue.length && visualQueue[0].time <= context.currentTime) showStep(visualQueue.shift().step);
  frame = requestAnimationFrame(animate);
}
function schedule() {
  if (!running) return;
  if (nextTime < context.currentTime - .1) { stop(); status('Playback paused. Press Play loop to restart.'); return; }
  const pitches = notes();
  // 100ms scheduling horizon; queue <= 16. Shed and stop on a missed deadline.
  let scheduled = 0;
  while (nextTime < context.currentTime + .1 && scheduled++ < 8) {
    const duration = stepDuration(nextStep, bpm, swing);
    for (let row = 0; row < ROWS; row++) if (grid[row][nextStep]) synth(context, master, pitches[row].midi, nextTime, Math.min(duration * .82, .35), sound, .12, true);
    if (click && nextStep % 4 === 0) synth(context, master, nextStep === 0 ? 100 : 93, nextTime, .015, 'sine', .06, true);
    if (visualQueue.length >= 16) { stop(); status('Playback paused. Press Play loop to restart.'); return; }
    visualQueue.push({ time: nextTime, step: nextStep }); nextTime += duration; nextStep = (nextStep + 1) % STEPS;
  }
}
function stop() {
  running = false; clearInterval(timer); cancelAnimationFrame(frame); visualQueue = []; nextStep = 0;
  for (const voice of voices) { try { voice.stop(); } catch {} } voices.clear(); showStep(-1);
  $('play-label').textContent = 'Play loop'; $('play-icon').textContent = '▶'; $('play').setAttribute('aria-pressed', 'false');
}
let starting = false;
async function start() {
  if (starting || running) return; starting = true;
  try { await audio(); if (document.hidden) return; running = true; nextStep = 0; nextTime = context.currentTime + .04; $('play-label').textContent = 'Pause loop'; $('play-icon').textContent = 'Ⅱ'; $('play').setAttribute('aria-pressed', 'true'); status(''); schedule(); timer = setInterval(schedule, 25); animate(); }
  catch { status('Sound could not start. Try again, and check your browser audio settings.'); }
  finally { starting = false; }
}
$('play').addEventListener('click', () => running ? stop() : start());
$('reset').addEventListener('click', () => { const wasRunning = running; stop(); if (wasRunning) start(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && running) { stop(); status('Playback paused while you were away.'); } });
document.addEventListener('keydown', event => { if (event.code === 'Space' && !event.repeat && !event.target.closest('input,select,button,dialog')) { event.preventDefault(); running ? stop() : start(); } });
$('key').addEventListener('change', event => { key = Number(event.target.value); render(); });
$('scale').addEventListener('change', event => { scale = event.target.value; render(); });
$('sound').addEventListener('change', event => { sound = event.target.value; });
$('octave-down').addEventListener('click', () => { octave = Math.max(2, octave - 1); render(); });
$('octave-up').addEventListener('click', () => { octave = Math.min(6, octave + 1); render(); });
$('tempo').addEventListener('input', event => { bpm = Number(event.target.value); $('bpm').textContent = bpm; });
$('swing').addEventListener('change', event => { swing = Number(event.target.value); });
$('volume').addEventListener('input', event => { if (master) master.gain.setTargetAtTime(Number(event.target.value) / 100, context.currentTime, .015); });
$('click').addEventListener('click', () => { click = !click; $('click').setAttribute('aria-pressed', String(click)); });
$('clear').addEventListener('click', () => { remember(); grid = emptyGrid(); render(); status('Grid cleared. Use Undo to bring your notes back.'); });
$('starter').addEventListener('click', () => { remember(); grid = starterGrid(); render(); status('Starter melody loaded. Make it your own.'); });
$('undo').addEventListener('click', () => { if (!history.length) return; grid = history.pop(); $('undo').disabled = !history.length; render(); status('Last grid edit undone.'); });
$('help').addEventListener('click', () => $('help-dialog').showModal());
$('close-help').addEventListener('click', () => $('help-dialog').close());
// Downloads are explicit, non-retriable user effects. No retry loop.
function download(bytes, type, extension) {
  const blob = new Blob([bytes], { type }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `music-grid-${KEYS[key].replace('♯', '-sharp').replace('♭', '-flat')}-${scale}.${extension}`;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('midi').addEventListener('click', () => { download(midiFile(grid, notes(), bpm, swing), 'audio/midi', 'mid'); status('MIDI exported. Open it in your music software.'); });
$('wav').addEventListener('click', async () => {
  const button = $('wav'); button.disabled = true; button.textContent = 'Rendering…'; status('Preparing your audio…');
  try {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!Offline) throw new Error('OFFLINE_AUDIO_UNAVAILABLE');
    const { events, duration } = loopEvents(grid, notes(), bpm, swing); const rate = 44100;
    const ctx = new Offline(1, Math.ceil((duration + .3) * rate), rate), gain = ctx.createGain();
    gain.gain.value = Number($('volume').value) / 100; gain.connect(ctx.destination);
    for (const event of events) synth(ctx, gain, event.midi, event.time, event.duration, sound);
    const rendered = await ctx.startRendering(); download(wavFile(rendered.getChannelData(0), rate), 'audio/wav', 'wav'); status('WAV exported. Your audio includes one loop and its release tail.');
  } catch { status('Audio export failed. Try MIDI export or a browser with offline audio support.'); }
  finally { button.disabled = false; button.innerHTML = 'Export WAV <span aria-hidden="true">↓</span>'; }
});
render();
