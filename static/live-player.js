'use strict';
class LivePlayer {
 constructor(context,destination,api,token,onEnd,onError){
  this.context=context;this.destination=destination;this.api=api;this.token=token;this.onEnd=onEnd;this.onError=onError;
  this.closed=false;this.session=null;this.node=null;this.worker=null;this.samples=0;this.masks=[0,0,0];this.underruns=0;
 }
 setMix(song,solo){
  const masks=[0,0,0],chips={PSG:0,OPLL:1,SCC:2};
  song.tracks.forEach((t,i)=>{if(solo===null?t.mute:i!==solo)masks[chips[t.chip]]|=1<<t.channel;});this.masks=masks;
  this.worker?.postMessage({masks});
 }
 async start(song,startTick){
  const info=await (await this.api('/api/live/start',{song,startTick})).json();this.session=info.session;
  if(this.closed){this.release();return;}
  if(!LivePlayer.modules.has(this.context)){
   const promise=this.context.audioWorklet.addModule('/live-worklet.js');LivePlayer.modules.set(this.context,promise);
   promise.catch(()=>LivePlayer.modules.delete(this.context));
  }
  await LivePlayer.modules.get(this.context);if(this.closed)return;
  this.node=new AudioWorkletNode(this.context,'live-chip-output',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
  const fail=e=>{if(!this.closed){this.stop();this.onError(e);}};
  this.node.onprocessorerror=()=>fail(new Error('音声処理が停止しました。再生を再開してください。'));
  this.worker=new Worker('/live-worker.js');
  this.worker.onerror=()=>fail(new Error('音声通信が停止しました。再生を再開してください。'));
  this.worker.onmessage=({data})=>{
   if(data.error){fail(new Error(data.error));return;}
   this.samples=data.samples;this.underruns=data.underruns;
   if(data.ended&&!this.closed)this.onEnd();
  };
  this.worker.postMessage({start:true,port:this.node.port,token:this.token,session:this.session,masks:this.masks},[this.node.port]);
  this.node.connect(this.destination);
 }
 release(){if(this.session){this.api('/api/live/stop',{session:this.session}).catch(()=>{});this.session=null;}}
 stop(){this.closed=true;if(this.worker){this.worker.terminate();this.worker=null;}if(this.node){this.node.disconnect();this.node=null;}this.release();}
}
LivePlayer.modules=new WeakMap();
