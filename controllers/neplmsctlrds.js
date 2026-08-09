const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const pptxgen = require("pptxgenjs");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
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
const validNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
  coursegroup: text(body.coursegroup || body.coursegrouo || body.groupname),
  faculty: text(body.faculty || body.facultyname),
  facultyemail: text(body.facultyemail),
  campus: text(body.campus),
  building: text(body.building),
  floor: text(body.floor),
  roomid: text(body.roomid),
  roomno: text(body.roomno),
  colid: validNumber(body.colid),
  user: text(body.user)
});

const resourcePayload = (body = {}) => ({
  ...coursePayload(body),
  resourcetype: text(body.resourcetype),
  title: text(body.title),
  section: text(body.section),
  module: text(body.module),
  topic: text(body.topic),
  description: text(body.description),
  order: optionalNumber(body.order),
  employabilityrelated: text(body.employabilityrelated || body.employabilityRelated || body.employability) || "No",
  duedate: text(body.duedate),
  fullmarks: optionalNumber(body.fullmarks),
  filename: text(body.filename),
  originalname: text(body.originalname || body.filename || body.title),
  mimetype: text(body.mimetype),
  url: text(body.url || body.filelink || body.link),
  status: text(body.status) || "Active"
});

const timetablePayload = (body = {}) => ({
  ...coursePayload(body),
  faculty: text(body.faculty || body.facultyname),
  major: text(body.major || body.subject),
  section: text(body.section),
  classgroup: text(body.classgroup),
  enrollmentgroup: text(body.enrollmentgroup),
  enrollmentgroupid: body.enrollmentgroupid || undefined,
  specialization: text(body.specialization),
  classdate: text(body.classdate),
  classtime: text(body.classtime),
  period: text(body.period),
  durationminutes: number(body.durationminutes || body.durationMinutes),
  module: text(body.module),
  topic: text(body.topic),
  workcompleted: body.workcompleted === undefined ? "" : text(body.workcompleted),
  onlineenabled: text(body.onlineenabled) || "No",
  onlineclassstatus: text(body.onlineclassstatus) || "Scheduled",
  onlineclassstartedat: body.onlineclassstartedat || undefined,
  onlineclassendedat: body.onlineclassendedat || undefined,
  onlineclasslink: text(body.onlineclasslink),
  status: text(body.status) || "Active"
});

