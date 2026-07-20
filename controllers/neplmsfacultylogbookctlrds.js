const FacultyLogbook = require("../Models/neplmsfacultylogbookds");

const text = (value) => String(value || "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const cleanPayload = (source = {}) => ({
  academicyear: text(source.academicyear || source.academicYear || source["Academic Year"]),
  regulation: text(source.regulation || source.Regulation),
  program: text(source.program || source.Program),
  programcode: text(source.programcode || source.programCode || source["Program Code"]),
  faculty: text(source.faculty || source.facultyname || source.facultyName || source.Faculty),
  facultyemail: text(source.facultyemail || source.facultyEmail || source["Faculty Email"]),
  course: text(source.course || source.Course),
  coursecode: text(source.coursecode || source.courseCode || source["Course Code"]),
  typeofwork: text(source.typeofwork || source.typeOfWork || source["Type of Work"]) || "Class",
  description: text(source.description || source.Description),
  dateofwork: text(source.dateofwork || source.dateOfWork || source["Date of Work"]),
  outcome: text(source.outcome || source.Outcome),
  colid: toNumber(source.colid),
  user: text(source.user)
});

const validatePayload = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.regulation) return "Regulation is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.faculty) return "Faculty is required";
  if (!payload.facultyemail) return "Faculty email is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  if (!["Assessment", "Class"].includes(payload.typeofwork)) return "Type of work must be Assessment or Class";
  if (!payload.dateofwork) return "Date of work is required";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  [
    "academicyear",
    "regulation",
    "program",
    "programcode",
    "faculty",
    "facultyemail",
    "course",
    "coursecode",
    "typeofwork",
    "dateofwork"
  ].forEach((field) => {
    if (!source[field]) return;
    if (field === "facultyemail") {
      query[field] = { $regex: `^${String(source[field]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
      return;
    }
    query[field] = source[field];
  });
  if (source.fromdate || source.todate) {
    query.dateofwork = {};
    if (source.fromdate) query.dateofwork.$gte = source.fromdate;
    if (source.todate) query.dateofwork.$lte = source.todate;
  }
  return query;
};

exports.getLogbook = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await FacultyLogbook.find(query).sort({ dateofwork: -1, academicyear: 1, course: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveLogbook = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await FacultyLogbook.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await FacultyLogbook.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Logbook entry not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteLogbook = async (req, res) => {
  try {
    const data = await FacultyLogbook.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Logbook entry not found" });
    res.json({ success: true, message: "Logbook entry deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkLogbook = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });
    const errors = [];
    const valid = [];
    items.forEach((row, index) => {
      const payload = cleanPayload({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validatePayload(payload);
      if (error) errors.push({ rowNumber: row.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });
    if (valid.length) await FacultyLogbook.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
