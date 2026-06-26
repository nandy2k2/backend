const DepartmentWorkflow = require("../Models/requisitiondepartmentworkflowds");
const InstitutionWorkflow = require("../Models/requisitioninstitutionworkflowds");
const StoreWorkflow = require("../Models/requisitionstoreworkflowds");
const Requisition = require("../Models/requisitionds");
const RequisitionAudit = require("../Models/requisitionauditds");
const StockRegister = require("../Models/requisitionstockregisterds");
const PurchaseNewStore = require("../Models/purchasenewstoreds");
const PurchaseNewItemMaster = require("../Models/purchasenewitemmasterds");
const PurchaseNewStoreUser = require("../Models/purchasenewstoreuserds");
const User = require("../Models/user");

const num = (value, fallback = undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clean = (value) => String(value || "").trim();
const byLevelAsc = (a, b) => num(a.level, 0) - num(b.level, 0);
const byLevelDesc = (a, b) => num(b.level, 0) - num(a.level, 0);
const approverMatches = (level, useremail) => clean(level.approveremail).toLowerCase() === clean(useremail).toLowerCase();

const workflowPayload = (body = {}, type = "department") => ({
  colid: num(body.colid),
  ...(type === "department" ? { department: clean(body.department) } : {}),
  ...(type === "store" ? { store: clean(body.store) } : {}),
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
  await RequisitionAudit.create({
    colid: item.colid,
    requisitionid: item._id,
    department: item.department,
    store: item.store,
    category: item.category,
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
  const levels = await DepartmentWorkflow.find({ colid: item.colid, active: "Yes", department: { $in: [item.department, "All"] } }).lean();
  levels.sort(byLevelAsc);
  if (levels.length) {
    item.stage = "Department";
    item.currentlevel = num(levels[0].level, 1);
    item.status = `Department Pending Level ${item.currentlevel}`;
    return;
  }
  await nextInstitutionState(item);
};

const firstApprovalState = async (item) => {
  const storeLevels = await StoreWorkflow.find({ colid: item.colid, active: "Yes", store: item.store }).lean();
  storeLevels.sort(byLevelAsc);
  if (storeLevels.length) {
    item.stage = "Store";
    item.currentlevel = num(storeLevels[0].level, 1);
    item.status = `Store Pending Level ${item.currentlevel}`;
    return;
  }
  await nextDepartmentState(item);
};

const approveFinal = (item) => {
  item.stage = "Approved";
  item.currentlevel = 0;
  item.status = "Approved";
  item.approvedat = new Date();
};

const progressItem = async (item) => {
  if (item.stage === "Store") {
    const levels = await StoreWorkflow.find({ colid: item.colid, active: "Yes", store: item.store }).lean();
    const next = levels.filter((level) => num(level.level, 0) > num(item.currentlevel, 0)).sort(byLevelAsc)[0];
    if (next) {
      item.currentlevel = num(next.level, item.currentlevel);
      item.status = `Store Pending Level ${item.currentlevel}`;
      return;
    }
    approveFinal(item);
    return;
  }
  if (item.stage === "Department") {
    const levels = await DepartmentWorkflow.find({ colid: item.colid, active: "Yes", department: { $in: [item.department, "All"] } }).lean();
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
  approveFinal(item);
};

const regressItem = async (item) => {
  const current = num(item.currentlevel, 0);
  if (item.stage === "Store") {
    const levels = await StoreWorkflow.find({ colid: item.colid, active: "Yes", store: item.store }).lean();
    const previous = levels.filter((level) => num(level.level, 0) < current).sort(byLevelDesc)[0];
    if (previous) {
      item.currentlevel = num(previous.level, current);
      item.status = `Store Pending Level ${item.currentlevel}`;
      return;
    }
  } else if (item.stage === "Department") {
    const levels = await DepartmentWorkflow.find({ colid: item.colid, active: "Yes", department: { $in: [item.department, "All"] } }).lean();
    const previous = levels.filter((level) => num(level.level, 0) < current).sort(byLevelDesc)[0];
    if (previous) {
      item.currentlevel = num(previous.level, current);
      item.status = `Department Pending Level ${item.currentlevel}`;
      return;
    }
  } else if (item.stage === "Institution") {
    const institution = await InstitutionWorkflow.find({ colid: item.colid, active: "Yes" }).lean();
    const previousInstitution = institution.filter((level) => num(level.level, 0) < current).sort(byLevelDesc)[0];
    if (previousInstitution) {
      item.currentlevel = num(previousInstitution.level, current);
      item.status = `Institution Pending Level ${item.currentlevel}`;
      return;
    }
    const department = await DepartmentWorkflow.find({ colid: item.colid, active: "Yes", department: { $in: [item.department, "All"] } }).lean();
    const previousDepartment = department.sort(byLevelDesc)[0];
    if (previousDepartment) {
      item.stage = "Department";
      item.currentlevel = num(previousDepartment.level, current);
      item.status = `Department Pending Level ${item.currentlevel}`;
      return;
    }
  }
  item.stage = "Rejected";
  item.currentlevel = 0;
  item.status = "Rejected";
};

const matchingWorkflowLevel = async (item, req) => {
  const role = clean(req.body.role || req.query.role);
  const useremail = clean(req.body.useremail || req.query.useremail || req.body.user || req.query.user);
  if (!role || !useremail) return null;
  if (item.stage === "Store") {
    const levels = await StoreWorkflow.find({ colid: item.colid, active: "Yes", approverrole: role, store: item.store }).lean();
    return levels.find((level) => num(level.level, 0) === num(item.currentlevel, 0) && approverMatches(level, useremail)) || null;
  }
  if (item.stage === "Department") {
    const levels = await DepartmentWorkflow.find({ colid: item.colid, active: "Yes", approverrole: role, department: { $in: [item.department, "All"] } }).lean();
    return levels.find((level) => num(level.level, 0) === num(item.currentlevel, 0) && approverMatches(level, useremail)) || null;
  }
  if (item.stage === "Institution") {
    const levels = await InstitutionWorkflow.find({ colid: item.colid, active: "Yes", approverrole: role }).lean();
    return levels.find((level) => num(level.level, 0) === num(item.currentlevel, 0) && approverMatches(level, useremail)) || null;
  }
  return null;
};

const requisitionFilter = (query = {}) => {
  const filter = {};
  if (query.colid) filter.colid = num(query.colid);
  ["department", "store", "category", "item", "status", "stage", "assignmentstatus", "submittedby"].forEach((field) => {
    if (query[field]) filter[field] = query[field];
  });
  if (clean(query.past).toLowerCase() === "true") filter.status = { $ne: "Draft" };
  if (query.fromdate || query.todate) {
    filter.createdAt = {};
    if (query.fromdate) filter.createdAt.$gte = new Date(query.fromdate);
    if (query.todate) {
      const to = new Date(query.todate);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }
  return filter;
};

const stockRegisterPayload = (body = {}) => ({
  colid: num(body.colid),
  store: clean(body.store),
  itemmasterid: clean(body.itemmasterid) || undefined,
  requisitionid: clean(body.requisitionid) || undefined,
  category: clean(body.category),
  item: clean(body.item),
  description: clean(body.description),
  unit: clean(body.unit),
  transactiontype: clean(body.transactiontype) || "Issue",
  quantityin: num(body.quantityin, 0),
  quantityout: num(body.quantityout, 0),
  balanceafter: num(body.balanceafter, 0),
  transactiondate: body.transactiondate ? new Date(body.transactiondate) : new Date(),
  details: clean(body.details),
  issuedto: clean(body.issuedto),
  issuedtoemail: clean(body.issuedtoemail),
  user: clean(body.user)
});

exports.getUsers = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const users = await User.find({ colid, role: { $not: /^Student$/i } }).select("name email role department").sort({ name: 1 }).limit(1000).lean();
    res.json({
      success: true,
      users,
      departments: [...new Set(users.map((u) => u.department).filter(Boolean))].sort(),
      roles: [...new Set(users.map((u) => u.role).filter(Boolean))].sort()
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getStores = async (req, res) => {
  try {
    const data = await PurchaseNewStore.find({ colid: num(req.query.colid), ...(req.query.status ? { status: req.query.status } : {}) }).sort({ store: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAvailableItems = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid), quantityavailable: { $gt: 0 } };
    if (req.query.store) filter.store = clean(req.query.store);
    if (req.query.category) filter.category = clean(req.query.category);
    const data = await PurchaseNewItemMaster.find(filter).sort({ store: 1, category: 1, item: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const WorkflowModels = { department: DepartmentWorkflow, institution: InstitutionWorkflow, store: StoreWorkflow };

exports.getWorkflow = async (req, res) => {
  try {
    const type = clean(req.query.type || "department");
    const Model = WorkflowModels[type] || DepartmentWorkflow;
    const filter = { colid: num(req.query.colid) };
    if (type === "store" && req.query.store) filter.store = clean(req.query.store);
    const sort = type === "institution" ? { level: 1 } : type === "store" ? { store: 1, level: 1 } : { department: 1, level: 1 };
    const data = await Model.find(filter).sort(sort).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveWorkflow = async (req, res) => {
  try {
    const type = clean(req.body.type || "department");
    const Model = WorkflowModels[type] || DepartmentWorkflow;
    const payload = workflowPayload(req.body, type);
    if (type === "department" && !payload.department) return res.status(400).json({ success: false, message: "Department is required" });
    if (type === "store" && !payload.store) return res.status(400).json({ success: false, message: "Store is required" });
    if (!payload.colid || !payload.approverrole) return res.status(400).json({ success: false, message: "Approver role is required" });
    const data = req.body.id
      ? await Model.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await Model.create(payload);
    await RequisitionAudit.create({
      colid: payload.colid,
      department: payload.department || "",
      store: payload.store || "",
      action: req.body.id ? `Update ${type} workflow` : `Create ${type} workflow`,
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

exports.deleteWorkflow = async (req, res) => {
  try {
    const type = clean(req.body.type || "department");
    const Model = WorkflowModels[type] || DepartmentWorkflow;
    const data = await Model.findByIdAndDelete(req.body.id);
    if (data) {
      await RequisitionAudit.create({
        colid: data.colid,
        department: data.department || "",
        store: data.store || "",
        action: `Delete ${type} workflow`,
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

exports.getRequisitions = async (req, res) => {
  try {
    const data = await Requisition.find(requisitionFilter(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveRequisition = async (req, res) => {
  try {
    const requestedquantity = num(req.body.requestedquantity, 0);
    const itemMaster = await PurchaseNewItemMaster.findOne({ _id: req.body.itemmasterid, colid: num(req.body.colid) }).lean();
    if (!itemMaster) return res.status(404).json({ success: false, message: "Selected item not found" });
    const available = num(itemMaster.quantityavailable, 0);
    if (requestedquantity <= 0 || requestedquantity > available) return res.status(400).json({ success: false, message: `Requested quantity must be between 1 and ${available}` });
    const payload = {
      colid: num(req.body.colid),
      department: clean(req.body.department),
      store: clean(itemMaster.store),
      storedescription: clean(itemMaster.storedescription),
      itemmasterid: itemMaster._id,
      category: clean(itemMaster.category),
      categorytype: clean(itemMaster.categorytype),
      item: clean(itemMaster.item),
      description: clean(itemMaster.description),
      unit: clean(itemMaster.unit),
      dimension: clean(itemMaster.dimension),
      quantityavailableatrequest: available,
      requestedquantity,
      submittedby: clean(req.body.useremail || req.body.user),
      submittedbyname: clean(req.body.username),
      submittedrole: clean(req.body.role)
    };
    if (!payload.colid || !payload.store || !payload.item || !payload.department) return res.status(400).json({ success: false, message: "Store, item and department are required" });
    let data;
    if (req.body.id) {
      const existing = await Requisition.findOne({ _id: req.body.id, colid: payload.colid });
      if (!existing) return res.status(404).json({ success: false, message: "Requisition not found" });
      if (existing.status !== "Draft") return res.status(400).json({ success: false, message: "Only draft requisitions can be edited" });
      const olddata = existing.toObject();
      Object.assign(existing, payload);
      data = await existing.save();
      await logAudit("Update Draft Requisition", data, req, olddata, data.toObject(), "");
    } else {
      data = await Requisition.create({ ...payload, status: "Draft", stage: "Draft", currentlevel: 0 });
      await logAudit("Create Draft Requisition", data, req, null, data.toObject(), "");
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteRequisition = async (req, res) => {
  try {
    const item = await Requisition.findById(req.body.id);
    if (!item) return res.status(404).json({ success: false, message: "Requisition not found" });
    if (item.status !== "Draft") return res.status(400).json({ success: false, message: "Only draft requisitions can be deleted" });
    await logAudit("Delete Draft Requisition", item, req, item.toObject(), null, "");
    await item.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.submitRequisitions = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const items = await Requisition.find({ _id: { $in: ids }, colid: num(req.body.colid), status: "Draft" });
    for (const item of items) {
      const olddata = item.toObject();
      item.submittedby = req.body.useremail || req.body.user || item.submittedby;
      item.submittedbyname = req.body.username || item.submittedbyname;
      item.submittedrole = req.body.role || item.submittedrole;
      await firstApprovalState(item);
      addHistory(item, "Submit", req, "");
      await item.save();
      await logAudit("Submit Requisition", item, req, olddata, item.toObject(), "");
    }
    res.json({ success: true, updated: items.length });
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
    if (!stage || stage === "Store") {
      const levels = await StoreWorkflow.find({ colid, active: "Yes", approverrole: role }).lean();
      levels.filter((level) => approverMatches(level, useremail)).forEach((level) => or.push({ stage: "Store", currentlevel: num(level.level, 0), store: level.store }));
    }
    if (!stage || stage === "Department") {
      const levels = await DepartmentWorkflow.find({ colid, active: "Yes", approverrole: role, department: { $in: [department, "All"] } }).lean();
      levels.filter((level) => approverMatches(level, useremail)).forEach((level) => or.push({ stage: "Department", currentlevel: num(level.level, 0), department: level.department === "All" ? { $exists: true } : level.department }));
    }
    if (!stage || stage === "Institution") {
      const levels = await InstitutionWorkflow.find({ colid, active: "Yes", approverrole: role }).lean();
      levels.filter((level) => approverMatches(level, useremail)).forEach((level) => or.push({ stage: "Institution", currentlevel: num(level.level, 0) }));
    }
    const data = or.length ? await Requisition.find({ colid, $or: or }).sort({ store: 1, createdAt: 1 }).lean() : [];
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.approveRequisition = async (req, res) => {
  try {
    const item = await Requisition.findById(req.body.id);
    if (!item) return res.status(404).json({ success: false, message: "Requisition not found" });
    const level = await matchingWorkflowLevel(item, req);
    if (!level) return res.status(403).json({ success: false, message: "This requisition is not pending for your role and user" });
    const olddata = item.toObject();
    addHistory(item, "Approve", req, req.body.comments || "Approved");
    await progressItem(item);
    await item.save();
    await logAudit("Approve Requisition", item, req, olddata, item.toObject(), req.body.comments || "Approved");
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.rejectRequisition = async (req, res) => {
  try {
    const item = await Requisition.findById(req.body.id);
    if (!item) return res.status(404).json({ success: false, message: "Requisition not found" });
    const level = await matchingWorkflowLevel(item, req);
    if (!level) return res.status(403).json({ success: false, message: "This requisition is not pending for your role and user" });
    const olddata = item.toObject();
    item.rejectedreason = req.body.comments || "";
    addHistory(item, "Reject", req, req.body.comments || "");
    await regressItem(item);
    await item.save();
    await logAudit("Reject Requisition", item, req, olddata, item.toObject(), req.body.comments || "");
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAssignedStoreRequisitions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const useremail = clean(req.query.useremail || req.query.user);
    const status = clean(req.query.status);
    const fromdate = clean(req.query.fromdate);
    const todate = clean(req.query.todate);
    const selectedStore = clean(req.query.store);
    const assignedStores = await PurchaseNewStoreUser.find({ colid, useremail, status: "Active" }).select("store").lean();
    const stores = assignedStores.map((item) => item.store).filter(Boolean);
    const allowedStores = selectedStore ? (stores.includes(selectedStore) ? [selectedStore] : []) : stores;
    const filter = { colid, store: { $in: allowedStores.length ? allowedStores : ["__none__"] } };
    if (status === "Approved") filter.status = "Approved";
    if (status === "Pending") filter.status = { $ne: "Approved" };
    if (fromdate || todate) {
      filter.createdAt = {};
      if (fromdate) filter.createdAt.$gte = new Date(fromdate);
      if (todate) {
        const to = new Date(todate);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }
    const data = await Requisition.find(filter).sort({ store: 1, status: 1, createdAt: -1 }).lean();
    res.json({ success: true, data, stores });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.assignRequisition = async (req, res) => {
  try {
    const quantity = num(req.body.assignedquantity, 0);
    const item = await Requisition.findOne({ _id: req.body.id, colid: num(req.body.colid), status: "Approved" });
    if (!item) return res.status(404).json({ success: false, message: "Approved requisition not found" });
    const remainingRequest = num(item.requestedquantity, 0) - num(item.assignedquantity, 0);
    if (quantity <= 0 || quantity > remainingRequest) return res.status(400).json({ success: false, message: `Assigned quantity must be between 1 and ${remainingRequest}` });
    const master = await PurchaseNewItemMaster.findOne({ _id: item.itemmasterid, colid: item.colid });
    if (!master) return res.status(404).json({ success: false, message: "Item master not found" });
    if (quantity > num(master.quantityavailable, 0)) return res.status(400).json({ success: false, message: `Only ${master.quantityavailable || 0} items available in stock` });
    const olddata = item.toObject();
    item.assignedquantity = num(item.assignedquantity, 0) + quantity;
    item.assignmentstatus = item.assignedquantity >= item.requestedquantity ? "Assigned" : "Partially Assigned";
    item.assignmentdetails = clean(req.body.assignmentdetails || item.assignmentdetails);
    item.assignmentdate = req.body.assignmentdate ? new Date(req.body.assignmentdate) : new Date();
    master.quantityavailable = num(master.quantityavailable, 0) - quantity;
    addHistory(item, "Assign", req, `Assigned ${quantity}`);
    await master.save();
    await item.save();
    await StockRegister.create({
      colid: item.colid,
      store: item.store,
      itemmasterid: item.itemmasterid,
      requisitionid: item._id,
      category: item.category,
      item: item.item,
      description: item.description,
      unit: item.unit,
      transactiontype: "Issue",
      quantityin: 0,
      quantityout: quantity,
      balanceafter: num(master.quantityavailable, 0),
      transactiondate: item.assignmentdate || new Date(),
      details: req.body.assignmentdetails || `Issued against requisition ${item._id}`,
      issuedto: item.submittedbyname,
      issuedtoemail: item.submittedby,
      user: req.body.user || req.body.useremail || ""
    });
    await logAudit("Assign Requisition Items", item, req, olddata, item.toObject(), req.body.assignmentdetails || "");
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getStockRegister = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    ["store", "category", "item", "transactiontype", "issuedtoemail"].forEach((field) => {
      if (req.query[field]) filter[field] = req.query[field];
    });
    if (req.query.fromdate || req.query.todate) {
      filter.transactiondate = {};
      if (req.query.fromdate) filter.transactiondate.$gte = new Date(req.query.fromdate);
      if (req.query.todate) {
        const to = new Date(req.query.todate);
        to.setHours(23, 59, 59, 999);
        filter.transactiondate.$lte = to;
      }
    }
    const data = await StockRegister.find(filter).sort({ transactiondate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveStockRegister = async (req, res) => {
  try {
    const payload = stockRegisterPayload(req.body);
    if (!payload.colid || !payload.store || !payload.item) {
      return res.status(400).json({ success: false, message: "Store and item are required" });
    }
    const data = req.body.id
      ? await StockRegister.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await StockRegister.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteStockRegister = async (req, res) => {
  try {
    await StockRegister.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.bulkStockRegister = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => stockRegisterPayload({ ...row, colid: req.body.colid, user: req.body.user })).filter((row) => row.colid && row.store && row.item);
    if (!docs.length) return res.status(400).json({ success: false, message: "No valid stock register rows found" });
    const data = await StockRegister.insertMany(docs, { ordered: false });
    res.json({ success: true, inserted: data.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    ["department", "store", "category", "item", "action", "status", "stage", "useremail"].forEach((field) => {
      if (req.query[field]) filter[field] = req.query[field];
    });
    const data = await RequisitionAudit.find(filter).sort({ timeofactivity: -1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