const courseFilter = (source = {}) => {
  const filter = {};
  const colid = validNumber(source.colid);
  if (colid) filter.colid = colid;
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
    "enrollmentgroup",
    "enrollmentgroupid",
    "specialization",
    "course",
    "coursecode",
    "coursegroup",
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
  .replace(/^```json\s*/i, "")
  .replace(/^```\s*/i, "")
  .replace(/```$/i, "")
  .trim();

const truncateText = (value, limit = 900) => {
  const clean = text(value).replace(/\s+/g, " ");
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
};

const listFromValue = (value, limit = 6, charLimit = 150) => {
  const source = Array.isArray(value) ? value : String(value || "").split(/\n+|;+/);
  return source.map((item) => truncateText(item, charLimit)).filter(Boolean).slice(0, limit);
};

const parseSlidesFromAi = (content, fallbackBody, rows) => {
  const clean = stripCodeFence(content);
  try {
    const parsed = JSON.parse(clean);
    const slides = Array.isArray(parsed) ? parsed : parsed.slides;
    if (Array.isArray(slides) && slides.length) {
      return slides.map((slide, index) => ({
        title: truncateText(slide.title || `Slide ${index + 1}`, 90),
        subtitle: truncateText(slide.subtitle || slide.objective || "", 130),
        content: truncateText(slide.content || slide.explanation || slide.teachingContent || slide.notes || "", 900),
        example: truncateText(slide.example || slide.application || slide.caseExample || "", 420),
        bullets: listFromValue(slide.bullets || slide.keypoints || slide.keyPoints || slide.content, 6, 170),
        diagramType: text(slide.diagramType || slide.visualType || slide.diagram || ""),
        diagramItems: listFromValue(slide.diagramItems || slide.visualItems || slide.steps || slide.components || slide.flow, 5, 90),
        notes: truncateText(slide.notes || "", 500)
      })).filter((slide) => slide.title || slide.bullets.length);
    }
  } catch (error) {
    // Fall through to deterministic syllabus-based slides.
  }
  return [
    {
      title: fallbackBody.title || `${fallbackBody.course || "Course"} Presentation`,
      bullets: [
        `Course: ${fallbackBody.course || ""} (${fallbackBody.coursecode || ""})`,
        `Program: ${fallbackBody.program || ""} (${fallbackBody.programcode || ""})`,
        `Semester: ${fallbackBody.semester || ""}`,
        `Generated using ${fallbackBody.provider || "AI"}`
      ].filter(Boolean)
    },
    ...rows.slice(0, 18).map((row) => ({
      title: row.module || "Module",
      content: row.syllabus,
      diagramType: "cards",
      diagramItems: listFromValue(row.syllabus, 5, 80),
      bullets: [
        `Core content: ${row.syllabus}`,
        fallbackBody.additionalprompt || fallbackBody.prompt || "Discuss concepts, examples, applications and recap questions."
      ].filter(Boolean)
    }))
  ];
};

const addDiagram = (pptx, slide, slideData, index) => {
  const colors = ["DBEAFE", "DCFCE7", "FEF3C7", "FCE7F3", "E0E7FF"];
  const borderColors = ["2563EB", "16A34A", "D97706", "DB2777", "4F46E5"];
  const items = (slideData.diagramItems?.length ? slideData.diagramItems : slideData.bullets || []).slice(0, 5);
  if (!items.length) return;
  const type = text(slideData.diagramType).toLowerCase();
  if (type.includes("cycle")) {
    const positions = [
      [7.1, 1.72], [8.17, 2.72], [7.72, 4.08], [6.47, 4.08], [6.02, 2.72]
    ];
    items.forEach((item, i) => {
      const [x, y] = positions[i] || positions[0];
      slide.addShape(pptx.ShapeType.ellipse, {
        x, y, w: 1.25, h: 0.72,
        fill: { color: colors[i % colors.length] },
        line: { color: borderColors[i % borderColors.length], width: 1.2 }
      });
      slide.addText(item, { x: x + 0.08, y: y + 0.11, w: 1.1, h: 0.45, fontSize: 8.5, bold: true, color: "0F172A", align: "center", valign: "mid", fit: "shrink", margin: 0.02 });
    });
    return;
  }
  if (type.includes("process") || type.includes("flow") || index % 3 === 1) {
    items.slice(0, 4).forEach((item, i) => {
      const y = 1.65 + i * 1.04;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 6.45, y, w: 2.85, h: 0.72,
        rectRadius: 0.08,
        fill: { color: colors[i % colors.length] },
        line: { color: borderColors[i % borderColors.length], width: 1 }
      });
      slide.addText(`${i + 1}. ${item}`, { x: 6.58, y: y + 0.12, w: 2.58, h: 0.42, fontSize: 9, bold: true, color: "0F172A", fit: "shrink", margin: 0.02 });
      if (i < Math.min(items.length, 4) - 1) {
        slide.addShape(pptx.ShapeType.downArrow, { x: 7.62, y: y + 0.75, w: 0.36, h: 0.28, fill: { color: "64748B" }, line: { color: "64748B" } });
      }
    });
    return;
  }
  items.slice(0, 4).forEach((item, i) => {
    const x = 6.28 + (i % 2) * 1.62;
    const y = 1.72 + Math.floor(i / 2) * 1.52;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 1.45, h: 1.12,
      rectRadius: 0.08,
      fill: { color: colors[i % colors.length] },
      line: { color: borderColors[i % borderColors.length], width: 1 }
    });
    slide.addText(item, { x: x + 0.09, y: y + 0.17, w: 1.27, h: 0.72, fontSize: 8.5, bold: true, color: "0F172A", align: "center", valign: "mid", fit: "shrink", margin: 0.02 });
  });
};

const buildPptxBuffer = async ({ slides, meta }) => {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "COURSE_4X3", width: 10, height: 7.5 });
  pptx.layout = "COURSE_4X3";
  pptx.author = meta.faculty || meta.user || "Campus Technology";
  pptx.company = "Campus Technology";
  pptx.subject = `${meta.course || "Course"} ${meta.coursecode || ""}`.trim();
  pptx.title = meta.title || meta.course || "AI PPT";
  pptx.lang = "en-US";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "en-US"
  };

  const safeSlides = slides.length ? slides : [{ title: meta.title || meta.course || "Presentation", bullets: ["Generated presentation"] }];
  safeSlides.forEach((slideData, index) => {
    const slide = pptx.addSlide();
    const isTitle = index === 0;
    slide.background = { color: isTitle ? "EFF6FF" : "FFFFFF" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.18,
      fill: { color: isTitle ? "2563EB" : "0EA5E9" },
      line: { color: isTitle ? "2563EB" : "0EA5E9" }
    });
    slide.addText(truncateText(slideData.title || `Slide ${index + 1}`, 90), {
      x: 0.45,
      y: 0.42,
      w: 9.1,
      h: isTitle ? 0.95 : 0.72,
      fontFace: "Aptos Display",
      fontSize: isTitle ? 27 : 22,
      bold: true,
      color: "0F172A",
      margin: 0.08,
      breakLine: false,
      fit: "shrink"
    });
    const bullets = (slideData.bullets || [])
      .map((item) => truncateText(item, 220))
      .filter(Boolean)
      .slice(0, 5);
    if (slideData.subtitle) {
      slide.addText(slideData.subtitle, {
        x: 0.48,
        y: isTitle ? 1.2 : 1.05,
        w: 5.8,
        h: 0.34,
        fontFace: "Aptos",
        fontSize: 10.5,
        italic: true,
        color: "475569",
        fit: "shrink",
        margin: 0
      });
    }
    const content = truncateText(slideData.content || slideData.notes || bullets.join(". "), 780);
    slide.addText(content || "Presentation content", {
      x: 0.65,
      y: isTitle ? 1.62 : 1.38,
      w: 5.35,
      h: 2.15,
      fontFace: "Aptos",
      fontSize: isTitle ? 14.5 : 12.2,
      color: "111827",
      valign: "top",
      margin: 0.12,
      fit: "shrink",
      breakLine: true
    });
    if (bullets.length) {
      slide.addText(bullets.map((item) => `• ${item}`).join("\n"), {
        x: 0.78,
        y: isTitle ? 3.92 : 3.72,
        w: 5.1,
        h: 1.4,
        fontFace: "Aptos",
        fontSize: 10.5,
        color: "1F2937",
        fit: "shrink",
        margin: 0.08,
        breakLine: true
      });
    }
    if (slideData.example) {
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 5.42, w: 5.45, h: 0.82, rectRadius: 0.08, fill: { color: "F8FAFC" }, line: { color: "CBD5E1", width: 0.8 } });
      slide.addText(`Example: ${slideData.example}`, { x: 0.82, y: 5.56, w: 5.1, h: 0.5, fontSize: 9.2, color: "334155", fit: "shrink", margin: 0.02 });
    }
    slide.addShape(pptx.ShapeType.roundRect, { x: 6.18, y: 1.28, w: 3.35, h: 5.0, rectRadius: 0.08, fill: { color: isTitle ? "F8FAFC" : "F1F5F9", transparency: 4 }, line: { color: "CBD5E1", width: 0.8 } });
    slide.addText("Visual Map", { x: 6.38, y: 1.38, w: 2.9, h: 0.25, fontSize: 9.5, bold: true, color: "334155", margin: 0 });
    addDiagram(pptx, slide, slideData, index);
    slide.addText(`${meta.coursecode || ""} | ${meta.academicyear || ""} | Slide ${index + 1} of ${safeSlides.length}`, {
      x: 0.65,
      y: 7.02,
      w: 8.8,
      h: 0.25,
      fontFace: "Aptos",
      fontSize: 8.5,
      color: "475569",
      margin: 0
    });
  });

  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
};

const buildAiPptPrompt = ({ body, rows }) => {
  const selectedText = rows.map((row, index) => `${index + 1}. Module: ${row.module}\nTopic: ${row.syllabus}`).join("\n\n");
  return `Create a professional classroom PowerPoint deck as JSON only.

Return JSON in this exact shape:
{"slides":[{"title":"short title","subtitle":"learning objective or framing line","content":"one rich teaching paragraph of 80 to 130 words explaining the concept, not just points","bullets":["key point 1","key point 2","key point 3"],"example":"short classroom example or practical application","diagramType":"cards/process/cycle/compare","diagramItems":["visual label 1","visual label 2","visual label 3"],"notes":"optional teacher notes"}]}

Course context:
Academic year: ${text(body.academicyear)}
Program: ${text(body.program)} (${text(body.programcode)})
Regulation: ${text(body.regulation)}
Semester: ${text(body.semester)}
Course: ${text(body.course)} (${text(body.coursecode)})
Language: ${text(body.language) || "English"}
Difficulty: ${text(body.difficulty) || "Medium"}

Selected syllabus:
${selectedText}

User additional prompt:
${text(body.additionalprompt || body.prompt) || "Create a clear, visually structured deck with objectives, explanations, examples, summary and recap questions."}

Rules:
1. Return JSON only, no markdown.
2. Create 8 to 14 slides.
3. Every slide must include substantial visible teaching content in "content"; do not give only bullets.
4. Use 3 to 5 concise bullets for reinforcement, not as the main content.
5. Every slide must include diagramType and 3 to 5 diagramItems suitable for a visual diagram.
6. Include examples, classroom discussion prompts, and a recap/quiz slide.
7. Use the requested language.`;
};

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

const callOllama = async (config, prompt) => {
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const model = text(config.modelname);
  if (!model) throw new Error("Ollama model name is missing");
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.45 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
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
  const additionalPrompt = text(body.additionalprompt || body.additionalPrompt || body.prompt);
  const includeEmployability = ["yes", "true", "1", "on"].includes(text(body.employabilityrelated || body.employabilityRelated || body.employability).toLowerCase());
  const courseMaterialEmployability = includeEmployability
    ? "Include a dedicated employability section with workplace applications, skill mapping, interview/project prompts, career pathways, and useful YouTube search links focused on practical employability."
    : "Do not add a dedicated employability or career section. Keep the material focused on academic explanation, examples, exercises, recap questions, and useful YouTube search links.";
  const extraInstructions = {
    assignment: `Create a student-ready assignment with clear instructions, expected output, evaluation rubric, submission guidelines, practical/application-oriented tasks, and difficulty level ${text(body.difficulty) || "Medium"}. If full marks are provided, align the rubric to ${text(body.fullmarks)} marks.`,
    "course material": `Create detailed student-ready course material with explanation, examples, practical applications, exercises, recap questions, and useful YouTube search links in the selected language. ${courseMaterialEmployability}`,
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
5. Include course title, module/topic title, and date generated.${additionalPrompt ? `\n6. Additional user instructions: ${additionalPrompt}` : ""}`;
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
    const data = await NepLmsResource.find(courseFilter(req.query)).sort({ order: 1, createdAt: -1 }).lean();
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

    const awsConfig = await getDefaultAwsConfig(payload.colid);
    if (!awsConfig?.username || !awsConfig?.password || !awsConfig?.bucket || !awsConfig?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }

    const prompt = buildAiResourcePrompt({ body: { ...req.body, ...payload }, rows });
    const provider = text(req.body.provider || "Gemini");
    let generated = "";
    if (provider.toLowerCase() === "ollama") {
      const ollamaConfig = await getOllamaConfig(payload.colid, req.body.ollamaConfigId);
      if (!ollamaConfig) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      generated = await callOllama(ollamaConfig, prompt);
    } else {
      const aiConfig = await getAiConfig(payload.colid, "Gemini");
      if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });
      generated = await callGemini(aiConfig.apikey, prompt, req.body.model);
    }
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
      description: payload.description || `AI generated ${payload.resourcetype} using ${provider} in ${text(req.body.language || "English")} (${text(req.body.difficulty || "Medium")}).`,
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

