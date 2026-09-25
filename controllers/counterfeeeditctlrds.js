const CounterFee2Transaction = require("../Models/counterfee2transactionds");

const PASSWORD = "kumropatash";
const text = (value) => String(value ?? "").trim();
const toNumber = (value, fallback = undefined) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsRegex = (value) => new RegExp(escapeRegex(value), "i");

const filterFields = [
  "transactionid",
  "academicyear",
  "admissionyear",
  "regulation",
  "program",
  "programcode",
  "semester",
  "section",
  "student",
  "regno",
  "email",
  "phone",
  "paymode",
  "referenceNumber",
  "collectedby",
  "collectedbyname",
  "feegroup",
  "feecategory",
  "feeitem",
  "feebook",
  "cashbook"
];

const itemFields = new Set(["feegroup", "feecategory", "feeitem", "feebook", "cashbook"]);
const editableFields = [
  "transactionid",
  "paiddate",
  "referenceNumber",
  "chequenumber",
  "paymode",
  "paydetails",
  "remarks",
  "transactionremarks",
  "collectedby",
  "collectedbyname",
  "totalpaid",
  "academicyear",
  "admissionyear",
  "regulation",
  "program",
  "programcode",
  "semester",
  "section",
  "major",
  "minor",
  "student",
  "regno",
  "email",
  "phone",
  "address",
  "items"
];

const requirePassword = (value) => {
  if (text(value) !== PASSWORD) {
    const error = new Error("Invalid password");
    error.statusCode = 403;
    throw error;
  }
};

const parseFilters = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const addDateRange = (query, source = {}) => {
  const from = text(source.fromdate);
  const to = text(source.todate);
  if (!from && !to) return;
  query.paiddate = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);
      query.paiddate.$gte = start;
    }
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      query.paiddate.$lte = end;
    }
  }
  if (!Object.keys(query.paiddate).length) delete query.paiddate;
};

const buildQuery = (source = {}) => {
  const colid = toNumber(source.colid);
  if (colid === undefined) {
    const error = new Error("colid is required");
    error.statusCode = 400;
    throw error;
  }
  const query = { colid };
  addDateRange(query, source);
  parseFilters(source.filters).forEach((filter) => {
    const field = text(filter.field);
    if (!filterFields.includes(field)) return;
    const values = Array.isArray(filter.value) ? filter.value.map(text).filter(Boolean) : [text(filter.value)].filter(Boolean);
    if (!values.length) return;
    const targetField = itemFields.has(field) ? `items.${field}` : field;
    const conditions = values.map((value) => ({ [targetField]: containsRegex(value) }));
    query.$and = query.$and || [];
    query.$and.push(conditions.length === 1 ? conditions[0] : { $or: conditions });
  });
  return query;
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    ledgerid: text(item.ledgerid),
    academicyear: text(item.academicyear),
    admissionyear: text(item.admissionyear),
    regulation: text(item.regulation),
    program: text(item.program),
    programcode: text(item.programcode),
    semester: text(item.semester),
    section: text(item.section),
    major: text(item.major),
    minor: text(item.minor),
    student: text(item.student),
    regno: text(item.regno),
    email: text(item.email),
    phone: text(item.phone),
    address: text(item.address),
    feegroup: text(item.feegroup),
    feeitem: text(item.feeitem),
    feecategory: text(item.feecategory),
    feetype: text(item.feetype),
    feebook: text(item.feebook),
    cashbook: text(item.cashbook),
    noofitems: toNumber(item.noofitems, 1),
    unitamount: toNumber(item.unitamount, 0),
    amount: toNumber(item.amount, 0),
    previouspaid: toNumber(item.previouspaid, 0),
    previousbalance: toNumber(item.previousbalance, 0),
    paidamount: toNumber(item.paidamount, 0),
    newpaid: toNumber(item.newpaid, 0),
    newbalance: toNumber(item.newbalance, 0)
  }));
};

const cleanPayload = (body = {}) => {
  const payload = {};
  editableFields.forEach((field) => {
    if (body[field] === undefined) return;
    if (field === "paiddate") {
      const date = new Date(body[field]);
      if (!Number.isNaN(date.getTime())) payload.paiddate = date;
    } else if (field === "totalpaid") {
      payload.totalpaid = toNumber(body.totalpaid, 0);
    } else if (field === "items") {
      payload.items = normalizeItems(body.items);
      if (body.totalpaid === undefined) payload.totalpaid = payload.items.reduce((sum, item) => sum + toNumber(item.paidamount, 0), 0);
    } else {
      payload[field] = text(body[field]);
    }
  });
  const first = payload.items?.[0];
  if (first) {
    ["academicyear", "admissionyear", "regulation", "program", "programcode", "semester", "section", "major", "minor", "student", "regno", "email", "phone", "address"].forEach((field) => {
      if (!text(payload[field])) payload[field] = first[field] || "";
    });
  }
  return payload;
};

exports.options = async (req, res) => {
  try {
    requirePassword(req.query.password);
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const entries = await Promise.all(filterFields.map(async (field) => {
      const dbField = itemFields.has(field) ? `items.${field}` : field;
      const values = await CounterFee2Transaction.distinct(dbField, { colid });
      return [field, values.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
    }));
    res.json({ success: true, fields: filterFields, options: Object.fromEntries(entries) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    requirePassword(req.body.password || req.query.password);
    const query = buildQuery(req.body);
    const data = await CounterFee2Transaction.find(query).sort({ paiddate: -1, createdAt: -1 }).limit(5000).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = cleanPayload(req.body);
    payload.colid = colid;
    if (!payload.transactionid) payload.transactionid = `CF-EDIT-${colid}-${Date.now()}`;
    if (!payload.paiddate) payload.paiddate = new Date();
    if (!payload.student && payload.items?.[0]?.student) payload.student = payload.items[0].student;
    if (!payload.regno && payload.items?.[0]?.regno) payload.regno = payload.items[0].regno;
    const data = await CounterFee2Transaction.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const colid = toNumber(req.body.colid);
    const id = text(req.body.id || req.body._id);
    if (colid === undefined || !id) return res.status(400).json({ success: false, message: "colid and id are required" });
    const payload = cleanPayload(req.body);
    const data = await CounterFee2Transaction.findOneAndUpdate({ _id: id, colid }, { $set: payload }, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Receipt not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const colid = toNumber(req.body.colid);
    const id = text(req.body.id || req.body._id);
    if (colid === undefined || !id) return res.status(400).json({ success: false, message: "colid and id are required" });
    const data = await CounterFee2Transaction.findOneAndDelete({ _id: id, colid });
    if (!data) return res.status(404).json({ success: false, message: "Receipt not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
