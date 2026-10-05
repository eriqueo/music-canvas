// Small inline drawings stay sharp on touch screens and need no external assets.
const PATHS={
  pen:'M4 20l1-6L16 3l5 5L10 19z M14 5l5 5 M4 20l6-1',
  eraser:'M3 14l9-10 9 8-8 9H9z M8 19l9-10 M13 21h9',
  undo:'M9 5L3 11l6 6 M3 11h11a6 6 0 010 12',redo:'M15 5l6 6-6 6 M21 11H10a6 6 0 000 12',
  clear:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  guides:'M5 4v16 M12 4v16 M19 4v16 M2 8h20 M2 15h20',paper:'M12 2a10 10 0 100 20V2 M12 2a10 10 0 010 20',
  play:'M7 3l14 9-14 9z',pause:'M7 4v16 M17 4v16',stop:'M5 5h14v14H5z',restart:'M5 7a9 9 0 111 12 M5 2v5h5',
  save:'M4 3h13l4 4v14H3V3z M7 3v6h10V3 M7 21v-8h10v8',open:'M2 7h8l2 3h10l-4 11H2z M3 7V3h7l3 4h7v3',
  export:'M12 3v12 M7 8l5-5 5 5 M4 13v8h16v-8',help:'M8 7a4 4 0 118 0c0 3-4 3-4 6 M12 18v1',
  tune:'M5 2v20 M12 2v20 M19 2v20 M2 7h6 M9 16h6 M16 9h6',song:'M6 3h13v18H6z M3 6v15 M9 7h7 M9 11h7 M9 15h7',
  add:'M12 4v16 M4 12h16',copy:'M8 8h13v13H8z M16 8V3H3v13h5',earlier:'M20 12H4 M10 5l-7 7 7 7',later:'M4 12h16 M14 5l7 7-7 7',
  dice:'M5 3h14v18H3V3z M7 7h.2 M16 7h.2 M12 12h.2 M7 17h.2 M16 17h.2',
  shapes:'M2 13h8v8H2z M14 3l7 9H7z M18 15a3 3 0 100 6 3 3 0 000-6',
  scene:'M2 20l6-10 5 7 4-5 5 8z M18 2a3 3 0 100 6 3 3 0 000-6',snap:'M5 7h14 M5 12h14 M5 17h14 M8 3v18 M16 3v18',grid:'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  mirror:'M12 2v20 M3 6l6 6-6 6z M21 6l-6 6 6 6z',free:'M3 17c4-14 5 8 10-4s8-2 8 4',
  keys:'M3 4h18v16H3z M7 4v16 M12 4v16 M17 4v16 M7 4v8 M17 4v8',
  pluck:'M15 2l-6 9c-6-2-9 5-5 9s11 1 9-5l9-6 M9 14l2 2 M13 10l3 3',
  bell:'M5 17h14l-3-5V8a4 4 0 00-8 0v4z M10 21h4 M12 2v2',
  marimba:'M3 8l17-3 M4 13l17-3 M5 18l17-3 M7 4l2 16 M15 3l2 16',
  flute:'M4 20L20 4 M7 16h1 M10 13h1 M13 10h1 M16 7h1 M17 3l4 4',
  strings:'M15 2l-5 7c-6-1-9 4-6 7s6 2 7-1c4 3 8-2 5-5l5-7 M9 16l7-9 M3 4l17 16',
  chime:'M3 4h18 M6 4v14 M12 4v10 M18 4v16',bass:'M15 2l-6 9c-7-2-9 6-4 10s10 0 9-5l7-11 M8 17l10-12',
  chip:'M6 6h12v12H6z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4',
  drums:'M3 8c0-5 18-5 18 0s-18 5-18 0 M3 8v10c0 5 18 5 18 0V8 M6 3l6 7 M18 3l-6 7',
};
export function icon(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',PATHS[name]||PATHS.free);svg.append(path);return svg;
}
export function buttonFace(button,name,label){const text=document.createElement('span');text.className='button-label';text.textContent=label;button.replaceChildren(icon(name),text);button.classList.add('picture-button');}
const BUTTONS={save:['save','Save'],open:['open','Open'],export:['export','Share'],help:['help','Help'],pen:['pen','Draw'],eraser:['eraser','Erase'],undo:['undo','Undo'],redo:['redo','Redo'],clear:['clear','Clear'],guides:['guides','Notes'],paper:['paper','Paper'],play:['play','Play'],pause:['pause','Pause'],stop:['stop','Stop'],restart:['restart','Again'],tune:['tune','Tune'],song:['song','Song'], 'page-add':['add','New'],'page-copy':['copy','Copy'],'page-earlier':['earlier','Back'],'page-later':['later','Next'],'page-delete':['clear','Remove']};
const PICKERS={scene:{label:'Pictures',icon:'scene'},snap:{label:'Snap',icon:'snap'},'drawing-view':{label:'View',icon:'grid'},shape:{label:'Shapes',icon:'shapes'},symmetry:{label:'Mirror',icon:'mirror'},'erase-mode':{label:'Eraser',icon:'eraser'}};
export function refreshPickers(){
  for(const [id,entry] of Object.entries(PICKERS)){
    const select=document.getElementById(id),button=document.querySelector(`[data-picker="${id}"]`);if(!button)continue;
    buttonFace(button,id==='drawing-view'&&select.value==='drawing'?'pen':entry.icon,entry.label);
    button.title=`${entry.label}: ${select.selectedOptions[0]?.textContent||''}`;
    const current=document.createElement('small');current.textContent=id==='scene'?'Try a drawing':select.selectedOptions[0]?.textContent;button.append(current);
  }
}
export function setupPictures({preview}){
  for(const [id,[name,label]] of Object.entries(BUTTONS)){const b=document.getElementById(id);buttonFace(b,name,label);}
  const chooser=document.getElementById('choice-dialog');
  for(const [id,entry] of Object.entries(PICKERS)){
    const select=document.getElementById(id),trigger=document.querySelector(`[data-picker="${id}"]`);
    select.addEventListener('change',refreshPickers);
    trigger.onclick=()=>{
      document.getElementById('choice-title').textContent=entry.label;
      const list=document.getElementById('choices');list.replaceChildren();
      for(const option of select.options){
        if(!option.value)continue;
        const tile=document.createElement('button');tile.className='choice';tile.dataset.choice=option.value;tile.setAttribute('aria-pressed',String(option.value===select.value));
        const art=preview(id,option.value)||icon(id==='erase-mode'?'eraser':option.value==='free'?'free':entry.icon);
        const label=document.createElement('span');label.textContent=option.textContent;tile.append(art,label);
        tile.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change'));chooser.close();trigger.focus();};list.append(tile);
      }
      chooser.showModal();
    };
  }
  document.getElementById('close-choice').onclick=()=>chooser.close();
  for(const [button,dialog] of [['tune','tune-dialog'],['export','export-dialog']])document.getElementById(button).onclick=()=>document.getElementById(dialog).showModal();
  for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>document.getElementById(button.dataset.close).close();
  for(const id of ['wav','midi'])document.getElementById(id).addEventListener('click',()=>document.getElementById('export-dialog').close());
  refreshPickers();
}
