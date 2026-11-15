import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshMedium} from '../scripts/refresh-medium.mjs';
const repository='inquiredu/inquiredu.github.io',token='test-workflow-token';
test('a changed feed writes with its loaded SHA, then explicitly rebuilds Pages',async()=>{
  const calls=[];
  const request=async(url,init)=>{calls.push({url,...init});return Response.json(init.method==='GET'?{sha:'loaded-sha',content:Buffer.from('old feed').toString('base64')}:{status:'queued'});};
  await refreshMedium({repository,token,request,sync:async({read,write})=>{const old=await read('feeds/medium.json');assert.equal(old.text,'old feed');await write('feeds/medium.json','new feed',old.sha,'Refresh');return true;}});
  assert.equal(JSON.parse(calls[1].body).sha,'loaded-sha');
  assert.equal(Buffer.from(JSON.parse(calls[1].body).content,'base64').toString(),'new feed');
  assert.equal(calls[2].url,'https://api.github.com/repos/'+repository+'/pages/builds');
  assert.equal(calls[2].method,'POST');
  assert.ok(calls.every(c=>c.url.startsWith('https://api.github.com/repos/'+repository+'/')));
});
test('a concurrent feed edit fails without requesting a build',async()=>{
  const calls=[];
  await assert.rejects(refreshMedium({repository,token,request:async(url)=>{calls.push(url);return new Response('',{status:409});},sync:async({write})=>{await write('feeds/medium.json','new','stale','Refresh');return true;}}),/409/);
  assert.equal(calls.length,1);
});
test('unchanged scheduled feeds do nothing; a manual run tests the Pages build path',async()=>{
  const calls=[],request=async(url)=>{calls.push(url);return Response.json({status:'queued'});},sync=async()=>false;
  await refreshMedium({repository,token,request,sync});assert.equal(calls.length,0);
  await refreshMedium({repository,token,request,sync,event:'workflow_dispatch'});assert.equal(calls.length,1);
});
