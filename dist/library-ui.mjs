import {routesFor} from './routes.mjs';
const ROUTES=routesFor(new URL(document.baseURI).pathname);
import {createIndexedDbStore,createSaveCoordinator,LIBRARY_LIMITS} from './library.mjs';
import {buttonFace} from './ui.mjs';
const $=id=>document.getElementById(id);
const LAST_SONG='music-canvas:last-song';
const rememberLast=id=>{try{localStorage.setItem(LAST_SONG,id);}catch{}};
const messages={saving:'Saving…',saved:'✓ Saved on this device',full:'Could not save. Storage is full. Export your song.',blocked:'Could not save here. Export your song.',conflict:'This song changed in another window. Export your edits, then reload this app.'};
export async function setupLibrary({capture,apply,thumbnail,finish,stop,status,prepareFile,reload}){
  const store=createIndexedDbStore();let current={id:crypto.randomUUID(),title:'My song',revision:0},ready=false,deleteId;
  const saver=createSaveCoordinator(async value=>{const saved=await store.put(value,current.revision);current={id:saved.id,title:saved.title,revision:saved.revision};rememberLast(saved.id);},state=>{$('save-state').textContent=messages[state];});
  const edit=()=>{if(!ready)return;saver.schedule({...current,updated:Date.now(),drawing:structuredClone(capture()),thumbnail:thumbnail()});};
  const flush=async()=>{finish();await saver.flush();};
  const trouble=e=>{status(messages[e.code]||'Could not open this song. Your current drawing is still here.');$('library-message').textContent=messages[e.code]||'Could not open the library.';};
  async function openSong(id){await flush();const saved=await store.get(id);if(!saved)throw new Error('missing');ready=false;stop();apply(saved.drawing);current={id:saved.id,title:saved.title,revision:saved.revision};ready=true;rememberLast(id);$('save-state').textContent=messages.saved;route(ROUTES.draw);}
  async function list(){
    const metas=await store.list();$('song-name').value=current.title;$('song-list').replaceChildren();
    for(const meta of metas){
      const tile=document.createElement('article'),open=document.createElement('button'),label=document.createElement('span');open.dataset.song=meta.id;
      if(meta.thumbnail){const image=document.createElement('img');image.src=meta.thumbnail;image.alt='';open.append(image);}else buttonFace(open,'song','');
      label.textContent=meta.title;open.append(label);open.onclick=()=>openSong(meta.id).catch(trouble);
      const remove=document.createElement('button');buttonFace(remove,'clear','Remove');remove.setAttribute('aria-label',`Remove ${meta.title}`);remove.onclick=()=>{deleteId=meta.id;$('delete-song-dialog').showModal();};tile.append(open,remove);$('song-list').append(tile);
    }
    $('library-message').textContent=metas.length?`${metas.length} of ${LIBRARY_LIMITS.songs} songs`:'Draw your first song.';
  }
  function route(path){
    if(path!==location.pathname)history.pushState({},'',path);
    if(path===ROUTES.songs){if(!$('songs-dialog').open)$('songs-dialog').showModal();list().catch(trouble);}else if($('songs-dialog').open)$('songs-dialog').close();
  }
  window.addEventListener('popstate',()=>route(location.pathname));
  $('my-songs').onclick=async()=>{try{await flush();}catch(e){trouble(e);}route(ROUTES.songs);};
  $('close-songs').onclick=()=>route(ROUTES.draw);$('songs-dialog').addEventListener('cancel',event=>{event.preventDefault();route(ROUTES.draw);});
  $('adult').onclick=()=>$('adult-dialog').showModal();
  async function fresh(copy=false){await flush();const drawing=copy?capture():null;current={id:crypto.randomUUID(),title:copy?`${current.title} copy`:'My song',revision:0};ready=false;stop();apply(drawing);ready=true;edit();await saver.flush();route(ROUTES.draw);}
  $('new-song').onclick=()=>fresh().catch(trouble);$('duplicate-song').onclick=()=>fresh(true).catch(trouble);
  $('rename-song').onsubmit=async e=>{e.preventDefault();try{await flush();current.title=$('song-name').value.trim()||'My song';edit();await saver.flush();await list();}catch(err){trouble(err);}};
  $('confirm-delete').onclick=async()=>{try{if(deleteId===current.id)await flush();else finish();await store.remove(deleteId);$('delete-song-dialog').close();if(deleteId===current.id){ready=false;current={id:crypto.randomUUID(),title:'My song',revision:0};apply(null);ready=true;$('save-state').textContent='Draw to save a new song.';}await list();}catch(e){trouble(e);}};
  $('reload-app').onclick=async()=>{try{stop();await flush();await reload();}catch(e){trouble(e);}};
  $('retry-save').onclick=()=>{saver.retry();edit();};
  $('recover-song').onclick=async()=>{try{await flush();const saved=await store.get(current.id),previous=saved?.previous[0];if(!previous){status('No earlier saved edit.');return;}const restored=await store.recover(current.id,previous.revision,current.revision);ready=false;stop();apply(restored.drawing);current.revision=restored.revision;ready=true;$('save-state').textContent=messages.saved;status('Previous saved edit restored.');}catch(e){trouble(e);}};
  $('library-backup').onclick=async()=>{try{await flush();const backup=await store.backup();prepareFile(JSON.stringify(backup),'application/json','music-canvas-backup.json');}catch(e){trouble(e);}};
  $('library-restore').onclick=()=>$('backup-file').click();
  $('backup-file').onchange=async()=>{try{const file=$('backup-file').files[0];if(!file)return;if(file.size>LIBRARY_LIMITS.bytes)throw Object.assign(new Error(),{code:'full'});await flush();const count=await store.importBackup(JSON.parse(await file.text()),()=>crypto.randomUUID(),thumbnail);status(`${count} songs restored. Existing songs kept.`);}catch(e){trouble(e);}finally{$('backup-file').value='';}};
  $('persist-storage').onclick=async()=>{try{const protectedStorage=await navigator.storage?.persist?.();$('storage-state').textContent=protectedStorage?'Storage protected. Keep a backup in Files too.':'Storage protection not granted. Keep a backup in Files.';}catch{$('storage-state').textContent='Storage protection unavailable. Keep a backup in Files.';}};
  try{
    await store.init();let last;try{last=localStorage.getItem(LAST_SONG);}catch{}
    const metas=await store.list();const saved=(last?await store.get(last):undefined)||await store.get(metas[0]?.id||'');
    if(saved){apply(saved.drawing);current={id:saved.id,title:saved.title,revision:saved.revision};$('save-state').textContent=messages.saved;}else $('save-state').textContent='Draw to save your song.';
  }catch(e){$('save-state').textContent=messages.blocked;}
  ready=true;
  // Last-open preference is separate from song revisions and playback state.
  const commit=edit;
  const initial=location.pathname.replace(/\/$/,'')===ROUTES.songs?ROUTES.songs:ROUTES.draw;history.replaceState({},'',initial);route(initial);
  return {commit,flush,beforeImport:async()=>{await flush();current={id:crypto.randomUUID(),title:'Opened song',revision:0};}};
}
