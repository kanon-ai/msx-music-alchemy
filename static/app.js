'use strict';
const $=id=>document.getElementById(id), clone=x=>structuredClone(x);
const colors={PSG:'#81b4de',OPLL:'#a5b3d6',SCC:'#89b4c4'}, names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const noteName=n=>names[((n%12)+12)%12]+(Math.floor(n/12)-1);
let song,revision=0,token='',trackIndex=0,selected=null,page=0,grid=24,topPitch=83,view='roll',solo=null;
let undo=[],redo=[],saveTimer=null,dirty=false,saving=false,conflict=false,drag=null,epoch=0;
let masterGain=null,previewBoost=1,livePlayer=null,liveLimiter=null;
let stepRows=[],stepFollowRow=null,editRange=null,rangeDrag=null;
let audioContext=null,source=null,playing=false,playStart=0,playOffset=0,renderId=0;
// BEGIN PREVIEW CACHE
class PreviewCache {
 constructor(render){this.render=render;this.entry=null;this.tail=Promise.resolve();}
 get(key){
  if(this.entry?.key===key)return this.entry.promise;
  const entry={key,promise:null};this.entry=entry;
  entry.promise=this.tail.catch(()=>{}).then(()=>{
   if(this.entry!==entry)throw new Error('Preview superseded');
   return this.render(key);
  }).catch(error=>{if(this.entry===entry)this.entry=null;throw error;});
  this.tail=entry.promise;return entry.promise;
 }
}
// END PREVIEW CACHE
function schedulePreview(){}
const track=()=>song.tracks[trackIndex], end=()=>song.bars*384;
const drumKeys={6:[36],7:[38,42],8:[45,49]}, drumNames={36:'バスドラム',38:'スネア',42:'ハイハット',45:'タム',49:'シンバル'};
const isPsgDrum=()=>track().chip==='PSG'&&track().psgMode==='drums';
const isDrum=()=>isPsgDrum()||(!!song.opllRhythm&&track().chip==='OPLL'&&track().channel>=6);
const currentDrumKeys=()=>isPsgDrum()?[36,38,42,45,49]:drumKeys[track().channel];
const validDrum=p=>!isDrum()||currentDrumKeys().includes(p);
const status=(message,error=false)=>{ $('status').textContent=message; $('status').classList.toggle('error',error); };
function safe(fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>status(e.message,true));}
async function api(path,data){
 const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Studio-Token':token},body:data===undefined?undefined:JSON.stringify(data)});
 if(!r.ok){const e=await r.json(); const error=new Error(e.error||r.statusText);error.http=r.status;throw error;}return r;
}
function snapshot(){return JSON.stringify(song);}
function checkpoint(){undo.push(snapshot());if(undo.length>80)undo.shift();redo=[];}
function changed(liveMix=false,keepAudition=false){epoch++;dirty=true;conflict=false;if(liveMix&&playing&&livePlayer)livePlayer.setMix(song,solo);else stop(keepAudition);draw();queueSave();}
function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveState().catch(e=>status(e.message,true)),350);}
async function saveState(){
 if(!dirty||saving||conflict)return;saving=true; const sent=epoch;let failed=false;
 try{const data=await (await api('/api/state',{song,revision})).json();revision=data.revision;dirty=epoch!==sent;status('保存済み · revision '+revision);}
 catch(e){failed=true;if(e.http===409){conflict=true;status('AIまたは別画面と競合しました。JSON保存で退避してからページを再読込してください。',true);}throw e;}
 finally{saving=false;if(dirty&&!conflict&&!failed)queueSave();}
}
function edit(fn,liveMix=false){checkpoint();fn();changed(liveMix);}
function refreshInputs(){
 $('title').value=song.title;$('bpm').value=song.bpm;$('bars').value=song.bars;$('hz').value=song.hz;$('loop').checked=song.loop;$('loopStart').value=Math.floor(song.loopStart/384)+1;
 $('page').replaceChildren();for(let i=0;i<song.bars;i++){const o=new Option(String(i+1).padStart(2,'0'),i);$('page').add(o);}$('page').value=page;
}
function drawTracks(){
 const container=$('track-list');container.replaceChildren();
 for(const chip of ['PSG','OPLL','SCC']){
  const group=document.createElement('div');group.className='chip-group';group.style.setProperty('--chip',colors[chip]);group.textContent=chip+' / '+({PSG:'AY-3-8910',OPLL:'YM2413',SCC:'K051649'}[chip]);container.append(group);
  song.tracks.forEach((t,i)=>{if(t.chip!==chip)return;const row=document.createElement('div');row.className='track'+(trackIndex===i?' selected':'')+(t.mute?' muted':'');row.style.setProperty('--chip',colors[chip]);
   const no=document.createElement('span');no.className='track-number';no.textContent=String(t.channel+1).padStart(2,'0');
   const name=document.createElement('span');name.className='track-name';name.textContent=t.name;name.title=t.name;
   const mute=document.createElement('button');mute.textContent='M';mute.classList.toggle('on',t.mute);mute.title=t.name+'をミュート';mute.onclick=e=>{e.stopPropagation();edit(()=>t.mute=!t.mute,true);};
   const s=document.createElement('button');s.textContent='S';s.classList.toggle('on',solo===i);s.title=t.name+'をソロ試聴';s.onclick=e=>{e.stopPropagation();solo=solo===i?null:i;if(livePlayer)livePlayer.setMix(song,solo);drawTracks();};
   row.append(no,name,mute,s);row.onclick=()=>{trackIndex=i;selected=null;editRange=null;if(isDrum()){topPitch=59;$('octave').value=48;}draw();};container.append(row);
  });
 }
}
function drawOverview(){
 $('overview').replaceChildren();const lo=Math.max(0,Math.min(page-7,song.bars-16));
 for(let i=lo;i<Math.min(lo+16,song.bars);i++){
  const b=document.createElement('button');b.textContent=String(i+1).padStart(2,'0');b.classList.toggle('active',page===i);b.title='小節 '+(i+1);
  if(song.tracks.some(t=>t.notes.some(n=>n.start<i*384+384&&n.start+n.duration>i*384)))b.append(document.createElement('i'));
  b.onclick=()=>{page=i;$('page').value=i;draw();};$('overview').append(b);
 }$('overview-info').textContent=`${song.bars} BARS · 4/4 · ${Math.round(end()/96*60/song.bpm)} SEC`;
}
function drawRange(){
 const el=$('range-selection');el.hidden=!editRange||editRange.to<=page*384||editRange.from>=(page+1)*384;
 if(!el.hidden){const a=Math.max(0,editRange.from-page*384),b=Math.min(384,editRange.to-page*384);el.style.left=a/384*100+'%';el.style.width=(b-a)/384*100+'%';}
}
function drawRoll(){drawRange();
 const piano=$('piano'),lines=$('grid-lines');piano.replaceChildren();lines.replaceChildren();$('ruler-beats').replaceChildren();
 for(let i=0;i<4;i++){const s=document.createElement('span');s.textContent=`${page+1}.${i+1}`;$('ruler-beats').append(s);}
 for(let i=0;i<24;i++){
  const pitch=topPitch-i, black=[1,3,6,8,10].includes(pitch%12);const k=document.createElement('div');k.className='key'+(black?' black':'')+(pitch%12===0?' c':'');k.textContent=noteName(pitch);piano.append(k);
  const r=document.createElement('div');r.className='grid-row'+(black?' black':'')+(pitch%12===0?' c':'');lines.append(r);
 }
 for(let tick=0;tick<384;tick+=grid){const l=document.createElement('div');l.className='grid-line'+(tick%96===0?' beat':'');l.style.left=tick/384*100+'%';lines.append(l);}
 $('notes').replaceChildren();$('velocities').replaceChildren();
 const renderNote=(n,ghost,chip)=>{
  if(n.pitch>topPitch||n.pitch<=topPitch-24||n.start>=page*384+384||n.start+n.duration<=page*384)return;
  const left=Math.max(n.start-page*384,0),right=Math.min(n.start+n.duration-page*384,384);
  const el=document.createElement('div');el.className='note'+(ghost?' ghost':'')+(selected===n.id&&!ghost?' selected':'');el.dataset.id=n.id;el.style.setProperty('--chip',colors[chip]);
  el.style.left=left/384*100+'%';el.style.width=(right-left)/384*100+'%';el.style.top=(topPitch-n.pitch)*16+'px';el.textContent=noteName(n.pitch);el.title=`${noteName(n.pitch)} · ${n.start} tick · ${n.duration} ticks · v${n.velocity}`;
  if(!ghost){const handle=document.createElement('span');handle.className='resize';el.append(handle);el.onpointerdown=e=>startNoteDrag(e,n);el.oncontextmenu=e=>{e.preventDefault();edit(()=>{track().notes=track().notes.filter(x=>x.id!==n.id);selected=null;});};}
  $('notes').append(el);
  if(!ghost){const v=document.createElement('i');v.style.left=left/384*100+'%';v.style.height=n.velocity/15*34+'px';v.style.setProperty('--chip',colors[chip]);$('velocities').append(v);}
 };
 song.tracks.forEach((t,i)=>{if(i!==trackIndex&&!t.mute)t.notes.forEach(n=>renderNote(n,true,t.chip));});
 track().notes.forEach(n=>renderNote(n,false,track().chip));
}
function drawInspector(){
 const t=track();$('track-title').textContent=t.name;$('track-name').value=t.name;$('chip-badge').textContent=t.chip+' / '+({PSG:'AY-3-8910',OPLL:'YM2413',SCC:'K051649'}[t.chip]);$('chip-badge').style.setProperty('--chip',colors[t.chip]);
 for(const chip of ['psg','opll','scc'])$(chip+'-controls').hidden=t.chip.toLowerCase()!==chip;
 $('opll-rhythm').checked=!!song.opllRhythm;$('rhythm-help').hidden=!song.opllRhythm;$('instrument').disabled=isDrum();
 $('instrument').value=t.instrument;$('patch').value=song.opllPatch.map(v=>v.toString(16).padStart(2,'0')).join(' ');drawWave();
 $('psg-mode').value=t.psgMode||'tone';$('noise-period').value=t.noisePeriod||16;$('noise-period').disabled=t.psgMode!=='noise';$('psg-decay').value=t.decayMs||0;$('psg-decay').disabled=!['noise','drums'].includes(t.psgMode);
 const n=t.notes.find(n=>n.id===selected);$('note-instrument-label').hidden=!n||t.chip!=='OPLL'||isDrum();$('note-instrument').value=n?.instrument??'';$('note-decay-label').hidden=!n||t.chip!=='PSG'||!['noise','drums'].includes(t.psgMode);$('note-decay').value=n?.decayMs||0;$('note-controls').hidden=!n;$('note-empty').hidden=!!n;
 $('note-expression').hidden=!n||t.chip!=='OPLL'||isDrum();if(n)for(const [k,d] of [['detuneCents',0],['vibratoDepth',0],['vibratoRate',50],['vibratoDelayMs',250],['portamentoMs',0],['portamentoFrom',n.pitch]])$('expr-'+k).value=n[k]??d;
 if(n)for(const field of ['pitch','start','duration','velocity'])$('note-'+field).value=n[field];
 $('note-count').textContent=t.notes.length+' NOTES';$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
}
function drawStep(){
 $('step-keys').replaceChildren();for(const p of (isDrum()?currentDrumKeys():Array.from({length:13},(_,i)=>topPitch-23+i))){
  const b=document.createElement('button');b.textContent=isDrum()?drumNames[p]:noteName(p);if([1,3,6,8,10].includes(p%12))b.className='black';b.onclick=()=>stepNote(p);$('step-keys').append(b);
 }
 stepRows=[];stepFollowRow=null;
 $('step-table').replaceChildren();for(const n of [...track().notes].sort((a,b)=>a.start-b.start)){
  const row=document.createElement('tr');row.classList.toggle('selected',n.id===selected);for(const value of [`${Math.floor(n.start/384)+1}:${Math.floor(n.start%384/96)+1}`,noteName(n.pitch),n.start,n.duration,n.velocity]){const td=document.createElement('td');td.textContent=value;row.append(td);}
  stepRows.push({note:n,row});
  row.onclick=()=>{selected=n.id;$('step-cursor').value=n.start;page=Math.floor(n.start/384);draw();};$('step-table').append(row);
 }
}
function stepPlaybackIndex(notes,tick){
 return notes.findIndex(n=>n.start<=tick&&tick<n.start+n.duration);
}
function followStep(tick){
 const active=stepPlaybackIndex(stepRows.map(x=>x.note),tick);
 for(let i=0;i<stepRows.length;i++)stepRows[i].row.classList.toggle('playing-note',i===active);
 $('step-play-position').textContent=`再生位置 ${Math.floor(tick/384)+1}:${Math.floor(tick%384/96)+1} · ${Math.floor(tick)} tick`;
 const next=active>=0?active:stepRows.findIndex(x=>x.note.start>tick);
 const row=stepRows[next]?.row;
 if(row&&row!==stepFollowRow){
  stepFollowRow=row;
  const wrap=$('step-table').closest('.step-table-wrap'),r=row.getBoundingClientRect(),w=wrap.getBoundingClientRect();
  if(r.top<w.top+30||r.bottom>w.bottom)wrap.scrollTop+=r.top-w.top-wrap.clientHeight/2;
 }
}
function clearStepPlayback(){
 for(const x of stepRows)x.row.classList.remove('playing-note');
 stepFollowRow=null;$('step-play-position').textContent='停止中';
}
function draw(){
 schedulePreview();
 page=Math.min(page,song.bars-1);refreshInputs();drawTracks();drawOverview();drawRoll();drawInspector();if(view==='step')drawStep();
}
function fits(n,ignore=null){return validDrum(n.pitch)&&n.start>=0&&n.duration>=1&&n.start+n.duration<=end()&&n.pitch>=24&&n.pitch<=95&&n.velocity>=1&&n.velocity<=15&&!track().notes.some(x=>x.id!==ignore&&n.start<x.start+x.duration&&n.start+n.duration>x.start);}
function insert(pitch,start){
 const n={id:crypto.randomUUID(),pitch,start,duration:+$('length').value,velocity:+$('velocity').value};
 if(!fits(n)){status('音が重なるか、曲の範囲外です。別チャンネル・音長を選んでください。',true);return false;}
 edit(()=>{track().notes.push(n);track().notes.sort((a,b)=>a.start-b.start);selected=n.id;});return true;
}
$('roll').onpointerdown=e=>{if(e.target.closest('.note')||e.button!==0)return;
 if(e.shiftKey){e.preventDefault();const r=$('roll').getBoundingClientRect(),tick=page*384+Math.floor((e.clientX-r.left)/r.width*384/grid)*grid;rangeDrag={anchor:tick};editRange={from:tick,to:Math.min(end(),tick+grid)};drawRange();return;}
 editRange=null;const r=$('roll').getBoundingClientRect();insert(topPitch-Math.floor((e.clientY-r.top)/16),page*384+Math.floor((e.clientX-r.left)/r.width*384/grid)*grid);};
