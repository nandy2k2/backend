const HrSalary = require('../Models/hrsalary');
const User = require('../Models/user');
const Institution = require('../Models/insdetails');
const Workflow = require('../Models/salarypaymentworkflowds');
const SalarySheet = require('../Models/salarypaymentsheetds');
const Voucher = require('../Models/salarypaymentvoucherds');
const EmployeeLedger = require('../Models/employeeledgernewds');
const { createApprovalTasks, completeApprovalTasks } = require('../utils/approvalTaskHelper');

const text = (v) => String(v || '').trim();
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

async function salaryRows(colid, month, year) {
  const rows = await HrSalary.aggregate([
    { $match: { colid: Number(colid), month, year } },
    { $group: { _id: { empid: '$empid', employee: '$employee' }, total: { $sum: '$amount' } } },
    { $project: { _id: 0, empid: '$_id.empid', employee: '$_id.employee', total: 1 } },
    { $sort: { employee: 1 } }
  ]);
  const empids = rows.map((r) => text(r.empid)).filter(Boolean);
  const users = await User.find({ colid: Number(colid), $or: [{ email: { $in: empids } }, { user: { $in: empids } }, { empid: { $in: empids } }] })
    .select('name email user empid department role')
    .lean();
  return rows.map((row) => {
    const u = users.find((item) => [item.email, item.user, item.empid].map(text).includes(text(row.empid))) || {};
    return {
      ...row,
      employee: row.employee || u.name,
      employeeemail: u.email || u.user || row.empid,
      department: u.department || '',
      role: u.role || ''
    };
  });
}

async function nextStatus(colid, workflowtype, currentlevel) {
  const next = await Workflow.findOne({ colid: Number(colid), workflowtype, status: 'Active', level: { $gt: Number(currentlevel || 0) } }).sort({ level: 1 }).lean();
  return next ? { status: 'Pending Approval', currentlevel: next.level } : { status: 'Approved', currentlevel: Number(currentlevel || 1) };
}

async function addSalaryApprovalTask(record, level, workflowtype, pagelink) {
  const workflow = level && await Workflow.findOne({ colid: record.colid, workflowtype, status: 'Active', level: Number(level) }).lean();
  if (!workflow) return [];
  return createApprovalTasks({
    colid: record.colid,
    user: record.submittedby || record.createdby,
    createdby: record.submittedname || record.createdname || record.submittedby || record.createdby,
    academicyear: record.year,
    approvername: workflow.approvername,
    approveremail: workflow.approveremail,
    approverrole: workflow.approverrole,
    title: `Approve ${workflowtype} for ${record.month} ${record.year}`,
    category: `${workflowtype} approval`,
    pagelink,
    comments: `${workflowtype} is pending approval at level ${workflow.level}.`,
    referenceModel: workflowtype === 'SalarySheet' ? 'salarypaymentsheetds' : 'salarypaymentvoucherds',
    referenceId: record._id,
    level: workflow.level
  });
}

async function finishSalaryApprovalTask(record, actor, workflowtype) {
  return completeApprovalTasks({
    colid: record.colid,
    approveremail: text(actor.user || actor.approveremail),
    category: `${workflowtype} approval`,
    referenceModel: workflowtype === 'SalarySheet' ? 'salarypaymentsheetds' : 'salarypaymentvoucherds',
    referenceId: record._id,
    level: record.currentlevel,
    comments: `${workflowtype} approval acted by ${text(actor.name || actor.user)}`
  });
}

