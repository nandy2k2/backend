const InstitutionMaster = require("../Models/academicmasterinstitutionds");
const FacultyMaster = require("../Models/academicmasterfacultyds");
const DepartmentMaster = require("../Models/academicmasterdepartmentds");
const ProgramOutcome = require("../Models/academicprogramoutcomeds");
const MPrograms = require("../Models/mprograms");
const ProgramwiseAccess = require("../Models/programwiseaccessds");
const User = require("../Models/user");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(escapeRegex(value), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const config = {
  institution: {
    Model: InstitutionMaster,
    fields: ["institution", "institutioncode", "description", "status"],
    required: ["institution"]
  },
  faculty: {
    Model: FacultyMaster,
    fields: ["faculty", "facultycode", "description", "status"],
    required: ["faculty"]
  },
  department: {
    Model: DepartmentMaster,
    fields: ["faculty", "institution", "department", "departmentcode", "description", "status"],
    required: ["faculty", "institution", "department"]
  }
};

function masterPayload(kind, source = {}) {
  const meta = config[kind];
  const payload = { colid: num(source.colid), user: text(source.user) };
  meta.fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) payload[field] = source[field];
  });
  if (!payload.status) payload.status = "Active";
  return payload;
}

function buildMasterFilter(kind, source = {}) {
  const meta = config[kind];
  const filter = { colid: num(source.colid) };
  meta.fields.forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  return filter;
}

