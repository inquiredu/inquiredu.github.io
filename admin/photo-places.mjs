import {safeLocation,publicLocation} from '../assets/photo-notes.mjs';
export function safeSuggestion(raw) {
  const location=publicLocation({...raw,precision:'approximate'});
  if(!location||typeof raw?.evidence!=='string'||!raw.evidence.trim())return null;
  let source;try{source=new URL(raw.sourceUrl);}catch{return null;}
  if(source.origin!=='https://en.wikipedia.org'||!source.pathname.startsWith('/wiki/'))return null;
  return {...location,evidence:raw.evidence.slice(0,280),sourceTitle:String(raw.sourceTitle||'Place reference').slice(0,160),sourceUrl:source.href,kind:raw.kind==='city'?'city':'landmark'};
}
export function needsPlace(photo) {return !photo.hidden&&!safeLocation(photo.location);}
export function reviewPhotos(photos,reviews) {
  return photos.filter(p=>!p.hidden).map(p=>({...p,location:safeLocation(p.location)||(!['dismissed','published'].includes(reviews[p.id]?.status)?safeSuggestion(reviews[p.id]?.place):null)}));
}
export function applyPlaceSuggestion(photo,review) {
  const suggestion=safeSuggestion(review?.place);
  // Existing exact, approximate and explicitly private locations are never replaced.
  if(!suggestion||!needsPlace(photo)||review.status==='dismissed')return false;
  photo.location={lat:suggestion.lat,lon:suggestion.lon,label:suggestion.label,precision:'approximate'};
  return true;
}
