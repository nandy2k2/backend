const Ledgerstud = require("../Models/ledgerstud");

const fields = [
  "academicyear", "admissionyear", "programcode", "regulation", "major", "minor",
  "student", "regno", "user", "name", "feegroup", "feeitem", "feecategory", "feetype",
  "feebook", "cashbook", "semester", "amount", "paid", "concession", "balance",
  "Latefinedue", "Latefinepaid",
  "cash", "upi", "cheque", "card", "pg", "neft", "paymode", "paydetails",
  "feecounter", "institution", "type", "installment", "status", "classdate",
  "duedate", "paiddate", "comments", "doclink", "feeid"
];

const numberFields = ["amount", "paid", "concession", "balance", "Latefinedue", "Latefinepaid", "cash", "upi", "cheque", "card", "pg", "neft"];
const dateFields = ["classdate", "duedate", "paiddate"];
const requiredDefaults = {
  feegroup: "NA",
  regno: "NA",
  student: "NA",
  feeitem: "NA",
  academicyear: "NA",
  status: "Active"
};

function toNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value ?? "").trim();
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

function normalizeRow(row = {}) {
  const normalized = {};
  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = String(key || "").replace(/\s+/g, "").toLowerCase();
    const matched = fields.find((field) => field.toLowerCase() === cleanKey);
    if (matched) normalized[matched] = value;
  });
  return { ...row, ...normalized };
}

function buildPayload(body = {}) {
  const row = normalizeRow(body);
  const payload = {};
  fields.forEach((field) => {
    if (row[field] === undefined) return;
    if (numberFields.includes(field)) payload[field] = toNumber(row[field], 0);
    else if (dateFields.includes(field)) payload[field] = toDate(row[field], undefined);
    else payload[field] = text(row[field]);
  });
  Object.entries(requiredDefaults).forEach(([field, value]) => {
    if (!payload[field]) payload[field] = value;
  });
  if (!payload.classdate) payload.classdate = new Date();
  if (!payload.name) payload.name = text(body.username || body.currentname || body.user) || "NA";
  if (!payload.user) payload.user = text(body.currentuser || body.user) || "NA";
  if (payload.balance === undefined) payload.balance = Math.max(0, toNumber(payload.amount, 0) - toNumber(payload.paid, 0) - toNumber(payload.concession, 0));
  return payload;
}

function buildQuery(colid, filters = []) {
  const query = { colid };
  filters.forEach((filter) => {
    const field = text(filter.field);
    const value = text(filter.value);
    if (!field || !value || !fields.includes(field)) return;
    if (numberFields.includes(field)) query[field] = toNumber(value, undefined);
    else if (dateFields.includes(field)) {
      const date = toDate(value, null);
      if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        query[field] = { $gte: start, $lte: end };
      }
    } else if (["student", "regno", "user", "name", "comments", "paydetails"].includes(field)) {
      query[field] = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    } else {
      query[field] = value;
    }
  });
  return query;
}

exports.getOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const optionFields = fields.filter((field) => !["comments", "doclink", "feeid", "paydetails"].includes(field));
    const values = {};
    await Promise.all(optionFields.map(async (field) => {
      values[field] = (await Ledgerstud.distinct(field, { colid }))
        .filter((item) => item !== null && item !== undefined && item !== "")
        .map((item) => String(item))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({ success: true, fields, optionFields, values });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = buildQuery(colid, Array.isArray(req.body.filters) ? req.body.filters : []);
    const data = await Ledgerstud.find(query).sort({ classdate: -1, createdAt: -1 }).limit(5000).lean();
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
    const data = req.body.id
      ? await Ledgerstud.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await Ledgerstud.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Ledger entry not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    const data = await Ledgerstud.findOneAndDelete({ _id: req.body.id, colid });
    if (!data) return res.status(404).json({ success: false, message: "Ledger entry not found" });
    res.json({ success: true });
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
    const errors = [];
    const docs = rows.map((row, index) => {
      try {
        return { ...buildPayload({ ...row, currentuser: req.body.user, currentname: req.body.name }), colid };
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
        return null;
      }
    }).filter(Boolean);
    const data = docs.length ? await Ledgerstud.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: data.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
