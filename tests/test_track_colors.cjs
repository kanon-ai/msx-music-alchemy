const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('static/app.js','utf8');let saved=0,drawn=0,history=0;
const t={};const ctx={track:()=>t,checkpoint:()=>history++,draw:()=>drawn++,queueSave:()=>saved++,epoch:0,dirty:false,conflict:false};
vm.runInNewContext(src.slice(src.indexOf('function setTrackColor('),src.indexOf('const noteName=')),ctx);
ctx.setTrackColor('#123abc');assert.equal(t.color,'#123abc');assert.equal(saved,1);assert.equal(history,1);assert.equal(drawn,1);assert.equal(ctx.dirty,true);
ctx.setTrackColor('url(bad)');assert.equal(saved,1);assert.equal(t.color,'#123abc');console.log('Color edit: undo checkpoint, save, invalid input, no audio calls passed');
