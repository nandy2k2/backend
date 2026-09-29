const multer = require("multer");
const path = require("path");
const AWS = require("aws-sdk");
const OnlineExam2 = require("../Models/onlineexam2ds");
const OnlineExam2Attempt = require("../Models/onlineexam2attemptds");
const OnlineExam2Assignment = require("../Models/onlineexam2assignmentds");
const User = require("../Models/user");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const Syllabus = require("../Models/syllabusds");
const CourseOutcome = require("../Models/courseoutcomeds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Awsconfig = require("../Models/awsconfig");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = (arr) => [...new Set((arr || []).map(text).filter(Boolean))].sort();
const arr = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value) ? [text(value)] : [];
const staleDeviceSeconds = 75;
const geminiModels = ["gemini-3.5-pro", "gemini-3.0-pro", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;
const getAws = async (colid) => Awsconfig.findOne({ colid: num(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || Awsconfig.findOne({ colid: num(colid), type: /^aws$/i }).sort({ _id: -1 }).lean();

const ipOf = (req) => text(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip).split(",")[0];
const userAgentOf = (req) => text(req.headers["user-agent"]);

const contentBlocks = (blocks) => Array.isArray(blocks) ? blocks.map((block) => ({
  blocktype: text(block.blocktype || block.type),
  text: String(block.text || ""),
  tabledata: Array.isArray(block.tabledata) ? block.tabledata.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [],
  url: text(block.url),
  filename: text(block.filename),
  title: text(block.title),
  dataurl: String(block.dataurl || ""),
  color: text(block.color),
  brushsize: num(block.brushsize)
})).filter((block) => block.blocktype) : [];

const examPayload = (body = {}) => ({
  colid: num(body.colid),
  academicyear: text(body.academicyear),
  category: text(body.category),
  program: text(body.program),
  programcode: text(body.programcode),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  examname: text(body.examname),
  examcode: text(body.examcode || body.examname),
  durationminutes: Math.max(1, num(body.durationminutes, 60)),
  timezone: text(body.timezone || "UTC"),
  instructions: String(body.instructions || ""),
  status: text(body.status || "Draft"),
  allowseconddevice: /^yes$/i.test(text(body.allowseconddevice)) ? "Yes" : "No",
  user: text(body.user),
  username: text(body.username)
});

const dynamicQuery = (source = {}) => {
  const query = { colid: num(source.colid) };
  if (text(source.examid)) query.examid = text(source.examid);
  ["academicyear", "category", "program", "programcode", "semester", "section", "course", "coursecode", "examname", "examcode", "status", "student", "regno", "email"].forEach((field) => {
    if (text(source[field])) query[field] = { $regex: esc(source[field]), $options: "i" };
  });
  if (Array.isArray(source.dynamicFilters)) {
    source.dynamicFilters.forEach((filter) => {
      const field = text(filter.field);
      const value = text(filter.value);
      if (!field || field.includes("$") || !value) return;
      query[field] = /^equals$/i.test(text(filter.operator)) ? value : { $regex: esc(value), $options: "i" };
    });
  }
  return query;
};

const initialAnswers = (exam) => (exam.sections || []).flatMap((section) => (section.questions || []).map((q) => ({
  sectionid: String(section._id),
  sectionname: section.sectionname,
  questionid: String(q._id),
  questiontext: q.questiontext,
  questionhtml: q.questionhtml,
  mathematicalexpression: q.mathematicalexpression,
  tabledata: Array.isArray(q.tabledata) ? q.tabledata : [],
  drawingdataurl: q.drawingdataurl,
  imageurl: q.imageurl,
  imagefilename: q.imagefilename,
  fileurl: q.fileurl,
  filefilename: q.filefilename,
  linkurl: q.linkurl,
  attachments: Array.isArray(q.attachments) ? q.attachments : [],
  contentblocks: contentBlocks(q.contentblocks),
  questiontype: q.questiontype || section.sectiontype,
  maxmarks: num(q.marks),
  marksobtained: 0,
  gradingstatus: "Pending"
})));

const shuffleArray = (items = []) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const shuffledExamForAttempt = (exam = {}) => ({
  ...exam,
  sections: (exam.sections || []).map((section) => ({ ...section, questions: shuffleArray(section.questions || []) }))
});

const examWithAttemptQuestionOrder = (exam = {}, attempt = {}) => {
  const orderBySection = {};
  (attempt.answers || []).forEach((answer, index) => {
    const sectionid = text(answer.sectionid);
    if (!orderBySection[sectionid]) orderBySection[sectionid] = {};
    orderBySection[sectionid][text(answer.questionid)] = index;
  });
  return {
    ...exam,
    sections: (exam.sections || []).map((section) => {
      const sectionOrder = orderBySection[text(section._id)] || {};
      const questions = [...(section.questions || [])].sort((a, b) => {
        const aOrder = sectionOrder[text(a._id)];
        const bOrder = sectionOrder[text(b._id)];
        if (aOrder === undefined && bOrder === undefined) return num(a.order) - num(b.order);
        if (aOrder === undefined) return 1;
        if (bOrder === undefined) return -1;
        return aOrder - bOrder;
      });
      return { ...section, questions };
    })
  };
};

const remainingForAttempt = (exam, attempt) => {
  if (!attempt?.starttime) return Math.max(60, num(exam.durationminutes, 60) * 60);
  const elapsed = Math.floor((Date.now() - new Date(attempt.starttime).getTime()) / 1000);
  return Math.max(0, Math.max(60, num(exam.durationminutes, 60) * 60) - elapsed);
};

const assignedStudentQuery = (assignment) => {
  const query = { colid: assignment.colid, role: /^Student$/i };
  ["academicyear", "regulation", "program", "programcode", "semester", "section"].forEach((field) => {
    if (text(assignment[field])) query[field] = text(assignment[field]);
  });
  return query;
};

const isStudentAssigned = async (exam, student) => {
  const assignments = await OnlineExam2Assignment.find({ colid: exam.colid, examid: exam._id, status: /^Active$/i }).lean();
  if (!assignments.length) return false;
  return assignments.some((assignment) => {
    const fields = ["academicyear", "regulation", "program", "programcode", "semester", "section"];
    return fields.every((field) => !text(assignment[field]) || text(student[field]).toLowerCase() === text(assignment[field]).toLowerCase());
  });
};

const autoMcqMarks = (exam, attempt) => {
  const questionMap = {};
  (exam.sections || []).forEach((section) => (section.questions || []).forEach((question) => { questionMap[String(question._id)] = question; }));
  attempt.answers.forEach((answer) => {
    const question = questionMap[String(answer.questionid)];
    if (!question || !/^(mcq|fill in the blanks)$/i.test(answer.questiontype)) return;
    const selected = (question.options || []).find((option) => String(option._id) === text(answer.selectedoptionid) || text(option.optiontext) === text(answer.selectedoptiontext));
    answer.marksobtained = selected?.iscorrect ? num(answer.maxmarks) : 0;
    answer.gradingstatus = "Graded";
  });
};

const getGemini = async (colid) => AiConfiguration.findOne({ colid: num(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({ colid: num(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();

const callGemini = async (colid, prompt, model = "gemini-2.5-flash") => {
  const config = await getGemini(colid);
  if (!config?.apikey) throw new Error("Active Gemini configuration is missing");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25 } })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini request failed");
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
};

const callOllama = async (colid, prompt, id) => {
  const config = id
    ? await OllamaConfiguration.findOne({ _id: id, colid: num(colid), active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid: num(colid), active: /^yes$/i, default: /^yes$/i }).lean()
      || await OllamaConfiguration.findOne({ colid: num(colid), active: /^yes$/i }).lean();
  if (!config) throw new Error("Active Ollama configuration is missing");
  const base = text(config.serveraddress || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const parseJsonFromText = (raw) => {
  const cleaned = text(raw).replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch (_) {
    const match = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI did not return valid JSON");
  }
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [courses, users, exams, ollama] = await Promise.all([
      RegulationCourseMap.find({ colid }).select("academicyear regulation program programcode semester course coursecode").limit(5000).lean(),
      User.find({ colid, role: /^Student$/i }).select("name email regno academicyear regulation program programcode semester section").limit(5000).lean(),
      OnlineExam2.find({ colid }).select("academicyear category program programcode semester course coursecode examname examcode status").limit(3000).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
    ]);
    const all = [...courses, ...users, ...exams].filter(Boolean);
    res.json({
      success: true,
      academicyears: uniq(all.map((row) => row?.academicyear)),
      regulations: uniq(all.map((row) => row?.regulation)),
      programs: (courses || []).filter(Boolean),
      students: (users || []).filter(Boolean),
      exams: (exams || []).filter(Boolean),
      ollama,
      geminiModels
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.questionOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    ["academicyear", "program", "programcode", "course", "coursecode", "semester", "regulation"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    const [syllabus, outcomes] = await Promise.all([
      Syllabus.find(query).select("module syllabus").sort({ module: 1, syllabus: 1 }).lean(),
      CourseOutcome.find(query).select("conumber co bloomlevels").sort({ conumber: 1 }).lean()
    ]);
    res.json({
      success: true,
      modules: uniq(syllabus.map((row) => row.module)),
      topics: uniq(syllabus.map((row) => row.syllabus)),
      cos: uniq(outcomes.map((row) => row.conumber || row.co)),
      bloomlevels: uniq(outcomes.flatMap((row) => arr(row.bloomlevels)))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listExams = async (req, res) => {
  try {
    const query = dynamicQuery(req.query);
    const rows = await OnlineExam2.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveExam = async (req, res) => {
  try {
    const data = examPayload(req.body);
    if (!data.colid || !data.academicyear || !data.programcode || !data.coursecode || !data.examname) {
      return res.status(400).json({ success: false, message: "Academic year, program code, course code and exam name are required" });
    }
    const row = req.body.id
      ? await OnlineExam2.findOneAndUpdate({ _id: req.body.id, colid: data.colid }, data, { new: true })
      : await OnlineExam2.create(data);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    await OnlineExam2.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid) });
    await OnlineExam2Assignment.deleteMany({ examid: req.body.id, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveSection = async (req, res) => {
  try {
    const exam = await OnlineExam2.findOne({ _id: req.body.examid, colid: num(req.body.colid) });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const payload = {
      sectionname: text(req.body.sectionname),
      sectiontype: text(req.body.sectiontype || "MCQ"),
      instructions: text(req.body.instructions),
      order: num(req.body.order)
    };
    if (req.body.sectionid) Object.assign(exam.sections.id(req.body.sectionid), payload);
    else exam.sections.push(payload);
    await exam.save();
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveQuestion = async (req, res) => {
  try {
    const exam = await OnlineExam2.findOne({ _id: req.body.examid, colid: num(req.body.colid) });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const section = exam.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    const payload = {
      questiontext: text(req.body.questiontext),
      questionhtml: String(req.body.questionhtml || ""),
      mathematicalexpression: String(req.body.mathematicalexpression || ""),
      tabledata: Array.isArray(req.body.tabledata) ? req.body.tabledata.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [],
      drawingdataurl: String(req.body.drawingdataurl || ""),
      questiontype: text(req.body.questiontype || section.sectiontype),
      marks: num(req.body.marks, 1),
      modules: arr(req.body.modules || req.body.module),
      topics: arr(req.body.topics || req.body.topic),
      cos: arr(req.body.cos || req.body.co),
      bloomlevels: arr(req.body.bloomlevels || req.body.blooms),
      options: Array.isArray(req.body.options) ? req.body.options.map((o) => ({ optiontext: text(o.optiontext), iscorrect: !!o.iscorrect })).filter((o) => o.optiontext) : [],
      imageurl: text(req.body.imageurl),
      imagefilename: text(req.body.imagefilename),
      fileurl: text(req.body.fileurl),
      filefilename: text(req.body.filefilename),
      linkurl: text(req.body.linkurl),
      attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
      contentblocks: contentBlocks(req.body.contentblocks),
      order: num(req.body.order)
    };
    if (req.body.questionid) Object.assign(section.questions.id(req.body.questionid), payload);
    else section.questions.push(payload);
    await exam.save();
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const exam = await OnlineExam2.findOne({ _id: req.body.examid, colid: num(req.body.colid) });
    const section = exam?.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    section.questions.pull(req.body.questionid);
    await exam.save();
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select a file" });
    const colid = num(req.body.colid);
    const config = await getAws(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is missing" });
    }
    const cleanName = path.basename(req.file.originalname || "file").replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/online-exam-2/${text(req.body.context || "files")}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    res.json({ success: true, data: { label: cleanName, filename: cleanName, mimetype: req.file.mimetype, url: s3Url(config.bucket, config.region, key) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateQuestions = async (req, res) => {
  try {
    const modules = arr(req.body.modules || req.body.module);
    const topics = arr(req.body.topics || req.body.topic);
    const cos = arr(req.body.cos || req.body.co);
    const bloomlevels = arr(req.body.bloomlevels || req.body.blooms);
    const questiontype = text(req.body.questiontype || "MCQ");
    const prompt = `Return ONLY valid JSON array of questions for Online Examination 2.
Question type: ${questiontype}
Course: ${text(req.body.course)} (${text(req.body.coursecode)})
Selected modules: ${modules.join(", ") || "Not specified"}
Selected topics: ${topics.join(", ") || "Not specified"}
Selected COs: ${cos.join(", ") || "Not specified"}
Selected Bloom taxonomy levels: ${bloomlevels.join(", ") || "Not specified"}
Additional prompt: ${text(req.body.prompt)}
Uploaded source document URL, if any: ${text(req.body.sourcefileurl || req.body.sourceurl) || "Not provided"}
Number of questions: ${num(req.body.count, 5)}
Difficulty: ${text(req.body.difficulty || "Medium")}
Language: ${text(req.body.language || "English")}

If an uploaded source document URL is provided, generate questions from that source document and keep the syllabus/module/topic context aligned with it. If the model cannot access URLs, state that through the returned question context and still generate strictly from the selected module/topic and additional prompt.
Return fields for every question:
sectionname, questiontext, questionhtml, questiontype, marks, modules, topics, cos, bloomlevels, options, tabledata, order.

For MCQ, options must be [{"optiontext":"","iscorrect":true/false}] and exactly one option should be correct.
For Descriptive, options should be [].
For Table, include tabledata as a 2D array and ask a question that requires interpreting or completing the table.
For Fill in the blanks, use blanks like ____ in questiontext and include correct answers as options with iscorrect true where useful.
For Match columns, include tabledata where first row is ["Column A","Column B"] and subsequent rows contain matchable pairs.`;
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama(req.body.colid, prompt, req.body.ollamaConfigId)
      : await callGemini(req.body.colid, prompt, req.body.geminiModel || "gemini-2.5-flash");
    const data = parseJsonFromText(raw);
    const questions = (Array.isArray(data) ? data : data.questions || []).map((question, index) => ({
      sectionname: text(question.sectionname),
      questiontext: text(question.questiontext),
      questionhtml: String(question.questionhtml || question.questiontext || ""),
      questiontype: text(question.questiontype || questiontype),
      marks: num(question.marks, questiontype === "MCQ" ? 1 : 5),
      modules: arr(question.modules || modules),
      topics: arr(question.topics || topics),
      cos: arr(question.cos || question.co || cos),
      bloomlevels: arr(question.bloomlevels || question.blooms || bloomlevels),
      options: Array.isArray(question.options) ? question.options.map((option) => ({ optiontext: text(option.optiontext), iscorrect: !!option.iscorrect })).filter((option) => option.optiontext) : [],
      tabledata: Array.isArray(question.tabledata) ? question.tabledata.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [],
      order: num(question.order, index + 1)
    })).filter((question) => question.questiontext || question.questionhtml);
    res.json({ success: true, data: questions, raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.examDetails = async (req, res) => {
  try {
    const exam = await OnlineExam2.findOne({ _id: req.query.examid, colid: num(req.query.colid) }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const [attempts, assignments] = await Promise.all([
      OnlineExam2Attempt.find({ colid: exam.colid, examid: exam._id }).sort({ updatedAt: -1 }).lean(),
      OnlineExam2Assignment.find({ colid: exam.colid, examid: exam._id }).sort({ createdAt: -1 }).lean()
    ]);
    const now = Date.now();
    const decorated = attempts.map((attempt) => ({
      ...attempt,
      serverremainingseconds: remainingForAttempt(exam, attempt),
      loggedinseconds: attempt.starttime ? Math.max(0, Math.floor((now - new Date(attempt.starttime).getTime()) / 1000)) : 0,
      active: attempt.lastheartbeat && (now - new Date(attempt.lastheartbeat).getTime()) / 1000 <= staleDeviceSeconds && !attempt.submittime
    }));
    res.json({ success: true, exam, attempts: decorated, assignments, servertime: new Date() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startExam = async (req, res) => {
  try {
    const exam = await OnlineExam2.findOneAndUpdate(
      { _id: req.body.examid, colid: num(req.body.colid) },
      { isstarted: "Yes", startedat: new Date(), stoppedat: null, status: "Published" },
      { new: true }
    );
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.stopExam = async (req, res) => {
  try {
    const exam = await OnlineExam2.findOneAndUpdate(
      { _id: req.body.examid, colid: num(req.body.colid) },
      { isstarted: "No", stoppedat: new Date() },
      { new: true }
    );
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAssignment = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const exam = await OnlineExam2.findOne({ _id: req.body.examid, colid }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const semesters = arr(req.body.semester);
    const sections = arr(req.body.section);
    const payloads = [];
    const semesterList = semesters.length ? semesters : [""];
    const sectionList = sections.length ? sections : [""];
    semesterList.forEach((semester) => sectionList.forEach((section) => payloads.push({
      colid,
      examid: exam._id,
      academicyear: text(req.body.academicyear || exam.academicyear),
      regulation: text(req.body.regulation),
      program: text(req.body.program || exam.program),
      programcode: text(req.body.programcode || exam.programcode),
      semester,
      section,
      status: text(req.body.status || "Active"),
      user: text(req.body.user),
      username: text(req.body.username)
    })));
    const rows = [];
    for (const payload of payloads) {
      const row = await OnlineExam2Assignment.findOneAndUpdate(
        { colid, examid: payload.examid, programcode: payload.programcode, semester: payload.semester, section: payload.section },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      rows.push(row);
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAssignments = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [text(req.body.id)].filter(Boolean);
    await OnlineExam2Assignment.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.barStudent = async (req, res) => {
  try {
    const update = /^yes$/i.test(text(req.body.barred)) ? { barred: "Yes", barreason: text(req.body.barreason), barredat: new Date() } : { barred: "No", barreason: "", reactivatedat: new Date() };
    const row = await OnlineExam2Attempt.findOneAndUpdate({ _id: req.body.attemptid, colid: num(req.body.colid) }, update, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "Attempt not found" });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentExams = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const student = await User.findOne({ colid, regno: text(req.query.regno), role: /^Student$/i }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const assignments = await OnlineExam2Assignment.find({
      colid,
      status: /^Active$/i,
      $and: [
        { $or: [{ academicyear: student.academicyear }, { academicyear: "" }, { academicyear: { $exists: false } }] },
        { $or: [{ regulation: student.regulation }, { regulation: "" }, { regulation: { $exists: false } }] },
        { $or: [{ programcode: student.programcode }, { programcode: "" }, { programcode: { $exists: false } }] },
        { $or: [{ semester: student.semester }, { semester: "" }, { semester: { $exists: false } }] },
        { $or: [{ section: student.section }, { section: "" }, { section: { $exists: false } }] }
      ]
    }).lean();
    const examIds = assignments.map((assignment) => assignment.examid);
    const exams = await OnlineExam2.find({ colid, _id: { $in: examIds }, status: /^Published$/i }).sort({ createdAt: -1 }).lean();
    const attempts = await OnlineExam2Attempt.find({ colid, examid: { $in: examIds }, regno: student.regno }).lean();
    const attemptMap = Object.fromEntries(attempts.map((attempt) => [String(attempt.examid), attempt]));
    res.json({
      success: true,
      student,
      data: exams.map((exam) => ({
        ...exam,
        assignment: assignments.find((assignment) => String(assignment.examid) === String(exam._id)),
        attempt: attemptMap[String(exam._id)] || null,
        canStart: exam.isstarted === "Yes" && !attemptMap[String(exam._id)]?.submittime && attemptMap[String(exam._id)]?.barred !== "Yes"
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startAttempt = async (req, res) => {
  try {
    const exam = await OnlineExam2.findOne({ _id: req.body.examid, colid: num(req.body.colid), status: /^Published$/i }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    if (exam.isstarted !== "Yes") return res.status(400).json({ success: false, message: "Exam has not been started by the examiner." });
    const student = await User.findOne({ colid: exam.colid, regno: text(req.body.regno), role: /^Student$/i }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    if (!(await isStudentAssigned(exam, student))) return res.status(403).json({ success: false, message: "This exam is not assigned to your program, semester and section." });
    if (!/^yes$/i.test(text(req.body.instructionsunderstood)) || !/^yes$/i.test(text(req.body.hardwareok))) {
      return res.status(400).json({ success: false, message: "Please confirm both instruction and hardware/software declarations before starting." });
    }
    const deviceid = text(req.body.deviceid);
    if (!deviceid) return res.status(400).json({ success: false, message: "Device id is required" });
    let existing = await OnlineExam2Attempt.findOne({ colid: exam.colid, examid: exam._id, regno: student.regno });
    if (existing?.submittime) return res.status(400).json({ success: false, message: "Exam already submitted" });
    if (existing?.barred === "Yes") return res.status(403).json({ success: false, message: existing.barreason || "You are barred from this exam." });
    const activeOtherDevice = existing?.deviceid && existing.deviceid !== deviceid && existing.lastheartbeat && ((Date.now() - new Date(existing.lastheartbeat).getTime()) / 1000 <= staleDeviceSeconds);
    if (activeOtherDevice && exam.allowseconddevice !== "Yes") {
      return res.status(409).json({ success: false, message: "This exam is already active on another device. Try again after the first device disconnects, or contact the examiner." });
    }
    const orderedExam = existing ? examWithAttemptQuestionOrder(exam, existing) : shuffledExamForAttempt(exam);
    if (!existing) {
      const answers = initialAnswers(orderedExam);
      existing = await OnlineExam2Attempt.create({
        colid: exam.colid,
        examid: exam._id,
        examname: exam.examname,
        examcode: exam.examcode,
        academicyear: exam.academicyear,
        category: exam.category,
        program: student.program || exam.program,
        programcode: student.programcode || exam.programcode,
        semester: student.semester || exam.semester,
        section: student.section,
        course: exam.course,
        coursecode: exam.coursecode,
        student: student.name,
        email: student.email,
        regno: student.regno,
        ipaddress: ipOf(req),
        useragent: userAgentOf(req),
        deviceid,
        starttime: new Date(),
        lastheartbeat: new Date(),
        status: "Started",
        instructionsunderstood: "Yes",
        hardwareok: "Yes",
        declarationip: ipOf(req),
        declarationuseragent: userAgentOf(req),
        declarationat: new Date(),
        remainingseconds: Math.max(60, num(exam.durationminutes, 60) * 60),
        totalmarks: answers.reduce((sum, answer) => sum + num(answer.maxmarks), 0),
        answers
      });
    } else {
      existing.deviceid = deviceid;
      existing.ipaddress = ipOf(req);
      existing.useragent = userAgentOf(req);
      existing.lastheartbeat = new Date();
      existing.instructionsunderstood = "Yes";
      existing.hardwareok = "Yes";
      if (!existing.declarationat) existing.declarationat = new Date();
      existing.declarationip = existing.declarationip || ipOf(req);
      existing.declarationuseragent = existing.declarationuseragent || userAgentOf(req);
      existing.remainingseconds = remainingForAttempt(exam, existing);
      await existing.save();
    }
    res.json({ success: true, exam: examWithAttemptQuestionOrder(exam, existing.toObject ? existing.toObject() : existing), attempt: existing, servertime: new Date() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAttempt = async (req, res) => {
  try {
    const attempt = await OnlineExam2Attempt.findOne({ _id: req.body.attemptid, colid: num(req.body.colid) });
    if (!attempt || attempt.submittime) return res.status(400).json({ success: false, message: "Attempt is not editable" });
    if (attempt.barred === "Yes") return res.status(403).json({ success: false, message: "This student is barred from the exam." });
    const exam = await OnlineExam2.findById(attempt.examid).lean();
    if (text(req.body.deviceid) && attempt.deviceid && attempt.deviceid !== text(req.body.deviceid)) {
      const active = attempt.lastheartbeat && ((Date.now() - new Date(attempt.lastheartbeat).getTime()) / 1000 <= staleDeviceSeconds);
      if (active && exam?.allowseconddevice !== "Yes") return res.status(409).json({ success: false, message: "Another device owns this attempt." });
    }
    const incoming = Array.isArray(req.body.answers) ? req.body.answers : [];
    incoming.forEach((row) => {
      const answer = attempt.answers.id(row._id) || attempt.answers.find((a) => String(a.questionid) === text(row.questionid));
      if (!answer) return;
      ["selectedoptionid", "selectedoptiontext", "answertext", "attachmenturl"].forEach((field) => { if (row[field] !== undefined) answer[field] = row[field]; });
      if (Array.isArray(row.attachments)) answer.attachments = row.attachments;
    });
    attempt.lastheartbeat = new Date();
    attempt.remainingseconds = remainingForAttempt(exam, attempt);
    await attempt.save();
    res.json({ success: true, data: attempt, servertime: new Date() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitAttempt = async (req, res) => {
  try {
    const attempt = await OnlineExam2Attempt.findOne({ _id: req.body.attemptid, colid: num(req.body.colid) });
    if (!attempt || attempt.submittime) return res.status(400).json({ success: false, message: "Attempt already submitted or not found" });
    const exam = await OnlineExam2.findById(attempt.examid).lean();
    if (Array.isArray(req.body.answers)) {
      req.body.answers.forEach((row) => {
        const answer = attempt.answers.id(row._id) || attempt.answers.find((a) => String(a.questionid) === text(row.questionid));
        if (answer) Object.assign(answer, row);
      });
    }
    autoMcqMarks(exam, attempt);
    attempt.submittime = new Date();
    attempt.lastheartbeat = new Date();
    attempt.status = "Submitted";
    attempt.autosubmitted = req.body.autosubmitted ? "Yes" : "No";
    attempt.submitreason = text(req.body.submitreason || "Submitted by student");
    attempt.remainingseconds = remainingForAttempt(exam, attempt);
    attempt.marksobtained = attempt.answers.reduce((sum, answer) => sum + num(answer.marksobtained), 0);
    await attempt.save();
    res.json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.responses = async (req, res) => {
  try {
    const query = dynamicQuery(req.body);
    const rows = await OnlineExam2Attempt.find(query).sort({ updatedAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.declarationReport = async (req, res) => {
  try {
    const query = dynamicQuery(req.body);
    const rows = await OnlineExam2Attempt.find(query).sort({ declarationat: -1 }).limit(3000).lean();
    const yesBoth = rows.filter((row) => row.instructionsunderstood === "Yes" && row.hardwareok === "Yes").length;
    res.json({ success: true, data: rows, summary: { total: rows.length, completedDeclarations: yesBoth, missing: rows.length - yesBoth } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.gradeAttempt = async (req, res) => {
  try {
    const attempt = await OnlineExam2Attempt.findOne({ _id: req.body.attemptid, colid: num(req.body.colid) });
    if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found" });
    (req.body.answers || []).forEach((row) => {
      const answer = attempt.answers.id(row._id);
      if (!answer) return;
      answer.marksobtained = Math.min(num(row.marksobtained), num(answer.maxmarks));
      answer.comments = text(row.comments);
      answer.aicomments = text(row.aicomments || answer.aicomments);
      answer.grade = text(row.grade);
      answer.gradingstatus = "Graded";
    });
    attempt.marksobtained = attempt.answers.reduce((sum, answer) => sum + num(answer.marksobtained), 0);
    attempt.totalmarks = attempt.answers.reduce((sum, answer) => sum + num(answer.maxmarks), 0);
    attempt.grade = text(req.body.grade);
    attempt.comments = text(req.body.comments);
    attempt.status = "Graded";
    await attempt.save();
    res.json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.aiEvaluate = async (req, res) => {
  try {
    const attempt = await OnlineExam2Attempt.findOne({ _id: req.body.attemptid, colid: num(req.body.colid) }).lean();
    if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found" });
    const descriptiveAnswers = (attempt.answers || []).filter((answer) => !/^mcq$/i.test(answer.questiontype));
    const prompt = `Evaluate these descriptive online exam answers. Return ONLY JSON array [{"_id":"","questionid":"","marksobtained":0,"comments":"","grade":""}].
Be strict but fair. Marks must not exceed maxmarks. ${text(req.body.rules)}
Answers:
${JSON.stringify(descriptiveAnswers.map((answer) => ({ _id: answer._id, questionid: answer.questionid, question: answer.questiontext, answer: answer.answertext, maxmarks: answer.maxmarks, attachmenturl: answer.attachmenturl, attachments: answer.attachments })), null, 2)}`;
    const raw = /^ollama$/i.test(text(req.body.provider)) ? await callOllama(req.body.colid, prompt, req.body.ollamaConfigId) : await callGemini(req.body.colid, prompt, req.body.geminiModel || "gemini-2.5-flash");
    const parsed = parseJsonFromText(raw);
    res.json({ success: true, data: Array.isArray(parsed) ? parsed : parsed.evaluations || [], raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const query = dynamicQuery(req.body);
    const rows = await OnlineExam2Attempt.find(query).sort({ updatedAt: -1 }).limit(3000).lean();
    const byStatus = {};
    const byExam = {};
    rows.forEach((row) => {
      const status = row.status || "Started";
      byStatus[status] = (byStatus[status] || 0) + 1;
      const key = row.examname || row.examcode || "Exam";
      byExam[key] = byExam[key] || { exam: key, attempts: 0, submitted: 0, graded: 0, marks: 0, total: 0 };
      byExam[key].attempts += 1;
      if (row.submittime) byExam[key].submitted += 1;
      if (/^Graded$/i.test(row.status)) byExam[key].graded += 1;
      byExam[key].marks += num(row.marksobtained);
      byExam[key].total += num(row.totalmarks);
    });
    res.json({
      success: true,
      data: rows,
      summary: {
        attempts: rows.length,
        submitted: rows.filter((row) => row.submittime).length,
        graded: rows.filter((row) => /^Graded$/i.test(row.status)).length,
        average: rows.length ? rows.reduce((sum, row) => sum + num(row.marksobtained), 0) / rows.length : 0
      },
      charts: {
        byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
        byExam: Object.values(byExam).map((row) => ({ ...row, average: row.attempts ? row.marks / row.attempts : 0 }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
