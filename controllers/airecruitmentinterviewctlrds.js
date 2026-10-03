const crypto = require("crypto");
const nodemailer = require("nodemailer");
const AiRecruitmentInterviewAgent = require("../Models/airecruitmentinterviewagentds");
const AiRecruitmentInterviewAssignment = require("../Models/airecruitmentinterviewassignmentds");
const RecruitmentApplication = require("../Models/recruitmentapplicationds");
const RecruitmentJobPost = require("../Models/recruitmentjobpostds");
const RecruitmentForm = require("../Models/recruitmentformds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const EmailConfiguration = require("../Models/emailconfigurationds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const escRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const geminiModels = [
  "gemini-3.5-pro", "gemini-3.5-flash", "gemini-3.5-flash-lite",
  "gemini-3.0-pro", "gemini-3.0-flash",
  "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite",
  "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"
];
const modes = ["Aggressive", "Moderate", "Sober"];
const difficulties = ["Easy", "Medium", "Difficult", "Expert"];

const parseKeywords = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value || "").split(",").map(text).filter(Boolean);
};

const getGeminiConfig = async (colid) => AiConfiguration.findOne({
  colid,
  active: /^yes$/i,
  default: /^yes$/i,
  type: /gemini/i
}).lean() || AiConfiguration.findOne({ colid, active: /^yes$/i, type: /gemini/i }).lean();

const getOllamaConfig = async (colid, id) => {
  if (id) {
    const exact = await OllamaConfiguration.findOne({ _id: id, colid, active: /^yes$/i }).lean();
    if (exact) return exact;
  }
  return OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).lean()
    || OllamaConfiguration.findOne({ colid, active: /^yes$/i }).lean();
};

