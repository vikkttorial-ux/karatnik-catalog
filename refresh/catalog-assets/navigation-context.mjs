const KEY='karatnik.catalog.return.v1';
const MAX_AGE=6*60*60*1000;
export function validReturnUrl(value,base='https://vikkttorial-ux.github.io/karatnik-catalog/') {
 try {const u=new URL(value),b=new URL(base);return u.origin===b.origin&&u.pathname.startsWith('/karatnik-catalog/')&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function readReturn(storage,base,now=Date.now()) {
 try {const value=JSON.parse(storage.getItem(KEY)||'null');return value&&now>=value.at&&now-value.at<MAX_AGE&&validReturnUrl(value.url,base)?value:null;}catch{return null;}
}
export function editorUrl(value,returnTo) {
 const u=new URL(value);if(u.origin!=='https://karatnik-product-photos.workspace-903713.chatgpt.site')return u.href;
 const target=validReturnUrl(returnTo);if(target)u.searchParams.set('returnTo',target);return u.href;
}
export function restoreCatalogLocation(win=window) {
 const saved=readReturn(win.sessionStorage,win.location.href);
 if(!saved?.pending)return null;
 const here=new URL(win.location.href),target=new URL(saved.url);
 if(here.pathname!==target.pathname)return null;
 // A shared client link or an explicit new search always wins over local memory.
 if(here.search&&here.search!==target.search)return null;
 if(!here.search&&target.search)win.history.replaceState(win.history.state,'',target.href);
 saved.pending=false;try{win.sessionStorage.setItem(KEY,JSON.stringify(saved));}catch{}
 return saved;
}
export function rememberCatalogReturn({shown=60,anchor=''}={},win=window) {
 const value={url:win.location.href,at:Date.now(),pending:true,scrollY:Math.max(0,win.scrollY||0),shown:Math.min(5000,Math.max(60,Number(shown)||60)),anchor};
 try{win.sessionStorage.setItem(KEY,JSON.stringify(value));}catch{}return value;
}
