export const MODEL_REV='6b7c523703ae26e39be4b03774966f8571c7f523';
export function decodeIndex(data){
 if(data.version!==1||data.revision!==MODEL_REV||data.dimensions!==512||data.preprocess!=='white-contain-224-v2'||!Array.isArray(data.records))throw Error('Неверная версия базы фотографий.');
 return data.records.map(r=>{const bytes=Uint8Array.from(atob(r.vector),c=>c.charCodeAt(0));if(bytes.length!==512)throw Error('Повреждена база фотографий.');const v=new Int8Array(bytes.buffer);let n=0;for(const x of v)n+=x*x;if(!n)throw Error('Пустой вектор фотографии.');return {...r,v,norm:Math.sqrt(n)};});
}
export function nearest(query,records){return records.map(r=>{let dot=0;for(let i=0;i<512;i++)dot+=query[i]*r.v[i];return {record:r,similarity:dot/r.norm};}).sort((a,b)=>b.similarity-a.similarity);}
export function pixelsForCrop(image,crop){
 const out=document.createElement('canvas');out.width=out.height=224;const ctx=out.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,224,224);
 const {x,y,w,h}=crop,scale=Math.min(224/w,224/h),dw=Math.round(w*scale),dh=Math.round(h*scale);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,x,y,w,h,Math.floor((224-dw)/2),Math.floor((224-dh)/2),dw,dh);
 const rgb=ctx.getImageData(0,0,224,224).data,pixels=new Float32Array(3*224*224),mean=[.48145466,.4578275,.40821073],std=[.26862954,.26130258,.27577711];
 for(let c=0;c<3;c++)for(let i=0;i<224*224;i++)pixels[c*224*224+i]=(rgb[i*4+c]/255-mean[c])/std[c];return pixels;
}
export class VisionEngine{
 constructor(progress){this.progress=progress;this.seq=0;this.pending=new Map();}
 request(type,data={}){return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.stop();reject(Error('Обработка заняла слишком долго. Попробуйте ещё раз или используйте описание.'));},300000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({type,id,...data},data.pixels?[data.pixels.buffer]:[]);});}
 async start(){if(this.ready)return;if(!this.worker){this.worker=new Worker(new URL('./smart-vision-worker.mjs',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{if(data.type==='progress'){this.progress(data.message||`Скачиваю модуль: ${data.mb} из 85 МБ…`);return;}const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);if(data.type==='error')p.reject(Error(data.message));else p.resolve(data.vector);};this.worker.onerror=()=>{this.stop();this.progress('Модуль не запустился. Можно продолжить поиск словами.');};}await this.request('init');this.ready=true;}
 async embed(pixels){await this.start();return this.request('infer',{pixels});}
 stop(){this.worker?.terminate();this.worker=null;this.ready=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Поиск по фото остановлен.'));}this.pending.clear();}
}
