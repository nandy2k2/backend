const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {router,queryFor}=require('../controllers/admissionscholarshipapplyctlrds');
const User=require('../Models/user'),Scholarship=require('../Models/admissionscholarshipds'),Program=require('../Models/mprograms');
const service=require('../services/admissionScholarshipApply');
const original=[User.exists,User.find,User.countDocuments,Program.find,service.preview,service.apply,User.aggregate,Scholarship.aggregate];
afterEach(()=>{[User.exists,User.find,User.countDocuments,Program.find,service.preview,service.apply,User.aggregate,Scholarship.aggregate]=original;});
const q=data=>({select(){return this;},sort(){return this;},limit(){return this;},lean:async()=>data});
async function invoke(method,path,{body={},query={},params={},anonymous=false}={}){
  User.exists=async match=>{assert.equal(match.colid,42);assert.equal(match.email,'faculty@test.com');return true;};
  const layer=router.stack.find(row=>row.route?.path===path&&row.route.methods[method]),res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;}};
  await layer.route.stack.at(-1).handle({user:anonymous?null:{colid:42,email:'faculty@test.com'},body,query,params},res);return res;
}
test('dynamic student filters cannot override colid or Student role, or inject operators',()=>{
  const query=queryFor('students',42,[{field:'semester',values:['1','2']},{field:'programcode',values:['P1']}],'A.*');
  assert.equal(query.colid,42);assert.equal(query.role,'Student');assert.deepEqual(query.$and[0],{semester:{$in:['1','2']}});assert.equal(query.$and[2].$or[0].name.source,'A\\.\\*');
  assert.throws(()=>queryFor('students',42,[{field:'colid',values:['99']}]),/Invalid filter field/);
  assert.throws(()=>queryFor('students',42,[{field:'name',values:[{$ne:''}]}]),/valid filter/);
  assert.throws(()=>queryFor('students',42,[{field:'password',values:['x']}]),/Invalid filter/);
  assert.equal(queryFor('scholarships',42,[{field:'scholarshiptype',values:['Total']}]).active,'Yes');
});
test('care-of options use authenticated institution and return only name/email projection',async()=>{
  User.find=match=>{
    assert.equal(match.colid,42);assert.equal(match.$or[0].name.source,'A\\.\\*');
    return {select(fields){assert.equal(fields,'name email');return this;},sort(){return this;},limit(value){assert.equal(value,50);return this;},lean:async()=>[{_id:'u1',name:'A.* User',email:'care@test.com'}]};
  };
  const res=await invoke('get','/careof-users',{query:{colid:99,search:'A.*'}});
  assert.equal(res.code,200);assert.equal(res.data.data[0].email,'care@test.com');
  assert.equal((await invoke('get','/careof-users',{anonymous:true})).code,400);
});
test('student search and program options use authenticated institution and master programs',async()=>{
  User.find=match=>{assert.equal(match.colid,42);assert.equal(match.role,'Student');return q([{_id:'s1',name:'Student'}]);};User.countDocuments=async()=>1;
  const res=await invoke('post','/:kind/search',{params:{kind:'students'},body:{colid:99,filters:[]}});assert.equal(res.data.total,1);
  Program.find=match=>{assert.deepEqual(match,{colid:42,year:{$in:['2026-27']}});return q([{program:'Science',programcode:'P1'}]);};
  const options=await invoke('post','/:kind/options',{params:{kind:'students'},body:{colid:99,field:'program',filters:[{field:'academicyear',values:['2026-27']}]}});assert.equal(options.data.data[0].programcode,'P1');
});
test('preview/apply cannot substitute institution or actor and anonymous access is blocked',async()=>{
  service.preview=async input=>{assert.equal(input.colid,42);return {rows:[],unmatched:[]};};
  service.apply=async input=>{assert.equal(input.colid,42);assert.equal(input.actor,'faculty@test.com');return {saved:1,skipped:0};};
  assert.equal((await invoke('post','/preview',{body:{colid:99}})).code,200);
  const applied=await invoke('post','/apply',{body:{colid:99,user:'spoof@test.com',selections:[]}});assert.equal(applied.data.saved,1);
  assert.equal((await invoke('post','/apply',{anonymous:true})).code,400);
});
test('remote filter searches are escaped, bounded and handle numeric fields without string regex errors',async()=>{
  Scholarship.aggregate=async pipeline=>{assert.equal(pipeline[0].$match.colid,42);assert.equal(pipeline[0].$match.active,'Yes');assert.deepEqual(pipeline[0].$match.$expr.$regexMatch.input,{$toString:'$value'});assert.equal(pipeline.at(-1).$limit,100);return [{_id:0},{_id:20}];};
  const numeric=await invoke('post','/:kind/options',{params:{kind:'scholarships'},body:{field:'value',search:'0',filters:[]}});assert.deepEqual(numeric.data.data.map(row=>row.value),['0','20']);
  User.aggregate=async pipeline=>{assert.equal(pipeline[0].$match.role,'Student');assert.equal(pipeline[0].$match.name.$regex,'A\\.\\*');return [{_id:'A.*Name'}];};
  const names=await invoke('post','/:kind/options',{params:{kind:'students'},body:{field:'name',search:'A.*',filters:[]}});assert.equal(names.data.data[0].value,'A.*Name');
});
