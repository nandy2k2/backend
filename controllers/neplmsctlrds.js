const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const NepLmsResource = require("../Models/neplmsresourceds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAssignmentSubmission = require("../Models/neplmsassignmentsubmissionds");
const Syllabus = require("../Models/syllabusds");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const optionalNumber = (value) => {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
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
  campus: text(body.campus),
  building: text(body.building),
  floor: text(body.floor),
  roomid: text(body.roomid),
  roomno: text(body.roomno),
  colid: Number(body.colid),
  user: text(body.user)
});

const resourcePayload = (body = {}) => ({
  ...coursePayload(body),
  resourcetype: text(body.resourcetype),
  title: text(body.title),
  module: text(body.module),
  topic: text(body.topic),
  description: text(body.description),
  duedate: text(body.duedate),
  fullmarks: optionalNumber(body.fullmarks),
  status: text(body.status) || "Active"
});

const timetablePayload = (body = {}) => ({
  ...coursePayload(body),
  faculty: text(body.faculty || body.facultyname),
  major: text(body.major || body.subject),
  section: text(body.section),
  classgroup: text(body.classgroup),
  classdate: text(body.classdate),
  classtime: text(body.classtime),
  period: text(body.period),
  durationminutes: number(body.durationminutes || body.durationMinutes),
  module: text(body.module),
  topic: text(body.topic),
  workcompleted: body.workcompleted === undefined ? "" : text(body.workcompleted),
  status: text(body.status) || "Active"
});

const courseFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  [
    "academicyear",
    "regulation",
    "program",
    "programcode",
    "type",
    "major",
    "semester",
    "section",
    "classgroup",
    "course",
    "coursecode",
    "faculty",
    "facultyemail",
    "campus",
    "building",
    "floor",
    "roomid",
    "roomno",
    "classdate",
    "period",
    "resourcetype",
    "status",
    "user"
  ].forEach((field) => {
    if (source[field]) filter[field] = source[field];
  });
  return filter;
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

const getAiConfig = async (colid, provider = "Gemini") => {
  const providerRegex = new RegExp(`^${escapeRegex(provider)}$`, "i");
  return AiConfiguration.findOne({ colid: Number(colid), type: providerRegex, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || AiConfiguration.findOne({ colid: Number(colid), type: providerRegex, active: /^yes$/i }).sort({ _id: -1 }).lean();
};

const callGemini = async (apikey, prompt, preferredModel = "gemini-2.5-flash") => {
  const fallbackModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
  const models = [...new Set([text(preferredModel), ...fallbackModels].filter(Boolean))];
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.45 }
      })
    });
    const data = await response.json();
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini API request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

