import {loadAttributeOverrides,applyAttributeOverrides,appendAttributeLink} from './attribute-client.mjs?v=attrs-1109';
import {supportsSize,FILTER_KEYS,TYPE_ORDER,COLORS,EMPTY,prepareItems,blankState,parseState,serializeState,filterItems,facetCounts,valuesFor,sizeCompare,freshness,validPhotoPath,hasProductPhoto,codeNumber,validateData,formatUnitDetails} from './catalog-core.mjs?v=attrs-1109';

import {SELECTIONS,showcase,promotionInfo} from './promotion-core.mjs';
import {campaignDay,validateCampaign,withCampaign} from './campaign-core.mjs?v=1111-2026';
import {appendPhotoUploadLink,loadApprovedPhotos,photoPair} from './photo-client.mjs?v=attrs-1109';
const $=id=>document.getElementById(id);
fetch('staff-config.json',{cache:'no-store'})
  .then(response=>response.ok?response.json():null)
  .then(config=>{
    if(!config || typeof config.url!=='string' || !config.url.trim()) return;
    const url=new URL(config.url,location.href);
    if(url.protocol!=='https:') return;
    const tab=$('staff-tab');
    tab.href=url.href;
    tab.hidden=false;
  })
  .catch(()=>{});
const number=new Intl.NumberFormat('ru-RU');
const labels={inspired_by:'Под бренд',pendant_kind:'Вид подвески',religion:'Религиозная тема',motif:'Мотив / символ',saint:'Образ / святой',selection:'Подборки',tip:'Вид изделия',char2:'Характеристика 2',char3:'Характеристика 3',lock:'Тип замка',thickness:'Толщина',marka:'Марка',size:'Размеры',proba:'Проба',cvet:'Цвет металла',polnpust:'Полновес / Пустотел',kamni:'Камни',stock:'Склад наличия',photo:'Фото'};
const swatches={'КР':'#ca9982','Б':'#d5d8dd','Ж':'#d2b35e','2ЦВ':'linear-gradient(90deg,#d5d8dd 50%,#ca9982 50%)','Ч':'#4d4e52','СЗ':'linear-gradient(90deg,#d5d8dd 50%,#d2b35e 50%)'};
const photoIcon='<svg aria-hidden="true" viewBox="0 0 40 40"><rect x="5" y="7" width="30" height="26" rx="3"/><circle cx="15" cy="16" r="3"/><path d="m6 29 10-9 7 6 5-5 7 7"/></svg>';
let state=parseState(location.search),items=[],filtered=[],domains={},shown=0,generatedAt='',loading=false,approvedPhotos=new Map();
let inputTimer,toastTimer;
let campaignManifest=null,lastCampaignDay='';

