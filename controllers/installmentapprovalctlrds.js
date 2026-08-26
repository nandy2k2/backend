const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const InstallmentWorkflow = require("../Models/installmentapprovalworkflowds");
const InstallmentRequest = require("../Models/installmentrequestds");
const { createApprovalTasks, completeApprovalTasks } = require("../utils/approvalTaskHelper");

const studentFields = ["academicyear", "program", "programcode", "semester", "section", "name", "email", "phone", "regno", "major", "minor"];

function text(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function regex(value) {
  return new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function asDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function balanceOf(row) {
  const balance = num(row.balance);
  if (balance > 0) return balance;
  return Math.max(0, num(row.amount) - num(row.paid) - num(row.concession));
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function distinct(Model, colid, fields, base = {}) {
  const pairs = await Promise.all(fields.map(async (field) => {
    const values = await Model.distinct(field, { colid, ...base });
    return [field, [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }));
  return Object.fromEntries(pairs);
}

async function nextWorkflow(colid, approvaltype, programcode, afterLevel = 0) {
  const query = {
    colid,
    approvaltype,
    status: /^Active$/i,
    level: { $gt: afterLevel }
  };
  if (approvaltype === "Program") query.programcode = { $in: [programcode, "All", ""] };
  const rows = await InstallmentWorkflow.find(query).sort({ level: 1 }).lean();
  return rows[0] || null;
}

async function addInstallmentApprovalTask(request, workflow) {
  if (!workflow) return [];
  return createApprovalTasks({
    colid: request.colid,
    user: request.createdby,
    createdby: request.student || request.createdby,
    academicyear: request.academicyear,
    approvername: workflow.approvername,
    approveremail: workflow.approveremail,
    approverrole: workflow.approverrole,
    title: `Approve fee installment for ${request.student || request.regno}`,
    category: "Fee installment approval",
    pagelink: "/installment-approval",
    comments: `Installment request for ${request.regno} is pending ${workflow.approvaltype} level ${workflow.level}.`,
    referenceModel: "installmentrequestds",
    referenceId: request._id,
    level: `${workflow.approvaltype}:${workflow.level}`
  });
}

async function finishInstallmentApprovalTask(request, actor) {
  return completeApprovalTasks({
    colid: request.colid,
    approveremail: text(actor.user || actor.approveremail),
    category: "Fee installment approval",
    referenceModel: "installmentrequestds",
    referenceId: request._id,
    level: `${request.stage}:${request.currentlevel}`,
    comments: `Installment request acted by ${text(actor.name || actor.user)}`
  });
}

async function adjustLedgerForRequest(request, actor) {
  if (request.ledgeradjusted === "Yes") return;
  const selected = await Ledgerstud.find({ _id: { $in: request.selectedledgerids }, colid: request.colid });
  if (!selected.length) throw new Error("Selected ledger rows not found");
  const first = selected[0];
  const newRows = request.installments.map((item, index) => {
    const amount = num(item.amount);
    return {
      name: first.name || request.email || request.regno,
      user: first.user || request.email || request.regno,
      feegroup: "Installment",
      regno: request.regno,
      student: request.student || first.student || "NA",
      feeitem: text(item.description) || `Installment ${index + 1}`,
      amount,
      paid: 0,
      concession: 0,
      balance: amount,
      Latefinedue: 0,
      Latefinepaid: 0,
      cash: 0,
      upi: 0,
      cheque: 0,
      card: 0,
      pg: 0,
      neft: 0,
      feebook: first.feebook || "",
      feecounter: "",
      paymode: "",
      paydetails: "",
      feecategory: "Installment",
      feetype: first.feetype || "",
      semester: request.semester || first.semester || "",
      cashbook: first.cashbook || "",
      institution: first.institution || "",
      type: "positive",
      installment: String(index + 1),
      comments: `Approved installment from request ${request._id}. ${text(item.description)}`,
      academicyear: request.academicyear || first.academicyear || "",
      colid: request.colid,
      classdate: new Date(),
      duedate: asDate(item.duedate) || new Date(),
      status: "Active",
      approvalhistory: [{ action: "Installment Approved", user: actor, date: new Date(), requestid: String(request._id) }],
      programcode: request.programcode || first.programcode || "",
      regulation: first.regulation || "",
      major: first.major || "",
      minor: first.minor || "",
      admissionyear: first.admissionyear || ""
    };
  });
  for (const row of selected) {
    const oldBalance = balanceOf(row);
    row.concession = num(row.concession) + oldBalance;
    row.balance = 0;
    row.status = "Installment Converted";
    row.comments = `${text(row.comments)} ${text(row.comments) ? "|" : ""} Converted through approved installment request ${request._id}`;
    row.approvalhistory = [...(Array.isArray(row.approvalhistory) ? row.approvalhistory : []), { action: "Installment Conversion Approved", user: actor, date: new Date(), oldbalance: oldBalance, requestid: String(request._id) }];
    await row.save();
  }
  await Ledgerstud.insertMany(newRows);
  request.ledgeradjusted = "Yes";
}

exports.workflowList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    ["approvaltype", "programcode", "approverrole", "approveremail", "status"].forEach((field) => {
      if (text(req.query[field])) query[field] = field === "approveremail" ? regex(req.query[field]) : req.query[field];
    });
    const data = await InstallmentWorkflow.find(query).sort({ approvaltype: 1, programcode: 1, level: 1 }).lean();
    res.json({ success: true, data, options: await distinct(InstallmentWorkflow, colid, ["approvaltype", "programcode", "approverrole", "approveremail", "status"]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.workflowSave = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const payload = {
      colid,
      approvaltype: text(req.body.approvaltype) || "Program",
      programcode: text(req.body.programcode) || "All",
      level: num(req.body.level) || 1,
      approverrole: text(req.body.approverrole),
      approvername: text(req.body.approvername),
      approveremail: text(req.body.approveremail).toLowerCase(),
      status: text(req.body.status) || "Active",
      user: text(req.body.user)
    };
    if (!payload.approveremail && !payload.approverrole) return res.status(400).json({ success: false, message: "Approver email or role is required" });
    const data = req.body.id
      ? await InstallmentWorkflow.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await InstallmentWorkflow.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.workflowDelete = async (req, res) => {
  try {
    await InstallmentWorkflow.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.userOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    res.json({ success: true, options: await distinct(User, colid, ["name", "email", "role", "programcode"], { role: { $not: /^Student$/i } }) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.users = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid, role: { $not: /^Student$/i } };
    ["name", "email", "role", "department"].forEach((field) => {
      if (text(req.query[field])) query[field] = ["name", "email"].includes(field) ? regex(req.query[field]) : req.query[field];
    });
    const data = await User.find(query).select("name email user role department programcode").sort({ name: 1 }).limit(1000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentPendingFees = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const email = text(req.query.email);
    const query = { colid, balance: { $gt: 0 } };
    if (regno) query.regno = regno;
    else if (email) query.user = email;
    ["academicyear", "programcode", "semester"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    const data = await Ledgerstud.find(query).sort({ duedate: 1, feegroup: 1, feeitem: 1 }).limit(1000).lean();
    res.json({ success: true, data, options: await distinct(Ledgerstud, colid, ["academicyear", "programcode", "semester"], regno ? { regno } : {}) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createRequest = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const selectedIds = Array.isArray(req.body.selectedIds) ? req.body.selectedIds : [];
    const installments = Array.isArray(req.body.installments) ? req.body.installments : [];
    if (!colid || !selectedIds.length || !installments.length) return res.status(400).json({ success: false, message: "Select fee items and add installment rows" });
    const selected = await Ledgerstud.find({ _id: { $in: selectedIds }, colid }).lean();
    if (!selected.length) return res.status(404).json({ success: false, message: "Selected ledger rows not found" });
    const total = selected.reduce((sum, row) => sum + balanceOf(row), 0);
    const installmentTotal = installments.reduce((sum, row) => sum + num(row.amount), 0);
    if (total <= 0) return res.status(400).json({ success: false, message: "Selected rows do not have balance" });
    if (Math.abs(total - installmentTotal) > 0.01) return res.status(400).json({ success: false, message: "Installment total must match selected fee balance" });
    const maxDue = selected.reduce((latest, row) => {
      const d = asDate(row.duedate) || new Date();
      return !latest || d > latest ? d : latest;
    }, null);
    const lastAllowed = addMonths(maxDue || new Date(), 3);
    for (const item of installments) {
      const due = asDate(item.duedate);
      if (!due || num(item.amount) <= 0) return res.status(400).json({ success: false, message: "Each installment needs amount and target date" });
      if (due > lastAllowed) return res.status(400).json({ success: false, message: "Installment target dates must be within 3 months from due date" });
    }
    const first = selected[0];
    const student = await User.findOne({ colid, regno: first.regno }).lean();
    const wf = await nextWorkflow(colid, "Program", first.programcode || "All", 0);
    const initialStage = wf ? "Program" : "Institution";
    const instWf = wf ? null : await nextWorkflow(colid, "Institution", "All", 0);
    if (!wf && !instWf) return res.status(400).json({ success: false, message: "No installment approval workflow configured" });
    const data = await InstallmentRequest.create({
      colid,
      student: first.student || student?.name || "",
      regno: first.regno,
      email: student?.email || first.user || "",
      phone: student?.phone || "",
      academicyear: first.academicyear || student?.academicyear || "",
      program: student?.program || "",
      programcode: first.programcode || student?.programcode || "",
      semester: first.semester || student?.semester || "",
      section: student?.section || "",
      totalamount: total,
      selectedledgerids: selected.map((row) => String(row._id)),
      selecteditems: selected.map((row) => ({ id: String(row._id), feegroup: row.feegroup, feeitem: row.feeitem, amount: row.amount, paid: row.paid, concession: row.concession, balance: balanceOf(row), duedate: row.duedate })),
      installments,
      stage: initialStage,
      currentlevel: (wf || instWf).level,
      status: initialStage === "Program" ? `Pending Program Level ${(wf || instWf).level}` : `Pending Institution Level ${(wf || instWf).level}`,
      createdby: text(req.body.user),
      remarks: text(req.body.remarks)
    });
    await addInstallmentApprovalTask(data, wf || instWf);
    res.json({ success: true, data, message: "Installment request submitted for approval" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.requests = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    ["regno", "student", "academicyear", "programcode", "stage", "status"].forEach((field) => {
      if (text(req.query[field])) query[field] = ["student", "regno"].includes(field) ? regex(req.query[field]) : req.query[field];
    });
    if (text(req.query.mine) === "yes") query.createdby = text(req.query.user);
    const data = await InstallmentRequest.find(query).sort({ createdAt: -1 }).limit(3000).lean();
    res.json({ success: true, data, options: await distinct(InstallmentRequest, colid, ["academicyear", "programcode", "stage", "status"]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.pendingApprovals = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const email = text(req.query.user).toLowerCase();
    const role = text(req.query.role);
    const workflows = await InstallmentWorkflow.find({
      colid,
      status: /^Active$/i,
      $or: [{ approveremail: email }, { approverrole: role }]
    }).lean();
    const ors = workflows.map((wf) => ({
      stage: wf.approvaltype,
      currentlevel: wf.level,
      ...(wf.approvaltype === "Program" && wf.programcode && wf.programcode !== "All" ? { programcode: wf.programcode } : {})
    }));
    const query = { colid, status: /^Pending/i, ...(ors.length ? { $or: ors } : { _id: null }) };
    const data = await InstallmentRequest.find(query).sort({ createdAt: -1 }).limit(3000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.act = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const request = await InstallmentRequest.findOne({ _id: req.body.id, colid });
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    const action = text(req.body.action);
    const actor = text(req.body.user);
    request.approvalhistory.push({ action, user: actor, role: text(req.body.role), comments: text(req.body.comments), stage: request.stage, level: request.currentlevel, date: new Date() });
    await finishInstallmentApprovalTask(request, req.body);
    if (action === "Reject") {
      request.status = "Rejected";
      await request.save();
      return res.json({ success: true, data: request });
    }
    const nextSame = await nextWorkflow(colid, request.stage, request.programcode, request.currentlevel);
    if (nextSame) {
      request.currentlevel = nextSame.level;
      request.status = `Pending ${request.stage} Level ${nextSame.level}`;
      await request.save();
      await addInstallmentApprovalTask(request, nextSame);
      return res.json({ success: true, data: request });
    }
    if (request.stage === "Program") {
      const nextInst = await nextWorkflow(colid, "Institution", "All", 0);
      if (nextInst) {
        request.stage = "Institution";
        request.currentlevel = nextInst.level;
        request.status = `Pending Institution Level ${nextInst.level}`;
        await request.save();
        await addInstallmentApprovalTask(request, nextInst);
        return res.json({ success: true, data: request });
      }
    }
    await adjustLedgerForRequest(request, actor);
    request.stage = "Completed";
    request.status = "Approved";
    await request.save();
    res.json({ success: true, data: request, message: "Installment approved and ledger adjusted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
