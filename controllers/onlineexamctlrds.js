const multer = require("multer");
const path = require("path");
const AWS = require("aws-sdk");
const mongoose = require("mongoose");
const OnlineExam = require("../Models/onlineexamds");
const OnlineExamAttempt = require("../Models/onlineexamattemptds");
const User = require("../Models/user");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const Syllabus = require("../Models/syllabusds");
const CourseOutcome = require("../Models/courseoutcomeds");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const NepLmsClassGroup = require("../Models/neplmsclassgroupds");
const OnlineExamCourseGroupAssignment = require("../Models/onlineexamcoursegroupassignmentds");
const AdmissionApplication = require("../Models/admissionapplicationdynamic");
const AdmissionOnlineExamAssignment = require("../Models/admissiononlineexamassignmentds");
const AdmissionEntranceComponent = require("../Models/admissionentrancecomponentds");
const AdmissionEntranceMarks = require("../Models/admissionentrancemarksds");

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
const geminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;

const getAws = async (colid) => Awsconfig.findOne({ colid: num(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || Awsconfig.findOne({ colid: num(colid), type: /^aws$/i }).sort({ _id: -1 }).lean();

const getGemini = async (colid) => AiConfiguration.findOne({ colid: num(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({ colid: num(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();

const callGemini = async (colid, prompt, model = "gemini-2.5-flash") => {
  const config = await getGemini(colid);
  if (!config?.apikey) throw new Error("Active Gemini configuration is missing");
  const models = [...new Set([text(model), "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean))];
  let last = "";
  for (const m of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35 } })
    });
    const data = await response.json();
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    last = data.error?.message || `Gemini failed for ${m}`;
  }
  throw new Error(last || "Gemini request failed");
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
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI did not return valid JSON");
  }
};

const examPayload = (body = {}) => ({
  colid: num(body.colid),
  examcontext: text(body.examcontext || body.context || "Student"),
  academicyear: text(body.academicyear),
  category: text(body.category),
  program: text(body.program),
  programcode: text(body.programcode),
  course: text(body.course),
  coursecode: text(body.coursecode),
  examname: text(body.examname),
  examcode: text(body.examcode || body.examname),
  durationminutes: num(body.durationminutes, 60),
  starttime: body.starttime ? new Date(body.starttime) : null,
  endtime: body.endtime ? new Date(body.endtime) : null,
  timezone: text(body.timezone || "UTC"),
  instructions: text(body.instructions),
  status: text(body.status || "Draft"),
  user: text(body.user),
  username: text(body.username)
});

const dynamicQuery = (body = {}) => {
  const query = { colid: num(body.colid) };
  ["examcontext", "academicyear", "category", "program", "programcode", "course", "coursecode", "examname", "examcode", "status", "student", "regno", "applicantid", "applicationnumber", "email"].forEach((field) => {
    if (text(body[field])) query[field] = { $regex: esc(body[field]), $options: "i" };
  });
  if (Array.isArray(body.dynamicFilters)) {
    body.dynamicFilters.forEach((f) => {
      const field = text(f.field);
      const value = text(f.value);
      if (!field || !value || field.includes("$")) return;
      query[field] = text(f.operator).toLowerCase() === "equals" ? value : { $regex: esc(value), $options: "i" };
    });
  }
  return query;
};

const currentAllowed = (exam) => {
  const now = Date.now();
  const start = exam.starttime ? new Date(exam.starttime).getTime() : 0;
  const end = exam.endtime ? new Date(exam.endtime).getTime() : 0;
  return now >= start && (!end || now <= end);
};

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
  sections: (exam.sections || []).map((section) => ({
    ...section,
    questions: shuffleArray(section.questions || [])
  }))
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

const courseGroupKeyFields = ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "facultyemail", "groupname"];
const courseGroupMatch = (source = {}) => {
  const query = { colid: num(source.colid) };
  courseGroupKeyFields.forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  return query;
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const examcontext = text(req.query.examcontext || req.query.context);
    const responseFields = ["examcontext", "academicyear", "category", "program", "programcode", "course", "coursecode", "examname", "examcode", "student", "regno", "applicationnumber", "email", "status"];
    const attemptBase = { colid };
    if (examcontext) attemptBase.examcontext = examcontext;
    const [courses, users, ollama, ...responseValuesList] = await Promise.all([
      RegulationCourseMap.find({ colid }).select("academicyear program programcode course coursecode").lean(),
      User.find({ colid, role: /^Student$/i }).select("name email regno academicyear program programcode semester").limit(2000).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean(),
      ...responseFields.map((field) => OnlineExamAttempt.distinct(field, attemptBase))
    ]);
    const responseValues = {};
    responseFields.forEach((field, index) => { responseValues[field] = uniq(responseValuesList[index]); });
    res.json({
      success: true,
      academicyears: uniq(courses.map((c) => c.academicyear)),
      programs: courses,
      students: users,
      responseValues,
      ollama,
      geminiModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"]
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
    let [syllabus, outcomes] = await Promise.all([
      Syllabus.find(query).select("module syllabus").sort({ module: 1, syllabus: 1 }).lean(),
      CourseOutcome.find(query).select("conumber co bloomlevels").sort({ conumber: 1 }).lean()
    ]);
    if ((!syllabus.length || !outcomes.length) && text(req.query.coursecode)) {
      const fallbackQuery = { colid, coursecode: text(req.query.coursecode) };
      if (text(req.query.academicyear)) fallbackQuery.academicyear = text(req.query.academicyear);
      const [fallbackSyllabus, fallbackOutcomes] = await Promise.all([
        Syllabus.find(fallbackQuery).select("module syllabus").sort({ module: 1, syllabus: 1 }).lean(),
        CourseOutcome.find(fallbackQuery).select("conumber co bloomlevels").sort({ conumber: 1 }).lean()
      ]);
      if (!syllabus.length) syllabus = fallbackSyllabus;
      if (!outcomes.length) outcomes = fallbackOutcomes;
    }
    const coOptions = outcomes.map((row) => [row.conumber, row.co].filter(Boolean).join(" - ")).filter(Boolean);
    res.json({
      success: true,
      modules: uniq(syllabus.map((row) => row.module)),
      topics: uniq(syllabus.map((row) => row.syllabus)),
      cos: uniq(coOptions),
      bloomlevels: uniq([
        ...outcomes.flatMap((row) => row.bloomlevels || []),
        "Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"
      ])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listExams = async (req, res) => {
  try {
    const query = dynamicQuery(req.query);
    if (text(req.query.createdby || req.query.createdbyemail || req.query.user)) {
      query.user = { $regex: `^${esc(req.query.createdby || req.query.createdbyemail || req.query.user)}$`, $options: "i" };
    }
    const rows = await OnlineExam.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveExam = async (req, res) => {
  try {
    const data = examPayload(req.body);
    if (/^admission$/i.test(data.examcontext)) {
      data.course = data.course || "Admission Entrance";
      data.coursecode = data.coursecode || data.category || "ENTRANCE";
    }
    if (!data.colid || !data.academicyear || !data.programcode || !data.coursecode || !data.examname) {
      return res.status(400).json({ success: false, message: "Academic year, program code, course code and exam name are required" });
    }
    const row = req.body.id
      ? await OnlineExam.findOneAndUpdate({ _id: req.body.id, colid: data.colid }, data, { new: true })
      : await OnlineExam.create(data);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    await OnlineExam.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveSection = async (req, res) => {
  try {
    const exam = await OnlineExam.findOne({ _id: req.body.examid, colid: num(req.body.colid) });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const payload = {
      sectionname: text(req.body.sectionname),
      sectiontype: text(req.body.sectiontype || "MCQ"),
      instructions: text(req.body.instructions),
      order: num(req.body.order)
    };
    if (req.body.sectionid) {
      const section = exam.sections.id(req.body.sectionid);
      Object.assign(section, payload);
    } else {
      exam.sections.push(payload);
    }
    await exam.save();
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveQuestion = async (req, res) => {
  try {
    const exam = await OnlineExam.findOne({ _id: req.body.examid, colid: num(req.body.colid) });
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
    if (req.body.questionid) {
      Object.assign(section.questions.id(req.body.questionid), payload);
    } else {
      section.questions.push(payload);
    }
    await exam.save();
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const exam = await OnlineExam.findOne({ _id: req.body.examid, colid: num(req.body.colid) });
    const section = exam?.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Question not found" });
    section.questions.pull(req.body.questionid);
    await exam.save();
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select file" });
    const colid = num(req.body.colid);
    const config = await getAws(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is missing" });
    }
    const cleanName = path.basename(req.file.originalname || "file").replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/online-exam/${text(req.body.context || "files")}/${Date.now()}-${cleanName}`;
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
    const mappingInstruction = /^yes|true|1$/i.test(text(req.body.mapWithAi || req.body.useAgentMapping))
      ? "Also verify each generated question and map it to the most suitable modules, topics, COs and Bloom taxonomy levels from the selected lists. Return those mappings in modules, topics, cos and bloomlevels arrays for every question."
      : "Include the selected modules, topics, COs and Bloom taxonomy levels in modules, topics, cos and bloomlevels arrays for every question.";
    const prompt = `Return ONLY JSON array of questions for an online examination.
Question type: ${text(req.body.questiontype || "MCQ")}
Course: ${text(req.body.course)} (${text(req.body.coursecode)})
Selected modules: ${modules.join(", ") || "Not specified"}
Selected topics: ${topics.join(", ") || "Not specified"}
Selected COs: ${cos.join(", ") || "Not specified"}
Selected Bloom taxonomy levels: ${bloomlevels.join(", ") || "Not specified"}
Topic/context/additional prompt: ${text(req.body.prompt || req.body.topic)}
Number of questions: ${num(req.body.count, 5)}
Language: ${text(req.body.language || "English")}
Difficulty: ${text(req.body.difficulty || "Medium")}
${mappingInstruction}
For MCQ return [{"questiontext":"","marks":1,"modules":[],"topics":[],"cos":[],"bloomlevels":[],"options":[{"optiontext":"","iscorrect":true},{"optiontext":"","iscorrect":false}]}].
For descriptive return [{"questiontext":"","marks":5,"modules":[],"topics":[],"cos":[],"bloomlevels":[],"options":[]}].`;
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama(req.body.colid, prompt, req.body.ollamaConfigId)
      : await callGemini(req.body.colid, prompt, req.body.geminiModel);
    const data = parseJsonFromText(raw);
    const questions = (Array.isArray(data) ? data : data.questions || []).map((question) => ({
      ...question,
      modules: arr(question.modules || modules),
      topics: arr(question.topics || topics),
      cos: arr(question.cos || question.co || cos),
      bloomlevels: arr(question.bloomlevels || question.blooms || bloomlevels)
    }));
    res.json({ success: true, data: questions, raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentExams = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const user = await User.findOne({ colid, regno }).lean();
    if (!user) return res.status(404).json({ success: false, message: "Student not found" });
    const query = { colid, academicyear: user.academicyear, programcode: user.programcode, status: /^Published$/i };
    if (text(req.query.coursecode)) query.coursecode = text(req.query.coursecode);
    const exams = await OnlineExam.find(query).sort({ starttime: 1 }).lean();
    const attempts = await OnlineExamAttempt.find({ colid, regno, examid: { $in: exams.map((e) => e._id) } }).lean();
    const byExam = Object.fromEntries(attempts.map((a) => [String(a.examid), a]));
    res.json({ success: true, student: user, data: exams.map((exam) => ({ ...exam, attempt: byExam[String(exam._id)] || null, canStart: currentAllowed(exam) && !byExam[String(exam._id)]?.submittime })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const admissionFields = ["academicyear", "category", "programapplied", "programcode", "name", "email", "phone", "applicationid", "applicationnumber", "username", "applicationstatus", "enrollmentstatus", "paymentstatus"];
const entranceComponentFields = ["academicyear", "regulation", "program", "programcode", "component", "status"];

const admissionAppQuery = (body = {}) => {
  const query = { colid: num(body.colid) };
  (Array.isArray(body.dynamicFilters) ? body.dynamicFilters : []).forEach((filter) => {
    const field = text(filter.field);
    const value = text(filter.value);
    if (!field || !value || field.includes("$")) return;
    const target = field === "program" ? "programapplied" : field;
    query[target] = text(filter.operator).toLowerCase() === "equals" ? value : { $regex: esc(value), $options: "i" };
  });
  return query;
};

exports.admissionOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [exams, ollama] = await Promise.all([
      OnlineExam.find({ colid, examcontext: /^Admission$/i }).select("examname examcode academicyear category program programcode starttime endtime timezone status").sort({ createdAt: -1 }).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
    ]);
    const applicationValues = {};
    await Promise.all(admissionFields.map(async (field) => {
      const dbField = field === "program" ? "programapplied" : field;
      applicationValues[field] = uniq(await AdmissionApplication.distinct(dbField, { colid }));
    }));
    const examValues = {};
    await Promise.all(["academicyear", "category", "program", "programcode", "examname", "examcode", "status"].map(async (field) => {
      examValues[field] = uniq(await OnlineExam.distinct(field, { colid, examcontext: /^Admission$/i }));
    }));
    res.json({ success: true, exams, applicationFields: admissionFields, applicationValues, examValues, ollama, geminiModels });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchAdmissionApplications = async (req, res) => {
  try {
    const rows = await AdmissionApplication.find(admissionAppQuery(req.body))
      .select("academicyear category programapplied programcode name email phone applicationid applicationnumber username applicationstatus enrollmentstatus paymentstatus createdAt")
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean();
    res.json({ success: true, data: rows.map((row) => ({ ...row, program: row.programapplied || row.program })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignAdmissionExam = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const exam = await OnlineExam.findOne({ _id: req.body.examid, colid, examcontext: /^Admission$/i }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Admission exam not found" });
    const ids = Array.isArray(req.body.applicationids) ? req.body.applicationids.map(text).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one admission application" });
    const apps = await AdmissionApplication.find({ colid, _id: { $in: ids } }).lean();
    const ops = apps.map((app) => {
      const applicationid = text(app.applicationid || app._id);
      return {
        updateOne: {
          filter: { colid, examid: exam._id, applicationid },
          update: {
            $set: {
              colid,
              examid: exam._id,
              examname: exam.examname,
              examcode: exam.examcode,
              academicyear: exam.academicyear || app.academicyear,
              category: exam.category || app.category,
              program: exam.program || app.programapplied,
              programcode: exam.programcode || app.programcode,
              applicationid,
              applicationnumber: text(app.applicationnumber),
              applicantname: text(app.name),
              applicantemail: text(app.email),
              username: text(app.username || app.email),
              status: text(req.body.status || "Assigned"),
              assignedby: text(req.body.user),
              assignedbyname: text(req.body.username),
              remarks: text(req.body.remarks)
            }
          },
          upsert: true
        }
      };
    });
    if (ops.length) await AdmissionOnlineExamAssignment.bulkWrite(ops);
    res.json({ success: true, assigned: ops.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAdmissionAssignments = async (req, res) => {
  try {
    const query = dynamicQuery(req.query);
    delete query.examcontext;
    ["applicantname", "applicantemail", "applicationid", "applicationnumber"].forEach((field) => {
      if (text(req.query[field])) query[field] = { $regex: esc(req.query[field]), $options: "i" };
    });
    const rows = await AdmissionOnlineExamAssignment.find(query).sort({ createdAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applicantLogin = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const username = text(req.body.username);
    const password = text(req.body.password);
    if (!colid || !username || !password) return res.status(400).json({ success: false, message: "Institution id, username and password are required" });
    const app = await AdmissionApplication.findOne({
      colid,
      $or: [{ username }, { email: username }, { applicationid: username }, { applicationnumber: username }]
    }).lean();
    if (!app || text(app.password) !== password) return res.status(401).json({ success: false, message: "Invalid applicant login" });
    res.json({ success: true, applicant: {
      _id: app._id,
      applicationid: app.applicationid || String(app._id),
      applicationnumber: app.applicationnumber || "",
      name: app.name,
      email: app.email,
      username: app.username || app.email,
      academicyear: app.academicyear,
      category: app.category,
      program: app.programapplied,
      programcode: app.programcode,
      colid
    }});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applicantExams = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const applicationid = text(req.query.applicationid);
    const assignments = await AdmissionOnlineExamAssignment.find({ colid, applicationid, status: /^Assigned|Active$/i }).lean();
    const exams = await OnlineExam.find({ colid, _id: { $in: assignments.map((a) => a.examid) }, examcontext: /^Admission$/i, status: /^Published$/i }).sort({ starttime: 1 }).lean();
    const attempts = await OnlineExamAttempt.find({ colid, examid: { $in: exams.map((e) => e._id) }, regno: applicationid, examcontext: /^Admission$/i }).lean();
    const byExam = Object.fromEntries(attempts.map((a) => [String(a.examid), a]));
    res.json({ success: true, data: exams.map((exam) => ({ ...exam, attempt: byExam[String(exam._id)] || null, canStart: currentAllowed(exam) && !byExam[String(exam._id)]?.submittime })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startApplicantAttempt = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const applicationid = text(req.body.applicationid);
    const exam = await OnlineExam.findOne({ _id: req.body.examid, colid, examcontext: /^Admission$/i, status: /^Published$/i }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Admission exam not found" });
    if (!currentAllowed(exam)) return res.status(400).json({ success: false, message: `Exam is available between ${exam.starttime} and ${exam.endtime} (${exam.timezone})` });
    const assignment = await AdmissionOnlineExamAssignment.findOne({ colid, examid: exam._id, applicationid }).lean();
    if (!assignment) return res.status(403).json({ success: false, message: "This exam is not assigned to this applicant" });
    const appMatch = [{ applicationid }];
    if (mongoose.Types.ObjectId.isValid(applicationid)) appMatch.push({ _id: applicationid });
    const app = await AdmissionApplication.findOne({ colid, $or: appMatch }).lean();
    if (!app) return res.status(404).json({ success: false, message: "Applicant not found" });
    const existing = await OnlineExamAttempt.findOne({ colid, examid: exam._id, regno: applicationid, examcontext: /^Admission$/i });
    if (existing?.submittime) return res.status(400).json({ success: false, message: "Exam already submitted" });
    const totalSeconds = Math.max(60, num(exam.durationminutes, 60) * 60);
    const orderedExam = existing ? examWithAttemptQuestionOrder(exam, existing) : shuffledExamForAttempt(exam);
    const attempt = existing || await OnlineExamAttempt.create({
      colid,
      examcontext: "Admission",
      examid: exam._id,
      examname: exam.examname,
      examcode: exam.examcode,
      academicyear: exam.academicyear || app.academicyear,
      category: exam.category || app.category,
      program: exam.program || app.programapplied,
      programcode: exam.programcode || app.programcode,
      course: exam.course,
      coursecode: exam.coursecode,
      student: app.name,
      email: app.email,
      regno: applicationid,
      applicantid: applicationid,
      applicationnumber: app.applicationnumber,
      starttime: new Date(),
      status: "Started",
      remainingseconds: totalSeconds,
      totalmarks: initialAnswers(orderedExam).reduce((sum, a) => sum + num(a.maxmarks), 0),
      answers: initialAnswers(orderedExam)
    });
    res.json({ success: true, exam: examWithAttemptQuestionOrder(exam, attempt), attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.admissionScores = async (req, res) => {
  try {
    const query = dynamicQuery({ ...req.body, examcontext: "Admission" });
    const rows = await OnlineExamAttempt.find(query).sort({ marksobtained: -1, updatedAt: -1 }).limit(3000).lean();
    const byProgram = {};
    rows.forEach((r) => {
      const key = r.programcode || "NA";
      byProgram[key] = byProgram[key] || { programcode: key, candidates: 0, submitted: 0, average: 0, marks: 0 };
      byProgram[key].candidates += 1;
      if (r.submittime) byProgram[key].submitted += 1;
      byProgram[key].marks += num(r.marksobtained);
    });
    Object.values(byProgram).forEach((r) => { r.average = r.candidates ? Number((r.marks / r.candidates).toFixed(2)) : 0; });
    res.json({ success: true, data: rows, byProgram: Object.values(byProgram), summary: {
      candidates: rows.length,
      submitted: rows.filter((r) => r.submittime).length,
      graded: rows.filter((r) => /^Graded$/i.test(r.status)).length,
      average: rows.length ? Number((rows.reduce((s, r) => s + num(r.marksobtained), 0) / rows.length).toFixed(2)) : 0
    }});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const entranceBaseQuery = (body = {}) => {
  const query = { colid: num(body.colid) };
  entranceComponentFields.forEach((field) => {
    if (text(body[field])) query[field] = { $regex: esc(body[field]), $options: "i" };
  });
  if (Array.isArray(body.dynamicFilters)) {
    body.dynamicFilters.forEach((filter) => {
      const field = text(filter.field);
      const value = text(filter.value);
      if (!field || !value || field.includes("$")) return;
      query[field] = text(filter.operator).toLowerCase() === "equals" ? value : { $regex: esc(value), $options: "i" };
    });
  }
  return query;
};

exports.entranceComponentOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [appYears, compYears, regulations, appPrograms, compPrograms, categories] = await Promise.all([
      AdmissionApplication.distinct("academicyear", { colid }),
      AdmissionEntranceComponent.distinct("academicyear", { colid }),
      AdmissionEntranceComponent.distinct("regulation", { colid }),
      AdmissionApplication.find({ colid }).select("programapplied programcode").limit(5000).lean(),
      AdmissionEntranceComponent.find({ colid }).select("program programcode").limit(5000).lean(),
      AdmissionApplication.distinct("category", { colid })
    ]);
    const programMap = new Map();
    [...appPrograms, ...compPrograms].forEach((row) => {
      const code = text(row.programcode);
      const name = text(row.program || row.programapplied);
      if (code || name) programMap.set(`${name}||${code}`, { program: name, programcode: code });
    });
    const valueOptions = {};
    await Promise.all(entranceComponentFields.map(async (field) => {
      valueOptions[field] = uniq(await AdmissionEntranceComponent.distinct(field, { colid }));
    }));
    res.json({
      success: true,
      academicyears: uniq([...appYears, ...compYears]),
      regulations: uniq(regulations),
      programs: [...programMap.values()].sort((a, b) => `${a.program} ${a.programcode}`.localeCompare(`${b.program} ${b.programcode}`)),
      categories: uniq(categories),
      valueOptions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listEntranceComponents = async (req, res) => {
  try {
    const rows = await AdmissionEntranceComponent.find(entranceBaseQuery(req.query)).sort({ academicyear: -1, programcode: 1, order: 1, component: 1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveEntranceComponent = async (req, res) => {
  try {
    const payload = {
      colid: num(req.body.colid),
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      component: text(req.body.component),
      maxmarks: num(req.body.maxmarks),
      order: num(req.body.order),
      status: text(req.body.status || "Active"),
      user: text(req.body.user),
      username: text(req.body.username)
    };
    if (!payload.colid || !payload.academicyear || !payload.programcode || !payload.component) {
      return res.status(400).json({ success: false, message: "Academic year, program code and component are required" });
    }
    const row = req.body.id
      ? await AdmissionEntranceComponent.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true })
      : await AdmissionEntranceComponent.findOneAndUpdate({
        colid: payload.colid,
        academicyear: payload.academicyear,
        regulation: payload.regulation,
        programcode: payload.programcode,
        component: payload.component
      }, payload, { new: true, upsert: true });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEntranceComponents = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select records to delete" });
    const result = await AdmissionEntranceComponent.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deletedCount: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.loadEntranceMarks = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const criteria = {
      colid,
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      programcode: text(req.body.programcode)
    };
    const componentQuery = { ...criteria, status: /^Active$/i };
    if (text(req.body.program)) componentQuery.program = { $regex: esc(req.body.program), $options: "i" };
    const appQuery = admissionAppQuery(req.body);
    if (criteria.academicyear) appQuery.academicyear = criteria.academicyear;
    if (text(req.body.category)) appQuery.category = text(req.body.category);
    if (text(req.body.program)) appQuery.programapplied = { $regex: esc(req.body.program), $options: "i" };
    if (criteria.programcode) appQuery.programcode = criteria.programcode;
    const [components, applications] = await Promise.all([
      AdmissionEntranceComponent.find(componentQuery).sort({ order: 1, component: 1 }).lean(),
      AdmissionApplication.find(appQuery).select("academicyear category programapplied programcode name email phone applicationid applicationnumber username").sort({ name: 1 }).limit(3000).lean()
    ]);
    const appIds = applications.map((app) => text(app.applicationid || app._id));
    const existing = await AdmissionEntranceMarks.find({ colid, academicyear: criteria.academicyear, regulation: criteria.regulation, programcode: criteria.programcode, applicationid: { $in: appIds } }).lean();
    const marksMap = new Map(existing.map((row) => [text(row.applicationid), row]));
    const rows = applications.map((app) => {
      const applicationid = text(app.applicationid || app._id);
      const saved = marksMap.get(applicationid);
      const componentMarks = {};
      (saved?.marks || []).forEach((m) => { componentMarks[text(m.componentid)] = m.marks; });
      return {
        id: String(app._id),
        _id: String(app._id),
        applicationid,
        applicationnumber: app.applicationnumber || "",
        applicantname: app.name || "",
        applicantemail: app.email || "",
        category: app.category || "",
        academicyear: app.academicyear || "",
        program: app.programapplied || "",
        programcode: app.programcode || "",
        componentMarks,
        totalmarks: saved?.totalmarks || 0
      };
    });
    res.json({ success: true, components, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveEntranceMarks = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const components = await AdmissionEntranceComponent.find({
      colid,
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      programcode: text(req.body.programcode)
    }).lean();
    const byId = new Map(components.map((c) => [String(c._id), c]));
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const ops = rows.map((row) => {
      const marksObj = row.componentMarks || {};
      const marks = Object.keys(marksObj).map((componentid) => {
        const component = byId.get(componentid) || {};
        return {
          componentid,
          component: component.component || "",
          maxmarks: num(component.maxmarks),
          marks: num(marksObj[componentid])
        };
      }).filter((m) => m.componentid);
      const totalmarks = marks.reduce((sum, m) => sum + num(m.marks), 0);
      return {
        updateOne: {
          filter: {
            colid,
            academicyear: text(req.body.academicyear),
            regulation: text(req.body.regulation),
            programcode: text(req.body.programcode),
            applicationid: text(row.applicationid)
          },
          update: {
            $set: {
              colid,
              academicyear: text(req.body.academicyear),
              regulation: text(req.body.regulation),
              category: text(row.category || req.body.category),
              program: text(row.program || req.body.program),
              programcode: text(req.body.programcode || row.programcode),
              applicationid: text(row.applicationid),
              applicationnumber: text(row.applicationnumber),
              applicantname: text(row.applicantname),
              applicantemail: text(row.applicantemail),
              marks,
              totalmarks,
              user: text(req.body.user),
              username: text(req.body.username)
            }
          },
          upsert: true
        }
      };
    }).filter((op) => op.updateOne.filter.applicationid);
    if (ops.length) await AdmissionEntranceMarks.bulkWrite(ops);
    res.json({ success: true, saved: ops.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.entranceReport = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const criteria = {
      colid,
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      programcode: text(req.body.programcode)
    };
    const componentQuery = { ...criteria };
    const appQuery = admissionAppQuery(req.body);
    if (criteria.academicyear) appQuery.academicyear = criteria.academicyear;
    if (text(req.body.category)) appQuery.category = text(req.body.category);
    if (text(req.body.program)) appQuery.programapplied = { $regex: esc(req.body.program), $options: "i" };
    if (criteria.programcode) appQuery.programcode = criteria.programcode;
    const [components, applications, marksRows, onlineRows] = await Promise.all([
      AdmissionEntranceComponent.find(componentQuery).sort({ order: 1, component: 1 }).lean(),
      AdmissionApplication.find(appQuery).select("academicyear category programapplied programcode name email phone applicationid applicationnumber username").sort({ name: 1 }).limit(5000).lean(),
      AdmissionEntranceMarks.find(criteria).lean(),
      /^yes|true|1$/i.test(text(req.body.includeOnlineExam))
        ? OnlineExamAttempt.find({ colid, examcontext: /^Admission$/i, academicyear: criteria.academicyear, programcode: criteria.programcode, submittime: { $ne: null } }).lean()
        : Promise.resolve([])
    ]);
    const marksMap = new Map(marksRows.map((row) => [text(row.applicationid), row]));
    const onlineTotals = new Map();
    onlineRows.forEach((row) => {
      const id = text(row.applicantid || row.regno);
      onlineTotals.set(id, (onlineTotals.get(id) || 0) + num(row.marksobtained));
    });
    let rows = applications.map((app) => {
      const applicationid = text(app.applicationid || app._id);
      const saved = marksMap.get(applicationid);
      const markByComponent = {};
      (saved?.marks || []).forEach((m) => { markByComponent[text(m.componentid)] = num(m.marks); });
      const componentTotal = components.reduce((sum, c) => sum + num(markByComponent[String(c._id)]), 0);
      const onlineExamMarks = onlineTotals.get(applicationid) || 0;
      return {
        id: String(app._id),
        applicationid,
        applicationnumber: app.applicationnumber || "",
        applicantname: app.name || "",
        applicantemail: app.email || "",
        category: app.category || "",
        academicyear: app.academicyear || "",
        program: app.programapplied || "",
        programcode: app.programcode || "",
        componentMarks: markByComponent,
        componentTotal,
        onlineExamMarks,
        overallMarks: componentTotal + onlineExamMarks
      };
    });
    const sortBy = text(req.body.sortBy || "overallMarks");
    const sortDir = /^asc$/i.test(text(req.body.sortDir)) ? 1 : -1;
    rows = rows.sort((a, b) => {
      const av = a[sortBy] ?? a.componentMarks?.[sortBy] ?? "";
      const bv = b[sortBy] ?? b.componentMarks?.[sortBy] ?? "";
      if (typeof av === "number" || typeof bv === "number") return (num(av) - num(bv)) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
    rows = rows.map((row, index) => ({ ...row, rank: index + 1 }));
    res.json({ success: true, components, data: rows, summary: {
      candidates: rows.length,
      average: rows.length ? Number((rows.reduce((sum, row) => sum + num(row.overallMarks), 0) / rows.length).toFixed(2)) : 0,
      highest: rows.length ? Math.max(...rows.map((row) => num(row.overallMarks))) : 0
    }});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentCourses = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const user = await User.findOne({ colid, regno }).lean();
    if (!user) return res.status(404).json({ success: false, message: "Student not found" });

    const query = {
      colid,
      academicyear: text(user.academicyear),
      regulation: text(user.regulation),
      programcode: text(user.programcode),
      semester: text(user.semester)
    };
    if (text(user.program)) query.program = text(user.program);
    Object.keys(query).forEach((key) => {
      if (query[key] === "") delete query[key];
    });

    const rows = await RegulationCourseMap.find(query)
      .select("academicyear regulation program programcode semester course coursecode coursetype deliverytype credit")
      .sort({ course: 1, coursecode: 1 })
      .lean();

    const seen = new Set();
    const courses = rows.filter((row) => {
      const key = [row.coursecode, row.course, row.semester].map(text).join("||");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({
      success: true,
      student: {
        name: user.name,
        regno: user.regno,
        academicyear: user.academicyear,
        regulation: user.regulation,
        program: user.program,
        programcode: user.programcode,
        semester: user.semester
      },
      data: courses
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startAttempt = async (req, res) => {
  try {
    const exam = await OnlineExam.findOne({ _id: req.body.examid, colid: num(req.body.colid), status: /^Published$/i }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    if (!currentAllowed(exam)) return res.status(400).json({ success: false, message: `Exam is available between ${exam.starttime} and ${exam.endtime} (${exam.timezone})` });
    const student = await User.findOne({ colid: exam.colid, regno: text(req.body.regno) }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const existing = await OnlineExamAttempt.findOne({ colid: exam.colid, examid: exam._id, regno: student.regno });
    if (existing?.submittime) return res.status(400).json({ success: false, message: "Exam already submitted" });
    const totalSeconds = Math.max(60, num(exam.durationminutes, 60) * 60);
    const orderedExam = existing ? examWithAttemptQuestionOrder(exam, existing) : shuffledExamForAttempt(exam);
    const attempt = existing || await OnlineExamAttempt.create({
      colid: exam.colid,
      examid: exam._id,
      examname: exam.examname,
      examcode: exam.examcode,
      academicyear: exam.academicyear,
      program: exam.program,
      programcode: exam.programcode,
      course: exam.course,
      coursecode: exam.coursecode,
      student: student.name,
      email: student.email,
      regno: student.regno,
      starttime: new Date(),
      status: "Started",
      remainingseconds: totalSeconds,
      totalmarks: initialAnswers(orderedExam).reduce((sum, a) => sum + num(a.maxmarks), 0),
      answers: initialAnswers(orderedExam)
    });
    res.json({ success: true, exam: examWithAttemptQuestionOrder(exam, attempt), attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAttempt = async (req, res) => {
  try {
    const attempt = await OnlineExamAttempt.findOne({ _id: req.body.attemptid, colid: num(req.body.colid) });
    if (!attempt || attempt.submittime) return res.status(400).json({ success: false, message: "Attempt is not editable" });
    const incoming = Array.isArray(req.body.answers) ? req.body.answers : [];
    incoming.forEach((row) => {
      const answer = attempt.answers.id(row._id) || attempt.answers.find((a) => String(a.questionid) === text(row.questionid));
      if (!answer) return;
      ["selectedoptionid", "selectedoptiontext", "answertext", "attachmenturl"].forEach((field) => { if (row[field] !== undefined) answer[field] = row[field]; });
      if (Array.isArray(row.attachments)) answer.attachments = row.attachments;
    });
    attempt.remainingseconds = Math.max(0, num(req.body.remainingseconds, attempt.remainingseconds));
    await attempt.save();
    res.json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const autoMcqMarks = (exam, attempt) => {
  const questionMap = {};
  (exam.sections || []).forEach((s) => (s.questions || []).forEach((q) => { questionMap[String(q._id)] = q; }));
  attempt.answers.forEach((a) => {
    const q = questionMap[String(a.questionid)];
    if (!q || !/^mcq$/i.test(a.questiontype)) return;
    const selected = (q.options || []).find((o) => String(o._id) === text(a.selectedoptionid) || text(o.optiontext) === text(a.selectedoptiontext));
    a.marksobtained = selected?.iscorrect ? num(a.maxmarks) : 0;
    a.gradingstatus = "Graded";
  });
};

exports.submitAttempt = async (req, res) => {
  try {
    const attempt = await OnlineExamAttempt.findOne({ _id: req.body.attemptid, colid: num(req.body.colid) });
    if (!attempt || attempt.submittime) return res.status(400).json({ success: false, message: "Attempt already submitted or not found" });
    const exam = await OnlineExam.findById(attempt.examid).lean();
    if (Array.isArray(req.body.answers)) {
      req.body.answers.forEach((row) => {
        const answer = attempt.answers.id(row._id) || attempt.answers.find((a) => String(a.questionid) === text(row.questionid));
        if (answer) Object.assign(answer, row);
      });
    }
    autoMcqMarks(exam, attempt);
    attempt.submittime = new Date();
    attempt.status = "Submitted";
    attempt.autosubmitted = req.body.autosubmitted ? "Yes" : "No";
    attempt.submitreason = text(req.body.submitreason || "Submitted by student");
    attempt.remainingseconds = Math.max(0, num(req.body.remainingseconds));
    attempt.marksobtained = attempt.answers.reduce((sum, a) => sum + num(a.marksobtained), 0);
    await attempt.save();
    res.json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.responses = async (req, res) => {
  try {
    const query = dynamicQuery(req.body);
    if (text(req.body.createdby || req.body.createdbyemail || req.body.userfilter)) {
      const exams = await OnlineExam.find({
        colid: query.colid,
        user: { $regex: `^${esc(req.body.createdby || req.body.createdbyemail || req.body.userfilter)}$`, $options: "i" }
      }).select("_id").lean();
      query.examid = { $in: exams.map((exam) => exam._id) };
    }
    const rows = await OnlineExamAttempt.find(query).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteResponses = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one response" });
    const result = await OnlineExamAttempt.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deletedCount: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.gradeAttempt = async (req, res) => {
  try {
    const attempt = await OnlineExamAttempt.findOne({ _id: req.body.attemptid, colid: num(req.body.colid) });
    if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found" });
    (req.body.answers || []).forEach((row) => {
      const answer = attempt.answers.id(row._id);
      if (!answer) return;
      answer.marksobtained = Math.min(num(row.marksobtained), num(answer.maxmarks));
      answer.comments = text(row.comments);
      answer.grade = text(row.grade);
      answer.gradingstatus = "Graded";
    });
    attempt.marksobtained = attempt.answers.reduce((sum, a) => sum + num(a.marksobtained), 0);
    attempt.totalmarks = attempt.answers.reduce((sum, a) => sum + num(a.maxmarks), 0);
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
    const attempt = await OnlineExamAttempt.findOne({ _id: req.body.attemptid, colid: num(req.body.colid) }).lean();
    if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found" });
    const prompt = `Evaluate these online exam answers. Return ONLY JSON array [{"questionid":"","marksobtained":0,"comments":"","grade":""}].
Be strict but fair. Marks must not exceed maxmarks.
${text(req.body.rules)}
Answers:
${JSON.stringify(attempt.answers.map((a) => ({ _id: a._id, questionid: a.questionid, question: a.questiontext, answer: a.answertext || a.selectedoptiontext, maxmarks: a.maxmarks, attachmenturl: a.attachmenturl })), null, 2)}`;
    const raw = /^ollama$/i.test(text(req.body.provider)) ? await callOllama(req.body.colid, prompt, req.body.ollamaConfigId) : await callGemini(req.body.colid, prompt, req.body.geminiModel);
    const parsed = parseJsonFromText(raw);
    res.json({ success: true, data: Array.isArray(parsed) ? parsed : parsed.evaluations || [], raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const query = dynamicQuery(req.body);
    if (text(req.body.createdby || req.body.createdbyemail || req.body.userfilter)) {
      const exams = await OnlineExam.find({
        colid: query.colid,
        user: { $regex: `^${esc(req.body.createdby || req.body.createdbyemail || req.body.userfilter)}$`, $options: "i" }
      }).select("_id").lean();
      query.examid = { $in: exams.map((exam) => exam._id) };
    }
    const rows = await OnlineExamAttempt.find(query).sort({ updatedAt: -1 }).limit(2000).lean();
    const submitted = rows.filter((r) => r.submittime).length;
    const graded = rows.filter((r) => /^Graded$/i.test(r.status)).length;
    const avg = rows.length ? rows.reduce((s, r) => s + num(r.marksobtained), 0) / rows.length : 0;
    const byCourse = {};
    rows.forEach((r) => {
      const key = r.coursecode || "NA";
      byCourse[key] = byCourse[key] || { coursecode: key, attempts: 0, submitted: 0, graded: 0, marks: 0 };
      byCourse[key].attempts += 1;
      if (r.submittime) byCourse[key].submitted += 1;
      if (/^Graded$/i.test(r.status)) byCourse[key].graded += 1;
      byCourse[key].marks += num(r.marksobtained);
    });
    Object.values(byCourse).forEach((r) => { r.average = r.attempts ? Number((r.marks / r.attempts).toFixed(2)) : 0; });
    res.json({ success: true, data: rows, summary: { total: rows.length, submitted, graded, average: Number(avg.toFixed(2)) }, byCourse: Object.values(byCourse) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.courseGroupAssignmentOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const facultyemail = text(req.query.user || req.query.facultyemail);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!facultyemail) return res.status(400).json({ success: false, message: "faculty email is required" });
    const [exams, groupRows] = await Promise.all([
      OnlineExam.find({ colid, user: { $regex: `^${esc(facultyemail)}$`, $options: "i" } })
        .select("academicyear regulation program programcode semester course coursecode examname examcode starttime endtime timezone status user username")
        .sort({ createdAt: -1 })
        .lean(),
      NepLmsClassGroup.find({ colid, facultyemail: { $regex: `^${esc(facultyemail)}$`, $options: "i" } })
        .select("academicyear regulation program programcode semester course coursecode facultyname facultyemail groupname section")
        .sort({ academicyear: -1, semester: 1, course: 1, groupname: 1 })
        .lean()
    ]);
    const seen = new Set();
    const groups = groupRows.filter((row) => {
      const key = courseGroupKeyFields.map((field) => text(row[field])).join("||");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const filterValues = {};
    ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "examname", "examcode", "groupname", "status"].forEach((field) => {
      filterValues[field] = uniq([...exams.map((row) => row[field]), ...groups.map((row) => row[field])]);
    });
    res.json({ success: true, exams, groups, filterValues });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listCourseGroupAssignments = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const facultyemail = text(req.query.user || req.query.facultyemail);
    const query = { colid };
    if (facultyemail) query.facultyemail = { $regex: `^${esc(facultyemail)}$`, $options: "i" };
    ["academicyear", "regulation", "programcode", "semester", "coursecode", "groupname", "examcode", "status"].forEach((field) => {
      if (text(req.query[field])) query[field] = { $regex: esc(req.query[field]), $options: "i" };
    });
    const rows = await OnlineExamCourseGroupAssignment.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveCourseGroupAssignment = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const facultyemail = text(req.body.user || req.body.facultyemail);
    const exam = await OnlineExam.findOne({ _id: req.body.examid, colid, user: { $regex: `^${esc(facultyemail)}$`, $options: "i" } }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Online exam created by this user was not found" });
    const group = await NepLmsClassGroup.findOne({
      ...courseGroupMatch({ ...req.body, colid, facultyemail }),
      facultyemail: { $regex: `^${esc(facultyemail)}$`, $options: "i" }
    }).lean();
    if (!group) return res.status(404).json({ success: false, message: "Course group created by this user was not found" });
    if ((text(exam.coursecode) && text(exam.coursecode) !== text(group.coursecode))
      || (text(exam.programcode) && text(exam.programcode) !== text(group.programcode))
      || (text(exam.academicyear) && text(exam.academicyear) !== text(group.academicyear))) {
      return res.status(400).json({ success: false, message: "Exam and course group must match academic year, program and course" });
    }
    const payload = {
      examid: exam._id,
      examname: exam.examname,
      examcode: exam.examcode,
      academicyear: group.academicyear,
      regulation: group.regulation,
      program: group.program,
      programcode: group.programcode,
      semester: group.semester,
      course: group.course,
      coursecode: group.coursecode,
      groupname: group.groupname,
      facultyname: group.facultyname || exam.username,
      facultyemail: group.facultyemail,
      status: text(req.body.status || "Active"),
      remarks: text(req.body.remarks),
      colid,
      user: facultyemail
    };
    const row = await OnlineExamCourseGroupAssignment.findOneAndUpdate({
      colid,
      examid: exam._id,
      academicyear: payload.academicyear,
      regulation: payload.regulation,
      programcode: payload.programcode,
      semester: payload.semester,
      coursecode: payload.coursecode,
      facultyemail: payload.facultyemail,
      groupname: payload.groupname
    }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCourseGroupAssignments = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select assignments to delete" });
    const result = await OnlineExamCourseGroupAssignment.deleteMany({ colid: num(req.body.colid), user: { $regex: `^${esc(req.body.user)}$`, $options: "i" }, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentCourseGroupCourses = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const student = await User.findOne({ colid, regno }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const groups = await NepLmsClassGroup.find({
      colid,
      regno,
      academicyear: text(student.academicyear),
      regulation: text(student.regulation),
      programcode: text(student.programcode),
      semester: text(student.semester)
    }).select("academicyear regulation program programcode semester course coursecode groupname facultyemail facultyname").lean();
    const seen = new Set();
    const courses = groups.filter((row) => {
      const key = [row.academicyear, row.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ success: true, student, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentCourseGroupGroups = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const query = { colid, regno };
    ["academicyear", "regulation", "programcode", "semester", "coursecode"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    const groups = await NepLmsClassGroup.find(query).select("academicyear regulation program programcode semester course coursecode groupname facultyemail facultyname").sort({ groupname: 1 }).lean();
    const seen = new Set();
    const data = groups.filter((row) => {
      const key = [row.facultyemail, row.groupname, row.coursecode].map(text).join("||");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentCourseGroupExams = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const membership = await NepLmsClassGroup.findOne({
      ...courseGroupMatch({ ...req.query, colid }),
      regno
    }).lean();
    if (!membership) return res.json({ success: true, data: [] });
    const assignments = await OnlineExamCourseGroupAssignment.find({
      ...courseGroupMatch({ ...membership, colid }),
      status: /^Active$/i
    }).lean();
    const examIds = assignments.map((row) => row.examid).filter(Boolean);
    const exams = await OnlineExam.find({ colid, _id: { $in: examIds }, status: /^Published$/i }).sort({ starttime: 1 }).lean();
    const attempts = await OnlineExamAttempt.find({ colid, regno, examid: { $in: exams.map((exam) => exam._id) } }).lean();
    const byExam = Object.fromEntries(attempts.map((attempt) => [String(attempt.examid), attempt]));
    res.json({ success: true, data: exams.map((exam) => ({
      ...exam,
      groupname: membership.groupname,
      facultyemail: membership.facultyemail,
      attempt: byExam[String(exam._id)] || null,
      canStart: currentAllowed(exam) && !byExam[String(exam._id)]?.submittime
    })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
