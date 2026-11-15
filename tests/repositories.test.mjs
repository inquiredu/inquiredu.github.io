import test from 'node:test';
import assert from 'node:assert/strict';
import {repoKey,normalizeRepo,mergeRepos,matchingProject,projectFromRepo,publicRepos,loadRepos} from '../admin/repositories.mjs';
import {publicProjects} from '../admin/core.mjs';

test('repository identities reject another owner and normalize saved short names',()=>{
  assert.equal(repoKey('inquiredu/Hello-World'),'hello-world');assert.equal(repoKey('HELLO-world'),'hello-world');
  assert.equal(repoKey('other/Hello-World'),'');assert.equal(repoKey('../x'),'');
  assert.equal(normalizeRepo({name:'test',owner:{login:'other'}}),null);
});
test('fresh repositories merge with private saved entries without duplicates',()=>{
  const repos=mergeRepos([{name:'private-work',private:true},{name:'Test',description:'old',private:true}],[{name:'test',private:false,description:'fresh'}]);
  assert.equal(repos.length,2);assert.equal(repos.find(x=>x.key==='private-work').private,true);assert.equal(repos.find(x=>x.key==='test').description,'fresh');assert.equal(repos.find(x=>x.key==='test').private,false);
  const existing={id:'custom-id',repo:'inquiredu/TEST',note:'Keep my edits',visible:false};assert.equal(matchingProject([existing],repos.find(x=>x.key==='test')),existing);
});
test('a repo fills a hidden draft without publishing private details',()=>{
  const repo=normalizeRepo({name:'quiet-project',private:true,description:'A private draft',homepage:'javascript:alert(1)',topics:['shelf','education']});
  const card=projectFromRepo(repo);assert.equal(card.visible,false);assert.equal(card.url,'');assert.equal(card.title,'Quiet Project');assert.equal(card.subject,'Education');
  assert.deepEqual(publicProjects({projects:[card]}).projects,[]);
  const publicCard=projectFromRepo(normalizeRepo({name:'open-project',private:false,homepage:'https://example.com/'}));assert.equal(publicCard.url,'https://example.com/');assert.equal(publicCard.group,'live');
});
test('public repositories are paginated without sending the editor token',async()=>{
  const calls=[];
  const repos=await publicRepos(async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?Array.from({length:100},(_,i)=>({name:'repo-'+i})):[{name:'last-repo'}]);});
  assert.equal(repos.length,101);assert.match(calls[1].url,/page=2$/);assert.equal(calls[0].options.headers.Authorization,undefined);
});
test('the picker retains saved private repos and edited cards if live GitHub is unavailable',async()=>{
  const result=await loadRepos({github:{read:async()=>({data:{checked:'2026-11-15',repos:[{name:'private-work',private:true}]}}),api:async()=>{throw Error('offline');}},projects:[{repo:'saved-card',note:'Existing'}],request:async()=>new Response('',{status:403})});
  assert.equal(result.live,false);assert.equal(result.checked,'2026-11-15');assert.deepEqual(result.repos.map(x=>x.name),['private-work','saved-card']);
});
test('a missing saved index still loads public and permitted private repositories',async()=>{
  const result=await loadRepos({github:{read:async()=>null,api:async()=>[{name:'private-work',private:true,owner:{login:'inquiredu'}}]},request:async()=>Response.json([{name:'public-work',private:false}])});
  assert.equal(result.repos.length,2);assert.equal(result.live,true);assert.equal(result.checked,'');
});
