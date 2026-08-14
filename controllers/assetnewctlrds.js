const AssetItem = require("../Models/assetnewitemds");
const AssetTracking = require("../Models/assetnewtrackingds");
const AssetRetirement = require("../Models/assetnewretirementds");
const PurchaseNewItemMaster = require("../Models/purchasenewitemmasterds");
const User = require("../Models/user");

const num = (value, fallback = undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clean = (value) => String(value || "").trim();
const rx = (value) => new RegExp(clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const dateRange = (from, to) => {
  const query = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);
      query.$gte = start;
    }
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      query.$lte = end;
    }
  }
  return Object.keys(query).length ? query : null;
};

const assetFilterFields = [
  "assetid", "store", "category", "categorytype", "item", "description", "status",
  "condition", "department", "assignedto", "assignedtoemail"
];
const trackingFilterFields = [
  "assetid", "store", "category", "item", "action", "toname", "toemail", "department", "returncondition"
];

function applyFilters(filter, source, fields) {
  fields.forEach((field) => {
    if (!source[field]) return;
    filter[field] = ["assetid", "item", "description", "assignedto", "assignedtoemail", "toname", "toemail"].includes(field)
      ? rx(source[field])
      : source[field];
  });
}

function optionsFrom(rows, fields) {
  const options = {};
  fields.forEach((field) => {
    options[field] = Array.from(new Set(rows.map((row) => clean(row[field])).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  });
  return options;
}

function serialPrefix(master, body = {}) {
  const manual = clean(body.prefix);
  if (manual) return manual.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const store = clean(master.store).slice(0, 3).toUpperCase();
  const category = clean(master.category).slice(0, 3).toUpperCase();
  const item = clean(master.item).slice(0, 4).toUpperCase();
  return [store, category, item].filter(Boolean).join("-");
}

exports.getItemMasters = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const filter = { colid };
    ["store", "category", "item", "status"].forEach((field) => {
      if (req.query[field]) filter[field] = req.query[field];
    });
    const data = await PurchaseNewItemMaster.find(filter).sort({ store: 1, category: 1, item: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.generateAssets = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const count = num(req.body.count, 0);
    if (!colid || !req.body.itemmasterid || count <= 0) return res.status(400).json({ success: false, message: "Item master and count are required" });
    const master = await PurchaseNewItemMaster.findOne({ _id: req.body.itemmasterid, colid }).lean();
    if (!master) return res.status(404).json({ success: false, message: "Item master not found" });
    const prefix = serialPrefix(master, req.body);
    const existing = await AssetItem.countDocuments({ colid, assetid: new RegExp(`^${prefix}-`) });
    const docs = [];
    for (let i = 1; i <= count; i += 1) {
      const assetid = `${prefix}-${String(existing + i).padStart(5, "0")}`;
      docs.push({
        colid,
        assetid,
        barcode: assetid,
        qrcode: assetid,
        itemmasterid: master._id,
        store: master.store,
        category: master.category,
        categorytype: master.categorytype,
        item: master.item,
        description: master.description,
        approximateprice: master.approximateprice || 0,
        unit: master.unit,
        dimension: master.dimension,
        status: "Available",
        condition: "Good",
        user: clean(req.body.user)
      });
    }
    const data = await AssetItem.insertMany(docs, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAssets = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    if (req.query.itemmasterid) filter.itemmasterid = req.query.itemmasterid;
    applyFilters(filter, req.query, assetFilterFields);
    const assignedRange = dateRange(req.query.assignedfrom, req.query.assignedto);
    if (assignedRange) filter.assigneddate = assignedRange;
    const data = await AssetItem.find(filter).sort({ store: 1, category: 1, item: 1, assetid: 1 }).limit(5000).lean();
    res.json({ success: true, data, options: optionsFrom(data, assetFilterFields) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAvailableAssets = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const itemmasterid = clean(req.query.itemmasterid);
    const filter = { colid, status: "Available" };
    if (itemmasterid) filter.itemmasterid = itemmasterid;
    const data = await AssetItem.find(filter).sort({ assetid: 1 }).limit(1000).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getTracking = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    if (req.query.asset) filter.asset = req.query.asset;
    applyFilters(filter, req.query, trackingFilterFields);
    const range = dateRange(req.query.fromdate, req.query.todate);
    if (range) filter.assignmentdate = range;
    const data = await AssetTracking.find(filter).sort({ assignmentdate: -1, createdAt: -1 }).limit(5000).lean();
    res.json({ success: true, data, options: optionsFrom(data, trackingFilterFields) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const filter = { colid };
    if (req.query.q) {
      const q = rx(req.query.q);
      filter.$or = [{ name: q }, { email: q }, { user: q }, { regno: q }, { phone: q }];
    }
    const users = await User.find(filter).select("name email user role department regno phone").sort({ name: 1 }).limit(500).lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.reassignAsset = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const assetids = Array.isArray(req.body.assetids)
      ? req.body.assetids.filter(Boolean)
      : [req.body.assetid || req.body.id].filter(Boolean);
    if (!colid || !assetids.length) return res.status(400).json({ success: false, message: "Select at least one asset" });
    const assets = await AssetItem.find({ _id: { $in: assetids }, colid });
    if (!assets.length) return res.status(404).json({ success: false, message: "Asset not found" });
    if (assets.length !== assetids.length) return res.status(404).json({ success: false, message: "Some selected assets were not found" });
    const retired = assets.filter((asset) => asset.status === "Retired");
    if (retired.length) return res.status(400).json({ success: false, message: `Retired asset cannot be assigned: ${retired.map((asset) => asset.assetid).join(", ")}` });
    const action = clean(req.body.action) || "Reissue";
    const alreadyAssigned = assets.filter((asset) => asset.status === "Assigned");
    if (action === "Assignment" && alreadyAssigned.length) {
      return res.status(400).json({ success: false, message: `Asset is already assigned. Use Asset reissue to reassign it: ${alreadyAssigned.map((asset) => asset.assetid).join(", ")}` });
    }
    const savedAssets = [];
    const trackingRows = [];
    for (const asset of assets) {
      const tracking = await AssetTracking.create({
        colid,
        asset: asset._id,
        assetid: asset.assetid,
        itemmasterid: asset.itemmasterid,
        store: asset.store,
        category: asset.category,
        item: asset.item,
        description: asset.description,
        action,
        assignmentdate: req.body.assignmentdate ? new Date(req.body.assignmentdate) : new Date(),
        fromname: asset.assignedto,
        fromemail: asset.assignedtoemail,
        toname: clean(req.body.toname),
        toemail: clean(req.body.toemail),
        department: clean(req.body.department),
        penaltytype: clean(req.body.penaltytype),
        penaltyamount: num(req.body.penaltyamount, 0),
        agreementtext: clean(req.body.agreementtext),
        remarks: clean(req.body.remarks),
        createdby: clean(req.body.user),
        createdbyname: clean(req.body.username)
      });
      asset.status = "Assigned";
      asset.assignedto = tracking.toname;
      asset.assignedtoemail = tracking.toemail;
      asset.department = tracking.department;
      asset.assigneddate = tracking.assignmentdate;
      asset.lasttrackingid = tracking._id;
      await asset.save();
      savedAssets.push(asset);
      trackingRows.push(tracking);
    }
    res.json({ success: true, data: savedAssets[0], dataList: savedAssets, updated: savedAssets.length, tracking: trackingRows[0], trackingList: trackingRows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.releaseAssets = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!colid || !ids.length) return res.status(400).json({ success: false, message: "Select assigned assets to release" });
    const assets = await AssetItem.find({ _id: { $in: ids }, colid, status: "Assigned" });
    if (!assets.length) return res.status(400).json({ success: false, message: "No assigned assets found for release" });
    const trackingRows = [];
    for (const asset of assets) {
      const tracking = await AssetTracking.create({
        colid,
        asset: asset._id,
        assetid: asset.assetid,
        itemmasterid: asset.itemmasterid,
        requisitionid: asset.requisitionid,
        store: asset.store,
        category: asset.category,
        item: asset.item,
        description: asset.description,
        action: "Assignment Deleted",
        assignmentdate: new Date(),
        fromname: asset.assignedto,
        fromemail: asset.assignedtoemail,
        toname: "",
        toemail: "",
        department: asset.department,
        remarks: clean(req.body.remarks) || "Assignment deleted and asset released for reassignment.",
        createdby: clean(req.body.user),
        createdbyname: clean(req.body.username)
      });
      asset.status = "Available";
      asset.assignedto = "";
      asset.assignedtoemail = "";
      asset.department = "";
      asset.assigneddate = undefined;
      asset.requisitionid = undefined;
      asset.lasttrackingid = tracking._id;
      await asset.save();
      trackingRows.push(tracking);
    }
    res.json({ success: true, updated: assets.length, data: assets, tracking: trackingRows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.returnAsset = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const asset = await AssetItem.findOne({ _id: req.body.assetid || req.body.id, colid });
    if (!asset) return res.status(404).json({ success: false, message: "Asset not found" });
    if (asset.status !== "Assigned") return res.status(400).json({ success: false, message: "Only assigned assets can be returned" });
    const returnDate = req.body.returndate ? new Date(req.body.returndate) : new Date();
    const returnCondition = clean(req.body.returncondition) || asset.condition || "Good";
    const tracking = await AssetTracking.create({
      colid,
      asset: asset._id,
      assetid: asset.assetid,
      itemmasterid: asset.itemmasterid,
      requisitionid: asset.requisitionid,
      store: asset.store,
      category: asset.category,
      item: asset.item,
      description: asset.description,
      action: "Return",
      assignmentdate: returnDate,
      fromname: asset.assignedto,
      fromemail: asset.assignedtoemail,
      toname: "Store / Asset inventory",
      toemail: "",
      department: asset.department,
      returncondition: returnCondition,
      remarks: clean(req.body.remarks),
      createdby: clean(req.body.user),
      createdbyname: clean(req.body.username)
    });
    asset.status = "Available";
    asset.condition = returnCondition;
    asset.assignedto = "";
    asset.assignedtoemail = "";
    asset.department = "";
    asset.assigneddate = undefined;
    asset.requisitionid = undefined;
    asset.lasttrackingid = tracking._id;
    await asset.save();
    res.json({ success: true, data: asset, tracking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.retireAsset = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const asset = await AssetItem.findOne({ _id: req.body.assetid || req.body.id, colid });
    if (!asset) return res.status(404).json({ success: false, message: "Asset not found" });
    const retirement = await AssetRetirement.create({
      colid,
      asset: asset._id,
      assetid: asset.assetid,
      itemmasterid: asset.itemmasterid,
      store: asset.store,
      category: asset.category,
      item: asset.item,
      status: clean(req.body.status) || "Retired",
      retirementtype: clean(req.body.retirementtype),
      retirementdate: req.body.retirementdate ? new Date(req.body.retirementdate) : new Date(),
      agency: clean(req.body.agency),
      location: clean(req.body.location),
      recyclevalue: num(req.body.recyclevalue, 0),
      details: clean(req.body.details),
      createdby: clean(req.body.user),
      createdbyname: clean(req.body.username)
    });
    asset.status = retirement.status || "Retired";
    asset.condition = retirement.retirementtype || asset.condition;
    asset.assignedto = "";
    asset.assignedtoemail = "";
    await asset.save();
    await AssetTracking.create({
      colid,
      asset: asset._id,
      assetid: asset.assetid,
      itemmasterid: asset.itemmasterid,
      store: asset.store,
      category: asset.category,
      item: asset.item,
      description: asset.description,
      action: retirement.status || "Retired",
      assignmentdate: retirement.retirementdate,
      remarks: retirement.details,
      createdby: clean(req.body.user),
      createdbyname: clean(req.body.username)
    });
    res.json({ success: true, data: asset, retirement });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getRetirements = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    ["assetid", "store", "category", "item", "status", "retirementtype", "agency", "location"].forEach((field) => {
      if (req.query[field]) filter[field] = ["assetid", "item"].includes(field) ? rx(req.query[field]) : req.query[field];
    });
    const range = dateRange(req.query.fromdate, req.query.todate);
    if (range) filter.retirementdate = range;
    const data = await AssetRetirement.find(filter).sort({ retirementdate: -1 }).limit(5000).lean();
    res.json({ success: true, data, options: optionsFrom(data, ["assetid", "store", "category", "item", "status", "retirementtype", "agency", "location"]) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const filter = { colid };
    ["store", "category", "item", "status", "department"].forEach((field) => {
      if (req.query[field]) filter[field] = req.query[field];
    });
    const assets = await AssetItem.find(filter).lean();
    const track = await AssetTracking.find({ colid }).sort({ assignmentdate: -1 }).limit(5000).lean();
    const group = (field, rows = assets) => Object.values(rows.reduce((acc, row) => {
      const key = clean(row[field]) || "NA";
      acc[key] = acc[key] || { name: key, count: 0, value: 0 };
      acc[key].count += 1;
      acc[key].value += 1;
      return acc;
    }, {})).sort((a, b) => b.count - a.count);
    const demand = Object.values(track.reduce((acc, row) => {
      const key = clean(row.item) || "NA";
      acc[key] = acc[key] || { name: key, assignments: 0 };
      if (["Issue", "Reissue", "Assignment"].includes(row.action)) acc[key].assignments += 1;
      return acc;
    }, {})).sort((a, b) => b.assignments - a.assignments).slice(0, 20);
    res.json({
      success: true,
      totals: {
        total: assets.length,
        available: assets.filter((row) => row.status === "Available").length,
        assigned: assets.filter((row) => row.status === "Assigned").length,
        retired: assets.filter((row) => ["Retired", "Recycled", "Disposed"].includes(row.status)).length
      },
      departmentwise: group("department"),
      categorywise: group("category"),
      statuswise: group("status"),
      retirementstatus: group("status", assets.filter((row) => ["Retired", "Recycled", "Disposed"].includes(row.status))),
      demand,
      assets
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
