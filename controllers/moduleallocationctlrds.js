const ModuleAllocation = require("../Models/moduleallocationds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const Syllabus = require("../Models/syllabusds");

const text = (value) => String(value || "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const list = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(",").map(text).filter(Boolean);
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const cleanPayload = (input = {}) => {
  const modules = list(input.modules || input.module);
  const topics = list(input.topics || input.topic || input.syllabus);
  return {
    order: toNumber(input.order) || 0,
    academicyear: text(input.academicyear || input.academicYear),
    regulation: text(input.regulation),
    program: text(input.program),
    programcode: text(input.programcode),
    course: text(input.course),
    coursecode: text(input.coursecode),
    facultyname: text(input.facultyname || input.faculty || input.facultyName),
    facultyemail: text(input.facultyemail || input.facultyEmail),
    facultydepartment: text(input.facultydepartment || input.department),
    modules,
    topics,
    module: modules.join(", "),
    topic: topics.join(", "),
    weightage: toNumber(input.weightage) || 0,
    refbook: text(input.refbook || input.refBook || input["ref book"]),
    description: text(input.description),
    status: text(input.status) || "Active",
    workloadid: text(input.workloadid || input.workloadId) || undefined,
    colid: toNumber(input.colid),
    user: text(input.user),
    name: text(input.name)
  };
};

const validatePayload = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.regulation) return "Regulation is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  if (!payload.facultyname) return "Faculty is required";
  if (!payload.facultyemail) return "Faculty email is required";
  if (!payload.modules.length) return "Select at least one module";
  if (!payload.topics.length) return "Select at least one topic";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "facultyemail", "facultydepartment", "status"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  if (text(source.module)) query.modules = text(source.module);
  if (text(source.topic)) query.topics = text(source.topic);
  return query;
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const workloadQuery = { colid };
    ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "facultyemail", "status"].forEach((field) => {
      if (text(req.query[field])) workloadQuery[field] = text(req.query[field]);
    });
    const syllabusQuery = { colid };
    ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "semester"].forEach((field) => {
      if (text(req.query[field])) syllabusQuery[field] = text(req.query[field]);
    });
    const [workloads, syllabi, allocations] = await Promise.all([
      WorkloadAssignment.find(workloadQuery).sort({ academicyear: 1, program: 1, course: 1, facultyname: 1 }).lean(),
      Syllabus.find(syllabusQuery).sort({ module: 1, syllabus: 1 }).lean(),
      ModuleAllocation.find({ colid }).lean()
    ]);
    const programMap = new Map();
    workloads.concat(allocations).forEach((row) => {
      if (row.programcode) programMap.set(row.programcode, { program: row.program || "", programcode: row.programcode || "" });
    });
    const courseMap = new Map();
    workloads.concat(allocations).forEach((row) => {
      if (row.coursecode) courseMap.set(row.coursecode, { course: row.course || "", coursecode: row.coursecode || "" });
    });
    res.json({
      success: true,
      workloads,
      syllabus: syllabi,
      academicyears: uniq(workloads.concat(allocations).map((row) => row.academicyear)),
      regulations: uniq(workloads.concat(allocations).map((row) => row.regulation)),
      programs: [...programMap.values()].sort((a, b) => a.programcode.localeCompare(b.programcode, undefined, { numeric: true })),
      courses: [...courseMap.values()].sort((a, b) => a.coursecode.localeCompare(b.coursecode, undefined, { numeric: true })),
      faculty: workloads.map((row) => ({
        facultyname: row.facultyname || "",
        facultyemail: row.facultyemail || "",
        facultydepartment: row.facultydepartment || "",
        label: `${row.facultyname || row.facultyemail || "Faculty"} | ${row.course || ""} (${row.coursecode || ""})`
      })),
      modules: uniq(syllabi.map((row) => row.module)),
      topics: uniq(syllabi.map((row) => row.syllabus)),
      statuses: uniq(["Active", "Inactive", ...allocations.map((row) => row.status)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ModuleAllocation.find(query).sort({ order: 1, academicyear: 1, program: 1, course: 1, facultyname: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ModuleAllocation.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await ModuleAllocation.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length) {
      const result = await ModuleAllocation.deleteMany({ _id: { $in: ids }, colid: toNumber(req.body.colid) });
      return res.json({ success: true, deleted: result.deletedCount || 0 });
    }
    const data = await ModuleAllocation.findByIdAndDelete(req.body.id);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, deleted: 1 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows received" });
    const errors = [];
    const valid = [];
    rows.forEach((row, index) => {
      const payload = cleanPayload({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user, name: req.body.name || row.name });
      const error = validatePayload(payload);
      if (error) errors.push({ row: row.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });
    if (valid.length) await ModuleAllocation.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await ModuleAllocation.find(query).sort({ order: 1, academicyear: 1, program: 1, course: 1 }).lean();
    const totalWeightage = rows.reduce((sum, row) => sum + (Number(row.weightage) || 0), 0);
    const groupCount = (field) => {
      const map = new Map();
      rows.forEach((row) => {
        const key = text(row[field]) || "Not specified";
        map.set(key, (map.get(key) || 0) + 1);
      });
      return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };
    res.json({
      success: true,
      data: rows,
      summary: {
        allocations: rows.length,
        totalWeightage,
        faculties: uniq(rows.map((row) => row.facultyemail)).length,
        courses: uniq(rows.map((row) => row.coursecode)).length,
        modules: uniq(rows.flatMap((row) => row.modules || [])).length
      },
      charts: {
        faculty: groupCount("facultyname"),
        course: groupCount("coursecode"),
        program: groupCount("programcode")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
