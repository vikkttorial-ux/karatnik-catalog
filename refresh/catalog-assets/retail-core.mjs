export const GOLD_EVENT={starts:'2026-11-20',ends:'2026-11-30',percent:40};
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
let cachedMinute=NaN,cachedDay='';
export function retailDay(now=new Date()){
 if(typeof now==='string')return now;
 const minute=Math.floor(now.getTime()/60000);
 if(minute!==cachedMinute){cachedDay=dayFormatter.format(now);cachedMinute=minute;}
 return cachedDay;
}
export function retailPercent(item,now=new Date()){
 const assay=String(item.proba||'').trim(),day=retailDay(now);
 if(['800','830','875','925','960'].includes(assay))return 20;
 if(['375','500','583','585','750','958'].includes(assay))return day>=GOLD_EVENT.starts&&day<=GOLD_EVENT.ends?40:20;
 return null;
}
export function discountedRubles(entry,item,now=new Date()){
 const percent=retailPercent(item,now),prc=entry?.prc;
 if(percent===null||typeof prc!=='number'||!Number.isFinite(prc)||prc<=0)return null;
 const kopecks=Math.round(prc*100),result=Math.round(kopecks*(100-percent)/100)/100;
 return Number.isSafeInteger(kopecks)&&result>0?result:null;
}
export function rubBound(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const n=Number(String(value).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)&&n>=0?n:null;
}
export function retailOffer(item,state={},now=new Date()){
 const min=rubBound(state.rubMin),max=rubBound(state.rubMax);
 const units=Object.entries(item.stock_codes||{}).flatMap(([stock,entries])=>state.stock&&state.stock!==stock?[]:(Array.isArray(entries)?entries:[]).filter(e=>!state.size||String(e.size)===state.size));
 const valid=units.flatMap(entry=>{const rub=discountedRubles(entry,item,now);return rub===null?[]:[{rub,entry}];});
 const eligible=min!==null&&max!==null&&min>max?[]:valid.filter(e=>(min===null||e.rub>=min)&&(max===null||e.rub<=max));
 const cheapest=eligible.reduce((a,b)=>!a||b.rub<a.rub?b:a,null);
 return {amount:cheapest?.rub??null,prc:cheapest?.entry.prc??null,percent:retailPercent(item,now),known:valid.length,total:units.length,eligible:eligible.length};
}
export function matchesRetail(item,state,now=new Date()){return rubBound(state.rubMin)===null&&rubBound(state.rubMax)===null||retailOffer(item,state,now).amount!==null;}
export function retailBanner(now=new Date()){const day=retailDay(now);return day>=GOLD_EVENT.starts&&day<=GOLD_EVENT.ends?'До 30 ноября включительно · всё золото −40% · серебро −20%':'Золото и серебро −20%';}
const rubFormatter=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2});
export const rubles=value=>rubFormatter.format(value);
