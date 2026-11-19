const CATALOG='https://vikkttorial-ux.github.io/karatnik-catalog/';
const IMAGE=/^https:\/\/karatnik-product-photos\.workspace-903713\.chatgpt\.site\/api\/images\/[0-9a-f-]{36}$/i;
export function galleryPhotoUrl(value) {
  if(typeof value!=='string'||value.includes('..')||/%2e|%5c/i.test(value))return '';
  if(IMAGE.test(value))return value;
  if(/^photos\/[^/\\]+\.webp$/i.test(value))return new URL(value,CATALOG).href;
  try {const url=new URL(value);return url.origin==='https://vikkttorial-ux.github.io'&&/^\/karatnik-catalog\/photos\/[^/]+\.webp$/i.test(url.pathname)&&!url.search&&!url.hash?url.href:'';}catch{return '';}
}
export function productPhotos(item) {
  const values=[item?.photo,...(Array.isArray(item?.photoGallery)?item.photoGallery.map(p=>typeof p==='string'?p:p?.url):[])];
  return [...new Set(values.map(galleryPhotoUrl).filter(Boolean))];
}
function styles() {
  if(document.getElementById('photo-gallery-style'))return;
  const css=document.createElement('link');css.id='photo-gallery-style';css.rel='stylesheet';css.href=new URL('./photo-gallery.css?v=gallery-1119',import.meta.url).href;document.head.append(css);
}
export function mountPhotoGallery(container,img,item,{start=0,onChange=()=>{}}={}) {
  const photos=productPhotos(item);if(!photos.length)return ()=>{};
  styles();container.classList.add('photo-gallery-host');
  let index=Math.max(0,Math.min(photos.length-1,Number(start)||0)),touch=null;const failed=new Set();
  const nav=document.createElement('div');nav.className='photo-gallery-nav';nav.setAttribute('role','group');nav.setAttribute('aria-label',`Фотографии ${item.art||''}`);
  const prev=document.createElement('button'),next=document.createElement('button'),count=document.createElement('span');
  for(const b of [prev,next])b.type='button';prev.textContent='‹';next.textContent='›';prev.setAttribute('aria-label','Предыдущее фото');next.setAttribute('aria-label','Следующее фото');count.setAttribute('aria-live','polite');
  nav.append(prev,count,next);nav.hidden=photos.length<2;if(photos.length>1)container.append(nav);
  const show=()=>{img.src=photos[index];img.alt=`${item.art||'Товар'}, фото ${index+1} из ${photos.length}`;count.textContent=`${index+1} / ${photos.length}`;onChange(index);};
  const go=step=>{for(let n=0;n<photos.length;n++){index=(index+step+photos.length)%photos.length;if(!failed.has(index)){show();return;}}};
  const backward=e=>{e.preventDefault();e.stopPropagation();go(-1);},forward=e=>{e.preventDefault();e.stopPropagation();go(1);};prev.addEventListener('click',backward);next.addEventListener('click',forward);
  const key=e=>{if(e.key==='ArrowLeft')backward(e);if(e.key==='ArrowRight')forward(e);};container.addEventListener('keydown',key);
  const begin=e=>{touch={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};};
  let suppressClickUntil=0;
  const end=e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){go(dx<0?1:-1);suppressClickUntil=Date.now()+400;}};
  const click=e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}};
  const imageError=()=>{failed.add(index);if(failed.size<photos.length)go(1);};
  img.addEventListener('touchstart',begin,{passive:true});img.addEventListener('touchend',end,{passive:true});container.addEventListener('click',click,true);img.addEventListener('error',imageError);show();
  return ()=>{nav.remove();container.removeEventListener('keydown',key);img.removeEventListener('touchstart',begin);img.removeEventListener('touchend',end);container.removeEventListener('click',click,true);img.removeEventListener('error',imageError);};
}
