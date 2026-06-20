const WorkloadAssignment = require("../Models/workloadassignmentds");
const User = require("../Models/user");
const NepLmsClassGroup = require("../Models/neplmsclassgroupds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactRegex = (value) => new RegExp(`^${escRegex(value)}$`, "i");

const studentSelect = "name email phone regno academicyear admissionyear program programcode regulation Major Minor semester section category gender department colid";

exports.getClassGroupUsers = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, role: { $nin: [/^Student$/i, /^Alumni$/i] } };
    if (req.query.search) {
      const value = escRegex(req.query.search);
      query.$or = [
        { name: new RegExp(value, "i") },
        { email: new RegExp(value, "i") },
        { department: new RegExp(value, "i") }
      ];
    }
    const data = await User.find(query)
      .select("name email phone department designation role colid")
      .sort({ name: 1, email: 1 })
      .limit(500)
      .lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFacultyCourses = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const facultyemail = text(req.query.facultyemail || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!facultyemail) return res.status(400).json({ success: false, message: "faculty email is required" });

    const query = {
      colid,
      facultyemail: exactRegex(facultyemail),
      status: /^Active$/i
    };
    ["academicyear", "semester"].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });

    const data = await WorkloadAssignment.find(query)
      .sort({ academicyear: -1, semester: 1, program: 1, course: 1 })
      .lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentsForCourse = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = {
      colid,
      role: /^Student$/i,
      status: 1
    };
    if (req.query.academicyear) {
      const year = text(req.query.academicyear);
      query.$or = [{ academicyear: year }, { admissionyear: year }];
    }
    if (req.query.regulation) query.regulation = text(req.query.regulation);
    if (req.query.programcode) query.programcode = text(req.query.programcode);
    if (req.query.semester) query.semester = text(req.query.semester);
    if (req.query.section) query.section = text(req.query.section);

    if (text(req.query.unassigned).toLowerCase() === "true") {
      const assignedQuery = { colid };
      ["academicyear", "regulation", "programcode", "semester", "coursecode", "facultyemail"].forEach((field) => {
        if (req.query[field]) assignedQuery[field] = text(req.query[field]);
      });
      const assignedRows = await NepLmsClassGroup.find(assignedQuery).select("regno").lean();
      const assignedRegnos = [...new Set(assignedRows.map((row) => text(row.regno)).filter(Boolean))];
      if (assignedRegnos.length) query.regno = { $nin: assignedRegnos };
    }

    const data = await User.find(query)
      .select(studentSelect)
      .sort({ name: 1, regno: 1 })
      .lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSectionsForCourse = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = {
      colid,
      role: /^Student$/i,
      status: 1
    };
    if (req.query.academicyear) {
      const year = text(req.query.academicyear);
      query.$or = [{ academicyear: year }, { admissionyear: year }];
    }
    if (req.query.regulation) query.regulation = text(req.query.regulation);
    if (req.query.programcode) query.programcode = text(req.query.programcode);
    if (req.query.semester) query.semester = text(req.query.semester);
    const rows = await User.find(query).select("section").lean();
    const sections = [...new Set(rows.map((row) => text(row.section)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    res.json({ success: true, data: sections });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createClassGroup = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const course = req.body.course || {};
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    const groupname = text(req.body.groupname);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!groupname) return res.status(400).json({ success: false, message: "Group name is required" });
    if (!course.coursecode) return res.status(400).json({ success: false, message: "Course is required" });
    if (!students.length) return res.status(400).json({ success: false, message: "Select at least one student" });

    const saved = [];
    for (const item of students) {
      const payload = {
        groupname,
        academicyear: text(course.academicyear),
        regulation: text(course.regulation),
        program: text(course.program),
        programcode: text(course.programcode),
        type: text(course.type),
        subject: text(course.subject),
        semester: text(course.semester),
        course: text(course.course),
        coursecode: text(course.coursecode),
        facultyname: text(course.facultyname),
        facultyemail: text(course.facultyemail || req.body.facultyemail),
        studentid: item._id || item.studentid,
        student: text(item.name || item.student),
        studentemail: text(item.email || item.studentemail),
        studentphone: text(item.phone || item.studentphone),
        regno: text(item.regno),
        section: text(item.section),
        category: text(item.category),
        gender: text(item.gender),
        colid,
        user: text(req.body.user)
      };
      if (!payload.student || !payload.regno) continue;
      const row = await NepLmsClassGroup.findOneAndUpdate(
        {
          colid,
          academicyear: payload.academicyear,
          regulation: payload.regulation,
          programcode: payload.programcode,
          semester: payload.semester,
          coursecode: payload.coursecode,
          facultyemail: payload.facultyemail,
          groupname,
          regno: payload.regno
        },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(row);
    }
    res.json({ success: true, saved: saved.length, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getClassGroups = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    [
      "academicyear",
      "regulation",
      "programcode",
      "semester",
      "coursecode",
      "facultyemail",
      "groupname",
      "regno",
      "section"
    ].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });
    const data = await NepLmsClassGroup.find(query).sort({ academicyear: -1, semester: 1, course: 1, groupname: 1, student: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteClassGroupStudents = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select students to delete" });
    const result = await NepLmsClassGroup.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
