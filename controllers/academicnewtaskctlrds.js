const AcademicNewTask = require("../Models/academicnewtaskds");
const User = require("../Models/user");
const InsDetails = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const scoped = (body = {}) => {
  const colid = num(body.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};

const statusOptions = ["New", "In process", "Completed"];
const criticalityOptions = ["Low", "Normal", "High", "Critical"];
const fields = ["academicyear", "faculty", "facultyemail", "task", "category", "criticality", "pagelink", "status", "comments"];
const dateFields = ["startdate", "duedate"];
const normalizeStatus = (value) => {
  const current = text(value);
  if (/^completed$/i.test(current)) return "Completed";
  if (/^(in\s*process|in\s*progress)$/i.test(current)) return "In process";
  return current || "New";
};

const buildQuery = (source = {}) => {
  const query = scoped(source);
  fields.forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
  if (text(source.startdatefrom) || text(source.startdateto)) {
    query.startdate = {};
    if (text(source.startdatefrom)) query.startdate.$gte = new Date(source.startdatefrom);
    if (text(source.startdateto)) query.startdate.$lte = new Date(source.startdateto);
  }
  if (text(source.duedatefrom) || text(source.duedateto)) {
    query.duedate = {};
    if (text(source.duedatefrom)) query.duedate.$gte = new Date(source.duedatefrom);
    if (text(source.duedateto)) query.duedate.$lte = new Date(source.duedateto);
  }
  return query;
};

const payloadFrom = (body = {}) => {
  const payload = scoped(body);
  fields.forEach((field) => { payload[field] = text(body[field]); });
  payload.status = normalizeStatus(body.status);
  payload.criticality = text(body.criticality) || "Normal";
  dateFields.forEach((field) => { payload[field] = text(body[field]) ? new Date(body[field]) : undefined; });
  payload.user = text(body.user);
  payload.createdby = text(body.createdby || body.name);
  return payload;
};

const summarize = (rows = []) => {
  const bucket = (field) => Object.values(rows.reduce((acc, row) => {
    const key = text(row[field]) || "Not specified";
    acc[key] = acc[key] || { name: key, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {})).sort((a, b) => b.count - a.count);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    total: rows.length,
    pending: rows.filter((row) => !/^completed$/i.test(text(row.status))).length,
    completed: rows.filter((row) => /^completed$/i.test(text(row.status))).length,
    overdue: rows.filter((row) => !/^completed$/i.test(text(row.status)) && row.duedate && new Date(row.duedate) < today).length,
    byStatus: bucket("status"),
    byCategory: bucket("category"),
    byCriticality: bucket("criticality"),
    byFaculty: bucket("faculty")
  };
};

const taskBuckets = async ({ colid, facultyemail, academicyear, category }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const baseQuery = {
    colid,
    facultyemail: regex(facultyemail)
  };
  if (text(academicyear)) baseQuery.academicyear = regex(academicyear);
  if (text(category)) baseQuery.category = regex(category);
  const openQuery = {
    ...baseQuery,
    status: { $in: [/^new$/i, /^in\s*process$/i, /^in\s*progress$/i] },
    startdate: { $lt: tomorrow },
    duedate: { $gte: today }
  };
  const overdueQuery = {
    ...baseQuery,
    status: { $not: /^completed$/i },
    duedate: { $lt: today }
  };
  const completedQuery = {
    ...baseQuery,
    status: /^completed$/i
  };
  const [open, overdue, completed, categories] = await Promise.all([
    AcademicNewTask.find(openQuery).sort({ duedate: 1, criticality: 1, createdAt: -1 }).limit(500).lean(),
    AcademicNewTask.find(overdueQuery).sort({ duedate: 1, criticality: 1, createdAt: -1 }).limit(500).lean(),
    AcademicNewTask.find(completedQuery).sort({ duedate: -1, updatedAt: -1 }).limit(500).lean(),
    AcademicNewTask.distinct("category", { colid, facultyemail: regex(facultyemail), ...(text(academicyear) ? { academicyear: regex(academicyear) } : {}) })
  ]);
  return {
    rows: [...open, ...overdue],
    open,
    overdue,
    completed,
    categories: categories.filter(Boolean).sort(),
    summary: {
      open: open.length,
      overdue: overdue.length,
      completed: completed.length,
      total: open.length + overdue.length + completed.length
    }
  };
};

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [tasks, users] = await Promise.all([
      AcademicNewTask.find({ colid }).select("academicyear category criticality status faculty facultyemail pagelink").lean(),
      User.find({ colid, role: { $not: /^student$/i } }).select("name email role department").sort({ name: 1 }).limit(2000).lean()
    ]);
    const distinct = (field) => [...new Set(tasks.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    res.json({
      success: true,
      academicyears: distinct("academicyear"),
      categories: distinct("category"),
      criticalities: [...new Set([...criticalityOptions, ...distinct("criticality")])],
      statuses: statusOptions,
      faculties: users.map((user) => ({ name: user.name || user.email || "", email: user.email || "", role: user.role || "", department: user.department || "" }))
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const rows = await AcademicNewTask.find(buildQuery(req.query)).sort({ duedate: 1, createdAt: -1 }).limit(5000).lean();
    res.json({ success: true, rows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const payload = payloadFrom(req.body);
    if (!payload.academicyear) return res.status(400).json({ success: false, message: "Academic year is required" });
    if (!payload.facultyemail) return res.status(400).json({ success: false, message: "Faculty is required" });
    if (!payload.task) return res.status(400).json({ success: false, message: "Task is required" });
    const row = req.body.id
      ? await AcademicNewTask.findOneAndUpdate({ _id: req.body.id, ...scope }, payload, { new: true, runValidators: true })
      : await AcademicNewTask.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Task not found" });
    res.json({ success: true, row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const inserted = [];
    for (const row of rows) {
      const payload = payloadFrom({ ...row, ...scope, user: req.body.user, createdby: req.body.createdby });
      if (payload.academicyear && payload.facultyemail && payload.task) inserted.push(payload);
    }
    const result = inserted.length ? await AcademicNewTask.insertMany(inserted, { ordered: false }) : [];
    res.json({ success: true, inserted: result.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await AcademicNewTask.deleteMany({ ...scope, _id: { $in: ids } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.report = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const rows = await AcademicNewTask.find(buildQuery(req.query)).sort({ duedate: 1, faculty: 1 }).limit(5000).lean();
    const institution = await InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null);
    res.json({ success: true, rows, summary: summarize(rows), institution });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.facultyPending = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const facultyemail = text(req.query.facultyemail || req.query.user);
    if (!facultyemail) return res.status(400).json({ success: false, message: "facultyemail is required" });
    const result = await taskBuckets({ colid, facultyemail, academicyear: req.query.academicyear, category: req.query.category });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.myTasks = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const facultyemail = text(req.query.facultyemail || req.query.user);
    if (!facultyemail) return res.status(400).json({ success: false, message: "facultyemail is required" });
    const result = await taskBuckets({ colid, facultyemail, academicyear: req.query.academicyear, category: req.query.category });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
