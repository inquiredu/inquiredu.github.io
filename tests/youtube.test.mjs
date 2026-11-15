import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeVideo,youtubeProfile,mergeVideos} from '../assets/youtube-source.mjs';
import {parseYouTubeFeed,fetchYouTubeFeed} from '../scripts/youtube-feed.mjs';
import {publicContent} from '../admin/core.mjs';
const channel='UCc2XXAmBtbXsdjiZY9gFOqQ',id='8jHnQoU3xoM';
const xml=`<?xml version="1.0"?><feed><yt:channelId>${channel.slice(2)}</yt:channelId><title>Sean Beaverson</title><author><uri>https://www.youtube.com/channel/${channel}</uri></author><entry><yt:channelId>${channel}</yt:channelId><yt:videoId>${id}</yt:videoId><title>Forms &amp; Maps</title><published>2019-07-30T18:25:33Z</published><media:group><media:description>A map lesson.</media:description></media:group></entry></feed>`;
test('YouTube links are canonicalized without accepting lookalike or arbitrary embed hosts',()=>{
  for(const value of [`https://youtu.be/${id}?si=test`,`https://www.youtube.com/watch?v=${id}`,`https://youtube.com/shorts/${id}`])assert.equal(youtubeVideo(value).id,id);
  for(const value of [`https://youtube.com.evil.example/watch?v=${id}`,`https://youtube.com@evil.example/watch?v=${id}`,'javascript:alert(1)','https://www.youtube.com/watch?v=invalid'])assert.equal(youtubeVideo(value),null);
  assert.equal(youtubeProfile('https://www.youtube.com/@SeanBeaverson'),'https://www.youtube.com/@SeanBeaverson');
});
test('YouTube feed identity is checked and dangerous XML is refused',()=>{
  const feed=parseYouTubeFeed(xml,channel);assert.equal(feed.entries.length,1);assert.equal(feed.entries[0].title,'Forms & Maps');assert.equal(feed.entries[0].sourceDescription,'A map lesson.');
  assert.throws(()=>parseYouTubeFeed(xml.replace(channel.slice(2),'aaaaaaaaaaaaaaaaaaaaaa'),channel),/channel/);
  assert.throws(()=>parseYouTubeFeed('<!DOCTYPE x>'+xml,channel),/Invalid/);
});
test('YouTube fetch uses only the official channel feed and refuses redirects',async()=>{
  const feed=await fetchYouTubeFeed(channel,async(url,options)=>{assert.equal(url,'https://www.youtube.com/feeds/videos.xml?channel_id='+channel);assert.equal(options.redirect,'error');return new Response(xml);});assert.equal(feed.entries[0].url,'https://www.youtube.com/watch?v='+id);
});
test('curated video notes win over the live feed and hidden channels stay hidden',()=>{
  const url='https://www.youtube.com/watch?v='+id,curated=[{url,title:'My title',published:true}],feed=[{url,title:'Feed title',published:true}];
  assert.equal(mergeVideos(curated,feed).length,1);assert.equal(mergeVideos(curated,feed)[0].title,'My title');assert.deepEqual(mergeVideos([],feed,[id]),[]);
  const projected=publicContent({videos:[{url,title:'Draft secret',sourceDescription:'Private context',published:false},{url:'https://youtube.com/watch?v=i-eYMQ7wZGE',title:'Hidden channel item',fromFeed:true,published:false}]});
  assert.deepEqual(projected.videos,[]);assert.deepEqual(projected.hiddenVideoIds,['i-eYMQ7wZGE']);assert.doesNotMatch(JSON.stringify(projected),/Draft secret|Private context|Hidden channel item|8jHnQoU3xoM/);
});
