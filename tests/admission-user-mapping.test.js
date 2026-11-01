const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../controllers/admissionusermappingctlrds');
const mongoose = require('mongoose');
const Mapping = mongoose.models.admissionusermappingds;
const Application = require('../Models/admissionapplicationdynamic');
const FormField = require('../Models/admissionformfield');
const User = require('../Models/user');
const Ping = require('../controllers/pingwhatsappsendctlrds');
const originals = [Mapping.find, Mapping.findOneAndUpdate, Mapping.deleteMany, Application.find, Application.aggregate, FormField.find, User.find, User.updateOne, Ping.sendDirect];
afterEach(()=>{ [Mapping.find, Mapping.findOneAndUpdate, Mapping.deleteMany, Application.find, Application.aggregate, FormField.find, User.find, User.updateOne, Ping.sendDirect] = originals; });
const id='507f1f77bcf86cd799439011';
const response = ()=>({code:200,status(code){this.code=code;return this;},json(data){this.data=data;}});
const chain = data => ({select(){return this;},limit(){return this;},lean:async()=>data});
function setup() {
  Mapping.find = query=>{assert.equal(query.colid,42);return chain([{source:'extraFields.parent_phone',target:'guardianmobile'},{source:'phone',target:'phone'},...['name','email','program','programcode','regno','rollno','semester','regulation','academicyear','admissionyear','colid','role','password'].map(target=>({source:'name',target}))]);};
  Application.find = query=>{assert.equal(query.colid,42);return chain([{_id:id,name:'Applicant',regno:'R1',phone:'1234567890',extraFields:{parent_phone:'9000000000'}}]);};
  User.find = query=>{assert.deepEqual(query,{colid:42,regno:'R1',role:'Student'});return chain([{_id:id}]);};
}
test('transfer matches Student by colid and regno only, never writes protected or authentication fields',async()=>{
  setup();
  User.updateOne=async(query,update,options)=>{assert.deepEqual(query,{_id:id,colid:42,regno:'R1',role:'Student'});assert.deepEqual(update,{$set:{guardianmobile:'9000000000',phone:'1234567890'}});assert.equal(options.runValidators,true);return {matchedCount:1};};
  const res=response();await controller.transfer({body:{colid:42,ids:[id]}},res);assert.equal(res.data.transferred,1);
});
test('missing and duplicate student matches are skipped, never created or updated',async()=>{
  setup();User.updateOne=async()=>{throw new Error('must not update');};
  for (const students of [[],[{_id:id},{_id:'other'}]]) {
    User.find=()=>chain(students);const res=response();await controller.transfer({body:{colid:42,ids:[id]}},res);assert.equal(res.data.transferred,0);assert.equal(res.data.results[0].status,'Skipped');
  }
});
test('blank mapped values do not erase existing User data',async()=>{
  setup();Mapping.find=()=>chain([{source:'extraFields.missing',target:'guardianmobile'}]);
  User.updateOne=async()=>{throw new Error('must not update');};
  const res=response();await controller.transfer({body:{colid:42,ids:[id]}},res);assert.match(res.data.results[0].details,/empty/);
});
test('options combine standard fields, custom definitions across forms and observed custom fields within colid',async()=>{
  Mapping.find=()=>chain([]);
  FormField.find=query=>{assert.equal(query.colid,42);return chain([{fieldname:'parent_phone',label:'Parent phone',formid:'f1'},{fieldname:'parent_phone',label:'Parent phone',formid:'f2'}]);};
  Application.aggregate=async pipeline=>{assert.deepEqual(pipeline[0],{$match:{colid:42}});return [{_id:'legacy_field'}];};
  const res=response();await controller.options({query:{colid:42}},res);
  assert.ok(res.data.sources.some(row=>row.field==='phone'));
  assert.deepEqual(res.data.sources.find(row=>row.field==='extraFields.parent_phone').forms,['f1','f2']);
  assert.ok(res.data.sources.some(row=>row.field==='extraFields.legacy_field'));
  assert.ok(res.data.targets.find(row=>row.field==='regno').protected);
  assert.ok(!res.data.targets.some(row=>row.field==='colid' || row.field==='authenticatorsecret'));
});
test('Ping sends use selected institution applications, not client supplied numbers',async()=>{
  Application.find=query=>{assert.equal(query.colid,42);return chain([{phone:'9008168822'}]);};
  Ping.sendDirect=async(req,res)=>{assert.equal(req.body.mobileNumbers,'9008168822');assert.equal(req.body.colid,42);res.json({sent:1});};
  const res=response();await controller.sendPing({user:{colid:42},body:{colid:99,applicationids:[id],mobileNumbers:'1111111111'}},res);assert.equal(res.data.sent,1);
});
test('mapping bulk delete is scoped to the institution',async()=>{
  Mapping.deleteMany=async query=>{assert.deepEqual(query,{colid:42,_id:{$in:[id]}});return {deletedCount:1};};
  const res=response();await controller.remove({body:{colid:42,ids:[id]}},res);assert.equal(res.data.deleted,1);
});
test('mapping save upserts by colid and destination; system destinations are rejected',async()=>{
  Mapping.findOneAndUpdate=async(query,update,options)=>{assert.deepEqual(query,{colid:42,target:'guardianmobile'});assert.equal(update.$set.source,'phone');assert.equal(options.upsert,true);return {_id:id,...query,...update.$set};};
  const res=response();await controller.save({body:{colid:42,source:'phone',target:'guardianmobile'}},res);assert.equal(res.code,200);
  const invalid=response();await controller.save({body:{colid:42,source:'phone',target:'colid'}},invalid);assert.equal(invalid.code,400);
});
