// Adapted from iBeetKidz production-artifact offline and staged-update journeys.
import assert from 'node:assert/strict';
import {PENS} from './dist/music.mjs';
import {createServer} from 'node:http';
import {readFile,cp,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {launchBrowser,sleep} from './browser-driver.mjs';
const base=process.argv[2]||'/',previousDirectory=process.argv[3]||'release';
const scratch=await mkdtemp(`${tmpdir()}/music-offline-`);await cp('dist',scratch+'/source',{recursive:true});
await writeFile(scratch+'/source/app.mjs',(await readFile('dist/app.mjs','utf8'))+'\n// Alternate release fixture.\n');
execFileSync(process.execPath,['build.mjs',scratch+'/source',scratch+'/next',base],{stdio:'pipe'});
let directory=previousDirectory,offline=false,corrupt=false;
const server=createServer(async(req,res)=>{
 if(offline){res.destroy();return;}
 const name=new URL(req.url,'http://localhost').pathname.slice(base.length)||'index.html';
 if(name.includes('..')){res.writeHead(404).end();return;}
 let actual=['draw','songs'].includes(name.replace(/\/$/,''))?'index.html':name;
 let body;try{body=await readFile(`${directory}/${actual}`);}catch{actual='index.html';body=await readFile(`${directory}/${actual}`);}
 // Match the production publisher's dangerous 200 HTML fallback exactly.
 if(corrupt==='old'&&actual==='app.mjs')body=await readFile(previousDirectory+'/app.mjs');
 if(corrupt==='html'&&actual==='app.mjs'){actual='index.html';body=await readFile(`${directory}/index.html`);}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',actual.endsWith('.mjs')||actual.endsWith('.js')?'text/javascript':actual.endsWith('.css')?'text/css':actual.endsWith('.png')?'image/png':actual.endsWith('.webmanifest')?'application/manifest+json':'text/html');res.end(body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,appOrigin=origin+base.slice(0,-1);let browser,profile;
try{
 browser=await launchBrowser();profile=browser.profile;
 const navigate=async path=>{await browser.evaluate(`document.documentElement.dataset.ready=''`);await browser.send('Page.navigate',{url:appOrigin+path});await browser.wait(`document.documentElement.dataset.ready==='true'`);};
 await browser.send('Page.navigate',{url:appOrigin+'/draw'});await browser.wait(`document.documentElement.dataset.ready==='true'`);
 await browser.wait(`navigator.serviceWorker.getRegistration().then(r=>r?.active)`);
 await navigate('/draw');await browser.wait(`document.getElementById('offline-state').textContent==='Ready offline'`);
 await browser.evaluate(`(()=>{const s=document.querySelector('#scene');s.value='forest';s.dispatchEvent(new Event('change'));})()`);
 await browser.wait(`document.querySelector('#save-state').textContent.includes('Saved')`);
 const record=()=>browser.evaluate(`import('${base}library.mjs').then(async m=>{const s=m.createIndexedDbStore();return (await s.get(localStorage.getItem('music-canvas:last-song')));})`);
 const original=await record();assert.ok(original.drawing.pages[0].strokes.length);
 await browser.close();offline=true;browser=await launchBrowser(profile);
 await browser.send('Page.navigate',{url:appOrigin+'/draw'});await browser.wait(`document.documentElement.dataset.ready==='true'`);
 assert.equal(await browser.evaluate(`document.querySelector('#stroke-count').textContent`),`${original.drawing.pages[0].strokes.length} strokes`);
 await browser.wait(`document.querySelector('#offline-state').textContent==='Ready offline'`);
 await browser.evaluate(`window.offlineVoices=[];const Native=window.AudioContext;window.AudioContext=new Proxy(Native,{construct(T,args){const ctx=Reflect.construct(T,args),create=ctx.createOscillator.bind(ctx);ctx.createOscillator=()=>{offlineVoices.push(true);return create();};return ctx;}});`);
 for(const pen of Object.keys(PENS)){
  await browser.tap(`[data-pen="${pen}"]`);await browser.tap('#clear');const rect=await browser.evaluate(`(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x+r.width*.1,y:r.y+r.height*.5,w:r.width};})()`);await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+rect.w*.2,y:rect.y,button:'left',buttons:1});await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+rect.w*.2,y:rect.y,button:'left',clickCount:1});const voices=await browser.evaluate('offlineVoices.length');await browser.tap('#play');await sleep(650);assert.equal(await browser.evaluate(`document.querySelector('#play').getAttribute('aria-pressed')`),'true');assert.ok(await browser.evaluate('offlineVoices.length')>voices,'offline drawing must reach the audio engine');await browser.tap('#stop');
 }
 // Add a loop, then ensure playback page transitions never save revisions.
 await browser.tap('#page-add');await browser.wait(`document.querySelector('#save-state').textContent.includes('Saved')`);
 await browser.evaluate(`document.querySelector('#tempo').value=200;document.querySelector('#tempo').dispatchEvent(new Event('input'));document.querySelector('#tempo').dispatchEvent(new Event('change'));`);
 await browser.wait(`document.querySelector('#save-state').textContent.includes('Saved')`);const before=await record();
 await browser.tap('#play');await sleep(3000);await browser.tap('#stop');assert.equal((await record()).revision,before.revision);
 await browser.tap('#my-songs');await browser.wait(`location.pathname==='${base}songs'&&document.querySelector('[data-song]')`);await browser.tap('#duplicate-song');await browser.wait(`location.pathname==='${base}draw'`);
 await browser.tap('#my-songs');await browser.wait(`document.querySelectorAll('[data-song]').length===2`);await browser.tap('#close-songs');
 await browser.evaluate(`window.backupBlob=null;window.shareCalls=[];const objectUrl=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{backupBlob=b;return objectUrl(b);};Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async data=>{shareCalls.push({active:navigator.userActivation.isActive,name:data.files[0].name});},configurable:true});`);
 await browser.tap('#adult');await browser.tap('#library-backup');await browser.wait(`document.querySelector('#share-file-dialog').open`);assert.ok(await browser.evaluate(`document.querySelector('#share-message').textContent.includes('backup')`));const backup=await browser.evaluate('backupBlob.text().then(JSON.parse)');assert.equal(backup.songs.length,2);assert.equal(await browser.evaluate('shareCalls.length'),0);await browser.tap('#share-file');assert.equal(await browser.evaluate('shareCalls[0].active'),true);await browser.evaluate(`document.querySelector('#share-file-dialog').close()`);
 await browser.evaluate(`(()=>{const t=new DataTransfer();t.items.add(new File([JSON.stringify(${JSON.stringify(backup)})],'backup.json',{type:'application/json'}));const input=document.querySelector('#backup-file');input.files=t.files;input.dispatchEvent(new Event('change'));})()`);await browser.wait(`document.querySelector('#status').textContent==='2 songs restored. Existing songs kept.'`);
 // A full library must still let the user remove another song and retry.
 const kept=await record();await browser.evaluate(`import('${base}library.mjs').then(async m=>{const s=m.createIndexedDbStore(),drawing=(await s.get(${JSON.stringify(kept.id)})).drawing;for(let i=0;i<96;i++)await s.put({id:'capacity-'+i,title:'Capacity '+i,updated:1,drawing},0);})`);
 await browser.tap('#my-songs');await browser.tap('#new-song');await browser.wait(`document.querySelector('#save-state').textContent.includes('Storage is full')`);
 await browser.tap('button[aria-label="Remove Capacity 0"]');await browser.tap('#confirm-delete');await browser.wait(`document.querySelectorAll('[data-song]').length===99`);await browser.tap('#close-songs');await browser.tap('#adult');await browser.tap('#retry-save');await browser.wait(`document.querySelector('#save-state').textContent.includes('Saved')`);await browser.tap('[data-close="adult-dialog"]');assert.notEqual(await browser.evaluate(`localStorage.getItem('music-canvas:last-song')`),kept.id,'Retry remembers the newly committed song');
 await browser.evaluate(`import('${base}library.mjs').then(async m=>{const s=m.createIndexedDbStore();await s.remove(localStorage.getItem('music-canvas:last-song'));for(let i=1;i<96;i++)await s.remove('capacity-'+i);})`);await browser.tap('#my-songs');await browser.wait(`location.pathname==='${base}songs'&&document.querySelector('[data-song="${kept.id}"]')`);await browser.tap(`[data-song="${kept.id}"]`);await browser.wait(`location.pathname==='${base}draw'&&localStorage.getItem('music-canvas:last-song')===${JSON.stringify(kept.id)}`);assert.deepEqual((await record()).drawing,kept.drawing);
 console.log('Offline cold-process launch, saved editable forest, ten instrument controls, no playback writes, gallery duplicate, backup preparation and full-library recovery passed.');
 offline=false;directory=scratch+'/next';corrupt='old';
 await browser.evaluate(`window.installState='';navigator.serviceWorker.getRegistration().then(async r=>{r.addEventListener('updatefound',()=>{const w=r.installing;window.observedWorker=w;w.addEventListener('statechange',()=>{if(window.observedWorker===w)window.installState=w.state;});});await r.update();});`);
 await browser.wait(`window.installState==='redundant'`);assert.equal(await browser.evaluate(`navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)`),false);
 corrupt='html';await browser.evaluate(`window.installState='';navigator.serviceWorker.getRegistration().then(r=>r.update())`);await browser.wait(`window.installState==='redundant'`);
 offline=true;await navigate('/draw');assert.ok((await record()).drawing.pages[0].strokes.length);
 console.log('Old module bytes and HTML fallback integrity failures rejected the new worker; previous release still launches offline.');
 offline=false;corrupt=false;
 await browser.evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`);await browser.wait(`navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)`);
 const sibling=await browser.openSibling(appOrigin+'/draw');await sibling.wait(`document.documentElement.dataset.ready==='true'`);assert.equal(await browser.evaluate(`navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)`),true,'sibling blocks activation');await browser.evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.waiting.postMessage({type:'SKIP_WAITING'}))`);await sleep(300);assert.equal(await browser.evaluate(`navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)`),true);await sibling.close();await sleep(500);
 const saved=await record();await browser.evaluate(`document.documentElement.dataset.ready=''`);await browser.tap('#adult');await browser.tap('#reload-app');await browser.wait(`document.documentElement.dataset.ready==='true'`);await browser.wait(`navigator.serviceWorker.getRegistration().then(r=>!r.waiting)`);assert.deepEqual((await record()).drawing,saved.drawing);
 await browser.wait(`document.querySelector('#offline-state').textContent==='Ready offline'`);
 await browser.close();offline=true;browser=await launchBrowser(profile);await browser.send('Page.navigate',{url:appOrigin+'/songs'});await browser.wait(`document.documentElement.dataset.ready==='true'`);await browser.wait(`document.querySelector('#offline-state').textContent==='Ready offline'`);await browser.wait(`document.querySelectorAll('[data-song]').length===4`);assert.equal(await browser.evaluate(`document.querySelectorAll('[data-song] img').length`),4,'restored songs regenerate their picture thumbnails');
 const capture=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/music-song-gallery.png',Buffer.from(capture.data,'base64'));
 offline=false;directory=previousDirectory;await browser.evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`);await browser.wait(`navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)`);await browser.tap('#close-songs');await browser.tap('#adult');await browser.evaluate(`document.documentElement.dataset.ready=''`);await browser.tap('#reload-app');await browser.wait(`document.documentElement.dataset.ready==='true'`);await browser.wait(`navigator.serviceWorker.getRegistration().then(r=>!r.waiting)`);assert.deepEqual((await record()).drawing,saved.drawing);
 await browser.close();offline=true;browser=await launchBrowser(profile);await browser.send('Page.navigate',{url:appOrigin+'/draw'});await browser.wait(`document.documentElement.dataset.ready==='true'`);await browser.wait(`document.querySelector('#offline-state').textContent==='Ready offline'`);assert.deepEqual((await record()).drawing,saved.drawing);
 console.log('Adult update activates after other windows close and preserves songs; updated gallery and rollback cold-process launches work offline.');
}finally{if(browser)await browser.close(true);server.closeAllConnections();await new Promise(r=>server.close(r));await rm(scratch,{recursive:true,force:true});}
