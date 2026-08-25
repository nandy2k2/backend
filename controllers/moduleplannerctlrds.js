const ModulePlanner = require("../Models/moduleplannerds");
const ModuleAllocation = require("../Models/moduleallocationds");
const NepLmsTimetable = require("../Models/neplmstimetableds");

const text = (value) => String(value || "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const normalizeType = (value) => {
  const raw = text(value).toLowerCase();
  if (raw.startsWith("prac")) return "Practical";
  if (raw.startsWith("add") || raw === "allotted") return "Additional";
  return "Theory";
};

const cleanPayload = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear),
  regulation: text(input.regulation),
  program: text(input.program),
  programcode: text(input.programcode),
  course: text(input.course),
  coursecode: text(input.coursecode),
  faculty: text(input.faculty || input.facultyname || input.name),
  facultyemail: text(input.facultyemail || input.facultyEmail),
  module: text(input.module || input.modules),
  lectureno: text(input.lectureno || input.lectureNo || input["lecture no"]),
  lecturedate: text(input.lecturedate || input.lecturedatedate || input.classdate || input.date),
  lecturetype: normalizeType(input.lecturetype),
  status: text(input.status) || "Active",
  moduleallocationid: text(input.moduleallocationid || input.moduleAllocationId) || undefined,
  colid: toNumber(input.colid),
  user: text(input.user),
  name: text(input.name)
});

const validate = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  if (!payload.faculty) return "Faculty is required";
  if (!payload.module) return "Module is required";
  if (!payload.lectureno) return "Lecture no is required";
  if (!payload.lecturedate) return "Lecture date is required";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "faculty", "facultyemail", "module", "lecturetype", "status"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  if (text(source.fromdate) || text(source.todate)) {
    query.lecturedate = {};
    if (text(source.fromdate)) query.lecturedate.$gte = text(source.fromdate);
    if (text(source.todate)) query.lecturedate.$lte = text(source.todate);
  }
  return query;
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, status: { $ne: "Inactive" } };
    ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "facultyemail"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    const allocations = await ModuleAllocation.find(query).sort({ academicyear: 1, program: 1, course: 1, facultyname: 1, order: 1 }).lean();
    const rows = await ModulePlanner.find({ colid }).lean();
    const all = allocations.concat(rows);
    res.json({
      success: true,
      allocations,
      academicyears: uniq(all.map((row) => row.academicyear)),
      regulations: uniq(all.map((row) => row.regulation)),
      programs: uniq(all.map((row) => row.program)),
      programcodes: uniq(all.map((row) => row.programcode)),
      courses: uniq(all.map((row) => row.course)),
      coursecodes: uniq(all.map((row) => row.coursecode)),
      faculty: uniq(all.map((row) => row.faculty || row.facultyname)),
      facultyemails: uniq(all.map((row) => row.facultyemail)),
      modules: uniq(allocations.flatMap((row) => row.modules?.length ? row.modules : [row.module]).concat(rows.map((row) => row.module))),
      lecturetypes: ["Theory", "Practical", "Additional"],
      statuses: uniq(["Active", "Inactive", ...rows.map((row) => row.status)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ModulePlanner.find(query).sort({ lecturedate: 1, lectureno: 1, coursecode: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ModulePlanner.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ModulePlanner.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRows = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one row" });
    const result = await ModulePlanner.deleteMany({ _id: { $in: ids }, colid: toNumber(req.body.colid) });
    res.json({ success: true, deleted: result.deletedCount || 0 });
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
      const error = validate(payload);
      if (error) errors.push({ row: row.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });
    if (valid.length) await ModulePlanner.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.lectureProgress = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const timetableQuery = { colid: query.colid };
    ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "faculty", "facultyemail"].forEach((field) => {
      if (query[field]) timetableQuery[field] = query[field];
    });
    if (text(req.query.fromdate) || text(req.query.todate)) {
      timetableQuery.classdate = {};
      if (text(req.query.fromdate)) timetableQuery.classdate.$gte = text(req.query.fromdate);
      if (text(req.query.todate)) timetableQuery.classdate.$lte = text(req.query.todate);
    }
    delete query.module;
    delete query.status;
    const [planned, taken] = await Promise.all([
      ModulePlanner.find(query).lean(),
      NepLmsTimetable.find(timetableQuery).lean()
    ]);
    const buckets = new Map();
    const keyOf = (row) => [row.course, row.coursecode, row.faculty || row.facultyname, row.facultyemail].map(text).join("||");
    const ensure = (row) => {
      const key = keyOf(row);
      if (!buckets.has(key)) {
        buckets.set(key, {
          course: row.course || "",
          coursecode: row.coursecode || "",
          faculty: row.faculty || row.facultyname || "",
          facultyemail: row.facultyemail || "",
          theoryallotted: 0,
          theorytaken: 0,
          practicalallotted: 0,
          practicaltaken: 0,
          additionalallotted: 0,
          additionaltaken: 0
        });
      }
      return buckets.get(key);
    };
    planned.forEach((row) => {
      const bucket = ensure(row);
      const type = normalizeType(row.lecturetype).toLowerCase();
      bucket[`${type}allotted`] += 1;
    });
    taken.forEach((row) => {
      const bucket = ensure(row);
      const type = normalizeType(row.lecturetype).toLowerCase();
      bucket[`${type}taken`] += 1;
    });
    const data = [...buckets.values()].sort((a, b) => `${a.coursecode}${a.faculty}`.localeCompare(`${b.coursecode}${b.faculty}`, undefined, { numeric: true }));
    res.json({
      success: true,
      data,
      summary: {
        courses: uniq(data.map((row) => row.coursecode)).length,
        faculty: uniq(data.map((row) => row.facultyemail || row.faculty)).length,
        totalAllotted: data.reduce((sum, row) => sum + row.theoryallotted + row.practicalallotted + row.additionalallotted, 0),
        totalTaken: data.reduce((sum, row) => sum + row.theorytaken + row.practicaltaken + row.additionaltaken, 0)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
