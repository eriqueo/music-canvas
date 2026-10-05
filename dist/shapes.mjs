// Kid Pix-inspired interactions; geometry stays vector data, never sampled pixels.
export const SHAPES={
  pen:{label:'Pen',strokes:1},line:{label:'Line',strokes:1},
  circle:{label:'Circle',strokes:2},oval:{label:'Oval',strokes:2},
  rectangle:{label:'Rectangle',strokes:4},triangle:{label:'Triangle',strokes:3},
  diamond:{label:'Diamond',strokes:4},
};
export const SYMMETRIES={
  off:{label:'Off',copies:1,transforms:[[false,false]]},
  time:{label:'Time mirror',copies:2,transforms:[[false,false],[true,false]]},
  pitch:{label:'Pitch mirror',copies:2,transforms:[[false,false],[false,true]]},
  both:{label:'Four-way',copies:4,transforms:[[false,false],[true,false],[false,true],[true,true]]},
};
export function shapePaths(kind,points,{width,height}){
  if(kind==='pen')return [points];
  const a=points[0],b=points.at(-1);
  if(kind==='line')return [[a,b].sort((p,q)=>p.x-q.x||p.y-q.y)];
  const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
  const cx=(left+right)/2,cy=(top+bottom)/2;
  if(kind==='circle'||kind==='oval'){
    let rx=(right-left)/2,ry=(bottom-top)/2;
    if(kind==='circle'){const radius=Math.min(rx*width,ry*height);rx=radius/width;ry=radius/height;}
    // Two monotone paths give the upper and lower contours separate audio voices.
    // Fixed 64 segments per half stay below the existing per-stroke point limit.
    return [-1,1].map(sign=>Array.from({length:65},(_,i)=>{
      const theta=Math.PI*(1-i/64);
      return {x:cx+rx*Math.cos(theta),y:i===0||i===64?cy:cy+sign*ry*Math.sin(theta)};
    }));
  }
  const vertices=kind==='rectangle'?[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]
    :kind==='triangle'?[{x:cx,y:top},{x:right,y:bottom},{x:left,y:bottom}]
    :[{x:cx,y:top},{x:right,y:cy},{x:cx,y:bottom},{x:left,y:cy}];
  return vertices.map((p,i)=>[p,vertices[(i+1)%vertices.length]]);
}
export function mirrorStrokes(strokes,mode){
  const seen=new Set(),result=[];
  for(const [flipX,flipY] of SYMMETRIES[mode].transforms)for(const stroke of strokes){
    const points=stroke.points.map(p=>({x:flipX?1-p.x:p.x,y:flipY?1-p.y:p.y}));
    const forward=points.map(p=>`${p.x.toFixed(12)},${p.y.toFixed(12)}`),backward=[...forward].reverse();
    const key=`${stroke.pen}:${stroke.sound}:${[forward.join(';'),backward.join(';')].sort()[0]}`;
    if(seen.has(key))continue;seen.add(key);result.push({...stroke,points});
  }
  return result;
}

export function eraseObjectAt(strokes,point,radiusX,radiusY){
  let hit,nearest=1;
  for(const stroke of strokes){
    for(let i=0;i<stroke.points.length;i++){
      const a=stroke.points[i],b=stroke.points[Math.min(i+1,stroke.points.length-1)];
      const ax=(a.x-point.x)/radiusX,ay=(a.y-point.y)/radiusY,dx=(b.x-a.x)/radiusX,dy=(b.y-a.y)/radiusY;
      const length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)):0;
      const distance=(ax+t*dx)**2+(ay+t*dy)**2;
      // Equal-distance crossings select the topmost contour despite float noise.
      if(distance<=1&&distance<=nearest+1e-12){nearest=distance;hit=stroke;}
    }
  }
  if(!hit)return strokes;
  return strokes.filter(s=>hit.object===undefined?s!==hit:s.object!==hit.object);
}

