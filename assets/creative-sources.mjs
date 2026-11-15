const clean = value => typeof value === 'string' ? value.trim() : '';
export function musicSource(value) {
  try {
    const u = new URL(clean(value));
    if(u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const path = u.pathname.replace(/\/$/,'');
    if(u.hostname === 'open.spotify.com') {
      const match = /^\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]{22})$/.exec(path);
      if(!match)return null;
      const [,kind,id]=match;
      return {provider:'Spotify',kind,url:`https://open.spotify.com/${kind}/${id}`,embed:`https://open.spotify.com/embed/${kind}/${id}?theme=0`,height:['track','episode'].includes(kind)?152:352};
    }
    if(['soundcloud.com','www.soundcloud.com'].includes(u.hostname)) {
      if([...u.searchParams.keys()].some(key=>/secret|token/i.test(key)) || /\/s-[a-zA-Z0-9]+(?:\/|$)/.test(path))return null;
      if(!/^\/[a-zA-Z0-9_-]+(?:\/(?:sets\/)?[a-zA-Z0-9_-]+)?$/.test(path))return null;
      const url='https://soundcloud.com'+path;
      return {provider:'SoundCloud',kind:path.includes('/sets/')?'playlist':'selection',url,embed:'https://w.soundcloud.com/player/?'+new URLSearchParams({url,auto_play:'false',hide_related:'true',show_comments:'false',show_user:'true',show_reposts:'false',visual:'false',color:'#b58c61'}),height:300};
    }
  } catch {}
  return null;
}
export function mediumSource(value) {
  try {
    const u=new URL(clean(value));
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    if(u.hostname==='medium.com') {
      const path=u.pathname.replace(/^\/feed(?=\/|$)/,'').replace(/\/$/,'');
      if(!/^\/(?:@[a-zA-Z0-9_.-]+|[a-zA-Z0-9_-]+)$/.test(path))return null;
      return {url:'https://medium.com'+path,feed:'https://medium.com/feed'+path};
    }
    if(/^[a-zA-Z0-9-]+\.medium\.com$/.test(u.hostname)&&['','/','/feed','/feed/'].includes(u.pathname))return {url:u.origin,feed:u.origin+'/feed'};
  }catch{}
  return null;
}
export function isMediumStory(value) {
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='medium.com'||/^[a-zA-Z0-9-]+\.medium\.com$/.test(u.hostname))&&/-[a-f0-9]{8,}$/.test(u.pathname);}catch{return false;}
}
export function publicSources(value={}) {
  const medium=mediumSource(value?.medium);
  const out=medium?{medium:medium.url}:{};
  try{const u=new URL(value?.spotify);if(u.protocol==='https:'&&u.hostname==='open.spotify.com'&&!u.username&&!u.password&&!u.port&&/^\/user\/[a-zA-Z0-9_.-]+\/?$/.test(u.pathname))out.spotify=u.origin+u.pathname.replace(/\/$/,'');}catch{}
  const sc=musicSource(value?.soundcloud);if(sc?.provider==='SoundCloud')out.soundcloud=sc.url;
  return out;
}
export function importLink(value, title='') {
  const music=musicSource(value);
  if(music)return {section:'playlists',item:{title:clean(title)||`A selection from ${music.provider}`,url:music.url,note:'',tracks:[],source:music.provider.toLowerCase(),published:false}};
  if(isMediumStory(value)) {const u=new URL(value);u.search='';u.hash='';return {section:'writing',item:{title:clean(title)||'A piece from Medium',url:u.href,excerpt:'',body:'',source:'medium',published:false}};}
  throw new Error('Use a public Spotify selection, a public SoundCloud link, or a Medium story. Short links should be opened and their full address copied.');
}
