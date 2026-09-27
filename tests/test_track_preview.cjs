const assert=require('node:assert/strict');
const {buildTrackPreview}=require('../static/track-preview.js');
const p={tracks:[{id:'a',name:'test',chip:'OPM',notes:[{pitch:60,portamentoFrom:59,velocity:10}]}]};
const before=JSON.stringify(p), d=new Map([['a',{volume:50,octave:1,tone:{track:{opmPatch:{algorithm:4}}}}]]);
const q=buildTrackPreview(p,d);assert.equal(q.tracks[0].notes[0].pitch,72);assert.equal(q.tracks[0].notes[0].portamentoFrom,71);assert.equal(q.tracks[0].notes[0].velocity,5);assert.equal(JSON.stringify(p),before);
assert.deepEqual(buildTrackPreview(p,new Map()),p);
assert.throws(()=>buildTrackPreview({...p,tracks:[{...p.tracks[0],notes:[{pitch:90,velocity:15}]}]},d));
assert.equal(JSON.stringify(p),before);
console.log('track preview: isolation, reset, velocity, pitch, bounds passed');
