const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const mongoose = require("mongoose");
const DepartmentWorkflow = require("../Models/purchasenewdepartmentworkflowds");
const InstitutionWorkflow = require("../Models/purchasenewinstitutionworkflowds");
const PurchaseIndent = require("../Models/purchasenewindentds");
const PurchaseIndentAudit = require("../Models/purchasenewindentauditds");
const PurchaseApprovalWorkflow = require("../Models/purchasenewapprovalworkflowds");
const PurchaseCategoryOfficer = require("../Models/purchasenewcategoryofficerds");
const PurchaseRfp = require("../Models/purchasenewrfpds");
const PurchaseNewVendor = require("../Models/purchasenewvendords");
const PurchaseNewRfpVendor = require("../Models/purchasenewrfpvendords");
const PurchaseNewVendorSignatory = require("../Models/purchasenewvendorsignatoryds");
const PurchaseNewRfpSubmission = require("../Models/purchasenewrfpsubmissionds");
const PurchaseNewPurchaseOrder = require("../Models/purchasenewpurchaseorderds");
const PurchaseNewDeliverySchedule = require("../Models/purchasenewdeliveryscheduleds");
const PurchaseNewInvoice = require("../Models/purchasenewinvoiceds");
const BudgetCategory = require("../Models/newbudgetcategoryds");
const BudgetItem = require("../Models/newbudgetitemds");
const User = require("../Models/user");
const BlockchainLedger = require("../Models/blockchainledgerds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Awsconfig = require("../Models/awsconfig");
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
const workflowTypes = ["PurchaseOrder", "FinancePayment", "RFP"];
const upload = multer({ storage: multer.memoryStorage() });

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const uploadToDefaultAws = async (colid, file, folder) => {
  const config = await Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
    throw new Error("Default AWS configuration is missing or incomplete");
  }
  const cleanName = path.basename(file.originalname || "document").replace(/[^\w.\-() ]/g, "_");
  const key = `${colid}/purchase-new/${folder}/${Date.now()}-${cleanName}`;
  const s3 = new AWS.S3({
    accessKeyId: config.username,
    secretAccessKey: config.password,
    region: config.region
  });
  await s3.putObject({
    Bucket: config.bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || "application/octet-stream"
  }).promise();
  return { filename: cleanName, key, url: s3Url(config.bucket, config.region, key) };
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

const genericWorkflowPayload = (body) => ({
  colid: num(body.colid),
  workflowtype: clean(body.workflowtype),
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

const logGenericAudit = async (action, source, req, comments = "", olddata = null, newdata = null) => {
  await PurchaseIndentAudit.create({
    colid: source.colid,
    indentid: source._id,
    department: source.department || "",
    category: source.category || "",
    categorytype: source.categorytype || "",
    item: source.title || source.item || "",
    action,
    status: source.status,
    stage: source.stage,
    level: source.currentlevel,
    comments,
    username: req.body.username || req.query.username || source.createdbyname || "",
    useremail: req.body.useremail || req.query.useremail || req.body.user || req.query.user || source.createdby || "",
    role: req.body.role || req.query.role || "",
    olddata,
    newdata
  });
};

const addRfpHistory = (item, action, req, comments = "") => {
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

const firstGenericState = async (item, workflowtype) => {
  const levels = await PurchaseApprovalWorkflow.find({ colid: item.colid, workflowtype, active: "Yes" }).lean();
  levels.sort(byLevelAsc);
  if (levels.length) {
    item.stage = workflowtype;
    item.currentlevel = num(levels[0].level, 1);
    item.status = `${workflowtype} Pending Level ${item.currentlevel}`;
    return;
  }
  item.stage = "Approved";
  item.currentlevel = 0;
  item.status = "Approved";
  item.approvedat = new Date();
};

const progressGeneric = async (item, workflowtype) => {
  const levels = await PurchaseApprovalWorkflow.find({ colid: item.colid, workflowtype, active: "Yes" }).lean();
  const next = levels.filter((level) => num(level.level, 0) > num(item.currentlevel, 0)).sort(byLevelAsc)[0];
  if (next) {
    item.stage = workflowtype;
    item.currentlevel = num(next.level, item.currentlevel);
    item.status = `${workflowtype} Pending Level ${item.currentlevel}`;
    return;
  }
  item.stage = "Approved";
  item.currentlevel = 0;
  item.status = "Approved";
  item.approvedat = new Date();
};

const regressGeneric = async (item, workflowtype) => {
  const levels = await PurchaseApprovalWorkflow.find({ colid: item.colid, workflowtype, active: "Yes" }).lean();
  const previous = levels.filter((level) => num(level.level, 0) < num(item.currentlevel, 0)).sort(byLevelDesc)[0];
  if (previous) {
    item.stage = workflowtype;
    item.currentlevel = num(previous.level, item.currentlevel);
    item.status = `${workflowtype} Pending Level ${item.currentlevel}`;
    return;
  }
  item.stage = "Rejected";
  item.currentlevel = 0;
  item.status = "Rejected";
};

const matchingGenericLevel = async (item, req, workflowtype) => {
  const role = clean(req.body.role || req.query.role);
  const useremail = clean(req.body.useremail || req.query.useremail || req.body.user || req.query.user);
  const levels = await PurchaseApprovalWorkflow.find({ colid: item.colid, workflowtype, active: "Yes", approverrole: role }).lean();
  return levels.find((level) => num(level.level, 0) === num(item.currentlevel, 0) && approverMatches(level, useremail)) || null;
};

const getGeminiConfig = async (colid) => AiConfiguration.findOne({
  colid,
  type: /^Gemini$/i,
  active: /^Yes$/i,
  default: /^Yes$/i
}).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({ colid, type: /^Gemini$/i, active: /^Yes$/i }).sort({ _id: -1 }).lean();

const getOllamaConfig = async (colid, configId) => {
  const base = { colid, active: /^Yes$/i };
  if (clean(configId)) {
    const selected = await OllamaConfiguration.findOne({ ...base, _id: configId }).lean();
    if (selected) return selected;
  }
  return OllamaConfiguration.findOne({ ...base, default: /^Yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne(base).sort({ _id: -1 }).lean();
};

const readGeminiText = (payload = {}) => payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
const stripJson = (value) => clean(value).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
const parseAiJson = (value) => {
  const raw = stripJson(value);
  try { return JSON.parse(raw); } catch { return { item: "", description: raw }; }
};

const callGeminiJson = async (apikey, model, prompt) => {
  const models = [clean(model) || "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter((item, index, arr) => item && arr.indexOf(item) === index);
  let lastError = "";
  for (const selected of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selected}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, responseMimeType: "application/json" }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return parseAiJson(readGeminiText(data));
    lastError = data.error?.message || `Gemini failed for ${selected}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllamaJson = async (config, prompt) => {
  const server = clean(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const model = clean(config.modelname);
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, format: "json", options: { temperature: 0.25 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ollama request failed at ${server}`);
  return parseAiJson(data.response || "");
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

exports.storeEmployeeApprovedIndentsBlockchain = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const employeeemail = clean(req.body.employeeemail || req.body.submittedby);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!employeeemail) return res.status(400).json({ success: false, message: "employee email is required" });
    const indents = await PurchaseIndent.find({ colid, status: "Approved", submittedby: employeeemail }).sort({ approvedat: 1, createdAt: 1 }).lean();
    if (!indents.length) return res.status(404).json({ success: false, message: "No approved indents found for this employee" });
    const employeeName = indents[0].submittedbyname || employeeemail;
    const recordid = `approved-indent-employee:${colid}:${employeeemail}`;
    const payload = {
      employeeemail,
      employeename: employeeName,
      totalcount: indents.length,
      totalamount: indents.reduce((sum, item) => sum + num(item.approximatetotalcost, 0), 0),
      indents,
      storedAt: new Date().toISOString()
    };
    const block = await appendBlock({
      colid,
      modelname: "purchasenewapprovedindentemployee",
      collectionname: "purchasenewindentds",
      recordid,
      action: "EMPLOYEE_APPROVED_INDENTS_STORE",
      payload,
      metadata: {
        employeeemail,
        employeename: employeeName,
        count: payload.totalcount,
        amount: payload.totalamount
      },
      user: req.body.user || req.body.useremail || ""
    });
    res.json({ success: true, message: "Employee-wise approved indents stored in blockchain", data: block });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyEmployeeApprovedIndentsBlockchain = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const employeeemail = clean(req.query.employeeemail || req.query.submittedby);
    const hash = clean(req.query.hash);
    const query = { modelname: "purchasenewapprovedindentemployee" };
    if (colid !== undefined) query.colid = colid;
    if (hash) query.hash = hash;
    if (employeeemail) query.recordid = `approved-indent-employee:${colid}:${employeeemail}`;
    const data = await BlockchainLedger.find(query).sort({ timestamp: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getGenericWorkflow = async (req, res) => {
  try {
    const workflowtype = clean(req.query.workflowtype);
    if (!workflowTypes.includes(workflowtype)) return res.status(400).json({ success: false, message: "Invalid workflow type" });
    const data = await PurchaseApprovalWorkflow.find({ colid: num(req.query.colid), workflowtype }).sort({ level: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveGenericWorkflow = async (req, res) => {
  try {
    const payload = genericWorkflowPayload(req.body);
    if (!workflowTypes.includes(payload.workflowtype)) return res.status(400).json({ success: false, message: "Invalid workflow type" });
    if (!payload.approverrole) return res.status(400).json({ success: false, message: "Approver role is required" });
    const data = req.body.id
      ? await PurchaseApprovalWorkflow.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await PurchaseApprovalWorkflow.create(payload);
    await PurchaseIndentAudit.create({
      colid: payload.colid,
      action: `${req.body.id ? "Update" : "Create"} ${payload.workflowtype} Workflow`,
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

exports.deleteGenericWorkflow = async (req, res) => {
  try {
    const data = await PurchaseApprovalWorkflow.findByIdAndDelete(req.body.id);
    if (data) {
      await PurchaseIndentAudit.create({
        colid: data.colid,
        action: `Delete ${data.workflowtype} Workflow`,
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

exports.getCategoryOfficers = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid) };
    ["category", "categorytype", "officeremail", "active"].forEach((field) => {
      if (req.query[field]) filter[field] = req.query[field];
    });
    const data = await PurchaseCategoryOfficer.find(filter).sort({ category: 1, officername: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveCategoryOfficer = async (req, res) => {
  try {
    const payload = {
      colid: num(req.body.colid),
      category: clean(req.body.category),
      categorytype: clean(req.body.categorytype),
      officername: clean(req.body.officername),
      officeremail: clean(req.body.officeremail),
      active: clean(req.body.active) || "Yes",
      remarks: clean(req.body.remarks),
      user: clean(req.body.user)
    };
    if (!payload.category || !payload.officeremail) return res.status(400).json({ success: false, message: "Category and officer email are required" });
    const data = req.body.id
      ? await PurchaseCategoryOfficer.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await PurchaseCategoryOfficer.create(payload);
    await PurchaseIndentAudit.create({
      colid: payload.colid,
      category: payload.category,
      categorytype: payload.categorytype,
      action: req.body.id ? "Update Category Purchase Officer" : "Create Category Purchase Officer",
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

exports.deleteCategoryOfficer = async (req, res) => {
  try {
    const data = await PurchaseCategoryOfficer.findByIdAndDelete(req.body.id);
    if (data) await logGenericAudit("Delete Category Purchase Officer", data, req, "", data, null);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getOfficerApprovedIndents = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const officeremail = clean(req.query.officeremail || req.query.useremail || req.query.user);
    const view = clean(req.query.view || "all");
    const submittedby = clean(req.query.submittedby);
    const officerRows = await PurchaseCategoryOfficer.find({ colid, officeremail, active: "Yes" }).lean();
    const categories = officerRows.map((row) => row.category).filter(Boolean);
    if (!categories.length) return res.json({ success: true, data: [], employees: [], officerCategories: [] });
    const filter = { colid, status: "Approved", procurementstatus: { $ne: "RFP Created" } };
    filter.category = { $in: categories };
    if (view === "employee" && submittedby) filter.submittedby = submittedby;
    const data = await PurchaseIndent.find(filter).sort({ createdAt: -1 }).lean();
    const employees = await PurchaseIndent.find({ colid, status: "Approved", category: filter.category || { $exists: true } })
      .select("submittedby submittedbyname")
      .lean();
    const uniqueEmployees = [...new Map(employees.filter((row) => row.submittedby).map((row) => [row.submittedby, { email: row.submittedby, name: row.submittedbyname || row.submittedby }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data, employees: uniqueEmployees, officerCategories: categories });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.refineIndentWithAi = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const prompt = [
      "Rewrite a purchase indent item and description for a formal Request for Proposal.",
      "Return valid JSON only: {\"item\":\"short item title\",\"description\":\"clear RFP-ready description\"}.",
      `Instruction: ${clean(req.body.instruction) || "Make it precise, vendor-neutral and technically clear."}`,
      `Current item: ${clean(req.body.item)}`,
      `Current description: ${clean(req.body.description)}`
    ].join("\n");
    let output;
    if (clean(req.body.provider).toLowerCase() === "ollama") {
      const config = await getOllamaConfig(colid, req.body.ollamaConfigId);
      if (!config) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      output = await callOllamaJson(config, prompt);
    } else {
      const config = await getGeminiConfig(colid);
      if (!config?.apikey) return res.status(400).json({ success: false, message: "Active Gemini configuration is missing" });
      output = await callGeminiJson(config.apikey, req.body.geminiModel, prompt);
    }
    res.json({ success: true, data: { item: clean(output.item) || clean(req.body.item), description: clean(output.description) || clean(req.body.description) } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.refineRfpTermsWithAi = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const terms = req.body.terms || {};
    const selectedItems = Array.isArray(req.body.items) ? req.body.items : [];
    const prompt = [
      "Rewrite the following Request for Proposal terms into clear, formal, vendor-neutral procurement language.",
      "Return valid JSON only with these exact keys: qualificationcriteria, experience, paymentterms, refundterms, deliveryterms, terms.",
      "Keep the meaning and any numbers/dates entered by the user. If any field is blank, draft a reasonable short clause based on the supplied rules and RFP item context.",
      `User rules: ${clean(req.body.rules) || "Use standard institutional procurement language."}`,
      `RFP title: ${clean(req.body.title)}`,
      `Items: ${JSON.stringify(selectedItems.map((item) => ({ item: clean(item.item), description: clean(item.description), quantity: item.quantity, approximatetotalcost: item.approximatetotalcost })).slice(0, 25))}`,
      `Qualification criteria: ${clean(terms.qualificationcriteria)}`,
      `Experience: ${clean(terms.experience)}`,
      `Payment terms: ${clean(terms.paymentterms)}`,
      `Refund terms: ${clean(terms.refundterms)}`,
      `Delivery terms: ${clean(terms.deliveryterms)}`,
      `Other terms: ${clean(terms.terms)}`
    ].join("\n");
    let output;
    if (clean(req.body.provider).toLowerCase() === "ollama") {
      const config = await getOllamaConfig(colid, req.body.ollamaConfigId);
      if (!config) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      output = await callOllamaJson(config, prompt);
    } else {
      const config = await getGeminiConfig(colid);
      if (!config?.apikey) return res.status(400).json({ success: false, message: "Active Gemini configuration is missing" });
      output = await callGeminiJson(config.apikey, req.body.geminiModel, prompt);
    }
    res.json({
      success: true,
      data: {
        qualificationcriteria: clean(output.qualificationcriteria) || clean(terms.qualificationcriteria),
        experience: clean(output.experience) || clean(terms.experience),
        paymentterms: clean(output.paymentterms) || clean(terms.paymentterms),
        refundterms: clean(output.refundterms) || clean(terms.refundterms),
        deliveryterms: clean(output.deliveryterms) || clean(terms.deliveryterms),
        terms: clean(output.terms) || clean(terms.terms)
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.uploadRfpDocumentMiddleware = upload.single("document");

exports.uploadRfpDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select a document to upload" });
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const config = await Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is missing or incomplete" });
    }
    const cleanName = path.basename(req.file.originalname || "document").replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/purchase-new/rfp-documents/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({
      accessKeyId: config.username,
      secretAccessKey: config.password,
      region: config.region
    });
    await s3.putObject({
      Bucket: config.bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || "application/octet-stream"
    }).promise();
    res.json({
      success: true,
      data: {
        documenttype: clean(req.body.documenttype) || "RFP Document",
        description: clean(req.body.description),
        filename: cleanName,
        key,
        url: s3Url(config.bucket, config.region, key),
        uploadedby: clean(req.body.user || req.body.useremail)
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getRfps = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    ["status", "stage", "category", "officeremail", "rfpid"].forEach((field) => {
      if (req.query[field]) filter[field] = req.query[field];
    });
    const data = await PurchaseRfp.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.createRfp = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const indentids = Array.isArray(req.body.indentids) ? req.body.indentids.filter(Boolean) : [];
    if (!indentids.length) return res.status(400).json({ success: false, message: "Select at least one indent" });
    const indents = await PurchaseIndent.find({ _id: { $in: indentids }, colid, status: "Approved" });
    if (!indents.length) return res.status(400).json({ success: false, message: "No approved indents found" });
    const editedItems = Array.isArray(req.body.items) ? req.body.items : [];
    const editedMap = new Map(editedItems.map((item) => [String(item.indentid || item._id), item]));
    const count = await PurchaseRfp.countDocuments({ colid });
    const rfpid = clean(req.body.rfpid) || `RFP-${colid}-${String(count + 1).padStart(5, "0")}`;
    const first = indents[0];
    const rfp = await PurchaseRfp.create({
      colid,
      rfpid,
      title: clean(req.body.title) || rfpid,
      category: clean(req.body.category) || first.category,
      categorytype: clean(req.body.categorytype) || first.categorytype,
      officername: clean(req.body.officername || req.body.username),
      officeremail: clean(req.body.officeremail || req.body.useremail || req.body.user),
      indentids: indents.map((item) => item._id),
      items: indents.map((indent) => {
        const edited = editedMap.get(String(indent._id)) || {};
        return {
          indentid: indent._id,
          department: indent.department,
          requestedby: indent.submittedby,
          requestedbyname: indent.submittedbyname,
          item: clean(edited.item) || indent.item,
          description: clean(edited.description) || indent.description,
          originalitem: indent.item,
          originaldescription: indent.description,
          quantity: indent.quantity,
          approximatevalue: indent.approximatevalue,
          approximatetotalcost: indent.approximatetotalcost
        };
      }),
      qualificationcriteria: clean(req.body.qualificationcriteria),
      experience: clean(req.body.experience),
      startdatetime: req.body.startdatetime || null,
      enddatetime: req.body.enddatetime || null,
      minimumbid: num(req.body.minimumbid, 0),
      cautiondeposit: num(req.body.cautiondeposit, 0),
      paymentterms: clean(req.body.paymentterms),
      refundterms: clean(req.body.refundterms),
      deliveryterms: clean(req.body.deliveryterms),
      terms: clean(req.body.terms),
      documents: Array.isArray(req.body.documents) ? req.body.documents.map((doc) => ({
        documenttype: clean(doc.documenttype) || "RFP Document",
        description: clean(doc.description),
        filename: clean(doc.filename),
        url: clean(doc.url),
        key: clean(doc.key),
        uploadedby: clean(doc.uploadedby || req.body.useremail || req.body.user)
      })).filter((doc) => doc.url) : [],
      createdby: clean(req.body.useremail || req.body.user),
      createdbyname: clean(req.body.username)
    });
    await firstGenericState(rfp, "RFP");
    addRfpHistory(rfp, "Create RFP", req, "RFP created and submitted for approval");
    await rfp.save();
    await PurchaseIndent.updateMany({ _id: { $in: indentids }, colid }, { $set: { procurementstatus: "RFP Created", rfpid } });
    await logGenericAudit("Create RFP", rfp, req, "RFP created", null, rfp.toObject());
    res.json({ success: true, data: rfp });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getRfpApprovalQueue = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const role = clean(req.query.role);
    const useremail = clean(req.query.useremail || req.query.user);
    const levels = await PurchaseApprovalWorkflow.find({ colid, workflowtype: "RFP", active: "Yes", approverrole: role }).lean();
    const ors = levels.filter((level) => approverMatches(level, useremail)).map((level) => ({ stage: "RFP", currentlevel: num(level.level, 0) }));
    const data = ors.length ? await PurchaseRfp.find({ colid, $or: ors }).sort({ createdAt: 1 }).lean() : [];
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.approveRfp = async (req, res) => {
  try {
    const item = await PurchaseRfp.findById(req.body.id);
    if (!item) return res.status(404).json({ success: false, message: "RFP not found" });
    const level = await matchingGenericLevel(item, req, "RFP");
    if (!level) return res.status(403).json({ success: false, message: "This RFP is not pending for your role and user" });
    const olddata = item.toObject();
    addRfpHistory(item, "Approve", req, req.body.comments || "Approved");
    await progressGeneric(item, "RFP");
    await item.save();
    await logGenericAudit("Approve RFP", item, req, req.body.comments || "Approved", olddata, item.toObject());
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.rejectRfp = async (req, res) => {
  try {
    const item = await PurchaseRfp.findById(req.body.id);
    if (!item) return res.status(404).json({ success: false, message: "RFP not found" });
    const level = await matchingGenericLevel(item, req, "RFP");
    if (!level) return res.status(403).json({ success: false, message: "This RFP is not pending for your role and user" });
    const olddata = item.toObject();
    item.rejectedreason = clean(req.body.comments);
    addRfpHistory(item, "Reject", req, req.body.comments || "");
    await regressGeneric(item, "RFP");
    await item.save();
    await logGenericAudit("Reject RFP", item, req, req.body.comments || "", olddata, item.toObject());
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.storeRfpBlockchain = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const id = clean(req.body.id || req.body.rfpid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!id) return res.status(400).json({ success: false, message: "RFP id is required" });
    const rfp = await PurchaseRfp.findOne({ colid, $or: [{ _id: id }, { rfpid: id }] }).lean();
    if (!rfp) return res.status(404).json({ success: false, message: "RFP not found" });
    const payload = { rfp, storedAt: new Date().toISOString() };
    const block = await appendBlock({
      colid,
      modelname: "purchasenewrfp",
      collectionname: "purchasenewrfpds",
      recordid: String(rfp._id),
      action: "RFP_STORE",
      payload,
      metadata: {
        rfpid: rfp.rfpid,
        title: rfp.title,
        status: rfp.status,
        category: rfp.category
      },
      user: req.body.user || req.body.useremail || ""
    });
    res.json({ success: true, message: "RFP stored in blockchain", data: block });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyRfpBlockchain = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const hash = clean(req.query.hash);
    const recordid = clean(req.query.recordid || req.query.id);
    const query = { modelname: "purchasenewrfp" };
    if (colid !== undefined) query.colid = colid;
    if (hash) query.hash = hash;
    if (recordid) query.recordid = recordid;
    const data = await BlockchainLedger.find(query).sort({ timestamp: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.storeApprovedRfpsBlockchain = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid, status: "Approved" };
    if (req.body.fromdate || req.body.todate) {
      filter.approvedat = {};
      if (req.body.fromdate) filter.approvedat.$gte = new Date(req.body.fromdate);
      if (req.body.todate) {
        const to = new Date(req.body.todate);
        to.setHours(23, 59, 59, 999);
        filter.approvedat.$lte = to;
      }
    }
    const queryFilters = req.body.filters || {};
    ["rfpid", "title", "category", "categorytype", "officername", "officeremail"].forEach((field) => {
      if (queryFilters[field]) filter[field] = new RegExp(clean(queryFilters[field]), "i");
    });
    const rfps = await PurchaseRfp.find(filter).sort({ approvedat: -1, createdAt: -1 }).lean();
    if (!rfps.length) return res.status(404).json({ success: false, message: "No approved RFPs found for selected filters" });
    const payload = {
      reporttype: "Approved RFPs",
      colid,
      fromdate: clean(req.body.fromdate),
      todate: clean(req.body.todate),
      filters: queryFilters,
      totalcount: rfps.length,
      totalminimumbid: rfps.reduce((sum, item) => sum + num(item.minimumbid, 0), 0),
      totalcautiondeposit: rfps.reduce((sum, item) => sum + num(item.cautiondeposit, 0), 0),
      rfps,
      storedAt: new Date().toISOString()
    };
    const recordid = `approved-rfps:${colid}:${Date.now()}`;
    const block = await appendBlock({
      colid,
      modelname: "purchasenewapprovedrfps",
      collectionname: "purchasenewrfpds",
      recordid,
      action: "APPROVED_RFPS_REPORT_STORE",
      payload,
      metadata: {
        reporttype: payload.reporttype,
        totalcount: payload.totalcount,
        fromdate: payload.fromdate,
        todate: payload.todate
      },
      user: req.body.user || req.body.useremail || ""
    });
    res.json({ success: true, message: "Approved RFP report stored in blockchain", data: block });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyApprovedRfpsBlockchain = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const hash = clean(req.query.hash);
    const recordid = clean(req.query.recordid || req.query.id);
    const query = { modelname: "purchasenewapprovedrfps" };
    if (colid !== undefined) query.colid = colid;
    if (hash) query.hash = hash;
    if (recordid) query.recordid = recordid;
    const data = await BlockchainLedger.find(query).sort({ timestamp: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getVendors = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid) };
    ["companyname", "type", "username", "status", "gstno", "panno"].forEach((field) => {
      if (req.query[field]) filter[field] = new RegExp(clean(req.query[field]), "i");
    });
    const data = await PurchaseNewVendor.find(filter).sort({ companyname: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveVendor = async (req, res) => {
  try {
    const payload = {
      colid: num(req.body.colid),
      companyname: clean(req.body.companyname),
      type: clean(req.body.type) || "Pvt Ltd",
      address: clean(req.body.address),
      gstno: clean(req.body.gstno),
      panno: clean(req.body.panno),
      tanno: clean(req.body.tanno),
      contactperson: clean(req.body.contactperson),
      contactemail: clean(req.body.contactemail),
      contactphone: clean(req.body.contactphone),
      username: clean(req.body.username),
      password: clean(req.body.password),
      status: clean(req.body.status) || "Active",
      remarks: clean(req.body.remarks),
      createdby: clean(req.body.user || req.body.useremail),
      createdbyname: clean(req.body.username1 || req.body.createdbyname)
    };
    if (payload.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.companyname) return res.status(400).json({ success: false, message: "Company name is required" });
    if (!payload.username) return res.status(400).json({ success: false, message: "Username is required" });
    if (!payload.password) return res.status(400).json({ success: false, message: "Password is required" });
    const duplicate = await PurchaseNewVendor.findOne({ colid: payload.colid, username: payload.username, ...(req.body.id ? { _id: { $ne: req.body.id } } : {}) }).lean();
    if (duplicate) return res.status(400).json({ success: false, message: "Vendor username already exists" });
    const data = req.body.id
      ? await PurchaseNewVendor.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await PurchaseNewVendor.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    const assigned = await PurchaseNewRfpVendor.countDocuments({ vendor: req.body.id });
    if (assigned) return res.status(400).json({ success: false, message: "Vendor is assigned to an RFP. Remove assignments first." });
    await PurchaseNewVendor.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getRfpVendorAssignments = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid) };
    ["rfpid", "vendorname", "vendorusername", "status"].forEach((field) => {
      if (req.query[field]) filter[field] = new RegExp(clean(req.query[field]), "i");
    });
    const data = await PurchaseNewRfpVendor.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.assignRfpVendors = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const rfpId = clean(req.body.rfpId || req.body.rfp || req.body.id);
    const vendorIds = Array.isArray(req.body.vendorIds) ? req.body.vendorIds.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!rfpId) return res.status(400).json({ success: false, message: "Select one RFP" });
    if (!vendorIds.length) return res.status(400).json({ success: false, message: "Select at least one vendor" });
    const rfp = await PurchaseRfp.findOne({ colid, $or: [{ _id: rfpId }, { rfpid: rfpId }] }).lean();
    if (!rfp) return res.status(404).json({ success: false, message: "RFP not found" });
    const vendors = await PurchaseNewVendor.find({ colid, _id: { $in: vendorIds }, status: /^Active$/i }).lean();
    if (!vendors.length) return res.status(400).json({ success: false, message: "No active vendors found for assignment" });
    const saved = [];
    for (const vendor of vendors) {
      const data = await PurchaseNewRfpVendor.findOneAndUpdate(
        { colid, rfpid: rfp.rfpid, vendor: vendor._id },
        {
          colid,
          rfp: rfp._id,
          rfpid: rfp.rfpid,
          rfptitle: rfp.title,
          vendor: vendor._id,
          vendorname: vendor.companyname,
          vendorusername: vendor.username,
          vendoremail: vendor.contactemail,
          vendorphone: vendor.contactphone,
          status: "Assigned",
          assignedby: clean(req.body.user || req.body.useremail),
          assignedbyname: clean(req.body.username || req.body.name),
          assignedat: new Date(),
          remarks: clean(req.body.remarks)
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved.push(data);
    }
    res.json({ success: true, data: saved, message: `${saved.length} vendor(s) assigned to RFP` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteRfpVendorAssignment = async (req, res) => {
  try {
    await PurchaseNewRfpVendor.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.vendorLogin = async (req, res) => {
  try {
    const colid = num(req.body.colid || req.query.colid);
    const username = clean(req.body.username || req.query.username);
    const password = clean(req.body.password || req.query.password);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!username || !password) return res.status(400).json({ success: false, message: "Username and password are required" });
    const vendor = await PurchaseNewVendor.findOne({ colid, username, password, status: /^Active$/i }).lean();
    if (!vendor) return res.status(401).json({ success: false, message: "Invalid vendor login" });
    res.json({ success: true, data: vendor });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getVendorPortalProfile = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const username = clean(req.query.vendorusername || req.query.username);
    const vendor = await PurchaseNewVendor.findOne({ colid, username }).lean();
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });
    const signatories = await PurchaseNewVendorSignatory.find({ colid, vendor: vendor._id }).sort({ name: 1 }).lean();
    res.json({ success: true, data: { vendor, signatories } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateVendorPortalProfile = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const username = clean(req.body.vendorusername || req.body.username);
    const vendor = await PurchaseNewVendor.findOne({ colid, username });
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });
    ["companyname", "type", "address", "gstno", "panno", "tanno", "contactperson", "contactemail", "contactphone", "specialization", "pastrecords", "bankdetails", "remarks"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) vendor[field] = clean(req.body[field]);
    });
    if (clean(req.body.password)) vendor.password = clean(req.body.password);
    await vendor.save();
    res.json({ success: true, data: vendor });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.uploadVendorDocumentMiddleware = upload.single("document");

exports.uploadVendorDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select a document to upload" });
    const colid = num(req.body.colid);
    const vendor = await PurchaseNewVendor.findOne({ colid, username: clean(req.body.vendorusername || req.body.username) });
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });
    const uploaded = await uploadToDefaultAws(colid, req.file, "vendor-documents");
    const doc = {
      documenttype: clean(req.body.documenttype) || "Vendor Document",
      description: clean(req.body.description),
      ...uploaded
    };
    vendor.documents = vendor.documents || [];
    vendor.documents.push(doc);
    await vendor.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveVendorSignatory = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const vendor = await PurchaseNewVendor.findOne({ colid, username: clean(req.body.vendorusername || req.body.username) }).lean();
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });
    const payload = {
      colid,
      vendor: vendor._id,
      vendorusername: vendor.username,
      vendorname: vendor.companyname,
      name: clean(req.body.name),
      designation: clean(req.body.designation),
      email: clean(req.body.email),
      phone: clean(req.body.phone),
      pannumber: clean(req.body.pannumber),
      aadhaar: clean(req.body.aadhaar),
      authorizationdetails: clean(req.body.authorizationdetails),
      status: clean(req.body.status) || "Active"
    };
    if (!payload.name) return res.status(400).json({ success: false, message: "Signatory name is required" });
    const data = req.body.id
      ? await PurchaseNewVendorSignatory.findOneAndUpdate({ _id: req.body.id, vendor: vendor._id }, payload, { new: true, runValidators: true })
      : await PurchaseNewVendorSignatory.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteVendorSignatory = async (req, res) => {
  try {
    await PurchaseNewVendorSignatory.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.uploadVendorSignatoryDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select a document to upload" });
    const signatory = await PurchaseNewVendorSignatory.findById(req.body.signatoryid || req.body.id);
    if (!signatory) return res.status(404).json({ success: false, message: "Signatory not found" });
    const uploaded = await uploadToDefaultAws(signatory.colid, req.file, "vendor-signatory-documents");
    const doc = {
      documenttype: clean(req.body.documenttype) || "Signatory Document",
      description: clean(req.body.description),
      ...uploaded
    };
    signatory.documents = signatory.documents || [];
    signatory.documents.push(doc);
    await signatory.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getVendorAssignedRfps = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const username = clean(req.query.vendorusername || req.query.username);
    const assignments = await PurchaseNewRfpVendor.find({ colid, vendorusername: username }).sort({ assignedat: -1 }).lean();
    const rfpIds = assignments.map((item) => item.rfp).filter(Boolean);
    const rfps = await PurchaseRfp.find({ colid, _id: { $in: rfpIds }, status: "Approved" }).lean();
    const submissions = await PurchaseNewRfpSubmission.find({ colid, vendorusername: username, rfp: { $in: rfpIds } }).lean();
    const submissionByRfp = new Map(submissions.map((item) => [String(item.rfp), item]));
    const now = Date.now();
    const data = rfps.map((rfp) => {
      const start = rfp.startdatetime ? new Date(rfp.startdatetime).getTime() : 0;
      const end = rfp.enddatetime ? new Date(rfp.enddatetime).getTime() : 0;
      return {
        ...rfp,
        assignment: assignments.find((item) => String(item.rfp) === String(rfp._id)),
        submission: submissionByRfp.get(String(rfp._id)) || null,
        withinTimeline: (!start || now >= start) && (!end || now <= end)
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const calculateBidItems = (items = []) => {
  let subtotal = 0;
  let gsttotal = 0;
  let grandtotal = 0;
  const mapped = items.map((item, index) => {
    const quantity = num(item.quantity, 0);
    const unitprice = num(item.unitprice, 0);
    const itemCost = quantity * unitprice;
    const gstpercent = num(item.gstpercent, 0);
    const gstamount = itemCost * gstpercent / 100;
    const freightcost = num(item.freightcost, 0);
    const loadingcost = num(item.loadingcost, 0);
    const customscost = num(item.customscost, 0);
    const installationcost = num(item.installationcost, 0);
    const othercost = num(item.othercost, 0);
    const total = itemCost + gstamount + freightcost + loadingcost + customscost + installationcost + othercost;
    subtotal += itemCost;
    gsttotal += gstamount;
    grandtotal += total;
    return {
      rfpitemindex: num(item.rfpitemindex, index),
      item: clean(item.item),
      description: clean(item.description),
      quantity,
      unitprice,
      gstpercent,
      gstamount,
      freightcost,
      loadingcost,
      customscost,
      installationcost,
      othercost,
      total
    };
  });
  return { items: mapped, subtotal, gsttotal, grandtotal };
};

exports.saveVendorRfpSubmission = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const username = clean(req.body.vendorusername || req.body.username);
    const vendor = await PurchaseNewVendor.findOne({ colid, username }).lean();
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });
    const rfp = await PurchaseRfp.findOne({ colid, $or: [{ _id: clean(req.body.rfp) }, { rfpid: clean(req.body.rfpid) }] }).lean();
    if (!rfp) return res.status(404).json({ success: false, message: "RFP not found" });
    const now = Date.now();
    if (rfp.startdatetime && now < new Date(rfp.startdatetime).getTime()) return res.status(400).json({ success: false, message: "RFP submission has not started yet" });
    if (rfp.enddatetime && now > new Date(rfp.enddatetime).getTime()) return res.status(400).json({ success: false, message: "RFP submission timeline is over" });
    const assignment = await PurchaseNewRfpVendor.findOne({ colid, rfp: rfp._id, vendor: vendor._id }).lean();
    if (!assignment) return res.status(403).json({ success: false, message: "This RFP is not assigned to the vendor" });
    const existing = await PurchaseNewRfpSubmission.findOne({ colid, rfp: rfp._id, vendor: vendor._id });
    if (existing && existing.editable !== "Yes") return res.status(400).json({ success: false, message: "Submission is locked. Ask purchase office to make it editable." });
    const totals = calculateBidItems(Array.isArray(req.body.items) ? req.body.items : []);
    const payload = {
      colid,
      rfp: rfp._id,
      rfpid: rfp.rfpid,
      rfptitle: rfp.title,
      vendor: vendor._id,
      vendorname: vendor.companyname,
      vendorusername: vendor.username,
      vendoremail: vendor.contactemail,
      items: totals.items,
      qualificationresponse: clean(req.body.qualificationresponse),
      experienceresponse: clean(req.body.experienceresponse),
      technicalbid: clean(req.body.technicalbid),
      financialremarks: clean(req.body.financialremarks),
      subtotal: totals.subtotal,
      gsttotal: totals.gsttotal,
      grandtotal: totals.grandtotal,
      status: "Submitted",
      editable: "No",
      submittedat: existing?.submittedat || new Date(),
      resubmittedat: existing ? new Date() : undefined
    };
    const data = existing
      ? await PurchaseNewRfpSubmission.findByIdAndUpdate(existing._id, { ...payload, documents: existing.documents || [] }, { new: true, runValidators: true })
      : await PurchaseNewRfpSubmission.create(payload);
    await PurchaseNewRfpVendor.updateOne({ _id: assignment._id }, { $set: { status: "Submitted" } });
    res.json({ success: true, data, message: "RFP submission saved and locked." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.uploadVendorSubmissionDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select a document to upload" });
    const submission = await PurchaseNewRfpSubmission.findById(req.body.submissionid || req.body.id);
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found. Save bid first." });
    const uploaded = await uploadToDefaultAws(submission.colid, req.file, "vendor-rfp-submissions");
    const doc = {
      documenttype: clean(req.body.documenttype) || "Bid Document",
      description: clean(req.body.description),
      ...uploaded
    };
    submission.documents = submission.documents || [];
    submission.documents.push(doc);
    await submission.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getRfpSubmissions = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid) };
    ["rfpid", "vendorusername", "vendorname", "status"].forEach((field) => {
      if (req.query[field]) filter[field] = new RegExp(clean(req.query[field]), "i");
    });
    if (req.query.rfp) filter.rfp = req.query.rfp;
    const data = await PurchaseNewRfpSubmission.find(filter).sort({ grandtotal: 1, vendorname: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.makeRfpSubmissionEditable = async (req, res) => {
  try {
    const data = await PurchaseNewRfpSubmission.findByIdAndUpdate(req.body.id, { editable: "Yes", status: "Editable" }, { new: true });
    if (!data) return res.status(404).json({ success: false, message: "Submission not found" });
    res.json({ success: true, data, message: "Vendor can edit and submit again." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.storeRfpSubmissionBlockchain = async (req, res) => {
  try {
    const submission = await PurchaseNewRfpSubmission.findById(req.body.id).lean();
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    const payload = { submission, storedAt: new Date().toISOString() };
    const block = await appendBlock({
      colid: submission.colid,
      modelname: "purchasenewrfpsubmission",
      collectionname: "purchasenewrfpsubmissionds",
      recordid: String(submission._id),
      payload,
      user: clean(req.body.user || req.body.useremail || submission.vendorusername),
      summary: { rfpid: submission.rfpid, vendorname: submission.vendorname, grandtotal: submission.grandtotal }
    });
    await PurchaseNewRfpSubmission.updateOne({ _id: submission._id }, { $set: { blockchainhash: block.hash, blockchainrecordid: block.recordid } });
    res.json({ success: true, message: "RFP submission stored in blockchain", data: block });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyRfpSubmissionBlockchain = async (req, res) => {
  try {
    const query = { modelname: "purchasenewrfpsubmission" };
    if (req.query.colid) query.colid = num(req.query.colid);
    if (req.query.hash) query.hash = clean(req.query.hash);
    if (req.query.recordid) query.recordid = clean(req.query.recordid);
    const data = await BlockchainLedger.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: req.query.hash || req.query.recordid ? data[0] : data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.refinePoTermsWithAi = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const prompt = [
      "Refine these purchase order terms into formal procurement language. Return JSON with paymentterms, deliveryterms, penaltyclause, generalterms.",
      `Instruction: ${clean(req.body.instruction) || "Make it clear, enforceable and concise."}`,
      `Payment terms: ${clean(req.body.paymentterms)}`,
      `Delivery terms: ${clean(req.body.deliveryterms)}`,
      `Penalty clause: ${clean(req.body.penaltyclause)}`,
      `General terms: ${clean(req.body.generalterms)}`
    ].join("\n");
    let data;
    if (clean(req.body.provider).toLowerCase() === "ollama") {
      const config = await getOllamaConfig(colid, req.body.ollamaConfigId);
      if (!config) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      data = await callOllamaJson(config, prompt);
    } else {
      const config = await getGeminiConfig(colid);
      if (!config?.apikey) return res.status(400).json({ success: false, message: "Gemini API key is not configured" });
      data = await callGeminiJson(config.apikey, req.body.geminiModel || req.body.model, prompt);
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.createPurchaseOrderFromSubmission = async (req, res) => {
  try {
    const submission = await PurchaseNewRfpSubmission.findById(req.body.submissionid || req.body.id).lean();
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    const rfp = await PurchaseRfp.findById(submission.rfp).lean();
    const count = await PurchaseNewPurchaseOrder.countDocuments({ colid: submission.colid });
    const poid = clean(req.body.poid) || `PNPO-${submission.colid}-${String(count + 1).padStart(5, "0")}`;
    const po = await PurchaseNewPurchaseOrder.create({
      colid: submission.colid,
      poid,
      title: clean(req.body.title) || `${poid} - ${submission.vendorname}`,
      rfp: submission.rfp,
      rfpid: submission.rfpid,
      rfptitle: submission.rfptitle,
      submission: submission._id,
      vendor: submission.vendor,
      vendorname: submission.vendorname,
      vendorusername: submission.vendorusername,
      vendoremail: submission.vendoremail,
      items: submission.items,
      subtotal: submission.subtotal,
      gsttotal: submission.gsttotal,
      grandtotal: submission.grandtotal,
      paymentterms: clean(req.body.paymentterms) || rfp?.paymentterms || "",
      deliveryterms: clean(req.body.deliveryterms) || rfp?.deliveryterms || "",
      penaltyclause: clean(req.body.penaltyclause),
      generalterms: clean(req.body.generalterms) || rfp?.terms || "",
      createdby: clean(req.body.user || req.body.useremail),
      createdbyname: clean(req.body.username || req.body.name),
      status: "Draft",
      stage: "Draft"
    });
    await firstGenericState(po, "PurchaseOrder");
    addRfpHistory(po, "Create PO", req, "Purchase order created from vendor submission");
    await po.save();
    res.json({ success: true, data: po, message: "Purchase order created and sent for approval." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getPurchaseOrders = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid) };
    ["poid", "rfpid", "vendorusername", "vendorname", "status"].forEach((field) => {
      if (req.query[field]) filter[field] = new RegExp(clean(req.query[field]), "i");
    });
    if (req.query.vendorusernameExact) filter.vendorusername = clean(req.query.vendorusernameExact);
    const data = await PurchaseNewPurchaseOrder.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getPoApprovalQueue = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const role = clean(req.query.role);
    const useremail = clean(req.query.useremail || req.query.user);
    const levels = await PurchaseApprovalWorkflow.find({ colid, workflowtype: "PurchaseOrder", active: "Yes", approverrole: role }).lean();
    const allowedLevels = levels.filter((level) => approverMatches(level, useremail)).map((level) => num(level.level, 0));
    const data = allowedLevels.length
      ? await PurchaseNewPurchaseOrder.find({ colid, stage: "PurchaseOrder", currentlevel: { $in: allowedLevels } }).sort({ createdAt: 1 }).lean()
      : [];
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.approvePurchaseOrder = async (req, res) => {
  try {
    const po = await PurchaseNewPurchaseOrder.findById(req.body.id);
    if (!po) return res.status(404).json({ success: false, message: "Purchase order not found" });
    const allowed = await matchingGenericLevel(po, req, "PurchaseOrder");
    if (!allowed) return res.status(403).json({ success: false, message: "You are not allowed to approve this level" });
    addRfpHistory(po, "Approve PO", req, clean(req.body.comments));
    await progressGeneric(po, "PurchaseOrder");
    await po.save();
    res.json({ success: true, data: po });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.rejectPurchaseOrder = async (req, res) => {
  try {
    const po = await PurchaseNewPurchaseOrder.findById(req.body.id);
    if (!po) return res.status(404).json({ success: false, message: "Purchase order not found" });
    const allowed = await matchingGenericLevel(po, req, "PurchaseOrder");
    if (!allowed) return res.status(403).json({ success: false, message: "You are not allowed to reject this level" });
    addRfpHistory(po, "Reject PO", req, clean(req.body.comments));
    await regressGeneric(po, "PurchaseOrder");
    await po.save();
    res.json({ success: true, data: po });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.storePurchaseOrderBlockchain = async (req, res) => {
  try {
    const po = await PurchaseNewPurchaseOrder.findById(req.body.id).lean();
    if (!po) return res.status(404).json({ success: false, message: "Purchase order not found" });
    if (po.status !== "Approved") return res.status(400).json({ success: false, message: "Only approved purchase order can be stored in blockchain" });
    const payload = { purchaseorder: po, storedAt: new Date().toISOString() };
    const block = await appendBlock({
      colid: po.colid,
      modelname: "purchasenewpurchaseorder",
      collectionname: "purchasenewpurchaseorderds",
      recordid: String(po._id),
      payload,
      user: clean(req.body.user || req.body.useremail),
      summary: { poid: po.poid, rfpid: po.rfpid, vendorname: po.vendorname, grandtotal: po.grandtotal }
    });
    await PurchaseNewPurchaseOrder.updateOne({ _id: po._id }, { $set: { blockchainhash: block.hash, blockchainrecordid: block.recordid } });
    res.json({ success: true, message: "Purchase order stored in blockchain", data: block });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyPurchaseOrderBlockchain = async (req, res) => {
  try {
    const query = { modelname: "purchasenewpurchaseorder" };
    if (req.query.colid) query.colid = num(req.query.colid);
    if (req.query.hash) query.hash = clean(req.query.hash);
    if (req.query.recordid) query.recordid = clean(req.query.recordid);
    const data = await BlockchainLedger.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: req.query.hash || req.query.recordid ? data[0] : data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getDeliverySchedules = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid) };
    if (req.query.po) filter.po = req.query.po;
    if (req.query.poid) filter.poid = clean(req.query.poid);
    if (req.query.vendorusername) filter.vendorusername = clean(req.query.vendorusername);
    if (req.query.status) filter.status = new RegExp(clean(req.query.status), "i");
    const data = await PurchaseNewDeliverySchedule.find(filter).sort({ deliverydatetime: 1, createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveDeliverySchedule = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const po = await PurchaseNewPurchaseOrder.findOne({ colid, $or: [{ _id: clean(req.body.po) }, { poid: clean(req.body.poid) }] }).lean();
    if (!po) return res.status(404).json({ success: false, message: "Purchase order not found" });
    const itemindex = num(req.body.itemindex, 0);
    const poItem = (po.items || [])[itemindex] || {};
    const quantity = num(req.body.quantity, 0);
    const existing = await PurchaseNewDeliverySchedule.aggregate([
      { $match: { colid, po: po._id, itemindex, ...(req.body.id && mongoose.Types.ObjectId.isValid(req.body.id) ? { _id: { $ne: new mongoose.Types.ObjectId(req.body.id) } } : {}) } },
      { $group: { _id: null, total: { $sum: "$quantity" } } }
    ]);
    const alreadyScheduled = num(existing?.[0]?.total, 0);
    if (alreadyScheduled + quantity > num(poItem.quantity, 0)) return res.status(400).json({ success: false, message: "Scheduled quantity cannot exceed PO item quantity" });
    const payload = {
      colid,
      po: po._id,
      poid: po.poid,
      vendor: po.vendor,
      vendorname: po.vendorname,
      vendorusername: po.vendorusername,
      itemindex,
      item: clean(req.body.item) || poItem.item || "",
      quantity,
      deliverydatetime: req.body.deliverydatetime ? new Date(req.body.deliverydatetime) : undefined,
      vehicledetails: clean(req.body.vehicledetails),
      shipmentdetails: clean(req.body.shipmentdetails),
      remarks: clean(req.body.remarks),
      status: clean(req.body.status) || "Scheduled"
    };
    const data = req.body.id
      ? await PurchaseNewDeliverySchedule.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await PurchaseNewDeliverySchedule.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteDeliverySchedule = async (req, res) => {
  try {
    await PurchaseNewDeliverySchedule.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateDeliveryQuality = async (req, res) => {
  try {
    const schedule = await PurchaseNewDeliverySchedule.findById(req.body.id);
    if (!schedule) return res.status(404).json({ success: false, message: "Delivery schedule not found" });
    const accepted = num(req.body.acceptedquantity, 0);
    const returned = num(req.body.returnedquantity, 0);
    if (accepted + returned > num(schedule.quantity, 0)) return res.status(400).json({ success: false, message: "Accepted plus returned cannot exceed delivered quantity" });
    schedule.acceptedquantity = accepted;
    schedule.returnedquantity = returned;
    schedule.qualityremarks = clean(req.body.qualityremarks);
    schedule.status = accepted + returned >= num(schedule.quantity, 0) ? "Quality Checked" : "Partially Checked";
    await schedule.save();
    res.json({ success: true, data: schedule });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.storeDeliveryNoteBlockchain = async (req, res) => {
  try {
    const schedule = await PurchaseNewDeliverySchedule.findById(req.body.id).lean();
    if (!schedule) return res.status(404).json({ success: false, message: "Delivery schedule not found" });
    const notetype = clean(req.body.notetype || "GRN");
    if (notetype === "GRN" && num(schedule.acceptedquantity, 0) <= 0) return res.status(400).json({ success: false, message: "Accepted quantity is required for GRN" });
    if (notetype !== "GRN" && num(schedule.returnedquantity, 0) <= 0) return res.status(400).json({ success: false, message: "Returned quantity is required for return note" });
    const payload = { notetype, schedule, storedAt: new Date().toISOString() };
    const block = await appendBlock({
      colid: schedule.colid,
      modelname: notetype === "GRN" ? "purchasenewgrn" : "purchasenewgoodsreturn",
      collectionname: "purchasenewdeliveryscheduleds",
      recordid: String(schedule._id),
      payload,
      user: clean(req.body.user || req.body.useremail || schedule.vendorusername),
      summary: { poid: schedule.poid, item: schedule.item, acceptedquantity: schedule.acceptedquantity, returnedquantity: schedule.returnedquantity }
    });
    const update = notetype === "GRN" ? { grnhash: block.hash, grnrecordid: block.recordid } : { returnhash: block.hash, returnrecordid: block.recordid };
    await PurchaseNewDeliverySchedule.updateOne({ _id: schedule._id }, { $set: update });
    res.json({ success: true, data: block, message: `${notetype} stored in blockchain` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyDeliveryNoteBlockchain = async (req, res) => {
  try {
    const query = { modelname: { $in: ["purchasenewgrn", "purchasenewgoodsreturn"] } };
    if (req.query.modelname) query.modelname = clean(req.query.modelname);
    if (req.query.colid) query.colid = num(req.query.colid);
    if (req.query.hash) query.hash = clean(req.query.hash);
    if (req.query.recordid) query.recordid = clean(req.query.recordid);
    const data = await BlockchainLedger.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: req.query.hash || req.query.recordid ? data[0] : data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getInvoices = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid) };
    ["invoiceid", "invoiceno", "poid", "vendorusername", "vendorname", "status"].forEach((field) => {
      if (req.query[field]) filter[field] = new RegExp(clean(req.query[field]), "i");
    });
    if (req.query.po) filter.po = req.query.po;
    if (req.query.vendorusernameExact) filter.vendorusername = clean(req.query.vendorusernameExact);
    const data = await PurchaseNewInvoice.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveInvoice = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const po = await PurchaseNewPurchaseOrder.findOne({ colid, $or: [{ _id: clean(req.body.po) }, { poid: clean(req.body.poid) }] }).lean();
    if (!po) return res.status(404).json({ success: false, message: "Purchase order not found" });
    const schedules = await PurchaseNewDeliverySchedule.find({ colid, po: po._id }).lean();
    const acceptedByItem = {};
    schedules.forEach((s) => { acceptedByItem[s.itemindex] = num(acceptedByItem[s.itemindex], 0) + num(s.acceptedquantity, 0); });
    const previousInvoices = await PurchaseNewInvoice.find({ colid, po: po._id, ...(req.body.id ? { _id: { $ne: req.body.id } } : {}) }).lean();
    const invoicedByItem = {};
    previousInvoices.forEach((inv) => (inv.items || []).forEach((item) => { invoicedByItem[item.itemindex] = num(invoicedByItem[item.itemindex], 0) + num(item.quantity, 0); }));
    let subtotal = 0;
    let gsttotal = 0;
    let grandtotal = 0;
    const items = (req.body.items || []).map((item) => {
      const itemindex = num(item.itemindex, 0);
      const poItem = (po.items || [])[itemindex] || {};
      const quantity = num(item.quantity, 0);
      const available = num(acceptedByItem[itemindex], 0) - num(invoicedByItem[itemindex], 0);
      if (quantity > available) throw new Error(`Invoice quantity for ${poItem.item || item.item} cannot exceed accepted pending quantity`);
      const unitprice = num(item.unitprice, poItem.unitprice || 0);
      const gstpercent = num(item.gstpercent, poItem.gstpercent || 0);
      const base = quantity * unitprice;
      const gstamount = base * gstpercent / 100;
      const total = base + gstamount;
      subtotal += base; gsttotal += gstamount; grandtotal += total;
      return { itemindex, item: poItem.item || clean(item.item), quantity, unitprice, gstpercent, gstamount, total };
    });
    const count = await PurchaseNewInvoice.countDocuments({ colid });
    const payload = {
      colid,
      invoiceid: clean(req.body.invoiceid) || `PNINV-${colid}-${String(count + 1).padStart(5, "0")}`,
      invoiceno: clean(req.body.invoiceno),
      invoicedate: req.body.invoicedate ? new Date(req.body.invoicedate) : new Date(),
      po: po._id,
      poid: po.poid,
      vendor: po.vendor,
      vendorname: po.vendorname,
      vendorusername: po.vendorusername,
      items,
      subtotal,
      gsttotal,
      grandtotal,
      paymode: clean(req.body.paymode),
      bankdetails: clean(req.body.bankdetails),
      remarks: clean(req.body.remarks)
    };
    const invoice = req.body.id
      ? await PurchaseNewInvoice.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await PurchaseNewInvoice.create(payload);
    if (!req.body.id) {
      await firstGenericState(invoice, "FinancePayment");
      addRfpHistory(invoice, "Create Invoice", req, "Vendor invoice created and submitted for approval");
      await invoice.save();
    }
    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.uploadInvoiceDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select a document to upload" });
    const invoice = await PurchaseNewInvoice.findById(req.body.invoiceid || req.body.id);
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    const uploaded = await uploadToDefaultAws(invoice.colid, req.file, "vendor-invoices");
    const doc = { documenttype: clean(req.body.documenttype) || "Invoice Document", description: clean(req.body.description), ...uploaded };
    invoice.documents = invoice.documents || [];
    invoice.documents.push(doc);
    await invoice.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getInvoiceApprovalQueue = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const role = clean(req.query.role);
    const useremail = clean(req.query.useremail || req.query.user);
    const levels = await PurchaseApprovalWorkflow.find({ colid, workflowtype: "FinancePayment", active: "Yes", approverrole: role }).lean();
    const allowedLevels = levels.filter((level) => approverMatches(level, useremail)).map((level) => num(level.level, 0));
    const data = allowedLevels.length ? await PurchaseNewInvoice.find({ colid, stage: "FinancePayment", currentlevel: { $in: allowedLevels } }).sort({ createdAt: 1 }).lean() : [];
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.approveInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseNewInvoice.findById(req.body.id);
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    const allowed = await matchingGenericLevel(invoice, req, "FinancePayment");
    if (!allowed) return res.status(403).json({ success: false, message: "You are not allowed to approve this level" });
    addRfpHistory(invoice, "Approve Invoice", req, clean(req.body.comments));
    await progressGeneric(invoice, "FinancePayment");
    await invoice.save();
    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.rejectInvoice = async (req, res) => {
  try {
    const invoice = await PurchaseNewInvoice.findById(req.body.id);
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    const allowed = await matchingGenericLevel(invoice, req, "FinancePayment");
    if (!allowed) return res.status(403).json({ success: false, message: "You are not allowed to reject this level" });
    addRfpHistory(invoice, "Reject Invoice", req, clean(req.body.comments));
    await regressGeneric(invoice, "FinancePayment");
    await invoice.save();
    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.storeInvoiceBlockchain = async (req, res) => {
  try {
    const invoice = await PurchaseNewInvoice.findById(req.body.id).lean();
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    if (invoice.status !== "Approved") return res.status(400).json({ success: false, message: "Only approved invoice can be stored in blockchain" });
    const block = await appendBlock({
      colid: invoice.colid,
      modelname: "purchasenewinvoice",
      collectionname: "purchasenewinvoiceds",
      recordid: String(invoice._id),
      payload: { invoice, storedAt: new Date().toISOString() },
      user: clean(req.body.user || req.body.useremail),
      summary: { invoiceid: invoice.invoiceid, poid: invoice.poid, vendorname: invoice.vendorname, grandtotal: invoice.grandtotal }
    });
    await PurchaseNewInvoice.updateOne({ _id: invoice._id }, { $set: { blockchainhash: block.hash, blockchainrecordid: block.recordid } });
    res.json({ success: true, data: block, message: "Invoice stored in blockchain" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.verifyInvoiceBlockchain = async (req, res) => {
  try {
    const query = { modelname: "purchasenewinvoice" };
    if (req.query.colid) query.colid = num(req.query.colid);
    if (req.query.hash) query.hash = clean(req.query.hash);
    if (req.query.recordid) query.recordid = clean(req.query.recordid);
    const data = await BlockchainLedger.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: req.query.hash || req.query.recordid ? data[0] : data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
