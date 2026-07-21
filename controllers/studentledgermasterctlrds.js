const Ledgerstud = require("../Models/ledgerstud");

const internalFields = ["__v"];
const fields = Object.keys(Ledgerstud.schema.paths).filter((field) => !internalFields.includes(field));
const editableFields = fields.filter((field) => !["_id", "createdAt", "updatedAt"].includes(field));
const numberFields = fields.filter((field) => Ledgerstud.schema.paths[field]?.instance === "Number");
const dateFields = fields.filter((field) => Ledgerstud.schema.paths[field]?.instance === "Date");
const requiredDefaults = {
  name: "NA",
  user: "NA",
  feegroup: "NA",
  regno: "NA",
  student: "NA",
  feeitem: "NA",
  academicyear: "NA",
  status: "Active"
};

function text(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value, fallback = undefined) {
  if (!value) return fallback;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return Number.isNaN(date.getTime()) ? fallback : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function escapeRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRow(row = {}) {
  const normalized = {};
  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = text(key).replace(/\s+/g, "").toLowerCase();
    const matched = editableFields.find((field) => field.toLowerCase() === cleanKey);
    if (matched) normalized[matched] = value;
  });
  return { ...row, ...normalized };
}

function buildPayload(body = {}) {
  const row = normalizeRow(body);
  const payload = {};
  editableFields.forEach((field) => {
    if (field === "colid") return;
    if (row[field] === undefined) return;
    if (numberFields.includes(field)) payload[field] = toNumber(row[field], 0);
    else if (dateFields.includes(field)) payload[field] = toDate(row[field], undefined);
    else payload[field] = text(row[field]);
  });
  Object.entries(requiredDefaults).forEach(([field, value]) => {
    if (!payload[field]) payload[field] = value;
  });
  if (!payload.classdate) payload.classdate = new Date();
  if (!payload.name || payload.name === "NA") payload.name = text(body.currentname || body.username || body.name) || "NA";
  if (!payload.user || payload.user === "NA") payload.user = text(body.currentuser || body.user) || "NA";
  if (payload.balance === undefined) {
    payload.balance = Math.max(0, toNumber(payload.amount, 0) - toNumber(payload.paid, 0) - toNumber(payload.concession, 0));
  }
  return payload;
}

function buildQuery(colid, filters = []) {
  const query = { colid };
  filters.forEach((filter) => {
    const field = text(filter.field);
    const value = filter.value;
    if (!field || value === "" || value === null || value === undefined || !fields.includes(field)) return;
    if (field === "_id") {
      query._id = text(value);
    } else if (numberFields.includes(field)) {
      query[field] = toNumber(value, undefined);
    } else if (dateFields.includes(field)) {
      const date = toDate(value, null);
      if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        query[field] = { $gte: start, $lte: end };
      }
    } else {
      query[field] = new RegExp(escapeRegex(value), "i");
    }
  });
  return query;
}

exports.getOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const optionFields = fields.filter((field) => !["_id", "approvalhistory"].includes(field));
    const values = {};
    await Promise.all(optionFields.map(async (field) => {
      values[field] = (await Ledgerstud.distinct(field, { colid }))
        .filter((item) => item !== null && item !== undefined && item !== "")
        .map((item) => dateFields.includes(field) ? new Date(item).toISOString().slice(0, 10) : String(item))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({ success: true, fields, editableFields, numberFields, dateFields, values });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = buildQuery(colid, Array.isArray(req.body.filters) ? req.body.filters : []);
    const data = await Ledgerstud.find(query).sort({ classdate: -1, _id: -1 }).limit(10000).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = { ...buildPayload(req.body), colid };
    const id = req.body.id || req.body._id;
    const data = id
      ? await Ledgerstud.findOneAndUpdate({ _id: id, colid }, payload, { new: true, runValidators: true })
      : await Ledgerstud.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Student ledger entry not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await Ledgerstud.findOneAndDelete({ _id: req.body.id, colid });
    if (!data) return res.status(404).json({ success: false, message: "Student ledger entry not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "No ledger entries selected" });
    const result = await Ledgerstud.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows found" });
    const docs = rows.map((row) => ({ ...buildPayload({ ...row, currentuser: req.body.user, currentname: req.body.name }), colid }));
    const data = await Ledgerstud.insertMany(docs, { ordered: false });
    res.json({ success: true, inserted: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
