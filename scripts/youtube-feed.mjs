import {XMLParser,XMLValidator} from './vendor/xml-parser.mjs';
import {channelId,youtubeVideo} from '../assets/youtube-source.mjs';
const plain=(value,max)=>String(typeof value==='object'?value?.['#text']||'':value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export function parseYouTubeFeed(xml,id) {
  if(!channelId(id)||Buffer.byteLength(xml)>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error('Invalid YouTube feed.');
  const data=new XMLParser({ignoreAttributes:false,processEntities:true,parseTagValue:false}).parse(xml).feed;
  if(!data||![id,id.slice(2)].includes(data['yt:channelId'])||data.author?.uri!=='https://www.youtube.com/channel/'+id)throw new Error('YouTube channel did not match.');
  const items=Array.isArray(data.entry)?data.entry:data.entry?[data.entry]:[],seen=new Set();
  const entries=items.slice(0,20).flatMap(item=>{if(item['yt:channelId']!==id)return [];const video=youtubeVideo('https://www.youtube.com/watch?v='+item['yt:videoId']),title=plain(item.title,220);if(!video||!title||seen.has(video.id))return [];seen.add(video.id);
    return [{id:'youtube-'+video.id,title,url:video.url,date:/^\d{4}-\d{2}-\d{2}/.exec(item.published||'')?.[0]||'',sourceDescription:plain(item['media:group']?.['media:description'],1600),source:'youtube',published:true}];});
  return {version:1,channelId:id,title:plain(data.title,200),entries};
}
export async function fetchYouTubeFeed(id,request=fetch) {
  if(!channelId(id))throw new Error('Invalid channel.');
  const response=await request('https://www.youtube.com/feeds/videos.xml?channel_id='+id,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/atom+xml, application/xml'}});
  if(!response.ok)throw new Error('YouTube feed is unavailable.');
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2*1024*1024){await reader.cancel();throw new Error('YouTube feed too large.');}chunks.push(value);}
  return parseYouTubeFeed(Buffer.concat(chunks).toString('utf8'),id);
}
export async function syncYouTube({read,write}) {
  const content=JSON.parse((await read('content.json')).text),id=content.sources?.youtubeChannelId;if(!channelId(id))return false;
  const next=JSON.stringify(await fetchYouTubeFeed(id),null,2)+'\n';let old;
  try{old=await read('feeds/youtube.json');}catch(error){if(error.status!==404)throw error;}
  if(old?.text===next)return false;await write('feeds/youtube.json',next,old?.sha,'Refresh the YouTube television lineup');return true;
}
