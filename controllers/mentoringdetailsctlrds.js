const User = require("../Models/user");
const InsDetails = require("../Models/insdetails");
const UserCustomField = require("../Models/usercustomfieldds");
const UserProfileDisplayLayout = require("../Models/userprofiledisplaylayoutds");
const AdmissionApplicationDynamic = require("../Models/admissionapplicationdynamic");
const ExamMarks1 = require("../Models/exammarks1ds");
const ExamMarks2 = require("../Models/exammarks2ds");
const ExamModel2Marks = require("../Models/examinationmodel2marksds");
const HomeVisit = require("../Models/mentoringhomevisitds");
const MentoringSession = require("../Models/mentoringsessionds");
const CulturalActivity = require("../Models/mentoringculturalactivityds");
const SportsActivity = require("../Models/mentoringsportsactivityds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const studentFields = ["academicyear", "regulation", "program", "programcode", "semester", "section", "Major", "Minor", "IDC", "name", "email", "phone", "regno"];
const detailFields = ["academicyear", "faculty", "facultyemail", "student", "regno", "activity", "activitydate", "status"];
const selectUserFields = "name email phone regno scholarnumber abcid role program programcode admissionyear academicyear rollno semester section gender state city district pincode department designation pan photo guardianname guardianmobile guardianemail category address quota colid status fathername mothername dob birthdate joiningdate regulation Major Minor AEC SEC VAC IDC MDC institution Mediumofinstruction specialization1 specialization2 profileapprovalstatus profileapprovalcomments customFields";

const modelFor = (type) => type === "sessions" ? MentoringSession : HomeVisit;

const buildStudentQuery = (source = {}) => {
  const colid = number(source.colid);
  const query = { role: /^Student$/i };
  if (colid !== undefined) query.colid = colid;
  studentFields.forEach((field) => {
    if (!source[field]) return;
    const key = field === "major" ? "Major" : field;
    query[key] = new RegExp(escapeRegex(source[field]), "i");
  });
  return query;
};

const buildDetailQuery = (source = {}) => {
  const colid = number(source.colid);
  const query = {};
  if (colid !== undefined) query.colid = colid;
  detailFields.forEach((field) => {
    if (source[field]) query[field] = new RegExp(escapeRegex(source[field]), "i");
  });
  return query;
};

const normalizeDetail = (row = {}, defaults = {}) => ({
  colid: number(row.colid ?? defaults.colid),
  academicyear: text(row.academicyear),
  faculty: text(row.faculty),
  facultyemail: text(row.facultyemail),
  student: text(row.student),
  regno: text(row.regno),
  activity: text(row.activity),
  activitydate: text(row.activitydate),
  description: text(row.description || row.dexcription),
  user: text(row.user || defaults.user),
  status: text(row.status) || "Active"
});

exports.getOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const userQuery = colid === undefined ? { role: /^Student$/i } : { colid, role: /^Student$/i };
    const staffQuery = colid === undefined ? { role: { $not: /^Student$/i } } : { colid, role: { $not: /^Student$/i } };
    const detailQuery = colid === undefined ? {} : { colid };
    const [students, faculty, homeActivities, sessionActivities, years] = await Promise.all([
      User.find(userQuery).select("name email phone regno program programcode academicyear regulation semester section Major Minor IDC photo").sort({ name: 1 }).lean(),
      User.find(staffQuery).select("name email role department").sort({ name: 1 }).lean(),
      HomeVisit.distinct("activity", detailQuery),
      MentoringSession.distinct("activity", detailQuery),
      User.distinct("academicyear", userQuery)
    ]);
    res.json({ success: true, students, faculty, activities: [...new Set([...homeActivities, ...sessionActivities].filter(Boolean))], years });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const data = await User.find(buildStudentQuery(req.body || {})).select(selectUserFields).sort({ name: 1 }).limit(1000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listDetails = (type) => async (req, res) => {
  try {
    const data = await modelFor(type).find(buildDetailQuery(req.query)).sort({ activitydate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveDetail = (type) => async (req, res) => {
  try {
    const payload = normalizeDetail(req.body || {}, req.body || {});
    if (payload.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = req.body._id
      ? await modelFor(type).findByIdAndUpdate(req.body._id, payload, { new: true })
      : await modelFor(type).create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteDetails = (type) => async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await modelFor(type).deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDetails = (type) => async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const defaults = { colid: req.body.colid, user: req.body.user };
    const payloads = rows.map((row) => normalizeDetail(row, defaults)).filter((row) => row.colid !== undefined && row.regno);
    const data = payloads.length ? await modelFor(type).insertMany(payloads, { ordered: false }) : [];
    res.json({ success: true, saved: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentReadonly = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const regno = text(req.query.regno);
    const query = {};
    if (colid !== undefined) query.colid = colid;
    if (regno) query.regno = new RegExp(`^${escapeRegex(regno)}$`, "i");
    const [homeVisits, sessions, cultural, sports] = await Promise.all([
      HomeVisit.find(query).sort({ activitydate: -1 }).lean(),
      MentoringSession.find(query).sort({ activitydate: -1 }).lean(),
      CulturalActivity.find(query).sort({ activitydate: -1 }).lean(),
      SportsActivity.find(query).sort({ activitydate: -1 }).lean()
    ]);
    res.json({ success: true, homeVisits, sessions, cultural, sports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentProfile = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = number(body.colid);
    const studentQuery = buildStudentQuery(body);
    const student = body.studentid
      ? await User.findOne({ _id: body.studentid, ...(colid !== undefined ? { colid } : {}) }).select(selectUserFields).lean()
      : await User.findOne(studentQuery).select(selectUserFields).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const email = text(student.email);
    const regno = text(student.regno);
    const baseQuery = colid === undefined ? {} : { colid };
    const studentMatch = {
      ...baseQuery,
      $or: [
        ...(email ? [{ email: new RegExp(`^${escapeRegex(email)}$`, "i") }, { user: new RegExp(`^${escapeRegex(email)}$`, "i") }] : []),
        ...(regno ? [{ regno: new RegExp(`^${escapeRegex(regno)}$`, "i") }] : [])
      ]
    };
    const [institution, layout, customFields, admissions, examMarks1, examMarks2, examModel2, homeVisits, sessions, cultural, sports] = await Promise.all([
      InsDetails.findOne(baseQuery).sort({ _id: -1 }).lean(),
      UserProfileDisplayLayout.find({ ...baseQuery, role: /^Student$/i, visible: /^Yes$/i }).sort({ sectionorder: 1, order: 1 }).lean(),
      UserCustomField.find({ ...baseQuery, isactive: /^Yes$/i }).sort({ page: 1, section: 1, order: 1 }).lean(),
      AdmissionApplicationDynamic.find(studentMatch.$or.length ? studentMatch : baseQuery).sort({ createdAt: -1 }).lean(),
      ExamMarks1.find(baseQuery).sort({ year: -1, semester: 1 }).limit(500).lean(),
      ExamMarks2.find(studentMatch.$or.length ? studentMatch : baseQuery).sort({ year: -1, semester: 1 }).lean(),
      ExamModel2Marks.find({ ...baseQuery, ...(regno ? { regno: new RegExp(`^${escapeRegex(regno)}$`, "i") } : {}) }).sort({ academicyear: -1, semester: 1, course: 1 }).lean(),
      HomeVisit.find({ ...baseQuery, ...(regno ? { regno: new RegExp(`^${escapeRegex(regno)}$`, "i") } : {}) }).sort({ activitydate: -1 }).lean(),
      MentoringSession.find({ ...baseQuery, ...(regno ? { regno: new RegExp(`^${escapeRegex(regno)}$`, "i") } : {}) }).sort({ activitydate: -1 }).lean(),
      CulturalActivity.find({ ...baseQuery, ...(regno ? { regno: new RegExp(`^${escapeRegex(regno)}$`, "i") } : {}) }).sort({ activitydate: -1 }).lean(),
      SportsActivity.find({ ...baseQuery, ...(regno ? { regno: new RegExp(`^${escapeRegex(regno)}$`, "i") } : {}) }).sort({ activitydate: -1 }).lean()
    ]);
    res.json({ success: true, student, institution, layout, customFields, admissions, examMarks1, examMarks2, examModel2, homeVisits, sessions, cultural, sports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
