const router = require('express').Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../Models/user');
const Fees = require('../Models/fees');
const Ledger = require('../Models/ledgerstud');
const Audit = require('../Models/adhocscholarshipds');

const text = value => String(value ?? '').trim();
const escape = value => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const money = value => Math.round((Number(value) || 0) * 100) / 100;
const fields = ['academicyear', 'program', 'programcode', 'regulation', 'semester', 'feegroup', 'feecategory', 'feeeitem', 'gender', 'studtype', 'domicile', 'feetype', 'status'];

const wrap = fn => async (req, res) => {
  try {
    const input = { ...req.query, ...req.body };
    const token = String(req.get?.('authorization') || input.token || '').replace(/^Bearer\s+/i, '');
    const identity = req.user?.email ? { user: req.user.email, colid: req.user.colid } : jwt.verify(token, process.env.JWT_SECRET);
    req.colid = Number(identity.colid);
    req.actor = text(identity.user || identity.email).toLowerCase();
    if (!(req.colid > 0) || !req.actor || !await User.exists({ colid: req.colid, email: req.actor, role: { $not: /^Student$/i } })) throw Error('Valid non-student login is required');
    await fn(req, res);
  } catch (error) {
    res.status(400).json({ message: /replica set|Transaction numbers/i.test(error.message) ? 'Ad-hoc scholarship updates require MongoDB replica-set transactions; no partial changes were saved.' : error.message });
  }
};

function feeQuery(colid, filters = []) {
  if (!Array.isArray(filters) || filters.length > 30) throw Error('Invalid fee filters');
  const query = { colid }, clauses = [];
  for (const filter of filters) {
    const field = text(filter.field);
    if (!fields.includes(field) || !Array.isArray(filter.values) || filter.values.length > 1000) throw Error('Invalid fee filter');
    const values = filter.values.map(text).filter(Boolean);
    if (values.length) clauses.push({ [field]: { $in: values } });
  }
  if (clauses.length) query.$and = clauses;
  return query;
}

function calculateAdjustment(ledger, requested) {
  const concession = money(requested), amount = money(ledger.amount), paid = money(ledger.paid), maximum = money(Math.max(0, amount - paid));
  if (!Number.isFinite(Number(requested)) || concession < 0 || concession > maximum) throw Error(`Concession for ${ledger.feeitem} must be between 0 and ${maximum.toFixed(2)}`);
  return { concession, amount, paid, maximum, balance: money(Math.max(0, amount - paid - concession)) };
}

function ledgerEntryFromFee(student, fee, actor) {
  const amount = money(fee.amount);
  return {
    name: actor,
    user: actor,
    feegroup: text(fee.feegroup) || 'NA',
    regno: student.regno,
    student: student.name,
    feeitem: text(fee.feeeitem) || 'NA',
    amount,
    paid: 0,
    concession: 0,
    balance: amount,
    Latefinedue: 0,
    Latefinepaid: 0,
    refundable: text(fee.refundable) || 'No',
    refundamount: money(fee.refundamount),
    refundedamount: 0,
    cash: 0,
    upi: 0,
    cheque: 0,
    card: 0,
    pg: 0,
    neft: 0,
    feebook: text(fee.feebook),
    cashbook: text(fee.cashbook),
    feecategory: text(fee.feecategory),
    feetype: text(fee.feetype),
    semester: text(fee.semester || student.semester),
    institution: text(student.institution),
    type: 'positive',
    comments: 'Fee created while applying ad-hoc scholarship',
    academicyear: text(fee.academicyear || student.academicyear || student.admissionyear),
    colid: student.colid,
    classdate: new Date(),
    duedate: fee.classdate || new Date(),
    status: 'Active',
    program: text(fee.program || student.program),
    programcode: text(fee.programcode || student.programcode),
    admissionyear: text(student.admissionyear || fee.academicyear),
    regulation: text(fee.regulation || student.regulation),
    major: text(fee.major || student.Major),
    minor: text(fee.minor || student.Minor),
    feeid: String(fee._id)
  };
}

router.get('/metadata', wrap(async (req, res) => res.json({ fields })));

