import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePlace,placeClue} from '../auth/photo-places.mjs';
import {needsPlace,safeSuggestion,reviewPhotos,applyPlaceSuggestion} from '../admin/photo-places.mjs';
import {publicSlides} from '../assets/photo-notes.mjs';
const clue={label:'Mississippi River · Minneapolis',wikipediaTitle:'Minneapolis',evidence:'The photographer confirmed Minneapolis and the Mississippi River.',kind:'city',confidence:'high'};
const response=point=>new Response(JSON.stringify({query:{pages:[{title:'Minneapolis',coordinates:[point]}]}}));
const suggestion={label:'Minneapolis',lat:44.985,lon:-93.266,precision:'exact',evidence:'Confirmed city',sourceTitle:'Minneapolis',sourceUrl:'https://en.wikipedia.org/wiki/Minneapolis',kind:'city'};
test('a confirmed public place is resolved through a fixed Wikipedia endpoint and rounded before returning',async()=>{
 let request;const result=await resolvePlace(clue,async(url,options)=>{request={url:new URL(url),options};return response({lat:44.983333,lon:-93.266667,globe:'earth'});});
 assert.equal(request.url.origin,'https://en.wikipedia.org');assert.equal(request.url.searchParams.get('titles'),'Minneapolis');assert.match(request.options.headers['User-Agent'],/inquiredu.org/);
 assert.deepEqual(result,{label:clue.label,lat:45,lon:-93.3,precision:'approximate',evidence:clue.evidence,sourceTitle:'Minneapolis',sourceUrl:'https://en.wikipedia.org/wiki/Minneapolis',kind:'city'});
});
test('uncertain or broad places never become invented model coordinates',async()=>{
 for(const invalid of [null,{...clue,confidence:'low'},{...clue,kind:'river'},{...clue,wikipediaTitle:'One|Two'},{...clue,evidence:''}])assert.equal(await resolvePlace(invalid,()=>assert.fail('No lookup allowed')),null);
 for(const point of [{lat:NaN,lon:1,globe:'earth'},{lat:500,lon:1,globe:'earth'},{lat:1,lon:1,globe:'moon'}])assert.equal(await resolvePlace(clue,async()=>response(point)),null);
 assert.equal(await resolvePlace(clue,async()=>new Response('{}',{status:429})),null);
 assert.equal(await resolvePlace(clue,async()=>new Response(JSON.stringify({query:{pages:[{title:'X',pageprops:{disambiguation:''},coordinates:[{lat:1,lon:2,globe:'earth'}]}]}}))),null);
});
test('review requires explicit acceptance and cannot overwrite any existing location or expose private points',()=>{
 const photo={id:'river',caption:'My words',alt:'My description'},review={place:suggestion,status:'suggested'};
 const preview=reviewPhotos([photo],{river:review});assert.equal(photo.location,undefined);assert.equal(preview[0].location.lat,45);
 assert.equal(publicSlides({slides:[photo]}).slides[0].location,undefined);
 assert.equal(applyPlaceSuggestion(photo,review),true);assert.equal(photo.caption,'My words');assert.equal(photo.location.precision,'approximate');assert.equal(photo.location.lon,-93.3);
 for(const precision of ['exact','approximate','hidden']){const old={id:'old',location:{lat:12.3456,lon:23.4567,precision}};const before=structuredClone(old);assert.equal(needsPlace(old),false);assert.equal(applyPlaceSuggestion(old,review),false);assert.deepEqual(old,before);}
 assert.equal(applyPlaceSuggestion({id:'hidden',hidden:true},review),false);
 assert.equal(applyPlaceSuggestion({id:'x'},{...review,status:'dismissed'}),false);
 assert.equal(safeSuggestion({...suggestion,sourceUrl:'https://evil.example/place'}),null);
});
