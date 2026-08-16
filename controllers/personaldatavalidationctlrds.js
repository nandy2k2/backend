const XLSX = require("xlsx");
const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const pdfParse = require("pdf-parse");
let mammoth = null;
try {
  mammoth = require("mammoth");
} catch (error) {
  mammoth = null;
}
const Project = require("../Models/projects");
const Publication = require("../Models/publications");
const Patent = require("../Models/patents");
const TeacherFellow = require("../Models/teacherfs");
const Consultancy = require("../Models/consultancy");
const Seminar = require("../Models/seminar");
const Book = require("../Models/book");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const allowedDocumentTypes = /\.(pdf|doc|docx|jpg|jpeg|png|webp)$/i;
const allowedMimeTypes = /pdf|word|officedocument|msword|jpeg|jpg|png|webp/i;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filename = file.originalname || "";
    if (allowedDocumentTypes.test(filename) || allowedMimeTypes.test(file.mimetype || "")) return cb(null, true);
    return cb(new Error("Only PDF, Word and image files are allowed as supporting documents."));
  }
});
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(escapeRegex(value), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const readSheet = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
};
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

const workflowFields = [
  "submissionstatus",
  "documentstatus",
  "aivalidationstatus",
  "overallstatus",
  "approvercomment",
  "usercomment",
  "aivalidationcomment",
  "accreditationframework",
  "filelink",
  "doclink",
  "documentocrtext"
];

const excludedValidationFields = new Set([
  "_id",
  "__v",
  "createdAt",
  "updatedAt",
  "comments",
  "status1",
  "submissionstatus",
  "documentstatus",
  "aivalidationstatus",
  "overallstatus",
  "approvercomment",
  "usercomment",
  "aivalidationcomment",
  "documentocrtext"
]);

const commonAiModels = [
  "gemini-3.1-pro",
  "gemini-3-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash"
];

const modelMap = {
  projects: {
    label: "Projects",
    Model: Project,
    fields: ["project", "agency", "type", "yop", "department", "funds", "level", "duration"],
    numberFields: ["funds"]
  },
  publications: {
    label: "Publications",
    Model: Publication,
    fields: ["department", "title", "journal", "yop", "issn", "articlelink", "journallink", "hindex", "citation", "citationindex", "ugclisted"],
    numberFields: []
  },
  patents: {
    label: "Patents",
    Model: Patent,
    fields: ["title", "patentnumber", "doa", "agency", "patentstatus", "yop"],
    numberFields: []
  },
  teacherfellow: {
    label: "Fellowship and Awards",
    Model: TeacherFellow,
    fields: ["year", "tname", "workshop", "profbody", "amount", "source", "level", "award", "purpose", "duration"],
    numberFields: ["amount"]
  },
  consultancy: {
    label: "Consultancy",
    Model: Consultancy,
    fields: ["year", "duration", "consultant", "advisor", "department", "trainees", "title", "role", "agency", "contact", "revenue"],
    numberFields: ["trainees", "contact", "revenue"]
  },
  seminar: {
    label: "Seminars",
    Model: Seminar,
    fields: ["title", "duration", "yop", "membership", "amount", "role", "paper", "level", "type"],
    numberFields: ["amount"]
  },
  book: {
    label: "Books and Chapters",
    Model: Book,
    fields: ["booktitle", "papertitle", "proceeding", "yop", "issn", "publisher", "conferencename", "level", "type", "affiliated"],
    numberFields: []
  }
};

const getConfig = (kind) => {
  const config = modelMap[kind];
  if (!config) throw new Error("Invalid personal data type");
  return config;
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i }).sort({ _id: -1 }).lean();

const getGemini = async (colid) => AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();

const getOllama = async (colid, id) => {
  const query = { colid: Number(colid), active: /^yes$/i };
  return id
    ? OllamaConfiguration.findOne({ ...query, _id: id }).lean()
    : OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean();
};

const readGeminiText = (payload = {}) => payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();

