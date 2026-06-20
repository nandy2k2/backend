const DepartmentWorkflow = require("../Models/newbudgetdepartmentworkflowds");
const InstitutionWorkflow = require("../Models/newbudgetinstitutionworkflowds");
const BudgetCategory = require("../Models/newbudgetcategoryds");
const BudgetItem = require("../Models/newbudgetitemds");
const BudgetAuditLog = require("../Models/newbudgetauditlogds");
const BlockchainLedger = require("../Models/blockchainledgerds");
const { appendBlock } = require("./blockchainledgerctlrds");
const User = require("../Models/user");

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

const getMatchingWorkflowLevel = async (item, req) => {
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
    const levels = await InstitutionWorkflow.find({
      colid: item.colid,
      active: "Yes",
      approverrole: role
    }).lean();
    return levels.find((level) => num(level.level, 0) === num(item.currentlevel, 0) && approverMatches(level, useremail)) || null;
  }

  return null;
};

const addHistory = (item, action, req, comments = "") => {
  item.history = item.history || [];
  item.history.push({
    action,
    stage: item.stage,
    level: item.currentlevel,
    username: req.body.username || req.query.username || "",
    useremail: req.body.useremail || req.query.useremail || req.body.user || "",
    role: req.body.role || req.query.role || "",
    comments,
    amount: item.amount
  });
};

