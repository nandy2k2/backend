const nodemailer = require("nodemailer");
const VacComplianceAgent = require("../Models/vaccomplianceagentds");
const VacComplianceAgentLog = require("../Models/vaccomplianceagentlogds");
const CourseMaster = require("../Models/moocvaluedcoursemasterds");
const Offering = require("../Models/moocvalueaddedofferingds");
const StudentResult = require("../Models/moocvalueaddedstudentds");
const EmailConfiguration = require("../Models/emailconfigurationds");
const Institution = require("../Models/insdetails");

const clean = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const esc = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const uniq = (rows = []) => [...new Set(rows.map(clean).filter(Boolean))].sort();
const smtpHost = (config = {}) => config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : "");
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
  agentname: clean(body.agentname || "VAC Compliance Agent"),
  academicyear: clean(body.academicyear),
  dayofweek: clean(body.dayofweek),
  timeofrunning: clean(body.timeofrunning),
  reportemail: clean(body.reportemail),
  targetcoursesperdepartment: num(body.targetcoursesperdepartment),
  minhours: num(body.minhours),
  status: clean(body.status || "Active"),
  name: clean(body.name),
  user: clean(body.user)
});

const reportHtml = ({ agent, institution, rows, summary }) => {
  const logo = institution?.logolink || institution?.logo || "";
  const instName = institution?.institutionname || "Institution";
  const rowHtml = rows.map((row, index) => `<tr>
    <td>${index + 1}</td><td>${row.department}</td><td>${row.coursecount}</td><td>${row.studentcount}</td><td>${row.estimatedhours}</td><td>${row.compliance}</td><td>${row.deviation}</td>
  </tr>`).join("");
  return `<div style="font-family:Arial;color:#111;line-height:1.45">
    <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px">${logo ? `<img src="${logo}" style="max-height:64px;max-width:140px;object-fit:contain" />` : ""}<h2>${instName}</h2><div>${institution?.address || ""}</div><h3>VAC / Add on Course Compliance Report</h3></div>
    <p><b>Academic year:</b> ${agent.academicyear}</p><p><b>Targets:</b> ${agent.targetcoursesperdepartment} course(s) per department, minimum ${agent.minhours} hour(s).</p>
    <p><b>Summary:</b> Departments ${summary.departmentcount}, Compliant ${summary.compliant}, Deviations ${summary.deviationcount}</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="border:1px solid #111;padding:6px">Sr</th><th style="border:1px solid #111;padding:6px">Department</th><th style="border:1px solid #111;padding:6px">Courses</th><th style="border:1px solid #111;padding:6px">Students</th><th style="border:1px solid #111;padding:6px">Estimated Hours</th><th style="border:1px solid #111;padding:6px">Compliance</th><th style="border:1px solid #111;padding:6px">Deviation</th></tr></thead><tbody>${rowHtml}</tbody></table>
  </div>`;
};

const buildReport = async (agent) => {
  const colid = num(agent.colid);
  const [masters, offerings, students, institution] = await Promise.all([
    CourseMaster.find({ colid, academicyear: agent.academicyear }).lean(),
    Offering.find({ colid, academicyear: agent.academicyear }).lean(),
    StudentResult.find({ colid, academicyear: agent.academicyear }).lean(),
    Institution.findOne({ colid }).sort({ _id: -1 }).lean()
  ]);
  const departments = uniq([...masters.map((r) => r.department), ...students.map((r) => r.department)]);
  const rows = departments.map((department) => {
    const deptCourses = masters.filter((r) => clean(r.department) === department);
    const deptStudents = students.filter((r) => clean(r.department) === department);
    const courseCodes = new Set(deptCourses.map((r) => clean(r.vaccode)).filter(Boolean));
    deptStudents.forEach((r) => { if (clean(r.vaccode)) courseCodes.add(clean(r.vaccode)); });
    const matchedOfferings = offerings.filter((o) => courseCodes.has(clean(o.vaccode)));
    const estimatedhours = matchedOfferings.reduce((sum, o) => {
      const start = o.startdate ? new Date(o.startdate) : null;
      const end = o.enddate ? new Date(o.enddate) : null;
      if (start && end && !Number.isNaN(start) && !Number.isNaN(end)) return sum + Math.max(1, Math.ceil((end - start) / 86400000) + 1);
      return sum + Math.max(0, Number(o.credit || 0));
    }, 0);
    const deviations = [];
    if (courseCodes.size < num(agent.targetcoursesperdepartment)) deviations.push(`Courses short by ${num(agent.targetcoursesperdepartment) - courseCodes.size}`);
    if (estimatedhours < num(agent.minhours)) deviations.push(`Hours short by ${num(agent.minhours) - estimatedhours}`);
    return {
      department,
      coursecount: courseCodes.size,
      studentcount: deptStudents.length,
      estimatedhours,
      compliance: deviations.length ? "Deviation" : "Compliant",
      deviation: deviations.join(", ") || "-"
    };
  });
  const summary = { departmentcount: rows.length, compliant: rows.filter((r) => r.compliance === "Compliant").length, deviationcount: rows.filter((r) => r.compliance !== "Compliant").length };
  return { rows, summary, html: reportHtml({ agent, institution, rows, summary }) };
};

