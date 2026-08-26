const AuditEmailConfig = require("../Models/neplmsauditemailconfigurationds");
const EmailConfiguration = require("../Models/emailconfigurationds");
const { createMissingAttendanceTasks, completeTakenAttendanceTasks } = require("../utils/neplmsAttendanceTaskHelper");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const rx = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const types = ["Attendance", "Assignment", "Quiz", "Online examination", "Assessment"];

const scope = (source = {}) => {
  const colid = number(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};

const payloadFrom = (body = {}) => {
  const payload = scope(body);
  payload.emailconfigurationid = text(body.emailconfigurationid) || undefined;
  payload.emailconfiguration = text(body.emailconfiguration);
  payload.recipient = text(body.recipient);
  payload.recipientname = text(body.recipientname);
  payload.subject = text(body.subject);
  payload.type = text(body.type) || "Attendance";
  payload.enabled = text(body.enabled) || "Yes";
  payload.user = text(body.user);
  payload.namecreated = text(body.namecreated || body.name);
  return payload;
};

const queryFrom = (source = {}) => {
  const query = scope(source);
  ["emailconfiguration", "recipient", "recipientname", "subject", "type", "enabled", "user", "namecreated"].forEach((field) => {
    if (text(source[field])) query[field] = rx(source[field]);
  });
  return query;
};

exports.options = async (req, res) => {
  try {
    const { colid } = scope(req.query);
    const [configs, rows] = await Promise.all([
      EmailConfiguration.find({ colid, isactive: { $ne: "No" } }).sort({ default: -1, provider: 1, username: 1 }).lean(),
      AuditEmailConfig.find({ colid }).lean()
    ]);
    const distinct = (field) => [...new Set(rows.map((row) => text(row[field])).filter(Boolean))].sort();
    res.json({
      success: true,
      types,
      enabledOptions: ["Yes", "No"],
      emailconfigs: configs.map((row) => ({
        ...row,
        label: `${row.provider || "Email"} / ${row.type || "General"} / ${row.username || ""}`
      })),
      filterOptions: {
        emailconfiguration: distinct("emailconfiguration"),
        recipient: distinct("recipient"),
        recipientname: distinct("recipientname"),
        subject: distinct("subject"),
        type: [...new Set([...types, ...distinct("type")])],
        enabled: ["Yes", "No"],
        user: distinct("user"),
        namecreated: distinct("namecreated")
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const rows = await AuditEmailConfig.find(queryFrom(req.query)).sort({ type: 1, recipient: 1 }).limit(5000).lean();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const scoped = scope(req.body);
    const payload = payloadFrom(req.body);
    if (!payload.recipient) return res.status(400).json({ success: false, message: "Recipient email is required" });
    if (!payload.subject) return res.status(400).json({ success: false, message: "Subject is required" });
    const row = req.body.id
      ? await AuditEmailConfig.findOneAndUpdate({ _id: req.body.id, ...scoped }, payload, { new: true, runValidators: true })
      : await AuditEmailConfig.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Configuration not found" });
    res.json({ success: true, row });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const scoped = scope(req.body);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const payloads = rows.map((row) => payloadFrom({ ...row, ...scoped, user: req.body.user, namecreated: req.body.namecreated }))
      .filter((row) => row.recipient && row.subject);
    const inserted = payloads.length ? await AuditEmailConfig.insertMany(payloads, { ordered: false }) : [];
    res.json({ success: true, inserted: inserted.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const scoped = scope(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await AuditEmailConfig.deleteMany({ ...scoped, _id: { $in: ids } });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.createMissingAttendanceTasks = async (req, res) => {
  try {
    const result = await createMissingAttendanceTasks({ ...req.body, user: req.body.user });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.completeTakenAttendanceTasks = async (req, res) => {
  try {
    const result = await completeTakenAttendanceTasks({ ...req.body, user: req.body.user });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
