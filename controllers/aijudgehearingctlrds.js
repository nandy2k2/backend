const AiJudgeHearing = require("../Models/aijudgehearingds");
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
        generationConfig: { temperature: 0.55 }
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
      options: { temperature: 0.55 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const callAi = async (hearing, prompt) => /^ollama$/i.test(hearing.provider)
  ? callOllama(hearing.colid, hearing.ollamaconfigid, prompt)
  : callGemini(hearing.colid, hearing.geminimodel, prompt);

const sides = (userSide) => {
  const user = text(userSide) === "Respondent" ? "Respondent" : "Petitioner";
  return { userSide: user, aiLawyerSide: user === "Petitioner" ? "Respondent" : "Petitioner" };
};

const transcriptSummary = (hearing) => (hearing.transcript || [])
  .slice(-24)
  .map((item) => `${item.role}${item.side ? ` (${item.side})` : ""}: ${item.text}`)
  .join("\n") || "No hearing statements yet.";

const documentSummary = (hearing) => (hearing.documents || [])
  .map((item, index) => `${index + 1}. ${item.title || item.filename || "Document"} [${item.side || "Shared"}] ${item.filelink || ""} ${item.notes ? `Notes: ${item.notes}` : ""}`)
  .join("\n") || "No documents uploaded yet.";

const lawyerLevelInstruction = (level) => {
  if (level === "Easy") return "Argue simply and make occasional omissions. Use accessible language.";
  if (level === "Very experienced") return "Act as a senior courtroom advocate. Use sharp issue framing, procedural objections, burden of proof, evidence admissibility, statutory interpretation, analogous precedent, distinguishing cases, and strategic questions. Be difficult to defeat but remain ethical.";
  return "Act as a competent lawyer. Use legal reasoning, fact analysis, and comparable precedents.";
};

const buildPrompt = (hearing, actor, userText = "") => {
  const isJudge = actor === "Judge";
  const roleInstruction = isJudge
    ? "You are the AI Judge. You must be neutral, manage the hearing, ask questions to either side when needed, examine all documents, identify issues, record interim observations, and avoid a final judgment until enough record is available."
    : `You are the AI Lawyer for the ${hearing.aiLawyerSide}. ${lawyerLevelInstruction(hearing.aiLawyerExperience)} You may cite relevant precedents, similar cases, legal principles, and judgments, but do not invent exact citations when unsure. Say 'similar principle' if exact citation is uncertain.`;
  return `${roleInstruction}

Case description:
${hearing.casedescription}

User side: ${hearing.userSide}
AI lawyer side: ${hearing.aiLawyerSide}
AI lawyer experience: ${hearing.aiLawyerExperience}

Documents visible to all parties and judge:
${documentSummary(hearing)}

Recent proceeding:
${transcriptSummary(hearing)}

Latest user/party input:
${userText || "No new party input."}

Respond in plain text. Keep courtroom style. If you are the Judge, ask specific questions if needed. If you are the AI Lawyer, advance your side's case and respond to documents/evidence.`;
};

const appendMessages = async (id, colid, messages, status) => AiJudgeHearing.findOneAndUpdate(
  { _id: id, colid },
  {
    $push: { transcript: { $each: messages } },
    $set: { status: status || "In Progress", lastactivityat: new Date() }
  },
  { new: true }
).lean();

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const ollamaConfigurations = colid !== undefined
      ? await OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
      : [];
    res.json({
      success: true,
      geminiModels,
      ollamaConfigurations,
      sides: ["Petitioner", "Respondent"],
      experiences: ["Easy", "Medium", "Very experienced"],
      statuses: ["Draft", "In Progress", "Paused", "Closed"]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "College id is required" });
    const query = { colid };
    ["status", "active", "userSide", "aiLawyerSide", "aiLawyerExperience", "provider"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    if (text(req.query.search)) {
      const regex = new RegExp(escRegex(req.query.search), "i");
      query.$or = [{ title: regex }, { casedescription: regex }];
    }
    const rows = await AiJudgeHearing.find(query).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "College id is required" });
    if (!text(req.body.casedescription)) return res.status(400).json({ success: false, message: "Case description is required" });
    const selectedAiLawyerSide = ["Petitioner", "Respondent"].includes(text(req.body.aiLawyerSide)) ? text(req.body.aiLawyerSide) : "";
    const sideData = selectedAiLawyerSide
      ? {
        aiLawyerSide: selectedAiLawyerSide,
        userSide: selectedAiLawyerSide === "Petitioner" ? "Respondent" : "Petitioner"
      }
      : sides(req.body.userSide);
    const payload = {
      colid,
      title: text(req.body.title) || text(req.body.casedescription).slice(0, 80),
      casedescription: text(req.body.casedescription),
      userSide: sideData.userSide,
      aiLawyerSide: sideData.aiLawyerSide,
      aiLawyerExperience: ["Easy", "Medium", "Very experienced"].includes(text(req.body.aiLawyerExperience)) ? text(req.body.aiLawyerExperience) : "Medium",
      provider: text(req.body.provider) || "Gemini",
      geminimodel: text(req.body.geminimodel) || "gemini-2.5-flash-lite",
      ollamaconfigid: text(req.body.ollamaconfigid),
      active: text(req.body.active) || "Yes",
      status: text(req.body.status) || "Draft",
      user: text(req.body.user),
      name: text(req.body.name),
      lastactivityat: new Date()
    };
    const row = text(req.body._id)
      ? await AiJudgeHearing.findOneAndUpdate({ _id: req.body._id, colid }, payload, { new: true, runValidators: true }).lean()
      : await AiJudgeHearing.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "AI Judge hearing not found" });
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
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one hearing" });
    const result = await AiJudgeHearing.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addDocument = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = text(req.body.id);
    if (colid === undefined || !id) return res.status(400).json({ success: false, message: "Hearing and college id are required" });
    const document = {
      title: text(req.body.title),
      side: text(req.body.side) || "Shared",
      filelink: text(req.body.filelink),
      filename: text(req.body.filename),
      mimetype: text(req.body.mimetype),
      uploadedby: text(req.body.user),
      notes: text(req.body.notes),
      generated: text(req.body.generated) || "No"
    };
    if (!document.filelink && !document.notes) return res.status(400).json({ success: false, message: "Document link or notes are required" });
    const row = await AiJudgeHearing.findOneAndUpdate(
      { _id: id, colid },
      { $push: { documents: document }, $set: { lastactivityat: new Date() } },
      { new: true }
    ).lean();
    if (!row) return res.status(404).json({ success: false, message: "AI Judge hearing not found" });
    res.json({ success: true, row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.start = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const hearing = await AiJudgeHearing.findOne({ _id: req.body.id, colid }).lean();
    if (!hearing) return res.status(404).json({ success: false, message: "AI Judge hearing not found" });
    const judge = await callAi(hearing, buildPrompt(hearing, "Judge", "Start or resume the hearing. Frame the issues and invite opening statements."));
    const lawyer = await callAi(hearing, buildPrompt(hearing, "Lawyer", "Give a concise opening statement for your side."));
    const row = await appendMessages(hearing._id, colid, [
      { role: "Judge", side: "Neutral", text: judge },
      { role: "AI Lawyer", side: hearing.aiLawyerSide, text: lawyer }
    ], "In Progress");
    await AiJudgeHearing.findByIdAndUpdate(hearing._id, { laststartedat: new Date() });
    res.json({ success: true, row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.pause = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const row = await AiJudgeHearing.findOneAndUpdate(
      { _id: req.body.id, colid },
      { status: "Paused", lastpausedat: new Date(), lastactivityat: new Date() },
      { new: true }
    ).lean();
    if (!row) return res.status(404).json({ success: false, message: "AI Judge hearing not found" });
    res.json({ success: true, row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.close = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const hearing = await AiJudgeHearing.findOne({ _id: req.body.id, colid }).lean();
    if (!hearing) return res.status(404).json({ success: false, message: "AI Judge hearing not found" });
    const finalOrder = await callAi(hearing, buildPrompt(hearing, "Judge", "Prepare a structured final observation/order based on the available record. Mention evidence, documents, questions, and remaining caveats."));
    const row = await appendMessages(hearing._id, colid, [{ role: "Judge", side: "Neutral", text: finalOrder }], "Closed");
    res.json({ success: true, row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.message = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const hearing = await AiJudgeHearing.findOne({ _id: req.body.id, colid }).lean();
    if (!hearing) return res.status(404).json({ success: false, message: "AI Judge hearing not found" });
    const partyText = text(req.body.text);
    if (!partyText) return res.status(400).json({ success: false, message: "Message is required" });
    const userMessage = { role: "User", side: hearing.userSide, text: partyText };
    const hearingWithUser = { ...hearing, transcript: [...(hearing.transcript || []), userMessage] };
    const lawyer = await callAi(hearingWithUser, buildPrompt(hearingWithUser, "Lawyer", partyText));
    const hearingWithLawyer = { ...hearingWithUser, transcript: [...hearingWithUser.transcript, { role: "AI Lawyer", side: hearing.aiLawyerSide, text: lawyer }] };
    const judge = await callAi(hearingWithLawyer, buildPrompt(hearingWithLawyer, "Judge", `The user said: ${partyText}\nThe AI lawyer replied: ${lawyer}\nAsk questions or make interim observations as needed.`));
    const row = await appendMessages(hearing._id, colid, [
      userMessage,
      { role: "AI Lawyer", side: hearing.aiLawyerSide, text: lawyer },
      { role: "Judge", side: "Neutral", text: judge }
    ], "In Progress");
    res.json({ success: true, row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateDocument = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const hearing = await AiJudgeHearing.findOne({ _id: req.body.id, colid }).lean();
    if (!hearing) return res.status(404).json({ success: false, message: "AI Judge hearing not found" });
    const doc = await callAi(hearing, buildPrompt(hearing, "Lawyer", `Create a supporting or counter document for ${hearing.aiLawyerSide}. Document type/request: ${text(req.body.request) || "written submission"}. Include facts, issues, arguments, comparable precedents/principles, and prayer/relief.`));
    const document = {
      title: text(req.body.title) || `AI ${hearing.aiLawyerSide} document`,
      side: hearing.aiLawyerSide,
      notes: doc,
      generated: "Yes",
      uploadedby: "AI Lawyer"
    };
    const row = await AiJudgeHearing.findOneAndUpdate(
      { _id: hearing._id, colid },
      {
        $push: {
          documents: document,
          transcript: { role: "AI Lawyer", side: hearing.aiLawyerSide, text: `Generated document: ${document.title}\n\n${doc}` }
        },
        $set: { lastactivityat: new Date(), status: "In Progress" }
      },
      { new: true }
    ).lean();
    res.json({ success: true, row, document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
