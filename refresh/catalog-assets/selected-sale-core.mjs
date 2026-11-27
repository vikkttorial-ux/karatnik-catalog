import {SELECTED_SALE} from './selected-sale-data.mjs';
export const saleModelKey=(art,brand)=>String(art||'').replace(/\s/g,'')+'|'+String(brand||'').replace(/\s/g,'').toLocaleLowerCase('ru');
export function validateSelectedSale(data){
 if(data?.version!==2||data.discount_percent!==50||data.basis!=='ПРЦ'||data.stacking!=='replace'||data.timezone!=='Europe/Moscow'||!Array.isArray(data.items)||!data.items.length)throw Error('Некорректные условия подборки −50%');
 const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().startsWith(s);
 if(!date(data.starts_on)||!date(data.ends_on)||data.starts_on>data.ends_on)throw Error('Некорректные сроки подборки');
 const keys=new Set();for(const p of data.items){const key=saleModelKey(p.art,p.brand);if(!p.art||!p.brand||keys.has(key)||!Array.isArray(p.units)||!p.units.length)throw Error('Повтор или пустой артикул подборки');keys.add(key);const variants=new Set();for(const u of p.units){const spec=JSON.stringify([u.store,u.size,u.grams,u.baseAmount]);if(!u.store||typeof u.size!=='string'||!Number.isFinite(u.grams)||u.grams<=0||!Number.isFinite(u.baseAmount)||u.baseAmount<=0||!Number.isSafeInteger(u.quantity)||u.quantity<1||variants.has(spec)||Object.keys(u).some(k=>!['store','size','grams','baseAmount','quantity'].includes(k)))throw Error('Некорректные характеристики подборки');variants.add(spec);}}
 return data;
}
validateSelectedSale(SELECTED_SALE);
const models=new Set(SELECTED_SALE.items.map(p=>saleModelKey(p.art,p.brand)));
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
export function selectedSaleActive(now=new Date()){const day=typeof now==='string'?now:formatter.format(now);return day>=SELECTED_SALE.starts_on&&day<=SELECTED_SALE.ends_on;}
// All sizes and copies of the listed article and brand participate on every store.
export function isSelectedSaleUnit(item,entry,now=new Date()){
 return selectedSaleActive(now)&&!!entry&&models.has(saleModelKey(item.art??item.article,item.marka??item.brand))&&Object.values(item.stock_codes||{}).some(entries=>Array.isArray(entries)&&entries.includes(entry));
}
export const selectedSaleInfo=()=>({label:'−50%',name:'Избранные украшения −50%',starts_on:SELECTED_SALE.starts_on,ends_on:SELECTED_SALE.ends_on,percent:50});
