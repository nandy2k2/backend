const XLSX = require("xlsx");
const multer = require("multer");
const User = require("../Models/user");
const HrShiftTiming = require("../Models/hrshifttimingds");
const HrShiftAllocation = require("../Models/hrshiftallocationds");
const HrLatePolicy = require("../Models/hrlatepolicyds");
const HrOvertimePolicy = require("../Models/hrovertimepolicyds");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const readSheet = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
};
const getValue = (source, ...keys) => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return "";
};
const cleanTime = (value) => {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
};

const timingPayload = (body = {}) => ({
  location: text(getValue(body, "location", "Location")),
  shift: text(getValue(body, "shift", "Shift")),
  starttime: cleanTime(getValue(body, "starttime", "Start Time", "startTime")),
  endtime: cleanTime(getValue(body, "endtime", "End Time", "endTime")),
  lateaftertime: cleanTime(getValue(body, "lateaftertime", "Late After Time", "lateAfterTime")),
  earlybeforetime: cleanTime(getValue(body, "earlybeforetime", "Early Before Time", "earlyBeforeTime")),
  status: text(getValue(body, "status", "Status")) || "Active",
  colid: number(body.colid),
  user: text(body.user)
});

const allocationPayload = async (body = {}) => {
  const colid = number(body.colid);
  const shiftName = text(getValue(body, "shift", "Shift"));
  const shift = shiftName ? await HrShiftTiming.findOne({ colid, shift: shiftName, status: /^Active$/i }).sort({ updatedAt: -1 }).lean() : null;
  return {
    employee: text(getValue(body, "employee", "Employee", "employeename", "Employee Name")),
    employeeemail: text(getValue(body, "employeeemail", "Employee Email", "email")),
    shift: shiftName,
    location: text(getValue(body, "location", "Location")) || text(shift?.location),
    starttime: cleanTime(getValue(body, "starttime", "Start Time")) || text(shift?.starttime),
    endtime: cleanTime(getValue(body, "endtime", "End Time")) || text(shift?.endtime),
    lateaftertime: cleanTime(getValue(body, "lateaftertime", "Late After Time")) || text(shift?.lateaftertime),
    earlybeforetime: cleanTime(getValue(body, "earlybeforetime", "Early Before Time")) || text(shift?.earlybeforetime),
    status: text(getValue(body, "status", "Status")) || "Active",
    colid,
    user: text(body.user)
  };
};

const latePolicyPayload = (body = {}) => ({
  role: text(getValue(body, "role", "Role")),
  fromdays: number(getValue(body, "fromdays", "From Days")),
  todays: number(getValue(body, "todays", "To Days")),
  dailysalarypercentage: number(getValue(body, "dailysalarypercentage", "Daily Salary Percentage")),
  status: text(getValue(body, "status", "Status")) || "Active",
  colid: number(body.colid),
  user: text(body.user)
});

const overtimePolicyPayload = (body = {}) => ({
  role: text(getValue(body, "role", "Role")),
  hourlyrate: number(getValue(body, "hourlyrate", "Hourly Rate")),
  status: text(getValue(body, "status", "Status")) || "Active",
  colid: number(body.colid),
  user: text(body.user)
});

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const [users, shifts, locations] = await Promise.all([
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email user phone department role").sort({ name: 1 }).lean(),
      HrShiftTiming.find({ colid, status: /^Active$/i }).sort({ location: 1, shift: 1 }).lean(),
      HrShiftTiming.distinct("location", { colid })
    ]);
    res.json({ success: true, users, shifts, locations: locations.filter(Boolean).sort() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTiming = async (req, res) => {
  try {
    const payload = timingPayload(req.body);
    if (!payload.colid || !payload.shift) return res.status(400).json({ success: false, message: "Shift is required" });
    const data = await HrShiftTiming.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTimings = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    ["location", "shift", "status"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await HrShiftTiming.find(filter).sort({ location: 1, shift: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTiming = async (req, res) => {
  try {
    const data = await HrShiftTiming.findOneAndUpdate(
      { _id: req.body.id, colid: number(req.body.colid) },
      timingPayload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Shift timing not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTiming = async (req, res) => {
  try {
    await HrShiftTiming.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkTiming = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = readSheet(req.file.buffer).map((row) => timingPayload({ ...row, colid, user: req.body.user })).filter((row) => row.shift);
    const data = await HrShiftTiming.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAllocation = async (req, res) => {
  try {
    const payload = await allocationPayload(req.body);
    if (!payload.colid || !payload.employeeemail || !payload.shift) return res.status(400).json({ success: false, message: "Employee and shift are required" });
    const data = await HrShiftAllocation.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllocations = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    ["employeeemail", "shift", "location", "status"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await HrShiftAllocation.find(filter).sort({ employee: 1, shift: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateAllocation = async (req, res) => {
  try {
    const data = await HrShiftAllocation.findOneAndUpdate(
      { _id: req.body.id, colid: number(req.body.colid) },
      await allocationPayload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Shift allocation not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAllocation = async (req, res) => {
  try {
    await HrShiftAllocation.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkAllocation = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = [];
    for (const row of readSheet(req.file.buffer)) {
      const payload = await allocationPayload({ ...row, colid, user: req.body.user });
      if (payload.employeeemail && payload.shift) rows.push(payload);
    }
    const data = await HrShiftAllocation.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createLatePolicy = async (req, res) => {
  try {
    const payload = latePolicyPayload(req.body);
    if (!payload.colid || !payload.role) return res.status(400).json({ success: false, message: "Role is required" });
    const data = await HrLatePolicy.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getLatePolicies = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    ["role", "status"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await HrLatePolicy.find(filter).sort({ role: 1, fromdays: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateLatePolicy = async (req, res) => {
  try {
    const data = await HrLatePolicy.findOneAndUpdate(
      { _id: req.body.id, colid: number(req.body.colid) },
      latePolicyPayload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Late policy not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteLatePolicy = async (req, res) => {
  try {
    await HrLatePolicy.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkLatePolicy = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = readSheet(req.file.buffer).map((row) => latePolicyPayload({ ...row, colid, user: req.body.user })).filter((row) => row.role);
    const data = await HrLatePolicy.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createOvertimePolicy = async (req, res) => {
  try {
    const payload = overtimePolicyPayload(req.body);
    if (!payload.colid || !payload.role) return res.status(400).json({ success: false, message: "Role is required" });
    const data = await HrOvertimePolicy.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOvertimePolicies = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    ["role", "status"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await HrOvertimePolicy.find(filter).sort({ role: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOvertimePolicy = async (req, res) => {
  try {
    const data = await HrOvertimePolicy.findOneAndUpdate(
      { _id: req.body.id, colid: number(req.body.colid) },
      overtimePolicyPayload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Overtime policy not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOvertimePolicy = async (req, res) => {
  try {
    await HrOvertimePolicy.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkOvertimePolicy = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = readSheet(req.file.buffer).map((row) => overtimePolicyPayload({ ...row, colid, user: req.body.user })).filter((row) => row.role);
    const data = await HrOvertimePolicy.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
