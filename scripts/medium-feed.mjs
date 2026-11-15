import {XMLParser,XMLValidator} from './vendor/xml-parser.mjs';
import {mediumSource} from '../assets/creative-sources.mjs';
const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='medium.com'||/^[a-zA-Z0-9-]+\.medium\.com$/.test(u.hostname));}catch{return false;}};
function plain(value,max=280){
  if(typeof value==='object')value=value?.['#text']||'';
  return String(value||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const value=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return value>0&&value<=0x10ffff?String.fromCodePoint(value):'';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[k])).replace(/\s+/g,' ').trim().slice(0,max);
}
export function parseMediumFeed(xml,profile) {
  const source=mediumSource(profile);if(!source)throw Error('Invalid Medium profile');
  if(Buffer.byteLength(xml)>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Unsupported feed');
  if(XMLValidator.validate(xml)!==true)throw Error('Invalid feed XML');
  const data=new XMLParser({ignoreAttributes:false,processEntities:false,parseTagValue:false,ignoreDeclaration:true}).parse(xml),channel=data.rss?.channel;
  if(!channel||!channel.title)throw Error('Not an RSS feed');
  const items=Array.isArray(channel.item)?channel.item:channel.item?[channel.item]:[],seen=new Set();
  const entries=items.slice(0,30).flatMap(item=>{
    const title=plain(item.title,220),href=plain(item.link,2048);if(!title||!allowed(href))return [];
    const url=new URL(href);url.search='';url.hash='';if(seen.has(url.href))return [];seen.add(url.href);
    const parsed=new Date(item.pubDate),date=Number.isNaN(parsed.valueOf())?'':parsed.toISOString().slice(0,10);
    let excerpt=plain(item.description||item['content:encoded'],10000);if(excerpt.startsWith(title))excerpt=excerpt.slice(title.length).trim();if(excerpt.length>260)excerpt=excerpt.slice(0,260).replace(/\s+\S*$/,'')+'…';
    return [{id:'medium-'+url.pathname.split('/').pop(),title,url:url.href,date,excerpt,source:'medium',published:true}];
  }).slice(0,10);
  return {version:1,source:source.url,title:plain(channel.title,220),entries};
}
export async function fetchMediumFeed(profile,request=fetch) {
  const source=mediumSource(profile);if(!source)throw Error('Invalid Medium profile');let url=source.feed;
  for(let i=0;i<4;i++){
    if(!allowed(url))throw Error('Unsupported feed destination');
    const res=await request(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'application/rss+xml, application/xml, text/xml','User-Agent':'inquiredu-portfolio-feed/1.0 (+https://inquiredu.org)'}});
    if([301,302,303,307,308].includes(res.status)){url=new URL(res.headers.get('location'),url).href;continue;}
    if(!res.ok)throw Error('Medium feed unavailable');
    const reader=res.body.getReader(),chunks=[];let total=0;
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>2*1024*1024){await reader.cancel();throw Error('Feed too large');}chunks.push(value);}
    return parseMediumFeed(Buffer.concat(chunks).toString('utf8'),source.url);
  }
  throw Error('Too many feed redirects');
}
export async function syncMedium({read,write,dry=false}) {
  const config=JSON.parse((await read('content.json')).text),profile=config.sources?.medium;
  if(!mediumSource(profile))return;
  const feed=await fetchMediumFeed(profile);let old=null;
  try{old=await read('feeds/medium.json');}catch(error){if(error.status!==404)throw error;}
  const text=JSON.stringify(feed,null,2)+'\n';
  if(old?.text===text){console.log('Medium shelf: unchanged.');return;}
  if(!dry)await write('feeds/medium.json',text,old?.sha,'Refresh the Medium writing shelf');
  console.log(`Medium shelf: ${feed.entries.length} public stories${dry?' (dry run)':''}.`);
}
