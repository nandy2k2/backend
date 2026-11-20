const test=require('node:test'),assert=require('node:assert/strict'),mongoose=require('mongoose'),jwt=require('jsonwebtoken');
const router=require('../controllers/courseDesign');
const {Assignment,Submission,Workflow}=require('../Models/courseDesign');
const User=require('../Models/user'),Notification=require('../Models/userinboxnotification'),Course=require('../Models/regulationcoursemapds'),Syllabus=require('../Models/syllabusds');
const id='111111111111111111111111',facultyid='222222222222222222222222';
const query=value=>({session(){return this;},select(){return this;},sort(){return this;},lean:async()=>value,then:(resolve,reject)=>Promise.resolve(value).then(resolve,reject)});
function setup(t){
 t.mock.method(jwt,'verify',()=>({colid:42,user:'faculty@example.com'}));
 t.mock.method(User,'findOne',q=>query(q._id?{_id:facultyid,name:'Faculty',email:'faculty@example.com',department:'Science'}:{_id:facultyid,colid:42,name:'Faculty',email:'faculty@example.com',role:'All'}));
 t.mock.method(mongoose,'startSession',async()=>({withTransaction:fn=>fn(),endSession:async()=>{}}));
 return t.mock.method(Notification,'create',async rows=>rows);
}
async function call(path,body={},params={}){
 let status=200,data;
 const handler=router.stack.find(layer=>layer.route?.path===path&&layer.route.methods.post).route.stack[0].handle;
 await handler({body,params,get:()=> 'Bearer test'},{status(code){status=code;return this;},sendStatus(code){status=code;return this;},json(value){data=value;}});
 return {status,data};
}
test('dated assignment derives faculty and course from scoped masters and notifies faculty',async t=>{
 const notification=setup(t);
 const courses=t.mock.method(Course,'find',()=>query([{_id:id,academicyear:'2026-27',regulation:'R2026',program:'Science',programcode:'SCI',type:'Major',subject:'Science',semester:'1',course:'Physics',coursecode:'PHY'}]));
 t.mock.method(Syllabus,'distinct',()=>query(['Unit 1']));
 const create=t.mock.method(Assignment,'create',async rows=>rows.map(row=>({...row,_id:id})));
 const result=await call('/assignments',{colid:99,facultyid,facultyemail:'spoof@example.com',courseids:[id],startdate:'2026-11-20',enddate:'2026-12-20',modules:['Unit 1'],hoursperweek:3});
 assert.equal(result.status,200);
 assert.equal(courses.mock.calls[0].arguments[0].colid,42);
 const row=create.mock.calls[0].arguments[0][0];
 assert.equal(row.colid,42);assert.equal(row.facultyemail,'faculty@example.com');assert.equal(row.coursecode,'PHY');assert.equal(row.enddate,'2026-12-20');
 assert.equal(notification.mock.calls[0].arguments[0][0].recipient,'faculty@example.com');
 assert.equal(notification.mock.calls[0].arguments[0][0].link,'/course-design');
});
test('invalid date ranges cannot create assignments',async t=>{
 setup(t);const create=t.mock.method(Assignment,'create',async()=>[]);
 assert.equal((await call('/assignments',{startdate:'2026-12-20',enddate:'2026-11-20'})).status,400);
 assert.equal(create.mock.calls.length,0);
});
test('draft saves use assignment ownership and do not require a workflow',async t=>{
 setup(t);
 const assignment=t.mock.method(Assignment,'findOne',()=>query({_id:id,course:'Physics'}));
 t.mock.method(Submission,'findOne',()=>query(null));
 const flow=t.mock.method(Workflow,'findOne',()=>query(null));
 const save=t.mock.method(Submission.prototype,'save',async function(){return this;});
 const result=await call('/design/:id',{title:'Draft',content:'Outline',documents:[],owner:'spoof@example.com'},{id});
 assert.equal(result.status,200);assert.equal(flow.mock.calls.length,0);
 assert.equal(assignment.mock.calls[0].arguments[0].colid,42);
 assert.ok(assignment.mock.calls[0].arguments[0].facultyemail.test('faculty@example.com'));
 assert.equal(save.mock.calls[0].this.owner,'faculty@example.com');
 assert.equal(save.mock.calls[0].this.status,'Draft');
});
test('submitted content cannot be changed or resubmitted',async t=>{
 setup(t);t.mock.method(Assignment,'findOne',()=>query({_id:id}));
 t.mock.method(Submission,'findOne',()=>query({status:'Submitted'}));
 const save=t.mock.method(Submission.prototype,'save',async()=>{});
 const result=await call('/design/:id',{title:'Changed',content:'Changed',documents:[],submit:true},{id});
 assert.equal(result.status,400);assert.match(result.data.message,/locked/);assert.equal(save.mock.calls.length,0);
});
test('submit snapshots approval levels and notifies first approver',async t=>{
 const notification=setup(t);t.mock.method(Assignment,'findOne',()=>query({_id:id,course:'Physics'}));
 t.mock.method(Submission,'findOne',()=>query(null));
 t.mock.method(Workflow,'findOne',()=>query({approvers:[{userid:id,name:'Reviewer',email:'review@example.com'}]}));
 const save=t.mock.method(Submission.prototype,'save',async function(){return this;});
 const result=await call('/design/:id',{title:'Design',content:'Course plan',documents:[],submit:true},{id});
 assert.equal(result.status,200);assert.equal(save.mock.calls[0].this.status,'Submitted');
 assert.equal(save.mock.calls[0].this.approvers[0].email,'review@example.com');
 assert.equal(notification.mock.calls[0].arguments[0][0].recipient,'review@example.com');
});
test('only current approver can decide; final approval notifies owner',async t=>{
 const notification=setup(t);
 const row={_id:id,colid:42,title:'Design',owner:'owner@example.com',status:'Submitted',step:0,approvers:[{email:'faculty@example.com'}],history:[],save:async()=>{}};
 t.mock.method(Submission,'findOne',()=>query(row));
 assert.equal((await call('/decision/:id',{decision:'Approved'},{id})).status,200);
 assert.equal(row.status,'Approved');assert.ok(row.approvedat);
 assert.equal(notification.mock.calls[0].arguments[0][0].recipient,'owner@example.com');
 row.status='Submitted';row.approvers=[{email:'somebody@example.com'}];
 assert.equal((await call('/decision/:id',{decision:'Approved'},{id})).status,400);
});
test('intermediate approval advances one level and rejection requires remarks',async t=>{
 const notification=setup(t);
 const row={_id:id,colid:42,title:'Design',owner:'owner@example.com',status:'Submitted',step:0,approvers:[{email:'faculty@example.com'},{email:'next@example.com'}],history:[],save:async()=>{}};
 t.mock.method(Submission,'findOne',()=>query(row));
 assert.equal((await call('/decision/:id',{decision:'Approved'},{id})).status,200);
 assert.equal(row.status,'Submitted');assert.equal(row.step,1);
 assert.equal(notification.mock.calls[0].arguments[0][0].recipient,'next@example.com');
 assert.equal((await call('/decision/:id',{decision:'Rejected'},{id})).status,400);
});
test('unassigned faculty cannot write content and missing workflows block submission',async t=>{
 setup(t);
 const assignment=t.mock.method(Assignment,'findOne',()=>query(null));
 const save=t.mock.method(Submission.prototype,'save',async()=>{});
 const body={title:'Design',content:'Plan',documents:[],submit:true};
 assert.equal((await call('/design/:id',body,{id})).status,400);
 assert.equal(save.mock.calls.length,0);
 assignment.mock.mockImplementation(()=>query({_id:id}));
 t.mock.method(Submission,'findOne',()=>query(null));
 t.mock.method(Workflow,'findOne',()=>query(null));
 const result=await call('/design/:id',body,{id});
 assert.equal(result.status,400);assert.match(result.data.message,/configure/);
 assert.equal(save.mock.calls.length,0);
});
test('unsafe document links cannot be saved',async t=>{
 setup(t);
 const result=await call('/design/:id',{title:'Design',content:'Plan',documents:[{name:'Unsafe',url:'javascript:alert(1)'}]},{id});
 assert.equal(result.status,400);assert.match(result.data.message,/HTTP/);
});
