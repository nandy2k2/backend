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
const text = value => String(value ?? '').trim();
const money = value => Math.round(Number(value) * 100) / 100;
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const identifier = value => /^[a-f\d]{24}$/i.test(text(value));
function educationPercentage(lead) {
  const education = lead.education || [];
  const record = education.find(row => /^12(th)?$/i.test(text(row.level))) || education[0];
  const subjects = record?.subjects || [];
  if (!subjects.length || subjects.some(row => row.obtained == null || row.obtained === '' || !Number.isFinite(Number(row.obtained)) || Number(row.obtained) < 0 || !(Number(row.total) > 0) || Number(row.obtained) > Number(row.total))) return undefined;
  return money(subjects.reduce((sum, row) => sum + Number(row.obtained), 0) / subjects.reduce((sum, row) => sum + Number(row.total), 0) * 100);
}
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
function feeMatches(row, student) { return commonMatch(row, student) && accepts(row.gender, student.gender) && accepts(row.feecategory, student.category); }
function scholarshipMatches(row, student, percentage) {
  return (!text(row.academicyear) || row.academicyear === student.academicyear) && row.programcode === student.programcode && row.program === student.program && row.active === 'Yes' && accepts(row.gender, student.gender) && accepts(row.category, student.category) && (row.merit !== 'Yes' || (Number.isFinite(percentage) && percentage >= Number(row.meritpercentage)));
}
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
      return { admissionid: previous._id, regno: previous.regno, resumed: true };
    }
    if (assignment.active === 'No' || lead.active === 'No') throw Error('This lead is inactive');
    if (!text(assignment.academicyear)) throw Error('Program assignment must have academic year');
    const program = await Program.findOne({ colid, year: assignment.academicyear, programcode: assignment.programcode }).session(session).lean();
    if (!program) throw Error('Assigned program is no longer available in program master');
    if (await User.exists({ email: exact(lead.email) }).session(session)) throw Error('A user with this email already exists; resolve it before admission');
    // Serializes admissions within the institution, including manual registration-number checks.
    await Counter.findOneAndUpdate({ colid }, { $inc: { value: 1 } }, { upsert: true, session });
    let regno = text(input.regno);
    if (input.autoregnumber === true) {
      const prefix = `${colid}-${assignment.academicyear}-${assignment.programcode}-`;
      let serial = await User.countDocuments({ colid, role: 'Student', academicyear: assignment.academicyear, programcode: assignment.programcode }).session(session) + 1;
      do { regno = `${prefix}${serial++}`; } while (await User.exists({ colid, regno }).session(session));
    }
    if (!regno || regno.length > 200) throw Error('Enter a valid registration number or choose automatic generation');
    if (await User.exists({ colid, regno }).session(session)) throw Error('Registration number already exists');
    const meritpercentage = input.meritpercentage === '' || input.meritpercentage == null ? educationPercentage(lead) : Number(input.meritpercentage);
    if (meritpercentage !== undefined && (!Number.isFinite(meritpercentage) || meritpercentage < 0 || meritpercentage > 100)) throw Error('Merit percentage must be between 0 and 100');
    const payload = studentPayload(lead, assignment, program, { ...input, regno }, colid, actor);
    const [student] = await User.create([payload], { session });
    const [record] = await Admission.create([{ colid, assignmentid, leadid: lead._id, studentid: student._id, regno, academicyear: assignment.academicyear, program: assignment.program, programcode: assignment.programcode, meritpercentage, createdby: actor }], { session });
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
  const scholarships = (await Scholarship.find({ colid, programcode: student.programcode, active: 'Yes' }).session(session).lean()).filter(row => scholarshipMatches(row, student, admission.meritpercentage)).map(row => ({ ...row, calculatedamount: money(row.type === 'Percentage' ? base * Number(row.value) / 100 : Number(row.value)) }));
  return { admission, student, fees, scholarships, scholarshipbase: base };
}
function ledgerSeed(student, actor) {
  return { colid: student.colid, name: student.name, student: student.name, user: actor, regno: student.regno, academicyear: student.academicyear, admissionyear: student.admissionyear,
    program: student.program, programcode: student.programcode, regulation: student.regulation, semester: student.semester, institution: student.institution,
    classdate: new Date(), duedate: new Date(), paid: 0, concession: 0, status: 'Due' };
}
async function apply({ colid, actor, admissionid, kind, ids }) {
  if (!['fees', 'scholarships'].includes(kind) || !Array.isArray(ids) || ids.length > 500 || !ids.every(identifier)) throw Error('Select valid fee/scholarship rows');
  return transact(async session => {
    const data = await choices(colid, actor, admissionid, session), { admission, student } = data;
    if (kind === 'fees' && admission.scholarshipsdone) throw Error('Fees are locked after applying scholarships');
    if (kind === 'scholarships' && !admission.feesdone) throw Error('Complete fee application first');
    const selected = [...new Set(ids)].map(id => data[kind].find(row => String(row._id) === id));
    if (selected.some(row => !row)) throw Error('Some selected rows are no longer eligible. Reload matches');
    const applicationField = kind === 'fees' ? 'feeapplications' : 'scholarshipapplications';
    let saved = 0;
    for (const row of selected) {
      if (admission[applicationField].some(item => item.sourceid === String(row._id))) continue;
      const amount = kind === 'fees' ? money(row.amount) : -Math.abs(row.calculatedamount);
      if (!Number.isFinite(amount)) throw Error('Invalid configured amount');
      const payload = { ...ledgerSeed(student, actor), amount, balance: amount, type: amount < 0 ? 'negative' : 'positive',
        feegroup: kind === 'fees' ? row.feegroup : 'Scholarship', feeitem: kind === 'fees' ? row.feeeitem : row.scholarship,
        feecategory: kind === 'fees' ? row.feecategory : 'Scholarship', feeid: String(row._id), comments: `CRM2 admission ${admission._id}: ${kind}` };
      if (kind === 'scholarships') payload.type = 'negative';
      if (kind === 'fees') Object.assign(payload, { semester: row.semester || student.semester, feebook: row.feebook, cashbook: row.cashbook, feetype: row.feetype, refundable: row.refundable, refundamount: row.refundamount, duedate: row.classdate || new Date() });
      const [ledger] = await Ledger.create([payload], { session });
      admission[applicationField].push({ sourceid: String(row._id), ledgerid: ledger._id, amount }); saved++;
    }
    admission[kind === 'fees' ? 'feesdone' : 'scholarshipsdone'] = true;
    await admission.save({ session }); return { saved };
  });
}
module.exports = { admit, apply, choices, admittedContext, studentPayload, feeMatches, scholarshipMatches, money, educationPercentage };
