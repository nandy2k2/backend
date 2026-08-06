const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const CulturalActivity = require("../Models/mentoringculturalactivityds");
const SportsActivity = require("../Models/mentoringsportsactivityds");
const HrLeaveApplication = require("../Models/hrleaveapplicationds");
const HrSalary = require("../Models/hrsalary");
const HrAttendance = require("../Models/hremployeeattendanceds");
const AssetItem = require("../Models/assetnewitemds");
const AssetTracking = require("../Models/assetnewtrackingds");
const AssetRetirement = require("../Models/assetnewretirementds");
const PurchaseNewIndent = require("../Models/purchasenewindentds");
const PurchaseNewRfp = require("../Models/purchasenewrfpds");
const PurchaseNewPo = require("../Models/purchasenewpurchaseorderds");
const PurchaseNewInvoice = require("../Models/purchasenewinvoiceds");
const StoreReq = require("../Models/storerequisationds2");
const StorePr = require("../Models/storeprrequestds2");
const StorePo = require("../Models/storepoorderds2");
const StorePoItem = require("../Models/storepoitemsds2");
const StoreGatePass = require("../Models/storegatepassds2");
const StoreQc = require("../Models/storequalitycheckds2");
const StoreGrn = require("../Models/grnds2");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const rx = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const monthKey = (value) => {
  if (!value) return "No date";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 7);
  return text(value).slice(0, 7) || "No date";
};
const dateInRange = (field, from, to) => {
  const query = {};
  if (from) query.$gte = from;
  if (to) query.$lte = to;
  return Object.keys(query).length ? { [field]: query } : {};
};
const dateObjInRange = (field, from, to) => {
  const query = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) query.$gte = start;
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      query.$lte = end;
    }
  }
  return Object.keys(query).length ? { [field]: query } : {};
};
const getInstitution = (colid) => Institution.findOne({ colid }).sort({ _id: -1 }).lean();
const unique = (rows, field) => [...new Set(rows.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

function groupRows(rows, keyFn, valueFn = () => 1, labelName = "label", valueName = "count") {
  const map = new Map();
  rows.forEach((row) => {
    const label = text(keyFn(row)) || "Not specified";
    map.set(label, (map.get(label) || 0) + num(valueFn(row)));
  });
  return [...map.entries()].map(([label, value], index) => ({ id: `${label}-${index}`, [labelName]: label, [valueName]: value }))
    .sort((a, b) => num(b[valueName]) - num(a[valueName]));
}

const activityTypes = {
  cultural: ["Dance", "Music", "Drama", "Debate", "Quiz", "Fine Arts", "Photography", "Literary", "Fashion Show", "Cultural Fest", "Community Art", "Other"],
  sports: ["Cricket", "Football", "Basketball", "Volleyball", "Badminton", "Table Tennis", "Athletics", "Chess", "Swimming", "Kabaddi", "Kho Kho", "Yoga", "Other"]
};
const prizes = ["First", "Second", "Third", "Other", "NA"];

const activityModel = (kind) => kind === "sports" ? SportsActivity : CulturalActivity;

function activityPayload(row = {}, defaults = {}) {
  return {
    colid: toNumber(row.colid ?? defaults.colid),
    academicyear: text(row.academicyear),
    program: text(row.program),
    programcode: text(row.programcode),
    student: text(row.student || row.name),
    regno: text(row.regno),
    activitytype: text(row.activitytype || row.type),
    activitydate: text(row.activitydate),
    activityname: text(row.activityname),
    venue: text(row.venue),
    location: text(row.location),
    prizewon: text(row.prizewon) || "NA",
    source: text(row.source || defaults.source) || "Admin",
    status: text(row.status) || "Active",
    user: text(row.user || defaults.user)
  };
}

exports.activityOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const studentQuery = { role: /^Student$/i };
    if (colid !== undefined) studentQuery.colid = colid;
    const [students, years] = await Promise.all([
      User.find(studentQuery).select("name email phone regno program programcode academicyear regulation semester section Major Minor IDC photo").sort({ name: 1 }).limit(5000).lean(),
      User.distinct("academicyear", studentQuery)
    ]);
    res.json({ success: true, students, years, culturalTypes: activityTypes.cultural, sportsTypes: activityTypes.sports, prizes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listActivities = (kind) => async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const query = {};
    if (colid !== undefined) query.colid = colid;
    ["academicyear", "program", "programcode", "regno", "activitytype", "activityname", "venue", "location", "prizewon", "status", "source"].forEach((field) => {
      if (req.query[field]) query[field] = rx(req.query[field]);
    });
    Object.assign(query, dateInRange("activitydate", req.query.fromdate, req.query.todate));
    const data = await activityModel(kind).find(query).sort({ activitydate: -1, createdAt: -1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveActivity = (kind) => async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [req.body];
    const payloads = rows.map((row) => activityPayload(row, req.body)).filter((row) => row.colid !== undefined && row.regno);
    if (!payloads.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const Model = activityModel(kind);
    const data = [];
    for (const payload of payloads) {
      if (payload._id) data.push(await Model.findByIdAndUpdate(payload._id, payload, { new: true }));
      else data.push(await Model.create(payload));
    }
    res.json({ success: true, saved: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteActivities = (kind) => async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await activityModel(kind).deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkActivities = (kind) => async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const payloads = rows.map((row) => activityPayload(row, req.body)).filter((row) => row.colid !== undefined && row.regno);
    const data = payloads.length ? await activityModel(kind).insertMany(payloads, { ordered: false }) : [];
    res.json({ success: true, saved: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentActivities = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const regno = text(req.query.regno);
    const query = {};
    if (colid !== undefined) query.colid = colid;
    if (regno) query.regno = new RegExp(`^${regno.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const [cultural, sports] = await Promise.all([
      CulturalActivity.find(query).sort({ activitydate: -1 }).lean(),
      SportsActivity.find(query).sort({ activitydate: -1 }).lean()
    ]);
    res.json({ success: true, cultural, sports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.activityDashboard = (kind) => async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const query = {};
    if (colid !== undefined) query.colid = colid;
    if (req.query.academicyear) query.academicyear = text(req.query.academicyear);
    ["program", "programcode", "activitytype", "prizewon"].forEach((field) => {
      if (req.query[field]) query[field] = rx(req.query[field]);
    });
    const [rows, institution] = await Promise.all([
      activityModel(kind).find(query).sort({ activitydate: -1 }).lean(),
      getInstitution(colid)
    ]);
    const studentCount = new Set(rows.map((row) => text(row.regno)).filter(Boolean)).size;
    const winners = rows.filter((row) => !/^NA$/i.test(text(row.prizewon))).length;
    const categorywise = groupRows(rows, (row) => row.activitytype);
    const programwise = groupRows(rows, (row) => row.programcode || row.program);
    const monthwise = groupRows(rows, (row) => monthKey(row.activitydate));
    const categoryProgram = groupRows(rows, (row) => `${text(row.activitytype) || "Not specified"} / ${text(row.programcode || row.program) || "Not specified"}`);
    res.json({
      success: true,
      data: {
        institution: institution || {},
        cards: [
          { key: "activities", label: "Total activities", value: rows.length, tone: "#2563eb" },
          { key: "students", label: "Participating students", value: studentCount, tone: "#16a34a" },
          { key: "winners", label: "Prize records", value: winners, tone: "#ea580c" },
          { key: "categories", label: "Categories", value: categorywise.length, tone: "#7c3aed" }
        ],
        charts: { monthwise, programwise, categorywise, categoryProgram },
        table: rows.map((row) => ({ ...row, id: row._id }))
      },
      options: { academicyears: unique(rows, "academicyear"), programs: unique(rows, "program"), programcodes: unique(rows, "programcode"), categories: unique(rows, "activitytype") }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assetDashboard = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const filter = colid === undefined ? {} : { colid };
    const [assets, tracking, retirements, institution] = await Promise.all([
      AssetItem.find(filter).lean(),
      AssetTracking.find(filter).lean(),
      AssetRetirement.find(filter).lean(),
      getInstitution(colid)
    ]);
    res.json({ success: true, data: {
      institution: institution || {},
      cards: [
        { key: "assets", label: "Total assets", value: assets.length, tone: "#2563eb" },
        { key: "assigned", label: "Assigned assets", value: assets.filter((row) => /^Assigned$/i.test(text(row.status))).length, tone: "#16a34a" },
        { key: "available", label: "Available assets", value: assets.filter((row) => /^Available$/i.test(text(row.status))).length, tone: "#0891b2" },
        { key: "retired", label: "Retired assets", value: retirements.length, tone: "#dc2626" }
      ],
      charts: {
        typewise: groupRows(assets, (row) => row.categorytype || row.status),
        categorywise: groupRows(assets, (row) => row.category),
        departmentwise: groupRows(assets.filter((row) => text(row.department)), (row) => row.department),
        statuswise: groupRows(assets, (row) => row.status),
        addedMonthwise: groupRows(assets, (row) => monthKey(row.createdAt)),
        retiredMonthwise: groupRows(retirements, (row) => monthKey(row.retirementdate || row.createdAt)),
        movementMonthwise: groupRows(tracking, (row) => monthKey(row.assignmentdate || row.createdAt))
      },
      table: assets.map((row) => ({ ...row, id: row._id }))
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.purchaseNewDashboard = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const filter = colid === undefined ? {} : { colid };
    const [indents, rfps, pos, invoices, institution] = await Promise.all([
      PurchaseNewIndent.find(filter).lean(),
      PurchaseNewRfp.find(filter).lean(),
      PurchaseNewPo.find(filter).lean(),
      PurchaseNewInvoice.find(filter).lean(),
      getInstitution(colid)
    ]);
    const poValue = pos.reduce((acc, row) => acc + num(row.grandtotal), 0);
    res.json({ success: true, data: {
      institution: institution || {},
      cards: [
        { key: "indents", label: "Indents", value: indents.length, tone: "#2563eb" },
        { key: "rfps", label: "RFPs", value: rfps.length, tone: "#7c3aed" },
        { key: "pos", label: "Purchase orders", value: pos.length, tone: "#16a34a" },
        { key: "povalue", label: "PO value", value: poValue, money: true, tone: "#ea580c" }
      ],
      charts: {
        indentMonthwise: groupRows(indents, (row) => monthKey(row.createdAt)),
        poMonthwise: groupRows(pos, (row) => monthKey(row.createdAt), (row) => row.grandtotal || 0, "label", "amount"),
        departmentIndent: groupRows(indents, (row) => row.department),
        categoryPo: groupRows(pos.flatMap((po) => (po.items || []).map((item) => ({ category: item.item || po.rfptitle, amount: item.total || 0 }))), (row) => row.category, (row) => row.amount, "label", "amount"),
        statusPo: groupRows(pos, (row) => row.status)
      },
      table: pos.map((row) => ({ ...row, id: row._id }))
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.purchase2Dashboard = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const filter = colid === undefined ? {} : { colid };
    const [indents, prs, pos, poItems, gatePass, qc, grn, institution] = await Promise.all([
      StoreReq.find(filter).lean(),
      StorePr.find(filter).lean(),
      StorePo.find(filter).lean(),
      StorePoItem.find(filter).lean(),
      StoreGatePass.find(filter).lean(),
      StoreQc.find(filter).lean(),
      StoreGrn.find(filter).lean(),
      getInstitution(colid)
    ]);
    const poValue = pos.reduce((acc, row) => acc + num(row.actualAmount || row.netprice || row.price || row.approxAmount), 0);
    res.json({ success: true, data: {
      institution: institution || {},
      cards: [
        { key: "indents", label: "Store indents", value: indents.length, tone: "#2563eb" },
        { key: "prs", label: "PR requests", value: prs.length, tone: "#7c3aed" },
        { key: "pos", label: "POs", value: pos.length, tone: "#16a34a" },
        { key: "povalue", label: "PO value", value: poValue, money: true, tone: "#ea580c" }
      ],
      charts: {
        indentMonthwise: groupRows(indents, (row) => monthKey(row.reqdate || row.requestdate || row.createdAt)),
        prMonthwise: groupRows(prs, (row) => monthKey(row.requestdate || row.createdAt)),
        poMonthwise: groupRows(pos, (row) => monthKey(row.updatedate || row.createdAt), (row) => row.actualAmount || row.netprice || row.price || row.approxAmount || 0, "label", "amount"),
        departmentIndent: groupRows(indents, (row) => row.departmentname),
        categoryPo: groupRows(poItems, (row) => row.category, (row) => row.total || (num(row.quantity) * num(row.price)), "label", "amount"),
        localPurchaseMonthwise: groupRows(pos.filter((row) => /^Local$/i.test(text(row.poType))), (row) => monthKey(row.createdAt), (row) => row.actualAmount || row.netprice || row.price || row.approxAmount || 0, "label", "amount"),
        processStatus: [
          { label: "Gate pass", count: gatePass.length },
          { label: "Quality check", count: qc.length },
          { label: "GRN", count: grn.length }
        ]
      },
      table: pos.map((row) => ({ ...row, id: row._id }))
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.hrLeaveDashboard = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const query = {};
    if (colid !== undefined) query.colid = colid;
    Object.assign(query, dateInRange("fromdate", req.query.fromdate, req.query.todate));
    const [leaves, users, institution] = await Promise.all([
      HrLeaveApplication.find(query).lean(),
      User.find(colid === undefined ? {} : { colid }).select("name email user department designation role").lean(),
      getInstitution(colid)
    ]);
    const userMap = new Map(users.map((user) => [text(user.email || user.user).toLowerCase(), user]));
    const approved = leaves.filter((row) => /^Approved$/i.test(text(row.status)));
    const withUsers = approved.map((row) => ({ ...row, employee: userMap.get(text(row.employeeemail).toLowerCase()) || {} }));
    const byEmployee = groupRows(withUsers, (row) => row.employeename || row.employee?.name || row.employeeemail, (row) => row.days, "label", "days");
    res.json({ success: true, data: {
      institution: institution || {},
      cards: [
        { key: "applications", label: "Applications", value: leaves.length, tone: "#2563eb" },
        { key: "approveddays", label: "Approved leave days", value: approved.reduce((acc, row) => acc + num(row.days), 0), tone: "#16a34a" },
        { key: "employees", label: "Employees on leave", value: new Set(approved.map((row) => text(row.employeeemail))).size, tone: "#7c3aed" },
        { key: "pending", label: "Pending", value: leaves.filter((row) => !/^Approved|Rejected$/i.test(text(row.status))).length, tone: "#ea580c" }
      ],
      charts: {
        monthwise: groupRows(withUsers, (row) => monthKey(row.fromdate), (row) => row.days, "label", "days"),
        departmentwise: groupRows(withUsers, (row) => row.department || row.employee?.department, (row) => row.days, "label", "days"),
        categorywise: groupRows(withUsers, (row) => row.leavetype, (row) => row.days, "label", "days"),
        highest: byEmployee.slice(0, 10),
        lowest: [...byEmployee].reverse().slice(0, 10),
        frequentLastMonth: byEmployee.slice(0, 10)
      },
      table: leaves.map((row) => ({ ...row, id: row._id }))
    }, options: { cycles: unique(leaves, "cyclename"), years: unique(leaves, "fromdate").map((value) => value.slice(0, 4)).filter(Boolean) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.salaryDashboard = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const filter = colid === undefined ? {} : { colid };
    if (req.query.year) filter.year = text(req.query.year);
    const [salary, users, institution] = await Promise.all([
      HrSalary.find(filter).lean(),
      User.find(colid === undefined ? {} : { colid }).select("name email user department designation role").lean(),
      getInstitution(colid)
    ]);
    const userMap = new Map(users.map((user) => [text(user.email || user.user).toLowerCase(), user]));
    const rows = salary.map((row) => ({ ...row, employeeinfo: userMap.get(text(row.empid || row.user).toLowerCase()) || {} }));
    const amount = rows.reduce((acc, row) => acc + num(row.amount), 0);
    res.json({ success: true, data: {
      institution: institution || {},
      cards: [
        { key: "rows", label: "Salary rows", value: rows.length, tone: "#2563eb" },
        { key: "amount", label: "Total salary", value: amount, money: true, tone: "#16a34a" },
        { key: "employees", label: "Employees", value: new Set(rows.map((row) => text(row.empid || row.employee))).size, tone: "#7c3aed" },
        { key: "components", label: "Components", value: new Set(rows.map((row) => text(row.component))).size, tone: "#ea580c" }
      ],
      charts: {
        monthwise: groupRows(rows, (row) => `${row.year || ""}-${row.month || ""}`, (row) => row.amount, "label", "amount"),
        departmentwise: groupRows(rows, (row) => row.employeeinfo?.department || row.department, (row) => row.amount, "label", "amount"),
        categorywise: groupRows(rows, (row) => row.component || row.type, (row) => row.amount, "label", "amount"),
        designationwise: groupRows(rows, (row) => row.employeeinfo?.designation || row.level, (row) => row.amount, "label", "amount"),
        typewise: groupRows(rows, (row) => row.type, (row) => row.amount, "label", "amount")
      },
      table: rows.map((row) => ({ ...row, id: row._id }))
    }, options: { years: unique(rows, "year") } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateDummy = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const count = Math.max(1, Math.min(200, num(req.body.count || 25)));
    const kinds = Array.isArray(req.body.kinds) && req.body.kinds.length ? req.body.kinds : ["sports", "cultural", "leaves", "attendance", "salary"];
    const [students, staff] = await Promise.all([
      User.find({ colid, role: /^Student$/i }).select("name regno program programcode academicyear").limit(count).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email user role department designation").limit(count).lean()
    ]);
    const summary = [];
    const today = new Date();
    const isoDate = (daysBack) => {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      return date.toISOString().slice(0, 10);
    };
    if (kinds.includes("cultural") && students.length) {
      const rows = students.map((student, index) => ({ colid, academicyear: student.academicyear || "2026-27", program: student.program, programcode: student.programcode, student: student.name, regno: student.regno, activitytype: activityTypes.cultural[index % activityTypes.cultural.length], activitydate: isoDate(index % 180), activityname: `Cultural activity ${index + 1}`, venue: "Auditorium", location: "Campus", prizewon: prizes[index % prizes.length], source: "Dummy", user: req.body.user }));
      await CulturalActivity.insertMany(rows, { ordered: false });
      summary.push({ section: "Cultural", count: rows.length });
    }
    if (kinds.includes("sports") && students.length) {
      const rows = students.map((student, index) => ({ colid, academicyear: student.academicyear || "2026-27", program: student.program, programcode: student.programcode, student: student.name, regno: student.regno, activitytype: activityTypes.sports[index % activityTypes.sports.length], activitydate: isoDate(index % 180), activityname: `Sports activity ${index + 1}`, venue: "Sports ground", location: "Campus", prizewon: prizes[(index + 2) % prizes.length], source: "Dummy", user: req.body.user }));
      await SportsActivity.insertMany(rows, { ordered: false });
      summary.push({ section: "Sports", count: rows.length });
    }
    if (kinds.includes("leaves") && staff.length) {
      const rows = staff.map((employee, index) => ({ colid, cyclename: "2026-27", employeename: employee.name, employeeemail: employee.email || employee.user, department: employee.department, leavetype: ["CL", "EL", "Medical", "Compensatory"][index % 4], fromdate: isoDate(index % 90), todate: isoDate(index % 90), days: (index % 3) + 1, reason: "Dummy leave", status: "Approved", user: req.body.user }));
      await HrLeaveApplication.insertMany(rows, { ordered: false });
      summary.push({ section: "HR leave", count: rows.length });
    }
    if (kinds.includes("attendance") && staff.length) {
      const rows = staff.flatMap((employee, index) => Array.from({ length: 10 }, (_, day) => ({ colid, academicyear: "2026-27", month: new Date(isoDate(day)).toLocaleString("en-US", { month: "long" }), date: isoDate(day), employeename: employee.name, employeeemail: employee.email || employee.user, role: employee.role, attendance: (index + day) % 6 === 0 ? 0 : 1, status: (index + day) % 6 === 0 ? "Absent" : "Present", intime: "09:30", outtime: "17:30", approvalstatus: "Approved", actiontype: "Dummy", colid, user: req.body.user })));
      await HrAttendance.insertMany(rows, { ordered: false });
      summary.push({ section: "HR attendance", count: rows.length });
    }
    if (kinds.includes("salary") && staff.length) {
      const rows = staff.flatMap((employee, index) => ["Basic", "HRA", "DA", "PF"].map((component, cIndex) => ({ colid, name: employee.name || "Employee", user: employee.email || employee.user || `employee${index}@dummy.local`, year: "2026", month: String((index % 12) + 1).padStart(2, "0"), duedate: new Date(), employee: employee.name, empid: employee.email || employee.user, component, amount: [45000, 12000, 8000, -3000][cIndex], type: cIndex === 3 ? "Deduction" : "Earning", level: employee.designation, paystatus: "Paid", status1: "Active" })));
      await HrSalary.insertMany(rows, { ordered: false });
      summary.push({ section: "HR salary", count: rows.length });
    }
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
