const Circular = require("../Models/circulards");
const Committee = require("../Models/committeeds");
const CommitteeMinutes = require("../Models/committeeminutesds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const InsDetails = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const arrayText = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(/[,;|]/).map(text).filter(Boolean);
const dateValue = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const scoped = (source = {}) => {
  const colid = num(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};
const toClient = (row) => {
  const item = row?.toObject ? row.toObject() : { ...(row || {}) };
  ["startdate", "enddate", "meetingdate"].forEach((field) => {
    if (item[field]) item[field] = new Date(item[field]).toISOString().slice(0, 10);
  });
  return item;
};

const circularPayload = (source = {}, targettype = "All") => {
  const payload = scoped(source);
  payload.user = text(source.user);
  payload.namecreated = text(source.namecreated || source.createdby || source.name);
  payload.academicyear = text(source.academicyear);
  payload.circular = text(source.circular);
  payload.description = text(source.description);
  payload.startdate = dateValue(source.startdate);
  payload.enddate = dateValue(source.enddate);
  payload.filelink = text(source.filelink);
  payload.targettype = text(source.targettype || targettype) || "All";
  payload.roles = arrayText(source.roles || source.role);
  payload.regulation = text(source.regulation);
  payload.program = text(source.program);
  payload.programcode = text(source.programcode);
  payload.semester = text(source.semester);
  payload.active = text(source.active) || "Yes";
  return payload;
};

const circularQuery = (source = {}) => {
  const query = scoped(source);
  ["academicyear", "circular", "targettype", "regulation", "program", "programcode", "semester", "active"].forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
  if (text(source.role)) query.roles = regex(source.role);
  if (text(source.startdatefrom) || text(source.startdateto)) {
    query.startdate = {};
    if (text(source.startdatefrom)) query.startdate.$gte = new Date(`${text(source.startdatefrom)}T00:00:00`);
    if (text(source.startdateto)) query.startdate.$lte = new Date(`${text(source.startdateto)}T23:59:59`);
  }
  return query;
};

const activeWindow = () => {
  const now = new Date();
  return {
    active: { $ne: /^No$/i },
    $and: [
      { $or: [{ startdate: { $exists: false } }, { startdate: null }, { startdate: { $lte: now } }] },
      { $or: [{ enddate: { $exists: false } }, { enddate: null }, { enddate: { $gte: now } }] }
    ]
  };
};

const committeePayload = (source = {}) => {
  const payload = scoped(source);
  payload.user = text(source.user);
  payload.namecreated = text(source.namecreated || source.createdby || source.name);
  payload.committeename = text(source.committeename || source.committee);
  payload.type = text(source.type) || "Academic";
  payload.level = text(source.level) || "Departmental";
  payload.startdate = dateValue(source.startdate);
  payload.active = text(source.active) || "Yes";
  payload.members = Array.isArray(source.members) ? source.members.map((member) => ({
    name: text(member.name),
    email: text(member.email || member.user),
    role: text(member.role),
    department: text(member.department),
    designation: text(member.designation)
  })).filter((member) => member.email || member.name) : [];
  return payload;
};

const minutesPayload = (source = {}) => {
  const payload = scoped(source);
  payload.user = text(source.user);
  payload.namecreated = text(source.namecreated || source.createdby || source.name);
  payload.committeeid = text(source.committeeid);
  payload.committeename = text(source.committeename);
  payload.minutes = text(source.minutes);
  payload.agenda = text(source.agenda);
  payload.description = text(source.description);
  payload.discussion = text(source.discussion);
  payload.actionitems = text(source.actionitems);
  payload.meetingdate = dateValue(source.meetingdate);
  payload.issues = text(source.issues);
  payload.filelink = text(source.filelink);
  payload.memberspresent = Array.isArray(source.memberspresent) ? source.memberspresent.map((member) => ({
    name: text(member.name),
    email: text(member.email || member.user),
    role: text(member.role),
    department: text(member.department),
    designation: text(member.designation)
  })).filter((member) => member.email || member.name) : [];
  return payload;
};

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [users, programs, circulars, committees, minutes, institution] = await Promise.all([
      User.find({ colid }).select("name email user role department designation academicyear regulation program programcode semester").sort({ name: 1 }).limit(5000).lean(),
      MPrograms.find({ colid }).select("year regulation program programcode semester department faculty institution").sort({ year: -1, program: 1 }).lean(),
      Circular.find({ colid }).select("academicyear circular regulation program programcode semester roles targettype").sort({ updatedAt: -1 }).limit(2000).lean(),
      Committee.find({ colid }).sort({ committeename: 1 }).lean(),
      CommitteeMinutes.find({ colid }).select("meetingdate committeename").sort({ meetingdate: -1 }).limit(1000).lean(),
      InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null)
    ]);
    res.json({
      success: true,
      institution,
      academicyears: uniqueSorted([...programs.map((row) => row.year), ...users.map((row) => row.academicyear), ...circulars.map((row) => row.academicyear)]),
      regulations: uniqueSorted([...programs.map((row) => row.regulation), ...users.map((row) => row.regulation), ...circulars.map((row) => row.regulation)]),
      programs: uniqueSorted([...programs.map((row) => row.program), ...users.map((row) => row.program), ...circulars.map((row) => row.program)]),
      programcodes: uniqueSorted([...programs.map((row) => row.programcode), ...users.map((row) => row.programcode), ...circulars.map((row) => row.programcode)]),
      semesters: uniqueSorted([...programs.map((row) => row.semester), ...users.map((row) => row.semester), ...circulars.map((row) => row.semester)]),
      roles: uniqueSorted(users.map((row) => row.role)),
      users: users.map((row) => ({
        label: `${row.name || row.email || row.user || ""} (${row.role || ""}) ${row.email || row.user || ""}`,
        name: row.name || "",
        email: row.email || row.user || "",
        role: row.role || "",
        department: row.department || "",
        designation: row.designation || ""
      })),
      committees: committees.map((row) => ({ ...toClient(row), label: row.committeename || "" })),
      circulars,
      minutes
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listCirculars = async (req, res) => {
  try {
    const rows = await Circular.find(circularQuery(req.query)).sort({ startdate: -1, updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveCircular = async (req, res) => {
  try {
    const payload = circularPayload(req.body, req.body.targettype);
    if (!payload.circular) return res.status(400).json({ success: false, message: "Circular is required" });
    const row = req.body.id
      ? await Circular.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await Circular.create(payload);
    res.json({ success: true, row: toClient(row) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkCirculars = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => circularPayload({ ...row, colid: req.body.colid, user: req.body.user, namecreated: req.body.namecreated }, req.body.targettype));
    const result = docs.length ? await Circular.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: result.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteCirculars = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await Circular.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.viewCirculars = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const role = text(req.query.role);
    const student = /^student$/i.test(role);
    const base = { colid, ...activeWindow() };
    const ors = student
      ? [
        { targettype: "Student" },
        { targettype: "Program", academicyear: regex(req.query.academicyear || ""), regulation: regex(req.query.regulation || ""), programcode: regex(req.query.programcode || ""), semester: regex(req.query.semester || "") }
      ]
      : [
        { targettype: "All" },
        { targettype: "Role", roles: regex(role || "") }
      ];
    const rows = await Circular.find({ ...base, $or: ors }).sort({ startdate: -1, updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listCommittees = async (req, res) => {
  try {
    const query = scoped(req.query);
    ["committeename", "type", "level", "active"].forEach((field) => { if (text(req.query[field])) query[field] = regex(req.query[field]); });
    const rows = await Committee.find(query).sort({ startdate: -1, committeename: 1 }).limit(5000).lean();
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveCommittee = async (req, res) => {
  try {
    const payload = committeePayload(req.body);
    if (!payload.committeename) return res.status(400).json({ success: false, message: "Committee name is required" });
    const row = req.body.id
      ? await Committee.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await Committee.create(payload);
    res.json({ success: true, row: toClient(row) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteCommittees = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await Committee.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listMinutes = async (req, res) => {
  try {
    const query = scoped(req.query);
    ["committeeid", "committeename", "agenda", "minutes"].forEach((field) => { if (text(req.query[field])) query[field] = regex(req.query[field]); });
    if (text(req.query.fromdate) || text(req.query.todate)) {
      query.meetingdate = {};
      if (text(req.query.fromdate)) query.meetingdate.$gte = new Date(`${text(req.query.fromdate)}T00:00:00`);
      if (text(req.query.todate)) query.meetingdate.$lte = new Date(`${text(req.query.todate)}T23:59:59`);
    }
    const rows = await CommitteeMinutes.find(query).sort({ meetingdate: -1, updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveMinutes = async (req, res) => {
  try {
    const payload = minutesPayload(req.body);
    if (!payload.committeeid) return res.status(400).json({ success: false, message: "Committee is required" });
    const row = req.body.id
      ? await CommitteeMinutes.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await CommitteeMinutes.create(payload);
    res.json({ success: true, row: toClient(row) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteMinutes = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await CommitteeMinutes.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
