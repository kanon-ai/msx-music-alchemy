const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('static/app.js','utf8');
function extract(a,b){return src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));}
const original={tracks:[{id:'a',instrument:5,notes:[{pitch:60,start:0},{pitch:62,start:384}]},{id:'b',notes:[{pitch:48}]}]};
let accepted=true,changes=0,closed=0;
const ctx={song:structuredClone(original),trackEditSource:'a',undo:[],redo:[],selected:'note',editRange:{},toneApplyBusy:false,playing:false,confirm:()=>accepted,status:()=>{},$:()=>({close(){closed++;}}),changed(){changes++;}};
vm.createContext(ctx);
vm.runInContext(extract('function snapshot(){','function changed(')+extract('function edit(fn,','function refreshInputs(')+extract('function clearTrackNotes(){',"$('track-clear').onclick")+extract('async function history(direction){','function stop('),ctx);
(async()=>{
accepted=false;ctx.clearTrackNotes();assert.deepEqual(ctx.song,original);assert.equal(ctx.undo.length,0);
accepted=true;ctx.clearTrackNotes();assert.equal(ctx.song.tracks[0].notes.length,0);assert.equal(ctx.song.tracks[0].instrument,5);assert.deepEqual(ctx.song.tracks[1],original.tracks[1]);assert.equal(ctx.song.tracks.length,2);assert.equal(closed,1);assert.equal(ctx.selected,null);assert.equal(ctx.editRange,null);
await ctx.history('undo');assert.equal(JSON.stringify(ctx.song),JSON.stringify(original));await ctx.history('redo');assert.equal(ctx.song.tracks[0].notes.length,0);
const count=ctx.undo.length;ctx.clearTrackNotes();assert.equal(ctx.undo.length,count);ctx.trackEditSource='missing';ctx.clearTrackNotes();assert.equal(ctx.undo.length,count);
console.log('Track clear: cancel, all bars, settings/other tracks preserved, Undo/Redo, empty/missing passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
