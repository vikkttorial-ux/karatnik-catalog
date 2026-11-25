const CATALOG='https://vikkttorial-ux.github.io/karatnik-catalog/';
const IMAGE=/^https:\/\/karatnik-product-photos\.workspace-903713\.chatgpt\.site\/api\/images\/[0-9a-f-]{36}$/i;
export const PHOTO_KINDS=Object.freeze({clean:'Чистый фон',still:'Предметка',body:'На теле',look:'В образе',box:'В коробочке'});
export function galleryPhotoUrl(value) {
  if(typeof value!=='string'||value.includes('..')||/%2e|%5c/i.test(value))return '';
  if(IMAGE.test(value))return value;
  if(/^photos\/[^/\\]+\.webp$/i.test(value))return new URL(value,CATALOG).href;
  try {const url=new URL(value);return url.origin==='https://vikkttorial-ux.github.io'&&/^\/karatnik-catalog\/photos\/[^/]+\.webp$/i.test(url.pathname)&&!url.search&&!url.hash?url.href:'';}catch{return '';}
}
export function productPhotoEntries(item){
 const values=[{url:item?.photo},...(Array.isArray(item?.photoGallery)?item.photoGallery.map(p=>typeof p==='string'?{url:p}:p):[])],map=new Map();
 for(const p of values){const url=galleryPhotoUrl(p?.url);if(!url)continue;const kind=Object.hasOwn(PHOTO_KINDS,p?.kind)?p.kind:'';if(!map.has(url))map.set(url,{url,kind});else if(kind)map.get(url).kind=kind;}
 return [...map.values()];
}
export function productPhotos(item) {return productPhotoEntries(item).map(p=>p.url);}
function styles() {
  if(document.getElementById('photo-gallery-style'))return;
  const css=document.createElement('link');css.id='photo-gallery-style';css.rel='stylesheet';css.href=new URL('./photo-gallery.css?v=detail1125',import.meta.url).href;document.head.append(css);
}
export function mountPhotoGallery(container,img,item,{start=0,onChange=()=>{},viewer=false}={}) {
  const entries=productPhotoEntries(item),photos=entries.map(p=>p.url);if(!photos.length)return ()=>{};
  styles();container.classList.add('photo-gallery-host');
  let index=Math.max(0,Math.min(photos.length-1,Number(start)||0)),touch=null,zoomed=false;const failed=new Set();
  const originalStyle=img.getAttribute('style');
  const nav=document.createElement('div');nav.className='photo-gallery-nav';nav.setAttribute('role','group');nav.setAttribute('aria-label',`Фотографии ${item.art||''}`);
  const prev=document.createElement('button'),next=document.createElement('button'),count=document.createElement('span');
  for(const b of [prev,next])b.type='button';prev.textContent='‹';next.textContent='›';prev.setAttribute('aria-label','Предыдущее фото');next.setAttribute('aria-label','Следующее фото');count.setAttribute('aria-live','polite');
  nav.append(prev,count,next);nav.hidden=photos.length<2;if(photos.length>1)container.append(nav);
  let panel=null,zoom=null,caption=null,thumbs=[];
  const setZoom=value=>{zoomed=value;container.classList.toggle('gallery-zoomed',value);if(zoom){zoom.textContent=value?'Показать полностью':'Увеличить детали';zoom.setAttribute('aria-pressed',String(value));}if(viewer){container.scrollTop=0;container.scrollLeft=0;}};
  if(viewer){
    container.classList.add('photo-gallery-viewer');panel=document.createElement('div');panel.className='photo-gallery-detail';
    zoom=document.createElement('button');zoom.type='button';zoom.className='gallery-zoom';zoom.setAttribute('aria-pressed','false');zoom.textContent='Увеличить детали';zoom.addEventListener('click',()=>setZoom(!zoomed));panel.append(zoom);
    if(photos.length>1){const strip=document.createElement('div');strip.className='photo-gallery-thumbs';strip.setAttribute('role','group');strip.setAttribute('aria-label','Выбрать фотографию');
      thumbs=photos.map((url,n)=>{const b=document.createElement('button');b.type='button';b.className='photo-gallery-thumb';const name=PHOTO_KINDS[entries[n].kind]||`Фото ${n+1}`;b.setAttribute('aria-label',`Показать фото ${n+1} из ${photos.length}: ${name}`);const preview=document.createElement('img');preview.src=url;preview.alt='';preview.loading='lazy';const label=document.createElement('span');label.textContent=name;b.append(preview,label);b.addEventListener('click',()=>{if(failed.has(n))return;index=n;show();});strip.append(b);return b;});panel.append(strip);
    }
    caption=document.createElement('span');caption.className='gallery-current-kind';caption.setAttribute('aria-live','polite');panel.append(caption);container.after(panel);
  }
  const show=()=>{setZoom(false);const label=PHOTO_KINDS[entries[index].kind]||'';img.src=photos[index];img.alt=`${item.art||'Товар'}, фото ${index+1} из ${photos.length}${label?': '+label:''}`;count.textContent=`${index+1} / ${photos.length}`;if(caption){caption.textContent=label;caption.hidden=!label;}thumbs.forEach((b,n)=>{b.setAttribute('aria-pressed',String(n===index));b.disabled=failed.has(n);});onChange(index);};
  const go=step=>{for(let n=0;n<photos.length;n++){index=(index+step+photos.length)%photos.length;if(!failed.has(index)){show();return;}}};
  const backward=e=>{e.preventDefault();e.stopPropagation();go(-1);},forward=e=>{e.preventDefault();e.stopPropagation();go(1);};prev.addEventListener('click',backward);next.addEventListener('click',forward);
  const key=e=>{if(e.key==='ArrowLeft')backward(e);if(e.key==='ArrowRight')forward(e);};container.addEventListener('keydown',key);
  const begin=e=>{touch=zoomed||e.touches?.length>1?null:{x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};};
  let suppressClickUntil=0;
  const end=e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){go(dx<0?1:-1);suppressClickUntil=Date.now()+400;}};
  const click=e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}};
  const imageError=()=>{failed.add(index);if(failed.size<photos.length)go(1);else{count.textContent='Фото недоступны';prev.disabled=true;next.disabled=true;thumbs.forEach(b=>b.disabled=true);if(zoom)zoom.disabled=true;}};
  img.addEventListener('touchstart',begin,{passive:true});img.addEventListener('touchend',end,{passive:true});container.addEventListener('click',click,true);img.addEventListener('error',imageError);show();
  return ()=>{nav.remove();panel?.remove();container.classList.remove('photo-gallery-viewer','gallery-zoomed');if(originalStyle===null)img.removeAttribute('style');else img.setAttribute('style',originalStyle);container.removeEventListener('keydown',key);img.removeEventListener('touchstart',begin);img.removeEventListener('touchend',end);container.removeEventListener('click',click,true);img.removeEventListener('error',imageError);};
}

