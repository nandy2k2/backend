const RegulationSubject = require("../Models/regulationsubjectds");
const RegulationMaster = require("../Models/regulationmasterds");
const MPrograms = require("../Models/mprograms");

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toSeatNumber = (value) => {
  const parsed = toNumber(value);
  return parsed === undefined ? 0 : parsed;
};

const allowedTypes = new Set(["Major", "Minor", "AEC", "SEC", "VAC", "IDC"]);
const yesNoValues = new Set(["Yes", "No"]);
const genderValues = new Set(["Male", "Female", "Other"]);

const cleanPayload = (input = {}) => ({
  regulationid: String(input.regulationid || "").trim(),
  regulation: String(input.regulation || "").trim(),
  academicyear: String(input.academicyear || "").trim(),
  program: String(input.program || "").trim(),
  programcode: String(input.programcode || "").trim(),
  subject: String(input.subject || input.subjects || "").trim(),
  type: allowedTypes.has(input.type) ? input.type : "",
  totalseats: toSeatNumber(input.totalseats),
  general: toSeatNumber(input.general),
  sc: toSeatNumber(input.sc),
  st: toSeatNumber(input.st),
  ebc: toSeatNumber(input.ebc),
  ews: toSeatNumber(input.ews),
  ph: toSeatNumber(input.ph),
  sportsnccnss: toSeatNumber(input.sportsnccnss),
  supernumerary: toSeatNumber(input.supernumerary),
  samestate: yesNoValues.has(input.samestate) ? input.samestate : "Yes",
  gender: genderValues.has(input.gender) ? input.gender : "Other",
  status: String(input.status || "Active").trim() || "Active",
  colid: toNumber(input.colid),
  user: String(input.user || "").trim()
});

const validatePayload = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.regulation) return "Regulation is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.program) return "Program is required";
  if (!payload.subject) return "Subject is required";
  if (!payload.type) return "Type is required";
  return "";
};

const buildQuery = (req) => {
  const query = {};
  const source = { ...req.query, ...req.body };
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  if (source.regulation) query.regulation = source.regulation;
  if (source.academicyear) query.academicyear = source.academicyear;
  if (source.programcode) query.programcode = source.programcode;
  if (source.program) query.program = source.program;
  if (source.type) query.type = source.type;
  if (source.status) query.status = source.status;
  return query;
};

exports.createRegulationSubject = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });

    const data = await RegulationSubject.create(payload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRegulationSubjects = async (req, res) => {
  try {
    const query = buildQuery(req);
    if (query.colid === undefined) {
      return res.status(400).json({ success: false, message: "colid is required" });
    }

    const data = await RegulationSubject.find(query).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1 });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateRegulationSubject = async (req, res) => {
  try {
    const id = req.body.id;
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });

    const data = await RegulationSubject.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRegulationSubject = async (req, res) => {
  try {
    const data = await RegulationSubject.findByIdAndDelete(req.body.id);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Record deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDeleteRegulationSubjects = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select records to delete" });
    const query = { _id: { $in: ids } };
    const colid = toNumber(req.body.colid);
    if (colid !== undefined) query.colid = colid;
    const result = await RegulationSubject.deleteMany(query);
    res.json({ success: true, deleted: result.deletedCount || 0, message: "Selected records deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkCreateRegulationSubjects = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });

    const errors = [];
    const valid = [];
    items.forEach((item, index) => {
      const payload = cleanPayload({ ...item, colid: req.body.colid || item.colid, user: req.body.user || item.user });
      const error = validatePayload(payload);
      if (error) errors.push({ rowNumber: item.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });

    if (valid.length) await RegulationSubject.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRegulationSubjectOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) {
      return res.status(400).json({ success: false, message: "colid is required" });
    }

    const [regulations, programs] = await Promise.all([
      RegulationMaster.find({ colid, isactive: "Yes" }).sort({ regulation: 1 }).lean(),
      MPrograms.find({ colid }).sort({ program: 1, programcode: 1 }).lean()
    ]);

    res.json({
      success: true,
      regulations,
      programs: programs.map((item) => ({
        _id: item._id,
        program: item.program || item.name || "",
        programcode: item.programcode || "",
        type: item.type || "",
        year: item.year || ""
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
