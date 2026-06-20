const DepartmentWorkflow = require("../Models/purchasenewdepartmentworkflowds");
const InstitutionWorkflow = require("../Models/purchasenewinstitutionworkflowds");
const PurchaseIndent = require("../Models/purchasenewindentds");
const PurchaseIndentAudit = require("../Models/purchasenewindentauditds");
const BudgetCategory = require("../Models/newbudgetcategoryds");
const BudgetItem = require("../Models/newbudgetitemds");
const User = require("../Models/user");
const BlockchainLedger = require("../Models/blockchainledgerds");
const { appendBlock } = require("./blockchainledgerctlrds");

const num = (value, fallback = undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clean = (value) => String(value || "").trim();
const byLevelAsc = (a, b) => num(a.level, 0) - num(b.level, 0);
const byLevelDesc = (a, b) => num(b.level, 0) - num(a.level, 0);
const approverMatches = (level, useremail) => {
  const configuredEmail = clean(level.approveremail).toLowerCase();
  const currentEmail = clean(useremail).toLowerCase();
  if (!configuredEmail || !currentEmail) return false;
  return configuredEmail === currentEmail;
};

const workflowPayload = (body, withDepartment = false) => ({
  colid: num(body.colid),
  ...(withDepartment ? { department: clean(body.department) } : {}),
  level: num(body.level, 1),
  approverrole: clean(body.approverrole),
  approvername: clean(body.approvername),
  approveremail: clean(body.approveremail),
  active: clean(body.active) || "Yes",
  remarks: clean(body.remarks),
  user: clean(body.user)
});

const addHistory = (item, action, req, comments = "") => {
  item.history = item.history || [];
  item.history.push({
    action,
    stage: item.stage,
    level: item.currentlevel,
    username: req.body.username || req.query.username || "",
    useremail: req.body.useremail || req.query.useremail || req.body.user || req.query.user || "",
    role: req.body.role || req.query.role || "",
    comments
  });
};

const logAudit = async (action, item, req, olddata = null, newdata = null, comments = "") => {
  if (!item) return;
  await PurchaseIndentAudit.create({
    colid: item.colid,
    indentid: item._id,
    department: item.department,
    category: item.category,
    categorytype: item.categorytype,
    item: item.item,
    action,
    status: item.status,
    stage: item.stage,
    level: item.currentlevel,
    comments,
    username: req.body.username || req.query.username || item.submittedbyname || "",
    useremail: req.body.useremail || req.query.useremail || req.body.user || req.query.user || item.submittedby || "",
    role: req.body.role || req.query.role || item.submittedrole || "",
    olddata,
    newdata
  });
};

const nextInstitutionState = async (item) => {
  const levels = await InstitutionWorkflow.find({ colid: item.colid, active: "Yes" }).lean();
  levels.sort(byLevelAsc);
  if (levels.length) {
    item.stage = "Institution";
    item.currentlevel = num(levels[0].level, 1);
    item.status = `Institution Pending Level ${item.currentlevel}`;
    return;
  }
  item.stage = "Approved";
  item.currentlevel = 0;
  item.status = "Approved";
  item.approvedat = new Date();
};

const nextDepartmentState = async (item) => {
  const levels = await DepartmentWorkflow.find({
    colid: item.colid,
    active: "Yes",
    department: { $in: [item.department, "All"] }
  }).lean();
  levels.sort(byLevelAsc);
  if (levels.length) {
    item.stage = "Department";
    item.currentlevel = num(levels[0].level, 1);
    item.status = `Department Pending Level ${item.currentlevel}`;
    return;
  }
  await nextInstitutionState(item);
};

const progressItem = async (item) => {
  if (item.stage === "Department") {
    const levels = await DepartmentWorkflow.find({
      colid: item.colid,
      active: "Yes",
      department: { $in: [item.department, "All"] }
    }).lean();
    const next = levels.filter((level) => num(level.level, 0) > num(item.currentlevel, 0)).sort(byLevelAsc)[0];
    if (next) {
      item.currentlevel = num(next.level, item.currentlevel);
      item.status = `Department Pending Level ${item.currentlevel}`;
      return;
    }
    await nextInstitutionState(item);
    return;
  }
  if (item.stage === "Institution") {
    const levels = await InstitutionWorkflow.find({ colid: item.colid, active: "Yes" }).lean();
    const next = levels.filter((level) => num(level.level, 0) > num(item.currentlevel, 0)).sort(byLevelAsc)[0];
    if (next) {
      item.currentlevel = num(next.level, item.currentlevel);
      item.status = `Institution Pending Level ${item.currentlevel}`;
      return;
    }
  }
  item.stage = "Approved";
  item.currentlevel = 0;
  item.status = "Approved";
  item.approvedat = new Date();
};

const regressItem = async (item) => {
  if (item.stage === "Institution") {
    const institutionLevels = await InstitutionWorkflow.find({ colid: item.colid, active: "Yes" }).lean();
    const previousInstitution = institutionLevels.filter((level) => num(level.level, 0) < num(item.currentlevel, 0)).sort(byLevelDesc)[0];
    if (previousInstitution) {
      item.currentlevel = num(previousInstitution.level, item.currentlevel);
      item.status = `Institution Pending Level ${item.currentlevel}`;
      return;
    }
    const departmentLevels = await DepartmentWorkflow.find({
      colid: item.colid,
      active: "Yes",
      department: { $in: [item.department, "All"] }
    }).lean();
    const previousDepartment = departmentLevels.sort(byLevelDesc)[0];
    if (previousDepartment) {
      item.stage = "Department";
      item.currentlevel = num(previousDepartment.level, item.currentlevel);
      item.status = `Department Pending Level ${item.currentlevel}`;
      return;
    }
  }
  if (item.stage === "Department") {
    const levels = await DepartmentWorkflow.find({
      colid: item.colid,
      active: "Yes",
      department: { $in: [item.department, "All"] }
    }).lean();
    const previousDepartment = levels.filter((level) => num(level.level, 0) < num(item.currentlevel, 0)).sort(byLevelDesc)[0];
    if (previousDepartment) {
      item.currentlevel = num(previousDepartment.level, item.currentlevel);
      item.status = `Department Pending Level ${item.currentlevel}`;
      return;
    }
  }
  item.status = "Rejected";
  item.stage = "Rejected";
  item.currentlevel = 0;
};

const matchingWorkflowLevel = async (item, req) => {
  const role = clean(req.body.role || req.query.role);
  const useremail = clean(req.body.useremail || req.query.useremail || req.body.user || req.query.user);
  if (!role) return null;
  if (item.stage === "Department") {
    const levels = await DepartmentWorkflow.find({
      colid: item.colid,
      active: "Yes",
      approverrole: role,
      department: { $in: [item.department, "All"] }
    }).lean();
    return levels.find((level) => num(level.level, 0) === num(item.currentlevel, 0) && approverMatches(level, useremail)) || null;
  }
  if (item.stage === "Institution") {
    const levels = await InstitutionWorkflow.find({ colid: item.colid, active: "Yes", approverrole: role }).lean();
    return levels.find((level) => num(level.level, 0) === num(item.currentlevel, 0) && approverMatches(level, useremail)) || null;
  }
  return null;
};

const indentFilter = (query = {}) => {
  const filter = {};
  if (query.colid) filter.colid = num(query.colid);
  ["department", "category", "categorytype", "item", "status", "stage", "submittedby"].forEach((field) => {
    if (query[field]) filter[field] = query[field];
  });
  return filter;
};

const auditFilter = (query = {}) => {
  const filter = {};
  if (query.colid) filter.colid = num(query.colid);
  ["department", "category", "categorytype", "item", "action", "status", "stage", "useremail"].forEach((field) => {
    if (query[field]) filter[field] = query[field];
  });
  return filter;
};

const updateBudgetUtilization = async (indent) => {
  let pending = num(indent.approximatetotalcost, 0);
  if (!pending) return;
  const query = {
    colid: indent.colid,
    department: indent.department,
    category: indent.category,
    status: "Approved"
  };
  if (indent.categorytype) query.categorytype = indent.categorytype;
  const budgets = await BudgetItem.find(query).sort({ approvedat: 1, createdAt: 1 });
  for (const budget of budgets) {
    if (pending <= 0) break;
    const amount = num(budget.amount, 0);
    const utilized = num(budget.utilized, 0);
    const available = Math.max(0, amount - utilized);
    const useAmount = available ? Math.min(available, pending) : pending;
    budget.utilized = utilized + useAmount;
    budget.remaining = num(budget.amount, 0) - num(budget.utilized, 0);
    await budget.save();
    pending -= useAmount;
  }
};

exports.getUsers = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const filter = { colid, role: { $not: /^Student$/i } };
    const users = await User.find(filter).select("name email role department").sort({ name: 1 }).limit(500).lean();
    const departments = [...new Set(users.map((item) => item.department).filter(Boolean))].sort();
    const roles = [...new Set(users.map((item) => item.role).filter(Boolean))].sort();
    res.json({ success: true, users, departments, roles });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const department = clean(req.query.department);
    if (department) {
      const budgets = await BudgetItem.find({ colid, department, status: "Approved" })
        .select("category categorytype")
        .sort({ category: 1, categorytype: 1 })
        .lean();
      const seen = new Set();
      const data = budgets
        .map((item) => ({ category: item.category, type: item.categorytype || "" }))
        .filter((item) => {
          const key = `${item.category}::${item.type}`;
          if (!item.category || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return res.json({ success: true, data });
    }
    const data = await BudgetCategory.find({ colid, active: "Yes" }).sort({ category: 1, type: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getBudgetSummary = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid), status: "Approved" };
    if (req.query.department) query.department = clean(req.query.department);
    if (req.query.category) query.category = clean(req.query.category);
    if (req.query.categorytype) query.categorytype = clean(req.query.categorytype);
    const rows = await BudgetItem.find(query).select("department category categorytype item amount utilized remaining").lean();
    const approved = rows.reduce((sum, row) => sum + num(row.amount, 0), 0);
    const utilized = rows.reduce((sum, row) => sum + num(row.utilized, 0), 0);
    res.json({
      success: true,
      data: {
        approved,
        utilized,
        remaining: approved - utilized,
        rows: rows.map((row) => ({ ...row, remaining: num(row.amount, 0) - num(row.utilized, 0) }))
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getDepartmentWorkflow = async (req, res) => {
  try {
    const data = await DepartmentWorkflow.find({ colid: num(req.query.colid) }).sort({ department: 1, level: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveDepartmentWorkflow = async (req, res) => {
  try {
    const payload = workflowPayload(req.body, true);
    if (!payload.department || !payload.approverrole) return res.status(400).json({ success: false, message: "Department and approver role are required" });
    const data = req.body.id
      ? await DepartmentWorkflow.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await DepartmentWorkflow.create(payload);
    await PurchaseIndentAudit.create({
      colid: payload.colid,
      department: payload.department,
      action: req.body.id ? "Update Department Workflow" : "Create Department Workflow",
      username: req.body.username || req.body.user || "",
      useremail: req.body.user || "",
      role: req.body.role || "",
      newdata: data
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteDepartmentWorkflow = async (req, res) => {
  try {
    const data = await DepartmentWorkflow.findByIdAndDelete(req.body.id);
    if (data) {
      await PurchaseIndentAudit.create({
        colid: data.colid,
        department: data.department,
        action: "Delete Department Workflow",
        username: req.body.username || req.body.user || "",
        useremail: req.body.user || "",
        role: req.body.role || "",
        olddata: data
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getInstitutionWorkflow = async (req, res) => {
  try {
    const data = await InstitutionWorkflow.find({ colid: num(req.query.colid) }).sort({ level: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveInstitutionWorkflow = async (req, res) => {
  try {
    const payload = workflowPayload(req.body, false);
    if (!payload.approverrole) return res.status(400).json({ success: false, message: "Approver role is required" });
    const data = req.body.id
      ? await InstitutionWorkflow.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await InstitutionWorkflow.create(payload);
    await PurchaseIndentAudit.create({
      colid: payload.colid,
      action: req.body.id ? "Update Institution Workflow" : "Create Institution Workflow",
      username: req.body.username || req.body.user || "",
      useremail: req.body.user || "",
      role: req.body.role || "",
      newdata: data
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteInstitutionWorkflow = async (req, res) => {
  try {
    const data = await InstitutionWorkflow.findByIdAndDelete(req.body.id);
    if (data) {
      await PurchaseIndentAudit.create({
        colid: data.colid,
        action: "Delete Institution Workflow",
        username: req.body.username || req.body.user || "",
        useremail: req.body.user || "",
        role: req.body.role || "",
        olddata: data
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getIndents = async (req, res) => {
  try {
    const data = await PurchaseIndent.find(indentFilter(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveIndent = async (req, res) => {
  try {
    const quantity = num(req.body.quantity, 0);
    const approximatevalue = num(req.body.approximatevalue, 0);
    const payload = {
      colid: num(req.body.colid),
      department: clean(req.body.department),
      category: clean(req.body.category),
      categorytype: clean(req.body.categorytype),
      item: clean(req.body.item),
      description: clean(req.body.description),
      quantity,
      approximatevalue,
      approximatetotalcost: num(req.body.approximatetotalcost, quantity * approximatevalue),
      submittedby: clean(req.body.useremail || req.body.user),
      submittedbyname: clean(req.body.username),
      submittedrole: clean(req.body.role)
    };
    if (!payload.department || !payload.category || !payload.item) return res.status(400).json({ success: false, message: "Department, category and item are required" });
    let data;
    if (req.body.id) {
      const existing = await PurchaseIndent.findById(req.body.id);
      if (!existing) return res.status(404).json({ success: false, message: "Indent not found" });
      if (existing.status !== "Draft") return res.status(400).json({ success: false, message: "Only draft indents can be edited" });
      const olddata = existing.toObject();
      Object.assign(existing, payload);
      data = await existing.save();
      await logAudit("Update Draft Indent", data, req, olddata, data.toObject(), "");
    } else {
      data = await PurchaseIndent.create({ ...payload, status: "Draft", stage: "Draft", currentlevel: 0 });
      await logAudit("Create Draft Indent", data, req, null, data.toObject(), "");
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteIndent = async (req, res) => {
  try {
    const item = await PurchaseIndent.findById(req.body.id);
    if (!item) return res.status(404).json({ success: false, message: "Indent not found" });
    if (item.status !== "Draft") return res.status(400).json({ success: false, message: "Only draft indents can be deleted" });
    await logAudit("Delete Draft Indent", item, req, item.toObject(), null, "");
    await item.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.submitIndents = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const indents = await PurchaseIndent.find({ _id: { $in: ids }, colid: num(req.body.colid), status: "Draft" });
    for (const item of indents) {
      const olddata = item.toObject();
      item.submittedby = req.body.useremail || req.body.user || item.submittedby;
      item.submittedbyname = req.body.username || item.submittedbyname;
      item.submittedrole = req.body.role || item.submittedrole;
      await nextDepartmentState(item);
      addHistory(item, "Submit", req, "");
      await item.save();
      await logAudit("Submit Indent", item, req, olddata, item.toObject(), "");
    }
    res.json({ success: true, updated: indents.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getApprovalQueue = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const role = clean(req.query.role);
    const useremail = clean(req.query.useremail || req.query.user);
    const department = clean(req.query.department);
    const stage = clean(req.query.stage);
    const or = [];
    if (!stage || stage === "Department") {
      const levels = await DepartmentWorkflow.find({ colid, active: "Yes", approverrole: role, department: { $in: [department, "All"] } }).lean();
      levels.filter((level) => approverMatches(level, useremail)).forEach((level) => {
        or.push({ stage: "Department", currentlevel: num(level.level, 0), department: level.department === "All" ? { $exists: true } : level.department });
      });
    }
    if (!stage || stage === "Institution") {
      const levels = await InstitutionWorkflow.find({ colid, active: "Yes", approverrole: role }).lean();
      levels.filter((level) => approverMatches(level, useremail)).forEach((level) => {
        or.push({ stage: "Institution", currentlevel: num(level.level, 0) });
      });
    }
    const data = or.length ? await PurchaseIndent.find({ colid, $or: or }).sort({ department: 1, category: 1, createdAt: 1 }).lean() : [];
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.approveIndent = async (req, res) => {
  try {
    const item = await PurchaseIndent.findById(req.body.id);
    if (!item) return res.status(404).json({ success: false, message: "Indent not found" });
    const level = await matchingWorkflowLevel(item, req);
    if (!level) return res.status(403).json({ success: false, message: "This indent is not pending for your role and user" });
    const olddata = item.toObject();
    addHistory(item, "Approve", req, req.body.comments || "Approved");
    await progressItem(item);
    if (item.status === "Approved") await updateBudgetUtilization(item);
    await item.save();
    await logAudit("Approve Indent", item, req, olddata, item.toObject(), req.body.comments || "Approved");
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.rejectIndent = async (req, res) => {
  try {
    const item = await PurchaseIndent.findById(req.body.id);
    if (!item) return res.status(404).json({ success: false, message: "Indent not found" });
    const level = await matchingWorkflowLevel(item, req);
    if (!level) return res.status(403).json({ success: false, message: "This indent is not pending for your role and user" });
    const olddata = item.toObject();
    item.rejectedreason = req.body.comments || "";
    addHistory(item, "Reject", req, req.body.comments || "");
    await regressItem(item);
    await item.save();
    await logAudit("Reject Indent", item, req, olddata, item.toObject(), req.body.comments || "");
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getIndentAuditLogs = async (req, res) => {
  try {
    const data = await PurchaseIndentAudit.find(auditFilter(req.query)).sort({ timeofactivity: -1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.storeIndentBlockchain = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const id = clean(req.body.id || req.body.indentid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!id) return res.status(400).json({ success: false, message: "indent id is required" });
    const indent = await PurchaseIndent.findOne({ _id: id, colid, status: "Approved" }).lean();
    if (!indent) return res.status(404).json({ success: false, message: "Approved indent not found" });

    const payload = {
      indent,
      storedAt: new Date().toISOString()
    };
    const block = await appendBlock({
      colid,
      modelname: "purchasenewindent",
      collectionname: "purchasenewindentds",
      recordid: String(indent._id),
      action: "APPROVED_INDENT_STORE",
      payload,
      metadata: {
        department: indent.department,
        category: indent.category,
        item: indent.item,
        amount: indent.approximatetotalcost,
        submittedby: indent.submittedby
      },
      user: req.body.user || req.body.useremail || ""
    });
    res.json({ success: true, message: "Approved indent stored in blockchain", data: block });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyIndentBlockchain = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const hash = clean(req.query.hash);
    const recordid = clean(req.query.recordid || req.query.indentid);
    const query = { modelname: "purchasenewindent" };
    if (colid !== undefined) query.colid = colid;
    if (hash) query.hash = hash;
    if (recordid) query.recordid = recordid;
    const data = await BlockchainLedger.find(query).sort({ timestamp: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
