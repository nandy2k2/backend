const models = {
  departmentindentds2: require("../Models/departmentindentds2"),
  itemmasterds2: require("../Models/itemmasterds2"),
  storecashaccountds2: require("../Models/storecashaccountds2"),
  storeitemds2: require("../Models/storeitemds2"),
  storeitemsds2: require("../Models/storeitemds2"),
  storemasterds2: require("../Models/storemasterds2"),
  storepoapprovalds2: require("../Models/storepoapprovalds2"),
  storepoassignmentds2: require("../Models/storepoassignmentds2"),
  storepoitemsds2: require("../Models/storepoitemsds2"),
  storepoorderds2: require("../Models/storepoorderds2"),
  storerequisationds2: require("../Models/storerequisationds2"),
  storerequisitionds2: require("../Models/storerequisationds2"),
  storerequisitionitemsds2: require("../Models/storerequisitionitemsds2"),
  storeprrequestds2: require("../Models/storeprrequestds2"),
  storeprrequestitemsds2: require("../Models/storeprrequestitemsds2"),
  storeuserds2: require("../Models/storeuserds2"),
  storeusersds2: require("../Models/storeuserds2"),
  storegatepassds2: require("../Models/storegatepassds2"),
  storegatepassitemsds2: require("../Models/storegatepassitemsds2"),
  storequalitycheckds2: require("../Models/storequalitycheckds2"),
  storequalitycheckitemsds2: require("../Models/storequalitycheckitemsds2"),
  grnds2: require("../Models/grnds2"),
  storegrnds2: require("../Models/storegrnds2"),
  grnitemsds2: require("../Models/grnitemsds2"),
  storegrnitemsds2: require("../Models/storegrnitemsds2"),
  vendords2: require("../Models/vendords2"),
  vendorsds2: require("../Models/vendords2"),
  vendoritemds2: require("../Models/vendoritemds2"),
  vendoritemsds2: require("../Models/vendoritemds2"),
  vendorpayschds: require("../Models/vendorpayschds"),
  vendorpaymentscheduleds2: require("../Models/vendorpayschds")
};

function getModel(key) {
  return models[String(key || "").trim()];
}

function text(value) {
  return String(value || "").trim();
}

function escapeRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFilters(source = {}) {
  if (!source.filters) return [];
  if (Array.isArray(source.filters)) return source.filters;
  try {
    const parsed = JSON.parse(source.filters);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function queryFrom(Model, source = {}) {
  const query = {};
  if (source.colid) query.colid = Number(source.colid);
  parseFilters(source).forEach((filter) => {
    const field = text(filter.field);
    const value = filter.value;
    if (!field || value === undefined || value === null || text(value) === "") return;
    if (!Model.schema.path(field)) return;
    const instance = Model.schema.path(field).instance;
    if (instance === "Number") query[field] = Number(value);
    else if (instance === "Date") {
      const start = new Date(value);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        query[field] = { $gte: start, $lt: end };
      }
    } else {
      query[field] = { $regex: escapeRegex(value), $options: "i" };
    }
  });
  return query;
}

function cleanPayload(body = {}) {
  const payload = { ...body };
  delete payload.id;
  delete payload._id;
  delete payload.createdAt;
  delete payload.updatedAt;
  if (payload.colid !== undefined) payload.colid = Number(payload.colid);
  if (typeof payload.transactions === "string") {
    try {
      payload.transactions = payload.transactions ? JSON.parse(payload.transactions) : [];
    } catch (error) {
      payload.transactions = [];
    }
  }
  return payload;
}

async function validatePurchase2Payload(Model, modelKey, payload, id = "") {
  const key = String(modelKey || "").trim();
  if (key === "itemmasterds2") {
    ["itemname", "itemcode", "category", "unit", "status"].forEach((field) => {
      if (!text(payload[field])) throw new Error(`${field} is required`);
    });
    const duplicate = await Model.findOne({
      colid: Number(payload.colid),
      itemcode: { $regex: `^${escapeRegex(payload.itemcode)}$`, $options: "i" },
      ...(id ? { _id: { $ne: id } } : {})
    }).lean();
    if (duplicate) throw new Error("Duplicate item code is not allowed");
  }
  if (key === "departmentindentds2") {
    ["department", "departmentcode"].forEach((field) => {
      if (!text(payload[field])) throw new Error(`${field} is required`);
    });
    const duplicate = await Model.findOne({
      colid: Number(payload.colid),
      departmentcode: { $regex: `^${escapeRegex(payload.departmentcode)}$`, $options: "i" },
      ...(id ? { _id: { $ne: id } } : {})
    }).lean();
    if (duplicate) throw new Error("Duplicate department code is not allowed");
  }
}

exports.getPurchase2Rows = async (req, res) => {
  try {
    const Model = getModel(req.params.model);
    if (!Model) return res.status(404).json({ success: false, message: "Purchase 2 model not found" });
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await Model.find(queryFrom(Model, req.query)).sort({ createdAt: -1, _id: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePurchase2Row = async (req, res) => {
  try {
    const Model = getModel(req.params.model);
    if (!Model) return res.status(404).json({ success: false, message: "Purchase 2 model not found" });
    const payload = cleanPayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    await validatePurchase2Payload(Model, req.params.model, payload, req.body.id);
    const data = req.body.id
      ? await Model.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await Model.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePurchase2Row = async (req, res) => {
  try {
    const Model = getModel(req.params.model);
    if (!Model) return res.status(404).json({ success: false, message: "Purchase 2 model not found" });
    const data = await Model.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkPurchase2Rows = async (req, res) => {
  try {
    const Model = getModel(req.params.model);
    if (!Model) return res.status(404).json({ success: false, message: "Purchase 2 model not found" });
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const prepared = rows.map((row) => cleanPayload({
      ...row,
      colid,
      name: row.name || req.body.name || "NA",
      user: row.user || req.body.user || "NA"
    }));
    if (!prepared.length) return res.status(400).json({ success: false, message: "No rows found for upload" });
    if (req.params.model === "itemmasterds2") {
      const seen = new Set();
      prepared.forEach((row) => {
        const code = text(row.itemcode).toLowerCase();
        if (seen.has(code)) throw new Error(`Duplicate item code in upload: ${row.itemcode}`);
        seen.add(code);
      });
    }
    if (req.params.model === "departmentindentds2") {
      const seen = new Set();
      prepared.forEach((row) => {
        const code = text(row.departmentcode).toLowerCase();
        if (seen.has(code)) throw new Error(`Duplicate department code in upload: ${row.departmentcode}`);
        seen.add(code);
      });
    }
    for (const row of prepared) {
      await validatePurchase2Payload(Model, req.params.model, row);
    }
    const data = await Model.insertMany(prepared, { ordered: false });
    res.json({ success: true, inserted: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
