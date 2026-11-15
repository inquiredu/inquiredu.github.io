// A deliberate public metadata allowlist: no GPS, serial numbers, owner names, or file paths.
export const EXIF_TAGS = ['DateTimeOriginal','Make','Model','LensModel','FNumber','ExposureTime','ISO','FocalLength','FocalLengthIn35mmFormat'];
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g,'').trim().slice(0,120) : '';
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
export function safeMetadata(raw = {}) {
  raw ||= {};
  const result = {};
  for (const name of ['camera','lens']) { const value=clean(raw[name]); if(value)result[name]=value; }
  if(typeof raw.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    const date=new Date(raw.date+'T12:00:00Z'); if(!isNaN(date)&&date.toISOString().slice(0,10)===raw.date)result.date=raw.date;
  }
  for(const name of ['aperture','exposure','iso','focalLength'])if(positive(raw[name]))result[name]=raw[name];
  return result;
}
export function metadataFromExif(exif = {}) {
  const make=clean(exif.Make),model=clean(exif.Model);
  const camera=model.toLowerCase().startsWith(make.toLowerCase())?model:[make,model].filter(Boolean).join(' ');
  const original=typeof exif.DateTimeOriginal==='string'?exif.DateTimeOriginal:'';
  const date=/^(\d{4})[:\-](\d{2})[:\-](\d{2})/.exec(original);
  return safeMetadata({camera,lens:exif.LensModel,date:date?`${date[1]}-${date[2]}-${date[3]}`:'',aperture:exif.FNumber,exposure:exif.ExposureTime,iso:exif.ISO,focalLength:exif.FocalLength});
}
export function exposureLabel(value) {
  if(!positive(value))return '';
  return value <= .5 ? `1/${Math.round(1/value)} s` : `${+value.toFixed(2)} s`;
}
export function metadataRows(slide = {}) {
  const m=slide.shareMetadata===false?{}:safeMetadata(slide.metadata);
  const rows=[];
  const date=m.date||slide.taken;
  if(date && /^\d{4}-\d{2}(?:-\d{2})?$/.test(date)) {
    const d=new Date((date.length===7?date+'-15':date)+'T12:00:00Z');
    if(!isNaN(d))rows.push(['Taken',new Intl.DateTimeFormat('en-US',{month:'short',...(date.length===10?{day:'numeric'}:{}),year:'numeric',timeZone:'UTC'}).format(d)]);
  }
  if(m.camera)rows.push(['Camera',m.camera]);
  if(m.lens)rows.push(['Lens',m.lens]);
  const settings=[m.focalLength?`${+m.focalLength.toFixed(1)} mm`:'',m.aperture?`ƒ/${+m.aperture.toFixed(1)}`:'',exposureLabel(m.exposure),m.iso?`ISO ${Math.round(m.iso)}`:''].filter(Boolean);
  if(settings.length)rows.push(['Exposure',settings.join(' · ')]);
  if(slide.width && slide.height)rows.push(['Frame',`${slide.width > slide.height?'Landscape':slide.width < slide.height?'Portrait':'Square'} · ${slide.width} × ${slide.height}`]);
  return rows;
}
export function publicSlides(data) {
  return {...data, slides:data.slides.map(slide=>{
    const result={};
    for(const key of ['id','src','thumb','width','height','taken','caption','alt','hidden','shareMetadata'])if(slide[key]!==undefined)result[key]=slide[key];
    const metadata=slide.shareMetadata===false?{}:safeMetadata(slide.metadata);
    if(Object.keys(metadata).length)result.metadata=metadata;
    return result;
  })};
}
export function paletteFromPixels(pixels, count = 5) {
  const buckets=new Map();
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i+3]<128)continue;
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    const key=[r>>5,g>>5,b>>5].join(',');const bucket=buckets.get(key)||{r:0,g:0,b:0,n:0};
    bucket.r+=r;bucket.g+=g;bucket.b+=b;bucket.n++;buckets.set(key,bucket);
  }
  const colors=[...buckets.values()].sort((a,b)=>b.n-a.n).map(c=>[Math.round(c.r/c.n),Math.round(c.g/c.n),Math.round(c.b/c.n)]);
  const selected=[];
  for(const color of colors){if(selected.every(other=>color.reduce((sum,n,i)=>sum+(n-other[i])**2,0)>1900))selected.push(color);if(selected.length>=count)break;}
  return selected.sort((a,b)=>(a[0]*.2126+a[1]*.7152+a[2]*.0722)-(b[0]*.2126+b[1]*.7152+b[2]*.0722)).map(c=>'#'+c.map(n=>n.toString(16).padStart(2,'0')).join(''));
}
