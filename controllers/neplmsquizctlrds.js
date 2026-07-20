const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const User = require("../Models/user");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const AiConfiguration = require("../Models/aiconfigurationds");
const Awsconfig = require("../Models/awsconfig");
const NepLmsQuiz = require("../Models/neplmsquizds");
const NepLmsQuizAttempt = require("../Models/neplmsquizattemptds");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

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
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();

const getAiConfig = async (colid, provider) => {
  const providerRegex = new RegExp(`^${escRegex(provider)}$`, "i");
  return AiConfiguration.findOne({
    colid: Number(colid),
    type: providerRegex,
    active: /^yes$/i,
    default: /^yes$/i
  }).sort({ _id: -1 }).lean()
    || AiConfiguration.findOne({
      colid: Number(colid),
      type: providerRegex,
      active: /^yes$/i
    }).sort({ _id: -1 }).lean();
};

const callChatGpt = async (apikey, prompt) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apikey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You create valid JSON MCQ quizzes for academic courses." },
        { role: "user", content: prompt }
      ],
      temperature: 0.35
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "ChatGPT API request failed");
  return data.choices?.[0]?.message?.content || "";
};

const callGemini = async (apikey, prompt) => {
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
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
    const data = await response.json();
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini API request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

const callClaude = async (apikey, prompt) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apikey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 5000,
      temperature: 0.35,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Claude API request failed");
  return data.content?.map((part) => part.text || "").join("\n") || "";
};

const callAi = async (provider, apikey, prompt) => {
  const normalized = text(provider).toLowerCase();
  if (normalized === "gemini") return callGemini(apikey, prompt);
  if (normalized === "claude") return callClaude(apikey, prompt);
  return callChatGpt(apikey, prompt);
};

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
  module: text(body.module),
  topic: text(body.topic),
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
  .filter((option) => option.text);

const questionPayload = (body = {}) => ({
  question: text(body.question),
  imageLink: text(body.imageLink || body.imagelink || body.imageurl),
  imageName: text(body.imageName || body.imagename || body.imagefilename),
  fileLink: text(body.fileLink || body.filelink || body.fileurl),
  fileName: text(body.fileName || body.filename),
  videoLink: text(body.videoLink || body.videolink || body.videourl),
  options: cleanOptions(body.options || []),
  score: number(body.score) || 1
});

const totalQuizMarks = (quiz) => (quiz.sections || []).reduce((sum, section) => (
  sum + (section.questions || []).reduce((sectionSum, question) => sectionSum + number(question.score), 0)
), 0);

const parseGeneratedQuestions = (content) => {
  const clean = stripCodeFence(content);
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  const jsonText = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("AI response did not contain a question array");
  return parsed.map((item) => ({
    question: text(item.question),
    score: number(item.score) || 1,
    options: cleanOptions(item.options || [])
  })).filter((item) => item.question && item.options.length >= 2 && item.options.some((option) => option.iscorrect));
};

