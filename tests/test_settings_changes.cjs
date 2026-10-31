const assert=require('assert/strict'),{volumeSection,setSectionVolume,setSectionTone,expandSettings}=require('../static/track-preview.js');
const t={instrument:3,notes:[10,10,8,8,10].map((velocity,i)=>({id:String(i),start:i*48,velocity,instrument:i<2?3:5}))};
assert.equal(volumeSection(t,'1').length,2);const before=structuredClone(t);setSectionVolume(t,'1',6);assert.deepEqual(t.notes.map(n=>n.velocity),[6,6,8,8,10]);assert.throws(()=>setSectionVolume(t,'1',0));
setSectionTone(t,'0','12');assert.deepEqual(t.notes.map(n=>n.instrument),[12,undefined,5,undefined,undefined]);
const p={settingsMode:'changes',tracks:[{notes:[{start:48},{start:0,velocity:9}]}]};assert.deepEqual(expandSettings(p).tracks[0].notes.map(n=>n.velocity),[9,9]);assert.equal(p.tracks[0].notes[0].velocity,undefined);
Object.assign(t,structuredClone(before));assert.deepEqual(t,before);console.log('Settings sections: middle-of-section edit, next boundary, repeated tone cleanup, sparse import, undo snapshot PASS');
