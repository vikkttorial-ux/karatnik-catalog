// Акции привязаны к марке и точному артикулу; срок считается по Москве.
export function campaignDay(now=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function campaignKey(art,brand) {
  const maker=String(brand||'').trim().toLocaleLowerCase('ru');
  let sku=String(art||'').trim().toLocaleUpperCase('ru');
  if(maker==='соколов')sku=sku.replace(/\s*№.*$/u,'').trim();
  return maker+'|'+sku;
}
export function validateCampaign(data) {
  if(data?.label!=='11.11'||data.timezone!=='Europe/Moscow'||data.discount_basis!=='ПРЦ'||data.stacking!=='replace'||!Array.isArray(data.items))throw Error('Некорректные условия акции');
  for(const key of ['starts_on','ends_on'])if(!/^\d{4}-\d{2}-\d{2}$/.test(data[key]||'')||!Number.isFinite(Date.parse(data[key]+'T00:00:00Z')))throw Error('Некорректный срок акции');
  if(data.starts_on>data.ends_on)throw Error('Некорректный срок акции');
  const keys=new Set();
  for(const item of data.items){
    const key=campaignKey(item.art,item.brand);
    if(!item.art?.trim()||!item.brand?.trim()||!Number.isInteger(item.discount_percent)||item.discount_percent<=0||item.discount_percent>=100||keys.has(key))throw Error('Некорректный артикул или скидка акции');
    keys.add(key);
  }
  return data;
}
export function campaignForItem(item,data,now=new Date()) {
  if(!data)return null;
  const day=campaignDay(now);
  if(day<data.starts_on||day>data.ends_on)return null;
  const key=campaignKey(item.art,item.marka);
  const match=data.items.find(row=>campaignKey(row.art,row.brand)===key);
  return match?{label:data.label,discount_percent:match.discount_percent,ends_on:data.ends_on}:null;
}
export function withCampaign(item,data,now=new Date()) {
  const campaign=campaignForItem(item,data,now);
  const tags=(item.promotions?.tags||[]).filter(tag=>tag!=='11.11');
  if(campaign)tags.unshift('11.11');
  return {...item,campaign,promotions:{...(item.promotions||{}),tags}};
}
