const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const PersonalDataAgent = require("../Models/personaldataagentds");
const PersonalDataAgentLog = require("../Models/personaldataagentlogds");
const User = require("../Models/user");
const CasNewEntry = require("../Models/casnewentryds");
const EmailConfiguration = require("../Models/emailconfigurationds");
const Institution = require("../Models/insdetails");

const clean = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const esc = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = (rows) => [...new Set((rows || []).map(clean).filter(Boolean))].sort();
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const smtpHost = (config = {}) => {
  if (config.smtp) return config.smtp;
  if (config.smptp) return config.smptp;
  if (/gmail/i.test(config.provider || "")) return "smtp.gmail.com";
  return "";
};

const transporterFor = (config) => nodemailer.createTransport({
  host: smtpHost(config),
  port: Number(config.port) || (/gmail/i.test(config.provider || "") ? 465 : 587),
  secure: ["yes", "true"].includes(clean(config.secure).toLowerCase()) || Number(config.port) === 465,
  auth: { user: config.username, pass: config.password }
});

const emailConfig = async (colid) => {
  const query = { colid, isactive: /^Yes$/i };
  return await EmailConfiguration.findOne({ ...query, default: /^Yes$/i }).sort({ updatedAt: -1, createdAt: -1 }).lean()
    || await EmailConfiguration.findOne(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
};

const payload = (body = {}) => ({
  colid: num(body.colid),
  agentname: clean(body.agentname || "Personal Data Agent"),
  academicyear: clean(body.academicyear),
  projectsperfaculty: num(body.projectsperfaculty),
  publicationsperfaculty: num(body.publicationsperfaculty),
  seminarsperfaculty: num(body.seminarsperfaculty),
  dayofweek: clean(body.dayofweek),
  timeofrunning: clean(body.timeofrunning),
  reportemail: clean(body.reportemail),
  status: clean(body.status || "Active"),
  name: clean(body.name || body.username),
  user: clean(body.user)
});

const queryFrom = (input = {}) => {
  const query = { colid: num(input.colid) };
  ["agentname", "academicyear", "dayofweek", "timeofrunning", "reportemail", "status"].forEach((field) => {
    if (clean(input[field])) query[field] = { $regex: esc(input[field]), $options: "i" };
  });
  if (Array.isArray(input.dynamicFilters)) {
    input.dynamicFilters.forEach((filter) => {
      const field = clean(filter.field);
      const value = clean(filter.value);
      if (!field || field.includes("$") || !value) return;
      query[field] = clean(filter.operator).toLowerCase() === "equals" ? value : { $regex: esc(value), $options: "i" };
    });
  }
  return query;
};

const casCount = async ({ colid, academicyear, facultyemail, type }) => {
  const rx = new RegExp(type, "i");
  return CasNewEntry.countDocuments({
    colid,
    academicyear,
    facultyemail: { $regex: `^${esc(facultyemail)}$`, $options: "i" },
    $or: [{ item: rx }, { group: rx }, { activitytype: rx }, { title: rx }, { source: rx }, { sourcemodel: rx }]
  });
};

const legacyCount = async ({ colid, academicyear, facultyemail, facultyname, collection }) => {
  const filter = {
    colid,
    $or: [
      { user: { $regex: `^${esc(facultyemail)}$`, $options: "i" } },
      { facultyemail: { $regex: `^${esc(facultyemail)}$`, $options: "i" } },
      { email: { $regex: `^${esc(facultyemail)}$`, $options: "i" } },
      { name: { $regex: `^${esc(facultyname)}$`, $options: "i" } },
      { facultyname: { $regex: `^${esc(facultyname)}$`, $options: "i" } }
    ]
  };
  if (academicyear) {
    const yearStart = academicyear.slice(0, 4);
    filter.$and = [{ $or: [{ academicyear }, { year: academicyear }, { yop: academicyear }, { yop: yearStart }, { date: { $regex: esc(yearStart), $options: "i" } }] }];
  }
  try {
    return await mongoose.connection.collection(collection).countDocuments(filter);
  } catch (_) {
    return 0;
  }
};

const metricCount = async (args) => {
  const cas = await casCount(args);
  const legacyMap = { project: "projects", publication: "pubs", seminar: "seminars" };
  const legacy = await legacyCount({ ...args, collection: legacyMap[args.type] });
  return Math.max(cas, legacy);
};

const reportHtml = ({ agent, institution, rows }) => {
  const logo = institution?.logolink || institution?.logo || "";
  const instName = institution?.institutionname || "Institution";
  const address = institution?.address || institution?.contactusdetails || "";
  const trs = rows.map((row, index) => `<tr>
    <td>${index + 1}</td><td>${row.facultyname}</td><td>${row.facultyemail}</td><td>${row.department || ""}</td>
    <td>${row.projects}/${agent.projectsperfaculty}</td><td>${row.publications}/${agent.publicationsperfaculty}</td><td>${row.seminars}/${agent.seminarsperfaculty}</td>
    <td>${row.deficits.join(", ")}</td>
  </tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.45">
    <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px">
      ${logo ? `<img src="${logo}" style="max-height:70px;max-width:150px;object-fit:contain" />` : ""}
      <h2 style="margin:4px 0">${instName}</h2><div>${address}</div>
      <h3>Personal Data Agent Report</h3>
    </div>
    <p><b>Academic year:</b> ${agent.academicyear}</p>
    <p><b>Targets:</b> Projects ${agent.projectsperfaculty}, Publications ${agent.publicationsperfaculty}, Seminars ${agent.seminarsperfaculty} per faculty</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr><th style="border:1px solid #111;padding:6px">Sr</th><th style="border:1px solid #111;padding:6px">Faculty</th><th style="border:1px solid #111;padding:6px">Email</th><th style="border:1px solid #111;padding:6px">Department</th><th style="border:1px solid #111;padding:6px">Projects</th><th style="border:1px solid #111;padding:6px">Publications</th><th style="border:1px solid #111;padding:6px">Seminars</th><th style="border:1px solid #111;padding:6px">Deficit</th></tr></thead>
      <tbody>${trs || `<tr><td colspan="8" style="border:1px solid #111;padding:6px;text-align:center">All faculty targets met.</td></tr>`}</tbody>
    </table>
  </div>`;
};

const buildReport = async (agent) => {
  const colid = num(agent.colid);
  const faculty = await User.find({ colid, role: { $not: /^Student$/i } }).select("name email department designation role").lean();
  const rows = [];
  for (const item of faculty) {
    const facultyemail = clean(item.email);
    if (!facultyemail) continue;
    const [projects, publications, seminars] = await Promise.all([
      metricCount({ colid, academicyear: agent.academicyear, facultyemail, facultyname: item.name, type: "project" }),
      metricCount({ colid, academicyear: agent.academicyear, facultyemail, facultyname: item.name, type: "publication" }),
      metricCount({ colid, academicyear: agent.academicyear, facultyemail, facultyname: item.name, type: "seminar" })
    ]);
    const deficits = [];
    if (projects < num(agent.projectsperfaculty)) deficits.push(`Projects short by ${num(agent.projectsperfaculty) - projects}`);
    if (publications < num(agent.publicationsperfaculty)) deficits.push(`Publications short by ${num(agent.publicationsperfaculty) - publications}`);
    if (seminars < num(agent.seminarsperfaculty)) deficits.push(`Seminars short by ${num(agent.seminarsperfaculty) - seminars}`);
    if (deficits.length) rows.push({ facultyname: item.name, facultyemail, department: item.department, designation: item.designation, role: item.role, projects, publications, seminars, deficits });
  }
  const institution = await Institution.findOne({ colid }).sort({ _id: -1 }).lean();
  return { rows, html: reportHtml({ agent, institution, rows }) };
};

const runAgent = async (agent, runkey = `manual-${Date.now()}`) => {
  let log = await PersonalDataAgentLog.findOneAndUpdate(
    { colid: agent.colid, agentid: agent._id, runkey },
    { $setOnInsert: { colid: agent.colid, agentid: agent._id, agentname: agent.agentname, academicyear: agent.academicyear, runkey, reportemail: agent.reportemail, status: "Running", user: agent.user } },
    { upsert: true, new: true }
  );
  if (!/^Running$/i.test(log.status)) return log;
  try {
    const report = await buildReport(agent);
    const config = await emailConfig(agent.colid);
    if (!config?.username || !config?.password || !smtpHost(config)) throw new Error("Default active email configuration is missing");
    await transporterFor(config).sendMail({
      from: `"${agent.agentname || "Personal Data Agent"}" <${config.username}>`,
      to: agent.reportemail,
      subject: `Personal data target report - ${agent.academicyear}`,
      text: `Faculty below target: ${report.rows.length}`,
      html: report.html
    });
    log.status = "Sent";
    log.facultycount = (await User.countDocuments({ colid: agent.colid, role: { $not: /^Student$/i } }));
    log.deficitcount = report.rows.length;
    log.reporthtml = report.html;
    log.reportjson = JSON.stringify(report.rows);
    log.error = "";
    await log.save();
    await PersonalDataAgent.updateOne({ _id: agent._id }, { lastrunkey: runkey, lastrunat: new Date(), laststatus: "Sent", lastmessage: `${report.rows.length} faculty below target` });
    return log;
  } catch (error) {
    log.status = "Failed";
    log.error = error.message;
    await log.save();
    await PersonalDataAgent.updateOne({ _id: agent._id }, { lastrunkey: runkey, lastrunat: new Date(), laststatus: "Failed", lastmessage: error.message });
    return log;
  }
};

exports.registerPersonalDataAgentScheduler = () => {
  if (global.__personalDataAgentSchedulerRegistered) return;
  global.__personalDataAgentSchedulerRegistered = true;
  setInterval(async () => {
    try {
      const now = new Date();
      const dayofweek = days[now.getDay()];
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const timeofrunning = `${hh}:${mm}`;
      const runkey = `${now.toISOString().slice(0, 10)}-${dayofweek}-${timeofrunning}`;
      const agents = await PersonalDataAgent.find({ status: /^Active$/i, dayofweek: new RegExp(`^${dayofweek}$`, "i"), timeofrunning, lastrunkey: { $ne: runkey } }).lean();
      agents.forEach((agent) => runAgent(agent, runkey));
    } catch (_) {
      // Scheduler must never crash the server.
    }
  }, 60 * 1000);
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [years, logs] = await Promise.all([
      CasNewEntry.distinct("academicyear", { colid }),
      PersonalDataAgentLog.find({ colid }).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    res.json({ success: true, academicyears: uniq(years), days, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const rows = await PersonalDataAgent.find(queryFrom(req.query)).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const data = payload(req.body);
    if (!data.colid || !data.academicyear || !data.dayofweek || !data.timeofrunning || !data.reportemail) {
      return res.status(400).json({ success: false, message: "Academic year, day, time and report email are required" });
    }
    const row = req.body.id
      ? await PersonalDataAgent.findOneAndUpdate({ _id: req.body.id, colid: data.colid }, data, { new: true })
      : await PersonalDataAgent.create(data);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMany = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const result = await PersonalDataAgent.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.runNow = async (req, res) => {
  try {
    const agent = await PersonalDataAgent.findOne({ _id: req.body.id, colid: num(req.body.colid) }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
    const log = await runAgent(agent, `manual-${Date.now()}`);
    res.json({ success: true, data: log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.logs = async (req, res) => {
  try {
    const rows = await PersonalDataAgentLog.find(queryFrom(req.query)).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
