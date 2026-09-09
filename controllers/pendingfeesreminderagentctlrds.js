const nodemailer = require("nodemailer");
const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const EmailConfiguration = require("../Models/emailconfigurationds");
const PendingFeesReminderAgent = require("../Models/pendingfeesreminderagentds");
const PendingFeesReminderLog = require("../Models/pendingfeesreminderlogds");

const clean = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const uniq = (values = []) => [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const smtpHost = (config = {}) => config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : "");
const emailConfigLabel = (row = {}) => `${row.provider || "Email"} / ${row.type || "General"} / ${row.username || ""}`;

const transporterFor = (config = {}) => {
  const host = smtpHost(config);
  if (!config.username || !config.password || !host) throw new Error("Selected email configuration is incomplete");
  return nodemailer.createTransport({
    host,
    port: Number(config.port || 587),
    secure: ["yes", "true"].includes(clean(config.secure).toLowerCase()) || Number(config.port) === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const ledgerFilter = (source = {}) => {
  const colid = num(source.colid);
  const query = {
    colid,
    balance: { $gt: 0 },
    duedate: { $lt: new Date() }
  };
  ["academicyear", "program", "programcode"].forEach((field) => {
    if (clean(source[field])) query[field] = clean(source[field]);
  });
  return query;
};

const formatCurrency = (value) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN");
};

const interpolate = (template, row) => clean(template)
  .replace(/\{\{\s*student\s*\}\}/gi, row.student || row.name || "")
  .replace(/\{\{\s*name\s*\}\}/gi, row.student || row.name || "")
  .replace(/\{\{\s*regno\s*\}\}/gi, row.regno || "")
  .replace(/\{\{\s*academicyear\s*\}\}/gi, row.academicyear || "")
  .replace(/\{\{\s*program\s*\}\}/gi, row.program || "")
  .replace(/\{\{\s*programcode\s*\}\}/gi, row.programcode || "")
  .replace(/\{\{\s*feeitem\s*\}\}/gi, row.feeitem || "")
  .replace(/\{\{\s*balance\s*\}\}/gi, formatCurrency(row.balance))
  .replace(/\{\{\s*duedate\s*\}\}/gi, formatDate(row.duedate));

const aggregateByStudent = (rows = []) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = clean(row.regno) || clean(row.studentemail) || clean(row.email) || clean(row._id);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        email: clean(row.studentemail || row.email),
        student: clean(row.student || row.name),
        regno: clean(row.regno),
        academicyear: clean(row.academicyear),
        program: clean(row.program),
        programcode: clean(row.programcode),
        balance: 0,
        rows: []
      });
    }
    const item = map.get(key);
    item.balance += Number(row.balance || 0);
    item.rows.push(row);
  });
  return [...map.values()].filter((row) => row.email);
};

