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
const InternshipStage = require("../Models/placementnewinternshipstageds");
const SipApplication = require("../Models/placementnewsipapplicationds");
const PlacementApplication = require("../Models/placementnewplacementapplicationds");
const PlacementRecord = require("../Models/placementnewrecordds");
const PlacementInterest = require("../Models/placementnewstudentinterestds");
const InternshipPool = require("../Models/placementnewinternshippoolds");
const InternshipApplication = require("../Models/placementnewinternshipapplicationds");
const InternshipSchedule = require("../Models/placementnewinternshipscheduleds");
const InternshipNocWorkflow = require("../Models/placementnewinternshipnocworkflowds");
const InternshipNoc = require("../Models/placementnewinternshipnocds");
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
  job: { Model: Job, fields: ["industry", "company", "companyemail", "type", "jobtitle", "jobdetails", "description", "startdate", "enddate", "programs", "semester", "minimumcgpa", "salary", "bondrequired", "joiningdate", "termsandconditions", "interntohire", "internshipsalary", "eligibilitycriteria", "cgpachecking", "atktno", "skills", "status"] },
  internship: { Model: Internship, fields: ["student", "studentemail", "regno", "program", "programcode", "admissionyear", "academicyear", "company", "areaofexpertise", "startdate", "enddate", "description", "status"] },
  sip: { Model: SipStudent, fields: ["jobid", "jobtitle", "type", "program", "programcode", "student", "studentemail", "regno", "admissionyear", "academicyear", "company", "companyemail", "project", "startdate", "enddate", "companycontact", "mentor", "mentoremail", "status"] },
  mentor: { Model: Mentor, fields: ["mentor", "mentoremail", "student", "studentemail", "regno", "academicyear", "admissionyear", "program", "programcode", "status"] },
  stage: { Model: ProjectStage, fields: ["assignmentid", "stagename", "stageorder", "description", "status"] },
  entry: { Model: StageEntry, fields: ["assignmentid", "stageid", "stagename", "details", "filelink", "remarks", "entrydate", "student", "studentemail", "regno"] },
  placementstage: { Model: PlacementStage, fields: ["stagename", "stageorder", "description", "status"] },
  internshipstage: { Model: InternshipStage, fields: ["stagename", "stageorder", "description", "status"] },
  sipapplication: { Model: SipApplication, fields: ["jobid", "jobtitle", "jobtype", "industry", "company", "companyemail", "student", "studentemail", "phone", "regno", "academicyear", "admissionyear", "program", "programcode", "semester", "section", "applieddate", "stageid", "stagename", "status", "selected", "offerletterlink", "offerlettername", "offeruploadeddate", "remarks"] },
  placementapplication: { Model: PlacementApplication, fields: ["jobid", "jobtitle", "jobtype", "industry", "company", "companyemail", "student", "studentemail", "phone", "regno", "academicyear", "admissionyear", "program", "programcode", "semester", "section", "applieddate", "stageid", "stagename", "status", "selected", "offerletterlink", "offerlettername", "offeruploadeddate", "remarks"] },
  stagestudent: { Model: PlacementStageStudent, fields: ["jobid", "jobtitle", "jobtype", "company", "companyemail", "student", "studentemail", "regno", "phone", "academicyear", "admissionyear", "program", "programcode", "semester", "section", "stageid", "stagename", "stagedate", "status", "placementstatus", "confirmeddate", "offerletterlink", "offerlettername", "contactdetails", "address", "ctc", "industry", "sector", "comments"] },
  record: { Model: PlacementRecord, fields: ["academicyear", "program", "programcode", "student", "regno", "industry", "sector", "role", "company", "address", "companymail", "companyemail", "salary", "department", "status"] },
  internshippool: { Model: InternshipPool, fields: ["academicyear", "program", "programcode", "companyname", "companyemail", "companyphone", "companyaddress", "contactperson", "contactemail", "contactphone", "industry", "sector", "title", "role", "description", "technologies", "location", "mode", "duration", "startdate", "enddate", "stipend", "openings", "eligibility", "applicationdeadline", "status", "name"] },
  internshipschedule: { Model: InternshipSchedule, fields: ["academicyear", "program", "programcode", "poolid", "title", "companyname", "schedule", "startdate", "enddate", "location", "coordinator", "coordinatoremail", "description", "status"] },
  internshipnocworkflow: { Model: InternshipNocWorkflow, fields: ["academicyear", "program", "programcode", "level", "approvername", "approveremail", "status"] }
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
  if (kind === "job") {
    if (typeof payload.semester === "string") payload.semester = payload.semester.split(",").map(text).filter(Boolean);
    if (typeof payload.cgpachecking === "string") payload.cgpachecking = payload.cgpachecking.split(",").map(text).filter(Boolean);
    if (Object.prototype.hasOwnProperty.call(source, "interntoohire")) payload.interntohire = text(source.interntoohire);
  }
  return payload;
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const [companies, programs, users, internships, sip, placementStages, internshipStages, stageStudents, placementRecords, internshipPools, internshipSchedules, internshipNocWorkflows, internshipNocs, ollamaConfigs, institution] = await Promise.all([
      Company.find({ colid }).sort({ company: 1 }).lean(),
      MPrograms.find({ colid }).sort({ Order: 1, program: 1 }).lean(),
      User.find({ colid }).select("name email user phone role program programcode admissionyear academicyear regno semester section photo skills").sort({ name: 1 }).lean(),
      Internship.find({ colid }).sort({ createdAt: -1 }).lean(),
      SipStudent.find({ colid }).sort({ createdAt: -1 }).lean(),
      PlacementStage.find({ colid }).sort({ stageorder: 1, stagename: 1 }).lean(),
      InternshipStage.find({ colid }).sort({ stageorder: 1, stagename: 1 }).lean(),
      PlacementStageStudent.find({ colid }).sort({ updatedAt: -1 }).lean(),
      PlacementRecord.find({ colid }).sort({ updatedAt: -1 }).lean(),
      InternshipPool.find({ colid }).sort({ createdAt: -1 }).lean(),
      InternshipSchedule.find({ colid }).sort({ startdate: -1 }).lean(),
      InternshipNocWorkflow.find({ colid, status: { $not: /^inactive$/i } }).sort({ level: 1 }).lean(),
      InternshipNoc.find({ colid }).sort({ updatedAt: -1 }).limit(1000).lean(),
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
      internshipStages,
      stageStudents,
      placementRecords,
      internshipPools,
      internshipSchedules,
      internshipNocWorkflows,
      internshipNocs,
      academicyears: uniqueSorted([...users.map((item) => item.academicyear), ...placementRecords.map((item) => item.academicyear)]),
      sectors: uniqueSorted(placementRecords.map((item) => item.sector)),
      recordIndustries: uniqueSorted(placementRecords.map((item) => item.industry)),
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

const countBy = (rows = [], keyFn) => Object.values(rows.reduce((acc, item) => {
  const key = text(keyFn(item)) || "Not specified";
  acc[key] = acc[key] || { name: key, count: 0 };
  acc[key].count += 1;
  return acc;
}, {})).sort((a, b) => b.count - a.count);

exports.placementDashboard = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const academicyear = text(req.query.academicyear);
    const recordFilter = { colid };
    const studentFilter = { colid, role: /^Student$/i };
    if (academicyear) {
      recordFilter.academicyear = academicyear;
      studentFilter.academicyear = academicyear;
    }
    const [records, students, institution] = await Promise.all([
      PlacementRecord.find(recordFilter).sort({ updatedAt: -1 }).lean(),
      User.find(studentFilter).select("name email regno academicyear program programcode department status role").lean(),
      Institution.findOne({ colid }).lean()
    ]);

    const activeStudents = students.filter((item) => {
      const status = text(item.status);
      return !status || status === "1" || /^active$/i.test(status);
    });
    const denominatorStudents = activeStudents.length ? activeStudents : students;
    const placementRows = records.filter((item) => !/^inactive$/i.test(text(item.status)));
    const placedKeys = new Set(placementRows.map((item) => text(item.regno) || `${text(item.student)}-${text(item.programcode)}`).filter(Boolean));
    const totalSalary = placementRows.reduce((sum, item) => sum + num(item.salary), 0);
    const programMap = {};
    denominatorStudents.forEach((student) => {
      const key = text(student.programcode) || text(student.program) || "Not specified";
      programMap[key] = programMap[key] || { name: key, program: text(student.program), programcode: text(student.programcode), eligible: 0, placed: 0, percentage: 0 };
      programMap[key].eligible += 1;
    });
    const placedByProgramRegno = new Set();
    placementRows.forEach((record) => {
      const key = text(record.programcode) || text(record.program) || "Not specified";
      programMap[key] = programMap[key] || { name: key, program: text(record.program), programcode: text(record.programcode), eligible: 0, placed: 0, percentage: 0 };
      const identity = `${key}-${text(record.regno) || text(record.student)}`;
      if (!placedByProgramRegno.has(identity)) {
        programMap[key].placed += 1;
        placedByProgramRegno.add(identity);
      }
    });
    const programwise = Object.values(programMap).map((item) => ({
      ...item,
      percentage: item.eligible ? Number(((item.placed / item.eligible) * 100).toFixed(2)) : 0
    })).sort((a, b) => a.name.localeCompare(b.name));
    const academicyears = uniqueSorted([...records.map((item) => item.academicyear), ...students.map((item) => item.academicyear)]);

    res.json({
      success: true,
      institution,
      records,
      students: denominatorStudents,
      academicyears,
      sectorwise: countBy(placementRows, (item) => item.sector || item.industry),
      industrywise: countBy(placementRows, (item) => item.industry),
      programwise,
      summary: {
        placementRecords: placementRows.length,
        placedStudents: placedKeys.size,
        eligibleStudents: denominatorStudents.length,
        placementPercentage: denominatorStudents.length ? Number(((placedKeys.size / denominatorStudents.length) * 100).toFixed(2)) : 0,
        averageSalary: placementRows.length ? Number((totalSalary / placementRows.length).toFixed(2)) : 0,
        highestSalary: placementRows.reduce((max, item) => Math.max(max, num(item.salary)), 0)
      }
    });
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

const applicationModelForType = (type) => /^placement$/i.test(text(type)) ? PlacementApplication : SipApplication;
const applicationStageListForType = async (colid, type) => /^placement$/i.test(text(type))
  ? PlacementStage.find({ colid, status: { $not: /^inactive$/i } }).sort({ stageorder: 1, stagename: 1 }).lean()
  : InternshipStage.find({ colid, status: { $not: /^inactive$/i } }).sort({ stageorder: 1, stagename: 1 }).lean();

const studentIdentityFilter = (source = {}) => {
  const email = text(source.email || source.user || source.studentemail);
  const regno = text(source.regno);
  if (email && regno) return { $or: [{ studentemail: email }, { regno }] };
  if (regno) return { regno };
  return { studentemail: email };
};

exports.studentJobs = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const type = /^placement$/i.test(text(req.query.type)) ? "Placement" : "SIP";
    const student = await User.findOne({ colid, $or: [{ email: text(req.query.email || req.query.user) }, { user: text(req.query.email || req.query.user) }, { regno: text(req.query.regno) }] }).lean();
    const programcode = text(student?.programcode || req.query.programcode);
    const now = new Date().toISOString().slice(0, 10);
    const jobs = await Job.find({
      colid,
      type,
      status: /^active$/i,
      $and: [
        { $or: [{ startdate: "" }, { startdate: { $exists: false } }, { startdate: { $lte: now } }] },
        { $or: [{ enddate: "" }, { enddate: { $exists: false } }, { enddate: { $gte: now } }] }
      ]
    }).sort({ createdAt: -1 }).lean();
    const visibleJobs = jobs.filter((job) => {
      const programs = Array.isArray(job.programs) ? job.programs : [];
      if (!programs.length || !programcode) return true;
      return programs.some((item) => text(item.programcode) === programcode);
    });
    const Application = applicationModelForType(type);
    const applications = await Application.find({ colid, ...studentIdentityFilter({ email: student?.email || req.query.email || req.query.user, regno: student?.regno || req.query.regno }) }).lean();
    const appMap = new Map(applications.map((item) => [text(item.jobid), item]));
    const data = visibleJobs.map((job) => ({ ...job, applied: appMap.has(String(job._id)), application: appMap.get(String(job._id)) || null }));
    res.json({ success: true, data, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyJob = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const type = /^placement$/i.test(text(req.body.type)) ? "Placement" : "SIP";
    const job = await Job.findOne({ _id: req.body.jobid, colid, type }).lean();
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    const student = await User.findOne({ colid, $or: [{ email: text(req.body.email || req.body.user) }, { user: text(req.body.email || req.body.user) }, { regno: text(req.body.regno) }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const stages = await applicationStageListForType(colid, type);
    const firstStage = stages[0] || {};
    const Application = applicationModelForType(type);
    const payload = {
      jobid: String(job._id),
      jobtitle: text(job.jobtitle),
      jobtype: type,
      industry: text(job.industry),
      company: text(job.company),
      companyemail: text(job.companyemail),
      student: text(student.name),
      studentemail: text(student.email || student.user),
      phone: text(student.phone),
      regno: text(student.regno),
      academicyear: text(student.academicyear),
      admissionyear: text(student.admissionyear),
      program: text(student.program),
      programcode: text(student.programcode),
      semester: text(student.semester),
      section: text(student.section),
      applieddate: new Date().toISOString().slice(0, 10),
      stageid: firstStage._id ? String(firstStage._id) : "",
      stagename: text(firstStage.stagename) || "Applied",
      status: "Applied",
      selected: "No",
      colid,
      user: text(req.body.user)
    };
    const identity = text(student.regno) ? { regno: text(student.regno) } : { studentemail: text(student.email || student.user) };
    const data = await Application.findOneAndUpdate({ colid, jobid: String(job._id), ...identity }, { $setOnInsert: payload }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Already applied for this job" : error.message });
  }
};

const interestFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  ["academicyear", "regulation", "program", "programcode", "semester", "section", "department", "category", "gender", "student", "studentemail", "regno", "interested", "industry"].forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  return filter;
};

exports.studentPlacementInterest = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const student = await User.findOne({ colid, $or: [{ email: text(req.query.email || req.query.user) }, { user: text(req.query.email || req.query.user) }, { regno: text(req.query.regno) }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const identity = text(student.regno) ? { regno: text(student.regno) } : { studentemail: text(student.email || student.user) };
    const [interest, companies, records, jobs] = await Promise.all([
      PlacementInterest.findOne({ colid, academicyear: text(student.academicyear), ...identity }).lean(),
      Company.find({ colid }).select("industry").lean(),
      PlacementRecord.find({ colid }).select("industry sector").lean(),
      Job.find({ colid }).select("industry").lean()
    ]);
    res.json({ success: true, student, interest, industries: uniqueSorted([...companies.map((item) => item.industry), ...records.map((item) => item.industry || item.sector), ...jobs.map((item) => item.industry)]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePlacementInterest = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const student = await User.findOne({ colid, $or: [{ email: text(req.body.email || req.body.user) }, { user: text(req.body.email || req.body.user) }, { regno: text(req.body.regno) }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const payload = {
      academicyear: text(student.academicyear),
      regulation: text(student.regulation),
      program: text(student.program),
      programcode: text(student.programcode),
      semester: text(student.semester),
      section: text(student.section),
      department: text(student.department),
      category: text(student.category),
      gender: text(student.gender),
      student: text(student.name),
      studentemail: text(student.email || student.user),
      regno: text(student.regno),
      interested: /^no$/i.test(text(req.body.interested)) ? "No" : "Yes",
      industry: text(req.body.industry),
      comments: text(req.body.comments),
      colid,
      user: text(req.body.user)
    };
    const identity = text(student.regno) ? { regno: text(student.regno) } : { studentemail: text(student.email || student.user) };
    const data = await PlacementInterest.findOneAndUpdate({ colid, academicyear: payload.academicyear, ...identity }, { $set: payload }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.placementInterests = async (req, res) => {
  try {
    const [data, institution] = await Promise.all([
      PlacementInterest.find(interestFilter(req.body)).sort({ updatedAt: -1 }).limit(5000).lean(),
      Institution.findOne({ colid: Number(req.body.colid) }).lean()
    ]);
    res.json({ success: true, data, institution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.placementInterestAnalysis = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const rows = await PlacementInterest.find(interestFilter(req.body)).sort({ updatedAt: -1 }).limit(5000).lean();
    const institution = await Institution.findOne({ colid }).lean();
    const interested = rows.filter((item) => /^yes$/i.test(text(item.interested))).length;
    const notInterested = rows.filter((item) => /^no$/i.test(text(item.interested))).length;
    res.json({
      success: true,
      rows,
      institution,
      byProgram: countBy(rows, (item) => item.programcode || item.program),
      bySemester: countBy(rows, (item) => item.semester),
      byIndustry: countBy(rows.filter((item) => /^yes$/i.test(text(item.interested))), (item) => item.industry),
      byInterest: countBy(rows, (item) => item.interested),
      summary: { total: rows.length, interested, notInterested, undecided: rows.length - interested - notInterested }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bestCgpaForStudent = (marks = []) => {
  const values = marks.map((item) => num(item.gpa || item.sgpa || item.api || item.overallgradepoint)).filter((value) => value > 0);
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0;
};

exports.eligibleStudentsForJob = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const job = await Job.findOne({ _id: req.body.jobid, colid }).lean();
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    const programCodes = (Array.isArray(job.programs) ? job.programs : []).map((item) => text(item.programcode)).filter(Boolean);
    const semesters = (Array.isArray(job.semester) ? job.semester : []).map(text).filter(Boolean);
    const studentQuery = { colid, role: /^Student$/i };
    if (text(req.body.academicyear)) studentQuery.academicyear = text(req.body.academicyear);
    if (programCodes.length) studentQuery.programcode = { $in: programCodes };
    if (semesters.length) studentQuery.semester = { $in: semesters };
    const students = await User.find(studentQuery).select("name email user phone regno academicyear regulation program programcode semester section category gender tenth twelfth percentage10 percentage12 cgpa").sort({ programcode: 1, semester: 1, name: 1 }).limit(10000).lean();
    const regnos = students.map((student) => text(student.regno)).filter(Boolean);
    const marks = await VivaMarks.find({ colid, regno: { $in: regnos } }).select("regno status gpa overallgradepoint overallgrade overallpercentage semester course coursecode").lean();
    const marksByRegno = marks.reduce((acc, item) => {
      const key = text(item.regno);
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
    const requiredCgpa = num(job.minimumcgpa);
    const maxAtkt = num(job.atktno);
    const checks = Array.isArray(job.cgpachecking) ? job.cgpachecking.map(text) : [];
    const data = students.map((student) => {
      const studentMarks = marksByRegno[text(student.regno)] || [];
      const atkt = studentMarks.filter((item) => /^fail$/i.test(text(item.status)) || /^f$/i.test(text(item.overallgrade)) || (text(item.status) && !/^pass$/i.test(text(item.status)))).length;
      const cgpa = num(student.cgpa) || bestCgpaForStudent(studentMarks);
      const reasons = [];
      if (requiredCgpa && cgpa && cgpa < requiredCgpa) reasons.push(`CGPA ${cgpa} below required ${requiredCgpa}`);
      if (requiredCgpa && !cgpa) reasons.push("CGPA not available");
      if (maxAtkt && atkt > maxAtkt) reasons.push(`ATKT ${atkt} above allowed ${maxAtkt}`);
      if (checks.some((item) => /^10th$/i.test(item)) && !text(student.tenth || student.percentage10)) reasons.push("10th details not available");
      if (checks.some((item) => /^12th$/i.test(item)) && !text(student.twelfth || student.percentage12)) reasons.push("12th details not available");
      return {
        ...student,
        cgpa,
        atkt,
        eligible: reasons.length ? "No" : "Yes",
        reasons: reasons.join("; ") || "Eligible"
      };
    });
    res.json({ success: true, job, data, eligible: data.filter((item) => item.eligible === "Yes"), ineligible: data.filter((item) => item.eligible !== "Yes"), summary: { total: data.length, eligible: data.filter((item) => item.eligible === "Yes").length, ineligible: data.filter((item) => item.eligible !== "Yes").length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const applicationFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  ["jobid", "jobtitle", "company", "industry", "student", "studentemail", "regno", "academicyear", "admissionyear", "program", "programcode", "semester", "section", "stagename", "status", "selected"].forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  if (text(source.appliedFrom) || text(source.appliedTo)) {
    filter.applieddate = {};
    if (text(source.appliedFrom)) filter.applieddate.$gte = text(source.appliedFrom);
    if (text(source.appliedTo)) filter.applieddate.$lte = text(source.appliedTo);
  }
  return filter;
};

exports.applicationList = async (req, res) => {
  try {
    const type = /^placement$/i.test(text(req.query.type)) ? "Placement" : "SIP";
    const Application = applicationModelForType(type);
    const colid = Number(req.query.colid);
    const [data, stages] = await Promise.all([
      Application.find(applicationFilter(req.query)).sort({ updatedAt: -1 }).limit(5000).lean(),
      applicationStageListForType(colid, type)
    ]);
    res.json({ success: true, data, stages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applicationStatus = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one application" });
    if (/^yes$/i.test(text(req.body.selected)) && !text(req.body.offerletterlink)) {
      return res.status(400).json({ success: false, message: "Offer letter upload is required when selected is Yes" });
    }
    const type = /^placement$/i.test(text(req.body.type)) ? "Placement" : "SIP";
    const Application = applicationModelForType(type);
    const stage = req.body.stage || {};
    const payload = {
      status: text(req.body.status) || "Applied",
      selected: text(req.body.selected) || "No",
      remarks: text(req.body.remarks),
      user: text(req.body.user)
    };
    if (stage._id) {
      payload.stageid = String(stage._id);
      payload.stagename = text(stage.stagename);
    } else if (text(req.body.stagename)) {
      payload.stagename = text(req.body.stagename);
    }
    if (text(req.body.offerletterlink)) {
      payload.offerletterlink = text(req.body.offerletterlink);
      payload.offerlettername = text(req.body.offerlettername);
      payload.offeruploadeddate = new Date().toISOString().slice(0, 10);
    }
    const result = await Application.updateMany({ _id: { $in: ids }, colid: Number(req.body.colid) }, { $set: payload });
    if (/^yes$/i.test(text(payload.selected))) {
      const selectedApps = await Application.find({ _id: { $in: ids }, colid: Number(req.body.colid) }).lean();
      if (type === "SIP") {
        await Promise.all(selectedApps.map((item) => {
          const identity = text(item.regno) ? { regno: text(item.regno) } : { studentemail: text(item.studentemail) };
          return SipStudent.findOneAndUpdate(
            { colid: Number(req.body.colid), jobid: text(item.jobid), ...identity },
            {
              $set: {
                jobid: text(item.jobid),
                jobtitle: text(item.jobtitle),
                type: "SIP",
                program: text(item.program),
                programcode: text(item.programcode),
                student: text(item.student),
                studentemail: text(item.studentemail),
                regno: text(item.regno),
                admissionyear: text(item.admissionyear),
                academicyear: text(item.academicyear),
                company: text(item.company),
                companyemail: text(item.companyemail),
                project: text(item.jobtitle),
                startdate: "",
                enddate: "",
                companycontact: "",
                mentor: "",
                mentoremail: "",
                status: "Selected",
                colid: Number(req.body.colid),
                user: text(req.body.user)
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }));
      } else {
        await Promise.all(selectedApps.map((item) => {
          const identity = text(item.regno) ? { regno: text(item.regno) } : { studentemail: text(item.studentemail) };
          return PlacementStageStudent.findOneAndUpdate(
            { colid: Number(req.body.colid), jobid: text(item.jobid), ...identity },
            {
              $set: {
                jobid: text(item.jobid),
                jobtitle: text(item.jobtitle),
                jobtype: "Placement",
                company: text(item.company),
                companyemail: text(item.companyemail),
                student: text(item.student),
                studentemail: text(item.studentemail),
                regno: text(item.regno),
                phone: text(item.phone),
                academicyear: text(item.academicyear),
                admissionyear: text(item.admissionyear),
                program: text(item.program),
                programcode: text(item.programcode),
                semester: text(item.semester),
                section: text(item.section),
                stageid: text(item.stageid),
                stagename: text(item.stagename),
                stagedate: new Date().toISOString().slice(0, 10),
                status: "Active",
                placementstatus: "Placed",
                confirmeddate: new Date().toISOString().slice(0, 10),
                offerletterlink: text(item.offerletterlink),
                offerlettername: text(item.offerlettername),
                industry: text(item.industry),
                comments: text(item.remarks),
                colid: Number(req.body.colid),
                user: text(req.body.user)
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }));
      }
    }
    res.json({ success: true, modified: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentInternshipPools = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const student = await User.findOne({ colid, $or: [{ email: text(req.query.email || req.query.user) }, { user: text(req.query.email || req.query.user) }, { regno: text(req.query.regno) }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const now = new Date().toISOString().slice(0, 10);
    const filter = {
      colid,
      status: /^active$/i,
      $and: [
        { $or: [{ academicyear: text(student.academicyear) }, { academicyear: "" }, { academicyear: { $exists: false } }] },
        { $or: [{ programcode: text(student.programcode) }, { programcode: "" }, { programcode: { $exists: false } }] },
        { $or: [{ applicationdeadline: "" }, { applicationdeadline: { $exists: false } }, { applicationdeadline: { $gte: now } }] }
      ]
    };
    const [pools, applications] = await Promise.all([
      InternshipPool.find(filter).sort({ createdAt: -1 }).lean(),
      InternshipApplication.find({ colid, ...studentIdentityFilter({ email: student.email || student.user, regno: student.regno }) }).lean()
    ]);
    const appMap = new Map(applications.map((item) => [text(item.poolid), item]));
    res.json({ success: true, student, data: pools.map((pool) => ({ ...pool, applied: appMap.has(String(pool._id)), application: appMap.get(String(pool._id)) || null })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyInternshipPool = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const pool = await InternshipPool.findOne({ _id: req.body.poolid, colid }).lean();
    if (!pool) return res.status(404).json({ success: false, message: "Internship not found" });
    const student = await User.findOne({ colid, $or: [{ email: text(req.body.email || req.body.user) }, { user: text(req.body.email || req.body.user) }, { regno: text(req.body.regno) }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const payload = {
      poolid: String(pool._id),
      academicyear: text(pool.academicyear || student.academicyear),
      program: text(pool.program || student.program),
      programcode: text(pool.programcode || student.programcode),
      companyname: text(pool.companyname),
      companyemail: text(pool.companyemail),
      title: text(pool.title),
      role: text(pool.role),
      location: text(pool.location),
      duration: text(pool.duration),
      stipend: text(pool.stipend),
      student: text(student.name),
      studentemail: text(student.email || student.user),
      phone: text(student.phone),
      regno: text(student.regno),
      semester: text(student.semester),
      section: text(student.section),
      applieddate: new Date().toISOString().slice(0, 10),
      status: "Submitted",
      approvalstatus: "Pending",
      selected: "No",
      colid,
      user: text(req.body.user)
    };
    const identity = text(student.regno) ? { regno: text(student.regno) } : { studentemail: text(student.email || student.user) };
    const data = await InternshipApplication.findOneAndUpdate({ colid, poolid: String(pool._id), ...identity }, { $setOnInsert: payload }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Already applied for this internship" : error.message });
  }
};

const internshipApplicationFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  ["academicyear", "program", "programcode", "companyname", "title", "student", "studentemail", "regno", "semester", "section", "status", "approvalstatus", "selected"].forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  if (text(source.appliedFrom) || text(source.appliedTo)) {
    filter.applieddate = {};
    if (text(source.appliedFrom)) filter.applieddate.$gte = text(source.appliedFrom);
    if (text(source.appliedTo)) filter.applieddate.$lte = text(source.appliedTo);
  }
  return filter;
};

exports.internshipApplications = async (req, res) => {
  try {
    const data = await InternshipApplication.find(internshipApplicationFilter(req.query)).sort({ updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.internshipApplicationStatus = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one application" });
    const approvalstatus = text(req.body.approvalstatus) || "Approved";
    const payload = {
      approvalstatus,
      status: approvalstatus,
      selected: /^approved$/i.test(approvalstatus) ? "Yes" : "No",
      coordinatorcomment: text(req.body.coordinatorcomment),
      approvedby: text(req.body.name),
      approvedbyemail: text(req.body.user),
      approvaldate: new Date().toISOString().slice(0, 10),
      user: text(req.body.user)
    };
    const result = await InternshipApplication.updateMany({ _id: { $in: ids }, colid: Number(req.body.colid) }, { $set: payload });
    res.json({ success: true, modified: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const firstNocApprover = async (colid, source = {}) => InternshipNocWorkflow.findOne({
  colid,
  status: { $not: /^inactive$/i },
  $or: [
    { academicyear: text(source.academicyear), programcode: text(source.programcode) },
    { academicyear: text(source.academicyear), programcode: "" },
    { academicyear: "", programcode: text(source.programcode) },
    { academicyear: "", programcode: "" }
  ]
}).sort({ level: 1 }).lean();

const nextNocApprover = async (colid, noc, currentLevel) => InternshipNocWorkflow.findOne({
  colid,
  status: { $not: /^inactive$/i },
  level: { $gt: Number(currentLevel || 0) },
  $or: [
    { academicyear: text(noc.academicyear), programcode: text(noc.programcode) },
    { academicyear: text(noc.academicyear), programcode: "" },
    { academicyear: "", programcode: text(noc.programcode) },
    { academicyear: "", programcode: "" }
  ]
}).sort({ level: 1 }).lean();

exports.submitInternshipNoc = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const student = await User.findOne({ colid, $or: [{ email: text(req.body.email || req.body.user) }, { user: text(req.body.email || req.body.user) }, { regno: text(req.body.regno) }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    if (!text(req.body.offerletterlink)) return res.status(400).json({ success: false, message: "Offer letter upload is required" });
    const approver = await firstNocApprover(colid, { academicyear: req.body.academicyear || student.academicyear, programcode: req.body.programcode || student.programcode });
    const approvalstatus = approver ? "Under Process" : "Approved";
    const payload = {
      academicyear: text(req.body.academicyear || student.academicyear),
      regulation: text(req.body.regulation || student.regulation),
      program: text(req.body.program || student.program),
      programcode: text(req.body.programcode || student.programcode),
      semester: text(req.body.semester || student.semester),
      student: text(student.name),
      studentemail: text(student.email || student.user),
      phone: text(student.phone || req.body.phone),
      regno: text(student.regno),
      companyname: text(req.body.companyname),
      contactperson: text(req.body.contactperson),
      officialemail: text(req.body.officialemail),
      mobile: text(req.body.mobile),
      location: text(req.body.location),
      title: text(req.body.title),
      technologies: text(req.body.technologies),
      offerletterlink: text(req.body.offerletterlink),
      offerlettername: text(req.body.offerlettername),
      submissioncomment: text(req.body.submissioncomment),
      approvalstatus,
      currentlevel: approver?.level || 0,
      currentapprovername: text(approver?.approvername),
      currentapproveremail: text(approver?.approveremail),
      finalapprovaldate: approver ? "" : new Date().toISOString().slice(0, 10),
      history: approver ? [] : [{ level: 0, approvername: "System", approveremail: "", action: "Approved", comments: "No workflow configured", actiondate: new Date().toISOString() }],
      colid,
      user: text(req.body.user)
    };
    const data = req.body.id
      ? await InternshipNoc.findOneAndUpdate({ _id: req.body.id, colid, studentemail: payload.studentemail }, payload, { new: true })
      : await InternshipNoc.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const nocFilter = (source = {}) => {
  const filter = { colid: Number(source.colid) };
  ["academicyear", "regulation", "program", "programcode", "semester", "student", "studentemail", "regno", "companyname", "title", "approvalstatus", "currentapproveremail"].forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  return filter;
};

exports.internshipNocs = async (req, res) => {
  try {
    const filter = nocFilter(req.query);
    if (/^student$/i.test(text(req.query.mode))) {
      const identity = studentIdentityFilter({ email: req.query.email || req.query.user, regno: req.query.regno });
      Object.assign(filter, identity);
    }
    if (/^approver$/i.test(text(req.query.mode))) filter.currentapproveremail = regex(req.query.email || req.query.user);
    const [data, institution] = await Promise.all([
      InternshipNoc.find(filter).sort({ updatedAt: -1 }).limit(5000).lean(),
      Institution.findOne({ colid: Number(req.query.colid) }).lean()
    ]);
    res.json({ success: true, data, institution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.internshipNocDecision = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const action = /^reject/i.test(text(req.body.action)) ? "Rejected" : "Approved";
    const noc = await InternshipNoc.findOne({ _id: req.body.id, colid }).lean();
    if (!noc) return res.status(404).json({ success: false, message: "NOC request not found" });
    if (text(noc.currentapproveremail).toLowerCase() !== text(req.body.user).toLowerCase()) {
      return res.status(403).json({ success: false, message: "This request is not pending for the logged in approver" });
    }
    const historyItem = {
      level: Number(noc.currentlevel || 0),
      approvername: text(req.body.name || noc.currentapprovername),
      approveremail: text(req.body.user || noc.currentapproveremail),
      action,
      comments: text(req.body.comments),
      actiondate: new Date().toISOString()
    };
    const next = action === "Approved" ? await nextNocApprover(colid, noc, noc.currentlevel) : null;
    const update = action === "Rejected"
      ? { approvalstatus: "Rejected", currentapprovername: "", currentapproveremail: "", history: [...(noc.history || []), historyItem], user: text(req.body.user) }
      : next
        ? { approvalstatus: "Under Process", currentlevel: next.level, currentapprovername: text(next.approvername), currentapproveremail: text(next.approveremail), history: [...(noc.history || []), historyItem], user: text(req.body.user) }
        : { approvalstatus: "Approved", currentlevel: Number(noc.currentlevel || 0), currentapprovername: "", currentapproveremail: "", finalapprovaldate: new Date().toISOString().slice(0, 10), history: [...(noc.history || []), historyItem], user: text(req.body.user) };
    const data = await InternshipNoc.findOneAndUpdate({ _id: req.body.id, colid }, update, { new: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.internshipReport = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const appFilter = internshipApplicationFilter(req.query);
    const poolFilter = { colid };
    ["academicyear", "program", "programcode", "companyname", "title", "status"].forEach((field) => {
      if (text(req.query[field])) poolFilter[field] = regex(req.query[field]);
    });
    const [pools, applications, schedules, institution] = await Promise.all([
      InternshipPool.find(poolFilter).sort({ createdAt: -1 }).limit(5000).lean(),
      InternshipApplication.find(appFilter).sort({ updatedAt: -1 }).limit(5000).lean(),
      InternshipSchedule.find(poolFilter).sort({ startdate: -1 }).limit(5000).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    const approved = applications.filter((item) => /^approved$/i.test(text(item.approvalstatus))).length;
    const rejected = applications.filter((item) => /^rejected$/i.test(text(item.approvalstatus))).length;
    res.json({
      success: true,
      pools,
      applications,
      schedules,
      institution,
      byProgram: countBy(applications, (item) => item.programcode || item.program),
      byCompany: countBy(applications, (item) => item.companyname),
      byStatus: countBy(applications, (item) => item.approvalstatus || item.status),
      summary: { pools: pools.length, applications: applications.length, approved, rejected, pending: applications.length - approved - rejected, schedules: schedules.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.internshipNocDashboard = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    const [rows, institution] = await Promise.all([
      InternshipNoc.find(filter).sort({ updatedAt: -1 }).limit(5000).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    const byProgramMap = {};
    rows.forEach((item) => {
      const key = text(item.programcode || item.program) || "Not specified";
      byProgramMap[key] = byProgramMap[key] || { name: key, program: text(item.program), programcode: text(item.programcode), applied: 0, approved: 0, rejected: 0, underprocess: 0 };
      byProgramMap[key].applied += 1;
      if (/^approved$/i.test(text(item.approvalstatus))) byProgramMap[key].approved += 1;
      else if (/^rejected$/i.test(text(item.approvalstatus))) byProgramMap[key].rejected += 1;
      else byProgramMap[key].underprocess += 1;
    });
    const approved = rows.filter((item) => /^approved$/i.test(text(item.approvalstatus))).length;
    const rejected = rows.filter((item) => /^rejected$/i.test(text(item.approvalstatus))).length;
    res.json({
      success: true,
      rows,
      institution,
      byProgram: Object.values(byProgramMap),
      byStatus: countBy(rows, (item) => item.approvalstatus),
      academicyears: uniqueSorted(rows.map((item) => item.academicyear)),
      summary: { applied: rows.length, approved, rejected, underprocess: rows.length - approved - rejected }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applicationProfile = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const student = await User.findOne({ colid, $or: [{ email: text(req.query.email) }, { user: text(req.query.email) }, { regno: text(req.query.regno) }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const [marks, internships, sipAssignments, institution] = await Promise.all([
      VivaMarks.find({ colid, $or: [{ regno: text(student.regno) }, { studentemail: text(student.email) }] }).lean(),
      Internship.find({ colid, $or: [{ regno: text(student.regno) }, { studentemail: text(student.email) }] }).lean(),
      SipStudent.find({ colid, $or: [{ regno: text(student.regno) }, { studentemail: text(student.email) }] }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    res.json({ success: true, student, marks, internships, sipAssignments, institution });
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
