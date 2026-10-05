import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notesFor, loopEvents, eraseAt, parseDrawing, midiFile, wavFile, LIMITS } from './dist/music.mjs';
const settings={key:0,scale:'pentatonic',octave:3,range:2,bpm:100,swing:0,divisions:16,bars:1};
const line={pen:'copper',sound:'sine',points:[{x:.123,y:.57},{x:.789,y:.57}]};
const pitches=notesFor(0,'pentatonic',3,2);
const loop=loopEvents([line],pitches,100,0);
assert.equal(loop.events.length,1); // One held note, not a cell sequence.
assert.ok(loop.events[0].duration>1);
assert.ok(Math.abs(loop.duration-2.4)<1e-9);
const curve={...line,points:[{x:.1,y:.8},{x:.3,y:.1},{x:.8,y:.7}]};
assert.ok(loopEvents([curve],pitches,100,.4).events.length>3);
assert.ok(Math.abs(loopEvents([curve],pitches,100,.4,96,4).duration-9.6)<1e-9);
// A short diagonal must visit every pitch band, even inside one old timing cell.
const diagonal={...line,points:[{x:.1,y:.9},{x:.12,y:.1}]};
const arpeggio=loopEvents([diagonal],pitches,100,0,96);
assert.deepEqual(arpeggio.events.map(e=>e.midi),pitches.slice(1,-1).map(n=>n.midi).reverse());
assert.ok(arpeggio.events.every((e,i)=>!i||e.time>arpeggio.events[i-1].time));
const dense={...diagonal,points:Array.from({length:101},(_,i)=>({x:.1+.02*i/100,y:.9-.8*i/100}))};
const denseLoop=loopEvents([dense],pitches,100,0,96);
assert.equal(denseLoop.events.length,arpeggio.events.length);
for(let i=0;i<arpeggio.events.length;i++){
  assert.equal(denseLoop.events[i].midi,arpeggio.events[i].midi);
  assert.ok(Math.abs(denseLoop.events[i].time-arpeggio.events[i].time)<1e-9);
  assert.ok(Math.abs(denseLoop.events[i].duration-arpeggio.events[i].duration)<1e-9);
}
assert.deepEqual(loopEvents([{...diagonal,points:[...diagonal.points].reverse()}],pitches,100,0,96).events,arpeggio.events);
const freeHeld=loopEvents([line],pitches,100,0,96);
assert.equal(freeHeld.events.length,1);
assert.ok(Math.abs(freeHeld.events[0].time-.123*2.4)<1e-9);
assert.ok(Math.abs(freeHeld.events[0].duration-(.789-.123)*2.4)<1e-9);
const chord=loopEvents([line,{...line,points:line.points.map(p=>({...p,y:.2}))}],pitches,100,0,96);
assert.equal(chord.events.length,2);
assert.equal(chord.events[0].time,chord.events[1].time);
assert.ok(arpeggio.events.every(e=>e.time>=0&&e.duration>0&&e.time+e.duration<=arpeggio.duration+1e-9));
const pieces=eraseAt([line],{x:.5,y:.57},.05,.05);
assert.equal(pieces.length,2); assert.ok(Math.abs(pieces[0].points.at(-1).x-.45)<1e-9); assert.ok(Math.abs(pieces[1].points[0].x-.55)<1e-9);
const parsed=parseDrawing(JSON.parse(JSON.stringify({version:1,settings,strokes:[curve]})));
assert.deepEqual(parsed.strokes,[curve]); assert.equal(parsed.strokes[0].points[0].x,.1);
assert.throws(()=>parseDrawing({...parsed,version:99}));
assert.throws(()=>parseDrawing({...parsed,settings:{...settings,key:'0'}}));
assert.throws(()=>parseDrawing({...parsed,strokes:Array(LIMITS.strokes+1).fill(line)}));
assert.throws(()=>parseDrawing({...parsed,strokes:[{...line,points:[{x:NaN,y:.5}]}]}));
const midi=midiFile(loop,100); assert.equal(new TextDecoder().decode(midi.slice(0,4)),'MThd'); assert.equal(new DataView(midi.buffer).getUint32(18),midi.length-22); assert.deepEqual([...midi.slice(-3)],[255,47,0]);
const wav=new DataView(wavFile(new Float32Array([0,1,-1]),44100)); assert.equal(wav.getUint32(40,true),6); assert.equal(wav.getInt16(46,true),32767); assert.equal(wav.getInt16(48,true),-32768);
assert.match(readFileSync(new URL('./dist/index.html',import.meta.url),'utf8'),/<canvas\b/);
assert.doesNotMatch(readFileSync(new URL('./dist/app.mjs',import.meta.url),'utf8'),/emptyGrid|starterGrid|\.cell|STEPS|ROWS/);
console.log('Canvas, continuous strokes, held notes, swing, erasing, drawing format, MIDI, and WAV passed.');
