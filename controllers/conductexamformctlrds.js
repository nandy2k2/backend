const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const ConductExamFee = require("../Models/conductexamfeeds");
const ConductExamFeeMax = require("../Models/conductexamexamfeemaxds");
const ConductExamForm = require("../Models/conductexamformds");
const ConductExamFormSubmission = require("../Models/conductexamformsubmissionds");
const ConductExam = require("../Models/conductexamds");
const ConductExamCourse = require("../Models/conductexamcourseds");
const ConductExamRoll = require("../Models/conductexamrollds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const NepClassEnrollment = require("../Models/nepclassenrollmentds");
const ExamModel2Marks = require("../Models/examinationmodel2marksds");
const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");
const Institution = require("../Models/insdetails");

const upload = multer({ storage: multer.memoryStorage() });

const clean = (value) => String(value || "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const regex = (value) => new RegExp(`^${clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const sortText = (a, b) => clean(a).localeCompare(clean(b), undefined, { numeric: true });
const uniqueSorted = (values = []) => [...new Set(values.map((value) => clean(value)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const uploadToAws = async (colid, file) => {
  const config = await Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
    throw new Error("Default AWS configuration is missing or incomplete");
  }
  const cleanName = path.basename(file.originalname || "document").replace(/[^\w.\-() ]/g, "_");
  const key = `${colid}/conduct-exam-form-documents/${Date.now()}-${cleanName}`;
  const s3 = new AWS.S3({
    accessKeyId: config.username,
    secretAccessKey: config.password,
    region: config.region
  });
  await s3.putObject({
    Bucket: config.bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || "application/octet-stream"
  }).promise();
  return { filename: cleanName, key, url: s3Url(config.bucket, config.region, key) };
};

const queryFrom = (source, allowed) => {
  const query = {};
  allowed.forEach((field) => {
    if (clean(source[field])) query[field] = clean(source[field]);
  });
  return query;
};

const feePayload = (body) => ({
  colid: num(body.colid),
  academicyear: clean(body.academicyear),
  regulation: clean(body.regulation),
  exam: clean(body.exam),
  examcode: clean(body.examcode),
  program: clean(body.program),
  programcode: clean(body.programcode),
  semester: clean(body.semester),
  course: clean(body.course),
  coursecode: clean(body.coursecode),
  regularfee: num(body.regularfee),
  supplementaryfee: num(body.supplementaryfee),
  appealfee: num(body.appealfee),
  status: clean(body.status) || "Active",
  user: clean(body.user)
});

const feeMaxPayload = (body) => ({
  colid: num(body.colid),
  academicyear: clean(body.academicyear),
  regulation: clean(body.regulation),
  program: clean(body.program),
  programcode: clean(body.programcode),
  exam: clean(body.exam),
  examcode: clean(body.examcode),
  maxfees: num(body.maxfees),
  status: clean(body.status) || "Active",
  user: clean(body.user)
});

const formPayload = (body) => ({
  colid: num(body.colid),
  formname: clean(body.formname),
  formid: clean(body.formid) || `EXAMFORM-${Date.now()}`,
  academicyear: clean(body.academicyear),
  program: clean(body.program),
  programcode: clean(body.programcode),
  examtype: clean(body.examtype) || "Regular",
  status: clean(body.status) || "Active",
  instructions: clean(body.instructions),
  mandatorycriteria: clean(body.mandatorycriteria),
  validationcriteria: clean(body.validationcriteria),
  tabs: Array.isArray(body.tabs) ? body.tabs : [],
  documents: Array.isArray(body.documents) ? body.documents : [],
  user: clean(body.user)
});

exports.getFees = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const filter = { colid, ...queryFrom(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode", "status"]) };
    const data = await ConductExamFee.find(filter).sort({ academicyear: 1, examcode: 1, programcode: 1, semester: 1, coursecode: 1 }).lean();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to load exam fees" });
  }
};

exports.saveFee = async (req, res) => {
  try {
    const payload = feePayload(req.body);
    const required = ["colid", "academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode"];
    const missing = required.filter((field) => !payload[field]);
    if (missing.length) return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
    let data;
    if (clean(req.body.id)) {
      data = await ConductExamFee.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true });
    } else {
      data = await ConductExamFee.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, examcode: payload.examcode, programcode: payload.programcode, semester: payload.semester, coursecode: payload.coursecode },
        payload,
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to save exam fee" });
  }
};

exports.deleteFee = async (req, res) => {
  try {
    await ConductExamFee.deleteOne({ _id: req.body.id, colid: num(req.body.colid) });
    res.json({ message: "Exam fee deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to delete exam fee" });
  }
};

exports.bulkFees = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    for (const row of rows) {
      const payload = feePayload({ ...row, colid: req.body.colid, user: req.body.user || row.user });
      if (!payload.academicyear || !payload.examcode || !payload.programcode || !payload.semester || !payload.coursecode) continue;
      await ConductExamFee.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, examcode: payload.examcode, programcode: payload.programcode, semester: payload.semester, coursecode: payload.coursecode },
        payload,
        { upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ message: `${saved} exam fee rows uploaded`, saved });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to upload exam fees" });
  }
};