// Scene outlines use the same editable, grouped contours as shape gestures.
export const SCENES={mountains:{label:'Mountains & cloud'},forest:{label:'Forest'},sailboat:{label:'Sailboat'},orbits:{label:'Orbit duet'},diamonds:{label:'Diamond echoes'},waves:{label:'Crossing waves'},stairs:{label:'Staircase canon'}};
export function sceneDrawing(scene,{width,height}){
  const strokes=[];let object=0;
  const path=(pen,coordinates)=>strokes.push({pen,object:++object,points:coordinates.map(([x,y])=>({x,y}))});
  const shape=(pen,kind,a,b)=>{const id=++object;strokes.push(...shapePaths(kind,[{x:a[0],y:a[1]},{x:b[0],y:b[1]}],{width,height}).map(points=>({pen,object:id,points})));};
  if(scene==='mountains'){
    path('gold',[[.06,.78],[.21,.4],[.36,.78],[.51,.4],[.66,.78],[.81,.4],[.96,.78]]);
    shape('blue','oval',[.7,.12],[.89,.28]);
  }else if(scene==='forest'){
    for(const [x,y,size] of [[.19,.3,.16],[.49,.19,.2],[.8,.34,.15]]){
      shape('green','triangle',[x-size,y],[x+size,.75]);
      path('copper',[[x,.75],[x,.9]]);
    }
    path('teal',[[.04,.91],[.25,.88],[.48,.93],[.7,.89],[.96,.92]]);
    shape('gold','oval',[.76,.08],[.88,.22]);
  }else if(scene==='sailboat'){
    path('copper',[[.28,.7],[.38,.84],[.65,.84],[.76,.7],[.28,.7]]);
    path('cream',[[.52,.7],[.52,.16],[.27,.62],[.52,.62],[.72,.62],[.52,.16]]);
    for(const y of [.88,.95])path('blue',[[.06,y],[.2,y-.03],[.35,y],[.5,y-.03],[.65,y],[.8,y-.03],[.95,y]]);
    shape('gold','oval',[.79,.1],[.91,.24]);
  }else if(scene==='orbits'){
    shape('blue','oval',[.08,.15],[.92,.85]);
    shape('rose','oval',[.22,.3],[.78,.7]);
    path('gold',[[.08,.5],[.92,.5]]);
  }else if(scene==='diamonds'){
    for(const [x,pen] of [[.08,'teal'],[.36,'copper'],[.64,'rose']])shape(pen,'diamond',[x,.2],[x+.28,.8]);
  }else if(scene==='waves'){
    for(const [pen,phase] of [['blue',0],['coral',Math.PI]])path(pen,Array.from({length:97},(_,i)=>[.04+.92*i/96,.5+.29*Math.sin(i/96*Math.PI*4+phase)]));
    path('gold',[[.04,.82],[.96,.82]]);
  }else if(scene==='stairs'){
    for(const [pen,start,y] of [['teal',.06,.76],['gold',.2,.86],['rose',.34,.66]]){
      const coordinates=[];for(let i=0;i<6;i++){coordinates.push([start+i*.085,y-i*.09],[start+(i+1)*.085,y-i*.09]);}
      path(pen,coordinates);
    }
  }else throw new Error('UNKNOWN_SCENE');
  return strokes;
}

// A single geometry producer serves hover and audio-clock playback markers.
export function crossingsAt(strokes,x){
  const hits=[];
  for(const stroke of strokes){
    const seen=new Set();
    const add=y=>{const key=y.toFixed(6);if(!seen.has(key)){seen.add(key);hits.push({x,y,pen:stroke.pen});}};
    if(stroke.points.length===1){const p=stroke.points[0];if(Math.abs(p.x-x)<.003)add(p.y);}
    for(let i=1;i<stroke.points.length;i++){
      const a=stroke.points[i-1],b=stroke.points[i];
      if(x<Math.min(a.x,b.x)||x>Math.max(a.x,b.x))continue;
      if(a.x===b.x){add(a.y);add(b.y);}else add(a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x));
    }
  }
  return hits;
}
export function snapToGrid(p,columns,rows,positions){
  return {x:(Math.min(columns-1,Math.max(0,Math.floor(p.x*columns)))+.5)/columns,y:positions?positions.reduce((a,b)=>Math.abs(b-p.y)<Math.abs(a-p.y)?b:a):Math.min(rows-1,Math.max(0,Math.round(p.y*(rows-1))))/(rows-1)};
}
export function gridCells(strokes,columns,rows,positions){
  const cells=new Map();
  for(const stroke of strokes)for(let i=0;i<stroke.points.length;i++){
    const a=stroke.points[i],b=stroke.points[Math.min(i+1,stroke.points.length-1)];
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x)*columns,Math.abs(b.y-a.y)*(rows-1))*2));
    for(let step=0;step<=steps;step++){
      const p=snapToGrid({x:a.x+(b.x-a.x)*step/steps,y:a.y+(b.y-a.y)*step/steps},columns,rows,positions);
      cells.set(`${p.x}:${p.y}:${stroke.pen}`,{...p,pen:stroke.pen});
    }
  }
  return [...cells.values()];
}
