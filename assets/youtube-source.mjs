export const channelId=value=>typeof value==='string'&&/^UC[\w-]{22}$/.test(value)?value:null;
export function youtubeProfile(value) {
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['youtube.com','www.youtube.com'].includes(u.hostname))return null;
    if(/^\/@[A-Za-z0-9_.-]{3,100}\/?$/.test(u.pathname)||/^\/channel\/UC[\w-]{22}\/?$/.test(u.pathname))return 'https://www.youtube.com'+u.pathname.replace(/\/$/,'');
  }catch{}return null;
}
export function youtubeVideo(value) {
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;let id;
    if(u.hostname==='youtu.be')id=u.pathname.slice(1);
    else if(['www.youtube.com','youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):/^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/.exec(u.pathname)?.[1];
    if(!/^[\w-]{11}$/.test(id||''))return null;
    return {id,url:'https://www.youtube.com/watch?v='+id,thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',embed:'https://www.youtube-nocookie.com/embed/'+id};
  }catch{}return null;
}
export function mergeVideos(curated=[],feed=[],hidden=[]) {
  const seen=new Set(hidden),out=[];
  for(const item of [...curated.filter(x=>x.published===true),...feed]){const video=youtubeVideo(item.url);if(!video||seen.has(video.id))continue;seen.add(video.id);out.push({...item,url:video.url,videoId:video.id});}
  return out;
}