const runAgent = async (agent, runkey = `manual-${Date.now()}`) => {
  const log = await VacComplianceAgentLog.findOneAndUpdate(
    { colid: agent.colid, agentid: agent._id, runkey },
    { $setOnInsert: { colid: agent.colid, agentid: agent._id, agentname: agent.agentname, academicyear: agent.academicyear, runkey, reportemail: agent.reportemail, status: "Running", user: agent.user } },
    { upsert: true, new: true }
  );
  if (!/^Running$/i.test(log.status)) return log;
  try {
    const report = await buildReport(agent);
    const config = await emailConfig(agent.colid);
    if (!config?.username || !config?.password || !smtpHost(config)) throw new Error("Default active email configuration is missing");
    await transporterFor(config).sendMail({ from: `"${agent.agentname}" <${config.username}>`, to: agent.reportemail, subject: `VAC compliance report - ${agent.academicyear}`, text: `Deviations: ${report.summary.deviationcount}`, html: report.html });
    log.status = "Sent";
    log.departmentcount = report.summary.departmentcount;
    log.deviationcount = report.summary.deviationcount;
    log.reporthtml = report.html;
    log.reportjson = JSON.stringify(report.rows);
    log.error = "";
    await log.save();
    await VacComplianceAgent.updateOne({ _id: agent._id }, { lastrunkey: runkey, lastrunat: new Date(), laststatus: "Sent", lastmessage: `${report.summary.deviationcount} department deviation(s)` });
    return log;
  } catch (error) {
    log.status = "Failed";
    log.error = error.message;
    await log.save();
    await VacComplianceAgent.updateOne({ _id: agent._id }, { lastrunkey: runkey, lastrunat: new Date(), laststatus: "Failed", lastmessage: error.message });
    return log;
  }
};

exports.registerScheduler = () => {
  if (global.__vacComplianceAgentSchedulerRegistered) return;
  global.__vacComplianceAgentSchedulerRegistered = true;
  setInterval(async () => {
    try {
      const now = new Date();
      const dayofweek = days[now.getDay()];
      const timeofrunning = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const runkey = `${now.toISOString().slice(0, 10)}-${dayofweek}-${timeofrunning}`;
      const agents = await VacComplianceAgent.find({ status: /^Active$/i, dayofweek: new RegExp(`^${dayofweek}$`, "i"), timeofrunning, lastrunkey: { $ne: runkey } }).lean();
      agents.forEach((agent) => runAgent(agent, runkey));
    } catch (_) {}
  }, 60000);
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [years, logs] = await Promise.all([
      CourseMaster.distinct("academicyear", { colid }),
      VacComplianceAgentLog.find({ colid }).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    res.json({ success: true, academicyears: uniq(years), days, logs });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.list = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    ["agentname", "academicyear", "dayofweek", "timeofrunning", "reportemail", "status"].forEach((field) => { if (clean(req.query[field])) query[field] = { $regex: esc(req.query[field]), $options: "i" }; });
    res.json({ success: true, data: await VacComplianceAgent.find(query).sort({ updatedAt: -1 }).limit(1000).lean() });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.save = async (req, res) => {
  try {
    const data = payload(req.body);
    if (!data.colid || !data.academicyear || !data.dayofweek || !data.timeofrunning || !data.reportemail) return res.status(400).json({ success: false, message: "Academic year, day, time and report email are required" });
    const row = req.body.id ? await VacComplianceAgent.findOneAndUpdate({ _id: req.body.id, colid: data.colid }, data, { new: true }) : await VacComplianceAgent.create(data);
    res.json({ success: true, data: row });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.deleteMany = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const result = await VacComplianceAgent.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.runNow = async (req, res) => {
  try {
    const agent = await VacComplianceAgent.findOne({ _id: req.body.id, colid: num(req.body.colid) }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
    res.json({ success: true, data: await runAgent(agent) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.logs = async (req, res) => {
  try {
    res.json({ success: true, data: await VacComplianceAgentLog.find({ colid: num(req.query.colid) }).sort({ createdAt: -1 }).limit(1000).lean() });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
