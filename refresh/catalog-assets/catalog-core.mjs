// Чистые функции поиска и фильтров: используются страницей и проверками.
export const FILTER_KEYS = ['selection','tip','size','char2','char3','thickness','lock','marka','proba','cvet','polnpust','kamni','stock','photo','inspired_by','pendant_kind','religion','motif','saint'];
export const PHOTO_FILTER_VALUES = ['Без фото','С фото'];
export const supportsSize = tip => ['Кольцо','Цепь','Браслет','Колье'].includes(tip);
export const TYPE_ORDER = ['Кольцо','Серьги','Цепь','Браслет','Подвеска','Колье','Пирсинг','Брошь'];
export const COLORS = {'КР':'Красное (розовое)','Б':'Белое','Ж':'Жёлтое','2ЦВ':'Двухцветное','Ч':'Чёрное','СЗ':'Серебро с золотом'};
export const EMPTY = 'Не указано';
export const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
export const compact = value => normalize(value).replace(/[-‐‑‒–—\s]/g,'');
export const codeNumber = value => {
  const match=compact(value).match(/^(?:юр)?(\d+)$/);
  return match ? match[1].replace(/^0+(?=\d)/,'') : '';
};
export function prepareItems(items) {
  return items.map(item => ({...item,
    _search:normalize([item.art,item.naim,item.vstavka,item.marka,...(item.promotions?.tags||[])].join(' ')),
    _art:compact(item.art),
    _codes:(item.codes||[]).map(compact),
    _codeNumbers:(item.codes||[]).map(codeNumber).filter(Boolean)
  }));
}
export function blankState() {return {q:'',...Object.fromEntries(FILTER_KEYS.map(k=>[k,'']))};}
export function parseState(search) {
  const params = new URLSearchParams(search), state=blankState();
  for(const key of ['q',...FILTER_KEYS]) state[key]=params.get(key) || '';
  if(!supportsSize(state.tip)) state.size='';
  return state;
}
export function serializeState(state) {
  const params=new URLSearchParams();
  for(const key of ['q',...FILTER_KEYS]) if(state[key] && (key!=='size'||supportsSize(state.tip))) params.set(key,state[key]);
  return params.toString();
}
export function valuesFor(item,key) {
  if(['char2','char3','thickness','lock','inspired_by','pendant_kind','religion','motif','saint'].includes(key)) {
    const values=item.details?.[key];
    return values?.length?values:[item[key] || EMPTY];
  }
  if(key==='selection') return item.promotions?.tags||[];
  if(key==='stock') return Object.keys(item.stocks);
  if(key==='photo') return [hasProductPhoto(item)?'С фото':'Без фото'];
  if(key==='size') return item.sizes.map(s=>s.s);
  return [item[key] || EMPTY];
}
export function matches(item,state,except='') {
  const query=normalize(state.q);
  const number=codeNumber(query);
  const codeMatch=number ? item._codeNumbers?.includes(number) : item._codes?.some(code=>code.includes(compact(query)));
  if(query && !item._search.includes(query) && !(compact(query)&&item._art.includes(compact(query))) && !codeMatch) return false;
  for(const key of FILTER_KEYS) {
    if(key===except || !state[key] || (key==='size'&&!supportsSize(state.tip))) continue;
    if(!valuesFor(item,key).includes(state[key])) return false;
  }
  return true;
}
export function filterItems(items,state) {return items.filter(item=>matches(item,state));}
export function facetCounts(items,state,key) {
  const result=new Map();
  const effective=key==='tip'?{...state,size:''}:state;
  for(const item of items) if(matches(item,effective,key)) for(const value of new Set(valuesFor(item,key))) result.set(value,(result.get(value)||0)+1);
  return result;
}
export function sizeCompare(a,b) {
  const number=value=>Number.parseFloat(value.replace(',','.'));
  const x=number(a),y=number(b);
  if(Number.isFinite(x)&&Number.isFinite(y)) return x-y || a.localeCompare(b,'ru');
  if(Number.isFinite(x)) return -1;
  if(Number.isFinite(y)) return 1;
  return a.localeCompare(b,'ru');
}
export function freshness(generatedAt,now=Date.now()) {
  const time=Date.parse(generatedAt);
  if(!Number.isFinite(time)) return {stale:true,label:'Дата обновления неизвестна',date:''};
  const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(time);
  const stale=now-time>36*60*60*1000;
  return {stale,label:stale?'Данные устарели, уточняйте остатки у коллег':`Остатки на ${date}`,date};
}
export function validPhotoPath(value) {
  return typeof value==='string' && /^photos\/[^/\\]+\.webp$/i.test(value) && !value.includes('..');
}
export function isApprovedPhotoUrl(value) {
  return typeof value==='string' && /^https:\/\/karatnik-product-photos\.workspace-903713\.chatgpt\.site\/api\/images\/[0-9a-f-]{36}$/i.test(value);
}
export function hasProductPhoto(item) {
  return validPhotoPath(item?.photo) || (item?.photoSource==='approved' && isApprovedPhotoUrl(item.photo));
}
export function validateData(data) {
  if(!data || !Array.isArray(data.items) || !Number.isFinite(Date.parse(data.generated_at))) throw new Error('Некорректный файл каталога');
  const seen=new Set();
  for(const item of data.items) {
    if(!item || typeof item.art!=='string' || !item.art || seen.has(item.art) || !Array.isArray(item.sizes) || !item.stocks || typeof item.stocks!=='object' || Array.isArray(item.stocks) || !Number.isInteger(item.units) || item.units<1) throw new Error('Некорректная карточка');
    seen.add(item.art);
    for(const field of ['tip','char2','proba','cvet','polnpust','kamni','marka','vstavka','naim','photo']) if(typeof item[field]!=='string') throw new Error('Некорректные характеристики');
    if(Object.values(item.stocks).some(q=>!Number.isInteger(q)||q<1) || Object.values(item.stocks).reduce((a,b)=>a+b,0)!==item.units) throw new Error('Некорректные остатки');
    if(item.stock_codes!==undefined) {
      if(!item.stock_codes||typeof item.stock_codes!=='object'||Array.isArray(item.stock_codes)||Object.keys(item.stock_codes).length!==Object.keys(item.stocks).length||Object.keys(item.stock_codes).some(stock=>!Object.hasOwn(item.stocks,stock))) throw new Error('Склады в кодах единиц не совпадают с остатками');
      for(const [stock,entries] of Object.entries(item.stock_codes)) {
        if(!Array.isArray(entries)||entries.length!==item.stocks[stock]) throw new Error('Число кодов единиц не совпадает с остатком по складу');
        if(entries.some(entry=>!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!['code','size','grams','prc'].includes(key))||typeof entry.code!=='string'||typeof entry.size!=='string'||['grams','prc'].some(key=>entry[key]!==undefined&&(typeof entry[key]!=='number'||!Number.isFinite(entry[key])||entry[key]<0||(key==='grams'&&entry[key]===0))))) throw new Error('Неверная запись кода единицы');
      }
    }
    if(item.sizes.some(s=>typeof s.s!=='string'||!Number.isInteger(s.q)||s.q<1)) throw new Error('Некорректные размеры');
  }
  return data;
}

const gramFormat=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3});
const rubleFormat=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
export function formatUnitDetails(entry) {
  return {
    grams: typeof entry.grams==='number'&&Number.isFinite(entry.grams)&&entry.grams>0 ? gramFormat.format(entry.grams)+' г' : 'Вес —',
    prc: typeof entry.prc==='number'&&Number.isFinite(entry.prc)&&entry.prc>=0 ? 'ПРЦ '+rubleFormat.format(entry.prc)+' ₽' : 'ПРЦ —',
    size: entry.size ? 'Размер '+entry.size : 'Размер —'
  };
}
