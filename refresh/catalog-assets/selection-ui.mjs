import {setKey} from './set-core.mjs?v=sets1120';
import {SELECTION_LIMIT,encodeSelection,decodeSelection,selectedClientUrl} from './selection-core.mjs?v=picks1124';
import {retailOffer,rubles} from './retail-core.mjs?v=campaign1130';
export function createSelectionEditor({client,getItems,getFiltered,send}){
 if(client)return {appendButton(){},refresh(){}};
 const storageKey='karatnik-client-draft-v1';let draft=[];
 try{draft=decodeSelection(localStorage.getItem(storageKey)||'');}catch{}
 let selected=new Map(draft.map(p=>[setKey(p),p]));
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const btn=(text,fn,cls='selection-action')=>{const b=make('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
 const bar=make('div',undefined,'selection-editor');
 const open=btn('',()=>{review();dialog.showModal();}),add=btn('Добавить найденные',()=>{
  const next=new Map(selected);
  for(const p of getFiltered())next.set(setKey(p),{art:p.art,marka:p.marka});
  if(next.size>SELECTION_LIMIT){status.textContent='В подборку можно добавить до '+SELECTION_LIMIT+' изделий. Уточните поиск или добавляйте по одному.';return;}
  selected=next;save();review();dialog.showModal();
 });
 const status=make('p','Отмечайте изделия из разных поисков. Перед отправкой можно убрать лишнее.','selection-status');status.setAttribute('role','status');
 bar.append(open,add,status);document.querySelector('#results .cards').before(bar);
 const dialog=make('dialog',undefined,'selection-dialog');dialog.setAttribute('aria-labelledby','selection-review-title');
 const heading=make('div',undefined,'selection-dialog-heading'),title=make('h2','Подборка для клиента');title.id='selection-review-title';
 heading.append(title,btn('×',()=>dialog.close(),'icon-button'));heading.lastChild.setAttribute('aria-label','Закрыть подборку');
 const note=make('p','Отправятся только оставленные здесь изделия. Стоимость и наличие будут актуальными на момент открытия.');
 const list=make('div',undefined,'selection-review-list'),message=make('p',undefined,'selection-status');message.setAttribute('role','status');
 const actions=make('div',undefined,'selection-actions');
 const share=btn('Отправить клиенту',()=>{try{const url=selectedClientUrl([...selected.values()],location.href);dialog.close();void send(url);}catch(e){message.textContent=e.message;}},'primary-button');
 actions.append(share,btn('Продолжить поиск',()=>dialog.close()),btn('Очистить подборку',()=>{selected.clear();save();review();}));
 dialog.append(heading,note,list,message,actions);document.body.append(dialog);
 const persist=()=>{try{if(selected.size)localStorage.setItem(storageKey,encodeSelection([...selected.values()]));else localStorage.removeItem(storageKey);}catch{}};
 function save(){persist();refresh();status.textContent=selected.size?'В подборке: '+selected.size+'. Можно продолжать поиск или открыть список.':'Подборка пуста. Добавьте нужные изделия.';}
 function refresh(){
  open.textContent='Моя подборка · '+selected.size;
  open.disabled=!getItems().length;add.disabled=!getFiltered().length;
  document.querySelectorAll('[data-pick-key]').forEach(b=>{const yes=selected.has(b.dataset.pickKey);b.textContent=yes?'Убрать из подборки':'В подборку';b.setAttribute('aria-pressed',String(yes));});
 }
 function review(){
  list.replaceChildren();message.textContent='';share.disabled=!selected.size;
  const live=new Map(getItems().map(p=>[setKey(p),p]));
  for(const [key,p]of selected){
   const item=live.get(key),row=make('div',undefined,'selection-review-row');
   if(item?.photo){const img=make('img');img.src=item.photo;img.alt=item.art;img.width=64;img.height=64;row.append(img);}
   const text=make('div');text.append(make('strong',p.art),make('p',p.marka));
   const amount=item?retailOffer(item,{}).amount:null;
   text.append(make('p',item?'От '+(amount===null?'уточняется':rubles(amount)):'Больше нет в наличии — в ссылке не появится'));
   row.append(text,btn('Убрать',()=>{selected.delete(key);save();review();}));list.append(row);
  }
  if(!selected.size)list.append(make('p','Здесь пока нет изделий. Вернитесь к поиску и нажмите «В подборку».'));
  share.textContent='Отправить клиенту · '+selected.size;
 }
 function appendButton(host,item){
  const b=btn('',()=>{const key=setKey(item);if(selected.has(key))selected.delete(key);else{
   if(selected.size>=SELECTION_LIMIT){status.textContent='В подборке уже '+SELECTION_LIMIT+' изделий. Уберите лишние перед добавлением.';return;}
   selected.set(key,{art:item.art,marka:item.marka});
  }save();});
  b.dataset.pickKey=setKey(item);b.textContent=selected.has(setKey(item))?'Убрать из подборки':'В подборку';b.setAttribute('aria-pressed',String(selected.has(setKey(item))));host.append(b);
 }
 refresh();
 return {appendButton,refresh,hasItems:()=>selected.size>0,open:()=>{review();dialog.showModal();}};
}

