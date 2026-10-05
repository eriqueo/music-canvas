export const LIMITS = { strokes: 64, points: 1024, history: 24, events: 4096, voices: 32, fileBytes: 4 * 1024 * 1024 };
export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const SCALES = {
  major: { label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  pentatonic: { label: 'Pentatonic', intervals: [0, 2, 4, 7, 9] },
  dorian: { label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
};
export const SOUNDS = { sine: 'Soft keys', triangle: 'Warm synth', square: '8-bit' };
export const PENS = { copper: { label: 'Copper', token: '--color-copper' }, teal: { label: 'Teal', token: '--color-teal' }, gold: { label: 'Gold', token: '--color-gold' }, green: { label: 'Green', token: '--color-green' }, coral: { label: 'Coral', token: '--color-coral' } };
export function notesFor(key, scale, octave, range = 2) {
  const intervals = SCALES[scale].intervals;
  const count = intervals.length * range + 1;
  return Array.from({ length: count }, (_, r) => {
    const degree = count - 1 - r;
    const midi = 12 * (octave + 1) + key + intervals[degree % intervals.length] + 12 * Math.floor(degree / intervals.length);
    return { midi, label: KEYS[midi % 12], octave: Math.floor(midi / 12) - 1, degree: degree % intervals.length + 1 };
  });
}
export function pitchAt(y, notes) { return notes[Math.max(0, Math.min(notes.length - 1, Math.round(y * (notes.length - 1))))]; }
export function loopEvents(strokes, notes, bpm, swing, divisions = 16, bars = 1) {
  const count = divisions * bars;
  const bins = Array.from({ length: count }, () => new Map());
  for (const stroke of strokes) {
    const points = stroke.points;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
      const low = Math.min(a.x, b.x), high = Math.max(a.x, b.x);
      const first = Math.min(count - 1, Math.floor(low * count)), last = Math.min(count - 1, Math.floor(high * count));
      for (let bin = first; bin <= last; bin++) {
        const x = Math.max(low, Math.min(high, (bin + .5) / count));
        const fraction = Math.abs(b.x - a.x) < 1e-8 ? 0 : (x - a.x) / (b.x - a.x);
        const midi = pitchAt(a.y + fraction * (b.y - a.y), notes).midi;
        bins[bin].set(`${stroke.sound}:${midi}`, { midi, sound: stroke.sound });
      }
    }
  }
  let time = 0;
  const events = [], active = new Map(), ticks = [];
  for (let bin = 0; bin < count; bin++) {
    const duration = (60 / bpm * 4 / divisions) * (bin % 2 === 0 ? 1 + swing : 1 - swing);
    ticks.push({ time, x: bin / count });
    for (const name of active.keys()) if (!bins[bin].has(name)) active.delete(name);
    for (const [name, note] of bins[bin]) {
      if (active.has(name)) active.get(name).duration += duration;
      else if (events.length < LIMITS.events) {
        const event = { ...note, time, duration, x: bin / count };
        events.push(event); active.set(name, event);
      }
    }
    time += duration;
  }
  return { events, duration: time, ticks, limited: events.length >= LIMITS.events };
}
export function eraseAt(strokes, point, radiusX, radiusY) {
  const result = [];
  for (const stroke of strokes) {
    let run = [];
    const flush = () => { if (run.length) result.push({ ...stroke, points: run }); run = []; };
    const outside = p => ((p.x-point.x)/radiusX)**2 + ((p.y-point.y)/radiusY)**2 > 1;
    if (outside(stroke.points[0])) run.push(stroke.points[0]);
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i];
      const ax = (a.x - point.x) / radiusX, ay = (a.y - point.y) / radiusY;
      const bx = (b.x - point.x) / radiusX, by = (b.y - point.y) / radiusY;
      const dx=bx-ax,dy=by-ay,A=dx*dx+dy*dy,B=2*(ax*dx+ay*dy),C=ax*ax+ay*ay-1;
      const discriminant=B*B-4*A*C;
      if (!A || discriminant <= 0) { if(outside(b)) run.push(b); else flush(); continue; }
      const root=Math.sqrt(discriminant),enter=Math.max(0,(-B-root)/(2*A)),exit=Math.min(1,(-B+root)/(2*A));
      if(enter>=exit || exit<=0 || enter>=1) { if(outside(b))run.push(b);continue; }
      const at = t => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
      if(enter>0)run.push(at(enter));
      flush();
      if(exit<1)run.push(at(exit),b);
    }
    flush();
  }
  // At capacity keep the first 64 surviving pieces and shed later pieces.
  return result.slice(0, LIMITS.strokes);
}
export function parseDrawing(value) {
  const fail = () => { throw new Error('INVALID_DRAWING'); };
  if (!value || value.version !== 1 || !Array.isArray(value.strokes) || value.strokes.length > LIMITS.strokes) fail();
  const s = value.settings;
  if (!s || !Number.isInteger(s.key) || s.key < 0 || s.key > 11 || !Object.hasOwn(SCALES,s.scale) || !Number.isInteger(s.octave) || s.octave < 2 || s.octave > 5 || ![1,2,3].includes(s.range) || !Number.isFinite(s.bpm) || s.bpm < 40 || s.bpm > 200 || ![0,.2,.4].includes(s.swing) || ![8,16,32,96].includes(s.divisions) || ![1,2,4].includes(s.bars)) fail();
  const strokes = value.strokes.map(stroke => {
    if (!stroke || !Object.hasOwn(PENS,stroke.pen) || !Object.hasOwn(SOUNDS,stroke.sound) || !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > LIMITS.points) fail();
    return { pen: stroke.pen, sound: stroke.sound, points: stroke.points.map(p => { if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) fail(); return { x:p.x,y:p.y }; }) };
  });
  return { version:1, settings:{key:s.key,scale:s.scale,octave:s.octave,range:s.range,bpm:s.bpm,swing:s.swing,divisions:s.divisions,bars:s.bars}, strokes };
}
function variableLength(value) {
  let bytes = [value & 127];
  while ((value >>= 7)) bytes.unshift((value & 127) | 128);
  return bytes;
}
export function midiFile({ events, duration }, bpm) {
  const division = 480;
  const tempo = Math.round(60000000 / bpm);
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
