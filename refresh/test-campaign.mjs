import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateCampaign,campaignForItem,withCampaign} from './catalog-assets/campaign-core.mjs';
const data=validateCampaign(JSON.parse(fs.readFileSync(new URL('./catalog-assets/campaign-1111.json',import.meta.url),'utf8')));
assert.equal(data.items.length,94);
const first=data.items[0],item={art:first.art,marka:first.brand,promotions:{tags:['Хит','Новинка']}};
assert.equal(campaignForItem(item,data,new Date('2026-11-10T20:59:59Z')),null);
assert.equal(campaignForItem(item,data,new Date('2026-11-10T21:00:00Z')).discount_percent,50);
assert.equal(campaignForItem(item,data,new Date('2026-11-13T20:59:59Z')).discount_percent,50);
assert.equal(campaignForItem(item,data,new Date('2026-11-13T21:00:00Z')),null);
assert.equal(campaignForItem({...item,marka:'Другой завод'},data,new Date('2026-11-12T09:00:00Z')),null);
const active=withCampaign(item,data,new Date('2026-11-12T09:00:00Z'));
assert.deepEqual(active.promotions.tags,['11.11','Хит','Новинка']);
assert.equal(active.campaign.discount_percent,50);
assert.deepEqual(withCampaign(active,data,new Date('2026-11-13T21:00:00Z')).promotions.tags,['Хит','Новинка']);
assert.equal(campaignForItem({art:'1011615 №26 76',marka:'Соколов'},data,new Date('2026-11-12T09:00:00Z')).discount_percent,50);
assert.equal(campaignForItem({art:'ЗК1002/Вбр',marka:'Каратник'},data,new Date('2026-11-12T09:00:00Z')).discount_percent,50);
assert.equal(campaignForItem({art:'ЗК1002/ВБр.',marka:'Каратник'},data,new Date('2026-11-12T09:00:00Z')).discount_percent,40);
assert.throws(()=>validateCampaign({...data,items:[data.items[0],data.items[0]]}));
assert.throws(()=>validateCampaign({...data,items:[{...data.items[0],discount_percent:150}]}));
console.log('Акция: 94 артикула, сроки по Москве, проценты, разные варианты и сохранение других меток проверены.');

import {defaultPromotionOrder} from './catalog-assets/promotion-core.mjs';
import {prepareItems,filterItems,blankState} from './catalog-assets/catalog-core.mjs';
const sample=[
 {art:'ordinary',promotions:{tags:[]}},
 {art:'new',promotions:{tags:['Новинка']}},
 {art:'month',promotions:{tags:['Новинка','Новинка месяца']}},
 {art:'latest',promotions:{tags:['Новинка','Новинка месяца','Последнее поступление']}}
];
assert.deepEqual(defaultPromotionOrder(sample,blankState()).map(x=>x.art),['latest','month','new','ordinary']);
assert.deepEqual(sample.map(x=>x.art),['ordinary','new','month','latest']);
for(const state of [{q:'кольцо'},{stock:'Ленинградская 33'},{tip:'Кольцо'}])assert.deepEqual(defaultPromotionOrder(sample,{...blankState(),...state}),sample);
const model=prepareItems([{art:'КЛ-63',marka:'ГолденГлоб',naim:'Кольцо',sizes:[{s:'17',q:1}],codes:['ЮР-1'],stocks:{A:1},units:1}]);
for(const q of ['КЛ-63','КольцоКЛ-63','КольцоКЛ-63/17,0/бцФ/з585'])assert.equal(filterItems(model,{...blankState(),q}).length,1);
assert.equal(filterItems(model,{...blankState(),q:'КольцоКЛ-63/17,0/бцФ/бз585'}).length,0);
console.log('Default new-first ordering, active-filter order and confirmed article aliases passed');

