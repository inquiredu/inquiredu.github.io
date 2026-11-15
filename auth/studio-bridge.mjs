const routes=['/ai/config','/ai/describe','/ai/assist','/ai/check'];
export const bridgeScript=`'use strict';
const parentOrigin=SITE_ORIGIN;
const channel=new URL(location.href).searchParams.get('channel');
const routes=${JSON.stringify(routes)};
const active=new Set();
window.addEventListener('message',async event=>{
  const data=event.data;
  if(event.origin!==parentOrigin||event.source!==parent||!data||data.type!=='studio-ai-request'||data.channel!==channel||!/^[-a-zA-Z0-9]{20,80}$/.test(data.id||''))return;
  if(!routes.includes(data.path)||typeof data.token!=='string'||!/^[-a-zA-Z0-9_]{10,255}$/.test(data.token)||active.has(data.id)||active.size>=4)return;
  active.add(data.id);let result;
  try{
    const response=await fetch(data.path,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Authorization':'Bearer '+data.token,'Content-Type':'application/json','X-Studio-Bridge':'1'},body:JSON.stringify(data.body||{}),signal:AbortSignal.timeout(70000)});
    let body;try{body=await response.json();}catch{body={error:'The AI service returned an unreadable response.',code:'service-response'};}
    result={ok:response.ok,status:response.status,body};
  }catch(error){result={ok:false,status:0,body:{error:error.name==='TimeoutError'?'The AI service timed out. Try the connection test, then retry.':'The AI service connection was interrupted. Run Test AI connection to check the service.',code:'bridge-network'}};}
  finally{active.delete(data.id);}
  parent.postMessage({type:'studio-ai-result',channel,id:data.id,...result},parentOrigin);
});
if(parent!==window&&/^[-a-zA-Z0-9]{20,80}$/.test(channel||''))parent.postMessage({type:'studio-ai-ready',channel},parentOrigin);
`;
export function studioBridge(request,env) {
  const site=env.SITE_ORIGIN;
  if(!site||new URL(site).origin!==site||!site.startsWith('https://'))return new Response('Studio unavailable',{status:503});
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors ${site}; base-uri 'none'; form-action 'none'`};
  if(new URL(request.url).pathname==='/studio-bridge.js')return new Response(bridgeScript.replace('SITE_ORIGIN',JSON.stringify(site)),{headers:{...headers,'Content-Type':'text/javascript; charset=utf-8'}});
  return new Response('<!doctype html><meta charset="utf-8"><title>Studio AI connection</title><script src="/studio-bridge.js" defer></script>',{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}

export function permittedAIOrigin(request,env) {
  const origin=request.headers.get('Origin');
  if(origin===env.SITE_ORIGIN&&origin)return origin;
  // The embedded service frame makes authenticated requests to its own origin.
  // It accepts messages only from the exact portfolio origin and parent window.
  if(origin===new URL(request.url).origin&&request.headers.get('X-Studio-Bridge')==='1')return origin;
  return null;
}
