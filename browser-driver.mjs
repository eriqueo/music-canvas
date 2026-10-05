import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function launchBrowser(existingProfile){
  const profile=existingProfile||await mkdtemp(`${tmpdir()}/music-browser-`);
  const chrome=spawn(process.env.CHROMIUM_BINARY||'/run/current-system/sw/bin/chromium',['--headless','--no-sandbox','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let port;for(let i=0;i<100;i++){try{port=(await readFile(`${profile}/DevToolsActivePort`,'utf8')).split('\n')[0];const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(tabs.length)break;}catch{}await sleep(100);}
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const connection=await connectPage(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  const {send,evaluate,wait,tap}=connection;
  await send('Page.enable');
  return {profile,send,evaluate,wait,tap,async openSibling(url){const {targetId}=await send('Target.createTarget',{url});const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const child=await connectPage(tabs.find(t=>t.id===targetId).webSocketDebuggerUrl);return {...child,async close(){child.disconnect();await send('Target.closeTarget',{targetId});}};},async close(remove=false){connection.disconnect();const exit=new Promise(r=>chrome.once('exit',r));chrome.kill();await exit;if(remove)await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}};
}

async function connectPage(url){
  const socket=new WebSocket(url);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async(expression,timeout=15000)=>{for(let elapsed=0;elapsed<timeout;elapsed+=100){try{if(await evaluate(expression))return;}catch{}await sleep(100);}throw new Error('Timed out: '+expression);};
  const tap=async selector=>{const p=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
  return {send,evaluate,wait,tap,disconnect:()=>socket.close()};
}
