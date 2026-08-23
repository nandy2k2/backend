const vm = require("vm");
const mongoose = require("mongoose");
const MyCodeEditor = require("../Models/mycodeeditords");
const MyCodeCustomData = require("../Models/mycodecustomdatads");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
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

const customModelNames = (value) => {
  const parsed = parseJson(value, []);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => text(typeof item === "string" ? item : item?.name || item?.modelName)).filter(Boolean);
  }
  if (parsed && typeof parsed === "object") {
    return Object.keys(parsed).map(text).filter(Boolean);
  }
  return [];
};

const userScopedQuery = (bodyOrQuery = {}) => {
  const colid = num(bodyOrQuery.colid);
  const user = text(bodyOrQuery.user);
  if (colid === undefined) throw new Error("colid is required");
  if (!user) throw new Error("user is required");
  return { colid, user };
};

const loadedModelDetails = () => {
  const details = {};
  mongoose.modelNames().forEach((name) => {
    try {
      const schema = mongoose.model(name).schema;
      details[name] = Object.keys(schema.paths || {}).map((field) => ({
        field,
        type: schema.paths[field]?.instance || "Mixed"
      }));
    } catch {
      details[name] = [];
    }
  });
  return details;
};

const buildSafeQuery = (Model, filters = {}, colid) => {
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
      query[field] = new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    } else {
      query[field] = value;
    }
  });
  return query;
};

const modelAliases = (modelName) => {
  const clean = text(modelName);
  if (!clean) return [];
  const aliases = new Set([clean]);
  aliases.add(clean.toLowerCase());
  aliases.add(clean.charAt(0).toUpperCase() + clean.slice(1));
  aliases.add(clean.replace(/[^a-zA-Z0-9_$]/g, ""));
  if (clean.endsWith("s") && clean.length > 1) {
    const singular = clean.slice(0, -1);
    aliases.add(singular);
    aliases.add(singular.toLowerCase());
    aliases.add(singular.charAt(0).toUpperCase() + singular.slice(1));
  }
  if (clean.endsWith("ds2") && clean.length > 3) {
    aliases.add(clean.slice(0, -3));
  } else if (clean.endsWith("ds") && clean.length > 2) {
    aliases.add(clean.slice(0, -2));
  }
  return Array.from(aliases).filter(Boolean);
};

const unavailableModel = (requested, available) => Object.freeze({
  fields: [],
  find: async () => {
    throw new Error(`Model "${requested}" is not available. Select it in Existing ERP models first. Available models: ${available.join(", ") || "none"}`);
  },
  count: async () => {
    throw new Error(`Model "${requested}" is not available. Select it in Existing ERP models first. Available models: ${available.join(", ") || "none"}`);
  },
  distinct: async () => {
    throw new Error(`Model "${requested}" is not available. Select it in Existing ERP models first. Available models: ${available.join(", ") || "none"}`);
  }
});

const blockedExistingModelMutation = (modelName, operation) => async () => {
  throw new Error(`Blocked: existing ERP model "${modelName}" is read-only. "${operation}" is not allowed. Use custom models for create/update/delete operations.`);
};