const logAudit = async (action, item, req, olddata = null, newdata = null, comments = "") => {
  if (!item) return;
  await BudgetAuditLog.create({
    colid: item.colid,
    budgetitemid: item._id,
    academicyear: item.academicyear,
    department: item.department,
    category: item.category,
    categorytype: item.categorytype,
    item: item.item,
    amount: item.amount,
    utilized: item.utilized || 0,
    remaining: num(item.amount, 0) - num(item.utilized, 0),
    status: item.status,
    stage: item.stage,
    level: item.currentlevel,
    action,
    olddata,
    newdata,
    comments,
    username: req.body.username || req.query.username || req.body.submittedbyname || "",
    useremail: req.body.useremail || req.query.useremail || req.body.user || req.body.submittedby || "",
    role: req.body.role || req.query.role || req.body.submittedrole || ""
  });
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

const nextInstitutionState = async (item) => {
  const levels = await InstitutionWorkflow.find({ colid: item.colid, active: "Yes" }).lean();
  levels.sort(byLevelAsc);
  if (levels.length) {
    item.stage = "Institution";
    item.currentlevel = num(levels[0].level, 1);
    item.status = `Institution Pending Level ${item.currentlevel}`;
  } else {
    item.stage = "Approved";
    item.currentlevel = 0;
    item.status = "Approved";
    item.approvedat = new Date();
  }
};

const progressItem = async (item) => {
  if (item.stage === "Department") {
    const levels = await DepartmentWorkflow.find({
      colid: item.colid,
      active: "Yes",
      department: { $in: [item.department, "All"] }
    }).lean();
    const next = levels
      .filter((level) => num(level.level, 0) > num(item.currentlevel, 0))
      .sort(byLevelAsc)[0];
    if (next) {
      item.currentlevel = num(next.level, item.currentlevel);
      item.status = `Department Pending Level ${item.currentlevel}`;
      return;
    }
    await nextInstitutionState(item);
    return;
  }

  if (item.stage === "Institution") {
    const levels = await InstitutionWorkflow.find({
      colid: item.colid,
      active: "Yes"
    }).lean();
    const next = levels
      .filter((level) => num(level.level, 0) > num(item.currentlevel, 0))
      .sort(byLevelAsc)[0];
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
    const institutionLevels = await InstitutionWorkflow.find({
      colid: item.colid,
      active: "Yes"
    }).lean();
    const previousInstitution = institutionLevels
      .filter((level) => num(level.level, 0) < num(item.currentlevel, 0))
      .sort(byLevelDesc)[0];
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
    const previousDepartment = levels
      .filter((level) => num(level.level, 0) < num(item.currentlevel, 0))
      .sort(byLevelDesc)[0];
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

const itemFilter = (query) => {
  const filter = {};
  if (query.colid) filter.colid = num(query.colid);
  ["academicyear", "department", "category", "categorytype", "status", "stage"].forEach((field) => {
    if (query[field]) filter[field] = query[field];
  });
  if (query.submittedby) filter.submittedby = query.submittedby;
  return filter;
};

exports.getUsers = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const search = clean(req.query.search);
    const filter = { colid, role: { $not: /^Student$/i } };
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { email: rx }, { department: rx }, { role: rx }];
    }
    const users = await User.find(filter)
      .select("name email role department designation")
      .sort({ name: 1 })
      .limit(500)
      .lean();
    const departments = [...new Set(users.map((item) => item.department).filter(Boolean))].sort();
    const roles = [...new Set(users.map((item) => item.role).filter(Boolean))].sort();
    res.json({ status: "success", users, departments, roles });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getDepartmentWorkflow = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    const data = await DepartmentWorkflow.find(filter).sort({ department: 1, level: 1 });
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.saveDepartmentWorkflow = async (req, res) => {
  try {
    const payload = { ...req.body, colid: num(req.body.colid), level: num(req.body.level, 1) };
    const data = payload.id
      ? await DepartmentWorkflow.findByIdAndUpdate(payload.id, payload, { new: true, runValidators: true })
      : await DepartmentWorkflow.create(payload);
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteDepartmentWorkflow = async (req, res) => {
  try {
    await DepartmentWorkflow.findByIdAndDelete(req.body.id);
    res.json({ status: "success" });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.bulkDepartmentWorkflow = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.filter((row) => row.department && row.approverrole).map((row) => ({
      ...row,
      colid: num(req.body.colid),
      level: num(row.level, 1),
      user: req.body.user
    }));
    if (docs.length) await DepartmentWorkflow.insertMany(docs);
    res.json({ status: "success", inserted: docs.length });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getInstitutionWorkflow = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    const data = await InstitutionWorkflow.find(filter).sort({ level: 1 });
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.saveInstitutionWorkflow = async (req, res) => {
  try {
    const payload = { ...req.body, colid: num(req.body.colid), level: num(req.body.level, 1) };
    const data = payload.id
      ? await InstitutionWorkflow.findByIdAndUpdate(payload.id, payload, { new: true, runValidators: true })
      : await InstitutionWorkflow.create(payload);
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteInstitutionWorkflow = async (req, res) => {
  try {
    await InstitutionWorkflow.findByIdAndDelete(req.body.id);
    res.json({ status: "success" });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.bulkInstitutionWorkflow = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.filter((row) => row.approverrole).map((row) => ({
      ...row,
      colid: num(req.body.colid),
      level: num(row.level, 1),
      user: req.body.user
    }));
    if (docs.length) await InstitutionWorkflow.insertMany(docs);
    res.json({ status: "success", inserted: docs.length });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    if (req.query.active) filter.active = req.query.active;
    const data = await BudgetCategory.find(filter).sort({ category: 1, type: 1 });
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.saveCategory = async (req, res) => {
  try {
    const payload = { ...req.body, colid: num(req.body.colid) };
    const data = payload.id
      ? await BudgetCategory.findByIdAndUpdate(payload.id, payload, { new: true, runValidators: true })
      : await BudgetCategory.create(payload);
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    await BudgetCategory.findByIdAndDelete(req.body.id);
    res.json({ status: "success" });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.bulkCategories = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.filter((row) => row.category && row.type).map((row) => ({
      ...row,
      colid: num(req.body.colid),
      user: req.body.user
    }));
    if (docs.length) await BudgetCategory.insertMany(docs);
    res.json({ status: "success", inserted: docs.length });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getBudgetItems = async (req, res) => {
  try {
    const data = await BudgetItem.find(itemFilter(req.query)).sort({ createdAt: -1 });
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.saveBudgetItem = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      colid: num(req.body.colid),
      amount: num(req.body.amount, 0),
      utilized: num(req.body.utilized, 0)
    };
    payload.remaining = payload.amount - payload.utilized;
    let data;
    if (payload.id) {
      const existing = await BudgetItem.findById(payload.id);
      if (!existing) return res.status(404).json({ status: "fail", message: "Budget item not found" });
      const matchingLevel = await getMatchingWorkflowLevel(existing, req);
      const allowInstitutionEdit = req.body.allowInstitutionEdit === true
        && existing.stage === "Institution"
        && matchingLevel?.accesslevel === "Edit and Add Items";
      if (existing.status !== "Draft" && !allowInstitutionEdit) {
        return res.status(400).json({ status: "fail", message: "Submitted budget items cannot be edited." });
      }
      const olddata = existing.toObject();
      ["academicyear", "department", "category", "categorytype", "item", "remarks"].forEach((field) => {
        if (payload[field] !== undefined) existing[field] = payload[field];
      });
      if (payload.amount !== undefined) existing.amount = payload.amount;
      if (payload.utilized !== undefined) existing.utilized = payload.utilized;
      existing.remaining = num(existing.amount, 0) - num(existing.utilized, 0);
      data = await existing.save();
      await logAudit(allowInstitutionEdit ? "Institution Edit Item" : "Update Draft Item", data, req, olddata, data.toObject(), req.body.comments || "");
    } else {
      data = await BudgetItem.create({ ...payload, status: "Draft", stage: "Draft", currentlevel: 0 });
      await logAudit("Create Draft Item", data, req, null, data.toObject(), req.body.comments || "");
    }
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteBudgetItem = async (req, res) => {
  try {
    const item = await BudgetItem.findById(req.body.id);
    if (!item) return res.status(404).json({ status: "fail", message: "Budget item not found" });
    if (item.status !== "Draft") {
      return res.status(400).json({ status: "fail", message: "Submitted budget items cannot be deleted." });
    }
    await logAudit("Delete Draft Item", item, req, item.toObject(), null, req.body.comments || "");
    await item.deleteOne();
    res.json({ status: "success" });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.submitBudgetItems = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const items = await BudgetItem.find({ _id: { $in: ids }, colid: num(req.body.colid) });
    for (const item of items) {
      if (item.status !== "Draft") continue;
      const olddata = item.toObject();
      item.submittedby = req.body.useremail || req.body.user || item.submittedby;
      item.submittedbyname = req.body.username || item.submittedbyname;
      item.submittedrole = req.body.role || item.submittedrole;
      await nextDepartmentState(item);
      addHistory(item, "Submit", req, req.body.comments || "");
      await item.save();
      await logAudit("Submit Budget Item", item, req, olddata, item.toObject(), req.body.comments || "");
    }
    res.json({ status: "success", updated: items.length });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getApprovalQueue = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const role = clean(req.query.role);
    const department = clean(req.query.department);
    const stageFilter = clean(req.query.stage);
    const useremail = clean(req.query.useremail || req.query.user);
    const departmentLevels = await DepartmentWorkflow.find({
      colid,
      active: "Yes",
      approverrole: role,
      department: { $in: [department, "All"] }
    }).lean();
    const institutionLevels = await InstitutionWorkflow.find({ colid, active: "Yes", approverrole: role }).lean();
    const matchedDepartmentLevels = departmentLevels.filter((level) => approverMatches(level, useremail));
    const matchedInstitutionLevels = institutionLevels.filter((level) => approverMatches(level, useremail));
    const or = [];
    if (!stageFilter || stageFilter === "Department") {
      matchedDepartmentLevels.forEach((level) => {
        or.push({
          stage: "Department",
          currentlevel: num(level.level, 0),
          department: level.department === "All" ? { $exists: true } : level.department
        });
      });
    }
    if (!stageFilter || stageFilter === "Institution") {
      matchedInstitutionLevels.forEach((level) => {
        or.push({ stage: "Institution", currentlevel: num(level.level, 0) });
      });
    }
    const data = or.length
      ? await BudgetItem.find({ colid, $or: or }).sort({ academicyear: 1, department: 1, category: 1 })
      : [];
    res.json({ status: "success", data, departmentLevels: matchedDepartmentLevels, institutionLevels: matchedInstitutionLevels });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.approveBudgetItem = async (req, res) => {
  try {
    const item = await BudgetItem.findById(req.body.id);
    if (!item) return res.status(404).json({ status: "fail", message: "Budget item not found" });
    const matchingLevel = await getMatchingWorkflowLevel(item, req);
    if (!matchingLevel) {
      return res.status(403).json({ status: "fail", message: "This budget item is not pending for your role and user." });
    }
    const olddata = item.toObject();
    ["academicyear", "department", "category", "categorytype", "item", "remarks"].forEach((field) => {
      if (req.body[field] !== undefined) item[field] = req.body[field];
    });
    if (req.body.amount !== undefined) item.amount = num(req.body.amount, item.amount);
    if (req.body.utilized !== undefined) item.utilized = num(req.body.utilized, item.utilized);
    item.remaining = num(item.amount, 0) - num(item.utilized, 0);
    addHistory(item, "Approve", req, req.body.comments || "");
    await progressItem(item);
    await item.save();
    await logAudit("Approve Budget Item", item, req, olddata, item.toObject(), req.body.comments || "");
    res.json({ status: "success", data: item });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.rejectBudgetItem = async (req, res) => {
  try {
    const item = await BudgetItem.findById(req.body.id);
    if (!item) return res.status(404).json({ status: "fail", message: "Budget item not found" });
    const matchingLevel = await getMatchingWorkflowLevel(item, req);
    if (!matchingLevel) {
      return res.status(403).json({ status: "fail", message: "This budget item is not pending for your role and user." });
    }
    const olddata = item.toObject();
    item.rejectedreason = req.body.comments || "";
    addHistory(item, "Reject", req, req.body.comments || "");
    await regressItem(item);
    await item.save();
    await logAudit("Reject Budget Item", item, req, olddata, item.toObject(), req.body.comments || "");
    res.json({ status: "success", data: item });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.addInstitutionBudgetItem = async (req, res) => {
  try {
    const currentLevel = await InstitutionWorkflow.find({
      colid: num(req.body.colid),
      active: "Yes",
      approverrole: req.body.role
    }).lean();
    const matchingLevel = currentLevel
      .filter((level) => approverMatches(level, req.body.useremail || req.body.user))
      .sort(byLevelAsc)[0];
    const firstInstitutionLevel = matchingLevel || await InstitutionWorkflow.findOne({
      colid: num(req.body.colid),
      active: "Yes"
    }).sort({ level: 1 }).lean();
    const item = await BudgetItem.create({
      ...req.body,
      colid: num(req.body.colid),
      amount: num(req.body.amount, 0),
      utilized: num(req.body.utilized, 0),
      remaining: num(req.body.amount, 0) - num(req.body.utilized, 0),
      stage: firstInstitutionLevel ? "Institution" : "Approved",
      currentlevel: firstInstitutionLevel ? firstInstitutionLevel.level : 0,
      status: firstInstitutionLevel ? `Institution Pending Level ${firstInstitutionLevel.level}` : "Approved",
      submittedby: req.body.useremail || req.body.user,
      submittedbyname: req.body.username,
      submittedrole: req.body.role
    });
    addHistory(item, "Institution Add Item", req, req.body.comments || "");
    await item.save();
    await logAudit("Institution Add Item", item, req, null, item.toObject(), req.body.comments || "");
    res.json({ status: "success", data: item });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    ["academicyear", "department", "category", "categorytype", "stage", "status", "action", "useremail"].forEach((field) => {
      if (req.query[field]) filter[field] = req.query[field];
    });
    const data = await BudgetAuditLog.find(filter).sort({ timeofactivity: -1 }).limit(5000);
    res.json({ status: "success", data });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.storeYearlyBudgetBlockchain = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const academicyear = clean(req.body.academicyear);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!academicyear) return res.status(400).json({ success: false, message: "Academic year is required" });

    const items = await BudgetItem.find({ colid, academicyear, status: "Approved" })
      .sort({ department: 1, category: 1, item: 1 })
      .lean();
    if (!items.length) return res.status(400).json({ success: false, message: "No approved budget items found for this academic year" });

    const departmentSummary = {};
    const categorySummary = {};
    let totalAmount = 0;
    items.forEach((item) => {
      const amount = Number(item.amount || 0);
      totalAmount += amount;
      const department = item.department || "Not specified";
      const category = item.category || "Not specified";
      departmentSummary[department] = (departmentSummary[department] || 0) + amount;
      categorySummary[category] = (categorySummary[category] || 0) + amount;
    });

    const payload = {
      colid,
      academicyear,
      totalitems: items.length,
      totalamount: totalAmount,
      departmentSummary,
      categorySummary,
      items: items.map((item) => ({
        id: String(item._id),
        academicyear: item.academicyear,
        department: item.department,
        category: item.category,
        categorytype: item.categorytype,
        item: item.item,
        amount: item.amount,
        utilized: item.utilized || 0,
        remaining: num(item.amount, 0) - num(item.utilized, 0),
        status: item.status,
        approvedat: item.approvedat,
        submittedbyname: item.submittedbyname,
        submittedby: item.submittedby,
        remarks: item.remarks
      })),
      storedAt: new Date().toISOString()
    };

    const block = await appendBlock({
      colid,
      modelname: "newbudgetyearlybudget",
      collectionname: "newbudgetitemds",
      recordid: `newbudget:${colid}:${academicyear}`,
      action: "YEARLY_BUDGET_STORE",
      payload,
      metadata: {
        academicyear,
        totalitems: items.length,
        totalamount: totalAmount,
        storedby: req.body.username || req.body.user || ""
      },
      user: req.body.user || req.body.useremail || ""
    });

    const origin = clean(req.body.origin) || "";
    const verificationurl = origin
      ? `${origin}/verify-budget-blockchain?colid=${encodeURIComponent(colid)}&academicyear=${encodeURIComponent(academicyear)}&hash=${encodeURIComponent(block.hash)}`
      : "";

    res.json({ success: true, message: "Yearly budget stored in blockchain", data: { ...block.toObject(), verificationurl } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyYearlyBudgetBlockchain = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const academicyear = clean(req.query.academicyear);
    const hash = clean(req.query.hash);
    const filter = { modelname: "newbudgetyearlybudget" };
    if (colid !== undefined) filter.colid = colid;
    if (academicyear) filter.recordid = `newbudget:${colid}:${academicyear}`;
    if (hash) filter.hash = hash;

    const block = await BlockchainLedger.findOne(filter).sort({ timestamp: -1 }).lean();
    if (!block) return res.status(404).json({ success: false, message: "Budget blockchain record not found" });

    res.json({
      success: true,
      verified: true,
      data: {
        blockindex: block.blockindex,
        hash: block.hash,
        previoushash: block.previoushash,
        timestamp: block.timestamp,
        user: block.user,
        metadata: block.metadata,
        payload: block.payload
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
