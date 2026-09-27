const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const src=fs.readFileSync('static/app.js','utf8');
const rows=[0,1,17].map(i=>({dataset:{trackIndex:String(i)},classList:{toggle(k,v){this[k]=v;}}}));
const ctx={document:{querySelectorAll:()=>rows}};vm.runInNewContext(src.slice(src.indexOf('function highlightPart('),src.indexOf('function drawRoll()')),ctx);
ctx.highlightPart(17);assert.deepEqual(rows.map(x=>x.classList['note-hover']),[false,false,true]);ctx.highlightPart(-1);assert(rows.every(x=>!x.classList['note-hover']));console.log('Note hover highlights only the matching part and clears on leave');
