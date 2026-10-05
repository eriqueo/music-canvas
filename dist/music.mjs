export const STEPS = 16;
export const ROWS = 8;
export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const SCALES = {
  major: { label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  pentatonic: { label: 'Pentatonic', intervals: [0, 2, 4, 7, 9] },
  dorian: { label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
};
export const SOUNDS = { sine: 'Soft keys', triangle: 'Warm synth', square: '8-bit' };
export const emptyGrid = () => Array.from({ length: ROWS }, () => Array(STEPS).fill(false));
export function starterGrid() {
  const grid = emptyGrid();
  [7, 5, 3, 5, 6, 4, 2, 4, 7, 5, 3, 1, 2, 4, 5, 6].forEach((r, s) => { grid[r][s] = true; });
  [0, 4, 8, 12].forEach(s => { grid[7][s] = true; });
  return grid;
}
export function notesFor(key, scale, octave) {
  const intervals = SCALES[scale].intervals;
  return Array.from({ length: ROWS }, (_, r) => {
    const degree = ROWS - 1 - r;
    const midi = 12 * (octave + 1) + key + intervals[degree % intervals.length] + 12 * Math.floor(degree / intervals.length);
    return { midi, label: KEYS[midi % 12], octave: Math.floor(midi / 12) - 1, degree: degree % intervals.length + 1 };
  });
}
export function stepDuration(step, bpm, swing) {
  return (60 / bpm / 4) * (step % 2 === 0 ? 1 + swing : 1 - swing);
}
export function loopEvents(grid, notes, bpm, swing) {
  let time = 0;
  const events = [];
  for (let step = 0; step < STEPS; step++) {
    const duration = stepDuration(step, bpm, swing);
    for (let row = 0; row < ROWS; row++) if (grid[row][step]) events.push({ time, duration: Math.min(duration * .82, .35), midi: notes[row].midi, step });
    time += duration;
  }
  return { events, duration: time };
}
function variableLength(value) {
  let bytes = [value & 127];
  while ((value >>= 7)) bytes.unshift((value & 127) | 128);
  return bytes;
}
export function midiFile(grid, notes, bpm, swing) {
  const division = 480;
  const tempo = Math.round(60000000 / bpm);
  const { events, duration } = loopEvents(grid, notes, bpm, swing);
  const toTicks = t => Math.round(t * bpm / 60 * division);
  const timeline = events.flatMap(e => [
    { tick: toTicks(e.time), bytes: [0x90, e.midi, 90] },
    { tick: toTicks(e.time + e.duration), bytes: [0x80, e.midi, 0] },
  ]).sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);
  const track = [0, 0xff, 0x51, 3, tempo >> 16 & 255, tempo >> 8 & 255, tempo & 255];
  let previous = 0;
  for (const event of timeline) { track.push(...variableLength(event.tick - previous), ...event.bytes); previous = event.tick; }
  track.push(...variableLength(toTicks(duration) - previous), 0xff, 0x2f, 0);
  const n = track.length;
  return new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, division >> 8, division & 255, 77, 84, 114, 107, n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255, ...track]);
}
export function wavFile(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767), true));
  return buffer;
}
