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
