import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhotoDraft} from '../admin/photo-publish.mjs';
import {GitHub} from '../admin/core.mjs';
import {aiRequest,imagePreview,previewFromSource} from '../admin/photo-ai.mjs';
const ok=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

test('new photographs can publish with no AI description or caption',()=>{
  assert.doesNotThrow(()=>validatePhotoDraft({tray:24,slides:[{id:'new',caption:'',alt:'',hidden:false}]}));
  assert.throws(()=>validatePhotoDraft({tray:0,slides:[]}),/slides per tray/);
  assert.throws(()=>validatePhotoDraft({tray:24,slides:[{location:{lat:999,lon:0,precision:'approximate'}}]}),/latitude/);
});
test('photo publishing preserves unrelated site updates without discarding the draft',async()=>{
  const calls=[],responses=[{object:{sha:'new-code-head'}},{sha:'loaded-photos'},{tree:{sha:'new-code-tree'}},{sha:'new-photo-manifest'},{sha:'new-tree'},{sha:'published'},{}];
  const gh=new GitHub('test-token',async(url,opts)=>{calls.push({url,method:opts.method,body:opts.body&&JSON.parse(opts.body)});return ok(responses.shift());});
  assert.deepEqual(await gh.commitFiles([{path:'slides.json',content:'{}'}],'old-code-head','loaded-photos'),{head:'published',manifestSha:'new-photo-manifest'});
  assert.match(calls[1].url,/slides.json\?ref=new-code-head$/);
  assert.equal(calls[4].body.base_tree,'new-code-tree');assert.deepEqual(calls[5].body.parents,['new-code-head']);
  assert.equal(calls.at(-1).body.force,false);
});
test('a concurrent photo edit still prevents every write',async()=>{
  const calls=[];const gh=new GitHub('test-token',async(url,opts)=>{calls.push(opts.method);return ok(calls.length===1?{object:{sha:'other-head'}}:{sha:'other-photos'});});
  await assert.rejects(gh.commitFiles([{path:'slides.json',content:'{}'}],'loaded-head','loaded-photos'),/photo collection changed/);
  assert.deepEqual(calls,['GET','GET']);
});
test('AI requests use the authenticated connection once without repeating a potentially billable request',async()=>{
  let calls=0;
  await assert.rejects(aiRequest('https://auth.example','test-token','/ai/describe','data:image/jpeg;base64,AA==','',async(origin,token,path,body)=>{calls++;assert.equal(path,'/ai/describe');assert.equal(body.image,'data:image/jpeg;base64,AA==');throw new Error('Connection interrupted');}),/Connection interrupted/);
  assert.equal(calls,1);
});
test('preview generation reuses a decoded source and releases canvas memory',()=>{
  const original=globalThis.document;let dimensions;
  const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toDataURL(){dimensions=[this.width,this.height];return 'jpeg';}};
  try{globalThis.document={createElement:()=>canvas};assert.equal(previewFromSource({width:1600,height:1200}),'jpeg');assert.deepEqual(dimensions,[1024,768]);assert.deepEqual([canvas.width,canvas.height],[1,1]);}
  finally{globalThis.document=original;}
});
test('Safari image decoding can fall back to an image element without fetching a blob URL',async()=>{
  const originals={createImageBitmap:globalThis.createImageBitmap,Image:globalThis.Image,document:globalThis.document,fetch:globalThis.fetch};
  try{
    globalThis.createImageBitmap=async()=>{throw new Error('decoder unavailable');};
    globalThis.Image=class{naturalWidth=800;naturalHeight=600;set src(value){queueMicrotask(()=>this.onload());}removeAttribute(){}};
    globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'jpeg-preview'})};
    globalThis.fetch=()=>assert.fail('No fetch is needed for a local photo');
    assert.equal(await imagePreview(new Blob(['test'])),'jpeg-preview');
  }finally{Object.assign(globalThis,originals);}
});
