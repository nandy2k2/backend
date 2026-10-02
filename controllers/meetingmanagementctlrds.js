const Meeting = require("../Models/meetingmanagementmeetingds");
const MeetingTask = require("../Models/meetingmanagementtaskds");
const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const arrayValue = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(/[;,]/).map(text).filter(Boolean);
const dateOrUndefined = (value) => text(value) ? new Date(value) : undefined;
const scoped = (source = {}) => {
  const colid = num(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};

const defaultDomains = [
  "Help", "Dashboard", "AI Help", "Quick setup wizard", "Academic Configuration", "AI Coding", "Voice AI agents",
  "CRM", "Admission", "ID card Manager", "Workload", "Integrated LMS", "Fees", "Conduct Examination",
  "Question Paper Management", "Exam scanning", "Result Processing 2", "HR", "HR Leave", "HR Payroll",
  "HR Attendance", "User management", "Placement", "Placement new", "Transport new", "Library new",
  "Purchase 2", "PhD", "Institution", "Ordinance", "Affiliation", "Legal cases", "Meeting management",
  "Task new", "Settings"
];
const taskStatuses = ["Open", "Pending", "Closed"];
const modes = ["online", "offline"];
const adminPassword = "kumropatash";

const meetingFields = ["title", "agenda", "discussion", "domain", "keywords", "meetinglink", "externalmembers", "issues", "documentlink", "mode"];
const taskFields = ["meeting", "domain", "task", "description", "status"];

const meetingPayload = (body = {}) => {
  const payload = scoped(body);
  meetingFields.forEach((field) => { payload[field] = text(body[field]); });
  payload.mode = /^offline$/i.test(payload.mode) ? "offline" : "online";
  payload.meetingdate = dateOrUndefined(body.meetingdate);
  payload.userspresent = arrayValue(body.userspresent);
  payload.userspresentemail = arrayValue(body.userspresentemail);
  payload.user = text(body.user);
  payload.namecreated = text(body.namecreated || body.createdby || body.name);
  return payload;
};

const taskPayload = (body = {}) => {
  const payload = scoped(body);
  taskFields.forEach((field) => { payload[field] = text(body[field]); });
  payload.status = taskStatuses.find((item) => item.toLowerCase() === payload.status.toLowerCase()) || "Open";
  payload.meetingdate = dateOrUndefined(body.meetingdate);
  payload.duedate = dateOrUndefined(body.duedate);
  payload.assignedto = arrayValue(body.assignedto);
  payload.assignedtoemail = arrayValue(body.assignedtoemail);
  if (text(body.meetingid)) payload.meetingid = body.meetingid;
  payload.user = text(body.user);
  payload.namecreated = text(body.namecreated || body.createdby || body.name);
  return payload;
};

const buildQuery = (source = {}, fields = [], includeScope = true) => {
  const query = includeScope ? scoped(source) : {};
  fields.forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
  if (text(source.meetingid)) query.meetingid = source.meetingid;
  if (text(source.status)) query.status = regex(source.status);
  const from = text(source.fromdate);
  const to = text(source.todate);
  if (from || to) {
    const dateField = source.datefield === "duedate" ? "duedate" : "meetingdate";
    query[dateField] = {};
    if (from) query[dateField].$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query[dateField].$lte = toDate;
    }
  }
  return query;
};

