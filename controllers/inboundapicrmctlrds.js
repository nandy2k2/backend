const crypto = require("crypto");
const nodemailer = require("nodemailer");
const AdmissionInboundApi = require("../Models/admissioninboundapids");
const CrmInboundApi = require("../Models/crminboundapids");
const CrmFormLink = require("../Models/crmformlinkds");
const CrmAiAgent = require("../Models/crmaiagentds");
const CrmAiAgentLog = require("../Models/crmaiagentlogds");
const AdmissionDynamicForm = require("../Models/admissiondynamicform");
const AdmissionFormField = require("../Models/admissionformfield");
const AdmissionApplication = require("../Models/admissionapplicationdynamic");
const Lead = require("../Models/crmh1");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const EmailConfiguration = require("../Models/emailconfigurationds");
const myEmitter = require("./eventEmitter");
const { emitAdmissionApplicationSubmitted } = require("./admissionaiagentctlrds");

const clean = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const regex = (value) => ({ $regex: clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" });
const key = () => `in_${crypto.randomBytes(18).toString("hex")}`;
const frontendBase = (req) => clean(req.body.frontendbase || req.query.frontendbase || req.headers.origin || `${req.protocol}://${req.get("host")}`);
const apiBase = (req) => `${req.protocol}://${req.get("host")}`;

const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[char]));

