const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const ConductExam = require("../Models/conductexamds");
const ConductExamCourse = require("../Models/conductexamcourseds");
const PaperSetter = require("../Models/conductexampapersetterds");
const PaperSetterPanel = require("../Models/conductexampapersetterpanelds");
const PaperSetterPanelMember = require("../Models/conductexampapersetterpanelmemberds");
const QuestionPaper = require("../Models/conductexamquestionpaperds");
const QuestionPattern = require("../Models/conductexamquestionpatternds");
const QuestionPatternDetail = require("../Models/conductexamquestionpatterndetailds");
const CourseOutcome = require("../Models/courseoutcomeds");
const Syllabus = require("../Models/syllabusds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Awsconfig = require("../Models/awsconfig");
const Institution = require("../Models/insdetails");
const User = require("../Models/user");
const { createApprovalTasks, completeApprovalTasks } = require("../utils/approvalTaskHelper");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = (values) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const arr = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : String(value || "").split(/[,;|]/).map(text).filter(Boolean);
const dateOrUndefined = (value) => {
  if (!text(value)) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const docs = (value) => Array.isArray(value) ? value.map((doc) => ({
  title: text(doc.title),
  filename: text(doc.filename || doc.originalname),
  url: text(doc.url),
  uploadedby: text(doc.uploadedby),
  uploadeddate: dateOrUndefined(doc.uploadeddate) || new Date()
})).filter((doc) => doc.url) : [];
const stripCodeFence = (content) => text(content)
  .replace(/^\uFEFF/, "")
  .replace(/^```(?:json)?\s*/i, "")
  .replace(/```$/i, "")
  .trim();
const splitTopics = (value) => String(value || "")
  .split(/\r?\n|[,;|]/)
  .map((item) => item.replace(/^\s*[-*0-9.)]+\s*/, "").trim())
  .filter(Boolean);
const parseJson = (content) => {
  const clean = stripCodeFence(content);
  const startObj = clean.indexOf("{");
  const startArr = clean.indexOf("[");
  const start = startArr >= 0 && (startObj < 0 || startArr < startObj) ? startArr : startObj;
  const end = startArr >= 0 && start === startArr ? clean.lastIndexOf("]") : clean.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  const repairJsonEscapes = (value) => String(value || "")
    .replace(/\\(?!["\\/bfnrtu])/g, "\\\\")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, " ");
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repaired = repairJsonEscapes(candidate);
    return JSON.parse(repaired);
  }
};
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

const extractTextFromUrl = async (url, filename = "") => {
  const link = text(url);
  if (!link) return "";
  try {
    const response = await fetch(link);
    if (!response.ok) return "";
    const buffer = Buffer.from(await response.arrayBuffer());
    const lower = `${filename} ${link}`.toLowerCase();
    if (lower.includes(".pdf")) {
      const parsed = await pdfParse(buffer);
      return text(parsed.text).slice(0, 24000);
    }
    if (lower.includes(".docx") || lower.includes(".doc")) {
      const parsed = await mammoth.extractRawText({ buffer });
      return text(parsed.value).slice(0, 24000);
    }
    return buffer.toString("utf8").slice(0, 24000);
  } catch (error) {
    return "";
  }
};

const courseFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"];
const setterFields = [...courseFields, "papersettername", "papersetteremail", "status"];
const panelFields = ["academicyear", "regulation", "program", "programcode", "panelname", "status"];
const panelMemberFields = [...panelFields, "membername", "memberemail", "role", "department", "approvalstatus", "status"];
const patternFields = ["academicyear", "program", "programcode", "pattern", "status"];
const patternDetailFields = ["patternid", "academicyear", "program", "programcode", "pattern", "section", "question", "questiontype", "includemathematicalexpressions", "group", "subquestion", "status"];

const buildFilter = (source = {}, fields = []) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  fields.forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const buildLooseCourseFilter = (source = {}) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester", "course", "coursecode"].forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const groupedContext = (rows, topicReader) => {
  const map = new Map();
  rows.forEach((row) => {
    const module = text(row.module) || "General";
    const topics = topicReader(row).map(text).filter(Boolean);
    if (!map.has(module)) map.set(module, new Set());
    topics.forEach((topic) => map.get(module).add(topic));
  });
  return [...map.entries()].map(([module, topicSet]) => ({
    module,
    topics: [...topicSet].sort((a, b) => a.localeCompare(b))
  })).sort((a, b) => a.module.localeCompare(b.module));
};

const baseCoursePayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear || body.academicYear),
  regulation: text(body.regulation),
  exam: text(body.exam || body.examname),
  examcode: text(body.examcode),
  program: text(body.program),
  programcode: text(body.programcode),
  type: text(body.type),
  subject: text(body.subject),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  user: text(body.user)
});

const setterPayload = (body = {}) => ({
  ...baseCoursePayload(body),
  papersettername: text(body.papersettername || body.papersetter || body.name),
  papersetteremail: text(body.papersetteremail || body.email).toLowerCase(),
  startdate: dateOrUndefined(body.startdate),
  enddate: dateOrUndefined(body.enddate),
  admindocuments: docs(body.admindocuments),
  status: text(body.status) || "assigned"
});

const panelPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  panelname: text(body.panelname),
  description: text(body.description),
  status: text(body.status) || "Active",
  name: text(body.name),
  user: text(body.user)
});

