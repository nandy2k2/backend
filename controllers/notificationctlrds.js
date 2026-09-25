const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const escapeRegExp = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const studentFields = [
  "academicyear", "admissionyear", "regulation", "program", "programcode", "semester", "section",
  "name", "regno", "email", "phone", "department", "category", "gender", "notification", "expopushtoken"
];
const userFields = [
  "role", "department", "designation", "institution", "name", "email", "phone", "notification", "expopushtoken"
];

const selectedFields = "name email phone role regno academicyear admissionyear regulation program programcode semester section department designation institution category gender notification expopushtoken";

const baseQuery = (colid, type) => ({
  colid,
  role: type === "student" ? /^student$/i : { $not: /^student$/i }
});

const fieldList = (type) => (type === "student" ? studentFields : userFields).map((field) => ({
  field,
  label: field === "expopushtoken" ? "Expo Push Token" : field.charAt(0).toUpperCase() + field.slice(1)
}));

const buildFilters = (filters = [], type) => {
  const allowed = new Set(type === "student" ? studentFields : userFields);
  const query = {};
  (Array.isArray(filters) ? filters : []).forEach((filter) => {
    const field = text(filter.field);
    const operator = text(filter.operator || "equals");
    const value = filter.value;
    if (!allowed.has(field)) return;
    if (operator === "notempty") {
      query[field] = { $nin: ["", null] };
      return;
    }
    if (operator === "empty") {
      query[field] = { $in: ["", null] };
      return;
    }
    if (Array.isArray(value)) {
      const values = value.map(text).filter(Boolean);
      if (values.length) query[field] = { $in: values };
      return;
    }
    const clean = text(value);
    if (!clean) return;
    query[field] = operator === "contains" ? { $regex: escapeRegExp(clean), $options: "i" } : clean;
  });
  return query;
};

const optionsFor = async (colid, type) => {
  const query = baseQuery(colid, type);
  const entries = await Promise.all(fieldList(type).map(async ({ field, label }) => {
    const values = await User.distinct(field, query);
    return [field, { label, values: values.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }];
  }));
  return Object.fromEntries(entries);
};

exports.options = async (req, res) => {
  try {
    const colid = asNumber(req.query.colid);
    const type = text(req.query.type).toLowerCase() === "student" ? "student" : "user";
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    res.json({ success: true, fields: fieldList(type), options: await optionsFor(colid, type) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.search = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const type = text(req.body.type).toLowerCase() === "student" ? "student" : "user";
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { ...baseQuery(colid, type), ...buildFilters(req.body.filters, type) };
    const rows = await User.find(query).select(selectedFields).sort({ programcode: 1, semester: 1, role: 1, name: 1 }).limit(5000).lean();
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpdateSettings = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const type = text(req.body.type).toLowerCase() === "student" ? "student" : "user";
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one user" });
    const update = {};
    if (req.body.expopushtoken !== undefined) update.expopushtoken = text(req.body.expopushtoken);
    if (["Yes", "No"].includes(text(req.body.notification))) update.notification = text(req.body.notification);
    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: "Nothing to update" });
    const result = await User.updateMany({ _id: { $in: ids }, ...baseQuery(colid, type) }, { $set: update });
    res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicUpdateByEmail = async (req, res) => {
  try {
    const email = text(req.body.email).toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: "email is required" });
    const update = {};
    if (req.body.expopushtoken !== undefined) update.expopushtoken = text(req.body.expopushtoken);
    if (["Yes", "No"].includes(text(req.body.notification))) update.notification = text(req.body.notification);
    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: "expopushtoken or notification is required" });
    const user = await User.findOneAndUpdate({ email: new RegExp(`^${escapeRegExp(email)}$`, "i") }, { $set: update }, { new: true })
      .select("name email role notification expopushtoken")
      .lean();
    if (!user) return res.status(404).json({ success: false, message: "No user found for email" });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const sendExpoBatch = async (messages) => {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.errors?.[0]?.message || data?.message || "Expo push service failed");
  return data;
};

exports.sendPush = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const type = text(req.body.type).toLowerCase() === "student" ? "student" : "user";
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const title = text(req.body.title);
    const body = text(req.body.message);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one recipient" });
    if (!title || !body) return res.status(400).json({ success: false, message: "title and message are required" });
    const users = await User.find({
      _id: { $in: ids },
      ...baseQuery(colid, type),
      notification: { $ne: "No" },
      expopushtoken: { $nin: ["", null] }
    }).select(selectedFields).lean();
    const data = typeof req.body.data === "object" && req.body.data ? req.body.data : {};
    const ttl = Number(req.body.ttl);
    const messages = users.map((user) => ({
      to: user.expopushtoken,
      title,
      body,
      data: { ...data, userid: String(user._id), email: user.email, role: user.role },
      ...(Number.isFinite(ttl) && ttl > 0 ? { ttl } : {})
    }));
    const chunks = [];
    for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));
    const results = [];
    for (const chunk of chunks) results.push(await sendExpoBatch(chunk));
    res.json({ success: true, requested: ids.length, sent: messages.length, skipped: ids.length - messages.length, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
