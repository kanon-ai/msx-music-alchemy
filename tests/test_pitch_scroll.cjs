const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('static/app.js','utf8');let onscroll,draws=0;const box={scrollTop:0,addEventListener(k,f){onscroll=f}};
const ctx={$:()=>box,topPitch:83,song:{},drag:null,velocityDrag:null,drawRoll(){draws++}};
vm.runInNewContext(src.slice(src.indexOf('function syncPitchScroll(){')),ctx);
ctx.syncPitchScroll();assert.equal(box.scrollTop,192);box.scrollTop=768;onscroll();assert.equal(ctx.topPitch,47);box.scrollTop=0;onscroll();assert.equal(ctx.topPitch,95);assert.equal(draws,2);ctx.drag={};box.scrollTop=300;onscroll();assert.equal(ctx.topPitch,95);
console.log('Pitch scroll: full bounds, synchronization, drag protection passed');
