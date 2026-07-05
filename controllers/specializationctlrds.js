const Specialization = require("../Models/specializationds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");

const text = (value) => String(value || "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const cleanPayload = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear || input["Academic Year"]),
  regulation: text(input.regulation || input.Regulation),
  program: text(input.program || input.Program),
  programcode: text(input.programcode || input.programCode || input["Program Code"]),
  semester: text(input.semester || input.Semester),
  course: text(input.course || input.Course),
  coursecode: text(input.coursecode || input.courseCode || input["Course Code"]),
  status: text(input.status || input.Status) || "Active",
  colid: toNumber(input.colid),
  user: text(input.user)
});

const validate = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.regulation) return "Regulation is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.semester) return "Semester is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "status"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["academicyear", "regulation", "programcode", "semester"].forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });
    const [courseMaps, specializations] = await Promise.all([
      RegulationCourseMap.find(query).sort({ academicyear: 1, regulation: 1, program: 1, semester: 1, course: 1 }).lean(),
      Specialization.find({ colid }).sort({ academicyear: 1, regulation: 1, program: 1, semester: 1, course: 1 }).lean()
    ]);
    const allRows = [...courseMaps, ...specializations];
    const programMap = new Map();
    allRows.forEach((item) => {
      if (item.programcode) programMap.set(`${item.academicyear || ""}|${item.regulation || ""}|${item.programcode}`, {
        academicyear: item.academicyear || "",
        regulation: item.regulation || "",
        program: item.program || "",
        programcode: item.programcode || ""
      });
    });
    const courseMap = new Map();
    courseMaps.forEach((item) => {
      if (item.coursecode) {
        courseMap.set(`${item.regulation}|${item.programcode}|${item.semester}|${item.coursecode}`, {
          course: item.course || "",
          coursecode: item.coursecode || "",
          program: item.program || "",
          programcode: item.programcode || "",
          semester: item.semester || "",
          academicyear: item.academicyear || "",
          regulation: item.regulation || ""
        });
      }
    });
    res.json({
      success: true,
      academicyears: uniq(allRows.map((item) => item.academicyear)),
      regulations: uniq(allRows.map((item) => item.regulation)),
      programs: [...programMap.values()].sort((a, b) => String(a.programcode).localeCompare(String(b.programcode))),
      semesters: uniq(allRows.map((item) => item.semester)),
      courses: [...courseMap.values()].sort((a, b) => String(a.course).localeCompare(String(b.course))),
      statuses: uniq(specializations.map((item) => item.status))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSpecializations = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await Specialization.find(query).sort({ academicyear: 1, regulation: 1, program: 1, semester: 1, course: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveSpecialization = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await Specialization.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await Specialization.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Specialization not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSpecialization = async (req, res) => {
  try {
    const data = await Specialization.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Specialization not found" });
    res.json({ success: true, message: "Specialization deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkSpecializations = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });
    const errors = [];
    const valid = [];
    items.forEach((row, index) => {
      const payload = cleanPayload({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validate(payload);
      if (error) errors.push({ rowNumber: row.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });
    if (valid.length) await Specialization.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