exports.getInstitution = async (req, res) => {
  try {
    const institution = await Institution.findOne({ colid: Number(req.query.colid) }).lean();
    res.json({ success: true, data: institution || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getWorkflow = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.workflowtype) filter.workflowtype = req.query.workflowtype;
    const data = await Workflow.find(filter).sort({ workflowtype: 1, level: 1 }).lean();
    const users = await User.find({ colid: Number(req.query.colid), role: { $not: /^Student$/i } }).select('name email user role').sort({ name: 1 }).lean();
    res.json({ success: true, data, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveWorkflow = async (req, res) => {
  try {
    const payload = { ...req.body, colid: Number(req.body.colid), level: Number(req.body.level || 1) };
    const data = req.body.id
      ? await Workflow.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await Workflow.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteWorkflow = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const data = await Workflow.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deletedCount: data.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitSheet = async (req, res) => {
  try {
    const { colid, month, year } = req.body;
    if (!colid || !month || !year) return res.status(400).json({ success: false, message: 'colid, month and year are required' });
    const rows = await salaryRows(colid, month, year);
    if (!rows.length) return res.status(404).json({ success: false, message: 'No salary rows found for selected month and year' });
    const first = await Workflow.findOne({ colid: Number(colid), workflowtype: 'SalarySheet', status: 'Active' }).sort({ level: 1 }).lean();
    const data = await SalarySheet.create({
      colid: Number(colid),
      month,
      year,
      rows,
      totalamount: rows.reduce((s, r) => s + num(r.total), 0),
      employeeCount: rows.length,
      status: first ? 'Pending Approval' : 'Approved',
      currentlevel: first?.level || 0,
      submittedby: req.body.user,
      submittedname: req.body.name,
      comments: req.body.comments || 'Submitted for salary approval'
    });
    await addSalaryApprovalTask(data, first?.level, 'SalarySheet', '/salarysheetapproval');
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.code === 11000 ? 400 : 500).json({ success: false, message: err.code === 11000 ? 'Salary sheet already submitted for this month and year' : err.message });
  }
};

exports.getSheets = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    ['month', 'year', 'status'].forEach((f) => { if (req.query[f]) filter[f] = req.query[f]; });
    const data = await SalarySheet.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.actionSheet = async (req, res) => {
  try {
    const sheet = await SalarySheet.findById(req.body.id);
    if (!sheet) return res.status(404).json({ success: false, message: 'Salary sheet not found' });
    const action = text(req.body.action);
    sheet.approvalhistory.push({ action, level: sheet.currentlevel, user: req.body.user, name: req.body.name, comments: req.body.comments, date: new Date() });
    await finishSalaryApprovalTask(sheet, req.body, 'SalarySheet');
    if (action === 'Reject') sheet.status = 'Rejected';
    else Object.assign(sheet, await nextStatus(sheet.colid, 'SalarySheet', sheet.currentlevel));
    await sheet.save();
    if (sheet.status === 'Pending Approval') await addSalaryApprovalTask(sheet, sheet.currentlevel, 'SalarySheet', '/salarysheetapproval');
    res.json({ success: true, data: sheet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createVoucher = async (req, res) => {
  try {
    const sheet = await SalarySheet.findById(req.body.sheetid).lean();
    if (!sheet || sheet.status !== 'Approved') return res.status(400).json({ success: false, message: 'Only approved salary sheet can be converted to voucher' });
    const payments = Array.isArray(req.body.payments) ? req.body.payments.map((p) => ({ ...p, amount: num(p.amount) })) : [];
    const total = payments.reduce((s, p) => s + num(p.amount), 0);
    if (!payments.length || Math.abs(total - num(sheet.totalamount)) > 0.5) return res.status(400).json({ success: false, message: 'Payment distribution must match the approved salary amount' });
    const first = await Workflow.findOne({ colid: sheet.colid, workflowtype: 'PaymentVoucher', status: 'Active' }).sort({ level: 1 }).lean();
    const data = await Voucher.create({
      colid: sheet.colid,
      sheetid: String(sheet._id),
      month: sheet.month,
      year: sheet.year,
      totalamount: sheet.totalamount,
      payments,
      status: first ? 'Pending Approval' : 'Approved',
      currentlevel: first?.level || 0,
      createdby: req.body.user,
      createdname: req.body.name
    });
    await addSalaryApprovalTask(data, first?.level, 'PaymentVoucher', '/salarysheetapproval');
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getVouchers = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    ['month', 'year', 'status', 'sheetid'].forEach((f) => { if (req.query[f]) filter[f] = req.query[f]; });
    const data = await Voucher.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function postVoucherLedger(voucher) {
  if (voucher.ledgerposted === 'Yes') return;
  const sheet = await SalarySheet.findById(voucher.sheetid).lean();
  const primary = voucher.payments[0] || {};
  const refs = voucher.payments.map((p) => text(p.referencenumber)).filter(Boolean).join(', ');
  const entries = (sheet?.rows || []).map((row) => ({
    colid: voucher.colid,
    employee: row.employee,
    empid: row.empid,
    employeeemail: row.employeeemail || row.empid,
    department: row.department,
    role: row.role,
    month: voucher.month,
    year: voucher.year,
    paymentdate: primary.paymentdate || new Date(),
    paymentmode: voucher.payments.map((p) => p.paymentmode).filter(Boolean).join(', '),
    paymenttype: 'Salary',
    referencenumber: refs,
    item: 'Monthly Salary',
    description: `Salary payment for ${voucher.month} ${voucher.year}`,
    amount: num(row.total),
    voucherid: String(voucher._id),
    sheetid: String(sheet?._id || voucher.sheetid),
    user: voucher.createdby,
    status1: 'Paid'
  }));
  if (entries.length) await EmployeeLedger.insertMany(entries);
  await HrSalary.updateMany({ colid: voucher.colid, month: voucher.month, year: voucher.year }, { $set: { paystatus: 'Paid' } });
}

exports.actionVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.body.id);
    if (!voucher) return res.status(404).json({ success: false, message: 'Voucher not found' });
    const action = text(req.body.action);
    voucher.approvalhistory.push({ action, level: voucher.currentlevel, user: req.body.user, name: req.body.name, comments: req.body.comments, date: new Date() });
    await finishSalaryApprovalTask(voucher, req.body, 'PaymentVoucher');
    if (action === 'Reject') voucher.status = 'Rejected';
    else Object.assign(voucher, await nextStatus(voucher.colid, 'PaymentVoucher', voucher.currentlevel));
    if (voucher.status === 'Approved' && voucher.ledgerposted !== 'Yes') {
      await postVoucherLedger(voucher);
      voucher.ledgerposted = 'Yes';
    }
    await voucher.save();
    if (voucher.status === 'Pending Approval') await addSalaryApprovalTask(voucher, voucher.currentlevel, 'PaymentVoucher', '/salarysheetapproval');
    res.json({ success: true, data: voucher });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getLedger = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.mine === 'Yes' && req.query.employeeemail) {
      const me = text(req.query.employeeemail);
      filter.$or = [
        { empid: { $regex: me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
        { employeeemail: { $regex: me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
        { user: { $regex: me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      ];
    }
    ['employee', 'empid', 'employeeemail', 'department', 'role', 'month', 'year', 'paymentmode', 'paymenttype', 'item'].forEach((f) => {
      if (req.query.mine === 'Yes' && ['empid', 'employeeemail'].includes(f)) return;
      if (req.query[f]) filter[f] = { $regex: text(req.query[f]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    });
    if (req.query.fromdate || req.query.todate) {
      filter.paymentdate = {};
      if (req.query.fromdate) filter.paymentdate.$gte = new Date(req.query.fromdate);
      if (req.query.todate) filter.paymentdate.$lte = new Date(req.query.todate);
    }
    const data = await EmployeeLedger.find(filter).sort({ paymentdate: -1, employee: 1 }).lean();
    const summary = {
      total: data.reduce((s, r) => s + num(r.amount), 0),
      count: data.length,
      byMonth: Object.values(data.reduce((a, r) => {
        const k = `${r.month || ''} ${r.year || ''}`.trim();
        a[k] = a[k] || { name: k, amount: 0, count: 0 };
        a[k].amount += num(r.amount); a[k].count += 1;
        return a;
      }, {})),
      byPaymentMode: Object.values(data.reduce((a, r) => {
        const k = r.paymentmode || 'NA';
        a[k] = a[k] || { name: k, amount: 0, count: 0 };
        a[k].amount += num(r.amount); a[k].count += 1;
        return a;
      }, {}))
    };
    res.json({ success: true, data, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