const panelMemberPayload = (body = {}, panel = null) => ({
  colid: number(body.colid || panel?.colid),
  panelid: text(body.panelid || panel?._id),
  academicyear: text(body.academicyear || panel?.academicyear),
  regulation: text(body.regulation || panel?.regulation),
  program: text(body.program || panel?.program),
  programcode: text(body.programcode || panel?.programcode),
  panelname: text(body.panelname || panel?.panelname),
  membername: text(body.membername || body.name),
  memberemail: text(body.memberemail || body.email).toLowerCase(),
  role: text(body.role),
  department: text(body.department),
  designation: text(body.designation),
  institution: text(body.institution),
  approvalstatus: text(body.approvalstatus) || "Pending",
  comments: text(body.comments),
  status: text(body.status) || "Active",
  name: text(body.createdby || body.name),
  user: text(body.createduser || body.user)
});

const validateSetter = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "course", "coursecode", "papersettername", "papersetteremail"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const setterIsActive = (setter) => {
  const now = new Date();
  const start = setter?.startdate ? new Date(setter.startdate) : null;
  const end = setter?.enddate ? new Date(setter.enddate) : null;
  if (start && now < start) return false;
  if (end) {
    end.setHours(23, 59, 59, 999);
    if (now > end) return false;
  }
  return true;
};

const validatePanel = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "regulation", "program", "programcode", "panelname"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const validatePanelMember = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["panelid", "academicyear", "regulation", "program", "programcode", "panelname", "membername", "memberemail"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const patternPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  program: text(body.program),
  programcode: text(body.programcode),
  pattern: text(body.pattern),
  description: text(body.description),
  status: text(body.status) || "Active",
  name: text(body.name),
  user: text(body.user)
});

const patternDetailPayload = (body = {}) => ({
  colid: number(body.colid),
  patternid: text(body.patternid),
  academicyear: text(body.academicyear),
  program: text(body.program),
  programcode: text(body.programcode),
  pattern: text(body.pattern),
  section: text(body.section),
  question: text(body.question),
  questiontype: text(body.questiontype) || "Descriptive",
  includemathematicalexpressions: text(body.includemathematicalexpressions || body.includeMathematicalExpressions) === "Yes" ? "Yes" : "No",
  group: text(body.group),
  subquestion: text(body.subquestion),
  order: Number(body.order || 0),
  marks: Number(body.marks || 0),
  instructions: text(body.instructions),
  questionprompt: text(body.questionprompt || body.prompt || body.additionalprompt),
  status: text(body.status) || "Active",
  name: text(body.name),
  user: text(body.user)
});

