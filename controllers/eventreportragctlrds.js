const crypto = require("crypto");
const multer = require("multer");
const XLSX = require("xlsx");
const Training = require("../Models/eventreportragtrainingds");
const Batch = require("../Models/eventreportragbatchds");
const Generated = require("../Models/eventreportraggeneratedds");
const EpaathsalaAiConfiguration = require("../Models/epaathsalaaiconfigurationds");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const requiredTrainingColumns = ["report_id", "event_title", "event_type", "program", "department", "audience", "tone", "objectives", "summary", "activities", "outcomes", "feedback", "conclusion"];
const requestColumns = ["event_title", "event_type", "event_date", "venue", "organizer", "program", "department", "audience", "participants_count", "duration", "chief_guest", "resource_persons", "objectives", "agenda", "highlights", "outcomes", "feedback_summary", "required_sections", "additional_requirements", "tone"];
const allSections = ["event_details", "objectives", "overview", "activities", "outcomes", "feedback", "conclusion"];
const listFields = new Set(["resource_persons", "objectives", "agenda", "highlights", "outcomes", "required_sections"]);
const ragEndpoints = {
  retrain: "/event-reports/retrain",
  generate: "/event-reports/generate"
};

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toColid = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const splitList = (value) => Array.isArray(value)
  ? value.map(text).filter(Boolean)
  : text(value).split(/[;\n]/).map((item) => item.trim()).filter(Boolean);
const excelDateToIso = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const cleaned = text(value);
  const date = new Date(cleaned);
  return cleaned && !Number.isNaN(date.valueOf()) ? date.toISOString().slice(0, 10) : cleaned;
};
const slug = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "event-report";
const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const markdownToHtml = (markdown) => text(markdown)
  .split("\n")
  .map((line) => {
    if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
    if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
    if (/^\d+\.\s/.test(line)) return `<p>${escapeHtml(line)}</p>`;
    return line ? `<p>${escapeHtml(line)}</p>` : "";
  })
  .join("\n");

const sectionsToMarkdown = (title, sections = {}) => {
  const lines = [`# ${text(title) || "Event Report"}`, ""];
  Object.entries(sections || {}).forEach(([key, value]) => {
    if (!text(value)) return;
    lines.push(`## ${text(key).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}`);
    lines.push(text(value), "");
  });
  return lines.join("\n");
};

const buildRagUrl = (server, endpoint, query = "") => {
  const base = text(server).replace(/\/+$/, "");
  if (!base) return "";
  return `${base}${endpoint}${query}`;
};

const resolveRagConfig = async (colid, providedServer = "") => {
  const server = text(providedServer);
  if (server) {
    const configured = await EpaathsalaAiConfiguration.findOne({ colid, server, active: "Yes" }).lean();
    return { server, xapikey: configured?.xapikey || "" };
  }
  const configured = await EpaathsalaAiConfiguration.findOne({ colid, active: "Yes", default: "Yes" }).lean()
    || await EpaathsalaAiConfiguration.findOne({ colid, active: "Yes" }).lean();
  return { server: configured?.server || "", xapikey: configured?.xapikey || "" };
};

const ragHeaders = (config, extra = {}) => {
  const headers = { ...extra };
  if (config?.xapikey) headers["X-Admin-Key"] = config.xapikey;
  return headers;
};

const callRagRetrain = async ({ colid, ragserver, file, mode }) => {
  const config = await resolveRagConfig(colid, ragserver);
  if (!config.server) return null;
  const url = buildRagUrl(config.server, ragEndpoints.retrain, `?mode=${encodeURIComponent(mode)}`);
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: file.mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), file.originalname || "event_reports.xlsx");
  const response = await fetch(url, { method: "POST", headers: ragHeaders(config), body: form });
  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { raw: bodyText };
  }
  if (!response.ok) throw new Error(body?.detail || body?.message || body?.error || `RAG retrain failed with status ${response.status}`);
  return { config, body };
};

