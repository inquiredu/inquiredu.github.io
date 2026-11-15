import {musicSource,publicSources} from './creative-sources.mjs';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
const safeLink=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
function link(text,url){const a=el('a',text);a.href=safeLink(url);a.target='_blank';a.rel='noopener';return a;}
function renderWriting(items,source) {
  const container=document.getElementById('writingItems');container.replaceChildren();
  for(const [index,item] of items.entries()) {
    const article=el('article','','reading-entry');article.id=`note-${item.id}`;
    article.append(el('span',String(index+1).padStart(2,'0'),'reading-number'));
    const body=el('div');body.append(el('p',[item.date,item.source==='medium'?'On Medium':'Field note'].filter(Boolean).join(' / '),'entry-meta'),el('h3',item.title));
    if(item.excerpt)body.append(el('p',item.excerpt,'reading-excerpt'));
    if(item.body){const details=el('details');details.append(el('summary','Read the note'),el('p',item.body));body.append(details);}
    if(safeLink(item.url))body.append(link(item.source==='medium'?'Read on Medium ↗':'Read the piece ↗',item.url));article.append(body);container.append(article);
  }
  if(source)container.append(link('All writing on Medium ↗',source));
}
export function renderPlaylists(items,sources={}) {
  const container=document.getElementById('listeningItems');container.replaceChildren();
  const deck=el('div','','listening-deck'),header=el('div','','deck-heading');header.append(el('span','STEREO / PERSONAL SELECTIONS'),el('span','33 · 45 · ∞'));deck.append(header);
  const body=el('div','','listening-body'),selections=el('div','','listening-selections');selections.setAttribute('role','group');selections.setAttribute('aria-label','Listening selections');
  const panel=el('div','','listening-panel');let current;
  function choose(item,index){current=item.id;for(const button of selections.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.id===item.id));panel.replaceChildren();const source=musicSource(item.url);
    const tape=el('div','','cassette');tape.setAttribute('aria-hidden','true');const band=el('div',source?source.provider.toUpperCase():'A SONG LIST','cassette-label');const spools=el('div','','cassette-window');spools.append(el('i','','spool'),el('span',String(index+1).padStart(2,'0')),el('i','','spool'));tape.append(band,spools,el('div','SIDE A / SELECTION '+String(index+1).padStart(2,'0'),'cassette-foot'));panel.append(tape,el('h3',item.title));
    if(item.note)panel.append(el('p',item.note,'listening-note'));
    const player=el('div','','source-player');player.hidden=true;
    if(source){const open=el('button','Open '+source.provider+' player','listen-button');open.type='button';open.setAttribute('aria-expanded','false');open.onclick=()=>{const show=player.hidden;player.hidden=!show;open.setAttribute('aria-expanded',String(show));open.textContent=show?'Close player':'Open '+source.provider+' player';player.replaceChildren();if(show){const iframe=el('iframe');iframe.src=source.embed;iframe.title=`${item.title} — ${source.provider} player`;iframe.height=String(source.height);iframe.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';iframe.loading='lazy';iframe.setAttribute('allowfullscreen','');player.append(iframe);}};panel.append(open,player,link('Open in '+source.provider+' ↗',source.url));}
    else if(safeLink(item.url))panel.append(link('Listen elsewhere ↗',item.url));
    if(item.tracks?.length){const list=el('ol','','tracks');for(const track of item.tracks){const row=el('li'),text=[track.title,track.artist].filter(Boolean).join(' — ');row.append(safeLink(track.url)?link(text,track.url):document.createTextNode(text));list.append(row);}panel.append(list);}
  }
  items.forEach((item,index)=>{const button=el('button','','listening-selection');button.type='button';button.dataset.id=item.id;const source=musicSource(item.url);button.append(el('span',String(index+1).padStart(2,'0'),'selection-number'));const text=el('span');text.append(el('strong',item.title),el('small',source?.provider||'Song list'));button.append(text,el('span','↗','selection-arrow'));button.onclick=()=>choose(item,index);selections.append(button);});
  body.append(selections,panel);deck.append(body);const footer=el('div','','deck-footer');footer.append(el('span','Selected here. Kept alive at the source.'));for(const [key,label] of [['spotify','Spotify'],['soundcloud','SoundCloud']])if(sources[key])footer.append(link(label+' ↗',sources[key]));deck.append(footer);container.append(deck);if(items.length)choose(items[0],0);
}
export async function mountCollection(content,{loadFeed=true}={}) {
  if(content.intro)document.getElementById('siteIntro').textContent=content.intro;
  const sources=publicSources(content.sources),local=(content.writing||[]).filter(x=>x.published===true);let writing=[...local];
  if(loadFeed&&sources.medium){try{const response=await fetch('feeds/medium.json',{cache:'no-cache'});if(response.ok){const feed=await response.json();if(feed.source===sources.medium){const known=new Set(local.map(x=>safeLink(x.url)));writing.push(...(feed.entries||[]).filter(x=>x.published===true&&!known.has(safeLink(x.url))));}}}catch{}}
  writing.sort((a,b)=>(b.date||'').localeCompare(a.date||''));renderWriting(writing,sources.medium);
  const playlists=(content.playlists||[]).filter(x=>x.published===true);renderPlaylists(playlists,sources);
  for(const [section,count] of [['writing',writing.length||sources.medium],['listening',playlists.length]]){document.getElementById(section).hidden=!count;document.getElementById(`${section}Nav`).hidden=!count;}
}
if(document.getElementById('siteIntro'))try{const response=await fetch('content.json',{cache:'no-cache'});if(response.ok)await mountCollection(await response.json());}catch{}
