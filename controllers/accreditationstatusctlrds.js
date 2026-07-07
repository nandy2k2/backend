const AccreditationStatus = require("../Models/accreditationstatusds");

const accreditationTypes = ["NAAC", "NBA", "NIRF", "QS", "THE", "Times Ranking"];
const fields = ["academicyear", "accreditation", "institution", "program", "programcode", "startdate", "validitydate", "grade"];

const clean = (value) => String(value ?? "").trim();

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalizeAccreditation = (value) => {
  const text = clean(value);
  const match = accreditationTypes.find((item) => item.toLowerCase() === text.toLowerCase());
  return match || text;
};

const buildPayload = (body = {}) => {
  const payload = {};
  fields.forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  payload.academicyear = clean(payload.academicyear);
  payload.accreditation = normalizeAccreditation(payload.accreditation);
  payload.institution = clean(payload.institution);
  payload.program = clean(payload.program);
  payload.programcode = clean(payload.programcode);
  payload.startdate = normalizeDate(payload.startdate);
  payload.validitydate = normalizeDate(payload.validitydate);
  payload.grade = clean(payload.grade);
  return payload;
};

const validatePayload = (payload) => {
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.accreditation) return "Accreditation is required";
  if (!accreditationTypes.includes(payload.accreditation)) return "Invalid accreditation type";
  return "";
};

exports.getAll = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["academicyear", "accreditation", "institution", "program", "programcode", "grade"].forEach((field) => {
      if (clean(req.query[field])) query[field] = clean(req.query[field]);
    });
    const rows = await AccreditationStatus.find(query).sort({ academicyear: -1, accreditation: 1, createdAt: -1 }).lean();
    res.json({ success: true, data: rows, accreditationTypes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load accreditation status" });
  }
};

exports.create = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = buildPayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    const row = await AccreditationStatus.create({
      ...payload,
      colid,
      name: clean(req.body.name) || clean(req.body.user) || "NA",
      user: clean(req.body.user) || "NA"
    });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to create accreditation status" });
  }
};

exports.update = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const id = clean(req.body.id || req.body._id);
    if (!id || colid === undefined) return res.status(400).json({ success: false, message: "id and colid are required" });
    const payload = buildPayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    const row = await AccreditationStatus.findOneAndUpdate({ _id: id, colid }, payload, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "Accreditation status not found" });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to update accreditation status" });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const id = clean(req.body.id || req.body._id);
    if (!id || colid === undefined) return res.status(400).json({ success: false, message: "id and colid are required" });
    await AccreditationStatus.findOneAndDelete({ _id: id, colid });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to delete accreditation status" });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const user = clean(req.body.user) || "NA";
    const name = clean(req.body.name) || user;
    const docs = [];
    const errors = [];

    rows.forEach((row, index) => {
      const payload = buildPayload({
        academicyear: row.academicyear || row["Academic Year"],
        accreditation: row.accreditation || row.Accreditation,
        institution: row.institution || row.Institution,
        program: row.program || row.Program,
        programcode: row.programcode || row["Program Code"],
        startdate: row.startdate || row["Start Date"],
        validitydate: row.validitydate || row["Validity Date"],
        grade: row.grade || row.Grade
      });
      const validationError = validatePayload(payload);
      if (validationError) {
        errors.push({ row: index + 2, message: validationError });
        return;
      }
      docs.push({ ...payload, colid, name, user });
    });

    if (docs.length) await AccreditationStatus.insertMany(docs, { ordered: false });
    res.json({ success: true, saved: docs.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to bulk upload accreditation status" });
  }
};
