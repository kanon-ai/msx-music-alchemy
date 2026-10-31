const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const ctx={structuredClone};vm.runInNewContext(fs.readFileSync('static/app.js','utf8').split('// BEGIN INSERT BARS')[1].split('// END INSERT BARS')[0],ctx);
const p={bars:3,bpm:120,hz:60,loop:true,loopStart:384,loopEnd:1000,tracks:[{notes:[{id:'a',start:0,duration:48},{id:'b',start:360,duration:48},{id:'c',start:384,duration:96}]},{notes:[{id:'d',start:800,duration:48}]}]};
const saved=JSON.stringify(p),q=ctx.insertSilentBars(p,2,2);assert.equal(JSON.stringify(p),saved);assert.equal(q.bars,5);assert.equal(q.loopStart,1152);assert.equal(q.loopEnd,1768);
assert.deepEqual(JSON.parse(JSON.stringify(q.tracks[0].notes.map(n=>[n.start,n.duration]))),[[0,48],[360,24],[1152,24],[1152,96]]);
for(const t of q.tracks){assert.equal(new Set(t.notes.map(n=>n.id)).size,t.notes.length);for(const n of t.notes)assert(n.start+n.duration<=384||n.start>=1152);}
const tail=ctx.insertSilentBars(p,4,1);assert.deepEqual(JSON.parse(JSON.stringify(tail.tracks)),p.tracks);assert.equal(tail.loopEnd,1000);
assert.equal(ctx.insertSilentBars({...p,loopEnd:384},2,1).loopEnd,384);
assert.equal(ctx.insertSilentBars(p,1,1).tracks[0].notes[0].start,384);
assert.throws(()=>ctx.insertSilentBars(p,0,1));assert.throws(()=>ctx.insertSilentBars(p,2,0));assert.throws(()=>ctx.insertSilentBars(p,2,1.5));assert.throws(()=>ctx.insertSilentBars(p,2,254));
console.log('Silent bars: split, all tracks, exact boundaries, prepend/append, loop mapping, immutability and limits PASS');

assert.equal(ctx.insertSilentBars(p,2,253).bars,256);
