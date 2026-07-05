const FacultyAvailability = require("../Models/facultyavailabilityds");
const User = require("../Models/user");

const text = (value) => String(value || "").trim();

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const normalizeWeekday = (value) => {
  const raw = text(value);
  const matched = weekdays.find((day) => day.toLowerCase() === raw.toLowerCase());
  return matched || raw;
};

const cleanPayload = (input = {}) => {
  return {
    academicyear: text(input.academicyear || input.academicYear || input["Academic Year"]),
    facultyname: text(input.facultyname || input.facultyName || input.name || input["Faculty Name"]),
    facultyemail: text(input.facultyemail || input.facultyEmail || input.email || input["Faculty Email"]),
    dayofweek: normalizeWeekday(input.dayofweek || input.dayOfWeek || input["Day Of Week"] || input["Day of Week"]),
    availabilitydate: text(input.availabilitydate || input.availabilityDate || input.date || input.Date || input["Availability Date"]),
    dayofmonth: toNumber(input.dayofmonth || input.dayOfMonth || input["Day Of Month"] || input["Day of Month"]),
    starttime: text(input.starttime || input.startTime || input["Start Time"]),
    endtime: text(input.endtime || input.endTime || input["End Time"]),
    reason: text(input.reason || input.Reason),
    remarks: text(input.remarks || input.Remarks),
    colid: toNumber(input.colid),
    user: text(input.user)
  };
};

const validate = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.facultyname) return "Faculty name is required";
  if (!payload.facultyemail) return "Faculty email is required";
  if (!payload.dayofweek) return "Day of week is required";
  if (!payload.starttime) return "Start time is required";
  if (!payload.endtime) return "End time is required";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "facultyemail", "dayofweek"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

exports.getOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [rows, users] = await Promise.all([
      FacultyAvailability.find({ colid }).select("academicyear facultyname facultyemail dayofweek").lean(),
      User.find({ colid }).select("name email user role department").sort({ name: 1, email: 1 }).lean()
    ]);
    const employees = users.filter((item) => String(item.role || "").trim().toLowerCase() !== "student");
    const facultyMap = new Map();
    rows.forEach((row) => {
      if (row.facultyemail) facultyMap.set(row.facultyemail, { facultyname: row.facultyname || "", facultyemail: row.facultyemail || "" });
    });
    res.json({
      success: true,
      academicyears: uniq(rows.map((row) => row.academicyear)),
      faculty: [...facultyMap.values()].sort((a, b) => String(a.facultyname || "").localeCompare(String(b.facultyname || ""))),
      employees: employees.map((item) => ({
        facultyname: item.name || item.email || item.user || "",
        facultyemail: item.email || item.user || "",
        role: item.role || "",
        department: item.department || ""
      })).filter((item) => item.facultyemail || item.facultyname),
      daysofweek: uniq([...weekdays, ...rows.map((row) => row.dayofweek)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAvailability = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await FacultyAvailability.find(query).sort({ dayofweek: 1, facultyname: 1, starttime: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAvailability = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await FacultyAvailability.create(payload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateAvailability = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await FacultyAvailability.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Faculty availability not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAvailability = async (req, res) => {
  try {
    const data = await FacultyAvailability.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Faculty availability not found" });
    res.json({ success: true, message: "Faculty availability deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkAvailability = async (req, res) => {
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
    if (valid.length) await FacultyAvailability.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
