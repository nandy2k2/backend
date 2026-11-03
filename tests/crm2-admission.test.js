const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const file = path.join(__dirname, '../services/crm2Admission.js'), actual = require('node:module').createRequire(file);
const A = '111111111111111111111111', L = '222222222222222222222222', F = '333333333333333333333333', S = '444444444444444444444444', R = '555555555555555555555555';
const assignment = { _id: A, leadid: L, academicyear: '2026-27', program: 'Science', programcode: 'P1', counselloremail: 'one@test.com', active: 'Yes' };
const lead = { _id: L, name: 'One', email: 'student@test.com', phone: '123', gender: 'Female', category: 'SC', photo: 'https://image', fathername: 'Father', password: 'scrypt:secret', authenticatorsecret: 'secret' };
function fixture({ owned = true, duplicateEmail = false, existingRegno = false } = {}) {
  let record, student, serial = 0;
  const writes = [], ledgers = [], scholarshipApplications=[];
  const realScholarships=actual('../services/admissionScholarshipApply');
  const query = value => ({ session() { return this; }, select() { return this; }, lean: async () => value, then(resolve) { resolve(value); } });
  const fee = { _id: F, colid: 42, academicyear: '2026-27', program: 'Science', programcode: 'P1', feecategory: 'SC', gender: 'Female', amount: 10000, semester: '1', feegroup: 'Tuition', feeeitem: 'Tuition', classdate: new Date('2026-10-24') };
  const scholarship = { _id: S, colid: 42, scholarship: 'Merit', program: 'Science', programcode: 'P1', category: 'All', gender: 'All', active: 'Yes', type: 'Percentage', value: 10, merit: 'Yes', meritpercentage: 80 };
  const Admission = {
    init: async () => {},
    findOne: () => query(record || null),
    create: async ([row]) => { record = { _id: R, ...row, feeapplications: [], scholarshipapplications: [], feesdone: false, scholarshipsdone: false, save: async () => {} }; return [record]; }
  };
  const User = {
    schema: actual('../Models/user').schema,
    exists: q => query(q.email ? duplicateEmail : existingRegno || (q.regno === '42-2026-27-P1-1')),
    countDocuments: () => query(0),
    create: async ([row]) => { student = { _id: '666666666666666666666666', ...row }; writes.push({ model: 'User', row }); return [student]; },
    findOne: () => query(student)
  };
  const deps = {
    mongoose: { startSession: async () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) },
    '../Models/crm2programds': { Assignment: {
      findOne: q => query(owned && q.colid === 42 && q.counselloremail === 'one@test.com' ? assignment : null),
      updateMany: async (q, update) => writes.push({ model: 'AssignmentMany', q, update }),
      updateOne: async (q, update) => writes.push({ model: 'AssignmentOne', q, update })
    } },
    '../Models/crm2ds': { Lead: { findOne: () => query(lead), updateOne: async (q, update) => writes.push({ model: 'Lead', q, update }) } },
    '../Models/crm2admissionds': { Admission, Counter: { init: async () => {}, findOneAndUpdate: async () => {} } },
    '../Models/user': User,
    '../Models/mprograms': { findOne: match => query(match.colid===42&&['P1','P2'].includes(match.programcode)?{program:match.programcode==='P2'?'Arts':'Science',programcode:match.programcode,institution:'College',department:'Science'}:null) },
    '../Models/fees': { find: () => query([fee]) },
    '../Models/admissionscholarshipds': { find: () => query([scholarship]) },
    '../Models/ledgerstud': { create: async ([row]) => { const ledger = { _id: String(++serial).padStart(24, '0'), ...row }; ledgers.push(ledger); return [ledger]; } }
  };
  const scholarshipPreview=async()=>realScholarships.buildItems({students:student?[student]:[],scholarships:[scholarship],fees:ledgers.filter(row=>row.amount>0),configurations:[fee],applications:scholarshipApplications,admissions:record?[record]:[]});
  deps['./admissionScholarshipApply']={Application:{init:async()=>{}},preview:scholarshipPreview,applyInSession:async({selections,actor})=>{
    const preview=await scholarshipPreview(),applied=[];let skipped=0;
    for(const selected of selections){const row=preview.rows.find(item=>item.studentid===selected.studentid&&item.scholarshipid===selected.scholarshipid&&item.sourceledgerid===selected.sourceledgerid);if(row.alreadyapplied){skipped++;continue;}
      const [ledger]=await deps['../Models/ledgerstud'].create([realScholarships.ledgerPayload(student,row,actor,new Date())]);
      scholarshipApplications.push({regno:student.regno,scholarshipid:row.scholarshipid,sourceledgerid:row.sourceledgerid,amount:row.calculatedamount});applied.push({...row,ledgerid:ledger._id});
    }return {saved:applied.length,skipped,applied};
  }};
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, Date, require: name => deps[name] || actual(name) });
  return { ...module.exports, writes, ledgers, fee, scholarship, student: () => student };
}
const request = { colid: 42, actor: 'one@test.com', assignmentid: A, autoregnumber: true, semester: '1', section: 'A', meritpercentage: 85 };
test('admission generates unoccupied regno, copies demographics safely, marks primary admitted, and deactivates only other assignments', async () => {
  const f = fixture(), result = await f.admit(request);
  assert.equal(result.regno, '42-2026-27-P1-2');
  const student = f.student(); assert.equal(student.role, 'Student'); assert.equal(student.fathername, 'Father'); assert.equal(student.photo, 'https://image');
  assert.notEqual(student.password, lead.password); assert.equal(student.authenticatorsecret, undefined); assert.equal(student.colid, 42);
  assert.equal(new (actual('../Models/user'))(student).validateSync(), undefined);
  const other = f.writes.find(row => row.model === 'AssignmentMany'); assert.equal(other.q.colid, 42); assert.equal(other.q._id.$ne, A); assert.equal(other.update.$set.active, 'No');
  assert.equal(f.writes.find(row => row.model === 'Lead').update.$set.admitted, 'Yes');
  const again = await f.admit(request); assert.equal(again.resumed, true); assert.equal(f.writes.filter(row => row.model === 'User').length, 1);
});
test('unowned lead, existing email and duplicate manual regno cannot create student', async () => {
  await assert.rejects(() => fixture({ owned: false }).admit(request), /not assigned/);
  await assert.rejects(() => fixture({ duplicateEmail: true }).admit(request), /email already exists/);
  await assert.rejects(() => fixture({ existingRegno: true }).admit({ ...request, autoregnumber: false, regno: 'USED' }), /already exists/);
});
test('admission program defaults to applied program but can select a canonical program from same institution/year',async()=>{
  const f=fixture();const result=await f.admit({...request,programcode:'P2',program:'Forged name'});
  assert.equal(result.regno,'42-2026-27-P2-1');assert.equal(f.student().program,'Arts');assert.equal(f.student().programcode,'P2');
  await assert.rejects(()=>f.admit({...request,programcode:'P1'}),/saved program/);
  await assert.rejects(()=>fixture().admit({...request,programcode:'NOT-IN-MASTER'}),/not available/);
});
test('scholarships can explicitly be skipped without creating credits',async()=>{
  const f=fixture(),{admissionid}=await f.admit(request);
  await f.apply({colid:42,actor:request.actor,admissionid,kind:'fees',ids:[]});
  const result=await f.apply({colid:42,actor:request.actor,admissionid,kind:'scholarships',ids:[],skipscholarships:true});
  assert.equal(result.scholarshipsskipped,true);assert.equal(f.ledgers.length,0);
  const data=await f.choices(42,request.actor,admissionid,null);assert.equal(data.admission.scholarshipsdone,true);assert.equal(data.admission.scholarshipsskipped,true);
});
test('matches exact program/year and demographic All rules, including merit threshold', () => {
  const f = fixture(), student = { ...lead, ...assignment };
  assert.equal(f.feeMatches(f.fee, student), true);
  assert.equal(f.feeMatches({ ...f.fee, academicyear: '2025-26' }, student), false);
  assert.equal(f.feeMatches({ ...f.fee, gender: 'Male' }, student), false);
  assert.equal(f.scholarshipMatches(f.scholarship, student, 85), true);
  assert.equal(f.scholarshipMatches(f.scholarship, student, undefined), false);
  assert.equal(f.scholarshipMatches({ ...f.scholarship, academicyear: '2025-26' }, student, 85), false);
  assert.equal(f.educationPercentage({ education: [{ level: '12th', subjects: [{ obtained: 80, total: 100 }, { obtained: 90, total: 100 }] }] }), 85);
  assert.equal(f.educationPercentage({ education: [{ level: '12th', subjects: [{ obtained: 80 }] }] }), undefined);
});
test('fees and scholarship ledger applications are signed, scoped and idempotent', async () => {
  const f = fixture(); const { admissionid } = await f.admit(request);
  await assert.rejects(() => f.apply({ colid: 42, actor: request.actor, admissionid, kind: 'scholarships', ids: [S] }), /fee application first/);
  const apply = (kind, ids) => f.apply({ colid: 42, actor: request.actor, admissionid, kind, ids });
  assert.equal((await apply('fees', [F])).saved, 1); assert.equal((await apply('fees', [F])).saved, 0);
  const data = await f.choices(42, request.actor, admissionid, null); assert.equal(data.scholarshipbase, 10000); assert.equal(data.scholarships[0].calculatedamount, 1000);
  assert.equal((await apply('scholarships', [S])).saved, 1); assert.equal((await apply('scholarships', [S])).saved, 0);
  assert.equal(f.ledgers.length, 2); assert.equal(f.ledgers[0].amount, 10000); assert.equal(f.ledgers[1].amount, -1000); assert.equal(f.ledgers[1].balance, -1000);
  assert.equal(f.ledgers[1].feeitem, 'Merit'); assert.equal(f.ledgers[1].feecategory, 'Scholarship');
  assert.ok(f.ledgers.every(row => row.colid === 42 && row.regno === '42-2026-27-P1-2'));
  const Ledger = actual('../Models/ledgerstud'); assert.equal(new Ledger(f.ledgers[1]).validateSync(), undefined);
});
test('invalid IDs and out-of-scope selections are rejected; skipping steps still records completion', async () => {
  const f = fixture(), { admissionid } = await f.admit(request);
  await assert.rejects(() => f.apply({ colid: 42, actor: request.actor, admissionid, kind: 'fees', ids: [S] }), /no longer eligible/);
  await f.apply({ colid: 42, actor: request.actor, admissionid, kind: 'fees', ids: [] });
  await f.apply({ colid: 42, actor: request.actor, admissionid, kind: 'scholarships', ids: [] });
  const data = await f.choices(42, request.actor, admissionid, null); assert.equal(data.admission.scholarshipsdone, true); assert.equal(f.ledgers.length, 0);
});
test('semester fee-item scholarship uses only matching applied fee base and preserves fee-item ledger details',async()=>{
  const f=fixture();Object.assign(f.scholarship,{semester:'1',feeitem:'Tuition',feecategory:'SC',feeconfigurationid:F});
  assert.equal(f.scholarshipMatches({...f.scholarship,semester:'2'},{...lead,...assignment,semester:'1'},85),false);
  const {admissionid}=await f.admit(request);
  await f.apply({colid:42,actor:request.actor,admissionid,kind:'fees',ids:[F]});
  const data=await f.choices(42,request.actor,admissionid,null);assert.equal(data.scholarships[0].feebase,10000);assert.equal(data.scholarships[0].calculatedamount,1000);
  await f.apply({colid:42,actor:request.actor,admissionid,kind:'scholarships',ids:[S]});
  assert.equal(f.ledgers[1].semester,'1');assert.equal(f.ledgers[1].feeitem,'Merit');assert.equal(f.ledgers[1].feecategory,'Scholarship');assert.equal(f.ledgers[1].amount,-1000);assert.match(f.ledgers[1].comments,/Scholarship Merit/);
  assert.equal(data.scholarshipitems[0].sourcefeeitem,'Tuition');assert.equal(data.scholarshipitems[0].base,10000);
});
test('Confirm admission uses current Total, Balance and Paid ledger values and applies only chosen fee-item rows',async()=>{
  const f=fixture();Object.assign(f.scholarship,{semester:'1',feeitem:'Tuition',feecategory:'SC'});
  const {admissionid}=await f.admit(request);await f.apply({colid:42,actor:request.actor,admissionid,kind:'fees',ids:[F]});
  f.ledgers[0].paid=4000;f.ledgers[0].balance=6000;
  for(const [type,base,amount]of[['Total',10000,1000],['Balance',6000,600],['Paid',4000,400]]){
    f.scholarship.scholarshiptype=type;const data=await f.choices(42,request.actor,admissionid,null);assert.equal(data.scholarshipitems[0].base,base);assert.equal(data.scholarshipitems[0].calculatedamount,amount);
  }
  const data=await f.choices(42,request.actor,admissionid,null),selected=data.scholarshipitems[0];
  await f.apply({colid:42,actor:request.actor,admissionid,kind:'scholarships',ids:[selected._id],items:[selected]});assert.equal(f.ledgers[1].amount,-400);assert.equal(f.ledgers[1].feeitem,'Merit');assert.equal(f.ledgers[1].feecategory,'Scholarship');
  await assert.rejects(()=>f.apply({colid:42,actor:request.actor,admissionid,kind:'scholarships',items:[{...selected,studentid:'777777777777777777777777'}]}),/belong to this admitted student/);
});
