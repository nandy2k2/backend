const models = {
  departmentindentds: require("../Models/departmentindentds"),
  departmentindentds2: require("../Models/departmentindentds"),
  itemcategoryds2: require("../Models/itemcategoryds2"),
  itemtypeds2: require("../Models/itemtypeds2"),
  itemunitds2: require("../Models/itemunitds2"),
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
  vendorpaymentscheduleds2: require("../Models/vendorpayschds"),
  usersignatureds: require("../Models/usersignatureds"),
  storepoapprovalworkflowds2: require("../Models/storepoapprovalworkflowds2"),
  purchase2mailconfigds2: require("../Models/purchase2mailconfigds2"),
  cashapprovalds2: require("../Models/CashApprovalds2"),
  CashApprovalds2: require("../Models/CashApprovalds2"),
  pimprestds2: require("../Models/pimprestds2")
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
  if (payload.department && !payload.departmentname) payload.departmentname = payload.department;
  delete payload.department;
  if (payload.type && !payload.itemtype) payload.itemtype = payload.type;
  if (payload.categoryname && !payload.category) payload.category = payload.categoryname;
  delete payload.type;
  if (payload.creatoremail && !payload.creatoruserid) payload.creatoruserid = payload.creatoremail;
  delete payload.creatoremail;
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
    ["itemname", "itemcode", "category", "itemtype", "unit", "status"].forEach((field) => {
      if (!text(payload[field])) throw new Error(`${field} is required`);
    });
    const duplicate = await Model.findOne({
      colid: Number(payload.colid),
      itemcode: { $regex: `^${escapeRegex(payload.itemcode)}$`, $options: "i" },
      ...(id ? { _id: { $ne: id } } : {})
    }).lean();
    if (duplicate) throw new Error("Duplicate item code is not allowed");
  }
  if (key === "itemunitds2") {
    ["unitname", "unitcode", "status"].forEach((field) => {
      if (!text(payload[field])) throw new Error(`${field} is required`);
    });
    const duplicate = await Model.findOne({
      colid: Number(payload.colid),
      unitcode: { $regex: `^${escapeRegex(payload.unitcode)}$`, $options: "i" },
      ...(id ? { _id: { $ne: id } } : {})
    }).lean();
    if (duplicate) throw new Error("Duplicate unit code is not allowed");
  }
  if (key === "itemtypeds2") {
    ["itemtype", "status"].forEach((field) => {
      if (!text(payload[field])) throw new Error(`${field} is required`);
    });
    const duplicate = await Model.findOne({
      colid: Number(payload.colid),
      itemtype: { $regex: `^${escapeRegex(payload.itemtype)}$`, $options: "i" },
      ...(id ? { _id: { $ne: id } } : {})
    }).lean();
    if (duplicate) throw new Error("Duplicate item type is not allowed");
  }
  if (key === "itemcategoryds2") {
    ["categoryname", "status"].forEach((field) => {
      if (!text(payload[field])) throw new Error(`${field} is required`);
    });
    const duplicate = await Model.findOne({
      colid: Number(payload.colid),
      categoryname: { $regex: `^${escapeRegex(payload.categoryname)}$`, $options: "i" },
      ...(id ? { _id: { $ne: id } } : {})
    }).lean();
    if (duplicate) throw new Error("Duplicate item category is not allowed");
  }
  if (key === "departmentindentds" || key === "departmentindentds2") {
    ["departmentname"].forEach((field) => {
      if (!text(payload[field])) throw new Error(`${field} is required`);
    });
    const duplicate = await Model.findOne({
      colid: Number(payload.colid),
      departmentname: { $regex: `^${escapeRegex(payload.departmentname)}$`, $options: "i" },
      ...(id ? { _id: { $ne: id } } : {})
    }).lean();
    if (duplicate) throw new Error("Duplicate department name is not allowed");
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
    if (["itemmasterds2", "itemunitds2", "itemtypeds2", "itemcategoryds2"].includes(req.params.model)) {
      const seen = new Set();
      prepared.forEach((row) => {
        const code = text(
          req.params.model === "itemunitds2" ? row.unitcode
            : req.params.model === "itemtypeds2" ? row.itemtype
              : req.params.model === "itemcategoryds2" ? row.categoryname
                : row.itemcode
        ).toLowerCase();
        if (seen.has(code)) throw new Error(`Duplicate value in upload: ${code}`);
        seen.add(code);
      });
    }
    if (req.params.model === "departmentindentds" || req.params.model === "departmentindentds2") {
      const seen = new Set();
      prepared.forEach((row) => {
        const departmentName = text(row.departmentname || row.department).toLowerCase();
        if (seen.has(departmentName)) throw new Error(`Duplicate department name in upload: ${row.departmentname || row.department}`);
        seen.add(departmentName);
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