{
 const {prepareItems,filterItems,blankState,valuesFor,formatUnitDetails,validateData}=await import('./catalog-assets/catalog-core.mjs');
 const assert=(await import('node:assert/strict')).default;
 const bracelet={art:'БрЛТннс01',marka:'ГолденГлоб',tip:'Браслет',char2:'',proba:'585',cvet:'КР',polnpust:'',kamni:'Фианит',vstavka:'',naim:'Браслет',photo:'',units:1,stocks:{A:1},sizes:[{s:'18',q:1}],codes:['TEST'],stock_codes:{A:[{code:'TEST',size:'18',cvet:'Б'}]},details:{cvet:['Б','КР']}};
 validateData({generated_at:'2026-11-18T00:00:00Z',items:[bracelet]});
 assert.equal(filterItems(prepareItems([bracelet]),{...blankState(),q:'БрЛТннс01_18см_бцФ_бз585'}).length,1);
 assert.deepEqual(valuesFor(bracelet,'cvet'),['Б','КР']);
 assert.equal(formatUnitDetails(bracelet.stock_codes.A[0]).color,'Белое');
 const chain=prepareItems([{...bracelet,art:'ЦНН20517035',marka:'Каратов'}]);
 assert.equal(filterItems(chain,{...blankState(),q:'ЦНН20517035-РА'}).length,1);
}


{
 const stocked=(art,tags=[],stocks={'Ленинградская 33':1})=>({art,stocks,promotions:{tags}});
 const input=[
  stocked('unknown-latest',['Последнее поступление'],{'Склад не указан':1}),
  stocked('known-ordinary'),
  stocked('mixed',['Новинка'],{'Склад не указан':1,'Гостинка (В.Е.Левин)':1}),
  stocked('no-stock',[],{}),
  stocked('known-latest',['Последнее поступление']),
  stocked('zero-stock',[],{'Ленинградская 33':0}),
  stocked('upcoming',['Скоро в продаже'],undefined)
 ];
 delete input.at(-1).stocks;
 const original=structuredClone(input);
 assert.deepEqual(defaultPromotionOrder(input,blankState()).map(x=>x.art),['known-latest','mixed','known-ordinary','unknown-latest','no-stock','zero-stock','upcoming']);
 for(const state of [{q:'кольцо'},{stock:'Склад не указан'},{tip:'Кольцо'},{rubMin:'1000'},{set:'SET-0001'}]){
  assert.deepEqual(defaultPromotionOrder(input,{...blankState(),...state}).map(x=>x.art),['known-ordinary','mixed','known-latest','unknown-latest','no-stock','zero-stock','upcoming']);
 }
 assert.deepEqual(defaultPromotionOrder(input,{...blankState(),client:'1'}).map(x=>x.art),defaultPromotionOrder(input,blankState()).map(x=>x.art));
 assert.deepEqual(input,original);
 assert.equal(defaultPromotionOrder(input,blankState()).length,input.length);
 console.log('Assigned-stock cards precede unassigned cards; mixed stock, filters, client links and unchanged inputs passed');
}

await import('./test-retail.mjs');

{
 const {clientSelectionUrl}=await import('./catalog-assets/share-core.mjs');
 const {parseState,blankState}=await import('./catalog-assets/catalog-core.mjs');
 const {approvedPhotoMap,photoPair,loadApprovedPhotos}=await import('./catalog-assets/photo-client.mjs');
 const state={...blankState(),tip:'Кольцо',size:'17',q:'ЗК2030',rubMin:'10000',rubMax:'30000',stock:'Ленинградская 33'};
 const url=clientSelectionUrl(state,'https://vikkttorial-ux.github.io/karatnik-catalog/');
 assert.deepEqual(parseState(new URL(url).search),{...state,client:'1'});
 const approved=JSON.parse(fs.readFileSync(new URL('./catalog-assets/approved-photos.json',import.meta.url),'utf8'));
 assert.equal(approvedPhotoMap(approved).get(photoPair('ЗК2030/ВБр','Каратник')).photos.length,4);
 assert.equal(approvedPhotoMap({items:[{art:'X',brand:'Y',url:'https://invalid.example/image'}]}).size,0);
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>({ok:true,json:async()=>approved});
  assert.equal((await loadApprovedPhotos()).get(photoPair('ЗК2030/ВБр','Каратник')).photos.length,4);
  globalThis.fetch=async()=>{throw new Error('offline')};
  assert.equal((await loadApprovedPhotos({live:true})).size,0);
 }finally{globalThis.fetch=originalFetch;}
 console.log('Client selection filters, approved gallery snapshot and offline photo handling passed');
}

await import('./test-sets.mjs');

await import('./test-selection.mjs');


await import('./test-gallery.mjs');


await import('./test-selected-sale.mjs');
