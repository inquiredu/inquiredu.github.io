import { parse as parseExif } from '../assets/vendor/exifr-7.1.3.mjs';
import { EXIF_TAGS, LOCATION_TAGS, metadataFromExif, metadataRows, publicSlides, locationFromExif, safeLocation } from '../assets/photo-notes.mjs?v=20261115.2';
import { importLink, musicSource, mediumSource, publicSources } from '../assets/creative-sources.mjs';
import { repositoryPicker, projectFromRepo } from './repositories.mjs?v=20261115.3';
import { aiRequest, imagePreview, fillEmptyDraft, cleanContext, photoContexts } from './photo-ai.mjs?v=20261115.6';
import { GitHub, SITE, PRIVATE, publicProjects, publicContent, json, safeURL } from './core.mjs?v=20261115.2';
const $ = id => document.getElementById(id);
const make = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
let github, config, popup, channel, catalog, content, photos, privateLocations={}, revisions = {}, active = 'inbox', busy = false, sharedLinkHandled=false;
let dirty = new Set(), pending = new Map(), objectURLs = [], demo = new URLSearchParams(location.search).get('preview') === '1';
let expandedProject;
let aiReady=false, autoDescribe=true, aiMessage='Checking the description service…';
const aiStates=new Map(), aiViews=new Map();
const group = () => ['inbox','writing','playlists','about'].includes(active) ? 'content' : active;
const status = message => { $('status').textContent = message; };
function changed() { dirty.add(group()); updateButton(); }
function updateButton() { $('publish').disabled = demo || busy || !dirty.has(group()); $('publish').textContent = busy ? 'Working…' : 'Save & publish this section'; $('reload').disabled=busy; $('signout').disabled=busy; }
function button(text, action, disabled = false) { const b = make('button', text); b.type = 'button'; b.disabled = disabled; b.onclick = action; return b; }
function field(parent, label, obj, key, type = 'text', wide = false) {
  const wrap = make('label', label, wide ? 'wide' : '');
  const input = make(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.value = obj[key] ?? ''; input.addEventListener('input', () => { obj[key] = input.value; changed(); });
  wrap.append(input); parent.append(wrap); return input;
}
function check(parent, label, obj, key, invert = false) {
  const wrap = make('label', '', 'check'); const input = make('input'); input.type = 'checkbox';
  input.checked = invert ? obj[key] !== true : obj[key] === true;
  input.onchange = () => { obj[key] = invert ? !input.checked : input.checked; changed(); };
  wrap.append(input, document.createTextNode(label)); parent.append(wrap);
}
function select(parent, label, obj, key, choices) {
  const wrap = make('label', label); const input = make('select');
  for (const [value, text] of choices) { const option = make('option', text); option.value = value; input.append(option); }
  input.value = obj[key]; input.onchange = () => { obj[key] = input.value; changed(); };
  wrap.append(input); parent.append(wrap);
}
function reorder(parent, items, index) {
  const actions = make('div', '', 'actions');
  const move = delta => { [items[index], items[index + delta]] = [items[index + delta], items[index]]; changed(); render(); };
  actions.append(button('↑ Move up', () => move(-1), index === 0), button('↓ Move down', () => move(1), index === items.length - 1));
  parent.append(actions); return actions;
}
function renderProjects() {
  function openProject(project,message){expandedProject=project.id;render();const card=[...$('items').querySelectorAll('details')].find(n=>n.dataset.projectId===project.id);card?.querySelector('input')?.focus();status(message);}
  const manual=()=>{const project={id:crypto.randomUUID(),title:'Untitled project',visible:false,group:'workshop',status:'In progress',call:'000 NEW',note:''};catalog.projects.unshift(project);changed();openProject(project,'New hidden draft. Fill in the details, then choose whether to show it.');};
  $('toolbar').append(make('p', 'Choose what goes on the shelf. Hidden projects stay in your private catalog.'), button('Add a project', () => repositoryPicker({github,projects:catalog.projects,demo,onManual:manual,onChoose:(repo,existing)=>{
    if(existing){openProject(existing,'This repository is already in your collection. Your existing details are preserved.');return;}
    const project=projectFromRepo(repo);if(catalog.projects.some(p=>p.id===project.id))project.id=crypto.randomUUID();catalog.projects.unshift(project);changed();
    openProject(project,'Repository details added as a hidden draft. Review the title, link, and description before publishing.');
  }})));
  catalog.projects.forEach((project, index) => {
    const card = make('details', '', 'item');card.dataset.projectId=project.id;card.open=project.id===expandedProject; card.append(make('summary', `${project.visible === false ? 'Hidden · ' : ''}${project.title}`));
    const fields = make('div', '', 'fields');
    field(fields, 'Title', project, 'title'); field(fields, 'Link', project, 'url', 'url');
    field(fields, 'Description', project, 'note', 'textarea', true); field(fields, 'Subjects', project, 'subject'); field(fields, 'Call number', project, 'call');
    field(fields, 'Status', project, 'status'); select(fields, 'Shelf', project, 'group', [['live','Live'],['source','Open source'],['workshop','Workshop']]);
    const visibility = {hidden:project.visible === false};
    const label = make('label', '', 'check'); const visible = make('input'); visible.type='checkbox'; visible.checked=!visibility.hidden;
    visible.onchange = () => { project.visible=visible.checked; changed(); }; label.append(visible, document.createTextNode('Show on the public page')); fields.append(label);
    check(fields, 'Featured project', project, 'featured');
    card.append(fields); reorder(card, catalog.projects, index); $('items').append(card);
  });
}
async function checkAI() {
  aiReady=false;
  try{aiReady=!demo&&(await aiRequest(config.authOrigin,github.token,'/ai/config')).enabled;aiMessage=aiReady?'AI can name recognizable public landmarks. A preview and any place name you add go to OpenAI; GPS and camera metadata stay private. Review names before publishing.':demo?'AI is available in the signed-in studio once connected.':'AI needs its one-time OpenAI connection. Uploads and manual descriptions still work.';}
  catch{aiMessage='The description service is unavailable. Uploads and manual descriptions still work.';}
}
function photoAIControls(photo,box,caption,alt) {
  const refresh=()=>{
    box.replaceChildren();const state=aiStates.get(photo.id);
    const action=button(state?.loading?'Finding the words…':'Suggest description',()=>suggestPhoto(photo),!aiReady||busy||state?.loading);
    box.append(action);
    if(state?.message)box.append(make('p',state.message,'muted'));
    if(state?.draft){
      const proposal=make('div','','ai-proposal');proposal.append(make('small','AI draft · review before using'),make('p',state.draft.caption),make('p',state.draft.alt));
      const apply=keys=>{for(const key of keys)photo[key]=state.draft[key];caption.value=photo.caption;alt.value=photo.alt;dirty.add('photos');updateButton();state.draft=null;state.message='Draft applied. Make it your own before publishing.';refresh();};
      const actions=make('div','','actions');actions.append(button('Use both',()=>apply(['caption','alt']),busy),button('Use description only',()=>apply(['alt']),busy),button('Dismiss',()=>{state.draft=null;refresh();},busy));proposal.append(actions);box.append(proposal);
    }
  };
  aiViews.set(photo.id,()=>{caption.value=photo.caption||'';alt.value=photo.alt||'';refresh();});refresh();
}
async function suggestPhoto(photo,{automatic=false,blob}={}) {
  if(!aiReady||(!automatic&&busy))return false;
  if(!automatic){busy=true;updateButton();}
  const before={caption:photo.caption,alt:photo.alt};
  const state={loading:true};aiStates.set(photo.id,state);aiViews.get(photo.id)?.();
  try {
    if(!blob){const response=await fetch(pending.get(photo.id)?.preview||new URL(`../${photo.src}`,location.href));if(!response.ok)throw new Error('The image preview could not be read.');blob=await response.blob();}
    const draft=await aiRequest(config.authOrigin,github.token,'/ai/describe',await imagePreview(blob),photo.aiContext);
    if(!photos.slides.includes(photo))return false;
    const filled=fillEmptyDraft(photo,before,draft);if(filled.length)dirty.add('photos');
    state.message=filled.length===2?'AI draft added. Edit either field before publishing.':'Your words are preserved. Review this suggestion below.';
    if(filled.length<2)state.draft=draft;
    return true;
  }catch(error){state.message=error.name==='TimeoutError'?'This took too long. Try again, or write your own description.':error.message;return false;}
  finally{state.loading=false;if(!automatic)busy=false;updateButton();for(const refresh of aiViews.values())refresh();}
}
function renderPhotos() {
  aiViews.clear();
  $('toolbar').append(make('p', 'A light table for your photographs. Add a batch, arrange the tray, and give each image a little context.'));
  const drop = make('div', '', 'drop'),input=make('input'),originals=make('input');
  input.type=originals.type='file';input.accept='image/*';originals.accept='.jpg,.jpeg,.png,.webp,.heic,.heif';input.multiple=originals.multiple=true;input.hidden=originals.hidden=true;
  input.setAttribute('aria-label','Choose photos from your library');originals.setAttribute('aria-label','Choose original image files');
  input.onchange=()=>importPhotos(input.files);originals.onchange=()=>importPhotos(originals.files);
  const choices=make('div','','photo-import-actions');choices.append(button('Choose photos',()=>input.click()),button('Choose original files',()=>originals.click()));
  drop.append(make('h2','Bring a few favorites.'),make('p','Choose from your device, or drop photographs here.','muted'),choices,input,originals,make('small','On iPhone or iPad, choose Photo Library. On a Mac, look for Photos in the file chooser’s sidebar if your browser offers it.'));
  const help=make('details','','photo-import-help');help.append(make('summary','Apple Photos & locations'));
  help.append(make('p','For the heatmap, originals are the most reliable choice. In Photos on your Mac, select your favorites, then File → Export → Export Unmodified Original. Add the exported images with Choose original files.'));
  help.append(make('p','You can also drag photos from the Photos app when your browser supports it. Library selections may omit location data; the import summary tells you what arrived. If HEIC cannot be read, export a JPEG with location information.'));
  help.append(make('p','Exact coordinates stay in your private catalog. Public locations default to approximate areas; review each photograph before publishing.'));drop.append(help);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover'); }; drop.ondragleave = () => drop.classList.remove('dragover');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); importPhotos(e.dataTransfer.files); }; $('toolbar').append(drop);
  const assistant=make('div','','photo-assistant'),label=make('label','','check'),toggle=make('input');toggle.type='checkbox';toggle.checked=autoDescribe;toggle.disabled=!aiReady||busy;toggle.onchange=()=>{autoDescribe=toggle.checked;};label.append(toggle,document.createTextNode('Draft captions & descriptions when I add photos'));assistant.append(make('p','A little help finding the words.','assistant-title'),label,make('small',aiMessage));
  if(!aiReady&&!demo)assistant.append(button('Check connection',async()=>{if(busy)return;busy=true;updateButton();await checkAI();busy=false;render();}));
  $('toolbar').append(assistant);
  const options = make('div', '', 'actions');
  const mode = {mode:photos.shuffle === false ? 'curated' : 'daily'};
  select(options, 'Tray order', mode, 'mode', [['daily','A fresh shuffle each day'],['curated','My chosen order']]);
  options.querySelector('select').addEventListener('change', () => { photos.shuffle = mode.mode === 'daily'; });
  field(options, 'Slides per tray (1–80)', photos, 'tray', 'number'); $('toolbar').append(options);
  const grid = make('div','','photos');
  photos.slides.forEach((photo,index) => {
    const card = make('article','','photo'); const img = make('img'); img.src = pending.get(photo.id)?.preview || `../${photo.src}`; img.alt=photo.alt || photo.caption || `Photograph ${index+1}`; card.append(img);
    const caption=field(card,'Caption',photo,'caption'),alt=field(card,'Image description',photo,'alt','textarea');
    const context=field(card,'Known place or landmark (optional)',photo,'aiContext');context.maxLength=300;context.placeholder='e.g. Mississippi River · Minneapolis';
    card.append(make('small','A confirmed name for AI to use. This note stays off the public page.'));
    const aiBox=make('div','','photo-ai');aiBox.setAttribute('aria-live','polite');photoAIControls(photo,aiBox,caption,alt);card.append(aiBox);
    field(card,'Month taken',photo,'taken','month');
    check(card,'Include in the projector',photo,'hidden',true);
    photo.location ||= {lat:'',lon:'',label:'',precision:'hidden'};
    const place=make('details','','place-editor');place.append(make('summary',safeLocation(photo.location)?'Place & map sharing':'Add a place'));
    field(place,'Place name',photo.location,'label');
    const coordinates=make('div','','coordinates');const latitude=field(coordinates,'Latitude',photo.location,'lat','number'),longitude=field(coordinates,'Longitude',photo.location,'lon','number');latitude.step=longitude.step='any';latitude.min='-90';latitude.max='90';longitude.min='-180';longitude.max='180';place.append(coordinates);
    select(place,'Public map',photo.location,'precision',[['hidden','Keep this location private'],['approximate','Approximate area (~10 km)'],['exact','Exact pin']]);
    place.append(make('small','Only the chosen precision is written to the public site. Removing a published pin cannot erase earlier repository history.'));card.append(place);
    const notes = metadataRows({...photo, shareMetadata:true}).filter(row=>['Camera','Lens','Exposure'].includes(row[0]));
    card.append(make('p', notes.length ? notes.map(row=>row[1]).join(' · ') : 'No camera notes attached yet.', 'muted'));
    if(Object.keys(photo.metadata || {}).length)check(card,'Share capture date and camera notes',photo,'shareMetadata');
    const original=make('input');original.type='file';original.accept='image/jpeg,image/heic,image/heif,image/png';original.hidden=true;
    original.onchange=async()=>{
      const file=original.files[0];if(!file)return;
      if(file.size>30*1024*1024){status('Choose an original smaller than 30 MB.');return;}
      const {metadata,location}=await readMetadata(file);
      if(!Object.keys(metadata).length&&!location){status('This file has no readable camera or location metadata. Try the original photograph, or add a place manually.');return;}
      photo.metadata=metadata;photo.shareMetadata=true;if(metadata.date)photo.taken=metadata.date.slice(0,7);
      if(location)photo.location={...location,label:photo.location.label||'',precision:'approximate'};
      dirty.add('photos');render();status('Metadata restored. Review the approximate map location, then publish when ready.');
    };
    card.append(original,button('Read place & notes from original',()=>original.click()));
    const actions = reorder(card,photos.slides,index);
    if (pending.has(photo.id)) actions.append(button('Remove new photo',()=>{ pending.delete(photo.id); photos.slides.splice(index,1);changed();render(); }));
    grid.append(card);
  });
  $('items').append(grid, make('p','Hiding a previously published photo removes it from the tray; its original public image link still exists.','muted'));
}
function renderWords() {
  const writing = active === 'writing', items = content[active];
  $('toolbar').append(make('p', writing ? 'Notes and longer pieces. Unpublished writing is saved only in the private catalog.' : 'Make a song list, add a note, and link to a playlist if you like. Unpublished lists stay private.'), button(writing ? 'New piece' : 'New song list', () => {
    items.unshift({id:crypto.randomUUID(), title:writing?'Untitled note':'Untitled mix', date:new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'}), published:false, ...(writing?{body:'',excerpt:''}:{note:'',tracks:[]})}); changed();render();
  }));
  if (!items.length) $('items').append(make('p',writing?'Room for your first note.':'Room for your first song list.','muted'));
  items.forEach((item,index)=>{
    const card=make('details','','item'); card.open = index===0; card.append(make('summary',`${item.published?'Published':'Draft'} · ${item.title}`));
    const fields=make('div','','fields'); field(fields,'Title',item,'title');field(fields,'Date',item,'date','date');
    if(writing){field(fields,'Short introduction',item,'excerpt','textarea',true);field(fields,'Writing',item,'body','textarea',true);}
    else {
      field(fields,'A note about this list',item,'note','textarea',true);
      const tracks={lines:(item.tracks||[]).map(t=>[t.title,t.artist,t.url].filter(Boolean).join(' | ')).join('\n')};
      const input=field(fields,'Songs — one per line: title | artist | optional link',tracks,'lines','textarea',true);
      input.addEventListener('input',()=>{item.tracks=input.value.split('\n').filter(x=>x.trim()).map(line=>{const [title='',artist='',url='']=line.split('|').map(x=>x.trim());return {title,artist,url};});});
    }
    field(fields,writing?'Optional link to the full piece':'Spotify or SoundCloud link',item,'url','url',true);
    if(!writing){const source=musicSource(item.url);fields.append(make('p',source?`${source.provider} player · changes to this selection stay live at the source.`:'Paste a public playlist, album, track, or SoundCloud profile link.','muted'));}
    check(fields,'Publish on the public page',item,'published');
    card.append(fields);reorder(card,items,index);$('items').append(card);
  });
}
function addSharedLink(url,title='') {
  const result=importLink(url,title),duplicate=content[result.section].find(item=>item.url===result.item.url);
  if(duplicate){active=result.section;render();status('This link is already in your collection.');return;}
  content[result.section].unshift({...result.item,id:crypto.randomUUID(),date:new Date().toISOString().slice(0,10)});dirty.add('content');active=result.section;render();status('Added as a draft. Add your context, then save.');
}
function renderInbox() {
  $('toolbar').append(make('p','A small doorway into the collection. Bring a link, a photograph, or a thought.'));
  const capture=make('section','','capture-box');capture.append(make('p','QUICK ADD','eyebrow'),make('h2','Found something worth keeping?'));
  const entry={url:''};const input=field(capture,'Spotify, SoundCloud, or Medium link',entry,'url','url');input.placeholder='Paste a link…';
  capture.append(button('Add to the collection',()=>{try{addSharedLink(entry.url);}catch(error){status(error.message);}}),button('Add photographs',()=>{active='photos';render();}));$('items').append(capture);
  const bookmark=make('a','Keep in my collection','capture-bookmark');
  bookmark.href="javascript:(()=>{const u=new URL('https://inquiredu.org/admin/');u.searchParams.set('share',location.href);u.searchParams.set('title',document.title);window.open(u.href,'_blank','noopener');})()";
  const shortcut=make('p','','muted');shortcut.append('On a computer, drag ',bookmark,' to your bookmarks bar. Use it on a Spotify, SoundCloud, or Medium page to bring that link here as a draft.');capture.append(shortcut);
  const drafts=make('div','','inbox-drafts');for(const [section,label] of [['writing','writing'],['playlists','listening']]){const count=content[section].filter(x=>!x.published).length;if(count)drafts.append(button(`${count} ${label} draft${count===1?'':'s'} →`,()=>{active=section;render();}));}if(drafts.childElementCount)$('items').append(drafts);
  const sources=make('section','','item');sources.append(make('h2','Connected shelves'),make('p','Maintain a playlist at its source; keep the story and context here.','muted'));const fields=make('div','','fields');
  field(fields,'Medium profile or publication',content.sources,'medium','url',true);fields.append(make('p','Your latest published Medium stories join the writing shelf automatically. The first refresh can take up to an hour.','muted wide'));
  field(fields,'Spotify profile',content.sources,'spotify','url');field(fields,'SoundCloud profile',content.sources,'soundcloud','url');sources.append(fields);$('items').append(sources);
  const help=make('details','','item');help.append(make('summary','From your photo library'));
  help.append(make('p','Apple Photos: select favorites, then File → Export → Export Unmodified Original. Add those originals here to recover capture locations. JPEG exports with location information work too.'));
  help.append(make('p','Google Photos: export or download your selected favorites, then add them here. If an image has no location, you can add a place. Google’s Picker API removes GPS; a shared album link cannot supply a live map.'));
  help.append(make('p','On your phone, Add photographs opens the system picker. Import only the moments you want to share; review the map setting before publishing.'));$('items').append(help);
}
function render() {
  $('toolbar').replaceChildren();$('items').replaceChildren();
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===active)));
  if(active==='inbox')renderInbox();else if(active==='projects')renderProjects(); else if(active==='photos')renderPhotos(); else if(active==='about'){
    $('toolbar').append(make('p','The short introduction under your name.'));field($('items'),'Introduction',content,'intro','textarea');
  } else renderWords();
  updateButton();
}
async function load() {
  busy=true;updateButton();status('Opening the collection…');
  try {
    if(demo){
      const responses=await Promise.all(['projects.json','content.json','slides.json'].map(p=>fetch(`../${p}`).then(r=>{if(!r.ok)throw new Error('Preview content did not load.');return r.json();})));
      [catalog,content,photos]=responses;
    }else{
      const [cat,words,pictures,pubProjects,pubContent,head,places]=await Promise.all([github.read(PRIVATE,'catalog.json'),github.read(PRIVATE,'content.json',true),github.read(SITE,'slides.json'),github.read(SITE,'projects.json'),github.read(SITE,'content.json',true),github.head(),github.read(PRIVATE,'photo-locations.json',true)]);
      catalog=cat.data;content=words?.data||pubContent?.data||{version:1,intro:'',writing:[],playlists:[]};photos=pictures.data;
      privateLocations=places?.data.locations||{};for(const photo of photos.slides){if(safeLocation(privateLocations[photo.id]))photo.location=safeLocation(privateLocations[photo.id]);photo.aiContext=cleanContext(places?.data.contexts?.[photo.id]);}
      revisions={catalog:cat.sha,content:words?.sha,photos:pictures.sha,pubProjects:pubProjects.sha,pubContent:pubContent?.sha,head,locations:places?.sha};
    }
    content.writing ||= [];content.playlists ||= [];content.sources ||= {};dirty.clear();pending.clear();aiStates.clear();aiViews.clear();
    await checkAI();
    objectURLs.forEach(URL.revokeObjectURL);objectURLs=[];
    $('gate').hidden=true;$('studio').hidden=false;$('signout').hidden=demo;
    $('sessionLabel').textContent=demo?'Preview · edits are not saved':'Signed in · inquiredu';
    status(demo?'Preview mode. You can explore the editor; publishing is disabled.':'');render();
    if(!sharedLinkHandled){sharedLinkHandled=true;const params=new URLSearchParams(location.search);if(params.has('share')){try{addSharedLink(params.get('share'),params.get('title')||'');}catch(error){status(error.message);}if(!demo)history.replaceState(null,'',location.pathname);}}
  }catch(error){status(error.message);}finally{busy=false;updateButton();}
}
async function readMetadata(file) {
  try {const raw=await parseExif(file,{pick:[...EXIF_TAGS,...LOCATION_TAGS],gps:true,reviveValues:false,xmp:false,iptc:false,icc:false});return {metadata:metadataFromExif(raw),location:locationFromExif(raw)};}
  catch { return {metadata:{},location:null}; }
}
async function importPhotos(files) {
  if(busy)return;
  if(files.length>30){status('Add up to 30 photos at a time.');return;}
  busy=true;updateButton();let added=0,located=0,duplicates=0,described=0,aiFailed=0,failed=[];
  for(const file of files){
    let bitmap;
    try{
      if(file.size>30*1024*1024)throw new Error('over 30 MB');
      status(`Preparing photograph ${added+1}…`);
      const {metadata,location:place}=await readMetadata(file);
      bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
      if(bitmap.width*bitmap.height>80000000)throw new Error('image too large');
      const canvas=document.createElement('canvas'), ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
      const ctx=canvas.getContext('2d');ctx.fillStyle='#f4f1eb';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));if(!blob)throw new Error('conversion failed');
      const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).slice(0,10).map(n=>n.toString(16).padStart(2,'0')).join('');
      if(photos.slides.some(x=>x.id===id)){duplicates++;continue;}
      const image64=canvas.toDataURL('image/jpeg',.86).split(',')[1];
      const thumb=document.createElement('canvas');const scale=Math.min(1,360/Math.max(canvas.width,canvas.height));thumb.width=Math.round(canvas.width*scale);thumb.height=Math.round(canvas.height*scale);thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);
      const src=`assets/slides/${id}.jpg`,thumbnail=`assets/slides/${id}-thumb.jpg`, preview=URL.createObjectURL(blob);objectURLs.push(preview);
      photos.slides.push({id,src,thumb:thumbnail,width:canvas.width,height:canvas.height,taken:metadata.date?.slice(0,7)||'',caption:'',alt:'',hidden:false,metadata,shareMetadata:true,...(place?{location:{...place,precision:'approximate'}}:{})});
      pending.set(id,{preview,files:[{path:src,content:image64,encoding:'base64'},{path:thumbnail,content:thumb.toDataURL('image/jpeg',.8).split(',')[1],encoding:'base64'}]});added++;if(place)located++;
      dirty.add('photos');
      if(aiReady&&autoDescribe){render();status(`Drafting words for photograph ${added}…`);if(await suggestPhoto(photos.slides.at(-1),{automatic:true,blob}))described++;else aiFailed++;}
    }catch{failed.push(file.name);}finally{bitmap?.close();}
  }
  if(added)dirty.add('photos');busy=false;render();
  status(`${added} photo${added===1?'':'s'} ready.${added?` ${located} with a location; ${added-located} without. Review places before publishing.`:''}${described?` ${described} AI draft(s) ready to edit.`:''}${aiFailed?` ${aiFailed} description(s) need a retry or your own words; the photos were still added.`:''}${duplicates?` ${duplicates} duplicate(s) skipped.`:''}${failed.length?` Could not read: ${failed.join(', ')}. For HEIC, export as JPEG and try again.`:''}`);
}
function validate() {
  for(const input of $('studio').querySelectorAll('input[type=url]')) if(input.value && !safeURL(input.value))throw new Error('Use a complete https:// or http:// link.');
  if(group()==='photos'){
    if(!Number.isInteger(+photos.tray)||+photos.tray<1||+photos.tray>80)throw new Error('Choose between 1 and 80 slides per tray.');
    for(const slide of photos.slides)if(pending.has(slide.id)&&!slide.hidden&&!slide.alt?.trim())throw new Error('Add an image description to each new photo before publishing.');
    for(const slide of photos.slides)if(slide.location?.precision!=='hidden'&&slide.location&&!safeLocation(slide.location))throw new Error('Enter valid latitude and longitude, or keep that location private.');
  }
  if(group()==='content'){
    if(content.sources?.medium&&!mediumSource(content.sources.medium))throw new Error('Use a Medium profile or publication URL, such as https://medium.com/@username.');
    const sources=publicSources(content.sources);for(const key of ['spotify','soundcloud'])if(content.sources?.[key]&&!sources[key])throw new Error(`Use a full public ${key==='spotify'?'Spotify profile':'SoundCloud'} URL.`);
    for(const item of content.playlists)if(item.published&&item.url&&/spotify|soundcloud/i.test(item.url)&&!musicSource(item.url))throw new Error('Use a full public Spotify selection or SoundCloud link. Private and short music links are not published.');
  }
  const entries=group()==='projects'?catalog.projects:group()==='content'?[...content.writing,...content.playlists]:[];
  if(entries.some(x=>!x.title?.trim()))throw new Error('Give each entry a title before publishing.');
}
async function publish() {
  if(demo||!github||busy)return;
  try{
    validate();busy=true;$('studio').inert=true;updateButton();status('Saving the collection…');
    if(group()==='projects'){
      revisions.catalog=await github.write(PRIVATE,'catalog.json',catalog,revisions.catalog,'Save project collection');
      status('Private catalog saved. Updating the public shelf…');
      revisions.pubProjects=await github.write(SITE,'projects.json',publicProjects(catalog),revisions.pubProjects,'Publish project collection');
    }else if(group()==='content'){
      revisions.content=await github.write(PRIVATE,'content.json',content,revisions.content,'Save writing and song lists');
      status('Private drafts saved. Updating the public page…');
      revisions.pubContent=await github.write(SITE,'content.json',publicContent(content),revisions.pubContent,'Publish writing and song lists');
    }else{
      photos.updated=new Date().toISOString().slice(0,10);photos.tray=+photos.tray;
      for(const photo of photos.slides){const place=safeLocation(photo.location);if(place)privateLocations[photo.id]=place;else delete privateLocations[photo.id];}
      revisions.locations=await github.write(PRIVATE,'photo-locations.json',{version:1,locations:privateLocations,contexts:photoContexts(photos.slides)},revisions.locations,'Save private photograph locations and confirmed context');
      const files=[...pending.values()].flatMap(x=>x.files);files.push({path:'slides.json',content:json(publicSlides(photos))});
      revisions.head=await github.commitFiles(files,revisions.head);pending.clear();
    }
    dirty.delete(group());status('Published to GitHub. The public page will update after GitHub Pages finishes deploying.');
    // Refresh the head only when the photo collection is unchanged; otherwise preserve its conflict baseline.
    if(!dirty.has('photos'))revisions.head=await github.head();
  }catch(error){status(`${error.message}\nYour edits are still in this tab. If the private save succeeded, those drafts are safe even if public publishing failed.`);}
  finally{busy=false;$('studio').inert=false;updateButton();}
}
$('tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b&&!busy){active=b.dataset.tab;render();}};
$('publish').onclick=publish;
$('reload').onclick=()=>{if(!dirty.size||confirm('Discard the edits in this tab and reload the saved collection?'))load();};
$('signout').onclick=()=>{if(!dirty.size||confirm('Sign out and discard unsaved changes?')){github.token='';github=null;location.reload();}};
window.addEventListener('beforeunload',event=>{if(dirty.size){event.preventDefault();event.returnValue='';}});
$('signin').onclick=()=>{
  channel=crypto.randomUUID();const url=new URL('/login',config.authOrigin);url.searchParams.set('channel',channel);
  popup=window.open(url.href,'collection-signin','width=620,height=720');
  if(!popup)status('Allow the sign-in popup, then try again.');else status('Finish signing in with GitHub in the new window.');
};
window.addEventListener('message',async event=>{
  if(!config?.authOrigin||event.origin!==new URL(config.authOrigin).origin||event.source!==popup||event.data?.channel!==channel||event.data?.type!=='collection-auth')return;
  if(typeof event.data.token!=='string'||!event.data.token)return;
  popup?.close();popup=null;channel=null;github=new GitHub(event.data.token);
  try{await github.verify();await load();}catch(error){github.token='';github=null;status(error.message);}
});
try{
  config=await fetch('config.json',{cache:'no-store'}).then(r=>r.json());
  if(config.authOrigin&&new URL(config.authOrigin).protocol==='https:'){$('signin').disabled=false;$('setup').textContent='Only the inquiredu account can open this editor.';}
  else {$('setup').textContent='GitHub sign-in needs its one-time connection. The public collection is ready to browse.';}
  if(demo)await load();
}catch{status('The sign-in configuration could not be loaded. Reload to try again.');}