function startNoteDrag(e,n){
 if(e.button!==0)return;e.preventDefault();e.stopPropagation();stop();selected=n.id;editRange=null;
 drag={id:n.id,before:snapshot(),original:clone(n),x:e.clientX,y:e.clientY,width:$('roll').getBoundingClientRect().width,resize:e.target.classList.contains('resize'),lastPitch:n.pitch,changed:false};if(!drag.resize)auditionNote(n);drawInspector();drawRoll();
}
window.addEventListener('pointermove',e=>{
 if(rangeDrag){const r=$('roll').getBoundingClientRect(),tick=page*384+Math.max(0,Math.min(384-grid,Math.floor((e.clientX-r.left)/r.width*384/grid)*grid));editRange={from:Math.min(rangeDrag.anchor,tick),to:Math.min(end(),Math.max(rangeDrag.anchor,tick)+grid)};drawRange();return;}
 if(!drag)return;const n=track().notes.find(n=>n.id===drag.id);const dx=Math.round((e.clientX-drag.x)/drag.width*384/grid)*grid;
 const candidate={...drag.original};if(drag.resize)candidate.duration=Math.max(grid,drag.original.duration+dx);else{candidate.start=drag.original.start+dx;candidate.pitch=drag.original.pitch-Math.round((e.clientY-drag.y)/16);}
 if(fits(candidate,n.id)){Object.assign(n,candidate);drag.changed=true;if(!drag.resize&&n.pitch!==drag.lastPitch){drag.lastPitch=n.pitch;auditionNote(n);}drawRoll();drawInspector();}
});
window.addEventListener('pointerup',()=>{rangeDrag=null;if(!drag)return;const d=drag;drag=null;if(d.changed&&d.before!==snapshot()){undo.push(d.before);redo=[];track().notes.sort((a,b)=>a.start-b.start);changed(false,true);}});
function stepNote(pitch){if(!validDrum(pitch)){status('このリズムトラックのドラム音を選んでください。',true);return;}let cursor=+$('step-cursor').value;const existing=track().notes.find(n=>n.start===cursor);if(existing){const n={...existing,pitch};edit(()=>{Object.assign(existing,n);selected=n.id;});$('step-cursor').value=Math.min(end()-1,cursor+ +$('length').value);}else if(insert(pitch,cursor))$('step-cursor').value=Math.min(end()-1,cursor+ +$('length').value);}
function deleteSelected(){if(!selected)return;edit(()=>{track().notes=track().notes.filter(n=>n.id!==selected);selected=null;});}
function history(direction){const a=direction==='undo'?undo:redo,b=direction==='undo'?redo:undo;if(!a.length)return;b.push(snapshot());song=JSON.parse(a.pop());selected=null;changed();}
function stop(keepAudition=false){if(keepAudition!==true)stopAudition();if(livePlayer){livePlayer.stop();livePlayer=null;}clearStepPlayback();const wasPlaying=playing;renderId++;playing=false;if(source){try{source.stop();}catch{}source=null;}$('play').textContent='▶';$('play').disabled=false;$('playhead').style.display='none';$('time').textContent='001 : 01';if(wasPlaying)status('停止しました。');}
function previewGain(buffer){
 let peak=0;
 for(let ch=0;ch<buffer.numberOfChannels;ch++){
  const data=buffer.getChannelData(ch);
  for(let i=0;i<data.length;i++)peak=Math.max(peak,Math.abs(data[i]));
 }
 // One constant gain for the entire performance preserves phrasing and dynamics.
 // Leave 1 dB sample-peak headroom and cap boost at about 18 dB.
 return peak>0?Math.min(8,Math.pow(10,-1/20)/peak):1;
}
function updateMaster(){
 const value=Number($('master-volume').value)/100;
 $('master-value').textContent=Math.round(value*100)+'%';
 if(masterGain)masterGain.gain.setTargetAtTime(previewBoost*value,audioContext.currentTime,.025);
}
async function play(){
 stopAudition();if(playing){stop();return;}const id=++renderId;
 audioContext??=new AudioContext();await audioContext.resume();$('play').disabled=true;status('音源を起動しています…');
 try{
  previewBoost=8;
  if(!masterGain){
   masterGain=audioContext.createGain();liveLimiter=audioContext.createDynamicsCompressor();
   liveLimiter.threshold.value=-1;liveLimiter.knee.value=0;liveLimiter.ratio.value=20;
   liveLimiter.attack.value=.003;liveLimiter.release.value=.1;
   masterGain.connect(liveLimiter);liveLimiter.connect(audioContext.destination);
  }
  masterGain.gain.cancelScheduledValues(audioContext.currentTime);
  masterGain.gain.setValueAtTime(previewBoost*Number($('master-volume').value)/100,audioContext.currentTime);
  const current=new LivePlayer(audioContext,masterGain,api,token,()=>{if(id===renderId)stop();},e=>{if(id===renderId){stop();status(e.message,true);}});
  livePlayer=current;current.setMix(song,solo);playOffset=page*4*60/song.bpm;
  await current.start(clone(song),page*384);if(id!==renderId){current.stop();return;}
  playing=true;$('play').textContent='Ⅱ';status('再生中 · リアルタイム音源 · M / S は停止せず反映');requestAnimationFrame(animate);
 }catch(e){if(id===renderId)stop();throw e;}
 finally{if(id===renderId)$('play').disabled=false;}
}

