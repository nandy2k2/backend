const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");
const Attendance = require("../Models/neplmsattendanceds");
const Workflow = require("../Models/neplmssupplementaryattendanceworkflowds");
const Request = require("../Models/neplmssupplementaryattendancerequestds");
const { attendanceModificationHtml, sendAuditEmail } = require("../utils/auditEmailHelper");
const { completeAttendanceTask } = require("../utils/neplmsAttendanceTaskHelper");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const regex = (value) => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const esc = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fields = ["academicyear", "regulation", "program", "programcode", "semester", "section", "Major", "category", "gender", "name", "email", "phone", "regno", "rollno"];

const s3Url = (bucket, region, key) => {
  const encoded = String(key || "").split("/").map(encodeURIComponent).join("/");
  return region === "us-east-1" ? `https://${bucket}.s3.amazonaws.com/${encoded}` : `https://${bucket}.s3.${region}.amazonaws.com/${encoded}`;
};

const parseDate = (value) => {
  const clean = text(value);
  if (!clean) return null;
  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
};

const timeParts = (value, fallback) => {
  const match = text(value).toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return fallback;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  return { hour, minute };
};

const withTime = (dateValue, timeValue, end = false) => {
  const date = parseDate(dateValue);
  if (!date) return null;
  const fallback = end ? { hour: 23, minute: 59 } : { hour: 0, minute: 0 };
  const parts = timeParts(timeValue, fallback);
  date.setHours(parts.hour, parts.minute, end ? 59 : 0, end ? 999 : 0);
  return date;
};

const attendanceDateTime = (row) => {
  const start = withTime(row.classdate, row.classtime, false);
  return start || parseDate(row.classdate);
};

const canApprove = (workflow, level, email, role) => workflow.some((row) => (
  Number(row.level) === Number(level)
  && (!text(row.approveremail) || /^all$/i.test(row.approveremail) || text(row.approveremail).toLowerCase() === text(email).toLowerCase())
  && (!text(row.approverrole) || /^all$/i.test(row.approverrole) || text(row.approverrole).toLowerCase() === text(role).toLowerCase())
));

const nextLevel = (workflow, current) => [...new Set(workflow.map((row) => Number(row.level)).filter(Boolean))]
  .sort((a, b) => a - b)
  .find((level) => level > Number(current)) || null;

const workflowFor = async (colid, category) => Workflow.find({ colid, category: regex(category), status: /^Active$/i }).sort({ level: 1 }).lean();

