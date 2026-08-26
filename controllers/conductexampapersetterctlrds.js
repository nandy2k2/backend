const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
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
const Awsconfig = require("../Models/awsconfig");
const Institution = require("../Models/insdetails");
const User = require("../Models/user");

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
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repaired = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u0000-\u001F]+/g, " ");
    return JSON.parse(repaired);
  }
};
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

const courseFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"];
const setterFields = [...courseFields, "papersettername", "papersetteremail", "status"];
const panelFields = ["academicyear", "regulation", "program", "programcode", "panelname", "status"];
const panelMemberFields = [...panelFields, "membername", "memberemail", "role", "department", "approvalstatus", "status"];
const patternFields = ["academicyear", "program", "programcode", "pattern", "status"];
const patternDetailFields = ["patternid", "academicyear", "program", "programcode", "pattern", "section", "question", "group", "subquestion", "status"];

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
  group: text(body.group),
  subquestion: text(body.subquestion),
  order: Number(body.order || 0),
  marks: Number(body.marks || 0),
  instructions: text(body.instructions),
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

const getAiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGemini = async (colid, model, prompt) => {
  const config = await getAiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini AI configuration is missing");
  const models = model ? [model] : ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
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

const callGeminiText = async (colid, model, prompt) => {
  const config = await getAiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini AI configuration is missing");
  const models = model ? [model] : ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
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
      await PaperSetterPanelMember.findOneAndUpdate(
        { colid: item.colid, panelid: item.panelid, memberemail: item.memberemail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
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
      paperdocuments: docs(req.body.paperdocuments),
      patternid: text(req.body.patternid) || undefined,
      pattern: text(req.body.pattern),
      patterndescription: text(req.body.patterndescription),
      patternrows: Array.isArray(req.body.patternrows) ? req.body.patternrows.map((row) => ({
        section: text(row.section),
        question: text(row.question),
        group: text(row.group),
        subquestion: text(row.subquestion),
        order: Number(row.order || 0),
        marks: Number(row.marks || 0),
        instructions: text(row.instructions)
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
    const contextText = selectedModules.length || selectedTopics.length
      ? `
Syllabus source: ${syllabusMode}
Selected modules: ${selectedModules.join(", ") || "Not specified"}
Selected topics/content: ${selectedTopics.join(" | ") || "Not specified"}
Important restriction: Generate questions only from the selected modules and selected topics/content above. Do not use topics outside this selected syllabus context.`
      : "";
    const sourceFileText = text(req.body.syllabusSourceUrl)
      ? `
Additional syllabus/source file URL uploaded to AWS: ${text(req.body.syllabusSourceUrl)}
Use this file link as source material for question generation. If the file content is accessible, extract and follow it.`
      : "";
    const patternRows = Array.isArray(req.body.patternRows) ? req.body.patternRows : [];
    const patternText = patternRows.length ? `
Question paper pattern selected: ${text(req.body.pattern)}
Pattern description: ${text(req.body.patterndescription)}
Generate exactly one question for each pattern row below. Preserve section, question, group, subquestion, order and marks exactly as supplied. If group or subquestion is blank, keep it blank.
Pattern rows: ${JSON.stringify(patternRows.map((row, index) => ({
  section: text(row.section),
  question: text(row.question),
  group: text(row.group),
  subquestion: text(row.subquestion),
  order: Number(row.order || index + 1),
  marks: Number(row.marks || 0),
  instructions: text(row.instructions)
})))}`
      : "";
    const prompt = `Return valid JSON only as {"questions":[...]}.
Create ${Number(req.body.count || 5)} exam questions.
Course: ${text(req.body.course)} (${text(req.body.coursecode)})
Subject: ${text(req.body.subject)}
Question type: ${text(req.body.questiontype)}
Difficulty: ${text(req.body.difficultylevel)}
Language: ${text(req.body.language)}
Bloom levels allowed: ${arr(req.body.bloomlevels).join(", ")}
Course outcomes available: ${JSON.stringify(req.body.cos || [])}
${contextText}
${sourceFileText}
${patternText}
For each question include: patternsection, patternquestion, patterngroup, patternsubquestion, question, marks, questiontype, difficultylevel, language, bloomlevels array, conumber, co.`;
    const raw = await callGemini(colid, text(req.body.geminiModel), prompt);
    const parsed = parseJson(raw);
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
      translationlanguages: req.body.translationlanguages || []
    };
    const prompt = `Return valid JSON only as {"html":"..."}.
Create clean printable HTML for the question body of an A4 portrait question paper.
Use inline styles only. Do not include scripts, markdown, html, head, body, or style tags.
Institution details: ${JSON.stringify(institution)}
Formatting rules from user: ${rules}
Question paper payload: ${JSON.stringify(payload)}
Requirements:
- Do not repeat institution logo, institution name, address, exam, program, course, course code, or pattern name because the print wrapper already adds those.
- Display questions strictly as per pattern: section, question number, optional group, optional subquestion.
- Include marks at the right side for every question when available.
- Include translations below the main question text where available.
- Keep the layout compact, black text, bordered outer sheet, professional examination format.`;
    const raw = await callGemini(colid, text(req.body.geminiModel), prompt);
    const parsed = parseJson(raw);
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
