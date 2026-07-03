const User = require("../Models/user");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const NepLmsLiveQuiz = require("../Models/neplmslivequizds");
const NepLmsLiveQuizAttempt = require("../Models/neplmslivequizattemptds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const escRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripCodeFence = (content) => text(content)
  .replace(/^```json\s*/i, "")
  .replace(/^```\s*/i, "")
  .replace(/```$/i, "")
  .trim();

const coursePayload = (body = {}) => ({
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  type: text(body.type),
  major: text(body.major || body.subject),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  faculty: text(body.faculty || body.facultyname),
  facultyemail: text(body.facultyemail),
  colid: Number(body.colid),
  user: text(body.user)
});

const quizPayload = (body = {}) => ({
  ...coursePayload(body),
  title: text(body.title),
  startdatetime: body.startdatetime ? new Date(body.startdatetime) : null,
  enddatetime: body.enddatetime ? new Date(body.enddatetime) : null,
  status: text(body.status) || "Active"
});

const courseFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  ["academicyear", "regulation", "program", "programcode", "type", "major", "semester", "course", "coursecode", "facultyemail", "status"].forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const cleanOptions = (options = []) => options
  .map((option) => ({ text: text(option.text), iscorrect: Boolean(option.iscorrect) }))
  .filter((option) => option.text)
  .map((option, index, arr) => ({ ...option, iscorrect: option.iscorrect && arr.findIndex((item) => item.iscorrect) === index }));

const getAiConfig = async (colid, provider) => {
  const providerRegex = new RegExp(`^${escRegex(provider)}$`, "i");
  return AiConfiguration.findOne({ colid: Number(colid), type: providerRegex, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || AiConfiguration.findOne({ colid: Number(colid), type: providerRegex, active: /^yes$/i }).sort({ _id: -1 }).lean();
};

const getOllamaConfig = async (colid, configId) => {
  const query = { colid: Number(colid), active: /^yes$/i };
  if (text(configId)) {
    const selected = await OllamaConfiguration.findOne({ ...query, _id: configId }).lean();
    if (selected) return selected;
  }
  return OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean();
};

const callGemini = async (apikey, prompt, preferredModel = "gemini-2.5-flash") => {
  const models = [...new Set([text(preferredModel), "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean))];
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35 }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini API request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

const callOllama = async (config, prompt) => {
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const model = text(config.modelname);
  if (!model) throw new Error("Ollama model name is missing");
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.35 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const parseGeneratedQuestions = (content) => {
  const clean = stripCodeFence(content);
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  const jsonText = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  const repairJsonText = (value) => value
    .replace(/\\(?!["\\/bfnrtu])/g, "\\\\")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    try {
      parsed = JSON.parse(repairJsonText(jsonText));
    } catch (repairError) {
      throw new Error(`AI response was not valid JSON: ${repairError.message}`);
    }
  }
  if (!Array.isArray(parsed)) throw new Error("AI response did not contain a question array");
  return parsed.map((item) => ({
    question: text(item.question),
    score: number(item.score) || 1,
    imageLink: text(item.imageLink),
    videoLink: text(item.videoLink),
    fileLink: text(item.fileLink),
    options: cleanOptions(item.options || [])
  })).filter((item) => item.question && item.options.length >= 2 && item.options.some((option) => option.iscorrect));
};

const questionPayload = (body = {}) => ({
  question: text(body.question),
  options: cleanOptions(body.options || []),
  score: number(body.score) || 1,
  imageLink: text(body.imageLink),
  videoLink: text(body.videoLink),
  fileLink: text(body.fileLink)
});

const scoreAttempt = (quiz, rawAnswers = []) => {
  const answerMap = new Map(rawAnswers.map((answer) => [text(answer.questionid), Array.isArray(answer.selectedoptions) ? answer.selectedoptions.map(text).filter(Boolean) : []]));
  const answers = [];
  let obtainedmarks = 0;
  let totalmarks = 0;
  (quiz.sections || []).forEach((section) => {
    (section.questions || []).forEach((question) => {
      const questionId = String(question._id);
      const selected = [...new Set(answerMap.get(questionId) || [])].sort();
      const correct = (question.options || []).filter((option) => option.iscorrect).map((option) => text(option.text)).filter(Boolean).sort();
      const maxscore = number(question.score);
      const score = selected.length === correct.length && selected.every((value, index) => value === correct[index]) ? maxscore : 0;
      totalmarks += maxscore;
      obtainedmarks += score;
      answers.push({ questionid: questionId, selectedoptions: selected, score, maxscore });
    });
  });
  return { answers, totalmarks, obtainedmarks };
};

const getStudent = async (source = {}) => {
  const colid = Number(source.colid);
  const regno = text(source.regno);
  if (!colid) throw new Error("colid is required");
  if (!regno) throw new Error("regno is required");
  const student = await User.findOne({ colid, regno }).lean();
  if (!student) throw new Error("Student not found");
  return student;
};

const studentMajor = (student) => text(student.Major || student.major || student.majorname || student.department);

const verifyLiveQuizForStudent = async (quiz, student) => {
  const query = {
    colid: quiz.colid,
    status: "Active",
    academicyear: quiz.academicyear,
    programcode: quiz.programcode,
    semester: quiz.semester,
    coursecode: quiz.coursecode
  };
  const major = studentMajor(student);
  if (major) query.subject = { $regex: `^${escRegex(major)}$`, $options: "i" };
  const course = await WorkloadAssignment.findOne(query).lean();
  if (!course) throw new Error("Live quiz is not available for this student");
};

exports.getLiveQuizzes = async (req, res) => {
  try {
    const filter = courseFilter(req.query);
    if (!filter.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (req.query.available === "student") {
      const now = new Date();
      filter.status = "Active";
      filter.startdatetime = { $lte: now };
      filter.enddatetime = { $gte: now };
    }
    const data = await NepLmsLiveQuiz.find(filter).sort({ startdatetime: -1, title: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createLiveQuiz = async (req, res) => {
  try {
    const payload = quizPayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.coursecode) return res.status(400).json({ success: false, message: "Course is required" });
    if (!payload.title) return res.status(400).json({ success: false, message: "Live quiz title is required" });
    if (!payload.startdatetime || Number.isNaN(payload.startdatetime.getTime())) return res.status(400).json({ success: false, message: "Start date and time is required" });
    if (!payload.enddatetime || Number.isNaN(payload.enddatetime.getTime())) return res.status(400).json({ success: false, message: "End date and time is required" });
    if (payload.enddatetime <= payload.startdatetime) return res.status(400).json({ success: false, message: "End date should be after start date" });
    const data = await NepLmsLiveQuiz.create({ ...payload, sections: [] });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateLiveQuiz = async (req, res) => {
  try {
    const data = await NepLmsLiveQuiz.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid) },
      quizPayload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Live quiz not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteLiveQuiz = async (req, res) => {
  try {
    await NepLmsLiveQuiz.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    await NepLmsLiveQuizAttempt.deleteMany({ livequizid: req.body.id, colid: Number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addSection = async (req, res) => {
  try {
    const quiz = await NepLmsLiveQuiz.findOne({ _id: req.body.livequizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Live quiz not found" });
    const title = text(req.body.title);
    if (!title) return res.status(400).json({ success: false, message: "Section title is required" });
    quiz.sections.push({ title, questions: [] });
    const data = await quiz.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSection = async (req, res) => {
  try {
    const quiz = await NepLmsLiveQuiz.findOne({ _id: req.body.livequizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Live quiz not found" });
    quiz.sections.pull({ _id: req.body.sectionid });
    const data = await quiz.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addQuestion = async (req, res) => {
  try {
    const quiz = await NepLmsLiveQuiz.findOne({ _id: req.body.livequizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Live quiz not found" });
    const section = quiz.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    const payload = questionPayload(req.body);
    if (!payload.question) return res.status(400).json({ success: false, message: "Question is required" });
    if (payload.options.length < 2) return res.status(400).json({ success: false, message: "At least two options are required" });
    if (!payload.options.some((option) => option.iscorrect)) return res.status(400).json({ success: false, message: "Select at least one correct option" });
    section.questions.push(payload);
    const data = await quiz.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const quiz = await NepLmsLiveQuiz.findOne({ _id: req.body.livequizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Live quiz not found" });
    const section = quiz.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    const question = section.questions.id(req.body.questionid);
    if (!question) return res.status(404).json({ success: false, message: "Question not found" });
    const payload = questionPayload(req.body);
    if (!payload.question) return res.status(400).json({ success: false, message: "Question is required" });
    if (payload.options.length < 2) return res.status(400).json({ success: false, message: "At least two options are required" });
    if (!payload.options.some((option) => option.iscorrect)) return res.status(400).json({ success: false, message: "Select at least one correct option" });
    question.set(payload);
    const data = await quiz.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const quiz = await NepLmsLiveQuiz.findOne({ _id: req.body.livequizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Live quiz not found" });
    const section = quiz.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    section.questions.pull({ _id: req.body.questionid });
    const data = await quiz.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateQuestions = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const quiz = await NepLmsLiveQuiz.findOne({ _id: req.body.livequizid, colid });
    if (!quiz) return res.status(404).json({ success: false, message: "Live quiz not found" });
    const section = quiz.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    const provider = text(req.body.provider || "Gemini");
    const language = text(req.body.language) || "English";
    const difficulty = text(req.body.difficulty) || "Medium";
    const questionCount = Math.max(1, Math.min(number(req.body.questioncount) || 5, 50));
    const syllabusReferences = Array.isArray(req.body.syllabusReferences)
      ? req.body.syllabusReferences.map((item) => ({
        module: text(item.module),
        topic: text(item.topic || item.syllabus),
        syllabus: text(item.syllabus || item.topic)
      })).filter((item) => item.module || item.topic || item.syllabus)
      : [];
    if (!syllabusReferences.length) return res.status(400).json({ success: false, message: "Select module and topic from syllabus before AI generation" });
    const prompt = `Create exactly ${questionCount} live quiz MCQ questions in ${language}.
Difficulty: ${difficulty}

Course context:
Academic year: ${quiz.academicyear}
Program: ${quiz.program} (${quiz.programcode})
Semester: ${quiz.semester}
Subject/Major: ${quiz.major}
Course: ${quiz.course} (${quiz.coursecode})
Quiz title: ${quiz.title}
Section: ${section.title}

Selected syllabus reference:
${JSON.stringify(syllabusReferences, null, 2)}

Use only the selected modules and topics above as the content reference. Do not create questions from unrelated course areas.

Return only valid JSON, no markdown. The JSON must be an array. Each item must have:
{
  "question": "question text",
  "score": 1,
  "options": [
    { "text": "option text", "iscorrect": true },
    { "text": "option text", "iscorrect": false },
    { "text": "option text", "iscorrect": false },
    { "text": "option text", "iscorrect": false }
  ]
}

Exactly one option must have "iscorrect": true for every question.`;
    let generated = "";
    if (provider.toLowerCase() === "ollama") {
      const ollamaConfig = await getOllamaConfig(colid, req.body.ollamaConfigId);
      if (!ollamaConfig) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      generated = await callOllama(ollamaConfig, prompt);
    } else {
      const aiConfig = await getAiConfig(colid, "Gemini");
      if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });
      generated = await callGemini(aiConfig.apikey, prompt, req.body.geminiModel);
    }
    const questions = parseGeneratedQuestions(generated);
    if (!questions.length) return res.status(400).json({ success: false, message: "AI did not generate valid questions" });
    questions.slice(0, questionCount).forEach((question) => section.questions.push(question));
    const data = await quiz.save();
    res.json({ success: true, generated: questions.slice(0, questionCount).length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveDraftAnswer = async (req, res) => {
  try {
    const student = await getStudent(req.body);
    const colid = Number(req.body.colid);
    const quiz = await NepLmsLiveQuiz.findOne({ _id: req.body.livequizid, colid, status: "Active" }).lean();
    if (!quiz) return res.status(404).json({ success: false, message: "Live quiz not found" });
    await verifyLiveQuizForStudent(quiz, student);
    const existing = await NepLmsLiveQuizAttempt.findOne({ colid, livequizid: quiz._id, regno: student.regno }).lean();
    if (existing?.status === "Submitted") return res.status(400).json({ success: false, message: "Quiz already submitted" });
    const scored = scoreAttempt(quiz, req.body.answers || []);
    const data = await NepLmsLiveQuizAttempt.findOneAndUpdate(
      { colid, livequizid: quiz._id, regno: student.regno },
      {
        livequizid: quiz._id,
        quiztitle: quiz.title,
        academicyear: quiz.academicyear,
        regulation: quiz.regulation,
        program: quiz.program,
        programcode: quiz.programcode,
        type: quiz.type,
        major: quiz.major,
        semester: quiz.semester,
        course: quiz.course,
        coursecode: quiz.coursecode,
        faculty: quiz.faculty,
        facultyemail: quiz.facultyemail,
        student: student.name || "",
        regno: student.regno,
        email: student.email || "",
        phone: student.phone || "",
        answers: scored.answers,
        totalmarks: scored.totalmarks,
        obtainedmarks: scored.obtainedmarks,
        lastactivitydate: new Date(),
        status: "Draft",
        colid,
        user: text(req.body.user)
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.submitLiveQuiz = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const student = await getStudent(req.body);
    const quiz = await NepLmsLiveQuiz.findOne({ _id: req.body.livequizid, colid, status: "Active" }).lean();
    if (!quiz) return res.status(404).json({ success: false, message: "Live quiz not found" });
    await verifyLiveQuizForStudent(quiz, student);
    const existing = await NepLmsLiveQuizAttempt.findOne({ colid, livequizid: quiz._id, regno: student.regno }).lean();
    if (existing?.status === "Submitted") return res.status(400).json({ success: false, message: "Quiz already submitted" });
    const scored = scoreAttempt(quiz, req.body.answers || existing?.answers || []);
    const data = await NepLmsLiveQuizAttempt.findOneAndUpdate(
      { colid, livequizid: quiz._id, regno: student.regno },
      {
        livequizid: quiz._id,
        quiztitle: quiz.title,
        academicyear: quiz.academicyear,
        regulation: quiz.regulation,
        program: quiz.program,
        programcode: quiz.programcode,
        type: quiz.type,
        major: quiz.major,
        semester: quiz.semester,
        course: quiz.course,
        coursecode: quiz.coursecode,
        faculty: quiz.faculty,
        facultyemail: quiz.facultyemail,
        student: student.name || "",
        regno: student.regno,
        email: student.email || "",
        phone: student.phone || "",
        answers: scored.answers,
        totalmarks: scored.totalmarks,
        obtainedmarks: scored.obtainedmarks,
        status: "Submitted",
        submitteddate: new Date(),
        lastactivitydate: new Date(),
        colid,
        user: text(req.body.user)
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getAttempt = async (req, res) => {
  try {
    const student = await getStudent(req.query);
    const data = await NepLmsLiveQuizAttempt.findOne({ colid: Number(req.query.colid), livequizid: req.query.livequizid, regno: student.regno }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const livequizid = text(req.query.livequizid);
    if (!colid || !livequizid) return res.status(400).json({ success: false, message: "colid and live quiz are required" });
    const data = await NepLmsLiveQuizAttempt.find({ colid, livequizid }).sort({ obtainedmarks: -1, lastactivitydate: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