exports.masterOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [institutions, faculties, departments, programs] = await Promise.all([
      InstitutionMaster.find({ colid }).sort({ institution: 1 }).lean(),
      FacultyMaster.find({ colid }).sort({ faculty: 1 }).lean(),
      DepartmentMaster.find({ colid }).sort({ faculty: 1, institution: 1, department: 1 }).lean(),
      MPrograms.find({ colid }).select("year program programcode regulation institution faculty department Order").sort({ Order: 1, program: 1 }).lean()
    ]);
    res.json({
      success: true,
      institutions,
      faculties,
      departments,
      programs,
      academicyears: uniqueSorted(programs.map((row) => row.year)),
      regulations: uniqueSorted(programs.map((row) => row.regulation))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listMaster = async (req, res) => {
  try {
    const kind = text(req.params.kind).toLowerCase();
    if (!config[kind]) return res.status(400).json({ success: false, message: "Invalid master type" });
    const rows = await config[kind].Model.find(buildMasterFilter(kind, req.query)).sort({ updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveMaster = async (req, res) => {
  try {
    const kind = text(req.params.kind).toLowerCase();
    if (!config[kind]) return res.status(400).json({ success: false, message: "Invalid master type" });
    const payload = masterPayload(kind, req.body);
    const missing = config[kind].required.filter((field) => !text(payload[field]));
    if (missing.length) return res.status(400).json({ success: false, message: `${missing.join(", ")} required` });
    const data = req.body.id
      ? await config[kind].Model.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await config[kind].Model.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Duplicate master entry" : error.message });
  }
};

exports.deleteMaster = async (req, res) => {
  try {
    const kind = text(req.params.kind).toLowerCase();
    if (!config[kind]) return res.status(400).json({ success: false, message: "Invalid master type" });
    await config[kind].Model.deleteMany({ _id: { $in: Array.isArray(req.body.ids) ? req.body.ids : [req.body.id] }, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkMaster = async (req, res) => {
  try {
    const kind = text(req.params.kind).toLowerCase();
    if (!config[kind]) return res.status(400).json({ success: false, message: "Invalid master type" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => masterPayload(kind, { ...row, colid: req.body.colid, user: req.body.user }));
    const data = docs.length ? await config[kind].Model.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Some entries are duplicate" : error.message });
  }
};

function poPayload(source = {}) {
  return {
    academicyear: text(source.academicyear),
    regulation: text(source.regulation),
    program: text(source.program),
    programcode: text(source.programcode),
    pocode: text(source.pocode || source.poCode),
    po: text(source.po),
    status: text(source.status) || "Active",
    colid: num(source.colid),
    user: text(source.user)
  };
}

exports.listPo = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid) };
    ["academicyear", "regulation", "program", "programcode", "pocode", "status"].forEach((field) => {
      if (text(req.query[field])) filter[field] = regex(req.query[field]);
    });
    const data = await ProgramOutcome.find(filter).sort({ academicyear: -1, program: 1, pocode: 1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePo = async (req, res) => {
  try {
    const payload = poPayload(req.body);
    if (!payload.colid || !payload.programcode || !payload.pocode || !payload.po) return res.status(400).json({ success: false, message: "Program, PO code and PO are required" });
    const data = req.body.id
      ? await ProgramOutcome.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ProgramOutcome.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePo = async (req, res) => {
  try {
    await ProgramOutcome.deleteMany({ _id: { $in: Array.isArray(req.body.ids) ? req.body.ids : [req.body.id] }, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkPo = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => poPayload({ ...row, colid: req.body.colid, user: req.body.user })).filter((row) => row.programcode && row.pocode && row.po);
    const data = docs.length ? await ProgramOutcome.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const readGeminiText = (payload = {}) => payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
const getAiConfig = (colid, provider) => AiConfiguration.findOne({ colid, type: new RegExp(`^${escapeRegex(provider)}$`, "i"), active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  .then((row) => row || AiConfiguration.findOne({ colid, type: new RegExp(`^${escapeRegex(provider)}$`, "i"), active: /^yes$/i }).sort({ _id: -1 }).lean());

async function callProvider({ colid, provider, model, prompt, ollamaConfigId }) {
  const normalized = text(provider || "Gemini").toLowerCase();
  if (normalized === "ollama") {
    const query = { colid, active: /^yes$/i };
    const config = ollamaConfigId ? await OllamaConfiguration.findOne({ ...query, _id: ollamaConfigId }).lean() : await OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean() || await OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean();
    if (!config) throw new Error("Active Ollama configuration is missing");
    const response = await fetch(`${String(config.serveraddress || "").replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model || config.modelname, prompt, stream: false })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ollama request failed");
    return data.response || "";
  }
  if (normalized === "claude") {
    const config = await getAiConfig(colid, "Claude");
    if (!config?.apikey) throw new Error("Active Claude configuration is missing");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apikey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || "claude-3-5-sonnet-20241022", max_tokens: 3000, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Claude request failed");
    return data.content?.map((part) => part.text || "").join("\n") || "";
  }
  if (normalized === "chatgpt" || normalized === "openai") {
    const config = await getAiConfig(colid, "ChatGPT") || await getAiConfig(colid, "OpenAI");
    if (!config?.apikey) throw new Error("Active OpenAI/ChatGPT configuration is missing");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apikey}` },
      body: JSON.stringify({ model: model || "gpt-4o-mini", messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed");
    return data.choices?.[0]?.message?.content || "";
  }
  const config = await getAiConfig(colid, "Gemini");
  if (!config?.apikey) throw new Error("Active Gemini configuration is missing");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini request failed");
  return readGeminiText(data);
}

exports.generatePo = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const program = await MPrograms.findOne({ colid, programcode: text(req.body.programcode) }).lean();
    const prompt = [
      "Generate program outcomes as JSON array only.",
      "Each item must have fields pocode and po.",
      `Academic year: ${text(req.body.academicyear)}`,
      `Regulation: ${text(req.body.regulation)}`,
      `Program: ${text(req.body.program || program?.program)}`,
      `Program code: ${text(req.body.programcode)}`,
      `Faculty: ${text(program?.faculty)}`,
      `Institution: ${text(program?.institution)}`,
      `Department: ${text(program?.department)}`,
      `Additional prompt: ${text(req.body.prompt)}`
    ].join("\n");
    const raw = await callProvider({ colid, provider: req.body.provider, model: req.body.model, prompt, ollamaConfigId: req.body.ollamaConfigId });
    const jsonText = (raw.match(/\[[\s\S]*\]/) || [raw])[0];
    let items = [];
    try {
      items = JSON.parse(jsonText);
    } catch {
      items = raw.split(/\n+/).map((line, index) => ({ pocode: `PO${index + 1}`, po: line.replace(/^[-*\d.\s]+/, "").trim() })).filter((item) => item.po);
    }
    res.json({ success: true, raw, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.myProgramStudents = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const useremail = text(req.query.useremail || req.query.user);
    const accessFilter = { colid, useremail };
    if (text(req.query.programcode)) accessFilter.programcode = text(req.query.programcode);
    const access = await ProgramwiseAccess.find(accessFilter).sort({ program: 1 }).lean();
    const programcodes = uniqueSorted(access.map((row) => row.programcode));
    if (!programcodes.length) return res.json({ success: true, programs: [], data: [] });
    const unrestrictedProgramcodes = uniqueSorted(access.filter((row) => !text(row.semester)).map((row) => row.programcode));
    const semesterPairs = access
      .filter((row) => text(row.semester))
      .map((row) => ({ programcode: text(row.programcode), semester: text(row.semester) }));
    const accessOr = [];
    if (unrestrictedProgramcodes.length) accessOr.push({ programcode: { $in: unrestrictedProgramcodes } });
    semesterPairs.forEach((row) => accessOr.push({ programcode: row.programcode, semester: row.semester }));
    const query = { colid, role: /^Student$/i, $or: accessOr.length ? accessOr : [{ programcode: { $in: programcodes } }] };
    ["academicyear", "regulation", "programcode", "semester", "section", "admissionyear"].forEach((field) => {
      if (text(req.query[field])) query[field] = regex(req.query[field]);
    });
    if (text(req.query.student)) query.name = regex(req.query.student);
    if (text(req.query.regno)) query.regno = regex(req.query.regno);
    const data = await User.find(query).select("name email user phone regno academicyear admissionyear regulation program programcode semester section category gender status photo").sort({ programcode: 1, semester: 1, name: 1 }).limit(5000).lean();
    res.json({ success: true, programs: access, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
