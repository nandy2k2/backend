const XLSX = require("xlsx");
const multer = require("multer");
const Course = require("../Models/trainingplacementcourseds");
const Event = require("../Models/trainingplacementeventds");
const GuestFaculty = require("../Models/trainingplacementguestfacultyds");
const TrainingStudent = require("../Models/trainingplacementstudentds");
const User = require("../Models/user");
const FinalMarks = require("../Models/neplmsfinalmarksds");
const VivaMarks = require("../Models/examinationmodel2vivamarksds");
const Internship = require("../Models/placementnewinternshipprofileds");
const SipStudent = require("../Models/placementnewsipstudentds");
const MentoringSession = require("../Models/mentoringsessionds");
const HomeVisit = require("../Models/mentoringhomevisitds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const geminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];
const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const modelMap = {
  course: {
    Model: Course,
    fields: ["academicyear", "coursecode", "coursename", "category", "level", "duration", "mode", "description", "objectives", "skillscovered", "startdate", "enddate", "status"]
  },
  event: {
    Model: Event,
    fields: ["academicyear", "eventname", "eventcode", "eventtype", "courseid", "coursecode", "coursename", "startdate", "enddate", "venue", "mode", "meetinglink", "description", "outcome", "status"]
  },
  guestfaculty: {
    Model: GuestFaculty,
    fields: ["courseid", "coursecode", "coursename", "facultyname", "facultyemail", "phone", "organization", "designation", "expertise", "sessiontopic", "sessiondate", "honorarium", "remarks", "status"]
  },
  student: {
    Model: TrainingStudent,
    fields: ["courseid", "eventid", "coursecode", "coursename", "eventcode", "eventname", "academicyear", "regulation", "program", "programcode", "semester", "section", "student", "studentemail", "regno", "phone", "assignmentdate", "completionstatus", "score", "feedback", "remarks", "status"]
  }
};

const payloadFor = (kind, body = {}) => {
  const config = modelMap[kind];
  const payload = { colid: num(body.colid), user: text(body.user) };
  config.fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) payload[field] = body[field];
  });
  ["honorarium", "score"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) payload[field] = num(payload[field]);
  });
  return payload;
};

const buildUserFilter = (body = {}) => {
  const filter = { colid: num(body.colid), role: /^Student$/i };
  const exactFields = ["academicyear", "regulation", "program", "programcode", "semester", "section", "gender", "category", "Major", "Minor", "IDC", "specialization1", "specialization2"];
  exactFields.forEach((field) => {
    if (text(body[field])) filter[field] = text(body[field]);
  });
  if (Array.isArray(body.dynamicFilters)) {
    body.dynamicFilters.forEach((item) => {
      const field = text(item.field);
      const value = text(item.value);
      if (!field || !value || field.includes("$") || field.includes(".")) return;
      filter[field] = item.operator === "equals" ? value : regex(value);
    });
  }
  if (text(body.search)) {
    const q = regex(body.search);
    filter.$or = [{ name: q }, { email: q }, { phone: q }, { regno: q }, { program: q }, { programcode: q }];
  }
  return filter;
};

