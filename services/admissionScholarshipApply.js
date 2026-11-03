const mongoose=require('mongoose');
const crypto=require('node:crypto');
const User=require('../Models/user');
const Ledger=require('../Models/ledgerstud');
const Fees=require('../Models/fees');
const Scholarship=require('../Models/admissionscholarshipds');
const Application=require('../Models/admissionscholarshipapplicationds');
const {Admission}=require('../Models/crm2admissionds');
const {money,educationPercentage,scholarshipMatches}=require('../utils/admissionScholarshipRules');
const id=value=>/^[a-f\d]{24}$/i.test(String(value || ''));
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const normalized=value=>String(value ?? '').trim().toLowerCase();
const same=(left,right)=>normalized(left)===normalized(right);
function calculate(rule,fee,credited=0) {
  if([fee.amount,fee.paid,fee.balance,fee.concession,credited].some(value=>value!=null&&!Number.isFinite(Number(value)*100)))throw Error('Invalid source fee or payment amount');
  const total=money(Math.max(0,number(fee.amount))),paid=money(Math.max(0,number(fee.paid)));
  const balance=money(Math.max(0,(fee.balance==null?total-paid-number(fee.concession):number(fee.balance))-credited));
  const scholarshiptype=rule.scholarshiptype || 'Total';
  if(!['Total','Balance','Paid'].includes(scholarshiptype))throw Error('Invalid scholarship type');
  if(!['Amount','Percentage'].includes(rule.type)||!Number.isFinite(Number(rule.value))||Number(rule.value)<0||(rule.type==='Percentage'&&Number(rule.value)>100))throw Error('Invalid scholarship value');
  const base={Total:total,Balance:balance,Paid:paid}[scholarshiptype],remaining=money(Math.max(0,total-credited));
  const amount=money(Math.min(base,remaining,rule.type==='Percentage'?base*Number(rule.value)/100:Number(rule.value)));
  return {total,paid,balance,base,remaining,scholarshiptype,calculatedamount:amount};
}
function feeMatches(rule,student,fee) {
  return fee.regno===student.regno && Number(fee.colid)===Number(student.colid) && number(fee.amount)>0 && normalized(fee.feecategory)!=='scholarship' && same(fee.academicyear,rule.academicyear || student.academicyear) && same(fee.programcode,rule.programcode || student.programcode) && (!normalized(rule.program) || !normalized(fee.program) || same(fee.program,rule.program)) && (!normalized(rule.semester)||same(fee.semester,rule.semester)) && (!normalized(rule.feeitem)||same(fee.feeitem,rule.feeitem)) && (!normalized(rule.feecategory)||same(fee.feecategory,rule.feecategory));
}
const fingerprint=(rule,fee,credited)=>crypto.createHash('sha256').update(JSON.stringify([String(rule._id),rule.academicyear,rule.program,rule.programcode,rule.value,rule.type,rule.scholarshiptype || 'Total',rule.semester,rule.feeitem,rule.feecategory,rule.category,rule.gender,rule.active,rule.merit,rule.meritpercentage,String(fee._id),fee.academicyear,fee.program,fee.programcode,fee.amount,fee.paid,fee.balance,fee.concession,number(fee.scholarshiprevision),credited])).digest('hex');
const feeGroup=(fee,regno)=>JSON.stringify([regno,fee.academicyear,fee.programcode,fee.semester,fee.feecategory,fee.feeitem ?? fee.feeeitem].map(normalized));
function applicationMatches(application,fee,regno,fees,configurations){
  if(application.regno!==regno)return false;
  if(String(application.sourceledgerid)===String(fee._id))return true;
  const origin=(application.sourcekind==='Fee configuration'?configurations:fees).find(row=>String(row._id)===String(application.sourceledgerid));
  if(origin)return feeGroup(origin,regno)===feeGroup(fee,regno);
  return same(application.academicyear,fee.academicyear)&&same(application.programcode,fee.programcode)&&same(application.semester,fee.semester)&&same(application.sourcefeeitem,fee.feeitem ?? fee.feeeitem)&&(!application.sourcefeecategory||same(application.sourcefeecategory,fee.feecategory));
}
function buildItems({students,scholarships,fees,configurations=[],applications=[],admissions=[]}) {
  const rows=[],unmatched=[];
  const feesByRegno=new Map(),admissionsByStudent=new Map(admissions.map(row=>[String(row.studentid),row]));
  for(const fee of fees){if(!feesByRegno.has(fee.regno))feesByRegno.set(fee.regno,[]);feesByRegno.get(fee.regno).push(fee);}
  const regnoCounts=new Map();for(const student of students)regnoCounts.set(student.regno,(regnoCounts.get(student.regno)||0)+1);
  for(const student of students) {
    if(!student.regno || regnoCounts.get(student.regno)>1){unmatched.push({studentid:String(student._id),student:student.name,reason:'Missing or duplicate regno. Repair the student record before applying.'});continue;}
    const admission=admissionsByStudent.get(String(student._id));
    const percentage=admission?.meritpercentage ?? educationPercentage(student.customFields?.crm2Admission?.lead || student);
    let count=0;const reasons=[];
    for(const rule of scholarships) {
      const fromConfiguration=(rule.scholarshiptype || 'Total')==='Total';
      if(fromConfiguration&&(!same(rule.programcode,student.programcode)||!same(rule.program,student.program)||(normalized(rule.academicyear)&&!same(rule.academicyear,student.academicyear)))){
        reasons.push(`${rule.scholarship}: student's academic year/program does not match this configuration-based scholarship`);continue;
      }
      // Student identity is colid/regno; the scholarship defines the ledger academic context.
      if(!scholarshipMatches({...rule,academicyear:'',semester:'',program:student.program,programcode:student.programcode},student,percentage)){
        reasons.push(`${rule.scholarship}: student does not meet category, gender or merit criteria`);continue;
      }
      const legacy=(admission?.scholarshipapplications || []).some(row=>row.sourceid===String(rule._id));
      const candidates=fromConfiguration?configurations.filter(item=>!item.gender||same(item.gender,'All')||same(item.gender,student.gender)).map(item=>({...item,regno:student.regno,feeitem:item.feeeitem,paid:0,balance:0})):feesByRegno.get(student.regno)||[];
      let matching=candidates.filter(item=>feeMatches(rule,student,item));
      if(fromConfiguration){
        // Gender-specific configurations may repeat a logical fee; award it only once per student.
        matching.sort((a,b)=>Number(String(b._id)===String(rule.feeconfigurationid))-Number(String(a._id)===String(rule.feeconfigurationid))||Number(same(b.gender,student.gender))-Number(same(a.gender,student.gender)));
        const uniqueFees=new Map();for(const item of matching){const key=feeGroup(item,student.regno);if(!uniqueFees.has(key))uniqueFees.set(key,item);}matching=[...uniqueFees.values()];
      }
      const sourcekind=fromConfiguration?'Fee configuration':'Student ledger';
      if(!matching.length)reasons.push(`${rule.scholarship}: no positive ${sourcekind.toLowerCase()} fee matches academic year ${rule.academicyear || student.academicyear}, program ${rule.program || student.program} (${rule.programcode || student.programcode}), semester ${rule.semester || 'All'}, fee category ${rule.feecategory || 'All'}, fee item ${rule.feeitem || 'All'}`);
      for(const fee of matching) {
        const previous=applications.filter(application=>applicationMatches(application,fee,student.regno,fees,configurations));
        const already=legacy || previous.some(application=>String(application.scholarshipid)===String(rule._id));
        const credited=money(previous.reduce((sum,application)=>sum+number(application.amount),0));
        const calculation=calculate(rule,fee,credited),key=fromConfiguration?`${student._id}:${rule._id}:${fee._id}`:`${rule._id}:${fee._id}`;
        rows.push({_id:key,studentid:String(student._id),scholarshipid:String(rule._id),sourceledgerid:String(fee._id),student:student.name,regno:student.regno,email:student.email,academicyear:fee.academicyear,program:fee.program || rule.program,programcode:fee.programcode,semester:fee.semester,sourcefeeitem:fee.feeitem,sourcefeecategory:fee.feecategory,scholarship:rule.scholarship,type:rule.type,value:rule.value,...calculation,fingerprint:fingerprint(rule,fee,credited),alreadyapplied:!!already,selectable:!already&&calculation.calculatedamount>0,reason:already?'Already applied':calculation.calculatedamount<=0?'No eligible amount for this scholarship type':''});
        Object.assign(rows[rows.length-1],{sourcekind,...(fromConfiguration?{sourceconfigurationid:String(fee._id)}:{})});
        count++;if(rows.length>5000)throw Error('More than 5,000 matching items. Narrow the student or scholarship selection.');
      }
    }
    if(!count)unmatched.push({studentid:String(student._id),student:student.name,regno:student.regno,reason:reasons.slice(0,5).join('; ') || 'No eligible scholarship and matching semester/fee-item ledger entry.'});
  }
  return {rows,unmatched};
}
async function loadContext({colid,studentids,scholarshipids,session=null}) {
  if(!Array.isArray(studentids)||!studentids.length||studentids.length>200||!studentids.every(id)||!Array.isArray(scholarshipids)||!scholarshipids.length||scholarshipids.length>100||!scholarshipids.every(id))throw Error('Select 1-200 students and 1-100 scholarships');
  const students=await User.find({colid,role:'Student',_id:{$in:[...new Set(studentids)]}}).select('-password -authenticatorsecret').session(session).lean();
  const scholarships=await Scholarship.find({colid,active:'Yes',_id:{$in:[...new Set(scholarshipids)]}}).session(session).lean();
  if(students.length!==new Set(studentids).size||scholarships.length!==new Set(scholarshipids).size)throw Error('A selected student or active scholarship is unavailable in this institution. Reload selections.');
  const regnos=[...new Set(students.map(row=>row.regno).filter(Boolean))];
  const duplicates=await User.find({colid,role:'Student',regno:{$in:regnos}}).select('_id regno').session(session).lean();
  const duplicated=new Set(regnos.filter(regno=>duplicates.filter(row=>row.regno===regno).length>1));
  // Legacy fee generators omit program names; match each rule after the colid/regno lookup.
  const fees=await Ledger.find({colid,regno:{$in:regnos},amount:{$gt:0},feecategory:{$ne:'Scholarship'}}).session(session).lean();
  const totalRules=scholarships.filter(rule=>(rule.scholarshiptype || 'Total')==='Total');
  const configurations=totalRules.length?await Fees.find({colid,amount:{$gt:0},$or:totalRules.map(rule=>({academicyear:rule.academicyear || {$in:students.map(row=>row.academicyear)},programcode:rule.programcode || {$in:students.map(row=>row.programcode)}}))}).session(session).lean():[];
  const applications=await Application.find({colid,regno:{$in:regnos}}).session(session).lean();
  const admissions=await Admission.find({colid,studentid:{$in:studentids}}).session(session).lean();
  return {students:students.filter(row=>!duplicated.has(row.regno)),scholarships,fees,configurations,applications,admissions,duplicates:students.filter(row=>duplicated.has(row.regno))};
}
async function preview(input) {
  const context=await loadContext(input),result=buildItems(context);
  for(const row of context.duplicates)result.unmatched.push({studentid:String(row._id),student:row.name,regno:row.regno,reason:'Duplicate regno in User. Repair before applying scholarships.'});
  return result;
}
function ledgerPayload(student,row,actor,now) {
  const amount=-Math.abs(row.calculatedamount);
  return {colid:student.colid,name:student.name,student:student.name,user:actor,regno:student.regno,academicyear:row.academicyear,admissionyear:student.admissionyear,program:student.program,programcode:student.programcode,regulation:student.regulation,semester:row.semester,institution:student.institution,feegroup:'Scholarship',feecategory:'Scholarship',feeitem:row.scholarship,feeid:row.scholarshipid,amount,balance:amount,paid:0,concession:0,type:'negative',status:'Due',classdate:now,duedate:now,comments:`Scholarship ${row.scholarship} (${row.scholarshiptype}), against ${row.sourcefeeitem} (${row.sourcefeecategory}), source ledger ${row.sourceledgerid}, base ${row.base}`};
}
async function resolveDetails(colid,details={},session) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) throw Error('Invalid scholarship details');
  const result={careofname:'',careofemail:'',reference:String(details.reference || '').trim(),documentlink:String(details.documentlink || '').trim()};
  if(result.reference.length>2000 || result.documentlink.length>4000)throw Error('Scholarship reference or document link is too long');
  if(result.documentlink && !/^https?:\/\//i.test(result.documentlink))throw Error('Enter a valid document URL');
  if(details.careofemail){
    let query=User.findOne({colid,email:String(details.careofemail).trim()}).select('name email');
    if(session)query=query.session(session);
    const user=await query.lean();
    if(!user)throw Error('Select care-of user from this institution');
    result.careofname=user.name;result.careofemail=user.email;
  }
  return result;
}
async function applyInSession({colid,actor,selections,session,source='Apply scholarship',details}) {
  if(!Array.isArray(selections)||!selections.length||selections.length>1000||selections.some(row=>![row.studentid,row.scholarshipid,row.sourceledgerid].every(id)))throw Error('Select 1-1000 matching fee items');
  const unique=[...new Map(selections.map(row=>[`${row.studentid}:${row.scholarshipid}:${row.sourceledgerid}`,row])).values()];
  const ledgerDetails=await resolveDetails(colid,details,session);
  const context=await loadContext({colid,studentids:[...new Set(unique.map(row=>row.studentid))],scholarshipids:[...new Set(unique.map(row=>row.scholarshipid))],session}),data=buildItems(context);
  const plan=[],skipped=[];
  for(const selection of unique) {
    const row=data.rows.find(item=>item.scholarshipid===selection.scholarshipid && item.sourceledgerid===selection.sourceledgerid && item.studentid===selection.studentid);
    if(!row)throw Error('Selected fee item no longer matches scholarship eligibility. Reload preview.');
    if(row.alreadyapplied){skipped.push(row._id);continue;}
    if(!row.selectable)throw Error('A selected fee item has no eligible scholarship amount. Reload preview.');
    if(selection.fingerprint && selection.fingerprint!==row.fingerprint)throw Error('Fees, payments or scholarship rules changed. Reload preview before applying.');
    if(selection.scholarshipamount!==undefined){
      const raw=selection.scholarshipamount,amount=Number(raw);
      if(!['string','number'].includes(typeof raw)||String(raw).trim()===''||!Number.isFinite(amount)||amount<=0||amount>money(Math.min(row.base,row.remaining)))throw Error('Scholarship amount must be greater than zero and cannot exceed the eligible fee base or remaining amount');
      row.ruleamount=row.calculatedamount;row.calculatedamount=money(amount);
      if(row.calculatedamount<=0)throw Error('Scholarship amount must be at least 0.01');
    }
    plan.push(row);
  }
  const group=row=>feeGroup({...row,feecategory:row.sourcefeecategory,feeitem:row.sourcefeeitem},row.regno);
  const totals=new Map();for(const row of plan)totals.set(group(row),(totals.get(group(row))||0)+row.calculatedamount);
  if(plan.some(row=>money(totals.get(group(row)))>row.remaining))throw Error('Selected scholarships exceed the remaining fee amount on an item. Select fewer scholarships.');
  const locked=new Set(),applied=[],guards=[],configurationGuards=[],audit=[],credits=[],now=new Date();
  for(const row of plan) {
    const fromConfiguration=row.sourcekind==='Fee configuration',lockKey=`${row.sourcekind}:${row.sourceledgerid}`;
    if(!locked.has(lockKey)) {
      const sourceLedger=(fromConfiguration?context.configurations:context.fees).find(fee=>String(fee._id)===row.sourceledgerid&&(fromConfiguration||fee.regno===row.regno));
      if(!sourceLedger)throw Error('Source ledger no longer exists');
      const guard={_id:sourceLedger._id,colid,amount:sourceLedger.amount,...(fromConfiguration?{}:{regno:row.regno,paid:sourceLedger.paid??null,balance:sourceLedger.balance??null}),scholarshiprevision:sourceLedger.scholarshiprevision??{$in:[null,0]}};
      (fromConfiguration?configurationGuards:guards).push({updateOne:{filter:guard,update:{$set:{scholarshiprevision:number(sourceLedger.scholarshiprevision)+1}}}});
      locked.add(lockKey);
    }
    const student=context.students.find(item=>String(item._id)===row.studentid);if(!student)throw Error('Student no longer exists');
    const creditid=new mongoose.Types.ObjectId();
    audit.push({colid,studentid:student._id,regno:row.regno,scholarshipid:row.scholarshipid,sourceledgerid:row.sourceledgerid,ledgerid:creditid,scholarship:row.scholarship,scholarshiptype:row.scholarshiptype,semester:row.semester,academicyear:row.academicyear,programcode:row.programcode,sourcefeeitem:row.sourcefeeitem,base:row.base,amount:row.calculatedamount,user:actor,source});
    audit[audit.length-1].ruleamount=row.ruleamount ?? row.calculatedamount;
    Object.assign(audit[audit.length-1],{sourcekind:row.sourcekind,sourceconfigurationid:row.sourceconfigurationid,sourcefeecategory:row.sourcefeecategory});
    credits.push({_id:creditid,...ledgerPayload(student,row,actor,now),program:row.program,programcode:row.programcode,...ledgerDetails});
    applied.push({...row,ledgerid:String(creditid)});
  }
  if(plan.length){
    // Serialize awards per student even when concurrent requests use different source collections.
    const studentLocks=[...new Set(plan.map(row=>row.studentid))].map(studentid=>({updateOne:{filter:{_id:studentid,colid,role:'Student'},update:{$inc:{scholarshipapplicationrevision:1}}}}));
    const lockedStudents=await User.bulkWrite(studentLocks,{session,ordered:true});
    if(lockedStudents.matchedCount!==studentLocks.length)throw Error('Student changed. Reload preview.');
    // Guard source snapshots, then create audit records and credits in the same transaction.
    if(guards.length){const guarded=await Ledger.bulkWrite(guards,{session,ordered:true});if(guarded.matchedCount!==guards.length)throw Error('Source ledger changed. Reload preview.');}
    if(configurationGuards.length){const guarded=await Fees.bulkWrite(configurationGuards,{session,ordered:true});if(guarded.matchedCount!==configurationGuards.length)throw Error('Fee configuration changed. Reload preview.');}
    await Application.insertMany(audit,{session,ordered:true});
    await Ledger.insertMany(credits,{session,ordered:true});
  }
  return {saved:applied.length,skipped:skipped.length,applied};
}
async function apply(input) {
  await Application.init();const session=await mongoose.startSession();let result;
  try{await session.withTransaction(async()=>{result=await applyInSession({...input,session});});return result;}finally{await session.endSession();}
}
module.exports={calculate,feeMatches,buildItems,preview,apply,applyInSession,ledgerPayload,Application,resolveDetails};
