const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const ctx={structuredClone};vm.runInNewContext(fs.readFileSync('static/app.js','utf8').split('// BEGIN CUT TRANSFORM')[1].split('// END CUT TRANSFORM')[0],ctx);
const notes=[{id:'before',start:0,duration:40},{id:'left',start:80,duration:60},{id:'inside',start:120,duration:20},{id:'right',start:180,duration:60},{id:'after',start:250,duration:20}];
const p={bpm:120,hz:60,bars:2,loop:true,loopStart:240,loopEnd:700,tracks:[{notes},{notes:[{id:'span',start:50,duration:220}]}]};
const orig=JSON.stringify(p),run=mode=>ctx.cutSongRange(p,100,200,mode);
const a=run('ripple'),b=run('silence');assert.equal(JSON.stringify(p),orig);
assert.deepEqual(JSON.parse(JSON.stringify(a.tracks[0].notes.map(n=>[n.start,n.duration]))),[[0,40],[80,20],[100,40],[150,20]]);
assert.deepEqual(JSON.parse(JSON.stringify(b.tracks[0].notes.map(n=>[n.start,n.duration]))),[[0,40],[80,20],[200,40],[250,20]]);
assert.equal(a.loopStart,140);assert.equal(a.loopEnd,600);assert.equal(b.loopEnd,700);assert.notEqual(a.tracks[1].notes[0].id,a.tracks[1].notes[1].id);
assert.equal(ctx.cutSongRange(p,0,768,'silence').tracks[0].notes.length,0);assert.throws(()=>ctx.cutSongRange(p,0,768,'ripple'));assert.throws(()=>ctx.cutSongRange(p,100,100,'silence'));
console.log('Cut: both modes, split notes, bounds, loop relocation and source preservation PASS');

const tiny={bpm:129,hz:60,bars:25,loop:false,loopStart:0,tracks:[{notes:[{id:'short',start:9022,duration:2,pitch:46,velocity:10}]}]};assert.equal(ctx.cutSongRange(tiny,0,1,'silence').tracks[0].notes.length,0);
