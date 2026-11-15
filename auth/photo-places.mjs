// Coordinates come from a public gazetteer, never from a model's invented pin.
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
export function placeClue(raw) {
  if(!raw||raw.confidence!=='high'||!['landmark','city'].includes(raw.kind))return null;
  const label=clean(raw.label,120),title=clean(raw.wikipediaTitle,160),evidence=clean(raw.evidence,280);
  if(!label||!title||!evidence||/[|#<>]/.test(title))return null;
  return {label,title,evidence,kind:raw.kind};
}
export async function resolvePlace(raw,transport=fetch) {
  const clue=placeClue(raw);if(!clue)return null;
  const url=new URL('https://en.wikipedia.org/w/api.php');
  url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',redirects:'1',prop:'coordinates|pageprops',ppprop:'disambiguation',coprimary:'primary',colimit:'1',titles:clue.title}).toString();
  const response=await transport(url.href,{headers:{'User-Agent':'InquireduStudio/1.0 (https://inquiredu.org; owner-reviewed photo places)','Accept':'application/json'},signal:AbortSignal.timeout(10000),cf:{cacheTtl:86400,cacheEverything:true}});
  if(!response.ok)return null;
  const page=(await response.json())?.query?.pages?.[0],point=page?.coordinates?.[0];
  if(!page||page.missing||page.pageprops?.disambiguation!==undefined||!point||point.globe!=='earth'||!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.abs(point.lat)>90||Math.abs(point.lon)>180)return null;
  return {label:clue.label,lat:Number(point.lat.toFixed(1)),lon:Number(point.lon.toFixed(1)),precision:'approximate',evidence:clue.evidence,sourceTitle:clean(page.title,160),sourceUrl:'https://en.wikipedia.org/wiki/'+encodeURIComponent(page.title.replaceAll(' ','_')),kind:clue.kind};
}
