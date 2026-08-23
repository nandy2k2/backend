const vm = require("vm");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const AWS = require("aws-sdk");
const AiCodingAgent = require("../Models/aicodingagentds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const EmailConfiguration = require("../Models/emailconfigurationds");
const AwsConfig = require("../Models/awsconfig");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const geminiModels = [
  "gemini-3.5-pro",
  "gemini-3.5-flash",
  "gemini-3.0-pro",
  "gemini-3.0-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b"
];

const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
};

const scoped = (body = {}) => {
  const colid = num(body.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};

const modelAliases = (modelName) => {
  const clean = text(modelName);
  if (!clean) return [];
  const aliases = new Set([clean, clean.toLowerCase(), clean.charAt(0).toUpperCase() + clean.slice(1)]);
  if (clean.endsWith("s")) aliases.add(clean.slice(0, -1));
  if (clean.endsWith("ds2")) aliases.add(clean.slice(0, -3));
  if (clean.endsWith("ds")) aliases.add(clean.slice(0, -2));
  return Array.from(aliases).filter(Boolean);
};

const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const safeQuery = (Model, filters = {}, colid) => {
  const fields = new Set(Object.keys(Model.schema.paths || {}));
  if (!fields.has("colid")) throw new Error("Existing model access requires a colid field");
  const query = { colid };
  Object.entries(filters || {}).forEach(([field, value]) => {
    if (field === "colid" || !fields.has(field) || value === undefined || value === null || value === "") return;
    const path = Model.schema.paths[field];
    if (path?.instance === "Number") {
      const parsed = num(value);
      if (parsed !== undefined) query[field] = parsed;
    } else if (path?.instance === "Date") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) query[field] = parsed;
    } else if (typeof value === "string") {
      query[field] = new RegExp(escapeRegex(value), "i");
    } else {
      query[field] = value;
    }
  });
  return query;
};

