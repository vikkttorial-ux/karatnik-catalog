import assert from 'node:assert/strict';
import {validateSets,attachSets,relatedSets,setLink} from './catalog-assets/set-core.mjs';
import {blankState,parseState,serializeState,prepareItems,filterItems} from './catalog-assets/catalog-core.mjs';
import {clientSelectionUrl} from './catalog-assets/share-core.mjs';
const manifest=validateSets({version:1,sets:[{id:'SET-TEST',members:[{art:'RING',brand:'TEST',tip:'Кольцо'},{art:'EARRING',brand:'TEST',tip:'Серьги'}]}]});
const raw=[{art:'RING',marka:'TEST',tip:'Кольцо',units:1,stocks:{A:1},sizes:[{s:'17',q:1}]},{art:'EARRING',marka:'TEST',tip:'Серьги',units:1,stocks:{B:1},sizes:[]},{art:'EARRING',marka:'OTHER',tip:'Серьги',units:1,stocks:{B:1},sizes:[]}];
const items=prepareItems(attachSets(raw,manifest));
assert.equal(filterItems(items,{...blankState(),set:'SET-TEST'}).length,2);
assert.equal(relatedSets(raw[2],manifest,items).length,0);
for(const item of items.slice(0,2)){
 const peer=relatedSets(item,manifest,items)[0].members[0];
 const url=setLink('https://vikkttorial-ux.github.io/karatnik-catalog/?size=17&stock=A&rubMax=1',{member:peer,client:true});
 const state=parseState(new URL(url).search);
 assert.equal(state.stock,'');assert.equal(state.size,'');assert.equal(state.rubMax,'');assert.equal(state.client,'1');
 assert.deepEqual(filterItems(items,state).map(p=>p.art),[peer.art]);
 assert.deepEqual(parseState('?'+serializeState(state)),state);
 assert.deepEqual(parseState(new URL(clientSelectionUrl(state,url)).search),state);
}
assert.equal(relatedSets(raw[0],manifest,[])[0].members[0].units,0);
assert.throws(()=>validateSets({version:1,sets:[{id:'S',members:[{art:'X',brand:'B'}]}]}));
assert.throws(()=>validateSets({version:1,sets:[{id:'S',members:[{art:'X',brand:'B'},{art:' X ',brand:'B'}]}]}));
console.log('Confirmed sets: mutual exact links, brand separation, full-set filter, unavailable peer and client sharing passed');
