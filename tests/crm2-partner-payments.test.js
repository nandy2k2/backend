const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const service=require('../services/crm2PartnerPayments');
const router=require('../controllers/crm2partnerpaymentsctlrds');
const User=require('../Models/user');
const Program=require('../Models/mprograms');
const Rate=require('../Models/crm2partnerpaymentds');
const {masterModels,Lead}=require('../Models/crm2ds');
const {Assignment}=require('../Models/crm2programds');
const id='111111111111111111111111';
const original=[User.findOne,Program.findOne,Rate.findOneAndUpdate,Rate.deleteMany,masterModels.agent.findOne,masterModels.publisher.findOne,service.report,Lead.find,Assignment.find,Rate.find];
afterEach(()=>{[User.findOne,Program.findOne,Rate.findOneAndUpdate,Rate.deleteMany,masterModels.agent.findOne,masterModels.publisher.findOne,service.report,Lead.find,Assignment.find,Rate.find]=original;});
const q=data=>({select(){return this;},sort(){return this;},lean:async()=>data});
async function invoke(method,path,{kind='agent',query={},body={},role='All'}={}){
  User.findOne=match=>{assert.equal(match.colid,42);return q({email:'me@test.com',name:'Me',role});};
  const layer=router.stack.find(row=>row.route?.path===path&&row.route.methods[method]);
  const res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;}};
  await layer.route.stack.at(-1).handle({user:{email:'me@test.com',colid:42},params:{kind},query,body},res);return res;
}
test('program payment counts admitted leads once, excludes nonadmitted and flags absent rates',()=>{
  const leads=[{_id:'l1',admitted:'Yes'},{_id:'l2',admitted:'Yes'},{_id:'l3',admitted:'No'}];
  const entry={leadid:'l1',program:'Science',programcode:'P1',academicyear:'2026-27',admitted:'Yes'};
  const data=service.summarize(leads,[entry,entry,{...entry,leadid:'l2',program:'Arts',programcode:'P2'},{...entry,leadid:'l3'},{...entry,leadid:'foreign'}],[{programcode:'P1',academicyear:'2026-27',amount:1500.25}]);
  assert.equal(data.summary.admitted,2);assert.equal(data.summary.conversionPercentage,66.67);assert.equal(data.summary.totalPayment,1500.25);
  assert.equal(data.programs.find(row=>row.programcode==='P1').admitted,1);assert.equal(data.summary.unconfiguredAdmissions,1);
});
test('Publisher report cannot select another publisher or institution',async()=>{
  masterModels.publisher.findOne=match=>{assert.equal(match.colid,42);assert.equal(match.email,'me@test.com');assert.equal(match._id,undefined);return q({_id:id,name:'Me',email:'me@test.com'});};
  service.report=async input=>{assert.equal(input.email,'me@test.com');assert.equal(input.colid,42);return {summary:{},leads:[]};};
  const res=await invoke('get','/:kind/report',{kind:'publisher',role:'Publisher',query:{colid:99,partnerid:'222222222222222222222222',academicyear:'2026-27',mine:'false'}});assert.equal(res.code,200);
});
test('payment configuration resolves partner and program identity from masters and rejects partner edits',async()=>{
  masterModels.agent.findOne=match=>{assert.equal(match.colid,42);return q({_id:id,name:'Canonical Agent',email:'agent@test.com'});};
  Program.findOne=match=>{assert.equal(match.colid,42);assert.equal(match.year,'2026-27');return q({program:'Science',programcode:'P1'});};
  Rate.findOneAndUpdate=async(match,update)=>{assert.equal(match.colid,42);assert.equal(update.$set.agent,'Canonical Agent');assert.equal(update.$set.agentemail,'agent@test.com');assert.equal(update.$set.program,'Science');assert.equal(update.$set.amount,1500.25);return update.$set;};
  const body={colid:99,agentid:id,agent:'Spoof',agentemail:'spoof@test.com',academicyear:'2026-27',programcode:'P1',amount:'1500.25'};
  const saved=await invoke('post','/:kind/configurations/save',{body});assert.equal(saved.data.saved,1);
  const blocked=await invoke('post','/:kind/configurations/save',{body,role:'Agent'});assert.equal(blocked.code,400);assert.match(blocked.data.message,/cannot edit/);
});
test('configuration delete is colid scoped and rejects invalid identifiers',async()=>{
  Rate.deleteMany=async match=>{assert.deepEqual(match,{colid:42,kind:'agent',_id:{$in:[id]}});return {deletedCount:1};};
  const res=await invoke('post','/:kind/configurations/delete',{body:{colid:99,ids:[id]}});assert.equal(res.data.deleted,1);
  assert.equal((await invoke('post','/:kind/configurations/delete',{body:{ids:['invalid']}})).code,400);
});
test('report queries only owner leads, admits and year-specific rate configuration',async()=>{
  Lead.find=match=>{assert.equal(match.colid,42);assert.equal(match.publisheremail.source,'^pub@test\\.com$');return q([{_id:id,name:'Lead',admitted:'Yes',academicyear:'2026-27'}]);};
  Assignment.find=match=>{assert.equal(match.colid,42);assert.deepEqual(match.leadid.$in,[id]);assert.equal(match.academicyear,'2026-27');return q([{leadid:id,admitted:'Yes',program:'Science',programcode:'P1',academicyear:'2026-27'}]);};
  Rate.find=match=>{assert.equal(match.kind,'publisher');assert.equal(match.partnerid,id);assert.equal(match.colid,42);return q([{programcode:'P1',academicyear:'2026-27',amount:500}]);};
  const data=await service.report({colid:42,kind:'publisher',email:'pub@test.com',academicyear:'2026-27',partnerid:id});assert.equal(data.summary.totalPayment,500);assert.equal(data.leads[0].admittedPrograms,'Science (P1)');
});