exports.generateAiPptResource = async (req, res) => {
  try {
    const payload = resourcePayload({ ...req.body, resourcetype: "Course Material" });
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.coursecode) return res.status(400).json({ success: false, message: "Course is required" });
    if (!payload.facultyemail) return res.status(400).json({ success: false, message: "Faculty email is required" });

    const rows = await selectedSyllabusRows({ ...req.body, ...payload });
    if (!rows.length) return res.status(400).json({ success: false, message: "Select at least one module/topic from syllabus" });

    const assigned = await require("../Models/workloadassignmentds").findOne({
      colid: payload.colid,
      status: "Active",
      facultyemail: { $regex: `^${escapeRegex(payload.facultyemail)}$`, $options: "i" },
      academicyear: payload.academicyear,
      regulation: payload.regulation,
      program: payload.program,
      programcode: payload.programcode,
      semester: payload.semester,
      coursecode: payload.coursecode
    }).lean();
    if (!assigned) return res.status(403).json({ success: false, message: "Selected course is not assigned to this faculty" });

    const awsConfig = await getDefaultAwsConfig(payload.colid);
    if (!awsConfig?.username || !awsConfig?.password || !awsConfig?.bucket || !awsConfig?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }

    const provider = text(req.body.provider || "Gemini");
    const prompt = buildAiPptPrompt({ body: { ...assigned, ...req.body, ...payload }, rows });
    let generated = "";
    if (provider.toLowerCase() === "ollama") {
      const ollamaConfig = await getOllamaConfig(payload.colid, req.body.ollamaConfigId);
      if (!ollamaConfig) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      generated = await callOllama(ollamaConfig, prompt);
    } else {
      const aiConfig = await getAiConfig(payload.colid, "Gemini");
      if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });
      generated = await callGemini(aiConfig.apikey, prompt, req.body.model || req.body.geminiModel);
    }

    const slides = parseSlidesFromAi(generated, { ...assigned, ...req.body, ...payload, provider }, rows).slice(0, 18);
    if (!slides.length) return res.status(400).json({ success: false, message: "AI did not return usable slide content" });
    const pptxBuffer = await buildPptxBuffer({ slides, meta: { ...assigned, ...req.body, ...payload } });
    const cleanCourse = path.basename(payload.coursecode || "course").replace(/[^\w.\-() ]/g, "_");
    const cleanTitle = path.basename(payload.title || "AI-Presentation").replace(/[^\w.\-() ]/g, "_").slice(0, 80);
    const fileName = `${cleanCourse}-${Date.now()}-${cleanTitle}.pptx`;
    const key = `${payload.colid}/nep-lms/${payload.academicyear || "year"}/${payload.coursecode || "course"}/Course Material/${fileName}`;

    const s3 = new AWS.S3({
      accessKeyId: awsConfig.username,
      secretAccessKey: awsConfig.password,
      region: awsConfig.region
    });
    await s3.putObject({
      Bucket: awsConfig.bucket,
      Key: key,
      Body: pptxBuffer,
      ContentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    }).promise();

    const data = await NepLmsResource.create({
      ...payload,
      title: payload.title || `AI PPT - ${assigned.course}`,
      module: rows.map((row) => row.module).filter(Boolean).join(", "),
      topic: rows.map((row) => row.syllabus).filter(Boolean).join(", "),
      description: payload.description || `AI generated PPT using ${provider}. ${text(req.body.additionalprompt || req.body.prompt)}`,
      order: optionalNumber(req.body.order),
      filename: fileName,
      originalname: fileName,
      mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: pptxBuffer.length,
      bucket: awsConfig.bucket,
      region: awsConfig.region,
      key,
      url: s3Url(awsConfig.bucket, awsConfig.region, key),
      status: "Active"
    });

    res.json({ success: true, data, url: data.url, slides: slides.length });
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
    if (req.query.classid || req.query.id) {
      const data = await NepLmsTimetable.find({ _id: req.query.classid || req.query.id }).lean();
      return res.json({ success: true, data });
    }
    if (!validNumber(req.query.colid)) {
      return res.status(400).json({ success: false, message: "colid is required" });
    }
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
      if ((!payload.coursecode && !payload.enrollmentgroupid) || !payload.classdate || !payload.classtime) {
        errors.push({ rowNumber, message: "Course code or enrollment group, class date and class time are required" });
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
    if (!payload.colid || (!payload.coursecode && !payload.enrollmentgroupid) || !payload.classdate || !payload.classtime) {
      return res.status(400).json({ success: false, message: "Course or enrollment group, class date and class time are required" });
    }
    const data = await NepLmsTimetable.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTimetable = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const filter = { _id: req.body.id };
    if (colid) filter.colid = colid;
    const payload = timetablePayload(req.body);
    if (!colid) delete payload.colid;
    const data = await NepLmsTimetable.findOneAndUpdate(
      filter,
      payload,
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
