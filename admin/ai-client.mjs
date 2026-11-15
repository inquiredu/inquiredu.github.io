const clients=new Map();
const paths=new Set(['/ai/config','/ai/describe','/ai/assist','/ai/check']);
function connection(origin) {
  const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw new Error('The AI service address is invalid.');
  if(clients.has(origin))return clients.get(origin);
  const frame=document.createElement('iframe'),channel=crypto.randomUUID(),pending=new Map();
  frame.hidden=true;frame.title='Private studio AI connection';frame.src=origin+'/studio-bridge?channel='+channel;
  let readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const timer=setTimeout(()=>{clients.delete(origin);window.removeEventListener('message',receive);frame.remove();readyReject(new Error('The secure AI connection could not open. Check that this browser can reach the studio service, then run Test AI connection.'));},15000);
  function receive(event) {
    if(event.origin!==origin||event.source!==frame.contentWindow||event.data?.channel!==channel)return;
    if(event.data.type==='studio-ai-ready'){clearTimeout(timer);readyResolve();return;}
    if(event.data.type!=='studio-ai-result')return;
    const item=pending.get(event.data.id);if(!item)return;
    pending.delete(event.data.id);clearTimeout(item.timer);
    if(event.data.ok)item.resolve(event.data.body);else{const error=new Error(event.data.body?.error||'The AI service could not complete this request.');error.code=event.data.body?.code;error.status=event.data.status;item.reject(error);}
  }
  window.addEventListener('message',receive);document.body.append(frame);
  const client={async request(token,path,body){
    await ready;const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('The AI response timed out. Your draft is unchanged; test the connection before retrying.'));},80000);
      pending.set(id,{resolve,reject,timer});frame.contentWindow.postMessage({type:'studio-ai-request',channel,id,path,token,body},origin);
    });
  }};
  clients.set(origin,client);return client;
}
export async function studioRequest(origin,token,path,body={}) {
  if(!paths.has(path))throw new Error('Unsupported studio AI request.');
  return connection(origin).request(token,path,body);
}