exports.getFeeMaxOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ message: "colid is required" });
    const [courseRows, maxRows] = await Promise.all([
      ConductExamCourse.find({ colid })
        .select("academicyear regulation exam examcode program programcode")
        .sort({ academicyear: 1, examcode: 1, program: 1 })
        .lean(),
      ConductExamFeeMax.find({ colid })
        .select("academicyear regulation exam examcode program programcode status")
        .sort({ academicyear: 1, examcode: 1, program: 1 })
        .lean()
    ]);
    const rows = [...courseRows, ...maxRows];
    const exams = [];
    const examSeen = new Set();
    rows.forEach((row) => {
      const key = `${clean(row.academicyear)}||${clean(row.examcode)}||${clean(row.exam)}`;
      if (!clean(row.examcode) || examSeen.has(key)) return;
      examSeen.add(key);
      exams.push({ academicyear: clean(row.academicyear), exam: clean(row.exam), examcode: clean(row.examcode) });
    });
    const programs = [];
    const programSeen = new Set();
    rows.forEach((row) => {
      const key = `${clean(row.programcode)}||${clean(row.program)}`;
      if (!clean(row.programcode) || programSeen.has(key)) return;
      programSeen.add(key);
      programs.push({ program: clean(row.program), programcode: clean(row.programcode) });
    });
    res.json({
      data: {
        academicyears: distinctFromRows(rows, "academicyear"),
        regulations: distinctFromRows(rows, "regulation"),
        exams,
        programs,
        statuses: ["Active", "Inactive"]
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to load exam fee max options" });
  }
};

exports.getFeeMax = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const filter = { colid, ...queryFrom(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "status"]) };
    const data = await ConductExamFeeMax.find(filter).sort({ academicyear: 1, examcode: 1, program: 1 }).lean();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to load exam fee max rows" });
  }
};

exports.saveFeeMax = async (req, res) => {
  try {
    const payload = feeMaxPayload(req.body);
    const required = ["colid", "academicyear", "regulation", "program", "programcode", "exam", "examcode"];
    const missing = required.filter((field) => !payload[field]);
    if (missing.length) return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
    const data = clean(req.body.id)
      ? await ConductExamFeeMax.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ConductExamFeeMax.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode, examcode: payload.examcode },
        payload,
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to save exam fee max" });
  }
};

exports.deleteFeeMax = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await ConductExamFeeMax.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ message: "Exam fee max row(s) deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to delete exam fee max rows" });
  }
};

exports.bulkFeeMax = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    for (const row of rows) {
      const payload = feeMaxPayload({ ...row, colid: req.body.colid, user: req.body.user || row.user });
      if (!payload.academicyear || !payload.regulation || !payload.programcode || !payload.examcode) continue;
      await ConductExamFeeMax.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode, examcode: payload.examcode },
        payload,
        { upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ message: `${saved} exam fee max rows uploaded`, saved });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to upload exam fee max rows" });
  }
};

exports.getForms = async (req, res) => {
  try {
    const filter = { colid: num(req.query.colid), ...queryFrom(req.query, ["academicyear", "programcode", "examtype", "status", "formid"]) };
    const data = await ConductExamForm.find(filter).sort({ academicyear: 1, programcode: 1, examtype: 1, formname: 1 }).lean();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to load exam forms" });
  }
};

