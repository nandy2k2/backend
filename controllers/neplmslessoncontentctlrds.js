const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const NepLmsResource = require("../Models/neplmsresourceds");
const NepLmsQuiz = require("../Models/neplmsquizds");
const NepLmsQuizAttempt = require("../Models/neplmsquizattemptds");
const NepLmsLessonContent = require("../Models/neplmslessoncontentds");
const NepLmsLessonContentProgress = require("../Models/neplmslessoncontentprogressds");
const NepLmsMindMap = require("../Models/neplmsmindmapds");
const NepLmsClassGroup = require("../Models/neplmsclassgroupds");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();

const getAiConfig = async (colid, provider = "Gemini") => {
  const providerRegex = new RegExp(`^${escapeRegex(provider)}$`, "i");
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

const uploadBuffer = async ({ colid, buffer, filename, mimetype, folder }) => {
  const config = await getDefaultAwsConfig(colid);
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
    throw new Error("Default AWS configuration is incomplete");
  }
  const cleanName = path.basename(filename || "file").replace(/[^\w.\-() ]/g, "_");
  const key = `${Number(colid)}/${folder}/${Date.now()}-${cleanName}`;
  const s3 = new AWS.S3({
    accessKeyId: config.username,
    secretAccessKey: config.password,
    region: config.region
  });
  await s3.putObject({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype || "application/octet-stream"
  }).promise();
  return {
    filename: cleanName,
    originalname: filename,
    mimetype,
    size: buffer.length,
    bucket: config.bucket,
    region: config.region,
    key,
    filelink: s3Url(config.bucket, config.region, key)
  };
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
  coursegroup: text(body.coursegroup || body.coursegrouo || body.groupname),
  faculty: text(body.faculty || body.facultyname),
  facultyemail: text(body.facultyemail),
  colid: Number(body.colid),
  user: text(body.user)
});

const parseFlashcards = (value) => {
  if (Array.isArray(value)) return value.map((item) => ({
    question: text(item.question),
    questionimage: text(item.questionimage),
    answer: text(item.answer)
  })).filter((item) => item.question || item.answer || item.questionimage);
  if (!text(value)) return [];
  try {
    const parsed = JSON.parse(value);
    return parseFlashcards(parsed);
  } catch (error) {
    return [];
  }
};

const contentPayload = async (body = {}) => {
  const base = coursePayload(body);
  const lesson = text(body.lessonresourceid)
    ? await NepLmsResource.findOne({ _id: body.lessonresourceid, colid: base.colid, resourcetype: "Lesson Plan" }).lean()
    : null;
  const quiz = text(body.quizid)
    ? await NepLmsQuiz.findOne({ _id: body.quizid, colid: base.colid }).lean()
    : null;
  const mindmap = text(body.mindmapid)
    ? await NepLmsMindMap.findOne({ _id: body.mindmapid, colid: base.colid }).lean()
    : null;
  return {
    ...base,
    lessonresourceid: text(body.lessonresourceid) || undefined,
    lessonplantitle: text(body.lessonplantitle || lesson?.title),
    sequence: number(body.sequence, 1),
    contenttype: text(body.contenttype),
    title: text(body.title),
    section: text(body.section),
    description: text(body.description),
    topics: text(body.topics),
    filelink: text(body.filelink),
    videolink: text(body.videolink),
    quizid: text(body.quizid) || undefined,
    quiztitle: text(body.quiztitle || quiz?.title),
    mindmapid: text(body.mindmapid) || undefined,
    mindmaptitle: text(body.mindmaptitle || mindmap?.title),
    flashcards: parseFlashcards(body.flashcards),
    status: text(body.status) || "Active"
  };
};

const buildFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  ["lessonresourceid", "academicyear", "semester", "coursecode", "coursegroup", "facultyemail", "contenttype", "section", "status"].forEach((field) => {
    if (text(source[field])) filter[field] = source[field];
  });
  return filter;
};

const safeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[char]));

