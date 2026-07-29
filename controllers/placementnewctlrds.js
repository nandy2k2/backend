const XLSX = require("xlsx");
const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const Company = require("../Models/placementnewcompanyds");
const Job = require("../Models/placementnewjobds");
const Internship = require("../Models/placementnewinternshipprofileds");
const SipStudent = require("../Models/placementnewsipstudentds");
const Mentor = require("../Models/placementnewmentords");
const ProjectStage = require("../Models/placementnewprojectstageds");
const StageEntry = require("../Models/placementnewprojectstageentryds");
const PlacementStage = require("../Models/placementnewplacementstageds");
const PlacementStageStudent = require("../Models/placementnewstagestudentds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const VivaMarks = require("../Models/examinationmodel2vivamarksds");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Institution = require("../Models/insdetails");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const readSheet = (buffer) => XLSX.utils.sheet_to_json(XLSX.read(buffer, { type: "buffer" }).Sheets[XLSX.read(buffer, { type: "buffer" }).SheetNames[0]], { defval: "" });
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1" ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}` : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;
const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i }).sort({ _id: -1 }).lean();
const getGemini = async (colid) => AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();
const callGemini = async (colid, prompt, model = "gemini-2.5-flash") => {
  const config = await getGemini(colid);
  if (!config?.apikey) throw new Error("Gemini API key is not configured");
  const models = [...new Set([text(model), "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean))];
  let lastError = "";
  for (const item of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(item)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    if (response.ok) return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data?.error?.message || "Gemini request failed";
  }
  throw new Error(lastError || "Gemini request failed");
};
const callOllama = async (colid, prompt, configId) => {
  const query = { colid: Number(colid), active: /^yes$/i };
  const config = configId ? await OllamaConfiguration.findOne({ ...query, _id: configId }).lean() : await OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean() || await OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean();
  if (!config) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${String(config.serveraddress || "").replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Ollama request failed");
  return data.response || "";
};
const callAi = (body, prompt) => /^ollama$/i.test(text(body.provider)) ? callOllama(body.colid, prompt, body.ollamaConfigId) : callGemini(body.colid, prompt, body.geminiModel);

const modelMap = {
  company: { Model: Company, fields: ["company", "companyemail", "contactnumber", "industry", "login", "password", "address", "status"] },
  job: { Model: Job, fields: ["industry", "company", "companyemail", "type", "jobtitle", "jobdetails", "description", "startdate", "enddate", "programs", "minimumcgpa", "skills", "status"] },
  internship: { Model: Internship, fields: ["student", "studentemail", "regno", "program", "programcode", "admissionyear", "academicyear", "company", "areaofexpertise", "startdate", "enddate", "description", "status"] },
  sip: { Model: SipStudent, fields: ["jobid", "jobtitle", "type", "program", "programcode", "student", "studentemail", "regno", "admissionyear", "academicyear", "company", "companyemail", "project", "startdate", "enddate", "companycontact", "mentor", "mentoremail", "status"] },
  mentor: { Model: Mentor, fields: ["mentor", "mentoremail", "student", "studentemail", "regno", "academicyear", "admissionyear", "program", "programcode", "status"] },
  stage: { Model: ProjectStage, fields: ["assignmentid", "stagename", "stageorder", "description", "status"] },
  entry: { Model: StageEntry, fields: ["assignmentid", "stageid", "stagename", "details", "filelink", "remarks", "entrydate", "student", "studentemail", "regno"] },
  placementstage: { Model: PlacementStage, fields: ["stagename", "stageorder", "description", "status"] },
  stagestudent: { Model: PlacementStageStudent, fields: ["jobid", "jobtitle", "jobtype", "company", "companyemail", "student", "studentemail", "regno", "phone", "academicyear", "admissionyear", "program", "programcode", "semester", "section", "stageid", "stagename", "stagedate", "status", "placementstatus", "confirmeddate", "offerletterlink", "offerlettername", "contactdetails", "address", "ctc", "industry", "sector", "comments"] }
};

const payloadFor = (kind, source = {}) => {
  const config = modelMap[kind];
  const payload = { colid: Number(source.colid), user: text(source.user) };
  config.fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) payload[field] = source[field];
  });
  if (kind === "job" && typeof payload.programs === "string") {
    payload.programs = payload.programs.split(",").map((item) => ({ programcode: text(item), program: "" })).filter((item) => item.programcode);
  }
  return payload;
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const [companies, programs, users, internships, sip, placementStages, stageStudents, ollamaConfigs, institution] = await Promise.all([
      Company.find({ colid }).sort({ company: 1 }).lean(),
      MPrograms.find({ colid }).sort({ Order: 1, program: 1 }).lean(),
      User.find({ colid }).select("name email user phone role program programcode admissionyear academicyear regno semester section photo skills").sort({ name: 1 }).lean(),
      Internship.find({ colid }).sort({ createdAt: -1 }).lean(),
      SipStudent.find({ colid }).sort({ createdAt: -1 }).lean(),
      PlacementStage.find({ colid }).sort({ stageorder: 1, stagename: 1 }).lean(),
      PlacementStageStudent.find({ colid }).sort({ updatedAt: -1 }).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    res.json({
      success: true,
      companies,
      industries: uniqueSorted(companies.map((item) => item.industry)),
      programs,
      users,
      students: users.filter((item) => /^student$/i.test(text(item.role))),
      mentors: users.filter((item) => !/^student$/i.test(text(item.role))),
      internships,
      sip,
      placementStages,
      stageStudents,
      ollamaConfigs,
      geminiModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
      institution
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const { Model, fields } = modelMap[req.params.kind];
    const filter = { colid: Number(req.query.colid) };
    fields.forEach((field) => {
      if (field === "programs") return;
      if (text(req.query[field])) filter[field] = regex(req.query[field]);
    });
    const data = await Model.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const kind = req.params.kind;
    const { Model } = modelMap[kind];
    const payload = payloadFor(kind, req.body);
    const data = req.body.id
      ? await Model.findOneAndUpdate({ _id: req.body.id, colid: Number(req.body.colid) }, payload, { new: true, runValidators: true })
      : await Model.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const { Model } = modelMap[req.params.kind];
    await Model.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const { Model } = modelMap[req.params.kind];
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    await Model.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = readSheet(req.file.buffer).map((row) => payloadFor(req.params.kind, { ...row, colid: req.body.colid, user: req.body.user }));
    const { Model } = modelMap[req.params.kind];
    const data = await Model.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });
    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/placement-new/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    res.json({ success: true, url: s3Url(config.bucket, config.region, key) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSkills = async (req, res) => {
  try {
    const filter = { colid: Number(req.body.colid) };
    if (text(req.body.regno)) filter.regno = text(req.body.regno);
    if (text(req.body.email)) filter.email = text(req.body.email);
    if (!filter.regno && !filter.email) filter.$or = [{ email: text(req.body.user) }, { user: text(req.body.user) }];
    const data = await User.findOneAndUpdate(filter, { skills: text(req.body.skills) }, { new: true });
    if (!data) return res.status(404).json({ success: false, message: "Student not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const filters = req.body.filters || {};
    const query = { colid, role: /^Student$/i };
    Object.keys(filters).forEach((field) => {
      if (text(filters[field])) query[field] = regex(filters[field]);
    });
    const students = await User.find(query).select("name email phone regno admissionyear academicyear program programcode semester section photo skills").sort({ name: 1 }).limit(1000).lean();
    const regnos = students.map((item) => item.regno).filter(Boolean);
    const [marks, internships] = await Promise.all([
      VivaMarks.find({ colid, regno: { $in: regnos } }).select("regno overallgradepoint gpa overallpercentage status course coursecode").lean(),
      Internship.find({ colid, regno: { $in: regnos } }).lean()
    ]);
    const marksMap = new Map();
    marks.forEach((item) => {
      const key = text(item.regno);
      const current = marksMap.get(key) || { gpa: 0, count: 0, courses: [] };
      current.gpa += num(item.overallgradepoint || item.gpa);
      current.count += 1;
      current.courses.push(`${item.coursecode || ""} ${item.overallgrade || ""}`.trim());
      marksMap.set(key, current);
    });
    const internMap = new Map();
    internships.forEach((item) => {
      const key = text(item.regno);
      const current = internMap.get(key) || [];
      current.push(item.areaofexpertise || item.company || "");
      internMap.set(key, current);
    });
    const data = students.map((student) => {
      const m = marksMap.get(text(student.regno)) || {};
      return {
        ...student,
        cgpa: m.count ? Number((m.gpa / m.count).toFixed(2)) : 0,
        marksprofile: (m.courses || []).join(", "),
        internshipareas: (internMap.get(text(student.regno)) || []).filter(Boolean).join(", ")
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const stageStudentFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  ["jobid", "jobtitle", "jobtype", "company", "student", "studentemail", "regno", "phone", "academicyear", "admissionyear", "program", "programcode", "semester", "section", "stageid", "stagename", "placementstatus", "industry", "sector"].forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  if (text(source.createdFrom) || text(source.createdTo)) {
    filter.createdAt = {};
    if (text(source.createdFrom)) filter.createdAt.$gte = new Date(`${text(source.createdFrom)}T00:00:00.000Z`);
    if (text(source.createdTo)) filter.createdAt.$lte = new Date(`${text(source.createdTo)}T23:59:59.999Z`);
  }
  return filter;
};

exports.addStageStudents = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const job = req.body.job || {};
    const stage = req.body.stage || {};
    const selected = Array.isArray(req.body.students) ? req.body.students : [];
    if (!job._id) return res.status(400).json({ success: false, message: "Job is required" });
    if (!stage._id) return res.status(400).json({ success: false, message: "Stage is required" });
    if (!selected.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const stagedate = text(req.body.stagedate) || new Date().toISOString().slice(0, 10);
    const operations = selected.map((student) => {
      const identity = text(student.regno) ? { regno: text(student.regno) } : { studentemail: text(student.email || student.studentemail) };
      return {
      updateOne: {
        filter: { colid, jobid: String(job._id), ...identity },
        update: {
          $set: {
            jobid: String(job._id),
            jobtitle: text(job.jobtitle),
            jobtype: text(job.type) || "Placement",
            company: text(job.company),
            companyemail: text(job.companyemail),
            student: text(student.name || student.student),
            studentemail: text(student.email || student.studentemail),
            regno: text(student.regno),
            phone: text(student.phone),
            academicyear: text(student.academicyear),
            admissionyear: text(student.admissionyear),
            program: text(student.program),
            programcode: text(student.programcode),
            semester: text(student.semester),
            section: text(student.section),
            stageid: String(stage._id),
            stagename: text(stage.stagename),
            stagedate,
            status: "Active",
            placementstatus: "In Progress",
            comments: text(req.body.comments),
            colid,
            user: text(req.body.user)
          }
        },
        upsert: true
      }
    };
    });
    const result = await PlacementStageStudent.bulkWrite(operations, { ordered: false });
    res.json({ success: true, matched: result.matchedCount, upserted: result.upsertedCount, modified: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.stageStudents = async (req, res) => {
  try {
    const data = await PlacementStageStudent.find(stageStudentFilter(req.query)).sort({ updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.shiftStageStudents = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const stage = req.body.stage || {};
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    if (!stage._id) return res.status(400).json({ success: false, message: "Target stage is required" });
    const result = await PlacementStageStudent.updateMany(
      { _id: { $in: ids }, colid: Number(req.body.colid) },
      { $set: { stageid: String(stage._id), stagename: text(stage.stagename), stagedate: text(req.body.stagedate) || new Date().toISOString().slice(0, 10), comments: text(req.body.comments), user: text(req.body.user) } }
    );
    res.json({ success: true, modified: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.confirmPlacement = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const payload = {
      placementstatus: "Placed",
      confirmeddate: text(req.body.confirmeddate) || new Date().toISOString().slice(0, 10),
      offerletterlink: text(req.body.offerletterlink),
      offerlettername: text(req.body.offerlettername),
      company: text(req.body.company),
      contactdetails: text(req.body.contactdetails),
      address: text(req.body.address),
      ctc: num(req.body.ctc),
      industry: text(req.body.industry),
      sector: text(req.body.sector),
      comments: text(req.body.comments),
      user: text(req.body.user)
    };
    const result = await PlacementStageStudent.updateMany({ _id: { $in: ids }, colid: Number(req.body.colid) }, { $set: payload });
    res.json({ success: true, modified: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.placementStageReport = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const filter = stageStudentFilter(req.query);
    const [rows, jobs, institution] = await Promise.all([
      PlacementStageStudent.find(filter).sort({ updatedAt: -1 }).lean(),
      Job.find({ colid, type: "Placement" }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    const byStage = Object.values(rows.reduce((acc, item) => {
      const key = item.stagename || "Not specified";
      acc[key] = acc[key] || { name: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}));
    const byIndustry = Object.values(rows.filter((item) => /^placed$/i.test(text(item.placementstatus))).reduce((acc, item) => {
      const key = item.industry || "Not specified";
      acc[key] = acc[key] || { name: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}));
    const bySector = Object.values(rows.filter((item) => /^placed$/i.test(text(item.placementstatus))).reduce((acc, item) => {
      const key = item.sector || "Not specified";
      acc[key] = acc[key] || { name: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}));
    const placed = rows.filter((item) => /^placed$/i.test(text(item.placementstatus))).length;
    res.json({ success: true, rows, byStage, byIndustry, bySector, institution, summary: { total: rows.length, placed, jobs: jobs.length, conversion: rows.length ? Number(((placed / rows.length) * 100).toFixed(2)) : 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.unemployedStudents = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const filters = req.body.filters || {};
    const query = { colid, role: /^Student$/i };
    Object.keys(filters).forEach((field) => {
      if (text(filters[field])) query[field] = regex(filters[field]);
    });
    const placed = await PlacementStageStudent.find({ colid, placementstatus: /^Placed$/i }).select("regno studentemail").lean();
    const placedRegnos = placed.map((item) => text(item.regno)).filter(Boolean);
    const placedEmails = placed.map((item) => text(item.studentemail)).filter(Boolean);
    if (placedRegnos.length || placedEmails.length) {
      query.$and = [
        { regno: { $nin: placedRegnos } },
        { email: { $nin: placedEmails } }
      ];
    }
    const data = await User.find(query).select("name email phone regno admissionyear academicyear program programcode semester section skills").sort({ name: 1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.aiJobDescription = async (req, res) => {
  try {
    const prompt = `Create a professional ${text(req.body.language) || "English"} job description for a ${text(req.body.type)} opportunity.
Company: ${text(req.body.company)}
Industry: ${text(req.body.industry)}
Job title: ${text(req.body.jobtitle)}
Job details: ${text(req.body.jobdetails)}
Required skills: ${text(req.body.skills)}
Write role overview, responsibilities, skills, learning outcomes, eligibility and selection process.`;
    const content = await callAi(req.body, prompt);
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.aiCandidateSearch = async (req, res) => {
  try {
    const prompt = `Rank these students for this SIP/placement opportunity. Return concise reasons.
Job: ${JSON.stringify(req.body.job || {})}
Students: ${JSON.stringify((req.body.students || []).slice(0, 80))}
Search instruction: ${text(req.body.prompt)}
Return JSON array with regno, score out of 100, reason.`;
    const content = await callAi(req.body, prompt);
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentAssignments = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const email = text(req.query.email || req.query.user);
    const regno = text(req.query.regno);
    const filter = { colid };
    if (regno && email) filter.$or = [{ regno }, { studentemail: email }];
    else if (regno) filter.regno = regno;
    else filter.studentemail = email;
    const data = await SipStudent.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.projectReport = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const assignment = await SipStudent.findOne({ _id: req.query.assignmentid, colid }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });
    const [student, stages, entries, institution] = await Promise.all([
      User.findOne({ colid, $or: [{ regno: assignment.regno }, { email: assignment.studentemail }] }).lean(),
      ProjectStage.find({ colid, assignmentid: String(assignment._id) }).sort({ stageorder: 1, createdAt: 1 }).lean(),
      StageEntry.find({ colid, assignmentid: String(assignment._id) }).sort({ createdAt: 1 }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    res.json({ success: true, assignment, student, stages, entries, institution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.summaryReport = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const [assignments, mentors, institution] = await Promise.all([
      SipStudent.find({ colid }).sort({ createdAt: -1 }).lean(),
      Mentor.find({ colid }).sort({ createdAt: -1 }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    const byCompany = Object.values(assignments.reduce((acc, item) => {
      const key = item.company || "Not specified";
      acc[key] = acc[key] || { name: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}));
    const byMentor = Object.values(mentors.reduce((acc, item) => {
      const key = item.mentor || "Not assigned";
      acc[key] = acc[key] || { name: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}));
    res.json({ success: true, assignments, mentors, byCompany, byMentor, institution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