exports.saveForm = async (req, res) => {
  try {
    const payload = formPayload(req.body);
    const required = ["colid", "formname", "formid", "academicyear", "program", "programcode", "examtype"];
    const missing = required.filter((field) => !payload[field]);
    if (missing.length) return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
    payload.tabs = payload.tabs
      .map((tab) => ({
        title: clean(tab.title),
        order: num(tab.order),
        fields: Array.isArray(tab.fields) ? tab.fields.map((field) => ({
          fieldname: clean(field.fieldname),
          label: clean(field.label),
          fieldtype: clean(field.fieldtype) || "Text",
          required: clean(field.required) || "No",
          options: clean(field.options),
          order: num(field.order)
        })).filter((field) => field.fieldname && field.label) : []
      }))
      .filter((tab) => tab.title)
      .sort((a, b) => num(a.order) - num(b.order));
    payload.documents = payload.documents
      .map((doc) => ({ documenttype: clean(doc.documenttype), required: clean(doc.required) || "No", order: num(doc.order) }))
      .filter((doc) => doc.documenttype)
      .sort((a, b) => num(a.order) - num(b.order));
    let data;
    if (clean(req.body.id)) {
      data = await ConductExamForm.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true });
    } else {
      data = await ConductExamForm.findOneAndUpdate(
        { colid: payload.colid, formid: payload.formid },
        payload,
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to save exam form" });
  }
};

exports.deleteForm = async (req, res) => {
  try {
    await ConductExamForm.deleteOne({ _id: req.body.id, colid: num(req.body.colid) });
    res.json({ message: "Exam form deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to delete exam form" });
  }
};

exports.uploadDocumentMiddleware = upload.single("document");
exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No document uploaded" });
    const uploaded = await uploadToAws(num(req.body.colid), req.file);
    res.json({
      data: {
        ...uploaded,
        documenttype: clean(req.body.documenttype),
        description: clean(req.body.description)
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to upload document" });
  }
};

const feeMapFor = async ({ colid, academicyear, examcode, programcode, semester }) => {
  const rows = await ConductExamFee.find({ colid, academicyear, examcode, programcode, semester, status: { $ne: "Inactive" } }).lean();
  const map = {};
  rows.forEach((row) => {
    map[clean(row.coursecode).toLowerCase()] = row;
  });
  return map;
};

const examFeeMaxFor = async ({ colid, academicyear, regulation, programcode, examcode }) => {
  if (!colid || !academicyear || !programcode || !examcode) return null;
  const row = await ConductExamFeeMax.findOne({
    colid,
    academicyear,
    programcode,
    examcode,
    ...(clean(regulation) ? { regulation: clean(regulation) } : {}),
    status: { $ne: "Inactive" }
  }).sort({ updatedAt: -1 }).lean();
  if (!row || num(row.maxfees) <= 0) return null;
  return row;
};

const capExamFee = (amount, maxRow) => {
  const raw = num(amount);
  const maxfees = num(maxRow?.maxfees);
  return maxfees > 0 && raw > maxfees ? maxfees : raw;
};

const examLedgerFilter = ({ colid, academicyear, regno, regnos, programcode, semester }) => {
  const filter = {
    colid,
    academicyear,
    $or: [
      { feegroup: { $regex: "exam", $options: "i" } },
      { feeitem: { $regex: "exam", $options: "i" } }
    ]
  };
  if (regno) filter.regno = regno;
  if (Array.isArray(regnos) && regnos.length) filter.regno = { $in: regnos };
  if (programcode) filter.programcode = programcode;
  if (semester) filter.semester = semester;
  return filter;
};

const examFeeLedgerForStudent = async ({ colid, academicyear, regno, programcode, semester }) => Ledgerstud.find(
  examLedgerFilter({ colid, academicyear, regno, programcode, semester })
).sort({ classdate: 1, feeitem: 1 }).lean();

exports.studentContext = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = clean(req.query.regno);
    const academicyear = clean(req.query.academicyear);
    const examcode = clean(req.query.examcode);
    const examtype = clean(req.query.examtype) || "Regular";
    if (!colid || !regno || !academicyear || !examcode) return res.status(400).json({ message: "colid, regno, academic year and exam code are required" });

    const student = await User.findOne({ colid, regno }).lean();
    if (!student) return res.status(404).json({ message: "Student not found" });
    const exam = await ConductExam.findOne({ colid, academicyear, examcode }).lean();
    const forms = await ConductExamForm.find({
      colid,
      academicyear,
      programcode: student.programcode,
      examtype,
      status: { $ne: "Inactive" }
    }).sort({ formname: 1 }).lean();

    const semester = clean(req.query.semester) || clean(student.semester);
    const regulation = clean(req.query.regulation) || clean(student.regulation);
    const baseCourseQuery = {
      colid,
      academicyear,
      regulation,
      programcode: student.programcode,
      semester,
      status: { $ne: "Inactive" }
    };
    const compulsory = await RegulationCourseMap.find({
      ...baseCourseQuery,
      $or: [{ deliverytype: /^Compulsory$/i }, { deliverytype: { $exists: false } }, { deliverytype: "" }]
    }).lean();
    const electives = await NepClassEnrollment.find({
      colid,
      academicyear,
      regulation,
      programcode: student.programcode,
      semester,
      regno,
      status: /^Approved$/i
    }).lean();
    const failed = await ExamModel2Marks.find({
      colid,
      academicyear,
      programcode: student.programcode,
      semester,
      regno,
      status: "Fail"
    }).lean();
    const fees = await feeMapFor({ colid, academicyear, examcode, programcode: student.programcode, semester });
    const enrich = (row, feeField, fallbackExamType) => {
      const feeRow = fees[clean(row.coursecode).toLowerCase()] || {};
      return {
        academicyear,
        regulation: clean(row.regulation) || regulation,
        program: clean(row.program) || clean(student.program),
        programcode: clean(row.programcode) || clean(student.programcode),
        semester: clean(row.semester) || semester,
        subject: clean(row.subject),
        type: clean(row.type) || "Major",
        course: clean(row.course),
        coursecode: clean(row.coursecode),
        fee: num(feeRow[feeField]),
        examtype: fallbackExamType,
        examdate: clean(row.examdate),
        examslot: clean(row.examslot)
      };
    };
    const regularCourses = [...compulsory.map((row) => enrich(row, "regularfee", "Regular")), ...electives.map((row) => enrich(row, "regularfee", "Regular"))]
      .filter((row, index, arr) => row.coursecode && arr.findIndex((item) => item.coursecode === row.coursecode) === index)
      .sort((a, b) => sortText(a.coursecode, b.coursecode));
    const supplementaryCourses = failed
      .map((row) => enrich(row, "supplementaryfee", "Supplementary"))
      .filter((row, index, arr) => row.coursecode && arr.findIndex((item) => item.coursecode === row.coursecode) === index)
      .sort((a, b) => sortText(a.coursecode, b.coursecode));
    const maxFee = await examFeeMaxFor({ colid, academicyear, regulation, programcode: student.programcode, examcode });
    const examFeeLedger = await examFeeLedgerForStudent({ colid, academicyear, regno, programcode: student.programcode, semester });
    res.json({ data: { student, exam, forms, regularCourses, supplementaryCourses, examFeeLedger, maxFee } });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to load student exam form context" });
  }
};

