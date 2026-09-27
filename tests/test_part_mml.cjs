const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/app.js','utf8'),ctx={};vm.createContext(ctx);vm.runInContext(source.split('// BEGIN PART MML CODEC')[1].split('// END PART MML CODEC')[0],ctx);
const parse=(s,end=24576)=>JSON.parse(JSON.stringify(ctx.parsePartMml(s,end))),encode=ctx.encodePartMml;
assert.deepEqual(parse('o4 l8 v10 cdef'),[60,62,64,65].map((pitch,i)=>({id:'mml-'+i,pitch,start:i*48,duration:48,velocity:10})));
assert.throws(()=>parse('o4 q4 c4. r8 d%48^!1'),/96 PPQ/);
assert.deepEqual(parse('o4 q4 c4. r8 q8 d%48^!1').map(n=>[n.start,n.duration]),[[0,72],[192,97]]);
assert.deepEqual(parse('[c8[d16e16]2]2').map(n=>n.pitch),[60,62,64,62,64,60,62,64,62,64]);
for(const bad of ['c0','o9 c','q0 c','v16c','c7','[c','c]','[c]33','t120','@3 c','c!0','c {"pitch":3}','c {"vibratoDepth":"x"}','c {bad}','c1 c1'])assert.throws(()=>parse(bad,384),bad);
assert.match((()=>{try{parse(';hi\nc4\nz');}catch(e){return e.message;}})(),/3行 1列/);
const notes=[{id:'a',pitch:61,start:1,duration:97,velocity:9,vibratoDepth:12,vibratoRate:50,vibratoDelayMs:300,portamentoMs:40,portamentoFrom:60,instrument:12},{id:'b',pitch:30,start:500,duration:3,velocity:4,detuneCents:-10}];
const strip=x=>x.map(({id,...rest})=>rest);assert.deepEqual(strip(parse(encode(notes))),strip(notes));
assert.deepEqual(parse('v0 c4 r4'),[]);assert.deepEqual(parse(''),[]);
const song=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):{tracks:[{id:'fixture',notes}]};
for(const t of song.tracks)assert.deepEqual(strip(parse(encode(t.notes))),strip([...t.notes].sort((a,b)=>a.start-b.start)),t.id);
const compactNotes=[60,62,72,48,50].map((pitch,i)=>({id:String(i),pitch,start:i*24,duration:24,velocity:i===4?9:10}));
const compact=encode(compactNotes);
assert.equal((compact.match(/v10/g)||[]).length,1);assert.equal((compact.match(/o4/g)||[]).length,1);
assert.match(compact,/q8 l16/);assert.match(compact,/c d > c << c v9 d/);
assert.deepEqual(strip(parse(compact)),strip(compactNotes));
assert.deepEqual(strip(parse(encode([]))),[]);
console.log('Part MML: exact real-song round trip, expressions, loops, rests, gates, invalid input and error positions passed');
// Test the apply gate against validation failures and stale asynchronous responses.
(async()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,classList:{toggle(){}},addEventListener(){}});return elements.get(id);};
 let resolve,edited=0,rejectValidation=false;
 const ui={...ctx,structuredClone,Map,setTimeout,clearTimeout,console,$:el,clone:structuredClone,epoch:0,trackIndex:0,selected:null,editRange:null,
 song:{title:'test',bars:2,tracks:[{id:'one',name:'One',notes:[]},{id:'two',name:'Two',notes:[]}]},end:()=>768,
 api:()=>rejectValidation?Promise.reject(new Error('invalid chip note')):new Promise(r=>resolve=r),
 edit:f=>{edited++;f();ui.epoch++;}};
 ui.track=()=>ui.song.tracks[ui.trackIndex];vm.createContext(ui);
 vm.runInContext(source.slice(source.indexOf('const partMmlDrafts='),source.indexOf('function syncPitchScroll(){')),ui);
 vm.runInContext("drawPartMml();partMmlDrafts.get('one').text='c4';partMmlDrafts.get('one').dirty=true;",ui);
 let pending=ui.checkPartMml(true);ui.epoch++;resolve();await pending;assert.equal(edited,0);
 pending=ui.checkPartMml(true);ui.trackIndex=1;resolve();await pending;assert.equal(edited,0);ui.trackIndex=0;
 rejectValidation=true;await ui.checkPartMml(true);assert.equal(edited,0);assert.equal(el('part-mml-apply').disabled,true);
 rejectValidation=false;pending=ui.checkPartMml(true);resolve();await pending;assert.equal(edited,1);assert.equal(ui.song.tracks[0].notes.length,1);assert.equal(ui.song.tracks[1].notes.length,0);
 console.log('Part MML apply: rejects validation errors, stale edits and track switches; changes selected notes only');
})().catch(e=>{console.error(e);process.exitCode=1;});
