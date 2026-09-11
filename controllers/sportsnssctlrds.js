const Activity = require("../Models/sportsnssactivityds");
const Coordinator = require("../Models/sportsnsscoordinatords");
const Group = require("../Models/sportsnssgroupds");
const Member = require("../Models/sportsnssmemberds");
const Application = require("../Models/sportsnssapplicationds");
const Event = require("../Models/sportsnsseventds");
const EventAttendance = require("../Models/sportsnsseventattendanceds");
const User = require("../Models/user");
const InsDetails = require("../Models/insdetails");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const EpaathsalaAiConfiguration = require("../Models/epaathsalaaiconfigurationds");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(esc(value), "i");
const scoped = (source = {}) => {
  const colid = num(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};
const dateValue = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const dateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");
const toClient = (row) => {
  const item = row?.toObject ? row.toObject() : { ...(row || {}) };
  ["startdate", "enddate", "approvaldate"].forEach((field) => {
    if (item[field]) item[field] = dateOnly(item[field]);
  });
  return item;
};
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const activityTypes = ["Sports", "NCC", "NSS"];
const geminiModels = ["gemini-3.5-pro", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
const openAiModels = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5", "gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"];
const claudeModels = ["claude-opus-4-1-20250805", "claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"];

function queryFromFilters(colid, filters = []) {
  const query = { colid };
  (filters || []).forEach(({ field, value }) => {
    if (!text(field) || !text(value)) return;
    query[field] = regex(value);
  });
  return query;
}
function dateList(start, end) {
  const dates = [];
  const first = dateValue(start);
  const last = dateValue(end || start);
  if (!first || !last) return dates;
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) dates.push(dateOnly(d));
  return dates;
}
async function assignedActivityIds(colid, email) {
  if (!text(email)) return [];
  const rows = await Coordinator.find({ colid, useremail: regex(email), active: /^Yes$/i }).select("activityid").lean();
  return rows.map((row) => row.activityid).filter(Boolean);
}
function studentPayload(group, student, source = "Manual") {
  return {
    colid: group.colid,
    groupid: group._id,
    activityid: group.activityid,
    activity: group.activity,
    activitytype: group.activitytype,
    groupname: group.groupname,
    studentid: student._id || student.studentid,
    student: student.name || student.student || "",
    studentemail: student.email || student.studentemail || "",
    regno: student.regno || "",
    academicyear: student.academicyear || "",
    regulation: student.regulation || "",
    program: student.program || "",
    programcode: student.programcode || "",
    semester: student.semester || "",
    section: student.section || "",
    source
  };
}
async function aiConfig(colid, type) {
  return AiConfiguration.findOne({ colid, type: regex(type), active: /^yes$/i, default: /^yes$/i }).lean()
    || AiConfiguration.findOne({ colid, type: regex(type), active: /^yes$/i }).sort({ updatedAt: -1 }).lean();
}
async function callGemini(colid, model, prompt) {
  const config = await aiConfig(colid, "Gemini");
  if (!config?.apikey) throw new Error("Default active Gemini configuration is missing");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent?key=${config.apikey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Gemini request failed");
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "";
}
async function callOpenAi(colid, model, prompt) {
  const config = await aiConfig(colid, "OpenAI");
  if (!config?.apikey) throw new Error("Default active OpenAI configuration is missing");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apikey}` }, body: JSON.stringify({ model: model || "gpt-4.1-mini", input: prompt })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed");
  return data.output_text || data.output?.flatMap((o) => o.content || []).map((c) => c.text || "").join("\n") || "";
}
async function callClaude(colid, model, prompt) {
  const config = await aiConfig(colid, "Claude");
  if (!config?.apikey) throw new Error("Default active Claude configuration is missing");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": config.apikey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: model || "claude-3-5-sonnet-latest", max_tokens: 4000, messages: [{ role: "user", content: prompt }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Claude request failed");
  return (data.content || []).map((item) => item.text || "").join("\n");
}
async function callOllama(colid, configId, prompt) {
  const config = configId
    ? await OllamaConfiguration.findOne({ _id: configId, colid }).lean()
    : await OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).lean() || await OllamaConfiguration.findOne({ colid, active: /^yes$/i }).lean();
  if (!config) throw new Error("Ollama configuration is missing");
  const response = await fetch(`${text(config.serveraddress).replace(/\/$/, "")}/api/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Ollama request failed");
  return data.response || "";
}
async function callEpaathsala(colid, event) {
  const config = await EpaathsalaAiConfiguration.findOne({ colid, active: "Yes", default: "Yes" }).lean() || await EpaathsalaAiConfiguration.findOne({ colid, active: "Yes" }).lean();
  if (!config?.server) throw new Error("Active Epaathsala AI server is missing");
  const headers = { "Content-Type": "application/json" };
  if (config.xapikey) headers["X-Admin-Key"] = config.xapikey;
  const response = await fetch(`${text(config.server).replace(/\/$/, "")}/event-reports/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event_title: event.event,
      event_type: event.activitytype,
      event_date: event.startdate,
      organizer: event.activity,
      chief_guest: event.guests,
      objectives: event.objective,
      agenda: event.agenda,
      highlights: event.activitydetails,
      outcomes: event.description,
      additional_requirements: event.eventdescription,
      tone: "formal"
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.detail || data?.message || "Epaathsala AI report generation failed");
  return data.report_markdown || data.report || data.report_html || JSON.stringify(data, null, 2);
}

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [activities, groups, users, students, ollamaConfigs, institution] = await Promise.all([
      Activity.find({ colid }).sort({ activitytype: 1, activity: 1 }).lean(),
      Group.find({ colid }).sort({ activitytype: 1, groupname: 1 }).limit(5000).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email user role department designation").sort({ name: 1 }).limit(5000).lean(),
      User.find({ colid, role: /^Student$/i }).select("academicyear regulation program programcode semester section").limit(5000).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean(),
      InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null)
    ]);
    res.json({
      activityTypes,
      activities: activities.map(toClient),
      groups: groups.map(toClient),
      users: users.map((u) => ({ ...u, label: `${u.name || u.user || ""} - ${u.email || ""}` })),
      academicyears: uniqueSorted(students.map((s) => s.academicyear)),
      regulations: uniqueSorted(students.map((s) => s.regulation)),
      programs: uniqueSorted(students.map((s) => s.program)),
      programcodes: uniqueSorted(students.map((s) => s.programcode)),
      semesters: uniqueSorted(students.map((s) => s.semester)),
      sections: uniqueSorted(students.map((s) => s.section)),
      geminiModels,
      openAiModels,
      claudeModels,
      ollamaConfigs,
      institution
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.listActivities = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const rows = await Activity.find({ colid }).sort({ activitytype: 1, activity: 1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.saveActivity = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const body = { ...req.body, colid };
    if (!text(body.activity) || !text(body.activitytype)) throw new Error("Activity and type are required");
    const data = { activity: text(body.activity), activitytype: text(body.activitytype), description: body.description, status: body.status || "Active", user: body.user, namecreated: body.namecreated };
    const row = body.id ? await Activity.findOneAndUpdate({ _id: body.id, colid }, data, { new: true }) : await Activity.create({ ...data, colid });
    res.json({ data: toClient(row) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.bulkActivities = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    for (const row of rows) {
      if (!text(row.activity) || !text(row.activitytype)) continue;
      await Activity.updateOne({ colid, activity: text(row.activity), activitytype: text(row.activitytype) }, { $set: { ...row, colid } }, { upsert: true });
    }
    res.json({ inserted: rows.length });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.deleteActivities = async (req, res) => {
  try { const { colid } = scoped(req.body); await Activity.deleteMany({ colid, _id: { $in: req.body.ids || [] } }); res.json({ ok: true }); } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.listCoordinators = async (req, res) => {
  try { const { colid } = scoped(req.query); const rows = await Coordinator.find({ colid }).sort({ updatedAt: -1 }).lean(); res.json({ data: rows.map(toClient) }); } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.saveCoordinator = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const activity = await Activity.findOne({ _id: req.body.activityid, colid }).lean();
    if (!activity) throw new Error("Activity is required");
    const selected = req.body.selecteduser || {};
    const payload = {
      colid,
      activityid: activity._id,
      activity: activity.activity,
      activitytype: activity.activitytype,
      user: selected.name || selected.user || req.body.user || "",
      useremail: selected.email || req.body.useremail || "",
      department: selected.department || req.body.department || "",
      designation: selected.designation || req.body.designation || "",
      startdate: dateValue(req.body.startdate),
      enddate: dateValue(req.body.enddate),
      default: req.body.default || "No",
      active: req.body.active || "Yes",
      namecreated: req.body.namecreated
    };
    if (!payload.useremail) throw new Error("User email is required");
    const row = await Coordinator.findOneAndUpdate({ colid, activityid: activity._id, useremail: payload.useremail }, { $set: payload }, { upsert: true, new: true });
    res.json({ data: toClient(row) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.deleteCoordinators = async (req, res) => {
  try { const { colid } = scoped(req.body); await Coordinator.deleteMany({ colid, _id: { $in: req.body.ids || [] } }); res.json({ ok: true }); } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.assignedActivities = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const user = text(req.query.user || req.query.useremail);
    const query = { colid, active: /^Yes$/i };
    if (user) query.useremail = regex(user);
    const rows = await Coordinator.find(query).sort({ default: -1, activitytype: 1, activity: 1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.listGroups = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const query = { colid };
    ["activitytype", "activity", "groupname", "status", "createdbyemail"].forEach((field) => { if (text(req.query[field])) query[field] = regex(req.query[field]); });
    if (text(req.query.mine) === "Yes") {
      const ids = await assignedActivityIds(colid, req.query.user || req.query.useremail);
      query.activityid = { $in: ids };
    }
    const rows = await Group.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.saveGroup = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const activity = await Activity.findOne({ _id: req.body.activityid, colid }).lean();
    if (!activity) throw new Error("Activity is required");
    const payload = {
      colid,
      activityid: activity._id,
      activity: activity.activity,
      activitytype: activity.activitytype,
      groupname: text(req.body.groupname),
      description: req.body.description,
      startdate: dateValue(req.body.startdate),
      enddate: dateValue(req.body.enddate),
      status: req.body.status || "Active",
      createdby: req.body.namecreated || req.body.createdby,
      createdbyemail: req.body.user || req.body.createdbyemail
    };
    if (!payload.groupname) throw new Error("Group name is required");
    const row = req.body.id ? await Group.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true }) : await Group.create(payload);
    res.json({ data: toClient(row) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.deleteGroups = async (req, res) => {
  try { const { colid } = scoped(req.body); await Group.deleteMany({ colid, _id: { $in: req.body.ids || [] } }); res.json({ ok: true }); } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.searchStudents = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const query = queryFromFilters(colid, req.body.filters);
    query.role = /^Student$/i;
    const rows = await User.find(query).sort({ program: 1, semester: 1, name: 1 }).limit(5000).lean();
    res.json({ data: rows });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.listMembers = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const query = { colid };
    if (text(req.query.groupid)) query.groupid = req.query.groupid;
    const rows = await Member.find(query).sort({ student: 1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.addMembers = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const group = await Group.findOne({ _id: req.body.groupid, colid }).lean();
    if (!group) throw new Error("Group is required");
    for (const student of req.body.students || []) {
      const payload = studentPayload(group, student, "Manual");
      await Member.updateOne({ colid, groupid: group._id, $or: [{ regno: payload.regno }, { studentemail: payload.studentemail }] }, { $set: payload }, { upsert: true });
    }
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.deleteMembers = async (req, res) => {
  try { const { colid } = scoped(req.body); await Member.deleteMany({ colid, _id: { $in: req.body.ids || [] } }); res.json({ ok: true }); } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.availableGroups = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const query = { colid, status: /^Active$/i };
    if (text(req.query.activitytype)) query.activitytype = regex(req.query.activitytype);
    if (text(req.query.groupname)) query.groupname = regex(req.query.groupname);
    const groups = await Group.find(query).sort({ activitytype: 1, groupname: 1 }).lean();
    const applications = await Application.find({ colid, studentemail: regex(req.query.user || req.query.email || "") }).lean();
    const members = await Member.find({ colid, studentemail: regex(req.query.user || req.query.email || "") }).lean();
    const appByGroup = new Map(applications.map((a) => [String(a.groupid), a.status]));
    const memberGroups = new Set(members.map((m) => String(m.groupid)));
    res.json({ data: groups.map((g) => ({ ...toClient(g), applicationstatus: appByGroup.get(String(g._id)) || "", memberstatus: memberGroups.has(String(g._id)) ? "Member" : "" })) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.myApplications = async (req, res) => {
  try { const { colid } = scoped(req.query); const rows = await Application.find({ colid, studentemail: regex(req.query.user || req.query.email || "") }).sort({ updatedAt: -1 }).lean(); res.json({ data: rows.map(toClient) }); } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.applyGroup = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const group = await Group.findOne({ _id: req.body.groupid, colid }).lean();
    if (!group) throw new Error("Group is required");
    const student = await User.findOne({ colid, role: /^Student$/i, $or: [{ email: regex(req.body.user || req.body.studentemail || "") }, { regno: text(req.body.regno) }] }).lean();
    const base = studentPayload(group, student || req.body, "Application");
    const payload = { ...base, application: req.body.application, reason: req.body.reason, attachmentlink: req.body.attachmentlink, status: "Pending" };
    if (!payload.studentemail && !payload.regno) throw new Error("Student identity is required");
    const row = await Application.findOneAndUpdate({ colid, groupid: group._id, $or: [{ studentemail: payload.studentemail }, { regno: payload.regno }] }, { $set: payload }, { upsert: true, new: true });
    res.json({ data: toClient(row) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.listApplications = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const query = { colid };
    if (text(req.query.groupid)) query.groupid = req.query.groupid;
    if (text(req.query.status)) query.status = regex(req.query.status);
    const rows = await Application.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.decideApplication = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const app = await Application.findOne({ _id: req.body.id, colid }).lean();
    if (!app) throw new Error("Application not found");
    const status = text(req.body.status) || "Approved";
    const row = await Application.findOneAndUpdate({ _id: app._id, colid }, { $set: { status, approver: req.body.namecreated, approveremail: req.body.user, approvercomment: req.body.approvercomment, approvaldate: new Date() } }, { new: true });
    if (/^approved$/i.test(status)) {
      const group = await Group.findOne({ _id: app.groupid, colid }).lean();
      await Member.updateOne({ colid, groupid: app.groupid, $or: [{ regno: app.regno }, { studentemail: app.studentemail }] }, { $set: studentPayload(group, app, "Approved application") }, { upsert: true });
    }
    res.json({ data: toClient(row) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.listEvents = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const query = { colid };
    ["activitytype", "activity", "groupid", "groupname", "event", "status", "createdbyemail"].forEach((field) => { if (text(req.query[field])) query[field] = regex(req.query[field]); });
    const rows = await Event.find(query).sort({ startdate: -1, event: 1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.saveEvent = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const group = await Group.findOne({ _id: req.body.groupid, colid }).lean();
    if (!group) throw new Error("Group is required");
    const payload = {
      colid,
      activityid: group.activityid,
      groupid: group._id,
      activity: group.activity,
      activitytype: group.activitytype,
      groupname: group.groupname,
      event: text(req.body.event),
      eventdescription: req.body.eventdescription,
      objective: req.body.objective,
      agenda: req.body.agenda,
      description: req.body.description,
      activitydetails: req.body.activitydetails,
      report: req.body.report,
      reportlink: req.body.reportlink,
      photos: Array.isArray(req.body.photos) ? req.body.photos : [],
      startdate: dateValue(req.body.startdate),
      enddate: dateValue(req.body.enddate),
      location: req.body.location,
      guests: req.body.guests,
      status: req.body.status || "Active",
      createdby: req.body.namecreated || req.body.createdby,
      createdbyemail: req.body.user || req.body.createdbyemail
    };
    if (!payload.event) throw new Error("Event is required");
    const row = req.body.id ? await Event.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true }) : await Event.create(payload);
    res.json({ data: toClient(row) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.deleteEvents = async (req, res) => {
  try { const { colid } = scoped(req.body); await Event.deleteMany({ colid, _id: { $in: req.body.ids || [] } }); res.json({ ok: true }); } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.generateReport = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const event = req.body.eventid ? await Event.findOne({ _id: req.body.eventid, colid }).lean() : req.body.event;
    if (!event) throw new Error("Event is required");
    const prompt = `Create a professional Sports/NCC/NSS event report.\nProvider instructions: ${req.body.prompt || ""}\nEvent data:\n${JSON.stringify(event, null, 2)}`;
    let report = "";
    if (/epaathsala/i.test(req.body.provider)) report = await callEpaathsala(colid, event);
    else if (/chatgpt|openai/i.test(req.body.provider)) report = await callOpenAi(colid, req.body.openaiModel, prompt);
    else if (/claude/i.test(req.body.provider)) report = await callClaude(colid, req.body.claudeModel, prompt);
    else if (/ollama/i.test(req.body.provider)) report = await callOllama(colid, req.body.ollamaConfigId, prompt);
    else report = await callGemini(colid, req.body.geminiModel, prompt);
    res.json({ report });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.eventMembers = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const event = await Event.findOne({ _id: req.query.eventid, colid }).lean();
    if (!event) throw new Error("Event is required");
    const rows = await Member.find({ colid, groupid: event.groupid }).sort({ student: 1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
exports.markEventAttendance = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const event = await Event.findOne({ _id: req.body.eventid, colid }).lean();
    if (!event) throw new Error("Event is required");
    const members = await Member.find({ colid, groupid: event.groupid }).lean();
    const selected = new Set((req.body.memberids || []).map(String));
    const dates = dateList(event.startdate, event.enddate);
    for (const member of members) {
      for (const attendancedate of dates) {
        await EventAttendance.updateOne(
          { colid, eventid: event._id, regno: member.regno, studentemail: member.studentemail, attendancedate },
          { $set: { ...studentPayload({ ...event, _id: event.groupid }, member, member.source), eventid: event._id, event: event.event, attendancedate, status: selected.has(String(member._id)) ? "Present" : "Absent", markedby: req.body.namecreated, markedbyemail: req.body.user } },
          { upsert: true }
        );
      }
    }
    if (req.body.markClassAttendance === "Yes") {
      const regnos = members.filter((m) => selected.has(String(m._id))).map((m) => m.regno).filter(Boolean);
      await NepLmsAttendance.updateMany({ colid, regno: { $in: regnos }, classdate: { $in: dates } }, { $set: { attendance: 1, comments: `Present through ${event.activitytype} event: ${event.event}`, changedby: req.body.user, changedat: new Date() } });
    }
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.report = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const query = { colid };
    ["activitytype", "activity", "groupname", "event", "status"].forEach((field) => { if (text(req.query[field])) query[field] = regex(req.query[field]); });
    if (text(req.query.eventids)) query._id = { $in: text(req.query.eventids).split(",").filter(Boolean) };
    if (req.query.fromdate || req.query.todate) {
      query.startdate = {};
      if (req.query.fromdate) query.startdate.$gte = dateValue(req.query.fromdate);
      if (req.query.todate) query.startdate.$lte = dateValue(req.query.todate);
    }
    const [events, members, attendance, applications, institution] = await Promise.all([
      Event.find(query).sort({ startdate: -1 }).lean(),
      Member.find({ colid }).lean(),
      EventAttendance.find({ colid }).lean(),
      Application.find({ colid }).lean(),
      InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null)
    ]);
    const groupIds = new Set(events.map((e) => String(e.groupid)));
    const scopedMembers = members.filter((m) => groupIds.has(String(m.groupid)));
    const eventIds = new Set(events.map((e) => String(e._id)));
    const scopedAttendance = attendance.filter((a) => eventIds.has(String(a.eventid)));
    const countBy = (rows, field) => Object.values(rows.reduce((acc, row) => {
      const name = text(row[field]) || "Blank";
      acc[name] = acc[name] || { name, value: 0 };
      acc[name].value += 1;
      return acc;
    }, {}));
    const byMonthType = Object.values(events.reduce((acc, row) => {
      const key = `${dateOnly(row.startdate).slice(0, 7) || "Blank"} ${row.activitytype || ""}`;
      acc[key] = acc[key] || { name: key, value: 0 };
      acc[key].value += 1;
      return acc;
    }, {}));
    res.json({
      institution,
      events: events.map(toClient),
      applications: applications.map(toClient),
      summary: {
        events: events.length,
        groups: groupIds.size,
        members: scopedMembers.length,
        applications: applications.length,
        present: scopedAttendance.filter((a) => /^Present$/i.test(a.status)).length,
        absent: scopedAttendance.filter((a) => /^Absent$/i.test(a.status)).length
      },
      charts: { byType: countBy(events, "activitytype"), byActivity: countBy(events, "activity"), byGroup: countBy(events, "groupname"), byMonthType }
    });
  } catch (error) { res.status(400).json({ message: error.message }); }
};
