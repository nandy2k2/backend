const NepClassEnrollment = require("../Models/nepclassenrollmentds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const User = require("../Models/user");
const LedgerStud = require("../Models/ledgerstud");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const re = (value) => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

const courseQuery = (source = {}, electiveOnly = true) => {
  const query = { colid: number(source.colid, 0), status: "Active" };
  if (electiveOnly) query.deliverytype = "Elective";
  ["academicyear", "regulation", "programcode", "program", "semester", "coursecode", "course"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

const enrollmentQuery = (source = {}) => {
  const query = {};
  const colid = number(source.colid, 0);
  if (colid) query.colid = colid;
  ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "regno", "studentemail", "status"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  if (source.student) query.student = new RegExp(text(source.student), "i");
  return query;
};

const cleanEnrollment = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear || input["Academic Year"]),
  regulation: text(input.regulation || input.Regulation),
  program: text(input.program || input.Program),
  programcode: text(input.programcode || input.programCode || input["Program Code"]),
  semester: text(input.semester || input.Semester),
  course: text(input.course || input.Course),
  coursecode: text(input.coursecode || input.courseCode || input["Course Code"]),
  subject: text(input.subject || input.Subject),
  type: text(input.type || input.Type),
  student: text(input.student || input.name || input["Student"]),
  regno: text(input.regno || input.Regno || input["Reg No"]),
  studentemail: text(input.studentemail || input.email || input["Student Email"]).toLowerCase(),
  phone: text(input.phone || input.Phone),
  section: text(input.section || input.Section),
  status: text(input.status || input.Status) || "Applied",
  appliedby: text(input.appliedby || input.appliedBy),
  approvedby: text(input.approvedby || input.approvedBy),
  remarks: text(input.remarks || input.Remarks),
  colid: number(input.colid, 0),
  user: text(input.user)
});

const statusKey = (value) => {
  const status = text(value).toLowerCase();
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "submitted") return "submitted";
  return "applied";
};

const buildReportQuery = (source = {}) => {
  const query = enrollmentQuery(source);
  delete query.status;
  return query;
};

const summarizeByCourse = (rows = []) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = `${text(row.coursecode)}|||${text(row.course)}`;
    const existing = map.get(key) || {
      course: text(row.course),
      coursecode: text(row.coursecode),
      applications: 0,
      approved: 0,
      applied: 0,
      submitted: 0,
      rejected: 0
    };
    existing.applications += 1;
    existing[statusKey(row.status)] = (existing[statusKey(row.status)] || 0) + 1;
    map.set(key, existing);
  });
  return Array.from(map.values()).sort((a, b) => text(a.coursecode).localeCompare(text(b.coursecode), undefined, { numeric: true }));
};

const validate = (payload) => {
  if (!payload.colid) return "colid is required";
  for (const field of ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "student", "regno"]) {
    if (!payload[field]) return `${field} is required`;
  }
  return "";
};

