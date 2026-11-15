import {safeLocation} from '../assets/photo-notes.mjs';

export function validatePhotoDraft(photos) {
  if(!Number.isInteger(+photos.tray)||+photos.tray<1||+photos.tray>80)throw new Error('Choose between 1 and 80 slides per tray.');
  for(const photo of photos.slides){
    if(photo.location?.precision!=='hidden'&&photo.location&&!safeLocation(photo.location))throw new Error('Enter valid latitude and longitude, or keep that location private.');
  }
  // Captions and image descriptions are editable enrichment, never an upload gate.
}