const distinctFromRows = (rows, field) => uniqueSorted(rows.map((row) => row[field]));

exports.studentExamFormReportOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ message: "colid is required" });
    const query = { colid, ...queryFrom(req.query, ["academicyear", "exam", "examcode", "program", "programcode", "semester"]) };
    const rows = await ConductExamRoll.find(query)
      .select("academicyear exam examcode regulation program programcode semester")
      .sort({ academicyear: 1, examcode: 1, program: 1, semester: 1 })
      .lean();
    const exams = [];
    const examSeen = new Set();
    rows.forEach((row) => {
      const key = `${clean(row.academicyear)}||${clean(row.examcode)}`;
      if (!clean(row.examcode) || examSeen.has(key)) return;
      examSeen.add(key);
      exams.push({ academicyear: clean(row.academicyear), exam: clean(row.exam), examcode: clean(row.examcode) });
    });
    const programs = [];
    const programSeen = new Set();
    rows.forEach((row) => {
      const key = `${clean(row.programcode)}||${clean(row.program)}`;
      if (!clean(row.programcode) || programSeen.has(key)) return;
      programSeen.add(key);
      programs.push({ program: clean(row.program), programcode: clean(row.programcode) });
    });
    res.json({
      data: {
        academicyears: distinctFromRows(rows, "academicyear"),
        regulations: distinctFromRows(rows, "regulation"),
        semesters: distinctFromRows(rows, "semester"),
        exams,
        programs
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to load student exam form options" });
  }
};

exports.studentExamFormReport = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ message: "colid is required" });
    const filter = { colid, ...queryFrom(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "regno"]) };
    if (!filter.academicyear || !filter.examcode || !filter.programcode) {
      return res.status(400).json({ message: "Academic year, exam code and program code are required" });
    }
    const rows = await ConductExamRoll.find(filter).sort({ regno: 1, semester: 1, coursecode: 1, course: 1 }).lean();
    const regnos = uniqueSorted(rows.map((row) => row.regno));
    const users = regnos.length
      ? await User.find({ colid, regno: { $in: regnos } }).lean()
      : [];
    const userMap = new Map(users.map((user) => [clean(user.regno), user]));
    const ledgerRows = regnos.length
      ? await Ledgerstud.find(examLedgerFilter({ colid, academicyear: filter.academicyear, regnos, programcode: filter.programcode, semester: filter.semester }))
        .sort({ regno: 1, classdate: 1, feeitem: 1 })
        .lean()
      : [];
    const ledgerMap = new Map();
    ledgerRows.forEach((row) => {
      const key = clean(row.regno);
      if (!ledgerMap.has(key)) ledgerMap.set(key, []);
      ledgerMap.get(key).push(row);
    });
    const students = regnos.map((regno) => {
      const user = userMap.get(regno) || {};
      const rollRows = rows.filter((row) => clean(row.regno) === regno);
      const first = rollRows[0] || {};
      const courses = rollRows.map((row) => ({
        id: String(row._id),
        academicyear: clean(row.academicyear),
        regulation: clean(row.regulation),
        exam: clean(row.exam),
        examcode: clean(row.examcode),
        program: clean(row.program),
        programcode: clean(row.programcode),
        semester: clean(row.semester),
        subject: clean(row.subject),
        type: clean(row.type),
        course: clean(row.course),
        coursecode: clean(row.coursecode),
        examdate: clean(row.examdate),
        examslot: clean(row.examslot),
        examsection: clean(row.examsection),
        seatno: clean(row.seatno),
        examseatno: clean(row.examseatno) || String(row._id),
        admitcardeligible: clean(row.admitcardeligible),
        attendance: clean(row.attendance),
        fees: clean(row.fees),
        disciplinary: clean(row.disciplinary),
        atkt: clean(row.atkt)
      }));
      return {
        id: regno,
        student: {
          ...user,
          name: clean(user.name) || clean(first.student),
          regno,
          email: clean(user.email) || clean(first.email),
          phone: clean(user.phone) || clean(first.phone),
          program: clean(user.program) || clean(first.program),
          programcode: clean(user.programcode) || clean(first.programcode),
          regulation: clean(user.regulation) || clean(first.regulation),
          semester: clean(user.semester) || clean(first.semester),
          section: clean(user.section) || clean(first.section)
        },
        courses,
        examFeeLedger: ledgerMap.get(regno) || []
      };
    });
    const institution = await Institution.findOne({ colid }).sort({ _id: -1 }).lean();
    res.json({ data: { students, institution } });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to load student exam form report" });
  }
};