router.post('/fees/options', wrap(async (req, res) => {
  const field = text(req.body.field);
  if (!fields.includes(field)) throw Error('Invalid fee option field');
  const search = text(req.body.search).slice(0, 200);
  const query = feeQuery(req.colid, (req.body.filters || []).filter(row => row.field !== field));
  if (field === 'program' || field === 'programcode') {
    const rows = await Fees.find(query).select('program programcode').sort({ program: 1 }).limit(250).lean();
    const data = [...new Map(rows.filter(row => row.program && row.programcode).map(row => [`${row.program}|${row.programcode}`, { label: `${row.program} (${row.programcode})`, value: row[field], programcode: row.programcode, program: row.program }])).values()]
      .filter(row => !search || row.label.toLowerCase().includes(search.toLowerCase()));
    return res.json({ data });
  }
  query[field] = { $nin: [null, ''] };
  if (search) query[field].$regex = new RegExp(escape(search), 'i');
  const values = (await Fees.aggregate([{ $match: query }, { $group: { _id: `$${field}` } }, { $sort: { _id: 1 } }, { $limit: 250 }])).map(row => text(row._id)).filter(Boolean);
  res.json({ data: values.map(value => ({ label: value, value })) });
}));

router.post('/fees/search', wrap(async (req, res) => {
  const student = await User.findOne({ _id: req.body.studentid, colid: req.colid, role: /^Student$/i }).select('name email regno academicyear admissionyear program programcode regulation semester').lean();
  if (!student) throw Error('Student not found');
  if (!student.regno) throw Error('The selected student has no registration number');
  const fees = await Fees.find(feeQuery(req.colid, req.body.filters || [])).sort({ semester: 1, feegroup: 1, feeeitem: 1 }).limit(2000).lean();
  const directIds = fees.map(row => String(row._id));
  const ledgers = await Ledger.find({ colid: req.colid, regno: student.regno, type: { $ne: 'negative' }, $or: [{ feeid: { $in: directIds } }, { academicyear: { $in: [...new Set(fees.map(row => row.academicyear))] } }] }).sort({ classdate: 1, _id: 1 }).lean();
  const direct = new Map();
  for (const ledger of ledgers) if (ledger.feeid) {
    const list = direct.get(String(ledger.feeid)) || [];
    list.push(ledger); direct.set(String(ledger.feeid), list);
  }
  const normalized = value => text(value).toLowerCase();
  const fallback = fee => ledgers.filter(row => !row.feeid && normalized(row.academicyear) === normalized(fee.academicyear) && normalized(row.programcode) === normalized(fee.programcode) && normalized(row.semester) === normalized(fee.semester) && normalized(row.feegroup) === normalized(fee.feegroup) && normalized(row.feecategory) === normalized(fee.feecategory) && normalized(row.feeitem) === normalized(fee.feeeitem));
  const rows = [];
  for (const fee of fees) {
    const matches = direct.get(String(fee._id)) || fallback(fee);
    if (!matches.length) rows.push({ _id: `fee:${fee._id}`, feeconfigurationid: fee._id, ledgerid: '', academicyear: fee.academicyear, program: fee.program, programcode: fee.programcode, regulation: fee.regulation, semester: fee.semester, feegroup: fee.feegroup, feecategory: fee.feecategory, feeitem: fee.feeeitem, amount: money(fee.amount), paid: 0, concession: 0, balance: money(fee.amount), duedate: fee.classdate, editable: true, statusdetail: 'New Student Ledger row will be created on submit' });
    for (const ledger of matches) rows.push({ _id: String(ledger._id), feeconfigurationid: fee._id, ledgerid: ledger._id, academicyear: ledger.academicyear || fee.academicyear, program: ledger.program || fee.program, programcode: ledger.programcode || fee.programcode, regulation: ledger.regulation || fee.regulation, semester: ledger.semester || fee.semester, feegroup: ledger.feegroup || fee.feegroup, feecategory: ledger.feecategory || fee.feecategory, feeitem: ledger.feeitem || fee.feeeitem, amount: money(ledger.amount), paid: money(ledger.paid), concession: money(ledger.concession), balance: money(ledger.balance), duedate: ledger.duedate || fee.classdate, editable: true, statusdetail: 'Student ledger row available' });
  }
  res.json({ student, data: rows, count: rows.length });
}));

