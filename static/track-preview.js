'use strict';
// Pure draft transform: never modify the stored song.
function buildTrackPreview(base,drafts){
 const result=structuredClone(base);
 for(const [key,d] of drafts){
  const t=result.tracks.find(t=>t.id===key);if(!t)continue;
  if(!Number.isInteger(d.octave)||d.octave< -2||d.octave>2||!Number.isFinite(d.volume)||d.volume<1||d.volume>200)throw Error('仮調整の値が範囲外です。');
  const drum=t.chip==='PSG'&&t.psgMode!=='tone'&&t.psgMode!==undefined||t.chip==='OPLL'&&result.opllRhythm&&t.channel>=6;
  if(drum&&d.octave)throw Error('打楽器はオクターブ移動できません。');
  for(const n of t.notes){
   for(const k of ['pitch','portamentoFrom'])if(k in n){n[k]+=12*d.octave;if(n[k]<24||n[k]>95)throw Error(t.name+'：オクターブ移動が音域を超えます。');}
   n.velocity=Math.max(1,Math.min(15,Math.round(n.velocity*d.volume/100)));
  }
  if(d.tone){
   Object.assign(t,structuredClone(d.tone.track));
   if(d.tone.patch)result.opllPatch=structuredClone(d.tone.patch);
   if(t.chip==='SCC'&&t.channel>=3){const peer=result.tracks.find(x=>x.chip==='SCC'&&x.channel===(t.channel===3?4:3));if(peer)peer.wave=t.wave.slice();}
  }
 }
 return result;
}
if(typeof module!=='undefined')module.exports={buildTrackPreview};
