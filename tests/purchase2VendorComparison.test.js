const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {compareQuotes}=require('../utils/purchase2Comparison');
const items=[{_id:'a',quantity:2},{_id:'b',quantity:1}];
test('CS computes discount and GST before ranking and excludes incomplete quotations from overall L1',()=>{
 const quotes=[{vendorid:'v1',vendor:'One',lines:[{pritemid:'a',price:100,discount:10,discounttype:'Percentage',gst:10},{pritemid:'b',price:100}]},{vendorid:'v2',vendor:'Two',lines:[{pritemid:'a',price:90,gst:0},{pritemid:'b',price:200}]},{vendorid:'v3',vendor:'Partial',lines:[{pritemid:'a',price:1}]}];
 const result=compareQuotes(items,quotes);assert.equal(result.rows[0].offers[0].total,198);assert.deepEqual(result.rows[0].l1vendors,['v3']);assert.equal(result.totals[0].total,298);assert.equal(result.totals[0].l1,true);assert.equal(result.totals[2].complete,false);assert.equal(result.totals[2].l1,false);
});
test('tied quotes are all highlighted as item and overall L1',()=>{
 const quotes=['v1','v2'].map(vendorid=>({vendorid,lines:items.map(i=>({pritemid:i._id,price:10}))}));const result=compareQuotes(items,quotes);assert.deepEqual(result.rows[0].l1vendors,['v1','v2']);assert.ok(result.totals.every(q=>q.l1));
});
function verifier(mappings){const module={exports:{}};const chain=v=>({session(){return this;},lean:async()=>v});vm.runInNewContext(fs.readFileSync(require.resolve('../services/verifyVendorSellsItems'),'utf8'),{module,require:name=>{
 if(name.endsWith('/vendords2'))return{findOne:q=>chain(q.colid===42&&q._id==='v1'?{_id:'v1'}:null)};
 if(name.endsWith('/vendoritemds2'))return{find:q=>chain(mappings.filter(m=>m.colid===q.colid&&m.vendorid===q.vendorid&&m.verified===q.verified&&m.status!=='Inactive'))};
 if(name.endsWith('/itemmasterds2'))return{find:q=>chain(q.colid===42?[{_id:'i1',itemcode:'C1',itemname:'Paper',category:'Stationery'}]:[])};throw Error(name);
 }});return module.exports.verifyVendorSellsItems;}
test('verified item and category mappings allow PO or quotation items',async()=>{
 await verifier([{colid:42,vendorid:'v1',itemid:'i1',mappingtype:'Item',verified:'Yes'}])(42,'v1',[{itemid:'i1'}]);
 await verifier([{colid:42,vendorid:'v1',category:'Stationery',mappingtype:'Category',verified:'Yes'}])(42,'v1',[{itemcode:'C1'}]);
});
test('unverified, foreign institution, inactive, or unmapped supply is blocked',async()=>{
 for(const mapping of [{colid:42,verified:'No'},{colid:99,verified:'Yes'},{colid:42,verified:'Yes',status:'Inactive'}])await assert.rejects(()=>verifier([{vendorid:'v1',mappingtype:'Item',itemid:'i1',...mapping}])(42,'v1',[{itemid:'i1'}]),/not verified/);
 await assert.rejects(()=>verifier([])(42,'v1',[{itemid:'i1'}]),/not verified/);
 await assert.rejects(()=>verifier([])(99,'v1',[{itemid:'i1'}]),/valid vendor/);
});
