const nodemailer = require("nodemailer");
const myEmitter = require("./eventEmitter");
const AdmissionAiAgent = require("../Models/admissionaiagentds");
const AdmissionAiAgentLog = require("../Models/admissionaiagentlogds");
const AdmissionDynamicForm = require("../Models/admissiondynamicform");
const AdmissionApplication = require("../Models/admissionapplicationdynamic");
const EmailConfiguration = require("../Models/emailconfigurationds");

const clean = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[char]));

const createTransporter = (config) => {
  const port = Number(config.port) || (/gmail/i.test(config.provider || "") ? 465 : 587);
  const secureValue = String(config.secure || "").toLowerCase();
  return nodemailer.createTransport({
    host: config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : ""),
    port,
    secure: secureValue === "yes" || secureValue === "true" || port === 465,
    auth: {
      user: config.username,
      pass: config.password
    }
  });
};

const replaceTokens = (template, application = {}) => {
  const values = {
    name: application.name,
    applicant: application.name,
    email: application.email,
    phone: application.phone,
    applicationid: application.applicationid || application.applicationnumber || application._id,
    applicationnumber: application.applicationnumber || application.applicationid || application._id,
    academicyear: application.academicyear,
    formid: application.formid,
    program: application.programapplied,
    programapplied: application.programapplied,
    programcode: application.programcode,
    status: application.applicationstatus
  };
  return clean(template).replace(/\{([^}]+)\}/g, (_, key) => clean(values[clean(key).toLowerCase()] ?? ""));
};

const loadDefaultEmailConfig = async (colid) => {
  const active = { colid, isactive: /^Yes$/i };
  const admissionDefault = await EmailConfiguration.findOne({ ...active, type: /^admission$/i, default: /^Yes$/i }).sort({ updatedAt: -1, createdAt: -1 }).lean();
  if (admissionDefault) return admissionDefault;
  const anyAdmission = await EmailConfiguration.findOne({ ...active, type: /^admission$/i }).sort({ updatedAt: -1, createdAt: -1 }).lean();
  if (anyAdmission) return anyAdmission;
  const anyDefault = await EmailConfiguration.findOne({ ...active, default: /^Yes$/i }).sort({ updatedAt: -1, createdAt: -1 }).lean();
  if (anyDefault) return anyDefault;
  return EmailConfiguration.findOne(active).sort({ updatedAt: -1, createdAt: -1 }).lean();
};