const getEmailConfig = async (colid) => EmailConfiguration.findOne({ colid, isactive: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || EmailConfiguration.findOne({ colid, isactive: /^yes$/i }).sort({ _id: -1 }).lean();

const smtpHost = (config = {}) => {
  if (config.smtp) return config.smtp;
  if (config.smptp) return config.smptp;
  if (/gmail/i.test(config.provider || "")) return "smtp.gmail.com";
  return "";
};

const transporterFor = (config) => {
  const port = Number(config.port) || 587;
  return nodemailer.createTransport({
    host: smtpHost(config),
    port,
    secure: ["yes", "true"].includes(String(config.secure || "").toLowerCase()) || port === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const callGemini = async (colid, model, prompt, json = false) => {
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
        generationConfig: { temperature: json ? 0.2 : 0.7, ...(json ? { responseMimeType: "application/json" } : {}) }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
    lastError = data.error?.message || `Gemini request failed for ${item}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllama = async (colid, ollamaConfigId, prompt) => {
  const config = await getOllamaConfig(colid, ollamaConfigId);
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${String(config.serveraddress).replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: text(config.modelname), prompt, stream: false, options: { temperature: 0.7 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const callAgent = async (agent, prompt, json = false) => /^ollama$/i.test(agent.provider)
  ? callOllama(agent.colid, agent.ollamaconfigid, prompt)
  : callGemini(agent.colid, agent.geminimodel, prompt, json);

const extractJson = (value) => {
  const raw = text(value);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || raw.match(/\{[\s\S]*\}/)?.[0] || raw;
  try { return JSON.parse(candidate); } catch { return null; }
};

const limitWords = (value, maxWords = 140) => {
  const words = text(value).replace(/\s+/g, " ").split(" ").filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")}.`;
};

const buildQuestionPrompt = ({ agent, assignment, answer, history, eventType }) => {
  const style = {
    Aggressive: "Ask tough, direct questions and challenge vague answers professionally.",
    Moderate: "Ask balanced, professional questions and probe important details.",
    Sober: "Ask calm, supportive questions and give the candidate room to explain."
  };
  const difficulty = {
    Easy: "Keep questions foundational and accessible.",
    Medium: "Use practical scenario questions and moderate depth.",
    Difficult: "Use advanced conceptual and applied questions.",
    Expert: "Use expert-level judgement, case-based reasoning, and deep probing."
  };
  return `You are conducting a recruitment voice interview.

Job/form:
${assignment.jobtitle || assignment.jobid} / ${assignment.formname || assignment.formid}

Candidate:
${assignment.candidate} (${assignment.candidateemail})

Topic:
${agent.topic}

Keywords:
${(agent.keywords || []).join(", ") || "None"}

Mode: ${agent.mode}
${style[agent.mode] || style.Moderate}

Difficulty: ${agent.difficulty}
${difficulty[agent.difficulty] || difficulty.Medium}

Additional prompt:
${agent.additionalprompt || "None"}

Recent transcript:
${Array.isArray(history) && history.length ? history.slice(-12).map((item) => `${item.role}: ${item.text}`).join("\n") : "No prior transcript."}

Latest candidate answer:
${answer || "No answer yet."}

Instruction:
${eventType === "opening" ? "Start the interview with a brief greeting and ask the first question." : "Briefly assess the candidate answer, then ask the next relevant follow-up or next question."}

Speak naturally. Keep between 80 and 140 words. Do not use markdown.`;
};

const buildFinalScorePrompt = ({ agent, assignment }) => `Evaluate this completed recruitment interview. Return ONLY JSON:
{"score":0-100,"recommendation":"Shortlist/Maybe/Reject","summary":"brief assessment","strengths":[""],"weaknesses":[""]}

Topic: ${agent.topic}
Difficulty: ${agent.difficulty}
Job: ${assignment.jobtitle || assignment.jobid}
Candidate: ${assignment.candidate} (${assignment.candidateemail})
Transcript:
${(assignment.transcript || []).map((item) => `${item.role}: ${item.text}`).join("\n")}`;

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const ollamaConfigurations = colid !== undefined
      ? await OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
      : [];
    res.json({ success: true, geminiModels, ollamaConfigurations, modes, difficulties });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAgents = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "College id is required" });
    const query = { colid };
    ["active", "status", "mode", "provider", "difficulty"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    if (text(req.query.search)) {
      const regex = new RegExp(escRegex(req.query.search), "i");
      query.$or = [{ title: regex }, { topic: regex }, { additionalprompt: regex }, { keywords: regex }];
    }
    const rows = await AiRecruitmentInterviewAgent.find(query).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAgent = async (req, res) => {
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
      mode: modes.includes(text(req.body.mode)) ? text(req.body.mode) : "Moderate",
      difficulty: difficulties.includes(text(req.body.difficulty)) ? text(req.body.difficulty) : "Medium",
      timelimitminutes: Math.max(1, Number(req.body.timelimitminutes || 15)),
      provider: text(req.body.provider) || "Gemini",
      geminimodel: text(req.body.geminimodel) || "gemini-2.5-flash-lite",
      ollamaconfigid: text(req.body.ollamaconfigid),
      active: text(req.body.active) || "Yes",
      status: text(req.body.status) || "Active",
      user: text(req.body.user),
      name: text(req.body.name)
    };
    const row = text(req.body._id)
      ? await AiRecruitmentInterviewAgent.findOneAndUpdate({ _id: req.body._id, colid }, payload, { new: true, runValidators: true }).lean()
      : await AiRecruitmentInterviewAgent.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Recruitment interview agent not found" });
    res.json({ success: true, row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAgents = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "College id is required" });
    await AiRecruitmentInterviewAgent.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignCandidates = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const agent = await AiRecruitmentInterviewAgent.findOne({ _id: req.body.agentid, colid, active: /^yes$/i }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Active recruitment interview agent not found" });
    const ids = Array.isArray(req.body.applicationids) ? req.body.applicationids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select candidates" });
    const candidates = await RecruitmentApplication.find({ colid, _id: { $in: ids } }).lean();
    const jobs = await RecruitmentJobPost.find({ colid, jobid: { $in: [...new Set(candidates.map((row) => row.jobid).filter(Boolean))] } }).lean();
    const forms = await RecruitmentForm.find({ colid, formid: { $in: [...new Set(candidates.map((row) => row.formid).filter(Boolean))] } }).lean();
    const jobMap = new Map(jobs.map((row) => [row.jobid, row]));
    const formMap = new Map(forms.map((row) => [row.formid, row]));
    const baseUrl = text(req.body.baseUrl) || text(req.headers.origin) || "";
    const emailConfig = await getEmailConfig(colid).catch(() => null);
    const saved = [];
    for (const candidate of candidates) {
      const token = crypto.randomBytes(24).toString("hex");
      const job = jobMap.get(candidate.jobid) || {};
      const form = formMap.get(candidate.formid) || {};
      const link = `${baseUrl}/public-ai-recruitment-interview/${token}`;
      const payload = {
        colid,
        token,
        agentid: String(agent._id),
        agenttitle: agent.title,
        topic: agent.topic,
        difficulty: agent.difficulty,
        timelimitminutes: agent.timelimitminutes,
        jobid: candidate.jobid,
        jobtitle: job.title || candidate.jobid,
        formid: candidate.formid,
        formname: form.title || candidate.formid,
        applicationid: String(candidate._id),
        applicationno: candidate.applicationno,
        candidate: candidate.applicantname,
        candidateemail: candidate.email,
        candidatephone: candidate.phone,
        link,
        status: "Assigned",
        assignedby: text(req.body.user),
        assignedbyname: text(req.body.name)
      };
      const row = await AiRecruitmentInterviewAssignment.findOneAndUpdate(
        { colid, jobid: payload.jobid, applicationid: payload.applicationid, agentid: payload.agentid },
        { ...payload, token: crypto.randomBytes(24).toString("hex"), link: "" },
        { upsert: true, new: true, runValidators: true }
      );
      row.link = `${baseUrl}/public-ai-recruitment-interview/${row.token}`;
      let mailstatus = "Not sent";
      let mailmessage = "";
      if (emailConfig?.username && emailConfig?.password && smtpHost(emailConfig) && /\S+@\S+\.\S+/.test(candidate.email || "")) {
        try {
          await transporterFor(emailConfig).sendMail({
            from: `"${text(req.body.name) || "Recruitment"}" <${emailConfig.username}>`,
            to: candidate.email,
            subject: text(req.body.subject) || `AI interview link - ${payload.jobtitle}`,
            text: `Dear ${candidate.applicantname || "Candidate"},\n\nPlease complete your AI recruitment interview using this link:\n${row.link}\n\nRegards,\n${text(req.body.name) || "Recruitment Team"}`,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.55"><p>Dear ${candidate.applicantname || "Candidate"},</p><p>Please complete your AI recruitment interview using this link:</p><p><a href="${row.link}">${row.link}</a></p><p>Regards,<br/>${text(req.body.name) || "Recruitment Team"}</p></div>`
          });
          mailstatus = "Sent";
        } catch (err) {
          mailstatus = "Failed";
          mailmessage = err.message;
        }
      }
      row.mailstatus = mailstatus;
      row.mailmessage = mailmessage;
      await row.save();
      saved.push(row.toObject());
    }
    res.json({ success: true, rows: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAssignments = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "College id is required" });
    const query = { colid };
    ["jobid", "agentid", "status", "candidateemail", "applicationid", "shortlisted"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    if (text(req.query.search)) {
      const regex = new RegExp(escRegex(req.query.search), "i");
      query.$or = [{ candidate: regex }, { candidateemail: regex }, { applicationno: regex }, { jobtitle: regex }, { agenttitle: regex }];
    }
    if (text(req.query.fromdate) || text(req.query.todate)) {
      query.createdAt = {};
      if (text(req.query.fromdate)) query.createdAt.$gte = new Date(req.query.fromdate);
      if (text(req.query.todate)) {
        const to = new Date(req.query.todate);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }
    const rows = await AiRecruitmentInterviewAssignment.find(query).sort({ createdAt: -1 }).limit(3000).lean();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.shortlistByScore = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const minScore = Number(req.body.minScore || 0);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const query = { colid, status: "Completed", percentage: { $gte: minScore } };
    if (ids.length) query._id = { $in: ids };
    const rows = await AiRecruitmentInterviewAssignment.find(query).lean();
    for (const row of rows) {
      await RecruitmentApplication.updateOne(
        { colid, _id: row.applicationid },
        { status: "Shortlisted", shortlistcomments: `Shortlisted by AI recruitment interview score ${row.percentage}%` }
      );
      await AiRecruitmentInterviewAssignment.updateOne(
        { _id: row._id, colid },
        { shortlisted: "Yes", shortlistcomments: `Score >= ${minScore}` }
      );
    }
    res.json({ success: true, updated: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicBundle = async (req, res) => {
  try {
    const assignment = await AiRecruitmentInterviewAssignment.findOne({ token: text(req.params.token) }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Interview link not found" });
    const agent = await AiRecruitmentInterviewAgent.findOne({ _id: assignment.agentid, colid: assignment.colid, active: /^yes$/i }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Interview agent not active" });
    res.json({ success: true, assignment, agent: { title: agent.title, topic: agent.topic, mode: agent.mode, difficulty: agent.difficulty, timelimitminutes: agent.timelimitminutes } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicStart = async (req, res) => {
  try {
    const assignment = await AiRecruitmentInterviewAssignment.findOne({ token: text(req.params.token) });
    if (!assignment) return res.status(404).json({ success: false, message: "Interview link not found" });
    if (assignment.status === "Completed") return res.status(400).json({ success: false, message: "Interview already completed" });
    const agent = await AiRecruitmentInterviewAgent.findOne({ _id: assignment.agentid, colid: assignment.colid, active: /^yes$/i }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Interview agent not active" });
    assignment.status = "In Progress";
    assignment.startedat = assignment.startedat || new Date();
    assignment.ipaddress = req.ip || "";
    assignment.useragent = req.headers["user-agent"] || "";
    const prompt = buildQuestionPrompt({ agent, assignment, eventType: "opening", history: [] });
    const response = limitWords(await callAgent(agent, prompt), 150);
    assignment.transcript = [...(assignment.transcript || []), { role: "Interviewer", text: response, time: new Date() }];
    await assignment.save();
    res.json({ success: true, response, assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicRespond = async (req, res) => {
  try {
    const assignment = await AiRecruitmentInterviewAssignment.findOne({ token: text(req.params.token) });
    if (!assignment) return res.status(404).json({ success: false, message: "Interview link not found" });
    if (assignment.status === "Completed") return res.status(400).json({ success: false, message: "Interview already completed" });
    const agent = await AiRecruitmentInterviewAgent.findOne({ _id: assignment.agentid, colid: assignment.colid, active: /^yes$/i }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Interview agent not active" });
    const answer = text(req.body.answer);
    if (!answer) return res.status(400).json({ success: false, message: "Answer is required" });
    const deadline = assignment.startedat ? new Date(assignment.startedat).getTime() + (Number(assignment.timelimitminutes || 15) * 60000) : 0;
    if (deadline && Date.now() > deadline) {
      assignment.status = "Time Over";
      await assignment.save();
      return res.status(400).json({ success: false, message: "Time limit is over" });
    }
    assignment.transcript = [...(assignment.transcript || []), { role: "Candidate", text: answer, time: new Date() }];
    const prompt = buildQuestionPrompt({ agent, assignment, eventType: "response", answer, history: assignment.transcript });
    const response = limitWords(await callAgent(agent, prompt), 150);
    assignment.transcript.push({ role: "Interviewer", text: response, time: new Date() });
    await assignment.save();
    res.json({ success: true, response, assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicComplete = async (req, res) => {
  try {
    const assignment = await AiRecruitmentInterviewAssignment.findOne({ token: text(req.params.token) });
    if (!assignment) return res.status(404).json({ success: false, message: "Interview link not found" });
    const agent = await AiRecruitmentInterviewAgent.findOne({ _id: assignment.agentid, colid: assignment.colid }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Interview agent not found" });
    if (assignment.status !== "Completed") {
      const prompt = buildFinalScorePrompt({ agent, assignment });
      const raw = await callAgent(agent, prompt, true);
      const parsed = extractJson(raw) || {};
      const score = Math.max(0, Math.min(100, Number(parsed.score || 0)));
      assignment.score = score;
      assignment.maxscore = 100;
      assignment.percentage = score;
      assignment.recommendation = text(parsed.recommendation) || (score >= 70 ? "Shortlist" : score >= 50 ? "Maybe" : "Reject");
      assignment.summary = text(parsed.summary || raw);
      assignment.status = "Completed";
      assignment.completedat = new Date();
      await assignment.save();
    }
    res.json({ success: true, assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
