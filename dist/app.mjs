import { LIMITS, KEYS, SCALES, INSTRUMENTS, PENS, LAYERS, DRUMS, DRAWING_VERSION, PULSES_PER_LOOP, FREE_TIMING, notesFor, pitchAt, compileLoop, compileSong, audioTimeline, eraseAt, parseDrawing, midiFile, wavFile } from './music.mjs';
const $ = id => document.getElementById(id);
const NOISE_SEED=0x31415926;
const canvas = $('canvas'), paint = canvas.getContext('2d');
const settings = { key:0, scale:'pentatonic', octave:3, range:2, bpm:120, swing:0, divisions:FREE_TIMING, bars:1, parts:Object.fromEntries(Object.keys(LAYERS).map(id=>[id,false])) };
let project={pages:[{strokes:[]}],index:0},songMode=false;
const page={get strokes(){return project.pages[project.index].strokes;},set strokes(value){project.pages[project.index]={strokes:value};}};
let undo = [], redo = [], pen = 'teal', sound = PENS[pen].sound, tool = 'pen', guides = false, light = false;
let active, pointerId, width = 1, height = 1, keyboard = { x:.1,y:.5 }, keyboardVisible = false;
let context, master, noise, voices = new Set(), running = false, playIntent = 0, timer, frame, cycleStart, eventIndex = 0, clickIndex = 0, click = false;
let visualCycles = [], activeLoop;
const colors = Object.fromEntries(Object.entries(PENS).map(([name,p]) => [name,getComputedStyle(document.documentElement).getPropertyValue(p.token).trim()]));
const pitches = () => notesFor(settings.key,settings.scale,settings.octave,settings.range);
function compile() { let loop;if(songMode)loop=compileSong(project.pages,settings);else{loop=compileLoop(page.strokes,settings);loop.cues=[{index:project.index,start:0,duration:loop.duration}];}return {...loop,audioEvents:audioTimeline(loop.events)}; }
let pendingLoop = compile();
function status(text) { $('status').textContent = text; }
function historyState() { $('undo').disabled = !undo.length; $('redo').disabled = !redo.length; }
// Immutable completed stroke arrays make history bounded without copying every point.
function snapshot(){return {pages:project.pages.map(p=>({...p})),index:project.index,settings:{...settings,parts:{...settings.parts}},song:songMode};}
function restore(state){project={pages:state.pages,index:state.index};songMode=state.song;Object.assign(settings,state.settings);syncSettings();}
function strokeCount(){return project.pages.reduce((n,p)=>n+p.strokes.length,0);}
function remember() { undo.push(snapshot()); if (undo.length > LIMITS.history) undo.shift(); redo = []; historyState(); }
function changed() { pendingLoop = compile(); $('stroke-count').textContent = `${page.strokes.length} ${page.strokes.length === 1 ? 'stroke' : 'strokes'}`; $('empty').hidden = page.strokes.length > 0 || !!active || Object.values(settings.parts).some(Boolean); redraw();renderPages();historyState(); if (pendingLoop.limited) status('This drawing reached the playback note limit. Erase some lines to hear more.'); }
function paintStrokes(ctx,strokes,w,h,thickness){
  ctx.globalAlpha=1;ctx.lineWidth=thickness;ctx.lineCap='round';ctx.lineJoin='round';
  for(const stroke of strokes){ctx.strokeStyle=colors[stroke.pen];ctx.fillStyle=colors[stroke.pen];ctx.beginPath();stroke.points.forEach((p,i)=>i?ctx.lineTo(p.x*w,p.y*h):ctx.moveTo(p.x*w,p.y*h));if(stroke.points.length===1){const p=stroke.points[0];ctx.arc(p.x*w,p.y*h,Math.max(2,thickness*.75),0,Math.PI*2);ctx.fill();}else ctx.stroke();}
}
function renderPages(){
  $('pages').replaceChildren();project.pages.forEach((p,index)=>{const b=document.createElement('button');b.className='page';b.dataset.page=index;b.setAttribute('aria-label',`Loop ${index+1}`);b.setAttribute('aria-current',String(index===project.index));const thumbnail=document.createElement('canvas');thumbnail.width=100;thumbnail.height=60;thumbnail.setAttribute('aria-hidden','true');paintStrokes(thumbnail.getContext('2d'),p.strokes,100,60,2);b.append(thumbnail,`Loop ${index+1}`);b.onclick=()=>{finish();stop();project.index=index;changed();};$('pages').append(b);});
  $('page-delete').disabled=project.pages.length===1;$('page-earlier').disabled=project.index===0;$('page-later').disabled=project.index===project.pages.length-1;
  $('page-add').disabled=project.pages.length>=LIMITS.pages;$('page-copy').disabled=project.pages.length>=LIMITS.pages||strokeCount()+page.strokes.length>LIMITS.strokes;
  $('song').setAttribute('aria-pressed',String(songMode));$('play-scope').textContent=songMode?`Song · ${project.pages.length} loops`:`Loop ${project.index+1} · ${settings.bars*PULSES_PER_LOOP} beats`;
}
function redraw() {
  paint.clearRect(0,0,width,height);
  if (guides) {
    const notes = pitches(); paint.font = '12px monospace'; paint.fillStyle = light ? colors.copper : getComputedStyle(document.documentElement).getPropertyValue('--text-muted');
    paint.strokeStyle = colors.copper; paint.lineWidth = 1;
    notes.forEach((n,i) => { const y = i / (notes.length - 1) * height; paint.globalAlpha = .12; paint.beginPath(); paint.moveTo(0,y); paint.lineTo(width,y); paint.stroke(); paint.globalAlpha = .65; paint.fillText(`${n.label}${n.octave}`,8,Math.max(14,Math.min(height-5,y-5))); });
  }
  paint.globalAlpha = 1; paint.lineWidth = 4; paint.lineCap = 'round'; paint.lineJoin = 'round';
  for(const e of pendingLoop.events)if(e.layer&&(!songMode||e.page===project.index)){
    const layer=LAYERS[e.layer];paint.fillStyle=getComputedStyle(document.documentElement).getPropertyValue(layer.token).trim();
    paint.beginPath();paint.arc(e.x*width,height-12-Object.keys(LAYERS).indexOf(e.layer)*10,3,0,Math.PI*2);paint.fill();
  }
  paintStrokes(paint,[...page.strokes,...(active ? [active] : [])],width,height,4);
  if (keyboardVisible) { paint.strokeStyle = colors.copper; paint.lineWidth = 1; paint.beginPath(); paint.arc(keyboard.x*width,keyboard.y*height,9,0,Math.PI*2); paint.stroke(); }
}
new ResizeObserver(() => { const r = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1,3); width = r.width; height = r.height; canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio); paint.setTransform(ratio,0,0,ratio,0,0); redraw(); }).observe(canvas);
for (const [id,options] of [['key',KEYS.map((n,i)=>[i,n])],['scale',Object.entries(SCALES).map(([id,s])=>[id,s.label])]]) for (const [value,label] of options) { const option = document.createElement('option'); option.value = value; option.textContent = label; $(id).append(option); }
for (const [name,p] of Object.entries(PENS)) { const b = document.createElement('button'); b.setAttribute('aria-label',`${p.label} pen`); b.title = p.label; b.dataset.pen = name; b.style.setProperty('--pen-color',`var(${p.token})`); b.setAttribute('aria-pressed',String(name===pen)); b.onclick = () => { finish();pen = name;sound=p.sound;$('instrument-name').textContent=p.label;previewMidi=null;selectTool('pen'); for (const item of $('pens').children) item.setAttribute('aria-pressed',String(item.dataset.pen===pen)); }; $('pens').append(b); }
for(const [id,layer] of Object.entries(LAYERS)){
  const b=document.createElement('button');b.id=`part-${id}`;b.className='part';b.setAttribute('aria-label',layer.label);b.setAttribute('aria-pressed','false');
  const dots=document.createElement('span');dots.textContent=layer.dots;dots.setAttribute('aria-hidden','true');b.append(dots,` ${layer.label}`);
  b.onclick=()=>{finish();remember();settings.parts[id]=!settings.parts[id];b.setAttribute('aria-pressed',String(settings.parts[id]));changed();status(`${layer.label} ${settings.parts[id]?'on':'off'}.`);};$('parts').append(b);
}
function syncSettings() { for (const [id,name] of [['key','key'],['scale','scale'],['range','range'],['timing','divisions'],['swing','swing'],['bars','bars'],['tempo','bpm']]) $(id).value = settings[name]; $('octave').textContent = settings.octave; $('bpm').textContent = settings.bpm; $('octave-down').disabled = settings.octave <= 2; $('octave-up').disabled = settings.octave >= 5;for(const id of Object.keys(LAYERS))$(`part-${id}`).setAttribute('aria-pressed',String(settings.parts[id])); }
function selectTool(value) { tool = value; $('pen').setAttribute('aria-pressed',String(tool==='pen')); $('eraser').setAttribute('aria-pressed',String(tool==='erase')); $('paper-wrap').classList.toggle('erasing',tool==='erase'); }
$('pen').onclick = () => selectTool('pen'); $('eraser').onclick = () => selectTool('erase');
async function audio() {
  // Media playback must remain audible when an iPhone's ringer is set to silent.
  if(navigator.audioSession)navigator.audioSession.type='playback';
  if (!context) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) throw new Error('AUDIO_UNAVAILABLE'); context = new Audio(); master = output(context,Number($('volume').value)/100);noise=makeNoise(context,NOISE_SEED); }
  await context.resume(); if (context.state !== 'running') throw new Error('AUDIO_SUSPENDED'); return context;
}
function output(ctx,volume){const gain=ctx.createGain(),compressor=ctx.createDynamicsCompressor();gain.gain.value=volume;compressor.threshold.value=-8;compressor.knee.value=6;compressor.ratio.value=12;compressor.attack.value=.003;compressor.release.value=.12;gain.connect(compressor);compressor.connect(ctx.destination);return gain;}
function makeNoise(ctx,seed){const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.3),ctx.sampleRate),data=b.getChannelData(0);let state=seed;for(let i=0;i<data.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;data[i]=(state>>>0)/2147483648-1;}return b;}
function reserveVoice(track){
  // At the live voice limit, stop the oldest voice before creating another.
  if (track && voices.size >= LIMITS.voices) { const oldest = voices.values().next().value; oldest.stop(); voices.delete(oldest); }
}
function synth(ctx,destination,midi,when,duration,type,level=.06,track=false,path) {
  reserveVoice(track);
  const oscillator = ctx.createOscillator(), envelope = ctx.createGain(), instrument=INSTRUMENTS[type]; oscillator.type = instrument.wave; oscillator.frequency.value = 440 * 2 ** ((midi-69)/12);
  if(path){oscillator.frequency.setValueAtTime(oscillator.frequency.value,when);for(let i=1;i<path.length;i++){const note=path[i],at=when+note.time;oscillator.frequency.setValueAtTime(440*2**((path[i-1].midi-69)/12),at);oscillator.frequency.exponentialRampToValueAtTime(440*2**((note.midi-69)/12),at+Math.min(.02,note.duration/6));}}
  // Upper partials keep lower notes present on small speakers; one oscillator per voice.
  if(instrument.harmonics)oscillator.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(instrument.harmonics.length),new Float32Array(instrument.harmonics)));
  const attack=Math.min(instrument.attack,duration*.5),release=instrument.release;
  envelope.gain.setValueAtTime(0,when); envelope.gain.linearRampToValueAtTime(level,when+attack);
  envelope.gain.linearRampToValueAtTime(level*instrument.sustain,when+duration);
  envelope.gain.exponentialRampToValueAtTime(.001,when+duration+release);
  oscillator.connect(envelope); envelope.connect(destination); oscillator.start(when); oscillator.stop(when+duration+release+.02);
  if (track) voices.add(oscillator);
  oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
}
function renderEvent(ctx,destination,e,when,track,buffer){
  if(!Object.hasOwn(DRUMS,e.sound)){synth(ctx,destination,e.midi,when,Math.max(.02,e.duration-.015),e.sound,e.level??.06,track,e.path);return;}
  reserveVoice(track);
  const envelope=ctx.createGain(),source=e.sound==='kick'?ctx.createOscillator():ctx.createBufferSource(),filter=ctx.createBiquadFilter();
  filter.type='highpass';filter.frequency.value=e.sound==='hat'?6000:900;
  if(e.sound==='kick'){source.frequency.setValueAtTime(180,when);source.frequency.exponentialRampToValueAtTime(45,when+.12);source.connect(envelope);}
  else{source.buffer=buffer;source.connect(filter);filter.connect(envelope);}
  envelope.gain.setValueAtTime(.0001,when);envelope.gain.linearRampToValueAtTime(e.level,when+.002);envelope.gain.exponentialRampToValueAtTime(.0001,when+e.duration);
  envelope.connect(destination);source.start(when);source.stop(when+e.duration);
  if(track)voices.add(source);
  source.onended=()=>{voices.delete(source);source.disconnect();filter.disconnect();envelope.disconnect();};
}
let previewMidi = null, previewTime = -Infinity;
function preview(p) { const note = pitchAt(p.y,pitches()); $('pitch').textContent = `${note.label}${note.octave}`; if (!context || context.state !== 'running' || running) return; const now = context.currentTime; if (note.midi===previewMidi && now-previewTime<.14 || now-previewTime<.045) return; previewMidi=note.midi; previewTime=now; synth(context,master,note.midi,now,.09,sound,.07,true); }
function point(event) { const r = canvas.getBoundingClientRect(); return { x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)), y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)) }; }
function drawPoint(p) {
  if (tool==='erase') page.strokes = eraseAt(page.strokes,p,14/width,14/height,LIMITS.strokes-strokeCount()+page.strokes.length);
  else if (active) { const last = active.points.at(-1); if (Math.hypot((p.x-last.x)*width,(p.y-last.y)*height)<1.5) return; if (active.points.length>=LIMITS.points) { status('Stroke limit reached. Lift your pen to start another line.'); return; } active.points.push(p); preview(p); }
  redraw();
}
function finish() { if (pointerId===undefined && !active) return; if (active) { page.strokes=[...page.strokes,active]; active=undefined; } pointerId=undefined; $('pitch').textContent=''; changed(); }
canvas.addEventListener('pointerdown',event => {
  if (pointerId!==undefined || event.button!==0) return;
  if (tool==='pen' && strokeCount()>=LIMITS.strokes) { status('Drawing limit reached. Erase a line or clear a loop to keep drawing.'); return; }
  event.preventDefault(); keyboardVisible=false; canvas.focus({preventScroll:true}); pointerId=event.pointerId; canvas.setPointerCapture(event.pointerId); remember(); const p=point(event);
  if (tool==='pen') active={pen,sound,points:[p]}; else page.strokes=eraseAt(page.strokes,p,14/width,14/height,LIMITS.strokes-strokeCount()+page.strokes.length);
  $('empty').hidden=true; status(''); audio().then(()=>preview(p)).catch(()=>status('Drawing works, but sound could not start. Try Play and check your browser audio.')); redraw();
});
canvas.addEventListener('pointermove',event => { if (pointerId!==event.pointerId) return; event.preventDefault(); const samples=event.getCoalescedEvents?.() || []; for (const e of samples.length?samples:[event]) drawPoint(point(e)); });
canvas.addEventListener('pointerup',event => { if (event.pointerId===pointerId) { drawPoint(point(event)); finish(); } });
canvas.addEventListener('pointercancel',finish); canvas.addEventListener('lostpointercapture',finish);
$('undo').onclick=()=>{finish();if(!undo.length)return;stop();redo.push(snapshot());restore(undo.pop());changed();status('Last edit undone.');};
$('redo').onclick=()=>{finish();if(!redo.length)return;stop();undo.push(snapshot());restore(redo.pop());changed();status('Edit restored.');};
$('clear').onclick=()=>{finish();if(!page.strokes.length)return;remember();page.strokes=[];changed();status('Loop cleared. Undo brings it back.');};
$('page-add').onclick=()=>{finish();if(project.pages.length>=LIMITS.pages)return;stop();remember();project.pages=[...project.pages,{strokes:[]}];project.index=project.pages.length-1;songMode=true;changed();};
$('page-copy').onclick=()=>{finish();if(project.pages.length>=LIMITS.pages||strokeCount()+page.strokes.length>LIMITS.strokes)return;stop();remember();const copy={strokes:[...page.strokes]};project.pages=[...project.pages.slice(0,project.index+1),copy,...project.pages.slice(project.index+1)];project.index++;songMode=true;changed();};
function movePage(delta){finish();const next=project.index+delta;if(next<0||next>=project.pages.length)return;stop();remember();const pages=[...project.pages];[pages[project.index],pages[next]]=[pages[next],pages[project.index]];project.pages=pages;project.index=next;changed();}
$('page-earlier').onclick=()=>movePage(-1);$('page-later').onclick=()=>movePage(1);
$('page-delete').onclick=()=>{finish();if(project.pages.length===1)return;stop();remember();project.pages=project.pages.filter((_,index)=>index!==project.index);project.index=Math.min(project.index,project.pages.length-1);changed();status('Loop removed. Undo brings it back.');};
$('song').onclick=()=>{finish();stop();remember();songMode=!songMode;changed();};
$('guides').onclick=()=>{guides=!guides;$('guides').setAttribute('aria-pressed',String(guides));redraw();};
$('paper').onclick=()=>{light=!light;$('paper-wrap').classList.toggle('light',light);$('paper').setAttribute('aria-pressed',String(light));$('paper').textContent=light?'Dark paper':'Light paper';redraw();};
canvas.addEventListener('keydown',event=>{
  const moves={ArrowRight:[.01,0],ArrowLeft:[-.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]};
  if(moves[event.key]) { event.preventDefault(); keyboardVisible=true; const old={...keyboard},[dx,dy]=moves[event.key]; keyboard={x:Math.max(0,Math.min(1,old.x+dx)),y:Math.max(0,Math.min(1,old.y+dy))};
    if(event.shiftKey && strokeCount()<LIMITS.strokes) { remember();page.strokes=[...page.strokes,{pen,sound,points:[old,{...keyboard}]}];changed();audio().then(()=>preview(keyboard)).catch(()=>status('Sound could not start.')); } else redraw();
  } else if(event.key==='Enter' && strokeCount()<LIMITS.strokes) {event.preventDefault();remember();page.strokes=[...page.strokes,{pen,sound,points:[{...keyboard}]}];changed();audio().then(()=>preview(keyboard)).catch(()=>status('Sound could not start.'));}
});
canvas.addEventListener('blur',()=>{keyboardVisible=false;redraw();});
function stop() { playIntent++; running=false;clearInterval(timer);cancelAnimationFrame(frame);visualCycles=[];for(const voice of voices){try{voice.stop();}catch{}}voices.clear();$('play').textContent='▶ Play';$('play').setAttribute('aria-pressed','false');$('playhead').style.display='none'; }
function schedule() {
  if(!running)return;
  const now=context.currentTime,horizon=now+.1;
  if(cycleStart+activeLoop.duration<now-.1) {stop();status('Playback paused after a delay. Press Play to restart.');return;}
  let emitted=0;
  for(let cycles=0;cycles<2;cycles++) {
    while(eventIndex<activeLoop.audioEvents.length && cycleStart+activeLoop.audioEvents[eventIndex].time<horizon) {
      if(++emitted>256){stop();status('Too many notes at once. Erase a few lines, then press Play.');return;}
      const e=activeLoop.audioEvents[eventIndex++],when=cycleStart+e.time;
      if(when>=now-.02)renderEvent(context,master,e,Math.max(now,when),true,noise);
    }
    while(clickIndex<activeLoop.bars*PULSES_PER_LOOP && cycleStart+clickIndex*60/activeLoop.bpm<horizon) {
      const when=cycleStart+clickIndex*60/activeLoop.bpm;
      if(click && when>=now-.02)synth(context,master,clickIndex%4===0?100:93,Math.max(now,when),.01,'sine',.04,true);
      clickIndex++;
    }
    if(cycleStart+activeLoop.duration>=horizon)break;
    cycleStart+=activeLoop.duration;activeLoop=pendingLoop;eventIndex=0;clickIndex=0;
    visualCycles.push({start:cycleStart,loop:activeLoop});if(visualCycles.length>2)visualCycles.shift();
  }
}
function animate() {if(!running)return;const now=context.currentTime;while(visualCycles.length>1 && visualCycles[1].start<=now)visualCycles.shift();const cycle=visualCycles[0],position=Math.max(0,now-cycle.start);const cue=[...cycle.loop.cues].reverse().find(c=>c.start<=position)||cycle.loop.cues[0];if(project.index!==cue.index){finish();project.index=cue.index;changed();}const fraction=Math.max(0,Math.min(1,(position-cue.start)/cue.duration));$('playhead').style.left=`${fraction*100}%`;frame=requestAnimationFrame(animate);}
async function start() { const intent=++playIntent; try{await audio();if(intent!==playIntent || document.hidden)return;finish();running=true;activeLoop=pendingLoop;cycleStart=context.currentTime+.04;eventIndex=0;clickIndex=0;visualCycles=[{start:cycleStart,loop:activeLoop}];$('play').textContent='Ⅱ Pause';$('play').setAttribute('aria-pressed','true');$('playhead').style.display='block';status('');schedule();timer=setInterval(schedule,25);animate();}catch{status('Sound could not start. Check your browser audio settings and try Play again.');} }
$('play').onclick=()=>running?stop():start();
$('restart').onclick=()=>{const resume=running;stop();if(resume)start();};
$('click').onclick=()=>{click=!click;$('click').setAttribute('aria-pressed',String(click));};
$('volume').oninput=()=>{if(master)master.gain.setTargetAtTime(Number($('volume').value)/100,context.currentTime,.015);};
for(const [id,name] of [['key','key'],['scale','scale'],['range','range'],['timing','divisions'],['swing','swing'],['bars','bars'],['tempo','bpm']]) $(id).addEventListener(id==='tempo'?'input':'change',()=>{settings[name]=name==='scale'?$(id).value:Number($(id).value);syncSettings();changed();});
$('octave-down').onclick=()=>{settings.octave=Math.max(2,settings.octave-1);syncSettings();changed();};
$('octave-up').onclick=()=>{settings.octave=Math.min(5,settings.octave+1);syncSettings();changed();};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
// Explicit downloads are non-retriable user effects, kept outside retry loops.
function download(bytes,type,extension) {const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`music-canvas.${extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('save').onclick=()=>{finish();download(JSON.stringify({version:DRAWING_VERSION,settings,pages:project.pages,selectedPage:project.index,song:songMode}),'application/json','json');status('Song saved. Use Open to edit it again.');};
$('open').onclick=()=>$('file').click();
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>LIMITS.fileBytes)throw new Error('FILE_TOO_LARGE');const drawing=parseDrawing(JSON.parse(await file.text()));stop();finish();remember();project={pages:drawing.pages,index:drawing.selectedPage};songMode=drawing.song;Object.assign(settings,drawing.settings);syncSettings();changed();status('Song opened.');}catch{status('Could not open this song. Choose a Music Canvas JSON file under 4 MB.');}finally{$('file').value='';}};
$('midi').onclick=()=>{finish();download(midiFile(pendingLoop,settings.bpm),'audio/midi','mid');status('MIDI exported.');};
$('wav').onclick=async()=>{finish();const b=$('wav');b.disabled=true;b.textContent='Rendering…';status('Preparing audio…');try{const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Offline)throw new Error('OFFLINE_AUDIO_UNAVAILABLE');const loop=pendingLoop,rate=44100;const tail=Math.max(...Object.values(INSTRUMENTS).map(i=>i.release));const ctx=new Offline(1,Math.ceil((loop.duration+tail+.05)*rate),rate),gain=output(ctx,Number($('volume').value)/100),buffer=makeNoise(ctx,NOISE_SEED);for(const e of loop.audioEvents)renderEvent(ctx,gain,e,e.time,false,buffer);const rendered=await ctx.startRendering();download(wavFile(rendered.getChannelData(0),rate),'audio/wav','wav');status('WAV exported.');}catch{status('Audio export failed. Try MIDI or a browser with offline audio support.');}finally{b.disabled=false;b.textContent='WAV';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){finish();if(running){stop();status('Playback paused while you were away.');}}});
document.addEventListener('keydown',event=>{if(event.target.closest('input,select,dialog'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?$('redo').click():$('undo').click();return;}if(event.code==='Space'&&!event.repeat&&!event.target.closest('button')){event.preventDefault();running?stop():start();}if(event.key.toLowerCase()==='p')selectTool('pen');if(event.key.toLowerCase()==='e')selectTool('erase');});
syncSettings();changed();
