const SpecializationNew = require("../Models/specializationnewds");
const SpecializationNewCourse = require("../Models/specializationnewcourseds");
const SpecializationNewStudent = require("../Models/specializationnewstudentds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const User = require("../Models/user");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (rows, field) => [...new Set(rows.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const regexText = (value) => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

const masterFields = ["academicyear", "regulation", "program", "programcode", "semester", "specialization", "status"];
const courseFields = ["academicyear", "regulation", "program", "programcode", "specialization", "type", "subject", "semester", "course", "coursecode", "status"];

const cleanFilter = (source = {}, fields = []) => {
  const filter = {};
  fields.forEach((field) => {
    if (source[field]) filter[field] = text(source[field]);
  });
  return filter;
};

const masterPayload = (body = {}) => ({
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  semester: text(body.semester),
  specialization: text(body.specialization),
  status: text(body.status) || "Active",
  colid: number(body.colid),
  user: text(body.user)
});

const coursePayload = (body = {}) => ({
  specializationid: body.specializationid || undefined,
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  specialization: text(body.specialization),
  type: text(body.type),
  subject: text(body.subject),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  status: text(body.status) || "Active",
  colid: number(body.colid),
  user: text(body.user)
});

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [courseMaps, specializations, courses, workloads] = await Promise.all([
      RegulationCourseMap.find({ colid }).sort({ academicyear: 1, regulation: 1, program: 1, course: 1 }).lean(),
      SpecializationNew.find({ colid }).sort({ academicyear: 1, regulation: 1, program: 1, specialization: 1 }).lean(),
      SpecializationNewCourse.find({ colid }).sort({ academicyear: 1, program: 1, specialization: 1, course: 1 }).lean(),
      WorkloadAssignment.find({ colid, status: /^Active$/i }).sort({ facultyname: 1, course: 1 }).lean()
    ]);
    res.json({
      success: true,
      courseMaps,
      specializations,
      courses,
      workloads,
      options: {
        academicyears: uniq([...courseMaps, ...specializations], "academicyear"),
        regulations: uniq([...courseMaps, ...specializations], "regulation"),
        programs: uniq([...courseMaps, ...specializations], "program"),
        programcodes: uniq([...courseMaps, ...specializations], "programcode"),
        semesters: uniq([...courseMaps, ...specializations], "semester"),
        specializations: uniq(specializations, "specialization"),
        statuses: ["Active", "Inactive"]
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await SpecializationNew.find({ colid, ...cleanFilter(req.query, masterFields) }).sort({ academicyear: 1, regulation: 1, program: 1, semester: 1, specialization: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = masterPayload(req.body);
    if (payload.colid === undefined || !payload.academicyear || !payload.regulation || !payload.programcode || !payload.semester || !payload.specialization) {
      return res.status(400).json({ success: false, message: "Academic year, regulation, program code, semester and specialization are required" });
    }
    const data = req.body.id
      ? await SpecializationNew.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await SpecializationNew.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Specialization not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await SpecializationNew.deleteMany({ _id: { $in: ids }, colid });
    await SpecializationNewCourse.deleteMany({ specializationid: { $in: ids }, colid });
    await SpecializationNewStudent.deleteMany({ specializationid: { $in: ids }, colid });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listCourses = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await SpecializationNewCourse.find({ colid, ...cleanFilter(req.query, courseFields) }).sort({ academicyear: 1, program: 1, specialization: 1, semester: 1, course: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveCourses = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const specialization = req.body.specializationRow || req.body.specialization || {};
    const courses = Array.isArray(req.body.courses) ? req.body.courses : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!courses.length) return res.status(400).json({ success: false, message: "Select at least one course" });
    const saved = [];
    for (const course of courses) {
      const payload = coursePayload({
        ...course,
        specializationid: specialization._id || req.body.specializationid,
        academicyear: specialization.academicyear || req.body.academicyear || course.academicyear,
        regulation: specialization.regulation || req.body.regulation || course.regulation,
        program: specialization.program || req.body.program || course.program,
        programcode: specialization.programcode || req.body.programcode || course.programcode,
        semester: specialization.semester || req.body.semester || course.semester,
        specialization: specialization.specialization || req.body.specialization,
        colid,
        user: req.body.user,
        status: course.status || "Active"
      });
      const data = await SpecializationNewCourse.findOneAndUpdate(
        { colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode, semester: payload.semester, specialization: payload.specialization, coursecode: payload.coursecode },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(data);
    }
    res.json({ success: true, saved: saved.length, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCourses = async (req, res) => {
  try {
    await SpecializationNewCourse.deleteMany({ _id: { $in: Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean) }, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.facultiesForCourse = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const query = { colid, status: /^Active$/i };
    ["academicyear", "regulation", "programcode", "semester", "coursecode"].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });
    const data = await WorkloadAssignment.find(query).sort({ facultyname: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentsForAttendance = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, status: /^Active$/i };
    ["academicyear", "regulation", "program", "programcode", "semester", "section", "specialization"].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });
    if (req.query.specializationid) query.specializationid = req.query.specializationid;
    const [students, attendanceRows] = await Promise.all([
      SpecializationNewStudent.find(query).sort({ rollno: 1, student: 1, regno: 1 }).lean(),
      req.query.classid ? NepLmsAttendance.find({ colid, classid: req.query.classid, type: text(req.query.type) || "Specialization" }).lean() : []
    ]);
    const attendanceByStudent = new Map(attendanceRows.map((row) => [String(row.studentid), row]));
    const data = students.map((row) => {
      const attendance = attendanceByStudent.get(String(row.studentid || row._id));
      return {
        _id: row.studentid || row._id,
        specializationstudentid: row._id,
        name: row.student,
        email: row.studentemail,
        phone: row.studentphone,
        regno: row.regno,
        rollno: row.rollno,
        academicyear: row.academicyear,
        regulation: row.regulation,
        program: row.program,
        programcode: row.programcode,
        semester: row.semester,
        section: row.section,
        specialization: row.specialization,
        existingAttendance: attendance?.attendance,
        attendanceId: attendance?._id,
        attendanceComments: attendance?.comments || ""
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, role: /^Student$/i };
    const filters = Array.isArray(req.body.filters) ? req.body.filters : [];
    filters.forEach((filter) => {
      if (!filter?.field || !filter.value) return;
      const field = filter.field === "student" ? "name" : filter.field;
      if (["academicyear", "regulation", "program", "programcode", "semester", "section", "name", "email", "regno", "rollno"].includes(field)) {
        query[field] = ["name", "email", "regno"].includes(field) ? new RegExp(text(filter.value), "i") : text(filter.value);
      }
    });
    const data = await User.find(query).select("name email phone regno rollno academicyear regulation program programcode semester section colid").sort({ rollno: 1, name: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAssignedStudents = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await SpecializationNewStudent.find({ colid, ...cleanFilter(req.query, ["academicyear", "regulation", "program", "programcode", "semester", "section", "specialization", "status"]) }).sort({ academicyear: 1, programcode: 1, semester: 1, specialization: 1, rollno: 1, student: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignStudents = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const specialization = req.body.specializationRow || {};
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!specialization._id) return res.status(400).json({ success: false, message: "Select specialization" });
    if (!students.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    let saved = 0;
    for (const student of students) {
      const payload = {
        specializationid: specialization._id,
        studentid: student._id || student.studentid,
        academicyear: text(specialization.academicyear),
        regulation: text(specialization.regulation),
        program: text(specialization.program),
        programcode: text(specialization.programcode),
        semester: text(specialization.semester),
        section: text(student.section),
        specialization: text(specialization.specialization),
        student: text(student.name || student.student),
        studentemail: text(student.email || student.studentemail),
        studentphone: text(student.phone || student.studentphone),
        regno: text(student.regno),
        rollno: text(student.rollno),
        status: "Active",
        colid,
        user: text(req.body.user)
      };
      if (!payload.studentid) continue;
      await SpecializationNewStudent.findOneAndUpdate(
        { colid, specializationid: payload.specializationid, studentid: payload.studentid },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAssignedStudents = async (req, res) => {
  try {
    await SpecializationNewStudent.deleteMany({ _id: { $in: Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean) }, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.classes = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid, ...cleanFilter(req.query, ["academicyear", "regulation", "program", "programcode", "semester", "specialization", "course", "coursecode", "facultyemail", "status"]) };
    const data = await NepLmsTimetable.find(filter).sort({ classdate: 1, classtime: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
