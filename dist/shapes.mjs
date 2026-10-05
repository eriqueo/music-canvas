// Kid Pix-inspired interactions; geometry stays vector data, never sampled pixels.
export const SHAPES={
  pen:{label:'Freehand',strokes:1},line:{label:'Line',strokes:1},
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

// Bounded preset variations: editable vectors, at most twelve contours.
export function randomDrawing({variant,shift,width,height}){
  const recipes=[
    [['oval',.12,.22,.42,.72,'blue'],['triangle',.52,.18,.84,.8,'gold']],
    [['diamond',.15,.15,.46,.85,'rose'],['oval',.54,.32,.88,.68,'green']],
    [['triangle',.1,.2,.38,.75,'copper'],['triangle',.38,.2,.66,.75,'teal'],['triangle',.66,.2,.94,.75,'gold']],
    [['oval',.12,.12,.88,.88,'coral'],['line',.12,.72,.88,.28,'cream'],['line',.12,.28,.88,.72,'blue']],
  ];
  return recipes[variant].flatMap(([kind,x1,y1,x2,y2,pen],index)=>shapePaths(kind,[{x:x1,y:y1+shift},{x:x2,y:y2+shift}],{width,height}).map(points=>({pen,object:index+1,points})));
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
