const RegulationCourseMap = require("../Models/regulationcoursemapds");
const RegulationMaster = require("../Models/regulationmasterds");
const MPrograms = require("../Models/mprograms");
const RegulationSubject = require("../Models/regulationsubjectds");

const allowedTypes = new Set(["Major", "Minor", "AEC", "SEC", "VAC", "IDC"]);
const allowedCourseTypes = new Set(["Theory", "Practical", "Tutorial", "Internship", "Project", "Experiential learning"]);
const allowedDeliveryTypes = new Set(["Compulsory", "Elective"]);

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const text = (value) => String(value || "").trim();
const normalizeCourseType = (value) => {
  const item = text(value);
  if (/^tutotial$/i.test(item)) return "Tutorial";
  return item;
};

const cleanPayload = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear),
  regulation: text(input.regulation),
  subject: text(input.subject),
  type: allowedTypes.has(input.type) ? input.type : "",
  semester: text(input.semester),
  program: text(input.program),
  programcode: text(input.programcode),
  course: text(input.course),
  coursecode: text(input.coursecode),
  coursetype: allowedCourseTypes.has(normalizeCourseType(input.coursetype || input.courseType)) ? normalizeCourseType(input.coursetype || input.courseType) : "Theory",
  deliverytype: allowedDeliveryTypes.has(text(input.deliverytype || input.deliveryType || input["Delivery Type"])) ? text(input.deliverytype || input.deliveryType || input["Delivery Type"]) : "Compulsory",
  coursemastercode: text(input.coursemastercode || input.courseMasterCode),
  credit: toNumber(input.credit) || 0,
  colid: toNumber(input.colid),
  user: text(input.user),
  status: text(input.status) || "Active"
});

const validatePayload = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.regulation) return "Regulation is required";
  if (!payload.type) return "Type is required";
  if (!payload.subject) return "Subject is required";
  if (!payload.semester) return "Semester is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "regulation", "subject", "type", "semester", "programcode", "program", "coursecode", "coursetype", "deliverytype", "coursemastercode", "status"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

exports.createRegulationCourseMap = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await RegulationCourseMap.create(payload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRegulationCourseMaps = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await RegulationCourseMap.find(query).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1, semester: 1, course: 1 });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateRegulationCourseMap = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await RegulationCourseMap.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRegulationCourseMap = async (req, res) => {
  try {
    const data = await RegulationCourseMap.findByIdAndDelete(req.body.id);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Record deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDeleteRegulationCourseMaps = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select records to delete" });
    const query = { _id: { $in: ids } };
    const colid = toNumber(req.body.colid);
    if (colid !== undefined) query.colid = colid;
    const result = await RegulationCourseMap.deleteMany(query);
    res.json({ success: true, deleted: result.deletedCount || 0, message: "Selected records deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkCreateRegulationCourseMaps = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });

    const errors = [];
    const valid = [];
    items.forEach((item, index) => {
      const payload = cleanPayload({ ...item, colid: req.body.colid || item.colid, user: req.body.user || item.user });
      const error = validatePayload(payload);
      if (error) errors.push({ rowNumber: item.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });

    if (valid.length) await RegulationCourseMap.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRegulationCourseMapOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const subjectQuery = { colid };
    if (req.query.type) subjectQuery.type = req.query.type;
    if (req.query.academicyear) subjectQuery.academicyear = req.query.academicyear;
    if (req.query.regulation) subjectQuery.regulation = req.query.regulation;
    if (req.query.programcode) subjectQuery.programcode = req.query.programcode;
    if (req.query.status) subjectQuery.status = req.query.status;

    const [regulations, programs, subjects] = await Promise.all([
      RegulationMaster.find({ colid, isactive: "Yes" }).sort({ regulation: 1 }).lean(),
      MPrograms.find({ colid }).sort({ program: 1, programcode: 1 }).lean(),
      RegulationSubject.distinct("subject", subjectQuery)
    ]);

    res.json({
      success: true,
      regulations,
      programs: programs.map((item) => ({
        _id: item._id,
        program: item.program || item.name || "",
        programcode: item.programcode || "",
        type: item.type || "",
        year: item.year || ""
      })),
      subjects: subjects.map((item) => text(item)).filter(Boolean).sort((a, b) => a.localeCompare(b))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
