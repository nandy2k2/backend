const test=require('node:test'),assert=require('node:assert/strict');
const {isIT,managed,html}=require('../controllers/purchase2Operations').helpers;
test('IT routing detects explicit IT and technology categories without classifying unrelated items',()=>{
 for(const category of ['IT','IT equipment','Information Technology','Computer peripherals','Network equipment','Software'])assert.equal(isIT({category}),true);
 for(const category of ['Furniture','Stationery','Hospitality','Civil supplies',''])assert.equal(isIT({category}),false);
});
test('store access derives from authoritative store manager or user rather than legacy user tables',()=>{
 assert.equal(managed({name:'Manager',email:'m@test.com'},{storemanager:'M@TEST.COM'}),true);
 assert.equal(managed({name:'Manager',email:'m@test.com'},{storemanager:'Manager'}),true);
 assert.equal(managed({name:'Other',email:'x@test.com'},{user:'m@test.com',storemanager:'Manager'}),false);
 assert.equal(managed({admin:true},{storemanager:'Manager'}),true);
});
test('assignment email escapes potentially unsafe PR and item details',()=>{
 assert.equal(html('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
