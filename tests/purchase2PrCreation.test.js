const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('PR serials are shared sequentially within an institution and isolated between institutions',async()=>{
 const counters=new Map(),reservations=[];
 class Schema{index(){}}
 const Counter={findOneAndUpdate:async query=>{const key=`${query.colid}:${query.year}`,serial=(counters.get(key)||0)+1;counters.set(key,serial);return{serial};}};
 const models={purchase2prcounter:Counter,purchase2prreservation:{create:async row=>reservations.push(row)},purchase2prioritylimit:{},purchase2urgentquota:{}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../services/purchase2PrCreation'),'utf8'),{module,exports:module.exports,require:name=>{if(name==='mongoose')return{Schema,models,model:n=>models[n]};throw Error('Unexpected dependency');},Date});
 const year=new Date().getFullYear();const next=module.exports.next;
 assert.equal(await next(10),`PR/${year}/0001`);assert.equal(await next(10),`PR/${year}/0002`);assert.equal(await next(11),`PR/${year}/0001`);
 assert.equal(reservations.length,3);
});