const stripCodeFence = (content) => text(content)
  .replace(/^```html\s*/i, "")
  .replace(/^```\s*/i, "")
  .replace(/```$/i, "")
  .trim();

const callGemini = async (apikey, prompt, preferredModel = "gemini-2.5-flash") => {
  const models = [...new Set([preferredModel, "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].map(text).filter(Boolean))];
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllama = async (config, prompt) => {
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const model = text(config.modelname);
  if (!model) throw new Error("Ollama model name is missing");
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.4 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const buildAiPrompt = (body) => {
  const contentType = text(body.contenttype) || "Text";
  const additionalPrompt = text(body.additionalprompt || body.additionalPrompt || body.prompt);
  const contentInstruction = contentType === "Infographics"
    ? "Create a visual infographic-style HTML page. Use CSS cards, timelines, flow arrows, comparison blocks, color accents, concise labels, and visual hierarchy. It should feel like an educational infographic, not a plain article."
    : "Explain the topic clearly, then add examples, practice tasks, reflection prompts and short recap.";
  return `Create student-ready sequential learning content as clean HTML.

Course: ${text(body.course)} (${text(body.coursecode)})
Program: ${text(body.program)} (${text(body.programcode)})
Semester: ${text(body.semester)}
Lesson plan: ${text(body.lessonplantitle)}
Content type: ${contentType}
Content title: ${text(body.title)}
Topics: ${text(body.topics)}
Description/instructions: ${text(body.description)}
Language: ${text(body.language) || "English"}

Requirements:
1. Return a complete HTML document only.
2. ${contentInstruction}
3. Make it visually readable for students.
4. Do not include markdown fences.${additionalPrompt ? `\n5. Additional user instructions: ${additionalPrompt}` : ""}`;
};

const buildFlashcardPrompt = (body) => {
  const additionalPrompt = text(body.additionalprompt || body.additionalPrompt || body.prompt);
  return `Create flashcards for student revision.

Course: ${text(body.course)} (${text(body.coursecode)})
Program: ${text(body.program)} (${text(body.programcode)})
Semester: ${text(body.semester)}
Lesson plan: ${text(body.lessonplantitle)}
Title: ${text(body.title)}
Topics: ${text(body.topics)}
Description/instructions: ${text(body.description)}
Language: ${text(body.language) || "English"}
Number of flashcards: ${Math.max(1, number(body.flashcardcount, 6))}

Return only valid JSON in this exact format:
[
  { "question": "front side question", "answer": "back side answer" }
]

Rules:
1. No markdown fences.
2. Keep each question short and suitable for a flash card.
3. Answers should be accurate but compact.
4. Use only ${text(body.language) || "English"}.${additionalPrompt ? `\n5. Additional user instructions: ${additionalPrompt}` : ""}`;
};

const parseJsonArray = (content) => {
  const clean = stripCodeFence(content);
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch (innerError) {
      return [];
    }
  }
};

const wrapHtml = (body, content) => {
  const clean = stripCodeFence(content);
  if (/<!doctype html|<html[\s>]/i.test(clean)) return clean;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeHtml(body.title || "Learning Content")}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; line-height: 1.58; color: #1f2937; }
    h1, h2, h3 { color: #12377a; }
    .meta { border: 1px solid #d8deea; padding: 14px; background: #f7f9ff; margin-bottom: 20px; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <h1>${safeHtml(body.title || "Learning Content")}</h1>
  <div class="meta">
    <strong>Course:</strong> ${safeHtml(body.course)} (${safeHtml(body.coursecode)})<br />
    <strong>Lesson:</strong> ${safeHtml(body.lessonplantitle)}<br />
    <strong>Topics:</strong> ${safeHtml(body.topics)}
  </div>
  ${clean}
</body>
</html>`;
};

