import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../auth/worker.mjs';
import {publicContent,publicProjects,GitHub,base64,fromBase64} from '../admin/core.mjs';
const env={GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret-never-used-in-production',SITE_ORIGIN:'https://inquiredu.org',OWNER_ID:'192934662'};
const ok=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

test('public projections exclude unpublished work and private bookkeeping',()=>{
  const out=publicContent({intro:'Hi',privateNote:'secret',writing:[{id:'draft',title:'Private thought',body:'Secret',published:false},{id:'live',title:'A public note',body:'Hello',published:true,url:'javascript:alert(1)',internal:'secret'}],playlists:[{title:'Private mix',published:false},{title:'Public mix',published:true,tracks:[{title:'Track',artist:'Artist',url:'https://example.com/song',privateNote:'secret'}]}]});
  assert.equal(out.writing.length,1);assert.equal(out.playlists.length,1);assert.equal(out.writing[0].url,'');assert.equal(out.playlists[0].tracks[0].url,'https://example.com/song');
  assert.doesNotMatch(JSON.stringify(out),/secret|Private|draft|internal/);
  const projects=publicProjects({ignored:['secret'],projects:[{id:'hidden',title:'Secret',visible:false},{id:'public',title:'Public',visible:true,tagged:true,privateNote:'secret',url:'javascript:bad()'}]});
  assert.equal(projects.projects.length,1);assert.doesNotMatch(JSON.stringify(projects),/hidden|secret|tagged|javascript/);
});
test('Unicode and long writing survives GitHub encoding',()=>{const text='🎵 café — 日本語\n'.repeat(12000);assert.equal(fromBase64(base64(text)),text);});
test('a stale photo baseline is refused before creating any objects',async()=>{
  const calls=[];const gh=new GitHub('test-token',async(url,options)=>{calls.push(options.method);return ok({object:{sha:'new-head'}});});
  await assert.rejects(gh.commitFiles([{path:'slides.json',content:'{}'}],'old-head'),/changed/);assert.deepEqual(calls,['GET']);
});
test('photo batch moves the branch once, only after all blobs and a tree exist',async()=>{
  const calls=[];const responses=[{object:{sha:'old'}},{tree:{sha:'base'}},{sha:'image'},{sha:'manifest'},{sha:'tree'},{sha:'commit'},{object:{sha:'commit'}}];
  const gh=new GitHub('test-token',async(url,opts)=>{calls.push({url,method:opts.method,body:opts.body&&JSON.parse(opts.body)});return ok(responses.shift());});
  assert.equal(await gh.commitFiles([{path:'assets/slides/a.jpg',content:'AA==',encoding:'base64'},{path:'slides.json',content:'{}'}],'old'),'commit');
  assert.equal(calls.filter(c=>c.method==='PATCH').length,1);assert.deepEqual(calls.at(-1).body,{sha:'commit',force:false});assert.deepEqual(calls[5].body.parents,['old']);assert.equal(calls[4].body.tree.length,2);
});
test('failed blob upload never updates the live branch',async()=>{
  const calls=[];const responses=[ok({object:{sha:'old'}}),ok({tree:{sha:'base'}}),new Response('',{status:403})];
  const gh=new GitHub('test-token',async(url,opts)=>{calls.push(opts.method);return responses.shift();});
  await assert.rejects(gh.commitFiles([{path:'x',content:'x'}],'old'),/refused/);assert.ok(!calls.includes('PATCH'));
});
test('a GitHub write carries the loaded file SHA and propagates conflicts',async()=>{
  let body;const gh=new GitHub('test-token',async(url,opts)=>{body=JSON.parse(opts.body);return new Response('',{status:409});});
  await assert.rejects(gh.write('site-catalog','content.json',{},'loaded-sha','Save'),/changed/);assert.equal(body.sha,'loaded-sha');
});
test('editor rejects another GitHub user before reading private repositories',async()=>{
  let calls=0;const gh=new GitHub('test-token',async()=>{calls++;return ok({id:123});});await assert.rejects(gh.verify(),/belongs/);assert.equal(calls,1);
});
async function login(){const result=await worker.fetch(new Request('https://auth.example/login?channel=12345678-abcd-1234-abcd-123456789abc'),env);return {result,cookie:result.headers.get('set-cookie').split(';')[0],destination:new URL(result.headers.get('location'))};}
test('OAuth issues secure state and PKCE, without broad OAuth scopes',async()=>{
  const {result,destination}=await login();assert.equal(result.status,302);assert.equal(destination.origin,'https://github.com');assert.equal(destination.searchParams.get('code_challenge_method'),'S256');assert.equal(destination.searchParams.get('code_challenge').length,43);assert.equal(destination.searchParams.get('scope'),null);
  assert.match(result.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
});
test('OAuth rejects missing or tampered state before token exchange',async()=>{
  const {cookie,destination}=await login();const state=destination.searchParams.get('state');
  for(const [query,c] of [['bad',cookie],[state,cookie+'tampered'],[state,'']]){
    const response=await worker.fetch(new Request(`https://auth.example/callback?state=${query}&code=code`,{headers:{Cookie:c}}),env);assert.equal(response.status,400);
  }
});
test('OAuth rejects an expired state',async()=>{
  const {cookie,destination}=await login();const now=Date.now;Date.now=()=>now()+700000;
  try{const r=await worker.fetch(new Request(`https://auth.example/callback?state=${destination.searchParams.get('state')}&code=code`,{headers:{Cookie:cookie}}),env);assert.equal(r.status,400);}finally{Date.now=now;}
});
test('OAuth returns a token only to the configured site and correct owner',async()=>{
  const {cookie,destination}=await login();const req=new Request(`https://auth.example/callback?state=${destination.searchParams.get('state')}&code=code`,{headers:{Cookie:cookie}});
  const original=globalThis.fetch;let calls=[];
  try{
    globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return ok(url.includes('access_token')?{access_token:'fake-test-token'}:{id:192934662});};
    const result=await worker.fetch(req,env);assert.equal(result.status,200);const html=await result.text();assert.match(html,/https:\/\/inquiredu.org/);assert.match(html,/collection-auth/);assert.match(result.headers.get('content-security-policy'),/nonce-/);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);assert.ok(JSON.parse(calls[0].opts.body).code_verifier);
    globalThis.fetch=async url=>ok(url.includes('access_token')?{access_token:'fake-test-token'}:{id:0});
    const denied=await worker.fetch(req,env);assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/fake-test-token/);
  }finally{globalThis.fetch=original;}
});
