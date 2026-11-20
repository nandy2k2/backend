const test=require('node:test'),assert=require('node:assert/strict'),mongoose=require('mongoose'),jwt=require('jsonwebtoken');
const router=require('../controllers/practicalBatch');
const {Batch,Member}=require('../Models/practicalBatch');
const User=require('../Models/user'),Course=require('../Models/regulationcoursemapds'),Ledger=require('../Models/ledgerstud'),Roll=require('../Models/conductexamrollds');
const id='111111111111111111111111',courseid='222222222222222222222222';
const chain=value=>({select(){return this;},sort(){return this;},session(){return this;},lean:async()=>value,then:(resolve,reject)=>Promise.resolve(value).then(resolve,reject)});
const batch={_id:id,colid:42,academicyear:'2026-27',exam:'Term End',examcode:'E1',batch:'Batch A'};
const course={_id:courseid,colid:42,academicyear:'2026-27',regulation:'R26',program:'Science',programcode:'SCI',semester:'1',course:'Practical Physics',coursecode:'PHY-P',coursetype:'Practical'};
function setup(t){
 t.mock.method(jwt,'verify',()=>({colid:42,user:'admin@example.com'}));
 t.mock.method(User,'findOne',()=>chain({colid:42,email:'admin@example.com',name:'Admin',role:'All'}));
 t.mock.method(Batch,'findOne',()=>chain(batch));
 t.mock.method(Batch,'updateOne',async()=>({matchedCount:1}));
 t.mock.method(mongoose,'startSession',async()=>({withTransaction:fn=>fn(),endSession:async()=>{}}));
}
async function post(path,body){
 let status=200,data;
 const handler=router.stack.find(layer=>layer.route?.path===path&&layer.route.methods.post).route.stack[0].handle;
 await handler({body,get:()=> 'Bearer test'},{status(code){status=code;return this;},sendStatus(code){status=code;return this;},json(value){data=value;}});
 return {status,data};
}
test('paid student matching is institution/year scoped and joins User by regno only',async t=>{
 setup(t);
 const ledger=t.mock.method(Ledger,'aggregate',()=>chain([{_id:'S1',student:'Ledger name',program:'Science',programcode:'SCI',semester:'1',paid:100,balance:0}]));
 const users=t.mock.method(User,'find',()=>chain([{regno:'S1',name:'Student',email:'student@example.com'}]));
 t.mock.method(Member,'find',()=>chain([]));
 const result=await post('/eligible',{batchid:id,colid:999,filters:[{field:'programcode',value:'SCI'},{field:'semester',value:'1'}]});
 assert.equal(result.status,200);assert.equal(result.data[0].student,'Student');
 const match=ledger.mock.calls[0].arguments[0][0].$match;
 assert.equal(match.colid,42);assert.equal(match.academicyear,'2026-27');assert.deepEqual(match.paid,{$gt:0});assert.equal(match.$and.length,2);
 const query=users.mock.calls[0].arguments[0];assert.deepEqual(Object.keys(query).sort(),['colid','regno','role']);assert.deepEqual(query.regno,{$in:['S1']});
});
test('students already assigned for this exam are excluded',async t=>{
 setup(t);t.mock.method(Ledger,'aggregate',()=>chain([{_id:'S1',paid:50}]));
 t.mock.method(User,'find',()=>chain([{regno:'S1',name:'Student'}]));t.mock.method(Member,'find',()=>chain([{regno:'S1'}]));
 assert.deepEqual((await post('/eligible',{batchid:id,filters:[]})).data,[]);
});
test('assignment rechecks ledger eligibility and refuses unpaid students',async t=>{
 setup(t);t.mock.method(Ledger,'aggregate',()=>chain([]));t.mock.method(User,'find',()=>chain([]));
 const insert=t.mock.method(Member,'insertMany',async()=>{});
 const result=await post('/members',{batchid:id,regnos:['S1'],filters:[]});
 assert.equal(result.status,400);assert.match(result.data.message,/payment/);assert.equal(insert.mock.calls.length,0);
});
test('paid members are saved with canonical batch context and student identity',async t=>{
 setup(t);t.mock.method(Ledger,'aggregate',()=>chain([{_id:'S1',paid:100,program:'Science',programcode:'SCI',semester:'1'}]));
 t.mock.method(User,'find',()=>chain([{regno:'S1',name:'Student',email:'s@example.com'}]));t.mock.method(Member,'exists',()=>chain(null));
 const insert=t.mock.method(Member,'insertMany',async()=>{});
 const result=await post('/members',{batchid:id,regnos:['S1'],filters:[],academicyear:'spoof',examcode:'spoof'});
 assert.equal(result.status,200);
 const row=insert.mock.calls[0].arguments[0][0];assert.equal(row.colid,42);assert.equal(row.examcode,'E1');assert.equal(row.academicyear,'2026-27');assert.equal(row.email,'s@example.com');
});
test('timetable updates only matching batch member examroll entries without creating rows or ledger charges',async t=>{
 setup(t);
 const lookup=t.mock.method(Course,'findOne',()=>chain(course));t.mock.method(Member,'find',()=>chain([{regno:'S1'},{regno:'S2'}]));
 const update=t.mock.method(Roll,'updateMany',async()=>({matchedCount:2}));
 const create=t.mock.method(Roll,'create',async()=>{}),charge=t.mock.method(Ledger,'create',async()=>{});
 const result=await post('/timetable',{batchid:id,academicyear:'2026-27',examcode:'E1',programcode:'SCI',courseid,examdate:'2026-12-01',examslot:'10:00 AM - 12:00 PM',regnos:['SPOOF']});
 assert.equal(result.status,200);assert.equal(result.data.updated,2);
 const query=update.mock.calls[0].arguments[0];
 assert.equal(query.colid,42);assert.equal(query.academicyear,'2026-27');assert.equal(query.examcode,'E1');assert.equal(query.programcode,'SCI');assert.equal(query.coursecode,'PHY-P');assert.equal(query.semester,'1');assert.deepEqual(query.regno,{$in:['S1','S2']});
 assert.ok(lookup.mock.calls[0].arguments[0].coursetype.test('Practical'));
 assert.deepEqual(update.mock.calls[0].arguments[1].$set,{examdate:'2026-12-01',examslot:'10:00 AM - 12:00 PM',batch:'Batch A',practicalbatchid:id});
 assert.equal(create.mock.calls.length,0);assert.equal(charge.mock.calls.length,0);
});
test('timetable rejects wrong exam context, invalid dates and empty examroll matches',async t=>{
 setup(t);t.mock.method(Course,'findOne',()=>chain(course));t.mock.method(Member,'find',()=>chain([{regno:'S1'}]));
 const update=t.mock.method(Roll,'updateMany',async()=>({matchedCount:0}));
 const body={batchid:id,academicyear:'2026-27',examcode:'E1',programcode:'SCI',courseid,examdate:'2026-12-01',examslot:'Morning'};
 assert.equal((await post('/timetable',{...body,examcode:'OTHER'})).status,400);assert.equal(update.mock.calls.length,0);
 assert.equal((await post('/timetable',{...body,examdate:'2026-02-30'})).status,400);assert.equal(update.mock.calls.length,0);
 const result=await post('/timetable',body);assert.equal(result.status,400);assert.match(result.data.message,/No matching examroll/);
});
test('deleting members clears only their assigned practical batch timetable',async t=>{
 setup(t);t.mock.method(Member,'find',()=>chain([{_id:courseid,regno:'S1'}]));
 const clear=t.mock.method(Roll,'updateMany',async()=>({matchedCount:1}));t.mock.method(Member,'deleteMany',async()=>({deletedCount:1}));
 const result=await post('/members/delete',{batchid:id,ids:[courseid]});assert.equal(result.status,200);
 const query=clear.mock.calls[0].arguments[0];assert.equal(query.practicalbatchid,id);assert.equal(query.colid,42);assert.equal(query.examcode,'E1');assert.deepEqual(query.regno,{$in:['S1']});
});
test('batch student uniqueness is scoped to institution/year/exam',()=>{
 assert.deepEqual(Member.schema.indexes().find(([,options])=>options.unique)[0],{colid:1,academicyear:1,examcode:1,regno:1});
});
test('timetable report reads and groups current examroll dates and slots',async t=>{
 setup(t);
 const aggregate=t.mock.method(Roll,'aggregate',async()=>[{_id:{program:'Science',programcode:'SCI',regulation:'R26',semester:'1',course:'Practical Physics',coursecode:'PHY-P',examdate:'2026-12-01',examslot:'Morning'},students:12}]);
 t.mock.method(Course,'find',()=>chain([course]));
 const handler=router.stack.find(layer=>layer.route?.path==='/timetable'&&layer.route.methods.get).route.stack[0].handle;
 let data;await handler({query:{batchid:id,academicyear:'2026-27',examcode:'E1'},get:()=> 'Bearer test'},{json(value){data=value;},status(){return this;}});
 assert.equal(data[0].students,12);assert.equal(data[0].examdate,'2026-12-01');assert.equal(data[0].courseid,courseid);
 const match=aggregate.mock.calls[0].arguments[0][0].$match;assert.equal(match.colid,42);assert.equal(match.practicalbatchid,id);assert.equal(match.examcode,'E1');
});
test('bulk clear removes timetable dates but keeps batch membership',async t=>{
 setup(t);t.mock.method(Course,'find',()=>chain([course]));
 const update=t.mock.method(Roll,'updateMany',async()=>({matchedCount:12}));
 const remove=t.mock.method(Member,'deleteMany',async()=>{});
 const result=await post('/timetable/delete',{batchid:id,courseids:[courseid]});
 assert.equal(result.status,200);assert.equal(remove.mock.calls.length,0);
 assert.equal(update.mock.calls[0].arguments[0].practicalbatchid,id);
 assert.deepEqual(update.mock.calls[0].arguments[1].$set,{examdate:'',examslot:''});
});
