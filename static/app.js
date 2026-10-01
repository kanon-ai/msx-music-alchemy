'use strict';
const $=id=>document.getElementById(id), clone=x=>structuredClone(x);
const colors={PSG:'#81b4de',OPLL:'#a5b3d6',SCC:'#89b4c4',OPM:'#b3a5d6'}, names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const trackPalette=['#79b8ff','#ffb86b','#b39dff','#70d6b2','#f58caf','#e0d470','#75d5e8','#e5a5ff','#a4d779','#ff9580','#88a6ff','#b9cbdc','#d3b285','#7ed1c5','#d29eb9','#aecb70','#c0a9ed','#f0c780','#8fd0ee','#eea9a2','#a9d6ba','#b6b4ed','#d9ba9c','#d1a7e1','#a1c4cf'];
function trackColor(t){return /^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:trackPalette[Math.max(0,song.tracks.indexOf(t))%trackPalette.length];}
function colorInk(color){const rgb=color.slice(1).match(/../g).map(x=>parseInt(x,16));return rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>145?'#101820':'#ffffff';}
function setTrackColor(value){if(!/^#[0-9a-f]{6}$/i.test(value))return;checkpoint();track().color=value;epoch++;dirty=true;conflict=false;draw();queueSave();}
const noteName=n=>names[((n%12)+12)%12]+(Math.floor(n/12)-1);
let opmTracks=[];
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
const playbackEnd=()=>song.loop?(song.loopEnd??end()):end();
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
 $('opm-enabled').checked=!!song.opmEnabled;$('channel-count').textContent=song.tracks.length+' MONO';
 document.querySelector('[data-format="mgs"]').disabled=!!song.opmEnabled;$('opm-export-help').hidden=!song.opmEnabled;
 $('title').value=song.title;$('bpm').value=song.bpm;$('bars').value=song.bars;$('hz').value=song.hz;$('loop').checked=song.loop;$('loopStart').value=Math.floor(song.loopStart/384)+1;
 $('loop-end').value=song.loopEnd===undefined?'':Number((song.loopEnd/96*60/song.bpm).toFixed(3));
 $('page').replaceChildren();for(let i=0;i<song.bars;i++){const o=new Option(String(i+1).padStart(2,'0'),i);$('page').add(o);}$('page').value=page;
}
function drawTracks(){
 const container=$('track-list');container.replaceChildren();
 for(const chip of ['PSG','OPLL','SCC',...(song.opmEnabled?['OPM']:[])]){
  const group=document.createElement('div');group.className='chip-group';group.style.setProperty('--chip',colors[chip]);group.textContent=chip+' / '+({PSG:'AY-3-8910',OPLL:'YM2413',SCC:'K051649',OPM:'YM2151'}[chip]);container.append(group);
  song.tracks.forEach((t,i)=>{if(t.chip!==chip)return;const row=document.createElement('div');row.className='track'+(trackIndex===i?' selected':'')+(t.mute?' muted':'');row.style.setProperty('--chip',trackColor(t));row.dataset.trackIndex=i;
   const no=document.createElement('span');no.className='track-number';no.textContent=String(t.channel+1).padStart(2,'0');
   const name=document.createElement('span');name.className='track-name';name.textContent=t.name;name.title=t.name;
   const mute=document.createElement('button');mute.textContent='M';mute.classList.toggle('on',t.mute);mute.title=t.name+'をミュート';mute.onclick=e=>{e.stopPropagation();edit(()=>t.mute=!t.mute,true);};
   const s=document.createElement('button');s.textContent='S';s.classList.toggle('on',solo===i);s.title=t.name+'をソロ試聴';s.onclick=e=>{e.stopPropagation();solo=solo===i?null:i;if(livePlayer)livePlayer.setMix(song,solo);drawTracks();};
   const swatch=document.createElement('span');swatch.className='track-swatch';swatch.style.background=trackColor(t);row.append(swatch,no,name,mute,s);row.onclick=()=>{trackIndex=i;selected=null;editRange=null;if(isDrum()){topPitch=59;$('octave').value=48;}draw();};container.append(row);
  });
 }
}
let overviewManualUntil=0;
async function jumpToBar(bar){
 if(!Number.isInteger(bar)||bar<0||bar>=song.bars)return;
 const resume=playing||$('play').disabled;
 if(resume)stop();
 page=bar;$('page').value=bar;draw();
 if(resume)await play();
}
$('overview').addEventListener('wheel',e=>{
 const box=$('overview');if(box.scrollWidth<=box.clientWidth||e.ctrlKey)return;
 const delta=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?16:e.deltaMode===2?box.clientWidth:1);
 box.scrollLeft+=delta;overviewManualUntil=Date.now()+4000;e.preventDefault();
},{passive:false});
$('overview').addEventListener('pointerdown',()=>{overviewManualUntil=Date.now()+4000;});
function drawOverview(){
 const box=$('overview'),left=box.scrollLeft;box.replaceChildren();
 for(let i=0;i<song.bars;i++){
  const b=document.createElement('button');b.textContent=String(i+1).padStart(2,'0');b.classList.toggle('active',page===i);b.title='小節 '+(i+1);
  if(song.tracks.some(t=>t.notes.some(n=>n.start<i*384+384&&n.start+n.duration>i*384)))b.append(document.createElement('i'));
  b.onclick=safe(()=>jumpToBar(i));$('overview').append(b);
 }box.scrollLeft=left;
 if(Date.now()>=overviewManualUntil){const active=box.children[page];if(active){const x=active.offsetLeft;if(x<box.scrollLeft)box.scrollLeft=x;else if(x+active.offsetWidth>box.scrollLeft+box.clientWidth)box.scrollLeft=x+active.offsetWidth-box.clientWidth;}}
 $('overview-info').textContent=`${song.bars} BARS · 4/4 · ${Math.round(playbackEnd()/96*60/song.bpm)} SEC`;
}
function drawRange(){
 const el=$('range-selection');el.hidden=!editRange||editRange.to<=page*384||editRange.from>=(page+1)*384;
 if(!el.hidden){const a=Math.max(0,editRange.from-page*384),b=Math.min(384,editRange.to-page*384);el.style.left=a/384*100+'%';el.style.width=(b-a)/384*100+'%';}
}
let rollScrollTimer=null,rollScrollManualUntil=0;
const rollBarWidth=()=>Math.max(1,$('roll-bar-scroll').clientWidth);
function syncRollScroll(){
 const box=$('roll-bar-scroll');$('roll-bar-scroll-content').style.width=(rollBarWidth()*song.bars)+'px';
 if(Date.now()>=rollScrollManualUntil)box.scrollLeft=page*rollBarWidth();
}
$('roll-bar-scroll').addEventListener('scroll',()=>{
 const bar=Math.max(0,Math.min(song.bars-1,Math.round($('roll-bar-scroll').scrollLeft/rollBarWidth())));
 if(bar===page)return;
 rollScrollManualUntil=Date.now()+350;clearTimeout(rollScrollTimer);
 rollScrollTimer=setTimeout(safe(async()=>{await jumpToBar(bar);rollScrollManualUntil=0;syncRollScroll();}),140);
});
window.addEventListener('resize',()=>{if(song)syncRollScroll();});
function highlightPart(i){document.querySelectorAll('#track-list .track').forEach(el=>el.classList.toggle('note-hover',Number(el.dataset.trackIndex)===i));}
function drawRoll(){drawLoopMarker();highlightPart(-1);syncRollScroll();syncPitchScroll();drawRange();
 const piano=$('piano'),lines=$('grid-lines');piano.replaceChildren();lines.replaceChildren();$('ruler-beats').replaceChildren();
 for(let i=0;i<4;i++){const s=document.createElement('span');s.textContent=`${page+1}.${i+1}`;$('ruler-beats').append(s);}
 for(let i=0;i<24;i++){
  const pitch=topPitch-i, black=[1,3,6,8,10].includes(pitch%12);const k=document.createElement('div');k.className='key'+(black?' black':'')+(pitch%12===0?' c':'');k.textContent=noteName(pitch);piano.append(k);
  const r=document.createElement('div');r.className='grid-row'+(black?' black':'')+(pitch%12===0?' c':'');lines.append(r);
 }
 for(let tick=0;tick<384;tick+=grid){const l=document.createElement('div');l.className='grid-line'+(tick%96===0?' beat':'');l.style.left=tick/384*100+'%';lines.append(l);}
 $('notes').replaceChildren();$('velocities').replaceChildren();
 const renderNote=(n,ghost,t)=>{
  if(n.pitch>topPitch||n.pitch<=topPitch-24||n.start>=page*384+384||n.start+n.duration<=page*384)return;
  const left=Math.max(n.start-page*384,0),right=Math.min(n.start+n.duration-page*384,384);
  const el=document.createElement('div');el.className='note'+(ghost?' ghost':'')+(selected===n.id&&!ghost?' selected':'');el.dataset.id=n.id;el.style.setProperty('--chip',trackColor(t));el.style.setProperty('--note-ink',colorInk(trackColor(t)));el.dataset.trackIndex=song.tracks.indexOf(t);el.dataset.start=n.start;el.dataset.end=n.start+n.duration;el.onpointerenter=()=>highlightPart(song.tracks.indexOf(t));el.onpointerleave=()=>highlightPart(-1);
  el.style.left=left/384*100+'%';el.style.width=(right-left)/384*100+'%';el.style.top=(topPitch-n.pitch)*16+'px';el.textContent=noteName(n.pitch);el.title=`${t.name} (${t.chip} ${t.channel+1}) · ${noteName(n.pitch)} · ${n.start} tick · ${n.duration} ticks · v${n.velocity}`;
  if(ghost){el.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();trackIndex=song.tracks.indexOf(t);selected=n.id;editRange=null;draw();};}
  if(!ghost){const handle=document.createElement('span');handle.className='resize';el.append(handle);el.onpointerdown=e=>startNoteDrag(e,n);el.oncontextmenu=e=>{e.preventDefault();edit(()=>{track().notes=track().notes.filter(x=>x.id!==n.id);selected=null;});};}
  $('notes').append(el);
  if(!ghost){const v=document.createElement('i');v.style.left=left/384*100+'%';v.style.height=n.velocity/15*92+'px';v.tabIndex=0;v.title=noteName(n.pitch)+' · Velocity '+n.velocity;v.setAttribute('role','slider');v.setAttribute('aria-label',noteName(n.pitch)+' Velocity');v.setAttribute('aria-valuemin','1');v.setAttribute('aria-valuemax','15');v.setAttribute('aria-valuenow',n.velocity);v.onpointerdown=e=>startVelocityDrag(e,n,v);v.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();selected=n.id;edit(()=>{n.velocity=Math.max(1,Math.min(15,n.velocity+(e.key==='ArrowUp'?1:-1)));});}};v.style.setProperty('--chip',trackColor(t));$('velocities').append(v);}
 };
 song.tracks.forEach((t,i)=>{if(i!==trackIndex&&!t.mute)t.notes.forEach(n=>renderNote(n,true,t));});
 track().notes.forEach(n=>renderNote(n,false,track()));
}
function drawInspector(){
 const t=track();if(t.chip==='OPM')drawOpm();$('track-title').textContent=t.name;$('track-name').value=t.name;$('track-color').value=trackColor(t);$('chip-badge').textContent=t.chip+' / '+({PSG:'AY-3-8910',OPLL:'YM2413',SCC:'K051649',OPM:'YM2151'}[t.chip]);$('chip-badge').style.setProperty('--chip',colors[t.chip]);
 for(const chip of ['psg','opll','scc','opm'])$(chip+'-controls').hidden=t.chip.toLowerCase()!==chip;
 $('opll-rhythm').checked=!!song.opllRhythm;$('rhythm-help').hidden=!song.opllRhythm;$('instrument').disabled=isDrum();
 $('instrument').value=t.instrument;$('patch').value=song.opllPatch.map(v=>v.toString(16).padStart(2,'0')).join(' ');drawWave();
 $('psg-mode').value=t.psgMode||'tone';$('noise-period').value=t.noisePeriod||16;$('noise-period').disabled=t.psgMode!=='noise';$('psg-decay').value=t.decayMs||0;$('psg-decay').disabled=!['noise','drums'].includes(t.psgMode);
 const n=t.notes.find(n=>n.id===selected);$('note-instrument-label').hidden=!n||t.chip!=='OPLL'||isDrum();$('note-instrument').value=n?.instrument??'';$('note-decay-label').hidden=!n||t.chip!=='PSG'||!['noise','drums'].includes(t.psgMode);$('note-decay').value=n?.decayMs||0;$('note-controls').hidden=!n;$('note-empty').hidden=!!n;
 $('note-expression').hidden=!n||!['OPLL','OPM'].includes(t.chip)||isDrum();if(n)for(const [k,d] of [['detuneCents',0],['vibratoDepth',0],['vibratoRate',50],['vibratoDelayMs',250],['portamentoMs',0],['portamentoFrom',n.pitch]])$('expr-'+k).value=n[k]??d;
 if(n)for(const field of ['pitch','start','duration','velocity'])$('note-'+field).value=n[field];
 if(view==='sound')drawSoundEditor();
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
 document.querySelectorAll('.note.sounding,.track.sounding').forEach(el=>el.classList.remove('sounding'));
 for(const x of stepRows)x.row.classList.remove('playing-note');
 stepFollowRow=null;$('step-play-position').textContent='停止中';
}
function draw(){
 trackIndex=Math.min(trackIndex,song.tracks.length-1);if(solo!==null&&solo>=song.tracks.length)solo=null;
 schedulePreview();
 page=Math.min(page,song.bars-1);refreshInputs();drawTracks();drawOverview();drawRoll();drawInspector();drawTrackPreview();if(view==='step')drawStep();if(view==='mml')drawPartMml();
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
function toneStructure(p){const q=clone(p);delete q.opllPatch;for(const t of q.tracks){for(const k of ['instrument','wave','opmPatch','color','name','mute'])delete t[k];for(const n of t.notes)for(const k of ['pitch','velocity','portamentoFrom'])delete n[k];}return JSON.stringify(q);}
async function history(direction){
 if(toneApplyBusy)return;const a=direction==='undo'?undo:redo,b=direction==='undo'?redo:undo;if(!a.length)return;
 const candidate=JSON.parse(a[a.length-1]);
 if(playing&&livePlayer&&toneStructure(candidate)===toneStructure(song)){
  toneApplyBusy=true;try{await api('/api/live/tone',{session:livePlayer.session,song:buildTrackPreview(candidate,trackDrafts)});b.push(snapshot());a.pop();song=candidate;selected=null;epoch++;dirty=true;conflict=false;livePlayer.setMix(song,solo);draw();queueSave();}catch(e){status(e.message,true);}finally{toneApplyBusy=false;}return;
 }
 b.push(snapshot());song=JSON.parse(a.pop());selected=null;changed();
}
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
 stopAudition();if(playing){stop();return;}if($('play').disabled)return;const id=++renderId;
 $('play').disabled=true;status('音源を起動しています…');
 try{
  audioContext??=new AudioContext();await audioContext.resume();if(id!==renderId)return;
  const connection=await (await api('/api/info')).json();if(id!==renderId)return;
  token=connection.token;
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
  livePlayer=current;current.setMix(song,solo);playOffset=(page*384<playbackEnd()?page*384:song.loopStart)/96*60/song.bpm;
  await current.start(buildTrackPreview(song,trackDrafts),Math.round(playOffset*song.bpm*96/60));if(id!==renderId){current.stop();return;}
  playing=true;$('play').textContent='Ⅱ';status('再生中 · リアルタイム音源 · M / S は停止せず反映');requestAnimationFrame(animate);
 }catch(e){if(id===renderId)stop();throw e;}
 finally{if(id===renderId)$('play').disabled=false;}
}

