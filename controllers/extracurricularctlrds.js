const Activity = require("../Models/extracurricularactivityds");
const Coordinator = require("../Models/extracurricularcoordinatords");
const Event = require("../Models/extracurriculareventds");
const Participant = require("../Models/extracurricularparticipantds");
const EventAttendance = require("../Models/extracurricularattendanceds");
const User = require("../Models/user");
const InsDetails = require("../Models/insdetails");
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
const toClient = (row) => {
  const item = row?.toObject ? row.toObject() : { ...(row || {}) };
  ["startdate", "enddate"].forEach((field) => {
    if (item[field]) item[field] = new Date(item[field]).toISOString().slice(0, 10);
  });
  return item;
};
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const applyFilters = (query, source, fields) => fields.forEach((field) => {
  if (text(source[field])) query[field] = regex(source[field]);
});
const dateList = (start, end) => {
  const dates = [];
  const first = dateValue(start);
  const last = dateValue(end || start);
  if (!first || !last) return dates;
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) dates.push(d.toISOString().slice(0, 10));
  return dates;
};

const activityTypes = ["Cultural", "Singing", "Dance", "Drama", "Music", "Debate", "Literary", "Fine Arts", "Photography", "NSS", "NCC", "Club", "Outreach", "Workshop", "Seminar", "Festival", "Competition", "Other"];
const geminiModels = ["gemini-3.5-pro", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
const openAiModels = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5", "gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"];
const claudeModels = ["claude-opus-4-1-20250805", "claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"];

const aiConfig = async (colid, type) => AiConfiguration.findOne({ colid, type: new RegExp(`^${esc(type)}$`, "i"), active: /^yes$/i, default: /^yes$/i }).lean()
  || AiConfiguration.findOne({ colid, type: new RegExp(`^${esc(type)}$`, "i"), active: /^yes$/i }).sort({ updatedAt: -1 }).lean();
const readGemini = (payload = {}) => payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "";
async function callGemini(colid, model, prompt) {
  const config = await aiConfig(colid, "Gemini");
  if (!config?.apikey) throw new Error("Default active Gemini configuration is missing");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent?key=${config.apikey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Gemini request failed");
  return readGemini(data);
}
async function callOpenAi(colid, model, prompt) {
  const config = await aiConfig(colid, "OpenAI");
  if (!config?.apikey) throw new Error("Default active OpenAI configuration is missing");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apikey}` },
    body: JSON.stringify({ model: model || "gpt-4.1-mini", input: prompt })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed");
  return data.output_text || data.output?.flatMap((o) => o.content || []).map((c) => c.text || "").join("\n") || "";
}
async function callClaude(colid, model, prompt) {
  const config = await aiConfig(colid, "Claude");
  if (!config?.apikey) throw new Error("Default active Claude configuration is missing");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.apikey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model || "claude-3-5-sonnet-latest", max_tokens: 4000, messages: [{ role: "user", content: prompt }] })
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Ollama request failed");
  return data.response || "";
}
async function callEpaathsala(colid, event) {
  const config = await EpaathsalaAiConfiguration.findOne({ colid, active: "Yes", default: "Yes" }).lean() || await EpaathsalaAiConfiguration.findOne({ colid, active: "Yes" }).lean();
  if (!config?.server) throw new Error("Active Epaathsala AI server is missing");
  const request = {
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
  };
  const headers = { "Content-Type": "application/json" };
  if (config.xapikey) headers["X-Admin-Key"] = config.xapikey;
  const response = await fetch(`${text(config.server).replace(/\/$/, "")}/event-reports/generate`, { method: "POST", headers, body: JSON.stringify(request) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.detail || data?.message || "Epaathsala AI report generation failed");
  return data.report_markdown || data.report || data.report_html || JSON.stringify(data, null, 2);
}

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [activities, events, users, students, ollamaConfigs, institution] = await Promise.all([
      Activity.find({ colid }).sort({ type: 1, activity: 1 }).lean(),
      Event.find({ colid }).sort({ startdate: -1, event: 1 }).limit(3000).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email user role department designation").sort({ name: 1 }).limit(5000).lean(),
      User.find({ colid, role: /^Student$/i }).select("academicyear regulation program programcode semester section").limit(5000).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean(),
      InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null)
    ]);
    res.json({
      success: true,
      institution,
      activityTypes,
      geminiModels,
      openAiModels,
      claudeModels,
      ollamaConfigs,
      activities: activities.map(toClient),
      events: events.map(toClient),
      users: users.map((row) => ({ ...row, label: `${row.name || ""} ${row.email || row.user || ""} (${row.role || ""})` })),
      academicyears: uniqueSorted(students.map((row) => row.academicyear)),
      regulations: uniqueSorted(students.map((row) => row.regulation)),
      programs: uniqueSorted(students.map((row) => row.program)),
      programcodes: uniqueSorted(students.map((row) => row.programcode)),
      semesters: uniqueSorted(students.map((row) => row.semester)),
      sections: uniqueSorted(students.map((row) => row.section))
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listActivities = async (req, res) => {
  try {
    const query = scoped(req.query);
    applyFilters(query, req.query, ["activity", "type", "status"]);
    const data = await Activity.find(query).sort({ type: 1, activity: 1 }).limit(5000).lean();
    res.json({ success: true, data: data.map(toClient) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.saveActivity = async (req, res) => {
  try {
    const payload = { ...scoped(req.body), activity: text(req.body.activity), type: text(req.body.type), description: text(req.body.description), status: text(req.body.status) || "Active", user: text(req.body.user), namecreated: text(req.body.namecreated) };
    if (!payload.activity || !payload.type) return res.status(400).json({ success: false, message: "Activity and type are required" });
    const data = req.body.id ? await Activity.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true }) : await Activity.findOneAndUpdate({ colid: payload.colid, activity: payload.activity, type: payload.type }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true, data: toClient(data) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.bulkActivities = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => ({ ...scoped(req.body), activity: text(row.activity), type: text(row.type), description: text(row.description), status: text(row.status) || "Active", user: text(req.body.user) })).filter((row) => row.activity && row.type);
    const result = docs.length ? await Activity.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: result.length });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.deleteActivities = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await Activity.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.listCoordinators = async (req, res) => {
  try {
    const query = scoped(req.query);
    applyFilters(query, req.query, ["activity", "activitytype", "user", "useremail", "coordinatorrole", "default", "active"]);
    if (text(req.query.activityid)) query.activityid = req.query.activityid;
    const data = await Coordinator.find(query).sort({ activity: 1, user: 1 }).limit(5000).lean();
    res.json({ success: true, data: data.map(toClient) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.saveCoordinator = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const activity = await Activity.findOne({ _id: req.body.activityid, colid }).lean();
    if (!activity) return res.status(400).json({ success: false, message: "Select activity" });
    const user = req.body.selecteduser || {};
    const payload = { colid, activityid: activity._id, activity: activity.activity, activitytype: activity.type, coordinatorrole: text(req.body.coordinatorrole) || "Coordinator", user: text(req.body.userName || user.name || req.body.person), useremail: text(req.body.useremail || user.email || user.user), department: text(user.department || req.body.department), designation: text(user.designation || req.body.designation), default: text(req.body.default) || "No", active: text(req.body.active) || "Yes", createdby: text(req.body.user) };
    if (!payload.useremail) return res.status(400).json({ success: false, message: "Select user" });
    const data = req.body.id ? await Coordinator.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true }) : await Coordinator.findOneAndUpdate({ colid, activityid: activity._id, useremail: payload.useremail }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true, data: toClient(data) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.deleteCoordinators = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await Coordinator.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.assignedActivities = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const email = text(req.query.user || req.query.useremail);
    const data = await Coordinator.find({ colid, useremail: new RegExp(`^${esc(email)}$`, "i"), active: /^Yes$/i }).sort({ activity: 1 }).lean();
    res.json({ success: true, data: data.map(toClient) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.listEvents = async (req, res) => {
  try {
    const query = scoped(req.query);
    applyFilters(query, req.query, ["activity", "activitytype", "event", "status", "createdbyemail"]);
    if (text(req.query.activityid)) query.activityid = req.query.activityid;
    if (text(req.query.fromdate) || text(req.query.todate)) {
      query.startdate = {};
      if (text(req.query.fromdate)) query.startdate.$gte = new Date(`${text(req.query.fromdate)}T00:00:00`);
      if (text(req.query.todate)) query.startdate.$lte = new Date(`${text(req.query.todate)}T23:59:59`);
    }
    const data = await Event.find(query).sort({ startdate: -1, event: 1 }).limit(5000).lean();
    res.json({ success: true, data: data.map(toClient) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.saveEvent = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const activity = await Activity.findOne({ _id: req.body.activityid, colid }).lean();
    if (!activity) return res.status(400).json({ success: false, message: "Select activity" });
    const payload = {
      colid, activityid: activity._id, activity: activity.activity, activitytype: activity.type, event: text(req.body.event), eventdescription: text(req.body.eventdescription), objective: text(req.body.objective), agenda: text(req.body.agenda), description: text(req.body.description), activitydetails: text(req.body.activitydetails), report: text(req.body.report), reportlink: text(req.body.reportlink), startdate: dateValue(req.body.startdate), enddate: dateValue(req.body.enddate || req.body.startdate), guests: text(req.body.guests), status: text(req.body.status) || "Active", createdby: text(req.body.namecreated || req.body.name), createdbyemail: text(req.body.user)
    };
    if (!payload.event) return res.status(400).json({ success: false, message: "Event is required" });
    const data = req.body.id ? await Event.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true }) : await Event.create(payload);
    res.json({ success: true, data: toClient(data) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.deleteEvents = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await Promise.all([Event.deleteMany({ colid, _id: { $in: ids } }), Participant.deleteMany({ colid, eventid: { $in: ids } }), EventAttendance.deleteMany({ colid, eventid: { $in: ids } })]);
    res.json({ success: true, deleted: ids.length });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.generateReport = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const event = req.body.eventid ? await Event.findOne({ _id: req.body.eventid, colid }).lean() : req.body.event || {};
    if (!event) return res.status(400).json({ success: false, message: "Event not found" });
    const prompt = `Create a professional extracurricular event report. Use headings, concise paragraphs, objective, agenda, activity details, outcomes and conclusion.\n\nEvent data:\n${JSON.stringify(event, null, 2)}\n\nAdditional prompt:\n${text(req.body.prompt)}`;
    const provider = text(req.body.provider || "Gemini").toLowerCase();
    let report = "";
    if (provider === "epaathsala ai" || provider === "epaathsala") report = await callEpaathsala(colid, event);
    else if (provider === "openai" || provider === "chatgpt") report = await callOpenAi(colid, req.body.openaiModel, prompt);
    else if (provider === "claude") report = await callClaude(colid, req.body.claudeModel, prompt);
    else if (provider === "ollama") report = await callOllama(colid, req.body.ollamaConfigId, prompt);
    else report = await callGemini(colid, req.body.geminiModel, prompt);
    res.json({ success: true, report });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.searchStudents = async (req, res) => {
  try {
    const query = { ...scoped(req.body), role: /^Student$/i };
    const filters = Array.isArray(req.body.filters) ? req.body.filters : [];
    filters.forEach((item) => { if (item.field && text(item.value)) query[item.field] = regex(item.value); });
    const data = await User.find(query).select("name email phone regno academicyear regulation program programcode semester section").sort({ name: 1 }).limit(Number(req.body.limit || 5000)).lean();
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.listParticipants = async (req, res) => {
  try {
    const query = scoped(req.query);
    applyFilters(query, req.query, ["event", "activitytype", "student", "regno", "program", "programcode", "semester", "section"]);
    if (text(req.query.eventid)) query.eventid = req.query.eventid;
    const data = await Participant.find(query).sort({ event: 1, student: 1 }).limit(5000).lean();
    res.json({ success: true, data: data.map(toClient) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.addParticipants = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const event = await Event.findOne({ _id: req.body.eventid, colid }).lean();
    if (!event) return res.status(400).json({ success: false, message: "Select event" });
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    let saved = 0;
    for (const student of students) {
      const payload = { colid, eventid: event._id, event: event.event, activity: event.activity, activitytype: event.activitytype, studentid: student._id || student.studentid, student: text(student.name || student.student), studentemail: text(student.email || student.studentemail), regno: text(student.regno), academicyear: text(student.academicyear), regulation: text(student.regulation), program: text(student.program), programcode: text(student.programcode), semester: text(student.semester), section: text(student.section), status: "Active", user: text(req.body.user) };
      if (!payload.regno && !payload.studentemail) continue;
      await Participant.findOneAndUpdate({ colid, eventid: event._id, regno: payload.regno }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
      for (const attendancedate of dateList(event.startdate, event.enddate)) {
        await EventAttendance.findOneAndUpdate({ colid, eventid: event._id, regno: payload.regno, attendancedate }, { ...payload, attendancedate, attendance: 0, status: "Absent" }, { upsert: true, new: true, setDefaultsOnInsert: true });
      }
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.deleteParticipants = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const participants = await Participant.find({ colid, _id: { $in: ids } }).lean();
    await Participant.deleteMany({ colid, _id: { $in: ids } });
    await EventAttendance.deleteMany({ colid, $or: participants.map((p) => ({ eventid: p.eventid, regno: p.regno })) });
    res.json({ success: true, deleted: ids.length });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.listAttendance = async (req, res) => {
  try {
    const query = scoped(req.query);
    if (text(req.query.eventid)) query.eventid = req.query.eventid;
    applyFilters(query, req.query, ["event", "activitytype", "student", "regno", "attendancedate", "status"]);
    const data = await EventAttendance.find(query).sort({ attendancedate: 1, student: 1 }).limit(10000).lean();
    res.json({ success: true, data: data.map(toClient) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.markAttendance = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const rows = await EventAttendance.find({ colid, _id: { $in: ids } }).lean();
    await EventAttendance.updateMany({ colid, _id: { $in: ids } }, { attendance: 1, status: "Present", user: text(req.body.user) });
    res.json({ success: true, updated: rows.length });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
exports.report = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const ids = text(req.query.eventids).split(",").map(text).filter(Boolean);
    const eventQuery = { colid };
    if (ids.length) eventQuery._id = { $in: ids };
    applyFilters(eventQuery, req.query, ["activitytype", "activity", "event", "status"]);
    if (text(req.query.fromdate) || text(req.query.todate)) {
      eventQuery.startdate = {};
      if (text(req.query.fromdate)) eventQuery.startdate.$gte = new Date(`${text(req.query.fromdate)}T00:00:00`);
      if (text(req.query.todate)) eventQuery.startdate.$lte = new Date(`${text(req.query.todate)}T23:59:59`);
    }
    const [events, institution] = await Promise.all([Event.find(eventQuery).sort({ startdate: 1 }).lean(), InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null)]);
    const eventIds = events.map((row) => row._id);
    const [participants, attendance] = await Promise.all([Participant.find({ colid, eventid: { $in: eventIds } }).lean(), EventAttendance.find({ colid, eventid: { $in: eventIds } }).lean()]);
    const countBy = (rows, fn) => Object.entries(rows.reduce((acc, row) => { const key = fn(row) || "-"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
    res.json({ success: true, institution, events: events.map(toClient), participants, attendance, summary: { events: events.length, participants: participants.length, present: attendance.filter((row) => row.attendance === 1).length, absent: attendance.filter((row) => row.attendance !== 1).length }, charts: { byType: countBy(events, (r) => r.activitytype), byActivity: countBy(events, (r) => r.activity), byMonthType: countBy(events, (r) => `${r.startdate ? new Date(r.startdate).toISOString().slice(0, 7) : "-"} ${r.activitytype || "-"}`) } });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
