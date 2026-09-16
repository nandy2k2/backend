const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const ConductExamRoll = require("../Models/conductexamrollds");
const ScanningAssignment = require("../Models/conductexamscanningassignmentds");
const InvigilatorAllocation = require("../Models/conductexaminvigilatorallocationds");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactRegex = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

const baseFilter = (source = {}) => {
  const filter = {};
  const colid = num(source.colid);
  if (colid !== undefined) filter.colid = colid;
  ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode"].forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const roomKey = (row = {}) => [row.examdate, row.examslot || row.slot, row.campus, row.building, row.examroom || row.room].map(text).join("||");

async function invigilatorMap(filter) {
  const rows = await InvigilatorAllocation.find({
    colid: filter.colid,
    academicyear: filter.academicyear,
    examcode: filter.examcode
  }).lean();
  return rows.reduce((map, row) => {
    map.set(roomKey(row), { invigilator: row.invigilator, invigilatoremail: row.invigilatoremail });
    return map;
  }, new Map());
}

async function uploadToAws(colid, file) {
  const config = await Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || await Awsconfig.findOne({ colid, type: /^aws$/i }).sort({ _id: -1 }).lean();
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
    throw new Error("AWS configuration is missing. Please configure AWS before uploading answer books.");
  }
  const cleanName = path.basename(file.originalname || "answer-book").replace(/[^\w.\-() ]/g, "_");
  const key = `${colid}/conduct-exam/answer-books/${Date.now()}-${cleanName}`;
  const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
  await s3.putObject({ Bucket: config.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype || "application/octet-stream" }).promise();
  return { filename: cleanName, key, url: s3Url(config.bucket, config.region, key) };
}

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [rolls, users] = await Promise.all([
      ConductExamRoll.find({ colid }).select("academicyear regulation exam examcode program programcode semester course coursecode").lean(),
      User.find({ colid, role: { $not: /^student$/i }, excluded: { $ne: "Yes" } }).select("name email role department designation").sort({ role: 1, name: 1 }).lean()
    ]);
    res.json({
      success: true,
      options: {
        academicyear: uniqueSorted(rolls.map((row) => row.academicyear)),
        regulation: uniqueSorted(rolls.map((row) => row.regulation)),
        exams: uniqueSorted(rolls.map((row) => `${row.academicyear}||${row.examcode}||${row.exam}`)).map((value) => {
          const [academicyear, examcode, exam] = value.split("||");
          return { academicyear, examcode, exam, label: `${exam || examcode} (${examcode})` };
        }),
        roles: uniqueSorted(users.map((row) => row.role)),
        users
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load scanning options" });
  }
};

exports.attendedStudents = async (req, res) => {
  try {
    const filter = { ...baseFilter(req.query), attended: "Yes" };
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!filter.academicyear || !filter.examcode) return res.status(400).json({ success: false, message: "Academic year and exam code are required" });
    const rows = await ConductExamRoll.find(filter).sort({ programcode: 1, semester: 1, examroom: 1, seatno: 1, student: 1 }).lean();
    const assigned = await ScanningAssignment.find({ colid: filter.colid, academicyear: filter.academicyear, examcode: filter.examcode }).select("examrollid scannername scanneremail status").lean();
    const assignedMap = new Map(assigned.map((row) => [String(row.examrollid), row]));
    const data = rows.map((row) => {
      const item = assignedMap.get(String(row._id));
      return { ...row, assigned: item ? "Yes" : "No", scannername: item?.scannername || "", scanneremail: item?.scanneremail || "", scanningstatus: item?.status || "" };
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load attended students" });
  }
};

exports.assign = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const scanneremail = text(req.body.scanneremail).toLowerCase();
    const scannername = text(req.body.scannername);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    if (!scanneremail) return res.status(400).json({ success: false, message: "Scanner user is required" });
    const rolls = await ConductExamRoll.find({ colid, _id: { $in: ids }, attended: "Yes" }).lean();
    let assigned = 0;
    for (const roll of rolls) {
      await ScanningAssignment.findOneAndUpdate(
        { colid, examrollid: roll._id },
        {
          colid,
          examrollid: roll._id,
          academicyear: roll.academicyear,
          regulation: roll.regulation,
          exam: roll.exam,
          examcode: roll.examcode,
          program: roll.program,
          programcode: roll.programcode,
          semester: roll.semester,
          course: roll.course,
          coursecode: roll.coursecode,
          examdate: roll.examdate,
          examslot: roll.examslot,
          campus: roll.campus,
          building: roll.building,
          examroom: roll.examroom,
          seatno: roll.seatno,
          scannername,
          scanneremail,
          scannerrole: text(req.body.scannerrole),
          assignedby: text(req.body.assignedby || req.body.user),
          assigneddate: new Date(),
          status: roll.answerbooklink ? "Completed" : "Pending",
          answerbooklink: roll.answerbooklink || "",
          user: text(req.body.user)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      assigned += 1;
    }
    res.json({ success: true, assigned });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to assign scanning" });
  }
};

exports.myAssignments = async (req, res) => {
  try {
    const filter = baseFilter(req.query);
    const scanneremail = text(req.query.scanneremail || req.query.user || req.query.email).toLowerCase();
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!scanneremail) return res.status(400).json({ success: false, message: "scanner email is required" });
    filter.scanneremail = exactRegex(scanneremail);
    if (text(req.query.status)) filter.status = text(req.query.status);
    const rows = await ScanningAssignment.find(filter).sort({ status: -1, examdate: 1, examslot: 1, examroom: 1, seatno: 1 }).lean();
    const invMap = await invigilatorMap(filter);
    const data = rows.map((row) => {
      const inv = invMap.get(roomKey(row)) || {};
      return {
        _id: row._id,
        id: row._id,
        examrollid: row.examrollid,
        mongodbid: String(row.examrollid),
        academicyear: row.academicyear,
        regulation: row.regulation,
        exam: row.exam,
        examcode: row.examcode,
        programcode: row.programcode,
        semester: row.semester,
        coursecode: row.coursecode,
        examdate: row.examdate,
        examslot: row.examslot,
        campus: row.campus,
        building: row.building,
        examroom: row.examroom,
        seatno: row.seatno,
        invigilator: inv.invigilator || "",
        invigilatoremail: inv.invigilatoremail || "",
        status: row.status,
        answerbooklink: row.answerbooklink
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load scanner assignments" });
  }
};

exports.uploadAnswerBook = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });
    const data = await uploadToAws(colid, req.file);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to upload answer book" });
  }
};

