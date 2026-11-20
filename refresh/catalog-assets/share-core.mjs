import {serializeState} from './catalog-core.mjs?v=guide1120';
export function clientSelectionUrl(state,base){
 const url=new URL('./',base),params=new URLSearchParams(serializeState(state));
 params.set('client','1');url.search=params.toString();return url.href;
}
