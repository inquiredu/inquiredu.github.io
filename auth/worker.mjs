import { photoAI } from './photo-ai.mjs';
import {studioBridge} from './studio-bridge.mjs';
/* Owner-only studio backend. No database, refresh tokens, or token logging. */
const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const text = new TextEncoder();
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const COOKIE = '__Host-collection-state';
const cookie = value => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${value?600:0}`;
const headers = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
async function key(secret) {return crypto.subtle.importKey('raw',text.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function sign(payload, secret) {
  const data=encode(text.encode(JSON.stringify(payload)));
  return data+'.'+encode(await crypto.subtle.sign('HMAC',await key(secret),text.encode(data)));
}
async function verify(value,secret) {
  try {
    const [data,signature]=value.split('.');
    if(!await crypto.subtle.verify('HMAC',await key(secret),decode(signature),text.encode(data)))return null;
    const payload=JSON.parse(new TextDecoder().decode(decode(data)));
    if(!Number.isFinite(payload.expires)||payload.expires<Date.now())return null;
    return payload;
  }catch{return null;}
}
function failure(message,status=400) {
  return new Response(message+' Close this window and try signing in again.',{status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8','Set-Cookie':cookie('')}});
}
export default {
  async fetch(request,env) {
    if(request.method==='GET'&&['/studio-bridge','/studio-bridge.js'].includes(new URL(request.url).pathname))return studioBridge(request,env);
    if(new URL(request.url).pathname.startsWith('/ai/'))return photoAI(request,env);
    if(request.method!=='GET')return failure('Method not allowed.',405);
    const url=new URL(request.url);
    if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||!env.SITE_ORIGIN||!env.OWNER_ID)return failure('Sign-in has not been configured.',503);
    let origin;
    try {origin=new URL(env.SITE_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.SITE_ORIGIN)throw new Error();}catch{return failure('Invalid site origin.',503);}
    const callback=url.origin+'/callback';
    if(url.pathname==='/login') {
      const channel=url.searchParams.get('channel');if(!channel||!/^[-a-zA-Z0-9]{20,80}$/.test(channel))return failure('Invalid sign-in request.');
      const state=random(),verifier=random();
      const destination=new URL('https://github.com/login/oauth/authorize');
      destination.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:callback,state,code_challenge:encode(await crypto.subtle.digest('SHA-256',text.encode(verifier))),code_challenge_method:'S256',allow_signup:'false',login:'inquiredu'}).toString();
      const signed=await sign({state,verifier,channel,expires:Date.now()+600000},env.GITHUB_CLIENT_SECRET);
      return new Response(null,{status:302,headers:{...headers,Location:destination.href,'Set-Cookie':cookie(signed)}});
    }
    if(url.pathname!=='/callback')return failure('Not found.',404);
    const saved=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    const session=saved?await verify(saved,env.GITHUB_CLIENT_SECRET):null;
    if(!session||session.state!==url.searchParams.get('state')||!url.searchParams.get('code'))return failure('The sign-in request expired or could not be verified.');
    try {
      const exchange=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:callback,code_verifier:session.verifier})});
      if(!exchange.ok)return failure('GitHub could not complete sign-in.',502);
      const result=await exchange.json();if(!result.access_token)return failure('GitHub did not authorize this sign-in.',403);
      const profile=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${result.access_token}`,Accept:'application/vnd.github+json','User-Agent':'inquiredu-studio','X-GitHub-Api-Version':'2022-11-28'}});
      if(!profile.ok||(await profile.json()).id!==Number(env.OWNER_ID))return failure('This editor is only available to its owner.',403);
      const nonce=random();
      const payload=JSON.stringify({type:'collection-auth',channel:session.channel,token:result.access_token}).replace(/</g,'\\u003c');
      const html=`<!doctype html><meta charset="utf-8"><title>Signed in</title><p>Signed in. You can return to the studio.</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(origin.origin)});window.close();}</script>`;
      return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Set-Cookie':cookie(''),'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,'Cross-Origin-Opener-Policy':'unsafe-none'}});
    }catch{return failure('Sign-in is temporarily unavailable.',502);}
  }
};
