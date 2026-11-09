import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseClientQuery as parse,rankTextProducts as rank} from './catalog-assets/smart-text.mjs';
const fixture=(art,extra={})=>({art,marka:'Соколов',tip:'Серьги',proba:'585',cvet:'Б',char2:'Длинные',details:{char2:['Длинные'],lock:['Английский'],inspired_by:['Cartier']},kamni:'Бриллиантовая',vstavka:'Природный бриллиант',sizes:[],codes:['ЮР-00027654'],units:1,...extra});
const a=fixture('TEST1'),synthetic=fixture('TEST2',{vstavka:'Синтетический бриллиант'}),unknown=fixture('TEST3',{vstavka:''});
function confirmed(items,q,opts){return rank(items,parse(q),opts).filter(x=>!x.unmet.length&&!x.unknown.length);}
assert.equal(confirmed([a,synthetic,unknown],'Длинные серьги из белого золота с английским замком').length,3);
assert.deepEqual(confirmed([a,synthetic,unknown],'серьги природный бриллиант').map(x=>x.item.art),['TEST1']);
assert.deepEqual(confirmed([a,synthetic,unknown],'серьги синтетический бриллиант').map(x=>x.item.art),['TEST2']);
assert.equal(rank([unknown],parse('серьги природный бриллиант'))[0].unknown[0].id,'stone_origin');
assert.equal(confirmed([a,synthetic],'серьги бриллианты').length,2);
assert.equal(confirmed([a],'серьги под картье')[0].matched,2);
assert.equal(confirmed([fixture('OTHER',{details:{},marka:'Cartier'})],'серьги под картье').length,0);
for(const q of ['27654','ЮР-00027654','юр 27654']){assert.equal(confirmed([a],q)[0].item.art,'TEST1');assert.equal(parse(q).constraints.some(c=>c.id==='size'),false);}
assert.equal(confirmed([a],'2765').length,0);
assert.equal(parse('артикул 00058500').constraints.length,1);
assert.equal(parse('артикул 01-2169').constraints[0].value,'01-2169');
assert.equal(parse('Т100613928').constraints[0].id,'article');
assert.equal(parse('серьги до 15000 рублей').constraints.some(c=>c.id==='size'),false);
for(const q of ['Соколов','Соколова','Каратов','Каратова','Корона','Каратник','Голден Глоб'])assert.equal(parse(q).constraints[0].id,'manufacturer',q);
const chain=fixture('CHAIN',{tip:'Цепь',char2:'Италия',polnpust:'Полновес',details:{char2:['Италия']},sizes:[{s:'55',q:1}]});
assert.equal(confirmed([chain],'полновесная цепь итальянка 585 размер 55').length,1);
const ring=fixture('RING',{tip:'Кольцо',char2:'Обручальное',details:{char2:['Обручальное']},sizes:[{s:'17,5',q:1}]});
assert.equal(confirmed([ring],'не обручальное кольцо').length,0);
assert.equal(confirmed([ring],'не обручальное кольцо',{removed:['ring_type']}).length,1);
assert.equal(confirmed([ring],'кольцо размер 17.5').length,1);
assert.equal(confirmed([ring],'кольцо размер 17').length,0);
const data=JSON.parse(fs.readFileSync('site/data.json','utf8')).items;
const real=confirmed(data,'цепь бисмарк 585 размер 55');for(const r of real){assert.ok(r.reasons.length===4);assert.ok(r.item.char2.includes('Бисмарк')||r.item.char2.includes('бисмарк'));}
console.log('Text search: 32+ assertions passed; real catalog chain selection',real.length);

assert.equal(confirmed([fixture('OTHER',{codes:['ЮР-00012169']})],'01-2169').length,0);
assert.equal(confirmed([fixture('OTHER',{codes:['ЮР-00029556']})],'артикул 29556').length,0);
assert.equal(confirmed([fixture('29556',{codes:[]})],'юр-29556').length,0);
