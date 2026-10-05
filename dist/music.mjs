export const LIMITS = { strokes: 64, pages:16, songEvents:16384, points: 1024, history: 24, events: 4096, voices: 32, fileBytes: 4 * 1024 * 1024 };
export const PULSES_PER_LOOP=8;
export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const SCALES = {
  major: { label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  pentatonic: { label: 'Pentatonic', intervals: [0, 2, 4, 7, 9] },
  dorian: { label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
};
export const INSTRUMENTS = {
  keys: { label:'Keys', wave:'sine', harmonics:[0,1,.5,.25,.12,.06], sustain:.55, attack:.008, release:.12, channel:0, program:0 },
  pluck: { label:'Pluck', wave:'triangle', harmonics:[0,1,.6,.35,.2,.1], sustain:.08, attack:.004, release:.08, channel:1, program:24 },
  bell: { label:'Bell', wave:'sine', harmonics:[0,1,.15,.7,0,.35], sustain:.35, attack:.008, release:.45, channel:2, program:14 },
  marimba: { label:'Marimba', wave:'sine', harmonics:[0,1,0,.04,.4], sustain:.06, attack:.003, release:.1, channel:3, program:12 },
  flute: { label:'Flute', wave:'sine', harmonics:[0,1,.1,.02], sustain:.95, attack:.06, release:.15, channel:4, program:73 },
  strings: { label:'Strings', wave:'sawtooth', harmonics:[0,1,.7,.5,.4,.3,.2], sustain:.85, attack:.12, release:.25, channel:5, program:48 },
  chime: { label:'Chime', wave:'sine', harmonics:[0,1,0,0,.6,0,0,.3], sustain:.2, attack:.006, release:.35, channel:6, program:10 },
  bass: { label:'Bass', wave:'sine', harmonics:[0,1,.45,.12], sustain:.75, attack:.02, release:.1, channel:7, program:32 },
  chip: { label:'8-bit', wave:'square', harmonics:null, sustain:.8, attack:.008, release:.06, channel:8, program:80 },
};
// Permanent version-1 compatibility: explicit sounds on old strokes stay intact.
Object.assign(INSTRUMENTS,{
  sine:{...INSTRUMENTS.keys,label:'Soft keys',release:.08},
  triangle:{label:'Warm synth',wave:'triangle',harmonics:[0,1,0,.3,0,.12,0,.05],sustain:.85,attack:.008,release:.08,channel:10,program:81},
  square:{...INSTRUMENTS.chip,release:.08},
});
export const SOUNDS = Object.fromEntries(Object.entries(INSTRUMENTS).map(([id,instrument])=>[id,instrument.label]));
export const PENS = Object.fromEntries(Object.entries({
  teal:{token:'--color-teal',sound:'keys'},
  copper:{token:'--color-copper',sound:'pluck'},
  rose:{token:'--color-red',sound:'bell'},
  gold:{token:'--color-gold',sound:'marimba'},
  blue:{token:'--color-blue',sound:'flute'},
  coral:{token:'--color-coral',sound:'strings'},
  green:{token:'--color-green',sound:'chime'},
  slate:{token:'--color-base-500',sound:'bass'},
  cream:{token:'--color-cream-100',sound:'chip'},
}).map(([id,pen])=>[id,{...pen,label:INSTRUMENTS[pen.sound].label}]));
export const LAYERS={bass:{label:'Bass',dots:'•',token:'--color-green'},drums:{label:'Drums',dots:'••',token:'--color-gold'},arpeggio:{label:'Arpeggio',dots:'•••',token:'--color-blue'}};
export const DRAWING_VERSION=3;
export const DRUMS={kick:{midi:36,duration:.16},snare:{midi:38,duration:.12},hat:{midi:42,duration:.045}};
export function notesFor(key, scale, octave, range = 2) {
  const intervals = SCALES[scale].intervals;
  const count = intervals.length * range + 1;
  return Array.from({ length: count }, (_, r) => {
    const degree = count - 1 - r;
    const midi = 12 * (octave + 1) + key + intervals[degree % intervals.length] + 12 * Math.floor(degree / intervals.length);
    return { midi, label: KEYS[midi % 12], octave: Math.floor(midi / 12) - 1, degree: degree % intervals.length + 1 };
  });
}
export const SNAP_MODES={free:{label:'Free'},whole:{label:'Whole'},half:{label:'Half',step:1},quarter:{label:'Quarter',step:.5}};
export function pitchPositions(notes,step){
  if(!step)return notes.map((note,i)=>({...note,y:i/(notes.length-1)}));
  const high=notes[0].midi,low=notes.at(-1).midi;
  return Array.from({length:Math.round((high-low)/step)+1},(_,i)=>{
    const midi=high-i*step;let row=0;
    while(row<notes.length-2&&midi<notes[row+1].midi)row++;
    const y=(row+(notes[row].midi-midi)/(notes[row].midi-notes[row+1].midi))/(notes.length-1);
    const integer=Math.floor(midi);return {midi,y,label:KEYS[integer%12],octave:Math.floor(integer/12)-1,cents:midi%1?50:0};
  });
}
export function pitchAt(y,notes){
  if(notes[0].y===undefined)return notes[Math.max(0,Math.min(notes.length-1,Math.round(y*(notes.length-1))))];
  return notes.reduce((nearest,note)=>Math.abs(note.y-y)<=Math.abs(nearest.y-y)+1e-12?note:nearest);
}
export function snapPitch(point,notes,mode){
  if(mode==='free')return point;
  const note=pitchAt(point.y,pitchPositions(notes,SNAP_MODES[mode].step));
  return {...point,y:note.y};
}
export const FREE_TIMING = 96; // Version-1 drawings use 96 for the Free menu option.
function freeEvents(strokes, notes, bpm, swing, bars) {
  const duration=60/bpm*PULSES_PER_LOOP*bars, count=FREE_TIMING*bars, pulse=duration/count;
  const timeAt=x=>{const step=Math.min(count-1,Math.floor(x*count)),fraction=x*count-step;return Number((pulse*(step+(step%2?swing:0)+fraction*(step%2?1-swing:1+swing))).toFixed(12));};
  const ranges=new Map();let pieces=0,limited=false;
  const add=(midi,sound,lane,x0,x1)=>{
    const start=timeAt(x1>x0?x0:Math.min(x0,1-1/count)),end=x1>x0?timeAt(x1):Math.min(duration,start+pulse);
    if(end<=start)return;
    const key=`${lane}:${sound}:${midi}`,list=ranges.get(key)||[],last=list.at(-1);
    if(last&&start<=last.end+1e-9&&end>=last.start-1e-9){last.start=Math.min(last.start,start);last.end=Math.max(last.end,end);return;}
    // Bound intermediate intervals too; at capacity shed later note pieces.
    if(pieces>=LIMITS.events){limited=true;return;}
    pieces++;list.push({midi,sound,lane,start,end});ranges.set(key,list);
  };
  for(const [lane,stroke] of strokes.entries()){
    const rows=pitchPositions(notes,stroke.pitchStep);
    for(let i=0;i<Math.max(1,stroke.points.length-1);i++){
      let a=stroke.points[i],b=stroke.points[Math.min(i+1,stroke.points.length-1)];
      if(a.x>b.x)[a,b]=[b,a];
      const cuts=[0,1],dy=b.y-a.y;
      if(dy)for(let row=0;row<rows.length-1;row++){
        const fraction=((rows[row].y+rows[row+1].y)/2-a.y)/dy;
        if(fraction>0&&fraction<1)cuts.push(fraction);
      }
      cuts.sort((a,b)=>a-b);
      for(let j=1;j<cuts.length;j++){
        const from=cuts[j-1],to=cuts[j],midi=pitchAt(a.y+dy*(from+to)/2,rows).midi;
        add(midi,stroke.sound,lane,a.x+(b.x-a.x)*from,a.x+(b.x-a.x)*to);
      }
    }
  }
  const events=[];
  for(const list of ranges.values()){
    list.sort((a,b)=>a.start-b.start);let held;
    for(const interval of list){
      if(held&&interval.start<=held.end+1e-9)held.end=Math.max(held.end,interval.end);
      else{held={...interval};events.push(held);}
    }
  }
  events.sort((a,b)=>a.start-b.start||a.midi-b.midi);
  return {events:events.map(e=>({midi:e.midi,sound:e.sound,lane:e.lane,time:e.start,duration:Number((e.end-e.start).toFixed(12)),x:e.start/duration})),duration,ticks:Array.from({length:count},(_,i)=>({time:timeAt(i/count),x:i/count})),limited};
}
export function loopEvents(strokes, notes, bpm, swing, divisions = 16, bars = 1) {
  if(divisions===FREE_TIMING)return freeEvents(strokes,notes,bpm,swing,bars);
  // A loop has eight quarter-note beats: eighths need 16 steps per loop.
  const count = divisions * bars * PULSES_PER_LOOP / 4;
  const bins = Array.from({ length: count }, () => new Map());
  for (const stroke of strokes) {
    const rows=pitchPositions(notes,stroke.pitchStep);
    const points = stroke.points;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
      const low = Math.min(a.x, b.x), high = Math.max(a.x, b.x);
      const first = Math.min(count - 1, Math.floor(low * count)), last = Math.min(count - 1, Math.floor(high * count));
      for (let bin = first; bin <= last; bin++) {
        const x = Math.max(low, Math.min(high, (bin + .5) / count));
        const fraction = Math.abs(b.x - a.x) < 1e-8 ? 0 : (x - a.x) / (b.x - a.x);
        const midi = pitchAt(a.y + fraction * (b.y - a.y), rows).midi;
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
export function compileLoop(strokes, settings) {
  const {key,scale,octave,range,bpm,swing,divisions,bars}=settings;
  const drawing=loopEvents(strokes,notesFor(key,scale,octave,range),bpm,swing,divisions,bars);
  const parts=settings.parts||{},backing=[],duration=drawing.duration;
  const beat=60/bpm;
  const at=(step,perBeat)=>Math.min(duration,step*beat/perBeat+(step%2?swing*beat/perBeat:0));
  const add=(layer,sound,midi,time,length,level)=>backing.push({layer,sound,midi,time,duration:Math.min(length,duration-time),x:time/duration,level});
  if(parts.bass)for(let i=0;i<bars*PULSES_PER_LOOP;i++)add('bass','bass',36+key,at(i,1),beat*.38,.075);
  if(parts.drums){
    for(let i=0;i<bars*PULSES_PER_LOOP;i++){const sound=i%2?'snare':'kick';add('drums',sound,DRUMS[sound].midi,at(i,1),DRUMS[sound].duration,.12);}
    for(let i=0;i<bars*PULSES_PER_LOOP*2;i++)add('drums','hat',DRUMS.hat.midi,at(i,2),DRUMS.hat.duration,.045);
  }
  if(parts.arpeggio){
    const ascent=notesFor(key,scale,4,1).reverse().map(n=>n.midi),riff=[...ascent,...ascent.slice(1,-1).reverse()];
    for(let i=0;i<bars*PULSES_PER_LOOP*4;i++)add('arpeggio','pluck',riff[i%riff.length],at(i,4),beat*.16,.045);
  }
  // Reserve the bounded backing pattern; shed later drawing events at the shared limit.
  const kept=drawing.events.slice(0,LIMITS.events-backing.length);
  const events=[...kept,...backing].sort((a,b)=>a.time-b.time||a.midi-b.midi);
  return {...drawing,events,bpm,bars,limited:drawing.limited||kept.length<drawing.events.length};
}
export function compileSong(pages,settings){
  let duration=0,limited=false;const events=[],cues=[];
  pages.forEach((page,index)=>{
    const loop=compileLoop(page.strokes,settings);cues.push({index,start:duration,duration:loop.duration});limited ||= loop.limited;
    for(const e of loop.events){if(events.length>=LIMITS.songEvents){limited=true;break;}events.push({...e,time:e.time+duration,page:index});}
    duration+=loop.duration;
  });
  return {events,duration,cues,bpm:settings.bpm,bars:settings.bars*pages.length,limited};
}
// Freehand sustained instruments keep one voice while pitch follows a line.
// MIDI retains the individual scale notes; both live and WAV use this audio timeline.
export function audioTimeline(events){
  const result=[],held=new Map();
  for(const e of events){
    if(e.lane===undefined||!['flute','strings','bass','chip'].includes(e.sound)){result.push(e);continue;}
    const key=`${e.page??0}:${e.lane}`,last=held.get(key);
    if(last&&Math.abs(last.time+last.duration-e.time)<1e-8){last.path.push({midi:e.midi,time:e.time-last.time,duration:e.duration});last.duration=e.time+e.duration-last.time;}
    else{const voice={...e,path:[{midi:e.midi,time:0,duration:e.duration}]};held.set(key,voice);result.push(voice);}
  }
  return result.sort((a,b)=>a.time-b.time||a.midi-b.midi);
}
export function eraseAt(strokes, point, radiusX, radiusY, limit=LIMITS.strokes) {
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
  return result.slice(0, limit);
}
export function parseDrawing(value) {
  const fail = () => { throw new Error('INVALID_DRAWING'); };
  if (!value || ![1,2,DRAWING_VERSION].includes(value.version)) fail();
  if(value.version===DRAWING_VERSION){
    if(!Array.isArray(value.pages)||!value.pages.length||value.pages.length>LIMITS.pages||!Number.isInteger(value.selectedPage)||value.selectedPage<0||value.selectedPage>=value.pages.length||typeof value.song!=='boolean')fail();
    const pages=value.pages.map(page=>({strokes:parseDrawing({version:2,settings:value.settings,strokes:page?.strokes}).pages[0].strokes}));
    if(pages.reduce((n,p)=>n+p.strokes.length,0)>LIMITS.strokes)fail();
    const normalized=parseDrawing({version:2,settings:value.settings,strokes:[]});
    return {version:DRAWING_VERSION,settings:normalized.settings,pages,selectedPage:value.selectedPage,song:value.song};
  }
  if(!Array.isArray(value.strokes)||value.strokes.length>LIMITS.strokes)fail();
  const s = value.settings;
  if (!s || !Number.isInteger(s.key) || s.key < 0 || s.key > 11 || !Object.hasOwn(SCALES,s.scale) || !Number.isInteger(s.octave) || s.octave < 2 || s.octave > 5 || ![1,2,3].includes(s.range) || !Number.isFinite(s.bpm) || s.bpm < 40 || s.bpm > 200 || ![0,.2,.4].includes(s.swing) || ![8,16,32,96].includes(s.divisions) || ![1,2,4].includes(s.bars)) fail();
  const parts=Object.fromEntries(Object.keys(LAYERS).map(id=>[id,false]));
  if(value.version===2){
    if(!s.parts||Object.keys(s.parts).length!==Object.keys(LAYERS).length)fail();
    for(const id of Object.keys(parts)){if(typeof s.parts[id]!=='boolean')fail();parts[id]=s.parts[id];}
  }
  const strokes = value.strokes.map(stroke => {
    if (!stroke || !Object.hasOwn(PENS,stroke.pen) || !Object.hasOwn(SOUNDS,stroke.sound) || !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > LIMITS.points) fail();
    if(stroke.pitchStep!==undefined&&!Object.values(SNAP_MODES).some(mode=>mode.step===stroke.pitchStep))fail();
    if(stroke.object!==undefined&&(!Number.isInteger(stroke.object)||stroke.object<1||stroke.object>LIMITS.strokes))fail();
    return { ...(stroke.pitchStep===undefined?{}:{pitchStep:stroke.pitchStep}), ...(stroke.object===undefined?{}:{object:stroke.object}), pen: stroke.pen, sound: stroke.sound, points: stroke.points.map(p => { if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) fail(); return { x:p.x,y:p.y }; }) };
  });
  return { version:DRAWING_VERSION, settings:{key:s.key,scale:s.scale,octave:s.octave,range:s.range,bpm:s.bpm,swing:s.swing,divisions:s.divisions,bars:s.bars,parts}, pages:[{strokes}], selectedPage:0, song:false };
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
  const key=e=>`${INSTRUMENTS[e.sound].program}:${e.midi%1}`;
  const channels=new Map(),occupied=new Set([9]);
  for(const e of events)if(!Object.hasOwn(DRUMS,e.sound)&&e.midi%1===0){channels.set(key(e),INSTRUMENTS[e.sound].channel);occupied.add(INSTRUMENTS[e.sound].channel);}
  for(const e of events)if(!Object.hasOwn(DRUMS,e.sound)&&!channels.has(key(e))){
    const available=Array.from({length:16},(_,i)=>i).find(i=>!occupied.has(i));
    if(available===undefined)throw new Error('MIDI_CHANNEL_LIMIT');
    occupied.add(available);channels.set(key(e),available);
  }
  const channel=e=>Object.hasOwn(DRUMS,e.sound)?9:channels.get(key(e));
  const timeline = events.flatMap(e => [
    { tick: toTicks(e.time), bytes: [0x90|channel(e), Math.floor(e.midi), 90] },
    { tick: toTicks(e.time + e.duration), bytes: [0x80|channel(e), Math.floor(e.midi), 0] },
  ]).sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);
  const track = [0, 0xff, 0x51, 3, tempo >> 16 & 255, tempo >> 8 & 255, tempo & 255];
  const programs=new Map();
  for(const e of events)if(!Object.hasOwn(DRUMS,e.sound))programs.set(channel(e),INSTRUMENTS[e.sound].program);
  for(const [channel,program] of programs)track.push(0,0xc0|channel,program);
  for(const [id,ch] of channels){
    // RPN 0 sets a two-semitone bend range; quarter tones use +50 cents.
    const fraction=Number(id.split(':')[1]);if(!fraction)continue;
    for(const [controller,value] of [[101,0],[100,0],[6,2],[38,0],[101,127],[100,127]])track.push(0,0xb0|ch,controller,value);
    const bend=8192+Math.round(fraction/2*8192);track.push(0,0xe0|ch,bend&127,bend>>7);
  }
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

// Resume a held voice at its current pitch, retaining future path changes.
export function remainingEvent(event,position){
  const elapsed=position-event.time;
  if(elapsed<=0||elapsed>=event.duration)return null;
  const path=event.path;
  const current=path?[...path].reverse().find(p=>p.time<=elapsed):null;
  return {...event,time:position,duration:event.duration-elapsed,midi:current?.midi??event.midi,
    ...(path?{path:[{midi:current.midi,time:0,duration:event.duration-elapsed},...path.filter(p=>p.time>elapsed).map(p=>({...p,time:p.time-elapsed}))]}:{})};
}
