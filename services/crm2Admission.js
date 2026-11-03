const mongoose = require('mongoose');
const crypto = require('node:crypto');
const { Assignment } = require('../Models/crm2programds');
const { Lead } = require('../Models/crm2ds');
const { Admission, Counter } = require('../Models/crm2admissionds');
const User = require('../Models/user');
const Program = require('../Models/mprograms');
const Fees = require('../Models/fees');
const Scholarship = require('../Models/admissionscholarshipds');
const Ledger = require('../Models/ledgerstud');
const scholarshipService = require('./admissionScholarshipApply');
const { educationPercentage, scholarshipMatches } = require('../utils/admissionScholarshipRules');
const text = value => String(value ?? '').trim();
const money = value => Math.round(Number(value) * 100) / 100;
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const identifier = value => /^[a-f\d]{24}$/i.test(text(value));
async function context(colid, actor, assignmentid, session) {
  if (!identifier(assignmentid)) throw Error('Select a programwise lead');
  const assignment = await Assignment.findOne({ colid, _id: assignmentid, counselloremail: text(actor).toLowerCase() }).session(session).lean();
  if (!assignment) throw Error('Programwise lead is not assigned to you');
  const lead = await Lead.findOne({ colid, _id: assignment.leadid }).session(session).lean();
  if (!lead) throw Error('Lead not found');
  return { assignment, lead };
}
function studentPayload(lead, assignment, program, input, colid, actor) {
  const result = {};
  const blocked = new Set(['_id', '__v', 'colid', 'user', 'addedby', 'password', 'role', 'regno', 'authenticator', 'authenticatorsecret', 'authenticatordate', 'authenticatorsetupdate', 'excluded', 'status', 'lastlogin', 'biometricid', 'notification', 'expopushtoken']);
  User.schema.eachPath(field => { if (!blocked.has(field) && !field.includes('.') && lead[field] !== undefined) result[field] = lead[field]; });
  const safeLead = Object.fromEntries(Object.entries(lead).filter(([field]) => !blocked.has(field) && !['emailkey', 'phonekey'].includes(field)));
  // Preserve CRM-only education, documents, and assignment history without adding CRM fields to the User schema.
  result.customFields = { ...(lead.customFields || {}), crm2Admission: { leadid: String(lead._id), assignmentid: String(assignment._id), lead: safeLead, assignment } };
  return { ...result, colid, role: 'Student', regno: input.regno, name: lead.name, email: lead.email, phone: lead.phone,
    password: input.password || crypto.randomBytes(12).toString('base64url'), academicyear: assignment.academicyear, admissionyear: assignment.academicyear,
    program: assignment.program, programcode: assignment.programcode, regulation: text(input.regulation) || text(program.regulation) || 'NA',
    semester: text(input.semester) || '1', section: text(input.section) || 'A', institution: program.institution || '',
    department: program.department || 'NA', status: 1, user: actor, addedby: actor, authenticator: 'No', excluded: 'No',
    lastlogin: new Date(Date.now() + 365 * 86400000) };
}
const commonMatch = (row, student) => row.academicyear === student.academicyear && row.programcode === student.programcode && row.program === student.program;
const accepts = (rule, value) => !text(rule) || /^all$/i.test(text(rule)) || text(rule).toLowerCase() === text(value).toLowerCase();
function feeMatches(row, student) { return commonMatch(row, student) && (!student.semester || !text(row.semester) || row.semester === student.semester) && accepts(row.gender, student.gender) && accepts(row.feecategory, student.category); }
async function transact(fn) {
  await Admission.init(); await Counter.init();
  const session = await mongoose.startSession(); let result;
  try { await session.withTransaction(async () => { result = await fn(session); }); return result; }
  finally { await session.endSession(); }
}
async function admit({ colid, actor, assignmentid, ...input }) {
  return transact(async session => {
    const { assignment, lead } = await context(colid, actor, assignmentid, session);
    const previous = await Admission.findOne({ colid, leadid: lead._id }).session(session).lean();
    if (previous) {
      if (String(previous.assignmentid) !== String(assignmentid)) throw Error('This lead is already admitted to another program');
      if(text(input.programcode)&&text(input.programcode)!==previous.programcode)throw Error('Admission already exists. Resume using its saved program; program cannot be changed after admission');
      return { admissionid: previous._id, regno: previous.regno, resumed: true };
    }
    if (assignment.active === 'No' || lead.active === 'No') throw Error('This lead is inactive');
    if (!text(assignment.academicyear)) throw Error('Program assignment must have academic year');
    const selectedCode=text(input.programcode)||assignment.programcode;
    const program = await Program.findOne({ colid, year: assignment.academicyear, programcode: selectedCode }).session(session).lean();
    if (!program) throw Error('Selected program is not available in program master for this academic year');
    const admissionProgram={...assignment,program:program.program || assignment.program,programcode:program.programcode || selectedCode};
    if (await User.exists({ email: exact(lead.email) }).session(session)) throw Error('A user with this email already exists; resolve it before admission');
    // Serializes admissions within the institution, including manual registration-number checks.
    await Counter.findOneAndUpdate({ colid }, { $inc: { value: 1 } }, { upsert: true, session });
    let regno = text(input.regno);
    if (input.autoregnumber === true) {
      const prefix = `${colid}-${assignment.academicyear}-${admissionProgram.programcode}-`;
      let serial = await User.countDocuments({ colid, role: 'Student', academicyear: assignment.academicyear, programcode: admissionProgram.programcode }).session(session) + 1;
      do { regno = `${prefix}${serial++}`; } while (await User.exists({ colid, regno }).session(session));
    }
    if (!regno || regno.length > 200) throw Error('Enter a valid registration number or choose automatic generation');
    if (await User.exists({ colid, regno }).session(session)) throw Error('Registration number already exists');
    const meritpercentage = input.meritpercentage === '' || input.meritpercentage == null ? educationPercentage(lead) : Number(input.meritpercentage);
    if (meritpercentage !== undefined && (!Number.isFinite(meritpercentage) || meritpercentage < 0 || meritpercentage > 100)) throw Error('Merit percentage must be between 0 and 100');
    const payload = studentPayload(lead, admissionProgram, program, { ...input, regno }, colid, actor);
    const [student] = await User.create([payload], { session });
    const [record] = await Admission.create([{ colid, assignmentid, leadid: lead._id, studentid: student._id, regno, academicyear: assignment.academicyear, program: admissionProgram.program, programcode: admissionProgram.programcode, meritpercentage, createdby: actor }], { session });
    await Assignment.updateMany({ colid, leadid: lead._id, _id: { $ne: assignment._id } }, { $set: { active: 'No', updatedby: actor } }, { session });
    await Assignment.updateOne({ colid, _id: assignment._id }, { $set: { admitted: 'Yes', active: 'Yes', updatedby: actor } }, { session });
    await Lead.updateOne({ colid, _id: lead._id }, { $set: { admitted: 'Yes', admissionstatus: 'Admitted', updatedby: actor } }, { session });
    return { admissionid: record._id, regno, temporarypassword: input.password ? undefined : payload.password };
  });
}
async function admittedContext(colid, actor, admissionid, session) {
  if (!identifier(admissionid)) throw Error('Select an admission');
  const admission = await Admission.findOne({ colid, _id: admissionid }).session(session);
  if (!admission) throw Error('Admission not found');
  await context(colid, actor, admission.assignmentid, session);
  const student = await User.findOne({ colid, _id: admission.studentid, role: 'Student' }).select('-password -authenticatorsecret').session(session).lean();
  if (!student) throw Error('Student not found');
  return { admission, student };
}
async function choices(colid, actor, admissionid, session) {
  const { admission, student } = await admittedContext(colid, actor, admissionid, session);
  const fees = (await Fees.find({ colid, academicyear: student.academicyear, programcode: student.programcode, program: student.program }).session(session).lean()).filter(row => feeMatches(row, student));
  const base = money((admission.feeapplications || []).reduce((sum, row) => sum + Math.max(0, row.amount), 0));
  const rules = (await Scholarship.find({ colid, programcode: student.programcode, active: 'Yes' }).session(session).lean()).filter(row => scholarshipMatches({...row,semester:''}, student, admission.meritpercentage));
  const preview = rules.length ? await scholarshipService.preview({colid,studentids:[String(student._id)],scholarshipids:rules.map(row=>String(row._id)),session}) : {rows:[],unmatched:[]};
  const scholarships=rules.map(row=>({...row,scholarshiptype:row.scholarshiptype || 'Total',feebase:money(preview.rows.filter(item=>item.scholarshipid===String(row._id)).reduce((sum,item)=>sum+item.base,0)),calculatedamount:money(preview.rows.filter(item=>item.scholarshipid===String(row._id)&&!item.alreadyapplied).reduce((sum,item)=>sum+item.calculatedamount,0))}));
  return { admission, student, fees, scholarships, scholarshipitems:preview.rows, scholarshipunmatched:preview.unmatched, scholarshipbase: base };
}
function ledgerSeed(student, actor) {
  return { colid: student.colid, name: student.name, student: student.name, user: actor, regno: student.regno, academicyear: student.academicyear, admissionyear: student.admissionyear,
    program: student.program, programcode: student.programcode, regulation: student.regulation, semester: student.semester, institution: student.institution,
    classdate: new Date(), duedate: new Date(), paid: 0, concession: 0, status: 'Due' };
}
async function apply({ colid, actor, admissionid, kind, ids = [], items, details, skipscholarships=false }) {
  if (!['fees', 'scholarships'].includes(kind) || !Array.isArray(ids) || ids.length > 1000 || !ids.every(value=>identifier(value)||(kind==='scholarships'&&[2,3].includes(String(value).split(':').length)&&String(value).split(':').every(identifier)))) throw Error('Select valid fee/scholarship rows');
  if (kind === 'scholarships') await scholarshipService.Application.init();
  return transact(async session => {
    const data = await choices(colid, actor, admissionid, session), { admission, student } = data;
    if (kind === 'fees' && admission.scholarshipsdone) throw Error('Fees are locked after applying scholarships');
    if (kind === 'scholarships' && !admission.feesdone) throw Error('Complete fee application first');
    if (kind === 'scholarships') {
      if(skipscholarships===true){
        if(ids.length || (Array.isArray(items)&&items.length))throw Error('Do not select scholarships when skipping this step');
        admission.scholarshipsdone=true;admission.scholarshipsskipped=true;await admission.save({session});
        return {saved:0,skipped:0,applied:[],scholarshipsskipped:true};
      }
      let selections;
      if(items!==undefined){if(!Array.isArray(items)||items.some(item=>item.studentid!==String(student._id)))throw Error('Scholarship items must belong to this admitted student');selections=items;}
      else selections=[...new Map(ids.flatMap(id=>data.scholarshipitems.filter(row=>row._id===id||row.scholarshipid===id)).map(row=>[row._id,row])).values()];
      if(items===undefined&&ids.some(id=>!data.scholarshipitems.some(row=>row._id===id||row.scholarshipid===id)))throw Error('Some selected rows are no longer eligible. Reload matches');
      const result=selections.length?await scholarshipService.applyInSession({colid,actor,selections,session,source:'Confirm admission',details}):{saved:0,skipped:0,applied:[]};
      for(const row of result.applied)admission.scholarshipapplications.push({sourceid:row._id,ledgerid:row.ledgerid,amount:-row.calculatedamount});
      admission.scholarshipsdone=true;await admission.save({session});return result;
    }
    const selected = [...new Set(ids)].map(id => data.fees.find(row => String(row._id) === id));
    if (selected.some(row => !row)) throw Error('Some selected rows are no longer eligible. Reload matches');
    let saved = 0;
    for (const row of selected) {
      if (admission.feeapplications.some(item => item.sourceid === String(row._id))) continue;
      const amount = money(row.amount);
      if (!Number.isFinite(amount)) throw Error('Invalid configured amount');
      const payload = { ...ledgerSeed(student, actor), amount, balance: amount, type: amount < 0 ? 'negative' : 'positive',
        feegroup: row.feegroup, feeitem: row.feeeitem,
        feecategory: row.feecategory, feeid: String(row._id), comments: `CRM2 admission ${admission._id}: fees`,
        semester: row.semester || student.semester, feebook: row.feebook, cashbook: row.cashbook, feetype: row.feetype, refundable: row.refundable, refundamount: row.refundamount, duedate: row.classdate || new Date() };
      const [ledger] = await Ledger.create([payload], { session });
      admission.feeapplications.push({ sourceid: String(row._id), ledgerid: ledger._id, amount }); saved++;
    }
    admission.feesdone = true;
    await admission.save({ session }); return { saved };
  });
}
module.exports = { admit, apply, choices, admittedContext, studentPayload, feeMatches, scholarshipMatches, money, educationPercentage };
