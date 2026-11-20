export const setKey=p=>String(p.art||'').replace(/\s/g,'')+'|'+String(p.marka||p.brand||'').replace(/\s/g,'').toLocaleLowerCase('ru');
export function validateSets(data){
 if(data?.version!==1||!Array.isArray(data.sets))throw Error('Неверный справочник комплектов');
 const ids=new Set();
 for(const group of data.sets){
  if(typeof group.id!=='string'||!/^[-A-Za-z0-9_]{1,80}$/.test(group.id)||ids.has(group.id)||!Array.isArray(group.members)||group.members.length<2||group.members.length>12)throw Error('Некорректный комплект');
  ids.add(group.id);const members=new Set();
  for(const member of group.members){
   if(typeof member.art!=='string'||!member.art.trim()||typeof member.brand!=='string'||!member.brand.trim()||members.has(setKey(member)))throw Error('Некорректный участник комплекта');
   members.add(setKey(member));
  }
 }
 return data;
}
export function attachSets(items,data){
 const memberships=new Map();
 for(const group of data.sets)for(const member of group.members){const key=setKey(member);if(!memberships.has(key))memberships.set(key,[]);memberships.get(key).push(group.id);}
 return items.map(item=>({...item,setIds:memberships.get(setKey(item))||[]}));
}
export function relatedSets(item,data,items){
 const byKey=new Map(items.map(p=>[setKey(p),p])),own=setKey(item);
 return data.sets.filter(group=>group.members.some(p=>setKey(p)===own)).map(group=>({
  id:group.id,members:group.members.filter(p=>setKey(p)!==own).map(p=>byKey.get(setKey(p))||{...p,marka:p.brand,units:0,stocks:{},sizes:[]})
 }));
}
export function setLink(base,{member,id,client=false}={}){
 const url=new URL('./',base);
 if(member){url.searchParams.set('model',setKey(member));}
 else if(id)url.searchParams.set('set',id);
 if(client)url.searchParams.set('client','1');
 return url.href;
}
