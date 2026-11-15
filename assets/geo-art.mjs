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
export function drawGeoArt(canvas,photos,{labels=false,strength=50,caption=true,demo=false}={}) {
  const width=canvas.width,height=canvas.height,ctx=canvas.getContext('2d');
  ctx.fillStyle='#171c1b';ctx.fillRect(0,0,width,height);
  const points=projectLocations(photos,width,height,Math.min(width,height)*.15);
  const radius=Math.max(18,Math.min(width,height)*(.065+strength/1000));
  const density=document.createElement('canvas');density.width=width;density.height=height;
  const dc=density.getContext('2d',{willReadFrequently:true});dc.fillStyle='#000';dc.fillRect(0,0,width,height);dc.globalCompositeOperation='lighter';
  for(const point of points) {
    const glow=dc.createRadialGradient(point.x,point.y,0,point.x,point.y,radius);
    glow.addColorStop(0,'rgba(255,255,255,.08)');glow.addColorStop(.2,'rgba(255,255,255,.06)');glow.addColorStop(.55,'rgba(255,255,255,.02)');glow.addColorStop(1,'rgba(255,255,255,0)');
    dc.fillStyle=glow;dc.fillRect(point.x-radius,point.y-radius,radius*2,radius*2);
  }
  const pixels=dc.getImageData(0,0,width,height),ramp=[[23,28,27],[47,66,53],[117,111,70],[219,175,116]];let peak=1;
  for(let i=0;i<pixels.data.length;i+=4)peak=Math.max(peak,pixels.data[i]);
  for(let i=0;i<pixels.data.length;i+=4){const value=Math.pow(pixels.data[i]/peak,.65)*3,low=Math.min(2,Math.floor(value)),mix=value-low;for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(ramp[low][c]*(1-mix)+ramp[low+1][c]*mix);pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);
  if(labels) {ctx.fillStyle='#e4d9c6';ctx.font=`${Math.max(11,width/75)}px ui-monospace, monospace`;const used=new Set();for(const p of points){const key=p.photo.location.label||`${p.photo.location.lat.toFixed(1)}°, ${p.photo.location.lon.toFixed(1)}°`;if(used.has(key))continue;used.add(key);ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill();ctx.fillText(key.slice(0,40),Math.min(width-160,p.x+9),Math.max(24,p.y-9));}}
  if(caption){ctx.fillStyle='#a8b2a4';ctx.font=`${Math.max(10,width/90)}px ui-monospace, monospace`;ctx.fillText(demo?'ILLUSTRATIVE STUDY / SAMPLE LOCATIONS':'AFTERIMAGE / A GEOGRAPHY OF MOMENTS',28,height-34);ctx.textAlign='right';ctx.fillText(`${photos.length} ${demo?'SAMPLES':'PHOTOGRAPHS'} · INQUIREDU.ORG`,width-28,height-34);ctx.textAlign='left';}
  return points;
}
