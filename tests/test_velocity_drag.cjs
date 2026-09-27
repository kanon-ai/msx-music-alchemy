const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const text=fs.readFileSync('static/app.js','utf8');
let song={tracks:[{notes:[{id:'n',pitch:60,velocity:12}]}]},count=0,stops=0;const handlers={},note=song.tracks[0].notes[0];
const bar={style:{},setPointerCapture(){},setAttribute(){},addEventListener(k,f){handlers[k]=f},removeEventListener(k){delete handlers[k]}};
const ctx={song,snapshot:()=>JSON.stringify(song),stop:()=>stops++,selected:null,velocityDrag:null,trackIndex:0,document:{querySelectorAll:()=>[]},$:()=>({getBoundingClientRect:()=>({bottom:104})}),drawInspector(){},drawRoll(){},draw(){},noteName:()=> 'C4',status(){},undo:[],redo:[],changed(){count++}};
vm.runInNewContext(text.slice(text.indexOf('function startVelocityDrag('),text.indexOf('const trackDrafts=')),ctx);
ctx.startVelocityDrag({button:0,pointerId:1,clientY:54,preventDefault(){},stopPropagation(){}},note,bar);handlers.pointermove({clientY:80});assert.equal(note.velocity,3);handlers.pointerup({});assert.equal(count,1);assert.equal(ctx.undo.length,1);assert.equal(JSON.parse(ctx.undo[0]).tracks[0].notes[0].velocity,12);assert.equal(stops,1);assert.equal(Object.keys(handlers).length,0);
console.log('Velocity drag: pointer, bounds, one undo, cleanup passed');
