const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const ScholarshipRule = require("../Models/scholarshipnewruleds");
const ScholarshipEligibility = require("../Models/scholarshipneweligibilityds");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Institution = require("../Models/insdetails");

const upload = multer({ storage: multer.memoryStorage() });
const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

exports.uploadMiddleware = upload.single("file");

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i }).sort({ default: -1, _id: -1 }).lean();

const uploadToAws = async (colid, file) => {
  const config = await getDefaultAwsConfig(colid);
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) throw new Error("Default AWS configuration is incomplete");
  const cleanName = path.basename(file.originalname || "scholarship-rule").replace(/[^\w.\-() ]/g, "_");
  const key = `${colid}/scholarship-new-rules/${Date.now()}-${cleanName}`;
  const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
  await s3.putObject({ Bucket: config.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype || "application/octet-stream" }).promise();
  return { filename: cleanName, filelink: s3Url(config.bucket, config.region, key), key, bucket: config.bucket, region: config.region, mimetype: file.mimetype || "" };
};

const extractFileText = async (file) => {
  if (!file?.buffer) return "";
  if (/pdf/i.test(file.mimetype || file.originalname)) {
    const data = await pdfParse(file.buffer);
    return text(data.text);
  }
  if (/word|officedocument|docx/i.test(file.mimetype || file.originalname)) {
    const data = await mammoth.extractRawText({ buffer: file.buffer });
    return text(data.value);
  }
  if (/text|plain/i.test(file.mimetype || "")) return file.buffer.toString("utf8");
  return "";
};

