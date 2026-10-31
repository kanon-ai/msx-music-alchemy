const assert=require('node:assert/strict');
const {buildTrackPreview}=require('../static/track-preview.js');
const p={tracks:[{id:'a',name:'test',chip:'OPM',notes:[{pitch:60,portamentoFrom:59,velocity:10}]}]};
const before=JSON.stringify(p), d=new Map([['a',{volume:50,octave:1,tone:{track:{opmPatch:{algorithm:4}}}}]]);
const q=buildTrackPreview(p,d);assert.equal(q.tracks[0].notes[0].pitch,72);assert.equal(q.tracks[0].notes[0].portamentoFrom,71);assert.equal(q.tracks[0].notes[0].velocity,5);assert.equal(JSON.stringify(p),before);
assert.deepEqual(buildTrackPreview(p,new Map()),p);
assert.throws(()=>buildTrackPreview({...p,tracks:[{...p.tracks[0],notes:[{pitch:90,velocity:15}]}]},d));
assert.equal(JSON.stringify(p),before);
console.log('track preview: isolation, reset, velocity, pitch, bounds passed');

const song={tracks:[{id:'fm',chip:'OPLL',channel:4,instrument:3,notes:[{start:0,pitch:60,velocity:10,instrument:3},{start:40000,pitch:64,velocity:9,instrument:7}]},{id:'other',chip:'OPLL',channel:5,instrument:3,notes:[{pitch:60,velocity:8,instrument:3}]}]};
const original=JSON.stringify(song);
const tone=buildTrackPreview(song,new Map([['fm',{octave:0,volume:100,tone:{track:{instrument:1}}}]]));
assert.equal(tone.tracks[0].instrument,1);assert(tone.tracks[0].notes.every(n=>!('instrument' in n)));assert.deepEqual(tone.tracks[1],song.tracks[1]);assert.equal(JSON.stringify(song),original);
const volume=buildTrackPreview(song,new Map([['fm',{octave:0,volume:80}]]));assert.equal(volume.tracks[0].notes[0].instrument,3);assert.equal(volume.tracks[0].notes[1].instrument,7);
const custom=buildTrackPreview(song,new Map([['fm',{octave:0,volume:100,tone:{track:{instrument:0},patch:[1,2,3,4,5,6,7,8]}}]]));assert(custom.tracks[0].notes.every(n=>!('instrument' in n)));assert.equal(custom.tracks[0].instrument,0);
console.log('OPLL tone: all bars, ROM/custom, source and other-track isolation; volume preserves note tones PASS');

const unified=buildTrackPreview(song,new Map([['fm',{octave:0,volume:150,unify:true,uniformVelocity:9}]]));
assert(unified.tracks[0].notes.every(n=>n.velocity===9&&!('instrument' in n)));assert.deepEqual(unified.tracks[1],song.tracks[1]);assert.equal(JSON.stringify(song),original);assert.equal(unified.tracks[0].notes[1].start,40000);
for(const invalid of [0,16,1.5,NaN])assert.throws(()=>buildTrackPreview(song,new Map([['fm',{octave:0,volume:100,unify:true,uniformVelocity:invalid}]])));
console.log('Unify full-track tone/velocity, volume override, bounds and isolation PASS');

const abs=buildTrackPreview(song,new Map([['fm',{octave:0,volume:6,volumeMode:'absolute'}]]));assert(abs.tracks[0].notes.every(n=>n.velocity===6));assert.equal(abs.tracks[0].notes[0].instrument,3);assert.deepEqual(abs.tracks[1],song.tracks[1]);assert.equal(JSON.stringify(song),original);
for(const v of [0,16,4.5])assert.throws(()=>buildTrackPreview(song,new Map([['fm',{octave:0,volume:v,volumeMode:'absolute'}]])));
console.log('Absolute volume: all notes, bounds, tone preservation and isolation PASS');

assert.deepEqual(buildTrackPreview(song,new Map([['fm',{octave:0,volume:10,volumeMode:'preserve'}]])),song);
// Opening override must become the track voice, even with unsorted notes.
const opening={tracks:[{id:'fm',chip:'OPLL',channel:0,instrument:3,notes:[{start:384,pitch:65,velocity:5,instrument:7},{start:24,pitch:60,velocity:12,instrument:0}]}],opllPatch:[1,2,3,4,5,6,7,8]};
const openingBefore=structuredClone(opening);
const unifiedDraft={octave:0,volume:8,volumeMode:'preserve',unify:true,uniformVelocity:8};
const result=buildTrackPreview(opening,new Map([['fm',unifiedDraft]]));
assert.equal(result.tracks[0].instrument,0);
assert.deepEqual(result.opllPatch,opening.opllPatch);
assert(result.tracks[0].notes.every(n=>!('instrument' in n)&&n.velocity===8));
assert.deepEqual(result.tracks[0].notes.map(n=>[n.start,n.pitch]),opening.tracks[0].notes.map(n=>[n.start,n.pitch]));
assert.deepEqual(opening,openingBefore);
const explicit=buildTrackPreview(opening,new Map([['fm',{...unifiedDraft,tone:{track:{instrument:5}}}]]));
assert.equal(explicit.tracks[0].instrument,5);
const empty=structuredClone(opening);empty.tracks[0].notes=[];
assert.equal(buildTrackPreview(empty,new Map([['fm',unifiedDraft]])).tracks[0].instrument,3);
console.log('Opening voice, custom zero, explicit selection, uniform volume and empty track PASS');
const {buildBarAudition}=require('../static/track-preview.js');
const ranged={bars:8,loop:true,loopStart:384,loopEnd:2000,tracks:[{notes:[{start:100,duration:800},{start:1152,duration:100}]}]};
const rangeBefore=structuredClone(ranged),clip=buildBarAudition(ranged,2,2);
assert.equal(clip.startTick,384);assert.equal(clip.song.bars,2);assert.equal(clip.song.loop,false);assert.equal(clip.song.loopStart,0);assert(!('loopEnd' in clip.song));assert.deepEqual(clip.song.tracks[0].notes,[{start:100,duration:668}]);assert.deepEqual(ranged,rangeBefore);
for(const [a,b] of [[0,1],[2,1],[1,9],[1.5,2]])assert.throws(()=>buildBarAudition(ranged,a,b));
assert.equal(buildBarAudition(ranged,8,8).startTick,2688);
console.log('Bar audition: inclusive end, crossing note trim, loop isolation and bounds PASS');
const {noteToneMarkers}=require('../static/track-preview.js');
const markerTrack={chip:'OPLL',channel:0,instrument:3,notes:[{id:'c',start:800},{id:'a',start:0,instrument:0},{id:'b',start:400,instrument:0},{id:'d',start:900,instrument:3}]};
const markerBefore=structuredClone(markerTrack),markers=noteToneMarkers(markerTrack);
assert.deepEqual(markers.get('a'),{instrument:0,changed:true,override:true});assert.equal(markers.get('b').changed,false);assert.deepEqual(markers.get('c'),{instrument:0,changed:false,override:false});assert.equal(markers.get('d').changed,true);assert.deepEqual(markerTrack,markerBefore);
assert.equal(noteToneMarkers({...markerTrack,chip:'SCC'}).size,0);assert.equal(noteToneMarkers({...markerTrack,channel:7},true).size,0);
console.log('Tone markers: custom zero, repeat, return to base, cross-bar order and rhythm exclusions PASS');
