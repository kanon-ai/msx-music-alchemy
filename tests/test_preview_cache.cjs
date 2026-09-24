const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync('static/app.js','utf8').split('// BEGIN PREVIEW CACHE')[1].split('// END PREVIEW CACHE')[0];
const Cache=vm.runInNewContext(code+';PreviewCache');
(async()=>{
 let calls=[];const c=new Cache(async key=>{calls.push(key);return {key};});
 const a=c.get('normal'),b=c.get('normal');assert.strictEqual(a,b);await a;await c.get('normal');assert.deepStrictEqual(calls,['normal']);
 await c.get('solo');await c.get('edited');assert.deepStrictEqual(calls,['normal','solo','edited']);
 let failures=0;const retry=new Cache(async()=>{if(!failures++)throw Error('fail');return 'ok';});await assert.rejects(retry.get('a'));assert.strictEqual(await retry.get('a'),'ok');
 let release;const serial=new Cache(key=>new Promise(resolve=>{release=()=>resolve(key);}));const first=serial.get('a');await Promise.resolve();await Promise.resolve();const old=serial.get('b');old.catch(()=>{});const latest=serial.get('c');release();await first;await assert.rejects(old);await new Promise(r=>setImmediate(r));release();assert.strictEqual(await latest,'c');
 console.log('Preview cache: reuse, solo/edit invalidation, failure retry and superseded requests passed');
})();