function el(tag,className,text) {const node=document.createElement(tag);if(className) node.className=className;if(text!==undefined) node.textContent=text;return node;}
function button(className,text,handler) {const node=el('button',className,text);node.type='button';if(handler) node.addEventListener('click',handler);return node;}
function positionWord(n) {const x=n%100,y=n%10;return x>=11&&x<=14?'позиций':y===1?'позиция':y>=2&&y<=4?'позиции':'позиций';}
function filterLabel(key) {if(key==='char2'&&state.tip==='Серьги')return 'Вид серёг (характеристика 2)';return key==='thickness'&&state.tip==='Кольцо'?'Ширина шинки':labels[key];}
function labelFor(key,value) {
  if(key==='cvet') return COLORS[value]||value;
  if(key==='proba') return value==='585'?'585 золото':value==='925'?'925 серебро':value;
  return value;
}
function updateUrl(mode='push') {
  const query=serializeState(state),url=location.pathname+(query?'?'+query:'');
  if(url!==location.pathname+location.search) history[mode==='replace'?'replaceState':'pushState'](null,'',url);
}
function changeFilter(key,value) {
  clearTimeout(inputTimer);
  state.q=$('search').value.trim();
  state[key]=state[key]===value?'':value;
  if(key==='tip') state.size='';
  updateUrl();render();
}
function resetAll() {
  clearTimeout(inputTimer);state=blankState();$('search').value='';updateUrl();render();
}
function sortedDomain(key) {
  if(key==='selection')return [...(items.some(item=>item.campaign)?['11.11']:[]),...SELECTIONS];
  const values=[...new Set(items.flatMap(item=>key==='size'&&item.tip!==state.tip?[]:valuesFor(item,key)))];
  if(key==='tip') {for(const value of TYPE_ORDER) if(!values.includes(value)) values.push(value);}
  if(key==='proba') {for(const value of ['585','925']) if(!values.includes(value)) values.push(value);}
  if(key==='photo') return ['Без фото','С фото'];
  if(key==='cvet') {for(const value of Object.keys(COLORS)) if(!values.includes(value)) values.push(value);}
  return values.sort((a,b)=>{
    if(a===EMPTY) return 1;if(b===EMPTY) return -1;
    if(key==='size'||key==='thickness') return sizeCompare(a,b);
    if(key==='tip') return (TYPE_ORDER.includes(a)?TYPE_ORDER.indexOf(a):99)-(TYPE_ORDER.includes(b)?TYPE_ORDER.indexOf(b):99)||a.localeCompare(b,'ru');
    return a.localeCompare(b,'ru',{numeric:true});
  });
}
function createChip(key,value,count,kind='chip') {
  const node=button(kind,'',()=>changeFilter(key,value));
  node.dataset.key=key;node.dataset.value=value;
  node.setAttribute('aria-pressed',String(state[key]===value));
  node.disabled=count===0&&state[key]!==value;
  const label=el('span','chip-label');
  if(key==='cvet'&&swatches[value]) {const swatch=el('span','color-swatch');swatch.style.background=swatches[value];swatch.setAttribute('aria-hidden','true');label.append(swatch);}
  label.append(document.createTextNode(key==='photo'?value:labelFor(key,value)));
  node.append(label,el('span','chip-count',number.format(count)));
  node.setAttribute('aria-label',`${key==='photo'?value:labelFor(key,value)} — ${number.format(count)} ${positionWord(count)}`);
  return node;
}
function renderTypes(counts) {
  const fragment=document.createDocumentFragment();
  const withoutType={...state,tip:'',size:''};
  const total=filterItems(items,withoutType).length;
  const all=button('type-chip','',()=>{state.tip='';state.size='';updateUrl();render();});
  all.setAttribute('aria-pressed',String(!state.tip));all.append(el('span','','Все изделия'),el('span','chip-count',number.format(total)));fragment.append(all);
  for(const value of domains.tip) fragment.append(createChip('tip',value,counts.get(value)||0,'type-chip'));
  $('types').replaceChildren(fragment);
}
function renderFilters(counts,host,mobile=false) {
  const scroll=host.scrollTop,fragment=document.createDocumentFragment();
  const primaryKeys=['selection','tip','proba','marka','stock','size','char2','char3'];
  const keys=[...primaryKeys,...FILTER_KEYS.filter(key=>!primaryKeys.includes(key))];
  for(const key of keys) {
    if(['pendant_kind','religion','motif','saint'].includes(key)&&state.tip!=='Подвеска'&&!state[key])continue;
    if(key==='size'&&!supportsSize(state.tip)) continue;
    if(key==='lock'&&state.tip!=='Серьги'&&!state.lock) continue;
    const fieldset=el('fieldset','filter-group'),legend=el('legend','',key==='char2'&&['Цепь','Браслет'].includes(state.tip)?'Плетение (характеристика 2)':filterLabel(key));fieldset.append(legend);
    const chips=el('div','chips'+(key==='size'?' size-chips':['stock','kamni','cvet','marka','char2','char3'].includes(key)?' full-width':''));
    const values=key==='size'?sortedDomain(key):[...domains[key]];
    if(state[key]&&!values.includes(state[key])) values.push(state[key]);
    for(const value of values) chips.append(createChip(key,value,counts[key].get(value)||0));
    if(['marka','char2','char3','thickness'].includes(key)) chips.classList.add('manufacturer-chips');
    fieldset.append(chips);fragment.append(fieldset);
  }
  host.replaceChildren(fragment);host.scrollTop=scroll;
}
function render() {
  const oldFocus=document.activeElement;
  // Запоминаем контейнер до замены элементов для клавиатурной навигации.
  const focusHost=oldFocus?.closest('#mobile-filters,#desktop-filters,#types')?.id;
  const focusKey=oldFocus?.dataset.key,focusValue=oldFocus?.dataset.value;
  filtered=filterItems(items,state);
  const counts=Object.fromEntries(FILTER_KEYS.map(key=>[key,facetCounts(items,state,key)]));
  const isRing=state.tip==='Кольцо';
  $('ring-kind-filter').hidden=!isRing;
  $('wedding-filters').hidden=!(isRing&&state.char2==='Обручальное');
  const fillSelect=(id,key,prompt)=>{
    const options=document.createDocumentFragment(),all=el('option','',prompt);all.value='';options.append(all);
    for(const value of domains[key]) {
      const count=counts[key].get(value)||0;if(!count&&state[key]!==value)continue;
      const option=el('option','',`${value} · ${count}`);option.value=value;option.disabled=!count;options.append(option);
    }
    $(id).replaceChildren(options);$(id).value=state[key];
  };
  const isEarring=state.tip==='Серьги';$('earring-filters').hidden=!isEarring;
  if(isEarring) {
    fillSelect('earring-kind-select','char2','Все виды серёг');
    fillSelect('earring-detail-select','char3','Все значения');
    fillSelect('earring-lock-select','lock','Все типы замка');
    $('earring-lock-note').hidden=items.some(item=>item.tip==='Серьги'&&item.details?.lock?.length);
  }
  if(isRing) fillSelect('ring-kind-select','char2','Все виды колец');
  if(isRing&&state.char2==='Обручальное') {
    fillSelect('ring-style-select','char3','Все значения');
    fillSelect('ring-width-select','thickness','Любая ширина');
  }
  const showWeave=['Цепь','Браслет'].includes(state.tip);
  $('weave-filter').hidden=!showWeave;
  if(showWeave) {
    const options=document.createDocumentFragment(),all=el('option','','Все плетения');all.value='';options.append(all);
    for(const value of domains.char2) {
      const count=counts.char2.get(value)||0;if(!count&&state.char2!==value)continue;
      const option=el('option','',`${value} · ${count}`);option.value=value;option.disabled=!count;options.append(option);
    }
    $('weave-select').replaceChildren(options);$('weave-select').value=state.char2;
  }
  renderTypes(counts.tip);renderFilters(counts,$('desktop-filters'));renderFilters(counts,$('mobile-filters'),true);
  const title=state.q?'Результаты поиска':state.tip||'Все изделия';
  $('results-title').firstChild.textContent=title+' ';
  $('result-count').textContent=number.format(filtered.length);
  $('header-count').textContent=`${number.format(filtered.length)} ${positionWord(filtered.length)}`;
  $('results-announcement').textContent=`Найдено: ${number.format(filtered.length)} ${positionWord(filtered.length)}`;
  $('apply-filters').textContent=`Показать ${number.format(filtered.length)}`;
  const selected=FILTER_KEYS.filter(key=>state[key]);
  $('filter-count').hidden=selected.length===0;$('filter-count').textContent=selected.length;
  $('open-filters').setAttribute('aria-label',selected.length?`Фильтры, выбрано ${selected.length}`:'Фильтры');
  $('clear-search').hidden=!state.q;
  document.querySelectorAll('.reset-all').forEach(node=>node.disabled=!state.q&&!selected.length);
  const summary=document.createDocumentFragment();
  for(const key of ['q',...FILTER_KEYS]) if(state[key]) {
    const value=key==='q'?`Поиск: ${state.q}`:['char2','char3','thickness'].includes(key)?`${filterLabel(key)}: ${state[key]}`:labelFor(key,state[key]);
    const chip=button('selection-pill','',()=>{state[key]='';if(key==='q')$('search').value='';if(key==='tip')state.size='';updateUrl();render();});
    chip.setAttribute('aria-label','Снять: '+value);chip.append(el('span','',value),el('span','','×'));summary.append(chip);
  }
  $('selection-summary').replaceChildren(summary);$('selection-summary').hidden=!state.q&&!selected.length;
  $('cards').replaceChildren();shown=0;
  $('empty-panel').hidden=filtered.length!==0;
  appendCards();
  if(focusHost&&focusKey) {
    const next=[...$(focusHost).querySelectorAll('button')].find(b=>b.dataset.key===focusKey&&b.dataset.value===focusValue);
    next?.focus({preventScroll:true});
  }
}
function placeholder() {
  const node=el('div','photo-placeholder');node.innerHTML=photoIcon;node.append(el('span','','Нет фото'));return node;
}
function openPhoto(item) {
  $('large-photo').src=item.photo;$('large-photo').alt=`${item.tip}, ${item.art}`;
  $('photo-caption').textContent=item.art;$('photo-dialog').showModal();
}
function card(item) {
  const article=el('article','card');article.dataset.art=item.art;
  const visual=el('div','card-photo');
  if(validPhotoPath(item.photo)||item.photoSource==='approved') {
    const open=button('photo-button','',()=>openPhoto(item));open.setAttribute('aria-label',`Открыть фото ${item.art}`);
    const img=el('img');img.src=item.photo;img.alt=`${item.tip}, ${item.art}`;img.loading='lazy';img.decoding='async';img.width=480;img.height=480;
    img.addEventListener('error',()=>{if(item.photoSource==='approved'&&validPhotoPath(item.photoFallback)&&img.dataset.fallback!=='1'){img.dataset.fallback='1';img.src=item.photoFallback;}else open.replaceWith(placeholder());});open.append(img);visual.append(open);
  } else visual.append(placeholder());
  const body=el('div','card-body'),heading=el('div'),art=el('h2','article-code');
  if(item.art.startsWith('Без артикула · ')) {art.append(el('span','unknown-article','Без артикула'),document.createTextNode(item.art.slice('Без артикула · '.length)));}
  else art.textContent=item.art;
  heading.append(art,el('p','item-title',[item.tip,item.char2].filter(Boolean).join(' · ')));
  const tags=el('div','tags');
  const tagValues=[item.proba?{label:labelFor('proba',item.proba),style:item.proba==='585'?'gold':'silver'}:null,
    item.cvet?{label:labelFor('cvet',item.cvet)}:null,item.polnpust?{label:item.polnpust}:null,item.kamni?{label:item.kamni==='Не определено'?'Камни не определены':item.kamni}:null];
  for(const tag of tagValues.filter(Boolean)) tags.append(el('span','tag '+(tag.style||''),tag.label));
  body.append(heading,tags);appendPhotoUploadLink(body,item.art,item.marka);appendAttributeLink(body,item.art,item.marka);
  const stickers=el('div','photo-stickers');
  const titles={'Вернулись в наличие':'Вернулось в продажу','Пополнили размеры':'Поступили размеры','11.11':item.campaign?`11.11 · −${item.campaign.discount_percent}%`:'11.11'};
  const colors={'11.11':'campaign1111','Хит':'hit','Хит месяца':'hit','Новинка':'new','Новинка месяца':'new','Вернулись в наличие':'returned','Пополнили размеры':'sizes','Скоро в продаже':'coming'};
  for(const label of item.promotions?.tags||[])stickers.append(el('span','photo-sticker '+(colors[label]||''),titles[label]||label));
  visual.append(stickers);
  if(item.campaign){const end=item.campaign.ends_on.split('-').reverse().join('.');body.append(el('p','campaign-detail',`Скидка от ПРЦ: ${item.campaign.discount_percent}%. По ${end} включительно. Обычные 20% не суммируются.`));}
  if(item.promotions?.expected_date)body.append(el('p','insertion','Ожидается: '+item.promotions.expected_date));
  else if(item.promotions?.tags.includes('Скоро в продаже'))body.append(el('p','insertion','Дата поступления уточняется'));
  if(item.promotions?.replenished_sizes?.length)body.append(el('p','insertion','Пополнили размеры: '+item.promotions.replenished_sizes.join(', ')));
  if(!item.units)body.append(el('p','insertion','Ещё не в наличии'));
  if(item.marka) body.append(el('p','insertion',item.marka));
  if(item.naim) {
    const details=el('details','item-description');details.append(el('summary','','Полное наименование'),el('p','',item.naim));body.append(details);
  }
  if(item.details && Object.keys(item.details).length) {
    const block=el('details','item-description characteristics');
    block.append(el('summary','','Характеристики'));
    const list=el('dl','characteristics-list');
    const names={char2:['Цепь','Браслет'].includes(item.tip)?'Плетение (характеристика 2)':'Характеристика 2',char3:'Характеристика 3',thickness:item.tip==='Кольцо'?'Ширина шинки':'Толщина (как в таблице)',lock:'Тип замка',inspired_by:'Под бренд',pendant_kind:'Вид подвески',religion:'Религиозная тема',motif:'Мотив / символ',saint:'Образ / святой',main_stone:'Основной камень',stone_color:'Цвет камня',stone_cut:'Огранка',weight:'Вес, г',vstavka:'Вставки',polnpust:'Полновесность'};
    for(const [key,name] of Object.entries(names)) {
      const values=item.details[key];if(!values?.length)continue;
      list.append(el('dt','',name),el('dd','',values.join('; ')));
    }
    block.append(list);
    if(Object.values(item.details).some(values=>values.length>1)) block.append(el('p','no-sizes','Перечислены значения у разных изделий этого артикула в наличии.'));
    body.append(block);
  } else if(item.vstavka) body.append(el('p','insertion',item.vstavka));
  const stocks=el('div','stock-list');stocks.setAttribute('aria-label','Остатки по складам');
  for(const [stock,quantity] of Object.entries(item.stocks)) {
    const badge=el('span','stock-badge'+(stock==='Склад не указан'?' unknown':''));badge.append(el('span','',stock),el('strong','',`· ${quantity}`));stocks.append(badge);
  }
  body.append(stocks);
  const sizes=el('div','sizes-block'),sizeTitle=el('div','sizes-heading');
  sizeTitle.append(el('span','',['Цепь','Браслет','Колье'].includes(item.tip)?'Размер / длина':'Размеры'),el('span','unit-total',`${item.units} шт.`));sizes.append(sizeTitle);
  const sizeList=el('div','size-list');
  for(const size of item.sizes) sizeList.append(el('span','size-badge'+(state.size===size.s?' selected':''),`${size.s} · ${size.q}`));
  if(!item.sizes.length) sizeList.append(el('p','no-sizes','Не указаны'));
  sizes.append(sizeList);body.append(sizes);
  if(item.stock_codes) {
    const codes=el('details','unit-codes');codes.append(el('summary','','ЮР-коды по точкам'));
    for(const [stock,entries] of Object.entries(item.stock_codes)) {
      const group=el('section','unit-code-store');group.append(el('h3','',stock));
      const list=el('ul','unit-code-list');
      for(const entry of entries) {
        const row=el('li',entry.code?'':'unknown-code');
        const display=entry.code?(codeNumber(entry.code)||entry.code):'Код неизвестен';
        const code=el('span','unit-code',display);code.title=entry.code||'Код неизвестен';
        const facts=formatUnitDetails(entry),values=el('span','unit-code-values');
        values.append(el('span','unit-code-grams',facts.grams),el('span','unit-code-prc',facts.prc),el('span','unit-code-size',facts.size));
        row.append(code,values);list.append(row);
      }
      group.append(list);codes.append(group);
    }
    body.append(codes);
  }
  article.append(visual,body);return article;
}
function appendCards() {
  const portion=filtered.slice(shown,shown+60),fragment=document.createDocumentFragment();
  for(const item of portion) fragment.append(card(item));$('cards').append(fragment);shown+=portion.length;
  $('load-more-wrap').hidden=!filtered.length;
  $('shown-count').textContent=`Показано ${number.format(shown)} из ${number.format(filtered.length)}`;
  $('load-more').hidden=shown>=filtered.length;
  $('load-more').textContent=`Показать ещё ${Math.min(60,filtered.length-shown)}`;
}
function updateFreshness() {
  if(!generatedAt) return;
  const status=freshness(generatedAt),node=$('freshness');node.classList.toggle('stale',status.stale);node.textContent=status.label;
  if(status.stale&&status.date) node.append(el('small','',`Остатки на ${status.date}`));
}
async function load() {
  if(loading) return;loading=true;$('loading-panel').hidden=false;$('error-panel').hidden=true;
  try {
    const response=await fetch('./data.json',{cache:'no-cache'});
    if(!response.ok) throw new Error('Не удалось прочитать данные');
    const data=validateData(await response.json());
    const promoResponse=await fetch('./promotions.json',{cache:'no-cache'});if(!promoResponse.ok)throw Error('Подборки недоступны');const promotions=await promoResponse.json();
    const campaignResponse=await fetch('./campaign-1111.json',{cache:'no-store'});if(!campaignResponse.ok)throw Error('Условия акции недоступны');campaignManifest=validateCampaign(await campaignResponse.json());lastCampaignDay=campaignDay();
    let attributeOverrides=new Map();try{attributeOverrides=await loadAttributeOverrides();}catch(e){const warning=el('p','no-sizes',e.message);$('results').prepend(warning);}
    generatedAt=data.generated_at;approvedPhotos=await loadApprovedPhotos();items=prepareItems(showcase(data,promotions).items.map(source=>{const p=applyAttributeOverrides(source,attributeOverrides);const approved=approvedPhotos.get(photoPair(p.art,p.marka));return withCampaign({...p,...(approved?{photo:approved.url,photoFallback:p.photo,photoSource:'approved'}:{}),promotions:promotionInfo(p,promotions)},campaignManifest);}));
    domains=Object.fromEntries(FILTER_KEYS.map(key=>[key,sortedDomain(key)]));
    $('search').value=state.q;updateFreshness();render();
    $('search').disabled=false;$('open-filters').disabled=false;$('share-selection').disabled=false;
    const withoutPhoto=items.filter(item=>!hasProductPhoto(item)).length;
    $('footer').textContent=`Источник: Товар_Каратник · Исходники. Дата обновления указана вверху каталога. Без фото: ${number.format(withoutPhoto)} из ${number.format(items.length)}.`;
  } catch(error) {
    $('error-panel').hidden=false;$('freshness').textContent='Остатки недоступны';$('freshness').classList.add('stale');
    $('error-message').textContent=location.protocol==='file:'?'Откройте каталог по локальной ссылке из инструкции.':'Не удалось загрузить данные. Проверьте подключение и повторите попытку.';
  } finally {loading=false;$('loading-panel').hidden=true;}
}
for(const [id,key] of [['earring-kind-select','char2'],['earring-detail-select','char3'],['earring-lock-select','lock'],['ring-kind-select','char2'],['ring-style-select','char3'],['ring-width-select','thickness']]) $(id).addEventListener('change',event=>{state[key]=event.target.value;updateUrl();render();});
$('weave-select').addEventListener('change',event=>{state.char2=event.target.value;updateUrl();render();});
$('search').addEventListener('input',()=>{clearTimeout(inputTimer);inputTimer=setTimeout(()=>{state.q=$('search').value.trim();updateUrl('replace');render();},100);});
$('search').addEventListener('keydown',event=>{if(event.key==='Enter'){clearTimeout(inputTimer);state.q=$('search').value.trim();updateUrl('replace');render();$('search').blur();}});
$('clear-search').addEventListener('click',()=>{clearTimeout(inputTimer);state.q='';$('search').value='';updateUrl();render();$('search').focus();});
document.querySelectorAll('.reset-all').forEach(node=>node.addEventListener('click',resetAll));
$('load-more').addEventListener('click',appendCards);$('retry').addEventListener('click',load);
$('open-filters').addEventListener('click',()=>{document.body.style.overflow='hidden';$('filter-dialog').showModal();});
for(const id of ['close-filters','apply-filters']) $(id).addEventListener('click',()=>$('filter-dialog').close());
$('filter-dialog').addEventListener('close',()=>{document.body.style.overflow='';$('open-filters').focus({preventScroll:true});});
$('close-photo').addEventListener('click',()=>$('photo-dialog').close());
for(const id of ['filter-dialog','photo-dialog']) $(id).addEventListener('click',event=>{const box=$(id).getBoundingClientRect();if(event.target===$(id)&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))$(id).close();});
$('share-selection').addEventListener('click',async()=>{
  clearTimeout(inputTimer);state.q=$('search').value.trim();updateUrl('replace');render();
  let message='Ссылка находится в адресной строке — её можно скопировать';
  try {await navigator.clipboard.writeText(location.href);message='Ссылка на выборку скопирована';} catch {}
  $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);
});
window.addEventListener('popstate',()=>{clearTimeout(inputTimer);state=parseState(location.search);$('search').value=state.q;if(items.length)render();});
new ResizeObserver(()=>document.documentElement.style.setProperty('--header-height',`${$('site-header').getBoundingClientRect().height}px`)).observe($('site-header'));
if('IntersectionObserver' in window) new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&shown<filtered.length) appendCards();},{rootMargin:'350px'}).observe($('load-more-wrap'));
setInterval(()=>{updateFreshness();if(items.length&&campaignManifest&&campaignDay()!==lastCampaignDay){lastCampaignDay=campaignDay();items=prepareItems(items.map(item=>withCampaign(item,campaignManifest)));domains=Object.fromEntries(FILTER_KEYS.map(key=>[key,sortedDomain(key)]));render();}},60000);
load();