function animate(){
 if(!playing)return;$('time').dataset.audioSamples=String(livePlayer?.samples||0);$('time').dataset.underruns=String(livePlayer?.underruns||0);const timing=livePlayer?.timing;let secs=(livePlayer?.samples||0)/44100+(timing?.startFrame??0)/(timing?.hz??song.hz),total=(timing?.frames??0)/(timing?.hz??song.hz);
 if(timing?.loop&&secs>=total){const begin=timing.loopFrame/timing.hz;secs=begin+(secs-total)%(total-begin);}
 const tick=secs*song.bpm/60*96;const bar=Math.floor(tick/384);$('time').textContent=String(bar+1).padStart(3,'0')+' : '+String(Math.floor(tick%384/96)+1).padStart(2,'0');
 if(bar<song.bars&&bar!==page){page=bar;drawOverview();drawRoll();$('page').value=page;}
 $('playhead').style.display='block';$('playhead').style.left=(tick%384)/384*100+'%';if(view==='step')followStep(tick);
 document.querySelectorAll('#notes .note').forEach(el=>{const i=Number(el.dataset.trackIndex);el.classList.toggle('sounding',!song.tracks[i].mute&&(solo===null||solo===i)&&Number(el.dataset.start)<=tick&&tick<Number(el.dataset.end));});
 document.querySelectorAll('#track-list .track').forEach(el=>{const i=Number(el.dataset.trackIndex),t=song.tracks[i];el.classList.toggle('sounding',!t.mute&&(solo===null||solo===i)&&t.notes.some(n=>n.start<=tick&&tick<n.start+n.duration));});
 requestAnimationFrame(animate);
}
function download(data,filename){const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportSong(format){status('出力を作成中…');const response=await api('/api/export',{song,format});const ext={bundle:'.zip',json:'.msx.json',registers:'.registers.json',header:'.h',vgm:'.vgm',mgs:'.mgs',wav:'.wav'}[format];const base=format==='mgs'?(song.title.replace(/[^A-Za-z0-9_]/g,'').slice(0,8).toUpperCase()||'MUSIC'):(song.title.replace(/[^\p{L}\p{N}_-]/gu,'_')||'song');download(await response.blob(),base+ext);status('出力しました · '+format);}
async function replaceSong(next){await api('/api/validate',{song:next});trackDrafts.clear();edit(()=>{song=next;selected=null;page=0;solo=null;});}
function drawWave(){const canvas=$('wave-canvas'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#344956';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<=32;i++){const x=i*w/32;ctx.moveTo(x,0);ctx.lineTo(x,h);}for(let i=0;i<=4;i++){ctx.moveTo(0,i*h/4);ctx.lineTo(w,i*h/4);}ctx.stroke();ctx.strokeStyle=colors.SCC;ctx.lineWidth=3;ctx.beginPath();track().wave.forEach((v,i)=>{const y=(127-v)/255*(h-16)+8,x=(i+.5)*w/32;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.fillStyle='#c2ebff';track().wave.forEach((v,i)=>{ctx.beginPath();ctx.arc((i+.5)*w/32,(127-v)/255*(h-16)+8,4,0,Math.PI*2);ctx.fill();});}
let waveDrawing=false,waveBefore=null,waveLast=null;
function reshapeWave(wave,previous,index,value){const from=previous?.index??index,first=previous?.value??value,steps=Math.abs(index-from);for(let j=0;j<=steps;j++){const at=from+Math.sign(index-from)*j;wave[at]=steps?(Math.round(first+(value-first)*j/steps)||0):value;}}
function wavePoint(e){const canvas=$('wave-canvas'),rect=canvas.getBoundingClientRect(),index=Math.max(0,Math.min(31,Math.floor((e.clientX-rect.left)/rect.width*32))),y=(e.clientY-rect.top)/rect.height*canvas.height,value=Math.max(-128,Math.min(127,Math.round(127-(y-8)/(canvas.height-16)*255)));reshapeWave(track().wave,waveLast,index,value);waveLast={index,value};mirrorWave();drawWave();}
function mirrorWave(){if(track().chip==='SCC'&&track().channel>=3){song.tracks.find(t=>t.chip==='SCC'&&t.channel===(track().channel===3?4:3)).wave=track().wave.slice();}}
$('wave-canvas').onpointerdown=e=>{if(e.button!==0||track().chip!=='SCC')return;waveDrawing=true;waveLast=null;waveBefore=snapshot();e.target.setPointerCapture(e.pointerId);wavePoint(e);};
$('wave-canvas').onpointermove=e=>{if(waveDrawing)wavePoint(e);};
$('wave-canvas').onpointerup=()=>{if(waveDrawing){waveDrawing=false;waveLast=null;undo.push(waveBefore);redo=[];$('wave-preset').value='custom';changed();}};
let sccPresets=[];
$('wave-preset').onchange=e=>{const kind=e.target.value;const preset=sccPresets.find(p=>p.id===kind);if(preset){edit(()=>{track().wave=preset.wave.slice();mirrorWave();});return;}if(kind==='custom')return;edit(()=>{track().wave=Array.from({length:32},(_,i)=>kind==='square'?(i<16?100:-100):kind==='saw'?i*8-124:kind==='sine'?Math.round(110*Math.sin(i*Math.PI*2/32)):Math.round(110*(1-4*Math.abs(i/32-.5))));mirrorWave();});};
$('title').onchange=e=>edit(()=>song.title=e.target.value);
for(const field of ['bpm','hz'])$(field).onchange=e=>{const v=+e.target.value;if(!Number.isInteger(v)||field==='bpm'&&(v<40||v>300)){draw();return;}edit(()=>song[field]=v);};
$('bars').onchange=e=>{const v=+e.target.value;if(!Number.isInteger(v)||v<1||v>64||song.tracks.some(t=>t.notes.some(n=>n.start+n.duration>v*384))){status('ノートのある小節は削れません。先にノートを移動・削除してください。',true);draw();return;}edit(()=>{song.bars=v;if(song.loopEnd>v*384)song.loopEnd=v*384;song.loopStart=Math.min(song.loopStart,(v-1)*384);});};
$('loop').onchange=e=>edit(()=>song.loop=e.target.checked);
$('loop-end').onchange=e=>{const raw=e.target.value;if(raw===''){edit(()=>delete song.loopEnd);return;}const v=Math.round(Number(raw)*song.bpm*96/60);if(!Number.isInteger(v)||v<=song.loopStart||v>end()){status('終点は開始位置より後、曲末までで指定してください。');refreshInputs();return;}edit(()=>song.loopEnd=v);};
$('loopStart').onchange=e=>{const v=(+e.target.value-1)*384;if(!Number.isInteger(v)||v<0||v>=(song.loopEnd??end())){draw();return;}edit(()=>song.loopStart=v);};
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
$('track-color').onchange=e=>setTrackColor(e.target.value);
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
$('page').onchange=safe(e=>jumpToBar(+e.target.value));$('grid').onchange=e=>{grid=+e.target.value;drawRoll();};$('octave').onchange=e=>{topPitch=+e.target.value+11;drawRoll();drawStep();};
for(const tab of ['roll','step','mml'])$(tab+'-tab').onclick=()=>{if(view==='sound')releaseSoundKey();document.body.classList.remove('sound-mode');$('sound-tab').textContent='音色エディタ';$('sound-view').hidden=true;view=tab;for(const mode of ['roll','step','mml']){$(mode+'-view').hidden=mode!==tab;$(mode+'-tab').classList.toggle('active',mode===tab);}draw();};
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
window.addEventListener('keydown',e=>{if(view==='sound')return;if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey?'redo':'undo');return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();history('redo');return;}if(e.code==='Space'){e.preventDefault();safe(play)();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();}if(view==='step'&&!e.ctrlKey&&!e.metaKey){const i='zsxdcvgbhnjm'.indexOf(e.key.toLowerCase());if(i>=0&&e.key.length===1){e.preventDefault();stepNote(topPitch-23+i);}}});
window.addEventListener('beforeunload',e=>{if(dirty||[...partMmlDrafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
async function poll(){if(dirty||saving||drag||velocityDrag||waveDrawing||document.querySelector('dialog[open]')||document.activeElement.matches('input,textarea,select'))return;try{const data=await (await api('/api/state')).json();if(data.revision!==revision){stop();trackDrafts.clear();song=data.song;revision=data.revision;undo=[];redo=[];selected=null;draw();status('AI / 別画面の変更を反映しました · revision '+revision);}$('connection').textContent='● LOCAL';}catch{$('connection').textContent='● OFFLINE';}}
safe(async()=>{const info=await (await api('/api/info')).json();token=info.token;opmTracks=info.opmTracks;info.patches.forEach((name,i)=>{$('instrument').add(new Option(String(i).padStart(2,'0')+' · '+name,i));$('note-instrument').add(new Option(String(i).padStart(2,'0')+' · '+name,i));});const data=await (await api('/api/state')).json();song=data.song;revision=data.revision;draw();status('ローカルで準備完了 · 自動保存 / MCP連携対応');setInterval(poll,2000);})();

// Audition uses the real chip voice, with stale requests discarded during fast drags.
let auditionSerial=0,auditionAbort=null,auditionSource=null,auditionGain=null;
const auditionCache=new Map();
function stopAudition(){auditionSerial++;auditionAbort?.abort();auditionAbort=null;if(auditionSource){try{auditionGain?.gain.setTargetAtTime(0,audioContext.currentTime,.002);auditionSource.stop(audioContext.currentTime+.01);}catch{}auditionSource=null;auditionGain=null;}}
async function auditionNote(note,candidate=null,independentTrack=null){
 if(!candidate&&!$('drag-audition').checked)return;
 stopAudition();const id=auditionSerial;
 const auditionSong=candidate||song,t=independentTrack||(candidate?candidate.tracks[trackIndex]:track()),body={track:Object.fromEntries(['chip','channel','instrument','wave','psgMode','noisePeriod','decayMs','opmPatch'].filter(k=>k in t).map(k=>[k,t[k]])),note:{pitch:note.pitch,velocity:note.velocity},opllPatch:auditionSong.opllPatch,opllRhythm:!!auditionSong.opllRhythm};
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

$('opm-enabled').onchange=e=>{
 const enabled=e.target.checked;
 if(!enabled&&song.tracks.some(t=>t.chip==='OPM'&&t.notes.length)){status('OPMの音符を退避して空にしてから無効にしてください。',true);refreshInputs();return;}
 edit(()=>{song.opmEnabled=enabled;if(enabled)song.tracks.push(...clone(opmTracks));else song.tracks=song.tracks.filter(t=>t.chip!=='OPM');trackIndex=Math.min(trackIndex,song.tracks.length-1);selected=null;solo=null;});
};
function drawOpm(){
 const p=track().opmPatch;$('opm-algorithm').value=p.algorithm;$('opm-feedback').value=p.feedback;
 const box=$('opm-operators'),expanded=[...box.querySelectorAll('details')].map(d=>d.open);box.replaceChildren();
 const fields={mul:['倍率 MUL',15],tl:['音量 TL',127],ar:['アタック AR',31],d1r:['減衰 D1R',31],d2r:['持続減衰 D2R',31],sl:['持続レベル SL',15],rr:['リリース RR',15],ks:['キースケール KS',3],dt1:['デチューン DT1',7],dt2:['デチューン DT2',3]};
 p.operators.forEach((op,i)=>{const group=document.createElement('details');group.open=expanded[i]??(view==='sound');const head=document.createElement('summary');head.textContent='Operator '+(i+1);group.append(head);const bank=document.createElement('div');bank.className='operator-bank';group.append(bank);
 for(const [k,[name,max]] of Object.entries(fields)){const label=document.createElement('label'),input=document.createElement('input');label.textContent=name;input.type='number';input.min=0;input.max=max;input.value=op[k];input.setAttribute('aria-label','OP'+(i+1)+' '+k);input.onchange=()=>{const v=Number(input.value);if(!Number.isInteger(v)||v<0||v>max){status(name+' の範囲は0〜'+max,true);input.value=op[k];return;}edit(()=>track().opmPatch.operators[i][k]=v);};label.append(input);bank.append(label);}box.append(group);});
}
for(const k of ['algorithm','feedback'])$('opm-'+k).onchange=e=>{const v=Number(e.target.value);if(!Number.isInteger(v)||v<0||v>7){status('OPM設定は0〜7の整数です。',true);drawOpm();return;}edit(()=>track().opmPatch[k]=v);};

// Presets are optional data: loading them never changes the current song.
let opmPresets=[],opllPresets=[];
fetch('opm-presets.json').then(r=>{if(!r.ok)throw Error('OPM presets');return r.json();}).then(bank=>{
 sccPresets=bank.sccPresets||[];for(const p of sccPresets)$('wave-preset').append(new Option(p.name,p.id));
 opllPresets=bank.opllPresets||[];const opllGroups=new Map();for(const p of opllPresets){if(!opllGroups.has(p.category)){const g=document.createElement('optgroup');g.label=p.category;opllGroups.set(p.category,g);$('opll-preset').append(g);}opllGroups.get(p.category).append(new Option(p.name,p.id));}
 opmPresets=bank.presets;const groups=new Map();for(const p of opmPresets){const category=p.category||'Other';if(!groups.has(category)){const group=document.createElement('optgroup');group.label=category;groups.set(category,group);$('opm-preset').append(group);}groups.get(category).append(new Option(p.name,p.id));}
 loadUserOpm();
}).catch(()=>{$('opm-preset-help').textContent='プリセットを読み込めませんでした。音色の手動編集は利用できます。';});
$('opm-preset').onchange=()=>{const p=opmPresets.find(p=>p.id===$('opm-preset').value);$('opm-preset-help').textContent=(p?.id.startsWith('user-')?'自作音色':'同梱プリセット')+(p?.note?' / '+p.note:'');};
$('opm-preset-apply').onclick=()=>{const p=opmPresets.find(p=>p.id===$('opm-preset').value);if(track().chip!=='OPM'||!p)return;edit(()=>track().opmPatch=clone(p.patch));status('OPM音色: '+p.name+' を適用しました');};

$('opll-preset-apply').onclick=()=>{const p=opllPresets.find(p=>p.id===$('opll-preset').value);if(track().chip!=='OPLL'||!p||isDrum()){status('OPLL旋律トラックで音色を選択してください。',true);return;}edit(()=>{song.opllPatch=clone(p.patch);track().instrument=0;});status('共有OPLLカスタム音色: '+p.category+' / '+p.name);};

// User tones stay local; adding a tone never edits the current song.
const userOpmKey='msx-music-user-opm-v1';
function addUserOpmOption(p){
 opmPresets.push(p);let group=$('opm-user-group');
 if(!group){group=document.createElement('optgroup');group.id='opm-user-group';group.label='自作音色';$('opm-preset').append(group);}
 group.append(new Option(p.name,p.id));
}
function loadUserOpm(){
 try{for(const p of JSON.parse(localStorage.getItem(userOpmKey)||'[]'))addUserOpmOption(p);}
 catch{status('自作音色一覧を読み込めませんでした。',true);}
}
$('opm-user-save').onclick=safe(()=>{
 if(track().chip!=='OPM')return;
 const name=$('opm-user-name').value.trim();if(!name)throw Error('自作音色名を入力してください。');
 const entries=JSON.parse(localStorage.getItem(userOpmKey)||'[]');
 const p={id:'user-'+crypto.randomUUID(),name,patch:clone(track().opmPatch),category:'自作音色',note:'ユーザー保存音色'};
 entries.push(p);localStorage.setItem(userOpmKey,JSON.stringify(entries));addUserOpmOption(p);$('opm-preset').value=p.id;status('自作OPM音色を保存しました: '+name);
});

let toneApplyBusy=false;
function toneCandidate(kind){
 const p=clone(song),t=p.tracks[trackIndex];
 if(kind==='opm'){const preset=opmPresets.find(x=>x.id===$('opm-preset').value);if(!preset)throw Error('音色を選択してください');t.opmPatch=clone(preset.patch);}
 if(kind==='opll'){const preset=opllPresets.find(x=>x.id===$('opll-preset').value);if(!preset)throw Error('音色を選択してください');p.opllPatch=clone(preset.patch);t.instrument=0;}
 if(kind==='rom')t.instrument=Number($('instrument').value);
 if(kind==='scc'){
  const key=$('wave-preset').value,preset=sccPresets.find(x=>x.id===key);if(key==='custom')throw Error('波形を選択してください');
  t.wave=preset?preset.wave.slice():Array.from({length:32},(_,i)=>key==='square'?(i<16?100:-100):key==='saw'?i*8-124:key==='sine'?Math.round(110*Math.sin(i*Math.PI*2/32)):Math.round(110*(1-4*Math.abs(i/32-.5))));
  if(t.channel>=3)p.tracks.find(x=>x.chip==='SCC'&&x.channel===(t.channel===3?4:3)).wave=t.wave.slice();
 }
 return p;
}
let lastTonePreviewKind=null;
function tonePreviewPitch(pitch,octave){return Math.max(24,Math.min(95,pitch+12*octave));}
async function previewTone(kind){
 lastTonePreviewKind=kind;
 stopAudition();if(!$('tone-preview').checked)return;
 const p=toneCandidate(kind),n=track().notes.find(x=>x.id===selected);
 await auditionNote({pitch:tonePreviewPitch(n?.pitch??60,Number($('tone-octave').value)),velocity:n?.velocity??12},p);
}
async function applyTone(kind){
 if(toneApplyBusy)return;toneApplyBusy=true;
 try{
  const p=toneCandidate(kind),before=epoch;
  if(playing&&livePlayer){await api('/api/live/tone',{session:livePlayer.session,song:buildTrackPreview(p,trackDrafts)});if(epoch!==before)throw Error('更新中に別の編集がありました。再度適用してください。');}
  checkpoint();song=p;epoch++;dirty=true;conflict=false;draw();queueSave();stopAudition();
  status(kind==='opll'?'適用済み · OPLL共有Customの全パートに反映':kind==='scc'&&track().channel>=3?'適用済み · SCC 4/5ch共有波形に反映':'音色を適用しました · 再生位置を維持');
 }finally{toneApplyBusy=false;}
}
for(const [id,kind] of [['opm-preset','opm'],['opll-preset','opll'],['instrument','rom'],['wave-preset','scc']])$(id).onchange=safe(()=>previewTone(kind));
for(const [id,kind] of [['opm-preset-apply','opm'],['opll-preset-apply','opll'],['instrument-apply','rom'],['wave-apply','scc']])$(id).onclick=safe(()=>applyTone(kind));
$('tone-preview').onchange=()=>{if(!$('tone-preview').checked)stopAudition();};

$('tone-octave').onchange=safe(async()=>{
 if(!$('tone-preview').checked)return;
 const kind={OPM:'opm',OPLL:'rom',SCC:'scc'}[track().chip];
 if(lastTonePreviewKind&&((track().chip==='OPM'&&lastTonePreviewKind==='opm')||(track().chip==='OPLL'&&['opll','rom'].includes(lastTonePreviewKind))||(track().chip==='SCC'&&lastTonePreviewKind==='scc'))){
  try{await previewTone(lastTonePreviewKind);return;}catch{}
 }
 const n=track().notes.find(x=>x.id===selected);
 await auditionNote({pitch:tonePreviewPitch(n?.pitch??60,Number($('tone-octave').value)),velocity:n?.velocity??12},clone(song));
});

let velocityDrag=null;
function startVelocityDrag(e,n,bar){
 if(e.button!==0)return;e.preventDefault();e.stopPropagation();stop();selected=n.id;
 const before=snapshot(),rect=$('velocities').getBoundingClientRect();velocityDrag=true;document.querySelectorAll('#notes .note').forEach(el=>el.classList.toggle('selected',el.dataset.id===n.id&&Number(el.dataset.trackIndex)===trackIndex));
 bar.setPointerCapture(e.pointerId);drawInspector();
 const move=ev=>{n.velocity=Math.max(1,Math.min(15,Math.round((rect.bottom-4-ev.clientY)/92*15)));bar.style.height=n.velocity/15*92+'px';bar.title='Velocity '+n.velocity;bar.setAttribute('aria-valuenow',n.velocity);$('note-velocity').value=n.velocity;status(noteName(n.pitch)+' · Velocity '+n.velocity);};
 const finish=ev=>{bar.removeEventListener('pointermove',move);bar.removeEventListener('pointerup',finish);bar.removeEventListener('pointercancel',cancel);velocityDrag=null;if(before!==snapshot()){undo.push(before);redo=[];changed();}else drawRoll();};
 const cancel=()=>{song=JSON.parse(before);velocityDrag=null;bar.removeEventListener('pointermove',move);bar.removeEventListener('pointerup',finish);bar.removeEventListener('pointercancel',cancel);draw();};
 bar.addEventListener('pointermove',move);bar.addEventListener('pointerup',finish);bar.addEventListener('pointercancel',cancel);move(e);
}
const trackDrafts=new Map();let previewTail=Promise.resolve(),previewTimer=null;
function previewOptions(){
 const t=track(),options=[{id:'',name:'現在の音色（変更なし）'}];
 if(isDrum()&&t.chip==='OPLL')return options;
 if(t.chip==='OPM')for(const p of opmPresets)options.push({id:p.id,name:p.name,tone:{track:{opmPatch:p.patch}}});
 if(t.chip==='OPLL'){
  for(const o of $('instrument').options)options.push({id:'rom-'+o.value,name:o.textContent,tone:{track:{instrument:Number(o.value)}}});
  for(const p of opllPresets)options.push({id:p.id,name:p.name,tone:{track:{instrument:0},patch:p.patch}});
 }
 if(t.chip==='SCC')for(const p of sccPresets)options.push({id:p.id,name:p.name,tone:{track:{wave:p.wave}}});
 for(const p of readToneLibrary().filter(p=>p.chip===t.chip))options.push({id:p.id,name:'自作 · '+p.name,tone:clone(p.tone)});
 return options;
}
function drawTrackPreview(){
 if(!$('preview-preset'))return;
 const d=trackDrafts.get(track().id)||{volume:100,octave:0,key:''};
 $('preview-track-name').textContent=track().name+' · '+track().chip+' / 選択トラック・試聴調整';$('preview-track-name').style.color=trackColor(track());
 $('preview-preset').replaceChildren(...previewOptions().map(p=>new Option(p.name,p.id)));$('preview-preset').value=d.key||'';
 $('preview-volume').value=$('preview-volume-number').value=d.volume;$('preview-octave').value=d.octave;$('preview-octave').disabled=isDrum();
 $('preview-mute').textContent=track().mute?'Mute ON':'Mute';$('preview-solo').textContent=solo===trackIndex?'Solo ON':'Solo';
 $('preview-state').textContent=trackDrafts.has(track().id)?'仮調整中 · 未反映':'保存データのまま';$('preview-apply').disabled=!trackDrafts.has(track().id);
}
function queueTrackPreview(){
 clearTimeout(previewTimer);previewTimer=setTimeout(()=>{previewTail=previewTail.catch(()=>{}).then(async()=>{if(!playing||!livePlayer)return;const session=livePlayer.session,p=buildTrackPreview(song,trackDrafts);await api('/api/live/tone',{session,song:p});}).catch(e=>status(e.message,true));},150);
}
function changeTrackPreview(){
 const key=$('preview-preset').value,p=previewOptions().find(p=>p.id===key),d={key,tone:p?.tone,volume:Number($('preview-volume-number').value),octave:Number($('preview-octave').value)};
 const next=new Map(trackDrafts);next.set(track().id,d);buildTrackPreview(song,next);
 // A chip has only one shared patch: keep one active draft for that resource.
 if(d.tone?.patch&&[...next].some(([id,x])=>id!==track().id&&x.tone?.patch))throw Error('OPLL共有Customの仮調整は1パートずつ反映してください。');
 if(track().chip==='SCC'&&track().channel>=3&&d.tone&&[...next].some(([id,x])=>id!==track().id&&x.tone&&song.tracks.find(t=>t.id===id)?.chip==='SCC'&&song.tracks.find(t=>t.id===id)?.channel>=3))throw Error('SCC 4/5ch共有波形の仮調整は1パートずつ反映してください。');
 trackDrafts.set(track().id,d);drawTrackPreview();queueTrackPreview();
}
$('preview-preset').onchange=safe(changeTrackPreview);$('preview-octave').onchange=safe(changeTrackPreview);
$('preview-volume').oninput=safe(()=>{$('preview-volume-number').value=$('preview-volume').value;changeTrackPreview();});$('preview-volume-number').onchange=safe(changeTrackPreview);
for(const [id,delta] of [['preview-prev',-1],['preview-next',1]])$(id).onclick=safe(()=>{const el=$('preview-preset');el.selectedIndex=Math.max(0,Math.min(el.options.length-1,el.selectedIndex+delta));changeTrackPreview();});
$('preview-reset').onclick=()=>{trackDrafts.delete(track().id);drawTrackPreview();queueTrackPreview();};
$('preview-audition').onclick=safe(async()=>{const p=buildTrackPreview(song,trackDrafts),n=p.tracks[trackIndex].notes.find(n=>n.id===selected)||p.tracks[trackIndex].notes[0]||{pitch:60,velocity:12};await auditionNote(n,p);});
$('preview-apply').onclick=safe(async()=>{
 if(toneApplyBusy)return;const id=track().id,d=trackDrafts.get(id);if(!d)return;toneApplyBusy=true;
 try{const p=buildTrackPreview(song,new Map([[id,d]])),before=epoch;await api('/api/validate',{song:p});if(before!==epoch)throw Error('別の編集がありました。再度反映してください。');checkpoint();song=p;trackDrafts.delete(id);epoch++;dirty=true;conflict=false;draw();queueSave();queueTrackPreview();status('選択トラックの仮調整を反映しました（Undo対応）。');}finally{toneApplyBusy=false;}
});

$('preview-mute').onclick=()=>edit(()=>track().mute=!track().mute,true);
$('preview-solo').onclick=()=>{solo=solo===trackIndex?null:trackIndex;if(livePlayer)livePlayer.setMix(song,solo);drawTracks();drawTrackPreview();};

// BEGIN SYNTH EDITOR
const opllFields=[['AM',0,7,1],['VIB',0,6,1],['EG',0,5,1],['KSR',0,4,1],['MUL',0,0,15],['KSL',2,6,3],['AR',4,4,15],['DR',4,0,15],['SL',6,4,15],['RR',6,0,15]];
function opllFieldValue(p,byte,shift,mask){return (p[byte]>>shift)&mask;}
function setOpllField(p,byte,shift,mask,value){const next=p.slice();next[byte]=(next[byte]&~(mask<<shift))|(value<<shift);return next;}
function attachSynthKnob(range){
 if(range.previousElementSibling?.classList.contains('synth-knob')){range.previousElementSibling.refreshKnob();return;}
 const knob=document.createElement('div');knob.className='synth-knob';const face=document.createElement('span');face.className='synth-knob-face';knob.append(face);knob.tabIndex=0;knob.setAttribute('role','slider');knob.setAttribute('aria-label',(range.getAttribute('aria-label')||'音色')+' ノブ');knob.title='上下ドラッグで調整 · 矢印キーで1ずつ · Shiftで微調整';range.before(knob);range.classList.add('knob-source');range.tabIndex=-1;range.setAttribute('aria-hidden','true');
 const paint=()=>{const lo=Number(range.min),hi=Number(range.max),v=Number(range.value);knob.style.setProperty('--angle',(-135+270*(v-lo)/(hi-lo))+'deg');knob.style.setProperty('--arc',(270*(v-lo)/(hi-lo))+'deg');knob.setAttribute('aria-valuemin',lo);knob.setAttribute('aria-valuemax',hi);knob.setAttribute('aria-valuenow',v);};
 knob.refreshKnob=paint;const input=range.oninput;range.oninput=()=>{input?.();paint();};let drag=null;
 const update=v=>{range.value=Math.max(Number(range.min),Math.min(Number(range.max),Math.round(v)));range.oninput();};
 knob.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();knob.focus();knob.setPointerCapture(e.pointerId);drag={y:e.clientY,value:Number(range.value)};};
 knob.onpointermove=e=>{if(drag)update(drag.value+(drag.y-e.clientY)*((Number(range.max)-Number(range.min))/(e.shiftKey?1600:180)));};
 knob.onpointerup=()=>{if(!drag)return;const original=drag.value;drag=null;if(Number(range.value)!==original)range.onchange();};
 knob.onpointercancel=()=>{if(drag){update(drag.value);drag=null;}};
 knob.onkeydown=e=>{const v=Number(range.value),lo=Number(range.min),hi=Number(range.max);const step=e.shiftKey?10:1;const next={ArrowUp:v+step,ArrowRight:v+step,ArrowDown:v-step,ArrowLeft:v-step,Home:lo,End:hi,PageUp:v+5,PageDown:v-5}[e.key];if(next===undefined)return;e.preventDefault();update(next);if(v!==Number(range.value))range.onchange();};paint();
}
function synthControl(name,value,max,commit,min=0){
 const label=document.createElement('label');label.className='synth-control';const caption=document.createElement('span');caption.textContent=name;
 const number=document.createElement('input'),range=document.createElement('input');number.type='number';range.type='range';
 for(const input of [number,range]){input.min=min;input.max=max;input.step=1;input.value=value;input.setAttribute('aria-label',name+(input===range?' スライダー':' 数値'));}
 range.oninput=()=>number.value=range.value;number.oninput=()=>range.value=number.value;
 const change=input=>{const v=Number(input.value);if(!Number.isInteger(v)||v<min||v>max){number.value=range.value=value;status(name+' の範囲: '+min+'〜'+max,true);return;}commit(v);};
 range.onchange=()=>change(range);number.onchange=()=>change(number);label.append(caption,range,number);attachSynthKnob(range);return label;
}
function drawSoundEditor(){drawDesigner();}
// JIS physical rows, bottom to top: 48 consecutive semitones.
const soundKeyCodes=['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash','IntlRo','KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote','Backslash','KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal','IntlYen'];
const soundKeyLabels=['Z','X','C','V','B','N','M',',','.','/','ろ','A','S','D','F','G','H','J','K','L',';',':',']','Q','W','E','R','T','Y','U','I','O','P','@','[','1','2','3','4','5','6','7','8','9','0','-','^','¥'];
let heldSoundKey=null;
function releaseSoundKey(){heldSoundKey=null;stopAudition();for(const key of $('sound-keyboard').children)key.classList.remove('held');}
function drawSoundKeyboard(){
 const box=$('sound-keyboard');box.replaceChildren();const pitches=designerChip==='PSG'&&designerDraft().track.psgMode==='drums'?[36,38,42,45,49]:Array.from({length:72},(_,i)=>24+i);
 const drum=designerChip==='PSG'&&designerDraft().track.psgMode==='drums';box.classList.toggle('drum-keys',drum);const whites=pitches.filter(p=>![1,3,6,8,10].includes(p%12)).length;let whiteIndex=0;
 for(const [index,pitch] of pitches.entries()){const key=document.createElement('button');key.type='button';key.dataset.pitch=pitch;key.textContent=(drum?drumNames[pitch]:noteName(pitch))+(soundKeyLabels[drum?index:index-(Number($('sound-octave').value)-1)*12]?' · '+soundKeyLabels[drum?index:index-(Number($('sound-octave').value)-1)*12]:'');key.className=[1,3,6,8,10].includes(pitch%12)?'black':'';if(!drum){const black=key.className==='black';key.style.left=((whiteIndex-(black?0.31:0))*36)+'px';key.style.width=((black?0.62:1)*36)+'px';if(!black)whiteIndex++;}key.onclick=safe(async()=>{const velocity=Number($('sound-velocity').value);if(!Number.isInteger(velocity)||velocity<1||velocity>15)throw Error('試奏音量は1〜15です。');const d=designerDraft();await auditionNote({pitch,velocity},{opllPatch:d.patch||[33,33,26,6,240,240,15,15],opllRhythm:false},clone(d.track));});box.append(key);}
 box.scrollLeft=drum?0:(Number($('sound-octave').value)-1)*7*36;
}
$('sound-octave').onchange=()=>{releaseSoundKey();drawSoundKeyboard();};$('sound-silence').onclick=releaseSoundKey;
window.addEventListener('keydown',e=>{
 if(view!=='sound'||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||e.target.matches('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
 const index=soundKeyCodes.indexOf(e.code);if(index<0)return;const box=$('sound-keyboard'),offset=box.classList.contains('drum-keys')?0:(Number($('sound-octave').value)-1)*12,key=box.children[index+offset];if(!key)return;
 e.preventDefault();if(e.repeat)return;releaseSoundKey();heldSoundKey=e.code;key.classList.add('held');key.click();
});
window.addEventListener('keyup',e=>{if(e.code===heldSoundKey){e.preventDefault();releaseSoundKey();}});
window.addEventListener('blur',()=>{if(heldSoundKey)releaseSoundKey();});

const toneLibraryKey='msx-music-tone-library-v1';
let designerChip='OPM';const designerDrafts=new Map(),designerHistories=new Map();
function readToneLibrary(){try{const bank=JSON.parse(localStorage.getItem(toneLibraryKey)||'[]');return Array.isArray(bank)?bank.filter(p=>p&&['PSG','OPLL','SCC','OPM'].includes(p.chip)&&typeof p.id==='string'&&typeof p.name==='string'&&p.tone?.track):[];}catch{return [];}}
function designerDraft(){
 if(!designerDrafts.has(designerChip)){
  const t={chip:designerChip,channel:0,instrument:0,wave:Array.from({length:32},(_,i)=>Math.round(100*Math.sin(i*Math.PI/16))),psgMode:'tone',noisePeriod:16,decayMs:0};
  if(designerChip==='OPM')t.opmPatch=clone(opmTracks[0]?.opmPatch||{algorithm:4,feedback:2,operators:Array.from({length:4},()=>({mul:1,tl:24,ar:24,d1r:6,d2r:2,sl:4,rr:7,ks:1,dt1:0,dt2:0}))});
  designerDrafts.set(designerChip,{track:t,patch:[33,33,26,6,240,240,15,15]});
 }return designerDrafts.get(designerChip);
}
function designerHistory(){if(!designerHistories.has(designerChip))designerHistories.set(designerChip,{undo:[],redo:[]});return designerHistories.get(designerChip);}
function designerEdit(fn){const h=designerHistory();h.undo.push(clone(designerDraft()));if(h.undo.length>80)h.undo.shift();h.redo=[];fn();drawDesigner();$('designer-status').textContent='音色を編集中 · 楽曲への変更なし';}
function designerUndo(redo=false){const h=designerHistory(),from=redo?h.redo:h.undo,to=redo?h.undo:h.redo;if(!from.length)return;releaseSoundKey();to.push(clone(designerDraft()));designerDrafts.set(designerChip,from.pop());drawDesigner();}
function designerPresets(){
 let list=[];
 if(designerChip==='OPM')list=opmPresets.map(p=>({id:p.id,name:p.name,tone:{track:{opmPatch:p.patch}}}));
 if(designerChip==='OPLL')list=opllPresets.map(p=>({id:p.id,name:p.name,tone:{track:{instrument:0},patch:p.patch}}));
 if(designerChip==='SCC')list=sccPresets.map(p=>({id:p.id,name:p.name,tone:{track:{wave:p.wave}}}));
 if(designerChip==='PSG')list=[['tone','矩形波'],['noise','減衰ノイズ'],['drums','ドラムキット']].map(([mode,name])=>({id:mode,name,tone:{track:{psgMode:mode,noisePeriod:16,decayMs:120}}}));
 return list.concat(readToneLibrary().filter(p=>p.chip===designerChip).map(p=>({...p,name:'自作 · '+p.name})));
}
function drawDesigner(){
 const d=designerDraft(),t=d.track,box=$('designer-controls'),selectedPreset=$('designer-preset').value;box.replaceChildren();$('synth-extra').replaceChildren();
 $('designer-preset').replaceChildren(new Option('音色を選択…',''),...designerPresets().map(p=>new Option(p.name,p.id)));$('designer-preset').value=selectedPreset;
 for(const button of $('designer-chips').children)button.classList.toggle('active',button.dataset.chip===designerChip);
 $('designer-undo').disabled=!designerHistory().undo.length;$('designer-redo').disabled=!designerHistory().redo.length;
 $('designer-update').disabled=!readToneLibrary().some(p=>p.chip===designerChip&&p.id===selectedPreset);
 const card=(title)=>{const section=document.createElement('section');section.className='designer-card';const head=document.createElement('h4');head.textContent=title;section.append(head);box.append(section);return section;};
 const control=(parent,name,value,max,set,min=0)=>{const item=synthControl(name,value,max,v=>designerEdit(()=>set(v)),min);if(['ATTACK','DECAY 1','DECAY 2','SUSTAIN','RELEASE','AR','DR','SL','RR'].includes(name))item.classList.add('envelope-value');parent.append(item);};
 box.dataset.chip=designerChip;
 if(designerChip==='OPM'){
  const p=t.opmPatch,global=card('ROUTING / GLOBAL');control(global,'ALGORITHM',p.algorithm,7,v=>p.algorithm=v);control(global,'FEEDBACK',p.feedback,7,v=>p.feedback=v);
  const fields={mul:['MUL',15],tl:['LEVEL / TL',127],ar:['ATTACK',31],d1r:['DECAY 1',31],d2r:['DECAY 2',31],sl:['SUSTAIN',15],rr:['RELEASE',15],ks:['KEY SCALE',3],dt1:['DETUNE 1',7],dt2:['DETUNE 2',3]};
  p.operators.forEach((op,i)=>{const bank=card('OPERATOR '+(i+1));bank.classList.add('fm-operator');for(const [key,[name,max]] of Object.entries(fields))control(bank,name,op[key],max,v=>op[key]=v);});
 }else if(designerChip==='OPLL'){
  for(let op=0;op<2;op++){const bank=card(op?'CARRIER / OUTPUT':'MODULATOR / COLOR');bank.classList.add('fm-operator');const fields=opllFields.map(([name,byte,shift,mask])=>[name,byte+op,shift,mask]);fields.push(['WAVE',3,op?4:3,1]);if(!op)fields.push(['TL',2,0,63],['FEEDBACK',3,0,7]);for(const [name,byte,shift,mask] of fields)control(bank,name,opllFieldValue(d.patch,byte,shift,mask),mask,v=>d.patch=setOpllField(d.patch,byte,shift,mask,v));}
 }else if(designerChip==='SCC'){
  const bank=card('SCC / WAVEFORM');bank.classList.add('designer-wave-bank');const hint=document.createElement('p');hint.className='designer-wave-hint';hint.textContent='32 SAMPLES · −128〜127 · ドラッグで波形を描画';const readout=document.createElement('output');readout.className='designer-wave-readout';readout.textContent='POINT — / VALUE —';bank.append(hint,readout);const canvas=document.createElement('canvas');canvas.id='designer-wave';canvas.width=1024;canvas.height=240;canvas.setAttribute('aria-label','SCC音色波形。ドラッグで変形');bank.append(canvas);
  const paint=()=>{const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);c.strokeStyle='#344e60';c.lineWidth=1;c.beginPath();for(let i=0;i<=32;i++){c.moveTo(i*w/32,0);c.lineTo(i*w/32,h);}c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();c.strokeStyle='#9bd8ee';c.lineWidth=3;c.beginPath();t.wave.forEach((v,i)=>{const x=(i+.5)*w/32,y=8+(127-v)/255*(h-16);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();};
  let before=null,last=null;const point=e=>{const r=canvas.getBoundingClientRect(),index=Math.max(0,Math.min(31,Math.floor((e.clientX-r.left)/r.width*32))),value=Math.max(-128,Math.min(127,Math.round(127-((e.clientY-r.top)/r.height*240-8)/224*255)));reshapeWave(t.wave,last,index,value);last={index,value};readout.textContent='POINT '+String(index+1).padStart(2,'0')+' / VALUE '+value;paint();};
  canvas.onpointerdown=e=>{if(e.button!==0)return;before=t.wave.slice();last=null;canvas.setPointerCapture(e.pointerId);point(e);};canvas.onpointermove=e=>{if(before)point(e);};canvas.onpointerup=()=>{if(!before)return;const result=t.wave.slice();t.wave=before;before=null;designerEdit(()=>t.wave=result);};canvas.onpointercancel=()=>{if(before){t.wave=before;before=null;paint();}};paint();
 }else{
  const bank=card('PSG / TONE & NOISE');const mode=document.createElement('select');mode.setAttribute('aria-label','音色PSGモード');for(const [v,name] of [['tone','矩形波'],['noise','ノイズ'],['drums','ドラムキット']])mode.add(new Option(name,v));mode.value=t.psgMode;mode.onchange=()=>designerEdit(()=>t.psgMode=mode.value);bank.append(mode);control(bank,'NOISE PERIOD',t.noisePeriod,31,v=>t.noisePeriod=v,1);control(bank,'DECAY / ms',t.decayMs,2000,v=>t.decayMs=v);
 }
 drawSoundKeyboard();
}
$('sound-tab').onclick=()=>{if(view==='sound'){$('roll-tab').onclick();return;}$('sound-tab').textContent='譜面に戻る';stop();view='sound';document.body.classList.add('sound-mode');for(const mode of ['roll','step','mml'])$(mode+'-view').hidden=true;$('sound-view').hidden=false;drawDesigner();};
$('designer-back').onclick=releaseSoundKey;
for(const button of $('designer-chips').children)button.onclick=()=>{releaseSoundKey();designerChip=button.dataset.chip;$('designer-preset').value='';$('designer-name').value='';$('designer-status').textContent='';drawDesigner();};
$('designer-preset').onchange=()=>{$('designer-update').disabled=!readToneLibrary().some(p=>p.chip===designerChip&&p.id===$('designer-preset').value);};
$('designer-load').onclick=()=>{const p=designerPresets().find(p=>p.id===$('designer-preset').value);if(!p)return;releaseSoundKey();designerEdit(()=>{Object.assign(designerDraft().track,clone(p.tone.track));if(p.tone.patch)designerDraft().patch=clone(p.tone.patch);});$('designer-name').value=p.name.replace(/^自作 · /,'');};
function saveDesigner(update=false){const name=$('designer-name').value.trim();if(!name){$('designer-status').textContent='音色名を入力してください。';return;}const bank=readToneLibrary(),d=designerDraft(),id=update?$('designer-preset').value:'tone-'+crypto.randomUUID(),old=bank.find(p=>p.id===id&&p.chip===designerChip);if(update&&!old)return;const keys={PSG:['psgMode','noisePeriod','decayMs'],OPLL:['instrument'],SCC:['wave'],OPM:['opmPatch']}[designerChip],tone={track:Object.fromEntries(keys.map(k=>[k,clone(d.track[k])]))};if(designerChip==='OPLL')tone.patch=clone(d.patch);const entry={id,chip:designerChip,name,tone};if(old)bank[bank.indexOf(old)]=entry;else bank.push(entry);try{localStorage.setItem(toneLibraryKey,JSON.stringify(bank));}catch{$('designer-status').textContent='保存できませんでした。ブラウザーの保存容量を確認してください。';return;}drawDesigner();$('designer-preset').value=id;$('designer-update').disabled=false;$('designer-status').textContent='保存しました · 譜面側の音色一覧で「自作 · '+name+'」を選べます。';}
$('designer-save').onclick=()=>saveDesigner();$('designer-update').onclick=()=>saveDesigner(true);$('designer-undo').onclick=()=>designerUndo();$('designer-redo').onclick=()=>designerUndo(true);
window.addEventListener('keydown',e=>{if(view!=='sound'||e.target.matches('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();designerUndo(e.shiftKey);}});
// END SYNTH EDITOR

// BEGIN PART MML CODEC
// This local editor dialect keeps MGSC % lengths (48 PPQ); ! adds exact 96-PPQ ticks.
function encodePartMml(notes){
 const length=n=>[1,2,4,8,16,32,64].find(x=>384/x===n)?.toString()||'!'+n;
 const ordered=[...notes].sort((a,b)=>a.start-b.start),counts=new Map();
 for(const n of ordered)counts.set(n.duration,(counts.get(n.duration)||0)+1);
 const base=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||96;
 let cursor=0,bar=-1,velocity=null,octave=null,line='';const lines=['; パート全体 / 4分音符=96 tick','q8 l'+length(base)];
 const flush=()=>{if(line){lines.push(line);line='';}};
 const append=token=>{if(line&&line.length+token.length+1>120)flush();line+=(line?' ':'')+token;};
 const suffix=n=>n===base?'':length(n);
 for(const n of ordered){
  if(n.start>cursor)append('r'+suffix(n.start-cursor));
  const b=Math.floor(n.start/384);if(b!==bar){flush();lines.push('; 小節 '+(b+1));bar=b;}
  const settings=[],nextOctave=Math.floor(n.pitch/12)-1;
  if(n.velocity!==velocity){settings.push('v'+n.velocity);velocity=n.velocity;}
  if(octave===null)settings.push('o'+nextOctave);
  else if(nextOctave!==octave)settings.push((nextOctave>octave?'>':'<').repeat(Math.abs(nextOctave-octave)));
  octave=nextOctave;
  const extra=Object.fromEntries(Object.entries(n).filter(([k])=>!['id','pitch','start','duration','velocity'].includes(k)));
  settings.push(['c','c+','d','d+','e','f','f+','g','g+','a','a+','b'][n.pitch%12]+suffix(n.duration));
  append(settings.join(' ')+(Object.keys(extra).length?' '+JSON.stringify(extra):''));cursor=n.start+n.duration;
 }
 flush();return lines.join('\n');
}
function parsePartMml(text,limit){
 if(typeof text!=='string'||text.length>500000)throw new Error('MMLは500,000文字以内にしてください。');
 let i=0,oct=4,base=96,velocity=12,gate=8,cursor=0,steps=0;const notes=[];
 function fail(message,pos=i){const before=text.slice(0,pos),line=before.split('\n').length,col=pos-before.lastIndexOf('\n');throw new Error(`${line}行 ${col}列: ${message}`);}
 function skip(){while(i<text.length){if(/\s/.test(text[i])){i++;continue;}if(text[i]===';'){while(i<text.length&&text[i]!=='\n')i++;continue;}break;}}
 function number(){const m=/^\d+/.exec(text.slice(i));if(!m)fail('数値が必要です。');i+=m[0].length;const v=Number(m[0]);if(!Number.isSafeInteger(v))fail('数値が大きすぎます。');return v;}
 function len(){let value=base;if(text[i]==='%'||text[i]==='!'){const unit=text[i++];value=number()*(unit==='%'?2:1);}else if(/\d/.test(text[i]||'')){const d=number();if(!d)fail('音長0は使用できません。');value=384/d;}let add=value;while(text[i]==='.'){i++;add/=2;value+=add;}if(value<=0||!Number.isFinite(value))fail('音長が不正です。');return value;}
 function sequence(depth=0){if(depth>8)fail('ループは8重までです。');while(true){skip();if(i>=text.length)return;if(text[i]===']'){if(!depth)fail('対応する [ がありません。');return;}if(++steps>100000)fail('展開後のMMLが大きすぎます。');const pos=i,ch=text[i++].toLowerCase();
  if(ch==='['){const begin=i;sequence(depth+1);if(text[i]!==']')fail('] がありません。',pos);i++;const close=i;const count=/\d/.test(text[i]||'')?number():2;const after=i;if(count<1||count>32)fail('繰り返しは1～32回です。',pos);for(let n=1;n<count;n++){i=begin;sequence(depth+1);if(i!==close-1)fail('ループ構文が不正です。');}i=after;continue;}
  if('cdefgabr'.includes(ch)){
   let pitch=12*(oct+1)+({c:0,d:2,e:4,f:5,g:7,a:9,b:11,r:0}[ch]);if(ch!=='r'&&['+','#','-'].includes(text[i]))pitch+=text[i++]==='-'?-1:1;
   let duration=len();while(text[i]==='^'){i++;duration+=len();}const sounding=duration*gate/8;if(!Number.isInteger(duration)||!Number.isInteger(sounding)||sounding<1)fail('96 PPQで表現できる音長・ゲートにしてください。',pos);
   skip();let extra={};if(text[i]==='{'){const start=i,end=text.indexOf('}',i);if(end<0)fail('個別設定の } がありません。');i=end+1;try{extra=JSON.parse(text.slice(start,i));}catch{fail('個別設定のJSONが不正です。',start);}for(const [key,value] of Object.entries(extra)){if(!['instrument','detuneCents','vibratoDepth','vibratoRate','vibratoDelayMs','portamentoMs','portamentoFrom','noisePeriod','decayMs'].includes(key)||!Number.isInteger(value))fail('未対応の個別設定: '+key,start);}if(ch==='r'||velocity===0)fail('休符には個別設定を指定できません。',start);}
   if(ch!=='r'&&velocity>0){if(pitch<24||pitch>95)fail('音程はC1～B6です。',pos);notes.push({...extra,id:'mml-'+notes.length,pitch,start:cursor,duration:sounding,velocity});if(notes.length>16000)fail('最大16000音です。');}
   cursor+=duration;if(cursor>limit)fail('曲の終端を超えています。小節数を増やすか音符を短くしてください。',pos);
  }else if(ch==='o'){oct=number();if(oct<1||oct>6)fail('o1～o6を指定してください。',pos);}
  else if(ch==='>'||ch==='<'){oct+=ch==='>'?1:-1;if(oct<1||oct>6)fail('音域を超えています。',pos);}
  else if(ch==='l')base=len();
  else if(ch==='v'){velocity=number();if(velocity>15)fail('v0～v15を指定してください。',pos);}
  else if(ch==='q'){gate=number();if(gate<1||gate>8)fail('q1～q8を指定してください。',pos);}
  else fail('未対応のコマンド: '+ch,pos);
 }}sequence();return notes;
}
// END PART MML CODEC
const partMmlDrafts=new Map();let partMmlTimer=null,partMmlRequest=0;
function partMmlBase(){return JSON.stringify({title:song.title,bars:song.bars,opllRhythm:song.opllRhythm,track:track()});}
function partMmlMessage(text,error=false){$('part-mml-status').textContent=text;$('part-mml-status').classList.toggle('error',error);}
function drawPartMml(){
 const id=track().id,base=partMmlBase();let d=partMmlDrafts.get(id);
 if(!d||(!d.dirty&&d.base!==base)){d={base,text:encodePartMml(track().notes),dirty:false};partMmlDrafts.set(id,d);}
 $('part-mml-title').textContent=track().name+' · '+track().chip;
 if($('part-mml').value!==d.text)$('part-mml').value=d.text;
 $('part-mml-apply').disabled=true;
 if(d.base!==base){partMmlMessage('元のパートが変更されています。下書きを退避し、「現在のパートから再取得」してください。',true);return;}
 partMmlMessage(d.dirty?'未反映の下書き':'現在のパートを表示中');
 if(d.dirty)schedulePartMmlCheck();
}
function schedulePartMmlCheck(){clearTimeout(partMmlTimer);partMmlTimer=setTimeout(()=>checkPartMml(false),350);}
async function checkPartMml(apply=false){
 clearTimeout(partMmlTimer);const request=++partMmlRequest,id=track().id,d=partMmlDrafts.get(id),text=d?.text,base=partMmlBase(),sentEpoch=epoch;
 $('part-mml-apply').disabled=true;if(!d)return;
 try{
  if(d.base!==base)throw new Error('元のパートが変更されています。再取得が必要です。');
  const notes=parsePartMml(text,end()),candidate=clone(song);candidate.tracks[trackIndex].notes=notes;
  await api('/api/validate',{song:candidate});
  if(request!==partMmlRequest||id!==track().id||text!==d.text||base!==partMmlBase()||epoch!==sentEpoch)return;
  if(apply){if(!d.dirty)return;edit(()=>{track().notes=notes;selected=null;editRange=null;d.dirty=false;});partMmlMessage(`${notes.length}音を反映しました。Undoで戻せます。`);}
  else{partMmlMessage(`構文・楽曲検証OK · ${notes.length}音`+(d.dirty?' · 未反映':''));$('part-mml-apply').disabled=!d.dirty;}
 }catch(e){if(request===partMmlRequest&&id===track().id&&text===d.text)partMmlMessage(e.message,true);}
}
$('part-mml').addEventListener('input',()=>{const d=partMmlDrafts.get(track().id);if(!d)return;d.text=$('part-mml').value;d.dirty=true;partMmlRequest++;$('part-mml-apply').disabled=true;partMmlMessage('未反映 · 検証中…');schedulePartMmlCheck();});
$('part-mml-check').onclick=()=>checkPartMml(false);
$('part-mml-apply').onclick=()=>checkPartMml(true);
$('part-mml-reload').onclick=()=>{const d=partMmlDrafts.get(track().id);if(d?.dirty&&!confirm('このパートの未反映MMLを破棄し、現在の音符から再取得しますか？'))return;partMmlRequest++;partMmlDrafts.delete(track().id);drawPartMml();};

function syncPitchScroll(){const box=$('roll-pitch-scroll'),target=(95-topPitch)*16;if(Math.abs(box.scrollTop-target)>1)box.scrollTop=target;}
$('roll-pitch-scroll').addEventListener('scroll',()=>{
 if(!song||drag||velocityDrag)return;
 const next=Math.max(47,Math.min(95,95-Math.round($('roll-pitch-scroll').scrollTop/16)));
 if(next===topPitch)return;topPitch=next;drawRoll();
});

// Loop endpoint edits never alter notes; one drag is one undo step.
function drawLoopMarker(){
 drawLoopStartMarker();
 const el=$('loop-end-marker');if(!song)return;
 const tick=song.loopEnd??end(),local=tick-page*384;
 el.hidden=local<0||local>384;
 el.style.left=(local/384*100)+'%';el.style.opacity=song.loop?'1':'.45';
 const label=$(el.id==='loop-start-marker'?'loop-start-label':'loop-end-label');label.hidden=el.hidden;label.style.setProperty('--marker-x',el.style.left);label.style.left=el.style.left;const labelWidth=label.getBoundingClientRect().width,trackWidth=$('roll').getBoundingClientRect().width,markerX=local/384*trackWidth;label.classList.toggle('edge-flip',el.id==='loop-start-marker'?markerX+labelWidth>trackWidth:markerX<labelWidth);label.style.opacity=el.style.opacity;
 label.style.setProperty('--stem-height',Math.max(0,$('roll').getBoundingClientRect().bottom-label.getBoundingClientRect().bottom)+'px');
 el.setAttribute('aria-valuemin',String(song.loopStart+1));el.setAttribute('aria-valuemax',String(end()));el.setAttribute('aria-valuenow',String(tick));
 el.setAttribute('aria-valuetext',`${(tick/96*60/song.bpm).toFixed(3)}秒`);
}
let loopMarkerDrag=null;
$('loop-end-marker').onpointerdown=e=>{
 if(e.button!==0)return;e.preventDefault();e.stopPropagation();
 stop();loopMarkerDrag={before:snapshot(),page};e.currentTarget.setPointerCapture(e.pointerId);
};
$('loop-end-marker').onpointermove=e=>{
 if(!loopMarkerDrag)return;
 const r=$('roll').getBoundingClientRect(),step=e.shiftKey?1:grid;
 const local=Math.max(0,Math.min(384,Math.round((e.clientX-r.left)/r.width*384/step)*step));
 song.loopEnd=Math.max(song.loopStart+1,Math.min(end(),loopMarkerDrag.page*384+local));
 drawLoopMarker();$('loop-end').value=Number((song.loopEnd/96*60/song.bpm).toFixed(3));
};
$('loop-end-marker').onpointerup=()=>{
 if(!loopMarkerDrag)return;const before=loopMarkerDrag.before;loopMarkerDrag=null;
 if(before!==snapshot()){undo.push(before);redo=[];changed();}
};
$('loop-end-marker').onpointercancel=()=>{
 if(!loopMarkerDrag)return;song=JSON.parse(loopMarkerDrag.before);loopMarkerDrag=null;draw();
};
$('loop-end-marker').onkeydown=e=>{
 if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();
 const step=e.shiftKey?1:grid;
 edit(()=>song.loopEnd=Math.max(song.loopStart+1,Math.min(end(),(song.loopEnd??end())+(e.key==='ArrowLeft'?-step:step))));
};
$('ruler-beats').title='ダブルクリックでループ終点、Alt＋ダブルクリックでループ開始を指定。縦バーをドラッグで調整。';
$('ruler-beats').ondblclick=e=>{
 const r=e.currentTarget.getBoundingClientRect(),step=e.shiftKey?1:grid;
 const tick=page*384+Math.max(0,Math.min(384,Math.round((e.clientX-r.left)/r.width*384/step)*step));
 if(e.altKey)edit(()=>song.loopStart=Math.max(0,Math.min((song.loopEnd??end())-1,tick)));
 else edit(()=>song.loopEnd=Math.max(song.loopStart+1,Math.min(end(),tick)));
};

function drawLoopStartMarker(){
 const el=$('loop-start-marker');if(!song)return;
 const tick=song.loopStart,local=tick-page*384;
 el.hidden=local<0||local>384;
 el.style.left=(local/384*100)+'%';el.style.opacity=song.loop?'1':'.45';
 const label=$(el.id==='loop-start-marker'?'loop-start-label':'loop-end-label');label.hidden=el.hidden;label.style.setProperty('--marker-x',el.style.left);label.style.left=el.style.left;const labelWidth=label.getBoundingClientRect().width,trackWidth=$('roll').getBoundingClientRect().width,markerX=local/384*trackWidth;label.classList.toggle('edge-flip',el.id==='loop-start-marker'?markerX+labelWidth>trackWidth:markerX<labelWidth);label.style.opacity=el.style.opacity;
 label.style.setProperty('--stem-height',Math.max(0,$('roll').getBoundingClientRect().bottom-label.getBoundingClientRect().bottom)+'px');
 el.setAttribute('aria-valuemin','0');el.setAttribute('aria-valuemax',String((song.loopEnd??end())-1));el.setAttribute('aria-valuenow',String(tick));
 el.setAttribute('aria-valuetext',`${(tick/96*60/song.bpm).toFixed(3)}秒。初回は曲頭から、繰り返しはここから再生`);
}
let loopStartMarkerDrag=null;
$('loop-start-marker').onpointerdown=e=>{
 if(e.button!==0)return;e.preventDefault();e.stopPropagation();
 stop();loopStartMarkerDrag={before:snapshot(),page};e.currentTarget.setPointerCapture(e.pointerId);
};
$('loop-start-marker').onpointermove=e=>{
 if(!loopStartMarkerDrag)return;
 const r=$('roll').getBoundingClientRect(),step=e.shiftKey?1:grid;
 const local=Math.max(0,Math.min(384,Math.round((e.clientX-r.left)/r.width*384/step)*step));
 song.loopStart=Math.max(0,Math.min((song.loopEnd??end())-1,loopStartMarkerDrag.page*384+local));
 drawLoopMarker();$('loopStart').value=Math.floor(song.loopStart/384)+1;
};
$('loop-start-marker').onpointerup=()=>{
 if(!loopStartMarkerDrag)return;const before=loopStartMarkerDrag.before;loopStartMarkerDrag=null;
 if(before!==snapshot()){undo.push(before);redo=[];changed();}
};
$('loop-start-marker').onpointercancel=()=>{
 if(!loopStartMarkerDrag)return;song=JSON.parse(loopStartMarkerDrag.before);loopStartMarkerDrag=null;draw();
};
$('loop-start-marker').onkeydown=e=>{
 if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();
 const step=e.shiftKey?1:grid;
 edit(()=>song.loopStart=Math.max(0,Math.min((song.loopEnd??end())-1,song.loopStart+(e.key==='ArrowLeft'?-step:step))));
};

$('loop-reset').onclick=()=>edit(()=>{song.loopStart=0;delete song.loopEnd;});

// The labels are drag handles for the same loop markers.
for(const kind of ['start','end']){
 const label=$(`loop-${kind}-label`),marker=$(`loop-${kind}-marker`);
 label.onpointerdown=e=>marker.onpointerdown(e);
 label.onpointermove=e=>marker.onpointermove(e);
 label.onpointerup=e=>marker.onpointerup(e);
 label.onpointercancel=e=>marker.onpointercancel(e);
}
