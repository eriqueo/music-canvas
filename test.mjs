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
assert.equal(Object.keys(PENS).length,10);
assert.equal(new Set(Object.values(PENS).map(p=>p.sound)).size,10);
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
console.log('Ten pen instruments, independent backing parts, and legacy drawing compatibility passed.');
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
const {eraseObjectAt}=await import('./dist/shapes.mjs');
const {remainingEvent}=await import('./dist/music.mjs');
const grouped=oval.map(points=>({...line,object:1,points})),other={...line,object:2,points:[{x:.2,y:.25},{x:.7,y:.25}]};
assert.deepEqual(eraseObjectAt([...grouped,other],{x:.45,y:.25},.01,.01),grouped,'Nearest overlapping object alone must be removed');
assert.deepEqual(eraseObjectAt(grouped,{x:.45,y:.25},.01,.01),[],'Both contours must erase together');
assert.deepEqual(eraseObjectAt(grouped,{x:.01,y:.01},.01,.01),grouped);
assert.ok(eraseAt(grouped,{x:.45,y:.25},.02,.02).every(s=>s.object===1),'Brush pieces retain their object identity');
assert.throws(()=>parseDrawing({...saved,pages:[{strokes:[{...line,object:65}]}],selectedPage:0}));
const held={time:0,duration:3,midi:60,sound:'flute',path:[{time:0,midi:60,duration:1},{time:1,midi:64,duration:1},{time:2,midi:67,duration:1}]};
const resumed=remainingEvent(held,1.5);assert.equal(resumed.midi,64);assert.equal(resumed.duration,1.5);assert.deepEqual(resumed.path.map(n=>[n.time,n.midi]),[[0,64],[.5,67]]);
assert.equal(remainingEvent(held,3),null);assert.equal(remainingEvent(held,0),null);
console.log('Object erasing, grouped file compatibility, brush identity and resumed pitch paths passed.');
const {SCENES,sceneDrawing,crossingsAt,snapToGrid,gridCells}=await import('./dist/shapes.mjs');
for(const scene of Object.keys(SCENES)){
  const strokes=sceneDrawing(scene,aspect).map(s=>({...s,sound:PENS[s.pen].sound}));
  assert.ok(strokes.length<=LIMITS.strokes);
  assert.ok(strokes.every(s=>s.points.length<=LIMITS.points&&s.points.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)));
  assert.deepEqual(parseDrawing({...saved,pages:[{strokes}],selectedPage:0}).pages[0].strokes,strokes);
  assert.ok(compileLoop(strokes,songSettings).events.length>0);
}
assert.deepEqual(crossingsAt([{...line,points:[{x:.1,y:.2},{x:.5,y:.8},{x:.9,y:.2}]}],.5),[{x:.5,y:.8,pen:line.pen}],'Shared vertices produce one marker per contour');
assert.equal(crossingsAt(grouped,.45).length,2,'Oval has two markers');
assert.equal(crossingsAt(grouped,0).length,0);
assert.deepEqual(snapToGrid({x:1,y:1},32,11),{x:31.5/32,y:1});
assert.deepEqual(snapToGrid({x:0,y:0},32,11),{x:.5/32,y:0});
const cells=gridCells([{...line,points:[{x:0,y:0},{x:1,y:1}]}],32,11);
assert.ok(cells.every(p=>p.x>0&&p.x<1&&p.y>=0&&p.y<=1));
assert.ok(new Set(cells.map(p=>p.y)).size===11,'Diagonal crosses every pitch row');
assert.deepEqual(gridCells([],32,11),[]);
console.log('Editable scene files and audio, contour crossings, edge snapping, and grid projection passed.');
const {snapPitch,pitchPositions,pitchAt}=await import('./dist/music.mjs');
const raw={x:.303,y:.437};
assert.deepEqual(snapPitch(raw,pitches,'free'),raw);
assert.equal(pitchAt(snapPitch(raw,pitches,'whole').y,pitchPositions(pitches)).midi,62);
assert.equal(pitchAt(snapPitch(raw,pitches,'half').y,pitchPositions(pitches,1)).midi,61);
assert.equal(pitchAt(snapPitch(raw,pitches,'quarter').y,pitchPositions(pitches,.5)).midi,61.5);
for(const step of [1,.5]){
  const note=pitchPositions(pitches,step).find(n=>n.midi===61+(step===.5?.5:0));
  const tuned={...line,pitchStep:step,points:[{x:.1,y:note.y},{x:.9,y:note.y}]};
  for(const divisions of [96,16])assert.ok(compileLoop([tuned],{...songSettings,divisions}).events.every(e=>e.midi===note.midi));
  assert.deepEqual(parseDrawing({...saved,pages:[{strokes:[tuned]}],selectedPage:0}).pages[0].strokes,[tuned]);
}
assert.throws(()=>parseDrawing({...saved,pages:[{strokes:[{...line,pitchStep:.25}]}],selectedPage:0}));
const microMidi=midiFile({events:[{time:0,duration:1,midi:61.5,sound:'keys'},{time:0,duration:1,midi:61,sound:'keys'}],duration:1},120);
let cursor=22;const microMessages=[];
while(cursor<microMidi.length){let byte;do{byte=microMidi[cursor++];}while(byte&128);const code=microMidi[cursor++];if(code===255){cursor++;const length=microMidi[cursor++];cursor+=length;}else{const length=(code&240)===192?1:2;microMessages.push({code,data:[...microMidi.slice(cursor,cursor+length)]});cursor+=length;}}
const bend=microMessages.find(m=>(m.code&240)===224);assert.ok(bend);assert.equal(bend.data[0]+128*bend.data[1],10240,'Quarter tone MIDI bend must be +50 cents');
const noteOns=microMessages.filter(m=>(m.code&240)===144);assert.equal(new Set(noteOns.map(m=>m.code&15)).size,2,'Bent and natural notes must use different channels');assert.ok(noteOns.every(m=>m.data[0]===61));
const capacityMidi=Object.keys(PENS).flatMap(pen=>[0,.5].map(fraction=>({time:0,duration:1,midi:60+fraction,sound:PENS[pen].sound})));
assert.throws(()=>midiFile({events:capacityMidi,duration:1},120),/MIDI_CHANNEL_LIMIT/);
console.log('Scale, semitone and quarter-tone snapping, tuned playback and saved files, MIDI bends, separate channels and channel capacity passed.');

for(let row=0;row<pitches.length-1;row++)assert.equal(pitchAt((row+.5)/(pitches.length-1),pitchPositions(pitches)).midi,pitches[row+1].midi,'Legacy scale boundaries choose the lower note');