const distinct = (rows, field) => [...new Set(rows.flatMap((row) => Array.isArray(row[field]) ? row[field] : [row[field]]).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [meetings, tasks, users] = await Promise.all([
      Meeting.find({ colid }).select("title domain mode").sort({ meetingdate: -1 }).limit(2000).lean(),
      MeetingTask.find({ colid }).select("domain status").sort({ updatedAt: -1 }).limit(2000).lean(),
      User.find({ colid, role: { $not: /^student$/i } }).select("name email role department designation").sort({ name: 1 }).limit(5000).lean()
    ]);
    const domains = [...new Set([...defaultDomains, ...distinct(meetings, "domain"), ...distinct(tasks, "domain")])].filter(Boolean).sort((a, b) => a.localeCompare(b));
    res.json({
      success: true,
      domains,
      modes,
      statuses: taskStatuses,
      meetings: meetings.map((row) => ({ _id: row._id, title: row.title || "", domain: row.domain || "" })),
      users: users.map((row) => ({ name: row.name || row.email || "", email: row.email || "", role: row.role || "", department: row.department || "", designation: row.designation || "" }))
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.listMeetings = async (req, res) => {
  try {
    const rows = await Meeting.find(buildQuery(req.query, meetingFields)).sort({ meetingdate: -1, createdAt: -1 }).limit(5000).lean();
    res.json({ success: true, rows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveMeeting = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const payload = meetingPayload(req.body);
    if (!payload.title) return res.status(400).json({ success: false, message: "Title is required" });
    const row = text(req.body.id)
      ? await Meeting.findOneAndUpdate({ _id: req.body.id, ...scope }, payload, { new: true, runValidators: true })
      : await Meeting.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Meeting not found" });
    res.json({ success: true, row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteMeetings = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await Meeting.deleteMany({ ...scope, _id: { $in: ids } });
    await MeetingTask.deleteMany({ ...scope, meetingid: { $in: ids } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.bulkMeetings = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const payloads = rows.map((row) => meetingPayload({ ...row, ...scope, user: req.body.user, namecreated: req.body.namecreated })).filter((row) => row.title);
    const created = payloads.length ? await Meeting.insertMany(payloads, { ordered: false }) : [];
    res.json({ success: true, inserted: created.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.listTasks = async (req, res) => {
  try {
    const rows = await MeetingTask.find(buildQuery(req.query, taskFields)).sort({ duedate: 1, meetingdate: -1, createdAt: -1 }).limit(5000).lean();
    res.json({ success: true, rows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveTask = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const payload = taskPayload(req.body);
    if (!payload.task) return res.status(400).json({ success: false, message: "Task is required" });
    if (payload.meetingid && (!payload.meeting || !payload.domain || !payload.meetingdate)) {
      const meeting = await Meeting.findOne({ _id: payload.meetingid, ...scope }).lean();
      if (meeting) {
        payload.meeting = payload.meeting || meeting.title;
        payload.domain = payload.domain || meeting.domain;
        payload.meetingdate = payload.meetingdate || meeting.meetingdate;
      }
    }
    const row = text(req.body.id)
      ? await MeetingTask.findOneAndUpdate({ _id: req.body.id, ...scope }, payload, { new: true, runValidators: true })
      : await MeetingTask.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Task not found" });
    res.json({ success: true, row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteTasks = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await MeetingTask.deleteMany({ ...scope, _id: { $in: ids } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.bulkTasks = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const payloads = rows.map((row) => taskPayload({ ...row, ...scope, user: req.body.user, namecreated: req.body.namecreated })).filter((row) => row.task);
    const created = payloads.length ? await MeetingTask.insertMany(payloads, { ordered: false }) : [];
    res.json({ success: true, inserted: created.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.adminOpenTasks = async (req, res) => {
  try {
    if (text(req.query.password) !== adminPassword) return res.status(403).json({ success: false, message: "Invalid password" });
    const query = buildQuery(req.query, ["meeting", "domain", "task", "description"], false);
    if (text(req.query.colid)) query.colid = num(req.query.colid);
    const rows = await MeetingTask.find(query).sort({ duedate: 1, colid: 1, createdAt: -1 }).limit(10000).lean();
    res.json({ success: true, rows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.adminSaveTask = async (req, res) => {
  try {
    if (text(req.body.password) !== adminPassword) return res.status(403).json({ success: false, message: "Invalid password" });
    if (!text(req.body.id)) return res.status(400).json({ success: false, message: "Task id is required" });
    const existing = await MeetingTask.findById(req.body.id).lean();
    if (!existing) return res.status(404).json({ success: false, message: "Task not found" });
    const payload = taskPayload({ ...req.body, colid: existing.colid });
    const row = await MeetingTask.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true });
    res.json({ success: true, row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
