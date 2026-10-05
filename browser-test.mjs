// Exercises the real app with Chromium touch input and analyses its exported PCM.
// This verifies browser wiring, not physical iPhone speaker output.
import assert from 'node:assert/strict';
import {PENS} from './dist/music.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!/^[a-z]+\.(html|css|mjs)$/.test(name)){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL(`dist/${name}`,import.meta.url)));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const target=process.argv[2]||`http://127.0.0.1:${server.address().port}/`;
const profile=await mkdtemp(`${tmpdir()}/music-audio-`);
const chrome=spawn(process.env.CHROMIUM_BINARY||'/run/current-system/sw/bin/chromium',['--headless','--no-sandbox','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let socket;
try{
  let port;
  for(let i=0;i<100;i++){try{port=(await readFile(`${profile}/DevToolsActivePort`,'utf8')).split('\n')[0];break;}catch{await sleep(100);}}
  assert.ok(port,'Chromium must start');
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let id=0;const pending=new Map();
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.probe={notes:[],ramps:[],sessionAtStart:[],blobs:{}};
    Object.defineProperty(navigator,'audioSession',{value:{type:'auto'}});
    const Native=window.AudioContext;
    window.AudioContext=new Proxy(Native,{construct(T,args){
      probe.sessionAtStart.push(navigator.audioSession.type);
      const c=Reflect.construct(T,args),create=c.createOscillator.bind(c);
      c.createOscillator=()=>{const o=create(),start=o.start.bind(o),ramp=o.frequency.exponentialRampToValueAtTime.bind(o.frequency);o.frequency.exponentialRampToValueAtTime=(v,t)=>{probe.ramps.push(v);return ramp(v,t);};o.start=(...args)=>{probe.notes.push(o.frequency.value);return start(...args);};return o;};return c;
    }});
    const objectURL=URL.createObjectURL.bind(URL);
    URL.createObjectURL=blob=>{probe.blobs[blob.type]=blob;if(blob.type==='audio/wav')probe.wav=blob;return objectURL(blob);};
    HTMLAnchorElement.prototype.click=function(){};
  `});
  await send('Page.navigate',{url:target});
  let ready=false;
  for(let i=0;i<100;i++){ready=await evaluate(`!!document.querySelector('#pens')?.children.length`);if(ready)break;await sleep(100);}
  assert.ok(ready,'App must load');
  assert.ok(await evaluate(`!!document.querySelector('#shape')&&!!document.querySelector('#symmetry')`),'Shape and mirror controls must be wired into the app');
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('[data-pen]')).every(b=>{const r=b.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.width>=44;})`),'All nine instrument choices must be visible on mobile without horizontal scrolling');
  const tap=async selector=>{
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
    await sleep(200);
    const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
  };
  // Trusted control input unlocks Chromium audio before touch drawing.
  await tap('#play');await sleep(150);await tap('#play');
  assert.deepEqual(await evaluate('probe.sessionAtStart'),['playback'],'iPhone playback category must be set before audio creation');
  async function draw(points,clear=true,beforeEnd){
    await evaluate(`${clear?"document.querySelector('#clear').click();":''}document.querySelector('#canvas').scrollIntoView({block:'center'});probe.notes=[];`);
    const rect=await evaluate(`(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    for(let i=0;i<points.length;i++){
      const p=points[i];await send('Input.dispatchTouchEvent',{type:i?'touchMove':'touchStart',touchPoints:[{x:rect.x+rect.w*p.x,y:rect.y+rect.h*p.y,id:0}]});await sleep(30);
    }
    const cancelled=beforeEnd?await beforeEnd():false;
    if(!cancelled)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  assert.equal(await evaluate(`document.querySelector('#timing').value`),'96');
  for(const [pen,{sound}] of Object.entries(PENS)){
    await tap(`[data-pen="${pen}"]`);
    await draw([{x:.1,y:.9},{x:.12,y:.1}]);
    await evaluate('probe.notes=[];probe.ramps=[]');await tap('#play');await sleep(750);await tap('#play');
    const notes=await evaluate('probe.notes.map(f=>Math.round(69+12*Math.log2(f/440)))');
    if(['flute','strings','bass','chip'].includes(sound)){
      assert.equal(notes.length,1,`${sound} must hold one voice along the line`);
      assert.deepEqual(await evaluate('probe.ramps.map(f=>Math.round(69+12*Math.log2(f/440)))'),[52,55,57,60,62,64,67,69],`${sound} must follow all pitch changes`);
    }else assert.deepEqual(notes,[50,52,55,57,60,62,64,67,69],`${sound}: touch diagonal must reach every pitch`);
  }
  const fingerprints=[];
  for(const [pen,{sound}] of Object.entries(PENS)){
    await tap(`[data-pen="${pen}"]`);
    await evaluate('probe.wav=null');
    await draw([{x:.1,y:.8},{x:.9,y:.8}]);
    await tap('#wav');
    for(let i=0;i<100;i++){if(await evaluate('!!probe.wav'))break;await sleep(50);}
    const fingerprint=await evaluate(`(async()=>{const bytes=await probe.wav.arrayBuffer(),view=new DataView(bytes);let energy=0;for(let i=44;i<bytes.byteLength;i+=2)energy+=Math.abs(view.getInt16(i,true));return {energy,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',')};})()`);
    assert.ok(fingerprint.energy>100000,`${sound} must render audible samples`);fingerprints.push(fingerprint.hash);
  }
  assert.equal(new Set(fingerprints).size,9,'Each color must render a distinct instrument');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile controls must fit');
  console.log('Nine audible instruments, mobile drawing, sustained pitch glide, and playback category passed.');
  const save=async()=>{await tap('#save');return evaluate(`probe.blobs['application/json'].text().then(JSON.parse)`);};
  const open=async drawing=>{await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(${JSON.stringify(drawing)})],'song.json',{type:'application/json'}));const input=document.querySelector('#file');input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);for(let i=0;i<100;i++){if(await evaluate(`document.querySelector('#status').textContent==='Song opened.'`))return;await sleep(25);}throw new Error('Song import failed');};
  const first=await save();assert.equal(first.pages[0].strokes[0].sound,'chip');
  await tap('#page-add');await tap('[data-pen="teal"]');await draw([{x:.1,y:.2},{x:.9,y:.2}]);
  const two=await save();assert.equal(two.pages.length,2);assert.equal(two.pages[1].strokes[0].sound,'keys');assert.equal(two.song,true);
  await tap('#page-copy');const three=await save();assert.equal(three.pages.length,3);assert.deepEqual(three.pages[2],three.pages[1]);
  await tap('#page-earlier');await tap('#page-earlier');const reordered=await save();assert.equal(reordered.pages[0].strokes[0].sound,'keys');assert.equal(reordered.pages[1].strokes[0].sound,'chip');
  await tap('#page-delete');assert.equal((await save()).pages.length,2);await tap('#undo');assert.deepEqual((await save()).pages,reordered.pages);
  const song={...two,settings:{...two.settings,bpm:200},selectedPage:0};
  await open(song);assert.deepEqual(await save(),song);
  if(process.argv[3]){
    await evaluate('scrollTo(0,0)');const height=await evaluate('document.documentElement.scrollHeight');
    const capture=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height,scale:1}});await writeFile(process.argv[3],Buffer.from(capture.data,'base64'));
  }
  await tap('#play');
  let next=false;for(let i=0;i<70;i++){if(await evaluate(`document.querySelector('[data-page="1"]').getAttribute('aria-current')==='true'`)){next=true;break;}await sleep(50);}
  assert.ok(next,'Song must advance to the next picture after eight beats');await tap('#play');
  await evaluate('probe.wav=null');await tap('#wav');for(let i=0;i<100;i++){if(await evaluate('!!probe.wav'))break;await sleep(50);}
  const seconds=await evaluate(`probe.wav.arrayBuffer().then(b=>{const v=new DataView(b);return v.getUint32(40,true)/2/v.getUint32(24,true);})`);
  assert.ok(Math.abs(seconds-5.3)<1/44100,'Song WAV must contain both 2.4-second loops plus release tail');
  await tap('#midi');assert.ok(await evaluate(`probe.blobs['audio/midi'].size>30`));
  const legacy={version:1,settings:two.settings,strokes:[{...two.pages[0].strokes[0],sound:'triangle'}]};
  const beforeImport=await save();await open(legacy);assert.equal((await save()).pages[0].strokes[0].sound,'triangle');
  await tap('#undo');assert.deepEqual(await save(),beforeImport,'Undo import must restore both drawings and song settings');await tap('#redo');assert.equal((await save()).pages[0].strokes[0].sound,'triangle');
  await tap('#clear');
  for(const part of ['bass','drums','arpeggio']){
    await tap(`#part-${part}`);assert.equal(await evaluate(`document.querySelector('#part-${part}').getAttribute('aria-pressed')`),'true');
    await evaluate('probe.wav=null');await tap('#wav');for(let i=0;i<100;i++){if(await evaluate('!!probe.wav'))break;await sleep(50);}
    const energy=await evaluate(`probe.wav.arrayBuffer().then(b=>{const v=new DataView(b);let sum=0;for(let i=44;i<b.byteLength;i+=2)sum+=Math.abs(v.getInt16(i,true));return sum;})`);assert.ok(energy>100000,`${part} must sound without a drawing`);
    await tap(`#part-${part}`);
  }
  await tap('#part-bass');await tap('#part-drums');await tap('#part-arpeggio');
  assert.deepEqual((await save()).settings.parts,{bass:true,drums:true,arpeggio:true});
  await tap('#play');await sleep(700);assert.equal(await evaluate(`document.querySelector('#play').getAttribute('aria-pressed')`),'true');await tap('#play');
  console.log('Page add/copy/reorder/remove/undo, song save/open, legacy import, song playback/exports, and independent backing audio passed.');
  const emptySong={...song,pages:[{strokes:[]}],selectedPage:0,song:false,settings:{...song.settings,bpm:120,parts:{bass:false,drums:false,arpeggio:false}}};
  await open(emptySong);
  const control=async(id,value)=>evaluate(`(()=>{const c=document.querySelector(${JSON.stringify(id)});c.value=${JSON.stringify(value)};c.dispatchEvent(new Event('change'));})()`);
  await control('#shape','oval');await tap('[data-pen="blue"]');
  assert.equal(await evaluate(`document.querySelector('#shape').value`),'oval','Selecting an instrument must retain the shape tool');
  await draw([{x:.1,y:.2},{x:.4,y:.8}],true,async()=>{
    assert.equal(await evaluate(`document.querySelector('#stroke-count').textContent`),'0 strokes','Preview must stay outside the saved drawing');
    assert.ok(await evaluate(`(()=>{const c=document.querySelector('#canvas'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((v,i)=>i%4===3&&v>0);})()`),'Shape preview must be visible while dragging');
  });
  const ovalSong=await save();assert.equal(ovalSong.pages[0].strokes.length,2);assert.ok(ovalSong.pages[0].strokes.every(s=>s.sound==='flute'));
  await evaluate('probe.notes=[];probe.ramps=[]');await tap('#play');await sleep(1000);await tap('#play');
  assert.equal((await evaluate('probe.notes')).length,2,'Both oval contours must reach the live synthesizer');
  const contourPitches=await evaluate('probe.ramps.map(f=>Math.round(69+12*Math.log2(f/440)))');assert.ok(Math.min(...contourPitches)<60&&Math.max(...contourPitches)>60);
  await tap('#undo');assert.equal((await save()).pages[0].strokes.length,0,'One Undo must remove the whole shape');await tap('#redo');assert.deepEqual((await save()).pages,ovalSong.pages);
  await open(ovalSong);assert.deepEqual(await save(),ovalSong,'Shapes must round-trip through the existing song file');
  await send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:2,mobile:true});await sleep(100);
  assert.deepEqual((await save()).pages,ovalSong.pages,'Resize must preserve normalized shape coordinates');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await sleep(100);
  for(const shape of ['circle','rectangle','triangle','diamond','line']){
    await control('#shape',shape);await draw([{x:.2,y:.25},{x:.7,y:.75}]);const drawing=await save();
    assert.equal(drawing.pages[0].strokes.length,{circle:2,rectangle:4,triangle:3,diamond:4,line:1}[shape]);
    if(shape==='circle'){
      const points=drawing.pages[0].strokes.flatMap(s=>s.points),rect=await evaluate(`(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {w:r.width,h:r.height};})()`);
      const dx=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),dy=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));assert.ok(Math.abs(dx*rect.w-dy*rect.h)<1e-8);
    }
  }
  await control('#shape','pen');await control('#symmetry','both');await draw([{x:.12,y:.2},{x:.28,y:.35}]);
  const four=await save();assert.equal(four.pages[0].strokes.length,4);
  await tap('#undo');assert.equal((await save()).pages[0].strokes.length,0,'All four reflections must undo together');
  await tap('#redo');assert.deepEqual((await save()).pages,four.pages);
  const nearFull={...emptySong,pages:[{strokes:Array.from({length:63},()=>four.pages[0].strokes[0])}]};
  await open(nearFull);await control('#shape','rectangle');await draw([{x:.1,y:.1},{x:.3,y:.3}],false);
  assert.equal((await save()).pages[0].strokes.length,63,'Capacity must reject the whole symmetric shape');
  await open(emptySong);await control('#symmetry','off');await control('#shape','triangle');
  await draw([{x:.2,y:.25},{x:.7,y:.75}],true,async()=>{
    await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    return true;
  });
  assert.equal((await save()).pages[0].strokes.length,0,'Cancelled shape must not be committed');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'New mobile shape controls must fit');
  console.log('Touch shapes and preview, two-voice oval playback, round circles, shape Undo/Redo, mirrors, resize, save/open, capacity, and cancel passed.');
}finally{
  socket?.close();chrome.kill();await sleep(300);await rm(profile,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));
}
