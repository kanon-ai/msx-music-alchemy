'use strict';
// Small FIFO consumed by the audio thread, independent of drawing/UI activity.
class LiveChipOutput extends AudioWorkletProcessor {
 constructor(){
  super();this.queue=[];this.offset=0;this.fraction=0;this.samples=0;this.report=0;
  this.ready=false;this.ended=false;this.last=0;this.underruns=0;
  this.port.onmessage=({data})=>{
   if(data.end){this.ended=true;this.ready=true;}
   if(data.pcm){this.queue.push(new Int16Array(data.pcm));if(this.queue.reduce((n,a)=>n+a.length,0)>=8820)this.ready=true;}
  };
 }
 process(inputs,outputs){
  const out=outputs[0][0],ratio=44100/sampleRate;
  for(let i=0;i<out.length;i++){
   if(this.ready&&this.queue.length){
    const a=this.queue[0];
    const next=this.offset+1<a.length?a[this.offset+1]:(this.queue[1]?.[0]??a[this.offset]);
    this.last=(a[this.offset]*(1-this.fraction)+next*this.fraction)/32768;
    out[i]=this.last;this.fraction+=ratio;
    while(this.fraction>=1&&this.queue.length){
     this.fraction--;this.offset++;this.samples++;
     if(this.offset>=this.queue[0].length){this.queue.shift();this.offset=0;}
    }
   }else{
    // Soft decay during a genuine underrun; transport advances only with audio.
    this.last*=.95;out[i]=this.last;
    if(this.ready&&!this.ended&&i===0)this.underruns++;
   }
  }
  this.report+=out.length;
  if(this.report>=1024){this.report=0;this.port.postMessage({samples:this.samples,queued:this.queue.reduce((n,a)=>n+a.length,0)-this.offset,ended:this.ended&&!this.queue.length,underruns:this.underruns});}
  return true;
 }
}
registerProcessor('live-chip-output',LiveChipOutput);
