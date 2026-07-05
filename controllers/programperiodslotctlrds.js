const ProgramPeriodSlot = require("../Models/programperiodslotds");
const MPrograms = require("../Models/mprograms");

const text = (value) => String(value || "").trim();

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const cleanPayload = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear || input["Academic Year"]),
  program: text(input.program || input.Program),
  programcode: text(input.programcode || input.programCode || input["Program Code"]),
  dayofweek: text(input.dayofweek || input.dayOfWeek || input["Day Of Week"] || input["Day of Week"]),
  periodname: text(input.periodname || input.periodName || input["Period Name"]),
  starttime: text(input.starttime || input.startTime || input["Start Time"]),
  endtime: text(input.endtime || input.endTime || input["End Time"]),
  colid: toNumber(input.colid),
  user: text(input.user)
});

const validate = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.dayofweek) return "Day of week is required";
  if (!payload.periodname) return "Period name is required";
  if (!payload.starttime) return "Start time is required";
  if (!payload.endtime) return "End time is required";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "program", "programcode", "dayofweek", "periodname"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

exports.getOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [programs, rows] = await Promise.all([
      MPrograms.find({ colid }).select("year program programcode").sort({ year: -1, program: 1, programcode: 1 }).lean(),
      ProgramPeriodSlot.find({ colid }).lean()
    ]);

    const programMap = new Map();
    [...programs, ...rows].forEach((item) => {
      if (item.programcode) {
        programMap.set(item.programcode, {
          academicyear: item.academicyear || item.year || "",
          program: item.program || "",
          programcode: item.programcode || ""
        });
      }
    });

    res.json({
      success: true,
      academicyears: uniq([...programs.map((item) => item.year), ...rows.map((item) => item.academicyear)]),
      programs: [...programMap.values()].sort((a, b) => String(a.program || "").localeCompare(String(b.program || "")) || String(a.programcode || "").localeCompare(String(b.programcode || ""))),
      daysofweek: uniq(rows.map((item) => item.dayofweek)),
      periodnames: uniq(rows.map((item) => item.periodname))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSlots = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ProgramPeriodSlot.find(query).sort({ academicyear: -1, program: 1, dayofweek: 1, starttime: 1, periodname: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSlot = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await ProgramPeriodSlot.create(payload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSlot = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await ProgramPeriodSlot.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Period configuration not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSlot = async (req, res) => {
  try {
    const data = await ProgramPeriodSlot.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Period configuration not found" });
    res.json({ success: true, message: "Period configuration deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkSlots = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });
    const errors = [];
    const valid = [];
    items.forEach((item, index) => {
      const payload = cleanPayload({ ...item, colid: req.body.colid || item.colid, user: req.body.user || item.user });
      const error = validate(payload);
      if (error) errors.push({ rowNumber: item.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });
    if (valid.length) await ProgramPeriodSlot.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
