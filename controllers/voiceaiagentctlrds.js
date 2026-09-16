const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const AWS = require("aws-sdk");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const VoiceAiAgent = require("../Models/voiceaiagentds");
const VoiceAiAgentConversation = require("../Models/voiceaiagentconversationds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Awsconfig = require("../Models/awsconfig");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

const geminiModels = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-pro",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash"
];

const docs = (value) => Array.isArray(value) ? value.map((doc) => ({
  title: text(doc.title),
  filename: text(doc.filename || doc.originalname),
  url: text(doc.url),
  extractedtext: text(doc.extractedtext),
  uploadedby: text(doc.uploadedby),
  uploadeddate: doc.uploadeddate ? new Date(doc.uploadeddate) : new Date()
})).filter((doc) => doc.url) : [];

const getAwsConfig = async (colid, awsconfigid) => {
  const filter = { colid: number(colid) };
  if (awsconfigid) filter._id = awsconfigid;
  const config = await Awsconfig.findOne(filter).lean()
    || await Awsconfig.findOne({ colid: number(colid), default: /^yes$/i }).lean()
    || await Awsconfig.findOne({ colid: number(colid) }).lean();
  if (!config) throw new Error("AWS configuration is missing. Please configure AWS before uploading documents.");
  return config;
};

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
      return text(parsed.text).slice(0, 30000);
    }
    if (lower.includes(".docx") || lower.includes(".doc")) {
      const parsed = await mammoth.extractRawText({ buffer });
      return text(parsed.value).slice(0, 30000);
    }
    return "";
  } catch (error) {
    return "";
  }
};

const getGeminiConfig = async (colid) => AiConfiguration.findOne({
  colid: number(colid),
  active: /^yes$/i,
  default: /^yes$/i,
  type: /gemini/i
}).lean() || AiConfiguration.findOne({
  colid: number(colid),
  active: /^yes$/i,
  type: /gemini/i
}).lean();

const callGemini = async (colid, model, prompt) => {
  const config = await getGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini AI configuration is missing");
  const models = [...new Set([text(model), ...geminiModels].filter(Boolean))];
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
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
    lastError = data.error?.message || `Gemini API request failed for ${geminiModel}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

const getOllamaConfig = async (colid, id) => {
  if (id) {
    const exact = await OllamaConfiguration.findOne({ _id: id, colid: number(colid), active: /^yes$/i }).lean();
    if (exact) return exact;
  }
  return OllamaConfiguration.findOne({ colid: number(colid), active: /^yes$/i, default: /^yes$/i }).lean()
    || OllamaConfiguration.findOne({ colid: number(colid), active: /^yes$/i }).lean();
};

const callOllama = async (colid, ollamaConfigId, prompt) => {
  const config = await getOllamaConfig(colid, ollamaConfigId);
  if (!config) throw new Error("Active Ollama configuration is missing");
  const baseUrl = text(config.serveraddress).replace(/\/$/, "") || "http://localhost:11434";
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: text(config.modelname) || "llama3.1",
      prompt,
      stream: false,
      options: { temperature: 0.2 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama API request failed");
  return data.response || "";
};

const buildAnswerPrompt = (agent, question) => {
  const context = (agent.documents || [])
    .map((doc, index) => `Document ${index + 1}: ${doc.title || doc.filename || "Untitled"}\n${text(doc.extractedtext).slice(0, 14000)}`)
    .join("\n\n")
    .slice(0, 70000);
  return `You are a helpful voice AI agent named "${agent.agentname}".
Answer the visitor using only the manual instructions and document knowledge below.
If the answer is not available in the provided material, say that you do not have enough information.
Keep the answer clear and conversational for spoken delivery.

Manual instructions:
${agent.instructions || "None"}

Document knowledge:
${context || "No document text was available."}

Visitor question:
${question}

Answer:`;
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const ollamaConfigurations = colid !== undefined
      ? await OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
      : [];
    res.json({ geminiModels, ollamaConfigurations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ message: "College id is required" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const ext = path.extname(req.file.originalname || "").toLowerCase();
    if (![".pdf", ".doc", ".docx"].includes(ext)) {
      return res.status(400).json({ message: "Only PDF, DOC, and DOCX files are allowed" });
    }
    const config = await getAwsConfig(colid, req.body.awsconfigid);
    const key = `voice-ai-agents/${colid}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${String(req.file.originalname || "document").replace(/[^\w.\-]+/g, "_")}`;
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
    const url = s3Url(config.bucket, config.region, key);
    res.json({ filename: req.file.originalname, url, awsconfigid: String(config._id) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ message: "College id is required" });
    const filter = { colid };
    ["active", "status", "provider"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    if (text(req.query.search)) {
      const rgx = new RegExp(escRegex(req.query.search), "i");
      filter.$or = [{ agentname: rgx }, { description: rgx }, { instructions: rgx }];
    }
    const rows = await VoiceAiAgent.find(filter).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = number(body.colid);
    if (colid === undefined) return res.status(400).json({ message: "College id is required" });
    if (!text(body.agentname)) return res.status(400).json({ message: "Agent name is required" });
    const normalizedDocs = docs(body.documents);
    for (const doc of normalizedDocs) {
      if (!doc.extractedtext) doc.extractedtext = await extractTextFromUrl(doc.url, doc.filename);
    }
    const payload = {
      colid,
      agentname: text(body.agentname),
      description: text(body.description),
      instructions: text(body.instructions),
      documents: normalizedDocs,
      provider: text(body.provider) || "Gemini",
      geminimodel: text(body.geminimodel) || "gemini-2.5-flash-lite",
      ollamaconfigid: text(body.ollamaconfigid),
      active: text(body.active) || "Yes",
      status: text(body.status) || "Active",
      name: text(body.name),
      user: text(body.user)
    };
    let saved;
    if (text(body._id)) {
      saved = await VoiceAiAgent.findOneAndUpdate({ _id: body._id, colid }, payload, { new: true }).lean();
      if (!saved) return res.status(404).json({ message: "Voice agent not found" });
    } else {
      saved = await VoiceAiAgent.create({ ...payload, publicid: crypto.randomBytes(12).toString("hex") });
    }
    res.json(saved);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (colid === undefined) return res.status(400).json({ message: "College id is required" });
    await VoiceAiAgent.deleteMany({ colid, _id: { $in: ids } });
    res.json({ message: "Deleted", deleted: ids.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.publicAgent = async (req, res) => {
  try {
    const agent = await VoiceAiAgent.findOne({ publicid: text(req.params.publicid), active: /^yes$/i }).lean();
    if (!agent) return res.status(404).json({ message: "Voice agent not found or inactive" });
    res.json({
      publicid: agent.publicid,
      agentname: agent.agentname,
      description: agent.description,
      provider: agent.provider,
      documentcount: (agent.documents || []).length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.chat = async (req, res) => {
  try {
    const agent = await VoiceAiAgent.findOne({ publicid: text(req.params.publicid), active: /^yes$/i }).lean();
    if (!agent) return res.status(404).json({ message: "Voice agent not found or inactive" });
    const question = text(req.body.question);
    if (!question) return res.status(400).json({ message: "Question is required" });
    const prompt = buildAnswerPrompt(agent, question);
    const answer = /^ollama$/i.test(agent.provider)
      ? await callOllama(agent.colid, agent.ollamaconfigid, prompt)
      : await callGemini(agent.colid, agent.geminimodel, prompt);
    await VoiceAiAgentConversation.create({
      colid: agent.colid,
      agentid: String(agent._id),
      publicid: agent.publicid,
      visitorid: text(req.body.visitorid),
      question,
      answer
    });
    res.json({ answer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
