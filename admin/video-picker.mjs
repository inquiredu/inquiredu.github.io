import {youtubeVideo} from '../assets/youtube-source.mjs?v=20261115.14';

export function videoChoices(items=[],feed=[]) {
  const seen=new Set();
  return [...items,...feed].filter(item=>{const id=youtubeVideo(item.url)?.id;if(!id||seen.has(id))return false;seen.add(id);return true;});
}
export function selectVideos(items,feed,selected) {
  const chosen=new Set(selected),known=new Set(items.map(item=>youtubeVideo(item.url)?.id));
  return [
    ...items.map(item=>({...item,published:chosen.has(youtubeVideo(item.url)?.id)})),
    ...videoChoices([],feed).filter(item=>{const id=youtubeVideo(item.url).id;return chosen.has(id)&&!known.has(id);}).map(item=>({...item,fromFeed:true,published:true}))
  ];
}
export function openVideoPicker({items,feed,onChoose}) {
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
  const selected=new Set(items.filter(item=>item.published).map(item=>youtubeVideo(item.url)?.id).filter(Boolean));
  const returnFocus=document.activeElement,dialog=el('dialog','','video-picker');dialog.setAttribute('aria-labelledby','video-picker-title');
  const heading=el('h2','Choose your videos');heading.id='video-picker-title';
  dialog.append(el('p','THE TELEVISION LINEUP','eyebrow'),heading,el('p','Check the videos you want on your page. New channel uploads stay here until you select them.','muted'));
  const searchLabel=el('label','Find a video'),search=el('input');search.type='search';search.placeholder='Search titles…';searchLabel.append(search);dialog.append(searchLabel);
  const grid=el('div','','video-picker-grid'),choices=videoChoices(items,feed);
  const count=el('p','','muted');count.setAttribute('role','status');
  function updateCount(){count.textContent=selected.size+' selected · review the order, then Save & publish.';}
  function render(){
    grid.replaceChildren();const visible=choices.filter(item=>item.title.toLowerCase().includes(search.value.trim().toLowerCase()));
    for(const item of visible){const source=youtubeVideo(item.url),label=el('label','','video-choice'),image=el('img'),check=el('input'),text=el('div');
      image.src=source.thumbnail;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';
      check.type='checkbox';check.checked=selected.has(source.id);check.setAttribute('aria-label',item.title);check.onchange=()=>{check.checked?selected.add(source.id):selected.delete(source.id);updateCount();};
      text.append(el('strong',item.title),el('small',item.date||'YouTube video'));label.append(image,check,text);grid.append(label);
    }
    if(!visible.length)grid.append(el('p','No matches. You can also add any YouTube video by its link.','muted'));
  }
  search.oninput=render;dialog.append(grid,el('p','Your latest public channel uploads and saved videos. For an older video, use Add a video and paste its YouTube link.','muted'));
  const footer=el('div','','video-picker-footer'),cancel=el('button','Cancel'),apply=el('button','Use selected videos','primary');cancel.type=apply.type='button';
  cancel.onclick=()=>dialog.close();apply.onclick=()=>{onChoose(selectVideos(items,feed,selected));dialog.close();};footer.append(count,cancel,apply);dialog.append(footer);
  dialog.addEventListener('close',()=>{dialog.remove();if(returnFocus?.isConnected)returnFocus.focus();},{once:true});document.body.append(dialog);render();updateCount();dialog.showModal();
}
