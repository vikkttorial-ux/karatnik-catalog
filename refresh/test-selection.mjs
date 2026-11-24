import assert from 'node:assert/strict';
import {encodeSelection,decodeSelection,selectedClientUrl,selectionContains} from './catalog-assets/selection-core.mjs';
import {prepareItems,filterItems,blankState,parseState,serializeState} from './catalog-assets/catalog-core.mjs';
const a={art:'ЗК2030/Вбр',marka:'Каратник'},b={art:'Т10061Д623',marka:'Каратов'},sameArticle={...a,marka:'Другой бренд'};
const value=encodeSelection([a,b,a]);
assert.deepEqual(decodeSelection(value),[a,b]);
assert(selectionContains(value,{...a,art:'ЗК2030 /Вбр'}));
assert(!selectionContains(value,sameArticle));
const url=new URL(selectedClientUrl([a,b],'https://vikkttorial-ux.github.io/karatnik-catalog/?q=серьги&stock=Ленинградская+33'));
assert.equal(url.pathname,'/karatnik-catalog/');
assert.deepEqual([...url.searchParams.keys()],['client','picks']);
const state=parseState(url.search);
assert.equal(state.client,'1');
assert.deepEqual(parseState('?'+serializeState(state)),state);
const item=p=>({...p,naim:'',tip:'Кольцо',sizes:[],stocks:{Магазин:1},codes:[],proba:'585'});
const items=prepareItems([item(a),item(b),item(sameArticle),item({art:'лишнее',marka:'Каратник'})]);
assert.deepEqual(filterItems(items,state).map(x=>x.art),[a.art,b.art]);
assert.equal(filterItems(items,{...state,q:'Т10061'}).length,1);
assert.equal(filterItems(items,{...blankState(),picks:state.picks}).length,2);
for(const bad of ['wrong','1.e30','1.W10','1.====','1.'+'a'.repeat(12001)]){
 assert.deepEqual(decodeSelection(bad),[]);
 assert.equal(filterItems(items,{...blankState(),picks:bad}).length,0);
}
assert.equal(filterItems(items,{...state,picks:encodeSelection([{art:'sold',marka:'Каратник'}])}).length,0);
assert.throws(()=>encodeSelection([]));
assert.throws(()=>encodeSelection(Array.from({length:51},(_,i)=>({art:String(i),marka:'Каратник'}))));
assert.throws(()=>encodeSelection([{art:'x',marka:''}]));
assert.equal(decodeSelection(encodeSelection(Array.from({length:50},(_,i)=>({art:'Кольцо-'+i,marka:'Каратник'})))).length,50);
console.log('Exact client selection: brands, duplicates, Unicode, stale filters, missing stock, malformed links and limit passed');

{
 const {createSelectionEditor}=await import('./catalog-assets/selection-ui.mjs');
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.handlers={};this.textContent='';}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  addEventListener(name,fn){this.handlers[name]=fn;}
  setAttribute(k,v){this.attrs[k]=v;}
  get lastChild(){return this.children.at(-1);}
  before(n){this.parent.children.splice(this.parent.children.indexOf(this),0,n);n.parent=this.parent;}
  showModal(){this.open=true;}close(){this.open=false;}
  click(){return this.handlers.click?.();}
 }
 const stored=new Map();
 const setup=()=>{const body=new Node('body'),results=new Node('section'),cards=new Node('div');body.append(results);results.append(cards);globalThis.document={body,createElement:t=>new Node(t),querySelector:q=>q==='#results .cards'?cards:null,querySelectorAll:q=>{const all=[];const walk=n=>{if(n.dataset.pickKey)all.push(n);for(const c of n.children)walk(c);};walk(body);return all;}};return{body,results,cards};};
 globalThis.localStorage={getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 globalThis.location={href:'https://vikkttorial-ux.github.io/karatnik-catalog/?q=old'};
 let dom=setup(),available=[item(a),item(b)],visible=[available[0]],sent='';
 let editor=createSelectionEditor({client:false,getItems:()=>available,getFiltered:()=>visible,send:url=>{sent=url;}});
 const ca=new Node('article'),cb=new Node('article');dom.cards.append(ca,cb);
 editor.appendButton(ca,available[0]);editor.appendButton(cb,available[1]);ca.children[0].click();
 visible=[available[1]];cb.children[0].click();
 assert.equal(decodeSelection([...stored.values()][0]).length,2,'Selections survive a new search');
 editor.open();let dialog=dom.body.children.find(n=>n.tagName==='dialog');
 let list=dialog.children[2];assert.equal(list.children.length,2);
 list.children[0].lastChild.click();assert.deepEqual(decodeSelection([...stored.values()][0]),[b]);
 dialog.lastChild.children[0].click();
 assert.deepEqual(filterItems(items,parseState(new URL(sent).search)).map(p=>p.art),[b.art],'Removed item cannot reappear in client link');
 dom=setup();editor=createSelectionEditor({client:false,getItems:()=>available,getFiltered:()=>visible,send:()=>{}});
 const reload=new Node('article');dom.cards.append(reload);editor.appendButton(reload,available[1]);assert.equal(reload.children[0].attrs['aria-pressed'],'true','Draft restores after reload');
 editor.open();dialog=dom.body.children.find(n=>n.tagName==='dialog');dialog.lastChild.children[2].click();assert.equal(stored.size,0);
 dom=setup();const childCount=dom.body.children.length;editor=createSelectionEditor({client:true,getItems:()=>available,getFiltered:()=>visible,send:()=>{}});assert.equal(dom.body.children.length,childCount,'Client gets no selection editor');
 console.log('Selection editor user flow: add across searches, remove, share exact subset, reload draft, clear and client presentation passed');
}


