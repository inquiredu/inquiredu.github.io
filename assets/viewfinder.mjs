import { metadataRows, paletteFromPixels } from './photo-notes.mjs?v=20261115.2';
const $ = id => document.getElementById(id);
const wall=$('wall'), flip=$('viewfinderFlip'), canvas=$('kaleidoscopeCanvas'), toggle=$('kaleidoscopeToggle');
const context=canvas.getContext('2d');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let image, slide={}, active=false, visible=true, request=0, lastTime=0, phase=0, pointer={x:0,y:0}, size={width:0,height:0};
const make=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
function notes(current,imageElement) {
  $('photoMetadata').replaceChildren();
  for(const [label,value] of metadataRows(current)) {
    const row=make('div');row.append(make('dt',label),make('dd',value));$('photoMetadata').append(row);
  }
  $('photoPalette').replaceChildren();
  try {
    const sample=document.createElement('canvas');sample.width=sample.height=48;
    const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(imageElement,0,0,48,48);
    const colors=paletteFromPixels(ctx.getImageData(0,0,48,48).data);
    for(const color of colors){const swatch=make('span');swatch.style.backgroundColor=color;swatch.title=color;swatch.setAttribute('aria-label',color);swatch.setAttribute('role','img');$('photoPalette').append(swatch);}
    if(colors.length)wall.style.setProperty('--frame-color',colors[Math.floor(colors.length/2)]);
  }catch { /* Camera notes are still useful if a remote image cannot be sampled. */ }
  $('photoPalette').parentElement.hidden=!$('photoPalette').childElementCount;
}
function update(detail) {
  image=detail.image;slide=detail.slide;notes(slide,image);phase=0;draw();sync();
}
function resize(){
  const rect=wall.getBoundingClientRect();size={width:Math.max(1,rect.width-24),height:Math.max(1,rect.height-44)};
  const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(size.width*dpr);canvas.height=Math.round(size.height*dpr);
  context.setTransform(dpr,0,0,dpr,0,0);draw();
}
function draw(){
  if(!active||!image?.naturalWidth||!context)return;
  const {width,height}=size;if(!width||!height)return;
  context.clearRect(0,0,width,height);context.fillStyle='#191a17';context.fillRect(0,0,width,height);
  const radius=Math.hypot(width,height)/2+2,segments=12,angle=Math.PI*2/segments;
  const scale=radius*2.5/Math.min(image.naturalWidth,image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  for(let i=0;i<segments;i++){
    context.save();context.translate(width/2,height/2);context.rotate(i*angle);
    context.beginPath();context.moveTo(0,0);context.lineTo(radius,0);context.arc(0,0,radius,0,angle+.002);context.closePath();context.clip();
    if(i%2){context.rotate(angle);context.scale(1,-1);}
    context.rotate(phase+pointer.x*.16);
    context.drawImage(image,-w/2+radius*.2+pointer.x*radius*.12,-h/2+radius*.14+pointer.y*radius*.12,w,h);
    context.restore();
  }
}
let atlasOpen=false;
window.addEventListener('viewfinder:atlas',event=>{atlasOpen=!!event.detail.open;sync();});
function shouldRun(){return active&&visible&&!atlasOpen&&!document.hidden&&!flip.classList.contains('is-flipped')&&!motion.matches;}
function tick(time){
  request=0;if(!shouldRun())return;
  if(time-lastTime>40){phase+=Math.min(time-lastTime,80)*.00006;lastTime=time;draw();}
  request=requestAnimationFrame(tick);
}
function sync(){
  if(request){cancelAnimationFrame(request);request=0;}
  if(shouldRun()){lastTime=performance.now();request=requestAnimationFrame(tick);}else draw();
}
$('frameNotesToggle').addEventListener('click',()=>{
  const open=$('frameNotes').hidden;$('frameNotes').hidden=!open;$('frameNotesToggle').setAttribute('aria-expanded',String(open));
  $('frameNotesToggle').querySelector('span').textContent=open?'−':'＋';
});
toggle.addEventListener('click',()=>{
  active=!active;toggle.setAttribute('aria-pressed',String(active));canvas.hidden=!active;wall.classList.toggle('kaleidoscope-on',active);
  wall.setAttribute('aria-description',active?'Kaleidoscope made from this photograph. Open the contact sheet to choose another.':'Click the frame to browse the contact sheet.');
  if(active)resize();sync();
});
wall.addEventListener('pointermove',event=>{
  if(!active)return;const rect=wall.getBoundingClientRect();pointer={x:(event.clientX-rect.left)/rect.width-.5,y:(event.clientY-rect.top)/rect.height-.5};
  draw();
});
wall.addEventListener('pointerleave',()=>{pointer={x:0,y:0};if(motion.matches)draw();});
window.addEventListener('viewfinder:photo',event=>update(event.detail));
document.addEventListener('visibilitychange',sync);
motion.addEventListener('change',sync);
new MutationObserver(sync).observe(flip,{attributes:true,attributeFilter:['class']});
if('ResizeObserver' in window)new ResizeObserver(resize).observe(wall);else window.addEventListener('resize',resize);
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.05}).observe(wall);
// Handle a cached slide that loaded before this module finished loading.
if(wall.dataset.slide){
  const current=wall.querySelector('.frame.on .photo');
  if(current?.complete&&current.naturalWidth)try{update({slide:JSON.parse(wall.dataset.slide),image:current});}catch{}
}
resize();
