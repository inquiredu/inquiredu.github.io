export const cleanContext=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,300):'';
export function photoContexts(slides) {
  return Object.fromEntries(slides.filter(photo=>typeof photo.id==='string'&&cleanContext(photo.aiContext)).map(photo=>[photo.id,cleanContext(photo.aiContext)]));
}
export async function aiRequest(origin,token,path,image,context='') {
  let response;
  try{response=await fetch(new URL(path,origin),{method:image?'POST':'GET',credentials:'omit',cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(image?{'Content-Type':'application/json'}:{})},...(image?{body:JSON.stringify({image,...(cleanContext(context)?{context:cleanContext(context)}:{})})}:{}),signal:AbortSignal.timeout(image?70000:12000)});}
  catch(error){if(error.name==='TimeoutError'||error.name==='AbortError')throw error;throw new Error('The description service could not be reached. Your photo is ready to publish without a description; retry AI later.');}
  let data;try{data=await response.json();}catch{throw new Error('The description service is not connected yet.');}
  if(!response.ok)throw new Error(data.error||'The description service is unavailable.');return data;
}
export function previewFromSource(source) {
  const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height;
  if(!width||!height)throw new Error('This photo could not be prepared for AI. You can still publish it and add a description later.');
  const canvas=document.createElement('canvas'),ratio=Math.min(1,1024/Math.max(width,height));
  try{
    canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f4f1eb';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.85);
  }finally{canvas.width=canvas.height=1;}
}
export async function imagePreview(blob) {
  let bitmap;
  try{bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'});}catch{}
  if(bitmap){try{return previewFromSource(bitmap);}finally{bitmap.close();}}
  // Safari can display an image even when its ImageBitmap decoder rejects it.
  const image=new Image(),url=URL.createObjectURL(blob);
  try{
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('The photo preview could not be decoded for AI. You can still publish it without a description.'));image.src=url;});
    return previewFromSource(image);
  }finally{image.removeAttribute('src');URL.revokeObjectURL(url);}
}
// Asynchronous suggestions may fill blanks, but must never replace a user's edit.
export function fillEmptyDraft(photo,before,draft) {
  const filled=[];
  for(const key of ['caption','alt'])if(!before[key]?.trim()&&!photo[key]?.trim()&&typeof draft[key]==='string'&&draft[key].trim()){photo[key]=draft[key];filled.push(key);}
  return filled;
}