exports.updateAnswerBook = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const id = text(req.body.id);
    const answerbooklink = text(req.body.answerbooklink);
    const scanneremail = text(req.body.scanneremail || req.body.user || req.body.email).toLowerCase();
    if (colid === undefined || !id || !answerbooklink) return res.status(400).json({ success: false, message: "colid, assignment and answer book link are required" });
    const assignment = await ScanningAssignment.findOne({ _id: id, colid, scanneremail: exactRegex(scanneremail) });
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found for the logged in scanner" });
    await ConductExamRoll.updateOne({ _id: assignment.examrollid, colid }, { $set: { answerbooklink, user: text(req.body.user) } });
    assignment.answerbooklink = answerbooklink;
    assignment.status = "Completed";
    assignment.uploadedby = text(req.body.user || scanneremail);
    assignment.uploadeddate = new Date();
    await assignment.save();
    res.json({ success: true, data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to update answer book link" });
  }
};

exports.progressReport = async (req, res) => {
  try {
    const filter = baseFilter(req.query);
    if (filter.colid === undefined || !filter.academicyear || !filter.examcode) return res.status(400).json({ success: false, message: "colid, academic year and exam code are required" });
    const attended = await ConductExamRoll.find({ ...filter, attended: "Yes" }).lean();
    const assignments = await ScanningAssignment.find(filter).lean();
    const assignedRolls = new Set(assignments.map((row) => String(row.examrollid)));
    const completedRolls = new Set(assignments.filter((row) => row.status === "Completed" || row.answerbooklink).map((row) => String(row.examrollid)));
    const group = (rows, keyFn) => Object.values(rows.reduce((acc, row) => {
      const key = keyFn(row) || "Not specified";
      acc[key] = acc[key] || { id: key, group: key, total: 0, assigned: 0, scanned: 0, pending: 0 };
      acc[key].total += 1;
      const rid = String(row._id);
      if (assignedRolls.has(rid)) acc[key].assigned += 1;
      if (completedRolls.has(rid)) acc[key].scanned += 1;
      return acc;
    }, {})).map((row) => ({ ...row, pending: Math.max(row.assigned - row.scanned, 0) }));
    const overall = { total: attended.length, assigned: assignedRolls.size, scanned: completedRolls.size };
    overall.pending = Math.max(overall.assigned - overall.scanned, 0);
    res.json({
      success: true,
      summary: overall,
      roomwise: group(attended, (row) => [row.campus, row.building, row.examroom].map(text).filter(Boolean).join(" / ")),
      programwise: group(attended, (row) => row.programcode || row.program),
      details: attended.map((row) => ({
        id: row._id,
        mongodbid: String(row._id),
        program: row.program,
        programcode: row.programcode,
        semester: row.semester,
        course: row.course,
        coursecode: row.coursecode,
        examdate: row.examdate,
        examslot: row.examslot,
        room: [row.campus, row.building, row.examroom].map(text).filter(Boolean).join(" / "),
        assigned: assignedRolls.has(String(row._id)) ? "Yes" : "No",
        scanned: completedRolls.has(String(row._id)) ? "Yes" : "No"
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load scanning progress report" });
  }
};

exports.scannerReport = async (req, res) => {
  try {
    const filter = baseFilter(req.query);
    if (filter.colid === undefined || !filter.academicyear || !filter.examcode) return res.status(400).json({ success: false, message: "colid, academic year and exam code are required" });
    const assignments = await ScanningAssignment.find(filter).lean();
    const rows = Object.values(assignments.reduce((acc, row) => {
      const key = row.scanneremail || "Not specified";
      acc[key] = acc[key] || { id: key, scannername: row.scannername, scanneremail: row.scanneremail, scannerrole: row.scannerrole, assigned: 0, completed: 0, pending: 0 };
      acc[key].assigned += 1;
      if (row.status === "Completed" || row.answerbooklink) acc[key].completed += 1;
      return acc;
    }, {})).map((row) => ({ ...row, pending: Math.max(row.assigned - row.completed, 0) }));
    const summary = rows.reduce((acc, row) => {
      acc.scanners += 1;
      acc.assigned += row.assigned;
      acc.completed += row.completed;
      acc.pending += row.pending;
      return acc;
    }, { scanners: 0, assigned: 0, completed: 0, pending: 0 });
    res.json({ success: true, summary, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load scanner report" });
  }
};
