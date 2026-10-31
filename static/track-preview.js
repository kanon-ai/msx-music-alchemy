'use strict';
// Pure draft transform: never modify the stored song.
function buildTrackPreview(base,drafts){
 const result=structuredClone(base);
 for(const [key,d] of drafts){
  const t=result.tracks.find(t=>t.id===key);if(!t)continue;
  if(!Number.isInteger(d.octave)||d.octave< -2||d.octave>2||!Number.isFinite(d.volume)||d.volume<1||d.volume>(d.volumeMode==='absolute'?15:200)||d.volumeMode==='absolute'&&!Number.isInteger(d.volume))throw Error('仮調整の値が範囲外です。');
  const drum=t.chip==='PSG'&&t.psgMode!=='tone'&&t.psgMode!==undefined||t.chip==='OPLL'&&result.opllRhythm&&t.channel>=6;
  if(drum&&d.octave)throw Error('打楽器はオクターブ移動できません。');
  for(const n of t.notes){
   for(const k of ['pitch','portamentoFrom'])if(k in n){n[k]+=12*d.octave;if(n[k]<24||n[k]>95)throw Error(t.name+'：オクターブ移動が音域を超えます。');}
   n.velocity=d.volumeMode==='preserve'?n.velocity:d.volumeMode==='absolute'?d.volume:Math.max(1,Math.min(15,Math.round(n.velocity*d.volume/100)));
  }
  if(d.unify){
   // Resolve the opening voice before removing all per-note overrides.
   if(t.chip==='OPLL'&&!drum){
    const first=t.notes.reduce((a,n)=>!a||n.start<a.start?n:a,null);
    t.instrument=d.tone?.track?.instrument??first?.instrument??t.instrument;
   }
   if(!Number.isInteger(d.uniformVelocity)||d.uniformVelocity<1||d.uniformVelocity>15)throw Error('統一音量は1〜15の整数で指定してください。');
   for(const n of t.notes){delete n.instrument;n.velocity=d.uniformVelocity;}
  }
  if(d.tone){
   Object.assign(t,structuredClone(d.tone.track));
   if(t.chip==='OPLL'&&!drum&&Number.isInteger(d.tone.track?.instrument))for(const n of t.notes)delete n.instrument;
   if(d.tone.patch)result.opllPatch=structuredClone(d.tone.patch);
   if(t.chip==='SCC'&&t.channel>=3){const peer=result.tracks.find(x=>x.chip==='SCC'&&x.channel===(t.channel===3?4:3));if(peer)peer.wave=t.wave.slice();}
  }
 }
 return result;
}
if(typeof module!=='undefined')module.exports={buildTrackPreview};

// One-shot bar audition; never change the editable song or its loop markers.
function buildBarAudition(song,from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>song.bars)throw Error('試聴範囲は1〜曲末の小節で、開始≦終了を指定してください。');
 const p=structuredClone(song),end=to*384;
 p.bars=to;p.loop=false;p.loopStart=0;delete p.loopEnd;
 for(const t of p.tracks)t.notes=t.notes.filter(n=>n.start<end).map(n=>({...n,duration:Math.min(n.duration,end-n.start)}));
 return {song:p,startTick:(from-1)*384};
}
if(typeof module!=='undefined')module.exports.buildBarAudition=buildBarAudition;

function noteToneMarkers(track,rhythm=false){
 const result=new Map();
 if(track.chip!=='OPLL'||rhythm&&track.channel>=6)return result;
 let previous=track.instrument;
 for(const n of [...track.notes].sort((a,b)=>a.start-b.start)){
  const instrument=n.instrument??previous;
  result.set(n.id,{instrument,changed:instrument!==previous,override:n.instrument!==undefined});
  previous=instrument;
 }
 return result;
}
if(typeof module!=='undefined')module.exports.noteToneMarkers=noteToneMarkers;

// A volume edit changes the contiguous equal-volume section, not just one note.
function volumeSection(track,id){
 const ns=[...track.notes].sort((a,b)=>a.start-b.start),i=ns.findIndex(n=>n.id===id);
 if(i<0)return [];let a=i,b=i+1;
 while(a>0&&ns[a-1].velocity===ns[i].velocity)a--;
 while(b<ns.length&&ns[b].velocity===ns[i].velocity)b++;
 return ns.slice(a,b);
}
function setSectionVolume(track,id,value){
 if(!Number.isInteger(value)||value<1||value>15)throw Error('音量は1〜15です。');
 for(const n of volumeSection(track,id))n.velocity=value;
}
function setSectionTone(track,id,value){
 const ns=[...track.notes].sort((a,b)=>a.start-b.start);let previous=track.instrument;
 // Drop redundant old assignments before editing, so they cannot undo this change.
 for(const n of ns)if(n.instrument!==undefined){const v=n.instrument;if(v===previous)delete n.instrument;previous=v;}
 const n=ns.find(n=>n.id===id);if(!n)return;
 if(value==='')delete n.instrument;else n.instrument=Number(value);
}
if(typeof module!=='undefined')Object.assign(module.exports,{volumeSection,setSectionVolume,setSectionTone});

function expandSettings(song){
 const p=structuredClone(song);
 if(p.settingsMode==='changes'){
  for(const t of p.tracks){let v;for(const n of [...t.notes].sort((a,b)=>a.start-b.start)){v=n.velocity??v;n.velocity=v;}}
  delete p.settingsMode;
 }
 return p;
}
if(typeof module!=='undefined')module.exports.expandSettings=expandSettings;

// Remove only the chosen change point; preserve the next different setting.
function removeSettingChange(track,id,key){
 const ns=[...track.notes].sort((a,b)=>a.start-b.start),i=ns.findIndex(n=>n.id===id);
 if(i<0)return false;
 if(key==='velocity'){
  if(i===0||ns[i].velocity===ns[i-1].velocity)return false;
  const old=ns[i].velocity,previous=ns[i-1].velocity;
  for(let j=i;j<ns.length&&ns[j].velocity===old;j++)ns[j].velocity=previous;
  return true;
 }
 if(key==='instrument'){
  let previous=track.instrument;
  for(let j=0;j<i;j++)previous=ns[j].instrument??previous;
  if(ns[i].instrument===undefined||ns[i].instrument===previous)return false;
  const old=ns[i].instrument;delete ns[i].instrument;
  for(let j=i+1;j<ns.length;j++)if(ns[j].instrument!==undefined){if(ns[j].instrument!==old)break;delete ns[j].instrument;}
  return true;
 }
 return false;
}
if(typeof module!=='undefined')module.exports.removeSettingChange=removeSettingChange;