const validatePattern = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "program", "programcode", "pattern"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const validatePatternDetail = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["patternid", "academicyear", "program", "programcode", "pattern", "section", "question"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const getAiConfigByType = async (colid, typeRegex) => (
  await AiConfiguration.findOne({ colid: Number(colid), type: typeRegex, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid: Number(colid), type: typeRegex, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const getAiConfig = async (colid) => getAiConfigByType(colid, /^gemini$/i);

const getOllamaConfig = async (colid, id) => (
  text(id)
    ? await OllamaConfiguration.findOne({ _id: text(id), colid: Number(colid), active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid: Number(colid), active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || await OllamaConfiguration.findOne({ colid: Number(colid), active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGemini = async (colid, model, prompt) => {
  const config = await getAiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini AI configuration is missing");
  const fallbackModels = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const models = [...new Set([text(model), ...fallbackModels].filter(Boolean))];
  let lastError = "";
  for (const geminiModel of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, responseMimeType: "application/json" }
      })
    });
    const data = await response.json();
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini API request failed for ${geminiModel}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

const callOpenAi = async (colid, model, prompt) => {
  const config = await getAiConfigByType(colid, /^(openai|chatgpt)$/i);
  if (!config?.apikey) throw new Error("Default active OpenAI AI configuration is missing");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apikey}`
    },
    body: JSON.stringify({
      model: text(model) || "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Return valid JSON only for academic question paper generation." },
        { role: "user", content: prompt }
      ],
      temperature: 0.35,
      response_format: { type: "json_object" }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "OpenAI API request failed");
  return data.choices?.[0]?.message?.content || "";
};

const callClaude = async (colid, model, prompt) => {
  const config = await getAiConfigByType(colid, /^(claude|anthropic)$/i);
  if (!config?.apikey) throw new Error("Default active Claude AI configuration is missing");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apikey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: text(model) || "claude-3-5-haiku-latest",
      max_tokens: 6000,
      temperature: 0.35,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Claude API request failed");
  return data.content?.map((part) => part.text || "").join("\n") || "";
};

const callOllama = async (colid, ollamaConfigId, prompt) => {
  const config = await getOllamaConfig(colid, ollamaConfigId);
  if (!config) throw new Error("Active Ollama configuration is missing");
  const baseUrl = text(config.serveraddress || config.baseurl || config.url).replace(/\/$/, "") || "http://localhost:11434";
  const model = text(config.modelname || config.model || "llama3.1");
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, format: "json", options: { temperature: 0.35 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama API request failed");
  return data.response || "";
};

const callQuestionAi = async (body, prompt) => {
  const provider = text(body.aiProvider || body.provider || "gemini").toLowerCase();
  if (provider === "openai" || provider === "chatgpt") return callOpenAi(body.colid, body.openaiModel, prompt);
  if (provider === "claude" || provider === "anthropic") return callClaude(body.colid, body.claudeModel, prompt);
  if (provider === "ollama") return callOllama(body.colid, body.ollamaConfigId || body.ollamaId, prompt);
  return callGemini(body.colid, text(body.geminiModel), prompt);
};

const callGeminiText = async (colid, model, prompt) => {
  const config = await getAiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini AI configuration is missing");
  const fallbackModels = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const models = [...new Set([text(model), ...fallbackModels].filter(Boolean))];
  let lastError = "";
  for (const geminiModel of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    const data = await response.json();
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
    lastError = data.error?.message || `Gemini API request failed for ${geminiModel}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

const parseOrRepairJson = async (colid, model, raw, expectedShape) => {
  try {
    return parseJson(raw);
  } catch (error) {
    const repairPrompt = `Return valid JSON only. Do not include markdown or commentary.
The previous AI response was intended to be ${expectedShape}, but it is invalid JSON.
Repair it into strictly valid JSON. Escape all quotes and newlines inside strings.
Invalid response:
${raw}`;
    const repairedRaw = await callGemini(colid, model, repairPrompt);
    return parseJson(repairedRaw);
  }
};

const flattenQuestionSections = (sections = []) => (sections || []).flatMap((section, sectionIndex) =>
  (section.questions || []).map((question, questionIndex) => ({
    sectionIndex,
    questionIndex,
    sectionTitle: text(section.title),
    patternsection: text(question.patternsection),
    patternquestion: text(question.patternquestion),
    patterngroup: text(question.patterngroup),
    patternsubquestion: text(question.patternsubquestion),
    question: text(question.question),
    answer: text(question.answer)
  }))
);

const mergeQuestionTranslations = (sections = [], translations = []) => {
  const nextSections = JSON.parse(JSON.stringify(sections || []));
  (translations || []).forEach((item) => {
    const sectionIndex = Number(item.sectionIndex);
    const questionIndex = Number(item.questionIndex);
    if (!Number.isInteger(sectionIndex) || !Number.isInteger(questionIndex)) return;
    const question = nextSections?.[sectionIndex]?.questions?.[questionIndex];
    if (!question || !text(item.language)) return;
    const existing = Array.isArray(question.translations) ? question.translations : [];
    const withoutLanguage = existing.filter((row) => text(row.language).toLowerCase() !== text(item.language).toLowerCase());
    question.translations = [...withoutLanguage, {
      language: text(item.language),
      question: text(item.question),
      answer: text(item.answer)
    }];
  });
  return nextSections;
};

const translateInSmallChunks = async (colid, model, sections = [], languages = []) => {
  const questions = flattenQuestionSections(sections);
  const translations = [];
  for (const language of languages) {
    for (const item of questions) {
      if (!item.question && !item.answer) continue;
      const questionPrompt = `Translate the text below to ${language}.
Return only the translated text. Do not return JSON, markdown, bullets, labels, or commentary.

${item.question}`;
      const answerPrompt = `Translate the text below to ${language}.
Return only the translated text. Do not return JSON, markdown, bullets, labels, or commentary.

${item.answer}`;
      const translatedQuestion = item.question ? await callGeminiText(colid, model, questionPrompt) : "";
      const translatedAnswer = item.answer ? await callGeminiText(colid, model, answerPrompt) : "";
      translations.push({
        sectionIndex: item.sectionIndex,
        questionIndex: item.questionIndex,
        language,
        question: stripCodeFence(translatedQuestion),
        answer: stripCodeFence(translatedAnswer)
      });
    }
  }
  return mergeQuestionTranslations(sections, translations);
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const courseFilter = buildFilter(req.query, courseFields);
    const examFilter = buildFilter(req.query, ["academicyear", "examcode", "programcode", "semester", "type"]);
    const [courses, exams, setters, users] = await Promise.all([
      ConductExamCourse.find(courseFilter).sort({ academicyear: -1, examcode: 1, program: 1, course: 1 }).lean(),
      ConductExam.find(examFilter).sort({ academicyear: -1, examcode: 1, examname: 1 }).lean(),
      PaperSetter.find({ colid }).sort({ papersettername: 1 }).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email role department").sort({ name: 1, email: 1 }).lean()
    ]);
    res.json({
      success: true,
      courses,
      exams,
      setters,
      users,
      academicyears: uniq([...courses.map((row) => row.academicyear), ...exams.map((row) => row.academicyear)]),
      examcodes: uniq([...courses.map((row) => row.examcode), ...exams.map((row) => row.examcode)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQuestionPatterns = async (req, res) => {
  try {
    const filter = buildFilter(req.query, patternFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await QuestionPattern.find(filter).sort({ academicyear: -1, program: 1, pattern: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveQuestionPattern = async (req, res) => {
  try {
    const item = patternPayload(req.body);
    const validation = validatePattern(item);
    if (validation) return res.status(400).json({ success: false, message: validation });
    const id = text(req.body._id);
    const filter = id ? { _id: id, colid: item.colid } : { colid: item.colid, academicyear: item.academicyear, programcode: item.programcode, pattern: item.pattern };
    const data = await QuestionPattern.findOneAndUpdate(filter, item, { upsert: !id, new: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "This question pattern already exists." : error.message });
  }
};

exports.deleteQuestionPatterns = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [text(req.body.id)].filter(Boolean);
    if (colid === undefined || !ids.length) return res.status(400).json({ success: false, message: "colid and ids are required" });
    await QuestionPattern.deleteMany({ colid, _id: { $in: ids } });
    await QuestionPatternDetail.deleteMany({ colid, patternid: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkQuestionPatterns = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (const [index, row] of rows.entries()) {
      const item = patternPayload({ ...row, colid: req.body.colid || row.colid, name: req.body.name || row.name, user: req.body.user || row.user });
      const validation = validatePattern(item);
      if (validation) {
        errors.push(`Row ${index + 1}: ${validation}`);
        continue;
      }
      await QuestionPattern.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, programcode: item.programcode, pattern: item.pattern },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQuestionPatternDetails = async (req, res) => {
  try {
    const filter = buildFilter(req.query, patternDetailFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await QuestionPatternDetail.find(filter).sort({ order: 1, section: 1, question: 1, group: 1, subquestion: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveQuestionPatternDetail = async (req, res) => {
  try {
    const item = patternDetailPayload(req.body);
    const validation = validatePatternDetail(item);
    if (validation) return res.status(400).json({ success: false, message: validation });
    const id = text(req.body._id);
    const filter = id ? { _id: id, colid: item.colid } : {
      colid: item.colid,
      patternid: item.patternid,
      section: item.section,
      question: item.question,
      group: item.group,
      subquestion: item.subquestion
    };
    const data = await QuestionPatternDetail.findOneAndUpdate(filter, item, { upsert: !id, new: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteQuestionPatternDetails = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [text(req.body.id)].filter(Boolean);
    if (colid === undefined || !ids.length) return res.status(400).json({ success: false, message: "colid and ids are required" });
    await QuestionPatternDetail.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkQuestionPatternDetails = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (const [index, row] of rows.entries()) {
      const item = patternDetailPayload({ ...row, colid: req.body.colid || row.colid, name: req.body.name || row.name, user: req.body.user || row.user });
      const validation = validatePatternDetail(item);
      if (validation) {
        errors.push(`Row ${index + 1}: ${validation}`);
        continue;
      }
      await QuestionPatternDetail.create(item);
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPanels = async (req, res) => {
  try {
    const filter = buildFilter(req.query, panelFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await PaperSetterPanel.find(filter).sort({ academicyear: -1, program: 1, panelname: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePanel = async (req, res) => {
  try {
    const item = panelPayload(req.body);
    const error = validatePanel(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await PaperSetterPanel.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await PaperSetterPanel.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, regulation: item.regulation, programcode: item.programcode, panelname: item.panelname },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "This paper setter panel already exists." : error.message });
  }
};

exports.deletePanel = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await PaperSetterPanel.deleteMany({ _id: { $in: ids }, colid });
    await PaperSetterPanelMember.deleteMany({ panelid: { $in: ids }, colid });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkPanels = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = panelPayload({ ...items[index], colid: req.body.colid || items[index].colid, name: req.body.name || items[index].name, user: req.body.user || items[index].user });
      const error = validatePanel(item);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await PaperSetterPanel.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, regulation: item.regulation, programcode: item.programcode, panelname: item.panelname },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPanelMembers = async (req, res) => {
  try {
    const filter = buildFilter(req.query, panelMemberFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (text(req.query.panelid)) filter.panelid = text(req.query.panelid);
    const data = await PaperSetterPanelMember.find(filter).sort({ academicyear: -1, program: 1, panelname: 1, membername: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePanelMembers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const panelid = text(req.body.panelid);
    if (colid === undefined || !panelid) return res.status(400).json({ success: false, message: "colid and panelid are required" });
    const panel = await PaperSetterPanel.findOne({ _id: panelid, colid }).lean();
    if (!panel) return res.status(404).json({ success: false, message: "Panel not found" });
    const users = Array.isArray(req.body.users) && req.body.users.length ? req.body.users : [req.body];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < users.length; index += 1) {
      const item = panelMemberPayload({ ...users[index], colid, panelid, createdby: req.body.name, createduser: req.body.user }, panel);
      const error = validatePanelMember(item);
      if (error) {
        errors.push({ rowNumber: users[index].rowNumber || index + 1, message: error });
        continue;
      }
      const savedMember = await PaperSetterPanelMember.findOneAndUpdate(
        { colid: item.colid, panelid: item.panelid, memberemail: item.memberemail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await createApprovalTasks({
        colid,
        user: text(req.body.user),
        createdby: text(req.body.name),
        academicyear: item.academicyear,
        approverrole: "All",
        title: `Approve paper setter panel member: ${item.membername || item.memberemail}`,
        category: "Paper setter panel approval",
        pagelink: "/conduct-exam-paper-setter-panel-approval",
        comments: `Paper setter panel ${item.panelname} has a member pending approval.`,
        referenceModel: "conductexampapersetterpanelmemberds",
        referenceId: savedMember?._id,
        level: "Panel"
      });
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "This member is already assigned to the panel." : error.message });
  }
};

exports.deletePanelMembers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await PaperSetterPanelMember.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvePanelMembers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const approvalstatus = text(req.body.approvalstatus) || "Approved";
    if (colid === undefined || !ids.length) return res.status(400).json({ success: false, message: "Select at least one member" });
    const result = await PaperSetterPanelMember.updateMany(
      { _id: { $in: ids }, colid },
      {
        $set: {
          approvalstatus,
          comments: text(req.body.comments),
          approvedby: text(req.body.approvedby || req.body.name),
          approvedbyemail: text(req.body.approvedbyemail || req.body.user),
          approveddate: new Date()
        }
      }
    );
    for (const id of ids) {
      await completeApprovalTasks({
        colid,
        category: "Paper setter panel approval",
        referenceModel: "conductexampapersetterpanelmemberds",
        referenceId: id,
        level: "Panel",
        comments: `Paper setter panel member marked ${approvalstatus} by ${text(req.body.name || req.body.user)}`
      });
    }
    res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSetters = async (req, res) => {
  try {
    const filter = buildFilter(req.query, setterFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await PaperSetter.find(filter).sort({ academicyear: -1, examcode: 1, program: 1, course: 1, papersettername: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveSetter = async (req, res) => {
  try {
    const item = setterPayload(req.body);
    const error = validateSetter(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await PaperSetter.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await PaperSetter.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, papersetteremail: item.papersetteremail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "This paper setter is already assigned for this course" : error.message });
  }
};

exports.deleteSetter = async (req, res) => {
  try {
    await PaperSetter.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkSetters = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = setterPayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user || items[index].user });
      const error = validateSetter(item);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await PaperSetter.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, papersetteremail: item.papersetteremail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignedPapers = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "exam", "examcode", "programcode", "coursecode", "status"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (text(req.query.papersetteremail || req.query.email)) filter.papersetteremail = text(req.query.papersetteremail || req.query.email).toLowerCase();
    const data = await PaperSetter.find(filter).sort({ academicyear: -1, examcode: 1, course: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQuestionPaper = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const papersetterid = text(req.query.papersetterid);
    if (colid === undefined || !papersetterid) return res.status(400).json({ success: false, message: "colid and papersetterid are required" });
    const setter = await PaperSetter.findOne({ _id: papersetterid, colid }).lean();
    if (!setter) return res.status(404).json({ success: false, message: "Paper setter assignment not found" });
    const paper = await QuestionPaper.findOne({ colid, papersetterid }).lean();
    const cos = await CourseOutcome.find({
      colid,
      academicyear: setter.academicyear,
      regulation: setter.regulation,
      programcode: setter.programcode,
      coursecode: setter.coursecode,
      status: /^Active$/i
    }).sort({ conumber: 1 }).lean();
    res.json({ success: true, setter, paper, cos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQuestionPaperSyllabusContext = async (req, res) => {
  try {
    const baseFilter = buildLooseCourseFilter(req.query);
    if (baseFilter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!baseFilter.coursecode) return res.status(400).json({ success: false, message: "coursecode is required" });

    const completeFilter = {
      colid: baseFilter.colid,
      coursecode: baseFilter.coursecode
    };
    ["academicyear", "regulation", "programcode", "semester"].forEach((field) => {
      if (baseFilter[field]) completeFilter[field] = baseFilter[field];
    });

    const timetableFilter = {
      colid: baseFilter.colid,
      coursecode: baseFilter.coursecode,
      workcompleted: { $exists: true, $ne: "" }
    };
    ["academicyear", "regulation", "programcode", "semester"].forEach((field) => {
      if (baseFilter[field]) timetableFilter[field] = baseFilter[field];
    });
    const [syllabusRows, coveredRows] = await Promise.all([
      Syllabus.find(completeFilter).sort({ module: 1 }).lean(),
      NepLmsTimetable.find(timetableFilter).sort({ classdate: 1, classtime: 1 }).lean()
    ]);

    const complete = groupedContext(syllabusRows, (row) => {
      const topics = splitTopics(row.syllabus);
      return topics.length ? topics : [row.syllabus];
    });
    const covered = groupedContext(coveredRows, (row) => {
      const topics = splitTopics(row.workcompleted);
      return topics;
    });

    res.json({
      success: true,
      complete,
      covered,
      coveredWorkCompleted: uniq(coveredRows.map((row) => row.workcompleted)),
      completeRows: syllabusRows,
      coveredRows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveQuestionPaper = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const papersetterid = text(req.body.papersetterid);
    if (colid === undefined || !papersetterid) return res.status(400).json({ success: false, message: "colid and papersetterid are required" });
    const setter = await PaperSetter.findOne({ _id: papersetterid, colid }).lean();
    if (!setter) return res.status(404).json({ success: false, message: "Paper setter assignment not found" });
    if (!setterIsActive(setter)) return res.status(400).json({ success: false, message: "Question paper submission is not active for this date range" });
    const existingPaper = await QuestionPaper.findOne({ colid, papersetterid }).select("status").lean();
    if (/^(InvigilatorSubmitted|Moderation In Progress|Moderation Submitted|Accepted)$/i.test(text(existingPaper?.status))) {
      return res.status(400).json({ success: false, message: "Question paper is already submitted for moderation and cannot be edited" });
    }
    const requestedStatus = text(req.body.status) || "Draft";
    if (/^(InvigilatorSubmitted|Moderation In Progress|Moderation Submitted|Accepted)$/i.test(requestedStatus)) {
      return res.status(400).json({ success: false, message: "Use Submit Paper to send the question paper for moderation" });
    }
    const { _id, createdAt, updatedAt, __v, ...setterData } = setter;
    const payload = {
      ...setterData,
      papersetterid: setter._id,
      status: requestedStatus,
      paperattachmenturl: text(req.body.paperattachmenturl),
      paperattachmentfilename: text(req.body.paperattachmentfilename),
      syllabussourceurl: text(req.body.syllabussourceurl),
      syllabussourcefilename: text(req.body.syllabussourcefilename),
      samplequestionpaperurl: text(req.body.samplequestionpaperurl),
      samplequestionpaperfilename: text(req.body.samplequestionpaperfilename),
      additionalaiprompt: text(req.body.additionalaiprompt || req.body.additionalAiPrompt),
      paperdocuments: docs(req.body.paperdocuments),
      patternid: text(req.body.patternid) || undefined,
      pattern: text(req.body.pattern),
      patterndescription: text(req.body.patterndescription),
      includemathematicalexpressions: text(req.body.includemathematicalexpressions || req.body.includeMathematicalExpressions) === "Yes" ? "Yes" : "No",
      patternrows: Array.isArray(req.body.patternrows) ? req.body.patternrows.map((row) => ({
        section: text(row.section),
        question: text(row.question),
        questiontype: text(row.questiontype) || "Descriptive",
        includemathematicalexpressions: text(row.includemathematicalexpressions || row.includeMathematicalExpressions) === "Yes" ? "Yes" : "No",
        group: text(row.group),
        subquestion: text(row.subquestion),
        order: Number(row.order || 0),
        marks: Number(row.marks || 0),
        instructions: text(row.instructions),
        questionprompt: text(row.questionprompt || row.prompt || row.additionalprompt)
      })) : [],
      translationlanguages: arr(req.body.translationlanguages),
      sections: Array.isArray(req.body.sections) ? req.body.sections.map((section) => ({
        title: text(section.title),
        instructions: text(section.instructions),
        marks: Number(section.marks || 0),
        questions: Array.isArray(section.questions) ? section.questions.map((question) => ({
          patternsection: text(question.patternsection),
          patternquestion: text(question.patternquestion),
          patterngroup: text(question.patterngroup),
          patternsubquestion: text(question.patternsubquestion),
          question: text(question.question),
          answer: text(question.answer),
          includemathematicalexpressions: text(question.includemathematicalexpressions || question.includeMathematicalExpressions) === "Yes" ? "Yes" : "No",
          questiontype: text(question.questiontype) || "Short Answer Type",
          difficultylevel: text(question.difficultylevel),
          language: text(question.language),
          marks: Number(question.marks || 0),
          bloomlevels: arr(question.bloomlevels),
          conumber: text(question.conumber),
          co: text(question.co),
          attachmenturl: text(question.attachmenturl),
          attachmentfilename: text(question.attachmentfilename),
          aimappingcomments: text(question.aimappingcomments),
          questionprompt: text(question.questionprompt || question.prompt || question.additionalprompt),
          translations: Array.isArray(question.translations) ? question.translations.map((translation) => ({
            language: text(translation.language),
            question: text(translation.question),
            answer: text(translation.answer)
          })).filter((translation) => translation.language && (translation.question || translation.answer)) : []
        })) : []
      })) : [],
      airesponse: text(req.body.airesponse),
      user: text(req.body.user)
    };
    const data = await QuestionPaper.findOneAndUpdate(
      { colid, papersetterid },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    await PaperSetter.findOneAndUpdate({ _id: papersetterid, colid }, { status: payload.status });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitQuestionPaper = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const papersetterid = text(req.body.papersetterid);
    if (colid === undefined || !papersetterid) return res.status(400).json({ success: false, message: "colid and papersetterid are required" });
    const paper = await QuestionPaper.findOne({ colid, papersetterid });
    if (!paper) return res.status(404).json({ success: false, message: "Save the question paper before submitting" });
    const setter = await PaperSetter.findOne({ _id: papersetterid, colid }).lean();
    if (!setterIsActive(setter)) return res.status(400).json({ success: false, message: "Question paper submission is not active for this date range" });
    if (/^(Moderation Submitted|Accepted)$/i.test(text(paper.status))) return res.status(400).json({ success: false, message: "This question paper is already locked" });
    const hasQuestion = (paper.sections || []).some((section) => (section.questions || []).some((question) => text(question.question)));
    if (!hasQuestion && !text(paper.paperattachmenturl)) return res.status(400).json({ success: false, message: "Add at least one question or upload the full question paper before submitting" });

    paper.status = "InvigilatorSubmitted";
    paper.user = text(req.body.user);
    await paper.save();
    await PaperSetter.findOneAndUpdate({ _id: papersetterid, colid }, { status: "InvigilatorSubmitted", user: text(req.body.user) });
    res.json({ success: true, data: paper });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveQuestionPaperDocuments = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const paperid = text(req.body.paperid);
    const papersetterid = text(req.body.papersetterid);
    const target = text(req.body.target) || "paperdocuments";
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!["paperdocuments", "moderationdocuments", "reviewdocuments"].includes(target)) return res.status(400).json({ success: false, message: "Invalid document target" });
    const filter = paperid ? { _id: paperid, colid } : { papersetterid, colid };
    const paper = await QuestionPaper.findOne(filter);
    if (!paper) return res.status(404).json({ success: false, message: "Question paper not found" });
    const incoming = docs(req.body.documents);
    paper[target] = incoming;
    paper.user = text(req.body.user);
    await paper.save();
    res.json({ success: true, data: paper });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });
    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/conduct-exam/question-papers/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    res.json({ success: true, data: { filename: cleanName, originalname: req.file.originalname, url: s3Url(config.bucket, config.region, key), key } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateQuestions = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const selectedModules = arr(req.body.selectedModules);
    const selectedTopics = arr(req.body.selectedTopics);
    const syllabusMode = text(req.body.syllabusMode) || "Complete Syllabus";
    const templatewise = text(req.body.templatewise) === "Yes" || req.body.templatewise === true;
    const additionalAiPrompt = text(req.body.additionalAiPrompt || req.body.additionalaiprompt);
    const [extractedSyllabusText, extractedSampleText] = await Promise.all([
      extractTextFromUrl(req.body.syllabusSourceUrl, req.body.syllabusSourceFilename),
      extractTextFromUrl(req.body.sampleQuestionPaperUrl, req.body.sampleQuestionPaperFilename)
    ]);
    const selectedSyllabusDetails = Array.isArray(req.body.selectedSyllabusDetails) ? req.body.selectedSyllabusDetails : [];
    const contextText = selectedModules.length || selectedTopics.length || selectedSyllabusDetails.length
      ? `
Syllabus source: ${syllabusMode}
Selected modules: ${selectedModules.join(", ") || "Not specified"}
Selected topics/content: ${selectedTopics.join(" | ") || "Not specified"}
Selected syllabus details from ERP: ${JSON.stringify(selectedSyllabusDetails)}
Important restriction: Generate questions only from the selected modules, selected topics/content, and selected syllabus details above. Do not use topics outside this selected syllabus context.`
      : "";
    const sourceFileText = text(req.body.syllabusSourceUrl)
      ? `
Additional syllabus/source file URL uploaded to AWS: ${text(req.body.syllabusSourceUrl)}
Extracted syllabus/source content from uploaded file:
${extractedSyllabusText || "The file text could not be extracted. Use the URL if the AI provider can access it, but do not ignore the selected ERP syllabus context."}`
      : "";
    const sampleQuestionPaperText = text(req.body.sampleQuestionPaperUrl)
      ? `
Sample question paper/template URL uploaded to AWS: ${text(req.body.sampleQuestionPaperUrl)}
Extracted sample paper/template text:
${extractedSampleText || "The file text could not be extracted. Use the uploaded URL if the AI provider can access it."}
STRICT TEMPLATE REQUIREMENT:
- Read this sample question paper/template URL and follow its format exactly.
- Match the same number of sections, number of questions, numbering style, sub-question style, mark distribution, instructions, and visual order.
- Use the sample only as a template for format/look/structure. Generate fresh questions strictly from the selected syllabus/course context.
- If the sample has tables, groups, case blocks, MCQ blocks, or descriptive sections, preserve that layout in the returned sections/questions.
- Do not add extra questions, remove questions, rename sections, change marks, or change optional/compulsory rules unless the additional AI prompt explicitly says so.`
      : "";
    const patternRows = Array.isArray(req.body.patternRows) ? req.body.patternRows : [];
    const includeMath = text(req.body.includeMathematicalExpressions || req.body.includemathematicalexpressions) === "Yes"
      || patternRows.some((row) => text(row.includemathematicalexpressions || row.includeMathematicalExpressions) === "Yes");
    const patternText = patternRows.length ? `
Question paper pattern selected: ${text(req.body.pattern)}
Pattern description: ${text(req.body.patterndescription)}
Generate exactly one question for each pattern row below. Preserve section, question, group, subquestion, order and marks exactly as supplied. If group or subquestion is blank, keep it blank.
Honor the questiontype and includemathematicalexpressions value for each row. If questiontype is MCQ, include four answer options and mark the correct option inside the question/answer text. If questiontype is Case Studies, include a brief case stem and the requested question. If includemathematicalexpressions is Yes, include valid mathematical notation for that row.
Pattern rows: ${JSON.stringify(patternRows.map((row, index) => ({
  section: text(row.section),
  question: text(row.question),
  questiontype: text(row.questiontype) || text(req.body.questiontype) || "Descriptive",
  includemathematicalexpressions: text(row.includemathematicalexpressions || row.includeMathematicalExpressions) === "Yes" ? "Yes" : "No",
  group: text(row.group),
  subquestion: text(row.subquestion),
  order: Number(row.order || index + 1),
  marks: Number(row.marks || 0),
  instructions: text(row.instructions),
  questionprompt: text(row.questionprompt || row.prompt || row.additionalprompt)
})))}`
      : "";
    const patternDriven = patternRows.length > 0;
    const responseShape = templatewise
      ? `{"sections":[{"title":"","instructions":"","marks":0,"questions":[...]}],"html":"printable question paper body html that follows the sample template exactly"}`
      : `{"questions":[...]}`;
    const generationQuantityRule = patternDriven
      ? `Generate exactly ${patternRows.length} question item(s), one for each supplied question format row. Do not ask for, infer, or use any separate question count. Do not merge rows and do not create extra rows.`
      : templatewise
        ? "Do not use any manually supplied question count or question type. Read the uploaded sample question paper/template and generate exactly the same number of sections and questions, with the same question numbering, sub-numbering, optional choices, marks and instruction layout."
      : `Create ${Number(req.body.count || 5)} exam questions.`;
    const prompt = `Return valid JSON only as ${responseShape}.
Important JSON rule: escape every backslash in mathematical notation. For example write "\\\\(x^2\\\\)" and "\\\\frac{a}{b}" inside JSON strings, not "\\(x^2\\)" or "\\frac{a}{b}".
Critical format rule: The selected/sample pattern is authoritative. The output must match the sample/pattern exactly in number of sections, number of questions, numbering, sub-numbering, marks, choice labels, tables, and order. If you cannot read an uploaded sample URL, still follow the explicit pattern rows and selected data exactly and do not invent extra structure.
${generationQuantityRule}
Course: ${text(req.body.course)} (${text(req.body.coursecode)})
Subject: ${text(req.body.subject)}
${patternDriven ? "Question type, marks, group, subquestion and math requirement must come only from each supplied format row." : templatewise ? "Question type, marks, sections, choices, groups and subquestions must come only from the uploaded sample format." : `Question type: ${text(req.body.questiontype)}`}
Difficulty: ${text(req.body.difficultylevel)}
Language: ${text(req.body.language)}
Bloom levels allowed: ${arr(req.body.bloomlevels).join(", ")}
Course outcomes available: ${JSON.stringify(req.body.cos || [])}
${includeMath ? "Mathematical mode: Include mathematical expressions and mathematical questions wherever relevant. Use clear Unicode mathematical symbols for simple notation and LaTeX delimiters \\(...\\) or \\[...\\] for equations, matrices, fractions, roots, summations, integrals and multi-line formulae. Ensure symbols are syntactically correct and printable." : ""}
${additionalAiPrompt ? `Additional AI prompt from user: ${additionalAiPrompt}` : ""}
${patternDriven ? "Question-specific prompt rule: if a format row has questionprompt, that prompt applies only to that row and must be followed for that row without affecting other rows." : ""}
${contextText}
${sourceFileText}
${sampleQuestionPaperText}
${patternText}
${templatewise ? "For templatewise generation, return sections directly and also return html. Each section must include title, instructions, marks and questions. Each question must include question, marks, questiontype, includemathematicalexpressions, difficultylevel, language, bloomlevels array, conumber, co. The section/question count and order must follow the sample template exactly. The html must be only the question-paper body, use inline styles, and reproduce the sample template look/feel, spacing, headings, tables, numbering, section structure and mark placement exactly. Mathematical symbols must be valid Unicode, MathML, or LaTeX delimited with \\\\( ... \\\\) / \\\\[ ... \\\\] so MathJax can render them. Do not return plain malformed slash commands like \\frac inside JSON." : "For each question include: patternsection, patternquestion, patterngroup, patternsubquestion, question, marks, questiontype, includemathematicalexpressions, difficultylevel, language, bloomlevels array, conumber, co."}`;
    const raw = await callQuestionAi({ ...req.body, colid }, prompt);
    const selectedRepairModel = text(req.body.geminiModel) || "gemini-2.5-flash";
    const parsed = await parseOrRepairJson(colid, selectedRepairModel, raw, responseShape);
    if (templatewise && Array.isArray(parsed.sections)) {
      return res.json({ success: true, sections: parsed.sections, html: parsed.html || "", data: parsed.sections.flatMap((section) => section.questions || []), raw });
    }
    res.json({ success: true, data: Array.isArray(parsed) ? parsed : (parsed.questions || []), raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.formatPatternwiseQuestionPaper = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const institution = await Institution.findOne({ colid }).lean() || {};
    const rules = text(req.body.rules) || "Create a professional compact A4 university question paper in the exact supplied pattern order.";
    const payload = {
      selectedPaper: req.body.selectedPaper || {},
      pattern: req.body.pattern || {},
      patternRows: req.body.patternRows || [],
      sections: req.body.sections || [],
      translationlanguages: req.body.translationlanguages || [],
      includemathematicalexpressions: text(req.body.includemathematicalexpressions || req.body.includeMathematicalExpressions) === "Yes" ? "Yes" : "No",
      samplequestionpaperurl: text(req.body.sampleQuestionPaperUrl || req.body.samplequestionpaperurl),
      samplequestionpaperfilename: text(req.body.sampleQuestionPaperFilename || req.body.samplequestionpaperfilename),
      additionalaiprompt: text(req.body.additionalAiPrompt || req.body.additionalaiprompt),
      aiProvider: text(req.body.aiProvider || req.body.provider || "Gemini"),
      openaiModel: text(req.body.openaiModel),
      claudeModel: text(req.body.claudeModel),
      ollamaConfigId: text(req.body.ollamaConfigId)
    };
    const [extractedSampleText, extractedSyllabusText] = await Promise.all([
      extractTextFromUrl(payload.samplequestionpaperurl, payload.samplequestionpaperfilename),
      extractTextFromUrl(req.body.syllabusSourceUrl || req.body.syllabussourceurl, req.body.syllabusSourceFilename || req.body.syllabussourcefilename)
    ]);
    const prompt = `Return valid JSON only as {"html":"..."}.
Important JSON rule: escape every backslash in mathematical notation. For example write "\\\\(x^2\\\\)" and "\\\\frac{a}{b}" inside JSON strings.
Create clean printable HTML for the question body of an A4 portrait question paper.
Use inline styles only. Do not include scripts, markdown, html, head, body, or style tags.
Institution details: ${JSON.stringify(institution)}
Formatting rules from user: ${rules}
Extracted sample paper/template text: ${extractedSampleText || "Not available"}
Extracted syllabus/source text: ${extractedSyllabusText || "Not available"}
Question paper payload: ${JSON.stringify(payload)}
Requirements:
- Do not repeat institution logo, institution name, address, exam, program, course, course code, or pattern name because the print wrapper already adds those.
- Display questions strictly as per pattern: section, question number, optional group, optional subquestion.
- If a sample question paper/template URL is supplied, follow its visible look and feel, ordering, section structure, numbering style, table structure, mark display, spacing and instruction placement as closely as possible.
- The formatted HTML must preserve the exact number of sections/questions already present in the payload. Do not create new questions or remove questions during formatting.
- Honor the additional AI prompt exactly unless it conflicts with the selected paper data.
- Include marks at the right side for every question when available.
- Include translations below the main question text where available.
- If mathematical expressions are present, preserve Unicode symbols and LaTeX delimiters exactly so MathJax can render them in the print preview.
- Keep the layout compact, black text, bordered outer sheet, professional examination format.`;
    const raw = await callQuestionAi({ ...req.body, colid }, prompt);
    const parsed = await parseOrRepairJson(colid, text(req.body.geminiModel) || "gemini-2.5-flash", raw, `{"html":"..."}`);
    res.json({ success: true, html: parsed.html || raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.translateQuestionPaper = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const languages = arr(req.body.languages);
    if (!languages.length) return res.status(400).json({ success: false, message: "Select at least one language" });
    const sections = Array.isArray(req.body.sections) ? req.body.sections : [];
    const nextSections = await translateInSmallChunks(colid, text(req.body.geminiModel), sections, languages);
    res.json({ success: true, data: nextSections });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.analyzeMapping = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const prompt = `Return valid JSON only as {"sections":[...]}.
Important JSON rule: escape every backslash in mathematical notation. For example write "\\\\(x^2\\\\)" and "\\\\frac{a}{b}" inside JSON strings.
Analyze the following question paper. For each question, choose the most suitable CO and Bloom taxonomy mapping from the available CO list and Bloom levels. Preserve the existing section/question order and text.
Available CO list: ${JSON.stringify(req.body.cos || [])}
Question paper sections: ${JSON.stringify(req.body.sections || [])}
For each question return: question, questiontype, difficultylevel, language, marks, bloomlevels array, conumber, co, attachmenturl, attachmentfilename, aimappingcomments.`;
    const raw = await callGemini(colid, text(req.body.geminiModel), prompt);
    const parsed = parseJson(raw);
    res.json({ success: true, data: Array.isArray(parsed) ? parsed : (parsed.sections || []), raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
