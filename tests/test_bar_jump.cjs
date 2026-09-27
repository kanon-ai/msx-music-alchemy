const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/app.js','utf8').split('async function jumpToBar(bar){')[1].split("$('overview').addEventListener")[0];
async function test(playing,pending,bar){
 let stops=0,starts=0,draws=0;const playButton={disabled:pending},pageField={value:0};
 const ctx={playing,song:{bars:64},page:0,$:id=>id==='play'?playButton:pageField,stop(){stops++;ctx.playing=false;playButton.disabled=false;},draw(){draws++;},async play(){starts++;assert.equal(ctx.page,bar);}};
 vm.runInNewContext('async function jumpToBar(bar){'+source,ctx);await ctx.jumpToBar(bar);
 if(bar<0||bar>=64){assert.equal(draws,0);return;}
 assert.equal(ctx.page,bar);assert.equal(pageField.value,bar);assert.equal(stops,playing||pending?1:0);assert.equal(starts,stops);
}
(async()=>{await test(false,false,51);await test(true,false,51);await test(false,true,63);await test(true,false,64);await test(true,false,-1);console.log('Bar jump: stopped, playing, pending, bounds passed');})().catch(e=>{console.error(e);process.exitCode=1;});
