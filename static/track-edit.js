'use strict';
// Pure transformations: never mutate the source, and never overwrite existing notes.
function transformTrack(input,sourceId,options){
 const p=structuredClone(input),src=p.tracks.find(t=>t.id===sourceId);
 if(!src)throw Error('元トラックがありません。');
 const {mode,targetId,from=0,to=p.bars*384,shift=0,transpose=0,volume=100,copyTone=false}=options;
 if(!['copy','move'].includes(mode))throw Error('操作を選んでください。');
 if(![from,to,shift,transpose,volume].every(Number.isInteger)||from<0||to<=from||to>p.bars*384||volume<1||volume>200)throw Error('範囲・移動量・音量を確認してください。');
 const dst=mode==='copy'?p.tracks.find(t=>t.id===targetId):src;
 if(!dst||mode==='copy'&&dst.id===src.id)throw Error('別のコピー先を選んでください。');
 if(dst.chip!==src.chip)throw Error('同じ音源のトラックへコピーしてください。');
 const picked=src.notes.filter(n=>n.start>=from&&n.start<to);
 if(!picked.length)throw Error('指定範囲に音符がありません。');
 if(copyTone&&mode==='copy'){
  if(dst.notes.length)throw Error('音色もコピーする場合は空のトラックを選んでください。');
  if(dst.chip==='SCC'&&dst.channel>=3){
   const partner=p.tracks.find(t=>t.chip==='SCC'&&t.channel===(dst.channel===3?4:3));
   if(JSON.stringify(partner.wave)!==JSON.stringify(src.wave))throw Error('SCC 4 / 5は波形共有です。共有先と異なる波形はコピーできません。');
  }
  for(const k of ['instrument','wave','psgMode','noisePeriod','decayMs']){
   if(k in src)dst[k]=structuredClone(src[k]);else delete dst[k];
  }
 }
 const ids=new Set(picked.map(n=>n.id));
 const moved=picked.map(n=>{
  const q={...n,start:n.start+shift,pitch:n.pitch+transpose,velocity:Math.min(15,Math.max(1,Math.round(n.velocity*volume/100)))};
  if(mode==='copy')q.id=crypto.randomUUID();
  if(q.portamentoFrom!==undefined)q.portamentoFrom+=transpose;
  if(q.start<0||q.start+q.duration>p.bars*384)throw Error('移動後の音符が曲の範囲外です。必要なら先に小節数を増やしてください。');
  if(q.pitch<24||q.pitch>95||q.portamentoFrom!==undefined&&(q.portamentoFrom<24||q.portamentoFrom>95))throw Error('移調後の音程が範囲外です。');
  return q;
 });
 dst.notes=(mode==='move'?dst.notes.filter(n=>!ids.has(n.id)):dst.notes).concat(moved).sort((a,b)=>a.start-b.start);
 for(let i=1;i<dst.notes.length;i++)if(dst.notes[i].start<dst.notes[i-1].start+dst.notes[i-1].duration)throw Error('移動先の音符と重なります。既存の音符は変更していません。');
 return {song:p,count:moved.length};
}
