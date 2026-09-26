const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/live-worker.js','utf8');
async function run(mode){
 const ids=[],sent=[],errors=[];let calls=0,done;
 const completion=new Promise(r=>done=r);
 const port={postMessage:m=>{sent.push(m);if(m.pcm)done();},close(){}};
 const ctx={setTimeout:(f)=>setTimeout(f,0),clearTimeout,close(){},postMessage:m=>{errors.push(m);done();},fetch:async(_,o)=>{
  ids.push(JSON.parse(o.body).requestId);calls++;
  if(mode==='permanent'||(mode==='network'&&calls===1))throw Error('Failed to fetch');
  if(mode==='http')return {ok:false,json:async()=>({error:'expired'})};
  return {ok:true,arrayBuffer:async()=>{if(mode==='body'&&calls===1)throw Error('lost response');return new ArrayBuffer(26460);}};
 }};
 vm.runInNewContext(source,ctx);ctx.onmessage({data:{start:true,port,token:'test',session:'test',masks:[0,0,0]}});
 await completion;
 if(mode==='permanent'){assert.equal(calls,4);assert.equal(errors.length,1);}
 else if(mode==='http'){assert.equal(calls,1);assert.equal(errors[0].error,'expired');}
 else{assert.equal(errors.length,0);assert.equal(sent.length,1);assert.deepEqual(ids,[0,0]);}
 ctx.onmessage({data:{stop:true}});
}
(async()=>{for(const mode of ['network','body','permanent','http'])await run(mode);console.log('Worker recovery: lost request/body, bounded failure, HTTP error passed');})().catch(e=>{console.error(e);process.exitCode=1;});