const callRagGenerate = async ({ colid, ragserver, request }) => {
  const config = await resolveRagConfig(colid, ragserver);
  if (!config.server) return null;
  const response = await fetch(buildRagUrl(config.server, ragEndpoints.generate), {
    method: "POST",
    headers: ragHeaders(config, { "Content-Type": "application/json", Accept: "application/json" }),
    body: JSON.stringify(request)
  });
  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { report_markdown: bodyText };
  }
  if (!response.ok) throw new Error(body?.detail || body?.message || body?.error || `RAG generation failed with status ${response.status}`);
  return { config, body };
};

const readSheet = (buffer, sheetName) => {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Workbook must contain a sheet named "${sheetName}".`);
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
};

const rowHasData = (row) => Object.values(row || {}).some((value) => text(value));

const tokenise = (value) => text(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 1);
const vectorise = (value) => {
  const map = new Map();
  tokenise(value).forEach((token) => map.set(token, (map.get(token) || 0) + 1));
  return map;
};
const cosine = (a, b) => {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  a.forEach((count, token) => {
    magA += count * count;
    dot += count * (b.get(token) || 0);
  });
  b.forEach((count) => { magB += count * count; });
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
};
const trainingText = (row) => [
  row.event_title, row.event_type, row.program, row.department, row.audience, row.tone,
  row.objectives, row.summary, row.activities, row.outcomes, row.feedback, row.conclusion
].map(text).join(" ");
const requestText = (request) => [
  request.event_title, request.event_type, request.program, request.department, request.audience, request.tone,
  ...(request.objectives || []), ...(request.agenda || []), ...(request.highlights || []), ...(request.outcomes || []), request.feedback_summary
].map(text).join(" ");
const vocabularySize = (rows) => new Set(rows.flatMap((row) => tokenise(trainingText(row)))).size;

const normalizeRequest = (input = {}, fallbackId = "") => {
  const request = {};
  requestColumns.forEach((key) => {
    if (listFields.has(key)) request[key] = splitList(input[key]);
    else if (key === "participants_count") request[key] = num(input[key], 0);
    else if (key === "event_date") request[key] = excelDateToIso(input[key]);
    else if (["chief_guest", "feedback_summary", "additional_requirements"].includes(key)) request[key] = text(input[key]) || null;
    else request[key] = text(input[key]);
  });
  if (!request.required_sections.length) request.required_sections = allSections;
  if (!request.tone) request.tone = "formal";
  return { requestId: fallbackId || `REQ-${Date.now()}`, request };
};

const validateRequest = (request) => {
  const missing = ["event_title", "event_type", "event_date", "venue", "organizer", "program", "department", "audience", "duration"]
    .filter((field) => !text(request[field]));
  if (!request.objectives?.length) missing.push("objectives");
  if (!request.agenda?.length) missing.push("agenda");
  return missing;
};

const findSimilar = async (colid, request) => {
  const rows = await Training.find({ colid }).lean();
  const source = vectorise(requestText(request));
  return rows
    .map((row) => ({
      report_id: row.report_id,
      event_title: row.event_title,
      event_type: row.event_type,
      program: row.program,
      department: row.department,
      similarity: Number(cosine(source, vectorise(trainingText(row))).toFixed(4))
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
};

const sectionText = (request, similar) => {
  const guest = request.chief_guest ? ` Chief guest/resource lead: ${request.chief_guest}.` : "";
  const resourcePersons = request.resource_persons?.length ? ` Resource persons: ${request.resource_persons.join(", ")}.` : "";
  const participantText = request.participants_count > 0 ? `${request.participants_count}` : "not supplied";
  return {
    event_details: `The event "${request.event_title}" was conducted as a ${request.event_type} on ${request.event_date} at ${request.venue}. It was organized by ${request.organizer} for ${request.audience} under ${request.program}, ${request.department}. The duration was ${request.duration}, and the participant count was ${participantText}.${guest}${resourcePersons}`,
    objectives: `The objectives were: ${request.objectives.join("; ")}.`,
    overview: `The programme addressed the stated objectives through a structured ${request.tone || "formal"} event plan. ${similar.length ? `The generated report was grounded by similar reviewed reports such as ${similar.map((item) => item.event_title).join(", ")}.` : "No close historical match was available, so the report uses only the submitted event facts."}`,
    activities: `Activities conducted: ${request.agenda.join("; ")}.${request.highlights?.length ? ` Key highlights included ${request.highlights.join("; ")}.` : ""}`,
    outcomes: request.outcomes?.length ? `Documented outcomes: ${request.outcomes.join("; ")}.` : `The event supported the stated objectives and created documented learning or participation value for ${request.audience}.`,
    feedback: request.feedback_summary ? `Feedback summary: ${request.feedback_summary}` : "No feedback summary was supplied for this event.",
    conclusion: `The ${request.event_type} titled "${request.event_title}" was completed as per the submitted details. ${request.additional_requirements ? `Additional requirement noted: ${request.additional_requirements}` : ""}`.trim()
  };
};

const buildReport = (request, similar) => {
  const sections = sectionText(request, similar);
  const selected = (request.required_sections || allSections).filter((section) => allSections.includes(section));
  const lines = [`# ${request.event_title}`, ""];
  selected.forEach((section) => {
    const title = section.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    lines.push(`## ${title}`, sections[section] || "", "");
  });
  lines.push("## Similar Historical Reports");
  if (similar.length) similar.forEach((item, index) => lines.push(`${index + 1}. ${item.event_title} (${item.event_type}) - similarity ${item.similarity}`));
  else lines.push("No trained reports are available for comparison.");
  const markdown = lines.join("\n");
  const html = markdownToHtml(markdown);
  return { sections, report_markdown: markdown, report_html: html };
};

