const MindMap = require("../Models/neplmsmindmapds");
const User = require("../Models/user");

const text = (value) => String(value || "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const cleanPayload = (source = {}) => ({
  title: text(source.title) || "Untitled Mind Map",
  description: text(source.description),
  academicyear: text(source.academicyear),
  regulation: text(source.regulation),
  program: text(source.program),
  programcode: text(source.programcode),
  type: text(source.type),
  subject: text(source.subject || source.major),
  semester: text(source.semester),
  course: text(source.course),
  coursecode: text(source.coursecode),
  classid: text(source.classid || source.classId),
  classdate: text(source.classdate),
  classtime: text(source.classtime),
  faculty: text(source.faculty || source.facultyname),
  facultyemail: text(source.facultyemail),
  nodes: Array.isArray(source.nodes) ? source.nodes : [],
  edges: Array.isArray(source.edges) ? source.edges : [],
  status: text(source.status) || "Draft",
  published: text(source.published) || "No",
  colid: toNumber(source.colid),
  user: text(source.user)
});

const validate = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.semester) return "Semester is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  if (!payload.facultyemail) return "Faculty email is required";
  if (!payload.title) return "Title is required";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "facultyemail", "classid", "published", "status"].forEach((field) => {
    if (!text(source[field])) return;
    if (field === "facultyemail") {
      query[field] = { $regex: `^${text(source[field]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
      return;
    }
    query[field] = text(source[field]);
  });
  return query;
};

exports.getMindMaps = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await MindMap.find(query).sort({ updatedAt: -1, academicyear: 1, course: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentMindMaps = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const regno = text(req.query.regno);
    const email = text(req.query.email || req.query.user);
    const student = await User.findOne({
      colid,
      role: { $regex: /^student$/i },
      ...(regno ? { regno } : email ? { email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } } : {})
    }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const query = {
      colid,
      published: "Yes",
      academicyear: student.academicyear || student.academicyear1 || "",
      programcode: student.programcode || "",
      semester: student.semester || ""
    };
    if (!query.academicyear) delete query.academicyear;
    if (!query.programcode) delete query.programcode;
    if (!query.semester) delete query.semester;
    if (text(req.query.coursecode)) query.coursecode = text(req.query.coursecode);
    const data = await MindMap.find(query).sort({ course: 1, title: 1 }).lean();
    res.json({ success: true, student, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveMindMap = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    if (payload.published === "Yes" || payload.status === "Published") {
      payload.published = "Yes";
      payload.status = "Published";
      payload.publisheddate = new Date();
    }
    const data = req.body.id
      ? await MindMap.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await MindMap.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Mind map not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMindMap = async (req, res) => {
  try {
    const data = await MindMap.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Mind map not found" });
    res.json({ success: true, message: "Mind map deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
