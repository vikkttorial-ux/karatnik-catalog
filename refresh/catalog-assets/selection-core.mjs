import {setKey} from './set-core.mjs?v=sets1120';
export const SELECTION_LIMIT=50;
export function encodeSelection(items){
 if(!Array.isArray(items)||!items.length||items.length>SELECTION_LIMIT)throw Error('Выберите от 1 до 50 изделий');
 const seen=new Set(),pairs=[];
 for(const p of items){
  const art=p?.art,brand=p?.marka??p?.brand;
  if(typeof art!=='string'||typeof brand!=='string'||!art.trim()||!brand.trim()||art.length>200||brand.length>200)throw Error('Некорректное изделие');
  const key=setKey(p);if(seen.has(key))continue;seen.add(key);pairs.push([art,brand]);
 }
 const bytes=new TextEncoder().encode(JSON.stringify(pairs));
 const result='1.'+btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 if(result.length>12000)throw Error('Слишком длинная подборка — уменьшите число изделий');
 return result;
}
export function decodeSelection(value){
 try{
  if(typeof value!=='string'||value.length>12000||!/^1\.[A-Za-z0-9_-]+$/.test(value))return [];
  const raw=value.slice(2).replace(/-/g,'+').replace(/_/g,'/');
  const pairs=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(raw),x=>x.charCodeAt(0))));
  if(!Array.isArray(pairs)||!pairs.length||pairs.length>SELECTION_LIMIT)return [];
  const items=pairs.map(p=>{if(!Array.isArray(p)||p.length!==2)throw Error('pair');return {art:p[0],marka:p[1]};});
  encodeSelection(items);return [...new Map(items.map(p=>[setKey(p),p])).values()];
 }catch{return [];}
}
let previous,keys;
export function selectionContains(value,item){
 if(value!==previous){previous=value;keys=new Set(decodeSelection(value).map(setKey));}
 return keys?.has(setKey(item))||false;
}
export function selectedClientUrl(items,base){
 const url=new URL('./',base);url.searchParams.set('client','1');url.searchParams.set('picks',encodeSelection(items));return url.href;
}

