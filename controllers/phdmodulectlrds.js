const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const nodemailer = require("nodemailer");
const PhdAssignment = require("../Models/phdthesisassignmentds");
const PhdWorkflow = require("../Models/phdthesisworkflowds");
const PhdSubmission = require("../Models/phdthesissubmissionds");
const PhdNocWorkflow = require("../Models/phdnocworkflowds");
const PhdNocApproval = require("../Models/phdnocapprovalds");
const PhdOralDefenseAssignment = require("../Models/phdoraldefenseassignmentds");
const PhdOralDefenseWorkflow = require("../Models/phdoraldefenseworkflowds");
const PhdOralDefenseApproval = require("../Models/phdoraldefenseapprovalds");
const PhdOralDefensePanel = require("../Models/phdoraldefensepanelds");
const PhdOralDefensePanelMember = require("../Models/phdoraldefensepanelmemberds");
const PhdOralDefensePanelWorkflow = require("../Models/phdoraldefensepanelworkflowds");
const PhdExamPanel = require("../Models/phdexampanelds");
const PhdExamPanelMember = require("../Models/phdexampanelmemberds");
const PhdExaminerAssignment = require("../Models/phdexaminerassignmentds");
const PhdExaminerRubric = require("../Models/phdexaminerrubricds");
const PhdExaminerAssessment = require("../Models/phdexaminerassessmentds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const Institution = require("../Models/insdetails");
const Awsconfig = require("../Models/awsconfig");
const EmailConfiguration = require("../Models/emailconfigurationds");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(escapeRegex(value), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const parseMulti = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(",").map(text).filter(Boolean);
const exactRegex = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");

function applyFilters(query, source = {}, fields = []) {
  fields.forEach((field) => {
    const values = parseMulti(source[field]);
    if (values.length === 1) query[field] = regex(values[0]);
    if (values.length > 1) query[field] = { $in: values };
  });
}

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

async function uploadToAws(colid, file) {
  const config = await Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || await Awsconfig.findOne({ colid, type: /^aws$/i }).sort({ _id: -1 }).lean();
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
    throw new Error("AWS configuration is missing. Please configure AWS before uploading PhD thesis files.");
  }
  const cleanName = path.basename(file.originalname || "thesis-document").replace(/[^\w.\-() ]/g, "_");
  const key = `${colid}/phd-thesis/${Date.now()}-${cleanName}`;
  const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
  await s3.putObject({ Bucket: config.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype || "application/octet-stream" }).promise();
  return { filename: cleanName, key, url: s3Url(config.bucket, config.region, key) };
}

async function institution(colid) {
  return Institution.findOne({ colid }).sort({ _id: -1 }).lean() || {};
}

function assignmentPayload(body = {}) {
  return {
    colid: num(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    student: text(body.student),
    regno: text(body.regno),
    email: text(body.email),
    phone: text(body.phone),
    topic: text(body.topic),
    subject: text(body.subject),
    guidename: text(body.guidename),
    guideemail: text(body.guideemail),
    startdate: text(body.startdate),
    enddate: text(body.enddate),
    status: text(body.status) || "Active",
    name: text(body.name),
    user: text(body.user)
  };
}

function workflowPayload(body = {}) {
  return {
    colid: num(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    level: num(body.level),
    approvername: text(body.approvername),
    approveremail: text(body.approveremail),
    role: text(body.role),
    status: text(body.status) || "Active",
    remarks: text(body.remarks),
    name: text(body.name),
    user: text(body.user)
  };
}

function nocWorkflowPayload(body = {}) {
  return {
    colid: num(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    level: num(body.level),
    approvername: text(body.approvername),
    approveremail: text(body.approveremail),
    role: text(body.role),
    status: text(body.status) || "Active",
    remarks: text(body.remarks),
    name: text(body.name),
    user: text(body.user)
  };
}

function oralWorkflowPayload(body = {}) {
  return {
    colid: num(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    level: num(body.level),
    approvername: text(body.approvername),
    approveremail: text(body.approveremail),
    role: text(body.role),
    status: text(body.status) || "Active",
    remarks: text(body.remarks),
    name: text(body.name),
    user: text(body.user)
  };
}

function oralPanelWorkflowPayload(body = {}) {
  return {
    colid: num(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    level: num(body.level),
    approvername: text(body.approvername),
    approveremail: text(body.approveremail),
    role: text(body.role),
    status: text(body.status) || "Active",
    remarks: text(body.remarks),
    name: text(body.name),
    user: text(body.user)
  };
}

function panelPayload(body = {}) {
  return {
    colid: num(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    panelname: text(body.panelname),
    description: text(body.description),
    status: text(body.status) || "Active",
    name: text(body.name),
    user: text(body.user)
  };
}

function oralPanelPayload(body = {}) {
  return {
    colid: num(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    panelname: text(body.panelname),
    description: text(body.description),
    approvalstatus: text(body.approvalstatus) || "Draft",
    status: text(body.status) || "Active",
    comments: text(body.comments),
    name: text(body.name),
    user: text(body.user)
  };
}

function oralPanelMemberPayload(body = {}) {
  return {
    colid: num(body.colid),
    oralpanelid: text(body.oralpanelid || body.panelid),
    sourcepanelid: text(body.sourcepanelid),
    sourcememberid: text(body.sourcememberid || body.memberid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    panelname: text(body.panelname),
    program: text(body.program),
    programcode: text(body.programcode),
    examinername: text(body.examinername),
    examineremail: text(body.examineremail || body.email),
    designation: text(body.designation),
    qualification: text(body.qualification),
    type: text(body.type),
    specialization: text(body.specialization),
    ugteachingexp: text(body.ugteachingexp),
    pgteachingexp: text(body.pgteachingexp),
    address: text(body.address),
    phone: text(body.phone),
    email: text(body.email),
    eligible: text(body.eligible || body.eligibile) || "Yes",
    approvalstatus: text(body.approvalstatus) || "Draft",
    preferenceorder: num(body.preferenceorder),
    currentlevel: num(body.currentlevel),
    currentapprovername: text(body.currentapprovername),
    currentapproveremail: text(body.currentapproveremail),
    approvalcomments: text(body.approvalcomments),
    user: text(body.user),
    useremail: text(body.useremail),
    comments: text(body.comments),
    name: text(body.name),
    createdby: text(body.createdby || body.user)
  };
}

function memberPayload(body = {}) {
  return {
    colid: num(body.colid),
    panelid: text(body.panelid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    panelname: text(body.panelname),
    program: text(body.program),
    programcode: text(body.programcode),
    examinername: text(body.examinername),
    examineremail: text(body.examineremail || body.email),
    designation: text(body.designation),
    qualification: text(body.qualification),
    type: text(body.type),
    specialization: text(body.specialization),
    ugteachingexp: text(body.ugteachingexp),
    pgteachingexp: text(body.pgteachingexp),
    address: text(body.address),
    phone: text(body.phone),
    email: text(body.email),
    eligible: text(body.eligible || body.eligibile) || "Yes",
    approvalstatus: text(body.approvalstatus) || "Pending",
    comments: text(body.comments),
    approvalcomments: text(body.approvalcomments),
    name: text(body.name),
    user: text(body.user),
    useremail: text(body.useremail)
  };
}

function rubricPayload(body = {}) {
  return {
    colid: num(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    program: text(body.program),
    programcode: text(body.programcode),
    group: text(body.group),
    topic: text(body.topic),
    status: text(body.status) || "Active",
    name: text(body.name),
    user: text(body.user)
  };
}

function createTransporter(config) {
  const port = Number(config.port) || (/gmail/i.test(config.provider || "") ? 465 : 587);
  const secureValue = String(config.secure || "").toLowerCase();
  return nodemailer.createTransport({
    host: config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : ""),
    port,
    secure: secureValue === "yes" || secureValue === "true" || port === 465,
    auth: { user: config.username, pass: config.password }
  });
}

async function defaultEmailConfig(colid) {
  const active = { colid, isactive: /^Yes$/i };
  return await EmailConfiguration.findOne({ ...active, default: /^Yes$/i }).sort({ updatedAt: -1 }).lean()
    || await EmailConfiguration.findOne(active).sort({ updatedAt: -1 }).lean();
}

function appointmentRef(member = {}) {
  const year = new Date().getFullYear();
  return `PU/COE/Conf.Acad/M/Acad./Ph.D./${year}/${text(member._id).slice(-5)}`;
}

function replaceAppointmentPlaceholders(template = "", member = {}, inst = {}, includeCredentials = false) {
  const values = {
    ref: appointmentRef(member),
    date: new Date().toLocaleDateString("en-GB"),
    institutionname: inst.institutionname || inst.name || "Institution",
    institutionaddress: inst.address || "",
    institutionphone: inst.phone || inst.contact || "",
    institutionemail: inst.email || inst.emailid || "",
    examinername: member.examinername || "",
    examineremail: member.examineremail || member.email || "",
    designation: member.designation || "",
    examineraddress: member.address || "",
    subject: member.program || member.programcode || "",
    program: member.program || "",
    programcode: member.programcode || "",
    academicyear: member.academicyear || "",
    regulation: member.regulation || "",
    panelname: member.panelname || "",
    examinertype: member.type || "",
    username: member.useremail || member.user || "",
    password: includeCredentials ? "Password@123" : ""
  };
  return text(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[String(key).toLowerCase()] ?? "");
}

function defaultAppointmentContent(member = {}, inst = {}, includeCredentials = false) {
  const credentialLine = includeCredentials
    ? `\n\nERP login details:\nUser name: {{username}}\nDefault password: {{password}}`
    : "";
  return replaceAppointmentPlaceholders(`Subject: Appointment as Thesis Valuator of the Ph.D.

Respected Sir/Madam,

1. With the approval of the competent authority of {{institutionname}}, an assignment as a thesis valuator is offered to you in the subject: {{subject}} for the Ph.D. Program.

2. Presuming that you are willing to accept the appointment, all relevant papers as per the enclosure list given below are sent herewith.

3. You are also requested to keep your appointment strictly confidential.

4. Kindly provide the correct details of Account No., IFSC Code, and PAN No. in the attached remuneration bill and hardcopy of cancelled cheque for timely transfer of remuneration into your account.

5. You are also requested to fill the valuation report in your own handwriting only.

6. Please send all the documents in the envelope as per the list of enclosures only within 20 days of receipt through mail only at {{institutionemail}}.${credentialLine}

Note: Remuneration Rates:
Valuation of thesis for Ph.D. = as per institutional rules.

Enclosures:
1. Acceptance Form
2. Valuation Report Form
3. Remuneration Bill Form`, member, inst, includeCredentials);
}

function appointmentHtml(member, inst = {}, includeCredentials = false, customContent = "") {
  const name = inst.institutionname || inst.name || "Institution";
  const address = inst.address || "";
  const phone = inst.phone || inst.contact || "";
  const email = inst.email || inst.emailid || "";
  const logo = inst.logolink || inst.logo || "";
  const content = replaceAppointmentPlaceholders(customContent || defaultAppointmentContent(member, inst, includeCredentials), member, inst, includeCredentials);
  const paragraphs = content.split(/\n{2,}/).map((block) => `<p>${block.split(/\n/).map((line) => text(line)).join("<br/>")}</p>`).join("");
  return `<!doctype html><html><head><style>
    body{font-family:Georgia,'Times New Roman',serif;color:#000;line-height:1.48;background:#fff}
    .page{max-width:780px;margin:auto}.head{text-align:center;border-bottom:2px solid #222;padding-bottom:8px;margin-bottom:14px}.logo{height:72px;object-fit:contain}
    .inst{font-size:26px;font-weight:800;text-transform:uppercase;letter-spacing:1px}.addr,.contact{font-size:12px}.meta{display:flex;justify-content:space-between;font-size:13px;margin:12px 0}
    .conf{text-align:center;text-decoration:underline;font-weight:800;margin:14px 0 8px}.fromto{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px}.fromto td{border:1px solid #222;padding:8px;vertical-align:top;width:50%}
    .content{font-size:14px;text-align:justify}.content p{margin:9px 0}.sign{text-align:right;margin-top:48px;font-weight:700}.small{font-size:12px}
  </style></head><body><div class="page"><div class="head">${logo ? `<img class="logo" src="${logo}"/>` : ""}<div class="inst">${name}</div><div class="addr">${address}</div><div class="contact">${[phone, email].filter(Boolean).join(" | ")}</div></div>
  <div class="meta"><div><b>Ref:</b> ${appointmentRef(member)}</div><div><b>Date:</b> ${new Date().toLocaleDateString("en-GB")}</div></div>
  <div class="conf">MOST CONFIDENTIAL &amp; URGENT</div>
  <table class="fromto"><tbody><tr><td><b>From:</b><br/>Controller of Examinations<br/>${name}<br/>${address}</td><td><b>To:</b><br/>${member.examinername || ""}${member.designation ? `, ${member.designation}` : ""}<br/>${member.address || ""}</td></tr></tbody></table>
  <div class="content">${paragraphs}</div>
  <div class="sign">Yours faithfully,<br/><br/>Mr. Vinod Kushwah<br/><span class="small">Assistant Registrar (Examinations)</span></div></div></body></html>`;
}

function stripHtml(html) {
  return text(html).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ");
}

async function ensureExaminerUser(member, approver = {}) {
  const colid = num(member.colid);
  const requestedEmail = text(member.examineremail || member.email).toLowerCase();
  if (!requestedEmail) throw new Error(`Examiner email is missing for ${member.examinername || "selected member"}.`);
  const sameInstitutionUser = await User.findOne({ colid, email: exactRegex(requestedEmail) });
  if (sameInstitutionUser) {
    sameInstitutionUser.name = member.examinername || sameInstitutionUser.name;
    sameInstitutionUser.phone = member.phone || sameInstitutionUser.phone || "NA";
    sameInstitutionUser.role = sameInstitutionUser.role || "phdexaminer";
    sameInstitutionUser.department = sameInstitutionUser.department || member.program || "PhD";
    sameInstitutionUser.designation = member.designation || sameInstitutionUser.designation;
    sameInstitutionUser.status = sameInstitutionUser.status || 1;
    if (!sameInstitutionUser.authenticator) sameInstitutionUser.authenticator = "Yes";
    await sameInstitutionUser.save();
    return { user: sameInstitutionUser.email, useremail: sameInstitutionUser.email };
  }

  const otherInstitutionUser = await User.findOne({ email: exactRegex(requestedEmail) });
  const loginEmail = otherInstitutionUser
    ? `phdexaminer.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@examiner.local`
    : requestedEmail;
  const created = await User.create({
    email: loginEmail,
    googleemail: requestedEmail,
    name: member.examinername || requestedEmail,
    phone: member.phone || "NA",
    password: "Password@123",
    role: "phdexaminer",
    regno: `PHDEXAM-${Date.now()}`,
    program: member.program || "PhD",
    programcode: member.programcode || "PHD",
    admissionyear: member.academicyear || new Date().getFullYear().toString(),
    academicyear: member.academicyear || "",
    semester: "NA",
    section: "NA",
    department: member.program || "PhD",
    designation: member.designation || "PhD Examiner",
    address: member.address || "",
    colid,
    status: 1,
    user: text(approver.user),
    addedby: text(approver.name || approver.user),
    authenticator: "Yes"
  });
  return { user: created.email, useremail: created.email };
}

async function workflowFor(assignment) {
  return PhdWorkflow.find({
    colid: assignment.colid,
    programcode: regex(assignment.programcode),
    status: /^Active$/i,
    $or: [
      { academicyear: "" },
      { academicyear: { $exists: false } },
      { academicyear: regex(assignment.academicyear) }
    ]
  }).sort({ level: 1 }).lean();
}

async function nocWorkflowFor(submission) {
  return PhdNocWorkflow.find({
    colid: submission.colid,
    programcode: regex(submission.programcode),
    status: /^Active$/i,
    $or: [
      { academicyear: "" },
      { academicyear: { $exists: false } },
      { academicyear: regex(submission.academicyear) }
    ]
  }).sort({ level: 1 }).lean();
}

async function oralWorkflowFor(row) {
  return PhdOralDefenseWorkflow.find({
    colid: row.colid,
    programcode: regex(row.programcode),
    status: /^Active$/i,
    $or: [
      { academicyear: "" },
      { academicyear: { $exists: false } },
      { academicyear: regex(row.academicyear) }
    ]
  }).sort({ level: 1 }).lean();
}

async function oralPanelWorkflowFor(row) {
  return PhdOralDefensePanelWorkflow.find({
    colid: row.colid,
    programcode: regex(row.programcode),
    status: /^Active$/i,
    $or: [
      { academicyear: "" },
      { academicyear: { $exists: false } },
      { academicyear: regex(row.academicyear) }
    ]
  }).sort({ level: 1 }).lean();
}

async function submitOralPanel(panel, actor = {}) {
  const workflow = await oralPanelWorkflowFor(panel);
  const first = workflow[0];
  panel.approvalstatus = first ? "Submitted" : "Approved";
  panel.currentlevel = first ? first.level : 0;
  panel.currentapprovername = first ? first.approvername : "";
  panel.currentapproveremail = first ? first.approveremail : "";
  panel.approveddate = first ? undefined : new Date();
  panel.rejecteddate = undefined;
  panel.history.push({
    action: first ? "Submitted for oral defense panel approval" : "Approved automatically",
    level: first ? first.level : 0,
    approvername: text(actor.name),
    approveremail: text(actor.user),
    comments: text(actor.comments),
    date: new Date()
  });
  await panel.save();
  return panel;
}

async function submitOralPanelMembers(panel, actor = {}) {
  const workflow = await oralPanelWorkflowFor(panel);
  const first = workflow[0];
  const members = await PhdOralDefensePanelMember.find({ colid: panel.colid, oralpanelid: String(panel._id), approvalstatus: { $in: ["Draft", "Rejected"] } });
  for (const member of members) {
    member.approvalstatus = first ? "Submitted" : "Approved";
    member.currentlevel = first ? first.level : 0;
    member.currentapprovername = first ? first.approvername : "";
    member.currentapproveremail = first ? first.approveremail : "";
    member.approveddate = first ? undefined : new Date();
    member.rejecteddate = undefined;
    member.approvalcomments = text(actor.comments);
    member.history.push({
      action: first ? "Submitted for oral defense panel member approval" : "Approved automatically",
      level: first ? first.level : 0,
      approvername: text(actor.name),
      approveremail: text(actor.user),
      comments: text(actor.comments),
      date: new Date()
    });
    await member.save();
  }
  panel.approvalstatus = first ? "Submitted" : "Approved";
  panel.currentlevel = first ? first.level : 0;
  panel.currentapprovername = first ? first.approvername : "";
  panel.currentapproveremail = first ? first.approveremail : "";
  panel.history.push({
    action: first ? "Members submitted for approval" : "Members approved automatically",
    level: first ? first.level : 0,
    approvername: text(actor.name),
    approveremail: text(actor.user),
    comments: text(actor.comments),
    date: new Date()
  });
  await panel.save();
  return { panel, submitted: members.length };
}

function firstPendingStatus(workflow) {
  const first = workflow[0];
  return first
    ? { status: "Submitted", currentlevel: first.level, currentapprovername: first.approvername, currentapproveremail: first.approveremail }
    : { status: "Approved", currentlevel: 0, currentapprovername: "", currentapproveremail: "", approveddate: new Date(), finalcomments: "Approved automatically because no workflow was configured." };
}

async function ensureNocApproval(submission, seedUser = {}) {
  const existing = await PhdNocApproval.findOne({ colid: submission.colid, submissionid: String(submission._id) });
  if (existing) return existing;
  const workflow = await nocWorkflowFor(submission);
  const firstState = firstPendingStatus(workflow);
  return PhdNocApproval.create({
    colid: submission.colid,
    submissionid: String(submission._id),
    academicyear: submission.academicyear,
    regulation: submission.regulation,
    program: submission.program,
    programcode: submission.programcode,
    student: submission.student,
    regno: submission.regno,
    email: submission.email,
    topic: submission.topic,
    subject: submission.subject,
    guidename: submission.guidename,
    guideemail: submission.guideemail,
    fileurl: submission.fileurl,
    filename: submission.filename,
    ...firstState,
    history: [{ action: "Submitted for final NoC approval", level: firstState.currentlevel || 0, approvername: "", approveremail: "", comments: "Created after all examiner approvals.", date: new Date() }],
    name: text(seedUser.name),
    user: text(seedUser.user)
  });
}

async function syncNocApprovalsForSubmissions(submissions = [], seedUser = {}) {
  const output = [];
  for (const row of submissions) {
    output.push(await ensureNocApproval(row, seedUser));
  }
  return output;
}

async function ensureOralDefenseApproval(source, seedUser = {}) {
  const existing = await PhdOralDefenseApproval.findOne({ colid: source.colid, submissionid: String(source.submissionid) });
  if (existing) return existing;
  const workflow = await oralWorkflowFor(source);
  const firstState = firstPendingStatus(workflow);
  return PhdOralDefenseApproval.create({
    colid: source.colid,
    submissionid: String(source.submissionid),
    nocapprovalid: String(source.nocapprovalid),
    academicyear: source.academicyear,
    regulation: source.regulation,
    program: source.program,
    programcode: source.programcode,
    student: source.student,
    regno: source.regno,
    topic: source.topic,
    subject: source.subject,
    guidename: source.guidename,
    guideemail: source.guideemail,
    oraldefensedate: source.oraldefensedate,
    ...firstState,
    history: [{ action: "Submitted for oral defense approval", level: firstState.currentlevel || 0, approvername: "", approveremail: "", comments: "Created after oral defense examiner approval.", date: new Date() }],
    name: text(seedUser.name),
    user: text(seedUser.user)
  });
}

async function maybeCreateOralDefenseApproval(row, seedUser = {}) {
  const assignments = await PhdOralDefenseAssignment.find({ colid: row.colid, submissionid: String(row.submissionid) }).lean();
  if (assignments.length && assignments.every((item) => /^Approved$/i.test(item.status))) {
    await ensureOralDefenseApproval(row, seedUser);
  }
}

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [students, users, programs, assignments, workflows, nocWorkflows, nocApprovals, oralWorkflows, oralAssignments, oralApprovals, submissions, panels, members, oralPanels, oralPanelMembers, oralPanelWorkflows, examinerAssignments] = await Promise.all([
      User.find({ colid, role: /^Student$/i, excluded: { $ne: "Yes" } }).select("name email user phone regno academicyear admissionyear regulation program programcode semester section department").lean(),
      User.find({ colid, role: { $not: /^Student$/i }, excluded: { $ne: "Yes" } }).select("name email user role department designation institution").lean(),
      MPrograms.find({ colid, excluded: { $ne: "Yes" } }).select("year regulation program programcode department faculty institution").lean(),
      PhdAssignment.find({ colid }).select("academicyear regulation program programcode subject topic status regno student guideemail guidename").lean(),
      PhdWorkflow.find({ colid }).select("academicyear regulation program programcode role status approvername approveremail").lean(),
      PhdNocWorkflow.find({ colid }).select("academicyear regulation program programcode role status approvername approveremail").lean(),
      PhdNocApproval.find({ colid }).select("academicyear regulation program programcode subject topic status regno student currentapproveremail currentapprovername").lean(),
      PhdOralDefenseWorkflow.find({ colid }).select("academicyear regulation program programcode role status approvername approveremail").lean(),
      PhdOralDefenseAssignment.find({ colid }).select("academicyear regulation program programcode panelname examinername examineremail status student regno oraldefensedate").lean(),
      PhdOralDefenseApproval.find({ colid }).select("academicyear regulation program programcode subject topic status regno student currentapproveremail currentapprovername oraldefensedate").lean(),
      PhdSubmission.find({ colid }).select("academicyear regulation program programcode subject topic status regno student guideemail guidename").lean(),
      PhdExamPanel.find({ colid }).select("academicyear regulation program programcode panelname status").lean(),
      PhdExamPanelMember.find({ colid }).select("academicyear regulation program programcode panelname examinername examineremail type eligible approvalstatus user useremail").lean(),
      PhdOralDefensePanel.find({ colid }).select("academicyear regulation program programcode panelname status approvalstatus currentapprovername currentapproveremail").lean(),
      PhdOralDefensePanelMember.find({ colid }).select("academicyear regulation program programcode panelname examinername examineremail type eligible approvalstatus user useremail preferenceorder").lean(),
      PhdOralDefensePanelWorkflow.find({ colid }).select("academicyear regulation program programcode role status approvername approveremail").lean(),
      PhdExaminerAssignment.find({ colid }).select("academicyear regulation program programcode panelname examinername examineremail status student regno").lean()
    ]);
    const rows = [...students, ...programs, ...assignments, ...workflows, ...nocWorkflows, ...nocApprovals, ...oralWorkflows, ...oralAssignments, ...oralApprovals, ...submissions, ...panels, ...members, ...oralPanels, ...oralPanelMembers, ...oralPanelWorkflows, ...examinerAssignments];
    res.json({
      success: true,
      institution: await institution(colid),
      students,
      users,
      programs: programs.map((row) => ({ ...row, academicyear: row.year || row.academicyear || "" })),
      options: {
        academicyear: uniqueSorted(rows.flatMap((row) => [row.academicyear, row.year, row.admissionyear])).reverse(),
        regulation: uniqueSorted(rows.map((row) => row.regulation)),
        program: uniqueSorted(rows.map((row) => row.program)),
        programcode: uniqueSorted(rows.map((row) => row.programcode)),
        semester: uniqueSorted(students.map((row) => row.semester)),
        section: uniqueSorted(students.map((row) => row.section)),
        department: uniqueSorted(rows.map((row) => row.department)),
        subject: uniqueSorted(rows.map((row) => row.subject)),
        topic: uniqueSorted(rows.map((row) => row.topic)),
        status: uniqueSorted(["Active", "Inactive", "Submitted", "Approved", "Rejected", ...rows.map((row) => row.status)]),
        role: uniqueSorted(users.map((row) => row.role)),
        guideemail: uniqueSorted(assignments.map((row) => row.guideemail)),
        guidename: uniqueSorted(assignments.map((row) => row.guidename)),
        panelname: uniqueSorted([...panels, ...oralPanels].map((row) => row.panelname)),
        examinername: uniqueSorted([...members, ...oralPanelMembers].map((row) => row.examinername)),
        examineremail: uniqueSorted([...members, ...oralPanelMembers].map((row) => row.examineremail)),
        type: uniqueSorted(["Internal", "External", ...members.map((row) => row.type), ...oralPanelMembers.map((row) => row.type)]),
        eligible: uniqueSorted(["Yes", "No", ...members.map((row) => row.eligible), ...oralPanelMembers.map((row) => row.eligible)]),
        approvalstatus: uniqueSorted(["Draft", "Submitted", "Pending", "Approved", "Rejected", ...members.map((row) => row.approvalstatus), ...oralPanels.map((row) => row.approvalstatus)])
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listExamPanels = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "status"]);
    const data = await PhdExamPanel.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveExamPanel = async (req, res) => {
  try {
    const payload = panelPayload(req.body);
    if (!payload.academicyear || !payload.program || !payload.programcode || !payload.panelname) {
      return res.status(400).json({ success: false, message: "Academic year, program, program code and panel name are required." });
    }
    const data = req.body._id
      ? await PhdExamPanel.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdExamPanel.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkExamPanels = async (req, res) => {
  try {
    const rows = (Array.isArray(req.body.items) ? req.body.items : [])
      .map((item) => panelPayload({ ...item, colid: req.body.colid, name: req.body.name, user: req.body.user }))
      .filter((row) => row.academicyear && row.programcode && row.panelname);
    if (rows.length) await PhdExamPanel.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExamPanels = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdExamPanel.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    await PhdExamPanelMember.deleteMany({ colid: num(req.body.colid), panelid: { $in: ids.map(String) } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listExamPanelMembers = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "examinername", "examineremail", "type", "eligible", "approvalstatus", "user", "useremail"]);
    if (text(req.query.panelid)) query.panelid = text(req.query.panelid);
    const data = await PhdExamPanelMember.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveExamPanelMember = async (req, res) => {
  try {
    const payload = memberPayload(req.body);
    if (!payload.panelid || !payload.examinername || !payload.examineremail) {
      return res.status(400).json({ success: false, message: "Panel, examiner name and examiner email are required." });
    }
    const data = req.body._id
      ? await PhdExamPanelMember.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdExamPanelMember.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkExamPanelMembers = async (req, res) => {
  try {
    const rows = (Array.isArray(req.body.items) ? req.body.items : [])
      .map((item) => memberPayload({ ...item, colid: req.body.colid, name: req.body.name, user: req.body.user }))
      .filter((row) => row.panelid && row.examinername && row.examineremail);
    if (rows.length) await PhdExamPanelMember.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExamPanelMembers = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdExamPanelMember.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listRubrics = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "group", "topic", "status"]);
    const data = await PhdExaminerRubric.find(query).sort({ programcode: 1, group: 1, topic: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRubric = async (req, res) => {
  try {
    const payload = rubricPayload(req.body);
    if (!payload.academicyear || !payload.program || !payload.programcode || !payload.group || !payload.topic) {
      return res.status(400).json({ success: false, message: "Academic year, program, program code, group and topic are required." });
    }
    const data = req.body._id
      ? await PhdExaminerRubric.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdExaminerRubric.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkRubrics = async (req, res) => {
  try {
    const rows = (Array.isArray(req.body.items) ? req.body.items : [])
      .map((item) => rubricPayload({ ...item, colid: req.body.colid, name: req.body.name, user: req.body.user }))
      .filter((row) => row.academicyear && row.programcode && row.group && row.topic);
    if (rows.length) await PhdExaminerRubric.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRubrics = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdExaminerRubric.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveExamPanelMembers = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const colid = num(req.body.colid);
    const members = await PhdExamPanelMember.find({ colid, _id: { $in: ids } });
    let updated = 0;
    const linked = [];
    for (const member of members) {
      const link = await ensureExaminerUser(member, { name: req.body.name, user: req.body.user });
      member.approvalstatus = "Approved";
      member.approvedby = text(req.body.name);
      member.approvedbyemail = text(req.body.user);
      member.approveddate = new Date();
      member.approvalcomments = text(req.body.comments);
      member.user = link.user;
      member.useremail = link.useremail;
      await member.save();
      updated += 1;
      linked.push({ examineremail: member.examineremail, useremail: member.useremail });
    }
    res.json({ success: true, updated, linked });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendExaminerAppointmentEmails = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const includeCredentials = /^yes$/i.test(text(req.body.includeCredentials));
    const emailContent = text(req.body.emailContent);
    const members = await PhdExamPanelMember.find({ colid, _id: { $in: ids }, approvalstatus: /^Approved$/i }).lean();
    const config = await defaultEmailConfig(colid);
    if (!config?.username || !config?.password) return res.status(400).json({ success: false, message: "Default email configuration is missing." });
    const inst = await institution(colid);
    const transporter = createTransporter(config);
    let sent = 0;
    const failed = [];
    for (const member of members) {
      try {
        const to = member.examineremail || member.email;
        if (!to) throw new Error("No examiner email");
        const html = appointmentHtml(member, inst, includeCredentials, emailContent);
        await transporter.sendMail({
          from: config.username,
          to,
          subject: `PhD Examiner Appointment - ${member.panelname || member.programcode || ""}`,
          html,
          text: stripHtml(html)
        });
        sent += 1;
      } catch (error) {
        failed.push({ examineremail: member.examineremail, message: error.message });
      }
    }
    res.json({ success: true, sent, failed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function examinerApprovedSubmissions(query) {
  const submissions = await PhdSubmission.find({ ...query, status: /^Approved$/i }).sort({ approveddate: -1, student: 1 }).lean();
  if (!submissions.length) return [];
  const ids = submissions.map((row) => String(row._id));
  const assignments = await PhdExaminerAssignment.find({ colid: query.colid, submissionid: { $in: ids } }).lean();
  const bySubmission = assignments.reduce((acc, row) => {
    const key = String(row.submissionid);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  return submissions.map((submission) => {
    const examiners = bySubmission[String(submission._id)] || [];
    const approvedCount = examiners.filter((row) => /^Approved$/i.test(row.status)).length;
    const rejectedCount = examiners.filter((row) => /^Rejected$/i.test(row.status)).length;
    return { ...submission, examinerCount: examiners.length, examinerApprovedCount: approvedCount, examinerRejectedCount: rejectedCount, examinerstatus: examiners.length && approvedCount === examiners.length ? "All Approved" : rejectedCount ? "Rejected" : "Pending" };
  }).filter((row) => row.examinerCount > 0 && row.examinerApprovedCount === row.examinerCount);
}

exports.listAssignments = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "guideemail", "status"]);
    const data = await PhdAssignment.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAssignment = async (req, res) => {
  try {
    const payload = assignmentPayload(req.body);
    if (!payload.academicyear || !payload.program || !payload.programcode || !payload.student || !payload.regno || !payload.topic || !payload.subject || !payload.guideemail) {
      return res.status(400).json({ success: false, message: "Academic year, program, student, topic, subject and guide are required." });
    }
    const data = req.body._id
      ? await PhdAssignment.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdAssignment.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkAssignments = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const rows = items.map((item) => assignmentPayload({ ...item, colid: req.body.colid, user: req.body.user, name: req.body.name })).filter((row) => row.regno && row.topic);
    if (rows.length) await PhdAssignment.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAssignments = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdAssignment.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listWorkflows = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "approveremail", "role", "status"]);
    const data = await PhdWorkflow.find(query).sort({ programcode: 1, level: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveWorkflow = async (req, res) => {
  try {
    const payload = workflowPayload(req.body);
    if (!payload.program || !payload.programcode || !payload.level || !payload.approveremail) {
      return res.status(400).json({ success: false, message: "Program, program code, level and approver are required." });
    }
    const data = req.body._id
      ? await PhdWorkflow.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdWorkflow.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteWorkflows = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdWorkflow.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listNocWorkflows = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "role", "approvername", "approveremail", "status"]);
    const data = await PhdNocWorkflow.find(query).sort({ programcode: 1, level: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveNocWorkflow = async (req, res) => {
  try {
    const payload = nocWorkflowPayload(req.body);
    if (!payload.colid || !payload.program || !payload.programcode || !payload.level || !payload.approveremail) {
      return res.status(400).json({ success: false, message: "Program, program code, level and approver are required." });
    }
    const data = req.body._id
      ? await PhdNocWorkflow.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdNocWorkflow.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteNocWorkflows = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdNocWorkflow.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listOralWorkflows = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "role", "approvername", "approveremail", "status"]);
    const data = await PhdOralDefenseWorkflow.find(query).sort({ programcode: 1, level: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveOralWorkflow = async (req, res) => {
  try {
    const payload = oralWorkflowPayload(req.body);
    if (!payload.colid || !payload.program || !payload.programcode || !payload.level || !payload.approveremail) {
      return res.status(400).json({ success: false, message: "Program, program code, level and approver are required." });
    }
    const data = req.body._id
      ? await PhdOralDefenseWorkflow.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdOralDefenseWorkflow.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOralWorkflows = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdOralDefenseWorkflow.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listOralPanelWorkflows = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "role", "approvername", "approveremail", "status"]);
    const data = await PhdOralDefensePanelWorkflow.find(query).sort({ programcode: 1, level: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveOralPanelWorkflow = async (req, res) => {
  try {
    const payload = oralPanelWorkflowPayload(req.body);
    if (!payload.colid || !payload.program || !payload.programcode || !payload.level || !payload.approveremail) {
      return res.status(400).json({ success: false, message: "Program, program code, level and approver are required." });
    }
    const data = req.body._id
      ? await PhdOralDefensePanelWorkflow.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdOralDefensePanelWorkflow.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOralPanelWorkflows = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdOralDefensePanelWorkflow.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listOralDefensePanels = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "approvalstatus", "status", "currentapprovername", "currentapproveremail"]);
    const data = await PhdOralDefensePanel.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveOralDefensePanel = async (req, res) => {
  try {
    const payload = oralPanelPayload(req.body);
    if (!payload.academicyear || !payload.program || !payload.programcode || !payload.panelname) {
      return res.status(400).json({ success: false, message: "Academic year, program, program code and panel name are required." });
    }
    const data = req.body._id
      ? await PhdOralDefensePanel.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdOralDefensePanel.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOralDefensePanels = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdOralDefensePanel.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    await PhdOralDefensePanelMember.deleteMany({ colid: num(req.body.colid), oralpanelid: { $in: ids.map(String) } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitOralDefensePanel = async (req, res) => {
  try {
    const panel = await PhdOralDefensePanel.findOne({ colid: num(req.body.colid), _id: req.body.id });
    if (!panel) return res.status(404).json({ success: false, message: "Oral defense panel not found." });
    const members = await PhdOralDefensePanelMember.countDocuments({ colid: panel.colid, oralpanelid: String(panel._id) });
    if (!members) return res.status(400).json({ success: false, message: "Add at least one oral defense panel member before submission." });
    const data = await submitOralPanelMembers(panel, { name: req.body.name, user: req.body.user, comments: req.body.comments });
    res.json({ success: true, data: data.panel, submitted: data.submitted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listOralDefensePanelMembers = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "examinername", "examineremail", "type", "eligible", "approvalstatus", "user", "useremail"]);
    if (text(req.query.oralpanelid) || text(req.query.panelid)) query.oralpanelid = text(req.query.oralpanelid || req.query.panelid);
    const data = await PhdOralDefensePanelMember.find(query).sort({ preferenceorder: 1, examinername: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addOralDefensePanelMembers = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const oralpanelid = text(req.body.oralpanelid || req.body.panelid);
    const memberids = Array.isArray(req.body.memberids) ? req.body.memberids.map(text).filter(Boolean) : [];
    const preferenceorders = req.body.preferenceorders || {};
    const panel = await PhdOralDefensePanel.findOne({ colid, _id: oralpanelid }).lean();
    const members = await PhdExamPanelMember.find({ colid, _id: { $in: memberids }, approvalstatus: /^Approved$/i, eligible: /^Yes$/i }).lean();
    if (!panel || !members.length) return res.status(400).json({ success: false, message: "Select oral defense panel and approved examiner panel members." });
    let inserted = 0;
    for (const member of members) {
      const payload = oralPanelMemberPayload({
        ...member,
        colid,
        oralpanelid: String(panel._id),
        sourcepanelid: member.panelid,
        sourcememberid: String(member._id),
        academicyear: panel.academicyear,
        regulation: panel.regulation,
        panelname: panel.panelname,
        program: panel.program,
        programcode: panel.programcode,
        preferenceorder: preferenceorders[String(member._id)] ?? req.body.preferenceorder,
        name: req.body.name,
        createdby: req.body.user
      });
      const result = await PhdOralDefensePanelMember.updateOne({ colid, oralpanelid: payload.oralpanelid, sourcememberid: payload.sourcememberid }, { $set: payload }, { upsert: true });
      if (result.upsertedCount) inserted += 1;
    }
    res.json({ success: true, inserted, updated: members.length - inserted, attempted: members.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOralDefensePanelMembers = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdOralDefensePanelMember.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oralDefensePanelApprovalList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const memberQuery = { colid, approvalstatus: /^Submitted$/i };
    applyFilters(memberQuery, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "currentapprovername", "currentapproveremail"]);
    const user = text(req.query.user).toLowerCase();
    if (!/^all$/i.test(text(req.query.role)) && !/^admin$/i.test(text(req.query.role))) memberQuery.currentapproveremail = regex(user);
    const pendingMembers = await PhdOralDefensePanelMember.find(memberQuery).select("oralpanelid").lean();
    const panelIds = [...new Set(pendingMembers.map((row) => row.oralpanelid).filter(Boolean))];
    const panelQuery = { colid, _id: { $in: panelIds } };
    applyFilters(panelQuery, req.query, ["academicyear", "regulation", "program", "programcode", "panelname"]);
    const data = await PhdOralDefensePanel.find(panelQuery).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oralDefensePanelApprovalAction = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.memberids) ? req.body.memberids.map(text).filter(Boolean) : [];
    const preferenceorders = req.body.preferenceorders || {};
    const panel = await PhdOralDefensePanel.findOne({ colid, _id: req.body.id });
    if (!panel) return res.status(404).json({ success: false, message: "Oral defense panel not found." });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one panel member." });
    const comments = text(req.body.comments);
    const members = await PhdOralDefensePanelMember.find({ colid, oralpanelid: String(panel._id), _id: { $in: ids }, approvalstatus: /^Submitted$/i });
    let updated = 0;
    const workflow = await oralPanelWorkflowFor(panel);
    if (/^reject/i.test(text(req.body.action))) {
      for (const member of members) {
        if (preferenceorders[String(member._id)] !== undefined) member.preferenceorder = num(preferenceorders[String(member._id)]);
        member.approvalstatus = "Rejected";
        member.rejecteddate = new Date();
        member.approvalcomments = comments;
        member.history.push({ action: "Rejected", level: member.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
        await member.save();
        updated += 1;
      }
    } else {
      for (const member of members) {
        if (preferenceorders[String(member._id)] !== undefined) member.preferenceorder = num(preferenceorders[String(member._id)]);
        const next = workflow.find((item) => Number(item.level) > Number(member.currentlevel || 0));
        member.history.push({ action: "Approved", level: member.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
        if (next) {
          member.approvalstatus = "Submitted";
          member.currentlevel = next.level;
          member.currentapprovername = next.approvername;
          member.currentapproveremail = next.approveremail;
        } else {
          member.approvalstatus = "Approved";
          member.approveddate = new Date();
          member.currentlevel = 0;
          member.currentapprovername = "";
          member.currentapproveremail = "";
        }
        member.approvalcomments = comments;
        await member.save();
        updated += 1;
      }
    }
    const remainingSubmitted = await PhdOralDefensePanelMember.countDocuments({ colid, oralpanelid: String(panel._id), approvalstatus: /^Submitted$/i });
    const approvedCount = await PhdOralDefensePanelMember.countDocuments({ colid, oralpanelid: String(panel._id), approvalstatus: /^Approved$/i });
    const totalMembers = await PhdOralDefensePanelMember.countDocuments({ colid, oralpanelid: String(panel._id) });
    panel.approvalstatus = remainingSubmitted ? "Submitted" : (approvedCount ? "Approved" : (totalMembers ? "Rejected" : "Draft"));
    panel.currentlevel = remainingSubmitted ? panel.currentlevel : 0;
    panel.currentapprovername = "";
    panel.currentapproveremail = "";
    panel.comments = comments;
    panel.history.push({ action: `${text(req.body.action)} selected members`, level: 0, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
    await panel.save();
    res.json({ success: true, data: panel, updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "File is required." });
    const data = await uploadToAws(num(req.body.colid), req.file);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentContext = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const assignments = await PhdAssignment.find({ colid, regno: regex(regno), status: /^Active$/i }).sort({ createdAt: -1 }).lean();
    const submissions = await PhdSubmission.find({ colid, regno: regex(regno) }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, assignments, submissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitThesis = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const assignment = await PhdAssignment.findOne({ _id: req.body.assignmentid, colid }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Thesis assignment not found." });
    if (!text(req.body.fileurl)) return res.status(400).json({ success: false, message: "Uploaded thesis file link is required." });
    const workflow = await workflowFor(assignment);
    const firstState = firstPendingStatus(workflow);
    const data = await PhdSubmission.create({
      colid,
      assignmentid: String(assignment._id),
      academicyear: assignment.academicyear,
      regulation: assignment.regulation,
      program: assignment.program,
      programcode: assignment.programcode,
      student: assignment.student,
      regno: assignment.regno,
      email: assignment.email,
      topic: assignment.topic,
      subject: assignment.subject,
      guidename: assignment.guidename,
      guideemail: assignment.guideemail,
      fileurl: text(req.body.fileurl),
      filename: text(req.body.filename),
      filekey: text(req.body.filekey),
      studentcomments: text(req.body.studentcomments),
      resubmissioncomments: text(req.body.resubmissioncomments),
      ...firstState,
      history: [{ action: "Submitted", level: firstState.currentlevel || 0, approvername: "", approveremail: "", comments: text(req.body.studentcomments), date: new Date() }],
      name: text(req.body.name),
      user: text(req.body.user)
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvalList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const user = text(req.query.user).toLowerCase();
    const query = { colid };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "status"]);
    if (!/^all$/i.test(text(req.query.role)) && !/^admin$/i.test(text(req.query.role))) {
      query.$or = [{ currentapproveremail: regex(user) }, { guideemail: regex(user) }];
    }
    const data = await PhdSubmission.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.takeAction = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const action = text(req.body.action);
    const comments = text(req.body.comments);
    const submission = await PhdSubmission.findOne({ _id: req.body.id, colid });
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found." });
    if (/^reject/i.test(action)) {
      submission.status = "Rejected";
      submission.rejecteddate = new Date();
      submission.finalcomments = comments;
      submission.history.push({ action: "Rejected", level: submission.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
    } else {
      const workflow = await workflowFor(submission);
      const next = workflow.find((row) => Number(row.level) > Number(submission.currentlevel || 0));
      submission.history.push({ action: "Approved", level: submission.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
      if (next) {
        submission.status = "Submitted";
        submission.currentlevel = next.level;
        submission.currentapprovername = next.approvername;
        submission.currentapproveremail = next.approveremail;
      } else {
        submission.status = "Approved";
        submission.approveddate = new Date();
        submission.finalcomments = comments;
        submission.currentapprovername = "";
        submission.currentapproveremail = "";
      }
    }
    await submission.save();
    res.json({ success: true, data: submission });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.examinerAssignmentContext = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const base = { colid };
    applyFilters(base, req.query, ["academicyear", "regulation", "program", "programcode"]);
    const submissions = await PhdSubmission.find({ ...base, status: /^Approved$/i }).sort({ approveddate: -1, student: 1 }).lean();
    const memberQuery = { ...base, approvalstatus: /^Approved$/i, eligible: /^Yes$/i };
    if (text(req.query.panelid)) memberQuery.panelid = text(req.query.panelid);
    const members = await PhdExamPanelMember.find(memberQuery).sort({ panelname: 1, examinername: 1 }).lean();
    const assignments = await PhdExaminerAssignment.find({ colid }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, submissions, members, assignments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listExaminerAssignments = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "student", "regno", "examinername", "examineremail", "status"]);
    if (text(req.query.panelid)) query.panelid = text(req.query.panelid);
    const data = await PhdExaminerAssignment.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveExaminerAssignments = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const submissionids = Array.isArray(req.body.submissionids) ? req.body.submissionids.map(text).filter(Boolean) : [];
    const memberids = Array.isArray(req.body.memberids) ? req.body.memberids.map(text).filter(Boolean) : [];
    if (!submissionids.length || !memberids.length) return res.status(400).json({ success: false, message: "Select at least one approved thesis and one approved examiner." });
    const [submissions, members] = await Promise.all([
      PhdSubmission.find({ colid, _id: { $in: submissionids }, status: /^Approved$/i }).lean(),
      PhdExamPanelMember.find({ colid, _id: { $in: memberids }, approvalstatus: /^Approved$/i, eligible: /^Yes$/i }).lean()
    ]);
    const rows = [];
    submissions.forEach((submission) => {
      members.forEach((member) => {
        rows.push({
          colid,
          panelid: member.panelid,
          panelname: member.panelname,
          memberid: String(member._id),
          submissionid: String(submission._id),
          assignmentid: submission.assignmentid,
          academicyear: submission.academicyear,
          regulation: submission.regulation,
          program: submission.program,
          programcode: submission.programcode,
          student: submission.student,
          regno: submission.regno,
          topic: submission.topic,
          subject: submission.subject,
          fileurl: submission.fileurl,
          filename: submission.filename,
          guidename: submission.guidename,
          guideemail: submission.guideemail,
          examinername: member.examinername,
          examineremail: member.examineremail,
          examinerdesignation: member.designation,
          examinertype: member.type,
          status: "Pending",
          name: text(req.body.name),
          user: member.user || text(req.body.user),
          useremail: member.useremail || member.user || ""
        });
      });
    });
    let inserted = 0;
    for (const row of rows) {
      const result = await PhdExaminerAssignment.updateOne(
        { colid, submissionid: row.submissionid, memberid: row.memberid },
        { $setOnInsert: row },
        { upsert: true }
      );
      if (result.upsertedCount) inserted += 1;
    }
    res.json({ success: true, inserted, attempted: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExaminerAssignments = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdExaminerAssignment.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.myExaminerAssignments = async (req, res) => {
  try {
    const login = text(req.query.user);
    const query = { colid: num(req.query.colid), $or: [{ examineremail: regex(login) }, { useremail: regex(login) }, { user: regex(login) }] };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "student", "regno", "status"]);
    const data = await PhdExaminerAssignment.find(query).sort({ assigneddate: -1, student: 1 }).lean();
    const missing = data.filter((row) => !row.fileurl).map((row) => row.submissionid).filter(Boolean);
    if (missing.length) {
      const submissions = await PhdSubmission.find({ colid: num(req.query.colid), _id: { $in: missing } }).select("fileurl filename").lean();
      const byId = Object.fromEntries(submissions.map((row) => [String(row._id), row]));
      data.forEach((row) => {
        if (!row.fileurl && byId[String(row.submissionid)]) {
          row.fileurl = byId[String(row.submissionid)].fileurl;
          row.filename = byId[String(row.submissionid)].filename;
        }
      });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rubricsForExaminerAssignment = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const assignment = await PhdExaminerAssignment.findOne({ colid, _id: req.query.assignmentid }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Examiner assignment not found." });
    const rubrics = await PhdExaminerRubric.find({
      colid,
      academicyear: regex(assignment.academicyear),
      programcode: regex(assignment.programcode),
      status: /^Active$/i,
      $or: [{ regulation: "" }, { regulation: { $exists: false } }, { regulation: regex(assignment.regulation) }]
    }).sort({ group: 1, topic: 1 }).lean();
    const saved = await PhdExaminerAssessment.find({ colid, assignmentreviewid: String(assignment._id) }).lean();
    const savedByRubric = Object.fromEntries(saved.map((row) => [String(row.rubricid), row]));
    const data = rubrics.map((rubric) => {
      const existing = savedByRubric[String(rubric._id)] || {};
      return { ...rubric, value: existing.value || "Yes", comments: existing.comments || "" };
    });
    res.json({ success: true, assignment, rubrics: data, assessments: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveExaminerAssessment = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const assignment = await PhdExaminerAssignment.findOne({ colid, _id: req.body.assignmentid }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Examiner assignment not found." });
    const rows = Array.isArray(req.body.items) ? req.body.items : [];
    let saved = 0;
    for (const item of rows) {
      const rubricid = text(item.rubricid || item._id);
      const payload = {
        colid,
        assignmentreviewid: String(assignment._id),
        submissionid: assignment.submissionid,
        rubricid,
        academicyear: assignment.academicyear,
        regulation: assignment.regulation,
        program: assignment.program,
        programcode: assignment.programcode,
        student: assignment.student,
        regno: assignment.regno,
        examinername: assignment.examinername,
        examineremail: assignment.examineremail,
        group: text(item.group),
        topic: text(item.topic),
        value: text(item.value) || "Yes",
        comments: text(item.comments),
        submitteddate: new Date(),
        name: text(req.body.name),
        user: text(req.body.user)
      };
      await PhdExaminerAssessment.updateOne({ colid, assignmentreviewid: payload.assignmentreviewid, rubricid }, { $set: payload }, { upsert: true });
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reviewPrintable = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const submissionid = text(req.query.submissionid);
    const query = { colid };
    if (submissionid) query.submissionid = submissionid;
    else applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno"]);
    const assignments = await PhdExaminerAssignment.find(query).sort({ examinername: 1 }).lean();
    const assessments = await PhdExaminerAssessment.find({ colid, submissionid: { $in: assignments.map((row) => row.submissionid) } }).sort({ examinername: 1, group: 1, topic: 1 }).lean();
    res.json({ success: true, assignments, assessments, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.examinerReviewAction = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const action = /^reject/i.test(text(req.body.action)) ? "Rejected" : "Approved";
    const row = await PhdExaminerAssignment.findOne({ _id: req.body.id, colid });
    if (!row) return res.status(404).json({ success: false, message: "Examiner assignment not found." });
    row.status = action;
    row.remarks = text(req.body.remarks);
    row.revieweddate = new Date();
    await row.save();
    if (action === "Rejected") {
      await PhdSubmission.updateOne(
        { _id: row.submissionid, colid },
        {
          $set: { status: "Rejected", rejecteddate: new Date(), finalcomments: `Examiner ${row.examinername}: ${row.remarks}` },
          $push: { history: { action: "Rejected by examiner", level: 0, approvername: row.examinername, approveremail: row.examineremail, comments: row.remarks, date: new Date() } }
        }
      );
    } else {
      const submission = await PhdSubmission.findOne({ _id: row.submissionid, colid }).lean();
      if (submission && /^Approved$/i.test(submission.status)) {
        const assignments = await PhdExaminerAssignment.find({ colid, submissionid: String(row.submissionid) }).lean();
        if (assignments.length && assignments.every((item) => /^Approved$/i.test(item.status))) {
          await ensureNocApproval(submission, { name: req.body.name, user: req.body.user });
        }
      }
    }
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.nocApprovalList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const examinerReady = await examinerApprovedSubmissions({ colid, status: /^Approved$/i });
    await syncNocApprovalsForSubmissions(examinerReady, { name: req.query.name, user: req.query.user });
    const query = { colid };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "status", "currentapprovername", "currentapproveremail"]);
    const user = text(req.query.user).toLowerCase();
    if (!/^all$/i.test(text(req.query.role)) && !/^admin$/i.test(text(req.query.role))) {
      query.currentapproveremail = regex(user);
    }
    const data = await PhdNocApproval.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.nocApprovalDetails = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const id = text(req.query.id);
    const row = await PhdNocApproval.findOne({ _id: id, colid }).lean();
    if (!row) return res.status(404).json({ success: false, message: "NoC approval record not found." });
    const submission = await PhdSubmission.findOne({ _id: row.submissionid, colid }).lean();
    const assignments = await PhdExaminerAssignment.find({ colid, submissionid: row.submissionid }).sort({ examinername: 1 }).lean();
    const assessments = await PhdExaminerAssessment.find({ colid, submissionid: row.submissionid }).sort({ group: 1, topic: 1, examinername: 1 }).lean();
    res.json({ success: true, data: row, submission, assignments, assessments, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.nocApprovalAction = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const action = text(req.body.action);
    const comments = text(req.body.comments);
    const row = await PhdNocApproval.findOne({ _id: req.body.id, colid });
    if (!row) return res.status(404).json({ success: false, message: "NoC approval record not found." });
    if (/^reject/i.test(action)) {
      row.status = "Rejected";
      row.rejecteddate = new Date();
      row.finalcomments = comments;
      row.history.push({ action: "Rejected", level: row.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
    } else {
      const workflow = await nocWorkflowFor(row);
      const next = workflow.find((item) => Number(item.level) > Number(row.currentlevel || 0));
      row.history.push({ action: "Approved", level: row.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
      if (next) {
        row.status = "Submitted";
        row.currentlevel = next.level;
        row.currentapprovername = next.approvername;
        row.currentapproveremail = next.approveremail;
      } else {
        row.status = "Approved";
        row.approveddate = new Date();
        row.currentlevel = 0;
        row.currentapprovername = "";
        row.currentapproveremail = "";
        row.finalcomments = comments;
      }
    }
    await row.save();
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.finalExaminerApproved = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "guideemail"]);
    const data = await examinerApprovedSubmissions(query);
    await syncNocApprovalsForSubmissions(data, { name: req.query.name, user: req.query.user });
    res.json({ success: true, data, institution: await institution(query.colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvedForNoc = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid), status: /^Approved$/i };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "guideemail"]);
    const examinerReady = await examinerApprovedSubmissions(query);
    await syncNocApprovalsForSubmissions(examinerReady, { name: req.query.name, user: req.query.user });
    const ids = examinerReady.map((row) => String(row._id));
    const approved = await PhdNocApproval.find({ colid: query.colid, submissionid: { $in: ids }, status: /^Approved$/i }).lean();
    const approvedIds = new Set(approved.map((row) => String(row.submissionid)));
    const approvalBySubmission = approved.reduce((acc, row) => ({ ...acc, [String(row.submissionid)]: row }), {});
    const data = examinerReady.filter((row) => approvedIds.has(String(row._id))).map((row) => ({ ...row, nocapproval: approvalBySubmission[String(row._id)] }));
    res.json({ success: true, data, institution: await institution(query.colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentNocList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid, status: /^Approved$/i };
    if (text(req.query.regno)) query.regno = regex(req.query.regno);
    if (text(req.query.user)) query.$or = [{ email: regex(req.query.user) }, { user: regex(req.query.user) }];
    const data = await PhdNocApproval.find(query).sort({ approveddate: -1 }).lean();
    res.json({ success: true, data, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oralDefenseContext = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const base = { colid };
    applyFilters(base, req.query, ["academicyear", "regulation", "program", "programcode", "panelname"]);
    const panels = await PhdOralDefensePanel.find({ ...base, status: /^Active$/i, approvalstatus: /^Approved$/i }).sort({ academicyear: -1, programcode: 1, panelname: 1 }).lean();
    const panelIds = panels.map((row) => String(row._id));
    const selectedPanelIds = text(req.query.panelid) ? [text(req.query.panelid)] : panelIds;
    const members = await PhdOralDefensePanelMember.find({ colid, oralpanelid: { $in: selectedPanelIds }, approvalstatus: /^Approved$/i, eligible: /^Yes$/i }).sort({ preferenceorder: 1, examinername: 1 }).lean();
    const existing = await PhdOralDefenseAssignment.find({ colid }).select("submissionid status").lean();
    const completed = new Set(existing.filter((row) => /^Approved$/i.test(row.status)).map((row) => String(row.submissionid)));
    const assigned = new Set(existing.map((row) => String(row.submissionid)));
    const query = { colid, status: /^Approved$/i };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic"]);
    const students = (await PhdNocApproval.find(query).sort({ student: 1 }).lean())
      .filter((row) => !completed.has(String(row.submissionid)))
      .map((row) => ({ ...row, oralassigned: assigned.has(String(row.submissionid)) ? "Yes" : "No" }));
    res.json({ success: true, panels, members, students, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveOralDefenseAssignments = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const panelid = text(req.body.panelid);
    const memberid = text(req.body.memberid);
    const ids = Array.isArray(req.body.nocapprovalids) ? req.body.nocapprovalids.map(text).filter(Boolean) : [];
    const [panel, member, students] = await Promise.all([
      PhdOralDefensePanel.findOne({ colid, _id: panelid, approvalstatus: /^Approved$/i }).lean(),
      PhdOralDefensePanelMember.findOne({ colid, _id: memberid, approvalstatus: /^Approved$/i }).lean(),
      PhdNocApproval.find({ colid, _id: { $in: ids }, status: /^Approved$/i }).lean()
    ]);
    if (!panel || !member || !students.length) return res.status(400).json({ success: false, message: "Panel, approved examiner and final NoC approved student are required." });
    let inserted = 0;
    for (const student of students) {
      const payload = {
        colid,
        panelid: String(panel._id),
        panelname: panel.panelname,
        memberid: String(member._id),
        nocapprovalid: String(student._id),
        submissionid: String(student.submissionid),
        academicyear: student.academicyear,
        regulation: student.regulation,
        program: student.program,
        programcode: student.programcode,
        student: student.student,
        regno: student.regno,
        topic: student.topic,
        subject: student.subject,
        guidename: student.guidename,
        guideemail: student.guideemail,
        examinername: member.examinername,
        examineremail: member.examineremail,
        examinerdesignation: member.designation,
        examinertype: member.type,
        targetdate: text(req.body.targetdate),
        oraldefensedate: text(req.body.oraldefensedate),
        status: "Assigned",
        name: text(req.body.name),
        user: text(req.body.user),
        useremail: member.useremail || member.user || ""
      };
      const result = await PhdOralDefenseAssignment.updateOne({ colid, submissionid: payload.submissionid, memberid: payload.memberid }, { $setOnInsert: payload }, { upsert: true });
      if (result.upsertedCount) inserted += 1;
    }
    res.json({ success: true, inserted, attempted: students.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listOralDefenseAssignments = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "student", "regno", "examinername", "examineremail", "status"]);
    const data = await PhdOralDefenseAssignment.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data, institution: await institution(query.colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOralDefenseSchedule = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [];
    const update = {};
    if (text(req.body.oraldefensedate)) update.oraldefensedate = text(req.body.oraldefensedate);
    if (text(req.body.targetdate)) update.targetdate = text(req.body.targetdate);
    if (text(req.body.status)) update.status = text(req.body.status);
    const result = await PhdOralDefenseAssignment.updateMany({ colid: num(req.body.colid), _id: { $in: ids } }, { $set: update });
    res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.myOralDefenseAssignments = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const user = text(req.query.user).toLowerCase();
    const query = { colid, $or: [{ examineremail: regex(user) }, { useremail: regex(user) }, { user: regex(user) }] };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "student", "regno", "status"]);
    const data = await PhdOralDefenseAssignment.find(query).sort({ targetdate: 1, student: 1 }).lean();
    res.json({ success: true, data, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oralDefenseExaminerAction = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const action = /^reject/i.test(text(req.body.action)) ? "Rejected" : "Approved";
    const row = await PhdOralDefenseAssignment.findOne({ colid, _id: req.body.id });
    if (!row) return res.status(404).json({ success: false, message: "Oral defense assignment not found." });
    const attendees = Array.isArray(req.body.attendees)
      ? req.body.attendees.map((item) => ({
        name: text(item.name),
        email: text(item.email || item.user),
        department: text(item.department),
        designation: text(item.designation),
        institution: text(item.institution)
      })).filter((item) => item.name || item.email)
      : [];
    row.status = action;
    row.comments = text(req.body.comments);
    row.attendees = attendees;
    row.revieweddate = new Date();
    await row.save();
    if (action === "Approved") await maybeCreateOralDefenseApproval(row, { name: req.body.name, user: req.body.user });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oralDefenseCandidateReport = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const assignmentQuery = { colid };
    if (text(req.query.oralassignmentid)) assignmentQuery._id = req.query.oralassignmentid;
    else if (text(req.query.submissionid)) assignmentQuery.submissionid = text(req.query.submissionid);
    else {
      applyFilters(assignmentQuery, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "student", "regno"]);
    }
    const oralAssignment = await PhdOralDefenseAssignment.findOne(assignmentQuery).sort({ updatedAt: -1 }).lean();
    if (!oralAssignment) return res.status(404).json({ success: false, message: "Oral defense assignment not found." });
    const submissionid = String(oralAssignment.submissionid);
    const [submission, thesisAssignments, thesisAssessments, nocApproval, oralAssignments, oralApproval] = await Promise.all([
      PhdSubmission.findOne({ colid, _id: submissionid }).lean(),
      PhdExaminerAssignment.find({ colid, submissionid }).sort({ examinername: 1 }).lean(),
      PhdExaminerAssessment.find({ colid, submissionid }).sort({ group: 1, topic: 1, examinername: 1 }).lean(),
      PhdNocApproval.findOne({ colid, submissionid }).lean(),
      PhdOralDefenseAssignment.find({ colid, submissionid }).sort({ oraldefensedate: 1, examinername: 1 }).lean(),
      PhdOralDefenseApproval.findOne({ colid, submissionid }).lean()
    ]);
    res.json({
      success: true,
      assignment: oralAssignment,
      submission,
      thesisAssignments,
      thesisAssessments,
      nocApproval,
      oralAssignments,
      oralApproval,
      institution: await institution(colid)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oralDefenseApprovalList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "status", "currentapprovername", "currentapproveremail"]);
    const user = text(req.query.user).toLowerCase();
    if (!/^all$/i.test(text(req.query.role)) && !/^admin$/i.test(text(req.query.role))) query.currentapproveremail = regex(user);
    const data = await PhdOralDefenseApproval.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oralDefenseApprovalDetails = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const row = await PhdOralDefenseApproval.findOne({ colid, _id: req.query.id }).lean();
    if (!row) return res.status(404).json({ success: false, message: "Oral defense approval not found." });
    const [noc, submission, oralAssignments, thesisAssignments, thesisAssessments] = await Promise.all([
      PhdNocApproval.findOne({ colid, _id: row.nocapprovalid }).lean(),
      PhdSubmission.findOne({ colid, _id: row.submissionid }).lean(),
      PhdOralDefenseAssignment.find({ colid, submissionid: row.submissionid }).sort({ examinername: 1 }).lean(),
      PhdExaminerAssignment.find({ colid, submissionid: row.submissionid }).sort({ examinername: 1 }).lean(),
      PhdExaminerAssessment.find({ colid, submissionid: row.submissionid }).sort({ group: 1, topic: 1, examinername: 1 }).lean()
    ]);
    res.json({ success: true, data: row, noc, submission, oralAssignments, thesisAssignments, thesisAssessments, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oralDefenseApprovalAction = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const action = text(req.body.action);
    const comments = text(req.body.comments);
    const row = await PhdOralDefenseApproval.findOne({ colid, _id: req.body.id });
    if (!row) return res.status(404).json({ success: false, message: "Oral defense approval not found." });
    if (/^reject/i.test(action)) {
      row.status = "Rejected";
      row.rejecteddate = new Date();
      row.finalcomments = comments;
      row.history.push({ action: "Rejected", level: row.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
    } else {
      const workflow = await oralWorkflowFor(row);
      const next = workflow.find((item) => Number(item.level) > Number(row.currentlevel || 0));
      row.history.push({ action: "Approved", level: row.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
      if (next) {
        row.status = "Submitted";
        row.currentlevel = next.level;
        row.currentapprovername = next.approvername;
        row.currentapproveremail = next.approveremail;
      } else {
        row.status = "Approved";
        row.approveddate = new Date();
        row.currentlevel = 0;
        row.currentapprovername = "";
        row.currentapproveremail = "";
        row.finalcomments = comments;
      }
    }
    await row.save();
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.phdAwardApprovedList = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid), status: /^Approved$/i };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic"]);
    const data = await PhdOralDefenseApproval.find(query).sort({ approveddate: -1, student: 1 }).lean();
    res.json({ success: true, data, institution: await institution(query.colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
