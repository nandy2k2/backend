const GraceMarksPolicy = require("../Models/gracemarkspolicyds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const clean = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear || input["Academic Year"]),
  regulation: text(input.regulation || input.Regulation),
  program: text(input.program || input.Program),
  programcode: text(input.programcode || input.programCode || input["Program Code"]),
  semester: text(input.semester || input.Semester),
  course: text(input.course || input.Course),
  coursecode: text(input.coursecode || input.courseCode || input["Course Code"]),
  gracemark: number(input.gracemark || input.graceMark || input["Grace Mark"], 0),
  colid: number(input.colid, 0),
  user: text(input.user)
});

const validate = (payload) => {
  if (!payload.colid) return "colid is required";
  for (const field of ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode"]) {
    if (!payload[field]) return `${field} is required`;
  }
  return "";
};

const queryFrom = (source = {}) => {
  const query = {};
  const colid = number(source.colid, 0);
  if (colid) query.colid = colid;
  ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, status: "Active" };
    ["academicyear", "regulation", "programcode", "semester"].forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });
    const courses = await RegulationCourseMap.find(query).sort({ academicyear: -1, regulation: 1, program: 1, semester: 1, course: 1 }).lean();
    res.json({
      success: true,
      courses,
      academicyears: uniq(courses.map((row) => row.academicyear)),
      regulations: uniq(courses.map((row) => row.regulation)),
      programs: uniq(courses.map((row) => `${row.program}|||${row.programcode}`)),
      semesters: uniq(courses.map((row) => row.semester)),
      coursecodes: uniq(courses.map((row) => `${row.course}|||${row.coursecode}`))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = queryFrom(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await GraceMarksPolicy.find(query).sort({ academicyear: -1, regulation: 1, program: 1, semester: 1, course: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = clean(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await GraceMarksPolicy.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await GraceMarksPolicy.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode, semester: payload.semester, coursecode: payload.coursecode },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const data = await GraceMarksPolicy.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, 0) });
    if (!data) return res.status(404).json({ success: false, message: "Policy not found" });
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
      const payload = clean({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validate(payload);
      if (error) {
        errors.push({ rowNumber: row.rowNumber || index + 2, message: error });
        continue;
      }
      await GraceMarksPolicy.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode, semester: payload.semester, coursecode: payload.coursecode },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      inserted += 1;
    }
    res.json({ success: true, inserted, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
