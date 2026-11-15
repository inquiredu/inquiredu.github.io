import {publicMapPhotos} from './photo-notes.mjs?v=20261115.2';
export {publicMapPhotos};
// Unwrap around the largest empty longitude gap, so a trip across the date line stays together.
export function projectLocations(photos,width,height,padding=65) {
  if(!photos.length)return [];
  const longitudes=photos.map(p=>(p.location.lon+360)%360).sort((a,b)=>a-b);
  let gap=-1,start=longitudes[0];
  // Keep the original boundary value: adding/subtracting 360 can nudge a decimal
  // longitude across its own boundary and incorrectly wrap it around the globe.
  for(let i=0;i<longitudes.length;i++){const nextIndex=(i+1)%longitudes.length,next=longitudes[nextIndex]+(i===longitudes.length-1?360:0);if(next-longitudes[i]>gap){gap=next-longitudes[i];start=longitudes[nextIndex];}}
  const projected=photos.map(photo=>{let lon=(photo.location.lon+360)%360;if(lon<start)lon+=360;const lat=Math.max(-85,Math.min(85,photo.location.lat))*Math.PI/180;return {photo,x:lon,y:-Math.log(Math.tan(Math.PI/4+lat/2))*180/Math.PI};});
  const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min((width-padding*2)/Math.max(5,maxX-minX),(height-padding*2)/Math.max(5,maxY-minY));
  return projected.map(p=>({...p,x:width/2+(p.x-(minX+maxX)/2)*scale,y:height/2+(p.y-(minY+maxY)/2)*scale}));
}
export function drawGeoArt(canvas,photos,{labels=false,strength=50,caption=true,demo=false,time=0,activeId}={}) {
  const width=canvas.width,height=canvas.height,ctx=canvas.getContext('2d');
  const points=projectLocations(photos,width,height,Math.min(width,height)*.15);
  const field=document.createElement('canvas');field.width=330;field.height=Math.round(330*height/width);const dc=field.getContext('2d'),pixels=dc.createImageData(field.width,field.height);
  const ramp=[[15,26,36],[32,56,79],[96,140,155],[196,125,77],[244,174,114],[246,240,226]];
  const samples=points.map(p=>({x:p.x/width,y:p.y/height,weight:p.photo.id===activeId?1.15:1}));
  const values=new Float32Array(field.width*field.height);let peak=.1;
  for(let y=0;y<field.height;y++)for(let x=0;x<field.width;x++){
    let value=0;for(const p of samples){const dx=x/field.width-p.x,dy=(y/field.height-p.y)*height/width;value+=Math.exp(-(dx*dx+dy*dy)/(.006+strength/8000))*p.weight;}
    value*=1+Math.sin(time/2400+x/70+y/90)*.045;values[y*field.width+x]=value;peak=Math.max(peak,value);
  }
  for(let i=0;i<values.length;i++){const level=Math.pow(values[i]/peak,.7),v=level*5,low=Math.min(4,Math.floor(v)),mix=v-low,contour=level>.09&&(level*9)%1<.075?9:0;for(let c=0;c<3;c++)pixels.data[i*4+c]=Math.min(255,Math.round(ramp[low][c]*(1-mix)+ramp[low+1][c]*mix+contour));pixels.data[i*4+3]=255;}
  dc.putImageData(pixels,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(field,0,0,width,height);
  ctx.strokeStyle='#c5d4d51a';ctx.lineWidth=1;ctx.beginPath();for(let i=1;i<6;i++){ctx.moveTo(width*i/6,0);ctx.lineTo(width*i/6,height);}for(let i=1;i<4;i++){ctx.moveTo(0,height*i/4);ctx.lineTo(width,height*i/4);}ctx.stroke();
  if(labels){ctx.font=`${Math.max(11,width/75)}px ui-monospace,monospace`;const used=new Set();for(const p of points){const key=p.photo.location.label||`${p.photo.location.lat.toFixed(1)}°, ${p.photo.location.lon.toFixed(1)}°`;if(used.has(key))continue;used.add(key);ctx.strokeStyle='#e4d9c699';ctx.beginPath();ctx.moveTo(p.x-6,p.y);ctx.lineTo(p.x+6,p.y);ctx.moveTo(p.x,p.y-6);ctx.lineTo(p.x,p.y+6);ctx.stroke();const label=key.slice(0,40),labelWidth=ctx.measureText(label).width,x=Math.max(12,Math.min(width-labelWidth-16,p.x+14)),y=Math.max(28,p.y-14);ctx.fillStyle='#0f1a24d1';ctx.fillRect(x-5,y-18,labelWidth+10,25);ctx.fillStyle='#e4d9c6';ctx.fillText(label,x,y);}}
  if(activeId){const p=points.find(p=>p.photo.id===activeId);if(p){ctx.strokeStyle='#f6f0e28c';ctx.beginPath();ctx.arc(p.x,p.y,9+(time%2400)/160,0,Math.PI*2);ctx.stroke();}}
  if(caption){ctx.fillStyle='#c1c6bd';ctx.font=`${Math.max(10,width/90)}px ui-monospace,monospace`;ctx.fillText(demo?'ILLUSTRATIVE STUDY / SAMPLE LOCATIONS':'AFTERIMAGE / A GEOGRAPHY OF MOMENTS',28,height-34);ctx.textAlign='right';ctx.fillText(`${photos.length} ${demo?'SAMPLES':'PHOTOGRAPHS'} · INQUIREDU.ORG`,width-28,height-34);ctx.textAlign='left';}
  return points;
}
