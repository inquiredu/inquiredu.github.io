import {mountTapeDeck} from './tape-deck.mjs?v=20261115.18';
import {musicSource,publicSources} from './creative-sources.mjs?v=20261115.14';
import {mountTubeTV} from './tube-tv.mjs?v=20261115.16';
import {mergeVideos} from './youtube-source.mjs?v=20261115.14';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
const safeLink=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
function link(text,url){const a=el('a',text);a.href=safeLink(url);a.target='_blank';a.rel='noopener';return a;}
function renderWriting(items,source) {
  const container=document.getElementById('writingItems');container.replaceChildren();
  const heading=document.getElementById('writingHeading');heading.querySelector('.all-writing')?.remove();
  if(source){const all=link('All writing on Medium ↗',source);all.className='all-writing';heading.append(all);}
  for(const [index,item] of items.entries()){
    const article=el('article','','index-note');article.id=`note-${item.id}`;
    const body=safeLink(item.url)&&!item.body?link('',item.url):el('div');body.className='index-note-body';
    const header=el('div','','note-card-top');header.append(el('span','No. '+String(index+1).padStart(2,'0')),el('span',item.date||'Field note'));body.append(header,el('h3',item.title));
    if(item.excerpt)body.append(el('p',item.excerpt,'note-card-excerpt'));
    if(item.body){const details=el('details');details.append(el('summary','Read the note'),el('p',item.body,'note-full'));body.append(details);}
    if(safeLink(item.url))body.append(item.body?link('Read the piece ↗',item.url):el('span',item.source==='medium'?'Read on Medium ↗':'Read the piece ↗','note-card-link'));
    article.append(body);container.append(article);
  }
}
export function renderPlaylists(items,sources={}) {mountTapeDeck(document.getElementById('listeningItems'),items,sources);}
export async function mountCollection(content,{loadFeed=true}={}) {
  if(content.intro)document.getElementById('siteIntro').textContent=content.intro;
  const sources=publicSources(content.sources),local=(content.writing||[]).filter(x=>x.published===true);let writing=[...local];
  if(loadFeed&&sources.medium){try{const response=await fetch('feeds/medium.json',{cache:'no-cache'});if(response.ok){const feed=await response.json();if(feed.source===sources.medium){const known=new Set(local.map(x=>safeLink(x.url)));writing.push(...(feed.entries||[]).filter(x=>x.published===true&&!known.has(safeLink(x.url))));}}}catch{}}
  writing.sort((a,b)=>(b.date||'').localeCompare(a.date||''));renderWriting(writing,sources.medium);
  const playlists=(content.playlists||[]).filter(x=>x.published===true);renderPlaylists(playlists,sources);
  const videos=mergeVideos(content.videos);mountTubeTV(document.getElementById('videoItems'),videos,sources.youtube);
  for(const [section,count] of [['writing',writing.length||sources.medium],['listening',playlists.length],['videos',videos.length]]){document.getElementById(section).hidden=!count;document.getElementById(`${section}Nav`).hidden=!count;}
}
if(document.getElementById('siteIntro'))try{const response=await fetch('content.json',{cache:'no-cache'});if(response.ok)await mountCollection(await response.json());}catch{}
