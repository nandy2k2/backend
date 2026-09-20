const WorkloadAssignment = require("../Models/workloadassignmentds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const RegulationSubject = require("../Models/regulationsubjectds");
const Syllabus = require("../Models/syllabusds");
const User = require("../Models/user");
const DesignationWorkloadHours = require("../Models/designationworkloadhoursds");

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const text = (value) => String(value || "").trim();
const list = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(",").map(text).filter(Boolean);
};

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
  modules: list(input.modules || input.module || input.Module),
  module: list(input.modules || input.module || input.Module).join(", "),
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
    "module",
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

const nonStudentUserQuery = (source = {}) => {
  const query = {
    colid: toNumber(source.colid),
    role: { $not: /^student$/i },
    excluded: { $ne: "Yes" }
  };
  ["role", "department", "designation", "institution", "faculty"].forEach((field) => {
    const value = text(source[`user_${field}`] || source[field]);
    if (value) query[field] = value;
  });
  return query;
};

const courseMapQuery = (source = {}) => {
  const query = { colid: toNumber(source.colid) };
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
    "faculty",
    "institution",
    "department",
    "status"
  ].forEach((field) => {
    const value = text(source[`course_${field}`] || source[field]);
    if (value) query[field] = value;
  });
  return query;
};

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

    const syllabusQuery = { colid };
    ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester", "course", "coursecode"].forEach((field) => {
      if (text(req.query[field])) syllabusQuery[field] = text(req.query[field]);
    });

    const [courseMaps, regulationSubjects, faculty, assignments, syllabi] = await Promise.all([
      RegulationCourseMap.find(courseQuery).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1, semester: 1, course: 1 }).lean(),
      RegulationSubject.find(subjectQuery).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1 }).lean(),
      User.find(facultyQuery).select("name email department designation role colid").sort({ name: 1, email: 1 }).lean(),
      WorkloadAssignment.find({ colid }).sort({ facultyname: 1, academicyear: 1, course: 1 }).lean(),
      Syllabus.find(syllabusQuery).select("academicyear regulation program programcode type subject semester course coursecode module syllabus").sort({ module: 1, syllabus: 1 }).lean()
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
      modules: uniq(syllabi.map((item) => item.module)),
      syllabus: syllabi,
      departments: uniq([...faculty.map((item) => item.department), ...assignments.map((item) => item.facultydepartment)]),
      faculty: faculty.map((item) => ({
        _id: item._id,
        name: item.name || "",
        email: item.email || "",
        department: item.department || "",
        designation: item.designation || ""
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
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length) {
      const result = await WorkloadAssignment.deleteMany({ _id: { $in: ids } });
      return res.json({ success: true, message: "Records deleted", deleted: result.deletedCount || 0 });
    }
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

exports.getVisualWorkloadOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [courses, users] = await Promise.all([
      RegulationCourseMap.find({ colid }).select("academicyear regulation program programcode type subject semester course coursecode coursetype faculty institution department status credit credits hoursperweek workloadhours").lean(),
      User.find({ colid, role: { $not: /^student$/i }, excluded: { $ne: "Yes" } }).select("name email role department designation institution faculty").lean()
    ]);
    const courseFields = ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "coursetype", "faculty", "institution", "department", "status"];
    const userFields = ["role", "department", "designation", "institution", "faculty", "name", "email"];
    res.json({
      success: true,
      courseOptions: Object.fromEntries(courseFields.map((field) => [field, uniq(courses.map((row) => row[field]))])),
      userOptions: Object.fromEntries(userFields.map((field) => [field, uniq(users.map((row) => row[field]))]))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load visual workload options" });
  }
};

exports.searchVisualWorkload = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [courses, users, assignments] = await Promise.all([
      RegulationCourseMap.find(courseMapQuery(req.query))
        .select("academicyear regulation program programcode type subject semester course coursecode coursetype faculty institution department status credit credits hoursperweek workloadhours")
        .sort({ academicyear: 1, regulation: 1, program: 1, semester: 1, course: 1 })
        .limit(1000)
        .lean(),
      User.find(nonStudentUserQuery(req.query))
        .select("name email role department designation institution faculty")
        .sort({ name: 1, email: 1 })
        .limit(500)
        .lean(),
      WorkloadAssignment.find(buildQuery({ ...req.query, colid }))
        .sort({ facultyname: 1, academicyear: 1, semester: 1, course: 1 })
        .limit(1500)
        .lean()
    ]);
    res.json({ success: true, courses, users, assignments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load visual workload data" });
  }
};

exports.workloadDoctor = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const academicyear = text(req.query.academicyear);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!academicyear) return res.status(400).json({ success: false, message: "Academic year is required" });

    const [assignments, users, rules] = await Promise.all([
      WorkloadAssignment.find({ colid, academicyear, status: { $ne: "Inactive" } }).lean(),
      User.find({ colid, role: { $not: /^student$/i }, excluded: { $ne: "Yes" } }).select("name email role department designation").sort({ name: 1 }).lean(),
      DesignationWorkloadHours.find({ colid, status: { $ne: "Inactive" } }).lean()
    ]);

    const ruleFor = (programcode, designation) => {
      const d = text(designation).toLowerCase();
      const p = text(programcode).toLowerCase();
      const exact = rules.find((row) => text(row.programcode).toLowerCase() === p && (row.designations || []).some((item) => text(item).toLowerCase() === d));
      if (exact) return exact;
      return rules.find((row) => (row.designations || []).some((item) => text(item).toLowerCase() === d));
    };

    const assignmentByFaculty = new Map();
    assignments.forEach((row) => {
      const email = text(row.facultyemail).toLowerCase();
      if (!email) return;
      const listRows = assignmentByFaculty.get(email) || [];
      listRows.push(row);
      assignmentByFaculty.set(email, listRows);
    });

    const details = users.map((user) => {
      const facultyAssignments = assignmentByFaculty.get(text(user.email).toLowerCase()) || [];
      const programcodes = [...new Set(facultyAssignments.map((row) => text(row.programcode)).filter(Boolean))];
      const rule = programcodes.map((programcode) => ruleFor(programcode, user.designation)).find(Boolean)
        || ruleFor("", user.designation);
      const assignedhours = facultyAssignments.reduce((sum, row) => sum + Number(row.hoursperweek || 0), 0);
      const expectedhours = Number(rule?.workloadhours || 0);
      const variance = assignedhours - expectedhours;
      const workloadstatus = !expectedhours ? "No rule" : variance === 0 ? "OK" : variance < 0 ? "Less" : "More";
      return {
        facultyname: user.name || "",
        facultyemail: user.email || "",
        role: user.role || "",
        department: user.department || "",
        designation: user.designation || "",
        assignedhours,
        expectedhours,
        variance,
        workloadstatus,
        programcodes: programcodes.join(", "),
        courses: facultyAssignments.length,
        courseDetails: facultyAssignments.map((row) => ({
          program: row.program,
          programcode: row.programcode,
          semester: row.semester,
          course: row.course,
          coursecode: row.coursecode,
          hoursperweek: row.hoursperweek
        }))
      };
    });

    const summary = {
      faculty: details.length,
      ok: details.filter((row) => row.workloadstatus === "OK").length,
      less: details.filter((row) => row.workloadstatus === "Less").length,
      more: details.filter((row) => row.workloadstatus === "More").length,
      norule: details.filter((row) => row.workloadstatus === "No rule").length,
      assignedhours: details.reduce((sum, row) => sum + row.assignedhours, 0),
      expectedhours: details.reduce((sum, row) => sum + row.expectedhours, 0)
    };

    res.json({ success: true, summary, data: details, rules, assignments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to run workload doctor" });
  }
};
