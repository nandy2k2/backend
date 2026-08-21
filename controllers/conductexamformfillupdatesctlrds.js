const FormFillupDates = require("../Models/conductexamformfillupdatesds");
const ProgramMaster = require("../Models/programmasterds");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const dateFields = ["lastdate", "lastdatefine1", "lastdatefine2", "lastdatefine3", "iafillingdate"];
const numberFields = ["examfee", "lastdatefine1amount", "lastdatefine2amount", "lastdatefine3amount"];
const fields = ["academicyear", "program", "programcode", "examfee", "lastdate", "lastdatefine1", "lastdatefine1amount", "lastdatefine2", "lastdatefine2amount", "lastdatefine3", "lastdatefine3amount", "iafillingdate"];

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
    program: text(input.program || input.Program),
    programcode: text(input.programcode || input["Program Code"] || input.programCode),
    user: text(input.user)
  };
  numberFields.forEach((field) => {
    payload[field] = number(input[field] || input[field.replace(/([a-z])([A-Z])/g, "$1 $2")] || input[field.toUpperCase()], 0);
  });
  dateFields.forEach((field) => {
    payload[field] = dateValue(input[field] || input[field.replace(/([a-z])([A-Z])/g, "$1 $2")] || input[field.toUpperCase()]);
  });
  return payload;
}

function validate(payload) {
  if (!payload.colid) return "colid is required";
  for (const field of ["academicyear", "program", "programcode"]) {
    if (!payload[field]) return `${field} is required`;
  }
  return "";
}

function queryFrom(source = {}) {
  const query = { colid: number(source.colid, 0) };
  ["academicyear", "program", "programcode"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  let filters = [];
  if (Array.isArray(source.filters)) {
    filters = source.filters;
  } else if (typeof source.filters === "string") {
    try {
      filters = JSON.parse(source.filters);
    } catch (error) {
      filters = [];
    }
  }
  filters.forEach((filter) => {
    if (!fields.includes(filter.field) || !text(filter.value)) return;
    if (numberFields.includes(filter.field)) query[filter.field] = number(filter.value);
    else query[filter.field] = { $regex: text(filter.value), $options: "i" };
  });
  return query;
}

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [rows, programs, institution] = await Promise.all([
      FormFillupDates.find({ colid }).lean(),
      ProgramMaster.find({ colid, is_active: { $ne: "No" } }).sort({ course_name: 1 }).lean(),
      Institution.findOne({ colid }).sort({ _id: -1 }).lean()
    ]);
    const programOptions = [];
    const seen = new Set();
    [...programs.map((row) => ({ program: text(row.course_name), programcode: text(row.course_code) })), ...rows.map((row) => ({ program: text(row.program), programcode: text(row.programcode) }))].forEach((row) => {
      const key = `${row.programcode}||${row.program}`;
      if (!row.programcode || seen.has(key)) return;
      seen.add(key);
      programOptions.push(row);
    });
    const fieldOptions = {};
    fields.forEach((field) => { fieldOptions[field] = uniq(rows.map((row) => row[field])); });
    res.json({
      success: true,
      fields,
      dateFields,
      numberFields,
      institution,
      academicyears: uniq(["2025-26", "2026-27", "2027-28", "2028-29", "2029-30", ...rows.map((row) => row.academicyear)]),
      programs: programOptions,
      fieldOptions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = queryFrom(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await FormFillupDates.find(query).sort({ academicyear: -1, program: 1 }).lean();
    const institution = await Institution.findOne({ colid: query.colid }).sort({ _id: -1 }).lean();
    res.json({ success: true, data, institution });
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
      ? await FormFillupDates.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await FormFillupDates.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, programcode: payload.programcode },
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
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: "No rows selected" });
    const result = await FormFillupDates.deleteMany({ _id: { $in: ids }, colid: number(req.body.colid, 0) });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows received" });
    const errors = [];
    let saved = 0;
    for (const [index, row] of rows.entries()) {
      const payload = clean({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validate(payload);
      if (error) {
        errors.push({ rowNumber: row.rowNumber || index + 2, message: error });
        continue;
      }
      await FormFillupDates.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, programcode: payload.programcode },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
