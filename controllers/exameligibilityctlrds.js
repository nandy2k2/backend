const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const ConductExamRoll = require("../Models/conductexamrollds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const DisciplinaryAction = require("../Models/disciplinaryactionds");
const NepLmsFinalMarks = require("../Models/neplmsfinalmarksds");
const AtktRule = require("../Models/atktruleds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};
const splitValues = (value) => text(value).split(",").map((item) => item.trim()).filter(Boolean);
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const addMultiFilter = (query, source, field) => {
  const values = splitValues(source[field]);
  if (values.length === 1) query[field] = values[0];
  if (values.length > 1) query[field] = { $in: values };
};

const ledgerFilterFields = ["academicyear", "admissionyear", "regulation", "program", "programcode", "major", "minor", "semester", "student", "name", "regno", "user", "feegroup", "feecategory", "feeitem", "feebook", "cashbook", "status", "paymode", "feetype"];
const userFilterFields = ["academicyear", "admissionyear", "regulation", "program", "programcode", "Major", "Minor", "semester", "section", "name", "email", "phone", "regno", "category", "gender"];
const examRollFilterFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "section", "applied", "admitcardeligible", "attendance", "fees", "disciplinary", "atkt"];

const buildPendingFeesQuery = (source = {}) => {
  const query = {
    colid: number(source.colid),
    balance: { $gt: 0 },
    duedate: { $lt: startOfToday() }
  };
  ledgerFilterFields.forEach((field) => addMultiFilter(query, source, field));
  return query;
};

const buildUserQuery = (source = {}) => {
  const query = { colid: number(source.colid), role: /^student$/i };
  userFilterFields.forEach((field) => addMultiFilter(query, source, field));
  return query;
};

const buildExamRollQuery = (source = {}) => {
  const query = { colid: number(source.colid) };
  examRollFilterFields.forEach((field) => addMultiFilter(query, source, field));
  return query;
};

exports.getPendingFeesOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await Ledgerstud.find({ colid }).lean();
    const options = {};
    ledgerFilterFields.forEach((field) => {
      options[field] = uniqueSorted(rows.map((row) => row[field]));
    });
    res.json({ success: true, fields: ledgerFilterFields, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPendingFees = async (req, res) => {
  try {
    const query = buildPendingFeesQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await Ledgerstud.find(query).sort({ duedate: 1, programcode: 1, regno: 1 }).lean();
    const totals = rows.reduce((acc, row) => {
      acc.count += 1;
      acc.amount += Number(row.amount || 0);
      acc.paid += Number(row.paid || 0);
      acc.concession += Number(row.concession || 0);
      acc.balance += Number(row.balance || 0);
      return acc;
    }, { count: 0, amount: 0, paid: 0, concession: 0, balance: 0 });
    const byProgram = Object.values(rows.reduce((acc, row) => {
      const key = row.programcode || "NA";
      acc[key] = acc[key] || { label: key, count: 0, balance: 0 };
      acc[key].count += 1;
      acc[key].balance += Number(row.balance || 0);
      return acc;
    }, {}));
    const byFeeGroup = Object.values(rows.reduce((acc, row) => {
      const key = row.feegroup || "NA";
      acc[key] = acc[key] || { label: key, count: 0, balance: 0 };
      acc[key].count += 1;
      acc[key].balance += Number(row.balance || 0);
      return acc;
    }, {}));
    res.json({ success: true, data: rows, totals, summaries: { byProgram, byFeeGroup } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDisciplinaryOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [users, actions] = await Promise.all([
      User.find({ colid, role: /^student$/i }).lean(),
      DisciplinaryAction.find({ colid }).lean()
    ]);
    const options = {};
    userFilterFields.forEach((field) => {
      options[field] = uniqueSorted(users.map((row) => row[field]));
    });
    options.severity = ["Low", "Medium", "High", "Critical"];
    options.status = uniqueSorted([...actions.map((row) => row.status), "Open", "Closed"]);
    res.json({ success: true, fields: userFilterFields, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchDisciplinaryStudents = async (req, res) => {
  try {
    const query = buildUserQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await User.find(query).select("name email phone regno academicyear admissionyear regulation program programcode Major Minor semester section category gender").sort({ name: 1 }).limit(1000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDisciplinaryActions = async (req, res) => {
  try {
    const query = { colid: number(req.query.colid) };
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    ["academicyear", "regulation", "programcode", "semester", "section", "regno", "severity", "status"].forEach((field) => addMultiFilter(query, req.query, field));
    const data = await DisciplinaryAction.find(query).sort({ actiondate: -1, student: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createDisciplinaryAction = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(req.body.regno)) return res.status(400).json({ success: false, message: "Student is required" });
    if (!req.body.actiondate) return res.status(400).json({ success: false, message: "Action date is required" });
    const payload = {
      colid,
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      semester: text(req.body.semester),
      section: text(req.body.section),
      student: text(req.body.student || req.body.name),
      regno: text(req.body.regno),
      email: text(req.body.email),
      phone: text(req.body.phone),
      actiondate: req.body.actiondate,
      severity: text(req.body.severity) || "Low",
      description: text(req.body.description),
      status: "Open",
      user: text(req.body.user)
    };
    const data = await DisciplinaryAction.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateDisciplinaryAction = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = text(req.body.id);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!id) return res.status(400).json({ success: false, message: "id is required" });
    const data = await DisciplinaryAction.findOneAndUpdate(
      { _id: id, colid },
      {
        actiontaken: text(req.body.actiontaken),
        actiontakendate: req.body.actiontakendate || undefined,
        status: text(req.body.status) || "Open",
        user: text(req.body.user)
      },
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExamrollRuleOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await ConductExamRoll.find({ colid }).lean();
    const options = {};
    examRollFilterFields.forEach((field) => {
      options[field] = uniqueSorted(rows.map((row) => row[field]));
    });
    res.json({ success: true, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExamrollRuleRows = async (req, res) => {
  try {
    const query = buildExamRollQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExamRoll.find(query).sort({ programcode: 1, semester: 1, coursecode: 1, regno: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkExamrollAttendance = async (req, res) => {
  try {
    const query = buildExamRollQuery(req.body);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const threshold = Number(req.body.threshold || 75);
    const rows = await ConductExamRoll.find(query).lean();
    let updated = 0;
    for (const row of rows) {
      const attendanceRows = await NepLmsAttendance.find({
        colid: row.colid,
        academicyear: row.academicyear,
        programcode: row.programcode,
        semester: row.semester,
        coursecode: row.coursecode,
        regno: row.regno
      }).select("attendance").lean();
      const total = attendanceRows.length;
      const present = attendanceRows.filter((item) => Number(item.attendance) === 1).length;
      const percent = total ? (present / total) * 100 : 0;
      const status = percent < threshold ? "DETAINED" : "Yes";
      await ConductExamRoll.updateOne({ _id: row._id }, { $set: { attendance: status } });
      updated += 1;
    }
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkExamrollFees = async (req, res) => {
  try {
    const query = buildExamRollQuery(req.body);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await ConductExamRoll.find(query).lean();
    const regnos = uniqueSorted(rows.map((row) => row.regno));
    const dueRows = await Ledgerstud.find({ colid: query.colid, regno: { $in: regnos }, balance: { $gt: 0 }, duedate: { $lt: startOfToday() } }).select("regno").lean();
    const dueSet = new Set(dueRows.map((row) => text(row.regno)));
    let updated = 0;
    for (const row of rows) {
      await ConductExamRoll.updateOne({ _id: row._id }, { $set: { fees: dueSet.has(text(row.regno)) ? "FEES_DEFAULTER" : "Yes" } });
      updated += 1;
    }
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkExamrollDisciplinary = async (req, res) => {
  try {
    const query = buildExamRollQuery(req.body);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await ConductExamRoll.find(query).lean();
    const regnos = uniqueSorted(rows.map((row) => row.regno));
    const openRows = await DisciplinaryAction.find({ colid: query.colid, regno: { $in: regnos }, status: /^open$/i }).select("regno").lean();
    const openSet = new Set(openRows.map((row) => text(row.regno)));
    let updated = 0;
    for (const row of rows) {
      await ConductExamRoll.updateOne({ _id: row._id }, { $set: { disciplinary: openSet.has(text(row.regno)) ? "DISCIPLINARY_HOLD" : "Yes" } });
      updated += 1;
    }
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkExamrollBacklogs = async (req, res) => {
  try {
    const query = buildExamRollQuery(req.body);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await ConductExamRoll.find(query).lean();
    let updated = 0;
    for (const row of rows) {
      const failQuery = {
        colid: row.colid,
        regno: row.regno,
        academicyear: row.academicyear,
        regulation: row.regulation,
        programcode: row.programcode,
        passstatus: /^fail$/i
      };
      const [noofbacklogs, rule] = await Promise.all([
        NepLmsFinalMarks.countDocuments(failQuery),
        AtktRule.findOne({
          colid: row.colid,
          academicyear: row.academicyear,
          regulation: row.regulation,
          programcode: row.programcode,
          semester: row.semester
        }).lean()
      ]);
      const maxbacklog = Number(rule?.maxbacklog || 0);
      const allowed = noofbacklogs <= maxbacklog;
      await ConductExamRoll.updateOne(
        { _id: row._id },
        {
          $set: {
            noofbacklogs,
            atkt: allowed ? "Yes" : "No",
            admitcardeligible: allowed ? "Yes" : "No"
          }
        }
      );
      updated += 1;
    }
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.overrideExamrollRuleStatus = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = text(req.body.id);
    const statusField = text(req.body.statusField);
    const remarks = text(req.body.remarks);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!id) return res.status(400).json({ success: false, message: "id is required" });
    if (!["attendance", "disciplinary", "fees"].includes(statusField)) return res.status(400).json({ success: false, message: "Valid status field is required" });
    if (!remarks) return res.status(400).json({ success: false, message: "Remarks are required" });
    const update = { [statusField]: "Yes", remarks };
    const data = await ConductExamRoll.findOneAndUpdate(
      { _id: id, colid },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Exam roll entry not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
