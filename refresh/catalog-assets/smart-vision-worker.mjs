const MODEL='https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/6b7c523703ae26e39be4b03774966f8571c7f523/onnx/vision_model_quantized.onnx';
const SHA='583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299';
let session,ort;
async function bytes(){
 let cache;try{cache=await caches.open('karatnik-clip-v1');const cached=await cache.match(MODEL);if(cached)return cached.arrayBuffer();}catch{}
 const response=await fetch(MODEL,{signal:AbortSignal.timeout(240000)});if(!response.ok)throw Error('Не удалось скачать модуль.');
 const reader=response.body.getReader(),chunks=[];let loaded=0;
 for(;;){const {done,value}=await reader.read();if(done)break;loaded+=value.length;if(loaded>95000000)throw Error('Некорректный размер модуля.');chunks.push(value);postMessage({type:'progress',mb:Math.round(loaded/1048576)});}
 const all=new Uint8Array(loaded);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',all))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==SHA)throw Error('Проверка модуля не пройдена.');
 try{await cache?.put(MODEL,new Response(all, {headers:{'Content-Type':'application/octet-stream'}}));}catch{}
 return all.buffer;
}
onmessage=async({data})=>{try{
 if(data.type==='init'){
  if(!session){ort=await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
   const buffer=await bytes();postMessage({type:'progress',message:'Запускаю модуль на устройстве…'});session=await ort.InferenceSession.create(buffer,{executionProviders:['wasm'],graphOptimizationLevel:'all'});}
  postMessage({type:'ready',id:data.id});
 }else if(data.type==='infer'){
  if(!session)throw Error('Сначала включите поиск по фото.');
  const result=await session.run({pixel_values:new ort.Tensor('float32',data.pixels,[1,3,224,224])});
  const vector=new Float32Array(result.image_embeds.data);let norm=0;for(const n of vector)norm+=n*n;norm=Math.sqrt(norm);if(vector.length!==512||!Number.isFinite(norm)||norm===0)throw Error('Не удалось прочитать изображение.');for(let i=0;i<vector.length;i++)vector[i]/=norm;
  postMessage({type:'vector',id:data.id,vector},[vector.buffer]);
 }
}catch(e){postMessage({type:'error',id:data.id,message:e.message||'Не удалось обработать фото.'});}};
