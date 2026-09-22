const mongoose = require("mongoose");
const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const LateFeeWaiverWorkflow = require("../Models/latefeewaiverworkflowds");
const LateFeeWaiverRequest = require("../Models/latefeewaiverrequestds");
const { createApprovalTasks, completeApprovalTasks } = require("../utils/approvalTaskHelper");

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const rx = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const filterFields = ["academicyear", "regulation", "program", "programcode", "semester", "student", "regno", "feegroup", "feeitem", "approvalstatus", "currentapproveremail"];

function buildFilter(colid, filters = []) {
  const query = { colid: num(colid) };
  filters.forEach((filter) => {
    const field = text(filter.field);
    const value = text(filter.value);
    if (!field || !value || !filterFields.includes(field)) return;
    if (["student", "regno", "feegroup", "feeitem", "currentapproveremail"].includes(field)) query[field] = rx(value);
    else query[field] = value;
  });
  return query;
}

function ledgerPayload(ledger, body = {}) {
  const lateFine = num(ledger.Latefinedue);
  return {
    colid: ledger.colid,
    ledgerid: ledger._id,
    academicyear: ledger.academicyear || "",
    regulation: ledger.regulation || "",
    program: ledger.program || "",
    programcode: ledger.programcode || "",
    semester: ledger.semester || "",
    feegroup: ledger.feegroup || "",
    feeitem: ledger.feeitem || "",
    student: ledger.student || ledger.name || "",
    regno: ledger.regno || "",
    studentemail: ledger.user || "",
    amount: num(ledger.amount),
    paid: num(ledger.paid),
    concession: num(ledger.concession),
    balance: num(ledger.balance),
    latefineamount: lateFine,
    reason: text(body.reason),
    appliedby: text(body.user || ledger.user),
    appliedname: text(body.name || ledger.student || ledger.name)
  };
}

async function activeWorkflow(colid) {
  return LateFeeWaiverWorkflow.find({ colid: num(colid), active: { $ne: "No" } }).sort({ level: 1 }).lean();
}

async function createTaskForLevel(request, levelRow) {
  if (!levelRow) return [];
  return createApprovalTasks({
    colid: request.colid,
    user: request.appliedby || request.studentemail,
    createdby: request.appliedname || request.student,
    academicyear: request.academicyear,
    approvername: levelRow.approvername,
    approveremail: levelRow.approveremail,
    title: `Approve late fee waiver: ${request.student || request.regno} - ${request.feeitem}`,
    category: "Late fee waiver",
    pagelink: "/late-fee-waiver-approval",
    comments: `Late fee waiver request for ${request.student || request.regno}, item ${request.feeitem}, fine ${request.latefineamount}.`,
    referenceModel: "latefeewaiverrequestds",
    referenceId: request._id,
    level: levelRow.level
  });
}

