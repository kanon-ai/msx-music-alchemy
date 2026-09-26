const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('static/app.js','utf8');const source=app.slice(app.indexOf('async function play(){'),app.indexOf('\nfunction animate(){'));
async function test(cancel,fail){
 let resume,starts=0;const button={disabled:false};
 const ctx={stopAudition(){},playing:false,renderId:0,$:()=>button,status(){},audioContext:{resume:()=>new Promise((resolve,reject)=>{resume=()=>fail?reject(Error('resume failed')):resolve();}),currentTime:0},previewBoost:0,masterGain:{gain:{cancelScheduledValues(){},setValueAtTime(){}}},LivePlayer:class{constructor(context,destination,api,token){assert.equal(token,'fresh-server-token');starts++;}setMix(){}async start(){}stop(){}},api:async(path)=>{assert.equal(path,'/api/info');return {json:async()=>({token:'fresh-server-token'})};},token:'expired-token',solo:null,song:{bpm:120},page:0,clone:x=>x,requestAnimationFrame(){},animate(){}};
 ctx.stop=()=>{ctx.renderId++;button.disabled=false;};vm.runInNewContext(source,ctx);
 const first=ctx.play();assert.equal(button.disabled,true);await ctx.play();assert.equal(starts,0);
 if(cancel)ctx.stop();resume();if(fail)await assert.rejects(first);else await first;
 assert.equal(starts,cancel||fail?0:1);assert.equal(button.disabled,false);
}
(async()=>{await test(false,false);await test(true,false);await test(false,true);console.log('Play lifecycle: double start, cancelled resume, failed resume passed');})().catch(e=>{console.error(e);process.exitCode=1;});