const getGemini = async (colid) =>
  (await AiConfiguration.findOne({ colid: num(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()) ||
  (await AiConfiguration.findOne({ colid: num(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean());

const callGemini = async (colid, prompt, model = "gemini-2.5-flash") => {
  const config = await getGemini(colid);
  if (!config?.apikey) throw new Error("Gemini API key is not configured");
  const models = [...new Set([text(model), ...geminiModels].filter(Boolean))];
  let lastError = "";
  for (const geminiModel of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    if (response.ok) return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data?.error?.message || "Gemini request failed";
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllama = async (colid, prompt, configId) => {
  const query = { colid: num(colid), active: /^yes$/i };
  const config = configId
    ? await OllamaConfiguration.findOne({ ...query, _id: configId }).lean()
    : (await OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean()) || (await OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean());
  if (!config) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${text(config.serveraddress).replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Ollama request failed");
  return data.response || "";
};

const fallbackAnalysis = ({ student, finalMarks, vivaMarks, training }) => {
  const allMarks = [...finalMarks.map((m) => num(m.total)), ...vivaMarks.map((m) => num(m.overallpercentage))].filter((m) => m > 0);
  const avg = allMarks.length ? allMarks.reduce((a, b) => a + b, 0) / allMarks.length : 0;
  const failed = [...finalMarks.filter((m) => /^fail$/i.test(text(m.passstatus))), ...vivaMarks.filter((m) => /^fail$/i.test(text(m.status)))];
  const completedTraining = training.filter((row) => /^completed$/i.test(text(row.completionstatus))).length;
  const needs = [];
  if (avg && avg < 60) needs.push("Foundation academic reinforcement and concept revision.");
  if (failed.length) needs.push(`Backlog-focused support in ${uniqueSorted(failed.map((m) => m.course || m.coursecode)).slice(0, 5).join(", ")}.`);
  if (!text(student.skills)) needs.push("Skill profile is empty; collect and validate employability skills.");
  if (completedTraining < 2) needs.push("Structured employability training exposure is low.");
  if (!needs.length) needs.push("Student appears ready for advanced placement grooming and interview practice.");
  return [
    `Training need analysis for ${student.name || student.regno}`,
    "",
    `Academic average considered: ${avg ? avg.toFixed(2) : "Not enough marks data"}`,
    `Failed/backlog records: ${failed.length}`,
    `Completed training records: ${completedTraining}`,
    "",
    "Recommended focus:",
    ...needs.map((item) => `- ${item}`),
    "",
    "Suggested plan:",
    "- Aptitude and reasoning baseline test",
    "- Communication and interview readiness session",
    "- Domain-specific bridge course based on weak subjects",
    "- Resume, project presentation and mock interview"
  ].join("\n");
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [courses, events, users, ollamaConfigs] = await Promise.all([
      Course.find({ colid }).sort({ coursename: 1 }).lean(),
      Event.find({ colid }).sort({ startdate: -1, eventname: 1 }).lean(),
      User.find({ colid }).select("name email phone regno role academicyear regulation program programcode semester section gender category Major Minor IDC skills photo").sort({ name: 1 }).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
    ]);
    res.json({
      success: true,
      courses,
      events,
      students: users.filter((item) => /^student$/i.test(text(item.role))),
      users,
      academicyears: uniqueSorted(users.map((item) => item.academicyear)),
      programs: uniqueSorted(users.map((item) => item.program)),
      programcodes: uniqueSorted(users.map((item) => item.programcode)),
      semesters: uniqueSorted(users.map((item) => item.semester)),
      sections: uniqueSorted(users.map((item) => item.section)),
      ollamaConfigs,
      geminiModels
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const config = modelMap[req.params.kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid module" });
    const filter = { colid: num(req.query.colid) };
    config.fields.forEach((field) => {
      if (text(req.query[field])) filter[field] = regex(req.query[field]);
    });
    const data = await config.Model.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const config = modelMap[req.params.kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid module" });
    const payload = payloadFor(req.params.kind, req.body);
    const data = req.body.id
      ? await config.Model.findOneAndUpdate({ _id: req.body.id, colid: num(req.body.colid) }, payload, { new: true, runValidators: true })
      : await config.Model.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const config = modelMap[req.params.kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid module" });
    await config.Model.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const config = modelMap[req.params.kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid module" });
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    await config.Model.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const config = modelMap[req.params.kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid module" });
    const rows = XLSX.utils.sheet_to_json(XLSX.read(req.file.buffer, { type: "buffer" }).Sheets[XLSX.read(req.file.buffer, { type: "buffer" }).SheetNames[0]], { defval: "" });
    const payload = rows.map((row) => payloadFor(req.params.kind, { ...row, colid: req.body.colid, user: req.body.user }));
    const data = await config.Model.insertMany(payload, { ordered: false });
    res.json({ success: true, inserted: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const data = await User.find(buildUserFilter(req.body)).select("-password").sort({ name: 1 }).limit(2000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignStudents = async (req, res) => {
  try {
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    const course = req.body.course || {};
    const event = req.body.event || {};
    const rows = students.map((student) => ({
      colid: num(req.body.colid),
      user: text(req.body.user),
      courseid: course._id,
      eventid: event._id,
      coursecode: text(course.coursecode),
      coursename: text(course.coursename),
      eventcode: text(event.eventcode),
      eventname: text(event.eventname),
      academicyear: text(student.academicyear),
      regulation: text(student.regulation),
      program: text(student.program),
      programcode: text(student.programcode),
      semester: text(student.semester),
      section: text(student.section),
      student: text(student.name),
      studentemail: text(student.email),
      regno: text(student.regno),
      phone: text(student.phone),
      assignmentdate: new Date().toISOString().slice(0, 10),
      completionstatus: "Assigned",
      status: "Active"
    }));
    if (rows.length) await TrainingStudent.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.analyzeStudent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const student = await User.findOne({ _id: req.body.studentid, colid }).select("-password").lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const [finalMarks, vivaMarks, internships, sip, training, mentoring, homeVisits] = await Promise.all([
      FinalMarks.find({ colid, regno: student.regno }).sort({ academicyear: 1, semester: 1 }).lean(),
      VivaMarks.find({ colid, regno: student.regno }).sort({ academicyear: 1, semester: 1 }).lean(),
      Internship.find({ colid, regno: student.regno }).lean(),
      SipStudent.find({ colid, regno: student.regno }).lean(),
      TrainingStudent.find({ colid, regno: student.regno }).lean(),
      MentoringSession.find({ colid, regno: student.regno }).sort({ activitydate: -1 }).limit(25).lean(),
      HomeVisit.find({ colid, regno: student.regno }).sort({ activitydate: -1 }).limit(25).lean()
    ]);
    const context = { student, finalMarks, vivaMarks, internships, sip, training, mentoring, homeVisits };
    const prompt = [
      "You are a training and placement advisor. Analyze the following student data and identify extra training needs.",
      "Return a practical report with: academic risk, employability gaps, communication/soft-skill needs, domain training needs, certifications recommended, placement readiness score out of 100, and a 30/60/90 day action plan.",
      req.body.prompt ? `Additional rules from user: ${text(req.body.prompt)}` : "",
      `Student data JSON: ${JSON.stringify(context).slice(0, 45000)}`
    ].filter(Boolean).join("\n\n");
    let analysis = "";
    let provider = "Rule based";
    try {
      if (/^ollama$/i.test(text(req.body.provider))) {
        analysis = await callOllama(colid, prompt, req.body.ollamaConfigId);
        provider = "Ollama";
      } else {
        analysis = await callGemini(colid, prompt, req.body.geminiModel);
        provider = "Gemini";
      }
    } catch (aiError) {
      analysis = fallbackAnalysis(context);
      provider = `Rule based fallback (${aiError.message})`;
    }
    res.json({ success: true, data: { student, finalMarks, vivaMarks, internships, sip, training, mentoring, homeVisits, analysis, provider } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
