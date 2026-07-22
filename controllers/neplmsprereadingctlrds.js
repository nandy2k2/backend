const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const Awsconfig = require("../Models/awsconfig");
const User = require("../Models/user");
const NepLmsPreReading = require("../Models/neplmsprereadingds");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
const parseFlashcards = (value) => {
  if (Array.isArray(value)) return value;
  if (!text(value)) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const payload = (body = {}) => ({
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  type: text(body.type),
  major: text(body.major || body.subject),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  faculty: text(body.faculty || body.facultyname),
  facultyemail: text(body.facultyemail),
  contenttype: text(body.contenttype),
  title: text(body.title),
  description: text(body.description),
  topics: text(body.topics),
  sequence: number(body.sequence) || 1,
  filelink: text(body.filelink || body.url),
  videolink: text(body.videolink),
  mindmapid: text(body.mindmapid),
  mindmaptitle: text(body.mindmaptitle),
  flashcards: parseFlashcards(body.flashcards),
  status: text(body.status) || "Active",
  colid: Number(body.colid),
  user: text(body.user)
});

const queryFrom = (source = {}) => {
  const query = { colid: Number(source.colid) };
  ["academicyear", "regulation", "program", "programcode", "type", "major", "semester", "course", "coursecode", "facultyemail", "contenttype", "status"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  return query;
};

exports.list = async (req, res) => {
  try {
    const query = queryFrom(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await NepLmsPreReading.find(query).sort({ academicyear: -1, semester: 1, course: 1, sequence: 1, updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const clean = payload(req.body);
    if (!clean.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!clean.coursecode) return res.status(400).json({ success: false, message: "Course is required" });
    if (!clean.contenttype) return res.status(400).json({ success: false, message: "Content type is required" });
    if (!clean.title) return res.status(400).json({ success: false, message: "Title is required" });
    let filePayload = {};
    if (req.file) {
      const config = await getDefaultAwsConfig(clean.colid);
      if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
        return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
      }
      const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
      const key = `${clean.colid}/nep-lms/${clean.academicyear || "year"}/${clean.coursecode || "course"}/pre-reading/${Date.now()}-${cleanName}`;
      const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
      await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
      filePayload = {
        filename: cleanName,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        bucket: config.bucket,
        region: config.region,
        key,
        filelink: s3Url(config.bucket, config.region, key)
      };
    }
    const data = req.body.id
      ? await NepLmsPreReading.findOneAndUpdate({ _id: req.body.id, colid: clean.colid }, { ...clean, ...filePayload }, { new: true, runValidators: true })
      : await NepLmsPreReading.create({ ...clean, ...filePayload });
    if (!data) return res.status(404).json({ success: false, message: "Pre-reading item not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await NepLmsPreReading.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentList = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const regno = text(req.query.regno);
    if (!colid || !regno) return res.status(400).json({ success: false, message: "colid and regno are required" });
    const student = await User.findOne({ colid, regno }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const query = {
      colid,
      status: "Active",
      academicyear: student.academicyear || "",
      programcode: student.programcode || "",
      semester: student.semester || ""
    };
    if (!query.academicyear) delete query.academicyear;
    if (!query.programcode) delete query.programcode;
    if (!query.semester) delete query.semester;
    if (text(req.query.coursecode)) query.coursecode = text(req.query.coursecode);
    const data = await NepLmsPreReading.find(query).sort({ course: 1, sequence: 1, updatedAt: -1 }).lean();
    res.json({ success: true, student, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
