const MPrograms = require("../Models/mprograms");

const text = (value) => String(value || "").trim();

const numberColid = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const programPayload = (body = {}) => {
  const program = text(body.program || body.name);
  const orderValue = body.Order ?? body.order ?? body.programorder ?? body.ProgramOrder;
  const parsedOrder = orderValue === '' || orderValue === undefined || orderValue === null ? 0 : Number(orderValue);
  const durationValue = body.durationinyear ?? body.durationInYear ?? body["duration in year"] ?? body.DurationInYear ?? body["Duration in year"];
  const parsedDuration = durationValue === '' || durationValue === undefined || durationValue === null ? 0 : Number(durationValue);
  const totalCreditsValue = body.totalcredits ?? body.totalCredits ?? body["total credits"] ?? body.TotalCredits ?? body["Total credits"];
  const parsedTotalCredits = totalCreditsValue === '' || totalCreditsValue === undefined || totalCreditsValue === null ? 0 : Number(totalCreditsValue);
  return {
    name: text(body.name || program),
    user: text(body.user),
    colid: numberColid(body.colid),
    year: text(body.year || body.academicyear || body.academicYear),
    program,
    programcode: text(body.programcode || body.programCode),
    type: text(body.type),
    level: text(body.level),
    institution: text(body.institution || body.Institution),
    department: text(body.department || body.Department),
    durationinyear: Number.isNaN(parsedDuration) ? 0 : parsedDuration,
    totalcredits: Number.isNaN(parsedTotalCredits) ? 0 : parsedTotalCredits,
    typeofsession: text(body.typeofsession || body.typeOfSession || body["type of session"] || body.TypeOfSession || body["Type of session"]),
    introductionyear: text(body.introductionyear || body.introductionYear || body["introduction year"] || body.IntroductionYear || body["Introduction year"]),
    discontinueyear: text(body.discontinueyear || body.discontinueYear || body["discontinue year"] || body.DiscontinueYear || body["Discontinue year"]),
    lastrevisionyear: text(body.lastrevisionyear || body.lastRevisionYear || body["last revision year"] || body.LastRevisionYear || body["Last revision year"]),
    Order: Number.isNaN(parsedOrder) ? 0 : parsedOrder,
    status1: text(body.status1 || body.status || "Active") || "Active",
    comments: text(body.comments)
  };
};

exports.getPrograms = async (req, res) => {
  try {
    const colid = numberColid(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    ["year", "type", "level", "status1", "programcode", "institution", "department", "typeofsession"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    if (text(req.query.program)) filter.program = new RegExp(text(req.query.program).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const data = await MPrograms.find(filter).sort({ year: -1, level: 1, type: 1, Order: 1, program: 1, programcode: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProgram = async (req, res) => {
  try {
    const payload = programPayload(req.body);
    if (!payload.colid || !payload.name || !payload.user || !payload.program || !payload.programcode) {
      return res.status(400).json({ success: false, message: "Program, program code, user and colid are required" });
    }
    const data = await MPrograms.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProgram = async (req, res) => {
  try {
    const colid = numberColid(req.body.colid);
    const payload = programPayload(req.body);
    const data = await MPrograms.findOneAndUpdate(
      { _id: req.body.id, colid },
      payload,
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Program not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteProgram = async (req, res) => {
  try {
    const data = await MPrograms.findOneAndDelete({ _id: req.body.id, colid: numberColid(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Program not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkPrograms = async (req, res) => {
  try {
    const colid = numberColid(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows received" });

    const errors = [];
    const docs = [];
    rows.forEach((row, index) => {
      const item = programPayload({ ...row, colid, user: req.body.user || row.user });
      if (!item.name || !item.user || !item.program || !item.programcode) {
        errors.push({ row: index + 2, message: "Program and programcode are required" });
        return;
      }
      docs.push(item);
    });

    const inserted = docs.length ? await MPrograms.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: inserted.length, errors, data: inserted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProgramOptions = async (req, res) => {
  try {
    const colid = numberColid(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [years, types, levels, statuses, institutions, departments, sessionTypes] = await Promise.all([
      MPrograms.distinct("year", { colid }),
      MPrograms.distinct("type", { colid }),
      MPrograms.distinct("level", { colid }),
      MPrograms.distinct("status1", { colid }),
      MPrograms.distinct("institution", { colid }),
      MPrograms.distinct("department", { colid }),
      MPrograms.distinct("typeofsession", { colid })
    ]);
    res.json({
      success: true,
      years: years.filter(Boolean).sort(),
      types: types.filter(Boolean).sort(),
      levels: levels.filter(Boolean).sort(),
      statuses: statuses.filter(Boolean).sort(),
      institutions: institutions.filter(Boolean).sort(),
      departments: departments.filter(Boolean).sort(),
      sessionTypes: sessionTypes.filter(Boolean).sort()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