const scheduleAgentEmail = async ({ agent, level, application, cumulativeDelayMinutes }) => {
  const applicationid = clean(application.applicationid || application.applicationnumber || application._id);
  if (!applicationid || !application.email) return;
  const scheduledfor = new Date(Date.now() + Math.max(0, cumulativeDelayMinutes) * 60 * 1000);
  let log;
  try {
    log = await AdmissionAiAgentLog.findOneAndUpdate(
      { colid: agent.colid, agentid: agent._id, applicationid, level: level.level },
      {
        $setOnInsert: {
          colid: agent.colid,
          agentid: agent._id,
          formid: agent.formid,
          applicationid,
          applicant: application.name,
          email: application.email,
          level: level.level,
          delayminutes: level.delayminutes,
          scheduledfor,
          subject: replaceTokens(level.subject, application),
          description: replaceTokens(level.description, application),
          status: "Scheduled",
          user: agent.user
        }
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    return;
  }
  if (!/^Scheduled$/i.test(log.status)) return;

  setTimeout(async () => {
    const currentLog = await AdmissionAiAgentLog.findById(log._id);
    if (!currentLog || !/^Scheduled$/i.test(currentLog.status)) return;
    try {
      const mailConfig = await loadDefaultEmailConfig(agent.colid);
      if (!mailConfig?.username || !mailConfig?.password) throw new Error("Default email configuration missing");
      const transporter = createTransporter(mailConfig);
      await transporter.sendMail({
        from: `${agent.formtitle || "Admissions"} <${mailConfig.username}>`,
        to: application.email,
        subject: currentLog.subject || `Admission application update - ${applicationid}`,
        text: currentLog.description || "",
        html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">${escapeHtml(currentLog.description || "").replace(/\n/g, "<br/>")}</div>`
      });
      currentLog.status = "Sent";
      currentLog.sentat = new Date();
      currentLog.error = "";
      await currentLog.save();
    } catch (error) {
      currentLog.status = "Failed";
      currentLog.error = error.message;
      await currentLog.save();
    }
  }, Math.max(0, cumulativeDelayMinutes) * 60 * 1000);
};

exports.registerAdmissionAiAgentProcessor = () => {
  if (global.__admissionAiAgentProcessorRegistered) return;
  global.__admissionAiAgentProcessorRegistered = true;
  myEmitter.on("admission_application_submitted", async (payload = {}) => {
    try {
      const colid = num(payload.colid);
      const formid = clean(payload.formid || "default");
      const applicationid = clean(payload.applicationid || payload._id || payload.id);
      if (!colid || !applicationid) return;
      const [application, agents] = await Promise.all([
        AdmissionApplication.findOne({ colid, _id: applicationid }).lean(),
        AdmissionAiAgent.find({ colid, formid, status: /^Active$/i }).lean()
      ]);
      if (!application || !agents.length) return;
      agents.forEach((agent) => {
        let cumulative = 0;
        (agent.levels || [])
          .slice()
          .sort((a, b) => Number(a.level || 0) - Number(b.level || 0))
          .forEach((level) => {
            cumulative += Math.max(0, Number(level.delayminutes || 0));
            scheduleAgentEmail({ agent, level, application, cumulativeDelayMinutes: cumulative });
          });
      });
    } catch (error) {
      // Keep event processing isolated from application submission.
    }
  });
};

exports.emitAdmissionApplicationSubmitted = (payload = {}) => {
  myEmitter.emit("admission_application_submitted", payload);
};

exports.getOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ message: "colid is required" });
    const forms = await AdmissionDynamicForm.find({ colid }).select("formid title level isactive").sort({ title: 1, formid: 1 }).lean();
    res.json({ forms });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.listAgents = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ message: "colid is required" });
    const agents = await AdmissionAiAgent.find({ colid }).sort({ updatedAt: -1, createdAt: -1 }).lean();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.saveAgent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const formid = clean(req.body.formid || "default");
    if (!colid) return res.status(400).json({ message: "colid is required" });
    if (!formid) return res.status(400).json({ message: "Select form" });
    const levels = (Array.isArray(req.body.levels) ? req.body.levels : [])
      .map((level, index) => ({
        level: num(level.level, index + 1),
        delayminutes: Math.max(0, num(level.delayminutes, 0)),
        subject: clean(level.subject),
        description: clean(level.description)
      }))
      .filter((level) => level.subject || level.description);
    if (!levels.length) return res.status(400).json({ message: "Add at least one email level" });
    const form = await AdmissionDynamicForm.findOne({ colid, formid }).lean();
    const payload = {
      colid,
      formid,
      formtitle: clean(req.body.formtitle || form?.title || formid),
      agentname: clean(req.body.agentname) || "Admission Email Agent",
      status: clean(req.body.status) || "Active",
      levels,
      user: clean(req.body.user),
      username: clean(req.body.username)
    };
    let data;
    if (req.body._id) {
      data = await AdmissionAiAgent.findOneAndUpdate({ _id: req.body._id, colid }, payload, { new: true });
    } else {
      data = await AdmissionAiAgent.findOneAndUpdate(
        { colid, formid, agentname: payload.agentname },
        payload,
        { upsert: true, new: true }
      );
    }
    res.json(data);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: "Agent already exists for this form and name" });
    res.status(500).json({ message: error.message });
  }
};

exports.deleteAgent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    if (!colid) return res.status(400).json({ message: "colid is required" });
    await AdmissionAiAgent.deleteMany({ colid, _id: { $in: ids } });
    res.json({ deleted: ids.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ message: "colid is required" });
    const query = { colid };
    ["formid", "applicationid", "email", "applicant", "status"].forEach((field) => {
      if (req.query[field]) query[field] = { $regex: esc(req.query[field]), $options: "i" };
    });
    if (req.query.fromdate || req.query.todate) {
      query.createdAt = {};
      if (req.query.fromdate) query.createdAt.$gte = new Date(req.query.fromdate);
      if (req.query.todate) {
        const toDate = new Date(req.query.todate);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }
    const logs = await AdmissionAiAgentLog.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
