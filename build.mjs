import {generateSW} from 'workbox-build';
import {build} from 'esbuild';
import {readFile,writeFile,readdir,cp,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,parse} from 'node:path';
const hash=(bytes,algorithm='sha384')=>createHash(algorithm).update(bytes).digest('base64');
const source=process.argv[2]||'dist',output=process.argv[3]||'release';
const inputPath=resolve(source),outputPath=resolve(output);
if(outputPath===parse(outputPath).root||outputPath===process.cwd()||inputPath===outputPath||inputPath.startsWith(outputPath+'/')||outputPath.startsWith(inputPath+'/'))throw new Error('Build output must be a separate disposable directory');
await rm(output,{recursive:true,force:true});await mkdir(output);await cp(source,output,{recursive:true});
await build({entryPoints:['vendor/ibeetkidz/pwa-update.ts'],bundle:true,format:'esm',outfile:output+'/pwa-update.mjs',target:'es2022'});
let html=await readFile(output+'/index.html','utf8');
html=html.replace('<head>','<head><base href="/">').replace('src="app.mjs"','src="boot.mjs"');
const files=(await readdir(output)).filter(n=>n!=='index.html').sort();
const releaseId=hash(Buffer.concat([Buffer.from(html),await readFile('build.mjs'),await readFile('package-lock.json'),...await Promise.all(files.map(n=>readFile(`${output}/${n}`)))]),'sha256').replaceAll(/[+/=]/g,'');
// Adapted from iBeetKidz worker responder and sibling guard, without legacy migration.
const protocol=JSON.parse(await readFile('vendor/ibeetkidz/pwa-update-protocol.json','utf8'));
const helper=`const releaseId=new URL('release-${releaseId}',self.registration.scope).href;
self.addEventListener('message',event=>{
 if(event.data?.type===${JSON.stringify(protocol.releaseRequestType)}){const port=event.ports[0];port?.postMessage({type:${JSON.stringify(protocol.releaseResponseType)},releaseId});port?.close();return;}
 if(event.data?.type!==${JSON.stringify(protocol.messageType)})return;
 event.stopImmediatePropagation();event.waitUntil((async()=>{const clients=await self.clients.matchAll({includeUncontrolled:true,type:'window'});if(clients.filter(c=>c.url.startsWith(self.registration.scope)).length<=1)await self.skipWaiting();})());
});\n`;
await writeFile(output+'/index.html',html);
await writeFile(output+'/boot.mjs',`import {prepareBrowserPwaUpdate} from './pwa-update.mjs';
const id=new URL('release-${releaseId}',location.origin+'/').href;
const prepare=()=>prepareBrowserPwaUpdate('/',1800,id,[150,250,400].map(ms=>ms+Math.floor(Math.random()*40)));
// Explicit adult update runs on the idle page, after its save flush.
export async function loadUpdate(){if(await prepare()!=='reload-requested')location.reload();}
void (async()=>{
const result=await prepare();
if(result!=='reload-requested'){
 await import('./app.mjs');
 const out=document.getElementById('offline-state');
 if('serviceWorker' in navigator){
  navigator.serviceWorker.ready.then(async registration=>{
   const verify=async()=>{const channel=new MessageChannel();let timer;const reply=new Promise(resolve=>{timer=setTimeout(()=>resolve(false),2000);channel.port1.onmessage=e=>resolve(e.data?.releaseId===id);});navigator.serviceWorker.controller?.postMessage({type:${JSON.stringify(protocol.releaseRequestType)}},[channel.port2]);const ready=await reply;clearTimeout(timer);channel.port1.close();channel.port2.close();out.textContent=ready?'Ready offline':'Tap Finish setup to finish offline installation.';};
   await verify();navigator.serviceWorker.addEventListener('controllerchange',verify);
   const check=()=>{if(registration.waiting)out.textContent='Update ready. Tap Load update when you are ready.';};check();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',check));
  }).catch(()=>out.textContent='Offline setup failed. Try again online.');
 }else out.textContent='Offline installation is unavailable in this browser.';
}
})();
`);
const assets=(await readdir(output)).sort();
const result=await generateSW({globDirectory:output,globPatterns:['**/*.{html,css,mjs,png,json,webmanifest,txt}'],swDest:output+'/sw.js',inlineWorkboxRuntime:true,sourcemap:false,cleanupOutdatedCaches:true,clientsClaim:false,skipWaiting:false,navigateFallback:'/index.html',navigateFallbackAllowlist:[/^\/$/,/^\/draw$/, /^\/songs$/],manifestTransforms:[async manifest=>({manifest:await Promise.all(manifest.map(async entry=>({...entry,integrity:'sha384-'+hash(await readFile(`${output}/${entry.url}`))}))),warnings:[]})]});
let sw=await readFile(output+'/sw.js','utf8');await writeFile(output+'/sw.js',helper+sw);
// One generated list: used to check precache coverage, never hand-maintained.
if(assets.some(n=>!sw.includes(n)))throw new Error('Incomplete offline manifest');
if(result.warnings.length)throw new Error(result.warnings.join('\n'));
await writeFile(output+'/release-info.json',JSON.stringify({releaseId,assets}));
console.log(`Built complete offline release (${result.count} integrity-checked assets).`);
