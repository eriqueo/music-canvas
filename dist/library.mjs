// Adapted from Kid Pix saved-store.ts/slideshow/store.ts; provenance in REUSE.md.
import {parseDrawing,LIMITS} from './music.mjs';
export const LIBRARY_LIMITS=Object.freeze({songs:100,bytes:100*1024*1024,revisions:3});
const fail=(code)=>Object.assign(new Error(code),{code});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function entry(value){
  if(!value||typeof value.id!=='string'||!value.id||typeof value.title!=='string'||!Number.isFinite(value.updated))throw fail('invalid');
  let drawing;try{drawing=parseDrawing(value.drawing);}catch{throw fail('invalid');}
  if(bytes(drawing)>LIMITS.fileBytes)throw fail('full');
  return {id:value.id,title:value.title.trim().slice(0,80)||'My song',updated:value.updated,drawing,thumbnail:typeof value.thumbnail==='string'&&value.thumbnail.length<65536?value.thumbnail:''};
}
export function parseBackup(value){
  if(value?.version!==1||value.kind!=='music-canvas-library'||!Array.isArray(value.songs)||value.songs.length>LIBRARY_LIMITS.songs||bytes(value)>LIBRARY_LIMITS.bytes)throw fail('invalid');
  return value.songs.map(entry);
}
function revised(item,old,expected,limits){
  if((old?.revision??0)!==expected)throw fail('conflict');
  const previous=old?[{revision:old.revision,drawing:old.drawing},...(old.previous||[])].slice(0,limits.revisions):[];
  return {...item,revision:expected+1,previous};
}
const metadata=item=>({id:item.id,title:item.title,updated:item.updated,revision:item.revision,thumbnail:item.thumbnail,bytes:bytes(item)});
function capacity(metas,next,limits){
  const all=metas.filter(m=>m.id!==next.id);if(all.length+1>limits.songs||all.reduce((n,m)=>n+m.bytes,0)+bytes(next)>limits.bytes)throw fail('full');
}
export function createMemoryStore({limits=LIBRARY_LIMITS}={}){
  const items=new Map();const store={
    async init(){},async list(){return [...items.values()].map(metadata).sort((a,b)=>b.updated-a.updated);},async get(id){return structuredClone(items.get(id));},
    async put(value,expected){const next=revised(entry(value),items.get(value.id),expected,limits);capacity([...items.values()].map(metadata),next,limits);items.set(next.id,next);return structuredClone(next);},
    async remove(id){items.delete(id);},close(){},
    async recover(id,revision,expected){const old=await store.get(id),previous=old?.previous.find(p=>p.revision===revision);if(!previous)throw fail('invalid');return store.put({...old,drawing:previous.drawing},expected);},
    async backup(){return {kind:'music-canvas-library',version:1,songs:[...items.values()].map(({id,title,updated,drawing})=>structuredClone({id,title,updated,drawing}))};},
    async importBackup(value,makeId,projectThumbnail=()=> ''){const next=parseBackup(value).map(item=>revised({...item,id:makeId(),thumbnail:projectThumbnail(item.drawing)},undefined,0,limits));if(new Set(next.map(s=>s.id)).size!==next.length)throw fail('invalid');if(next.some(s=>items.has(s.id)))throw fail('conflict');if(items.size+next.length>limits.songs||[...items.values(),...next].reduce((n,s)=>n+bytes(s),0)>limits.bytes)throw fail('full');for(const s of next)items.set(s.id,s);return next.length;},
  };return store;
}
export function createIndexedDbStore({factory=globalThis.indexedDB,name='music-canvas-library',limits=LIBRARY_LIMITS}={}){
  let dbPromise;
  function openDb(){
    if(!factory)return Promise.reject(fail('blocked'));
    if(dbPromise)return dbPromise;
    const pending=new Promise((resolve,reject)=>{
      let canceled=false;const req=factory.open(name,1);
      req.onupgradeneeded=()=>{for(const store of ['metadata','songs'])if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store,{keyPath:'id'});};
      req.onerror=()=>reject(fail('blocked'));req.onblocked=()=>{canceled=true;reject(fail('blocked'));};
      req.onsuccess=()=>{const db=req.result;if(canceled){db.close();return;}db.onversionchange=()=>{db.close();dbPromise=undefined;};db.onclose=()=>{dbPromise=undefined;};resolve(db);};
    });dbPromise=pending;pending.catch(()=>{if(dbPromise===pending)dbPromise=undefined;});return pending;
  }
  async function transaction(mode,body){
    const db=await openDb();return new Promise((resolve,reject)=>{
      let tx,result,error;
      try{tx=db.transaction(['metadata','songs'],mode);}catch{dbPromise=undefined;reject(fail('blocked'));return;}
      const abort=e=>{error=e;tx.abort();};
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(error||fail(tx.error?.name==='QuotaExceededError'?'full':'blocked'));
      // A request failure aborts the enclosing transaction; success is not commit.
      try{body(tx, value=>result=value,abort);}catch(e){abort(e);}
    });
  }
  const store={
    async init(){await openDb();},
    list:()=>transaction('readonly',(tx,done)=>{const req=tx.objectStore('metadata').getAll();req.onsuccess=()=>done(req.result.sort((a,b)=>b.updated-a.updated));}),
    get:id=>transaction('readonly',(tx,done)=>{const req=tx.objectStore('songs').get(id);req.onsuccess=()=>done(req.result);}),
    put(value,expected){
      const item=entry(value);return transaction('readwrite',(tx,done,abort)=>{
        const songs=tx.objectStore('songs'),meta=tx.objectStore('metadata'),read=songs.get(item.id);
        read.onsuccess=()=>{try{
          const next=revised(item,read.result,expected,limits),all=meta.getAll();
          all.onsuccess=()=>{try{capacity(all.result,next,limits);songs.put(next);meta.put(metadata(next));done(next);}catch(e){abort(e);}};
        }catch(e){abort(e);}};
      });
    },
    remove:id=>transaction('readwrite',(tx)=>{tx.objectStore('songs').delete(id);tx.objectStore('metadata').delete(id);}),
    async recover(id,revision,expected){const old=await store.get(id),previous=old?.previous.find(p=>p.revision===revision);if(!previous)throw fail('invalid');return store.put({...old,drawing:previous.drawing},expected);},
    async backup(){const songs=await transaction('readonly',(tx,done)=>{const req=tx.objectStore('songs').getAll();req.onsuccess=()=>done(req.result.map(({id,title,updated,drawing})=>({id,title,updated,drawing})));});return {kind:'music-canvas-library',version:1,songs};},
    async importBackup(value,makeId,projectThumbnail=()=> ''){
      const songs=parseBackup(value).map(item=>({...item,id:makeId(),thumbnail:projectThumbnail(item.drawing)}));if(new Set(songs.map(s=>s.id)).size!==songs.length)throw fail('invalid');
      return transaction('readwrite',(tx,done,abort)=>{
        const meta=tx.objectStore('metadata'),payload=tx.objectStore('songs'),req=meta.getAll();
        req.onsuccess=()=>{try{
          const next=songs.map(s=>revised(s,undefined,0,limits));const all=req.result;
          if(next.some(s=>all.some(m=>m.id===s.id)))throw fail('conflict');
          if(all.length+next.length>limits.songs||all.reduce((n,m)=>n+m.bytes,0)+next.reduce((n,s)=>n+bytes(s),0)>limits.bytes)throw fail('full');
          for(const s of next){payload.put(s);meta.put(metadata(s));}done(next.length);
        }catch(e){abort(e);}};
      });
    },
    close(){const pending=dbPromise;dbPromise=undefined;pending?.then(db=>db.close()).catch(()=>{});},
  };return store;
}
// One active transaction and one replaceable latest snapshot. A failure latches;
// subsequent edits remain pending until the user explicitly retries or exports.
export function createSaveCoordinator(write,onState){
  let pending,active,error;
  function pump(){
    if(active||pending===undefined||error)return;
    const value=pending;pending=undefined;onState('saving');
    active=Promise.resolve().then(()=>write(value)).then(()=>{onState(pending===undefined?'saved':'saving');},e=>{error=e;if(pending===undefined)pending=value;onState(e.code==='conflict'?'conflict':e.code==='full'?'full':'blocked');}).finally(()=>{active=undefined;if(!error)pump();});
  }
  return {schedule(value){pending=value;pump();},async flush(){while(active)await active;if(error)throw error;},retry(){error=undefined;pump();},get failed(){return error;}};
}