const selectedSyllabusRows = async (body = {}) => {
  const modules = Array.isArray(body.modules) ? body.modules.map(text).filter(Boolean) : text(body.module).split(",").map(text).filter(Boolean);
  const topics = Array.isArray(body.topics) ? body.topics.map(text).filter(Boolean) : text(body.topic).split(",").map(text).filter(Boolean);
  const query = {
    colid: Number(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    type: text(body.type),
    subject: text(body.major || body.subject),
    semester: text(body.semester),
    course: text(body.course),
    coursecode: text(body.coursecode)
  };
  Object.keys(query).forEach((key) => {
    if (!query[key]) delete query[key];
  });
  if (modules.length) query.module = { $in: modules };
  if (topics.length) query.syllabus = { $in: topics };
  return Syllabus.find(query).sort({ module: 1, syllabus: 1 }).lean();
};

const buildAiResourcePrompt = ({ body, rows }) => {
  const resourceType = text(body.resourcetype);
  const kind = resourceType === "Assignment" ? "assignment" : resourceType === "Lesson Plan" ? "lesson plan" : "course material";
  const selectedText = rows.map((row, index) => `${index + 1}. Module: ${row.module}\nTopic/Syllabus: ${row.syllabus}`).join("\n\n");
  const extraInstructions = {
    assignment: `Create a student-ready assignment with clear instructions, expected output, evaluation rubric, submission guidelines, practical/application-oriented tasks, and difficulty level ${text(body.difficulty) || "Medium"}. If full marks are provided, align the rubric to ${text(body.fullmarks)} marks.`,
    "course material": "Create detailed student-ready course material with explanation, examples, practical applications, employability links, exercises, recap questions, and useful YouTube search links in the selected language.",
    "lesson plan": `Create a teacher-ready classwise lesson plan for ${Math.max(1, Number(body.noofclasses || 1))} classes. Include class number, module/topic coverage, learning outcomes, teaching methods, activities, resources, assessment/check for understanding, homework/follow-up, and expected duration. Difficulty level: ${text(body.difficulty) || "Medium"}.`
  };

  return `Create ${kind} in ${text(body.language) || "English"}.

Course context:
Academic year: ${text(body.academicyear)}
Program: ${text(body.program)} (${text(body.programcode)})
Regulation: ${text(body.regulation)}
Semester: ${text(body.semester)}
Subject/Major: ${text(body.major || body.subject)}
Course: ${text(body.course)} (${text(body.coursecode)})

Selected module and topics:
${selectedText}

Requirements:
1. Return a complete clean HTML document only, no markdown fences.
2. Use a professional academic layout.
3. ${extraInstructions[kind]}
4. Keep the language strictly ${text(body.language) || "English"}.
5. Include course title, module/topic title, and date generated.`;
};

const wrapAiHtml = (body, content) => {
  const cleanContent = stripCodeFence(content);
  if (/<!doctype html|<html[\s>]/i.test(cleanContent)) return cleanContent;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeHtml(body.title || body.course || body.resourcetype)}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.55; color: #1f2937; margin: 32px; }
    h1, h2, h3 { color: #12377a; }
    .meta { border: 1px solid #d6dbe7; padding: 14px; margin-bottom: 18px; background: #f7f9ff; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <h1>${safeHtml(body.title || `${body.resourcetype} - ${body.course}`)}</h1>
  <div class="meta">
    <strong>Course:</strong> ${safeHtml(body.course)} (${safeHtml(body.coursecode)})<br />
    <strong>Program:</strong> ${safeHtml(body.program)} (${safeHtml(body.programcode)})<br />
    <strong>Semester:</strong> ${safeHtml(body.semester)}<br />
    <strong>Language:</strong> ${safeHtml(body.language)}<br />
    <strong>Difficulty:</strong> ${safeHtml(body.difficulty)}
  </div>
  ${cleanContent}
</body>
</html>`;
};

exports.getResources = async (req, res) => {
  try {
    const data = await NepLmsResource.find(courseFilter(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const assignmentid = text(req.query.assignmentid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!assignmentid) return res.status(400).json({ success: false, message: "Assignment is required" });

    const assignment = await NepLmsResource.findOne({
      _id: assignmentid,
      colid,
      resourcetype: "Assignment"
    }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

    if (req.query.coursecode && assignment.coursecode !== req.query.coursecode) {
      return res.status(400).json({ success: false, message: "Assignment does not belong to selected course" });
    }
    if (req.query.facultyemail && assignment.facultyemail !== req.query.facultyemail) {
      return res.status(403).json({ success: false, message: "Assignment does not belong to selected faculty" });
    }

    const submissions = await NepLmsAssignmentSubmission.find({ colid, assignmentid })
      .sort({ submitteddate: -1, student: 1 })
      .lean();
    const data = submissions.map((row) => ({
      ...row,
      fullmarks: row.fullmarks || assignment.fullmarks || 0
    }));

    res.json({ success: true, assignment, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.gradeAssignmentSubmission = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const id = text(req.body.id);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!id) return res.status(400).json({ success: false, message: "Submission is required" });

    const submission = await NepLmsAssignmentSubmission.findOne({ _id: id, colid });
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });

    const assignment = await NepLmsResource.findOne({ _id: submission.assignmentid, colid, resourcetype: "Assignment" }).lean();
    const fullmarks = optionalNumber(req.body.fullmarks || submission.fullmarks || assignment?.fullmarks);
    const marks = optionalNumber(req.body.marks);
    if (fullmarks && marks > fullmarks) {
      return res.status(400).json({ success: false, message: "Marks cannot be more than full marks" });
    }

    submission.fullmarks = fullmarks;
    submission.marks = marks;
    submission.facultycomments = text(req.body.facultycomments);
    submission.gradedby = text(req.body.gradedby || req.body.user);
    submission.gradeddate = new Date();
    submission.status = "Graded";
    const data = await submission.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadResource = async (req, res) => {
  try {
    const payload = resourcePayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.resourcetype) return res.status(400).json({ success: false, message: "Resource type is required" });
    if (!payload.coursecode) return res.status(400).json({ success: false, message: "Course is required" });

    let filePayload = {};
    if (req.file) {
      const config = await getDefaultAwsConfig(payload.colid);
      if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
        return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
      }
      const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
      const folder = `nep-lms/${payload.academicyear || "year"}/${payload.coursecode || "course"}/${payload.resourcetype}`;
      const key = `${payload.colid}/${folder}/${Date.now()}-${cleanName}`;
      const s3 = new AWS.S3({
        accessKeyId: config.username,
        secretAccessKey: config.password,
        region: config.region
      });
      await s3.putObject({
        Bucket: config.bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      }).promise();
      filePayload = {
        filename: cleanName,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        bucket: config.bucket,
        region: config.region,
        key,
        url: s3Url(config.bucket, config.region, key)
      };
    }

    const data = await NepLmsResource.create({ ...payload, ...filePayload });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateAiResource = async (req, res) => {
  try {
    const payload = resourcePayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.coursecode) return res.status(400).json({ success: false, message: "Course is required" });
    if (!["Assignment", "Course Material", "Lesson Plan"].includes(payload.resourcetype)) {
      return res.status(400).json({ success: false, message: "AI generation is available for Assignment, Course Material and Lesson Plan only" });
    }

    const rows = await selectedSyllabusRows({ ...req.body, ...payload });
    if (!rows.length) return res.status(400).json({ success: false, message: "Select at least one module/topic from syllabus" });

    const provider = text(req.body.provider || "Gemini");
    if (provider.toLowerCase() !== "gemini") return res.status(400).json({ success: false, message: "Only Gemini is supported here" });
    const aiConfig = await getAiConfig(payload.colid, provider);
    if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });

    const awsConfig = await getDefaultAwsConfig(payload.colid);
    if (!awsConfig?.username || !awsConfig?.password || !awsConfig?.bucket || !awsConfig?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }

    const prompt = buildAiResourcePrompt({ body: { ...req.body, ...payload }, rows });
    const generated = await callGemini(aiConfig.apikey, prompt, req.body.model);
    const html = wrapAiHtml({ ...req.body, ...payload }, generated);
    const buffer = Buffer.from(html, "utf8");
    const cleanCourse = path.basename(payload.coursecode || "course").replace(/[^\w.\-() ]/g, "_");
    const cleanType = payload.resourcetype.replace(/[^\w.\-() ]/g, "_");
    const fileName = `${cleanCourse}-${Date.now()}-ai-${cleanType.toLowerCase().replace(/\s+/g, "-")}.html`;
    const key = `${payload.colid}/nep-lms/${payload.academicyear || "year"}/${payload.coursecode || "course"}/${payload.resourcetype}/${fileName}`;

    const s3 = new AWS.S3({
      accessKeyId: awsConfig.username,
      secretAccessKey: awsConfig.password,
      region: awsConfig.region
    });
    await s3.putObject({
      Bucket: awsConfig.bucket,
      Key: key,
      Body: buffer,
      ContentType: "text/html; charset=utf-8"
    }).promise();

    const data = await NepLmsResource.create({
      ...payload,
      title: payload.title || `AI ${payload.resourcetype} - ${payload.course}`,
      module: rows.map((row) => row.module).filter(Boolean).join(", "),
      topic: rows.map((row) => row.syllabus).filter(Boolean).join(", "),
      description: payload.description || `AI generated ${payload.resourcetype} using Gemini in ${text(req.body.language || "English")} (${text(req.body.difficulty || "Medium")}).`,
      filename: fileName,
      originalname: fileName,
      mimetype: "text/html",
      size: buffer.length,
      bucket: awsConfig.bucket,
      region: awsConfig.region,
      key,
      url: s3Url(awsConfig.bucket, awsConfig.region, key),
      status: "Active"
    });

    res.json({ success: true, data, url: data.url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateResource = async (req, res) => {
  try {
    const data = await NepLmsResource.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid) },
      resourcePayload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteResource = async (req, res) => {
  try {
    await NepLmsResource.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTimetable = async (req, res) => {
  try {
    const data = await NepLmsTimetable.find(courseFilter(req.query)).sort({ classdate: 1, classtime: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkCreateTimetable = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });

    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const rowNumber = items[index].rowNumber || index + 2;
      const payload = timetablePayload({ ...items[index], colid, user: req.body.user || items[index].user });
      if (!payload.coursecode || !payload.classdate || !payload.classtime) {
        errors.push({ rowNumber, message: "Course code, class date and class time are required" });
        continue;
      }
      try {
        await NepLmsTimetable.create(payload);
        saved += 1;
      } catch (error) {
        errors.push({ rowNumber, message: error.message });
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTimetable = async (req, res) => {
  try {
    const payload = timetablePayload(req.body);
    if (!payload.colid || !payload.coursecode || !payload.classdate || !payload.classtime) {
      return res.status(400).json({ success: false, message: "Course, class date and class time are required" });
    }
    const data = await NepLmsTimetable.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTimetable = async (req, res) => {
  try {
    const data = await NepLmsTimetable.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid) },
      timetablePayload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Class not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTimetable = async (req, res) => {
  try {
    await NepLmsTimetable.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.swapTimetable = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const first = await NepLmsTimetable.findOne({ _id: req.body.firstId, colid });
    const second = await NepLmsTimetable.findOne({ _id: req.body.secondId, colid });
    if (!first || !second) return res.status(404).json({ success: false, message: "Both classes are required for swapping" });

    const firstSlot = {
      classdate: first.classdate,
      classtime: first.classtime,
      period: first.period,
      durationminutes: first.durationminutes
    };
    first.classdate = second.classdate;
    first.classtime = second.classtime;
    first.period = second.period;
    first.durationminutes = second.durationminutes;
    second.classdate = firstSlot.classdate;
    second.classtime = firstSlot.classtime;
    second.period = firstSlot.period;
    second.durationminutes = firstSlot.durationminutes;

    await first.save();
    await second.save();
    res.json({ success: true, data: [first, second] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