const callGemini = async ({ colid, model, prompt }) => {
  const config = await getGemini(colid);
  if (!config?.apikey) throw new Error("Active/default Gemini configuration is missing");
  const models = [...new Set([text(model), ...commonAiModels].filter(Boolean))];
  let lastError = "";
  for (const geminiModel of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    if (response.ok) return readGeminiText(data) || "AI validation completed without detailed comments.";
    lastError = data?.error?.message || `Gemini request failed for ${geminiModel}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllama = async ({ colid, ollamaConfigId, prompt }) => {
  const config = await getOllama(colid, ollamaConfigId);
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${String(config.serveraddress || "").replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Ollama request failed");
  return data.response || "AI validation completed without detailed comments.";
};

const callAi = (body, prompt) => /^ollama$/i.test(text(body.provider))
  ? callOllama({ colid: body.colid, ollamaConfigId: body.ollamaConfigId || body.ollamaId, prompt })
  : callGemini({ colid: body.colid, model: body.geminiModel, prompt });

const validationRow = (row = {}, config) => {
  const allowed = ["name", ...config.fields, "filelink", "doclink", "accreditationframework"];
  return allowed.reduce((acc, field) => {
    if (!excludedValidationFields.has(field) && row[field] !== undefined && row[field] !== null && text(row[field]) !== "") {
      acc[field] = row[field];
    }
    return acc;
  }, {});
};

const suspiciousFieldHints = (row = {}) => {
  const badPattern = /\b(test|dummy|sample|asdf|qwerty|na123|xyz|abc|none|fake|trial|demo)\b/i;
  return Object.entries(row)
    .filter(([field, value]) => !excludedValidationFields.has(field) && badPattern.test(text(value)))
    .map(([field, value]) => `${field}: "${text(value)}"`);
};

const fetchDocumentText = async (url) => {
  const link = text(url);
  if (!link) return { available: false, reason: "No document link submitted.", text: "", contentType: "", filename: "" };
  try {
    const response = await fetch(link);
    if (!response.ok) return { available: false, reason: `Document could not be fetched. HTTP ${response.status}.`, text: "", contentType: "", filename: "" };
    const contentType = text(response.headers.get("content-type")).toLowerCase();
    const filename = decodeURIComponent(link.split("?")[0].split("/").pop() || "").toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    let extracted = "";
    if (contentType.includes("pdf") || filename.endsWith(".pdf")) {
      const parsed = await pdfParse(buffer);
      extracted = parsed.text || "";
    } else if (contentType.includes("word") || filename.endsWith(".docx")) {
      if (!mammoth) return { available: true, reason: "Word document submitted, but server Word extraction library is unavailable.", text: "", contentType, filename };
      const parsed = await mammoth.extractRawText({ buffer });
      extracted = parsed.value || "";
    } else if (contentType.includes("text") || contentType.includes("json") || contentType.includes("html") || /\.(txt|csv|json|html?)$/i.test(filename)) {
      extracted = buffer.toString("utf8");
    } else {
      return {
        available: true,
        reason: `Document submitted but text extraction is not supported for content type "${contentType || "unknown"}". AI should flag this as not fully verifiable unless the provider can inspect the file link.`,
        text: "",
        contentType,
        filename
      };
    }
    return {
      available: true,
      reason: extracted ? "Document text extracted for validation." : "Document fetched but no readable text was extracted.",
      text: extracted.slice(0, 24000),
      contentType,
      filename
    };
  } catch (error) {
    return { available: false, reason: `Document fetch/extraction failed: ${error.message}`, text: "", contentType: "", filename: "" };
  }
};

const documentMatchHints = (row = {}, documentText = "") => {
  const normalizedDoc = text(documentText).toLowerCase();
  const fields = Object.entries(row).filter(([field, value]) => !["filelink", "doclink", "accreditationframework", "user", "documentocrtext"].includes(field) && text(value));
  if (!normalizedDoc || !fields.length) return { matched: 0, total: fields.length, percentage: 0, absent: fields.map(([field, value]) => `${field}: ${text(value)}`) };
  const absent = [];
  let matched = 0;
  fields.forEach(([field, value]) => {
    const valueText = text(value).toLowerCase();
    const simpleTokens = valueText.split(/[^a-z0-9]+/i).filter((token) => token.length >= 3);
    const present = normalizedDoc.includes(valueText) || (simpleTokens.length > 0 && simpleTokens.filter((token) => normalizedDoc.includes(token)).length / simpleTokens.length >= 0.65);
    if (present) matched += 1;
    else absent.push(`${field}: ${text(value)}`);
  });
  return { matched, total: fields.length, percentage: fields.length ? Math.round((matched / fields.length) * 100) : 0, absent };
};

const documentContextFor = async (sourceRow = {}, body = {}, comparableRow = sourceRow) => {
  const ocrText = text(sourceRow.documentocrtext);
  const links = Array.from(new Set([sourceRow.filelink, sourceRow.doclink].map(text).filter(Boolean)));
  const link = links.join("\n");
  const requestedMode = text(body.documentValidationMode || body.documentmode || "both").toLowerCase();
  const mode = ["link", "extract", "both"].includes(requestedMode) ? requestedMode : "both";
  const shouldExtract = mode !== "link";
  let document;
  if (shouldExtract) {
    const extracted = await Promise.all(links.map((item) => fetchDocumentText(item)));
    document = {
      available: extracted.some((item) => item.available),
      reason: extracted.length ? extracted.map((item, index) => `Document ${index + 1}: ${item.reason}`).join(" | ") : "No document link submitted.",
      text: [
        ...extracted.map((item, index) => item.text ? `\n--- Document ${index + 1}: ${links[index]} ---\n${item.text}` : ""),
        ocrText ? `\n--- Browser OCR text from image evidence ---\n${ocrText}` : ""
      ].join("\n").slice(0, 28000),
      contentType: extracted.map((item) => item.contentType).filter(Boolean).join(", "),
      filename: extracted.map((item) => item.filename).filter(Boolean).join(", ")
    };
  } else {
    document = {
      available: links.length > 0,
      reason: links.length ? "All document links sent directly to AI without server-side text extraction." : "No document link submitted.",
      text: "",
      contentType: "",
      filename: ""
    };
  }
  document.link = link;
  document.links = links;
  document.mode = mode === "link" ? "Document link only" : mode === "extract" ? "Extracted text" : "Document link + extracted text";
  if (!shouldExtract && ocrText) {
    document.text = ocrText.slice(0, 12000);
    document.reason += " Browser OCR text is also available but was not sent because link-only mode is selected.";
  }
  const comparableFields = Object.keys(comparableRow).filter((field) => !["filelink", "doclink", "accreditationframework", "user", "documentocrtext"].includes(field) && text(comparableRow[field]));
  const match = shouldExtract
    ? documentMatchHints(comparableRow, document.text)
    : { matched: 0, total: comparableFields.length, percentage: 0, absent: [] };
  return { document, match };
};

const payloadFor = (config, source = {}) => {
  const payload = {
    colid: num(source.colid),
    user: text(source.user),
    name: text(source.name)
  };
  [...config.fields, ...workflowFields].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) payload[field] = config.numberFields.includes(field) ? num(source[field]) : source[field];
  });
  payload.status1 = text(source.status1 || source.submissionstatus || payload.submissionstatus || "Submitted");
  payload.comments = text(source.comments || source.approvercomment || source.usercomment || "NA");
  if (!payload.submissionstatus) payload.submissionstatus = "Submitted";
  if (!payload.overallstatus) payload.overallstatus = payload.submissionstatus;
  if (!payload.documentstatus) payload.documentstatus = payload.filelink || payload.doclink ? "Submitted" : "Blank";
  return payload;
};

const buildFilter = (req, config, userOnly = false) => {
  const source = req.method === "GET" ? req.query : req.body;
  const filter = { colid: num(source.colid) };
  if (userOnly) filter.user = text(source.user);
  [...config.fields, ...workflowFields, "name", "user", "status1", "comments"].forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  if (text(source.fromdate) || text(source.todate)) {
    const dateField = text(source.datefield || "createdAt");
    filter[dateField] = {};
    if (text(source.fromdate)) filter[dateField].$gte = new Date(source.fromdate);
    if (text(source.todate)) filter[dateField].$lte = new Date(`${source.todate}T23:59:59`);
  }
  return filter;
};

const validationPrompt = ({ label, row, framework, document, match, suspicious }) => `
You are validating an accreditation personal data submission for ${framework || "general accreditation"}.
Dataset: ${label}
Validate only the actual data fields supplied below. Do not validate comment/status/workflow fields.
The login/user/email field is intentionally excluded from validation. The submitted name field, if present, must still be validated.

Mandatory checks:
1. Flag suspicious/anomalous values such as "test", "dummy", "sample", "fake", "abc", placeholder values, unrealistic values, empty required evidence, or inconsistent year/amount/date values.
2. Check accuracy and plausibility. For example, if an agency/provider/journal/publisher/professional body appears fake or generic, such as "test agency", flag it. Do not invent certainty; state "appears unverifiable" where needed.
3. Check accreditation suitability for ${framework || "the selected framework"}.
4. Document evidence is mandatory. If no document is submitted, mark FAIL.
5. If a document link is submitted, inspect/use that document link directly wherever your provider/runtime supports URL or document-link review.
6. If extracted document text is supplied, compare every submitted data field against the extracted text. Highlight fields absent from the document and include the match percentage.
7. If extracted document text is not supplied, still validate using the document link and clearly state that the link was sent directly rather than server-extracted.
8. Assess whether the document appears genuine based on provider/agency/journal/publisher/course/event names, document language, metadata/link available, and consistency with submitted fields. If neither the link nor extracted text can be inspected, flag that full verification is not possible and normally mark FAIL unless enough reliable evidence is present.

Return a concise result starting with exactly one of:
PASS:
FAIL:
Then include these sections:
- Data anomalies
- Accuracy/plausibility checks
- Document verification
- Absent data fields from document
- Match percentage
- Genuine document assessment
- Suggested correction

Pre-detected suspicious values:
${suspicious.length ? suspicious.map((item) => `- ${item}`).join("\n") : "- None pre-detected"}

Document status:
- Link(s): ${document.link || "Not submitted"}
- Validation mode: ${document.mode || "Document link + extracted text"}
- Extraction: ${document.reason}
- Content type: ${document.contentType || "Unknown"}
- Filename: ${document.filename || "Unknown"}
- Precomputed match: ${match.matched}/${match.total} fields, ${match.percentage}%
- Precomputed absent fields: ${match.absent.length ? match.absent.join("; ") : "None"}

Submission data JSON:
${JSON.stringify(row, null, 2)}

Extracted document text sample:
${document.text || "[No extracted document text available]"}
`;

const statusFromComment = (comment) => /^pass\s*:/i.test(text(comment)) ? "Pass" : "Fail";

const buildNonAiValidation = async (row, config, body = {}) => {
  const dataRow = validationRow(row, config);
  const { document, match } = await documentContextFor(row, { ...body, documentValidationMode: "extract" }, dataRow);
  const suspicious = suspiciousFieldHints(dataRow);
  const hasDocument = document.links?.length > 0;
  const pass = hasDocument && match.total > 0 && match.percentage === 100 && suspicious.length === 0;
  const lines = [
    `${pass ? "PASS" : "FAIL"}: Non-AI validation completed by matching submitted field values against supporting document text/OCR.`,
    `- Document submitted: ${hasDocument ? "Yes" : "No"}`,
    `- Document extraction/OCR status: ${document.reason}`,
    `- Matched fields: ${match.matched}/${match.total}`,
    `- Match percentage: ${match.percentage}%`,
    `- Absent fields: ${match.absent.length ? match.absent.join("; ") : "None"}`,
    `- Suspicious values: ${suspicious.length ? suspicious.join("; ") : "None"}`,
    "- User/login field was excluded from validation. Name and data fields were validated.",
    "- Document genuineness cannot be conclusively verified without AI or external registry checks; this non-AI result is based on text/OCR matching and anomaly detection only."
  ];
  return { status: pass ? "Pass" : "Fail", comment: lines.join("\n"), document, match };
};

exports.metadata = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const options = {};
    await Promise.all(Object.entries(modelMap).map(async ([kind, config]) => {
      const rows = await config.Model.find({ colid }).select([...config.fields, ...workflowFields, "name user"].join(" ")).lean();
      options[kind] = {};
      [...config.fields, ...workflowFields, "name", "user"].forEach((field) => {
        options[kind][field] = uniqueSorted(rows.map((row) => row[field]));
      });
    }));
    const ollamaConfigs = await OllamaConfiguration.find({ colid, active: /^yes$/i }).select("name serveraddress modelname default active").sort({ default: -1, name: 1 }).lean();
    const config = Object.fromEntries(Object.entries(modelMap).map(([key, value]) => [key, {
      label: value.label,
      fields: value.fields,
      numberFields: value.numberFields || []
    }]));
    res.json({ success: true, config, options, geminiModels: commonAiModels, ollamaConfigs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const config = getConfig(req.params.kind);
    const filter = buildFilter(req, config, /^true$/i.test(text(req.query.mine)));
    const data = await config.Model.find(filter).sort({ updatedAt: -1, _id: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const config = getConfig(req.params.kind);
    const payload = payloadFor(config, req.body);
    if (req.body.resubmit) {
      payload.submissionstatus = "Submitted";
      payload.overallstatus = "Submitted";
      payload.status1 = "Submitted";
    }
    const data = req.body.id
      ? await config.Model.findOneAndUpdate({ _id: req.body.id, colid: num(req.body.colid), ...(req.body.mine ? { user: text(req.body.user) } : {}) }, payload, { new: true, runValidators: false })
      : await config.Model.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const config = getConfig(req.params.kind);
    await config.Model.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid), ...(req.body.mine ? { user: text(req.body.user) } : {}) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const config = getConfig(req.params.kind);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    await config.Model.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid), ...(req.body.mine ? { user: text(req.body.user) } : {}) });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const config = getConfig(req.params.kind);
    const rows = readSheet(req.file.buffer).map((row) => payloadFor(config, { ...row, colid: req.body.colid, user: req.body.user, name: req.body.name }));
    const data = await config.Model.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });
    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/personal-data/${text(req.body.kind || "documents")}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    res.json({ success: true, url: s3Url(config.bucket, config.region, key), key });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.validateOne = async (req, res) => {
  try {
    const config = getConfig(req.params.kind);
    const row = await config.Model.findOne({ _id: req.body.id, colid: num(req.body.colid) }).lean();
    if (!row) return res.status(404).json({ success: false, message: "Submission not found" });
    const framework = text(req.body.accreditationframework || row.accreditationframework || "NAAC");
    const dataRow = validationRow(row, config);
    const { document, match } = await documentContextFor(row, req.body, dataRow);
    const suspicious = suspiciousFieldHints(dataRow);
    const comment = await callAi(req.body, validationPrompt({ label: config.label, row: dataRow, framework, document, match, suspicious }));
    const status = statusFromComment(comment);
    const update = {
      aivalidationstatus: status,
      aivalidationcomment: comment,
      accreditationframework: framework,
      documentstatus: row.filelink || row.doclink ? (status === "Pass" ? "Approved" : "Rejected") : "Blank"
    };
    const data = await config.Model.findOneAndUpdate({ _id: row._id, colid: num(req.body.colid) }, update, { new: true }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkValidate = async (req, res) => {
  try {
    const config = getConfig(req.params.kind);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const output = [];
    for (const id of ids) {
      const row = await config.Model.findOne({ _id: id, colid: num(req.body.colid) }).lean();
      if (!row) {
        output.push({ id, success: false, message: "Submission not found" });
        continue;
      }
      try {
        const framework = text(req.body.accreditationframework || row.accreditationframework || "NAAC");
        const dataRow = validationRow(row, config);
        const { document, match } = await documentContextFor(row, req.body, dataRow);
        const suspicious = suspiciousFieldHints(dataRow);
        const comment = await callAi(req.body, validationPrompt({ label: config.label, row: dataRow, framework, document, match, suspicious }));
        const status = statusFromComment(comment);
        const data = await config.Model.findOneAndUpdate({ _id: id, colid: num(req.body.colid) }, {
          aivalidationstatus: status,
          aivalidationcomment: comment,
          accreditationframework: framework,
          documentstatus: row.filelink || row.doclink ? (status === "Pass" ? "Approved" : "Rejected") : "Blank"
        }, { new: true }).lean();
        output.push({ id, success: true, data });
      } catch (error) {
        output.push({ id, success: false, message: error.message });
      }
    }
    res.json({ success: true, results: output });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.nonAiValidate = async (req, res) => {
  try {
    const config = getConfig(req.params.kind);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const output = [];
    for (const id of ids) {
      const row = await config.Model.findOne({ _id: id, colid: num(req.body.colid) }).lean();
      if (!row) {
        output.push({ id, success: false, message: "Submission not found" });
        continue;
      }
      const result = await buildNonAiValidation(row, config, req.body);
      const data = await config.Model.findOneAndUpdate({ _id: id, colid: num(req.body.colid) }, {
        aivalidationstatus: result.status,
        aivalidationcomment: result.comment,
        documentstatus: row.filelink || row.doclink ? (result.status === "Pass" ? "Approved" : "Rejected") : "Blank"
      }, { new: true }).lean();
      output.push({ id, success: true, data });
    }
    res.json({ success: true, results: output, data: output.length === 1 ? output[0].data : undefined });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkReview = async (req, res) => {
  try {
    const config = getConfig(req.params.kind);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const status = text(req.body.status || "Approved");
    const comment = text(req.body.comment);
    const result = await config.Model.updateMany({ _id: { $in: ids }, colid: num(req.body.colid) }, {
      submissionstatus: status,
      overallstatus: status,
      status1: status,
      approvercomment: comment,
      comments: comment || status
    });
    res.json({ success: true, modified: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
