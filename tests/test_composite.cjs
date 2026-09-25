const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('static/app.js','utf8').split('// BEGIN COMPOSITE RECIPE')[1].split('// END COMPOSITE RECIPE')[0];
const ctx={structuredClone};vm.createContext(ctx);vm.runInContext(src,ctx);
const p={opllRhythm:true,tracks:[{id:'a',chip:'OPLL',channel:0,instrument:2,mute:false,name:'Bass',notes:[{id:'n',start:0,duration:48,pitch:40,velocity:12}]},{id:'b',chip:'OPLL',channel:1,instrument:3,mute:true,name:'Empty',notes:[]},{id:'drum',chip:'OPLL',channel:6,notes:[]}]};
const before=JSON.stringify(p),q=ctx.compositeBass(p,'a','b',5);
assert.equal(JSON.stringify(p),before);assert.equal(q.tracks[0].instrument,14);assert.equal(q.tracks[1].instrument,10);assert.equal(q.tracks[1].notes[0].velocity,7);assert.equal(q.tracks[1].notes[0].start,0);assert.equal(q.tracks[1].mute,false);
assert.throws(()=>ctx.compositeBass(q,'a','b',5));assert.throws(()=>ctx.compositeBass(p,'a','drum',5));assert.throws(()=>ctx.compositeBass(p,'a','a',5));assert.throws(()=>ctx.compositeBass(p,'a','b',12));assert.throws(()=>ctx.compositeBass(p,'a','b',1.5));
console.log('Composite safety tests passed');
