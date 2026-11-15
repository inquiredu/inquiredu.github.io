import {syncYouTube} from './youtube-feed.mjs';
import {syncMedium} from './medium-feed.mjs';
import {pathToFileURL} from 'node:url';

async function syncFeeds(options){let changed=false;for(const [name,sync] of [['Medium',syncMedium],['YouTube',syncYouTube]]){try{changed=(await sync(options))||changed;}catch(error){console.error(name+' refresh failed; its previous feed is kept. '+error.message);}}return changed;}
export async function refreshMedium({token,repository,request=fetch,event='',sync=syncFeeds}) {
  if(!token||!/^[-\w.]+\/[-\w.]+$/.test(repository||''))throw Error('Missing workflow configuration');
  const prefix=`https://api.github.com/repos/${repository}`;
  async function api(path,method='GET',body) {
    const response=await request(prefix+path,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if(!response.ok){const error=Error(`GitHub request failed (${response.status})`);error.status=response.status;throw error;}
    return response.json();
  }
  const changed=await sync({
    read:async path=>{const file=await api('/contents/'+path);return {sha:file.sha,text:Buffer.from(file.content,'base64').toString('utf8')};},
    write:async(path,text,sha,message)=>api('/contents/'+path,'PUT',{message,content:Buffer.from(text).toString('base64'),...(sha?{sha}:{})})
  });
  // GITHUB_TOKEN commits do not trigger Pages automatically. Request the build explicitly.
  if(changed||event==='workflow_dispatch') {await api('/pages/builds','POST');console.log('GitHub Pages refresh requested.');}
  return changed;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{await refreshMedium({token:process.env.GITHUB_TOKEN,repository:process.env.GITHUB_REPOSITORY,event:process.env.GITHUB_EVENT_NAME});}
  catch(error){console.error('Medium refresh failed. The last published shelf is unchanged. '+error.message);process.exitCode=1;}
}
