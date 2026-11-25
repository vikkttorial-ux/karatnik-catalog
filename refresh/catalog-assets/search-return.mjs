import {readReturn} from './navigation-context.mjs?v=nav1125';
const saved=readReturn(sessionStorage,location.href);
for(const link of document.querySelectorAll('header a[href="./"]')){link.href=saved?.url||'./';if(!link.classList.contains('brand')){link.textContent='Назад к выборке';link.classList.add('return-to-catalog');}}
