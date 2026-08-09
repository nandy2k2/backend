const multer = require("multer");
const path = require("path");
const AWS = require("aws-sdk");
const OnlineExam = require("../Models/onlineexamds");
const OnlineExamAttempt = require("../Models/onlineexamattemptds");
const User = require("../Models/user");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const Syllabus = require("../Models/syllabusds");
const CourseOutcome = require("../Models/courseoutcomeds");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

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
  academicyear: text(body.academicyear),
  program: text(body.program),
  programcode: text(body.programcode),
  course: text(body.course),
  coursecode: text(body.coursecode),
  examname: text(body.examname),
  examcode: text(body.examcode || body.examname),
  durationminutes: num(body.durationminutes, 60),
  starttime: body.starttime ? new Date(body.starttime) : null,
  endtime: body.endtime ? new Date(body.endtime) : null,
  timezone: text(body.timezone || "Asia/Kolkata"),
  instructions: text(body.instructions),
  status: text(body.status || "Draft"),
  user: text(body.user),
  username: text(body.username)
});

const dynamicQuery = (body = {}) => {
  const query = { colid: num(body.colid) };
  ["academicyear", "program", "programcode", "course", "coursecode", "examname", "examcode", "status", "student", "regno"].forEach((field) => {
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

const initialAnswers = (exam) => (exam.sections || []).flatMap((section) => (section.questions || []).map((q) => ({
  sectionid: String(section._id),
  sectionname: section.sectionname,
  questionid: String(q._id),
  questiontext: q.questiontext,
  questiontype: q.questiontype || section.sectiontype,
  maxmarks: num(q.marks),
  marksobtained: 0,
  gradingstatus: "Pending"
})));

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const responseFields = ["academicyear", "program", "programcode", "course", "coursecode", "examname", "examcode", "student", "regno", "status"];
    const [courses, users, ollama, ...responseValuesList] = await Promise.all([
      RegulationCourseMap.find({ colid }).select("academicyear program programcode course coursecode").lean(),
      User.find({ colid, role: /^Student$/i }).select("name email regno academicyear program programcode semester").limit(2000).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean(),
      ...responseFields.map((field) => OnlineExamAttempt.distinct(field, { colid }))
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
    const rows = await OnlineExam.find(dynamicQuery(req.query)).sort({ createdAt: -1 }).limit(1000).lean();
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
      questiontype: text(req.body.questiontype || section.sectiontype),
      marks: num(req.body.marks, 1),
      modules: arr(req.body.modules || req.body.module),
      topics: arr(req.body.topics || req.body.topic),
      cos: arr(req.body.cos || req.body.co),
      bloomlevels: arr(req.body.bloomlevels || req.body.blooms),
      options: Array.isArray(req.body.options) ? req.body.options.map((o) => ({ optiontext: text(o.optiontext), iscorrect: !!o.iscorrect })).filter((o) => o.optiontext) : [],
      imageurl: text(req.body.imageurl),
      fileurl: text(req.body.fileurl),
      linkurl: text(req.body.linkurl),
      attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
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
      totalmarks: initialAnswers(exam).reduce((sum, a) => sum + num(a.maxmarks), 0),
      answers: initialAnswers(exam)
    });
    res.json({ success: true, exam, attempt });
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
    const rows = await OnlineExamAttempt.find(dynamicQuery(req.body)).sort({ updatedAt: -1 }).limit(1000).lean();
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
    const rows = await OnlineExamAttempt.find(dynamicQuery(req.body)).sort({ updatedAt: -1 }).limit(2000).lean();
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