const getAiConfig = async (colid, provider = "Gemini") => {
  const providerRegex = /^(chatgpt|openai)$/i.test(text(provider)) ? /^(chatgpt|openai)$/i : new RegExp(`^${escapeRegex(provider)}$`, "i");
  return AiConfiguration.findOne({ colid: Number(colid), type: providerRegex, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || AiConfiguration.findOne({ colid: Number(colid), type: providerRegex, active: /^yes$/i }).sort({ _id: -1 }).lean();
};

const getOllamaConfig = async (colid, configId) => {
  const query = { colid: Number(colid), active: /^yes$/i };
  if (text(configId)) {
    const selected = await OllamaConfiguration.findOne({ ...query, _id: text(configId) }).lean();
    if (selected) return selected;
  }
  return OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean();
};

const callGemini = async (apikey, prompt, preferredModel = "gemini-2.5-flash") => {
  const models = [...new Set([text(preferredModel), "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean))];
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.15 } })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callChatGpt = async (apikey, prompt, model = "gpt-4o-mini") => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apikey}` },
    body: JSON.stringify({ model: text(model) || "gpt-4o-mini", messages: [{ role: "system", content: "Return valid JSON only." }, { role: "user", content: prompt }], temperature: 0.1 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed");
  return data.choices?.[0]?.message?.content || "";
};

const callClaude = async (apikey, prompt, model = "claude-3-5-haiku-latest") => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apikey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: text(model) || "claude-3-5-haiku-latest", max_tokens: 5000, temperature: 0.1, messages: [{ role: "user", content: prompt }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Claude request failed");
  return data.content?.map((part) => part.text || "").join("\n") || "";
};

const callOllama = async (config, prompt) => {
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: text(config.modelname), prompt, stream: false, options: { temperature: 0.1 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const callAi = async ({ colid, provider, model, ollamaConfigId, prompt }) => {
  const normalized = text(provider || "Gemini").toLowerCase();
  if (normalized === "ollama") {
    const config = await getOllamaConfig(colid, ollamaConfigId);
    if (!config) throw new Error("Active Ollama configuration is missing");
    return callOllama(config, prompt);
  }
  const configProvider = normalized === "claude" ? "Claude" : /^(chatgpt|openai)$/.test(normalized) ? "ChatGPT" : "Gemini";
  const config = await getAiConfig(colid, configProvider);
  if (!config?.apikey) throw new Error(`Active/default ${configProvider} AI configuration is missing`);
  if (configProvider === "Claude") return callClaude(config.apikey, prompt, model);
  if (configProvider === "ChatGPT") return callChatGpt(config.apikey, prompt, model);
  return callGemini(config.apikey, prompt, model);
};

const parseJson = (value = "") => {
  const cleaned = text(value).replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  const startArray = cleaned.indexOf("[");
  const endArray = cleaned.lastIndexOf("]");
  const startObject = cleaned.indexOf("{");
  const endObject = cleaned.lastIndexOf("}");
  const jsonText = startArray >= 0 && endArray > startArray ? cleaned.slice(startArray, endArray + 1) : startObject >= 0 && endObject > startObject ? cleaned.slice(startObject, endObject + 1) : cleaned;
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.results) ? parsed.results : Array.isArray(parsed.students) ? parsed.students : [];
};

const dynamicQuery = ({ colid, filters = [], selectedRegnos = [] }) => {
  const query = { colid: Number(colid), role: /^student$/i };
  if (selectedRegnos.length) query.regno = { $in: selectedRegnos.map(text).filter(Boolean) };
  (filters || []).forEach((filter) => {
    const field = text(filter.field);
    const value = filter.value;
    if (!field || value === undefined || value === null || value === "") return;
    const values = Array.isArray(value) ? value.map(text).filter(Boolean) : [text(value)].filter(Boolean);
    if (!values.length) return;
    if (filter.operator === "contains") query[field] = { $regex: values[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    else if (values.length > 1) query[field] = { $in: values };
    else query[field] = values[0];
  });
  return query;
};

const studentProfile = (student) => ({
  name: text(student.name),
  email: text(student.email),
  regno: text(student.regno),
  academicyear: text(student.academicyear),
  admissionyear: text(student.admissionyear),
  regulation: text(student.regulation),
  program: text(student.program),
  programcode: text(student.programcode),
  semester: text(student.semester),
  section: text(student.section),
  category: text(student.category),
  gender: text(student.gender),
  state: text(student.state),
  city: text(student.city),
  nationality: text(student.nationality),
  quota: text(student.quota),
  fathername: text(student.fathername),
  mothername: text(student.mothername)
});

const buildPrompt = ({ rules, students }) => `You are a scholarship eligibility analyst.
Return JSON only. Return an array where each item has:
regno, scholarships:[{scholarshipname, scholarshiptype, provider, amount, matchscore, criteria, reason, applicationlink}].
Only include scholarships that are applicable/eligible for the student. If none, scholarships must be [].

SCHOLARSHIP RULES:
${rules.map((rule, index) => `RULE ${index + 1}: ${rule.title}\n${rule.ruletext || ""}\n${rule.extractedtext || ""}`).join("\n\n").slice(0, 60000)}

STUDENTS:
${JSON.stringify(students.map(studentProfile), null, 2)}
`;

const summarize = (rows = []) => {
  const group = (field) => {
    const map = new Map();
    rows.forEach((row) => {
      const key = text(row[field]) || "NA";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };
  const uniqueStudents = new Set(rows.map((row) => row.regno)).size;
  return {
    totals: {
      students: uniqueStudents,
      scholarships: rows.length,
      scholarshipTypes: new Set(rows.map((row) => text(row.scholarshiptype)).filter(Boolean)).size,
      totalAmount: rows.reduce((sum, row) => sum + number(row.amount), 0)
    },
    charts: {
      byScholarship: group("scholarshipname"),
      byProgram: group("program"),
      byCategory: group("category"),
      byType: group("scholarshiptype")
    }
  };
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const fields = ["academicyear", "admissionyear", "regulation", "program", "programcode", "semester", "section", "category", "annualincome", "freeshipcardholder", "gender", "state", "city", "quota", "nationality"];
    const [students, rules] = await Promise.all([
      User.find({ colid, role: /^student$/i }).select(fields.join(" ")).lean(),
      ScholarshipRule.find({ colid }).select("academicyear title status").sort({ updatedAt: -1 }).lean()
    ]);
    const values = {};
    fields.forEach((field) => { values[field] = [...new Set(students.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); });
    res.json({ success: true, fields, values, rules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRule = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = {
      colid,
      academicyear: text(req.body.academicyear),
      title: text(req.body.title) || "Scholarship rules",
      description: text(req.body.description),
      ruletext: text(req.body.ruletext),
      status: text(req.body.status) || "Active",
      user: text(req.body.user),
      name: text(req.body.name),
      source: req.file ? "Upload" : "Text"
    };
    if (req.file) {
      const [uploaded, extractedtext] = await Promise.all([uploadToAws(colid, req.file), extractFileText(req.file)]);
      Object.assign(payload, uploaded, { extractedtext });
    }
    const data = req.body.id
      ? await ScholarshipRule.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await ScholarshipRule.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listRules = async (req, res) => {
  try {
    const query = { colid: Number(req.query.colid) };
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (text(req.query.academicyear)) query.academicyear = text(req.query.academicyear);
    if (text(req.query.status)) query.status = text(req.query.status);
    const data = await ScholarshipRule.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    const deleted = await ScholarshipRule.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!deleted) return res.status(404).json({ success: false, message: "Rule not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await User.find(dynamicQuery({ colid, filters: req.body.filters })).select("name email regno academicyear admissionyear regulation program programcode semester section category annualincome freeshipcardholder gender state city quota nationality").limit(1000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generate = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const selectedRegnos = Array.isArray(req.body.selectedRegnos) ? req.body.selectedRegnos.map(text).filter(Boolean) : [];
    const [students, rules] = await Promise.all([
      User.find(dynamicQuery({ colid, filters: req.body.filters, selectedRegnos })).limit(500).lean(),
      ScholarshipRule.find({ colid, _id: { $in: (req.body.ruleids || []).filter(Boolean) }, status: /^Active$/i }).lean()
    ]);
    if (!students.length) return res.status(400).json({ success: false, message: "No students found for generation" });
    if (!rules.length) return res.status(400).json({ success: false, message: "Select at least one active scholarship rule" });
    const raw = await callAi({ colid, provider: req.body.provider, model: req.body.model, ollamaConfigId: req.body.ollamaConfigId, prompt: buildPrompt({ rules, students }) });
    const parsed = parseJson(raw);
    const runid = `SCH-AI-${Date.now()}`;
    await ScholarshipEligibility.deleteMany({ colid, regno: { $in: students.map((student) => text(student.regno)).filter(Boolean) } });
    const studentMap = new Map(students.map((student) => [text(student.regno), student]));
    const docs = [];
    parsed.forEach((entry) => {
      const student = studentMap.get(text(entry.regno));
      if (!student) return;
      (entry.scholarships || []).forEach((scholarship) => {
        if (!text(scholarship.scholarshipname)) return;
        docs.push({
          colid,
          runid,
          academicyear: text(student.academicyear || req.body.academicyear),
          student: text(student.name),
          studentemail: text(student.email),
          regno: text(student.regno),
          program: text(student.program),
          programcode: text(student.programcode),
          regulation: text(student.regulation),
          semester: text(student.semester),
          section: text(student.section),
          category: text(student.category),
          gender: text(student.gender),
          state: text(student.state),
          scholarshipname: text(scholarship.scholarshipname),
          scholarshiptype: text(scholarship.scholarshiptype),
          provider: text(scholarship.provider),
          amount: number(scholarship.amount),
          matchscore: number(scholarship.matchscore),
          criteria: text(scholarship.criteria),
          reason: text(scholarship.reason),
          applicationlink: text(scholarship.applicationlink),
          ruleids: rules.map((rule) => String(rule._id)),
          aiProvider: text(req.body.provider || "Gemini"),
          aiModel: text(req.body.model),
          raw: scholarship,
          user: text(req.body.user),
          name: text(req.body.name)
        });
      });
    });
    if (docs.length) await ScholarshipEligibility.insertMany(docs);
    res.json({ success: true, runid, students: students.length, created: docs.length, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["academicyear", "program", "programcode", "regulation", "semester", "category", "gender", "scholarshipname", "scholarshiptype"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    const [data, institution] = await Promise.all([
      ScholarshipEligibility.find(query).sort({ student: 1, scholarshipname: 1 }).lean(),
      Institution.findOne({ colid }).sort({ _id: -1 }).lean()
    ]);
    res.json({ success: true, data, institution, ...summarize(data) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
