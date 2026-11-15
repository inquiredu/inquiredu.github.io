import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse as parseExif} from '../assets/vendor/exifr-7.1.3.mjs';
import {LOCATION_TAGS,locationFromExif,safeLocation,publicLocation,publicSlides,publicMapPhotos} from '../assets/photo-notes.mjs';
import {projectLocations} from '../assets/geo-art.mjs';
import {musicSource,mediumSource,importLink,publicSources} from '../assets/creative-sources.mjs';
import {parseMediumFeed,fetchMediumFeed,syncMedium} from '../scripts/medium-feed.mjs';

test('an original JPEG supplies a location independently of public camera metadata',async()=>{
  const t=Buffer.alloc(200);t.write('II');t.writeUInt16LE(42,2);t.writeUInt32LE(8,4);t.writeUInt16LE(1,8);
  const entry=(offset,tag,type,count,value)=>{t.writeUInt16LE(tag,offset);t.writeUInt16LE(type,offset+2);t.writeUInt32LE(count,offset+4);t.writeUInt32LE(value,offset+8);};
  entry(10,34853,4,1,40);t.writeUInt16LE(4,40);entry(42,1,2,2,78);entry(54,2,5,3,120);entry(66,3,2,2,87);entry(78,4,5,3,144);
  [45,7,30,93,16,15].forEach((value,index)=>{t.writeUInt32LE(value,120+index*8);t.writeUInt32LE(1,124+index*8);});
  const exif=Buffer.concat([Buffer.from('Exif\0\0'),t]),marker=Buffer.alloc(4);marker[0]=255;marker[1]=225;marker.writeUInt16BE(exif.length+2,2);
  const base=readFileSync(new URL('../assets/slides/2026-11-d94835eb49.jpg',import.meta.url));
  const raw=await parseExif(Buffer.concat([base.subarray(0,2),marker,exif,base.subarray(2)]),{pick:LOCATION_TAGS,gps:true});
  const place=locationFromExif(raw);assert.equal(place.lat,45.125);assert.ok(Math.abs(place.lon-(-93.27083333333333))<1e-8);assert.equal(place.precision,'hidden');
});
test('approximation removes precise coordinates before the public projection',()=>{
  const location={lat:45.123456,lon:-93.234567,label:'A shared area',precision:'approximate',serial:'secret'};
  const result=publicSlides({version:1,privateNote:'secret',slides:[{id:'a',location,metadata:{GPSLatitude:45.123456,serial:'secret'}},{id:'b',location:{...location,precision:'hidden'}},{id:'c',hidden:true,location:{...location,precision:'exact'}}]});
  assert.deepEqual(result.slides[0].location,{lat:45.1,lon:-93.2,label:'A shared area',precision:'approximate'});
  assert.equal(result.slides[1].location,undefined);assert.equal(result.slides[2].location,undefined);assert.doesNotMatch(JSON.stringify(result),/123456|234567|GPS|serial|secret/);
  assert.equal(publicMapPhotos(result).length,1);
});
test('locations accept zero coordinates, reject missing and out-of-range values, and require opt-in',()=>{
  assert.deepEqual(publicLocation({lat:0,lon:0,precision:'exact'}),{lat:0,lon:0,label:'',precision:'exact'});
  for(const raw of [null,{}, {lat:'',lon:1},{lat:91,lon:1},{lat:1,lon:181},{lat:NaN,lon:1}])assert.equal(safeLocation(raw),null);
  assert.equal(publicLocation({lat:12,lon:30}),null);
});
test('the artwork keeps dateline neighbors together and retains repeated locations',()=>{
  const photos=[179,-179,178].map((lon,index)=>({id:index,location:{lat:20,lon}}));
  const projected=projectLocations(photos,1000,600);assert.ok(Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x))<700);
  const same=projectLocations([photos[0],photos[0]],1000,600);assert.equal(same.length,2);assert.equal(same[0].x,same[1].x);assert.equal(same[0].y,same[1].y);
});
test('music links become known official players without exposing private SoundCloud links',()=>{
  const spotify=musicSource('https://open.spotify.com/playlist/6DB4Qf8vrDgM62TjmymEua?si=tracking');assert.equal(spotify.provider,'Spotify');assert.ok(!spotify.url.includes('?'));assert.match(spotify.embed,/^https:\/\/open.spotify.com\/embed\/playlist\//);
  assert.equal(musicSource('https://soundcloud.com/sean-beaverson').provider,'SoundCloud');
  for(const url of ['javascript:alert(1)','https://open.spotify.com.evil.test/playlist/6DB4Qf8vrDgM62TjmymEua','https://soundcloud.com/user/track/s-secret','https://soundcloud.com/user/track?secret_token=s-hidden','https://evil@soundcloud.com/user/track','https://open.spotify.com/user/smbeaverson'])assert.equal(musicSource(url),null);
  assert.equal(importLink(spotify.url).item.published,false);
});
test('source connections are restricted to the expected public providers',()=>{
  assert.equal(mediumSource('https://medium.com/@smbeaverson').feed,'https://medium.com/feed/@smbeaverson');
  assert.equal(mediumSource('https://smbeaverson.medium.com').feed,'https://smbeaverson.medium.com/feed');
  for(const url of ['http://medium.com/@user','https://medium.com.evil.test/@user','https://medium.com/@user/story','https://localhost/feed','https://user@medium.com/@user'])assert.equal(mediumSource(url),null);
  assert.deepEqual(publicSources({medium:'https://medium.com/@smbeaverson',secret:'hidden',spotify:'https://open.spotify.com/user/smbeaverson'}),{medium:'https://medium.com/@smbeaverson',spotify:'https://open.spotify.com/user/smbeaverson'});
});
const rss=`<?xml version="1.0"?><rss><channel><title>Example</title><item><title><![CDATA[A &amp; B]]></title><link>https://medium.com/@example/a-story-abcdef123456?source=rss</link><pubDate>Sat, 24 Oct 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Hello <strong>world</strong>.</p><script>private()</script>]]></description></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>`;
test('Medium cards use sanitized plain text, valid public links, and short excerpts',()=>{
  const feed=parseMediumFeed(rss,'https://medium.com/@example');assert.equal(feed.entries.length,1);assert.equal(feed.entries[0].title,'A & B');assert.equal(feed.entries[0].date,'2026-10-24');assert.equal(feed.entries[0].url,'https://medium.com/@example/a-story-abcdef123456');assert.doesNotMatch(feed.entries[0].excerpt,/<|private/);
  assert.throws(()=>parseMediumFeed('<!DOCTYPE rss [<!ENTITY steal SYSTEM "file:///etc/passwd">]>'+rss,'https://medium.com/@example'),/Unsupported/);
});
test('feed downloads cannot follow a redirect outside Medium',async()=>{
  let calls=0;await assert.rejects(fetchMediumFeed('https://medium.com/@example',async()=>{calls++;return new Response('',{status:302,headers:{location:'https://localhost/private'}});}),/destination/);assert.equal(calls,1);
});
test('a disconnected Medium source causes no feed writes',async()=>{
  await syncMedium({read:async()=>({text:'{}'}),write:async()=>{throw Error('unexpected write');}});
});
