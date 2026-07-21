const NepLmsLoginAttendance = require("../Models/neplmsloginattendanceds");
const User = require("../Models/user");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const filterFields = [
  "academicyear",
  "program",
  "programcode",
  "course",
  "coursecode",
  "student",
  "studentemail",
  "regno",
  "activitydate"
];

const buildQuery = (source = {}) => {
  const colid = number(source.colid);
  const query = {};
  if (colid !== undefined) query.colid = colid;
  filterFields.forEach((field) => {
    if (!source[field]) return;
    if (["student", "studentemail", "regno"].includes(field)) {
      query[field] = new RegExp(escapeRegex(source[field]), "i");
    } else {
      query[field] = text(source[field]);
    }
  });
  if (source.fromdate || source.todate) {
    query.activitydate = {
      ...(source.fromdate ? { $gte: text(source.fromdate) } : {}),
      ...(source.todate ? { $lte: text(source.todate) } : {})
    };
  }
  return query;
};

exports.record = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const regno = text(req.body.regno);
    const coursecode = text(req.body.coursecode);
    const academicyear = text(req.body.academicyear);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    if (!coursecode) return res.status(400).json({ success: false, message: "coursecode is required" });
    if (!academicyear) return res.status(400).json({ success: false, message: "academicyear is required" });

    const now = new Date();
    const activitydate = now.toISOString().slice(0, 10);
    const activitytime = now.toTimeString().slice(0, 8);
    const student = await User.findOne({ colid, regno: new RegExp(`^${escapeRegex(regno)}$`, "i") }).select("name email").lean();

    const payload = {
      academicyear,
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      course: text(req.body.course),
      coursecode,
      student: text(req.body.student || student?.name),
      studentemail: text(req.body.studentemail || student?.email || req.body.user),
      regno,
      activitydate,
      activitytime,
      activitydatetime: now,
      colid,
      user: text(req.body.user)
    };

    const data = await NepLmsLoginAttendance.findOneAndUpdate(
      { colid, regno, academicyear, coursecode, activitydate },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await NepLmsLoginAttendance.find(query).sort({ activitydate: -1, activitytime: -1, student: 1 }).limit(5000).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await NepLmsLoginAttendance.find({ colid }).select(filterFields.join(" ")).lean();
    const options = {};
    filterFields.forEach((field) => {
      options[field] = [...new Set(rows.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    });
    res.json({ success: true, fields: filterFields, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
