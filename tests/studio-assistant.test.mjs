import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {studioBridge,bridgeScript,permittedAIOrigin} from '../auth/studio-bridge.mjs';
import {studioAssistant,cleanAssistantInput} from '../auth/studio-assistant.mjs';
import {photoAI} from '../auth/photo-ai.mjs';
import {assistantContext,applyAssistantEdits} from '../admin/studio-assistant.mjs';
const env={SITE_ORIGIN:'https://inquiredu.org',OWNER_ID:'192934662',OPENAI_API_KEY:'never-expose-this'};
const ok=data=>new Response(JSON.stringify(data));
test('AI bridge embeds only in the portfolio and includes no credentials',async()=>{
  const response=studioBridge(new Request('https://auth.example/studio-bridge'),env),html=await response.text();
  assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors https:\/\/inquiredu.org/);
  assert.match(response.headers.get('Content-Security-Policy'),/connect-src 'self'/);
  assert.doesNotMatch(html,/never-expose|token|OPENAI/);
});
test('bridge ignores untrusted messages and sends authorized requests only to fixed local routes',async()=>{
  let listener;const calls=[],messages=[],parent={postMessage:(...args)=>messages.push(args)},channel='12345678-abcd-1234-abcd-123456789abc';
  const context={URL,Set,JSON,AbortSignal,location:{href:'https://auth.example/studio-bridge?channel='+channel},parent,window:{addEventListener:(type,fn)=>listener=fn},fetch:async(url,options)=>{calls.push({url,options});return ok({enabled:true});}};
  vm.runInNewContext(bridgeScript.replace('SITE_ORIGIN',JSON.stringify(env.SITE_ORIGIN)),context);
  const data={type:'studio-ai-request',channel,id:channel,token:'test_token_12345',path:'/ai/config',body:{}};
  await listener({origin:'https://evil.example',source:parent,data});
  await listener({origin:env.SITE_ORIGIN,source:parent,data:{...data,path:'https://evil.example'}});
  await listener({origin:env.SITE_ORIGIN,source:{},data});assert.equal(calls.length,0);
  await listener({origin:env.SITE_ORIGIN,source:parent,data});assert.equal(calls.length,1);assert.equal(calls[0].url,'/ai/config');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers['X-Studio-Bridge'],'1');
  assert.equal(messages.at(-1)[1],env.SITE_ORIGIN);assert.doesNotMatch(JSON.stringify(messages),/test_token/);
});
test('same-origin AI calls still require the exact service origin, marker, and authenticated owner',async()=>{
  const request=(origin,token='Bearer test_token_12345',marker='1')=>new Request('https://auth.example/ai/check',{method:'POST',headers:{Origin:origin,Authorization:token,'X-Studio-Bridge':marker,'Content-Type':'application/json'},body:JSON.stringify({probe:'x'.repeat(180000)})});
  assert.equal(permittedAIOrigin(request('https://evil.example'),env),null);assert.equal(permittedAIOrigin(request('https://auth.example','',''),env),null);
  const never=()=>assert.fail('No upstream call permitted');assert.equal((await photoAI(request('https://evil.example'),env,never)).status,403);assert.equal((await photoAI(request('https://auth.example',''),env,never)).status,401);
  let calls=0;const response=await photoAI(request('https://auth.example'),env,async()=>{calls++;return ok({id:192934662});});assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,receivedBytes:180000});assert.equal(calls,1);
});
test('assistant context excludes credentials and private place metadata',()=>{
  const input=cleanAssistantInput({kind:'videos',instruction:'Polish',context:{title:'Video',url:'https://youtube.com/watch?v=8jHnQoU3xoM',location:{lat:45,lon:-93},token:'private-token'}});
  assert.doesNotMatch(JSON.stringify(input),/private-token|location|lat/);
  assert.doesNotMatch(JSON.stringify(assistantContext('projects',{title:'Project',secret:'hidden',location:{lat:1}})),/hidden|location/);
});
test('assistant accepts only the section fields and preserves edits made while waiting',async()=>{
  let sent;const result=await studioAssistant({kind:'projects',instruction:'Make concise',context:{title:'Project',note:'A tool for learning.'}},env,async(url,options)=>{sent=JSON.parse(options.body);return ok({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'A shorter card.',suggestions:[{field:'note',value:'A learning tool.'},{field:'location',value:'hidden'},{field:'note',value:'duplicate'}],notes:''})}]}]});});
  assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.deepEqual(result.suggestions,[{field:'note',value:'A learning tool.'}]);
  const item={note:'My newer edit'};assert.equal(applyAssistantEdits(item,{note:'A tool for learning.'},result.suggestions),0);assert.equal(item.note,'My newer edit');
});
