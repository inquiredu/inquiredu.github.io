import {studioRequest} from './ai-client.mjs?v=20261115.12';
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
const button=(text,run)=>{const el=make('button',text);el.type='button';el.onclick=run;return el;};
const names={projects:'Projects',writing:'Writing',playlists:'Listening',videos:'Videos',about:'Introduction'};
const fields={projects:['title','note','subject','repo','url'],writing:['title','excerpt','body','url'],playlists:['title','note','tracks','url'],videos:['title','note','url','sourceDescription'],about:['intro']};
export function assistantContext(kind,item) {
  const result={};for(const key of fields[kind]||[]){const value=item[key];if(typeof value==='string')result[key]=value;if(key==='tracks'&&Array.isArray(value))result.tracks=value.map(t=>[t.title,t.artist].filter(Boolean).join(' — ')).join('\n');}return result;
}
export function applyAssistantEdits(item,before,edits) {
  let applied=0;for(const edit of edits){if(typeof edit.value==='string'&&Object.hasOwn(before,edit.field)&&String(item[edit.field]||'')===before[edit.field]){item[edit.field]=edit.value;applied++;}}return applied;
}
function dialog(title){const el=make('dialog','','studio-ai-dialog');el.append(button('Close ×',()=>el.close()),make('p','PRIVATE STUDIO','eyebrow'),make('h2',title));document.body.append(el);el.addEventListener('close',()=>el.remove());el.showModal();return el;}
export function openAssistant({origin,token,active,data,onApply}) {
  const modal=dialog('A second pair of eyes.'),section=make('select'),entry=make('select'),request=make('textarea'),result=make('section','','assistant-result');
  section.setAttribute('aria-label','Section to work on');entry.setAttribute('aria-label','Draft to work on');request.setAttribute('aria-label','What would you like help with?');
  for(const [key,name] of Object.entries(names))section.append(new Option(name,key));section.value=Object.hasOwn(names,active)?active:'about';
  request.placeholder='e.g. Make this introduction clearer, keep my voice, and suggest a short title.';
  const note=make('p','Only the selected draft and your request go to OpenAI. Every change stays a suggestion until you apply it. Links alone do not let the assistant watch a video or read a full article.','muted');
  let items=[];
  function choose(){items=section.value==='about'?[data.content]:section.value==='projects'?data.catalog.projects:data.content[section.value]||[];entry.replaceChildren();for(const [i,item] of items.entries())entry.append(new Option(item.title||'Site introduction',String(i)));entry.disabled=!items.length;result.replaceChildren();}
  section.onchange=choose;entry.onchange=()=>result.replaceChildren();choose();
  const run=button('Ask the studio',async()=>{
    const kind=section.value,item=items[+entry.value];if(!item){result.textContent='Add a draft in this section first.';return;}
    const context=assistantContext(kind,item);for(const key of fields[kind])if(!Object.hasOwn(context,key))context[key]='';
    const before={...context};run.disabled=true;section.disabled=entry.disabled=true;result.textContent='Thinking with your draft…';
    try{
      const draft=await studioRequest(origin,token,'/ai/assist',{kind,context,instruction:request.value.trim()||'Suggest clearer, concise wording while preserving my voice and the supplied facts.'});
      result.replaceChildren(make('p',draft.summary));
      for(const edit of draft.suggestions||[]){const card=make('div','','ai-proposal');card.append(make('small',edit.field),make('p',edit.value));const use=button('Use this suggestion',()=>{const count=applyAssistantEdits(item,before,[edit]);if(count){onApply(kind);use.disabled=true;use.textContent='Added to draft';}else{use.disabled=true;use.textContent='Your newer edit was kept';}});card.append(use);result.append(card);}
      if(draft.notes)result.append(make('p',draft.notes,'muted'));result.append(make('small','Review your draft, then Save & publish when ready.'));
    }catch(error){result.textContent=error.message;}finally{run.disabled=false;section.disabled=false;entry.disabled=!items.length;}
  });
  modal.append(note,make('label','Section'),section,make('label','Draft'),entry,make('label','What would you like help with?'),request,run,result);
}
export async function testAIConnection({origin,token,onResult}) {
  const modal=dialog('Check the AI connection.'),list=make('ol','','connection-checks');modal.append(make('p','Checks sign-in, a photo-sized upload, and a real AI response. No photos or private draft text are sent.','muted'),list);
  const checks=[['Secure studio connection',()=>studioRequest(origin,token,'/ai/config',{})],['Photo-sized upload',()=>studioRequest(origin,token,'/ai/check',{probe:'x'.repeat(180000)})],['OpenAI response',()=>studioRequest(origin,token,'/ai/assist',{kind:'check',context:{},instruction:'Check the AI connection.'})]];
  for(const [name,run] of checks){const item=make('li',name+' · checking…');list.append(item);try{const result=await run();if(name==='Secure studio connection'&&!result.enabled)throw new Error('The OpenAI key is not connected.');item.textContent=name+' · passed';item.className='passed';}catch(error){item.textContent=name+' · '+error.message;item.className='failed';onResult(false);return;}}
  modal.append(make('p','All three checks passed. The AI is ready for photos and studio drafts.','connection-success'));onResult(true);
}
