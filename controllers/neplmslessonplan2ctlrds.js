const LessonPlan2 = require("../Models/neplmslessonplan2ds");
const Syllabus = require("../Models/syllabusds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");

const text = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(escapeRegex(value), "i");
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const payloadFrom = (input = {}) => ({
  academicyear: text(input.academicyear),
  regulation: text(input.regulation),
  program: text(input.program),
  programcode: text(input.programcode),
  semester: text(input.semester),
  course: text(input.course),
  coursecode: text(input.coursecode),
  module: text(input.module),
  topic: text(input.topic),
  lectureno: toNumber(input.lectureno ?? input.lectureNo ?? input["lecture no"]) || 0,
  planneddatefrom: text(input.planneddatefrom || input.plannedDateFrom),
  planneddateto: text(input.planneddateto || input.plannedDateTo),
  actualdatefrom: text(input.actualdatefrom || input.actualDateFrom),
  actualdateto: text(input.actualdateto || input.actualDateTo),
  status: text(input.status) || "Active",
  colid: toNumber(input.colid),
  user: text(input.user),
  name: text(input.name)
});

const validate = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "module", "topic"]) {
    if (!payload[field]) return `${field} is required`;
  }
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "regulation", "programcode", "semester", "coursecode", "module", "status"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  ["program", "course", "topic", "user", "name"].forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
  if (text(source.datefrom) || text(source.dateto)) {
    query.planneddatefrom = {};
    if (text(source.datefrom)) query.planneddatefrom.$gte = text(source.datefrom);
    if (text(source.dateto)) query.planneddatefrom.$lte = text(source.dateto);
  }
  return query;
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const courseQuery = { colid };
    ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode"].forEach((field) => {
      if (text(req.query[field])) courseQuery[field] = text(req.query[field]);
    });
    const syllabusQuery = { colid };
    ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode"].forEach((field) => {
      if (text(req.query[field])) syllabusQuery[field] = text(req.query[field]);
    });
    if (text(req.query.module)) {
      const modules = text(req.query.module).split(",").map((item) => item.trim()).filter(Boolean);
      if (modules.length) syllabusQuery.module = { $in: modules };
    }
    const allModuleQuery = { ...syllabusQuery };
    delete allModuleQuery.module;
    const [courses, syllabi, allSyllabi, plans] = await Promise.all([
      RegulationCourseMap.find(courseQuery).select("academicyear regulation program programcode semester course coursecode").sort({ academicyear: 1, regulation: 1, program: 1, semester: 1, course: 1 }).lean(),
      Syllabus.find(syllabusQuery).select("module syllabus").sort({ module: 1, syllabus: 1 }).lean(),
      Syllabus.find(allModuleQuery).select("module").sort({ module: 1 }).lean(),
      LessonPlan2.find({ colid }).select("status").lean()
    ]);
    const programMap = new Map();
    const courseMap = new Map();
    courses.forEach((row) => {
      if (row.programcode) programMap.set(`${row.program}|||${row.programcode}`, { program: row.program, programcode: row.programcode });
      if (row.coursecode) courseMap.set(`${row.course}|||${row.coursecode}`, { course: row.course, coursecode: row.coursecode, program: row.program, programcode: row.programcode, semester: row.semester });
    });
    res.json({
      success: true,
      academicyears: uniq(courses.map((row) => row.academicyear)),
      regulations: uniq(courses.map((row) => row.regulation)),
      programs: [...programMap.values()].sort((a, b) => text(a.program).localeCompare(text(b.program))),
      semesters: uniq(courses.map((row) => row.semester)),
      courses: [...courseMap.values()].sort((a, b) => text(a.course).localeCompare(text(b.course))),
      modules: uniq(allSyllabi.map((row) => row.module)),
      topics: uniq(syllabi.map((row) => row.syllabus)),
      statuses: uniq(plans.map((row) => row.status))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await LessonPlan2.find(query).sort({ planneddatefrom: 1, lectureno: 1, module: 1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = payloadFrom(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await LessonPlan2.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = payloadFrom(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await LessonPlan2.findOneAndUpdate(
      { _id: req.body.id, colid: payload.colid },
      payload,
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Lesson plan not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const data = await LessonPlan2.findOneAndDelete({ _id: req.body.id, colid });
    if (!data) return res.status(404).json({ success: false, message: "Lesson plan not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one row" });
    const result = await LessonPlan2.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows received" });
    const errors = [];
    const docs = [];
    rows.forEach((row, index) => {
      const item = payloadFrom({ ...row, colid, user: req.body.user || row.user, name: req.body.name || row.name });
      const error = validate(item);
      if (error) errors.push({ row: index + 2, message: error });
      else docs.push(item);
    });
    const inserted = docs.length ? await LessonPlan2.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: inserted.length, errors, data: inserted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await LessonPlan2.find(query).sort({ planneddatefrom: 1, lectureno: 1 }).limit(5000).lean();
    const summaryBy = (field) => Object.values(rows.reduce((acc, row) => {
      const key = text(row[field]) || "Not specified";
      acc[key] = acc[key] || { name: key, planned: 0, actual: 0, pending: 0 };
      acc[key].planned += 1;
      if (row.actualdatefrom || row.actualdateto) acc[key].actual += 1;
      else acc[key].pending += 1;
      return acc;
    }, {})).sort((a, b) => b.planned - a.planned);
    res.json({
      success: true,
      filters: query,
      total: rows.length,
      completed: rows.filter((row) => row.actualdatefrom || row.actualdateto).length,
      pending: rows.filter((row) => !row.actualdatefrom && !row.actualdateto).length,
      byProgram: summaryBy("programcode"),
      byCourse: summaryBy("coursecode"),
      byModule: summaryBy("module"),
      rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
