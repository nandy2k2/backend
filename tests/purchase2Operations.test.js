const test=require('node:test'),assert=require('node:assert/strict');
const {isIT,assignedRows,assignedStores,html}=require('../controllers/purchase2Operations').helpers;
test('IT routing detects explicit IT and technology categories without classifying unrelated items',()=>{
 for(const category of ['IT','IT equipment','Information Technology','Computer peripherals','Network equipment','Software'])assert.equal(isIT({category}),true);
 for(const category of ['Furniture','Stationery','Hospitality','Civil supplies',''])assert.equal(isIT({category}),false);
});
test('no Store Users row grants no stores even to an admin',async t=>{
 const Grants=require('../Models/storeuserds2');
 t.mock.method(Grants,'find',query=>{
  assert.equal(query.colid,42);
  assert.equal(query.userid.test('M@TEST.COM'),true);
  assert.equal(query.userid.test('OTHER@TEST.COM'),false);
  return {session:()=>({lean:async()=>[]})};
 });
 assert.deepEqual(await assignedStores({colid:42,email:'m@test.com',admin:true}),[]);
});
test('legacy name matching is limited to records without a store ID',()=>{
 const query=assignedRows([{_id:'direct',legacystoreid:'legacy',storename:'Central'}]);
 assert.deepEqual(query.$or[0].storeid.$in,['direct','legacy']);
 assert.deepEqual(query.$or[1].storeid.$in,[null,'']);
 assert.equal(query.$or[1].$or[0].store.$in[0].test('CENTRAL'),true);
});
test('assignment email escapes potentially unsafe PR and item details',()=>{
 assert.equal(html('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
