const AWS = require("aws-sdk");
const multer = require("multer");
const mongoose = require("mongoose");
const AcademicAudit = require("../Models/academicauditauditds");
const AcademicAuditQuestion = require("../Models/academicauditquestionds");
const AcademicAuditResponse = require("../Models/academicauditresponseds");
const AcademicAuditAnalysis = require("../Models/academicauditanalysisds");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const RegulationCourseMap = require("../Models/regulationcoursemapds");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single("file");

const num = (value) => Number(value || 0);
const clean = (value) => String(value || "").trim();
const escapeRegExp = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const byColid = (req) => num(req.query.colid || req.body.colid);
const userName = (req) => clean(req.body.name || req.query.name);
const userEmail = (req) => clean(req.body.user || req.query.user);

const defaultQuestions = [
  ["Curriculum Planning and Delivery", "List programs offered with curriculum status and major changes during the academic year.", "programcount"],
  ["Curriculum Planning and Delivery", "Give course coverage, syllabus mapping and delivery readiness status.", "coursecount"],
  ["Curriculum Enrichment", "Provide the number and list of certificate courses offered during the academic year.", "certificatecourses"],
  ["Curriculum Enrichment", "Provide the number and list of value added courses offered during the academic year.", "valueaddedcourses"],
  ["Teaching Learning Process", "Summarize faculty strength, workload and teaching resources department wise.", "facultycount"],
  ["Teaching Learning Process", "Describe innovative teaching methods, ICT use and learner support activities.", ""],
  ["Student Attendance and Engagement", "Summarize enrolled students, attendance monitoring and engagement initiatives.", "studentcount"],
  ["Mentoring and Student Support", "Summarize department-wise mentoring sessions, home interactions, follow-up actions and outcomes.", "mentoringcount"],
  ["Assessment and Result Analysis", "Summarize assessment conduct, result trends, backlogs and corrective actions.", ""],
  ["Faculty Development and Research", "List faculty publications department wise, including journal/indexing details where available.", "publicationcount"],
  ["Faculty Development and Research", "List seminars, conferences, workshops attended or organized by faculty department wise.", "seminarcount"],
  ["Faculty Development and Research", "List funded research projects with agency, funding amount and status department wise.", "fundedprojectcount"],
  ["Faculty Development and Research", "List consultancy activities with agency, revenue and outcome department wise.", "consultancycount"],
  ["Department Governance and Compliance", "Provide departmental meeting, audit compliance and action-taken evidence.", ""],
  ["Institution Level Quality", "Summarize institution-level quality initiatives, risks and improvement priorities.", ""]
];

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

async function getDefaultAwsConfig(colid) {
  return Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || Awsconfig.findOne({ colid, type: /^aws$/i }).sort({ _id: -1 }).lean();
}

async function seedDefaultQuestions(colid) {
  for (let index = 0; index < defaultQuestions.length; index += 1) {
    const [criteria, question, erpsource] = defaultQuestions[index];
    await AcademicAuditQuestion.updateOne(
      { colid, criteria, question },
      { $setOnInsert: { colid, criteria, question, erpsource, questionorder: index + 1, status: "Active" } },
      { upsert: true }
    );
  }
}

async function userDepartments(colid) {
  const match = colid ? { $or: [{ colid: Number(colid) }, { colid: String(colid) }] } : {};
  const rows = await User.aggregate([
    { $match: match },
    { $project: { department: { $trim: { input: { $ifNull: ["$department", ""] } } } } },
    { $match: { department: { $ne: "" } } },
    { $group: { _id: "$department" } },
    { $sort: { _id: 1 } }
  ]);
  if (rows.length) return rows.map((row) => row._id);
  return User.distinct("department", colid ? { colid: Number(colid) } : {}).then((items) => items.map(clean).filter(Boolean).sort());
}

function filtersFromQuery(query = {}) {
  const filter = { colid: num(query.colid) };
  ["academicyear", "department", "scope", "criteria", "status", "auditid"].forEach((field) => {
    if (clean(query[field])) filter[field] = new RegExp(escapeRegExp(query[field]), "i");
  });
  return filter;
}

async function auditFor(id, colid) {
  if (!id) return null;
  return AcademicAudit.findOne({ _id: id, colid }).lean();
}