const upsertEnrollment = async (payload) => NepClassEnrollment.findOneAndUpdate(
  { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode, semester: payload.semester, coursecode: payload.coursecode, regno: payload.regno },
  payload,
  { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
);

const electiveFeeItem = (payload = {}) => [text(payload.course), text(payload.coursecode)].filter(Boolean).join(" - ");

const findElectiveCourse = async (payload = {}) => {
  const base = {
    colid: number(payload.colid, 0),
    academicyear: text(payload.academicyear),
    regulation: text(payload.regulation),
    programcode: text(payload.programcode),
    semester: text(payload.semester),
    coursecode: text(payload.coursecode),
    deliverytype: "Elective",
    status: "Active"
  };
  let course = await RegulationCourseMap.findOne(base).lean();
  if (!course && payload.course) {
    const fallback = { ...base, course: text(payload.course) };
    delete fallback.coursecode;
    course = await RegulationCourseMap.findOne(fallback).lean();
  }
  return course;
};

const ensureElectiveLedger = async (payload = {}, actor = "") => {
  if (text(payload.status).toLowerCase() !== "approved") return null;
  const course = await findElectiveCourse(payload);
  const amount = number(course?.amount, 0);
  if (!course || amount <= 0) return null;

  const student = await User.findOne({
    colid: payload.colid,
    role: /^Student$/i,
    $or: [
      ...(payload.regno ? [{ regno: payload.regno }] : []),
      ...(payload.studentemail ? [{ email: re(payload.studentemail) }] : [])
    ]
  }).lean();

  const feeitem = electiveFeeItem({ ...payload, course: course.course || payload.course, coursecode: course.coursecode || payload.coursecode });
  const filter = {
    colid: payload.colid,
    academicyear: payload.academicyear,
    regulation: payload.regulation,
    programcode: payload.programcode,
    semester: payload.semester,
    regno: payload.regno,
    feegroup: "Elective",
    feeitem
  };
  const now = new Date();
  const existing = await LedgerStud.findOne(filter).lean();
  const paid = number(existing?.paid, 0);
  const concession = number(existing?.concession, 0);
  const balance = Math.max(0, amount - paid - concession);
  const data = {
    name: text(actor) || text(payload.approvedby) || text(payload.user) || text(payload.student),
    user: text(actor) || text(payload.approvedby) || text(payload.user) || text(payload.studentemail) || text(payload.regno),
    feegroup: "Elective",
    feecategory: "Elective",
    feetype: "Elective",
    regno: payload.regno,
    student: payload.student,
    feeitem,
    amount,
    paid,
    concession,
    balance,
    Latefinedue: number(existing?.Latefinedue, 0),
    Latefinepaid: number(existing?.Latefinepaid, 0),
    refundable: existing?.refundable || "No",
    refundamount: number(existing?.refundamount, 0),
    refundedamount: number(existing?.refundedamount, 0),
    semester: payload.semester,
    institution: student?.institution || "",
    type: "positive",
    installment: "",
    comments: `Elective fee for ${feeitem}`,
    academicyear: payload.academicyear,
    colid: payload.colid,
    classdate: existing?.classdate || now,
    duedate: existing?.duedate || now,
    status: balance > 0 ? "Due" : "Paid",
    programcode: payload.programcode,
    regulation: payload.regulation,
    admissionyear: student?.admissionyear || payload.academicyear
  };

  const ledger = await LedgerStud.findOneAndUpdate(filter, { $set: data }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  return ledger;
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const courses = await RegulationCourseMap.find(courseQuery(req.query, true)).sort({ academicyear: -1, regulation: 1, program: 1, semester: 1, course: 1 }).lean();
    const allCourses = await RegulationCourseMap.find({ colid, status: "Active" }).select("academicyear regulation program programcode semester course coursecode deliverytype").lean();
    const enrollments = await NepClassEnrollment.find({ colid }).select("academicyear regulation program programcode semester course coursecode status").lean();
    res.json({
      success: true,
      courses,
      academicyears: uniq(allCourses.map((row) => row.academicyear)),
      regulations: uniq(allCourses.filter((row) => !req.query.academicyear || row.academicyear === req.query.academicyear).map((row) => row.regulation)),
      programs: uniq(allCourses.filter((row) => (!req.query.academicyear || row.academicyear === req.query.academicyear) && (!req.query.regulation || row.regulation === req.query.regulation)).map((row) => `${row.program}|||${row.programcode}`)),
      semesters: uniq(allCourses.map((row) => row.semester)),
      statuses: uniq(["Applied", "Approved", "Rejected", ...enrollments.map((row) => row.status)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.students = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, role: "Student" };
    if (req.query.academicyear) query.academicyear = req.query.academicyear;
    if (req.query.regulation) query.regulation = req.query.regulation;
    if (req.query.programcode) query.programcode = req.query.programcode;
    if (req.query.semester) query.semester = req.query.semester;
    const rows = await User.find(query).select("name email phone regno academicyear regulation program programcode semester section").sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = enrollmentQuery(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await NepClassEnrollment.find(query).sort({ academicyear: -1, program: 1, semester: 1, course: 1, student: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reportOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await NepClassEnrollment.find({ colid })
      .select("academicyear regulation program programcode semester course coursecode status")
      .sort({ academicyear: -1, regulation: 1, program: 1, semester: 1, course: 1 })
      .lean();
    const filtered = rows.filter((row) => (
      (!req.query.academicyear || row.academicyear === req.query.academicyear) &&
      (!req.query.regulation || row.regulation === req.query.regulation) &&
      (!req.query.programcode || row.programcode === req.query.programcode) &&
      (!req.query.semester || row.semester === req.query.semester)
    ));
    res.json({
      success: true,
      academicyears: uniq(rows.map((row) => row.academicyear)),
      regulations: uniq(rows.filter((row) => !req.query.academicyear || row.academicyear === req.query.academicyear).map((row) => row.regulation)),
      programs: uniq(rows.filter((row) => (!req.query.academicyear || row.academicyear === req.query.academicyear) && (!req.query.regulation || row.regulation === req.query.regulation)).map((row) => `${row.program}|||${row.programcode}`)),
      semesters: uniq(rows.filter((row) => (!req.query.academicyear || row.academicyear === req.query.academicyear) && (!req.query.regulation || row.regulation === req.query.regulation) && (!req.query.programcode || row.programcode === req.query.programcode)).map((row) => row.semester)),
      courses: summarizeByCourse(filtered),
      statuses: uniq(["Applied", "Approved", "Rejected", "Submitted", ...rows.map((row) => row.status)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applicationReport = async (req, res) => {
  try {
    const query = buildReportQuery(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await NepClassEnrollment.find(query).sort({ course: 1, student: 1 }).lean();
    const summary = summarizeByCourse(rows);
    const totals = summary.reduce((acc, row) => {
      acc.applications += row.applications || 0;
      acc.approved += row.approved || 0;
      acc.applied += row.applied || 0;
      acc.submitted += row.submitted || 0;
      acc.rejected += row.rejected || 0;
      return acc;
    }, { applications: 0, approved: 0, applied: 0, submitted: 0, rejected: 0 });
    res.json({ success: true, data: rows, summary, totals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvedReport = async (req, res) => {
  try {
    const query = buildReportQuery(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    query.status = /^Approved$/i;
    const rows = await NepClassEnrollment.find(query).sort({ course: 1, student: 1 }).lean();
    const summary = summarizeByCourse(rows).map((row) => ({ ...row, approvedapplications: row.approved || row.applications || 0 }));
    const totals = { approved: rows.length, courses: summary.length };
    res.json({ success: true, data: rows, summary, totals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.enrollStudents = async (req, res) => {
  try {
    const course = cleanEnrollment(req.body.course || req.body);
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    if (!students.length) return res.status(400).json({ success: false, message: "Select students" });
    let saved = 0;
    let ledgerProcessed = 0;
    for (const student of students) {
      const payload = cleanEnrollment({ ...course, ...student, status: "Approved", approvedby: req.body.user, user: req.body.user, colid: req.body.colid || course.colid });
      payload.approveddate = new Date();
      const error = validate(payload);
      if (error) continue;
      await upsertEnrollment(payload);
      const ledger = await ensureElectiveLedger(payload, req.body.user);
      if (ledger) ledgerProcessed += 1;
      saved += 1;
    }
    res.json({ success: true, saved, ledgerProcessed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.apply = async (req, res) => {
  try {
    const payload = cleanEnrollment({ ...req.body, status: "Applied", appliedby: req.body.user || req.body.studentemail });
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await upsertEnrollment(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const colid = number(req.body.colid, 0);
    if (!colid || !ids.length) return res.status(400).json({ success: false, message: "Select applications" });
    const applications = await NepClassEnrollment.find({ colid, _id: { $in: ids } }).lean();
    const result = await NepClassEnrollment.updateMany(
      { colid, _id: { $in: ids } },
      { $set: { status: "Approved", approvedby: text(req.body.user), approveddate: new Date() } }
    );
    let ledgerProcessed = 0;
    for (const row of applications) {
      const ledger = await ensureElectiveLedger({ ...row, status: "Approved", approvedby: text(req.body.user), approveddate: new Date(), user: text(req.body.user) || row.user }, req.body.user);
      if (ledger) ledgerProcessed += 1;
    }
    res.json({ success: true, updated: result.modifiedCount || 0, ledgerProcessed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = cleanEnrollment(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await NepClassEnrollment.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await upsertEnrollment(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const data = await NepClassEnrollment.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, 0) });
    if (!data) return res.status(404).json({ success: false, message: "Enrollment not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows received" });
    let inserted = 0;
    const errors = [];
    for (const [index, row] of rows.entries()) {
      const payload = cleanEnrollment({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validate(payload);
      if (error) {
        errors.push({ rowNumber: row.rowNumber || index + 2, message: error });
        continue;
      }
      await upsertEnrollment(payload);
      inserted += 1;
    }
    res.json({ success: true, inserted, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
