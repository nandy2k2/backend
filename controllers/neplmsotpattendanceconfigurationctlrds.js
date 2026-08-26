const OtpConfig = require("../Models/neplmsotpattendanceconfigurationds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const clampOtpCount = (value) => Math.min(6, Math.max(1, Number(value) || 6));
const scope = (source = {}) => {
  const colid = number(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};
const rx = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const payloadFrom = (source = {}) => ({
  ...scope(source),
  numberofotps: clampOtpCount(source.numberofotps),
  active: text(source.active) || "Yes",
  user: text(source.user),
  namecreated: text(source.namecreated || source.name || source.createdby)
});

exports.options = async (req, res) => {
  try {
    const { colid } = scope(req.query);
    const rows = await OtpConfig.find({ colid }).lean();
    res.json({
      success: true,
      numberOptions: [1, 2, 3, 4, 5, 6],
      activeOptions: ["Yes", "No"],
      filterOptions: {
        active: ["Yes", "No"],
        numberofotps: [1, 2, 3, 4, 5, 6],
        user: [...new Set(rows.map((row) => text(row.user)).filter(Boolean))].sort(),
        namecreated: [...new Set(rows.map((row) => text(row.namecreated)).filter(Boolean))].sort()
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = scope(req.query);
    if (text(req.query.active)) query.active = rx(req.query.active);
    if (text(req.query.numberofotps)) query.numberofotps = clampOtpCount(req.query.numberofotps);
    if (text(req.query.user)) query.user = rx(req.query.user);
    if (text(req.query.namecreated)) query.namecreated = rx(req.query.namecreated);
    const rows = await OtpConfig.find(query).sort({ updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const scoped = scope(req.body);
    const payload = payloadFrom(req.body);
    const row = req.body.id
      ? await OtpConfig.findOneAndUpdate({ _id: req.body.id, ...scoped }, payload, { new: true, runValidators: true })
      : await OtpConfig.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "OTP attendance configuration not found" });
    res.json({ success: true, row });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const scoped = scope(req.body);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => payloadFrom({ ...row, ...scoped, user: req.body.user, namecreated: req.body.namecreated }));
    const inserted = docs.length ? await OtpConfig.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: inserted.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const scoped = scope(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await OtpConfig.deleteMany({ ...scoped, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.activeCount = async (colid) => {
  const row = await OtpConfig.findOne({ colid, active: /^yes$/i }).sort({ updatedAt: -1 }).lean();
  return clampOtpCount(row?.numberofotps || 6);
};
