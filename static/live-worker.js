'use strict';
let port,token,session,timer,closed=false,finished=false,queued=0,busy=false,masks=[0,0,0];
async function pump(){
 if(closed||finished||busy)return;busy=true;
 try{
  if(queued<13230){
   const r=await fetch('/api/live/pull',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':token},body:JSON.stringify({session,masks})});
   if(!r.ok){const e=await r.json();throw Error(e.error||'音源の通信に失敗しました。');}
   const pcm=await r.arrayBuffer();if(closed)return;
   if(!pcm.byteLength){finished=true;port.postMessage({end:true});return;}
   queued+=pcm.byteLength/2;port.postMessage({pcm},[pcm]);
  }
 }catch(e){if(!closed)postMessage({error:e.message});closed=true;}
 finally{busy=false;}
 // The audio clock requests refills; browser background timer throttling cannot stall it.
 if(!closed&&!finished&&queued<13230)pump();
}
onmessage=({data})=>{
 if(data.start){
  ({port,token,session,masks}=data);
  port.onmessage=({data:progress})=>{queued=progress.queued;postMessage(progress);pump();};
  pump();
 }else if(data.masks)masks=data.masks;
 else if(data.stop){closed=true;clearTimeout(timer);port?.close();close();}
};
