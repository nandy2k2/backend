const ExamDates = require("../Models/conductexamdatesds");
const RegulationMaster = require("../Models/regulationmasterds");
const ConductExam = require("../Models/conductexamds");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const dateFields = ["startdate", "enddate", "marksentrystartdate", "marksentryenddate", "resulttargetdate", "resultpublishdate", "revalstartdate", "revalenddate", "atktenddate"];
const fields = ["academicyear", "regulation", "exam", "examcode", ...dateFields];

function dateValue(value) {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30));
    date.setUTCDate(date.getUTCDate() + value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function clean(input = {}) {
  const payload = {
    colid: number(input.colid, 0),
    academicyear: text(input.academicyear || input["Academic Year"]),
    regulation: text(input.regulation || input.Regulation),
    exam: text(input.exam || input.examname || input.Exam),
    examcode: text(input.examcode || input.examCode || input["Exam Code"]),
    user: text(input.user)
  };
  dateFields.forEach((field) => {
    payload[field] = dateValue(input[field] || input[field.replace(/date$/i, " date")] || input[field.replace(/([a-z])([A-Z])/g, "$1 $2")]);
  });
  return payload;
}

function validate(payload) {
  if (!payload.colid) return "colid is required";
  for (const field of ["academicyear", "regulation", "exam", "examcode"]) {
    if (!payload[field]) return `${field} is required`;
  }
  return "";
}

function queryFrom(source = {}) {
  const query = { colid: number(source.colid, 0) };
  ["academicyear", "regulation", "exam", "examcode"].forEach((field) => {
    if (source[field]) query[field] = text(source[field]);
  });
  return query;
}

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [rows, regulations, exams] = await Promise.all([
      ExamDates.find({ colid }).lean(),
      RegulationMaster.find({ colid }).sort({ regulation: 1 }).lean(),
      ConductExam.find({ colid }).sort({ academicyear: -1, examname: 1 }).lean()
    ]);
    res.json({
      success: true,
      fields,
      dateFields,
      academicyears: uniq(["2025-26", "2026-27", "2027-28", "2028-29", "2029-30", ...rows.map((row) => row.academicyear), ...exams.map((row) => row.academicyear)]),
      regulations: uniq([...regulations.map((row) => row.regulation), ...rows.map((row) => row.regulation)]),
      exams: uniq([...exams.map((row) => `${row.examname}|||${row.examcode}`), ...rows.map((row) => `${row.exam}|||${row.examcode}`)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = queryFrom(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ExamDates.find(query).sort({ academicyear: -1, exam: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = clean(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ExamDates.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ExamDates.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, examcode: payload.examcode },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const data = await ExamDates.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, 0) });
    if (!data) return res.status(404).json({ success: false, message: "Exam dates not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows received" });
    const errors = [];
    let inserted = 0;
    for (const [index, row] of rows.entries()) {
      const payload = clean({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validate(payload);
      if (error) {
        errors.push({ rowNumber: row.rowNumber || index + 2, message: error });
        continue;
      }
      await ExamDates.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, examcode: payload.examcode },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      inserted += 1;
    }
    res.json({ success: true, inserted, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