router.post('/apply', wrap(async (req, res) => {
  const selections = Array.isArray(req.body.selections) ? req.body.selections : [];
  if (!selections.length || selections.length > 1000) throw Error('Select between 1 and 1,000 fee items');
  const details = req.body.details || {};
  const student = await User.findOne({ _id: req.body.studentid, colid: req.colid, role: /^Student$/i }).select('name regno colid institution academicyear admissionyear program programcode regulation semester Major Minor').lean();
  if (!student?.regno) throw Error('Student not found or registration number is missing');
  const ledgerIds = selections.map(row => row.ledgerid).filter(mongoose.isValidObjectId).map(String);
  const feeOnlySelections = selections.filter(row => !mongoose.isValidObjectId(row.ledgerid));
  const feeIds = feeOnlySelections.map(row => row.feeconfigurationid).filter(mongoose.isValidObjectId).map(String);
  if (ledgerIds.length + feeIds.length !== selections.length || new Set(ledgerIds).size !== ledgerIds.length || new Set(feeIds).size !== feeIds.length) throw Error('Select valid unique fee items');
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const ledgers = await Ledger.find({ _id: { $in: ledgerIds }, colid: req.colid, regno: student.regno, type: { $ne: 'negative' } }).session(session);
      if (ledgers.length !== ledgerIds.length) throw Error('One or more selected ledger fee items are unavailable. Reload the fee structure.');
      const fees = await Fees.find({ _id: { $in: feeIds }, colid: req.colid }).session(session);
      if (fees.length !== feeIds.length) throw Error('One or more selected Fee Configuration rows are unavailable. Reload the fee structure.');
      const byId = new Map(ledgers.map(row => [String(row._id), row]));
      const feesById = new Map(fees.map(row => [String(row._id), row]));
      const audits = [];
      for (const selection of selections) {
        let ledger = byId.get(String(selection.ledgerid));
        let created = false;
        if (!ledger) {
          const fee = feesById.get(String(selection.feeconfigurationid));
          const existing = await Ledger.findOne({ colid: req.colid, regno: student.regno, feeid: String(fee._id), type: { $ne: 'negative' } }).session(session);
          if (existing) throw Error(`The ledger row for ${fee.feeeitem} was created by another process. Reload the fee structure before applying the scholarship.`);
          ledger = new Ledger(ledgerEntryFromFee(student, fee, req.actor));
          created = true;
        }
        const { concession, amount, paid, balance } = calculateAdjustment(ledger, selection.concession);
        const oldconcession = money(ledger.concession), oldbalance = money(ledger.balance);
        const history = Array.isArray(ledger.approvalhistory) ? ledger.approvalhistory : [];
        history.push({ action: 'Ad-hoc Scholarship Concession', user: req.actor, date: new Date(), oldconcession, newconcession: concession, oldbalance, newbalance: balance, careofname: text(details.careofname), careofemail: text(details.careofemail), reference: text(details.reference), documentlink: text(details.documentlink) });
        ledger.concession = concession; ledger.balance = balance; ledger.status = concession > 0 ? 'Added' : ledger.status; ledger.approvalhistory = history;
        ledger.careofname = text(details.careofname); ledger.careofemail = text(details.careofemail); ledger.reference = text(details.reference); ledger.documentlink = text(details.documentlink);
        await ledger.save({ session });
        audits.push({ colid: req.colid, studentid: student._id, ledgerid: ledger._id, feeconfigurationid: mongoose.isValidObjectId(selection.feeconfigurationid) ? selection.feeconfigurationid : undefined, student: student.name, regno: student.regno, academicyear: ledger.academicyear, program: ledger.program, programcode: ledger.programcode, semester: ledger.semester, feegroup: ledger.feegroup, feecategory: ledger.feecategory, feeitem: ledger.feeitem, amount, paid, oldconcession, newconcession: concession, oldbalance, newbalance: balance, careofname: text(details.careofname), careofemail: text(details.careofemail), reference: text(details.reference), documentlink: text(details.documentlink), actor: req.actor, createdledger: created });
      }
      await Audit.insertMany(audits, { session });
      result = { updated: audits.length, created: audits.filter(row => row.createdledger).length, totalconcession: money(audits.reduce((sum, row) => sum + row.newconcession, 0)) };
    });
  } finally { await session.endSession(); }
  res.json(result);
}));

module.exports = router;
router._test = { feeQuery, calculateAdjustment, ledgerEntryFromFee, money };
