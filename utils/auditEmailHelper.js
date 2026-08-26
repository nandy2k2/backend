const nodemailer = require("nodemailer");
const AuditEmailConfig = require("../Models/neplmsauditemailconfigurationds");
const EmailConfiguration = require("../Models/emailconfigurationds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const smtpHost = (config = {}) => config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : "");

const transporterFor = (config) => {
  const host = smtpHost(config);
  if (!config?.username || !config?.password) throw new Error("Selected email configuration is incomplete");
  return nodemailer.createTransport(host ? {
    host,
    port: Number(config.port || 587),
    secure: /^yes$/i.test(text(config.secure)) || /^true$/i.test(text(config.secure)) || Number(config.port) === 465,
    auth: { user: config.username, pass: config.password }
  } : {
    service: config.provider || "Gmail",
    auth: { user: config.username, pass: config.password }
  });
};

const rowHtml = (label, value) => `<tr><th>${label}</th><td>${text(value) || "-"}</td></tr>`;

const attendanceModificationHtml = ({ classInfo = {}, previous = [], saved = [], changedBy = "", comments = "" }) => {
  const changedRows = saved.map((row) => {
    const before = previous.find((item) => String(item.studentid || "") === String(row.studentid || ""));
    const raw = typeof row.toObject === "function" ? row.toObject() : row;
    return { ...raw, previousattendance: before ? before.attendance : "" };
  }).filter((row) => row.previousattendance !== "" && Number(row.previousattendance) !== Number(row.attendance));
  const rows = (changedRows.length ? changedRows : saved).map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${text(row.student)}</td>
      <td>${text(row.regno)}</td>
      <td>${row.previousattendance === "" ? "-" : Number(row.previousattendance) === 1 ? "Present" : "Absent"}</td>
      <td>${Number(row.attendance) === 1 ? "Present" : "Absent"}</td>
      <td>${text(row.changereason || row.comments || comments)}</td>
    </tr>
  `).join("");
  return `
    <p>Attendance was modified for a class where attendance was already recorded.</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px">
      ${rowHtml("Academic year", classInfo.academicyear)}
      ${rowHtml("Program", `${text(classInfo.program)} ${text(classInfo.programcode)}`)}
      ${rowHtml("Semester / Section", `${text(classInfo.semester)} ${text(classInfo.section)}`)}
      ${rowHtml("Course", `${text(classInfo.course)} ${text(classInfo.coursecode)}`)}
      ${rowHtml("Faculty", `${text(classInfo.faculty)} ${text(classInfo.facultyemail)}`)}
      ${rowHtml("Class date/time", `${text(classInfo.classdate)} ${text(classInfo.classtime)}`)}
      ${rowHtml("Modified by", changedBy)}
    </table>
    <h3>Modified attendance rows</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px">
      <thead><tr><th>Sr</th><th>Student</th><th>Reg No</th><th>Previous</th><th>Current</th><th>Remarks</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='6'>No changed rows detected.</td></tr>"}</tbody>
    </table>
  `;
};

async function sendAuditEmail({ colid, type, subject, html }) {
  const scopedColid = number(colid);
  if (scopedColid === undefined) return { sent: 0, errors: ["colid is required"] };
  const configs = await AuditEmailConfig.find({
    colid: scopedColid,
    type,
    enabled: /^yes$/i
  }).lean();
  const results = [];
  const errors = [];
  for (const config of configs) {
    try {
      const mailConfig = config.emailconfigurationid
        ? await EmailConfiguration.findOne({ _id: config.emailconfigurationid, colid: scopedColid }).lean()
        : await EmailConfiguration.findOne({ colid: scopedColid, isactive: { $ne: "No" }, default: /^yes$/i }).lean();
      if (!mailConfig) throw new Error("Email configuration not found");
      await transporterFor(mailConfig).sendMail({
        from: mailConfig.username,
        to: config.recipient,
        subject: text(config.subject) || subject || `${type} audit trail`,
        html,
        text: text(html).replace(/<[^>]+>/g, " ")
      });
      results.push(config.recipient);
    } catch (error) {
      errors.push(`${config.recipient || "recipient"}: ${error.message}`);
    }
  }
  return { sent: results.length, recipients: results, errors };
}

module.exports = {
  attendanceModificationHtml,
  sendAuditEmail
};
