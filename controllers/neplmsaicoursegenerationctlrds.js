const path = require("path");
const AWS = require("aws-sdk");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const Syllabus = require("../Models/syllabusds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Awsconfig = require("../Models/awsconfig");
const NepLmsResource = require("../Models/neplmsresourceds");

const text = (value) => String(value || "").trim();
const escRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const safeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[char]));

const languages = [
  "English",
  "Hindi",
  "Bengali",
  "Telugu",
  "Marathi",
  "Tamil",
  "Urdu",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Odia",
  "Punjabi",
  "Assamese",
  "Maithili",
  "Santali",
  "Kashmiri",
  "Nepali",
  "Konkani",
  "Sindhi",
  "Dogri",
  "Manipuri",
  "Bodo",
  "Sanskrit"
];

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const courseFields = ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester", "course", "coursecode"];

const buildAssignedCourseQuery = (source = {}) => {
  const query = { colid: Number(source.colid), status: "Active" };
  if (source.facultyemail) query.facultyemail = { $regex: `^${escRegex(source.facultyemail)}$`, $options: "i" };
  courseFields.forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  return query;
};

const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const getSelectedModules = async (body) => {
  const ids = Array.isArray(body.moduleids) ? body.moduleids.filter(Boolean) : [];
  if (ids.length) {
    return Syllabus.find({ _id: { $in: ids }, colid: Number(body.colid) }).sort({ module: 1 }).lean();
  }

  const modules = Array.isArray(body.modules) ? body.modules.map(text).filter(Boolean) : [];
  const query = { colid: Number(body.colid) };
  courseFields.forEach((field) => {
    if (text(body[field])) query[field] = text(body[field]);
  });
  if (modules.length) query.module = { $in: modules };
  return Syllabus.find(query).sort({ module: 1 }).lean();
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

const getOllamaConfig = async (colid, configId) => {
  const baseQuery = {
    colid: Number(colid),
    active: /^yes$/i
  };
  if (text(configId)) {
    const selected = await OllamaConfiguration.findOne({ ...baseQuery, _id: configId }).lean();
    if (selected) return selected;
  }
  return OllamaConfiguration.findOne({ ...baseQuery, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne(baseQuery).sort({ _id: -1 }).lean();
};

const stripCodeFence = (content) => text(content)
  .replace(/^```html\s*/i, "")
  .replace(/^```\s*/i, "")
  .replace(/```$/i, "")
  .trim();

const buildPrompt = ({ body, modules }) => {
  const moduleText = modules.map((item, index) => (
    `${index + 1}. Module: ${item.module}\nSyllabus: ${item.syllabus}`
  )).join("\n\n");

  return `Create detailed course material in ${body.language}.

Course context:
Academic year: ${body.academicyear}
Program: ${body.program} (${body.programcode})
Semester: ${body.semester}
Subject: ${body.subject}
Course: ${body.course} (${body.coursecode})

Selected modules:
${moduleText}

Requirements:
1. Return a complete, print-friendly HTML document only.
2. Explain concepts clearly for students.
3. Add learning outcomes, prerequisites, structured notes, examples, practical applications, employability relevance, exercises, and short assessment questions.
4. Add a section called "Useful YouTube Videos" with 5 to 8 YouTube links/search links. Prefer videos in ${body.language}, focus on practical application and employability, and phrase each link so users can find highly rated/current videos.
5. Do not include markdown fences.`;
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
        { role: "system", content: "You create rigorous, classroom-ready academic course material as clean HTML." },
        { role: "user", content: prompt }
      ],
      temperature: 0.4
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
        generationConfig: { temperature: 0.4 }
      })
    });
    const data = await response.json();
    if (response.ok) {
      return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    }
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
      max_tokens: 6000,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Claude API request failed");
  return data.content?.map((part) => part.text || "").join("\n") || "";
};

const callOllama = async (config, prompt) => {
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const model = text(config.modelname);
  if (!server) throw new Error("Ollama server address is missing");
  if (!model) throw new Error("Ollama model name is missing");

  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.4 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ollama request failed at ${server}`);
  return data.response || "";
};

const generateHtml = async ({ provider, apikey, ollamaConfig, prompt }) => {
  const normalized = text(provider).toLowerCase();
  if (normalized === "gemini") return callGemini(apikey, prompt);
  if (normalized === "claude") return callClaude(apikey, prompt);
  if (normalized === "ollama") return callOllama(ollamaConfig, prompt);
  return callChatGpt(apikey, prompt);
};

const wrapHtml = (body, modules, content) => {
  const cleanContent = stripCodeFence(content);
  if (/<!doctype html|<html[\s>]/i.test(cleanContent)) return cleanContent;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeHtml(body.course)} Course Material</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.55; color: #1f2937; margin: 32px; }
    h1, h2, h3 { color: #12377a; }
    .meta { border: 1px solid #d6dbe7; padding: 14px; margin-bottom: 18px; background: #f7f9ff; }
    a { color: #0b63ce; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <h1>${safeHtml(body.course)} Course Material</h1>
  <div class="meta">
    <strong>Program:</strong> ${safeHtml(body.program)} (${safeHtml(body.programcode)})<br />
    <strong>Semester:</strong> ${safeHtml(body.semester)}<br />
    <strong>Subject:</strong> ${safeHtml(body.subject)}<br />
    <strong>Language:</strong> ${safeHtml(body.language)}<br />
    <strong>Modules:</strong> ${safeHtml(modules.map((item) => item.module).join(", "))}
  </div>
  ${cleanContent}
</body>
</html>`;
};

exports.getContext = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(req.query.facultyemail)) return res.status(400).json({ success: false, message: "facultyemail is required" });

    const query = buildAssignedCourseQuery(req.query);
    const courses = await WorkloadAssignment.find(query).sort({ academicyear: 1, program: 1, semester: 1, course: 1 }).lean();
    const aiConfigs = await AiConfiguration.find({ colid, active: /^yes$/i }).sort({ type: 1 }).lean();
    const ollamaConfigs = await OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean();

    const syllabusQuery = { colid };
    courseFields.forEach((field) => {
      if (text(req.query[field])) syllabusQuery[field] = text(req.query[field]);
    });
    const modules = text(req.query.coursecode) ? await Syllabus.find(syllabusQuery).sort({ module: 1 }).lean() : [];

    res.json({
      success: true,
      courses,
      modules,
      languages,
      providers: [
        ...uniq(aiConfigs.map((item) => item.type)).filter((item) => ["ChatGPT", "Gemini", "Claude"].includes(item)),
        ...(ollamaConfigs.length ? ["Ollama"] : [])
      ],
      ollamaConfigs,
      options: {
        academicyears: uniq(courses.map((item) => item.academicyear)),
        programs: uniq(courses.map((item) => item.program)),
        programcodes: uniq(courses.map((item) => item.programcode)),
        regulations: uniq(courses.map((item) => item.regulation)),
        types: uniq(courses.map((item) => item.type)),
        subjects: uniq(courses.map((item) => item.subject)),
        semesters: uniq(courses.map((item) => item.semester))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateCourseMaterial = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = Number(body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(body.facultyemail)) return res.status(400).json({ success: false, message: "facultyemail is required" });
    if (!text(body.coursecode)) return res.status(400).json({ success: false, message: "coursecode is required" });
    if (!text(body.language)) return res.status(400).json({ success: false, message: "language is required" });
    if (!text(body.provider)) return res.status(400).json({ success: false, message: "provider is required" });

    const assigned = await WorkloadAssignment.findOne(buildAssignedCourseQuery(body)).lean();
    if (!assigned) return res.status(403).json({ success: false, message: "Selected course is not assigned to this faculty" });

    const modules = await getSelectedModules(body);
    if (!modules.length) return res.status(400).json({ success: false, message: "Please select at least one syllabus module" });

    let aiConfig = null;
    let ollamaConfig = null;
    if (text(body.provider).toLowerCase() === "ollama") {
      ollamaConfig = await getOllamaConfig(colid, body.ollamaConfigId);
      if (!ollamaConfig) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
    } else {
      aiConfig = await getAiConfig(colid, body.provider);
      if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: `Active ${body.provider} AI configuration is missing` });
    }

    const awsConfig = await getDefaultAwsConfig(colid);
    if (!awsConfig?.username || !awsConfig?.password || !awsConfig?.bucket || !awsConfig?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }

    const prompt = buildPrompt({ body: { ...assigned, ...body }, modules });
    const generated = await generateHtml({
      provider: body.provider,
      apikey: aiConfig?.apikey,
      ollamaConfig,
      prompt
    });
    const html = wrapHtml({ ...assigned, ...body }, modules, generated);
    const buffer = Buffer.from(html, "utf8");
    const cleanCourse = path.basename(text(assigned.coursecode || body.coursecode)).replace(/[^\w.\-() ]/g, "_");
    const fileName = `${cleanCourse}-${Date.now()}-ai-course-material.html`;
    const key = `${colid}/nep-lms/${assigned.academicyear || "year"}/${assigned.coursecode || "course"}/Course Material/${fileName}`;

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

    const resource = await NepLmsResource.create({
      academicyear: assigned.academicyear,
      regulation: assigned.regulation,
      program: assigned.program,
      programcode: assigned.programcode,
      type: assigned.type,
      major: assigned.subject,
      semester: assigned.semester,
      course: assigned.course,
      coursecode: assigned.coursecode,
      faculty: assigned.facultyname,
      facultyemail: assigned.facultyemail,
      colid,
      user: text(body.user),
      resourcetype: "Course Material",
      title: text(body.title) || `AI Course Material - ${assigned.course}`,
      module: modules.map((item) => item.module).join(", "),
      topic: `AI generated material in ${body.language}`,
      description: `Generated using ${body.provider}${ollamaConfig?.name ? ` (${ollamaConfig.name} - ${ollamaConfig.modelname})` : ""}. Includes practical applications, employability focus, and YouTube references.`,
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

    res.json({ success: true, data: resource, url: resource.url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
