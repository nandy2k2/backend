const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const mongoose=require('mongoose');
const service=require('../services/admissionScholarshipApply');
const User=require('../Models/user'),Ledger=require('../Models/ledgerstud'),Scholarship=require('../Models/admissionscholarshipds');
const Fees=require('../Models/fees');
const feeOriginals=[Fees.find,Fees.bulkWrite];
afterEach(()=>{[Fees.find,Fees.bulkWrite]=feeOriginals;});
const originalUserBulk=User.bulkWrite;afterEach(()=>{User.bulkWrite=originalUserBulk;});
const {Admission}=require('../Models/crm2admissionds');
const Application=service.Application;
const originals=[User.find,Ledger.find,Ledger.findOne,Ledger.updateOne,Ledger.create,Scholarship.find,Admission.find,Application.find,Application.create,Application.init,mongoose.startSession,Ledger.bulkWrite,Ledger.insertMany,Application.insertMany,User.findOne];
afterEach(()=>{[User.find,Ledger.find,Ledger.findOne,Ledger.updateOne,Ledger.create,Scholarship.find,Admission.find,Application.find,Application.create,Application.init,mongoose.startSession,Ledger.bulkWrite,Ledger.insertMany,Application.insertMany,User.findOne]=originals;});
const U='111111111111111111111111',S='222222222222222222222222',F='333333333333333333333333',F2='444444444444444444444444',S2='555555555555555555555555';
const student={_id:U,colid:42,role:'Student',regno:'R1',name:'Student',email:'s@test.com',academicyear:'2026-27',admissionyear:'2026-27',program:'Science',programcode:'P1',semester:'1',gender:'Female',category:'General'};
const rule={_id:S,colid:42,scholarship:'Merit award',academicyear:'2026-27',program:'Science',programcode:'P1',semester:'1',feeitem:'Tuition',feecategory:'General',active:'Yes',gender:'All',category:'All',merit:'No',type:'Percentage',value:10,scholarshiptype:'Total'};
const fee={_id:F,colid:42,regno:'R1',academicyear:'2026-27',program:'Science',programcode:'P1',semester:'1',feeitem:'Tuition',feecategory:'General',amount:1000,paid:400,balance:600};
const q=data=>({select(){return this;},session(){return this;},lean:async()=>data});
function fixture(){
  const state={students:[{...student}],rules:[{...rule}],ledgers:[{...fee}],configurations:[{...fee,feeeitem:fee.feeitem,gender:'All'}],applications:[],admissions:[]},queries=[],writes=[];
  const session={withTransaction:async fn=>{const snapshot=JSON.parse(JSON.stringify(state));try{await fn();}catch(error){Object.assign(state,snapshot);throw error;}},endSession:async()=>{}};
  mongoose.startSession=async()=>session;Application.init=async()=>{};
  User.find=match=>{queries.push(match);return q(state.students.filter(row=>row.colid===match.colid&&row.role===match.role&&(!match._id||match._id.$in.includes(String(row._id)))&&(!match.regno||match.regno.$in.includes(row.regno))));};
  Scholarship.find=match=>q(state.rules.filter(row=>row.colid===match.colid&&match._id.$in.includes(String(row._id))&&row.active===match.active));
  Ledger.find=match=>{assert.equal(match.colid,42);return q(state.ledgers.filter(row=>row.colid===match.colid&&match.regno.$in.includes(row.regno)&&row.amount>0&&row.feecategory!=='Scholarship'));};
  Ledger.findOne=match=>q(state.ledgers.find(row=>String(row._id)===String(match._id)&&row.colid===match.colid&&row.regno===match.regno));
  Ledger.updateOne=async(match,update,options)=>{assert.equal(options.session,session);const row=state.ledgers.find(row=>String(row._id)===String(match._id));assert.equal(match.colid,42);assert.equal(match.regno,'R1');Object.assign(row,update.$set);writes.push(['source',match,update]);return {matchedCount:1};};
  Ledger.create=async(rows,options)=>{assert.equal(options.session,session);state.ledgers.push(...rows);writes.push(['credit',rows[0]]);return rows;};
  Application.find=match=>q(state.applications.filter(row=>row.colid===match.colid&&match.regno.$in.includes(row.regno)));
  Application.create=async(rows,options)=>{assert.equal(options.session,session);state.applications.push(...rows);writes.push(['audit',rows[0]]);return rows;};
  Ledger.bulkWrite=async(operations,options)=>{assert.equal(options.session,session);for(const operation of operations)await Ledger.updateOne(operation.updateOne.filter,operation.updateOne.update,options);return {matchedCount:operations.length};};
  Ledger.insertMany=Ledger.create;Application.insertMany=Application.create;
  Fees.find=match=>{assert.equal(match.colid,42);return q(state.configurations.filter(row=>row.colid===match.colid));};
  Fees.bulkWrite=async(operations,options)=>{assert.equal(options.session,session);for(const {updateOne:op} of operations){assert.equal(op.filter.colid,42);const row=state.configurations.find(row=>String(row._id)===String(op.filter._id));Object.assign(row,op.update.$set);}return {matchedCount:operations.length};};
  User.bulkWrite=async(operations,options)=>{assert.equal(options.session,session);for(const {updateOne:op} of operations){assert.equal(op.filter.colid,42);assert.equal(op.filter.role,'Student');}return {matchedCount:operations.length};};
  Admission.find=match=>q(state.admissions.filter(row=>row.colid===match.colid&&match.studentid.$in.includes(String(row.studentid))));
  const preview=()=>service.preview({colid:42,studentids:[U],scholarshipids:[S]});
  const apply=selections=>service.apply({colid:42,actor:'faculty@test.com',selections});
  return {state,queries,writes,preview,apply};
}
test('Total, Balance and Paid use the corresponding live fee values, with currency rounding',()=>{
  for(const [scholarshiptype,base,amount]of[['Total',1000,100],['Balance',600,60],['Paid',400,40]]){
    const result=service.calculate({...rule,scholarshiptype},fee);assert.equal(result.base,base);assert.equal(result.calculatedamount,amount);
  }
  assert.equal(service.calculate({...rule,scholarshiptype:'Paid'},{...fee,paid:0}).calculatedamount,0);
  assert.equal(service.calculate({...rule,scholarshiptype:'Balance'},{...fee,balance:0}).calculatedamount,0);
  assert.equal(service.calculate({...rule,type:'Amount',value:10000,scholarshiptype:'Paid'},fee).calculatedamount,400);
  assert.throws(()=>service.calculate({...rule,scholarshiptype:'Other'},fee),/Invalid scholarship type/);
});
test('Total uses fee configuration without an applied ledger item; Balance and Paid never fall back to configuration',async()=>{
  const f=fixture();f.state.ledgers=[];f.state.configurations[0].amount=30000;
  const data=await f.preview();assert.equal(data.rows.length,1);assert.equal(data.rows[0].sourcekind,'Fee configuration');assert.equal(data.rows[0].total,30000);assert.equal(data.rows[0].calculatedamount,3000);
  const result=await f.apply(data.rows);assert.equal(result.saved,1);assert.equal(f.state.ledgers[0].amount,-3000);assert.equal(f.state.applications[0].sourcekind,'Fee configuration');
  assert.equal((await f.preview()).rows[0].alreadyapplied,true);
  for(const type of ['Balance','Paid']){f.state.rules[0].scholarshiptype=type;assert.equal((await f.preview()).rows.length,0);}
});
test('configuration selection IDs and application deduplication remain student-specific',async()=>{
  const f=fixture(),other='888888888888888888888888';f.state.students.push({...student,_id:other,regno:'R2',email:'r2@test.com'});f.state.ledgers=[];
  const data=await service.preview({colid:42,studentids:[U,other],scholarshipids:[S]});
  assert.equal(new Set(data.rows.map(row=>row._id)).size,2);assert.ok(data.rows.every(row=>row.sourceconfigurationid===F));
  const result=await f.apply(data.rows);assert.equal(result.saved,2);assert.deepEqual(f.state.ledgers.map(row=>row.regno),['R1','R2']);
});
test('Total validates the configuration snapshot and refuses amounts based on stale configured fees',async()=>{
  const f=fixture(),data=await f.preview();f.state.configurations[0].amount=2000;
  await assert.rejects(()=>f.apply(data.rows),/changed/);assert.equal(f.state.applications.length,0);
  const fresh=await f.preview();Fees.bulkWrite=async()=>({matchedCount:0});
  await assert.rejects(()=>f.apply(fresh.rows),/configuration changed/);assert.equal(f.state.ledgers.length,1);
});
test('previous ledger awards are recognized after moving a Total rule to configuration source',async()=>{
  const f=fixture();f.state.applications.push({colid:42,regno:'R1',scholarshipid:S,sourceledgerid:F2,amount:100});
  f.state.ledgers[0]._id=F2;
  assert.equal((await f.preview()).rows[0].alreadyapplied,true);
});
test('configuration awards reduce later ledger-based Balance and cap mixed-source selections',async()=>{
  const f=fixture();f.state.ledgers[0]._id=F2;await f.apply((await f.preview()).rows);
  f.state.rules.push({...rule,_id:S2,scholarshiptype:'Balance'});
  const balance=await service.preview({colid:42,studentids:[U],scholarshipids:[S2]});assert.equal(balance.rows[0].base,500);
  const second=fixture();second.state.rules[0].value=100;second.state.rules.push({...rule,_id:S2,scholarshiptype:'Paid',value:100});
  const both=await service.preview({colid:42,studentids:[U],scholarshipids:[S,S2]});
  await assert.rejects(()=>second.apply(both.rows),/exceed/);
});
test('fee category and fee item from each scholarship rule constrain loading and final matching',async()=>{
  const f=fixture(),find=Ledger.find;
  Ledger.find=match=>{
    assert.deepEqual(match,{colid:42,regno:{$in:['R1']},amount:{$gt:0},feecategory:{$ne:'Scholarship'}});
    return find(match);
  };
  f.state.ledgers.push({...fee,_id:F2,feecategory:'Hostel'},{...fee,_id:'666666666666666666666666',feeitem:'Transport'});
  f.state.configurations.push({...f.state.configurations[0],_id:F2,feecategory:'Hostel'},{...f.state.configurations[0],_id:'666666666666666666666666',feeeitem:'Transport'});
  const preview=await f.preview();
  assert.equal(preview.rows.length,1);assert.equal(preview.rows[0].sourceledgerid,F);
  assert.equal(preview.rows[0].sourcefeecategory,'General');assert.equal(preview.rows[0].sourcefeeitem,'Tuition');
});
test('legacy generated ledger without program name appears in Step 3 and can receive scholarship',async()=>{
  const f=fixture();f.state.rules[0].scholarshiptype='Paid';delete f.state.ledgers[0].program;
  const rows=(await f.preview()).rows;assert.equal(rows.length,1);assert.equal(rows[0].program,'Science');
  const result=await f.apply(rows);assert.equal(result.saved,1);
  const credit=f.state.ledgers.find(row=>row.amount<0);assert.equal(credit.program,'Science');assert.equal(credit.amount,-40);
});
test('matching tolerates imported whitespace/case but does not accept another year, code, named program, category or item',async()=>{
  const f=fixture();Object.assign(f.state.ledgers[0],{program:' science ',programcode:' p1 ',academicyear:' 2026-27 ',semester:' 1 ',feeitem:' tuition ',feecategory:' general '});
  assert.equal((await f.preview()).rows.length,1);
  for(const changes of [{academicyear:'2027-28'},{programcode:'P2'},{program:'Arts'},{semester:'2'},{feecategory:'Hostel'},{feeitem:'Transport'}]){
    assert.equal(service.feeMatches(rule,student,{...fee,...changes}),false);
  }
});
test('no-match response explains required fee criteria or demographic eligibility',async()=>{
  const f=fixture();f.state.configurations[0].feeeitem='Transport';
  const result=await f.preview();assert.equal(result.rows.length,0);assert.match(result.unmatched[0].reason,/fee category General, fee item Tuition/);
  f.state.rules[0].gender='Male';
  assert.match((await f.preview()).unmatched[0].reason,/category, gender or merit/);
});
test('care-of is resolved within institution and reference/document are stored on scholarship credits',async()=>{
  const f=fixture();
  User.findOne=match=>{assert.deepEqual(match,{colid:42,email:'care@test.com'});return q({name:'Care User',email:'care@test.com'});};
  await service.apply({colid:42,actor:'faculty@test.com',selections:(await f.preview()).rows,details:{careofname:'Forged name',careofemail:'care@test.com',reference:'Approval 123',documentlink:'https://bucket.example/document.pdf'}});
  const credit=f.state.ledgers.find(row=>row.amount<0);
  assert.equal(credit.careofname,'Care User');assert.equal(credit.careofemail,'care@test.com');assert.equal(credit.reference,'Approval 123');assert.equal(credit.documentlink,'https://bucket.example/document.pdf');
  User.findOne=()=>q(null);
  await assert.rejects(()=>service.resolveDetails(42,{careofemail:'outside@test.com'}),/this institution/);
  await assert.rejects(()=>service.resolveDetails(42,{documentlink:'javascript:alert(1)'}),/valid document URL/);
});
test('ledger matching uses scholarship academic year/program/code rather than current student academic context',async()=>{
  const f=fixture();f.state.rules[0].scholarshiptype='Paid';
  Object.assign(f.state.students[0],{academicyear:'2027-28',program:'New program',programcode:'NEW',semester:'3'});
  f.state.ledgers.push({...fee,_id:F2,programcode:'OTHER',program:'Other program'});
  const preview=await f.preview();assert.equal(preview.rows.length,1);assert.equal(preview.rows[0].sourceledgerid,F);assert.equal(preview.rows[0].programcode,'P1');
  const result=await service.apply({colid:42,actor:'faculty@test.com',selections:preview.rows.map(row=>({...row,scholarshipamount:75.25}))});
  assert.equal(result.applied[0].calculatedamount,75.25);
  const credit=f.state.ledgers.find(row=>row.amount<0);assert.equal(credit.amount,-75.25);assert.equal(credit.program,'Science');assert.equal(credit.programcode,'P1');assert.equal(credit.academicyear,'2026-27');
  assert.equal(f.state.applications[0].ruleamount,40);assert.equal(f.state.applications[0].amount,75.25);
});
test('edited scholarship amount validates against live base and remaining amount',async()=>{
  for(const amount of ['',-1,0,NaN,Infinity,1001,'bad',{},0.001]){
    const f=fixture();const rows=(await f.preview()).rows;
    await assert.rejects(()=>service.apply({colid:42,actor:'faculty@test.com',selections:rows.map(row=>({...row,scholarshipamount:amount}))}),/Scholarship amount/);
    assert.equal(f.state.applications.length,0);
  }
  const f=fixture();f.state.rules[0].scholarshiptype='Paid';
  await assert.rejects(()=>service.apply({colid:42,actor:'faculty@test.com',selections:([])}),/matching fee items/);
  const rows=(await f.preview()).rows;
  await assert.rejects(()=>service.apply({colid:42,actor:'faculty@test.com',selections:rows.map(row=>({...row,scholarshipamount:401}))}),/eligible fee base/);
});
test('preview only matches the selected institution, semester, fee item and eligible demographic criteria',async()=>{
  const f=fixture();f.state.ledgers.push({...fee,_id:F2,semester:'2'},{...fee,_id:'666666666666666666666666',feeitem:'Transport'});
  const data=await f.preview();assert.equal(data.rows.length,1);assert.equal(data.rows[0].sourceledgerid,F);assert.equal(data.rows[0].calculatedamount,100);
  f.state.rules[0].gender='Male';assert.equal((await f.preview()).rows.length,0);
  await assert.rejects(()=>service.preview({colid:99,studentids:[U],scholarshipids:[S]}),/unavailable in this institution/);
});
test('multiple selected fee items create separate negative Scholarship entries and are idempotent across pages',async()=>{
  const f=fixture();f.state.ledgers.push({...fee,_id:F2,amount:2000,paid:500,balance:1500});
  f.state.rules[0].feeitem='';f.state.configurations.push({...f.state.configurations[0],_id:F2,amount:2000,feeeitem:'Other tuition'});
  const preview=await f.preview();const result=await f.apply(preview.rows.map(row=>({...row,calculatedamount:999999})));
  assert.equal(result.saved,2);assert.equal(f.state.applications.length,2);
  const credits=f.state.ledgers.filter(row=>row.amount<0);assert.deepEqual(credits.map(row=>row.amount),[-100,-200]);
  for(const row of credits){assert.equal(row.feecategory,'Scholarship');assert.equal(row.feeitem,'Merit award');assert.equal(row.colid,42);assert.equal(row.regno,'R1');assert.equal(row.balance,row.amount);assert.equal(row.duedate.getTime(),row.classdate.getTime());assert.equal(new Ledger(row).validateSync(),undefined);}
  assert.equal(f.state.ledgers[0].balance,600);assert.equal(f.state.ledgers[0].amount,1000);
  const repeat=await f.apply(preview.rows);assert.equal(repeat.saved,0);assert.equal(repeat.skipped,2);assert.equal(f.state.ledgers.filter(row=>row.amount<0).length,2);
});
test('Balance accounts for previous scholarship credits without modifying the original fee balance twice',async()=>{
  const f=fixture();await f.apply((await f.preview()).rows);
  f.state.rules.push({...rule,_id:S2,scholarship:'Additional award',scholarshiptype:'Balance'});
  const data=await service.preview({colid:42,studentids:[U],scholarshipids:[S2]});assert.equal(data.rows[0].balance,500);assert.equal(data.rows[0].base,500);assert.equal(data.rows[0].calculatedamount,50);
  assert.equal(f.state.ledgers[0].balance,600);
});
test('changed payments invalidate the preview and cannot create stale or forged credits',async()=>{
  const f=fixture();f.state.rules[0].scholarshiptype='Paid';const data=await f.preview();f.state.ledgers[0].paid=500;f.state.ledgers[0].balance=500;
  await assert.rejects(()=>f.apply(data.rows),/changed/);assert.equal(f.state.applications.length,0);assert.equal(f.state.ledgers.length,1);
  await assert.rejects(()=>f.apply([{...data.rows[0],sourceledgerid:F2}]),/no longer matches/);
});
test('duplicate student regnos and legacy rule applications are not applied again',async()=>{
  const f=fixture();f.state.students.push({...student,_id:'777777777777777777777777'});
  const blocked=await f.preview();assert.equal(blocked.rows.length,0);assert.match(blocked.unmatched[0].reason,/Duplicate regno/);
  f.state.students.pop();f.state.admissions.push({colid:42,studentid:U,scholarshipapplications:[{sourceid:S}]});
  const previous=await f.preview();assert.equal(previous.rows[0].alreadyapplied,true);assert.equal(previous.rows[0].selectable,false);
});
test('a failed ledger write rolls back the application record and source revision in the transaction',async()=>{
  const f=fixture(),data=await f.preview();Ledger.insertMany=async()=>{throw Error('simulated ledger failure');};
  await assert.rejects(()=>f.apply(data.rows),/simulated/);assert.equal(f.state.applications.length,0);assert.equal(f.state.ledgers.length,1);assert.equal(f.state.ledgers[0].scholarshiprevision,undefined);
});
test('selected scholarships cannot exceed the remaining fee amount on the same ledger item',async()=>{
  const f=fixture();f.state.rules[0].value=100;f.state.rules.push({...f.state.rules[0],_id:S2,scholarship:'Other full award'});
  const data=await service.preview({colid:42,studentids:[U],scholarshipids:[S,S2]});await assert.rejects(()=>f.apply(data.rows),/exceed/);assert.equal(f.state.applications.length,0);
});
test('failed source snapshot guards stop both audit and credit inserts',async()=>{
  const f=fixture();f.state.rules[0].scholarshiptype='Paid';const data=await f.preview();Ledger.bulkWrite=async()=>({matchedCount:0});
  await assert.rejects(()=>f.apply(data.rows),/Source ledger changed/);assert.equal(f.state.applications.length,0);assert.equal(f.state.ledgers.length,1);
  const unique=Application.schema.indexes().find(([keys,options])=>options.unique&&keys.colid&&keys.regno&&keys.scholarshipid&&keys.sourceledgerid);assert.ok(unique);
});