async function approveLedgerWaiver(request, body = {}) {
  const ledger = await Ledgerstud.findOne({ _id: request.ledgerid, colid: request.colid });
  if (!ledger) return request;
  const oldFine = num(ledger.Latefinedue);
  const oldBalance = num(ledger.balance);
  const waived = oldFine;
  ledger.Latefinedue = 0;
  ledger.balance = Math.max(0, oldBalance - waived);
  await ledger.save();
  request.waivedamount = waived;
  request.balance = ledger.balance;
  request.approvedby = text(body.user);
  request.approvedname = text(body.name || body.user);
  request.approveddate = new Date();
  return request;
}

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [students, users, workflows, ledgerRows] = await Promise.all([
      User.find({ colid, role: /^student$/i }).select("name email user regno academicyear regulation program programcode semester section").sort({ name: 1 }).limit(2000).lean(),
      User.find({ colid, role: { $not: /^student$/i } }).select("name email user role department designation").sort({ name: 1 }).limit(2000).lean(),
      LateFeeWaiverWorkflow.find({ colid }).sort({ level: 1 }).lean(),
      Ledgerstud.find({ colid }).select("academicyear regulation program programcode semester feegroup feeitem").limit(5000).lean()
    ]);
    const distinct = (field) => [...new Set(ledgerRows.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    res.json({
      success: true,
      students,
      users,
      workflows,
      filterFields,
      options: {
        academicyears: distinct("academicyear"),
        regulations: distinct("regulation"),
        programs: distinct("program"),
        programcodes: distinct("programcode"),
        semesters: distinct("semester"),
        feegroups: distinct("feegroup"),
        feeitems: distinct("feeitem")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveWorkflow = async (req, res) => {
  try {
    const colid = num(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = {
      colid,
      level: num(req.body.level, 1),
      approvername: text(req.body.approvername),
      approveremail: text(req.body.approveremail),
      comments: text(req.body.comments),
      active: /^no$/i.test(text(req.body.active)) ? "No" : "Yes",
      user: text(req.body.user),
      name: text(req.body.name)
    };
    if (!payload.approveremail) return res.status(400).json({ success: false, message: "Approver email is required" });
    const query = req.body.id ? { _id: req.body.id, colid } : { colid, level: payload.level };
    const data = await LateFeeWaiverWorkflow.findOneAndUpdate(query, payload, { new: true, upsert: !req.body.id, runValidators: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteWorkflow = async (req, res) => {
  try {
    const colid = num(req.body.colid, undefined);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const result = await LateFeeWaiverWorkflow.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentLedger = async (req, res) => {
  try {
    const colid = num(req.query.colid, undefined);
    const regno = text(req.query.regno);
    const user = text(req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, balance: { $gt: 0 }, Latefinedue: { $gt: 0 } };
    if (regno) query.regno = regno;
    else if (user) query.user = user;
    const [ledgerRows, requests] = await Promise.all([
      Ledgerstud.find(query).sort({ academicyear: -1, feeitem: 1 }).lean(),
      LateFeeWaiverRequest.find({ colid, ...(regno ? { regno } : user ? { studentemail: user } : {}) }).lean()
    ]);
    const requestByLedger = new Map(requests.map((row) => [String(row.ledgerid), row]));
    res.json({ success: true, data: ledgerRows.map((row) => ({ ...row, waiver: requestByLedger.get(String(row._id)) || null })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submit = async (req, res) => {
  try {
    const colid = num(req.body.colid, undefined);
    const ids = Array.isArray(req.body.ledgerids) ? req.body.ledgerids.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select ledger items" });
    const workflow = await activeWorkflow(colid);
    if (!workflow.length) return res.status(400).json({ success: false, message: "Late fee waiver workflow is not configured" });
    const ledgers = await Ledgerstud.find({ colid, _id: { $in: ids }, Latefinedue: { $gt: 0 } }).lean();
    const created = [];
    for (const ledger of ledgers) {
      const first = workflow[0];
      const payload = {
        ...ledgerPayload(ledger, req.body),
        approvalstatus: "Pending",
        currentlevel: first.level,
        currentapprovername: first.approvername,
        currentapproveremail: first.approveremail
      };
      const request = await LateFeeWaiverRequest.findOneAndUpdate(
        { colid, ledgerid: ledger._id, approvalstatus: { $ne: "Approved" } },
        payload,
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      await createTaskForLevel(request, first);
      created.push(request);
    }
    res.json({ success: true, count: created.length, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.status = async (req, res) => {
  try {
    const colid = num(req.query.colid, undefined);
    const regno = text(req.query.regno);
    const user = text(req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    if (regno) query.regno = regno;
    else if (user) query.studentemail = user;
    const data = await LateFeeWaiverRequest.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvals = async (req, res) => {
  try {
    const colid = num(req.query.colid, undefined);
    const email = text(req.query.useremail || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const pending = await LateFeeWaiverRequest.find({ colid, approvalstatus: "Pending", currentapproveremail: rx(email) }).sort({ createdAt: 1 }).lean();
    const approved = await LateFeeWaiverRequest.find({ colid, "approvalhistory.user": rx(email) }).sort({ updatedAt: -1 }).limit(500).lean();
    res.json({ success: true, pending, approved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const id = req.body.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Valid request id is required" });
    const request = await LateFeeWaiverRequest.findById(id);
    if (!request) return res.status(404).json({ success: false, message: "Waiver request not found" });
    if (request.approvalstatus !== "Pending") return res.status(400).json({ success: false, message: `Request is already ${request.approvalstatus}` });
    const workflow = await activeWorkflow(request.colid);
    const currentIndex = workflow.findIndex((row) => Number(row.level) === Number(request.currentlevel));
    if (currentIndex === -1) return res.status(400).json({ success: false, message: "Current approval level is not configured" });
    request.approvalhistory.push({
      level: request.currentlevel,
      approvername: request.currentapprovername,
      approveremail: request.currentapproveremail,
      action: "Approved",
      comments: text(req.body.comments),
      user: text(req.body.user || req.body.useremail),
      name: text(req.body.name),
      date: new Date()
    });
    await completeApprovalTasks({
      colid: request.colid,
      approveremail: text(req.body.useremail || req.body.user),
      category: "Late fee waiver",
      referenceModel: "latefeewaiverrequestds",
      referenceId: request._id,
      level: request.currentlevel,
      comments: `Late fee waiver approved at level ${request.currentlevel}`
    });
    const next = workflow[currentIndex + 1];
    if (next) {
      request.currentlevel = next.level;
      request.currentapprovername = next.approvername;
      request.currentapproveremail = next.approveremail;
      await request.save();
      await createTaskForLevel(request, next);
    } else {
      await approveLedgerWaiver(request, req.body);
      request.approvalstatus = "Approved";
      request.currentapprovername = "";
      request.currentapproveremail = "";
      await request.save();
    }
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reject = async (req, res) => {
  try {
    const request = await LateFeeWaiverRequest.findById(req.body.id);
    if (!request) return res.status(404).json({ success: false, message: "Waiver request not found" });
    request.approvalhistory.push({
      level: request.currentlevel,
      approvername: request.currentapprovername,
      approveremail: request.currentapproveremail,
      action: "Rejected",
      comments: text(req.body.comments),
      user: text(req.body.user || req.body.useremail),
      name: text(req.body.name),
      date: new Date()
    });
    request.approvalstatus = "Rejected";
    request.rejectedby = text(req.body.user || req.body.useremail);
    request.rejectedname = text(req.body.name);
    request.rejecteddate = new Date();
    request.comments = text(req.body.comments);
    await request.save();
    await completeApprovalTasks({
      colid: request.colid,
      approveremail: text(req.body.useremail || req.body.user),
      category: "Late fee waiver",
      referenceModel: "latefeewaiverrequestds",
      referenceId: request._id,
      level: request.currentlevel,
      comments: `Late fee waiver rejected: ${text(req.body.comments)}`
    });
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.records = async (req, res) => {
  try {
    const colid = num(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = buildFilter(colid, req.body.filters || []);
    if (!query.approvalstatus) query.approvalstatus = "Approved";
    const data = await LateFeeWaiverRequest.find(query).sort({ approveddate: -1, student: 1 }).lean();
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