exports.train = async (req, res) => {
  try {
    const colid = toColid(req.body.colid);
    const mode = text(req.body.mode).toLowerCase() === "reset" ? "reset" : "append";
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file?.buffer) return res.status(400).json({ success: false, message: "Select an Excel training file" });
    const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const existing = await Batch.findOne({ colid, sha256 }).lean();
    if (existing && mode !== "reset") {
      return res.json({ success: true, skipped: true, message: "This workbook was already trained", summary: existing });
    }
    const sourceRows = readSheet(req.file.buffer, "Event_Reports").filter(rowHasData);
    if (!sourceRows.length) return res.status(400).json({ success: false, message: "Event_Reports sheet contains no rows" });
    const missingColumns = requiredTrainingColumns.filter((column) => !Object.prototype.hasOwnProperty.call(sourceRows[0], column));
    if (missingColumns.length) return res.status(400).json({ success: false, message: `Missing columns: ${missingColumns.join(", ")}` });
    const ragResult = await callRagRetrain({ colid, ragserver: req.body.ragserver, file: req.file, mode });
    if (mode === "reset") {
      await Training.deleteMany({ colid });
      await Batch.deleteMany({ colid });
    }
    const batchid = `EVTRAG-${colid}-${Date.now()}`;
    const rows = sourceRows.map((row) => ({
      colid,
      batchid,
      sourcefile: req.file.originalname || "",
      name: text(req.body.name),
      user: text(req.body.user),
      ...Object.fromEntries(requiredTrainingColumns.map((column) => [column, text(row[column])]))
    }));
    await Training.insertMany(rows);
    const allRows = await Training.find({ colid }).lean();
    const totalBatches = await Batch.countDocuments({ colid });
    const batch = await Batch.create({
      colid,
      batchid,
      filename: req.file.originalname || "",
      sha256,
      mode,
      new_reports: rows.length,
      total_reports: num(ragResult?.body?.total_reports, allRows.length),
      total_batches: num(ragResult?.body?.total_batches, totalBatches + 1),
      vocabulary_size: num(ragResult?.body?.vocabulary_size, vocabularySize(allRows)),
      ragserver: ragResult?.config?.server || "",
      ragstatus: ragResult ? "Remote RAG trained" : "Local RAG updated",
      name: text(req.body.name),
      user: text(req.body.user)
    });
    res.json({ success: true, summary: batch, sample: rows.slice(0, 5), progress: [{ label: "Workbook parsed", value: 25 }, { label: "Reports stored", value: 65 }, { label: "Vocabulary rebuilt", value: 90 }, { label: "Training complete", value: 100 }] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.batches = async (req, res) => {
  try {
    const colid = toColid(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await Batch.find({ colid }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBatches = async (req, res) => {
  try {
    const colid = toColid(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one batch" });
    const batches = await Batch.find({ colid, _id: { $in: ids } }).lean();
    await Training.deleteMany({ colid, batchid: { $in: batches.map((item) => item.batchid).filter(Boolean) } });
    await Batch.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: batches.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const generateOne = async ({ colid, ragserver, requestId, request, name, user }) => {
  const missing = validateRequest(request);
  if (missing.length) throw new Error(`Request ${requestId || request.event_title || ""} missing: ${missing.join(", ")}`);
  const ragResult = await callRagGenerate({ colid, ragserver, request });
  const similar = ragResult?.body?.similar_events || ragResult?.body?.matched_reports || await findSimilar(colid, request);
  const localReport = ragResult ? null : buildReport(request, similar);
  const reportMarkdown = ragResult?.body?.report_markdown
    || ragResult?.body?.markdown
    || ragResult?.body?.report
    || (ragResult?.body?.sections ? sectionsToMarkdown(request.event_title, ragResult.body.sections) : "")
    || localReport?.report_markdown
    || "";
  const reportHtml = ragResult?.body?.report_html || (reportMarkdown ? markdownToHtml(reportMarkdown) : localReport?.report_html || "");
  return Generated.create({
    colid,
    request_id: requestId,
    name,
    user,
    event_title: request.event_title,
    event_type: request.event_type,
    event_date: request.event_date,
    venue: request.venue,
    organizer: request.organizer,
    program: request.program,
    department: request.department,
    audience: request.audience,
    participants_count: request.participants_count,
    duration: request.duration,
    tone: request.tone,
    request_json: request,
    similar_events: similar,
    report_markdown: reportMarkdown,
    report_html: reportHtml,
    ragserver: ragResult?.config?.server || ""
  });
};

exports.generate = async (req, res) => {
  try {
    const colid = toColid(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const name = text(req.body.name);
    const user = text(req.body.user);
    const created = [];
    const errors = [];
    if (req.file?.buffer) {
      const rows = readSheet(req.file.buffer, "Event_Requests").filter(rowHasData);
      for (const [index, row] of rows.entries()) {
        try {
          const { requestId, request } = normalizeRequest(row, `REQ-${Date.now()}-${index + 2}`);
          const generated = await generateOne({ colid, ragserver: req.body.ragserver, requestId, request, name, user });
          created.push(generated);
        } catch (error) {
          errors.push({ row: index + 2, error: error.message });
        }
      }
    } else {
      const { requestId, request } = normalizeRequest(req.body.request || req.body, `REQ-${Date.now()}`);
      created.push(await generateOne({ colid, ragserver: req.body.ragserver, requestId, request, name, user }));
    }
    res.json({ success: true, count: created.length, errors, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generated = async (req, res) => {
  try {
    const colid = toColid(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    ["event_type", "program", "department", "tone", "status"].forEach((field) => {
      if (text(req.query[field])) filter[field] = new RegExp(text(req.query[field]), "i");
    });
    if (text(req.query.startdate) || text(req.query.enddate)) {
      filter.event_date = {};
      if (text(req.query.startdate)) filter.event_date.$gte = text(req.query.startdate);
      if (text(req.query.enddate)) filter.event_date.$lte = text(req.query.enddate);
    }
    const data = await Generated.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteGenerated = async (req, res) => {
  try {
    const colid = toColid(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one report" });
    const result = await Generated.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.downloadHtml = async (req, res) => {
  try {
    const colid = toColid(req.query.colid);
    const ids = text(req.query.ids).split(",").map(text).filter(Boolean);
    if (colid === undefined || !ids.length) return res.status(400).send("colid and ids are required");
    const rows = await Generated.find({ colid, _id: { $in: ids } }).sort({ event_date: 1, event_title: 1 }).lean();
    const body = rows.map((row) => `<article class="report">${row.report_html || ""}</article>`).join('<div class="page-break"></div>');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Event reports</title><style>body{font-family:Arial,sans-serif;color:#111;margin:24px}.report{max-width:900px;margin:0 auto 32px}.page-break{page-break-after:always}h1{text-align:center;font-size:22px}h2{font-size:16px;border-bottom:1px solid #111;padding-bottom:4px}p{line-height:1.45}@media print{button{display:none}body{margin:14mm}.report{page-break-inside:avoid}}</style></head><body><button onclick="window.print()">Print</button>${body}</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${slug(rows[0]?.event_title || "event-reports")}.html"`);
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
};