function animate(){
 if(!playing)return;$('time').dataset.audioSamples=String(livePlayer?.samples||0);$('time').dataset.underruns=String(livePlayer?.underruns||0);let secs=(livePlayer?.samples||0)/44100+playOffset,total=end()/96*60/song.bpm;
 if(song.loop&&secs>=total){const begin=song.loopStart/96*60/song.bpm;secs=begin+(secs-total)%(total-begin);}
 const tick=secs*song.bpm/60*96;const bar=Math.floor(tick/384);$('time').textContent=String(bar+1).padStart(3,'0')+' : '+String(Math.floor(tick%384/96)+1).padStart(2,'0');
 if(bar<song.bars&&bar!==page){page=bar;drawOverview();drawRoll();$('page').value=page;}
 $('playhead').style.display='block';$('playhead').style.left=(tick%384)/384*100+'%';if(view==='step')followStep(tick);requestAnimationFrame(animate);
}
function download(data,filename){const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportSong(format){status('出力を作成中…');const response=await api('/api/export',{song,format});const ext={bundle:'.zip',json:'.msx.json',registers:'.registers.json',header:'.h',vgm:'.vgm',mgs:'.mgs',wav:'.wav'}[format];const base=format==='mgs'?(song.title.replace(/[^A-Za-z0-9_]/g,'').slice(0,8).toUpperCase()||'MUSIC'):(song.title.replace(/[^\p{L}\p{N}_-]/gu,'_')||'song');download(await response.blob(),base+ext);status('出力しました · '+format);}
async function replaceSong(next){await api('/api/validate',{song:next});edit(()=>{song=next;selected=null;page=0;solo=null;});}
function drawWave(){const ctx=$('wave-canvas').getContext('2d');ctx.clearRect(0,0,256,100);ctx.strokeStyle='#2d3c45';ctx.beginPath();ctx.moveTo(0,50);ctx.lineTo(256,50);ctx.stroke();ctx.strokeStyle=colors.SCC;ctx.lineWidth=2;ctx.beginPath();track().wave.forEach((v,i)=>{const y=50-v/128*45;if(i===0)ctx.moveTo(0,y);else ctx.lineTo(i*8,y);ctx.lineTo((i+1)*8,y);});ctx.stroke();}
let waveDrawing=false,waveBefore=null;
function wavePoint(e){const rect=$('wave-canvas').getBoundingClientRect(),index=Math.max(0,Math.min(31,Math.floor((e.clientX-rect.left)/rect.width*32))),value=Math.max(-128,Math.min(127,Math.round((.5-(e.clientY-rect.top)/rect.height)*256)));track().wave[index]=value;mirrorWave();drawWave();}
function mirrorWave(){if(track().chip==='SCC'&&track().channel>=3){song.tracks.find(t=>t.chip==='SCC'&&t.channel===(track().channel===3?4:3)).wave=track().wave.slice();}}
$('wave-canvas').onpointerdown=e=>{waveDrawing=true;waveBefore=snapshot();e.target.setPointerCapture(e.pointerId);wavePoint(e);};
$('wave-canvas').onpointermove=e=>{if(waveDrawing)wavePoint(e);};
$('wave-canvas').onpointerup=()=>{if(waveDrawing){waveDrawing=false;undo.push(waveBefore);redo=[];$('wave-preset').value='custom';changed();}};
$('wave-preset').onchange=e=>{const kind=e.target.value;if(kind==='custom')return;edit(()=>{track().wave=Array.from({length:32},(_,i)=>kind==='square'?(i<16?100:-100):kind==='saw'?i*8-124:kind==='sine'?Math.round(110*Math.sin(i*Math.PI*2/32)):Math.round(110*(1-4*Math.abs(i/32-.5))));mirrorWave();});};
$('title').onchange=e=>edit(()=>song.title=e.target.value);
for(const field of ['bpm','hz'])$(field).onchange=e=>{const v=+e.target.value;if(!Number.isInteger(v)||field==='bpm'&&(v<40||v>300)){draw();return;}edit(()=>song[field]=v);};
$('bars').onchange=e=>{const v=+e.target.value;if(!Number.isInteger(v)||v<1||v>64||song.tracks.some(t=>t.notes.some(n=>n.start+n.duration>v*384))){status('ノートのある小節は削れません。先にノートを移動・削除してください。',true);draw();return;}edit(()=>{song.bars=v;song.loopStart=Math.min(song.loopStart,(v-1)*384);});};
$('loop').onchange=e=>edit(()=>song.loop=e.target.checked);
$('loopStart').onchange=e=>{const v=(+e.target.value-1)*384;if(!Number.isInteger(v)||v<0||v>=end()){draw();return;}edit(()=>song.loopStart=v);};
// BEGIN COMPOSITE RECIPE
function compositeBass(input,sourceId,targetId,attenuation){
 const p=structuredClone(input), src=p.tracks.find(t=>t.id===sourceId), dst=p.tracks.find(t=>t.id===targetId);
 const melodic=t=>t&&t.chip==='OPLL'&&!(p.opllRhythm&&t.channel>=6);
 if(!melodic(src)||!melodic(dst)||sourceId===targetId)throw Error('別のOPLL旋律トラックを選んでください。');
 if(!src.notes.length||src.mute)throw Error('音符のある、ミュートされていない元パートを選んでください。');
 if(dst.notes.length)throw Error('追加先に音符があります。上書きはできません。');
 if(!Number.isInteger(attenuation)||attenuation<0||attenuation>14)throw Error('音量差は0〜14の整数です。');
 src.instrument=14;dst.instrument=10;dst.mute=false;dst.name=(src.name.slice(0,55)+' / Synth layer');
 dst.notes=src.notes.filter(n=>n.velocity>attenuation).map(n=>({...n,id:'layer-'+n.id,velocity:n.velocity-attenuation}));
 if(!dst.notes.length)throw Error('追加音がすべて無音になります。音量差を小さくしてください。');
 return p;
}
// END COMPOSITE RECIPE
let layerSourceId=null,layerAudition=null,layerRequest=0;
function stopLayer(){layerRequest++;if(layerAudition){try{layerAudition.stop();}catch{}layerAudition=null;}}
function layerCandidate(){return compositeBass(song,layerSourceId,$('layer-target').value,Number($('layer-attenuation').value));}
function layerInfo(){
 stopLayer();try{const p=layerCandidate(),t=p.tracks.find(t=>t.id===$('layer-target').value);$('layer-info').textContent='追加 '+t.notes.length+'音 · OPLL計2ch · 適用は取り消し可能';$('layer-preview').disabled=false;$('layer-apply').disabled=false;}
 catch(e){$('layer-info').textContent=e.message;$('layer-preview').disabled=true;$('layer-apply').disabled=true;}
}
$('layer-open').onclick=()=>{
 stop();layerSourceId=track().id;$('layer-target').replaceChildren();
 song.tracks.filter(t=>t.id!==layerSourceId&&t.chip==='OPLL'&&!(song.opllRhythm&&t.channel>=6)&&!t.notes.length).forEach(t=>$('layer-target').add(new Option(t.name,t.id)));
 layerInfo();if(!$('layer-target').options.length)$('layer-info').textContent='空きOPLL旋律トラックがありません。既存パートは上書きしません。';$('layer-dialog').showModal();
};
$('layer-target').onchange=layerInfo;$('layer-attenuation').oninput=layerInfo;
$('layer-stop').onclick=stopLayer;$('layer-dialog').addEventListener('close',stopLayer);
$('layer-preview').onclick=safe(async()=>{
 stopLayer();const id=layerRequest,p=layerCandidate(),src=p.tracks.find(t=>t.id===layerSourceId),start=src.notes[0].start;
 const limit=Math.ceil(8*p.bpm*96/60);p.loop=false;p.loopStart=0;p.bars=Math.min(64,Math.ceil(limit/384));
 p.tracks.forEach(t=>{t.notes=t.notes.filter(n=>n.start<start+limit&&n.start+n.duration>start).map(n=>({...n,start:Math.max(0,n.start-start),duration:Math.min(n.start+n.duration-start,limit)-Math.max(0,n.start-start)}));});
 $('layer-info').textContent='試聴を準備しています…';audioContext??=new AudioContext();await audioContext.resume();
 const r=await api('/api/render',{song:p}),buffer=await audioContext.decodeAudioData(await r.arrayBuffer());if(id!==layerRequest||!$('layer-dialog').open)return;
 const gain=audioContext.createGain();gain.gain.value=previewGain(buffer)*Number($('master-volume').value)/100;gain.connect(audioContext.destination);
 layerAudition=audioContext.createBufferSource();layerAudition.buffer=buffer;layerAudition.connect(gain);layerAudition.onended=()=>gain.disconnect();layerAudition.start(0,0,Math.min(8,buffer.duration));$('layer-info').textContent='複合音色を含む全体を試聴中 · 楽曲は未変更';
});
$('layer-apply').onclick=safe(async()=>{
 const p=layerCandidate(),before=snapshot();$('layer-apply').disabled=true;
 try{await api('/api/validate',{song:p});if(!$('layer-dialog').open||snapshot()!==before)return;stopLayer();edit(()=>{song=p;selected=null;});$('layer-dialog').close();}
 finally{if($('layer-dialog').open)layerInfo();}
});
$('track-name').onchange=e=>edit(()=>track().name=e.target.value);
$('opll-rhythm').onchange=e=>{const enabled=e.target.checked;if(song.tracks.some(t=>t.chip==='OPLL'&&t.channel>=6&&t.notes.length)){status('モード切替前にOPLL 7〜9のノートを退避して空にしてください。',true);drawInspector();return;}edit(()=>song.opllRhythm=enabled);};
$('psg-mode').onchange=e=>{const mode=e.target.value;if(mode==='drums'&&track().notes.some(n=>![36,38,42,45,49].includes(n.pitch))){status('ドラムキットはMIDI 36/38/42/45/49のノートで使用してください。',true);drawInspector();return;}edit(()=>{track().psgMode=mode;if(mode==='tone')track().notes.forEach(n=>{delete n.noisePeriod;delete n.decayMs;});});};
$('psg-decay').onchange=e=>edit(()=>track().decayMs=+e.target.value);
$('note-decay').onchange=e=>edit(()=>{const n=track().notes.find(n=>n.id===selected);if(n)n.decayMs=+e.target.value;});
$('noise-period').onchange=e=>edit(()=>track().noisePeriod=+e.target.value);
for(const key of ['detuneCents','vibratoDepth','vibratoRate','vibratoDelayMs','portamentoMs','portamentoFrom'])$('expr-'+key).onchange=e=>{if(!e.target.checkValidity()){drawInspector();return;}edit(()=>{const n=track().notes.find(n=>n.id===selected);if(n){n[key]=Number(e.target.value);if(key==='vibratoDepth'){n.vibratoDelayMs??=250;n.vibratoRate??=50;}}});};
$('note-instrument').onchange=e=>edit(()=>{const n=track().notes.find(n=>n.id===selected);if(!n)return;if(e.target.value==='')delete n.instrument;else n.instrument=Number(e.target.value);});
$('instrument').onchange=e=>edit(()=>track().instrument=+e.target.value);
$('patch').onchange=e=>{const values=e.target.value.trim().split(/\s+/);if(values.length!==8||values.some(v=>!/^[0-9a-f]{2}$/i.test(v))){status('OPLL音色は2桁の16進数を8個、空白で区切ってください。',true);drawInspector();return;}edit(()=>song.opllPatch=values.map(v=>parseInt(v,16)));};
for(const field of ['pitch','start','duration','velocity'])$('note-'+field).onchange=e=>{const n=track().notes.find(n=>n.id===selected),v=+e.target.value;if(!n)return;const candidate={...n,[field]:v};if(!Number.isInteger(v)||!fits(candidate,n.id)){status('値が範囲外か、他の音と重なります。',true);drawInspector();return;}edit(()=>Object.assign(n,candidate));};
$('page').onchange=e=>{page=+e.target.value;draw();};$('grid').onchange=e=>{grid=+e.target.value;drawRoll();};$('octave').onchange=e=>{topPitch=+e.target.value+11;drawRoll();drawStep();};
for(const tab of ['roll','step'])$(tab+'-tab').onclick=()=>{view=tab;$('roll-view').hidden=tab!=='roll';$('step-view').hidden=tab!=='step';$('roll-tab').classList.toggle('active',tab==='roll');$('step-tab').classList.toggle('active',tab==='step');draw();};
$('undo').onclick=()=>history('undo');$('redo').onclick=()=>history('redo');$('delete-note').onclick=deleteSelected;
$('rest').onclick=()=>$('step-cursor').value=Math.min(end()-1,+$('step-cursor').value+ +$('length').value);
$('step-delete').onclick=()=>{const n=track().notes.find(n=>n.start===+$('step-cursor').value);if(n){selected=n.id;deleteSelected();}};
$('copy-bar').onclick=()=>{if(page+1>=song.bars){status('複製先の小節を先に追加してください。',true);return;}const notes=track().notes.filter(n=>n.start>=page*384&&n.start<(page+1)*384).map(n=>({...n,id:crypto.randomUUID(),start:n.start+384}));if(notes.some(n=>!fits(n))){status('複製先の音と重なります。',true);return;}edit(()=>{track().notes.push(...notes);page++;});};
$('master-volume').oninput=updateMaster;
$('play').onclick=safe(play);$('stop').onclick=stop;$('rewind').onclick=()=>{stop();page=0;draw();};
$('save').onclick=safe(()=>exportSong('json'));
for(const id of ['import','export','help'])$(id).onclick=()=>$(id+'-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('[data-format]').forEach(b=>b.onclick=safe(()=>exportSong(b.dataset.format)));
$('new').onclick=safe(async()=>{if(!confirm('新しい曲に切り替えます。現在の曲は取り消しで戻せます。'))return;await replaceSong(await (await api('/api/new')).json());});
$('demo').onclick=safe(async()=>{if(!confirm('デモ曲に切り替えます。現在の曲は取り消しで戻せます。'))return;await replaceSong(await (await api('/api/demo')).json());});
$('validate').onclick=safe(async()=>{const d=await (await api('/api/validate',{song})).json();status(`検証OK · ${d.frames} frames / ${d.hz} Hz · ${d.events.reduce((s,e)=>s+e.writes.length,0)} writes`);});
async function readMml(text){const result=await (await api('/api/mml',{text})).json();await replaceSong(result.song);$('import-dialog').close();status(result.warnings.length?result.warnings.join(' / '):'MMLを読み込みました。');}
$('import-mml').onclick=safe(()=>readMml($('mml').value));
$('file').onchange=safe(async e=>{const file=e.target.files[0];if(!file)return;if(file.size>4000000)throw new Error('ファイルが大きすぎます。');const bytes=await file.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('shift-jis').decode(bytes);}if(file.name.toLowerCase().endsWith('.json')){await replaceSong(JSON.parse(text));$('import-dialog').close();status('JSONを読み込みました。');}else await readMml(text);e.target.value='';});
window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey?'redo':'undo');return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();history('redo');return;}if(e.code==='Space'){e.preventDefault();safe(play)();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();}if(view==='step'&&!e.ctrlKey&&!e.metaKey){const i='zsxdcvgbhnjm'.indexOf(e.key.toLowerCase());if(i>=0&&e.key.length===1){e.preventDefault();stepNote(topPitch-23+i);}}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function poll(){if(dirty||saving||drag||waveDrawing||document.querySelector('dialog[open]')||document.activeElement.matches('input,textarea,select'))return;try{const data=await (await api('/api/state')).json();if(data.revision!==revision){stop();song=data.song;revision=data.revision;undo=[];redo=[];selected=null;draw();status('AI / 別画面の変更を反映しました · revision '+revision);}$('connection').textContent='● LOCAL';}catch{$('connection').textContent='● OFFLINE';}}
safe(async()=>{const info=await (await api('/api/info')).json();token=info.token;info.patches.forEach((name,i)=>{$('instrument').add(new Option(String(i).padStart(2,'0')+' · '+name,i));$('note-instrument').add(new Option(String(i).padStart(2,'0')+' · '+name,i));});const data=await (await api('/api/state')).json();song=data.song;revision=data.revision;draw();status('ローカルで準備完了 · 自動保存 / MCP連携対応');setInterval(poll,2000);})();

