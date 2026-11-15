import {youtubeVideo} from './youtube-source.mjs?v=20261115.14';
import {createFocusView} from './focus-view.mjs?v=20261115.16';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,label,run,cls)=>{const b=el('button',text,cls);b.type='button';b.setAttribute('aria-label',label);b.onclick=run;return b;};
export function mountTubeTV(root,items,profile) {
  if(!root)return;root.replaceChildren();const videos=items.filter(x=>youtubeVideo(x.url));if(!videos.length)return;
  const focus=createFocusView({container:root,label:'Moving pictures',kind:'video'}),toolbar=el('div','','tube-toolbar');toolbar.append(focus.button);root.prepend(toolbar);
  let index=0,on=false;
  const room=el('div','','television-room'),cabinet=el('div','','tube-cabinet'),body=el('div','','tube-body'),bezel=el('div','','tube-bezel'),screen=el('div','','tube-screen'),controls=el('aside','','tube-controls');
  const brand=el('div','','tube-brand');brand.append(el('strong','BEAVERSON'),el('small','COLOUR TELEVISION · 1974'));controls.append(brand);
  const tuning=el('div','','tube-tuning'),channel=el('span','','tube-channel'),dial=button('','Next channel',()=>select(index+1),'tube-dial');dial.append(el('span','','tube-dial-marker'));tuning.append(el('small','UHF / CHANNEL'),dial,channel);controls.append(tuning);
  const arrows=el('div','','tube-channel-buttons');arrows.append(button('−','Previous video channel',()=>select(index-1)),button('+','Next video channel',()=>select(index+1)));controls.append(arrows);
  const power=button('','Turn television on',()=>{on=!on;paint();},'tube-power'),lamp=el('span','','tube-power-led'),powerText=el('span','POWER');power.append(lamp,powerText);controls.append(power,el('div','','tube-speaker'),el('small','SOLID STATE · MODEL >0','tube-model'));
  bezel.append(screen);body.append(bezel,controls);cabinet.append(body,el('div','','tube-foot left'),el('div','','tube-foot right'));
  const guide=el('aside','','tube-guide'),guideHead=el('div','','tube-guide-head');guideHead.append(el('span','TABLE OF CONTENTS'),el('small',videos.length+' selections'));guide.append(guideHead);
  const list=el('nav','','tube-programmes');list.setAttribute('aria-label','Video table of contents');
  const choices=videos.map((video,i)=>{const b=button('','Select video '+(i+1)+': '+video.title,()=>select(i),'tube-programme'),leader=el('i','','tube-leader');leader.setAttribute('aria-hidden','true');b.append(el('span',String(i+1).padStart(2,'0')),el('strong',video.title),leader,el('small',video.date?.slice(0,4)||''));list.append(b);return b;});guide.append(list);
  const title=el('h3'),note=el('p','','tube-note'),meta=el('p','','tube-video-meta'),watch=el('a','Watch on YouTube ↗','tube-watch'),current=el('div','','tube-current');watch.target='_blank';watch.rel='noopener';current.append(el('p','ON THE SCREEN','tube-current-label'),title,note,meta,watch);guide.append(current);
  if(profile){const all=el('a','Visit the channel ↗','tube-all');all.href=profile;all.target='_blank';all.rel='noopener';guide.append(all);}
  room.append(cabinet,guide);focus.body.append(room);
  function select(next){const selected=(next+videos.length)%videos.length;if(selected===index)return;index=selected;paint();}
  function paint(){
    const video=videos[index],source=youtubeVideo(video.url);screen.replaceChildren();screen.classList.toggle('is-on',on);cabinet.classList.toggle('is-on',on);power.setAttribute('aria-pressed',String(on));power.setAttribute('aria-label',on?'Turn television off':'Turn television on');channel.textContent=String(index+1).padStart(2,'0');
    title.textContent=video.title;note.textContent=video.note||'';note.hidden=!video.note;meta.textContent=[video.date?.slice(0,4),'Sean Beaverson'].filter(Boolean).join(' · ');watch.href=source.url;choices.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
    if(on){const matte=el('div','','tube-player-matte'),player=el('iframe');player.title=video.title+' — YouTube player';player.src=source.embed+'?'+new URLSearchParams({autoplay:'1',playsinline:'1',rel:'0',origin:location.origin});player.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';player.allowFullscreen=true;player.referrerPolicy='strict-origin-when-cross-origin';matte.append(player);screen.append(matte);}
    else{const image=el('img');image.src=source.thumbnail;image.alt='';image.loading='lazy';const off=button('Switch on','Play '+video.title,()=>{on=true;paint();},'tube-switch-on');screen.append(image,el('div','','tube-off-glass'),off,el('span','CH '+String(index+1).padStart(2,'0'),'tube-osd'));}
  }
  paint();
}
