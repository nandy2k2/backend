const EnrollmentGroup = require("../Models/neplmsenrollmentgroupds");
const EnrollmentStudent = require("../Models/neplmsenrollmentgroupstudentds");
const EnrollmentWorkload = require("../Models/neplmsenrollmentworkloadds");
const User = require("../Models/user");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (value) => new RegExp(`^${esc(value)}$`, "i");

const filterFrom = (source = {}) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  ["academicyear", "regulation", "groupname", "status", "program", "programcode", "semester", "section", "facultyemail", "regno"].forEach((field) => {
    if (source[field]) filter[field] = new RegExp(esc(source[field]), "i");
  });
  if (source.groupid) filter.groupid = source.groupid;
  return filter;
};

exports.listGroups = async (req, res) => {
  try {
    const data = await EnrollmentGroup.find(filterFrom(req.query)).sort({ academicyear: -1, groupname: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveGroup = async (req, res) => {
  try {
    const payload = {
      colid: number(req.body.colid),
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      section: text(req.body.section),
      groupname: text(req.body.groupname),
      description: text(req.body.description),
      status: text(req.body.status) || "Active",
      user: text(req.body.user)
    };
    if (!payload.colid || !payload.groupname) return res.status(400).json({ success: false, message: "Group name is required" });
    const data = req.body.id || req.body._id
      ? await EnrollmentGroup.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: payload.colid }, payload, { new: true })
      : await EnrollmentGroup.findOneAndUpdate({ colid: payload.colid, groupname: payload.groupname }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteGroups = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await Promise.all([
      EnrollmentGroup.deleteMany({ _id: { $in: ids }, colid: number(req.body.colid) }),
      EnrollmentStudent.deleteMany({ groupid: { $in: ids }, colid: number(req.body.colid) }),
      EnrollmentWorkload.deleteMany({ groupid: { $in: ids }, colid: number(req.body.colid) })
    ]);
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = number(req.body.colid || req.query.colid);
    const query = { colid, role: /^Student$/i };
    const filters = Array.isArray(req.body.filters) ? req.body.filters : [];
    filters.forEach((item) => {
      if (!item.field || !text(item.value)) return;
      const field = item.field === "major" ? "Major" : item.field;
      query[field] = new RegExp(esc(item.value), "i");
    });
    const data = await User.find(query)
      .select("name email phone regno rollno academicyear admissionyear regulation program programcode semester section Major role colid")
      .sort({ name: 1, regno: 1 })
      .limit(Number(req.body.limit || 1000))
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addStudents = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const group = await EnrollmentGroup.findOne({ _id: req.body.groupid, colid }).lean();
    if (!group) return res.status(404).json({ success: false, message: "Enrollment group not found" });
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    let saved = 0;
    for (const item of students) {
      const payload = {
        colid,
        groupid: group._id,
        groupname: group.groupname,
        studentid: item._id || item.studentid,
        student: text(item.name || item.student),
        studentemail: text(item.email || item.studentemail),
        studentphone: text(item.phone || item.studentphone),
        regno: text(item.regno),
        rollno: text(item.rollno),
        academicyear: text(item.academicyear || item.admissionyear),
        regulation: text(item.regulation),
        program: text(item.program),
        programcode: text(item.programcode),
        semester: text(item.semester),
        section: text(item.section),
        major: text(item.Major || item.major),
        status: "Active",
        user: text(req.body.user)
      };
      if (!payload.regno && !payload.studentemail) continue;
      await EnrollmentStudent.findOneAndUpdate(
        { colid, groupid: group._id, $or: [{ regno: payload.regno }, { studentemail: payload.studentemail }].filter((entry) => Object.values(entry)[0]) },
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

exports.listStudents = async (req, res) => {
  try {
    const data = await EnrollmentStudent.find(filterFrom(req.query)).sort({ groupname: 1, student: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteStudents = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await EnrollmentStudent.deleteMany({ _id: { $in: ids }, colid: number(req.body.colid) });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveWorkload = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const group = await EnrollmentGroup.findOne({ _id: req.body.groupid, colid }).lean();
    if (!group) return res.status(404).json({ success: false, message: "Enrollment group not found" });
    const faculties = Array.isArray(req.body.faculties) ? req.body.faculties : [];
    let saved = 0;
    for (const faculty of faculties) {
      const email = text(faculty.email || faculty.user || faculty.facultyemail);
      if (!email) continue;
      await EnrollmentWorkload.findOneAndUpdate(
        { colid, groupid: group._id, facultyemail: email },
        {
          colid,
          groupid: group._id,
          groupname: group.groupname,
          faculty: text(faculty.name || faculty.faculty),
          facultyemail: email,
          status: "Active",
          user: text(req.body.user)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listWorkload = async (req, res) => {
  try {
    const data = await EnrollmentWorkload.find(filterFrom(req.query)).sort({ groupname: 1, faculty: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteWorkload = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await EnrollmentWorkload.deleteMany({ _id: { $in: ids }, colid: number(req.body.colid) });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignedGroups = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const email = text(req.query.facultyemail || req.query.user);
    const data = await EnrollmentWorkload.find({ colid, facultyemail: exact(email), status: /^Active$/i }).sort({ groupname: 1 }).lean();
    const groupIds = data.map((row) => row.groupid).filter(Boolean);
    const groups = await EnrollmentGroup.find({ colid, _id: { $in: groupIds } }).lean();
    const groupMap = new Map(groups.map((group) => [String(group._id), group]));
    res.json({
      success: true,
      data: data.map((row) => ({
        ...row,
        ...(groupMap.get(String(row.groupid)) || {}),
        workloadid: row._id,
        _id: row._id,
        groupid: row.groupid
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const [groups, users] = await Promise.all([
      EnrollmentGroup.find({ colid }).sort({ groupname: 1 }).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email user role department").sort({ name: 1 }).lean()
    ]);
    res.json({ success: true, groups, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
