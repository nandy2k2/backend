const EpaathsalaAiConfiguration = require("../Models/epaathsalaaiconfigurationds");

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const text = (value) => String(value ?? "").trim();
const yesNo = (value, fallback = "No") => (String(value || fallback).toLowerCase() === "yes" ? "Yes" : "No");

const safeRow = (row) => {
  const item = row?.toObject ? row.toObject() : { ...(row || {}) };
  item.xapikey = "";
  item.xapikeyconfigured = Boolean(row?.xapikey);
  return item;
};

const payloadFromBody = (body = {}) => ({
  colid: toNumber(body.colid),
  name: text(body.name),
  server: text(body.server),
  default: yesNo(body.default, "No"),
  active: yesNo(body.active, "Yes"),
  createdname: text(body.createdname || body.nameofuser),
  user: text(body.user)
});

exports.list = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    ["name", "server", "default", "active", "user"].forEach((field) => {
      if (text(req.query[field])) filter[field] = new RegExp(text(req.query[field]), "i");
    });
    const rows = await EpaathsalaAiConfiguration.find(filter).sort({ default: -1, active: -1, name: 1 });
    res.json({ success: true, data: rows.map(safeRow) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = payloadFromBody(req.body);
    const id = req.body.id || req.body._id;
    if (payload.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.name) return res.status(400).json({ success: false, message: "Name is required" });
    if (!payload.server) return res.status(400).json({ success: false, message: "Server is required" });
    if (text(req.body.xapikey)) payload.xapikey = text(req.body.xapikey);
    if (payload.default === "Yes") {
      await EpaathsalaAiConfiguration.updateMany({ colid: payload.colid, _id: { $ne: id } }, { $set: { default: "No" } });
    }
    const row = id
      ? await EpaathsalaAiConfiguration.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await EpaathsalaAiConfiguration.create(payload);
    res.json({ success: true, data: safeRow(row) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: "Epaathsala AI name already exists" });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id || req.body._id].filter(Boolean);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one record" });
    await EpaathsalaAiConfiguration.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let count = 0;
    for (const row of rows) {
      const payload = payloadFromBody({ ...row, colid, user: req.body.user || row.user, createdname: req.body.createdname || row.createdname });
      if (!payload.name || !payload.server) continue;
      if (text(row.xapikey)) payload.xapikey = text(row.xapikey);
      if (payload.default === "Yes") {
        await EpaathsalaAiConfiguration.updateMany({ colid, name: { $ne: payload.name } }, { $set: { default: "No" } });
      }
      await EpaathsalaAiConfiguration.findOneAndUpdate(
        { colid, name: payload.name },
        { $set: payload },
        { upsert: true, new: true, runValidators: true }
      );
      count += 1;
    }
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await EpaathsalaAiConfiguration.find({ colid }).lean();
    const unique = (field) => [...new Set(rows.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    res.json({ success: true, options: { name: unique("name"), server: unique("server"), active: ["Yes", "No"], default: ["Yes", "No"] } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
