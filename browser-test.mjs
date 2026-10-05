// Exercises the real app with Chromium touch input and analyses its exported PCM.
// This verifies browser wiring, not physical iPhone speaker output.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
    window.probe={notes:[],sessionAtStart:[]};
    Object.defineProperty(navigator,'audioSession',{value:{type:'auto'}});
    const Native=window.AudioContext;
    window.AudioContext=new Proxy(Native,{construct(T,args){
      probe.sessionAtStart.push(navigator.audioSession.type);
      const c=Reflect.construct(T,args),create=c.createOscillator.bind(c);
      c.createOscillator=()=>{const o=create(),start=o.start.bind(o);o.start=(...args)=>{probe.notes.push(o.frequency.value);return start(...args);};return o;};return c;
    }});
    const objectURL=URL.createObjectURL.bind(URL);
    URL.createObjectURL=blob=>{if(blob.type==='audio/wav')probe.wav=blob;return objectURL(blob);};
    HTMLAnchorElement.prototype.click=function(){};
  `});
  await send('Page.navigate',{url:target});
  let ready=false;
  for(let i=0;i<100;i++){ready=await evaluate(`!!document.querySelector('#pens')?.children.length`);if(ready)break;await sleep(100);}
  assert.ok(ready,'App must load');
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
  async function draw(points){
    await evaluate(`document.querySelector('#clear').click();document.querySelector('#canvas').scrollIntoView({block:'center'});probe.notes=[];`);
    const rect=await evaluate(`(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    for(let i=0;i<points.length;i++){
      const p=points[i];await send('Input.dispatchTouchEvent',{type:i?'touchMove':'touchStart',touchPoints:[{x:rect.x+rect.w*p.x,y:rect.y+rect.h*p.y,id:0}]});await sleep(30);
    }
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  assert.equal(await evaluate(`document.querySelector('#timing').value`),'96');
  for(const sound of ['sine','triangle','square']){
    await evaluate(`document.querySelector('#sound').value=${JSON.stringify(sound)};document.querySelector('#sound').dispatchEvent(new Event('change'));`);
    await draw([{x:.1,y:.9},{x:.12,y:.1}]);
    await evaluate('probe.notes=[]');await tap('#play');await sleep(750);await tap('#play');
    const notes=await evaluate('probe.notes.map(f=>Math.round(69+12*Math.log2(f/440)))');
    assert.deepEqual(notes,[50,52,55,57,60,62,64,67,69],`${sound}: touch diagonal must reach the live synthesizer as a rising arpeggio`);
  }
  const spectra={};
  for(const sound of ['sine','triangle','square']){
    await evaluate(`document.querySelector('#sound').value=${JSON.stringify(sound)};document.querySelector('#sound').dispatchEvent(new Event('change'));probe.wav=null;`);
    await draw([{x:.1,y:.8},{x:.9,y:.8}]);
    await tap('#wav');
    for(let i=0;i<100;i++){if(await evaluate('!!probe.wav'))break;await sleep(50);}
    spectra[sound]=await evaluate(`(async()=>{
      const view=new DataView(await probe.wav.arrayBuffer()),rate=view.getUint32(24,true),f=440*2**((52-69)/12),start=Math.floor(.4*rate),n=Math.floor(.5*rate);
      return [1,2,3].map(h=>{let re=0,im=0,total=0;for(let i=0;i<n;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(n-1)),v=view.getInt16(44+(start+i)*2,true)/32768*w,phase=2*Math.PI*f*h*i/rate;re+=v*Math.cos(phase);im+=v*Math.sin(phase);total+=w;}return 2*Math.hypot(re,im)/total;});
    })()`);
  }
  console.log('Rendered harmonic amplitudes',spectra);
  assert.ok(spectra.sine[1]/spectra.sine[0]>.15,'Soft keys need audible upper harmonics');
  assert.ok(spectra.triangle[2]/spectra.triangle[0]>.2,'Warm synth needs stronger upper harmonics');
  console.log('Mobile touch arpeggio, playback category, and three rendered sounds passed.');
}finally{
  socket?.close();chrome.kill();await sleep(300);await rm(profile,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));
}
