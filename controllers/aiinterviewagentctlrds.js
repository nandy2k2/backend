const AiInterviewAgent = require("../Models/aiinterviewagentds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const escRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const geminiModels = [
  "gemini-3.5-pro",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.0-pro",
  "gemini-3.0-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash"
];

const getGeminiConfig = async (colid) => AiConfiguration.findOne({
  colid,
  active: /^yes$/i,
  default: /^yes$/i,
  type: /gemini/i
}).lean() || AiConfiguration.findOne({
  colid,
  active: /^yes$/i,
  type: /gemini/i
}).lean();

const callGemini = async (colid, model, prompt) => {
  const config = await getGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini AI configuration is missing");
  const models = [...new Set([text(model), ...geminiModels].filter(Boolean))];
  let lastError = "";
  for (const item of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(item)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
    lastError = data.error?.message || `Gemini request failed for ${item}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const getOllamaConfig = async (colid, id) => {
  if (id) {
    const exact = await OllamaConfiguration.findOne({ _id: id, colid, active: /^yes$/i }).lean();
    if (exact) return exact;
  }
  return OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).lean()
    || OllamaConfiguration.findOne({ colid, active: /^yes$/i }).lean();
};

const callOllama = async (colid, ollamaConfigId, prompt) => {
  const config = await getOllamaConfig(colid, ollamaConfigId);
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${String(config.serveraddress).replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: text(config.modelname),
      prompt,
      stream: false,
      options: { temperature: 0.7 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const parseKeywords = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value || "").split(",").map(text).filter(Boolean);
};

const limitWords = (value, maxWords = 120) => {
  const words = text(value).replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}.`;
};

const buildInterviewPrompt = ({ agent, answer, history, eventType }) => {
  const modeRules = {
    Aggressive: "Be a tough interviewer. Ask sharper follow-up questions, challenge vague answers, and probe weak reasoning.",
    Moderate: "Be balanced. Assess the answer clearly, ask useful follow-ups, and keep the interview moving professionally.",
    Sober: "Be calm and supportive. Give measured assessment, avoid pressure, and ask patient follow-up questions."
  };
  const eventInstruction = eventType === "opening"
    ? "Start the interview. Briefly introduce the topic and ask the first clear question. Do not assess anything yet."
    : "Assess the candidate answer in one or two sentences, then ask the next follow-up or next question. If the answer is weak, ask a probing question. If it is strong, move deeper.";
  return `You are conducting a live voice interview.

Interview topic:
${agent.topic}

Keywords to cover:
${(agent.keywords || []).join(", ") || "None"}

Mode:
${agent.mode}
${modeRules[agent.mode] || modeRules.Moderate}

Additional interviewer instructions:
${agent.additionalprompt || "None"}

Recent interview history:
${Array.isArray(history) && history.length ? history.slice(-10).map((item) => `${item.role}: ${item.text}`).join("\n") : "No prior history."}

Latest candidate answer:
${answer || "No answer yet."}

Instruction:
${eventInstruction}

Speak naturally. Keep the response between 70 and 120 words. Do not use markdown. Do not mention that you are an AI.`;
};

const callAgent = async (agent, payload = {}) => {
  const prompt = buildInterviewPrompt({
    agent,
    answer: text(payload.answer),
    history: Array.isArray(payload.history) ? payload.history : [],
    eventType: text(payload.eventType) || "response"
  });
  const response = /^ollama$/i.test(agent.provider)
    ? await callOllama(agent.colid, agent.ollamaconfigid, prompt)
    : await callGemini(agent.colid, agent.geminimodel, prompt);
  return limitWords(response, 140) || "Thank you. Please explain your answer with a little more detail.";
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const ollamaConfigurations = colid !== undefined
      ? await OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
      : [];
    res.json({ success: true, geminiModels, ollamaConfigurations, modes: ["Aggressive", "Moderate", "Sober"] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "College id is required" });
    const query = { colid };
    ["active", "status", "mode", "provider"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    if (text(req.query.search)) {
      const regex = new RegExp(escRegex(req.query.search), "i");
      query.$or = [{ title: regex }, { topic: regex }, { additionalprompt: regex }, { keywords: regex }];
    }
    const rows = await AiInterviewAgent.find(query).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "College id is required" });
    if (!text(req.body.topic)) return res.status(400).json({ success: false, message: "Topic is required" });
    const payload = {
      colid,
      title: text(req.body.title) || text(req.body.topic).slice(0, 80),
      topic: text(req.body.topic),
      keywords: parseKeywords(req.body.keywords),
      additionalprompt: text(req.body.additionalprompt),
      mode: ["Aggressive", "Moderate", "Sober"].includes(text(req.body.mode)) ? text(req.body.mode) : "Moderate",
      provider: text(req.body.provider) || "Gemini",
      geminimodel: text(req.body.geminimodel) || "gemini-2.5-flash-lite",
      ollamaconfigid: text(req.body.ollamaconfigid),
      active: text(req.body.active) || "Yes",
      status: text(req.body.status) || "Active",
      user: text(req.body.user),
      name: text(req.body.name)
    };
    const row = text(req.body._id)
      ? await AiInterviewAgent.findOneAndUpdate({ _id: req.body._id, colid }, payload, { new: true, runValidators: true }).lean()
      : await AiInterviewAgent.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Interview agent not found" });
    res.json({ success: true, row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "College id is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one interview agent" });
    const result = await AiInterviewAgent.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.start = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const agent = await AiInterviewAgent.findOne({ _id: req.body.id, colid, active: /^yes$/i }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Active interview agent not found" });
    const response = await callAgent(agent, { eventType: "opening", history: [] });
    await AiInterviewAgent.findByIdAndUpdate(agent._id, { laststartedat: new Date(), lastquestion: response });
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.respond = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const agent = await AiInterviewAgent.findOne({ _id: req.body.id, colid, active: /^yes$/i }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Active interview agent not found" });
    const response = await callAgent(agent, {
      eventType: "response",
      answer: req.body.answer,
      history: req.body.history
    });
    await AiInterviewAgent.findByIdAndUpdate(agent._id, {
      lastanswer: text(req.body.answer),
      lastassessment: response,
      lastquestion: response
    });
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