async function facultyEmailsForDepartment(colid, department) {
  if (!department) return [];
  const users = await User.find({
    colid,
    role: { $not: /^Student$/i },
    department: new RegExp(escapeRegExp(department), "i")
  }).select("email").lean();
  return users.map((row) => clean(row.email)).filter(Boolean);
}

async function countCollection(collectionName, filter) {
  return mongoose.connection.collection(collectionName).countDocuments(filter);
}

async function countRows(collectionName, { colid, department, year, yearFields = ["academicyear", "year", "yop"], departmentField = "department", extra = {} }) {
  const base = { colid, ...extra };
  if (department && departmentField) base[departmentField] = new RegExp(escapeRegExp(department), "i");
  const yearValue = clean(year);
  if (!yearValue) return countCollection(collectionName, base);
  const yearParts = [yearValue, yearValue.slice(0, 4), yearValue.slice(-2)].filter(Boolean);
  return countCollection(collectionName, {
    ...base,
    $or: yearFields.map((field) => ({ [field]: { $in: yearParts } }))
  });
}

function summarizeResponses(responses = [], questions = []) {
  const criteria = {};
  const departments = {};
  const departmentCriteria = {};
  responses.forEach((row) => {
    const c = clean(row.criteria) || "Not specified";
    const d = clean(row.department) || "Institution";
    const level = clean(row.responselevel) || (d === "Institution" ? "Institution" : "Department");
    criteria[c] = criteria[c] || { label: c, submitted: 0, institutionSubmitted: 0, departmentSubmitted: 0, documents: 0, numericvalue: 0 };
    departments[d] = departments[d] || { label: d, submitted: 0, documents: 0, numericvalue: 0, criteriaCovered: 0 };
    departmentCriteria[`${d}__${c}`] = departmentCriteria[`${d}__${c}`] || {
      id: `${d}__${c}`,
      department: d,
      criteria: c,
      submitted: 0,
      documents: 0,
      numericvalue: 0
    };
    criteria[c].submitted += 1;
    if (/institution/i.test(level) || d === "Institution") criteria[c].institutionSubmitted += 1;
    else criteria[c].departmentSubmitted += 1;
    departments[d].submitted += 1;
    departmentCriteria[`${d}__${c}`].submitted += 1;
    criteria[c].documents += row.documentlink ? 1 : 0;
    departments[d].documents += row.documentlink ? 1 : 0;
    departmentCriteria[`${d}__${c}`].documents += row.documentlink ? 1 : 0;
    criteria[c].numericvalue += num(row.numericvalue);
    departments[d].numericvalue += num(row.numericvalue);
    departmentCriteria[`${d}__${c}`].numericvalue += num(row.numericvalue);
  });
  Object.values(departmentCriteria).forEach((row) => {
    if (departments[row.department]) departments[row.department].criteriaCovered += 1;
  });
  const maxNumericByCriteria = {};
  Object.values(departmentCriteria).forEach((row) => {
    maxNumericByCriteria[row.criteria] = Math.max(maxNumericByCriteria[row.criteria] || 0, num(row.numericvalue));
  });
  const scoredDepartmentCriteria = Object.values(departmentCriteria).map((row) => {
    const evidenceScore = row.documents > 0 ? 25 : 0;
    const responseScore = row.submitted > 0 ? 45 : 0;
    const maxValue = maxNumericByCriteria[row.criteria] || 0;
    const numericScore = maxValue > 0 ? Math.min(30, Math.round((num(row.numericvalue) / maxValue) * 30)) : 0;
    return { ...row, score: Math.min(100, responseScore + evidenceScore + numericScore) };
  }).sort((a, b) => a.department.localeCompare(b.department) || a.criteria.localeCompare(b.criteria));
  const departmentScores = {};
  const metricScores = {};
  scoredDepartmentCriteria.forEach((row) => {
    departmentScores[row.department] = departmentScores[row.department] || { label: row.department, score: 0, metrics: 0, responses: 0, documents: 0 };
    metricScores[row.criteria] = metricScores[row.criteria] || { label: row.criteria, score: 0, departments: 0, responses: 0, documents: 0 };
    departmentScores[row.department].score += row.score;
    departmentScores[row.department].metrics += 1;
    departmentScores[row.department].responses += row.submitted;
    departmentScores[row.department].documents += row.documents;
    metricScores[row.criteria].score += row.score;
    metricScores[row.criteria].departments += 1;
    metricScores[row.criteria].responses += row.submitted;
    metricScores[row.criteria].documents += row.documents;
  });
  const departmentScoreRows = Object.values(departmentScores).map((row) => ({
    ...row,
    score: row.metrics ? Math.round(row.score / row.metrics) : 0
  })).sort((a, b) => b.score - a.score);
  const metricScoreRows = Object.values(metricScores).map((row) => ({
    ...row,
    score: row.departments ? Math.round(row.score / row.departments) : 0
  })).sort((a, b) => b.score - a.score);
  const totalQuestions = questions.length || defaultQuestions.length;
  const completion = totalQuestions ? Math.min(100, Math.round((responses.length / totalQuestions) * 100)) : 0;
  const institutionResponses = responses.filter((row) => clean(row.department) === "Institution" || /institution/i.test(row.responselevel)).length;
  return {
    cards: {
      totalQuestions,
      submitted: responses.length,
      documents: responses.filter((row) => row.documentlink).length,
      completion,
      institutionResponses,
      departmentResponses: Math.max(0, responses.length - institutionResponses),
      departmentsCovered: Object.keys(departments).filter((key) => key !== "Institution").length,
      averageDepartmentScore: departmentScoreRows.length ? Math.round(departmentScoreRows.reduce((sum, row) => sum + row.score, 0) / departmentScoreRows.length) : 0,
      averageMetricScore: metricScoreRows.length ? Math.round(metricScoreRows.reduce((sum, row) => sum + row.score, 0) / metricScoreRows.length) : 0
    },
    criteria: Object.values(criteria),
    departments: Object.values(departments),
    departmentCriteria: scoredDepartmentCriteria,
    departmentScores: departmentScoreRows,
    metricScores: metricScoreRows
  };
}

