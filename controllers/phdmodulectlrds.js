const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const nodemailer = require("nodemailer");
const PhdAssignment = require("../Models/phdthesisassignmentds");
const PhdAssignmentWorkflow = require("../Models/phdthesisassignmentworkflowds");
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
const PhdExamPanelWorkflow = require("../Models/phdexampanelworkflowds");
const PhdExaminerAssignment = require("../Models/phdexaminerassignmentds");
const PhdExaminerRubric = require("../Models/phdexaminerrubricds");
const PhdExaminerAssessment = require("../Models/phdexaminerassessmentds");
const PhdProgressReport = require("../Models/phdprogressreportds");
const PhdGuideMessage = require("../Models/phdguidemessageds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const Institution = require("../Models/insdetails");
const Awsconfig = require("../Models/awsconfig");
const EmailConfiguration = require("../Models/emailconfigurationds");
const { createApprovalTasks, completeApprovalTasks } = require("../utils/approvalTaskHelper");

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

function parseDocuments(value) {
  const raw = Array.isArray(value) ? value : (() => {
    try {
      const parsed = JSON.parse(text(value) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  return raw
    .map((row) => ({
      documentname: text(row.documentname || row.name || row.documenttype),
      documenttype: text(row.documenttype || row.type || row.documentname),
      component: text(row.component),
      chapter: num(row.chapter),
      url: text(row.url || row.fileurl || row.link),
      filename: text(row.filename),
      key: text(row.key || row.filekey),
      uploadedat: row.uploadedat ? new Date(row.uploadedat) : new Date()
    }))
    .filter((row) => row.documentname && row.url);
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
    requestsource: text(body.requestsource) || "Admin",
    assignmentapprovalstatus: text(body.assignmentapprovalstatus) || "Approved",
    currentlevel: num(body.currentlevel),
    currentapprovername: text(body.currentapprovername),
    currentapproveremail: text(body.currentapproveremail),
    approvalcomments: text(body.approvalcomments),
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

function examPanelWorkflowPayload(body = {}) {
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
    approvalstatus: text(body.approvalstatus) || "Draft",
    currentlevel: num(body.currentlevel),
    currentapprovername: text(body.currentapprovername),
    currentapproveremail: text(body.currentapproveremail),
    comments: text(body.comments),
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

async function assignmentWorkflowFor(assignment) {
  return PhdAssignmentWorkflow.find({
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

async function examPanelWorkflowFor(row) {
  return PhdExamPanelWorkflow.find({
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

async function submitExamPanelMembers(panel, actor = {}) {
  const workflow = await examPanelWorkflowFor(panel);
  const first = workflow[0];
  const members = await PhdExamPanelMember.find({ colid: panel.colid, panelid: String(panel._id), approvalstatus: { $in: ["Pending", "Rejected"] } });
  for (const member of members) {
    member.approvalstatus = first ? "Submitted" : "Submitted";
    member.currentlevel = first ? first.level : 0;
    member.currentapprovername = first ? first.approvername : "";
    member.currentapproveremail = first ? first.approveremail : "";
    member.approveddate = undefined;
    member.rejecteddate = undefined;
    member.approvalcomments = text(actor.comments);
    member.history.push({
      action: first ? "Submitted for examiner panel member approval" : "Submitted for final examiner panel approval",
      level: first ? first.level : 0,
      approvername: text(actor.name),
      approveremail: text(actor.user),
      comments: text(actor.comments),
      date: new Date()
    });
    await member.save();
    if (first) {
      await createPhdApprovalTask(member, first, {
        category: "PhD examiner panel approval",
        pagelink: "/phd-exam-panel-approval",
        referenceModel: "phdexampanelmemberds",
        title: `Approve examiner panel member: ${member.examinername || member.membername || member.examineremail}`,
        comments: `Examiner panel ${panel.panelname} is pending level ${first.level} approval.`
      });
    }
  }
  panel.approvalstatus = "Submitted";
  panel.currentlevel = first ? first.level : 0;
  panel.currentapprovername = first ? first.approvername : "";
  panel.currentapproveremail = first ? first.approveremail : "";
  panel.comments = text(actor.comments);
  panel.history.push({
    action: first ? "Members submitted for examiner panel approval" : "Members submitted for final examiner panel approval",
    level: first ? first.level : 0,
    approvername: text(actor.name),
    approveremail: text(actor.user),
    comments: text(actor.comments),
    date: new Date()
  });
  await panel.save();
  return { panel, submitted: members.length };
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
    if (first) {
      await createPhdApprovalTask(member, first, {
        category: "PhD oral defense panel approval",
        pagelink: "/phd-oral-defense-panel-approval",
        referenceModel: "phdoraldefensepanelmemberds",
        title: `Approve oral defense panel member: ${member.examinername || member.examineremail}`,
        comments: `Oral defense panel ${panel.panelname} is pending level ${first.level} approval.`
      });
    }
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

const thesisComponentRequired = ["Title", "Prelim pages", "Content", "Abstract", "Recommendation", "Annexure", "Plagiarism report"];

function normalComponent(value = "") {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function missingThesisComponents(docs = []) {
  const names = new Set(docs.map((doc) => normalComponent(doc.component || doc.documentname || doc.documenttype)));
  const missing = thesisComponentRequired.filter((name) => !names.has(normalComponent(name)));
  for (let chapter = 1; chapter <= 6; chapter += 1) {
    const hasChapter = docs.some((doc) => Number(doc.chapter) === chapter || normalComponent(doc.component || doc.documentname).includes(`chapter ${chapter}`));
    if (!hasChapter) missing.push(`Chapter ${chapter}`);
  }
  return missing;
}

async function assignmentWorkflowState(assignment) {
  const workflow = await assignmentWorkflowFor(assignment);
  const first = workflow[0];
  return first
    ? { assignmentapprovalstatus: "Submitted", status: "Pending", currentlevel: first.level, currentapprovername: first.approvername, currentapproveremail: first.approveremail }
    : { assignmentapprovalstatus: "Approved", status: "Active", currentlevel: 0, currentapprovername: "", currentapproveremail: "", approveddate: new Date(), approvalcomments: "Approved automatically because no workflow was configured." };
}

function assignmentHistory(action, row = {}, actor = {}, comments = "") {
  return {
    action,
    level: num(row.currentlevel),
    approvername: text(actor.name),
    approveremail: text(actor.user),
    comments: text(comments),
    date: new Date()
  };
}

async function createPhdApprovalTask(row = {}, approver = {}, config = {}) {
  if (!row?.colid || !approver?.approveremail) return [];
  return createApprovalTasks({
    colid: row.colid,
    user: row.user,
    createdby: row.name || row.student || "PhD workflow",
    academicyear: row.academicyear,
    approvername: approver.approvername,
    approveremail: approver.approveremail,
    approverrole: approver.role || approver.approverrole,
    title: config.title || `Approve PhD record for ${row.student || row.panelname || row.regno || ""}`,
    category: config.category || "PhD approval",
    pagelink: config.pagelink || "/phd-thesis-approval",
    comments: config.comments || "PhD workflow item pending approval.",
    referenceModel: config.referenceModel,
    referenceId: row._id,
    level: approver.level || row.currentlevel,
    days: config.days || 7
  });
}

async function completePhdApprovalTask(row = {}, actor = {}, config = {}) {
  return completeApprovalTasks({
    colid: row.colid,
    approveremail: text(actor.user || actor.approveremail),
    category: config.category || "PhD approval",
    referenceModel: config.referenceModel,
    referenceId: row._id,
    level: row.currentlevel,
    comments: config.comments || `Completed by ${text(actor.name || actor.user)}`
  });
}

async function ensureNocApproval(submission, seedUser = {}) {
  const existing = await PhdNocApproval.findOne({ colid: submission.colid, submissionid: String(submission._id) });
  if (existing) return existing;
  const workflow = await nocWorkflowFor(submission);
  const firstState = firstPendingStatus(workflow);
  const row = await PhdNocApproval.create({
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
    documents: submission.documents || [],
    ...firstState,
    history: [{ action: "Submitted for final NoC approval", level: firstState.currentlevel || 0, approvername: "", approveremail: "", comments: "Created after all examiner approvals.", date: new Date() }],
    name: text(seedUser.name),
    user: text(seedUser.user)
  });
  if (row.status === "Submitted") {
    await createPhdApprovalTask(row, {
      level: row.currentlevel,
      approvername: row.currentapprovername,
      approveremail: row.currentapproveremail
    }, {
      category: "PhD NoC approval",
      pagelink: "/phd-noc-final-approval",
      referenceModel: "phdnocapprovalds",
      title: `Approve PhD NoC for ${row.student || row.regno}`,
      comments: `Final NoC approval is pending at level ${row.currentlevel}.`
    });
  }
  return row;
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
  const row = await PhdOralDefenseApproval.create({
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
    fileurl: source.fileurl,
    filename: source.filename,
    documents: source.documents || [],
    oraldefensedate: source.oraldefensedate,
    recommended: "No",
    ...firstState,
    history: [{ action: "Submitted for oral defense approval", level: firstState.currentlevel || 0, approvername: "", approveremail: "", comments: "Created after oral defense examiner approval.", date: new Date() }],
    name: text(seedUser.name),
    user: text(seedUser.user)
  });
  if (row.status === "Submitted") {
    await createPhdApprovalTask(row, {
      level: row.currentlevel,
      approvername: row.currentapprovername,
      approveremail: row.currentapproveremail
    }, {
      category: "PhD oral defense approval",
      pagelink: "/phd-oral-defense-approval",
      referenceModel: "phdoraldefenseapprovalds",
      title: `Approve oral defense for ${row.student || row.regno}`,
      comments: `Oral defense approval is pending at level ${row.currentlevel}.`
    });
  }
  return row;
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
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "approvalstatus", "status"]);
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

exports.listExamPanelWorkflows = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "role", "approvername", "approveremail", "status"]);
    const data = await PhdExamPanelWorkflow.find(query).sort({ programcode: 1, level: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveExamPanelWorkflow = async (req, res) => {
  try {
    const payload = examPanelWorkflowPayload(req.body);
    if (!payload.colid || !payload.program || !payload.programcode || !payload.level || !payload.approveremail) {
      return res.status(400).json({ success: false, message: "Program, program code, level and approver are required." });
    }
    const data = req.body._id
      ? await PhdExamPanelWorkflow.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdExamPanelWorkflow.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExamPanelWorkflows = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdExamPanelWorkflow.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitExamPanelForApproval = async (req, res) => {
  try {
    const panel = await PhdExamPanel.findOne({ colid: num(req.body.colid), _id: req.body.id });
    if (!panel) return res.status(404).json({ success: false, message: "Examiner panel not found." });
    const members = await PhdExamPanelMember.countDocuments({ colid: panel.colid, panelid: String(panel._id) });
    if (!members) return res.status(400).json({ success: false, message: "Add at least one examiner panel member before submission." });
    const data = await submitExamPanelMembers(panel, { name: req.body.name, user: req.body.user, comments: req.body.comments });
    res.json({ success: true, data: data.panel, submitted: data.submitted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.examPanelApprovalList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const finalOnly = /^yes$/i.test(text(req.query.finalOnly));
    const user = text(req.query.user).toLowerCase();
    const memberQuery = { colid, approvalstatus: /^Submitted$/i };
    applyFilters(memberQuery, req.query, ["academicyear", "regulation", "program", "programcode", "panelname", "examinername", "examineremail", "type", "eligible", "currentapprovername", "currentapproveremail"]);
    if (user) memberQuery.currentapproveremail = regex(user);
    const candidates = await PhdExamPanelMember.find(memberQuery).sort({ panelname: 1, examinername: 1 }).lean();
    const filtered = [];
    for (const member of candidates) {
      const workflow = await examPanelWorkflowFor(member);
      const maxLevel = workflow.reduce((max, row) => Math.max(max, Number(row.level || 0)), 0);
      const current = Number(member.currentlevel || 0);
      if (finalOnly && maxLevel && current >= maxLevel) filtered.push(member);
      else if (!finalOnly && maxLevel && current < maxLevel) filtered.push(member);
    }
    const panelIds = [...new Set(filtered.map((row) => row.panelid).filter(Boolean))];
    const panels = panelIds.length ? await PhdExamPanel.find({ colid, _id: { $in: panelIds } }).sort({ updatedAt: -1 }).lean() : [];
    res.json({ success: true, data: filtered, panels });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.examPanelApprovalAction = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const comments = text(req.body.comments);
    const action = text(req.body.action);
    const actorEmail = text(req.body.user);
    const members = await PhdExamPanelMember.find({ colid, _id: { $in: ids }, approvalstatus: /^Submitted$/i });
    let updated = 0;
    const linked = [];
    for (const member of members) {
      if (member.currentapproveremail && !exactRegex(actorEmail).test(member.currentapproveremail)) continue;
      const previousLevel = member.currentlevel;
      await completePhdApprovalTask(member, { user: actorEmail, name: req.body.name }, {
        category: "PhD examiner panel approval",
        referenceModel: "phdexampanelmemberds",
        comments: `Examiner panel member ${action} by ${text(req.body.name || actorEmail)}`
      });
      if (/^reject/i.test(action)) {
        member.approvalstatus = "Rejected";
        member.rejecteddate = new Date();
        member.approvalcomments = comments;
        member.history.push({ action: "Rejected", level: member.currentlevel, approvername: text(req.body.name), approveremail: actorEmail, comments, date: new Date() });
      } else {
        const workflow = await examPanelWorkflowFor(member);
        const next = workflow.find((row) => Number(row.level) > Number(member.currentlevel || 0));
        member.history.push({ action: "Approved", level: member.currentlevel, approvername: text(req.body.name), approveremail: actorEmail, comments, date: new Date() });
        if (next) {
          member.approvalstatus = "Submitted";
          member.currentlevel = next.level;
          member.currentapprovername = next.approvername;
          member.currentapproveremail = next.approveremail;
          member.approvalcomments = comments;
          await createPhdApprovalTask(member, next, {
            category: "PhD examiner panel approval",
            pagelink: "/phd-exam-panel-approval",
            referenceModel: "phdexampanelmemberds",
            title: `Approve examiner panel member: ${member.examinername || member.examineremail}`,
            comments: `Examiner panel member moved from level ${previousLevel} to level ${next.level}.`
          });
        } else {
          const link = await ensureExaminerUser(member, { name: req.body.name, user: actorEmail });
          member.approvalstatus = "Approved";
          member.currentlevel = 0;
          member.currentapprovername = "";
          member.currentapproveremail = "";
          member.approvedby = text(req.body.name);
          member.approvedbyemail = actorEmail;
          member.approveddate = new Date();
          member.approvalcomments = comments;
          member.user = link.user;
          member.useremail = link.useremail;
          linked.push({ examineremail: member.examineremail, useremail: member.useremail });
        }
      }
      await member.save();
      updated += 1;
    }
    const panelIds = [...new Set(members.map((row) => row.panelid).filter(Boolean))];
    for (const panelid of panelIds) {
      const panel = await PhdExamPanel.findOne({ colid, _id: panelid });
      if (!panel) continue;
      const remainingSubmitted = await PhdExamPanelMember.countDocuments({ colid, panelid, approvalstatus: /^Submitted$/i });
      const approvedCount = await PhdExamPanelMember.countDocuments({ colid, panelid, approvalstatus: /^Approved$/i });
      const rejectedCount = await PhdExamPanelMember.countDocuments({ colid, panelid, approvalstatus: /^Rejected$/i });
      panel.approvalstatus = remainingSubmitted ? "Submitted" : (approvedCount ? "Approved" : (rejectedCount ? "Rejected" : "Draft"));
      panel.currentlevel = 0;
      panel.currentapprovername = "";
      panel.currentapproveremail = "";
      panel.comments = comments;
      if (!remainingSubmitted && approvedCount) panel.approveddate = new Date();
      if (!remainingSubmitted && !approvedCount && rejectedCount) panel.rejecteddate = new Date();
      panel.history.push({ action: `${action} selected examiner panel members`, level: 0, approvername: text(req.body.name), approveremail: actorEmail, comments, date: new Date() });
      await panel.save();
    }
    res.json({ success: true, updated, linked });
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
    const payload = { ...assignmentPayload(req.body), requestsource: text(req.body.requestsource) || "Admin", assignmentapprovalstatus: text(req.body.assignmentapprovalstatus) || "Approved" };
    if (!req.body._id && payload.requestsource === "Admin") {
      payload.assignmentapprovalstatus = "Approved";
      payload.status = payload.status || "Active";
      payload.currentlevel = 0;
      payload.currentapprovername = "";
      payload.currentapproveremail = "";
      payload.approveddate = new Date();
    }
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

exports.studentApplyAssignment = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const login = text(req.body.user || req.body.email);
    const student = await User.findOne({
      colid,
      role: /^Student$/i,
      $or: [{ email: regex(login) }, { user: regex(login) }, { regno: regex(req.body.regno || "") }]
    }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student profile not found for thesis assignment application." });
    const guide = await User.findOne({ colid, role: { $not: /^Student$/i }, $or: [{ email: regex(req.body.guideemail) }, { user: regex(req.body.guideemail) }] }).lean();
    const payload = assignmentPayload({
      ...req.body,
      colid,
      academicyear: req.body.academicyear || student.academicyear || student.admissionyear,
      regulation: req.body.regulation || student.regulation,
      program: req.body.program || student.program,
      programcode: req.body.programcode || student.programcode,
      student: student.name,
      regno: student.regno,
      email: student.email || student.user,
      phone: student.phone,
      guidename: guide?.name || req.body.guidename,
      guideemail: guide?.email || guide?.user || req.body.guideemail,
      requestsource: "Student",
      assignmentapprovalstatus: "Submitted",
      status: "Pending",
      name: student.name,
      user: student.email || student.user
    });
    if (!payload.topic || !payload.subject || !payload.guideemail) {
      return res.status(400).json({ success: false, message: "Topic, subject and guide are required." });
    }
    const state = await assignmentWorkflowState(payload);
    const data = await PhdAssignment.create({
      ...payload,
      ...state,
      history: [assignmentHistory(state.assignmentapprovalstatus === "Approved" ? "Approved automatically" : "Submitted for assignment approval", state, { name: student.name, user: student.email || student.user }, text(req.body.comments))]
    });
    if (data.assignmentapprovalstatus === "Submitted") {
      await createPhdApprovalTask(data, {
        level: data.currentlevel,
        approvername: data.currentapprovername,
        approveremail: data.currentapproveremail
      }, {
        category: "PhD thesis assignment approval",
        pagelink: "/phd-thesis-assignment-approval",
        referenceModel: "phdthesisassignmentds",
        title: `Approve thesis assignment for ${data.student || data.regno}`,
        comments: `Thesis assignment request is pending at level ${data.currentlevel}.`
      });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentAssignmentRequests = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const user = text(req.query.user);
    const query = { colid, requestsource: /^Student$/i };
    if (regno || user) query.$or = [{ regno: regex(regno) }, { email: regex(user) }, { user: regex(user) }];
    const data = await PhdAssignment.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignmentApprovalList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const user = text(req.query.user).toLowerCase();
    const scope = text(req.query.scope || "pending").toLowerCase();
    const query = { colid, requestsource: /^Student$/i };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "assignmentapprovalstatus"]);
    if (scope === "approved") {
      query.history = { $elemMatch: { action: /^Approved$/i, approveremail: regex(user) } };
    } else {
      query.assignmentapprovalstatus = /^Submitted$/i;
      query.currentapproveremail = regex(user);
    }
    const data = await PhdAssignment.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignmentApprovalAction = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const row = await PhdAssignment.findOne({ colid, _id: req.body.id, requestsource: /^Student$/i });
    if (!row) return res.status(404).json({ success: false, message: "Assignment request not found." });
    const comments = text(req.body.comments);
    const previousLevel = row.currentlevel;
    await completePhdApprovalTask(row, req.body, {
      category: "PhD thesis assignment approval",
      referenceModel: "phdthesisassignmentds",
      comments: `Thesis assignment ${text(req.body.action)} by ${text(req.body.name || req.body.user)}`
    });
    if (/^reject/i.test(text(req.body.action))) {
      row.assignmentapprovalstatus = "Rejected";
      row.status = "Rejected";
      row.rejecteddate = new Date();
      row.approvalcomments = comments;
      row.history.push(assignmentHistory("Rejected", row, req.body, comments));
    } else {
      const workflow = await assignmentWorkflowFor(row);
      const next = workflow.find((item) => Number(item.level) > Number(row.currentlevel || 0));
      row.history.push(assignmentHistory("Approved", row, req.body, comments));
      if (next) {
        row.assignmentapprovalstatus = "Submitted";
        row.status = "Pending";
        row.currentlevel = next.level;
        row.currentapprovername = next.approvername;
        row.currentapproveremail = next.approveremail;
        await createPhdApprovalTask(row, next, {
          category: "PhD thesis assignment approval",
          pagelink: "/phd-thesis-assignment-approval",
          referenceModel: "phdthesisassignmentds",
          title: `Approve thesis assignment for ${row.student || row.regno}`,
          comments: `Thesis assignment request moved from level ${previousLevel} to level ${next.level}.`
        });
      } else {
        row.assignmentapprovalstatus = "Approved";
        row.status = "Active";
        row.approveddate = new Date();
        row.currentlevel = 0;
        row.currentapprovername = "";
        row.currentapproveremail = "";
        row.approvalcomments = comments;
      }
    }
    await row.save();
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkAssignments = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const rows = items.map((item) => ({
      ...assignmentPayload({ ...item, colid: req.body.colid, user: req.body.user, name: req.body.name, requestsource: "Admin", assignmentapprovalstatus: "Approved" }),
      requestsource: "Admin",
      assignmentapprovalstatus: "Approved",
      approveddate: new Date()
    })).filter((row) => row.regno && row.topic);
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

exports.listAssignmentWorkflows = async (req, res) => {
  try {
    const query = { colid: num(req.query.colid) };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "approveremail", "role", "status"]);
    const data = await PhdAssignmentWorkflow.find(query).sort({ programcode: 1, level: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAssignmentWorkflow = async (req, res) => {
  try {
    const payload = workflowPayload(req.body);
    if (!payload.program || !payload.programcode || !payload.level || !payload.approvername || !payload.approveremail) {
      return res.status(400).json({ success: false, message: "Program, program code, level and approver are required." });
    }
    const data = req.body._id
      ? await PhdAssignmentWorkflow.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true })
      : await PhdAssignmentWorkflow.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkAssignmentWorkflows = async (req, res) => {
  try {
    const rows = (Array.isArray(req.body.items) ? req.body.items : [])
      .map((item) => workflowPayload({ ...item, colid: req.body.colid, name: req.body.name, user: req.body.user }))
      .filter((row) => row.programcode && row.level && row.approveremail);
    if (rows.length) await PhdAssignmentWorkflow.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAssignmentWorkflows = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await PhdAssignmentWorkflow.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
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
      await completePhdApprovalTask(member, { user: text(req.body.user), name: req.body.name }, {
        category: "PhD oral defense panel approval",
        referenceModel: "phdoraldefensepanelmemberds",
        comments: `Oral defense panel member ${text(req.body.action)} by ${text(req.body.name || req.body.user)}`
      });
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
        const previousLevel = member.currentlevel;
        await completePhdApprovalTask(member, { user: text(req.body.user), name: req.body.name }, {
          category: "PhD oral defense panel approval",
          referenceModel: "phdoraldefensepanelmemberds",
          comments: `Oral defense panel member approved by ${text(req.body.name || req.body.user)}`
        });
        const next = workflow.find((item) => Number(item.level) > Number(member.currentlevel || 0));
        member.history.push({ action: "Approved", level: member.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
        if (next) {
          member.approvalstatus = "Submitted";
          member.currentlevel = next.level;
          member.currentapprovername = next.approvername;
          member.currentapproveremail = next.approveremail;
          await createPhdApprovalTask(member, next, {
            category: "PhD oral defense panel approval",
            pagelink: "/phd-oral-defense-panel-approval",
            referenceModel: "phdoraldefensepanelmemberds",
            title: `Approve oral defense panel member: ${member.examinername || member.examineremail}`,
            comments: `Oral defense panel member moved from level ${previousLevel} to level ${next.level}.`
          });
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
    const user = text(req.query.user);
    const studentQuery = regno || user ? { $or: [{ regno: regex(regno) }, { email: regex(user) }, { user: regex(user) }] } : {};
    const assignments = await PhdAssignment.find({ colid, ...studentQuery, status: /^Active$/i, assignmentapprovalstatus: /^Approved$/i }).sort({ createdAt: -1 }).lean();
    const requests = await PhdAssignment.find({ colid, ...studentQuery, requestsource: /^Student$/i }).sort({ createdAt: -1 }).lean();
    const submissions = await PhdSubmission.find({ colid, ...studentQuery }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, assignments, requests, submissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitThesis = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const assignment = await PhdAssignment.findOne({ _id: req.body.assignmentid, colid }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Thesis assignment not found." });
    if (!/^Approved$/i.test(text(assignment.assignmentapprovalstatus || "Approved")) || !/^Active$/i.test(text(assignment.status || "Active"))) {
      return res.status(400).json({ success: false, message: "Thesis assignment is not approved/active yet." });
    }
    if (!text(req.body.fileurl)) return res.status(400).json({ success: false, message: "Uploaded thesis file link is required." });
    const componentdocuments = parseDocuments(req.body.componentdocuments);
    const missing = missingThesisComponents(componentdocuments);
    if (missing.length) return res.status(400).json({ success: false, message: `Mandatory thesis documents missing: ${missing.join(", ")}` });
    const documents = [...parseDocuments(req.body.documents), ...componentdocuments].filter((doc, index, list) => list.findIndex((item) => item.url === doc.url && item.documentname === doc.documentname) === index);
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
      documents,
      componentdocuments,
      studentcomments: text(req.body.studentcomments),
      resubmissioncomments: text(req.body.resubmissioncomments),
      ...firstState,
      history: [{ action: "Submitted", level: firstState.currentlevel || 0, approvername: "", approveremail: "", comments: text(req.body.studentcomments), date: new Date() }],
      name: text(req.body.name),
      user: text(req.body.user)
    });
    if (data.status === "Submitted") {
      await createPhdApprovalTask(data, {
        level: data.currentlevel,
        approvername: data.currentapprovername,
        approveremail: data.currentapproveremail
      }, {
        category: "PhD thesis submission approval",
        pagelink: "/phd-thesis-approval",
        referenceModel: "phdthesissubmissionds",
        title: `Approve thesis submission for ${data.student || data.regno}`,
        comments: `Thesis submission is pending at level ${data.currentlevel}.`
      });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvalList = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const user = text(req.query.user).toLowerCase();
    const scope = text(req.query.scope || "pending").toLowerCase();
    const query = { colid };
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "status"]);
    if (scope === "approved") {
      query.history = { $elemMatch: { action: /^Approved$/i, approveremail: regex(user) } };
    } else {
      query.status = /^Submitted$/i;
      query.currentapproveremail = regex(user);
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
    const previousLevel = submission.currentlevel;
    await completePhdApprovalTask(submission, req.body, {
      category: "PhD thesis submission approval",
      referenceModel: "phdthesissubmissionds",
      comments: `Thesis submission ${action} by ${text(req.body.name || req.body.user)}`
    });
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
        await createPhdApprovalTask(submission, next, {
          category: "PhD thesis submission approval",
          pagelink: "/phd-thesis-approval",
          referenceModel: "phdthesissubmissionds",
          title: `Approve thesis submission for ${submission.student || submission.regno}`,
          comments: `Thesis submission moved from level ${previousLevel} to level ${next.level}.`
        });
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

function progressPayload(assignment, body = {}) {
  return {
    colid: assignment.colid,
    assignmentid: String(assignment._id),
    academicyear: assignment.academicyear,
    regulation: assignment.regulation,
    program: assignment.program,
    programcode: assignment.programcode,
    student: assignment.student,
    regno: assignment.regno,
    studentemail: assignment.email || assignment.user || "",
    guidename: assignment.guidename,
    guideemail: assignment.guideemail,
    progressdate: text(body.progressdate),
    progress: text(body.progress),
    documents: parseDocuments(body.documents),
    name: text(body.name),
    user: text(body.user)
  };
}

exports.studentProgressReports = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    if (text(req.query.assignmentid)) query.assignmentid = text(req.query.assignmentid);
    else query.$or = [{ regno: regex(req.query.regno || "") }, { studentemail: regex(req.query.user || "") }];
    const data = await PhdProgressReport.find(query).sort({ progressdate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveStudentProgressReport = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const assignment = await PhdAssignment.findOne({ colid, _id: req.body.assignmentid, assignmentapprovalstatus: /^Approved$/i }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Approved thesis assignment not found." });
    const payload = progressPayload(assignment, req.body);
    if (!payload.progressdate || !payload.progress) return res.status(400).json({ success: false, message: "Progress date and progress details are required." });
    payload.conversation = [{
      byname: text(req.body.name),
      byemail: text(req.body.user),
      role: text(req.body.role || "Student"),
      comments: text(req.body.studentcomment || req.body.progress),
      date: new Date()
    }];
    const data = await PhdProgressReport.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addProgressConversation = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const report = await PhdProgressReport.findOne({ colid, _id: req.body.id });
    if (!report) return res.status(404).json({ success: false, message: "Progress report not found." });
    const comment = text(req.body.comments);
    if (!comment) return res.status(400).json({ success: false, message: "Comment is required." });
    report.conversation.push({ byname: text(req.body.name), byemail: text(req.body.user), role: text(req.body.role), comments: comment, date: new Date() });
    await report.save();
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.guideDashboard = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const login = text(req.query.user);
    const assignments = await PhdAssignment.find({ colid, guideemail: regex(login), assignmentapprovalstatus: /^Approved$/i }).sort({ student: 1 }).lean();
    const assignmentIds = assignments.map((row) => String(row._id));
    const regnos = assignments.map((row) => row.regno).filter(Boolean);
    const [submissions, progress, oral] = await Promise.all([
      PhdSubmission.find({ colid, assignmentid: { $in: assignmentIds } }).sort({ createdAt: -1 }).lean(),
      PhdProgressReport.find({ colid, assignmentid: { $in: assignmentIds } }).sort({ progressdate: -1, createdAt: -1 }).lean(),
      PhdOralDefenseAssignment.find({ colid, regno: { $in: regnos } }).select("assignmentid submissionid regno status oraldefensedate").lean()
    ]);
    const completedRegnos = new Set(oral.filter((row) => /^Approved$/i.test(row.status)).map((row) => row.regno));
    const data = assignments.map((row) => ({
      ...row,
      guidecompletionstatus: completedRegnos.has(row.regno) ? "Completed" : "Ongoing",
      submissions: submissions.filter((item) => String(item.assignmentid) === String(row._id)),
      progressreports: progress.filter((item) => String(item.assignmentid) === String(row._id))
    }));
    res.json({ success: true, data, submissions, progress, institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.guideMessages = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    if (text(req.query.assignmentid)) query.assignmentid = text(req.query.assignmentid);
    else {
      const login = text(req.query.user);
      query.$or = [{ studentemail: regex(login) }, { guideemail: regex(login) }, { regno: regex(req.query.regno || "") }];
    }
    const data = await PhdGuideMessage.find(query).sort({ messagedate: 1, createdAt: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendGuideMessage = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const assignment = await PhdAssignment.findOne({ colid, _id: req.body.assignmentid, assignmentapprovalstatus: /^Approved$/i }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Approved thesis assignment not found." });
    const message = text(req.body.message);
    if (!message) return res.status(400).json({ success: false, message: "Message is required." });
    const data = await PhdGuideMessage.create({
      colid,
      assignmentid: String(assignment._id),
      academicyear: assignment.academicyear,
      regulation: assignment.regulation,
      program: assignment.program,
      programcode: assignment.programcode,
      student: assignment.student,
      regno: assignment.regno,
      studentemail: assignment.email || "",
      guidename: assignment.guidename,
      guideemail: assignment.guideemail,
      sendername: text(req.body.name),
      senderemail: text(req.body.user),
      senderrole: text(req.body.role),
      message,
      documents: parseDocuments(req.body.documents)
    });
    res.json({ success: true, data });
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
          documents: submission.documents || [],
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
      const saved = await PhdExaminerAssignment.findOneAndUpdate(
        { colid, submissionid: row.submissionid, memberid: row.memberid },
        { $setOnInsert: row },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (saved?.createdAt && saved?.updatedAt && String(saved.createdAt) === String(saved.updatedAt)) inserted += 1;
      await createApprovalTasks({
        colid,
        user: text(req.body.user),
        createdby: text(req.body.name),
        academicyear: row.academicyear,
        approvername: row.examinername,
        approveremail: row.useremail || row.examineremail,
        title: `Review PhD thesis for ${row.student || row.regno}`,
        category: "PhD examiner thesis review",
        pagelink: "/phd-examiner-review",
        comments: `Thesis review is pending for ${row.student || row.regno}.`,
        referenceModel: "phdexaminerassignmentds",
        referenceId: saved?._id || "",
        level: "Examiner"
      });
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
    const missing = data.filter((row) => !row.fileurl || !(row.documents || []).length).map((row) => row.submissionid).filter(Boolean);
    if (missing.length) {
      const submissions = await PhdSubmission.find({ colid: num(req.query.colid), _id: { $in: missing } }).select("fileurl filename documents").lean();
      const byId = Object.fromEntries(submissions.map((row) => [String(row._id), row]));
      data.forEach((row) => {
        const source = byId[String(row.submissionid)];
        if (source) {
          if (!row.fileurl) row.fileurl = source.fileurl;
          if (!row.filename) row.filename = source.filename;
          if (!(row.documents || []).length) row.documents = source.documents || [];
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
    const submissionIds = assignments.map((row) => row.submissionid).filter(Boolean);
    const [assessments, submissions, progress] = await Promise.all([
      PhdExaminerAssessment.find({ colid, submissionid: { $in: submissionIds } }).sort({ examinername: 1, group: 1, topic: 1 }).lean(),
      PhdSubmission.find({ colid, _id: { $in: submissionIds } }).lean(),
      PhdProgressReport.find({ colid, assignmentid: { $in: assignments.map((row) => row.assignmentid).filter(Boolean) } }).sort({ progressdate: -1 }).lean()
    ]);
    res.json({ success: true, assignments, assessments, submissions, progress, institution: await institution(colid) });
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
    await completeApprovalTasks({
      colid,
      approveremail: text(req.body.user),
      category: "PhD examiner thesis review",
      referenceModel: "phdexaminerassignmentds",
      referenceId: row._id,
      level: "Examiner",
      comments: `Thesis review ${action.toLowerCase()} by ${text(req.body.name || req.body.user)}`
    });
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
    applyFilters(query, req.query, ["academicyear", "regulation", "program", "programcode", "student", "regno", "subject", "topic", "status", "recommended", "currentapprovername", "currentapproveremail"]);
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
    const previousLevel = row.currentlevel;
    await completePhdApprovalTask(row, req.body, {
      category: "PhD NoC approval",
      referenceModel: "phdnocapprovalds",
      comments: `NoC approval ${action} by ${text(req.body.name || req.body.user)}`
    });
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
        await createPhdApprovalTask(row, next, {
          category: "PhD NoC approval",
          pagelink: "/phd-noc-final-approval",
          referenceModel: "phdnocapprovalds",
          title: `Approve PhD NoC for ${row.student || row.regno}`,
          comments: `NoC approval moved from level ${previousLevel} to level ${next.level}.`
        });
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
        fileurl: student.fileurl,
        filename: student.filename,
        documents: student.documents || [],
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
      const saved = await PhdOralDefenseAssignment.findOneAndUpdate(
        { colid, submissionid: payload.submissionid, memberid: payload.memberid },
        { $setOnInsert: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (saved?.createdAt && saved?.updatedAt && String(saved.createdAt) === String(saved.updatedAt)) inserted += 1;
      await createApprovalTasks({
        colid,
        user: text(req.body.user),
        createdby: text(req.body.name),
        academicyear: payload.academicyear,
        approvername: payload.examinername,
        approveremail: payload.useremail || payload.examineremail,
        title: `Complete oral defense for ${payload.student || payload.regno}`,
        category: "PhD oral defense examiner review",
        pagelink: "/phd-oral-defense-review",
        comments: `Oral defense review is pending for ${payload.student || payload.regno}.`,
        referenceModel: "phdoraldefenseassignmentds",
        referenceId: saved?._id || "",
        level: "Examiner"
      });
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
    await completeApprovalTasks({
      colid,
      approveremail: text(req.body.user),
      category: "PhD oral defense examiner review",
      referenceModel: "phdoraldefenseassignmentds",
      referenceId: row._id,
      level: "Examiner",
      comments: `Oral defense review ${action.toLowerCase()} by ${text(req.body.name || req.body.user)}`
    });
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
    const assignmentid = submission?.assignmentid || oralAssignment.assignmentid || "";
    const [progressReports, messages] = await Promise.all([
      assignmentid ? PhdProgressReport.find({ colid, assignmentid }).sort({ progressdate: -1, createdAt: -1 }).lean() : [],
      assignmentid ? PhdGuideMessage.find({ colid, assignmentid }).sort({ messagedate: 1 }).lean() : []
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
      progressReports,
      messages,
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
    const missing = data.filter((row) => !row.fileurl || !(row.documents || []).length).map((row) => row.submissionid).filter(Boolean);
    if (missing.length) {
      const submissions = await PhdSubmission.find({ colid, _id: { $in: missing } }).select("fileurl filename documents").lean();
      const byId = new Map(submissions.map((row) => [String(row._id), row]));
      data.forEach((row) => {
        const source = byId.get(String(row.submissionid));
        if (source) {
          if (!row.fileurl) row.fileurl = source.fileurl;
          if (!row.filename) row.filename = source.filename;
          if (!(row.documents || []).length) row.documents = source.documents || [];
        }
      });
    }
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
    if (submission) {
      if (!row.fileurl) row.fileurl = submission.fileurl;
      if (!row.filename) row.filename = submission.filename;
      if (!(row.documents || []).length) row.documents = submission.documents || [];
    }
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
    const previousLevel = row.currentlevel;
    await completePhdApprovalTask(row, req.body, {
      category: "PhD oral defense approval",
      referenceModel: "phdoraldefenseapprovalds",
      comments: `Oral defense approval ${action} by ${text(req.body.name || req.body.user)}`
    });
    if (/^reject/i.test(action)) {
      row.status = "Rejected";
      row.rejecteddate = new Date();
      row.finalcomments = comments;
      row.history.push({ action: "Rejected", level: row.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
    } else {
      const workflow = await oralWorkflowFor(row);
      const next = workflow.find((item) => Number(item.level) > Number(row.currentlevel || 0));
      if (!next && !/^Yes$/i.test(text(row.recommended))) {
        return res.status(400).json({ success: false, message: "Final oral defense approval is allowed only when Recommended is Yes." });
      }
      row.history.push({ action: "Approved", level: row.currentlevel, approvername: text(req.body.name), approveremail: text(req.body.user), comments, date: new Date() });
      if (next) {
        row.status = "Submitted";
        row.currentlevel = next.level;
        row.currentapprovername = next.approvername;
        row.currentapproveremail = next.approveremail;
        await createPhdApprovalTask(row, next, {
          category: "PhD oral defense approval",
          pagelink: "/phd-oral-defense-approval",
          referenceModel: "phdoraldefenseapprovalds",
          title: `Approve oral defense for ${row.student || row.regno}`,
          comments: `Oral defense approval moved from level ${previousLevel} to level ${next.level}.`
        });
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

exports.updateOralDefenseRecommendation = async (req, res) => {
  try {
    if (!/^coe$/i.test(text(req.body.role))) return res.status(403).json({ success: false, message: "Only COE can update recommendation." });
    const colid = num(req.body.colid);
    const recommended = /^Yes$/i.test(text(req.body.recommended)) ? "Yes" : "No";
    const row = await PhdOralDefenseApproval.findOne({ colid, _id: req.body.id });
    if (!row) return res.status(404).json({ success: false, message: "Oral defense approval not found." });
    row.recommended = recommended;
    row.recommendedby = text(req.body.name);
    row.recommendedbyemail = text(req.body.user);
    row.recommendeddate = new Date();
    row.history.push({
      action: `Recommendation ${recommended}`,
      level: row.currentlevel,
      approvername: text(req.body.name),
      approveremail: text(req.body.user),
      comments: text(req.body.comments),
      date: new Date()
    });
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
