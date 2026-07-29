const ContinuousFeedbackForm = require("../Models/continuousfeedbackformds");
const ContinuousFeedbackResponse = require("../Models/continuousfeedbackresponseds");
const Timetable = require("../Models/neplmstimetableds");
const User = require("../Models/user");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Institution = require("../Models/insdetails");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const cleanQuestions = (questions = []) =>
  (Array.isArray(questions) ? questions : [])
    .map((item, index) => ({
      _id: item._id,
      question: text(item.question || item),
      order: number(item.order) || index + 1
    }))
    .filter((item) => item.question);

const normalizeForm = (body = {}) => ({
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  course: text(body.course),
  coursecode: text(body.coursecode),
  title: text(body.title) || "Quick feedback",
  description: text(body.description),
  scale: Array.isArray(body.scale) && body.scale.length ? body.scale.map(text).filter(Boolean).slice(0, 5) : ["Poor", "Fair", "Good", "Very good", "Excellent"],
  questions: cleanQuestions(body.questions),
  status: text(body.status) || "Active",
  colid: Number(body.colid),
  user: text(body.user)
});

const getGeminiConfig = async (colid) =>
  (await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()) ||
  (await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean());

const callGemini = async ({ colid, model, prompt }) => {
  const config = await getGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Gemini API key is not configured");
  const selectedModel = text(model) || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini request failed");
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
};

const callOllama = async ({ colid, ollamaConfigId, prompt }) => {
  const query = { colid: Number(colid), active: /^yes$/i };
  const config = ollamaConfigId
    ? await OllamaConfiguration.findOne({ ...query, _id: ollamaConfigId }).lean()
    : (await OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean()) || (await OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean());
  if (!config) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${String(config.serveraddress || "").replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const parseQuestions = (value) => {
  const raw = text(value).replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.questions || [];
    return cleanQuestions(items);
  } catch (error) {
    return cleanQuestions(raw.split("\n").map((line) => line.replace(/^\d+[\).:-]\s*/, "")));
  }
};

const buildFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "semester", "section", "faculty", "facultyemail", "student", "studentemail", "regno", "formtitle"].forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  if (text(source.fromdate) || text(source.todate)) {
    filter.classdate = {};
    if (text(source.fromdate)) filter.classdate.$gte = text(source.fromdate);
    if (text(source.todate)) filter.classdate.$lte = text(source.todate);
  }
  return filter;
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const [timetable, forms, ollamaConfigs, institution] = await Promise.all([
      Timetable.find({ colid }).select("academicyear regulation program programcode course coursecode semester section faculty facultyemail").sort({ academicyear: -1 }).limit(5000).lean(),
      ContinuousFeedbackForm.find({ colid }).sort({ createdAt: -1 }).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    res.json({
      success: true,
      forms,
      institution,
      ollamaConfigs,
      geminiModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
      academicyears: uniqueSorted(timetable.map((item) => item.academicyear)),
      regulations: uniqueSorted(timetable.map((item) => item.regulation)),
      programs: uniqueSorted(timetable.map((item) => item.program)),
      programcodes: uniqueSorted(timetable.map((item) => item.programcode)),
      courses: uniqueSorted(timetable.map((item) => item.course)),
      coursecodes: uniqueSorted(timetable.map((item) => item.coursecode)),
      semesters: uniqueSorted(timetable.map((item) => item.semester)),
      sections: uniqueSorted(timetable.map((item) => item.section)),
      faculties: uniqueSorted(timetable.map((item) => item.faculty))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listForms = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "status"].forEach((field) => {
      if (text(req.query[field])) filter[field] = regex(req.query[field]);
    });
    const data = await ContinuousFeedbackForm.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveForm = async (req, res) => {
  try {
    const payload = normalizeForm(req.body);
    if (!payload.questions.length) return res.status(400).json({ success: false, message: "At least one question is required" });
    const data = req.body.id
      ? await ContinuousFeedbackForm.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ContinuousFeedbackForm.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteForms = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await ContinuousFeedbackForm.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateQuestions = async (req, res) => {
  try {
    const prompt = `Create ${number(req.body.count) || 5} concise Likert scale feedback questions for continuous classroom feedback.
Academic year: ${text(req.body.academicyear)}
Regulation: ${text(req.body.regulation)}
Program: ${text(req.body.program)} (${text(req.body.programcode)})
Course: ${text(req.body.course)} (${text(req.body.coursecode)})
Language: ${text(req.body.language) || "English"}
Additional prompt: ${text(req.body.prompt)}
Return only JSON in this format: [{"question":"...","order":1}]`;
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama({ colid: req.body.colid, ollamaConfigId: req.body.ollamaConfigId, prompt })
      : await callGemini({ colid: req.body.colid, model: req.body.geminiModel, prompt });
    res.json({ success: true, questions: parseQuestions(raw), raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentClasses = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const email = text(req.query.email || req.query.user);
    const regno = text(req.query.regno);
    const student = await User.findOne({ colid, $or: [{ regno }, { email }, { user: email }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const query = { colid, status: { $ne: "Inactive" } };
    ["academicyear", "regulation", "programcode", "semester", "section"].forEach((field) => {
      if (text(student[field])) query[field] = text(student[field]);
    });
    if (text(req.query.coursecode)) query.coursecode = text(req.query.coursecode);
    const [classes, responses, forms] = await Promise.all([
      Timetable.find(query).sort({ classdate: -1, classtime: -1 }).limit(500).lean(),
      ContinuousFeedbackResponse.find({ colid, $or: [{ regno: text(student.regno) }, { studentemail: text(student.email || student.user) }] }).select("formid timetableid").lean(),
      ContinuousFeedbackForm.find({ colid, status: /^active$/i }).sort({ createdAt: -1 }).lean()
    ]);
    const given = new Set(responses.map((item) => `${item.timetableid}:${item.formid}`));
    const data = classes.map((item) => {
      const matchingForms = forms.filter((form) =>
        (!form.academicyear || form.academicyear === item.academicyear) &&
        (!form.regulation || form.regulation === item.regulation) &&
        (!form.programcode || form.programcode === item.programcode) &&
        (!form.coursecode || form.coursecode === item.coursecode)
      );
      const givenFormIds = matchingForms.filter((form) => given.has(`${item._id}:${form._id}`)).map((form) => String(form._id));
      return { ...item, givenFormIds, feedbackgiven: matchingForms.length && givenFormIds.length >= matchingForms.length ? "Yes" : "No" };
    });
    res.json({ success: true, student, classes: data, forms });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitResponse = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const form = await ContinuousFeedbackForm.findOne({ _id: req.body.formid, colid }).lean();
    const cls = await Timetable.findOne({ _id: req.body.timetableid, colid }).lean();
    if (!form || !cls) return res.status(404).json({ success: false, message: "Feedback form or class not found" });
    const email = text(req.body.studentemail || req.body.user);
    const student = await User.findOne({ colid, $or: [{ regno: text(req.body.regno) }, { email }, { user: email }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const answers = (Array.isArray(req.body.answers) ? req.body.answers : []).map((item) => ({ ...item, rating: number(item.rating) }));
    const average = answers.length ? Number((answers.reduce((sum, item) => sum + number(item.rating), 0) / answers.length).toFixed(2)) : 0;
    const payload = {
      formid: String(form._id),
      formtitle: form.title,
      timetableid: String(cls._id),
      academicyear: cls.academicyear,
      regulation: cls.regulation,
      program: cls.program,
      programcode: cls.programcode,
      course: cls.course,
      coursecode: cls.coursecode,
      semester: cls.semester,
      section: cls.section,
      classdate: cls.classdate,
      classtime: cls.classtime,
      faculty: cls.faculty,
      facultyemail: cls.facultyemail,
      student: student.name,
      studentemail: student.email || student.user,
      regno: student.regno,
      answers,
      average,
      overallcomment: text(req.body.overallcomment),
      colid,
      user: text(req.body.user)
    };
    const data = await ContinuousFeedbackResponse.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    const duplicate = error.code === 11000;
    res.status(duplicate ? 409 : 500).json({ success: false, message: duplicate ? "Feedback is already submitted for this class and form" : error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const rows = await ContinuousFeedbackResponse.find(buildFilter(req.query)).sort({ submittedat: -1 }).limit(5000).lean();
    const institution = await Institution.findOne({ colid: Number(req.query.colid) }).lean();
    const byCourse = Object.values(rows.reduce((acc, item) => {
      const key = item.coursecode || "Not specified";
      acc[key] = acc[key] || { name: key, count: 0, total: 0 };
      acc[key].count += 1;
      acc[key].total += number(item.average);
      acc[key].average = Number((acc[key].total / acc[key].count).toFixed(2));
      return acc;
    }, {}));
    const byFaculty = Object.values(rows.reduce((acc, item) => {
      const key = item.faculty || "Not specified";
      acc[key] = acc[key] || { name: key, count: 0, total: 0 };
      acc[key].count += 1;
      acc[key].total += number(item.average);
      acc[key].average = Number((acc[key].total / acc[key].count).toFixed(2));
      return acc;
    }, {}));
    const distribution = [1, 2, 3, 4, 5].map((rating) => ({
      name: String(rating),
      count: rows.reduce((count, item) => count + (item.answers || []).filter((answer) => Number(answer.rating) === rating).length, 0)
    }));
    const average = rows.length ? Number((rows.reduce((sum, item) => sum + number(item.average), 0) / rows.length).toFixed(2)) : 0;
    res.json({ success: true, rows, byCourse, byFaculty, distribution, institution, summary: { responses: rows.length, average, classes: uniqueSorted(rows.map((item) => item.timetableid)).length, students: uniqueSorted(rows.map((item) => item.regno || item.studentemail)).length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