const noDeletePattern = /\b(?:db\s*\.\s*[A-Za-z_$][\w$]*\s*\.\s*)?(delete|deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete|remove)\s*\(/i;

const assertNoDelete = (code = "") => {
  const match = String(code || "").match(noDeletePattern);
  if (match) throw new Error(`Blocked: delete operations are not allowed in AI agents (${match[1]}).`);
};

const createAgentDb = ({ selectedModels = [], colid }) => {
  const db = {};
  const modelNames = Array.isArray(selectedModels) && selectedModels.length
    ? selectedModels
    : mongoose.modelNames().filter((name) => {
      try { return Object.prototype.hasOwnProperty.call(mongoose.model(name).schema.paths || {}, "colid"); } catch { return false; }
    });
  modelNames.forEach((modelName) => {
    if (!mongoose.modelNames().includes(modelName)) return;
    const Model = mongoose.model(modelName);
    const fields = new Set(Object.keys(Model.schema.paths || {}));
    if (!fields.has("colid")) return;
    const safeModel = Object.freeze({
      fields: Array.from(fields),
      find: async (filters = {}, limit = 500) => Model.find(safeQuery(Model, filters, colid)).limit(Math.min(Math.max(num(limit) || 500, 1), 5000)).lean(),
      count: async (filters = {}) => Model.countDocuments(safeQuery(Model, filters, colid)),
      distinct: async (field, filters = {}) => fields.has(field) && field !== "colid" ? Model.distinct(field, safeQuery(Model, filters, colid)) : [],
      create: async (payload = {}) => Model.create({ ...payload, colid }),
      updateOne: async (filters = {}, patch = {}) => Model.findOneAndUpdate(safeQuery(Model, filters, colid), { ...patch, colid }, { new: true, runValidators: true }).lean(),
      updateMany: async (filters = {}, patch = {}) => Model.updateMany(safeQuery(Model, filters, colid), { ...patch, colid }),
      findOneAndUpdate: async (filters = {}, patch = {}) => Model.findOneAndUpdate(safeQuery(Model, filters, colid), { ...patch, colid }, { new: true, runValidators: true }).lean(),
      delete: async () => { throw new Error("Blocked: delete is not allowed in AI agents."); },
      deleteOne: async () => { throw new Error("Blocked: deleteOne is not allowed in AI agents."); },
      deleteMany: async () => { throw new Error("Blocked: deleteMany is not allowed in AI agents."); },
      remove: async () => { throw new Error("Blocked: remove is not allowed in AI agents."); }
    });
    modelAliases(modelName).forEach((alias) => { if (!db[alias]) db[alias] = safeModel; });
  });
  return Object.freeze(db);
};

const defaultEmailConfig = async (colid) => EmailConfiguration.findOne({ colid, isactive: /^yes$/i, default: /^yes$/i }).lean()
  || EmailConfiguration.findOne({ colid, isactive: /^yes$/i }).lean();

const sendEmail = async (colid, { to, cc, bcc, subject, html, text: plainText }) => {
  if (!text(to)) throw new Error("Email recipient is required");
  const config = await defaultEmailConfig(colid);
  if (!config?.username || !config?.password) throw new Error("Active email configuration is missing");
  const transporter = nodemailer.createTransport({
    host: config.smtp || config.smptp || "smtp.gmail.com",
    port: Number(config.port || 587),
    secure: /^yes$/i.test(text(config.secure)),
    auth: { user: config.username, pass: config.password }
  });
  await transporter.sendMail({ from: config.username, to, cc, bcc, subject: subject || "AI Agent Report", html: html || plainText || "", text: plainText || "" });
  return { sent: true, to };
};

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");

const s3Url = (bucket, region, key) => (
  String(region || "") === "us-east-1"
    ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`
);

const uploadToAws = async (colid, { key, body, contentType = "text/plain", awsconfigid }) => {
  const config = awsconfigid
    ? await AwsConfig.findOne({ _id: awsconfigid, colid }).lean()
    : await AwsConfig.findOne({ colid, default: /^yes$/i }).lean() || await AwsConfig.findOne({ colid }).lean();
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) throw new Error("AWS configuration is missing");
  const safeKey = text(key) || `ai-agents/${colid}/${Date.now()}.txt`;
  const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
  await s3.putObject({
    Bucket: config.bucket,
    Key: safeKey,
    Body: Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""), "utf8"),
    ContentType: contentType || "application/octet-stream"
  }).promise();
  return {
    key: safeKey,
    url: s3Url(config.bucket, config.region, safeKey),
    bucket: config.bucket,
    region: config.region,
    awsconfigid: String(config._id)
  };
};

const awsApi = (colid) => Object.freeze({
  configs: async () => AwsConfig.find({ colid }).select("name bucket region type default user").lean(),
  defaultConfig: async () => AwsConfig.findOne({ colid, default: /^yes$/i }).select("name bucket region type default user").lean(),
  uploadText: async ({ key, text: textBody, contentType, awsconfigid } = {}) => uploadToAws(colid, { key, body: textBody || "", contentType: contentType || "text/plain", awsconfigid }),
  uploadJson: async ({ key, data, awsconfigid } = {}) => uploadToAws(colid, { key, body: JSON.stringify(data || {}, null, 2), contentType: "application/json", awsconfigid }),
  uploadBase64: async ({ key, base64, contentType, awsconfigid } = {}) => uploadToAws(colid, { key, body: Buffer.from(String(base64 || ""), "base64"), contentType: contentType || "application/octet-stream", awsconfigid })
});

const modelDetails = () => {
  const details = {};
  mongoose.modelNames().forEach((name) => {
    try {
      const schema = mongoose.model(name).schema;
      if (Object.prototype.hasOwnProperty.call(schema.paths || {}, "colid")) {
        details[name] = Object.keys(schema.paths || {}).map((field) => ({ field, type: schema.paths[field]?.instance || "Mixed" }));
      }
    } catch {}
  });
  return details;
};

const getGeminiConfig = async (colid) => AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).lean()
  || AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).lean();

const getOllamaConfig = async (colid, id) => (id ? OllamaConfiguration.findOne({ _id: id, colid, active: /^yes$/i }).lean() : null)
  || OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).lean()
  || OllamaConfiguration.findOne({ colid, active: /^yes$/i }).lean();

const readGeminiText = (payload = {}) => payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";

const callGemini = async ({ colid, model, prompt }) => {
  const config = await getGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Active/default Gemini configuration is missing");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.5-flash-lite")}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Gemini request failed");
  return readGeminiText(data);
};

const callOllama = async ({ colid, ollamaConfigId, prompt }) => {
  const config = await getOllamaConfig(colid, ollamaConfigId);
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${String(config.serveraddress).replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Ollama request failed");
  return data.response || "";
};

const cleanCode = (raw = "") => text(raw).replace(/^```(?:javascript|js)?/i, "").replace(/```$/i, "").trim();

const executeAgent = async ({ agent, input = {}, runBy = "Scheduler", runType = "Manual" }) => {
  assertNoDelete(agent.agentCode || "");
  const logs = [];
  const sandbox = {
    input,
    db: createAgentDb({ selectedModels: agent.selectedModels || [], colid: agent.colid }),
    email: Object.freeze({ send: (args) => sendEmail(agent.colid, args) }),
    aws: awsApi(agent.colid),
    gemini: Object.freeze({ generate: ({ prompt, model } = {}) => callGemini({ colid: agent.colid, model: model || agent.geminiModel, prompt: String(prompt || "") }) }),
    result: null,
    console: { log: (...args) => logs.push(args.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" ")) },
    Math, Date, JSON, String, Number, Boolean, Array, Object
  };
  vm.createContext(sandbox, { name: `ai-agent-${agent._id}` });
  const script = new vm.Script(`"use strict"; (async () => { ${agent.agentCode || ""} })()`, { timeout: 1000 });
  const output = await script.runInContext(sandbox, { timeout: 5000 });
  const finalOutput = output !== undefined ? output : sandbox.result;
  await AiCodingAgent.findByIdAndUpdate(agent._id, {
    lastRunAt: new Date(),
    lastRunBy: runBy,
    lastRunType: runType,
    lastRunStatus: "Success",
    lastRunOutput: finalOutput,
    lastRunLogs: logs
  });
  return { output: finalOutput, logs };
};

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [ollamaConfigs] = await Promise.all([
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
    ]);
    res.json({ success: true, geminiModels, ollamaConfigs, models: Object.keys(modelDetails()).sort(), modelDetails: modelDetails() });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const query = { colid };
    if (text(req.query.status)) query.status = text(req.query.status);
    if (text(req.query.search)) query.$or = [{ title: new RegExp(text(req.query.search), "i") }, { description: new RegExp(text(req.query.search), "i") }];
    const rows = await AiCodingAgent.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, rows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    if (!text(req.body.title)) return res.status(400).json({ success: false, message: "Title is required" });
    assertNoDelete(req.body.agentCode || "");
    const payload = {
      colid,
      user: text(req.body.user),
      createdby: text(req.body.createdby || req.body.name),
      title: text(req.body.title),
      description: text(req.body.description),
      status: text(req.body.status) || "Draft",
      active: text(req.body.active) || "No",
      scheduleMode: text(req.body.scheduleMode) || "Manual",
      scheduleDay: text(req.body.scheduleDay),
      scheduleTime: text(req.body.scheduleTime),
      provider: text(req.body.provider) || "Gemini",
      geminiModel: text(req.body.geminiModel) || "gemini-2.5-flash-lite",
      ollamaConfigId: text(req.body.ollamaConfigId),
      selectedModels: Array.isArray(req.body.selectedModels) ? req.body.selectedModels.filter(Boolean) : [],
      prompt: String(req.body.prompt || ""),
      agentCode: String(req.body.agentCode || ""),
      sampleInput: String(req.body.sampleInput || "{}")
    };
    const row = req.body.id
      ? await AiCodingAgent.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await AiCodingAgent.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Agent not found" });
    res.json({ success: true, row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.run = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const agent = await AiCodingAgent.findOne({ _id: req.body.id, colid }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
    const output = await executeAgent({ agent, input: parseJson(req.body.input ?? agent.sampleInput, {}), runBy: text(req.body.user), runType: "Manual" });
    res.json({ success: true, ...output });
  } catch (err) {
    if (req.body?.id) await AiCodingAgent.findByIdAndUpdate(req.body.id, { lastRunAt: new Date(), lastRunStatus: "Failed", lastRunOutput: { message: err.message } }).catch(() => {});
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.generate = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const prompt = `Create JavaScript agent code only. No markdown. No delete/remove operations.
Available APIs:
- db.Model.find(filters, limit), count(filters), distinct(field, filters), create(payload), updateOne(filters, patch), updateMany(filters, patch). colid is automatic.
- email.send({to, subject, html, text}) uses saved email configuration.
- aws.configs(), aws.defaultConfig(), aws.uploadText({key,text}), aws.uploadJson({key,data}), aws.uploadBase64({key,base64,contentType}) use saved AWS configuration.
- gemini.generate({prompt, model}) calls Gemini using saved AI configuration.
- set result = {...} with summary.
Selected models: ${(req.body.selectedModels || []).join(", ") || "all colid models"}.
Requirement: ${text(req.body.prompt || req.body.description || req.body.title)}`;
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama({ colid, ollamaConfigId: req.body.ollamaConfigId, prompt })
      : await callGemini({ colid, model: req.body.geminiModel, prompt });
    const agentCode = cleanCode(raw);
    assertNoDelete(agentCode);
    res.json({ success: true, agentCode });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const dayName = (date) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
const minuteKey = (agent, date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${text(agent.scheduleTime)}`;

exports.registerScheduler = () => {
  if (global.__aiCodingAgentSchedulerRegistered) return;
  global.__aiCodingAgentSchedulerRegistered = true;
  setInterval(async () => {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const agents = await AiCodingAgent.find({ active: /^yes$/i, scheduleMode: { $in: [/^Scheduled$/i, /^Both$/i] }, scheduleDay: dayName(now), scheduleTime: hhmm }).lean().catch(() => []);
    for (const agent of agents) {
      const key = minuteKey(agent, now);
      if (agent.lastScheduledRunKey === key) continue;
      await AiCodingAgent.findByIdAndUpdate(agent._id, { lastScheduledRunKey: key }).catch(() => {});
      executeAgent({ agent, input: parseJson(agent.sampleInput, {}), runBy: "Scheduler", runType: "Scheduled" }).catch((err) => {
        AiCodingAgent.findByIdAndUpdate(agent._id, { lastRunAt: new Date(), lastRunStatus: "Failed", lastRunOutput: { message: err.message } }).catch(() => {});
      });
    }
  }, 60 * 1000);
};
