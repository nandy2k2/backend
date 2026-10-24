const mongoose = require('mongoose');
const User = require('../Models/user');
const Attendance = require('../Models/hrbiometricattendanceds');
const Leave = require('../Models/hrleaveapplicationds');
const WeeklyOff = require('../Models/hrleaveweeklyoffds');
const Holiday = require('../Models/hrleaveholidaylistds');
const Calendar = require('../Models/macadcal');
const CompensatoryRule = require('../Models/hrleavecompensatoryruleds');
const Salary = require('../Models/hrsalary');
const Structure = require('../Models/hrsalstructure');
const Ledger = require('../Models/employeeledgernewds');
const text = value => String(value ?? '').trim();
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function normalize(row) {
  const date = text(row.date), parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date) throw Error('Date must be a valid YYYY-MM-DD date');
  const raw = text(row.attendance).toLowerCase();
  if (!['0', '1', 'present', 'absent'].includes(raw)) throw Error('Attendance must be 1/Present or 0/Absent');
  if (!text(row.biometricid) || !text(row.academicyear)) throw Error('Biometric ID and academic year are required');
  for (const field of ['intime', 'outtime']) if (text(row[field]) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text(row[field]))) throw Error(`${field} must be HH:mm`);
  return { biometricid: text(row.biometricid), academicyear: text(row.academicyear), date, attendance: ['1', 'present'].includes(raw) ? 1 : 0,
    intime: text(row.intime), outtime: text(row.outtime), month: months[parsed.getUTCMonth()], year: parsed.getUTCFullYear() };
}
async function exemption(row, person, session) {
  const colid = row.colid, employeeemail = person.email;
  const leave = await Leave.findOne({ colid, employeeemail, status: /^Approved$/i, fromdate: { $lte: row.date }, todate: { $gte: row.date } }).session(session).lean();
  if (leave) {
    const comp = /compensatory|comp.?off/i.test(leave.leavetype || '');
    // Comp-off is exempt only when approved for this date, never just because an unused balance exists.
    const compRule = comp ? await CompensatoryRule.findOne({ colid, status: /^Active$/i, role: { $in: [person.role, 'All'] } }).session(session).lean() : null;
    return comp ? `Approved compensatory leave${compRule ? ' (active compensatory rule)' : ''}` : `Approved leave: ${leave.leavetype || 'Leave'}`;
  }
  const start = new Date(`${row.date}T00:00:00.000Z`), end = new Date(+start + 86400000);
  if (await Holiday.findOne({ colid, academicyear: row.academicyear, status: /^Active$/i, holidaydate: { $gte: start, $lt: end } }).session(session).lean()) return 'Holiday';
  if (await Calendar.findOne({ colid, type: /^Holiday$/i, activitydate: { $gte: start, $lt: end } }).session(session).lean()) return 'Academic calendar holiday';
  const weekly = await WeeklyOff.find({ colid, employeeemail, status: /^Active$/i }).session(session).lean();
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][start.getUTCDay()];
  if (weekly.some(rule => rule.type === 'dayofmonth' ? Number(rule.dayofmonth) === start.getUTCDate() : text(rule.dayofweek).toLowerCase() === day.toLowerCase())) return 'Weekly off';
  return '';
}
function dailySalary(rows) {
  const monthly = rows.filter(row => /^(credit|earning|earnings)$/i.test(text(row.type)) && Number(row.amount) > 0).reduce((sum, row) => sum + Number(row.amount), 0);
  if (!(monthly > 0)) throw Error('No positive earning salary components found. Configure employee salary first');
  return { monthlysalary: Math.round(monthly * 100) / 100, deduction: Math.round(monthly / 30 * 100) / 100 };
}
async function processRow(input, colid, actor, remove = false) {
  if (!Number.isFinite(Number(colid)) || Number(colid) <= 0) throw Error('College ID is required');
  // Finish building the unique user/day index before accepting uploads or opening a transaction.
  await Attendance.init();
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      let existing, row, person;
      if (remove) {
        existing = await Attendance.findOne({ colid: Number(colid), _id: input.id }).session(session);
        if (!existing) throw Error('Attendance not found');
        row = existing.toObject();
      } else {
        row = { ...normalize(input), colid: Number(colid) };
        const people = await User.find({ colid: row.colid, biometricid: row.biometricid, role: { $not: /^Student$/i } }).select('name email role department biometricid').limit(2).session(session).lean();
        if (people.length !== 1 || !people[0].email) throw Error(people.length > 1 ? 'Biometric ID matches multiple users; fix mapping first' : 'Biometric ID has no matching non-student user with email');
        person = people[0];
        existing = await Attendance.findOne({ colid: row.colid, userid: person._id, date: row.date }).session(session);
        if (input.id && (!existing || String(existing._id) !== String(input.id))) throw Error('Biometric ID and date cannot be changed while editing. Add a new record instead');
        if (existing && existing.academicyear !== row.academicyear) throw Error('This user/date already exists under another academic year');
      }
      const oldSalary = existing?.salaryid ? await Salary.findOne({ colid: row.colid, _id: existing.salaryid }).session(session).lean() : null;
      if (oldSalary && /paid/i.test(oldSalary.paystatus || '') && !/^unpaid$/i.test(oldSalary.paystatus)) throw Error('Deduction already paid/settled; use payroll adjustment before changing attendance');
      if (remove) {
        if (existing.salaryid) await Salary.deleteOne({ colid: row.colid, _id: existing.salaryid }).session(session);
        if (existing.ledgerid) await Ledger.deleteOne({ colid: row.colid, _id: existing.ledgerid }).session(session);
        await Attendance.deleteOne({ colid: row.colid, _id: existing._id }).session(session);
        result = { id: existing._id, deleted: true }; return;
      }
      row.userid = person._id; row.name = person.name; row.email = person.email; row.role = person.role;
      row.user = text(actor) || person.email;
      row.reason = row.attendance === 1 ? 'Present' : await exemption(row, person, session);
      row.deduction = 0; row.monthlysalary = 0;
      let base;
      if (!row.reason) {
        let earnings = await Salary.find({ colid: row.colid, empid: person.email, year: row.academicyear, month: row.month, type: /^(Credit|Earning|Earnings)$/i, amount: { $gt: 0 } }).session(session).lean();
        if (!earnings.length) earnings = await Structure.find({ colid: row.colid, empid: person.email, level: /^Active$/i, $or: [{ effectivedate: { $lte: new Date(`${row.date}T23:59:59Z`) } }, { effectivedate: null }] }).session(session).lean();
        Object.assign(row, dailySalary(earnings)); base = earnings[0]; row.reason = 'Unapproved absence: one day salary (monthly earnings / 30)';
      }
      const doc = existing || new Attendance();
      Object.assign(doc, row);
      if (row.deduction > 0) {
        const comments = `Biometric attendance ${doc._id}: ${row.date}; one day salary deduction`;
        const salaryid = existing?.salaryid || new mongoose.Types.ObjectId();
        const ledgerid = existing?.ledgerid || new mongoose.Types.ObjectId();
        await Salary.updateOne({ colid: row.colid, _id: salaryid }, { $set: {
          name: person.name, user: row.user, colid: row.colid, employee: person.name, empid: person.email,
          year: row.academicyear, month: row.month, duedate: new Date(`${row.date}T00:00:00Z`), structure: base?.structure, structureid: base?.structureid,
          component: 'Attendance salary deduction', amount: -row.deduction, type: 'Deduction', level: 'Active', paystatus: 'Due', status1: 'Submitted', comments
        } }, { upsert: true, session, runValidators: true });
        await Ledger.updateOne({ colid: row.colid, _id: ledgerid }, { $set: {
          colid: row.colid, employee: person.name, employeeemail: person.email, empid: person.email, role: person.role, department: person.department,
          month: row.month, year: row.academicyear, paymentdate: new Date(`${row.date}T00:00:00Z`), paymenttype: 'Deduction',
          item: 'Attendance salary deduction', amount: -row.deduction, referencenumber: String(doc._id), description: comments,
          status1: 'Due', user: row.user, comments
        } }, { upsert: true, session, runValidators: true });
        doc.salaryid = salaryid; doc.ledgerid = ledgerid;
      } else {
        if (existing?.salaryid) await Salary.deleteOne({ colid: row.colid, _id: existing.salaryid }).session(session);
        if (existing?.ledgerid) await Ledger.deleteOne({ colid: row.colid, _id: existing.ledgerid }).session(session);
        doc.salaryid = undefined; doc.ledgerid = undefined;
      }
      await doc.save({ session }); result = doc.toObject();
    });
    return result;
  } finally { await session.endSession(); }
}
module.exports = { normalize, exemption, dailySalary, processRow };
