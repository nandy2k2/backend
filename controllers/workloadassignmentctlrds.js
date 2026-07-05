const WorkloadAssignment = require("../Models/workloadassignmentds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const RegulationSubject = require("../Models/regulationsubjectds");
const User = require("../Models/user");

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const text = (value) => String(value || "").trim();

const numeric = (value) => {
  const parsed = toNumber(value);
  return parsed === undefined ? 0 : parsed;
};

const cleanPayload = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear),
  regulation: text(input.regulation),
  program: text(input.program),
  programcode: text(input.programcode),
  type: text(input.type),
  subject: text(input.subject),
  semester: text(input.semester),
  course: text(input.course),
  coursecode: text(input.coursecode),
  coursetype: text(input.coursetype || input.courseType || input["Course Type"]),
  facultyname: text(input.facultyname || input.facultyName),
  facultyemail: text(input.facultyemail || input.facultyEmail),
  facultydepartment: text(input.facultydepartment || input.department || input.facultyDepartment),
  hoursperweek: numeric(input.hoursperweek || input.hoursPerWeek || input["hours per week"] || input.HoursPerWeek || input["Hours Per Week"]),
  status: text(input.status) || "Active",
  colid: toNumber(input.colid),
  user: text(input.user)
});

const validatePayload = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.regulation) return "Regulation is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.type) return "Type is required";
  if (!payload.subject) return "Subject is required";
  if (!payload.semester) return "Semester is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  if (!payload.facultyname) return "Faculty name is required";
  if (!payload.facultyemail) return "Faculty email is required";
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
    "type",
    "subject",
    "semester",
    "course",
    "coursecode",
    "coursetype",
    "facultyname",
    "facultyemail",
    "facultydepartment",
    "status"
  ].forEach((field) => {
    if (!source[field]) return;
    if (field === "facultyemail") {
      query[field] = { $regex: `^${String(source[field]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
      return;
    }
    query[field] = source[field];
  });
  return query;
};

const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

exports.getWorkloadAssignmentOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const courseQuery = { colid };
    ["academicyear", "regulation", "programcode", "type", "subject", "semester"].forEach((field) => {
      if (req.query[field]) courseQuery[field] = req.query[field];
    });

    const subjectQuery = { colid };
    ["academicyear", "regulation", "program", "programcode", "type"].forEach((field) => {
      if (req.query[field]) subjectQuery[field] = req.query[field];
    });
    if (req.query.status) subjectQuery.status = req.query.status;

    const facultyQuery = { colid, role: "Faculty" };
    if (req.query.department) facultyQuery.department = req.query.department;

    const [courseMaps, regulationSubjects, faculty, assignments] = await Promise.all([
      RegulationCourseMap.find(courseQuery).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1, semester: 1, course: 1 }).lean(),
      RegulationSubject.find(subjectQuery).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1 }).lean(),
      User.find(facultyQuery).select("name email department role colid").sort({ name: 1, email: 1 }).lean(),
      WorkloadAssignment.find({ colid }).sort({ facultyname: 1, academicyear: 1, course: 1 }).lean()
    ]);

    const allRows = [...courseMaps, ...assignments];
    const programMap = new Map();
    allRows.forEach((item) => {
      if (item.programcode) {
        programMap.set(item.programcode, {
          programcode: item.programcode,
          program: item.program || ""
        });
      }
    });

    const courseMap = new Map();
    courseMaps.forEach((item) => {
      if (item.coursecode) {
        courseMap.set(item.coursecode, {
          _id: item._id,
          academicyear: item.academicyear || "",
          regulation: item.regulation || "",
          program: item.program || "",
          programcode: item.programcode || "",
          type: item.type || "",
          subject: item.subject || "",
          semester: item.semester || "",
          course: item.course || "",
          coursecode: item.coursecode || "",
          coursetype: item.coursetype || ""
        });
      }
    });

    res.json({
      success: true,
      academicyears: uniq(allRows.map((item) => item.academicyear)),
      regulations: uniq(allRows.map((item) => item.regulation)),
      programs: [...programMap.values()].sort((a, b) => String(a.programcode).localeCompare(String(b.programcode))),
      types: uniq(allRows.map((item) => item.type)),
      subjects: uniq(regulationSubjects.map((item) => item.subject)),
      semesters: uniq(allRows.map((item) => item.semester)),
      courses: [...courseMap.values()].sort((a, b) => String(a.course).localeCompare(String(b.course))),
      departments: uniq([...faculty.map((item) => item.department), ...assignments.map((item) => item.facultydepartment)]),
      faculty: faculty.map((item) => ({
        _id: item._id,
        name: item.name || "",
        email: item.email || "",
        department: item.department || ""
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createWorkloadAssignment = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await WorkloadAssignment.create(payload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getWorkloadAssignments = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await WorkloadAssignment.find(query).sort({ facultyname: 1, academicyear: 1, regulation: 1, program: 1, subject: 1, semester: 1, course: 1 });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateWorkloadAssignment = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await WorkloadAssignment.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteWorkloadAssignment = async (req, res) => {
  try {
    const data = await WorkloadAssignment.findByIdAndDelete(req.body.id);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Record deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkCreateWorkloadAssignments = async (req, res) => {
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

    if (valid.length) await WorkloadAssignment.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
