const AcademicCalendar = require("../Models/macadcal");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const fields = [
  "academicyear",
  "program",
  "programcode",
  "regulation",
  "semester",
  "ativity",
  "description",
  "activitydate",
  "type",
  "level",
  "status1",
  "comments"
];

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const clean = (value) => String(value ?? "").trim();
const geminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];

const normalizeType = (value) => {
  const type = clean(value);
  if (/^holiday$/i.test(type)) return "Holiday";
  if (/^working day$/i.test(type) || /^workingday$/i.test(type)) return "Working day";
  return type || "Working day";
};

const normalizeDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const readJsonBlock = (raw = "") => {
  const textValue = clean(raw).replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(textValue);
  } catch (error) {
    const match = textValue.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw error;
  }
};

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || ""
);

const getDefaultGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGeminiText = async ({ colid, model, prompt }) => {
  const config = await getDefaultGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini configuration is missing");
  const selectedModel = clean(model) || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25 }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini calendar generation failed");
  return readGeminiText(data);
};

const callOllamaText = async ({ colid, ollamaId, prompt }) => {
  const config = ollamaId
    ? await OllamaConfiguration.findOne({ _id: ollamaId, colid, active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || await OllamaConfiguration.findOne({ colid, active: /^yes$/i }).sort({ _id: -1 }).lean();
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${config.serveraddress.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ollama calendar generation failed");
  return data.response || "";
};

const buildPayload = (body = {}) => {
  const payload = {};
  fields.forEach((field) => {
    const sourceValue = field === "ativity" ? (body.ativity ?? body.activity) : body[field];
    if (sourceValue !== undefined) payload[field] = sourceValue;
  });
  payload.ativity = clean(payload.ativity);
  payload.type = normalizeType(payload.type);
  payload.activitydate = normalizeDate(payload.activitydate);
  return payload;
};

const buildAiPrompt = (body = {}) => `
Create an academic calendar as JSON only.
Return a JSON array. Each item must have exactly these keys:
ativity, description, activitydate, type, level, comments.

Rules:
- activitydate must be in YYYY-MM-DD format.
- type must be either "Working day" or "Holiday".
- Keep every date within ${clean(body.startdate)} to ${clean(body.enddate)}.
- Use the user's conditions carefully.
- Do not add markdown, commentary, or explanations.

Context:
Academic year: ${clean(body.academicyear)}
Regulation: ${clean(body.regulation)}
Program: ${clean(body.program)}
Program code: ${clean(body.programcode)}
Semester: ${clean(body.semester)}
Start date: ${clean(body.startdate)}
End date: ${clean(body.enddate)}
User conditions:
${clean(body.prompt)}
`;

exports.aiOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const gemini = await AiConfiguration.find({ colid, type: /^gemini$/i, active: /^yes$/i }).select("name default active type").lean();
    const ollama = await OllamaConfiguration.find({ colid, active: /^yes$/i }).select("name serveraddress modelname default active").lean();
    res.json({ success: true, geminiConfigured: gemini.length > 0, geminiModels, ollama });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load AI options" });
  }
};

exports.generateAi = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!clean(req.body.academicyear) || !clean(req.body.startdate) || !clean(req.body.enddate)) {
      return res.status(400).json({ success: false, message: "Academic year, start date and end date are required" });
    }
    if (new Date(req.body.startdate) > new Date(req.body.enddate)) {
      return res.status(400).json({ success: false, message: "Start date cannot be after end date" });
    }

    const aiPrompt = buildAiPrompt(req.body);
    const raw = /^ollama$/i.test(clean(req.body.provider))
      ? await callOllamaText({ colid, ollamaId: req.body.ollamaId || req.body.ollamaConfigId, prompt: aiPrompt })
      : await callGeminiText({ colid, model: req.body.geminiModel, prompt: aiPrompt });

    const parsed = readJsonBlock(raw);
    const inputRows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.rows) ? parsed.rows : []);
    const start = new Date(req.body.startdate);
    const end = new Date(req.body.enddate);
    const rows = inputRows.map((row) => buildPayload({
      academicyear: req.body.academicyear,
      regulation: req.body.regulation,
      program: req.body.program,
      programcode: req.body.programcode,
      semester: req.body.semester,
      level: row.level || req.body.level,
      ativity: row.ativity || row.activity,
      description: row.description,
      activitydate: row.activitydate || row.date,
      type: row.type,
      status1: "Active",
      comments: row.comments
    })).filter((row) => row.ativity && row.activitydate && row.activitydate >= start && row.activitydate <= end)
      .sort((a, b) => a.activitydate - b.activitydate)
      .map((row, index) => ({ ...row, id: `ai-${index + 1}` }));

    res.json({ success: true, data: rows, raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to generate academic calendar" });
  }
};

exports.getAll = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await AcademicCalendar.find({ colid }).sort({ activitydate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load academic calendar" });
  }
};

exports.create = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = buildPayload(req.body);
    if (!payload.academicyear || !payload.ativity || !payload.activitydate) {
      return res.status(400).json({ success: false, message: "Academic year, activity and activity date are required" });
    }
    const row = await AcademicCalendar.create({
      ...payload,
      colid,
      name: clean(req.body.name) || clean(req.body.user) || "NA",
      user: clean(req.body.user) || "NA"
    });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to create academic calendar entry" });
  }
};

exports.update = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const id = clean(req.body.id || req.body._id);
    if (!id || colid === undefined) return res.status(400).json({ success: false, message: "id and colid are required" });
    const payload = buildPayload(req.body);
    if (!payload.academicyear || !payload.ativity || !payload.activitydate) {
      return res.status(400).json({ success: false, message: "Academic year, activity and activity date are required" });
    }
    const row = await AcademicCalendar.findOneAndUpdate({ _id: id, colid }, payload, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "Academic calendar entry not found" });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to update academic calendar entry" });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const id = clean(req.body.id || req.body._id);
    if (!id || colid === undefined) return res.status(400).json({ success: false, message: "id and colid are required" });
    await AcademicCalendar.findOneAndDelete({ _id: id, colid });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to delete academic calendar entry" });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const user = clean(req.body.user) || "NA";
    const name = clean(req.body.name) || user;
    const errors = [];
    const docs = [];

    rows.forEach((row, index) => {
      const payload = buildPayload({
        academicyear: row.academicyear || row["Academic Year"],
        program: row.program || row.Program,
        programcode: row.programcode || row["Program Code"],
        regulation: row.regulation || row.Regulation,
        semester: row.semester || row.Semester,
        ativity: row.ativity || row.activity || row.Activity,
        description: row.description || row.Description,
        activitydate: row.activitydate || row["Activity Date"],
        type: row.type || row.Type,
        level: row.level || row.Level,
        status1: row.status1 || row.Status,
        comments: row.comments || row.Comments
      });
      if (!payload.academicyear || !payload.ativity || !payload.activitydate) {
        errors.push({ row: index + 2, message: "Academic year, activity and activity date are required" });
        return;
      }
      docs.push({ ...payload, colid, name, user });
    });

    if (docs.length) await AcademicCalendar.insertMany(docs, { ordered: false });
    res.json({ success: true, saved: docs.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to bulk upload academic calendar" });
  }
};