const scoreAttempt = (quiz, rawAnswers = []) => {
  const answerMap = new Map(rawAnswers.map((answer) => [text(answer.questionid), Array.isArray(answer.selectedoptions) ? answer.selectedoptions.map(text).filter(Boolean) : []]));
  const answers = [];
  let obtainedmarks = 0;
  let totalmarks = 0;

  (quiz.sections || []).forEach((section) => {
    (section.questions || []).forEach((question) => {
      const questionId = String(question._id);
      const selected = [...new Set(answerMap.get(questionId) || [])].sort();
      const correct = (question.options || [])
        .filter((option) => option.iscorrect)
        .map((option) => text(option.text))
        .filter(Boolean)
        .sort();
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

const verifyQuizForStudent = async (quiz, student) => {
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
  if (!course) throw new Error("Quiz is not available for this student");
};

exports.getQuizzes = async (req, res) => {
  try {
    const filter = courseFilter(req.query);
    if (!filter.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await NepLmsQuiz.find(filter).sort({ startdatetime: -1, title: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createQuiz = async (req, res) => {
  try {
    const payload = quizPayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.coursecode) return res.status(400).json({ success: false, message: "Course is required" });
    if (!payload.title) return res.status(400).json({ success: false, message: "Quiz title is required" });
    if (!payload.startdatetime || Number.isNaN(payload.startdatetime.getTime())) return res.status(400).json({ success: false, message: "Start date and time is required" });
    if (!payload.enddatetime || Number.isNaN(payload.enddatetime.getTime())) return res.status(400).json({ success: false, message: "End date and time is required" });
    if (payload.enddatetime <= payload.startdatetime) return res.status(400).json({ success: false, message: "End date should be after start date" });
    const data = await NepLmsQuiz.create({ ...payload, sections: [] });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateQuiz = async (req, res) => {
  try {
    const data = await NepLmsQuiz.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid) },
      quizPayload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Quiz not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadQuizFile = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });
    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }
    const cleanName = path.basename(req.file.originalname || "file").replace(/[^\w.\-() ]/g, "_");
    const folder = `nep-lms/quiz-files/${text(req.body.context) || "question"}`;
    const key = `${colid}/${folder}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({
      accessKeyId: config.username,
      secretAccessKey: config.password,
      region: config.region
    });
    await s3.putObject({
      Bucket: config.bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || "application/octet-stream"
    }).promise();
    res.json({
      success: true,
      data: {
        filename: cleanName,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        bucket: config.bucket,
        region: config.region,
        key,
        url: s3Url(config.bucket, config.region, key)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteQuiz = async (req, res) => {
  try {
    await NepLmsQuiz.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    await NepLmsQuizAttempt.deleteMany({ quizid: req.body.id, colid: Number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addSection = async (req, res) => {
  try {
    const quiz = await NepLmsQuiz.findOne({ _id: req.body.quizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
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
    const quiz = await NepLmsQuiz.findOne({ _id: req.body.quizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
    quiz.sections.pull({ _id: req.body.sectionid });
    const data = await quiz.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addQuestion = async (req, res) => {
  try {
    const quiz = await NepLmsQuiz.findOne({ _id: req.body.quizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
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
    const quiz = await NepLmsQuiz.findOne({ _id: req.body.quizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
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

exports.generateQuestions = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const quiz = await NepLmsQuiz.findOne({ _id: req.body.quizid, colid });
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
    const section = quiz.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });

    const provider = text(req.body.provider);
    const language = text(req.body.language) || "English";
    const difficulty = text(req.body.difficulty) || "Medium";
    const additionalPrompt = text(req.body.additionalprompt || req.body.additionalPrompt || req.body.prompt);
    const questionCount = Math.max(1, Math.min(number(req.body.questioncount) || 5, 50));
    if (!provider) return res.status(400).json({ success: false, message: "AI provider is required" });

    const aiConfig = await getAiConfig(colid, provider);
    if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: `Active ${provider} AI configuration is missing` });

    const prompt = `Create exactly ${questionCount} multiple choice questions in ${language}.
Difficulty: ${difficulty}

Course context:
Academic year: ${quiz.academicyear}
Program: ${quiz.program} (${quiz.programcode})
Semester: ${quiz.semester}
Subject/Major: ${quiz.major}
Course: ${quiz.course} (${quiz.coursecode})
Selected modules: ${quiz.module}
Selected topics: ${quiz.topic}
Quiz title: ${quiz.title}
Section: ${section.title}

Return only valid JSON, no markdown. The JSON must be an array. Each array item must have:
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

Rules:
1. Each question must have four options.
2. One or more options may be correct.
3. Use the key exactly as "iscorrect".
4. Do not reveal answers in the question text.
5. Keep questions suitable for the selected difficulty.${additionalPrompt ? `\n6. Additional user instructions: ${additionalPrompt}` : ""}`;

    const generated = await callAi(provider, aiConfig.apikey, prompt);
    const questions = parseGeneratedQuestions(generated);
    if (!questions.length) return res.status(400).json({ success: false, message: "AI did not generate valid questions" });
    questions.slice(0, questionCount).forEach((question) => section.questions.push(question));
    const data = await quiz.save();
    res.json({ success: true, generated: questions.slice(0, questionCount).length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const quiz = await NepLmsQuiz.findOne({ _id: req.body.quizid, colid: Number(req.body.colid) });
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
    const section = quiz.sections.id(req.body.sectionid);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    section.questions.pull({ _id: req.body.questionid });
    const data = await quiz.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQuizAttempts = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (!filter.colid) return res.status(400).json({ success: false, message: "colid is required" });
    ["quizid", "coursecode", "regno", "academicyear", "semester", "facultyemail"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await NepLmsQuizAttempt.find(filter).sort({ submitteddate: -1, student: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitQuiz = async (req, res) => {
  try {
    const student = await getStudent(req.body);
    const quiz = await NepLmsQuiz.findOne({ _id: req.body.quizid, colid: Number(req.body.colid), status: "Active" }).lean();
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
    await verifyQuizForStudent(quiz, student);
    const now = new Date();
    if (now < new Date(quiz.startdatetime) || now > new Date(quiz.enddatetime)) {
      return res.status(400).json({ success: false, message: "Quiz is not active now" });
    }
    const scored = scoreAttempt(quiz, req.body.answers || []);
    const payload = {
      quizid: quiz._id,
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
      ...scored,
      submitteddate: now,
      status: "Submitted",
      colid: Number(req.body.colid),
      user: text(req.body.user)
    };
    const data = await NepLmsQuizAttempt.findOneAndUpdate(
      { colid: payload.colid, quizid: quiz._id, regno: student.regno },
      payload,
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getActiveStudentQuizzes = async (req, res) => {
  try {
    const student = await getStudent(req.query);
    const course = await WorkloadAssignment.findOne({
      colid: Number(req.query.colid),
      status: "Active",
      coursecode: text(req.query.coursecode),
      academicyear: text(req.query.academicyear),
      semester: text(req.query.semester),
      subject: { $regex: `^${escRegex(studentMajor(student))}$`, $options: "i" }
    }).lean();
    if (!course) return res.status(400).json({ success: false, message: "Course is not available for this student" });
    const now = new Date();
    const quizzes = await NepLmsQuiz.find({
      colid: Number(req.query.colid),
      academicyear: course.academicyear,
      semester: course.semester,
      coursecode: course.coursecode,
      status: "Active",
      startdatetime: { $lte: now },
      enddatetime: { $gte: now }
    }).sort({ enddatetime: 1 }).lean();
    const attempts = await NepLmsQuizAttempt.find({ colid: Number(req.query.colid), regno: student.regno, coursecode: course.coursecode }).lean();
    const attemptedIds = new Set(attempts.map((attempt) => String(attempt.quizid)));
    res.json({ success: true, data: quizzes.filter((quiz) => !attemptedIds.has(String(quiz._id))), attempts });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.totalQuizMarks = totalQuizMarks;
