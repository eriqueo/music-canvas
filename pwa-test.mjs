import assert from 'node:assert/strict';
import {prepareWaitingPwaUpdate} from './release/pwa-update.mjs';
let timeout,listener,removed=false;
const port={controlledAtLoad:true,register:async()=>({waiting:{postMessage(){}},active:null}),probeControllingRelease(){throw new Error('unused');},onControllerChange(fn){listener=fn;return ()=>{removed=true;};},onTimeout(ms,fn){timeout=fn;return ()=>{};},reload(){throw new Error('late reload must never happen');}};
const result=prepareWaitingPwaUpdate(port,100,'same');await new Promise(r=>setTimeout(r,0));timeout();assert.equal(await result,'boot-current');assert.equal(removed,true,'expired startup must remove its reload listener');
console.log('Expired PWA boot unsubscribes from late reloads.');
let requests=0,reloads=0,changed;
const timers=[];
const bounded={controlledAtLoad:true,register:async()=>({waiting:{postMessage(){requests++;}},active:null}),probeControllingRelease(){throw new Error('unused');},onControllerChange(fn){changed=fn;return ()=>{changed=undefined;};},onTimeout(ms,fn){const timer={ms,fn,canceled:false};timers.push(timer);return ()=>timer.canceled=true;},reload(){reloads++;}};
const boundedResult=prepareWaitingPwaUpdate(bounded,1000,'same',[10,20,30,40]);await new Promise(r=>setTimeout(r,0));
for(const delay of [10,20,30]){const timer=timers.find(t=>t.ms===delay&&!t.canceled);assert.ok(timer);timer.fn();}
assert.equal(requests,4,'initial request plus three bounded retries');assert.equal(timers.some(t=>t.ms===40),false);
changed();assert.equal(await boundedResult,'reload-requested');assert.equal(reloads,1);assert.ok(timers.find(t=>t.ms===1000).canceled);
console.log('PWA activation attempts stop at the bound and reload only once within startup.');

const staged={...bounded,onControllerChange(){return ()=>{};},onTimeout(){return ()=>{};}};const count=requests;assert.equal(await prepareWaitingPwaUpdate(staged,1000,'same',[],false),'boot-current');assert.equal(requests,count,'Cold-restart policy never requests activation beneath a live window');
