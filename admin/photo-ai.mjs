export const cleanContext=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,300):'';
export function photoContexts(slides) {
  return Object.fromEntries(slides.filter(photo=>typeof photo.id==='string'&&cleanContext(photo.aiContext)).map(photo=>[photo.id,cleanContext(photo.aiContext)]));
}
export async function aiRequest(origin,token,path,image,context='') {
  const response=await fetch(new URL(path,origin),{method:image?'POST':'GET',credentials:'omit',cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(image?{'Content-Type':'application/json'}:{})},...(image?{body:JSON.stringify({image,...(cleanContext(context)?{context:cleanContext(context)}:{})})}:{}),signal:AbortSignal.timeout(image?55000:12000)});
  let data;try{data=await response.json();}catch{throw new Error('The description service is not connected yet.');}
  if(!response.ok)throw new Error(data.error||'The description service is unavailable.');return data;
}
export async function imagePreview(blob) {
  const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'});
  try{
    const canvas=document.createElement('canvas'),ratio=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f4f1eb';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.85);
  }finally{bitmap.close();}
}
// Asynchronous suggestions may fill blanks, but must never replace a user's edit.
export function fillEmptyDraft(photo,before,draft) {
  const filled=[];
  for(const key of ['caption','alt'])if(!before[key]?.trim()&&!photo[key]?.trim()&&typeof draft[key]==='string'&&draft[key].trim()){photo[key]=draft[key];filled.push(key);}
  return filled;
}
