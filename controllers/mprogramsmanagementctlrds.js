const MPrograms = require("../Models/mprograms");
const User = require("../Models/user");
const extraEnums = { gender: ['Male', 'Female', 'All'], coursetype: ['Regular', 'Online', 'ODL'], coursetime: ['Full', 'Parttime'], semestertype: ['Annual', 'Semester', 'Trimester'] };
const extraStrings = ['enrollmentcode', 'displayname', 'marksheetname', 'branchcode', 'programlevelcode', 'shift', 'programincharge', 'programinchargeemail', ...Object.keys(extraEnums)];
const extraNumbers = ['noofsemesters', 'noofyears', 'maxallowedyear'];
const badValue = message => Object.assign(new Error(message), { statusCode: 400 });
const escaped = value => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const extraValue = (body, field) => {
  const key = Object.keys(body).find(key => key.replace(/[ _-]/g, '').toLowerCase() === field);
  return key === undefined ? undefined : body[key];
};
function extraPayload(body) {
  const result = {};
  for (const field of extraStrings) {
    const value = extraValue(body, field);
    if (value === undefined) continue;
    const cleaned = text(value), options = extraEnums[field];
    if (options && cleaned) {
      const match = options.find(option => option.toLowerCase() === cleaned.toLowerCase());
      if (!match) throw badValue(`Invalid ${field}. Select ${options.join(', ')}.`);
      result[field] = match;
    } else result[field] = cleaned;
  }
  for (const field of extraNumbers) {
    const value = extraValue(body, field);
    if (value === undefined) continue;
    if (value === '' || value === null) { result[field] = null; continue; }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || (field === 'noofsemesters' && !Number.isInteger(number))) throw badValue(`${field} must be a non-negative ${field === 'noofsemesters' ? 'whole number' : 'number'}.`);
    result[field] = number;
  }
  return result;
}
async function resolveIncharge(payload) {
  if (payload.programincharge === undefined && payload.programinchargeemail === undefined) return;
  const email = text(payload.programinchargeemail), name = text(payload.programincharge);
  if (!email && !name) { payload.programincharge = ''; payload.programinchargeemail = ''; return; }
  const people = await User.find({ colid: payload.colid, ...(email ? { email: new RegExp(`^${escaped(email)}$`, 'i') } : { name: new RegExp(`^${escaped(name)}$`, 'i') }) }).select('name email').limit(2).lean();
  if (people.length !== 1 || !people[0].email) throw badValue('Select a valid program incharge from this institution. For duplicate names, provide the email.');
  payload.programincharge = people[0].name;
  payload.programinchargeemail = people[0].email;
}

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
  const intakeCapacityValue = body.intakecapacity ?? body.intakeCapacity ?? body["intake capacity"] ?? body.IntakeCapacity ?? body["Intake capacity"];
  const parsedIntakeCapacity = intakeCapacityValue === '' || intakeCapacityValue === undefined || intakeCapacityValue === null ? 0 : Number(intakeCapacityValue);
  const amountValue = body.amount ?? body.Amount;
  const parsedAmount = amountValue === '' || amountValue === undefined || amountValue === null ? 0 : Number(amountValue);
  return {
    ...extraPayload(body),
    name: text(body.name || program),
    user: text(body.user),
    colid: numberColid(body.colid),
    year: text(body.year || body.academicyear || body.academicYear),
    program,
    programcode: text(body.programcode || body.programCode),
    programgroup: text(body.programgroup ?? body.programGroup ?? body['program group'] ?? body['Program Group']),
    type: text(body.type),
    level: text(body.level),
	    institution: text(body.institution || body.Institution),
	    department: text(body.department || body.Department),
    faculty: text(body.faculty || body.Faculty),
    durationinyear: Number.isNaN(parsedDuration) ? 0 : parsedDuration,
    totalcredits: Number.isNaN(parsedTotalCredits) ? 0 : parsedTotalCredits,
    intakecapacity: Number.isNaN(parsedIntakeCapacity) ? 0 : parsedIntakeCapacity,
    amount: Number.isNaN(parsedAmount) ? 0 : parsedAmount,
    excluded: /^yes$/i.test(text(body.excluded || body.Excluded)) ? "Yes" : "No",
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
    ["year", "type", "level", "status1", "programcode", "programgroup", "institution", "department", "faculty", "typeofsession", "excluded", ...extraStrings].forEach((field) => {
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
    await resolveIncharge(payload);
    const data = await MPrograms.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.updateProgram = async (req, res) => {
  try {
    const colid = numberColid(req.body.colid);
    const payload = programPayload(req.body);
    await resolveIncharge(payload);
    const data = await MPrograms.findOneAndUpdate(
      { _id: req.body.id, colid },
      payload,
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Program not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
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

exports.bulkUpdateProgramMeta = async (req, res) => {
  try {
    const colid = numberColid(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const update = {};
    if (req.body.institution !== undefined) update.institution = text(req.body.institution);
    if (req.body.faculty !== undefined) update.faculty = text(req.body.faculty);
    if (req.body.excluded !== undefined) update.excluded = /^yes$/i.test(text(req.body.excluded)) ? "Yes" : "No";
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one program" });
    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: "Enter institution, faculty or excluded value to update" });
    const result = await MPrograms.updateMany({ _id: { $in: ids }, colid }, { $set: update });
    res.json({ success: true, modified: result.modifiedCount || 0 });
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
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const row = rows[index];
        const item = programPayload({ ...row, colid, user: req.body.user || row.user });
        if (!item.name || !item.user || !item.program || !item.programcode) throw badValue('Program and programcode are required');
        await resolveIncharge(item);
        docs.push(item);
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }

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
    const [years, types, levels, statuses, institutions, departments, faculties, sessionTypes, excluded, programgroups] = await Promise.all([
      MPrograms.distinct("year", { colid }),
      MPrograms.distinct("type", { colid }),
      MPrograms.distinct("level", { colid }),
      MPrograms.distinct("status1", { colid }),
      MPrograms.distinct("institution", { colid }),
      MPrograms.distinct("department", { colid }),
      MPrograms.distinct("faculty", { colid }),
      MPrograms.distinct("typeofsession", { colid }),
      MPrograms.distinct("excluded", { colid }),
      MPrograms.distinct("programgroup", { colid })
    ]);
    res.json({
      success: true,
      programgroups: programgroups.filter(Boolean).sort(),
      years: years.filter(Boolean).sort(),
      types: types.filter(Boolean).sort(),
      levels: levels.filter(Boolean).sort(),
      statuses: statuses.filter(Boolean).sort(),
      institutions: institutions.filter(Boolean).sort(),
      departments: departments.filter(Boolean).sort(),
      faculties: faculties.filter(Boolean).sort(),
      excluded: Array.from(new Set(["No", "Yes", ...excluded.filter(Boolean)])).sort(),
      sessionTypes: sessionTypes.filter(Boolean).sort()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProgramIncharges = async (req, res) => {
  try {
    const colid = numberColid(req.query.colid);
    if (!colid) throw badValue('colid is required');
    const query = { colid, email: { $nin: ['', null] } };
    if (text(req.query.search)) query.$or = ['name', 'email'].map(field => ({ [field]: new RegExp(escaped(req.query.search), 'i') }));
    const data = await User.find(query).select('name email').sort({ name: 1 }).limit(30).lean();
    res.json({ data });
  } catch (error) { res.status(error.statusCode || 500).json({ message: error.message }); }
};
