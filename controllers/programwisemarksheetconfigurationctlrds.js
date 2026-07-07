const MarksheetConfig = require("../Models/programwisemarksheetconfigurationds");
const RegulationMaster = require("../Models/regulationmasterds");
const MPrograms = require("../Models/mprograms");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const yesNo = (value, fallback = "Yes") => /^no$/i.test(text(value)) ? "No" : /^yes$/i.test(text(value)) ? "Yes" : fallback;
const oneOf = (value, allowed, fallback) => allowed.includes(text(value)) ? text(value) : fallback;

const boolFields = ["course", "coursecode", "internal", "external", "total", "grade", "credits", "backlogindicator", "attendance", "signature"];
const fields = ["academicyear", "regulation", "program", "programcode", "programnamedisplay", ...boolFields, "qrcodeposition", "watermark", "language"];

function clean(input = {}) {
  const payload = {
    colid: number(input.colid, 0),
    academicyear: text(input.academicyear || input["Academic Year"]),
    regulation: text(input.regulation || input.Regulation),
    program: text(input.program || input.Program),
    programcode: text(input.programcode || input.programCode || input["Program Code"]),
    programnamedisplay: oneOf(input.programnamedisplay || input["Program Name Display"], ["Full", "abbreviation", "programcode"], "Full"),
    qrcodeposition: oneOf(input.qrcodeposition || input["QR Code Position"], ["topright", "bottomright", "bottomcenter"], "bottomright"),
    watermark: oneOf(input.watermark || input.Watermark, ["Original", "Duplicate", "Provisional"], "Original"),
    language: text(input.language || input.Language) || "English",
    user: text(input.user)
  };
  boolFields.forEach((field) => { payload[field] = yesNo(input[field] || input[field.toUpperCase()] || input[field.replace(/([a-z])([A-Z])/g, "$1 $2")], field === "attendance" ? "No" : "Yes"); });
  return payload;
}

function validate(payload) {
  if (!payload.colid) return "colid is required";
  for (const field of ["academicyear", "regulation", "program", "programcode"]) {
    if (!payload[field]) return `${field} is required`;
  }
  return "";
}

function queryFrom(source = {}) {
  const query = { colid: number(source.colid, 0) };
  ["academicyear", "regulation", "program", "programcode", "language", "watermark"].forEach((field) => {
    if (source[field]) query[field] = text(source[field]);
  });
  return query;
}

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [configs, regulations, programs] = await Promise.all([
      MarksheetConfig.find({ colid }).lean(),
      RegulationMaster.find({ colid }).sort({ regulation: 1 }).lean(),
      MPrograms.find({ colid }).sort({ Order: 1, program: 1 }).lean()
    ]);
    res.json({
      success: true,
      fields,
      academicyears: uniq(["2025-26", "2026-27", "2027-28", "2028-29", "2029-30", ...configs.map((row) => row.academicyear), ...programs.map((row) => row.year)]),
      regulations: uniq([...regulations.map((row) => row.regulation), ...configs.map((row) => row.regulation)]),
      programs: uniq([...programs.map((row) => `${row.program}|||${row.programcode}`), ...configs.map((row) => `${row.program}|||${row.programcode}`)]),
      languages: ["English", "Hindi", "Bengali", "Telugu", "Marathi", "Tamil", "Urdu", "Gujarati", "Kannada", "Malayalam", "Odia", "Punjabi", "Assamese", "Sanskrit", "French", "Spanish"],
      yesNo: ["Yes", "No"],
      programNameDisplays: ["Full", "abbreviation", "programcode"],
      qrcodePositions: ["topright", "bottomright", "bottomcenter"],
      watermarks: ["Original", "Duplicate", "Provisional"]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = queryFrom(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await MarksheetConfig.find(query).sort({ academicyear: -1, regulation: 1, program: 1 }).lean();
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
      ? await MarksheetConfig.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await MarksheetConfig.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode },
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
    const data = await MarksheetConfig.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, 0) });
    if (!data) return res.status(404).json({ success: false, message: "Configuration not found" });
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
      await MarksheetConfig.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode },
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
