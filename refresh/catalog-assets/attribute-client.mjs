import {photoUploadUrl,photoPair} from './photo-client.mjs?v=attrs-1109';
const API='https://karatnik-product-photos.workspace-903713.chatgpt.site/api/public/attributes';
export async function loadAttributeOverrides(){
 const r=await fetch(API,{cache:'no-store',mode:'cors',signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw Error('Дополненные характеристики временно недоступны. Показаны данные таблицы.');
 const data=await r.json(),map=new Map();
 for(const item of data.items||[])if(typeof item.art==='string'&&typeof item.brand==='string'&&item.attrs&&Array.isArray(item.attrs.char2)&&Array.isArray(item.attrs.char3))map.set(photoPair(item.art,item.brand),{...item.attrs,__source:item.updatedAt==='source'});
 return map;
}
export function applyAttributeOverrides(item,values){
 const a=values.get(photoPair(item.art,item.marka));if(!a)return item;
 const details={...item.details};
 function put(k,values){if(!a.__source||!(details[k]?.length))details[k]=values;}
 for(const k of ['char2','char3'])put(k,a[k].filter(x=>typeof x==='string'));
 put('vstavka',a.inserts?[a.inserts]:[]);put('lock',a.lock?[a.lock]:[]);put('inspired_by',a.inspired_by?[a.inspired_by]:[]);
 for(const k of ['pendant_kind','religion','saint'])put(k,a[k]?[a[k]]:[]);put('motif',a.motif||[]);
 return {...item,char2:details.char2.join('; '),vstavka:details.vstavka.join('; '),details};
}
export function appendAttributeLink(container,art,brand){
 const link=document.createElement('a');link.className='add-photo-link';link.textContent='Дополнить характеристики';link.href='https://karatnik-product-photos.workspace-903713.chatgpt.site/attributes';
 link.addEventListener('click',async e=>{e.preventDefault();try{const u=new URL(await photoUploadUrl(art,brand));u.pathname='/attributes';location.assign(u.href);}catch{location.assign(link.href);}});container.append(link);
}