exports.getLessonContent = async (req, res) => {
  try {
    const data = await NepLmsLessonContent.find(buildFilter(req.query)).sort({ sequence: 1, createdAt: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveLessonContent = async (req, res) => {
  try {
    const payload = await contentPayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.lessonresourceid) return res.status(400).json({ success: false, message: "Lesson plan is required" });
    if (!payload.contenttype) return res.status(400).json({ success: false, message: "Content type is required" });
    if (!payload.title) return res.status(400).json({ success: false, message: "Title is required" });
    const query = { _id: req.body.id, colid: payload.colid };
    const data = text(req.body.id)
      ? await NepLmsLessonContent.findOneAndUpdate(query, payload, { new: true, runValidators: true })
      : await NepLmsLessonContent.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteLessonContent = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const id = text(req.body.id);
    await NepLmsLessonContent.findOneAndDelete({ _id: id, colid });
    await NepLmsLessonContentProgress.deleteMany({ contentid: id, colid });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Please select a file" });
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const uploaded = await uploadBuffer({
      colid,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      folder: `nep-lms-lesson-content/${text(req.body.coursecode) || "course"}`
    });
    res.json({ success: true, data: uploaded, url: uploaded.filelink });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateFile = async (req, res) => {
  try {
    const payload = await contentPayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    let generated = "";
    if (text(req.body.provider).toLowerCase() === "ollama") {
      const ollamaConfig = await getOllamaConfig(payload.colid, req.body.ollamaConfigId);
      if (!ollamaConfig) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      generated = await callOllama(ollamaConfig, buildAiPrompt({ ...req.body, ...payload }));
    } else {
      const aiConfig = await getAiConfig(payload.colid, "Gemini");
      if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });
      generated = await callGemini(aiConfig.apikey, buildAiPrompt({ ...req.body, ...payload }), req.body.model);
    }
    const html = wrapHtml({ ...req.body, ...payload }, generated);
    const buffer = Buffer.from(html, "utf8");
    const filename = `${path.basename(payload.coursecode || "course").replace(/[^\w.\-() ]/g, "_")}-${Date.now()}-lesson-content.html`;
    const uploaded = await uploadBuffer({
      colid: payload.colid,
      buffer,
      filename,
      mimetype: "text/html; charset=utf-8",
      folder: `nep-lms-lesson-content/${payload.coursecode || "course"}`
    });
    res.json({ success: true, data: uploaded, url: uploaded.filelink });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateFlashcards = async (req, res) => {
  try {
    const payload = await contentPayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    let generated = "";
    if (text(req.body.provider).toLowerCase() === "ollama") {
      const ollamaConfig = await getOllamaConfig(payload.colid, req.body.ollamaConfigId);
      if (!ollamaConfig) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      generated = await callOllama(ollamaConfig, buildFlashcardPrompt({ ...req.body, ...payload }));
    } else {
      const aiConfig = await getAiConfig(payload.colid, "Gemini");
      if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });
      generated = await callGemini(aiConfig.apikey, buildFlashcardPrompt({ ...req.body, ...payload }), req.body.model);
    }
    const flashcards = parseJsonArray(generated).map((item) => ({
      question: text(item.question),
      questionimage: "",
      answer: text(item.answer)
    })).filter((item) => item.question || item.answer);
    if (!flashcards.length) return res.status(400).json({ success: false, message: "AI did not return valid flashcards" });
    res.json({ success: true, data: flashcards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProgress = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    ["lessonresourceid", "contentid", "academicyear", "semester", "coursecode", "regno", "facultyemail"].forEach((field) => {
      if (text(req.query[field])) filter[field] = req.query[field];
    });
    const data = await NepLmsLessonContentProgress.find(filter).sort({ completedat: -1, student: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const studentForRequest = async (source = {}) => {
  const colid = Number(source.colid);
  const regno = text(source.regno);
  if (!colid || !regno) throw new Error("colid and regno are required");
  const student = await User.findOne({ colid, regno }).lean();
  if (!student) throw new Error("Student not found");
  return student;
};

const verifyStudentCourseGroup = async (source = {}, student) => {
  const coursegroup = text(source.coursegroup || source.coursegrouo || source.groupname);
  if (!coursegroup) return;
  const query = {
    colid: Number(source.colid),
    academicyear: text(source.academicyear),
    semester: text(source.semester),
    coursecode: text(source.coursecode),
    groupname: coursegroup,
    regno: text(student.regno)
  };
  if (text(source.regulation)) query.regulation = text(source.regulation);
  if (text(source.programcode)) query.programcode = text(source.programcode);
  const row = await NepLmsClassGroup.findOne(query).lean();
  if (!row) throw new Error("Course group is not available for this student");
};

exports.getStudentLessonContent = async (req, res) => {
  try {
    const student = await studentForRequest(req.query);
    await verifyStudentCourseGroup(req.query, student);
    const filter = buildFilter(req.query);
    filter.status = "Active";
    const contents = await NepLmsLessonContent.find(filter).sort({ lessonresourceid: 1, sequence: 1, createdAt: 1 }).lean();
    const progressRows = await NepLmsLessonContentProgress.find({
      colid: Number(req.query.colid),
      regno: student.regno,
      contentid: { $in: contents.map((item) => item._id) }
    }).lean();
    const completed = new Set(progressRows.map((row) => String(row.contentid)));
    const data = [];
    const priorCompleteByLesson = {};
    contents.forEach((content) => {
      const lessonKey = String(content.lessonresourceid || "general");
      const previousOk = priorCompleteByLesson[lessonKey] !== false;
      const isCompleted = completed.has(String(content._id));
      const progress = progressRows.find((row) => String(row.contentid) === String(content._id));
      data.push({
        ...content,
        completed: isCompleted,
        locked: !previousOk,
        completedat: progress?.completedat || null,
        completedsteps: progress?.completedsteps || 0,
        totalsteps: progress?.totalsteps || 0,
        progresspercentage: progress?.progresspercentage || 0,
        stepstatus: progress?.stepstatus || ""
      });
      priorCompleteByLesson[lessonKey] = previousOk && isCompleted;
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.completeContent = async (req, res) => {
  try {
    const student = await studentForRequest(req.body);
    const colid = Number(req.body.colid);
    const content = await NepLmsLessonContent.findOne({ _id: req.body.contentid, colid, status: "Active" }).lean();
    if (!content) return res.status(404).json({ success: false, message: "Content not found" });
    await verifyStudentCourseGroup(content, student);

    const earlier = await NepLmsLessonContent.find({
      colid,
      lessonresourceid: content.lessonresourceid,
      sequence: { $lt: content.sequence },
      status: "Active"
    }).sort({ sequence: 1 }).lean();
    if (earlier.length) {
      const earlierProgress = await NepLmsLessonContentProgress.find({
        colid,
        regno: student.regno,
        contentid: { $in: earlier.map((item) => item._id) }
      }).lean();
      if (earlierProgress.length < earlier.length) {
        return res.status(400).json({ success: false, message: "Complete previous content first" });
      }
    }

    if (String(content.contenttype || "").toLowerCase() === "quiz" && content.quizid) {
      const attempt = await NepLmsQuizAttempt.findOne({ colid, regno: student.regno, quizid: content.quizid }).lean();
      if (!attempt) return res.status(400).json({ success: false, message: "Submit the linked quiz before marking it complete" });
    }

    const lessonSteps = await NepLmsLessonContent.find({
      colid,
      lessonresourceid: content.lessonresourceid,
      status: "Active"
    }).sort({ sequence: 1 }).lean();
    const currentProgress = await NepLmsLessonContentProgress.find({
      colid,
      regno: student.regno,
      contentid: { $in: lessonSteps.map((item) => item._id) }
    }).lean();
    const completedStepIds = new Set(currentProgress.map((row) => String(row.contentid)));
    completedStepIds.add(String(content._id));
    const totalsteps = lessonSteps.length || 1;
    const completedsteps = Math.min(completedStepIds.size, totalsteps);
    const progresspercentage = Number(((completedsteps / totalsteps) * 100).toFixed(2));

    const data = await NepLmsLessonContentProgress.findOneAndUpdate(
      { colid, contentid: content._id, regno: student.regno },
      {
        lessonresourceid: content.lessonresourceid,
        lessonplantitle: content.lessonplantitle,
        contenttitle: content.title,
        contenttype: content.contenttype,
        section: content.section,
        sequence: content.sequence,
        totalsteps,
        completedsteps,
        progresspercentage,
        stepstatus: "Completed",
        academicyear: content.academicyear,
        regulation: content.regulation,
        program: content.program,
        programcode: content.programcode,
        type: content.type,
        major: content.major,
        semester: content.semester,
        course: content.course,
        coursecode: content.coursecode,
        coursegroup: content.coursegroup,
        faculty: content.faculty,
        facultyemail: content.facultyemail,
        student: student.name || "",
        regno: student.regno,
        email: student.email || "",
        phone: student.phone || "",
        completed: true,
        completedat: new Date(),
        comments: text(req.body.comments),
        colid,
        user: text(req.body.user)
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data, progress: { totalsteps, completedsteps, progresspercentage } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