exports.uploadDocument = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });
    const config = await Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }
    const cleanName = path.basename(req.file.originalname || "file").replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/nep-lms/supplementary-attendance/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype || "application/octet-stream" }).promise();
    res.json({ success: true, data: { url: s3Url(config.bucket, config.region, key), filename: cleanName } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.workflowList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    ["category", "approverrole", "approveremail", "status"].forEach((field) => { if (text(req.query[field])) query[field] = new RegExp(esc(req.query[field]), "i"); });
    const data = await Workflow.find(query).sort({ category: 1, level: 1 }).lean();
    res.json({ success: true, data, options: { category: [...new Set(data.map((r) => r.category).filter(Boolean))].sort() } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.workflowSave = async (req, res) => {
  try {
    const payload = {
      category: text(req.body.category),
      level: num(req.body.level),
      approverrole: text(req.body.approverrole),
      approvername: text(req.body.approvername),
      approveremail: text(req.body.approveremail),
      status: text(req.body.status) || "Active",
      colid: num(req.body.colid),
      user: text(req.body.user)
    };
    if (!payload.colid || !payload.category || !payload.level) return res.status(400).json({ success: false, message: "Category and level are required" });
    const data = req.body.id
      ? await Workflow.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true })
      : await Workflow.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.workflowDelete = async (req, res) => {
  try {
    await Workflow.deleteMany({ _id: { $in: req.body.ids || [req.body.id] }, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.users = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid, role: /^Student$/i };
    fields.forEach((field) => {
      if (!text(req.query[field])) return;
      const key = field === "Major" ? "Major" : field;
      query[key] = ["name", "email", "phone", "regno", "rollno"].includes(field) ? new RegExp(esc(req.query[field]), "i") : text(req.query[field]);
    });
    const data = await User.find(query).select("name email phone regno rollno academicyear regulation program programcode semester section Major category gender").sort({ name: 1 }).limit(1000).lean();
    const all = await User.find({ colid, role: /^Student$/i }).select(fields.join(" ")).lean();
    const options = {};
    fields.forEach((field) => { options[field] = [...new Set(all.map((row) => text(row[field])).filter(Boolean))].sort(); });
    res.json({ success: true, data, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.requestSave = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    const wf = await workflowFor(colid, req.body.category);
    const first = wf[0]?.level || 0;
    if (!wf.length) return res.status(400).json({ success: false, message: "No workflow configured for this category" });
    if (!students.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const payload = {
      category: text(req.body.category),
      fromdate: text(req.body.fromdate),
      fromtime: text(req.body.fromtime),
      todate: text(req.body.todate),
      totime: text(req.body.totime),
      description: text(req.body.description),
      documentlink: text(req.body.documentlink),
      documentname: text(req.body.documentname),
      students,
      status: "Pending",
      currentlevel: first,
      colid,
      user: text(req.body.user),
      username: text(req.body.username)
    };
    if (!payload.category || !payload.fromdate || !payload.todate) return res.status(400).json({ success: false, message: "Category and date range are required" });
    const data = await Request.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.requestList = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    ["category", "status", "user"].forEach((field) => { if (text(req.query[field])) query[field] = new RegExp(esc(req.query[field]), "i"); });
    const data = await Request.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function convertAttendance(request) {
  const from = withTime(request.fromdate, request.fromtime, false);
  const to = withTime(request.todate, request.totime, true);
  const studentIds = request.students.map((s) => s.studentid).filter(Boolean);
  const regnos = request.students.map((s) => text(s.regno)).filter(Boolean);
  const rows = await Attendance.find({
    colid: request.colid,
    attendance: 0,
    $or: [{ studentid: { $in: studentIds } }, { regno: { $in: regnos } }]
  });
  let converted = 0;
  const convertedRows = [];
  for (const row of rows) {
    const when = attendanceDateTime(row);
    if (!when || (from && when < from) || (to && when > to)) continue;
    const previous = row.toObject();
    row.attendance = 1;
    row.type = "Supplementary";
    row.comments = request.description || row.comments || "Supplementary attendance approved";
    row.user = request.user || row.user;
    await row.save();
    convertedRows.push({ previous, saved: row.toObject() });
    await completeAttendanceTask({ colid: request.colid, classid: row.classid, completedBy: request.user });
    converted += 1;
  }
  if (convertedRows.length) {
    const first = convertedRows[0].saved;
    await sendAuditEmail({
      colid: request.colid,
      type: "Attendance",
      subject: "Supplementary attendance modification audit trail",
      html: attendanceModificationHtml({
        classInfo: first,
        previous: convertedRows.map((item) => item.previous),
        saved: convertedRows.map((item) => item.saved),
        changedBy: request.user,
        comments: request.description
      })
    }).catch(() => null);
  }
  return converted;
}

exports.approvalQueue = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const email = text(req.query.approveremail || req.query.user);
    const role = text(req.query.approverrole || req.query.role);
    const workflows = await Workflow.find({ colid, status: /^Active$/i, $or: [{ approveremail: email }, { approverrole: role }, { approveremail: /^all$/i }, { approverrole: /^all$/i }] }).lean();
    const ors = workflows.map((wf) => ({ category: wf.category, currentlevel: wf.level }));
    const data = ors.length ? await Request.find({ colid, status: "Pending", $or: ors }).sort({ createdAt: -1 }).lean() : [];
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const request = await Request.findOne({ _id: req.body.id, colid: num(req.body.colid) });
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    const wf = await workflowFor(request.colid, request.category);
    if (!canApprove(wf, request.currentlevel, req.body.approveremail || req.body.user, req.body.approverrole || req.body.role)) {
      return res.status(403).json({ success: false, message: "You are not configured for this approval level" });
    }
    const action = /^reject/i.test(text(req.body.action)) ? "Rejected" : "Approved";
    request.history.push({ level: request.currentlevel, action, comments: text(req.body.comments), approvername: text(req.body.approvername), approveremail: text(req.body.approveremail || req.body.user), approverrole: text(req.body.approverrole || req.body.role) });
    if (action === "Rejected") request.status = "Rejected";
    else {
      const upcoming = nextLevel(wf, request.currentlevel);
      if (upcoming) request.currentlevel = upcoming;
      else {
        request.status = "Approved";
        request.convertedcount = await convertAttendance(request);
      }
    }
    await request.save();
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    ["category", "status", "fromdate", "todate", "user"].forEach((field) => { if (text(req.query[field])) query[field] = new RegExp(esc(req.query[field]), "i"); });
    const data = await Request.find(query).sort({ createdAt: -1 }).lean();
    const by = (field) => [...data.reduce((m, row) => {
      const key = row[field] || "-";
      const cur = m.get(key) || { name: key, requests: 0, students: 0, converted: 0 };
      cur.requests += 1; cur.students += row.students?.length || 0; cur.converted += Number(row.convertedcount || 0);
      m.set(key, cur); return m;
    }, new Map()).values()];
    res.json({
      success: true,
      data,
      summary: {
        requests: data.length,
        students: data.reduce((s, r) => s + (r.students?.length || 0), 0),
        converted: data.reduce((s, r) => s + Number(r.convertedcount || 0), 0),
        approved: data.filter((r) => r.status === "Approved").length,
        pending: data.filter((r) => r.status === "Pending").length,
        rejected: data.filter((r) => r.status === "Rejected").length
      },
      charts: { byCategory: by("category"), byStatus: by("status") }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
