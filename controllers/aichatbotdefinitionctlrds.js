const AiChatbotDefinition = require("../Models/aichatbotdefinitionds");
const User = require("../Models/user");

const text = (value) => String(value || "").trim();
const number = (value, fallback = undefined) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const baseFilter = (source = {}) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  if (source.role) filter.role = text(source.role);
  if (source.menugroup) filter.menugroup = text(source.menugroup);
  if (source.type) filter.type = text(source.type).toLowerCase();
  if (source.parentslno !== undefined && source.parentslno !== "") filter.parentslno = number(source.parentslno, 0);
  if (source.slno !== undefined && source.slno !== "") filter.slno = number(source.slno, 0);
  return filter;
};

const payloadFrom = (source = {}) => ({
  colid: number(source.colid),
  role: text(source.role),
  slno: number(source.slno),
  menugroup: text(source.menugroup),
  pagename: text(source.pagename),
  pagelink: text(source.pagelink),
  type: text(source.type).toLowerCase() === "link" ? "link" : "button",
  parentslno: number(source.parentslno, 0),
  name: text(source.name),
  user: text(source.user)
});

exports.listDefinitions = async (req, res) => {
  try {
    const filter = baseFilter(req.query);
    const data = await AiChatbotDefinition.find(filter).sort({ role: 1, parentslno: 1, slno: 1, pagename: 1 }).lean();
    res.json({ status: "Success", data });
  } catch (err) {
    res.status(500).json({ status: "Failed", message: err.message });
  }
};

exports.listRoleDefinitions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const role = text(req.query.role);
    if (colid === undefined || !role) {
      return res.status(400).json({ status: "Failed", message: "colid and role are required" });
    }
    const data = await AiChatbotDefinition.find({
      colid,
      role: { $in: [role, "All"] }
    }).sort({ parentslno: 1, slno: 1, pagename: 1 }).lean();
    res.json({ status: "Success", data });
  } catch (err) {
    res.status(500).json({ status: "Failed", message: err.message });
  }
};

exports.saveDefinition = async (req, res) => {
  try {
    const payload = payloadFrom(req.body);
    if (payload.colid === undefined || !payload.role || payload.slno === undefined || !payload.pagename) {
      return res.status(400).json({ status: "Failed", message: "Role, slno, page name and colid are required" });
    }
    if (payload.type === "link" && !payload.pagelink) {
      return res.status(400).json({ status: "Failed", message: "Page link is required for link type" });
    }

    let data;
    if (req.body.id) {
      data = await AiChatbotDefinition.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true });
    } else {
      data = await AiChatbotDefinition.findOneAndUpdate(
        { colid: payload.colid, role: payload.role, slno: payload.slno },
        payload,
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    }
    res.json({ status: "Success", data });
  } catch (err) {
    res.status(500).json({ status: "Failed", message: err.message });
  }
};

exports.bulkDefinitions = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ status: "Failed", message: "No rows received" });

    const saved = [];
    for (const row of rows) {
      const payload = payloadFrom({ ...row, colid: row.colid || req.body.colid, user: row.user || req.body.user, name: row.name || req.body.name });
      if (payload.colid === undefined || !payload.role || payload.slno === undefined || !payload.pagename) continue;
      const data = await AiChatbotDefinition.findOneAndUpdate(
        { colid: payload.colid, role: payload.role, slno: payload.slno },
        payload,
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved.push(data);
    }
    res.json({ status: "Success", count: saved.length, data: saved });
  } catch (err) {
    res.status(500).json({ status: "Failed", message: err.message });
  }
};

exports.deleteDefinitions = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length) {
      const data = await AiChatbotDefinition.deleteMany({ _id: { $in: ids } });
      return res.json({ status: "Success", deletedCount: data.deletedCount });
    }
    if (!req.body.id) return res.status(400).json({ status: "Failed", message: "id is required" });
    await AiChatbotDefinition.findByIdAndDelete(req.body.id);
    res.json({ status: "Success", deletedCount: 1 });
  } catch (err) {
    res.status(500).json({ status: "Failed", message: err.message });
  }
};

exports.getOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const filter = colid === undefined ? {} : { colid };
    const [roles, definitions] = await Promise.all([
      User.distinct("role", filter),
      AiChatbotDefinition.find(filter).select("role slno pagename parentslno menugroup type").sort({ role: 1, slno: 1 }).lean()
    ]);
    res.json({
      status: "Success",
      roles: Array.from(new Set(["All", ...roles.filter(Boolean)])).sort((a, b) => a.localeCompare(b)),
      definitions
    });
  } catch (err) {
    res.status(500).json({ status: "Failed", message: err.message });
  }
};
