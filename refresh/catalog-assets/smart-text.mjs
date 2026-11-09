// Domain vocabulary pilot. Missing source attributes remain unconfirmed.
export const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
const compact=v=>norm(v).replace(/[\s‐‑‒–—-]/g,'');
const codeNumber=v=>{const m=compact(v).match(/^(?:юр)?(\d+)$/u);return m?m[1].replace(/^0+(?=\d)/,''):'';};
const defs=[
 ['category','tip','Изделие',/(?:серьг[аи]|сережк[аи])/u,'Серьги'],
 ['category','tip','Изделие',/кольц[оа]/u,'Кольцо'],
 ['category','tip','Изделие',/цепочка|цепочки|цепь|цепи/u,'Цепь'],
 ['category','tip','Изделие',/браслет(?:ы|а)?/u,'Браслет'],
 ['category','tip','Изделие',/подвеск[аи]|кулон(?:ы|а)?/u,'Подвеска'],
 ['metal','metal','Металл',/золот[а-я]*/u,'Золото'],['metal','metal','Металл',/серебр[а-я]*/u,'Серебро'],
 ['color','cvet','Цвет',/красн[а-я]*|розов[а-я]*/u,'Красный'],['color','cvet','Цвет',/бел[а-я]*/u,'Белый'],['color','cvet','Цвет',/желт[а-я]*/u,'Жёлтый'],
 ['lock','lock','Замок',/английск[а-я]*(?:\s+зам[а-я]*)?/u,'Английский'],['lock','lock','Замок',/французск[а-я]*(?:\s+зам[а-я]*)?/u,'Французский'],
 ['earring_style','char2','Тип серёг',/длинн[а-я]*|висяч[а-я]*|висюльк[а-я]*/u,'Длинные'],['earring_style','char2','Тип серёг',/пусет[а-я]*|гвоздик[а-я]*/u,'Пусеты'],['earring_style','char2','Тип серёг',/продевк[а-я]*/u,'Продевки'],['earring_style','char2','Тип серёг',/детск[а-я]*|для\s+детей/u,'Детские'],
 ['ring_type','char2','Тип кольца',/обручальн[а-я]*|свадебн[а-я]*/u,'Обручальное'],
 ['weave','char2','Плетение',/бисмарк[а-я]*/u,'Бисмарк'],['weave','char2','Плетение',/итальянк[а-я]*|италия/u,'Италия'],['weave','char2','Плетение',/якорн[а-я]*/u,'Якорное'],['weave','char2','Плетение',/нонн[а-я]*/u,'Нонна'],['weave','char2','Плетение',/фигаро/u,'Фигаро'],
 ['construction','polnpust','Конструкция',/пустотел[а-я]*/u,'Пустотел'],['construction','polnpust','Конструкция',/полновес[а-я]*|цельн[а-я]*/u,'Полновес'],
 ['style','inspired_by','Под бренд',/под\s+картье|в\s+стиле\s+картье|cartier/u,'Cartier'],
 ['stones','stones','Вставки',/без\s+камней|без\s+вставок|бескаменк[а-я]*/u,'Без камней'],
 ['stones','stones','Вставки',/бриллиант[а-я]*/u,'Бриллианты'],['stones','stones','Вставки',/фианит[а-я]*/u,'Фианит'],
 ['manufacturer','marka','Марка',/соколов[а-я]*|sokolov/u,'Соколов'],['manufacturer','marka','Марка',/каратов[а-я]*|karatov/u,'Каратов'],['manufacturer','marka','Марка',/корон[а-я]*|corona/u,'Корона'],['manufacturer','marka','Марка',/каратник[а-я]*/u,'Каратник'],['manufacturer','marka','Марка',/голден\s*глоб[а-я]*|golden\s*globe/u,'ГолденГлоб']
];
function tokenMatch(rest,re){const r=new RegExp('(^|[^а-яa-z0-9])('+re.source+')(?=$|[^а-яa-z0-9])','u');const m=r.exec(rest);return m?{text:m[2],index:m.index+m[1].length}:null;}
export function parseClientQuery(text){
 const raw=String(text??'').slice(0,600),constraints=[],notes=[];let rest=norm(raw);
 const add=(id,field,label,value,m,extra={})=>{constraints.push({id,field,label,value,...extra});if(m)rest=rest.slice(0,m.index)+' '.repeat(m.text.length)+rest.slice(m.index+m.text.length);};
 // Explicit articles and codes are reserved before interpreting any digits as attributes.
 let m=/(?:артикул\s*[:№]?\s*|арт\.\s*)([а-яa-z0-9][а-яa-z0-9\-/]*)/u.exec(rest);
 if(m)add('article','q','Артикул',m[1],{index:m.index,text:m[0]});
 else {m=/юр\s*[‐‑‒–—-]?\s*\d+/u.exec(rest);if(m)add('article','q','Юр-код',m[0],{index:m.index,text:m[0]});
 else if(/^[\d\s]+$/u.test(rest)&&rest.replace(/\s/g,'').length>=4)add('article','q','Артикул / юр-код',rest.replace(/\s/g,''),{index:0,text:rest});
 else if(/^[а-яa-z0-9][а-яa-z0-9\-/]*$/u.test(rest)&&/\d/u.test(rest)&&(/[а-яa-z-]/u.test(rest)))add('article','q','Артикул',rest,{index:0,text:rest});}
 const origin=tokenMatch(rest,/природн[а-я]*|натуральн[а-я]*|синтетическ[а-я]*|лабораторн[а-я]*|выращенн[а-я]*/u);
 if(origin&&/бриллиант/u.test(rest))add('stone_origin','stones','Бриллиант',/^(природн|натуральн)/u.test(origin.text)?'Природный':'Синтетический',origin);
 for(const [id,field,label,re,value] of defs){if(constraints.some(c=>c.id===id))continue;const hit=tokenMatch(rest,re);if(!hit)continue;
 const prefix=rest.slice(0,hit.index),neg=/не\s*$/u.test(prefix);add(id,field,label,value,hit,{exclude:neg});if(neg)rest=rest.replace(/не(?=\s+$)/u,' ');}
 const assay=tokenMatch(rest,/(?:585|583|750|925|999|375)/u);if(assay)add('assay','proba','Проба',assay.text,assay);
 const size=/(?:размер(?:а|ом)?\s*[:№]?\s*)(\d{1,3}(?:[,.]\d+)?)/u.exec(rest);
 if(size)add('size','size','Размер',size[1].replace('.',','),{index:size.index,text:size[0]});
 else if(!/(?:до|бюджет|руб|₽)/u.test(rest)){const s=/^\s*\d{2}(?:[,.]\d)?\s*$/u.test(rest)?tokenMatch(rest,/\d{2}(?:[,.]\d)?/u):null;if(s&&constraints.some(c=>c.id==='category'))add('size','size','Размер',s.text.replace('.',','),s);}
 if(/(?:до|бюджет|руб|₽)/u.test(rest)&&/\d/u.test(rest))notes.push('Бюджет пока не применяется.');
 const stop=new Set('не из с со для мне нужно нужны нужна хочу покажи найди пожалуйста проба пробы замок замком'.split(' '));
 return {raw,constraints,notes,rest:rest.replace(/[^а-яa-z0-9,./-]+/gu,' ').split(/\s+/u).filter(x=>x&&!stop.has(x))};
}
const list=v=>Array.isArray(v)?v.map(String):v?[String(v)]:[];
function values(item,key){return [...list(item[key]),...list(item.details?.[key])].map(norm).filter(Boolean);}
function fact(item,c){
 const v=norm(c.value);let source=values(item,c.field),hit=false;
 if(c.id==='article'){const q=compact(v),num=codeNumber(v);return {known:true,hit:compact(item.art)===q||(item.codes||[]).some(x=>compact(x)===q||(num&&codeNumber(x)===num))};}
 if(c.id==='size'){source=(item.sizes||[]).filter(s=>s.q>0).map(s=>String(s.s).replace('.',','));return {known:true,hit:source.includes(c.value)};}
 if(c.id==='metal'){source=values(item,'proba');const probe=String(item.proba||'');return {known:source.length>0,hit:c.value==='Золото'?['375','583','585','750','999'].includes(probe):['800','830','875','925','960'].includes(probe)};}
 if(c.id==='stones'||c.id==='stone_origin'){
  source=['kamni','vstavka','main_stone','stone_origin'].flatMap(k=>values(item,k));const s=source.join(' ');
  const diamond=/бриллиант|diamond/u.test(s),synthetic=/синтетич|лаборатор|выращенн|lab[- ]grown|synthetic/u.test(s),natural=/природн|натуральн|natural/u.test(s);
  if(c.id==='stone_origin')return {known:diamond&&(synthetic||natural),hit:diamond&&(c.value==='Природный'?natural&&!synthetic:synthetic)};
  hit=c.value==='Бриллианты'?diamond:c.value==='Без камней'?/бескамен|без\s+(камней|вставок)/u.test(s):s.includes(v);
 }else if(c.id==='color'){const s=source.join(' ');hit=c.value==='Красный'?/^(кр|к|красн|розов)/u.test(s):c.value==='Белый'?/^(б|бел)/u.test(s):/^(ж|желт)/u.test(s);}
 else if(c.id==='style')hit=source.some(x=>/картье|cartier/u.test(x));
 else if(c.id==='earring_style')hit=source.some(x=>c.value==='Длинные'?/длинн|висяч/u.test(x):c.value==='Пусеты'?/пусет|гвоздик/u.test(x):c.value==='Детские'?/детск/u.test(x):/продев/u.test(x));
 else if(c.id==='weave')hit=source.some(x=>c.value==='Италия'?/италия|итальян/u.test(x):x.includes(v));
 else if(c.id==='construction')hit=source.some(x=>c.value==='Пустотел'?/пустотел|пуст/u.test(x):/полновес|полн/u.test(x));
 else if(c.id==='manufacturer')hit=source.some(x=>compact(x)===compact(v));
 else hit=source.some(x=>x.includes(v));
 return {known:source.length>0,hit};
}
export function rankTextProducts(items,parsed,{removed=[]}={}){
 const active=parsed.constraints.filter(c=>!removed.includes(c.id));
 return items.map(item=>{let matched=0;const unmet=[],unknown=[],reasons=[];
  for(const c of active){const {known,hit}=fact(item,c);if(!known)unknown.push({id:c.id,reason:'Не заполнено: '+c.label});else if(c.exclude?hit:!hit)unmet.push(c.id);else {matched++;reasons.push((c.exclude?'Не ': '')+c.label+': '+c.value);}}
  const hay=norm([item.art,item.naim,item.tip,item.char2,item.marka,item.vstavka,...Object.values(item.details||{}).flat()].join(' '));
  const residual=parsed.rest.filter(t=>t.length>1&&hay.includes(t)).length;
  return {item,matched,unmet,unknown,reasons,residual};
 }).sort((a,b)=>a.unmet.length-b.unmet.length||a.unknown.length-b.unknown.length||b.matched-a.matched||b.residual-a.residual);
}
