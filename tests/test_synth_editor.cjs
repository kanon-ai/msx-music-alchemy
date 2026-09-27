const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('static/app.js','utf8'),handlers={},keys=Array.from({length:72},()=>({classList:{add(){},remove(){}},click(){hits++;}}));let hits=0,stops=0;
const c={window:{addEventListener(k,f){handlers[k]=f}},document:{querySelector(){return null}},$:id=>id==='sound-keyboard'?{children:keys,classList:{contains:()=>false}}:{value:'4'},view:'sound',stopAudition(){stops++;}};vm.createContext(c);vm.runInContext(src.split('// BEGIN SYNTH EDITOR')[1].split('const toneLibraryKey=')[0],c);
for(let byte=0;byte<8;byte++)for(const [shift,mask] of [[0,15],[4,15],[6,3],[7,1]]){
 const p=Array(8).fill(0xaa),next=c.setOpllField(p,byte,shift,mask,mask);assert.equal(c.opllFieldValue(next,byte,shift,mask),mask);assert.equal(next[byte]&~(mask<<shift),p[byte]&~(mask<<shift));assert.deepEqual(p,Array(8).fill(0xaa));
}
const event=(code,typing=false)=>({code,target:{matches:()=>typing},preventDefault(){}});
handlers.keydown(event('KeyZ'));assert.equal(hits,1);handlers.keydown({...event('KeyZ'),repeat:true});assert.equal(hits,1);handlers.keyup(event('KeyZ'));assert.equal(stops,2);
handlers.keydown(event('KeyS',true));assert.equal(hits,1);c.view='roll';handlers.keydown(event('KeyX'));assert.equal(hits,1);c.view='sound';handlers.keydown(event('Comma'));assert.equal(hits,2);handlers.blur();assert.equal(stops,4);
console.log('Synth: OPLL bit fields preserve adjacent bits; keyboard notes, release, repeats, typing and inactive-tab guards passed');
// Rotary control: drag, cancellation, keyboard limits and repaint synchronization.
let knob,commits=0,inputs=0;
c.document.createElement=()=>({append(){},classList:{contains:n=>n==='synth-knob'},style:{setProperty(k,v){this[k]=v}},setAttribute(k,v){this[k]=v},focus(){},setPointerCapture(){}});
const range={min:'0',max:'100',value:50,previousElementSibling:null,classList:{add(){}},getAttribute:()=> 'Test',setAttribute(){},before(k){knob=k;this.previousElementSibling=k},oninput(){inputs++},onchange(){commits++}};
c.attachSynthKnob(range);assert.equal(knob['aria-valuenow'],50);
knob.onpointerdown({button:0,clientY:100,pointerId:1,preventDefault(){}});knob.onpointermove({clientY:10});assert.equal(Number(range.value),100);knob.onpointerup();assert.equal(commits,1);
knob.onpointerdown({button:0,clientY:100,pointerId:1,preventDefault(){}});knob.onpointermove({clientY:200});knob.onpointercancel();assert.equal(Number(range.value),100);assert.equal(commits,1);
knob.onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(Number(range.value),99);assert.equal(commits,2);
range.value=25;c.attachSynthKnob(range);assert.equal(knob['aria-valuenow'],25);assert.ok(inputs>0);
console.log('Rotary knobs: bounded drag, single commit, cancel, keyboard and numerical repaint passed');
vm.runInContext(src.slice(src.indexOf('function reshapeWave('),src.indexOf('function wavePoint(')),c);
const wave=Array(32).fill(0);c.reshapeWave(wave,null,2,-128);assert.equal(wave[2],-128);c.reshapeWave(wave,{index:2,value:-128},6,127);assert.deepEqual(wave.slice(2,7),[-128,-64,0,63,127]);c.reshapeWave(wave,{index:6,value:127},4,-1);assert.deepEqual(wave.slice(4,7),[-1,63,127]);assert.equal(wave[7],0);
console.log('SCC direct drawing: initial point, forward/reverse interpolation and untouched samples passed');

const codes=vm.runInContext('soundKeyCodes',c);assert.equal(codes.length,48);assert.equal(new Set(codes).size,48);
for(let octave=1;octave<=3;octave++){
 let played=-1;c.$=id=>id==='sound-keyboard'?{children:Array.from({length:72},(_,i)=>({classList:{add(){},remove(){}},click(){played=i;}})),classList:{contains:()=>false}}:{value:String(octave)};
 for(const [i,code] of codes.entries()){handlers.keydown(event(code));assert.equal(played,(octave-1)*12+i);handlers.keyup(event(code));}
}
console.log('JIS keyboard: all 48 physical keys, three octave bases, complete C1-B6 bounds passed');