const existingModelMutationPattern = /\bdb\s*\.\s*([A-Za-z_$][\w$]*)\s*\.\s*(create|insertMany|insertOne|update|updateOne|updateMany|delete|deleteOne|deleteMany|remove|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|findByIdAndDelete|replaceOne|bulkWrite|save)\s*\(/;

const assertNoExistingModelMutation = (code = "") => {
  const match = String(code || "").match(existingModelMutationPattern);
  if (match) {
    throw new Error(`Blocked: existing ERP model "${match[1]}" is read-only. "${match[2]}" is not allowed. Use db.${match[1]}.find/count/distinct only, or use custom.${match[1]} for isolated custom CRUD.`);
  }
};

const createSafeDb = ({ selectedModels = [], colid }) => {
  const db = {};
  const exposed = [];
  const modelNames = Array.isArray(selectedModels) && selectedModels.length
    ? selectedModels
    : mongoose.modelNames().filter((name) => {
      try {
        return Object.prototype.hasOwnProperty.call(mongoose.model(name).schema.paths || {}, "colid");
      } catch {
        return false;
      }
    });
  modelNames.forEach((modelName) => {
    if (!mongoose.modelNames().includes(modelName)) return;
    const Model = mongoose.model(modelName);
    const fields = new Set(Object.keys(Model.schema.paths || {}));
    if (!fields.has("colid")) return;
    const safeModel = Object.freeze({
      fields: Array.from(fields),
      find: async (filters = {}, limit = 100) => {
        const safeLimit = Math.min(Math.max(num(limit) || 100, 1), 500);
        return Model.find(buildSafeQuery(Model, filters, colid)).limit(safeLimit).lean();
      },
      count: async (filters = {}) => Model.countDocuments(buildSafeQuery(Model, filters, colid)),
      distinct: async (field, filters = {}) => {
        if (!fields.has(field) || field === "colid") return [];
        return Model.distinct(field, buildSafeQuery(Model, filters, colid));
      },
      create: blockedExistingModelMutation(modelName, "create"),
      insertMany: blockedExistingModelMutation(modelName, "insertMany"),
      insertOne: blockedExistingModelMutation(modelName, "insertOne"),
      update: blockedExistingModelMutation(modelName, "update"),
      updateOne: blockedExistingModelMutation(modelName, "updateOne"),
      updateMany: blockedExistingModelMutation(modelName, "updateMany"),
      delete: blockedExistingModelMutation(modelName, "delete"),
      deleteOne: blockedExistingModelMutation(modelName, "deleteOne"),
      deleteMany: blockedExistingModelMutation(modelName, "deleteMany"),
      remove: blockedExistingModelMutation(modelName, "remove"),
      findOneAndUpdate: blockedExistingModelMutation(modelName, "findOneAndUpdate"),
      findByIdAndUpdate: blockedExistingModelMutation(modelName, "findByIdAndUpdate"),
      findOneAndDelete: blockedExistingModelMutation(modelName, "findOneAndDelete"),
      findByIdAndDelete: blockedExistingModelMutation(modelName, "findByIdAndDelete"),
      replaceOne: blockedExistingModelMutation(modelName, "replaceOne"),
      bulkWrite: blockedExistingModelMutation(modelName, "bulkWrite"),
      save: blockedExistingModelMutation(modelName, "save")
    });
    modelAliases(modelName).forEach((alias) => {
      if (!db[alias]) {
        db[alias] = safeModel;
        exposed.push(alias);
      }
    });
  });
  return new Proxy(Object.freeze(db), {
    get(target, prop) {
      if (typeof prop !== "string" || prop in target) return target[prop];
      if (["then", "inspect", "toJSON", "valueOf"].includes(prop)) return undefined;
      return unavailableModel(prop, exposed);
    }
  });
};

const customDataQuery = (filters = {}) => {
  const query = {};
  Object.entries(filters || {}).forEach(([field, value]) => {
    const cleanField = text(field);
    if (!cleanField || ["_id", "colid", "user", "pageId", "modelName"].includes(cleanField)) return;
    if (value === undefined || value === null || value === "") return;
    query[`data.${cleanField}`] = typeof value === "string"
      ? new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      : value;
  });
  return query;
};

const createCustomDb = ({ allowedNames = [], colid, user, pageId, createdby }) => {
  const custom = {};
  allowedNames.forEach((modelName) => {
    custom[modelName] = Object.freeze({
      find: async (filters = {}, limit = 100) => {
        const safeLimit = Math.min(Math.max(num(limit) || 100, 1), 500);
        return MyCodeCustomData.find({ colid, user, pageId, modelName, ...customDataQuery(filters) }).limit(safeLimit).lean();
      },
      create: async (data = {}) => MyCodeCustomData.create({ colid, user, pageId, modelName, data, createdby }),
      update: async (id, data = {}) => MyCodeCustomData.findOneAndUpdate({ _id: id, colid, user, pageId, modelName }, { data }, { new: true }).lean(),
      delete: async (id) => MyCodeCustomData.deleteOne({ _id: id, colid, user, pageId, modelName }),
      count: async (filters = {}) => MyCodeCustomData.countDocuments({ colid, user, pageId, modelName, ...customDataQuery(filters) })
    });
  });
  return Object.freeze(custom);
};

exports.options = async (req, res) => {
  try {
    const scope = userScopedQuery(req.query);
    const modelDetails = loadedModelDetails();
    const models = Object.keys(modelDetails)
      .filter((name) => {
        try {
          return Object.prototype.hasOwnProperty.call(mongoose.model(name).schema.paths || {}, "colid");
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b));
    const ollamaConfigs = await OllamaConfiguration.find({ colid: scope.colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean();
    res.json({ success: true, models, modelDetails, geminiModels, ollamaConfigs });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
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
  const requested = text(model) || "gemini-2.5-flash-lite";
  const candidates = [...new Set([requested, "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"])];
  let lastError = "";
  for (const geminiModel of candidates) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return readGeminiText(data);
    lastError = data?.error?.message || `Gemini request failed for ${geminiModel}`;
  }
  throw new Error(lastError || "Gemini request failed");
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

const extractGeneratedCodeJson = (raw) => {
  const cleaned = text(raw).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("AI response did not include valid JSON");
};

const unwrapGeneratedBackendCode = (code = "") => {
  let value = String(code || "").trim();
  value = value.replace(/^```(?:javascript|js)?/i, "").replace(/```$/i, "").trim();
  const patterns = [
    /^\(?\s*async\s*\(\s*input\s*\)\s*=>\s*\{([\s\S]*)\}\s*\)?\s*;?\s*$/i,
    /^\(?\s*\(\s*input\s*\)\s*=>\s*\{([\s\S]*)\}\s*\)?\s*;?\s*$/i,
    /^async\s+function\s*[A-Za-z0-9_$]*\s*\(\s*input\s*\)\s*\{([\s\S]*)\}\s*;?\s*$/i,
    /^function\s+[A-Za-z0-9_$]*\s*\(\s*input\s*\)\s*\{([\s\S]*)\}\s*;?\s*$/i,
    /^\(\s*async\s*\(\s*\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)\s*;?\s*$/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      value = match[1].trim();
      break;
    }
  }
  value = value.replace(/^\s*return\s+\{([\s\S]*)\}\s*;?\s*$/i, "result = {$1};").trim();
  return value;
};

const buildAiCodeEditorPrompt = (body = {}, modelDetails = {}) => `
You are generating code for CampusTechnology AI Code Editor.
Return ONLY JSON. No markdown.
Required JSON shape:
{
  "title": "page title",
  "description": "short description",
  "selectedModels": ["exact existing model names to connect"],
  "customModels": "[{ \\"name\\": \\"LocalModel\\", \\"fields\\": [\\"field1\\"] }]",
  "virtualModels": "{}",
  "sampleInput": "{}",
  "backendCode": "complete JavaScript backend code string",
  "frontendCode": "complete pure HTML/CSS/JavaScript code string"
}

Runtime rules:
- Backend code runs in the interactive code editor sandbox.
- backendCode MUST be raw executable statements only. Do NOT wrap backendCode in async (input) => {}, function(input) {}, module.exports, export default, or an IIFE.
- Correct backendCode starts like: const action = input.action || "initial"; const payload = input.payload || {}; if (action === "loadAcademicYears") { ... result = {...}; }
- Existing ERP models are available as db.ModelName.find(filters, limit), db.ModelName.count(filters), db.ModelName.distinct(field, filters) only.
- Existing ERP models are read only. Do not use db.Model.create/update/delete/findOneAndUpdate/save/bulkWrite.
- Existing ERP reads are automatically scoped by colid. Do not ask the user to enter colid.
- For local page-owned CRUD, define customModels and use custom.ModelName.create/find/update/delete in backend code.
- Backend receives input.action and input.payload. It must branch by action and set result = {...}.
- Backend must set result to a non-null object for every possible action, including initial/default.
- Backend action names must exactly match the action names used in frontend window.myCodeApi.call("actionName", payload).
- For dropdown loaders such as academic years, programs, courses or students, return arrays with stable names, for example result = { academicYears: [], programs: [], rows: [] }.
- Frontend must be pure HTML/CSS/JavaScript. Do not use React imports.
- Frontend must call backend using window.myCodeApi.call("actionName", payload).
- Frontend must never assume a response is non-null. Use guards like const academicYears = Array.isArray(data.academicYears) ? data.academicYears : [].
- Frontend DOM code must run after elements exist: place custom inline scripts just before </body> or wrap initialization in document.addEventListener("DOMContentLoaded", init).
- Every getElementById/querySelector result must be null-checked before reading properties or assigning innerHTML/value/listeners.
- Include loading states, error display, professional layout, charts if requested, and tables with wrapped text.
- Never include external CSS imports. If using a chart library, load it from a CDN script tag in frontendCode.
- Do not expose or edit colid anywhere.

Selected existing models: ${JSON.stringify(body.selectedModels || [])}
Selected model details: ${JSON.stringify(modelDetails || {})}
Current customModels JSON: ${String(body.customModels || "[]")}
Current sample input: ${String(body.sampleInput || "{}")}
Requested mode: ${text(body.outputMode) || "Interactive CRUD / Report"}
User prompt: ${text(body.prompt)}
`;

exports.generate = async (req, res) => {
  try {
    const scope = userScopedQuery(req.body);
    if (!text(req.body.prompt)) return res.status(400).json({ success: false, message: "Prompt is required" });
    const allDetails = loadedModelDetails();
    const modelDetails = {};
    (Array.isArray(req.body.selectedModels) ? req.body.selectedModels : []).forEach((name) => {
      if (allDetails[name]) modelDetails[name] = allDetails[name];
    });
    const prompt = buildAiCodeEditorPrompt(req.body, modelDetails);
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama({ colid: scope.colid, ollamaConfigId: req.body.ollamaConfigId, prompt })
      : await callGemini({ colid: scope.colid, model: req.body.geminiModel, prompt });
    let generated;
    try {
      generated = extractGeneratedCodeJson(raw);
    } catch {
      generated = {
        title: text(req.body.title) || "AI generated interactive page",
        description: text(req.body.description),
        selectedModels: Array.isArray(req.body.selectedModels) ? req.body.selectedModels : [],
        customModels: String(req.body.customModels || "[]"),
        virtualModels: String(req.body.virtualModels || "{}"),
        sampleInput: String(req.body.sampleInput || "{}"),
        backendCode: "",
        frontendCode: raw || ""
      };
    }
    generated.backendCode = unwrapGeneratedBackendCode(generated.backendCode || "");
    assertNoExistingModelMutation(generated.backendCode || "");
    res.json({ success: true, generated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = userScopedQuery(req.query);
    if (text(req.query.status)) query.status = text(req.query.status);
    if (text(req.query.search)) query.$or = [
      { title: new RegExp(text(req.query.search), "i") },
      { description: new RegExp(text(req.query.search), "i") }
    ];
    const rows = await MyCodeEditor.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, rows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    const scope = userScopedQuery(req.body);
    if (!text(req.body.title)) return res.status(400).json({ success: false, message: "Title is required" });
    const payload = {
      ...scope,
      title: text(req.body.title),
      description: text(req.body.description),
      status: text(req.body.status) || "Draft",
      selectedModels: Array.isArray(req.body.selectedModels) ? req.body.selectedModels.filter(Boolean) : [],
      customModels: String(req.body.customModels || ""),
      virtualModels: String(req.body.virtualModels || ""),
      backendCode: unwrapGeneratedBackendCode(req.body.backendCode || ""),
      frontendCode: String(req.body.frontendCode || ""),
      sampleInput: String(req.body.sampleInput || "{}"),
      createdby: text(req.body.createdby || req.body.name)
    };
    const row = req.body.id
      ? await MyCodeEditor.findOneAndUpdate({ _id: req.body.id, ...scope }, payload, { new: true })
      : await MyCodeEditor.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Code page not found" });
    res.json({ success: true, row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const scope = userScopedQuery(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await MyCodeEditor.deleteMany({ ...scope, _id: { $in: ids } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const executeCodePage = async ({ scope, id, inputValue, persistLastRun = false }) => {
  const row = await MyCodeEditor.findOne({ _id: id, ...scope }).lean();
  if (!row) {
    const err = new Error("Code page not found");
    err.statusCode = 404;
    throw err;
  }
  const executableBackendCode = unwrapGeneratedBackendCode(row.backendCode || "");
  assertNoExistingModelMutation(executableBackendCode);

  const input = parseJson(inputValue ?? row.sampleInput, {});
    const virtualModels = parseJson(row.virtualModels, {});
    const db = createSafeDb({ selectedModels: row.selectedModels || [], colid: scope.colid });
    const custom = createCustomDb({
      allowedNames: customModelNames(row.customModels),
      colid: scope.colid,
      user: scope.user,
      pageId: row._id,
      createdby: text(row.createdby)
    });
    const logs = [];
    const sandbox = {
      input,
      virtualModels,
      localModels: virtualModels,
      db,
      custom,
      result: null,
      console: {
        log: (...args) => logs.push(args.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" "))
      },
      Math,
      Date,
      JSON,
      String,
      Number,
      Boolean,
      Array,
      Object
    };
  vm.createContext(sandbox, { name: `my-code-${row._id}` });
    const script = new vm.Script(`
      "use strict";
      (async () => {
        ${executableBackendCode}
      })()
    `, { timeout: 1000 });
  const output = await script.runInContext(sandbox, { timeout: 2000 });
  const finalOutput = output !== undefined ? output : sandbox.result;
  if (persistLastRun) {
    await MyCodeEditor.findOneAndUpdate({ _id: row._id, ...scope }, {
      lastBackendOutput: finalOutput,
      lastRunAt: new Date()
    });
  }
  return { output: finalOutput, logs, row };
};

exports.runBackend = async (req, res) => {
  try {
    const scope = userScopedQuery(req.body);
    const { output, logs } = await executeCodePage({
      scope,
      id: req.body.id,
      inputValue: req.body.input,
      persistLastRun: true
    });
    res.json({ success: true, output, logs });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

exports.interact = async (req, res) => {
  try {
    const scope = userScopedQuery(req.body);
    const input = {
      action: text(req.body.action),
      payload: req.body.payload || {},
      event: req.body.event || null
    };
    const { output, logs } = await executeCodePage({
      scope,
      id: req.body.id,
      inputValue: input,
      persistLastRun: false
    });
    res.json({ success: true, output, logs });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

exports.customDataList = async (req, res) => {
  try {
    const scope = userScopedQuery(req.query);
    const pageId = text(req.query.pageId);
    const modelName = text(req.query.modelName);
    if (!pageId || !modelName) return res.status(400).json({ success: false, message: "pageId and modelName are required" });
    const page = await MyCodeEditor.findOne({ _id: pageId, ...scope }).lean();
    if (!page) return res.status(404).json({ success: false, message: "Code page not found" });
    if (!customModelNames(page.customModels).includes(modelName)) return res.status(400).json({ success: false, message: "Custom model is not defined for this page" });
    const rows = await MyCodeCustomData.find({ ...scope, pageId, modelName }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, rows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.customDataSave = async (req, res) => {
  try {
    const scope = userScopedQuery(req.body);
    const pageId = text(req.body.pageId);
    const modelName = text(req.body.modelName);
    if (!pageId || !modelName) return res.status(400).json({ success: false, message: "pageId and modelName are required" });
    const page = await MyCodeEditor.findOne({ _id: pageId, ...scope }).lean();
    if (!page) return res.status(404).json({ success: false, message: "Code page not found" });
    if (!customModelNames(page.customModels).includes(modelName)) return res.status(400).json({ success: false, message: "Custom model is not defined for this page" });
    const data = parseJson(req.body.data, {});
    const payload = { ...scope, pageId, modelName, data, createdby: text(req.body.createdby || req.body.name) };
    const row = req.body.id
      ? await MyCodeCustomData.findOneAndUpdate({ _id: req.body.id, ...scope, pageId, modelName }, { data }, { new: true })
      : await MyCodeCustomData.create(payload);
    res.json({ success: true, row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.customDataDelete = async (req, res) => {
  try {
    const scope = userScopedQuery(req.body);
    const pageId = text(req.body.pageId);
    const modelName = text(req.body.modelName);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await MyCodeCustomData.deleteMany({ ...scope, pageId, modelName, _id: { $in: ids } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