const fieldValueMissing = (value) => {
  if (Array.isArray(value)) return value.length === 0;
  return clean(value) === "";
};

exports.submitStudentExamForm = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const regno = clean(req.body.regno);
    const formid = clean(req.body.formid);
    const examtype = clean(req.body.examtype) || "Regular";
    const selectedCourses = Array.isArray(req.body.courses) ? req.body.courses : [];
    const data = req.body.data && typeof req.body.data === "object" ? req.body.data : {};
    const documents = Array.isArray(req.body.documents) ? req.body.documents : [];
    if (!colid || !regno || !formid || !selectedCourses.length) {
      return res.status(400).json({ message: "Student, form and at least one course are required" });
    }
    const student = await User.findOne({ colid, regno }).lean();
    if (!student) return res.status(404).json({ message: "Student not found" });
    const form = await ConductExamForm.findOne({ colid, formid }).lean();
    if (!form) return res.status(404).json({ message: "Exam form not found" });

    const mandatoryErrors = [];
    (form.tabs || []).forEach((tab) => {
      (tab.fields || []).forEach((field) => {
        if (/^yes$/i.test(clean(field.required)) && fieldValueMissing(data[field.fieldname])) {
          mandatoryErrors.push(`${tab.title}: ${field.label} is required`);
        }
      });
    });
    (form.documents || []).forEach((doc) => {
      if (/^yes$/i.test(clean(doc.required))) {
        const found = documents.some((uploaded) => clean(uploaded.documenttype).toLowerCase() === clean(doc.documenttype).toLowerCase() && clean(uploaded.url));
        if (!found) mandatoryErrors.push(`Document required: ${doc.documenttype}`);
      }
    });
    if (mandatoryErrors.length) {
      return res.status(400).json({ message: "Mandatory validation failed", errors: mandatoryErrors });
    }

    const deficiencies = [];
    if (clean(form.validationcriteria)) {
      deficiencies.push(`Additional validation criteria configured for review: ${form.validationcriteria}`);
    }
    const examMaster = await ConductExam.findOne({ colid, academicyear: clean(req.body.academicyear) || form.academicyear, examcode: clean(req.body.examcode) }).lean();
    const exam = clean(req.body.exam) || clean(examMaster?.examname) || clean(examMaster?.exam) || clean(req.body.examcode);
    const examcode = clean(req.body.examcode);
    const academicyear = clean(req.body.academicyear) || form.academicyear;
    const semester = clean(req.body.semester) || clean(student.semester);
    const regulation = clean(req.body.regulation) || clean(student.regulation);
    const rawtotalfee = selectedCourses.reduce((sum, row) => sum + num(row.fee), 0);
    const maxFee = await examFeeMaxFor({ colid, academicyear, regulation, programcode: student.programcode, examcode });
    const totalfee = capExamFee(rawtotalfee, maxFee);
    const submission = await ConductExamFormSubmission.create({
      colid,
      formid,
      formname: form.formname,
      academicyear,
      regulation,
      exam,
      examcode,
      examtype,
      program: clean(student.program),
      programcode: clean(student.programcode),
      semester,
      student: clean(student.name),
      regno,
      email: clean(student.email),
      phone: clean(student.phone),
      section: clean(student.section),
      data,
      documents,
      courses: selectedCourses.map((row) => ({ ...row, fee: num(row.fee), examtype })),
      totalfee,
      validationstatus: deficiencies.length ? "Review" : "Pass",
      validationcomments: deficiencies.join("\n"),
      deficiencies,
      user: clean(student.email)
    });

    let ledgerCreated = 0;
    let examRollCreated = 0;
    let examFeeLedger = [];
    if (totalfee > 0) {
      const feeid = `${submission._id}-${examtype}-ExamFeeTotal`;
      await Ledgerstud.findOneAndUpdate(
        { colid, feeid, regno },
        {
          name: clean(student.name),
          user: clean(student.email),
          regno,
          student: clean(student.name),
          feegroup: "Exam Fee",
          feeitem: "Exam Fee",
          feeid,
          feecategory: "Exam Fee",
          feetype: examtype,
          academicyear,
          regulation,
          program: clean(student.program),
          programcode: clean(student.programcode),
          semester,
          amount: totalfee,
          paid: 0,
          concession: 0,
          balance: totalfee,
          duedate: new Date(),
          classdate: new Date(),
          status: "Active",
          colid
        },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      ledgerCreated = 1;
      examFeeLedger = await examFeeLedgerForStudent({ colid, academicyear, regno, programcode: student.programcode, semester });
    }
    for (const course of selectedCourses) {
      const coursecode = clean(course.coursecode);
      if (!coursecode) continue;
      const examCourse = await ConductExamCourse.findOne({ colid, academicyear, examcode, programcode: student.programcode, semester, coursecode }).lean();
      const roll = await ConductExamRoll.findOneAndUpdate(
        { colid, academicyear, regulation: clean(course.regulation) || clean(student.regulation), examcode, programcode: clean(student.programcode), semester, coursecode, regno },
        {
          colid,
          academicyear,
          regulation: clean(course.regulation) || clean(student.regulation),
          exam,
          examcode,
          program: clean(course.program) || clean(student.program),
          programcode: clean(student.programcode),
          type: ["Major", "Minor"].includes(clean(course.type)) ? clean(course.type) : "Major",
          subject: clean(course.subject),
          semester,
          course: clean(course.course),
          coursecode,
          student: clean(student.name),
          regno,
          email: clean(student.email),
          phone: clean(student.phone),
          section: clean(student.section),
          applied: "Yes",
          admitcardeligible: "No",
          attended: "No",
          examdate: clean(examCourse?.examdate || course.examdate),
          examslot: clean(examCourse?.examslot || course.examslot),
          remarks: `${examtype} exam form submitted: ${submission._id}`,
          user: clean(student.email)
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      if (roll && !roll.examseatno) {
        roll.examseatno = String(roll._id);
        await roll.save();
      }
      examRollCreated += 1;
    }
    res.json({ data: submission, ledgerCreated, examRollCreated, deficiencies, examFeeLedger, rawtotalfee, maxFee, totalfee });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to submit exam form" });
  }
};
