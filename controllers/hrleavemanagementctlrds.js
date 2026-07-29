const XLSX = require("xlsx");
const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const LeaveHierarchy = require("../Models/hrleavehierarchyds");
const LeaveType = require("../Models/hrleavetypeds");
const LeaveCycle = require("../Models/hrleavecycleds");
const LeaveBalance = require("../Models/hrleavebalanceds");
const LeaveApplication = require("../Models/hrleaveapplicationds");
const LeaveClassPlan = require("../Models/hrleaveclassplands");
const CompensatoryRule = require("../Models/hrleavecompensatoryruleds");
const WeeklyOff = require("../Models/hrleaveweeklyoffds");
const AccrualRule = require("../Models/hrleaveaccrualruleds");
const NewJoineeRule = require("../Models/hrleavenewjoineeruleds");
const HolidayList = require("../Models/hrleaveholidaylistds");
const VacationMaster = require("../Models/hrleavevacationds");
const VacationPolicy = require("../Models/hrleavevacationpolicyds");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const norm = (value) => text(value).toLowerCase();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const dateDays = (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
};
const datesBetween = (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const rows = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    rows.push(new Date(date).toISOString().slice(0, 10));
  }
  return rows;
};
const datesFromDuration = (from, duration) => {
  const start = new Date(from);
  const days = Math.max(0, Math.ceil(number(duration)));
  if (Number.isNaN(start.getTime()) || days <= 0) return [];
  start.setHours(0, 0, 0, 0);
  const rows = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    rows.push(date.toISOString().slice(0, 10));
  }
  return rows;
};
const datesFromOffsetDuration = (from, offset, duration) => {
  const start = new Date(from);
  const days = Math.max(0, Math.ceil(number(duration)));
  const skip = Math.max(0, Math.floor(number(offset)));
  if (Number.isNaN(start.getTime()) || days <= 0) return [];
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + skip);
  const rows = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    rows.push(date.toISOString().slice(0, 10));
  }
  return rows;
};
const activeRecordFilter = () => ({
  $or: [{ status: /^Active$/i }, { status: { $exists: false } }, { status: "" }, { status: null }]
});
const VACATION_LEAVE_TYPE = "Vacation leave";
const ensureVacationLeaveType = async (colid, user) => {
  await LeaveType.findOneAndUpdate(
    { colid, leavetype: VACATION_LEAVE_TYPE },
    {
      colid,
      leavetype: VACATION_LEAVE_TYPE,
      leavetypecategory: "Non EL",
      code: "VACATION",
      description: "Auto populated vacation leave",
      roles: "All",
      annualquota: 0,
      documentrequired: "No",
      carryforwardcriteria: "None",
      status: "Active",
      user
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};
const readSheet = (buffer) => XLSX.utils.sheet_to_json(XLSX.read(buffer, { type: "buffer" }).Sheets[XLSX.read(buffer, { type: "buffer" }).SheetNames[0]], { defval: "" });
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};
const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
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

const classQuery = (colid, email, fromdate, todate) => ({
  colid,
  facultyemail: email,
  classdate: { $gte: fromdate, $lte: todate }
});

const getAssignedClasses = async (colid, employeeemail, fromdate, todate) => {
  if (!fromdate || !todate || !employeeemail) return [];
  return NepLmsTimetable.find(classQuery(colid, employeeemail, fromdate, todate))
    .sort({ classdate: 1, classtime: 1 })
    .lean();
};

const findLeaveBalance = async (colid, employeeemail, leavetype, cyclename) => {
  const exact = await LeaveBalance.findOne({ colid, employeeemail, leavetype, cyclename });
  if (exact) return exact;
  return LeaveBalance.findOne({ colid, employeeemail, leavetype }).sort({ updatedAt: -1 });
};

const calcCarryForward = (type, unused) => {
  const criteria = text(type.carryforwardcriteria).toLowerCase();
  if (criteria === "full") return unused;
  if (criteria === "max days") return Math.min(unused, number(type.carryforwardmaxdays));
  if (criteria === "percentage") return Number(((unused * number(type.carryforwardpercentage)) / 100).toFixed(2));
  return 0;
};

const queryFrom = (source, fields) => {
  const filter = { colid: Number(source.colid) };
  fields.forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const leaveBalancePayload = (payload = {}) => ({
  ...payload,
  balance: number(payload.openingbalance) + number(payload.carryforward) + number(payload.earned) - number(payload.used)
});

const crud = (Model, fields, required = []) => ({
  create: async (req, res) => {
    try {
      const payload = { colid: Number(req.body.colid), user: text(req.body.user) };
      fields.forEach((field) => { if (Object.prototype.hasOwnProperty.call(req.body, field)) payload[field] = req.body[field]; });
      if (fields.includes("levels")) payload.levels = splitLevels(req.body);
      if (Model === LeaveBalance) Object.assign(payload, leaveBalancePayload(payload));
      required.forEach((field) => {
        if (!text(payload[field])) throw new Error(`${field} is required`);
      });
      const data = await Model.create(payload);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  get: async (req, res) => {
    try {
      const filter = queryFrom(req.query, fields.filter((field) => field !== "levels"));
      if (!filter.colid) return res.status(400).json({ success: false, message: "colid is required" });
      const data = await Model.find(filter).sort({ createdAt: -1 }).lean();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const payload = { user: text(req.body.user) };
      fields.forEach((field) => { if (Object.prototype.hasOwnProperty.call(req.body, field)) payload[field] = req.body[field]; });
      if (fields.includes("levels")) payload.levels = splitLevels(req.body);
      if (Model === LeaveBalance) Object.assign(payload, leaveBalancePayload(payload));
      const data = await Model.findOneAndUpdate({ _id: req.body.id, colid: Number(req.body.colid) }, payload, { new: true, runValidators: true });
      if (!data) return res.status(404).json({ success: false, message: "Record not found" });
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      await Model.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
      res.json({ success: true, message: "Deleted" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  bulk: async (req, res) => {
    try {
      const colid = Number(req.body.colid);
      if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
      const rows = readSheet(req.file.buffer).map((row) => {
        const payload = { colid, user: text(req.body.user) };
        fields.forEach((field) => { if (field !== "levels") payload[field] = row[field] ?? ""; });
        if (fields.includes("levels")) payload.levels = splitLevels(row);
        if (Model === LeaveBalance) Object.assign(payload, leaveBalancePayload(payload));
        return payload;
      });
      const data = await Model.insertMany(rows, { ordered: false });
      res.json({ success: true, inserted: data.length, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

const hierarchyCrud = crud(LeaveHierarchy, ["employeename", "employeeemail", "department", "levels", "status"], ["employeeemail"]);
const typeCrud = crud(LeaveType, ["leavetype", "leavetypecategory", "code", "description", "roles", "annualquota", "documentrequired", "carryforwardcriteria", "carryforwardmaxdays", "carryforwardpercentage", "status"], ["leavetype"]);
const cycleCrud = crud(LeaveCycle, ["cyclename", "resetmonth", "resetday", "status"], ["cyclename"]);
const balanceCrud = crud(LeaveBalance, ["cyclename", "employeename", "employeeemail", "department", "leavetype", "openingbalance", "carryforward", "earned", "used", "balance", "status"], ["employeeemail", "leavetype"]);
const compRuleCrud = crud(CompensatoryRule, ["role", "leavestoadd", "description", "status"], ["role"]);
const weeklyOffCrud = crud(WeeklyOff, ["employeename", "employeeemail", "role", "department", "type", "dayofweek", "dayofmonth", "status"], ["employeeemail", "dayofweek"]);
const accrualRuleCrud = crud(AccrualRule, ["role", "leavetype", "minimumdayspresent", "status"], ["role", "leavetype"]);
const newJoineeRuleCrud = crud(NewJoineeRule, ["role", "leavetype", "coolingoffdays", "status"], ["role", "leavetype"]);
const holidayCrud = crud(HolidayList, ["academicyear", "holidaydate", "holidaytype", "description", "status"], ["academicyear", "holidaydate", "holidaytype"]);
const vacationMasterCrud = crud(VacationMaster, ["academicyear", "role", "vacation", "fromdate", "status"], ["academicyear", "role", "vacation", "fromdate"]);
const vacationPolicyCrud = crud(VacationPolicy, ["academicyear", "role", "vacationid", "vacationtype", "vacation", "component", "componentorder", "fromdate", "durationindays", "minworkingdays", "minworking", "status"], ["academicyear", "role", "vacation", "component", "fromdate"]);

exports.createHierarchy = hierarchyCrud.create;
exports.getHierarchies = hierarchyCrud.get;
exports.updateHierarchy = hierarchyCrud.update;
exports.deleteHierarchy = hierarchyCrud.delete;
exports.bulkHierarchy = hierarchyCrud.bulk;
exports.createType = typeCrud.create;
exports.getTypes = typeCrud.get;
exports.updateType = typeCrud.update;
exports.deleteType = typeCrud.delete;
exports.bulkType = typeCrud.bulk;
exports.createCycle = cycleCrud.create;
exports.getCycles = cycleCrud.get;
exports.updateCycle = cycleCrud.update;
exports.deleteCycle = cycleCrud.delete;
exports.bulkCycle = cycleCrud.bulk;
exports.createBalance = balanceCrud.create;
exports.getBalances = balanceCrud.get;
exports.updateBalance = balanceCrud.update;
exports.deleteBalance = balanceCrud.delete;
exports.bulkBalance = balanceCrud.bulk;
exports.createCompRule = compRuleCrud.create;
exports.getCompRules = compRuleCrud.get;
exports.updateCompRule = compRuleCrud.update;
exports.deleteCompRule = compRuleCrud.delete;
exports.bulkCompRule = compRuleCrud.bulk;
exports.createWeeklyOff = weeklyOffCrud.create;
exports.getWeeklyOff = weeklyOffCrud.get;
exports.updateWeeklyOff = weeklyOffCrud.update;
exports.deleteWeeklyOff = weeklyOffCrud.delete;
exports.bulkWeeklyOff = weeklyOffCrud.bulk;
exports.bulkDeleteWeeklyOff = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one weekly off record" });
    const data = await WeeklyOff.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: data.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.createAccrualRule = accrualRuleCrud.create;
exports.getAccrualRules = accrualRuleCrud.get;
exports.updateAccrualRule = accrualRuleCrud.update;
exports.deleteAccrualRule = accrualRuleCrud.delete;
exports.bulkAccrualRule = accrualRuleCrud.bulk;
exports.createNewJoineeRule = newJoineeRuleCrud.create;
exports.getNewJoineeRules = newJoineeRuleCrud.get;
exports.updateNewJoineeRule = newJoineeRuleCrud.update;
exports.deleteNewJoineeRule = newJoineeRuleCrud.delete;
exports.bulkNewJoineeRule = newJoineeRuleCrud.bulk;
exports.createHoliday = holidayCrud.create;
exports.getHolidays = holidayCrud.get;
exports.updateHoliday = holidayCrud.update;
exports.deleteHoliday = holidayCrud.delete;
exports.bulkHoliday = holidayCrud.bulk;
exports.createVacationMaster = vacationMasterCrud.create;
exports.getVacationMasters = vacationMasterCrud.get;
exports.updateVacationMaster = vacationMasterCrud.update;
exports.deleteVacationMaster = vacationMasterCrud.delete;
exports.bulkVacationMaster = vacationMasterCrud.bulk;
exports.getVacationPolicies = vacationPolicyCrud.get;
exports.deleteVacationPolicy = vacationPolicyCrud.delete;

const hydrateVacationComponentPayload = async (payload, colid) => {
  const vacationid = text(payload.vacationid);
  if (!vacationid) return payload;
  const vacation = await VacationMaster.findOne({ _id: vacationid, colid }).lean();
  if (!vacation) throw new Error("Selected vacation not found");
  return {
    ...payload,
    vacationid,
    academicyear: text(vacation.academicyear),
    role: text(vacation.role),
    vacation: text(vacation.vacation),
    fromdate: text(vacation.fromdate)
  };
};

exports.createVacationPolicy = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const payload = await hydrateVacationComponentPayload({ colid, user: text(req.body.user) }, colid);
    ["academicyear", "role", "vacationid", "vacationtype", "vacation", "component", "componentorder", "fromdate", "durationindays", "minworkingdays", "minworking", "status"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) payload[field] = req.body[field];
    });
    const data = await VacationPolicy.create(await hydrateVacationComponentPayload(payload, colid));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateVacationPolicy = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const payload = { user: text(req.body.user) };
    ["academicyear", "role", "vacationid", "vacationtype", "vacation", "component", "componentorder", "fromdate", "durationindays", "minworkingdays", "minworking", "status"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) payload[field] = req.body[field];
    });
    const data = await VacationPolicy.findOneAndUpdate({ _id: req.body.id, colid }, await hydrateVacationComponentPayload(payload, colid), { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkVacationPolicy = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const rows = [];
    for (const row of readSheet(req.file.buffer)) {
      rows.push(await hydrateVacationComponentPayload({
        colid,
        user: text(req.body.user),
        vacationid: row.vacationid ?? "",
        vacationtype: row.vacationtype ?? "full",
        component: row.component ?? "",
        componentorder: row.componentorder ?? 1,
        durationindays: row.durationindays ?? 1,
        minworkingdays: row.minworkingdays ?? row.minworking ?? 0,
        status: row.status ?? "Active",
        academicyear: row.academicyear ?? "",
        role: row.role ?? "",
        vacation: row.vacation ?? "",
        fromdate: row.fromdate ?? ""
      }, colid));
    }
    const data = await VacationPolicy.insertMany(rows, { ordered: false });
    res.json({ success: true, inserted: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const ensureCompensatoryLeaveType = async (colid, user = "") => {
  if (!colid) return null;
  return LeaveType.findOneAndUpdate(
    { colid, leavetype: "Compensatory Leave" },
    {
      colid,
      leavetype: "Compensatory Leave",
      leavetypecategory: "Non EL",
      code: "COMP",
      description: "Auto earned for working on weekly off days or holidays.",
      roles: "All",
      annualquota: 0,
      documentrequired: "No",
      carryforwardcriteria: "None",
      status: "Active",
      user
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    await ensureCompensatoryLeaveType(colid, req.query.user);
    const users = await User.find({
      colid,
      $or: [
        { role: { $exists: false } },
        { role: { $not: /^Student$/i } }
      ]
    }).select("name email phone department role user").sort({ name: 1 }).lean();
    const types = await LeaveType.find({ colid, status: "Active" }).sort({ leavetype: 1 }).lean();
    const cycles = await LeaveCycle.find({ colid, status: "Active" }).sort({ cyclename: -1 }).lean();
    res.json({ success: true, users, types, cycles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveWeeklyOffMany = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const dayofweek = text(req.body.dayofweek);
    const type = text(req.body.type) || "every";
    const dayofmonth = number(req.body.dayofmonth);
    const user = text(req.body.user);
    const employeeemails = Array.isArray(req.body.employeeemails) ? req.body.employeeemails.map(text).filter(Boolean) : [];
    if (!colid || !dayofweek || !employeeemails.length) {
      return res.status(400).json({ success: false, message: "Select day of week and at least one employee" });
    }
    const users = await User.find({ colid, $or: [{ email: { $in: employeeemails } }, { user: { $in: employeeemails } }] }).select("name email user department role").lean();
    let saved = 0;
    for (const employee of users) {
      const employeeemail = text(employee.email || employee.user);
      if (!employeeemail) continue;
      await WeeklyOff.findOneAndUpdate(
        { colid, employeeemail, type, dayofweek, dayofmonth },
        {
          colid,
          employeeemail,
          employeename: text(employee.name),
          role: text(employee.role),
          department: text(employee.department),
          type,
          dayofweek,
          dayofmonth,
          status: "Active",
          user
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const employmentDurationFromJoining = (joiningdate, targetdate) => {
  const join = new Date(joiningdate);
  const target = new Date(targetdate || Date.now());
  if (Number.isNaN(join.getTime()) || Number.isNaN(target.getTime()) || target < join) {
    return { days: 0, months: 0 };
  }
  join.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const days = Math.floor((target - join) / 86400000) + 1;
  const months = Number((days / 30.4375).toFixed(2));
  return { days, months };
};

exports.populateVacation = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const policyId = text(req.body.policyid || req.body.id);
    const employeeids = Array.isArray(req.body.employeeids) ? req.body.employeeids.map(text).filter(Boolean) : [];
    const employeeemails = Array.isArray(req.body.employeeemails) ? req.body.employeeemails.map(text).filter(Boolean) : [];
    if (!colid || !policyId || (!employeeids.length && !employeeemails.length)) {
      return res.status(400).json({ success: false, message: "Select vacation policy and at least one employee" });
    }
    const activeFilter = activeRecordFilter();
    let policy = await VacationMaster.findOne({ _id: policyId, colid, ...activeFilter }).lean();
    let groupFilter = { colid, vacationid: policyId, ...activeFilter };
    if (!policy) {
      const componentPolicy = await VacationPolicy.findOne({ _id: policyId, colid, ...activeFilter }).lean();
      if (!componentPolicy) return res.status(404).json({ success: false, message: "Active vacation not found" });
      policy = {
        _id: componentPolicy.vacationid || componentPolicy._id,
        academicyear: componentPolicy.academicyear,
        role: componentPolicy.role,
        vacation: componentPolicy.vacation,
        fromdate: componentPolicy.fromdate
      };
      groupFilter = componentPolicy.vacationid
        ? { colid, vacationid: text(componentPolicy.vacationid), ...activeFilter }
        : {
            colid,
            academicyear: text(componentPolicy.academicyear),
            role: text(componentPolicy.role),
            vacation: text(componentPolicy.vacation),
            fromdate: text(componentPolicy.fromdate),
            ...activeFilter
          };
    }
    const components = (await VacationPolicy.find(groupFilter).lean()).sort((first, second) => {
      const orderDiff = (number(first.componentorder) || 0) - (number(second.componentorder) || 0);
      if (orderDiff) return orderDiff;
      return new Date(first.createdAt || 0) - new Date(second.createdAt || 0);
    });
    if (!components.length) return res.status(404).json({ success: false, message: "No active vacation components found" });
    const validStart = datesFromDuration(policy.fromdate, 1);
    if (!validStart.length) return res.status(400).json({ success: false, message: "Policy start date or duration is invalid" });
    await ensureVacationLeaveType(colid, text(req.body.user));
    const validEmployeeIds = employeeids.filter((item) => /^[a-f0-9]{24}$/i.test(item));
    const selectedIdSet = new Set(validEmployeeIds.map((item) => item.toLowerCase()));
    const selectedEmailSet = new Set(employeeemails.map((item) => item.toLowerCase()));
    const userSelectors = [];
    if (validEmployeeIds.length) userSelectors.push({ _id: { $in: validEmployeeIds } });
    if (employeeemails.length) userSelectors.push({ email: { $in: employeeemails } }, { user: { $in: employeeemails } });
    if (!userSelectors.length) return res.status(400).json({ success: false, message: "Selected employee identifiers are invalid" });
    const users = (await User.find({ colid, $or: userSelectors }).select("name email user department role joiningdate").lean())
      .filter((employee) => {
        const id = text(employee._id).toLowerCase();
        const email = text(employee.email).toLowerCase();
        const userValue = text(employee.user).toLowerCase();
        return selectedIdSet.has(id) || selectedEmailSet.has(email) || selectedEmailSet.has(userValue);
      });
    if (!users.length) return res.status(404).json({ success: false, message: "Selected employee was not found" });
    const results = [];
    for (const employee of users) {
      const employeeemail = text(employee.email || employee.user);
      const employmentDuration = employmentDurationFromJoining(employee.joiningdate, policy.fromdate);
      let cursor = 0;
      for (const componentPolicy of components) {
        const policyRole = text(policy.role);
        const roleMismatch = policyRole && norm(policyRole) !== "all" && norm(employee.role) !== norm(policyRole);
        const isHalf = text(componentPolicy.vacationtype).toLowerCase() === "half";
        const dayValue = isHalf ? 0.5 : 1;
        const componentDuration = number(componentPolicy.durationindays) || 1;
        const minWorkingDays = number(componentPolicy.minworkingdays || componentPolicy.minworking);
        const eligibleRatio = minWorkingDays > 0 ? Math.min(1, employmentDuration.days / minWorkingDays) : 1;
        const dateCount = roleMismatch ? 0 : (eligibleRatio >= 1 ? componentDuration : Math.max(0, Math.ceil(componentDuration * eligibleRatio)));
        const allowedDates = datesFromOffsetDuration(policy.fromdate, cursor, dateCount);
        cursor += dateCount;
        let inserted = 0;
        let status = roleMismatch ? "Skipped: role does not match vacation policy" : "Not eligible";
        if (allowedDates.length) {
          const fromdate = allowedDates[0];
          const todate = allowedDates[allowedDates.length - 1];
          const exists = await LeaveApplication.findOne({
            colid,
            employeeemail,
            source: "Vacation",
            leavetype: VACATION_LEAVE_TYPE,
            component: text(componentPolicy.component),
            status: "Approved",
            fromdate: { $lte: todate },
            todate: { $gte: fromdate }
          }).lean();
          if (!exists) {
            await LeaveApplication.create({
              cyclename: text(policy.academicyear),
              employeename: text(employee.name),
              employeeemail,
              department: text(employee.department),
              leavetype: VACATION_LEAVE_TYPE,
              fromdate,
              todate,
              days: Number((allowedDates.length * dayValue).toFixed(2)),
              vacationtype: isHalf ? "half" : "full",
              component: text(componentPolicy.component),
              source: "Vacation",
              reason: `${text(policy.vacation)} - ${text(componentPolicy.component)}`,
              employeecomment: `Vacation: ${text(policy.vacation)}; component: ${text(componentPolicy.component)}; order: ${number(componentPolicy.componentorder) || 1}; joining date: ${employee.joiningdate ? new Date(employee.joiningdate).toISOString().slice(0, 10) : "Not set"}; employment duration: ${employmentDuration.months} months (${employmentDuration.days} days); min working days: ${minWorkingDays || "Not set"}; component duration: ${componentDuration}`,
              approvals: [],
              currentlevel: 0,
              balancededucted: false,
              status: "Approved",
              finalcomment: `Auto approved vacation ${text(policy.vacation)} (${policyId})`,
              colid,
              user: text(req.body.user)
            });
            inserted = 1;
            status = "Inserted";
          } else {
            status = "Already exists";
          }
        }
        results.push({
          employee: text(employee.name),
          employeeemail,
          vacation: text(policy.vacation),
          component: text(componentPolicy.component),
          componentorder: number(componentPolicy.componentorder) || 1,
          vacationtype: isHalf ? "Half" : "Full",
          joiningdate: employee.joiningdate ? new Date(employee.joiningdate).toISOString().slice(0, 10) : "",
          employmentdays: employmentDuration.days,
          employmentmonths: employmentDuration.months,
          minworkingdays: minWorkingDays,
          componentduration: componentDuration,
          eligibleRatio,
          eligibleDates: allowedDates.length,
          fromdate: allowedDates[0] || "",
          todate: allowedDates[allowedDates.length - 1] || "",
          inserted,
          status
        });
      }
    }
    res.json({ success: true, results, inserted: results.reduce((sum, item) => sum + item.inserted, 0) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkClasses = async (req, res) => {
  try {
    const data = await getAssignedClasses(Number(req.query.colid), text(req.query.employeeemail), text(req.query.fromdate), text(req.query.todate));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadLeaveDocument = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });

    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }

    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const cleanUser = text(req.body.user).replace(/[^\w.\-()@ ]/g, "_") || "user";
    const key = `${colid}/hr-leave/${cleanUser}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({
      accessKeyId: config.username,
      secretAccessKey: config.password,
      region: config.region
    });

    await s3.putObject({
      Bucket: config.bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }).promise();

    res.json({
      success: true,
      url: s3Url(config.bucket, config.region, key),
      key,
      bucket: config.bucket,
      region: config.region,
      originalname: req.file.originalname
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const ruleMatches = (ruleValue, actualValue) => {
  const rule = text(ruleValue).toLowerCase();
  const actual = text(actualValue).toLowerCase();
  return rule === "all" || rule === actual;
};

const findNewJoineeRule = async (colid, role, leavetype) => {
  const rules = await NewJoineeRule.find({ colid, status: /^Active$/i }).lean();
  const ranked = rules
    .filter((rule) => ruleMatches(rule.role, role) && ruleMatches(rule.leavetype, leavetype))
    .map((rule) => ({
      rule,
      score: (text(rule.role).toLowerCase() === text(role).toLowerCase() ? 2 : 0)
        + (text(rule.leavetype).toLowerCase() === text(leavetype).toLowerCase() ? 2 : 0)
    }))
    .sort((a, b) => b.score - a.score || number(b.rule.coolingoffdays) - number(a.rule.coolingoffdays));
  return ranked[0]?.rule || null;
};

const daysSinceJoiningDate = (joiningdate, targetdate) => {
  const join = new Date(joiningdate);
  const target = new Date(targetdate);
  if (Number.isNaN(join.getTime()) || Number.isNaN(target.getTime())) return null;
  join.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target - join) / 86400000);
};

exports.applyLeave = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const employeeemail = text(req.body.employeeemail || req.body.user);
    const days = dateDays(req.body.fromdate, req.body.todate);
    if (!days) return res.status(400).json({ success: false, message: "Valid from and to date are required" });
    const employee = await User.findOne({
      colid,
      $or: [{ email: employeeemail }, { user: employeeemail }]
    }).select("name email user role department joiningdate").lean();
    const newJoineeRule = await findNewJoineeRule(colid, employee?.role || req.body.role, req.body.leavetype);
    if (newJoineeRule && number(newJoineeRule.coolingoffdays) > 0) {
      const completedDays = daysSinceJoiningDate(employee?.joiningdate, req.body.fromdate);
      if (completedDays === null || completedDays < number(newJoineeRule.coolingoffdays)) {
        return res.status(400).json({
          success: false,
          message: "Leave is not allowed. Cooling off period is not completed."
        });
      }
    }
    const overlappingLeave = await LeaveApplication.findOne({
      colid,
      employeeemail,
      status: { $in: ["Applied", "In Approval", "Approved"] },
      fromdate: { $lte: text(req.body.todate) },
      todate: { $gte: text(req.body.fromdate) }
    }).lean();
    if (overlappingLeave) {
      return res.status(400).json({
        success: false,
        message: `Leave application already exists with status ${overlappingLeave.status} from ${overlappingLeave.fromdate} to ${overlappingLeave.todate}. New leave cannot overlap fully or partially.`
      });
    }
    const balance = await findLeaveBalance(colid, employeeemail, text(req.body.leavetype), text(req.body.cyclename));
    if (!balance || number(balance.balance) < days) return res.status(400).json({ success: false, message: "Insufficient leave balance" });
    const hierarchy = await LeaveHierarchy.findOne({ colid, employeeemail, status: "Active" }).lean();
    if (!hierarchy?.levels?.length) return res.status(400).json({ success: false, message: "Approval hierarchy not configured" });
    const classes = await getAssignedClasses(colid, employeeemail, text(req.body.fromdate), text(req.body.todate));
    const requestedPlans = Array.isArray(req.body.classplans) ? req.body.classplans : [];
    const planByClassId = new Map(requestedPlans.map((item) => [text(item.timetableid || item.classid || item._id), text(item.alternateplan)]));
    const missingPlans = classes.filter((item) => !planByClassId.get(text(item._id)));
    if (missingPlans.length) {
      return res.status(400).json({ success: false, message: "Select every assigned class and enter alternate plan for each class" });
    }
    const approvals = hierarchy.levels.sort((a, b) => number(a.level) - number(b.level)).map((level) => ({ ...level, status: "Pending" }));
    balance.used = number(balance.used) + days;
    balance.balance = number(balance.balance) - days;
    await balance.save();
    const data = await LeaveApplication.create({
      cyclename: text(req.body.cyclename),
      employeename: text(req.body.employeename || hierarchy.employeename),
      employeeemail,
      department: text(req.body.department || hierarchy.department),
      leavetype: text(req.body.leavetype),
      fromdate: text(req.body.fromdate),
      todate: text(req.body.todate),
      days,
      reason: text(req.body.reason),
      employeecomment: text(req.body.employeecomment),
      documentlink: text(req.body.documentlink),
      classes,
      approvals,
      currentlevel: approvals[0]?.level || 1,
      balancededucted: true,
      status: "Applied",
      colid,
      user: text(req.body.user)
    });
    if (classes.length) {
      await LeaveClassPlan.insertMany(classes.map((item) => ({
        leaveapplicationid: data._id,
        timetableid: item._id,
        academicyear: text(item.academicyear),
        regulation: text(item.regulation),
        program: text(item.program),
        programcode: text(item.programcode),
        major: text(item.major),
        semester: text(item.semester),
        course: text(item.course),
        coursecode: text(item.coursecode),
        classdate: text(item.classdate),
        classtime: text(item.classtime),
        period: text(item.period),
        topic: text(item.topic),
        faculty: text(item.faculty),
        facultyemail: text(item.facultyemail),
        alternateplan: planByClassId.get(text(item._id)),
        colid,
        user: text(req.body.user)
      })));
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getApplications = async (req, res) => {
  try {
    const filter = queryFrom(req.query, ["cyclename", "employeeemail", "leavetype", "status", "department"]);
    const approveremail = text(req.query.approveremail);
    if (approveremail) filter["approvals.approveremail"] = approveremail;
    const data = await LeaveApplication.find(filter).sort({ createdAt: -1 }).lean();
    const ids = data.map((item) => item._id);
    const plans = ids.length ? await LeaveClassPlan.find({ colid: Number(req.query.colid), leaveapplicationid: { $in: ids } }).sort({ classdate: 1, classtime: 1 }).lean() : [];
    const plansByApplication = plans.reduce((map, item) => {
      const key = text(item.leaveapplicationid);
      if (!map[key]) map[key] = [];
      map[key].push(item);
      return map;
    }, {});
    res.json({ success: true, data: data.map((item) => ({ ...item, classplans: plansByApplication[text(item._id)] || [] })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteApplications = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.map(text).filter(Boolean)
      : [text(req.body.id)].filter(Boolean);
    if (!colid || !ids.length) {
      return res.status(400).json({ success: false, message: "colid and leave application id are required" });
    }
    const applications = await LeaveApplication.find({ _id: { $in: ids }, colid });
    let restored = 0;
    for (const app of applications) {
      if (app.balancededucted) {
        const balance = await findLeaveBalance(app.colid, app.employeeemail, app.leavetype, app.cyclename);
        if (balance) {
          balance.used = Math.max(0, number(balance.used) - number(app.days));
          balance.balance = number(balance.balance) + number(app.days);
          await balance.save();
          restored += 1;
        }
      }
    }
    await LeaveClassPlan.deleteMany({ colid, leaveapplicationid: { $in: applications.map((item) => item._id) } });
    const deleted = await LeaveApplication.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: deleted.deletedCount || 0, restored });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveLeave = async (req, res) => {
  try {
    const app = await LeaveApplication.findOne({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!app) return res.status(404).json({ success: false, message: "Leave application not found" });
    const approveremail = text(req.body.approveremail || req.body.user);
    const approval = app.approvals.find((item) => text(item.approveremail).toLowerCase() === approveremail.toLowerCase() && item.status === "Pending");
    if (!approval) return res.status(403).json({ success: false, message: "No pending approval found for this user" });
    approval.status = text(req.body.action) === "Reject" ? "Rejected" : "Approved";
    approval.comment = text(req.body.comment);
    approval.actiondate = new Date();
    if (approval.status === "Rejected") {
      const balance = await findLeaveBalance(app.colid, app.employeeemail, app.leavetype, app.cyclename);
      if (app.balancededucted && balance) {
        balance.used = Math.max(0, number(balance.used) - number(app.days));
        balance.balance = number(balance.balance) + number(app.days);
        await balance.save();
        app.balancededucted = false;
      }
      app.status = "Rejected";
      app.finalcomment = text(req.body.comment);
    } else {
      const next = app.approvals.find((item) => item.status === "Pending");
      if (next) {
        app.currentlevel = next.level;
        app.status = "In Approval";
      } else {
        if (!app.balancededucted) {
          const balance = await findLeaveBalance(app.colid, app.employeeemail, app.leavetype, app.cyclename);
          if (!balance || number(balance.balance) < number(app.days)) return res.status(400).json({ success: false, message: "Insufficient leave balance at final approval" });
          balance.used = number(balance.used) + number(app.days);
          balance.balance = number(balance.balance) - number(app.days);
          await balance.save();
          app.balancededucted = true;
        }
        app.status = "Approved";
        app.finalcomment = text(req.body.comment);
      }
    }
    const data = await app.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.resetLeaves = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const cyclename = text(req.body.cyclename);
    const balances = await LeaveBalance.find({ colid, ...(cyclename ? { cyclename } : {}) });
    const types = await LeaveType.find({ colid }).lean();
    const typeMap = new Map(types.map((item) => [item.leavetype, item]));
    for (const balance of balances) {
      const type = typeMap.get(balance.leavetype) || {};
      const unused = Math.max(0, number(balance.balance));
      const carry = calcCarryForward(type, unused);
      const isElLeave = text(type.leavetypecategory).toLowerCase() === "el";
      balance.carryforward = carry;
      balance.openingbalance = isElLeave ? carry : number(type.annualquota) + carry;
      balance.earned = isElLeave ? 0 : number(type.annualquota);
      balance.used = 0;
      balance.balance = isElLeave ? carry : number(type.annualquota) + carry;
      await balance.save();
    }
    res.json({ success: true, updated: balances.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const employeeemail = text(req.query.employeeemail || req.query.user);
    const cyclename = text(req.query.cyclename);
    const cycleFilter = cyclename ? { cyclename } : {};
    const balances = await LeaveBalance.find({ colid, employeeemail, ...cycleFilter }).sort({ leavetype: 1 }).lean();
    const applications = await LeaveApplication.find({ colid, employeeemail, ...cycleFilter }).sort({ fromdate: 1 }).lean();
    const monthwise = {};
    applications.filter((item) => item.status === "Approved").forEach((item) => {
      const month = text(item.fromdate).slice(0, 7);
      monthwise[month] = (monthwise[month] || 0) + number(item.days);
    });
    const applied = applications.filter((item) => item.status === "Applied").length;
    const inApproval = applications.filter((item) => item.status === "In Approval").length;
    const approved = applications.filter((item) => item.status === "Approved").length;
    const rejected = applications.filter((item) => item.status === "Rejected").length;
    res.json({
      success: true,
      balances,
      applications,
      monthwise: Object.entries(monthwise).map(([month, days]) => ({ month, days })),
      applied,
      approved,
      rejected,
      inApproval,
      pending: applied + inApproval,
      statusSummary: [
        { status: "Applied", count: applied },
        { status: "In Approval", count: inApproval },
        { status: "Approved", count: approved },
        { status: "Rejected", count: rejected }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.hrDashboard = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const employeeemail = text(req.query.employeeemail || req.query.user);
    const cyclename = text(req.query.cyclename);
    if (!colid || !employeeemail) return res.status(400).json({ success: false, message: "colid and employee are required" });

    const cycleFilter = cyclename ? { cyclename } : {};
    const employee = await User.findOne({ colid, $or: [{ email: employeeemail }, { user: employeeemail }] }).select("name email user phone department role").lean();
    const balances = await LeaveBalance.find({ colid, employeeemail, ...cycleFilter }).sort({ leavetype: 1 }).lean();
    const applications = await LeaveApplication.find({ colid, employeeemail, ...cycleFilter }).sort({ fromdate: 1 }).lean();
    const types = await LeaveType.find({ colid }).lean();
    const typeMap = new Map(types.map((item) => [text(item.leavetype).toLowerCase(), item]));

    const balancesWithCarry = balances.map((item) => {
      const available = number(item.balance);
      const type = typeMap.get(text(item.leavetype).toLowerCase()) || {};
      return {
        ...item,
        eligiblecarryforward: calcCarryForward(type, Math.max(0, available)),
        carryforwardcriteria: type.carryforwardcriteria || "None",
        annualquota: number(type.annualquota)
      };
    });

    const monthwiseMap = {};
    const statusMap = {};
    const typeTakenMap = {};
    applications.forEach((item) => {
      statusMap[item.status || "Blank"] = (statusMap[item.status || "Blank"] || 0) + 1;
      if (item.status === "Approved") {
        const month = text(item.fromdate).slice(0, 7) || "No date";
        monthwiseMap[month] = (monthwiseMap[month] || 0) + number(item.days);
        typeTakenMap[item.leavetype || "Blank"] = (typeTakenMap[item.leavetype || "Blank"] || 0) + number(item.days);
      }
    });

    const totals = balancesWithCarry.reduce((acc, item) => {
      acc.openingbalance += number(item.openingbalance);
      acc.carryforward += number(item.carryforward);
      acc.earned += number(item.earned);
      acc.used += number(item.used);
      acc.balance += number(item.balance);
      acc.eligiblecarryforward += number(item.eligiblecarryforward);
      return acc;
    }, { openingbalance: 0, carryforward: 0, earned: 0, used: 0, balance: 0, eligiblecarryforward: 0 });

    res.json({
      success: true,
      employee,
      balances: balancesWithCarry,
      applications,
      totals,
      monthwise: Object.entries(monthwiseMap).map(([month, days]) => ({ month, days })).sort((a, b) => a.month.localeCompare(b.month)),
      statusSummary: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
      typeTaken: Object.entries(typeTakenMap).map(([leavetype, days]) => ({ leavetype, days }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
