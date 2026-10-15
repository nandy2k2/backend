const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const multer = require("multer");
const AWS = require("aws-sdk");
const path = require("path");
const Awsconfig = require("../Models/awsconfig");
const { Panel, Member, Workflow, Assignment, CommunicationLog } = require("../Models/questionpaperindentds");
const User = require("../Models/user");
const Programs = require("../Models/mprograms");
const Courses = require("../Models/regulationcoursemapds");
const AssessmentComponent = require("../Models/assessmentcomponentds");
const EmailConfig = require("../Models/emailconfigurationds");
const WhatsappConfig = require("../Models/bhashwhatsappconfigds");
const WhatsappTemplate = require("../Models/bhashwhatsapptemplateds");
const Whatsapp = require("./bhashwhatsappctlrds");
const { WhatsappCreditAccount } = require("../Models/whatsappcreditds");
const { createApprovalTasks, completeApprovalTasks } = require("../utils/approvalTaskHelper");
const router = express.Router();
const text = (v) => String(v ?? "").trim();
const email = (v) => text(v).toLowerCase();
const escape = (v) => text(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const exact = (v) => new RegExp(`^${text(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
const colidFor = (req) => { const n = Number(req.body?.colid ?? req.query.colid); if (!Number.isFinite(n) || n <= 0) fail("Institution is required"); return n; };
const id = (v) => { if (!mongoose.Types.ObjectId.isValid(v)) fail("Valid record id required"); return v; };
const run = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(e.code === 11000 ? 409 : e.status || 500).json({ success: false, message: e.code === 11000 ? "An entry with these details already exists" : e.message }); } };
const courseFields = ["program", "programcode", "regulation", "semester", "course", "coursecode", "type", "subject"];
const pick = (obj, fields) => Object.fromEntries(fields.filter((key) => obj[key] !== undefined).map((key) => [key, obj[key]]));
const profileFields = ["phone", "password", "department", "designation", "institution", "googleemail", "excluded", "joiningdate", "admissionyear", "gender", "dateofbirth", "nationality", "address", "city", "district", "state", "pincode", "country", "qualification", "experience", "pan", "photo", "role"];
const models = { panels: Panel, members: Member, workflow: Workflow, assignments: Assignment, communications: CommunicationLog };
const filterFields = [...courseFields, "panelname", "status", "kind", "membername", "memberemail", "invitationstatus", "approvalstatus", "papersettername", "papersetteremail", "component"];

async function scopedPanel(colid, panelid) {
  const panel = await Panel.findOne({ colid, _id: id(panelid) }).lean();
  if (!panel) fail("Panel not found", 404);
  return panel;
}
async function refreshPanel(colid, panelid) {
  const members = await Member.find({ colid, panelid }).select("approvalstatus").lean();
  const status = members.some((m) => m.approvalstatus === "Approved") ? "Approved" : members.length ? "In process" : "Not created";
  return status;
}
async function taskFor(member, panel, user) {
  return createApprovalTasks({ colid: member.colid, user, approveremail: member.currentapprover, title: `Approve ${member.membername} — ${panel.panelname}`, category: "Question paper indent approval", pagelink: "/question-paper-indent-approval", referenceModel: "questionpaperindentmemberds", referenceId: member._id, level: member.currentlevel, comments: `${panel.program} / ${panel.course} (${panel.coursecode})` });
}
async function finishTask(member, user, comments) {
  return completeApprovalTasks({ colid: member.colid, approveremail: user, category: "Question paper indent approval", referenceModel: "questionpaperindentmemberds", referenceId: member._id, level: member.currentlevel, comments });
}

router.get("/options", run(async (req, res) => {
  const colid = colidFor(req);
  const [programs, courses, users, emails, whatsapp, templates, credits, components] = await Promise.all([
    Programs.find({ colid }).select("program programcode").sort({ program: 1 }).lean(),
    Courses.find({ colid }).select(courseFields.join(" ")).lean(),
    User.find({ colid, role: { $not: /^student$/i } }).select("name email phone department designation institution role").sort({ name: 1 }).lean(),
    EmailConfig.find({ colid, isactive: { $ne: "No" } }).select("username provider").lean(),
    WhatsappConfig.find({ colid, isactive: { $ne: false } }).select("name businessCode").lean(),
    WhatsappTemplate.find({ colid }).select("templatename templatecode variablenames noofvariables").lean(),
    WhatsappCreditAccount.findOne({ colid }).select("balance").lean(),
    AssessmentComponent.find({ colid, status: { $ne: "Inactive" } }).select("programcode regulation semester coursecode assessmentcomponent componenttype scoretype").lean()
  ]);
  res.json({ programs: [...new Map(programs.map((p) => [`${p.programcode}|${p.program}`, p])).values()], courses, users, emails, whatsapp, templates, components, profileFields, whatsappBalance: credits?.balance || 0 });
}));

router.post("/upload", multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).single("file"), run(async (req, res) => {
  const colid = colidFor(req);
  if (!req.file) fail("Select a document");
  const config = await Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).lean();
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) fail("Default AWS configuration is incomplete");
  const filename = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
  const key = `${colid}/question-paper-indent/${crypto.randomBytes(12).toString("hex")}-${filename}`;
  await new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region }).putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
  res.json({ success: true, title: filename, url: `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}` });
}));

router.get("/:entity/rows", run(async (req, res) => {
  const colid = colidFor(req), Model = models[req.params.entity];
  if (!Model) fail("Unknown page");
  const query = { colid };
  if (req.query.panelid) query.panelid = id(req.query.panelid);
  let filters = [];
  try { filters = JSON.parse(req.query.filters || "[]"); } catch { fail("Invalid filters"); }
  if (!Array.isArray(filters)) fail("Invalid filters");
  for (const f of filters) if (filterFields.includes(f.field) && (Array.isArray(f.value) ? f.value.length : text(f.value))) query[f.field] = Array.isArray(f.value) ? { $in: f.value.map(exact) } : exact(f.value);
  if (req.query.approval === "Yes") { query.approvalstatus = "Pending"; query.currentapprover = email(req.query.user); }
  const rows = await Model.find(query).select("-profile.password").sort({ createdAt: -1 }).limit(10000).lean();
  res.json({ success: true, data: rows });
}));

async function saveOne(entity, body, colid) {
  const user = email(body.user);
  if (entity === "panels") {
    const payload = { ...pick(body, [...courseFields, "panelname", "description"]), colid, user };
    for (const field of ["program", "programcode", "semester", "course", "coursecode", "panelname"]) if (!text(payload[field])) fail(`${field} is required`);
    if (body.id) {
      const previous = await scopedPanel(colid, body.id);
      if ([...courseFields, "panelname"].some((f) => text(previous[f]) !== text(payload[f])) && await Member.exists({ colid, panelid: body.id })) fail("Panel identity cannot change after adding members; create a new panel for a different course");
      return Panel.findOneAndUpdate({ colid, _id: id(body.id) }, { $set: payload }, { new: true, runValidators: true });
    }
    return Panel.create(payload);
  }
  if (entity === "workflow") {
    await scopedPanel(colid, body.panelid);
    if (await Member.exists({ colid, panelid: body.panelid, approvalstatus: "Pending" })) fail("Complete pending approvals before changing this workflow");
    const levels = (body.levels || []).map((l) => ({ order: Number(l.order), approveremail: email(l.approveremail), approvername: text(l.approvername) })).sort((a, b) => a.order - b.order);
    if (!levels.length || levels.some((l, i) => !l.approveremail || l.order !== i + 1)) fail("Add consecutive approval levels starting at 1");
    for (const l of levels) if (!await User.exists({ colid, email: exact(l.approveremail), role: { $not: /^student$/i } })) fail(`Approver not found: ${l.approveremail}`);
    return Workflow.findOneAndUpdate({ colid, panelid: body.panelid }, { $set: { colid, user, panelid: body.panelid, levels } }, { upsert: true, new: true, runValidators: true });
  }
  if (entity === "members") {
    await scopedPanel(colid, body.panelid);
    const existing = body.id ? await Member.findOne({ colid, _id: id(body.id), panelid: body.panelid }) : null;
    if (body.id && !existing) fail("Member not found", 404);
    if (existing && existing.approvalstatus !== "Draft") fail("Only draft members may be edited");
    const kind = existing?.kind || body.kind;
    const memberemail = email(body.memberemail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberemail) || !text(body.membername)) fail("Name and valid email are required");
    const profile = pick(body.profile || {}, profileFields);
    let userid;
    if (kind === "Internal") {
      const internal = await User.findOne({ colid, email: exact(memberemail), role: { $not: /^student$/i } }).select("_id name email phone department designation institution role").lean();
      if (!internal) fail("Select an internal non-student user");
      userid = internal._id;
      Object.assign(profile, pick(internal, profileFields));
    } else {
      if (kind !== "External") fail("Select Internal or External");
      if (!text(profile.phone) || !text(profile.department)) fail("External member phone and department are required");
      if (await User.exists({ email: exact(memberemail) }) || await Member.exists({ colid, memberemail, ...(existing ? { _id: { $ne: existing._id } } : {}) })) fail("User already exists; adding is not allowed", 409);
    }
    const payload = { colid, user, panelid: body.panelid, kind, membername: text(body.membername), memberemail, profile, userid, invitationstatus: kind === "Internal" ? "Accepted" : "Not confirmed" };
    if (existing) return Member.findOneAndUpdate({ colid, _id: existing._id }, { $set: payload, ...(kind === "External" ? { $unset: { invitationhash: "", invitationexpires: "", responsedate: "" } } : {}) }, { new: true, runValidators: true });
    return Member.create(payload);
  }
  if (entity === "assignments") {
    const panel = await scopedPanel(colid, body.panelid);
    const member = await Member.findOne({ colid, panelid: panel._id, _id: id(body.memberid), approvalstatus: "Approved", invitationstatus: "Accepted" }).lean();
    if (!member) fail("Select a finally approved member of this panel");
    if (body.startdate && body.enddate && new Date(body.enddate) < new Date(body.startdate)) fail("End date must be after start date");
    const payload = { colid, user, ...pick(panel, courseFields), panelid: panel._id, memberid: member._id, papersettername: member.membername, papersetteremail: member.memberemail, ...pick(body, ["component", "startdate", "enddate", "instructions", "admindocuments"]) };
    return body.id ? Assignment.findOneAndUpdate({ colid, _id: id(body.id) }, { $set: payload }, { new: true, runValidators: true }) : Assignment.create(payload);
  }
  fail("Unsupported operation");
}

router.post("/:entity/save", run(async (req, res) => res.json({ success: true, data: await saveOne(req.params.entity, req.body, colidFor(req)) })));
router.post("/:entity/bulk", run(async (req, res) => {
  const colid = colidFor(req), results = [];
  for (const [i, item] of (req.body.items || []).entries()) {
    try { const data = await saveOne(req.params.entity, { ...item, user: req.body.user }, colid); results.push({ row: i + 2, status: "Saved", id: data?._id }); }
    catch (e) { results.push({ row: i + 2, status: "Failed", error: e.code === 11000 ? "Duplicate record" : e.message }); }
  }
  res.json({ success: true, data: results, saved: results.filter((r) => r.status === "Saved").length });
}));
router.post("/:entity/delete", run(async (req, res) => {
  const colid = colidFor(req), entity = req.params.entity, Model = models[entity];
  if (!Model || entity === "communications") fail("Delete is not available");
  const ids = (req.body.ids || []).map(id);
  if (!ids.length) fail("Select rows");
  if (entity === "panels" || entity === "workflow") {
    const panels = entity === "panels" ? ids : (await Workflow.find({ colid, _id: { $in: ids } }).select("panelid")).map((w) => w.panelid);
    if (await Member.exists({ colid, panelid: { $in: panels } })) fail("Remove panel members before deleting panels or workflows");
  }
  if (entity === "members" && await Member.exists({ colid, _id: { $in: ids }, approvalstatus: { $ne: "Draft" } })) fail("Only draft members may be deleted");
  res.json({ success: true, deleted: (await Model.deleteMany({ colid, _id: { $in: ids } })).deletedCount });
}));

router.post("/approval/start", run(async (req, res) => {
  const colid = colidFor(req), panel = await scopedPanel(colid, req.body.panelid);
  const workflow = await Workflow.findOne({ colid, panelid: panel._id }).lean();
  if (!workflow?.levels.length) fail("Configure a panel approval workflow first");
  const ids = (req.body.ids || []).map(id);
  if (!ids.length) fail("Select accepted members");
  const results = [];
  for (const memberid of ids) {
    const member = await Member.findOneAndUpdate({ colid, panelid: panel._id, _id: memberid, invitationstatus: "Accepted", approvalstatus: { $in: ["Draft", "Rejected"] } }, { $set: { approvalstatus: "Pending", levels: workflow.levels, currentlevel: 1, currentapprover: workflow.levels[0].approveremail } }, { new: true });
    if (member) { await taskFor(member, panel, req.body.user); results.push(member._id); }
  }
  res.json({ success: true, updated: results.length });
}));
router.post("/approval/decide", run(async (req, res) => {
  const colid = colidFor(req), actor = email(req.body.user), panel = await scopedPanel(colid, req.body.panelid);
  if (!["Approved", "Rejected"].includes(req.body.decision)) fail("Select approve or reject");
  if (req.body.decision === "Rejected" && !text(req.body.comments)) fail("Rejection comments are required");
  const results = [];
  for (const memberid of req.body.ids || []) {
    const member = await Member.findOneAndUpdate({ colid, panelid: panel._id, _id: id(memberid), approvalstatus: "Pending", currentapprover: actor, $or: [{ decisionlock: { $exists: false } }, { decisionlock: { $lt: new Date(Date.now() - 5 * 60000) } }] }, { $set: { decisionlock: new Date() } }, { new: true });
    if (!member) { results.push({ id: memberid, status: "Skipped", message: "Not pending with you" }); continue; }
    try {
    const currentlevel = member.currentlevel, next = member.levels.find((l) => l.order === currentlevel + 1);
    const final = req.body.decision === "Approved" && !next;
    if (final && member.kind === "External") {
      const exists = await User.findOne({ email: exact(member.memberemail) });
      if (exists && Number(exists.colid) === colid && exists.regno === `QPI-${member._id}`) member.userid = exists._id;
      if (exists && (!member.userid || String(member.userid) !== String(exists._id))) fail(`User already exists for ${member.memberemail}; final approval was not applied`, 409);
      if (!exists) {
        const profile = pick(member.profile || {}, profileFields);
        const created = await User.create({ ...profile, name: member.membername, email: member.memberemail, colid, phone: profile.phone, department: profile.department, role: text(profile.role) && !/^student$|^all$/i.test(profile.role) ? profile.role : "papersetter", password: text(profile.password) || crypto.randomBytes(18).toString("base64url"), regno: `QPI-${member._id}`, program: panel.program, programcode: panel.programcode, semester: panel.semester || "NA", section: "NA", admissionyear: text(profile.admissionyear) || "NA", status: 1, user: actor });
        member.userid = created._id;
      }
    }
    member.history.push({ order: currentlevel, approveremail: actor, decision: req.body.decision, comments: text(req.body.comments), date: new Date() });
    member.approvalstatus = req.body.decision === "Rejected" ? "Rejected" : final ? "Approved" : "Pending";
    member.currentapprover = member.approvalstatus === "Pending" ? next.approveremail : "";
    if (member.approvalstatus === "Pending") member.currentlevel = next.order;
    member.decisionlock = undefined;
    await member.save();
    await finishTask({ ...member.toObject(), currentlevel }, actor, text(req.body.comments) || req.body.decision);
    if (member.approvalstatus === "Pending") await taskFor(member, panel, actor);
    results.push({ id: member._id, status: member.approvalstatus });
    } catch (error) {
      await Member.updateOne({ colid, _id: member._id, approvalstatus: "Pending", currentapprover: actor }, { $unset: { decisionlock: "" } });
      throw error;
    }
  }
  res.json({ success: true, data: results });
}));

router.post("/members/invite", run(async (req, res) => {
  const colid = colidFor(req), panel = await scopedPanel(colid, req.body.panelid), channels = req.body.channels || [];
  if (!channels.some((c) => ["Email", "WhatsApp"].includes(c))) fail("Select email and/or WhatsApp");
  const config = channels.includes("Email") ? await EmailConfig.findOne({ colid, _id: id(req.body.emailconfigid), isactive: { $ne: "No" } }).lean() : null;
  if (channels.includes("Email") && !config) fail("Select active email configuration");
  if (channels.includes("WhatsApp")) {
    if (!await WhatsappConfig.exists({ colid, _id: id(req.body.whatsappconfigid), isactive: true })) fail("Select active WhatsApp configuration");
    if (!text(req.body.templateCode) || !await WhatsappTemplate.exists({ colid, templatecode: text(req.body.templateCode), active: { $ne: "No" } })) fail("Select a saved WhatsApp template");
  }
  const origin = text(process.env.FRONTEND_URL || req.get("origin"));
  if (!/^https?:\/\//.test(origin)) fail("Frontend address is unavailable");
  const results = [];
  const members = await Member.find({ colid, panelid: panel._id, _id: { $in: (req.body.ids || []).map(id) }, kind: "External", invitationstatus: "Not confirmed" }).select("+invitationhash");
  if (!members.length) fail("Select external members with Not confirmed status");
  for (const member of members) {
    const token = crypto.randomBytes(32).toString("hex");
    member.invitationhash = crypto.createHash("sha256").update(token).digest("hex");
    member.invitationexpires = new Date(Date.now() + 30 * 86400000);
    member.invitationdate = new Date();
    await member.save();
    const base = `${origin.replace(/\/$/, "")}/question-paper-indent-invitation?token=${token}`;
    const accept = `${base}&choice=Accepted`, reject = `${base}&choice=Rejected`;
    const details = `${member.membername}, you are invited to ${panel.panelname}: ${panel.program} (${panel.programcode}), Semester ${panel.semester}, ${panel.course} (${panel.coursecode}).`;
    for (const channel of channels) {
      try {
        if (channel === "Email") {
          const transport = nodemailer.createTransport({ ...(config.smtp || config.smptp ? { host: config.smtp || config.smptp, port: Number(config.port || 587), secure: /^yes$/i.test(config.secure) || Number(config.port) === 465 } : { service: config.provider || "Gmail" }), auth: { user: config.username, pass: config.password } });
          await transport.sendMail({ from: config.username, to: member.memberemail, subject: text(req.body.subject) || `Paper setter invitation: ${panel.panelname}`, text: `${details}\n${text(req.body.message)}\nAccept: ${accept}\nReject: ${reject}`, html: `<p>${escape(details)}</p><p>${escape(req.body.message).replace(/\n/g, "<br>")}</p><p><a href="${escape(accept)}">Accept invitation</a> &nbsp; <a href="${escape(reject)}">Reject invitation</a></p>` });
        } else if (channel === "WhatsApp") {
          if (!text(member.profile?.phone)) fail("Member has no phone number");
          // Reuse the existing provider and credit-accounting path without creating Users for invitees.
          const values = (req.body.values || []).map((v) => ({ variable: text(v.variable), value: text(v.value).replace(/\{\{(name|panel|program|programcode|semester|course|coursecode|accept|reject|details)\}\}/g, (_, key) => ({ name: member.membername, panel: panel.panelname, program: panel.program, programcode: panel.programcode, semester: panel.semester, course: panel.course, coursecode: panel.coursecode, accept, reject, details }[key])) }));
          if (!values.some((v) => v.value.includes(accept)) || !values.some((v) => v.value.includes(reject))) fail("WhatsApp template values must include {{accept}} and {{reject}} links");
          let status = 200, result;
          await Whatsapp.sendTemplatePayload({ body: { colid, configid: req.body.whatsappconfigid, templateCode: req.body.templateCode, mobileNumbers: member.profile.phone, values, user: req.body.user } }, { status(code) { status = code; return this; }, json(data) { result = data; return this; } });
          if (status >= 400 || result?.error) fail(result?.error || "WhatsApp send failed");
        } else continue;
        await CommunicationLog.create({ colid, user: req.body.user, panelid: panel._id, memberid: member._id, channel, recipient: channel === "Email" ? member.memberemail : member.profile.phone, status: "Sent" });
        results.push({ member: member.membername, channel, status: "Sent" });
      } catch (e) {
        await CommunicationLog.create({ colid, user: req.body.user, panelid: panel._id, memberid: member._id, channel, status: "Failed", error: e.message });
        results.push({ member: member.membername, channel, status: "Failed", error: e.message });
      }
    }
  }
  const account = await WhatsappCreditAccount.findOne({ colid }).select("balance").lean();
  res.json({ success: true, data: results, options: { whatsappBalance: account?.balance || 0 } });
}));

const tokenQuery = (value) => {
  if (!/^[a-f0-9]{64}$/.test(text(value))) fail("Invalid invitation", 404);
  return { invitationhash: crypto.createHash("sha256").update(text(value)).digest("hex"), invitationexpires: { $gt: new Date() } };
};
router.get("/invitation", run(async (req, res) => {
  const member = await Member.findOne(tokenQuery(req.query.token)).select("membername invitationstatus panelid colid").lean();
  if (!member) fail("Invitation is invalid or expired", 404);
  const panel = await scopedPanel(member.colid, member.panelid);
  res.json({ success: true, member: member.membername, status: member.invitationstatus, panel: pick(panel, [...courseFields, "panelname", "description"]) });
}));
router.post("/invitation", run(async (req, res) => {
  if (!["Accepted", "Rejected"].includes(req.body.decision)) fail("Select accept or reject");
  const member = await Member.findOneAndUpdate({ ...tokenQuery(req.body.token), invitationstatus: "Not confirmed", approvalstatus: "Draft" }, { $set: { invitationstatus: req.body.decision, responsedate: new Date() } }, { new: true });
  if (!member) fail("Invitation already answered, invalid or expired", 409);
  res.json({ success: true, status: member.invitationstatus });
}));

router.post("/auto-create", run(async (req, res) => {
  const colid = colidFor(req), query = { colid };
  if (!req.body.programcodes?.length || !req.body.semesters?.length || !req.body.coursecodes?.length) fail("Select programs, semesters and courses");
  for (const [field, values] of [["programcode", req.body.programcodes], ["semester", req.body.semesters], ["coursecode", req.body.coursecodes]]) query[field] = { $in: values.map(text) };
  if (req.body.courseids?.length) query._id = { $in: req.body.courseids.map(id) };
  const courses = await Courses.find(query).lean(), seen = new Set(), results = [];
  for (const row of courses) {
    const identity = pick(row, courseFields), key = JSON.stringify(pick(row, courseFields.slice(0, 6)));
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = await Panel.exists({ colid, ...pick(row, courseFields.slice(0, 6)) });
    if (existing) { results.push({ course: row.course, status: "Already exists" }); continue; }
    const panelname = `QPI-${row.programcode}-S${row.semester}-${row.coursecode}-${crypto.randomBytes(4).toString("hex")}`;
    await Panel.create({ colid, user: req.body.user, ...identity, panelname, description: "Automatically created" });
    results.push({ course: row.course, panelname, status: "Created" });
  }
  res.json({ success: true, data: results });
}));
router.get("/report", run(async (req, res) => {
  const colid = colidFor(req), query = { colid };
  if (req.query.programcode) query.programcode = text(req.query.programcode);
  if (req.query.semester) query.semester = text(req.query.semester);
  const [courses, panels, members, assignments] = await Promise.all([Courses.find(query).select(courseFields.join(" ")).lean(), Panel.find(query).lean(), Member.find({ colid }).select("-profile.password").lean(), Assignment.find(query).lean()]);
  const courseMap = new Map();
  for (const course of courses) {
    const key = courseFields.slice(0, 6).map((f) => text(course[f])).join("|");
    if (courseMap.has(key)) continue;
    const matches = panels.filter((p) => courseFields.slice(0, 6).every((f) => text(p[f]) === text(course[f])));
    const selectedMembers = members.filter((m) => matches.some((p) => String(p._id) === String(m.panelid)));
    courseMap.set(key, { ...course, id: key, panelnames: matches.map((p) => p.panelname).join(", "), panels: matches.length, members: selectedMembers.length, approved: selectedMembers.filter((m) => m.approvalstatus === "Approved").length, pending: selectedMembers.filter((m) => m.approvalstatus === "Pending").length, rejected: selectedMembers.filter((m) => m.approvalstatus === "Rejected").length, status: selectedMembers.some((m) => m.approvalstatus === "Approved") ? "Approved" : matches.length ? "In process" : "Not created" });
  }
  const panelMap = new Map(panels.map((p) => [String(p._id), p]));
  const reportMembers = members.filter((m) => panelMap.has(String(m.panelid))).map((m) => ({ ...pick(panelMap.get(String(m.panelid)), [...courseFields, "panelname"]), ...m }));
  res.json({ success: true, data: [...courseMap.values()], panels, members: reportMembers, assignments });
}));
module.exports = router;
