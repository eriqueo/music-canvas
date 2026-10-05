import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notesFor, loopEvents, eraseAt, parseDrawing, midiFile, wavFile, LIMITS, PENS, INSTRUMENTS, compileSong, audioTimeline } from './dist/music.mjs';
const settings={key:0,scale:'pentatonic',octave:3,range:2,bpm:100,swing:0,divisions:16,bars:1};
const line={pen:'copper',sound:'sine',points:[{x:.123,y:.57},{x:.789,y:.57}]};
const pitches=notesFor(0,'pentatonic',3,2);
const loop=loopEvents([line],pitches,100,0);
assert.equal(loop.events.length,1); // One held note, not a cell sequence.
assert.ok(loop.events[0].duration>1);
assert.ok(Math.abs(loop.duration-4.8)<1e-9);
const curve={...line,points:[{x:.1,y:.8},{x:.3,y:.1},{x:.8,y:.7}]};
assert.ok(loopEvents([curve],pitches,100,.4).events.length>3);
assert.ok(Math.abs(loopEvents([curve],pitches,100,.4,96,4).duration-19.2)<1e-9);
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
assert.ok(Math.abs(freeHeld.events[0].time-.123*4.8)<1e-9);
assert.ok(Math.abs(freeHeld.events[0].duration-(.789-.123)*4.8)<1e-9);
const chord=loopEvents([line,{...line,points:line.points.map(p=>({...p,y:.2}))}],pitches,100,0,96);
assert.equal(chord.events.length,2);
assert.equal(chord.events[0].time,chord.events[1].time);
assert.ok(arpeggio.events.every(e=>e.time>=0&&e.duration>0&&e.time+e.duration<=arpeggio.duration+1e-9));
const pieces=eraseAt([line],{x:.5,y:.57},.05,.05);
assert.equal(pieces.length,2); assert.ok(Math.abs(pieces[0].points.at(-1).x-.45)<1e-9); assert.ok(Math.abs(pieces[1].points[0].x-.55)<1e-9);
const parsed=parseDrawing(JSON.parse(JSON.stringify({version:1,settings,strokes:[curve]})));
assert.deepEqual(parsed.pages[0].strokes,[curve]); assert.equal(parsed.pages[0].strokes[0].points[0].x,.1);
assert.throws(()=>parseDrawing({...parsed,version:99}));
assert.throws(()=>parseDrawing({...parsed,settings:{...settings,key:'0'}}));
assert.throws(()=>parseDrawing({version:1,settings,strokes:Array(LIMITS.strokes+1).fill(line)}));
assert.throws(()=>parseDrawing({version:1,settings,strokes:[{...line,points:[{x:NaN,y:.5}]}]}));
const midi=midiFile(loop,100); assert.equal(new TextDecoder().decode(midi.slice(0,4)),'MThd'); assert.equal(new DataView(midi.buffer).getUint32(18),midi.length-22); assert.deepEqual([...midi.slice(-3)],[255,47,0]);
const wav=new DataView(wavFile(new Float32Array([0,1,-1]),44100)); assert.equal(wav.getUint32(40,true),6); assert.equal(wav.getInt16(46,true),32767); assert.equal(wav.getInt16(48,true),-32768);
assert.match(readFileSync(new URL('./dist/index.html',import.meta.url),'utf8'),/<canvas\b/);
assert.doesNotMatch(readFileSync(new URL('./dist/app.mjs',import.meta.url),'utf8'),/emptyGrid|starterGrid|\.cell|STEPS|ROWS/);
console.log('Canvas, continuous strokes, held notes, swing, erasing, drawing format, MIDI, and WAV passed.');
const {compileLoop}=await import('./dist/music.mjs');
assert.equal(typeof compileLoop,'function','Drawing and backing parts need one shared timeline');
assert.equal(Object.keys(PENS).length,9);
assert.equal(new Set(Object.values(PENS).map(p=>p.sound)).size,9);
for(const p of Object.values(PENS))assert.ok(INSTRUMENTS[p.sound]);
for(const part of ['bass','drums','arpeggio']){
  const backing=compileLoop([],{...settings,parts:{bass:false,drums:false,arpeggio:false,[part]:true}});
  assert.ok(backing.events.length>0);
  assert.ok(backing.events.every(e=>e.layer===part));
  assert.ok(backing.events.every(e=>e.time>=0&&e.time+e.duration<=backing.duration+1e-9));
}
assert.equal(compileLoop([],settings).events.length,0);
const all=compileLoop([curve],{...settings,parts:{bass:true,drums:true,arpeggio:true}});
assert.ok(all.events.some(e=>e.sound==='kick'));
assert.ok(all.events.some(e=>e.layer==='bass'));
assert.ok(all.events.some(e=>e.layer==='arpeggio'));
assert.ok(all.events.some(e=>!e.layer));
const newDrawing=parseDrawing({version:2,settings:{...settings,parts:{bass:true,drums:false,arpeggio:true}},strokes:[{...line,sound:PENS.copper.sound}]});
assert.deepEqual(newDrawing.settings.parts,{bass:true,drums:false,arpeggio:true});
assert.equal(parsed.pages[0].strokes[0].sound,'sine'); // Old files retain their explicit instrument.
assert.deepEqual(parsed.settings.parts,{bass:false,drums:false,arpeggio:false});
assert.throws(()=>parseDrawing({...newDrawing,settings:{...newDrawing.settings,parts:{bass:'true',drums:false,arpeggio:false}}}));
console.log('Nine pen instruments, independent backing parts, and legacy drawing compatibility passed.');
const songSettings={...settings,bpm:120,divisions:96,parts:{bass:false,drums:false,arpeggio:false}};
assert.equal(compileLoop([line],songSettings).duration,4,'120 BPM must match the reference four-second loop');
const eighths=compileLoop([line],{...songSettings,divisions:8});assert.equal(eighths.ticks.length,16);assert.equal(eighths.ticks[1].time,.25);assert.equal(eighths.duration,4);
const pages=[{strokes:[line]},{strokes:[{...line,points:line.points.map(p=>({...p,y:.2}))}]},{strokes:[curve]}];
const song=compileSong(pages,songSettings);
assert.equal(song.duration,12);
assert.deepEqual(song.cues.map(c=>c.start),[0,4,8]);
for(let i=0;i<pages.length;i++){
  const actual=song.events.filter(e=>e.page===i),expected=compileLoop(pages[i].strokes,songSettings).events;
  assert.equal(actual.length,expected.length);
  actual.forEach((e,j)=>{assert.equal(e.midi,expected[j].midi);assert.ok(Math.abs(e.time-i*4-expected[j].time)<1e-9);assert.equal(e.duration,expected[j].duration);});
}
const saved={version:3,settings:songSettings,pages,selectedPage:1,song:true};
assert.deepEqual(parseDrawing(JSON.parse(JSON.stringify(saved))),saved);
assert.throws(()=>parseDrawing({...saved,pages:[]}));
assert.throws(()=>parseDrawing({...saved,pages:Array(17).fill(pages[0])}));
assert.throws(()=>parseDrawing({...saved,selectedPage:3}));
assert.throws(()=>parseDrawing({...saved,pages:[{strokes:Array(33).fill(line)},{strokes:Array(33).fill(line)}]}));
assert.equal(eraseAt([line],{x:.5,y:.57},.05,.05,1).length,1);
const sustained=compileLoop([{...diagonal,sound:'flute'}],songSettings);
const voices=audioTimeline(sustained.events);
assert.equal(voices.length,1);assert.equal(voices[0].path.length,9);assert.deepEqual(voices[0].path.map(n=>n.midi),arpeggio.events.map(n=>n.midi));
assert.equal(audioTimeline(compileLoop([{...diagonal,sound:'keys'}],songSettings).events).length,9);
assert.equal(audioTimeline(compileSong([{strokes:[{...diagonal,sound:'flute'}]},{strokes:[{...diagonal,sound:'flute'}]}],songSettings).events).length,2);
// Read the emitted MIDI, including programs, percussion channel, and full song length.
const bytes=midiFile(compileSong(pages,{...songSettings,parts:{bass:true,drums:true,arpeggio:true}}),120);
let offset=22,tick=0;const messages=[];
while(offset<bytes.length){let delta=0,b;do{b=bytes[offset++];delta=(delta<<7)|(b&127);}while(b&128);tick+=delta;const status=bytes[offset++];if(status===255){const kind=bytes[offset++],length=bytes[offset++];offset+=length;if(kind===47)break;}else{const length=(status&240)===192?1:2;messages.push({status,data:[...bytes.slice(offset,offset+length)]});offset+=length;}}
assert.equal(tick,24*480);assert.ok(messages.some(m=>m.status===0x99&&m.data[0]===36));assert.ok(messages.some(m=>m.status===0xc7&&m.data[0]===32));
const palette=readFileSync(new URL('./dist/palette.css',import.meta.url),'utf8');
for(const pen of Object.values(PENS))assert.ok(palette.includes(`${pen.token}:`),`${pen.token} must be defined`);
const theme=readFileSync(new URL('./dist/theme.css',import.meta.url),'utf8'),style=readFileSync(new URL('./dist/style.css',import.meta.url),'utf8');
const defined=new Set([...`${palette}\n${theme}\n${style}`.matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]));defined.add('--pen-color'); // Set by the pen buttons at the composition root.
for(const match of style.matchAll(/var\((--[\w-]+)/g))assert.ok(defined.has(match[1]),`${match[1]} must be defined`);
console.log('Eight-beat tempo, ordered song pages, format migration, pitch glide, capacities, and MIDI channels passed.');
const {shapePaths,mirrorStrokes,SHAPES,SYMMETRIES}=await import('./dist/shapes.mjs');
const a={x:.2,y:.25},b={x:.7,y:.75},aspect={width:800,height:400};
for(const id of Object.keys(SHAPES)){
  const paths=shapePaths(id,[a,b],aspect);
  assert.equal(paths.length,SHAPES[id].strokes);
  assert.ok(paths.every(points=>points.length&&points.length<=LIMITS.points&&points.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)));
  const reverse=shapePaths(id,[b,a],aspect);
  if(id!=='pen')assert.deepEqual(reverse,paths,`${id} must ignore drag direction`);
}
const circle=shapePaths('circle',[a,b],aspect).flat();
const extent=axis=>Math.max(...circle.map(p=>p[axis]))-Math.min(...circle.map(p=>p[axis]));
assert.ok(Math.abs(extent('x')*800-extent('y')*400)<1e-8,'Circle must be round in pixel space');
const oval=shapePaths('oval',[a,b],aspect);
assert.equal(oval.length,2);assert.deepEqual(oval[0][0],oval[1][0]);assert.deepEqual(oval[0].at(-1),oval[1].at(-1));
const upper=compileLoop([{...line,sound:'flute',points:oval[0]}],songSettings),lower=compileLoop([{...line,sound:'flute',points:oval[1]}],songSettings);
assert.ok(Math.max(...upper.events.map(e=>e.midi))>Math.max(...lower.events.map(e=>e.midi)),'Both halves must have their own melody');
for(const mode of Object.keys(SYMMETRIES))assert.equal(mirrorStrokes([diagonal],mode).length,SYMMETRIES[mode].copies);
const mirrored=mirrorStrokes([diagonal],'both');
assert.deepEqual(mirrored[1].points,diagonal.points.map(p=>({x:1-p.x,y:p.y})));
assert.deepEqual(mirrored[2].points,diagonal.points.map(p=>({x:p.x,y:1-p.y})));
assert.equal(mirrorStrokes([{...line,points:[{x:.3,y:.5},{x:.7,y:.5}]}],'both').length,1,'Axis-aligned duplicate voices must collapse');
assert.deepEqual(parseDrawing({...saved,pages:[{strokes:mirrored}],selectedPage:0}).pages[0].strokes,mirrored);
console.log('Shape contours, reverse drags, round circles, independent oval voices, mirrors, and unchanged saved format passed.');