exports.options = async (req, res) => {
  try {
    const colid = byColid(req);
    await seedDefaultQuestions(colid);
    const [audits, questions, departments, auditYears, userYears, programYears, courseYears] = await Promise.all([
      AcademicAudit.find({ colid }).sort({ createdAt: -1 }).lean(),
      AcademicAuditQuestion.find({ colid, status: /^Active$/i }).sort({ questionorder: 1, criteria: 1 }).lean(),
      userDepartments(colid),
      AcademicAudit.distinct("academicyear", { colid }),
      User.distinct("academicyear", { colid }),
      MPrograms.distinct("year", { colid }),
      RegulationCourseMap.distinct("academicyear", { colid })
    ]);
    const years = [...new Set([...auditYears, ...userYears, ...programYears, ...courseYears].filter(Boolean))];
    res.json({
      status: "success",
      audits,
      questions,
      criteria: [...new Set(questions.map((q) => q.criteria).filter(Boolean))],
      departments: departments.filter(Boolean).sort(),
      academicyears: years.filter(Boolean).sort().reverse()
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.aiOptions = async (req, res) => {
  try {
    const colid = byColid(req);
    const [geminiConfigs, ollamaConfigs] = await Promise.all([
      AiConfiguration.find({ colid, type: /gemini/i, active: /^Yes$/i }).sort({ default: -1, _id: -1 }).lean(),
      OllamaConfiguration.find({ colid, active: /^Yes$/i }).sort({ default: -1, _id: -1 }).lean()
    ]);
    res.json({
      status: "success",
      geminiModels: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.5-flash"],
      geminiConfigured: geminiConfigs.length > 0,
      ollamaConfigs
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.saveAudit = async (req, res) => {
  try {
    const colid = byColid(req);
    const payload = {
      ...req.body,
      colid,
      name: userName(req),
      user: userEmail(req)
    };
    const record = payload._id
      ? await AcademicAudit.findOneAndUpdate({ _id: payload._id, colid }, payload, { new: true })
      : await AcademicAudit.create(payload);
    res.json({ status: "success", data: record });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.listAudits = async (req, res) => {
  try {
    const data = await AcademicAudit.find(filtersFromQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ status: "success", data });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.deleteAudits = async (req, res) => {
  try {
    const colid = byColid(req);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    await AcademicAudit.deleteMany({ _id: { $in: ids }, colid });
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.listQuestions = async (req, res) => {
  try {
    const colid = byColid(req);
    await seedDefaultQuestions(colid);
    const filter = { colid };
    if (clean(req.query.criteria)) filter.criteria = new RegExp(escapeRegExp(req.query.criteria), "i");
    const data = await AcademicAuditQuestion.find(filter).sort({ criteria: 1, questionorder: 1 }).lean();
    res.json({ status: "success", data });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.saveQuestion = async (req, res) => {
  try {
    const colid = byColid(req);
    const payload = { ...req.body, colid, name: userName(req), user: userEmail(req) };
    const data = payload._id
      ? await AcademicAuditQuestion.findOneAndUpdate({ _id: payload._id, colid }, payload, { new: true })
      : await AcademicAuditQuestion.create(payload);
    res.json({ status: "success", data });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    const colid = byColid(req);
    if (!req.file) return res.status(400).json({ status: "error", message: "File is required" });
    const config = await getDefaultAwsConfig(colid);
    if (!config) return res.status(400).json({ status: "error", message: "AWS configuration not found" });
    const key = `academic-audit/${colid}/${Date.now()}-${req.file.originalname.replace(/\s+/g, "-")}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    res.json({ status: "success", url: s3Url(config.bucket, config.region, key), filename: req.file.originalname });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.saveResponse = async (req, res) => {
  try {
    const colid = byColid(req);
    const audit = await auditFor(req.body.auditid, colid);
    const payload = {
      ...req.body,
      colid,
      academicyear: clean(req.body.academicyear) || audit?.academicyear || "",
      department: clean(req.body.department) || "Institution",
      scope: clean(req.body.scope) || audit?.scope || "",
      responselevel: clean(req.body.responselevel) || (clean(req.body.department) === "Institution" ? "Institution" : "Department"),
      name: userName(req),
      user: userEmail(req)
    };
    const data = payload._id
      ? await AcademicAuditResponse.findOneAndUpdate({ _id: payload._id, colid }, payload, { new: true })
      : await AcademicAuditResponse.create(payload);
    res.json({ status: "success", data });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.listResponses = async (req, res) => {
  try {
    const data = await AcademicAuditResponse.find(filtersFromQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ status: "success", data });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.importFromErp = async (req, res) => {
  try {
    const colid = byColid(req);
    const audit = await auditFor(req.body.auditid, colid);
    const source = clean(req.body.erpsource).toLowerCase();
    const department = clean(req.body.department || audit?.department);
    const year = clean(req.body.academicyear || audit?.academicyear);
    const deptFilter = department ? { department: new RegExp(escapeRegExp(department), "i") } : {};
    let summary = "No matching ERP import rule is configured for this question.";
    let numericvalue = 0;
    if (source === "studentcount") {
      const filter = { colid, role: /^Student$/i, ...deptFilter };
      if (year) filter.academicyear = year;
      numericvalue = await User.countDocuments(filter);
      summary = `ERP import: ${numericvalue} students found${department ? ` for ${department}` : ""}${year ? ` in ${year}` : ""}.`;
    } else if (source === "facultycount") {
      const filter = { colid, role: { $not: /^Student$/i }, ...deptFilter };
      numericvalue = await User.countDocuments(filter);
      summary = `ERP import: ${numericvalue} non-student users/faculty found${department ? ` for ${department}` : ""}.`;
    } else if (source === "programcount") {
      const filter = { colid };
      if (year) filter.year = year;
      numericvalue = await MPrograms.countDocuments(filter);
      summary = `ERP import: ${numericvalue} programs found${year ? ` for ${year}` : ""}.`;
    } else if (source === "coursecount") {
      const filter = { colid };
      if (year) filter.academicyear = year;
      numericvalue = await RegulationCourseMap.countDocuments(filter);
      summary = `ERP import: ${numericvalue} course mappings found${year ? ` for ${year}` : ""}.`;
    } else if (source === "certificatecourses") {
      numericvalue = await countRows("certificates", { colid, year, yearFields: ["year", "academicyear"], departmentField: "", extra: { type: /certificate/i } });
      summary = `ERP import: ${numericvalue} certificate course/certificate records found${year ? ` for ${year}` : ""}.`;
    } else if (source === "valueaddedcourses") {
      numericvalue = await countRows("certificates", { colid, year, yearFields: ["year", "academicyear"], departmentField: "", extra: { type: /value/i } });
      summary = `ERP import: ${numericvalue} value added course records found${year ? ` for ${year}` : ""}.`;
    } else if (source === "mentoringcount") {
      const emails = await facultyEmailsForDepartment(colid, department);
      const filter = { colid };
      if (year) filter.academicyear = year;
      if (department && emails.length) filter.facultyemail = { $in: emails };
      else if (department) filter.facultyemail = "__no_faculty_match__";
      numericvalue = await countCollection("mentoringsessionds", filter);
      summary = `ERP import: ${numericvalue} mentoring sessions found${department ? ` for ${department}` : ""}${year ? ` in ${year}` : ""}.`;
    } else if (source === "publicationcount") {
      numericvalue = await countRows("pubs", { colid, department, year, yearFields: ["yop", "year", "academicyear"] });
      summary = `ERP import: ${numericvalue} faculty publication records found${department ? ` for ${department}` : ""}${year ? ` in ${year}` : ""}.`;
    } else if (source === "seminarcount") {
      const filter = { colid };
      if (year) filter.$or = [{ yop: { $in: [year, year.slice(0, 4), year.slice(-2)].filter(Boolean) } }, { year }, { academicyear: year }];
      if (department) {
        const emails = await facultyEmailsForDepartment(colid, department);
        filter.user = emails.length ? { $in: emails } : "__no_faculty_match__";
      }
      numericvalue = await countCollection("seminars", filter);
      summary = `ERP import: ${numericvalue} seminar/conference/workshop records found${department ? ` for ${department}` : ""}${year ? ` in ${year}` : ""}.`;
    } else if (source === "fundedprojectcount") {
      numericvalue = await countRows("projects", { colid, department, year, yearFields: ["yop", "year", "academicyear"] });
      summary = `ERP import: ${numericvalue} funded project records found${department ? ` for ${department}` : ""}${year ? ` in ${year}` : ""}.`;
    } else if (source === "consultancycount") {
      numericvalue = await countRows("consultancies", { colid, department, year, yearFields: ["year", "yop", "academicyear"] });
      summary = `ERP import: ${numericvalue} consultancy records found${department ? ` for ${department}` : ""}${year ? ` in ${year}` : ""}.`;
    }
    res.json({ status: "success", data: summary, numericvalue });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = byColid(req);
    const [responses, questions, analyses] = await Promise.all([
      AcademicAuditResponse.find(filtersFromQuery(req.query)).sort({ criteria: 1, createdAt: -1 }).lean(),
      AcademicAuditQuestion.find({ colid, status: /^Active$/i }).sort({ criteria: 1, questionorder: 1 }).lean(),
      req.query.auditid ? AcademicAuditAnalysis.find({ colid, auditid: req.query.auditid }).sort({ createdAt: -1 }).lean() : []
    ]);
    res.json({ status: "success", data: responses, analyses, summary: summarizeResponses(responses, questions) });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const colid = byColid(req);
    const [audits, responses, questions] = await Promise.all([
      AcademicAudit.find(filtersFromQuery(req.query)).sort({ createdAt: -1 }).lean(),
      AcademicAuditResponse.find(filtersFromQuery(req.query)).sort({ createdAt: -1 }).lean(),
      AcademicAuditQuestion.find({ colid, status: /^Active$/i }).lean()
    ]);
    const summary = summarizeResponses(responses, questions);
    res.json({ status: "success", audits, responses, summary });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

async function runGemini(colid, model, prompt) {
  const config = await AiConfiguration.findOne({ colid, type: /gemini/i, active: /^Yes$/i }).sort({ default: -1, _id: -1 }).lean();
  if (!config?.apikey) throw new Error("Gemini API key is not configured");
  const modelName = model || "gemini-1.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${config.apikey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || "Gemini analysis failed");
  return json?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || "";
}

async function runOllama(colid, configId, prompt) {
  const config = await OllamaConfiguration.findOne({ colid, _id: configId }).lean()
    || await OllamaConfiguration.findOne({ colid, active: /^Yes$/i }).sort({ default: -1, _id: -1 }).lean();
  if (!config) throw new Error("Ollama configuration is not available");
  const response = await fetch(`${config.serveraddress.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error || "Ollama analysis failed");
  return json.response || "";
}

function localAnalysis(audit, responses, summary) {
  const lowEvidence = summary.criteria.filter((row) => !row.documents).map((row) => row.label);
  const weakestDepartments = (summary.departmentScores || []).slice().sort((a, b) => a.score - b.score).slice(0, 3).map((row) => `${row.label} (${row.score})`);
  const weakestMetrics = (summary.metricScores || []).slice().sort((a, b) => a.score - b.score).slice(0, 3).map((row) => `${row.label} (${row.score})`);
  return [
    `Academic audit analysis for ${audit?.auditname || "selected audit"}.`,
    `Completion is ${summary.cards.completion}% with ${summary.cards.submitted} submitted responses and ${summary.cards.documents} evidence documents.`,
    `Average department score is ${summary.cards.averageDepartmentScore || 0}. Average metric score is ${summary.cards.averageMetricScore || 0}.`,
    weakestDepartments.length ? `Departments requiring attention: ${weakestDepartments.join(", ")}.` : "",
    weakestMetrics.length ? `Metrics requiring attention: ${weakestMetrics.join(", ")}.` : "",
    lowEvidence.length ? `Evidence gaps are visible in: ${lowEvidence.join(", ")}.` : "Most submitted criteria include documentary evidence.",
    "Recommendations: complete missing evidence, review low-scoring departments and metrics, assign department-wise action owners, and repeat the audit review after corrective action."
  ].join("\n\n");
}

exports.aiAnalysis = async (req, res) => {
  try {
    const colid = byColid(req);
    const audit = await auditFor(req.body.auditid, colid);
    const [responses, questions] = await Promise.all([
      AcademicAuditResponse.find({ colid, auditid: req.body.auditid }).sort({ criteria: 1 }).lean(),
      AcademicAuditQuestion.find({ colid, status: /^Active$/i }).lean()
    ]);
    const summary = summarizeResponses(responses, questions);
    const basePrompt = [
      "You are evaluating an academic audit for an institution.",
      "Provide concise but detailed analysis, risks, departmental observations, institution-level observations, and actionable recommendations.",
      req.body.prompt || "",
      `Audit: ${JSON.stringify(audit || {})}`,
      `Summary: ${JSON.stringify(summary)}`,
      `Responses: ${JSON.stringify(responses.slice(0, 120))}`
    ].join("\n\n");
    let analysis = "";
    let provider = clean(req.body.provider) || "Local";
    try {
      if (/gemini/i.test(provider)) analysis = await runGemini(colid, req.body.model, basePrompt);
      else if (/ollama/i.test(provider)) analysis = await runOllama(colid, req.body.ollamaConfigId, basePrompt);
      else analysis = localAnalysis(audit, responses, summary);
    } catch (aiError) {
      provider = `${provider} fallback`;
      analysis = `${localAnalysis(audit, responses, summary)}\n\nAI service note: ${aiError.message}`;
    }
    const record = await AcademicAuditAnalysis.create({
      colid,
      auditid: req.body.auditid,
      academicyear: audit?.academicyear || "",
      scope: audit?.scope || "",
      department: audit?.department || "",
      provider,
      model: clean(req.body.model || req.body.ollamaConfigId),
      prompt: clean(req.body.prompt),
      analysis,
      recommendations: analysis,
      summary: JSON.stringify(summary),
      name: userName(req),
      user: userEmail(req)
    });
    res.json({ status: "success", data: record });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

exports.generateDummyData = async (req, res) => {
  try {
    const colid = byColid(req);
    const academicyear = clean(req.body.academicyear) || "2026-27";
    const requestedDepartments = Array.isArray(req.body.departments) ? req.body.departments.map(clean).filter(Boolean) : [];
    const availableDepartments = await userDepartments(colid);
    const departments = (requestedDepartments.length ? requestedDepartments : availableDepartments.slice(0, num(req.body.departmentcount) || 5))
      .filter(Boolean);
    const finalDepartments = departments.length ? departments : ["Computer Science", "Management", "Commerce", "Life Sciences", "Humanities"];
    await seedDefaultQuestions(colid);
    const questions = await AcademicAuditQuestion.find({ colid, status: /^Active$/i }).sort({ criteria: 1, questionorder: 1 }).lean();
    const startYear = Number(String(academicyear).slice(0, 4)) || new Date().getFullYear();
    const audit = await AcademicAudit.create({
      colid,
      academicyear,
      auditname: `Dummy Academic Audit ${academicyear} ${new Date().toISOString().slice(0, 10)}`,
      scope: "Institution",
      department: "",
      startdate: `${startYear}-07-01`,
      enddate: `${startYear + 1}-06-30`,
      status: "Active",
      remarks: "Generated from Dummy data AAA",
      name: userName(req),
      user: userEmail(req)
    });
    const responseRows = [];
    const valueFor = (question, departmentIndex = 0, questionIndex = 0) => {
      const source = clean(question.erpsource).toLowerCase();
      const base = (departmentIndex + 1) * 3 + (questionIndex % 5);
      if (source.includes("student")) return 120 + base * 18;
      if (source.includes("faculty")) return 8 + base;
      if (source.includes("program")) return 2 + (questionIndex % 4);
      if (source.includes("course")) return 20 + base * 2;
      if (source.includes("certificate")) return 3 + (departmentIndex % 4);
      if (source.includes("valueadded")) return 2 + (departmentIndex % 3);
      if (source.includes("mentoring")) return 35 + base * 4;
      if (source.includes("publication")) return 4 + base;
      if (source.includes("seminar")) return 6 + base * 2;
      if (source.includes("fundedproject")) return 1 + (departmentIndex % 3);
      if (source.includes("consultancy")) return 1 + (questionIndex % 3);
      return 1 + base;
    };
    questions.forEach((question, questionIndex) => {
      const institutionValue = finalDepartments.reduce((sum, _, deptIndex) => sum + valueFor(question, deptIndex, questionIndex), 0);
      responseRows.push({
        colid,
        auditid: String(audit._id),
        academicyear,
        department: "Institution",
        scope: "Institution",
        responselevel: "Institution",
        criteria: question.criteria,
        questionid: String(question._id),
        question: question.question,
        data: `Institution-level dummy evidence for ${question.criteria}. Total metric value across departments is ${institutionValue}.`,
        numericvalue: institutionValue,
        documentlink: `https://example.com/academic-audit/${colid}/${audit._id}/institution-${questionIndex + 1}.pdf`,
        documentname: `Institution Evidence ${questionIndex + 1}.pdf`,
        erpimportsource: question.erpsource || "",
        erpimported: question.erpsource ? "Yes" : "No",
        status: "Submitted",
        name: userName(req),
        user: userEmail(req)
      });
      finalDepartments.forEach((department, deptIndex) => {
        const value = valueFor(question, deptIndex, questionIndex);
        responseRows.push({
          colid,
          auditid: String(audit._id),
          academicyear,
          department,
          scope: "Department",
          responselevel: "Department",
          criteria: question.criteria,
          questionid: String(question._id),
          question: question.question,
          data: `${department} dummy response for ${question.criteria}: ${question.question}. Action taken and evidence are recorded for audit review.`,
          numericvalue: value,
          documentlink: `https://example.com/academic-audit/${colid}/${audit._id}/${department.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${questionIndex + 1}.pdf`,
          documentname: `${department} Evidence ${questionIndex + 1}.pdf`,
          erpimportsource: question.erpsource || "",
          erpimported: question.erpsource ? "Yes" : "No",
          status: "Submitted",
          name: userName(req),
          user: userEmail(req)
        });
      });
    });
    if (responseRows.length) await AcademicAuditResponse.insertMany(responseRows);
    const summary = summarizeResponses(responseRows, questions);
    const analysis = localAnalysis(audit, responseRows, summary);
    await AcademicAuditAnalysis.create({
      colid,
      auditid: String(audit._id),
      academicyear,
      scope: "Institution",
      department: "",
      provider: "Dummy local analysis",
      model: "Dummy data AAA",
      prompt: "Generated dummy academic audit analysis",
      analysis,
      recommendations: analysis,
      summary: JSON.stringify(summary),
      name: userName(req),
      user: userEmail(req)
    });
    res.json({
      status: "success",
      data: {
        audit,
        questions: questions.length,
        departments: finalDepartments.length,
        responses: responseRows.length,
        analyses: 1,
        summary
      }
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};
