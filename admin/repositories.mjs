import {OWNER, PRIVATE, safeURL} from './core.mjs?v=20261115.2';

export function repoKey(value) {
  if(typeof value!=='string')return '';
  const parts=value.trim().split('/');
  if(parts.length>2||parts.length===2&&parts[0].toLowerCase()!==OWNER)return '';
  const name=parts.at(-1);
  return /^[a-zA-Z0-9_.-]+$/.test(name)&&!['.','..'].includes(name)?name.toLowerCase():'';
}
export function normalizeRepo(raw) {
  if(!raw||raw.owner?.login&&raw.owner.login.toLowerCase()!==OWNER)return null;
  const key=repoKey(raw.full_name||raw.name);if(!key)return null;
  const name=(raw.full_name||raw.name).split('/').at(-1);
  return {key,name,private:typeof raw.private==='boolean'?raw.private:null,description:String(raw.description||'').slice(0,2000),homepage:safeURL(raw.homepage),has_pages:raw.has_pages===true,archived:raw.archived===true,topics:Array.isArray(raw.topics)?raw.topics.filter(t=>typeof t==='string'):[],updated:raw.pushed_at||raw.updated_at||'',html_url:`https://github.com/${OWNER}/${name}`};
}
export function mergeRepos(...lists) {
  const result=new Map();for(const list of lists)for(const raw of list||[]){const repo=normalizeRepo(raw);if(repo)result.set(repo.key,repo);}
  return [...result.values()].sort((a,b)=>a.archived-b.archived||a.name.localeCompare(b.name));
}
export function matchingProject(projects,repo) {
  return projects.find(p=>repoKey(p.repo)===repo.key);
}
const prettify=value=>value.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).replace(/\bAi\b/g,'AI');
export function projectFromRepo(repo) {
  const title=prettify(repo.name),url=repo.homepage||(repo.has_pages?`https://inquiredu.org/${repo.name===OWNER+'.github.io'?'':repo.name+'/'}`:repo.private===false?repo.html_url:'');
  return {id:repo.key,repo:repo.name,title,url,note:repo.description,subject:repo.topics.filter(t=>!['shelf','github-pages'].includes(t)&&!t.startsWith('status-')).slice(0,3).map(prettify).join(' · '),visible:false,group:repo.homepage||repo.has_pages?'live':repo.private===false?'source':'workshop',status:repo.homepage||repo.has_pages?'Live':'In progress',call:'000 '+(title.replace(/^(the|a|an)\s+/i,'').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase()||'NEW')};
}
export async function publicRepos(request=(...args)=>fetch(...args)) {
  const all=[];
  for(let page=1;page<=100;page++){
    const response=await request(`https://api.github.com/users/${OWNER}/repos?type=owner&sort=updated&per_page=100&page=${page}`,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('The public repository list could not refresh.');
    const list=await response.json();if(!Array.isArray(list))throw Error('Invalid repository list.');
    all.push(...list);if(list.length<100)return all;
  }
  throw Error('Too many repositories to load in one visit.');
}
async function accessibleRepos(github) {
  const all=[];for(let page=1;page<=100;page++){
    const list=await github.api(`/user/repos?affiliation=owner&sort=updated&per_page=100&page=${page}`);
    if(!Array.isArray(list))throw Error('Invalid repository list.');
    all.push(...list);if(list.length<100)return all;
  }
  throw Error('Too many repositories to load in one visit.');
}
export async function loadRepos({github,projects=[],request,demo=false}) {
  const fallback=projects.filter(p=>repoKey(p.repo)).map(p=>({name:p.repo,description:p.note,homepage:p.url}));
  const [saved,accessible,live]=await Promise.allSettled([demo?Promise.resolve(null):github.read(PRIVATE,'repos.json',true),demo?Promise.resolve([]):accessibleRepos(github),publicRepos(request)]);
  const index=saved.status==='fulfilled'?saved.value?.data:null;
  const repos=mergeRepos(fallback,index?.repos,accessible.status==='fulfilled'?accessible.value:[],live.status==='fulfilled'?live.value:[]);
  return {repos,checked:index?.checked||'',live:live.status==='fulfilled',saved:saved.status==='fulfilled',accessible:accessible.status==='fulfilled'};
}

export function repositoryPicker({github,projects,onChoose,onManual,demo=false}) {
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
  const dialog=make('dialog','','repo-picker');dialog.setAttribute('aria-labelledby','repoPickerTitle');
  const header=make('div','','repo-picker-head'),heading=make('div');heading.append(make('p','FROM YOUR GITHUB','eyebrow'),make('h2','Choose a repository.'));heading.querySelector('h2').id='repoPickerTitle';
  const close=make('button','Close ×');close.type='button';close.onclick=()=>dialog.close();header.append(heading,close);
  const tools=make('div','','repo-picker-tools'),label=make('label','Find a repository'),search=make('input');search.type='search';search.placeholder='Search names or descriptions';search.autofocus=true;label.append(search);
  const filterLabel=make('label','Show'),filter=make('select');for(const [value,text] of [['all','All repositories'],['new','Not on the shelf'],['added','Already on the shelf']])filter.append(new Option(text,value));filterLabel.append(filter);
  const refresh=make('button','Refresh list');refresh.type='button';tools.append(label,filterLabel,refresh);
  const message=make('p','Loading your repositories…','muted');message.setAttribute('role','status');
  const count=make('p','','muted'),list=make('div','','repo-picker-list');list.setAttribute('aria-label','Repositories');
  const foot=make('div','','repo-picker-footer'),manual=make('button','Add without a repository');manual.type='button';manual.onclick=()=>{dialog.close();onManual();};foot.append(make('p','Choosing a repository creates a hidden draft for you to review.','muted'),manual);
  dialog.append(header,tools,message,count,list,foot);document.body.append(dialog);let repos=[],closed=false;
  function render(){
    const query=search.value.trim().toLowerCase(),items=repos.filter(repo=>{const existing=matchingProject(projects,repo);return (!query||[repo.name,repo.description].join(' ').toLowerCase().includes(query))&&(filter.value==='all'||filter.value==='added'&&existing||filter.value==='new'&&!existing);});
    count.textContent=`${items.length} of ${repos.length} repositories`;list.replaceChildren();
    for(const repo of items){const existing=matchingProject(projects,repo),row=make('article','','repo-choice'),text=make('div');text.append(make('h3',repo.name));if(repo.description)text.append(make('p',repo.description,'repo-description'));
      text.append(make('p',[repo.private===true?'Private':repo.private===false?'Public':'Saved project',repo.archived?'Archived':'',existing?(existing.visible===false?'On shelf · hidden':'On shelf · public'):'Not on shelf'].filter(Boolean).join(' · '),'repo-meta'));
      const choose=make('button',existing?'Edit project':'Use repository');choose.type='button';choose.setAttribute('aria-label',`${existing?'Edit project':'Use repository'} ${repo.name}`);choose.onclick=()=>{dialog.close();onChoose(repo,existing);};row.append(text,choose);list.append(row);
    }
    if(!items.length)list.append(make('p',repos.length?'No repositories match. Try another search.':'No repositories available yet. Refresh the list or add a project manually.','muted'));
  }
  async function load(){refresh.disabled=true;message.textContent='Loading your repositories…';
    try{const result=await loadRepos({github,projects,demo});if(closed)return;repos=result.repos;
      message.textContent=result.live?'Public repositories refreshed from GitHub.':'GitHub could not refresh public repositories; showing available saved entries.';
      if(result.checked)message.textContent+=` Private repositories also come from your saved index (${result.checked.slice(0,10)}).`;
      else if(!demo)message.textContent+=' Private repositories are limited to those this sign-in can access.';
      if(!result.saved&&!demo)message.textContent+=' The saved private index could not load.';render();
    }catch{if(!closed){message.textContent='The repository list could not load. Try refreshing or add a project manually.';}}
    finally{refresh.disabled=false;}
  }
  search.oninput=render;filter.onchange=render;refresh.onclick=load;
  dialog.addEventListener('close',()=>{closed=true;dialog.remove();});dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.showModal();load();return dialog;
}
