const XLSX = require("xlsx");
const multer = require("multer");
const User = require("../Models/user");
const HrEmployeeAttendance = require("../Models/hremployeeattendanceds");
const HrEmployeeAttendanceApprovalMatrix = require("../Models/hremployeeattendanceapprovalmatrixds");
const HrShiftAllocation = require("../Models/hrshiftallocationds");
const HrLatePolicy = require("../Models/hrlatepolicyds");
const HrOvertimePolicy = require("../Models/hrovertimepolicyds");
const LeaveApplication = require("../Models/hrleaveapplicationds");
const LeaveBalance = require("../Models/hrleavebalanceds");
const LeaveType = require("../Models/hrleavetypeds");
const LeaveCycle = require("../Models/hrleavecycleds");
const CompensatoryRule = require("../Models/hrleavecompensatoryruleds");
const WeeklyOff = require("../Models/hrleaveweeklyoffds");
const AcademicCalendar = require("../Models/macadcal");
const HrSalStructure = require("../Models/hrsalstructure");
const HrSalary = require("../Models/hrsalary");

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
const splitLevels = (row) => {
  if (Array.isArray(row.levels)) return row.levels;
  const levels = [];
  for (let index = 1; index <= 10; index += 1) {
    const approveremail = text(row[`approveremail${index}`] || row[`level${index}email`]);
    if (approveremail) {
      levels.push({
        level: index,
        approvername: text(row[`approvername${index}`] || row[`level${index}name`]),
        approveremail,
        approverrole: text(row[`approverrole${index}`] || row[`level${index}role`])
      });
    }
  }
  return levels;
};
const attendanceStatus = (value) => (number(value) === 1 ? "Present" : "Absent");
const cleanTime = (value) => {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
};
const timeToMinutes = (value) => {
  const time = cleanTime(value);
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};
const yesNo = (flag) => (flag ? "Yes" : "No");
const isDeduction = (value) => text(value).toLowerCase() === "deduction";
const dayName = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
};
const dateRangeFor = (dateValue) => {
  const start = new Date(dateValue);
  if (Number.isNaN(start.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};
const endOfMonthDate = (dateValue) => {
  const base = new Date(dateValue);
  const valid = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(valid.getFullYear(), valid.getMonth() + 1, 0);
};
const monthRange = (dateValue) => {
  const base = new Date(dateValue);
  if (Number.isNaN(base.getTime())) return null;
  return {
    start: new Date(base.getFullYear(), base.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(base.getFullYear(), base.getMonth() + 1, 0).toISOString().slice(0, 10)
  };
};

const hasApprovedLeaveForDate = async (attendanceRow) => {
  if (!attendanceRow?.date) return false;
  const leave = await LeaveApplication.findOne({
    colid: Number(attendanceRow.colid),
    employeeemail: text(attendanceRow.employeeemail),
    status: "Approved",
    fromdate: { $lte: text(attendanceRow.date) },
    todate: { $gte: text(attendanceRow.date) }
  }).lean();
  return Boolean(leave);
};

const isWeeklyOff = async (attendanceRow) => {
  const dayofweek = dayName(attendanceRow.date);
  if (!dayofweek) return false;
  const row = await WeeklyOff.findOne({
    colid: Number(attendanceRow.colid),
    employeeemail: text(attendanceRow.employeeemail),
    dayofweek,
    status: /^Active$/i
  }).lean();
  return Boolean(row);
};

const isHoliday = async (attendanceRow) => {
  const range = dateRangeFor(attendanceRow.date);
  if (!range) return false;
  const row = await AcademicCalendar.findOne({
    colid: Number(attendanceRow.colid),
    type: /^Holiday$/i,
    activitydate: { $gte: range.start, $lte: range.end }
  }).lean();
  return Boolean(row);
};

const getLatestCycleName = async (colid) => {
  const cycle = await LeaveCycle.findOne({ colid, status: /^Active$/i }).sort({ updatedAt: -1 }).lean();
  return text(cycle?.cyclename);
};

const findBalance = async (colid, employeeemail, leavetype, cyclename = "") => {
  const exact = cyclename ? await LeaveBalance.findOne({ colid, employeeemail, leavetype, cyclename }) : null;
  if (exact) return exact;
  return LeaveBalance.findOne({ colid, employeeemail, leavetype }).sort({ updatedAt: -1 });
};

const ensureCompBalance = async (attendanceRow, employee = null) => {
  const colid = Number(attendanceRow.colid);
  const cyclename = await getLatestCycleName(colid);
  return LeaveBalance.findOneAndUpdate(
    { colid, employeeemail: text(attendanceRow.employeeemail), leavetype: "Compensatory Leave", cyclename },
    {
      colid,
      cyclename,
      employeename: text(attendanceRow.employeename || employee?.name),
      employeeemail: text(attendanceRow.employeeemail),
      department: text(employee?.department),
      leavetype: "Compensatory Leave",
      status: "Active",
      user: text(attendanceRow.user)
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const addCompensatoryLeaveIfRequired = async (attendanceRow) => {
  if (number(attendanceRow.attendance) !== 1 || attendanceRow.approvalstatus !== "Approved") return null;
  const offDay = await isWeeklyOff(attendanceRow);
  const holiday = await isHoliday(attendanceRow);
  if (!offDay && !holiday) return null;
  const comments = `Compensatory Leave for attendance ${attendanceRow._id} on ${attendanceRow.date}`;
  if (text(attendanceRow.finalcomment).includes(comments)) return null;
  const employee = await User.findOne({ colid: Number(attendanceRow.colid), $or: [{ email: text(attendanceRow.employeeemail) }, { user: text(attendanceRow.employeeemail) }] }).select("name email user department role").lean();
  const rule = await CompensatoryRule.findOne({
    colid: Number(attendanceRow.colid),
    status: /^Active$/i,
    $or: [{ role: text(employee?.role) }, { role: /^All$/i }]
  }).sort({ role: -1, updatedAt: -1 }).lean();
  const addDays = number(rule?.leavestoadd || 1);
  const balance = await ensureCompBalance(attendanceRow, employee);
  balance.earned = number(balance.earned) + addDays;
  balance.balance = number(balance.balance) + addDays;
  await balance.save();
  attendanceRow.finalcomment = [text(attendanceRow.finalcomment), comments].filter(Boolean).join(" | ");
  await attendanceRow.save();
  return balance;
};

const deductCasualLeaveIfPossible = async (attendanceRow) => {
  const colid = Number(attendanceRow.colid);
  const clType = await LeaveType.findOne({
    colid,
    status: /^Active$/i,
    $or: [{ code: /^CL$/i }, { leavetype: /casual/i }, { leavetype: /^CL$/i }]
  }).sort({ code: -1, updatedAt: -1 }).lean();
  if (!clType?.leavetype) return false;
  const balance = await findBalance(colid, text(attendanceRow.employeeemail), clType.leavetype);
  if (!balance || number(balance.balance) < 1) return false;
  const marker = `CL deducted for attendance ${attendanceRow._id} on ${attendanceRow.date}`;
  if (text(attendanceRow.finalcomment).includes(marker)) return true;
  balance.used = number(balance.used) + 1;
  balance.balance = number(balance.balance) - 1;
  await balance.save();
  attendanceRow.finalcomment = [text(attendanceRow.finalcomment), marker].filter(Boolean).join(" | ");
  await attendanceRow.save();
  return true;
};

const createLopDeductionIfRequired = async (attendanceRow, approvedByUser) => {
  if (number(attendanceRow.attendance) !== 0 || attendanceRow.approvalstatus !== "Approved") return null;
  const approvedLeaveExists = await hasApprovedLeaveForDate(attendanceRow);
  if (approvedLeaveExists) return null;
  const offDay = await isWeeklyOff(attendanceRow);
  const holiday = await isHoliday(attendanceRow);
  if (offDay || holiday) return null;
  const clDeducted = await deductCasualLeaveIfPossible(attendanceRow);
  if (clDeducted) return null;

  const comments = `LOP Deduction for attendance ${attendanceRow._id} on ${attendanceRow.date}`;
  const existingLop = await HrSalary.findOne({
    colid: Number(attendanceRow.colid),
    empid: text(attendanceRow.employeeemail),
    year: text(attendanceRow.academicyear),
    month: text(attendanceRow.month),
    component: "LOP Deduction",
    comments
  }).lean();
  if (existingLop) return existingLop;

  const salaryRows = await HrSalStructure.find({
    colid: Number(attendanceRow.colid),
    empid: text(attendanceRow.employeeemail),
    level: /^Active$/i
  }).lean();
  if (!salaryRows.length) return null;

  const earningRows = salaryRows.filter((row) => !isDeduction(row.type) && number(row.amount) > 0);
  const baseRows = earningRows.length ? earningRows : salaryRows.filter((row) => number(row.amount) > 0);
  const monthlySalary = baseRows.reduce((sum, row) => sum + number(row.amount), 0);
  const oneDaySalary = Number((monthlySalary / 30).toFixed(2));
  if (oneDaySalary <= 0) return null;

  const first = salaryRows[0] || {};
  return HrSalary.create({
    name: text(attendanceRow.employeename) || text(first.name) || "LOP",
    user: text(approvedByUser) || text(first.user) || text(attendanceRow.employeeemail),
    colid: Number(attendanceRow.colid),
    year: text(attendanceRow.academicyear),
    month: text(attendanceRow.month),
    duedate: attendanceRow.date ? new Date(attendanceRow.date) : undefined,
    structure: text(first.structure),
    structureid: text(first.structureid),
    employee: text(attendanceRow.employeename) || text(first.employee),
    empid: text(attendanceRow.employeeemail),
    component: "LOP Deduction",
    amount: -oneDaySalary,
    type: "Deduction",
    level: "Active",
    paystatus: "Pending",
    status1: "Added",
    comments
  });
};

const salaryBaseRowsFor = async (attendanceRow) => {
  const salaryRows = await HrSalStructure.find({
    colid: Number(attendanceRow.colid),
    empid: text(attendanceRow.employeeemail),
    level: /^Active$/i
  }).lean();
  const earningRows = salaryRows.filter((row) => !isDeduction(row.type) && number(row.amount) > 0);
  return { salaryRows, baseRows: earningRows.length ? earningRows : salaryRows.filter((row) => number(row.amount) > 0) };
};

const dailySalaryFor = async (attendanceRow) => {
  const { salaryRows, baseRows } = await salaryBaseRowsFor(attendanceRow);
  const monthlySalary = baseRows.reduce((sum, row) => sum + number(row.amount), 0);
  return { salaryRows, dailySalary: Number((monthlySalary / 30).toFixed(2)) };
};

const salarySeedFrom = (attendanceRow, salaryRows, approvedByUser) => {
  const first = salaryRows[0] || {};
  return {
    name: text(attendanceRow.employeename) || text(first.name) || "Attendance Adjustment",
    user: text(approvedByUser) || text(first.user) || text(attendanceRow.employeeemail),
    colid: Number(attendanceRow.colid),
    year: text(attendanceRow.academicyear),
    month: text(attendanceRow.month),
    duedate: endOfMonthDate(attendanceRow.date),
    structure: text(first.structure),
    structureid: text(first.structureid),
    employee: text(attendanceRow.employeename) || text(first.employee),
    empid: text(attendanceRow.employeeemail),
    level: "Active",
    paystatus: "Pending",
    status1: "Added"
  };
};

const findRolePolicy = async (Model, colid, role, extra = {}) => Model.findOne({
  colid,
  status: /^Active$/i,
  ...extra,
  $or: [{ role: text(role) }, { role: /^All$/i }]
}).sort({ role: -1, updatedAt: -1 }).lean();

const createLateAndOvertimeAdjustmentsIfRequired = async (attendanceRow, approvedByUser) => {
  if (number(attendanceRow.attendance) !== 1 || attendanceRow.approvalstatus !== "Approved") return null;
  const colid = Number(attendanceRow.colid);
  const employeeemail = text(attendanceRow.employeeemail);
  const role = text(attendanceRow.role) || text((await User.findOne({ colid, $or: [{ email: employeeemail }, { user: employeeemail }] }).select("role").lean())?.role);
  const { salaryRows, dailySalary } = await dailySalaryFor(attendanceRow);
  let lateDeduction = 0;
  let overtimeAmount = 0;
  let overtimeRate = 0;

  if (text(attendanceRow.islate) === "Yes" || text(attendanceRow.isearly) === "Yes") {
    const range = monthRange(attendanceRow.date);
    const lateCount = range ? await HrEmployeeAttendance.countDocuments({
      colid,
      employeeemail,
      academicyear: text(attendanceRow.academicyear),
      month: text(attendanceRow.month),
      attendance: 1,
      approvalstatus: "Approved",
      date: { $gte: range.start, $lte: range.end },
      $or: [{ islate: "Yes" }, { isearly: "Yes" }]
    }) : 1;
    const latePolicy = await findRolePolicy(HrLatePolicy, colid, role, {
      fromdays: { $lte: lateCount },
      todays: { $gte: lateCount }
    });
    const percentage = number(latePolicy?.dailysalarypercentage);
    lateDeduction = Number(((dailySalary * percentage) / 100).toFixed(2));
    if (lateDeduction > 0) {
      const comments = `Late/Early salary deduction for attendance ${attendanceRow._id} on ${attendanceRow.date}`;
      const exists = await HrSalary.findOne({ colid, empid: employeeemail, month: text(attendanceRow.month), year: text(attendanceRow.academicyear), component: "Late Deduction", comments }).lean();
      if (!exists) {
        await HrSalary.create({
          ...salarySeedFrom(attendanceRow, salaryRows, approvedByUser),
          component: "Late Deduction",
          amount: -lateDeduction,
          type: "Deduction",
          comments
        });
      }
    }
  }

  const allocation = await HrShiftAllocation.findOne({ colid, employeeemail, status: /^Active$/i }).sort({ updatedAt: -1 }).lean();
  const outMinutes = timeToMinutes(attendanceRow.outtime);
  const endMinutes = timeToMinutes(allocation?.endtime);
  if (outMinutes !== null && endMinutes !== null && outMinutes > endMinutes) {
    const overtimePolicy = await findRolePolicy(HrOvertimePolicy, colid, role);
    overtimeRate = number(overtimePolicy?.hourlyrate);
    const overtimeHours = Number(((outMinutes - endMinutes) / 60).toFixed(2));
    overtimeAmount = Number((overtimeHours * overtimeRate).toFixed(2));
    if (overtimeAmount > 0) {
      const comments = `Overtime for attendance ${attendanceRow._id} on ${attendanceRow.date}`;
      const exists = await HrSalary.findOne({ colid, empid: employeeemail, month: text(attendanceRow.month), year: text(attendanceRow.academicyear), component: "Overtime", comments }).lean();
      if (!exists) {
        await HrSalary.create({
          ...salarySeedFrom(attendanceRow, salaryRows, approvedByUser),
          component: "Overtime",
          amount: overtimeAmount,
          type: "Earning",
          comments
        });
      }
    }
  }

  attendanceRow.role = role;
  attendanceRow.isovertime = overtimeAmount > 0 ? "Yes" : "No";
  attendanceRow.overtimerate = overtimeRate;
  attendanceRow.latesalarydeduction = lateDeduction;
  attendanceRow.netsalary = Number((overtimeAmount - lateDeduction).toFixed(2));
  await attendanceRow.save();
  return attendanceRow;
};

const buildApprovals = async (colid, department, user) => {
  const matrix = await HrEmployeeAttendanceApprovalMatrix.findOne({
    colid,
    status: "Active",
    $or: [{ department: text(department) }, { department: "" }, { department: { $exists: false } }]
  }).sort({ department: -1, updatedAt: -1 }).lean();

  const levels = matrix?.levels?.length ? matrix.levels : [{ level: 1, approvername: "", approveremail: text(user), approverrole: "Approver" }];
  return levels.sort((a, b) => number(a.level) - number(b.level)).map((item, index) => ({
    level: number(item.level) || index + 1,
    approvername: text(item.approvername),
    approveremail: text(item.approveremail),
    approverrole: text(item.approverrole),
    status: "Pending"
  }));
};

const attendancePayload = async (body, actiontype = "Add") => {
  const colid = Number(body.colid);
  const employeeemail = text(body.employeeemail);
  const user = await User.findOne({ colid, $or: [{ email: employeeemail }, { user: employeeemail }] }).select("name email user department role").lean();
  const attendance = number(body.attendance);
  const approvals = await buildApprovals(colid, user?.department || body.department, body.user);
  const intime = cleanTime(body.intime);
  const outtime = cleanTime(body.outtime);
  const allocation = await HrShiftAllocation.findOne({ colid, employeeemail, status: /^Active$/i }).sort({ updatedAt: -1 }).lean();
  const lateAfter = timeToMinutes(allocation?.lateaftertime);
  const earlyBefore = timeToMinutes(allocation?.earlybeforetime);
  const inMinutes = timeToMinutes(intime);
  const outMinutes = timeToMinutes(outtime);
  return {
    academicyear: text(body.academicyear),
    month: text(body.month),
    date: text(body.date),
    employeename: text(body.employeename || user?.name),
    employeeemail,
    role: text(body.role || user?.role),
    attendance,
    status: attendanceStatus(attendance),
    intime,
    outtime,
    islate: attendance === 1 && inMinutes !== null && lateAfter !== null ? yesNo(inMinutes > lateAfter) : "No",
    isearly: attendance === 1 && outMinutes !== null && earlyBefore !== null ? yesNo(outMinutes < earlyBefore) : "No",
    isovertime: "No",
    overtimerate: 0,
    latesalarydeduction: 0,
    netsalary: 0,
    approvalstatus: "Pending",
    actiontype,
    approvals,
    currentlevel: approvals[0]?.level || 1,
    finalcomment: "",
    colid,
    user: text(body.user)
  };
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const users = await User.find({ colid, role: { $not: /^Student$/i } }).select("name email user phone department role").sort({ name: 1 }).lean();
    const years = await HrEmployeeAttendance.distinct("academicyear", { colid });
    res.json({ success: true, users, years });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAttendance = async (req, res) => {
  try {
    const payload = await attendancePayload(req.body, "Add");
    if (!payload.academicyear || !payload.month || !payload.date || !payload.employeeemail) {
      return res.status(400).json({ success: false, message: "Academic year, month, date and employee are required" });
    }
    const data = await HrEmployeeAttendance.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    ["academicyear", "month", "date", "employeeemail", "approvalstatus", "status"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await HrEmployeeAttendance.find(filter).sort({ date: -1, employeename: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const existing = await HrEmployeeAttendance.findOne({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!existing) return res.status(404).json({ success: false, message: "Attendance record not found" });
    const payload = await attendancePayload(req.body, "Edit");
    Object.assign(existing, payload);
    const data = await existing.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    await HrEmployeeAttendance.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkAttendance = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = readSheet(req.file.buffer);
    const payloads = [];
    for (const row of rows) {
      payloads.push(await attendancePayload({ ...row, colid, user: req.body.user }, "Add"));
    }
    const data = await HrEmployeeAttendance.insertMany(payloads, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createMatrix = async (req, res) => {
  try {
    const payload = {
      name: text(req.body.name) || "Employee Attendance Approval",
      department: text(req.body.department),
      levels: splitLevels(req.body),
      status: text(req.body.status) || "Active",
      colid: Number(req.body.colid),
      user: text(req.body.user)
    };
    const data = await HrEmployeeAttendanceApprovalMatrix.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMatrix = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (text(req.query.status)) filter.status = text(req.query.status);
    const data = await HrEmployeeAttendanceApprovalMatrix.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMatrix = async (req, res) => {
  try {
    const payload = {
      name: text(req.body.name) || "Employee Attendance Approval",
      department: text(req.body.department),
      levels: splitLevels(req.body),
      status: text(req.body.status) || "Active",
      user: text(req.body.user)
    };
    const data = await HrEmployeeAttendanceApprovalMatrix.findOneAndUpdate({ _id: req.body.id, colid: Number(req.body.colid) }, payload, { new: true });
    if (!data) return res.status(404).json({ success: false, message: "Approval matrix not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMatrix = async (req, res) => {
  try {
    await HrEmployeeAttendanceApprovalMatrix.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkMatrix = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = readSheet(req.file.buffer).map((row) => ({
      name: text(row.name) || "Employee Attendance Approval",
      department: text(row.department),
      levels: splitLevels(row),
      status: text(row.status) || "Active",
      colid,
      user: text(req.body.user)
    }));
    const data = await HrEmployeeAttendanceApprovalMatrix.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveAttendance = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const action = text(req.body.action) === "Reject" ? "Rejected" : "Approved";
    const approveremail = text(req.body.approveremail || req.body.user);
    const comment = text(req.body.comment);
    const updated = [];

    for (const id of ids) {
      const item = await HrEmployeeAttendance.findOne({ _id: id, colid: Number(req.body.colid) });
      if (!item) continue;
      const pending = item.approvals.find((approval) => approval.status === "Pending" && (!approval.approveremail || text(approval.approveremail).toLowerCase() === approveremail.toLowerCase()))
        || item.approvals.find((approval) => approval.status === "Pending");
      if (!pending) continue;
      pending.status = action;
      pending.comment = comment;
      pending.actiondate = new Date();
      if (action === "Rejected") {
        item.approvalstatus = "Rejected";
        item.finalcomment = comment;
      } else {
        const next = item.approvals.find((approval) => approval.status === "Pending");
        if (next) {
          item.currentlevel = next.level;
          item.approvalstatus = "Pending";
        } else {
          item.approvalstatus = "Approved";
          item.finalcomment = comment;
        }
      }
      const savedItem = await item.save();
      await addCompensatoryLeaveIfRequired(savedItem);
      await createLopDeductionIfRequired(savedItem, req.body.user);
      await createLateAndOvertimeAdjustmentsIfRequired(savedItem, req.body.user);
      updated.push(savedItem);
    }
    res.json({ success: true, updated: updated.length, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
