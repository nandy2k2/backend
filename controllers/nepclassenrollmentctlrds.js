const NepClassEnrollment = require("../Models/nepclassenrollmentds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const User = require("../Models/user");

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

exports.enrollStudents = async (req, res) => {
  try {
    const course = cleanEnrollment(req.body.course || req.body);
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    if (!students.length) return res.status(400).json({ success: false, message: "Select students" });
    let saved = 0;
    for (const student of students) {
      const payload = cleanEnrollment({ ...course, ...student, status: "Approved", approvedby: req.body.user, user: req.body.user, colid: req.body.colid || course.colid });
      payload.approveddate = new Date();
      const error = validate(payload);
      if (error) continue;
      await upsertEnrollment(payload);
      saved += 1;
    }
    res.json({ success: true, saved });
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
    const result = await NepClassEnrollment.updateMany(
      { colid, _id: { $in: ids } },
      { $set: { status: "Approved", approvedby: text(req.body.user), approveddate: new Date() } }
    );
    res.json({ success: true, updated: result.modifiedCount || 0 });
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
