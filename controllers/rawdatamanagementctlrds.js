const RawDataSource = require("../Models/rawdatasourceds");
const RawData = require("../Models/rawdatamanagementds");
const Lead = require("../Models/crmh1");
const User = require("../Models/user");

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value) => (value === undefined || value === null ? "" : String(value).trim());
const regex = (value) => ({ $regex: text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" });
const first = (...values) => values.find((value) => text(value)) || "";
const sourceStatuses = ["Active", "Inactive"];
const rawStatuses = ["New", "Verified", "Qualified", "Rejected", "Copied to CRM"];
const crmTriggerStatuses = new Set(["verified", "qualified", "copied to crm"]);

const queryFrom = (source = {}) => {
  const query = { colid: number(source.colid) };
  ["sourcename", "status", "employeeemail", "year", "category", "course_interested", "program", "programcode"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  if (text(source.search)) {
    const rx = regex(source.search);
    query.$or = [{ name: rx }, { phone: rx }, { email: rx }, { comments: rx }, { employee: rx }, { employeeemail: rx }];
  }
  return query;
};

const sourcePayload = (body = {}) => ({
  colid: number(body.colid),
  sourcename: text(first(body.sourcename, body.source_name, body.Source, body.source)),
  description: text(first(body.description, body.Description)),
  status: sourceStatuses.includes(text(body.status)) ? text(body.status) : "Active",
  user: text(body.user)
});

const rawPayload = (body = {}) => {
  const assignedEmail = text(first(body.employeeemail, body.employeeEmail, body.assignedto, body.AssignedTo));
  return {
    colid: number(body.colid),
    year: text(first(body.year, body.Year)),
    sourcename: text(first(body.sourcename, body.source, body.Source, body.source_name)),
    status: text(first(body.status, body.Status)) || "New",
    employee: text(first(body.employee, body.Employee, body.employeename, body.assignedtoname)),
    employeeemail: assignedEmail,
    name: text(first(body.name, body.Name, body.leadname, body["Lead Name"])),
    phone: text(first(body.phone, body.Phone, body.mobile, body.Mobile)),
    email: text(first(body.email, body.Email)),
    category: text(first(body.category, body.Category)) || "NA",
    course_interested: text(first(body.course_interested, body.Course, body.course, body["Course Interested"])),
    program: text(first(body.program, body.Program)),
    programcode: text(first(body.programcode, body.ProgramCode, body.program_code)),
    program_type: text(first(body.program_type, body.ProgramType, body.programtype)),
    city: text(first(body.city, body.City)),
    state: text(first(body.state, body.State)),
    country: text(first(body.country, body.Country)),
    comments: text(first(body.comments, body.Comments, body.description, body.Description)),
    rawpayload: body.rawpayload && typeof body.rawpayload === "object" ? body.rawpayload : body,
    user: text(body.user)
  };
};

const copyRawToCrm = async (raw) => {
  if (!raw || !crmTriggerStatuses.has(text(raw.status).toLowerCase()) || text(raw.crmleadid)) return null;
  const lead = await Lead.create({
    colid: raw.colid,
    user: raw.employeeemail || raw.user || "NA",
    name: raw.name || "NA",
    phone: raw.phone || "",
    email: raw.email || "",
    category: raw.category || "NA",
    course_interested: raw.course_interested || "",
    program: raw.program || "",
    programcode: raw.programcode || "",
    program_type: raw.program_type || "",
    year: raw.year || "",
    source: raw.sourcename || "Raw Data",
    assignedto: raw.employeeemail || raw.user || "NA",
    pipeline_stage: "New Lead",
    leadstatus: "Active",
    city: raw.city || "",
    state: raw.state || "",
    country: raw.country || "",
    comments: raw.comments || "",
    fcomments: `Created from raw data ${raw._id}`
  });
  raw.crmleadid = String(lead._id);
  raw.crmcopiedat = new Date();
  if (text(raw.status).toLowerCase() !== "copied to crm") raw.status = "Copied to CRM";
  await raw.save();
  return lead;
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const [sources, employees, rawOptions] = await Promise.all([
      RawDataSource.find({ colid }).sort({ sourcename: 1 }).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email role department").sort({ name: 1 }).lean(),
      RawData.aggregate([
        { $match: { colid } },
        {
          $group: {
            _id: null,
            years: { $addToSet: "$year" },
            statuses: { $addToSet: "$status" },
            categories: { $addToSet: "$category" },
            courses: { $addToSet: "$course_interested" },
            programs: { $addToSet: "$program" },
            programcodes: { $addToSet: "$programcode" },
            employees: { $addToSet: "$employeeemail" }
          }
        }
      ])
    ]);
    res.json({ success: true, sources, employees, statuses: rawStatuses, sourceStatuses, rawOptions: rawOptions[0] || {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listSources = async (req, res) => {
  try {
    const query = { colid: number(req.query.colid) };
    if (text(req.query.status)) query.status = text(req.query.status);
    if (text(req.query.search)) query.$or = [{ sourcename: regex(req.query.search) }, { description: regex(req.query.search) }];
    const data = await RawDataSource.find(query).sort({ sourcename: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveSource = async (req, res) => {
  try {
    const payload = sourcePayload(req.body);
    if (!payload.colid || !payload.sourcename) return res.status(400).json({ success: false, message: "Source name is required" });
    const data = req.body.id || req.body._id
      ? await RawDataSource.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await RawDataSource.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Duplicate source name" : error.message });
  }
};

exports.deleteSources = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id || req.body._id].filter(Boolean);
    const result = await RawDataSource.deleteMany({ _id: { $in: ids }, colid: number(req.body.colid) });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkSources = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      const payload = sourcePayload({ ...rows[index], colid, user: req.body.user || rows[index].user });
      if (!payload.sourcename) {
        errors.push({ row: index + 2, message: "Source name missing" });
        continue;
      }
      try {
        await RawDataSource.findOneAndUpdate({ colid, sourcename: payload.sourcename }, payload, { upsert: true, new: true, runValidators: true });
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listRawData = async (req, res) => {
  try {
    const query = queryFrom(req.query);
    const data = await RawData.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRawData = async (req, res) => {
  try {
    const payload = rawPayload(req.body);
    if (!payload.colid || !payload.sourcename) return res.status(400).json({ success: false, message: "Source is required" });
    let data = req.body.id || req.body._id
      ? await RawData.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await RawData.create(payload);
    const lead = await copyRawToCrm(data);
    if (lead) data = await RawData.findById(data._id).lean();
    res.json({ success: true, data, crmlead: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const data = await RawData.findOneAndUpdate(
      { _id: req.body.id || req.body._id, colid: number(req.body.colid) },
      { status: text(req.body.status), user: text(req.body.user) },
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Raw data not found" });
    const lead = await copyRawToCrm(data);
    const latest = await RawData.findById(data._id).lean();
    res.json({ success: true, data: latest, crmlead: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRawData = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id || req.body._id].filter(Boolean);
    const result = await RawData.deleteMany({ _id: { $in: ids }, colid: number(req.body.colid) });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkRawData = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    let copied = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      const payload = rawPayload({ ...rows[index], colid, user: req.body.user || rows[index].user });
      if (!payload.sourcename) {
        errors.push({ row: index + 2, message: "Source missing" });
        continue;
      }
      try {
        const data = await RawData.create(payload);
        const lead = await copyRawToCrm(data);
        if (lead) copied += 1;
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, saved, copied, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