// Audition uses the real chip voice, with stale requests discarded during fast drags.
let auditionSerial=0,auditionAbort=null,auditionSource=null,auditionGain=null;
const auditionCache=new Map();
function stopAudition(){auditionSerial++;auditionAbort?.abort();auditionAbort=null;if(auditionSource){try{auditionGain?.gain.setTargetAtTime(0,audioContext.currentTime,.002);auditionSource.stop(audioContext.currentTime+.01);}catch{}auditionSource=null;auditionGain=null;}}
async function auditionNote(note){
 if(!$('drag-audition').checked)return;
 stopAudition();const id=auditionSerial;
 const t=track(),body={track:Object.fromEntries(['chip','channel','instrument','wave','psgMode','noisePeriod','decayMs'].filter(k=>k in t).map(k=>[k,t[k]])),note:{pitch:note.pitch,velocity:note.velocity},opllPatch:song.opllPatch,opllRhythm:!!song.opllRhythm};
 for(const k of ['instrument','noisePeriod','decayMs'])if(k in note)body.note[k]=note[k];
 const key=JSON.stringify(body);
 try{
  audioContext??=new AudioContext();await audioContext.resume();if(id!==auditionSerial)return;
  let buffer=auditionCache.get(key);
  if(!buffer){
   auditionAbort=new AbortController();const r=await fetch('/api/audition',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':token},body:key,signal:auditionAbort.signal});
   if(!r.ok)throw Error((await r.json()).error||'試聴できませんでした。');
   buffer=await audioContext.decodeAudioData(await r.arrayBuffer());if(id!==auditionSerial)return;
   if(auditionCache.size>=128)auditionCache.delete(auditionCache.keys().next().value);auditionCache.set(key,buffer);
  }
  if(id!==auditionSerial)return;
  const gain=audioContext.createGain();gain.gain.value=previewGain(buffer)*Number($('master-volume').value)/100;gain.connect(audioContext.destination);
  const node=audioContext.createBufferSource();node.buffer=buffer;node.connect(gain);auditionSource=node;auditionGain=gain;
  node.onended=()=>{gain.disconnect();if(auditionSource===node)auditionSource=null;};node.start();$('roll').dataset.auditionPitch=String(note.pitch);$('roll').dataset.auditionCount=String(Number($('roll').dataset.auditionCount||0)+1);
 }catch(e){if(id===auditionSerial&&e.name!=='AbortError')status('音程試聴: '+e.message,true);}
}
$('drag-audition').onchange=()=>{if(!$('drag-audition').checked)stopAudition();};
let trackEditSource=null;
function trackEditCandidate(){
 const all=$('track-edit-scope').value==='all';
 return transformTrack(song,trackEditSource,{mode:$('track-edit-mode').value,targetId:$('track-edit-target').value,from:all?0:Number($('track-edit-from').value),to:all?end():Number($('track-edit-to').value),shift:Number($('track-edit-shift').value),transpose:Number($('track-edit-transpose').value),volume:Number($('track-edit-volume').value),copyTone:$('track-edit-tone').checked});
}
function trackEditInfo(){
 const copy=$('track-edit-mode').value==='copy';$('track-edit-target-label').hidden=!copy;$('track-edit-tone-label').hidden=!copy;$('track-edit-range').hidden=$('track-edit-scope').value==='all';
 try{const r=trackEditCandidate();$('track-edit-info').textContent=r.count+'音を'+(copy?'コピー':'変更')+'します。適用後はCtrl+Zで取り消せます。';$('track-edit-apply').disabled=false;}
 catch(e){$('track-edit-info').textContent=e.message;$('track-edit-apply').disabled=true;}
}
$('track-edit-open').onclick=()=>{
 stop();trackEditSource=track().id;$('track-edit-source').textContent='元トラック: '+track().name;
 $('track-edit-target').replaceChildren();song.tracks.filter(t=>t.id!==trackEditSource&&t.chip===track().chip).forEach(t=>$('track-edit-target').add(new Option(t.name+(t.notes.length?'（既存 '+t.notes.length+'音）':'（空）'),t.id)));
 const empty=song.tracks.find(t=>t.id!==trackEditSource&&t.chip===track().chip&&!t.notes.length);if(empty)$('track-edit-target').value=empty.id;
 $('track-edit-mode').value='copy';$('track-edit-scope').value=editRange?'range':'all';$('track-edit-from').value=editRange?.from??page*384;$('track-edit-to').value=editRange?.to??Math.min(end(),(page+1)*384);
 $('track-edit-shift').value=0;$('track-edit-transpose').value=0;$('track-edit-volume').value=100;$('track-edit-tone').checked=true;trackEditInfo();$('track-edit-dialog').showModal();
};
for(const id of ['mode','target','scope','from','to','shift','transpose','volume','tone'])$('track-edit-'+id).oninput=trackEditInfo;
$('track-edit-echo').onclick=()=>{$('track-edit-mode').value='copy';$('track-edit-shift').value=24;$('track-edit-volume').value=50;trackEditInfo();};
$('track-edit-apply').onclick=safe(async()=>{
 const before=snapshot(),result=trackEditCandidate();$('track-edit-apply').disabled=true;
 try{await api('/api/validate',{song:result.song});if(snapshot()!==before)throw Error('編集中の内容が変わりました。もう一度操作してください。');
  edit(()=>{song=result.song;selected=null;editRange=null;});$('track-edit-dialog').close();status(result.count+'音を適用しました。');
 }catch(e){$('track-edit-info').textContent=e.message;throw e;}
 finally{if($('track-edit-dialog').open)$('track-edit-apply').disabled=false;}
});