const enrichLedgerRowsWithStudentEmail = async (colid, rows = []) => {
  const regnos = uniq(rows.map((row) => row.regno));
  if (!regnos.length) return rows.map((row) => ({ ...row, studentemail: clean(row.studentemail || row.email) }));
  const users = await User.find({ colid, role: /^Student$/i, regno: { $in: regnos } })
    .select("regno email name student")
    .lean();
  const userMap = new Map(users.map((row) => [clean(row.regno), row]));
  return rows.map((row) => {
    const student = userMap.get(clean(row.regno)) || {};
    return {
      ...row,
      studentemail: clean(row.studentemail || student.email || row.email),
      student: clean(row.student || row.name || student.name || student.student),
      name: clean(row.name || row.student || student.name || student.student)
    };
  });
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    const [academicyears, programs, emailconfigs] = await Promise.all([
      Ledgerstud.distinct("academicyear", query),
      Ledgerstud.aggregate([
        { $match: query },
        { $group: { _id: { program: "$program", programcode: "$programcode" } } },
        { $sort: { "_id.program": 1, "_id.programcode": 1 } }
      ]),
      EmailConfiguration.find({ colid, isactive: { $ne: "No" } }).sort({ default: -1, provider: 1, username: 1 }).lean()
    ]);
    res.json({
      success: true,
      academicyears: uniq(academicyears),
      programs: programs.map((row) => ({
        program: clean(row._id.program),
        programcode: clean(row._id.programcode),
        label: `${clean(row._id.program) || "Program"}${clean(row._id.programcode) ? ` (${clean(row._id.programcode)})` : ""}`
      })).filter((row) => row.program || row.programcode),
      emailconfigs: emailconfigs.map((row) => ({ ...row, label: emailConfigLabel(row) }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.searchPendingFees = async (req, res) => {
  try {
    const query = ledgerFilter(req.query);
    if (!query.colid || !query.academicyear || !query.programcode) {
      return res.status(400).json({ success: false, message: "Academic year and program are required" });
    }
    const ledgerRows = await Ledgerstud.find(query)
      .select("academicyear regulation program programcode semester student name regno user feegroup feecategory feeitem amount paid concession balance duedate status")
      .sort({ program: 1, student: 1, duedate: 1, feeitem: 1 })
      .lean();
    const rows = await enrichLedgerRowsWithStudentEmail(query.colid, ledgerRows);
    const recipients = aggregateByStudent(rows);
    res.json({
      success: true,
      data: rows,
      recipients,
      summary: {
        feeitems: rows.length,
        students: uniq(rows.map((row) => row.regno || row.student || row.studentemail)).length,
        emailableStudents: recipients.length,
        balance: rows.reduce((sum, row) => sum + Number(row.balance || 0), 0)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sendReminder = async ({ colid, rows, selectedIds, subject, body, emailconfigid, user, name, agentid = "", runtype = "Manual" }) => {
  const selectedSet = new Set((selectedIds || []).map(clean));
  const filteredRows = selectedSet.size ? rows.filter((row) => selectedSet.has(clean(row._id))) : rows;
  const recipients = aggregateByStudent(filteredRows);
  const config = await EmailConfiguration.findOne({ _id: emailconfigid, colid }).lean();
  if (!config) throw new Error("Select a valid email configuration");
  const transporter = transporterFor(config);
  const results = [];
  for (const recipient of recipients) {
    try {
      const feeTable = recipient.rows.map((row, index) => `<tr><td>${index + 1}</td><td>${clean(row.feeitem)}</td><td>${formatDate(row.duedate)}</td><td style="text-align:right">${formatCurrency(row.balance)}</td></tr>`).join("");
      const html = `<div style="font-family:Arial;color:#111;line-height:1.45">
        <p>${interpolate(body, recipient).replace(/\n/g, "<br />")}</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr><th style="border:1px solid #ccc;padding:6px">Sr</th><th style="border:1px solid #ccc;padding:6px">Fee Item</th><th style="border:1px solid #ccc;padding:6px">Due Date</th><th style="border:1px solid #ccc;padding:6px">Balance</th></tr></thead>
          <tbody>${feeTable}</tbody>
        </table>
        <p><b>Total Balance:</b> ${formatCurrency(recipient.balance)}</p>
      </div>`;
      await transporter.sendMail({
        from: config.username,
        to: recipient.email,
        subject: interpolate(subject, recipient),
        html,
        text: `${interpolate(body, recipient)}\nTotal Balance: ${formatCurrency(recipient.balance)}`
      });
      results.push({ email: recipient.email, student: recipient.student, regno: recipient.regno, status: "Sent" });
    } catch (err) {
      results.push({ email: recipient.email, student: recipient.student, regno: recipient.regno, status: "Failed", error: err.message });
    }
  }
  const log = await PendingFeesReminderLog.create({
    colid,
    agentid,
    academicyear: clean(rows[0]?.academicyear),
    program: clean(rows[0]?.program),
    programcode: clean(rows[0]?.programcode),
    runby: user,
    runtype,
    subject,
    totalmatched: rows.length,
    totalrecipients: recipients.length,
    sent: results.filter((row) => row.status === "Sent").length,
    failed: results.filter((row) => row.status === "Failed").length,
    results,
    user,
    name
  });
  return { log, results };
};

exports.sendNow = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const requestRows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const ledgerRows = requestRows.length ? requestRows : await Ledgerstud.find(ledgerFilter(req.body)).lean();
    const rows = await enrichLedgerRowsWithStudentEmail(colid, ledgerRows);
    const result = await sendReminder({
      colid,
      rows,
      selectedIds: req.body.selectedIds,
      subject: req.body.subject,
      body: req.body.body,
      emailconfigid: req.body.emailconfigid,
      user: clean(req.body.user),
      name: clean(req.body.name),
      runtype: "Manual"
    });
    res.json({ success: true, ...result, summary: { sent: result.log.sent, failed: result.log.failed, totalrecipients: result.log.totalrecipients } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveAgent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const config = await EmailConfiguration.findOne({ _id: req.body.emailconfigid, colid }).lean();
    if (!config) return res.status(400).json({ success: false, message: "Select a valid email configuration" });
    const payload = {
      colid,
      academicyear: clean(req.body.academicyear),
      program: clean(req.body.program),
      programcode: clean(req.body.programcode),
      subject: clean(req.body.subject),
      body: clean(req.body.body),
      emailconfigid: clean(req.body.emailconfigid),
      emailconfigname: emailConfigLabel(config),
      dayofweek: clean(req.body.dayofweek),
      timeofrunning: clean(req.body.timeofrunning),
      active: clean(req.body.active || "Yes"),
      user: clean(req.body.user),
      name: clean(req.body.name)
    };
    if (!payload.academicyear || !payload.programcode || !payload.subject || !payload.body || !payload.dayofweek || !payload.timeofrunning) {
      return res.status(400).json({ success: false, message: "Academic year, program, subject, email text, day and time are required" });
    }
    const data = req.body.id
      ? await PendingFeesReminderAgent.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await PendingFeesReminderAgent.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listAgents = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    ["academicyear", "programcode", "active"].forEach((field) => {
      if (clean(req.query[field])) query[field] = clean(req.query[field]);
    });
    const data = await PendingFeesReminderAgent.find(query).sort({ academicyear: -1, program: 1, dayofweek: 1, timeofrunning: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateAgentStatus = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const data = await PendingFeesReminderAgent.findOneAndUpdate(
      { _id: req.body.id, colid },
      { active: clean(req.body.active) === "No" ? "No" : "Yes" },
      { new: true }
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.runAgent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const agent = await PendingFeesReminderAgent.findOne({ _id: req.body.id, colid }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
    const ledgerRows = await Ledgerstud.find(ledgerFilter(agent)).lean();
    const rows = await enrichLedgerRowsWithStudentEmail(colid, ledgerRows);
    const result = await sendReminder({
      colid,
      rows,
      subject: agent.subject,
      body: agent.body,
      emailconfigid: agent.emailconfigid,
      user: clean(req.body.user || agent.user),
      name: clean(req.body.name || agent.name),
      agentid: clean(agent._id),
      runtype: "Manual Agent"
    });
    await PendingFeesReminderAgent.findByIdAndUpdate(agent._id, {
      lastRunAt: new Date(),
      lastRunStatus: result.log.failed ? "Partial" : "Sent",
      lastRunSummary: { sent: result.log.sent, failed: result.log.failed, totalrecipients: result.log.totalrecipients }
    });
    res.json({ success: true, ...result, summary: { sent: result.log.sent, failed: result.log.failed, totalrecipients: result.log.totalrecipients } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const dayName = (date) => days[date.getDay()];
const minuteKey = (agent, date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${clean(agent.timeofrunning)}`;

exports.registerScheduler = () => {
  if (global.__pendingFeesReminderSchedulerRegistered) return;
  global.__pendingFeesReminderSchedulerRegistered = true;
  setInterval(async () => {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const agents = await PendingFeesReminderAgent.find({ active: /^Yes$/i, dayofweek: dayName(now), timeofrunning: hhmm }).lean().catch(() => []);
    for (const agent of agents) {
      const key = minuteKey(agent, now);
      if (agent.lastScheduledRunKey === key) continue;
      await PendingFeesReminderAgent.findByIdAndUpdate(agent._id, { lastScheduledRunKey: key }).catch(() => {});
      const ledgerRows = await Ledgerstud.find(ledgerFilter(agent)).lean().catch(() => []);
      const rows = await enrichLedgerRowsWithStudentEmail(agent.colid, ledgerRows).catch(() => ledgerRows);
      sendReminder({
        colid: agent.colid,
        rows,
        subject: agent.subject,
        body: agent.body,
        emailconfigid: agent.emailconfigid,
        user: agent.user || "Scheduler",
        name: agent.name || "Scheduler",
        agentid: clean(agent._id),
        runtype: "Scheduled"
      }).then((result) => {
        PendingFeesReminderAgent.findByIdAndUpdate(agent._id, {
          lastRunAt: new Date(),
          lastRunStatus: result.log.failed ? "Partial" : "Sent",
          lastRunSummary: { sent: result.log.sent, failed: result.log.failed, totalrecipients: result.log.totalrecipients }
        }).catch(() => {});
      }).catch((err) => {
        PendingFeesReminderAgent.findByIdAndUpdate(agent._id, {
          lastRunAt: new Date(),
          lastRunStatus: "Failed",
          lastRunSummary: { error: err.message }
        }).catch(() => {});
      });
    }
  }, 60 * 1000);
};
