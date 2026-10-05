import { LIMITS, KEYS, SCALES, SOUNDS, INSTRUMENTS, PENS, FREE_TIMING, notesFor, pitchAt, loopEvents, eraseAt, parseDrawing, midiFile, wavFile } from './music.mjs';
const $ = id => document.getElementById(id);
const canvas = $('canvas'), paint = canvas.getContext('2d');
const settings = { key:0, scale:'pentatonic', octave:3, range:2, bpm:100, swing:0, divisions:FREE_TIMING, bars:1 };
let strokes = [], undo = [], redo = [], pen = 'copper', sound = 'sine', tool = 'pen', guides = false, light = false;
let active, pointerId, width = 1, height = 1, keyboard = { x:.1,y:.5 }, keyboardVisible = false;
let context, master, voices = new Set(), running = false, playIntent = 0, timer, frame, cycleStart, eventIndex = 0, clickIndex = 0, click = false;
let visualCycles = [], activeLoop;
const colors = Object.fromEntries(Object.entries(PENS).map(([name,p]) => [name,getComputedStyle(document.documentElement).getPropertyValue(p.token).trim()]));
const pitches = () => notesFor(settings.key,settings.scale,settings.octave,settings.range);
function compile() { return { ...loopEvents(strokes,pitches(),settings.bpm,settings.swing,settings.divisions,settings.bars), bpm:settings.bpm,bars:settings.bars }; }
let pendingLoop = compile();
function status(text) { $('status').textContent = text; }
function historyState() { $('undo').disabled = !undo.length; $('redo').disabled = !redo.length; }
// Immutable completed stroke arrays make history bounded without copying every point.
function remember() { undo.push(strokes); if (undo.length > LIMITS.history) undo.shift(); redo = []; historyState(); }
function changed() { pendingLoop = compile(); $('stroke-count').textContent = `${strokes.length} ${strokes.length === 1 ? 'stroke' : 'strokes'}`; $('empty').hidden = strokes.length > 0 || !!active; redraw(); historyState(); if (pendingLoop.limited) status('This drawing reached the playback note limit. Erase some lines to hear more.'); }
function redraw() {
  paint.clearRect(0,0,width,height);
  if (guides) {
    const notes = pitches(); paint.font = '12px monospace'; paint.fillStyle = light ? colors.copper : getComputedStyle(document.documentElement).getPropertyValue('--text-muted');
    paint.strokeStyle = colors.copper; paint.lineWidth = 1;
    notes.forEach((n,i) => { const y = i / (notes.length - 1) * height; paint.globalAlpha = .12; paint.beginPath(); paint.moveTo(0,y); paint.lineTo(width,y); paint.stroke(); paint.globalAlpha = .65; paint.fillText(`${n.label}${n.octave}`,8,Math.max(14,Math.min(height-5,y-5))); });
  }
  paint.globalAlpha = 1; paint.lineWidth = 4; paint.lineCap = 'round'; paint.lineJoin = 'round';
  for (const stroke of [...strokes,...(active ? [active] : [])]) {
    paint.strokeStyle = colors[stroke.pen]; paint.fillStyle = colors[stroke.pen]; paint.beginPath();
    stroke.points.forEach((p,i) => i === 0 ? paint.moveTo(p.x*width,p.y*height) : paint.lineTo(p.x*width,p.y*height));
    if (stroke.points.length === 1) { const p = stroke.points[0]; paint.arc(p.x*width,p.y*height,3,0,Math.PI*2); paint.fill(); } else paint.stroke();
  }
  if (keyboardVisible) { paint.strokeStyle = colors.copper; paint.lineWidth = 1; paint.beginPath(); paint.arc(keyboard.x*width,keyboard.y*height,9,0,Math.PI*2); paint.stroke(); }
}
new ResizeObserver(() => { const r = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1,3); width = r.width; height = r.height; canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio); paint.setTransform(ratio,0,0,ratio,0,0); redraw(); }).observe(canvas);
for (const [id,options] of [['key',KEYS.map((n,i)=>[i,n])],['scale',Object.entries(SCALES).map(([id,s])=>[id,s.label])],['sound',Object.entries(SOUNDS)]]) for (const [value,label] of options) { const option = document.createElement('option'); option.value = value; option.textContent = label; $(id).append(option); }
for (const [name,p] of Object.entries(PENS)) { const b = document.createElement('button'); b.setAttribute('aria-label',`${p.label} pen`); b.title = p.label; b.dataset.pen = name; b.style.setProperty('--pen-color',`var(${p.token})`); b.setAttribute('aria-pressed',String(name===pen)); b.onclick = () => { pen = name; selectTool('pen'); for (const item of $('pens').children) item.setAttribute('aria-pressed',String(item.dataset.pen===pen)); }; $('pens').append(b); }
function syncSettings() { for (const [id,name] of [['key','key'],['scale','scale'],['range','range'],['timing','divisions'],['swing','swing'],['bars','bars'],['tempo','bpm']]) $(id).value = settings[name]; $('octave').textContent = settings.octave; $('bpm').textContent = settings.bpm; $('octave-down').disabled = settings.octave <= 2; $('octave-up').disabled = settings.octave >= 5; }
function selectTool(value) { tool = value; $('pen').setAttribute('aria-pressed',String(tool==='pen')); $('eraser').setAttribute('aria-pressed',String(tool==='erase')); $('paper-wrap').classList.toggle('erasing',tool==='erase'); }
$('pen').onclick = () => selectTool('pen'); $('eraser').onclick = () => selectTool('erase');
async function audio() {
  // Media playback must remain audible when an iPhone's ringer is set to silent.
  if(navigator.audioSession)navigator.audioSession.type='playback';
  if (!context) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) throw new Error('AUDIO_UNAVAILABLE'); context = new Audio(); master = context.createGain(); master.gain.value = Number($('volume').value)/100; master.connect(context.destination); }
  await context.resume(); if (context.state !== 'running') throw new Error('AUDIO_SUSPENDED'); return context;
}
function synth(ctx,destination,midi,when,duration,type,level=.06,track=false) {
  // At the live voice limit, stop the oldest voice before creating another.
  if (track && voices.size >= LIMITS.voices) { const oldest = voices.values().next().value; oldest.stop(); voices.delete(oldest); }
  const oscillator = ctx.createOscillator(), envelope = ctx.createGain(), instrument=INSTRUMENTS[type]; oscillator.type = type; oscillator.frequency.value = 440 * 2 ** ((midi-69)/12);
  // Upper partials keep lower notes present on small speakers; one oscillator per voice.
  if(instrument.harmonics)oscillator.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(instrument.harmonics.length),new Float32Array(instrument.harmonics)));
  envelope.gain.setValueAtTime(0,when); envelope.gain.linearRampToValueAtTime(level,when+.008);
  envelope.gain.linearRampToValueAtTime(level*instrument.sustain,when+Math.max(.008,duration));
  envelope.gain.exponentialRampToValueAtTime(.001,when+duration+.08);
  oscillator.connect(envelope); envelope.connect(destination); oscillator.start(when); oscillator.stop(when+duration+.1);
  if (track) voices.add(oscillator);
  oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
}
let previewMidi = null, previewTime = -Infinity;
function preview(p) { const note = pitchAt(p.y,pitches()); $('pitch').textContent = `${note.label}${note.octave}`; if (!context || context.state !== 'running' || running) return; const now = context.currentTime; if (note.midi===previewMidi && now-previewTime<.14 || now-previewTime<.045) return; previewMidi=note.midi; previewTime=now; synth(context,master,note.midi,now,.09,sound,.07,true); }
function point(event) { const r = canvas.getBoundingClientRect(); return { x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)), y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)) }; }
function drawPoint(p) {
  if (tool==='erase') strokes = eraseAt(strokes,p,14/width,14/height);
  else if (active) { const last = active.points.at(-1); if (Math.hypot((p.x-last.x)*width,(p.y-last.y)*height)<1.5) return; if (active.points.length>=LIMITS.points) { status('Stroke limit reached. Lift your pen to start another line.'); return; } active.points.push(p); preview(p); }
  redraw();
}
function finish() { if (pointerId===undefined && !active) return; if (active) { strokes=[...strokes,active]; active=undefined; } pointerId=undefined; $('pitch').textContent=''; changed(); }
canvas.addEventListener('pointerdown',event => {
  if (pointerId!==undefined || event.button!==0) return;
  if (tool==='pen' && strokes.length>=LIMITS.strokes) { status('Drawing limit reached. Erase a line or clear the canvas to keep drawing.'); return; }
  event.preventDefault(); keyboardVisible=false; canvas.focus({preventScroll:true}); pointerId=event.pointerId; canvas.setPointerCapture(event.pointerId); remember(); const p=point(event);
  if (tool==='pen') active={pen,sound,points:[p]}; else strokes=eraseAt(strokes,p,14/width,14/height);
  $('empty').hidden=true; status(''); audio().then(()=>preview(p)).catch(()=>status('Drawing works, but sound could not start. Try Play and check your browser audio.')); redraw();
});
canvas.addEventListener('pointermove',event => { if (pointerId!==event.pointerId) return; event.preventDefault(); const samples=event.getCoalescedEvents?.() || []; for (const e of samples.length?samples:[event]) drawPoint(point(e)); });
canvas.addEventListener('pointerup',event => { if (event.pointerId===pointerId) { drawPoint(point(event)); finish(); } });
canvas.addEventListener('pointercancel',finish); canvas.addEventListener('lostpointercapture',finish);
$('undo').onclick=()=>{finish();if(!undo.length)return;redo.push(strokes);strokes=undo.pop();changed();status('Last drawing edit undone.');};
$('redo').onclick=()=>{finish();if(!redo.length)return;undo.push(strokes);strokes=redo.pop();changed();status('Drawing edit restored.');};
$('clear').onclick=()=>{finish();if(!strokes.length)return;remember();strokes=[];changed();status('Canvas cleared. Undo brings your drawing back.');};
$('guides').onclick=()=>{guides=!guides;$('guides').setAttribute('aria-pressed',String(guides));redraw();};
$('paper').onclick=()=>{light=!light;$('paper-wrap').classList.toggle('light',light);$('paper').setAttribute('aria-pressed',String(light));$('paper').textContent=light?'Dark paper':'Light paper';redraw();};
canvas.addEventListener('keydown',event=>{
  const moves={ArrowRight:[.01,0],ArrowLeft:[-.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]};
  if(moves[event.key]) { event.preventDefault(); keyboardVisible=true; const old={...keyboard},[dx,dy]=moves[event.key]; keyboard={x:Math.max(0,Math.min(1,old.x+dx)),y:Math.max(0,Math.min(1,old.y+dy))};
    if(event.shiftKey && strokes.length<LIMITS.strokes) { remember();strokes=[...strokes,{pen,sound,points:[old,{...keyboard}]}];changed();audio().then(()=>preview(keyboard)).catch(()=>status('Sound could not start.')); } else redraw();
  } else if(event.key==='Enter' && strokes.length<LIMITS.strokes) {event.preventDefault();remember();strokes=[...strokes,{pen,sound,points:[{...keyboard}]}];changed();audio().then(()=>preview(keyboard)).catch(()=>status('Sound could not start.'));}
});
canvas.addEventListener('blur',()=>{keyboardVisible=false;redraw();});
function stop() { playIntent++; running=false;clearInterval(timer);cancelAnimationFrame(frame);visualCycles=[];for(const voice of voices){try{voice.stop();}catch{}}voices.clear();$('play').textContent='▶ Play';$('play').setAttribute('aria-pressed','false');$('playhead').style.display='none'; }
function schedule() {
  if(!running)return;
  const now=context.currentTime,horizon=now+.1;
  if(cycleStart+activeLoop.duration<now-.1) {stop();status('Playback paused after a delay. Press Play to restart.');return;}
  let emitted=0;
  for(let cycles=0;cycles<2;cycles++) {
    while(eventIndex<activeLoop.events.length && cycleStart+activeLoop.events[eventIndex].time<horizon) {
      if(++emitted>256){stop();status('Too many notes at once. Erase a few lines, then press Play.');return;}
      const e=activeLoop.events[eventIndex++],when=cycleStart+e.time;
      if(when>=now-.02)synth(context,master,e.midi,Math.max(now,when),Math.max(.02,e.duration-.015),e.sound,.06,true);
    }
    while(clickIndex<activeLoop.bars*4 && cycleStart+clickIndex*60/activeLoop.bpm<horizon) {
      const when=cycleStart+clickIndex*60/activeLoop.bpm;
      if(click && when>=now-.02)synth(context,master,clickIndex%4===0?100:93,Math.max(now,when),.01,'sine',.04,true);
      clickIndex++;
    }
    if(cycleStart+activeLoop.duration>=horizon)break;
    cycleStart+=activeLoop.duration;activeLoop=pendingLoop;eventIndex=0;clickIndex=0;
    visualCycles.push({start:cycleStart,loop:activeLoop});if(visualCycles.length>2)visualCycles.shift();
  }
}
function animate() {if(!running)return;const now=context.currentTime;while(visualCycles.length>1 && visualCycles[1].start<=now)visualCycles.shift();const cycle=visualCycles[0];const fraction=Math.max(0,Math.min(1,(now-cycle.start)/cycle.loop.duration));$('playhead').style.left=`${fraction*100}%`;frame=requestAnimationFrame(animate);}
async function start() { const intent=++playIntent; try{await audio();if(intent!==playIntent || document.hidden)return;finish();running=true;activeLoop=pendingLoop;cycleStart=context.currentTime+.04;eventIndex=0;clickIndex=0;visualCycles=[{start:cycleStart,loop:activeLoop}];$('play').textContent='Ⅱ Pause';$('play').setAttribute('aria-pressed','true');$('playhead').style.display='block';status('');schedule();timer=setInterval(schedule,25);animate();}catch{status('Sound could not start. Check your browser audio settings and try Play again.');} }
$('play').onclick=()=>running?stop():start();
$('restart').onclick=()=>{const resume=running;stop();if(resume)start();};
$('click').onclick=()=>{click=!click;$('click').setAttribute('aria-pressed',String(click));};
$('volume').oninput=()=>{if(master)master.gain.setTargetAtTime(Number($('volume').value)/100,context.currentTime,.015);};
for(const [id,name] of [['key','key'],['scale','scale'],['range','range'],['timing','divisions'],['swing','swing'],['bars','bars'],['tempo','bpm']]) $(id).addEventListener(id==='tempo'?'input':'change',()=>{settings[name]=name==='scale'?$(id).value:Number($(id).value);syncSettings();changed();});
$('sound').onchange=()=>{sound=$('sound').value;};
$('octave-down').onclick=()=>{settings.octave=Math.max(2,settings.octave-1);syncSettings();changed();};
$('octave-up').onclick=()=>{settings.octave=Math.min(5,settings.octave+1);syncSettings();changed();};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
// Explicit downloads are non-retriable user effects, kept outside retry loops.
function download(bytes,type,extension) {const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`music-canvas.${extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('save').onclick=()=>{finish();download(JSON.stringify({version:1,settings,strokes}),'application/json','json');status('Drawing saved. Use Open to edit it again.');};
$('open').onclick=()=>$('file').click();
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>LIMITS.fileBytes)throw new Error('FILE_TOO_LARGE');const drawing=parseDrawing(JSON.parse(await file.text()));stop();finish();remember();strokes=drawing.strokes;Object.assign(settings,drawing.settings);syncSettings();changed();status('Drawing opened.');}catch{status('Could not open this drawing. Choose a Music Canvas JSON file under 4 MB.');}finally{$('file').value='';}};
$('midi').onclick=()=>{finish();download(midiFile(pendingLoop,settings.bpm),'audio/midi','mid');status('MIDI exported.');};
$('wav').onclick=async()=>{finish();const b=$('wav');b.disabled=true;b.textContent='Rendering…';status('Preparing audio…');try{const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Offline)throw new Error('OFFLINE_AUDIO_UNAVAILABLE');const loop=pendingLoop,rate=44100;const ctx=new Offline(1,Math.ceil((loop.duration+.2)*rate),rate),gain=ctx.createGain();gain.gain.value=Number($('volume').value)/100;gain.connect(ctx.destination);for(const e of loop.events)synth(ctx,gain,e.midi,e.time,Math.max(.02,e.duration-.015),e.sound);const rendered=await ctx.startRendering();download(wavFile(rendered.getChannelData(0),rate),'audio/wav','wav');status('WAV exported.');}catch{status('Audio export failed. Try MIDI or a browser with offline audio support.');}finally{b.disabled=false;b.textContent='WAV';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){finish();if(running){stop();status('Playback paused while you were away.');}}});
document.addEventListener('keydown',event=>{if(event.target.closest('input,select,dialog'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?$('redo').click():$('undo').click();return;}if(event.code==='Space'&&!event.repeat&&!event.target.closest('button')){event.preventDefault();running?stop():start();}if(event.key.toLowerCase()==='p')selectTool('pen');if(event.key.toLowerCase()==='e')selectTool('erase');});
syncSettings();changed();