const createTransporter = (config) => {
  const port = Number(config.port) || (/gmail/i.test(config.provider || "") ? 465 : 587);
  return nodemailer.createTransport({
    host: config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : ""),
    port,
    secure: /yes|true/i.test(clean(config.secure)) || port === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const defaultEmailConfig = async (colid) => (
  await EmailConfiguration.findOne({ colid, isactive: /^Yes$/i, type: /^crm$/i, default: /^Yes$/i }).sort({ updatedAt: -1 }).lean()
  || await EmailConfiguration.findOne({ colid, isactive: /^Yes$/i, type: /^crm$/i }).sort({ updatedAt: -1 }).lean()
  || await EmailConfiguration.findOne({ colid, isactive: /^Yes$/i, default: /^Yes$/i }).sort({ updatedAt: -1 }).lean()
  || await EmailConfiguration.findOne({ colid, isactive: /^Yes$/i }).sort({ updatedAt: -1 }).lean()
);

const replaceLeadTokens = (template, lead = {}) => {
  const values = {
    name: lead.name,
    lead: lead.name,
    email: lead.email,
    phone: lead.phone,
    program: lead.program || lead.course_interested,
    programcode: lead.programcode || lead.product,
    course: lead.course_interested,
    level: lead.program_type,
    source: lead.source,
    stage: lead.pipeline_stage,
    leadid: lead._id
  };
  return clean(template).replace(/\{([^}]+)\}/g, (_, token) => clean(values[clean(token).toLowerCase()] ?? ""));
};

const normalizeAdmissionPayload = (body, api) => {
  const extraFields = { ...(body.extraFields || {}) };
  Object.keys(body || {}).forEach((field) => {
    if (![
      "colid", "formid", "name", "email", "phone", "programlevel", "level", "programtype", "program_type",
      "program", "programapplied", "programcode", "academicyear", "applicationstatus", "extraFields"
    ].includes(field)) {
      extraFields[field] = body[field];
    }
  });
  const generatedId = `${new Date().getTime()}${crypto.randomBytes(3).toString("hex")}`;
  return {
    colid: api.colid,
    formid: api.formid,
    applicationid: generatedId,
    applicationnumber: generatedId,
    academicyear: clean(body.academicyear),
    name: clean(body.name),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    level: clean(body.programlevel || body.level),
    programtype: clean(body.programtype || body.program_type),
    programapplied: clean(body.program || body.programapplied),
    programcode: clean(body.programcode),
    applicationstatus: clean(body.applicationstatus || "Applied"),
    extraFields,
    user: clean(body.user || "Inbound API")
  };
};

const normalizeLeadPayload = (body, context = {}) => ({
  colid: num(context.colid || body.colid),
  user: clean(body.user || context.user || body.assignedto || "Inbound API"),
  name: clean(body.name || body.lead || body.leadname),
  email: clean(body.email || body.leademail).toLowerCase(),
  phone: clean(body.phone || body.leadphone),
  category: clean(body.category || "General"),
  course_interested: clean(body.course_interested || body.course || body.program),
  program: clean(body.program || body.course_interested || body.course),
  product: clean(body.programcode || body.product),
  program_type: clean(body.programlevel || body.level || body.programtype || body.program_type),
  year: clean(body.year || body.academicyear),
  source: clean(body.source || context.source || "Website"),
  pipeline_stage: clean(body.pipeline_stage || context.pipeline_stage || "New Lead"),
  leadstatus: clean(body.leadstatus || context.leadstatus || "Active"),
  assignedto: clean(body.assignedto || context.assignedto || body.user || "NA"),
  city: clean(body.city),
  state: clean(body.state),
  comments: clean(body.comments || body.description),
  form_url: clean(body.form_url || context.form_url)
});

const buildAdmissionDocs = async (req, api) => {
  const fields = await AdmissionFormField.find({ colid: api.colid, formid: api.formid, isactive: { $ne: "No" } }).sort({ page: 1, section: 1, order: 1 }).lean();
  const optionalFields = fields.map((item) => item.fieldname || item.label).filter(Boolean);
  const endpoint = `${apiBase(req)}/api/v2/admission-inbound/${api.apikey}`;
  return {
    endpoint,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    mandatoryFields: ["name", "email", "phone", "programlevel", "programtype", "program", "programcode"],
    optionalFields,
    samplePayload: {
      name: "Applicant Name",
      email: "applicant@example.com",
      phone: "9999999999",
      programlevel: "UG",
      programtype: "Regular",
      program: "Bachelor of Science",
      programcode: "BSC",
      academicyear: "2026-27",
      extraFields: Object.fromEntries(optionalFields.slice(0, 5).map((field) => [field, "value"]))
    },
    curl: `curl -X POST ${endpoint} -H "Content-Type: application/json" -d '{"name":"Applicant Name","email":"applicant@example.com","phone":"9999999999","programlevel":"UG","programtype":"Regular","program":"Bachelor of Science","programcode":"BSC"}'`,
    documentation: "Send a JSON POST request to this endpoint. Name, email, phone, programlevel, programtype, program and programcode are mandatory. Any configured form field can be sent either as a top-level key or inside extraFields."
  };
};

const buildCrmDocs = (req, api) => {
  const endpoint = `${apiBase(req)}/api/v2/crm-inbound/${api.apikey}`;
  return {
    endpoint,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    mandatoryFields: ["name", "email or phone"],
    optionalFields: ["programlevel", "programtype", "program", "programcode", "category", "source", "pipeline_stage", "leadstatus", "comments", "city", "state", "year"],
    samplePayload: {
      name: "Lead Name",
      email: "lead@example.com",
      phone: "9999999999",
      programlevel: "UG",
      program: "Bachelor of Science",
      programcode: "BSC",
      source: "Website"
    },
    curl: `curl -X POST ${endpoint} -H "Content-Type: application/json" -d '{"name":"Lead Name","email":"lead@example.com","phone":"9999999999","program":"Bachelor of Science","programcode":"BSC"}'`,
    documentation: "Send a JSON POST request to create a CRM lead. Name is mandatory, and at least email or phone should be provided. Other lead fields are optional."
  };
};

exports.getAdmissionInboundApis = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const rows = await AdmissionInboundApi.find({ colid }).sort({ updatedAt: -1 }).lean();
    const data = await Promise.all(rows.map(async (row) => ({ ...row, documentation: await buildAdmissionDocs(req, row) })));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAdmissionInboundApi = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const formid = clean(req.body.formid);
    if (!colid || !formid) return res.status(400).json({ success: false, message: "Select a form" });
    const form = await AdmissionDynamicForm.findOne({ colid, formid }).lean();
    if (!form) return res.status(404).json({ success: false, message: "Admission form not found" });
    const existing = await AdmissionInboundApi.findOne({ colid, formid });
    const apikey = existing?.apikey || key();
    const endpoint = `${apiBase(req)}/api/v2/admission-inbound/${apikey}`;
    const row = await AdmissionInboundApi.findOneAndUpdate(
      { colid, formid },
      { colid, formid, formtitle: form.title || formid, apikey, endpoint, status: "Active", user: clean(req.body.user), username: clean(req.body.username) },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: row, documentation: await buildAdmissionDocs(req, row) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitAdmissionInbound = async (req, res) => {
  try {
    const api = await AdmissionInboundApi.findOne({ apikey: req.params.apikey, status: /^Active$/i }).lean();
    if (!api) return res.status(404).json({ success: false, message: "Inbound API is not active" });
    const body = req.body || {};
    const required = ["name", "email", "phone", "programcode"];
    const missing = required.filter((field) => !clean(body[field]));
    if (!clean(body.programlevel || body.level)) missing.push("programlevel");
    if (!clean(body.programtype || body.program_type)) missing.push("programtype");
    if (!clean(body.program || body.programapplied)) missing.push("program");
    if (missing.length) return res.status(400).json({ success: false, message: `Missing mandatory fields: ${missing.join(", ")}` });
    const payload = normalizeAdmissionPayload(body, api);
    const data = await AdmissionApplication.create(payload);
    emitAdmissionApplicationSubmitted({ colid: data.colid, formid: data.formid, applicationid: String(data._id) });
    res.json({ success: true, applicationid: String(data._id), data });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: "Duplicate email or phone is not allowed" });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCrmInboundApis = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const rows = await CrmInboundApi.find({ colid }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: rows.map((row) => ({ ...row, documentation: buildCrmDocs(req, row) })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCrmInboundApi = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const apiname = clean(req.body.apiname || "CRM Inbound API");
    const existing = await CrmInboundApi.findOne({ colid, apiname });
    const apikey = existing?.apikey || key();
    const endpoint = `${apiBase(req)}/api/v2/crm-inbound/${apikey}`;
    const row = await CrmInboundApi.findOneAndUpdate(
      { colid, apiname },
      { colid, apiname, apikey, endpoint, status: "Active", user: clean(req.body.user), username: clean(req.body.username) },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: row, documentation: buildCrmDocs(req, row) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitCrmInbound = async (req, res) => {
  try {
    const api = await CrmInboundApi.findOne({ apikey: req.params.apikey, status: /^Active$/i }).lean();
    if (!api) return res.status(404).json({ success: false, message: "CRM inbound API is not active" });
    if (!clean(req.body.name || req.body.lead || req.body.leadname)) return res.status(400).json({ success: false, message: "name is required" });
    if (!clean(req.body.email || req.body.phone)) return res.status(400).json({ success: false, message: "email or phone is required" });
    const data = await Lead.create(normalizeLeadPayload(req.body, { colid: api.colid, user: api.user }));
    emitCrmLeadSubmitted(data);
    res.json({ success: true, leadid: String(data._id), data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkAssignCrmLeads = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const counselor = clean(req.body.counseloremail || req.body.assignedto);
    if (!colid || !ids.length || !counselor) return res.status(400).json({ success: false, message: "Select leads and counselor" });
    const result = await Lead.updateMany(
      { colid, _id: { $in: ids } },
      { $set: { assignedto: counselor, assigned_date: new Date() }, $inc: { reassignment_count: 1 } }
    );
    res.json({ success: true, modified: result.modifiedCount || result.nModified || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCrmFormLinks = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const rows = await CrmFormLink.find({ colid }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveCrmFormLink = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const formname = clean(req.body.formname || "CRM Lead Form");
    const publicurl = `${frontendBase(req).replace(/\/$/, "")}/crm-public-form?colid=${colid}`;
    const row = await CrmFormLink.findOneAndUpdate(
      req.body.id ? { _id: req.body.id, colid } : { colid, formname },
      {
        colid,
        formname,
        source: clean(req.body.source || "Website"),
        pipeline_stage: clean(req.body.pipeline_stage || "New Lead"),
        leadstatus: clean(req.body.leadstatus || "Active"),
        status: clean(req.body.status || "Active"),
        publicurl,
        user: clean(req.body.user),
        username: clean(req.body.username)
      },
      { upsert: !req.body.id, new: true }
    );
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCrmFormLink = async (req, res) => {
  try {
    await CrmFormLink.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCrmPublicForm = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const form = await CrmFormLink.findOne({ colid, status: /^Active$/i }).sort({ updatedAt: -1 }).lean();
    const programs = await MPrograms.find({ colid }).sort({ year: -1, Order: 1, program: 1 }).lean();
    res.json({ success: true, form, programs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitCrmPublicForm = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const form = await CrmFormLink.findOne({ colid, status: /^Active$/i }).sort({ updatedAt: -1 }).lean();
    if (!form) return res.status(404).json({ success: false, message: "CRM form is not active" });
    const mapping = await User.findOne({ colid, role: { $regex: /counsellor|counselor/i }, status: 1 }).select("email").sort({ updatedAt: 1 }).lean();
    const data = await Lead.create(normalizeLeadPayload(req.body, {
      colid,
      source: form.source,
      pipeline_stage: form.pipeline_stage,
      leadstatus: form.leadstatus,
      assignedto: clean(req.body.assignedto || mapping?.email || "NA"),
      form_url: form.publicurl
    }));
    emitCrmLeadSubmitted(data);
    res.json({ success: true, leadid: String(data._id), message: "Lead submitted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCrmAiAgents = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const rows = await CrmAiAgent.find({ colid }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveCrmAiAgent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const programcode = clean(req.body.programcode);
    if (!colid || !programcode) return res.status(400).json({ success: false, message: "Program code is required" });
    const levels = (Array.isArray(req.body.levels) ? req.body.levels : [])
      .map((item, index) => ({
        level: num(item.level, index + 1),
        delayminutes: Math.max(0, num(item.delayminutes)),
        subject: clean(item.subject),
        description: clean(item.description)
      }))
      .filter((item) => item.subject || item.description);
    if (!levels.length) return res.status(400).json({ success: false, message: "Add at least one email level" });
    const row = await CrmAiAgent.findOneAndUpdate(
      req.body.id ? { _id: req.body.id, colid } : { colid, programcode, level: clean(req.body.level), agentname: clean(req.body.agentname || "CRM Email Agent") },
      {
        colid,
        program: clean(req.body.program),
        programcode,
        level: clean(req.body.level),
        agentname: clean(req.body.agentname || "CRM Email Agent"),
        status: clean(req.body.status || "Active"),
        levels,
        user: clean(req.body.user),
        username: clean(req.body.username)
      },
      { upsert: !req.body.id, new: true }
    );
    res.json({ success: true, data: row });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: "CRM AI agent already exists for this program and level" });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCrmAiAgent = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await CrmAiAgent.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCrmAiAgentLogs = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    ["leadname", "email", "programcode", "status"].forEach((field) => {
      if (clean(req.query[field])) query[field] = regex(req.query[field]);
    });
    const rows = await CrmAiAgentLog.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const scheduleCrmEmail = async ({ agent, level, lead, cumulativeDelayMinutes }) => {
  if (!lead?._id || !lead.email) return;
  const scheduledfor = new Date(Date.now() + Math.max(0, cumulativeDelayMinutes) * 60 * 1000);
  let log;
  try {
    log = await CrmAiAgentLog.findOneAndUpdate(
      { colid: agent.colid, agentid: agent._id, leadid: String(lead._id), level: level.level },
      {
        $setOnInsert: {
          colid: agent.colid,
          agentid: agent._id,
          leadid: String(lead._id),
          leadname: lead.name,
          email: lead.email,
          program: lead.program || lead.course_interested,
          programcode: agent.programcode,
          levelname: agent.level,
          level: level.level,
          delayminutes: level.delayminutes,
          scheduledfor,
          subject: replaceLeadTokens(level.subject, lead),
          description: replaceLeadTokens(level.description, lead),
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
    const currentLog = await CrmAiAgentLog.findById(log._id);
    if (!currentLog || !/^Scheduled$/i.test(currentLog.status)) return;
    try {
      const mailConfig = await defaultEmailConfig(agent.colid);
      if (!mailConfig?.username || !mailConfig?.password) throw new Error("Default email configuration missing");
      const transporter = createTransporter(mailConfig);
      await transporter.sendMail({
        from: `${agent.agentname || "CRM"} <${mailConfig.username}>`,
        to: lead.email,
        subject: currentLog.subject || "Thank you for your enquiry",
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

const emitCrmLeadSubmitted = (lead) => {
  myEmitter.emit("crm_form_submitted", {
    colid: lead.colid,
    leadid: String(lead._id)
  });
};

exports.registerCrmAiAgentProcessor = () => {
  if (global.__crmAiAgentProcessorRegistered) return;
  global.__crmAiAgentProcessorRegistered = true;
  myEmitter.on("crm_form_submitted", async (payload = {}) => {
    try {
      const colid = num(payload.colid);
      const lead = await Lead.findOne({ _id: payload.leadid, colid }).lean();
      if (!lead) return;
      const programcode = clean(lead.programcode || lead.product);
      const level = clean(lead.program_type);
      const query = { colid, status: /^Active$/i, programcode };
      if (level) query.$or = [{ level }, { level: "" }, { level: { $exists: false } }];
      const agents = await CrmAiAgent.find(query).lean();
      agents.forEach((agent) => {
        let cumulative = 0;
        (agent.levels || []).slice().sort((a, b) => Number(a.level || 0) - Number(b.level || 0)).forEach((item) => {
          cumulative += Math.max(0, Number(item.delayminutes || 0));
          scheduleCrmEmail({ agent, level: item, lead, cumulativeDelayMinutes: cumulative });
        });
      });
    } catch (error) {
      // Keep the CRM event processor isolated from lead creation.
    }
  });
};
