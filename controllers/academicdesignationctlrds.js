const AcademicDesignation = require("../Models/academicdesignationds");
const DesignationWorkloadHours = require("../Models/designationworkloadhoursds");
const Program = require("../Models/mprograms");

const text = (value) => String(value || "").trim();
const num = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const list = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(",").map(text).filter(Boolean);
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniq = (items) => [...new Set((items || []).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const buildQuery = (source = {}, fields = []) => {
  const query = {};
  const colid = num(source.colid);
  if (colid !== undefined) query.colid = colid;
  fields.forEach((field) => {
    if (text(source[field])) query[field] = { $regex: regex(source[field]) };
  });
  if (Array.isArray(source.dynamicFilters)) {
    source.dynamicFilters.forEach((filter) => {
      const field = text(filter.field);
      const value = text(filter.value);
      if (!field || field.includes("$") || !value) return;
      query[field] = text(filter.operator).toLowerCase() === "equals" ? value : { $regex: regex(value) };
    });
  }
  return query;
};

const designationPayload = (body = {}) => ({
  designation: text(body.designation || body.Designation),
  description: text(body.description || body.Description),
  status: text(body.status || body.Status) || "Active",
  colid: num(body.colid),
  user: text(body.user),
  name: text(body.name)
});

const workloadPayload = (body = {}) => {
  const designations = list(body.designations || body.designation || body.Designation);
  return {
    program: text(body.program || body.Program),
    programcode: text(body.programcode || body.Programcode || body["Program Code"]),
    designations,
    designation: designations.join(", "),
    workloadhours: num(body.workloadhours || body.workloadHours || body["Workload Hours"]) || 0,
    status: text(body.status || body.Status) || "Active",
    colid: num(body.colid),
    user: text(body.user),
    name: text(body.name)
  };
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [designations, programs, workloadRules] = await Promise.all([
      AcademicDesignation.find({ colid }).sort({ designation: 1 }).lean(),
      Program.find({ colid }).select("program programcode").sort({ program: 1 }).lean(),
      DesignationWorkloadHours.find({ colid }).lean()
    ]);
    res.json({
      success: true,
      designations: uniq([...designations.map((row) => row.designation), ...workloadRules.flatMap((row) => row.designations || []), ...workloadRules.map((row) => row.designation)]),
      designationRows: designations,
      programs,
      programcodes: uniq(programs.map((row) => row.programcode)),
      statuses: ["Active", "Inactive"]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listDesignations = async (req, res) => {
  try {
    const query = buildQuery(req.query, ["designation", "description", "status"]);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await AcademicDesignation.find(query).sort({ designation: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveDesignation = async (req, res) => {
  try {
    const payload = designationPayload(req.body);
    if (payload.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.designation) return res.status(400).json({ success: false, message: "Designation is required" });
    const data = req.body.id
      ? await AcademicDesignation.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await AcademicDesignation.findOneAndUpdate({ colid: payload.colid, designation: payload.designation }, payload, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Designation already exists" : error.message });
  }
};

exports.deleteDesignations = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one designation" });
    const result = await AcademicDesignation.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDesignations = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const payload = designationPayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user, name: req.body.name });
      if (payload.colid === undefined || !payload.designation) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: "colid and designation are required" });
        continue;
      }
      await AcademicDesignation.findOneAndUpdate({ colid: payload.colid, designation: payload.designation }, payload, { upsert: true, runValidators: true });
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listWorkloadRules = async (req, res) => {
  try {
    const query = buildQuery(req.query, ["program", "programcode", "designation", "status"]);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await DesignationWorkloadHours.find(query).sort({ program: 1, designation: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveWorkloadRule = async (req, res) => {
  try {
    const payload = workloadPayload(req.body);
    if (payload.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.program || !payload.programcode) return res.status(400).json({ success: false, message: "Program and program code are required" });
    if (!payload.designations.length) return res.status(400).json({ success: false, message: "Select at least one designation" });
    const data = req.body.id
      ? await DesignationWorkloadHours.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await DesignationWorkloadHours.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteWorkloadRules = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one rule" });
    const result = await DesignationWorkloadHours.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkWorkloadRules = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const valid = [];
    const errors = [];
    items.forEach((item, index) => {
      const payload = workloadPayload({ ...item, colid: req.body.colid || item.colid, user: req.body.user, name: req.body.name });
      if (payload.colid === undefined || !payload.program || !payload.programcode || !payload.designations.length) errors.push({ rowNumber: item.rowNumber || index + 2, message: "Program, program code and designation are required" });
      else valid.push(payload);
    });
    if (valid.length) await DesignationWorkloadHours.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
