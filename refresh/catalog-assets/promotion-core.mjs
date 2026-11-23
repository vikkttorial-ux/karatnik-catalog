export const SELECTIONS=['Хит','Хит месяца','Вернулись в наличие','Пополнили размеры','Новинка','Новинка месяца','Последнее поступление','Скоро в продаже'];
export const promotionKey=p=>String(p.art||'').trim()+'|'+String(p.marka||p.brand||'').trim().toLocaleLowerCase('ru');
export function promotionInfo(p,data){return data?.items?.[promotionKey(p)]||{tags:[]};}
export function matchesPromotion(p,data,selection){return !selection||promotionInfo(p,data).tags.includes(selection);}
export function showcase(stock,data){const keys=new Set(stock.items.map(promotionKey));return {...stock,items:[...stock.items,...(data.upcoming||[]).filter(p=>!keys.has(promotionKey(p)))]};}
export function appendPromotions(card,p,data){
 const info=promotionInfo(p,data);
 for(const tag of info.tags){const e=document.createElement('span');e.className='abc';e.textContent=tag;card.append(e);}
 for(const text of [info.expected_date?'Ожидается: '+info.expected_date:info.tags.includes('Скоро в продаже')?'Дата поступления уточняется':'',info.replenished_sizes?.length?'Пополнили размеры: '+info.replenished_sizes.join(', '):''])if(text){const e=document.createElement('p');e.textContent=text;card.append(e);}
}
export function addSelectionFilter(host,id,onChange){const label=document.createElement('label');label.textContent='Подборка';const select=document.createElement('select');select.id=id;for(const text of ['Все',...SELECTIONS]){const o=document.createElement('option');o.value=text==='Все'?'':text;o.textContent=text;select.append(o);}label.append(select);host.prepend(label);select.addEventListener('input',onChange);return select;}

export function defaultPromotionOrder(items,state={}) {
 const prioritizeNew=!Object.entries(state).some(([key,value])=>key!=='client'&&String(value||'').trim());
 const hasStock=item=>Object.entries(item.stocks||{}).some(([name,quantity])=>quantity>0&&name.trim()&&!['склад не указан','не указано','не указан','без склада'].includes(name.trim().toLocaleLowerCase('ru')));
 const rank=item=>{
  const tags=item.promotions?.tags||[];
  return tags.includes('Последнее поступление')?0:tags.includes('Новинка месяца')?1:tags.includes('Новинка')?2:3;
 };
 return [...items].sort((a,b)=>Number(!hasStock(a))-Number(!hasStock(b))||(prioritizeNew?rank(a)-rank(b):0));
}
