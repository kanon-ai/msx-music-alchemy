const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const rate of [44100,48000]){
 let Processor;const messages=[];
 class Base{constructor(){this.port={postMessage:m=>messages.push(m)};}}
 const ctx={AudioWorkletProcessor:Base,sampleRate:rate,registerProcessor:(name,c)=>Processor=c};
 vm.runInNewContext(fs.readFileSync('static/live-worklet.js','utf8'),ctx);
 const p=new Processor();
 for(let i=0;i<5;i++){const a=new Int16Array(8820);a.fill(1000);p.port.onmessage({data:{pcm:a.buffer}});}
 p.port.onmessage({data:{end:true}});
 let nonzero=0;
 for(let i=0;i<Math.ceil(rate/128)+10;i++){const a=new Float32Array(128);p.process([],[[a]]);nonzero+=a.filter(v=>v>.02).length;}
 assert(Math.abs(nonzero-rate)<128);assert.equal(p.samples,44100);assert.equal(p.underruns,0);assert(messages.some(m=>m.ended));
}
console.log('Live audio queue: 44.1/48 kHz, duration, end and underflow accounting passed');
