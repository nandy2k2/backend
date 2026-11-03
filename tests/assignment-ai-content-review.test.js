const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { reviewSubmission, normalizeReview, extractContent } = require('../utils/assignmentAiContentReview');
const Submission = require('../Models/neplmsassignmentsubmissionds');
const Resource = require('../Models/neplmsresourceds');
const Config = require('../Models/aiconfigurationds');
const controller = require('../controllers/neplmsctlrds');
const AWS = require('aws-sdk');
const Awsconfig = require('../Models/awsconfig');
const originals = [Submission.findOne,Resource.findOne,Config.findOne,global.fetch,AWS.S3,Awsconfig.findOne];
afterEach(()=>{[Submission.findOne,Resource.findOne,Config.findOne,global.fetch,AWS.S3,Awsconfig.findOne]=originals;});
test('insufficient content is reported without making a detector claim or calling AI',async()=>{
  let called=false;
  const report=await reviewSubmission({submission:{comments:'My file is attached.',url:'https://untrusted.example/file.pdf'},colid:42,callAi:async()=>{called=true;}});
  assert.equal(report.finding,'Insufficient content');assert.equal(called,false);assert.match(report.attachmentStatus,/not inspected/);assert.match(report.limitations,/not proof/);
});
test('keeps only exact evidence and downgrades unsupported AI-like claims',()=>{
  const input={content:'This is an exact passage written for the assignment.'};
  const report=normalizeReview(JSON.stringify({finding:'Mixed AI-like',summary:'Tentative signal',evidence:[{quote:'invented text never submitted',reason:'formulaic'}]}),input);
  assert.equal(report.finding,'Inconclusive');assert.deepEqual(report.evidence,[]);
  const grounded=normalizeReview(JSON.stringify({finding:'Mixed AI-like',evidence:[{quote:'exact passage written',reason:'Could be ordinary human phrasing too'}]}),input);
  assert.equal(grounded.evidence.length,1);
});
test('limits text coverage, handles malformed output and does not access another tenant file',async()=>{
  const input=await extractContent({comments:'x'.repeat(25000),key:'99/nep-lms-submissions/a.pdf',bucket:'other'},42);
  assert.equal(input.content.length,24000);assert.equal(input.truncated,true);assert.match(input.attachmentStatus,/not inspected/);
  const report=await reviewSubmission({submission:{comments:'Student discussion of the topic. '.repeat(20)},colid:42,callAi:async()=>'{broken json'});
  assert.equal(report.finding,'Check failed');
});
test('extracts only institution-owned AWS text and refuses oversized files',async()=>{
  Awsconfig.findOne=query=>{assert.equal(query.colid,42);return {sort(){return this;},lean:async()=>({bucket:'institution-files',region:'ap-south-1',username:'mock',password:'mock'})};};
  let size=100,reads=0;
  AWS.S3=function(){return {
    headObject:params=>{assert.equal(params.Key,'42/nep-lms-submissions/work.txt');return {promise:async()=>({ContentLength:size})};},
    getObject:params=>{assert.equal(params.Bucket,'institution-files');reads++;return {promise:async()=>({Body:Buffer.from('Readable student assignment content')})};}
  };};
  const submission={key:'42/nep-lms-submissions/work.txt',bucket:'institution-files',originalname:'work.txt'};
  const content=await extractContent(submission,42);assert.match(content.content,/Readable student/);assert.equal(content.attachmentStatus,'Attachment text inspected');assert.equal(reads,1);
  size=11*1024*1024;const oversized=await extractContent(submission,42);assert.equal(reads,1);assert.match(oversized.attachmentStatus,/not inspected/);
});
test('optional review is saved separately and cannot change academic marks; queries use authenticated colid',async()=>{
  for(const enabled of [false,true]) {
    const submission={assignmentid:'a1',fullmarks:10,comments:'Student explanation and analysis with worked examples. '.repeat(12),save:async function(){return this;}};
    Submission.findOne=async query=>{assert.equal(query.colid,42);return submission;};
    Resource.findOne=query=>{assert.equal(query.colid,42);return {lean:async()=>({fullmarks:10})};};
    Config.findOne=query=>{assert.equal(query.colid,42);return {sort(){return this;},lean:async()=>({apikey:'mock-key'})};};
    let calls=0;
    global.fetch=async()=>{calls++;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(calls===1?{marks:8,comments:'Meets rubric'}:{finding:'Predominantly AI-like',summary:'Unverified indicators',evidence:[{quote:'Student explanation and analysis',reason:'Could also be normal academic writing'}],marks:0})}]}}]})};};
    const res={status(){return this;},json(data){this.data=data;}};
    await controller.aiEvaluateAssignmentSubmission({user:{colid:42},body:{colid:99,id:'s1',checkAiContent:enabled}},res);
    assert.equal(res.data.success,true);assert.equal(submission.marks,8);assert.equal(submission.facultycomments,'Meets rubric');assert.equal(calls,enabled?2:1);
    if(enabled){assert.equal(submission.aicontentreview.checked,true);assert.equal(submission.aicontentreview.finding,'Predominantly AI-like');}
    else assert.equal(submission.aicontentreview,undefined);
  }
});
