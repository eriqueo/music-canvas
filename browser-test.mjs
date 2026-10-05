// Exercises the real app with Chromium touch input and analyses its exported PCM.
// This verifies browser wiring, not physical iPhone speaker output.
import assert from 'node:assert/strict';
import {PENS} from './dist/music.mjs';
import {launchBrowser,sleep} from './browser-driver.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
const server=createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!/^[a-z0-9-]+\.(html|css|mjs|png|webmanifest)$/.test(name)){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL(`release/${name}`,import.meta.url)));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const target=process.argv[2]||`http://127.0.0.1:${server.address().port}/`;
const browser=await launchBrowser();
try{
  const {send,evaluate}=browser;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.probe={notes:[],ramps:[],sessionAtStart:[],contexts:[],blobs:{}};
    Object.defineProperty(navigator,'audioSession',{value:{type:'auto'}});
    const Native=window.AudioContext;
    window.AudioContext=new Proxy(Native,{construct(T,args){
      probe.sessionAtStart.push(navigator.audioSession.type);
      const c=Reflect.construct(T,args);probe.contexts.push(c);const create=c.createOscillator.bind(c);
      c.createOscillator=()=>{const o=create(),start=o.start.bind(o),ramp=o.frequency.exponentialRampToValueAtTime.bind(o.frequency);o.frequency.exponentialRampToValueAtTime=(v,t)=>{probe.ramps.push(v);return ramp(v,t);};o.start=(...args)=>{probe.notes.push(o.frequency.value);return start(...args);};return o;};return c;
    }});
    const objectURL=URL.createObjectURL.bind(URL);
    URL.createObjectURL=blob=>{probe.blobs[blob.type]=blob;if(blob.type==='audio/wav')probe.wav=blob;return objectURL(blob);};
    HTMLAnchorElement.prototype.click=function(){};
  `});
  await send('Page.navigate',{url:target});
  let ready=false;
  for(let i=0;i<100;i++){ready=await evaluate(`document.documentElement.dataset.ready==='true'`);if(ready)break;await sleep(100);}
  assert.ok(ready,'App must load');
  assert.ok(await evaluate(`!!document.querySelector('#shape')&&!!document.querySelector('#symmetry')`),'Shape and mirror controls must be wired into the app');
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('[data-pen]')).every(b=>{const r=b.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.width>=44;})`),'All ten instrument choices must be visible on mobile without horizontal scrolling');
  for(const [width,height,mobile] of [[1832,858,false],[1280,720,false],[1024,768,false],[820,1180,false],[1180,820,false],[600,820,true],[390,844,true],[375,812,true]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:mobile?2:1,mobile});await sleep(120);
    const clipped=await evaluate(`Array.from(document.querySelectorAll('#root button,#root select')).filter(b=>{const r=b.getBoundingClientRect(),p=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.x<0||r.y<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5||(!b.disabled&&p&&!b.contains(p));}).map(b=>b.id||b.dataset.pen)`);
    assert.deepEqual(clipped,[],`Controls must be visible and reachable at ${width}×${height}`);
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('#root button,#root select')).every(b=>{const r=b.getBoundingClientRect();return r.width>=47.9&&r.height>=47.9;})`),'Controls must retain 48-pixel touch targets');
    assert.ok(await evaluate('document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth'),'Workspace must fit one screen');
    assert.ok(await evaluate(`(()=>{const fields=document.querySelector('.drawing-fields').getBoundingClientRect(),pens=document.querySelector('#pens').getBoundingClientRect(),name=document.querySelector('#instrument-name').getBoundingClientRect(),tools=document.querySelector('.tool-group').getBoundingClientRect();return pens.top-fields.bottom>=15&&tools.top-name.bottom>=15;})()`),'Art sections must have visible space between them');
    if(process.argv[3]&&[1832,390].includes(width)){const capture=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.argv[3].replace(/\.png$/,`-${width}.png`),Buffer.from(capture.data,'base64'));}
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  const tap=async selector=>{
    await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),d=b.closest("dialog");for(const other of document.querySelectorAll("dialog[open]"))if(other!==d)other.close();if(d&&!d.open)d.showModal();b.scrollIntoView({block:"center"});})()`);
    await sleep(200);
    const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
  };
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('[data-picker]')).every(b=>b.querySelector('svg')&&b.querySelector('.button-label'))`),'Art controls must have icons and short labels');
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('[data-pen]')).every(b=>b.querySelector('svg')&&b.querySelector('.button-label'))`),'Every sound pen must have an instrument picture');
  await tap('[data-picker="shape"]');assert.ok(await evaluate(`document.querySelector('#choice-dialog').open`));
  assert.equal(await evaluate(`document.querySelectorAll('#choices button').length`),7);
  await tap('[data-choice="triangle"]');assert.equal(await evaluate(`document.querySelector('#shape').value`),'triangle');
  assert.ok(await evaluate(`!document.querySelector('#choice-dialog').open`));await tap('#pen');
  await tap('[data-picker="scene"]');assert.equal(await evaluate(`document.querySelectorAll('#choices canvas').length`),7,'Drawing choices must show previews of the actual vectors');
  if(process.argv[3]){const capture=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.argv[3].replace(/\.png$/,'-pictures.png'),Buffer.from(capture.data,'base64'));}
  await tap('[data-choice="forest"]');assert.ok(parseInt(await evaluate(`document.querySelector('#stroke-count').textContent`))>0);await tap('#undo');
  await tap('[data-picker="snap"]');await tap('[data-choice="quarter"]');assert.equal(await evaluate(`document.querySelector('#snap').value`),'quarter');
  await tap('[data-picker="snap"]');await tap('[data-choice="free"]');
  await tap('#tune');assert.ok(await evaluate(`document.querySelector('#tune-dialog').open`));await tap('[data-close="tune-dialog"]');
  await tap('#export');assert.ok(await evaluate(`document.querySelector('#export-dialog').open`));await tap('[data-close="export-dialog"]');
  console.log('Picture tools, shape selection, scene previews, snap choices, labeled instrument icons, music settings and sharing dialogs passed.');
  // Trusted control input unlocks Chromium audio before touch drawing.
  await tap('#play');await sleep(150);await tap('#play');
  assert.deepEqual(await evaluate('probe.sessionAtStart'),['playback'],'iPhone playback category must be set before audio creation');
  await evaluate(`probe.contexts[0].resume=()=>Promise.reject(new Error('Interrupted context fixture'));`);
  await tap('#play');await sleep(150);assert.equal(await evaluate(`document.querySelector('#play').getAttribute('aria-pressed')`),'true');assert.equal(await evaluate('probe.contexts.length'),2,'Play replaces a failed audio context once');
  await evaluate('probe.contexts[1].suspend()');await sleep(100);assert.equal(await evaluate(`document.querySelector('#play').getAttribute('aria-pressed')`),'false','Audio interruption pauses playback');
  await tap('#play');await sleep(100);assert.equal(await evaluate(`document.querySelector('#play').getAttribute('aria-pressed')`),'true');await tap('#stop');
  async function draw(points,clear=true,beforeEnd){
    await evaluate(`for(const dialog of document.querySelectorAll("dialog[open]"))dialog.close();${clear?"document.querySelector('#clear').click();":''}document.querySelector('#canvas').scrollIntoView({block:'center'});probe.notes=[];`);
    const rect=await evaluate(`(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    for(let i=0;i<points.length;i++){
      const p=points[i];await send('Input.dispatchTouchEvent',{type:i?'touchMove':'touchStart',touchPoints:[{x:rect.x+rect.w*p.x,y:rect.y+rect.h*p.y,id:0}]});await sleep(30);
    }
    const cancelled=beforeEnd?await beforeEnd():false;
    if(!cancelled)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await tap('#stop');
  const hoverRect=await evaluate(`(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5};})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...hoverRect});
  assert.equal(await evaluate(`document.querySelector('#playhead').style.display`),'block','Hover must show its line before drawing');
  await draw([{x:.2,y:.3},{x:.4,y:.5}],false,async()=>{
    assert.equal(await evaluate(`document.querySelector('#playhead').style.display`),'none','Hover line must hide during drawing');
    assert.equal(await evaluate(`document.querySelectorAll('.crossing').length`),0,'Hover dots must hide during drawing');
    const pitch=await evaluate(`document.querySelector('#pitch').textContent`);assert.ok(pitch);
    await evaluate(`document.querySelector('#canvas').dispatchEvent(new PointerEvent('pointercancel',{pointerId:999,bubbles:true}));`);
    assert.equal(await evaluate(`document.querySelector('#pitch').textContent`),pitch,'Canceling an extra pointer must preserve the active drawing');
  });
  assert.equal(await evaluate(`document.querySelector('#timing').value`),'96');
  for(const [pen,{sound}] of Object.entries(PENS)){
    await tap(`[data-pen="${pen}"]`);
    await draw([{x:.1,y:.9},{x:.12,y:.1}]);
    await evaluate('probe.notes=[];probe.ramps=[]');await tap('#play');await sleep(750);await tap('#play');
    const notes=await evaluate('probe.notes.map(f=>Math.round(69+12*Math.log2(f/440)))');
    if(['flute','strings','bass','chip','organ'].includes(sound)){
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
  assert.equal(new Set(fingerprints).size,Object.keys(PENS).length,'Each color must render a distinct instrument');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile controls must fit');
  console.log('Ten audible instruments, mobile drawing, sustained pitch glide, and playback category passed.');
  const save=async()=>{await tap('#save');const drawing=await evaluate(`probe.blobs['application/json'].text().then(JSON.parse)`);await evaluate(`document.querySelector('#share-file-dialog').close()`);return drawing;};
  const open=async drawing=>{await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(${JSON.stringify(drawing)})],'song.json',{type:'application/json'}));const input=document.querySelector('#file');input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);for(let i=0;i<100;i++){if(await evaluate(`document.querySelector('#status').textContent==='Song opened.'`))return;await sleep(25);}throw new Error('Song import failed');};
  const first=await save();assert.equal(first.pages[0].strokes[0].sound,Object.values(PENS).at(-1).sound);
  await tap('#page-add');await tap('[data-pen="teal"]');await draw([{x:.1,y:.2},{x:.9,y:.2}]);
  const two=await save();assert.equal(two.pages.length,2);assert.equal(two.pages[1].strokes[0].sound,'keys');assert.equal(two.song,true);
  await tap('#page-copy');const three=await save();assert.equal(three.pages.length,3);assert.deepEqual(three.pages[2],three.pages[1]);
  await tap('#page-earlier');await tap('#page-earlier');const reordered=await save();assert.equal(reordered.pages[0].strokes[0].sound,'keys');assert.equal(reordered.pages[1].strokes[0].sound,first.pages[0].strokes[0].sound);
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
  await open(emptySong);await control('#shape','oval');await draw([{x:.15,y:.2},{x:.85,y:.8}]);
  const object=await save();assert.equal(new Set(object.pages[0].strokes.map(s=>s.object)).size,1);
  await open(object);await control('#erase-mode','object');await draw([{x:.5,y:.2}],false);
  assert.equal((await save()).pages[0].strokes.length,0,'Whole-object erase must remove both saved oval contours');
  await tap('#undo');assert.deepEqual((await save()).pages,object.pages);
  await control('#erase-mode','brush');await draw([{x:.5,y:.2}],false);
  assert.ok((await save()).pages[0].strokes.length>0,'Brush must leave the rest of the shape');
  await open({...object,pages:[{strokes:[...object.pages[0].strokes,{pen:'gold',sound:'marimba',object:2,points:[{x:.15,y:.2},{x:.85,y:.2}]}]}]});
  await control('#erase-mode','object');await draw([{x:.5,y:.2}],false);
  assert.deepEqual((await save()).pages,object.pages,'One tap must remove only the topmost overlapping object, not replay deletion on release');
  const beforeRandom=await save();await control('#scene','surprise');const generated=await save();assert.ok(generated.pages[0].strokes.length>=3);assert.ok(new Set(generated.pages[0].strokes.map(s=>s.pen)).size>=2);
  await tap('#undo');assert.deepEqual((await save()).pages,beforeRandom.pages,'Randomize must be one reversible edit');
  await open({...emptySong,pages:[{strokes:[{pen:'blue',sound:'flute',points:[{x:0,y:.8},{x:1,y:.2}]}]}]});
  await tap('#play');await sleep(650);await tap('#pause');const held=await evaluate('document.querySelector("#progress").style.width');await sleep(300);
  assert.equal(await evaluate('document.querySelector("#progress").style.width'),held,'Pause must freeze position');
  await evaluate('probe.notes=[]');await tap('#play');await sleep(150);assert.ok((await evaluate('probe.notes')).length>0,'Resume must restart the held voice');
  assert.ok(parseFloat(await evaluate('document.querySelector("#progress").style.width'))>parseFloat(held),'Resume must advance from the held position');
  await tap('#stop');assert.equal(await evaluate('document.querySelector("#progress").style.width'),'0%');
  await open(emptySong);await control('#shape','pen');
  for(const scene of ['mountains','forest','sailboat']){
    const before=await save();await control('#scene',scene);const picture=await save();
    assert.ok(picture.pages[0].strokes.length>=3,'Scene control must produce editable outlines');
    await tap('#undo');assert.deepEqual((await save()).pages,before.pages,'Scene replacement must undo as one edit');
    await tap('#redo');assert.deepEqual((await save()).pages,picture.pages);
  }
  await control('#scene','mountains');const mountains=await save();
  await control('#drawing-view','grid');assert.deepEqual((await save()).pages,mountains.pages,'Grid view must not rewrite saved vectors');
  await control('#drawing-view','drawing');assert.deepEqual((await save()).pages,mountains.pages);
  const rect=await evaluate(`(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+rect.w*.8,y:rect.y+rect.h*.5});
  assert.ok(await evaluate(`document.querySelectorAll('#crossings .crossing').length>=3`),'Hover dots must show the mountain and both cloud contours');
  await tap('#play');await sleep(700);
  assert.ok(await evaluate(`document.querySelectorAll('#crossings .crossing').length>0`),'Playback must update crossing dots');
  await tap('#pause');const markerPosition=await evaluate(`document.querySelector('#crossings').innerHTML`);await sleep(150);
  assert.equal(await evaluate(`document.querySelector('#crossings').innerHTML`),markerPosition,'Pause must freeze crossing dots');
  await tap('#stop');assert.equal(await evaluate(`document.querySelectorAll('#crossings .crossing').length`),0,'Stop clears playback dots');
  await open(emptySong);await control('#snap','whole');await control('#drawing-view','grid');await draw([{x:.303,y:.437}]);
  const gridDrawing=await save(),stroke=gridDrawing.pages[0].strokes[0];
  assert.equal(stroke.points.length,2,'A grid tap must draw one cell with its full time width');
  assert.ok(Math.abs(stroke.points[1].x-stroke.points[0].x-1/32)<1e-9);
  assert.ok(stroke.points.every(p=>Math.abs(p.y*10-Math.round(p.y*10))<1e-9),'Grid marks snap to scale notes');
  await control('#drawing-view','drawing');assert.deepEqual((await save()).pages,gridDrawing.pages);
  await tap('#undo');assert.equal((await save()).pages[0].strokes.length,0);
  await tap('#redo');await control('#drawing-view','grid');await control('#erase-mode','brush');await draw([{x:.303,y:.437}],false);
  assert.equal((await save()).pages[0].strokes.length,0,'Grid erase removes the tapped cell');
  await tap('#undo');assert.deepEqual((await save()).pages,gridDrawing.pages);
  await control('#drawing-view','drawing');
  await open(emptySong);await control('#shape','pen');await tap('[data-pen="blue"]');
  for(const view of ['drawing','grid'])for(const mode of ['free','whole','half','quarter']){
    await control('#drawing-view',view);await control('#snap',mode);await draw([{x:.103,y:.437},{x:.903,y:.437}]);
    const drawing=await save(),stroke=drawing.pages[0].strokes[0];
    assert.equal(stroke.pitchStep,{half:1,quarter:.5}[mode]);
    const y=stroke.points[0].y;
    assert.ok(Math.abs(y-{free:.437,whole:.4,half:.45,quarter:.425}[mode])<.002,`${mode} pitch snapping must work in ${view}`);
  }
  const quarterSong=await save();await open(quarterSong);assert.deepEqual((await save()).pages,quarterSong.pages,'Quarter-tone resolution must round-trip');
  await evaluate('probe.notes=[]');await tap('#play');await sleep(1000);await tap('#pause');
  const actualMidi=await evaluate('probe.notes.map(f=>69+12*Math.log2(f/440))');
  assert.ok(actualMidi.some(m=>Math.abs(m-61.5)<.001),'Live audio must play the quarter tone, not round it to a scale note');
  await tap('#stop');await control('#drawing-view','drawing');await control('#snap','free');
  assert.ok(await evaluate(`!document.querySelector('#random')`),'Surprise me must have one control in the Drawing menu');
  for(const scene of ['orbits','diamonds','waves','stairs']){await control('#scene',scene);assert.ok((await save()).pages[0].strokes.length>=3);}
  console.log('Pitch snapping in both views, Free geometry, saved quarter tones, microtonal live audio, combined Drawing menu and geometric presets passed.');
  console.log('Scene selection and Undo, hover and playback dots, frozen Pause markers, lossless view changes, snapped grid taps and grid erase passed.');
  console.log('Viewport bars, random drawings and Undo, saved object erase, brush erase, Pause/resume and Stop passed.');
  console.log('Touch shapes and preview, two-voice oval playback, round circles, shape Undo/Redo, mirrors, resize, save/open, capacity, and cancel passed.');
}finally{
  await browser.close(true);server.closeAllConnections();await new Promise(r=>server.close(r));
}
