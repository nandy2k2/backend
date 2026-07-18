const User = require('../Models/user');
const HrSalary = require('../Models/hrsalary');
const Institution = require('../Models/insdetails');
const EmployeeLedger = require('../Models/employeeledgernewds');
const OrganizationHierarchy = require('../Models/organizationhierarchyds');
const ExpenseWorkflow = require('../Models/hrexpenseworkflowds');
const ExpenseRule = require('../Models/hrexpenseruleds');
const ExpenseSubmission = require('../Models/hrexpensesubmissionds');

const text = (v) => String(v || '').trim();
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const esc = (v) => text(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rx = (v) => ({ $regex: esc(v), $options: 'i' });
const datePart = (d) => new Date(d || Date.now()).toISOString().slice(0, 10);

const salaryFields = ['name', 'user', 'year', 'month', 'duedate', 'structure', 'structureid', 'employee', 'empid', 'component', 'amount', 'type', 'level', 'paystatus', 'status1', 'comments'];
const ledgerFields = ['employee', 'empid', 'employeeemail', 'department', 'role', 'month', 'year', 'paymentdate', 'paymentmode', 'paymenttype', 'referencenumber', 'item', 'description', 'amount', 'status1', 'comments'];

async function users(colid, query = {}) {
  const filter = { colid: Number(colid), role: { $not: /^Student$/i } };
  if (query.department) filter.department = rx(query.department);
  if (query.search) {
    const s = rx(query.search);
    filter.$or = [{ name: s }, { email: s }, { user: s }, { phone: s }, { department: s }];
  }
  return User.find(filter).select('name email user role department phone empid status').sort({ name: 1 }).lean();
}

function withDateRange(filter, field, q) {
  if (q.fromdate || q.todate) {
    filter[field] = {};
    if (q.fromdate) filter[field].$gte = new Date(q.fromdate);
    if (q.todate) {
      const d = new Date(q.todate);
      d.setHours(23, 59, 59, 999);
      filter[field].$lte = d;
    }
  }
}

function summarize(rows, amountField = 'amount') {
  const total = rows.reduce((s, r) => s + num(r[amountField]), 0);
  const by = (field) => Object.values(rows.reduce((a, r) => {
    const k = text(r[field]) || 'NA';
    a[k] = a[k] || { name: k, amount: 0, count: 0 };
    a[k].amount += num(r[amountField]);
    a[k].count += 1;
    return a;
  }, {}));
  return { total, count: rows.length, byMonth: by('month'), byType: by('type'), byDepartment: by('department'), byStatus: by('status') };
}

async function nextExpenseStatus(colid, currentlevel) {
  const next = await ExpenseWorkflow.findOne({ colid: Number(colid), status: 'Active', level: { $gt: Number(currentlevel || 0) } }).sort({ level: 1 }).lean();
  return next ? { status: 'Pending Approval', currentlevel: next.level } : { status: 'Approved', currentlevel: Number(currentlevel || 0) };
}

async function postExpenseToSalary(submission) {
  if (submission.salaryposted === 'Yes') return;
  const approvedItems = (submission.items || []).filter((item) => text(item.itemstatus || submission.status) === 'Approved');
  const docs = approvedItems.map((item) => ({
    name: submission.employee || 'HR Expense',
    user: submission.employeeemail,
    colid: submission.colid,
    year: item.year || String(new Date().getFullYear()),
    month: item.month || new Date().toLocaleString('en-US', { month: 'long' }),
    duedate: item.expensedate ? new Date(item.expensedate) : new Date(),
    structure: 'HR Expense',
    structureid: String(submission._id),
    employee: submission.employee,
    empid: submission.employeeemail,
    component: item.expensetype || 'HR Expense',
    amount: num(item.approvedamount || item.amount),
    type: 'Earning',
    level: 'Active',
    paystatus: 'Pending',
    status1: 'Added',
    comments: item.remarks || item.description || ''
  }));
  if (docs.length) await HrSalary.insertMany(docs);
}

exports.getInstitution = async (req, res) => {
  try {
    const data = await Institution.findOne({ colid: Number(req.query.colid) }).lean();
    res.json({ success: true, data: data || null });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getUsers = async (req, res) => {
  try { res.json({ success: true, data: await users(req.query.colid, req.query) }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getSalaryRegister = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    salaryFields.forEach((f) => {
      if (req.query.mine === 'Yes' && ['empid', 'user'].includes(f)) return;
      if (req.query[f]) filter[f] = rx(req.query[f]);
    });
    if (req.query.mine === 'Yes' && req.query.employeeid) {
      const me = esc(req.query.employeeid);
      filter.$or = [{ empid: { $regex: me, $options: 'i' } }, { user: { $regex: me, $options: 'i' } }];
    }
    withDateRange(filter, 'duedate', req.query);
    const data = await HrSalary.find(filter).sort({ year: -1, month: -1, employee: 1 }).lean();
    res.json({ success: true, data, summary: summarize(data) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getSalaryOptions = async (req, res) => {
  try {
    const base = { colid: Number(req.query.colid) };
    const options = {};
    for (const f of salaryFields) options[f] = (await HrSalary.distinct(f, base)).filter(Boolean).sort();
    res.json({ success: true, data: options });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.saveLedger = async (req, res) => {
  try {
    const payload = { ...req.body, colid: Number(req.body.colid), amount: num(req.body.amount) };
    const data = req.body.id ? await EmployeeLedger.findByIdAndUpdate(req.body.id, payload, { new: true }) : await EmployeeLedger.create(payload);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.bulkLedger = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((r) => ({ ...r, colid: Number(req.body.colid || r.colid), amount: num(r.amount), user: req.body.user || r.user || '' }));
    const data = docs.length ? await EmployeeLedger.insertMany(docs) : [];
    res.json({ success: true, data, count: data.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteLedger = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const data = await EmployeeLedger.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, deletedCount: data.deletedCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.saveHierarchy = async (req, res) => {
  try {
    const payload = { ...req.body, colid: Number(req.body.colid) };
    const data = req.body.id ? await OrganizationHierarchy.findByIdAndUpdate(req.body.id, payload, { new: true }) : await OrganizationHierarchy.create(payload);
    res.json({ success: true, data });
  } catch (err) { res.status(err.code === 11000 ? 400 : 500).json({ success: false, message: err.code === 11000 ? 'This employee-manager mapping already exists' : err.message }); }
};

exports.getHierarchy = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    ['department', 'employeename', 'employeeemail', 'managername', 'manageremail', 'status'].forEach((f) => { if (req.query[f]) filter[f] = rx(req.query[f]); });
    const data = await OrganizationHierarchy.find(filter).sort({ department: 1, managername: 1, employeename: 1 }).lean();
    res.json({ success: true, data, users: await users(req.query.colid) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.bulkHierarchy = async (req, res) => {
  try {
    const rows = (Array.isArray(req.body.rows) ? req.body.rows : []).map((r) => ({ ...r, colid: Number(req.body.colid || r.colid), user: req.body.user || r.user || '' }));
    const data = rows.length ? await OrganizationHierarchy.insertMany(rows, { ordered: false }) : [];
    res.json({ success: true, count: data.length, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteHierarchy = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const data = await OrganizationHierarchy.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, deletedCount: data.deletedCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.saveExpenseWorkflow = async (req, res) => {
  try {
    const payload = { ...req.body, colid: Number(req.body.colid), level: Number(req.body.level || 1) };
    const data = req.body.id ? await ExpenseWorkflow.findByIdAndUpdate(req.body.id, payload, { new: true }) : await ExpenseWorkflow.create(payload);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getExpenseWorkflow = async (req, res) => {
  try { res.json({ success: true, data: await ExpenseWorkflow.find({ colid: Number(req.query.colid) }).sort({ level: 1 }).lean(), users: await users(req.query.colid) }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteExpenseWorkflow = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const data = await ExpenseWorkflow.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, deletedCount: data.deletedCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.saveExpenseRule = async (req, res) => {
  try {
    const payload = { ...req.body, colid: Number(req.body.colid) };
    const data = req.body.id ? await ExpenseRule.findByIdAndUpdate(req.body.id, payload, { new: true }) : await ExpenseRule.create(payload);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getExpenseRules = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.role) filter.role = rx(req.query.role);
    const data = await ExpenseRule.find(filter).sort({ role: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteExpenseRule = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const data = await ExpenseRule.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, deletedCount: data.deletedCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.submitExpense = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items.map((item) => ({ ...item, amount: num(item.amount), approvedamount: 0, itemstatus: 'Pending' })) : [];
    if (!items.length) return res.status(400).json({ success: false, message: 'Add at least one expense item' });
    const first = await ExpenseWorkflow.findOne({ colid: Number(req.body.colid), status: 'Active' }).sort({ level: 1 }).lean();
    const rule = await ExpenseRule.findOne({ colid: Number(req.body.colid), role: req.body.role, status: 'Active' }).lean();
    const hasMandatory = Boolean(text(rule?.mandatorycriteria));
    const payload = {
      ...req.body,
      colid: Number(req.body.colid),
      items,
      totalamount: items.reduce((s, i) => s + num(i.amount), 0),
      status: hasMandatory ? 'Pending Approval' : (first ? 'Pending Approval' : 'Approved'),
      currentlevel: first?.level || 0,
      validationstatus: rule ? 'Pass' : 'Skipped',
      validationcomments: rule ? `Validation rule captured for role ${req.body.role}. Mandatory: ${rule.mandatorycriteria || 'NA'} Optional: ${rule.optionalcriteria || 'NA'}` : 'No active validation rule specified for this role.'
    };
    const data = await ExpenseSubmission.create(payload);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getExpenses = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    ['employee', 'employeeemail', 'department', 'role', 'status', 'validationstatus'].forEach((f) => { if (req.query[f]) filter[f] = rx(req.query[f]); });
    if (req.query.mine === 'Yes' && req.query.employeeemail) filter.employeeemail = rx(req.query.employeeemail);
    withDateRange(filter, 'submissiondate', req.query);
    const data = await ExpenseSubmission.find(filter).sort({ createdAt: -1 }).lean();
    const flat = data.flatMap((s) => (s.items || []).map((item, index) => ({ ...item, submissionid: String(s._id), rowid: `${s._id}-${index}`, employee: s.employee, employeeemail: s.employeeemail, department: s.department, role: s.role, status: s.status, submissiondate: s.submissiondate, validationstatus: s.validationstatus })));
    res.json({ success: true, data, flat, summary: { ...summarize(flat), approved: flat.reduce((s, r) => s + num(r.approvedamount), 0) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.actionExpense = async (req, res) => {
  try {
    const submission = await ExpenseSubmission.findById(req.body.id);
    if (!submission) return res.status(404).json({ success: false, message: 'Expense submission not found' });
    const itemIndexes = Array.isArray(req.body.itemIndexes) ? req.body.itemIndexes.map(Number) : submission.items.map((_, i) => i);
    submission.items = submission.items.map((item, index) => {
      if (!itemIndexes.includes(index)) return item;
      const approved = req.body.approvedamounts && req.body.approvedamounts[index] !== undefined ? num(req.body.approvedamounts[index]) : num(item.amount);
      return { ...item, itemstatus: req.body.action === 'Reject' ? 'Rejected' : 'Approved', approvedamount: req.body.action === 'Reject' ? 0 : approved, approverremarks: req.body.comments || '' };
    });
    submission.approvalhistory.push({ action: req.body.action, level: submission.currentlevel, user: req.body.user, name: req.body.name, comments: req.body.comments, date: new Date() });
    if (req.body.action === 'Reject') submission.status = 'Rejected';
    else Object.assign(submission, await nextExpenseStatus(submission.colid, submission.currentlevel));
    submission.approvedamount = submission.items.reduce((s, i) => s + num(i.approvedamount), 0);
    if (submission.status === 'Approved' && submission.salaryposted !== 'Yes') {
      await postExpenseToSalary(submission);
      submission.salaryposted = 'Yes';
    }
    await submission.save();
    res.json({ success: true, data: submission });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
