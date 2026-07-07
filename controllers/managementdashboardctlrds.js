const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const Ledgerstud = require("../Models/ledgerstud");
const HrSalary = require("../Models/hrsalary");
const HrLeaveApplication = require("../Models/hrleaveapplicationds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NewBudgetItem = require("../Models/newbudgetitemds");
const PurchaseOrder = require("../Models/purchasenewpurchaseorderds");
const Institution = require("../Models/insdetails");

const text = (value) => String(value || "").trim();
const num = (value) => Number(value || 0);
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (values = []) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const fyStartYear = (year = "") => {
  const match = text(year).match(/(\d{4})/);
  return match ? Number(match[1]) : new Date().getFullYear();
};
const salaryMonthOrder = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
};

const sum = (rows = [], field) => rows.reduce((total, row) => total + num(row[field]), 0);
const groupCount = (rows = [], field, label = "label") => Object.values(rows.reduce((acc, row) => {
  const key = text(row[field]) || "Not specified";
  acc[key] = acc[key] || { [label]: key, count: 0 };
  acc[key].count += 1;
  return acc;
}, {})).sort((a, b) => b.count - a.count);
const groupSum = (rows = [], field, sumField, label = "label") => Object.values(rows.reduce((acc, row) => {
  const key = text(row[field]) || "Not specified";
  acc[key] = acc[key] || { [label]: key, amount: 0, count: 0 };
  acc[key].amount += num(row[sumField]);
  acc[key].count += 1;
  return acc;
}, {})).sort((a, b) => b.amount - a.amount);

const academicYearQuery = (year, fields = ["academicyear"]) => {
  if (!text(year)) return {};
  return { $or: fields.map((field) => ({ [field]: year })) };
};

const getCoreData = async ({ colid, academicyear }) => {
  const userQuery = { colid };
  const studentQuery = { colid, role: /^student$/i, ...academicYearQuery(academicyear, ["academicyear", "admissionyear"]) };
  const programQuery = { colid, ...(academicyear ? { $or: [{ year: academicyear }, { academicyear }] } : {}) };
  const ledgerQuery = { colid, ...academicYearQuery(academicyear, ["academicyear"]) };
  const budgetQuery = { colid, ...academicYearQuery(academicyear, ["academicyear"]) };
  const workflowQuery = { colid, ...academicYearQuery(academicyear, ["academicyear"]) };
  const yearText = text(academicyear);
  const salaryQuery = { colid };
  if (yearText) salaryQuery.year = { $in: [yearText, String(fyStartYear(yearText)), yearText.slice(0, 4)] };

  const [users, students, programs, ledger, salary, leaves, attendance, timetable, workload, budget, purchaseOrders, institution] = await Promise.all([
    User.find(userQuery).select("name email role department designation academicyear admissionyear program programcode semester status").lean(),
    User.find(studentQuery).select("name email role department academicyear admissionyear program programcode semester status").lean(),
    MPrograms.find(programQuery).lean(),
    Ledgerstud.find(ledgerQuery).lean(),
    HrSalary.find(salaryQuery).lean(),
    HrLeaveApplication.find(workflowQuery).lean(),
    NepLmsAttendance.find(workflowQuery).lean(),
    NepLmsTimetable.find(workflowQuery).lean(),
    WorkloadAssignment.find(workflowQuery).lean(),
    NewBudgetItem.find(budgetQuery).lean(),
    PurchaseOrder.find({ colid }).lean(),
    Institution.findOne({ colid }).lean()
  ]);
  return { users, students, programs, ledger, salary, leaves, attendance, timetable, workload, budget, purchaseOrders, institution };
};

const buildSummary = (data, academicyear) => {
  const faculty = data.users.filter((row) => /^faculty$/i.test(text(row.role)));
  const nonStudentUsers = data.users.filter((row) => !/^student$/i.test(text(row.role)));
  const salaryUserMap = new Map(data.users.map((row) => [text(row.email).toLowerCase(), row]));
  const poYear = text(academicyear);
  const poRows = poYear
    ? data.purchaseOrders.filter((row) => new Date(row.createdAt || row.approvedat || Date.now()).getFullYear() === fyStartYear(poYear))
    : data.purchaseOrders;
  const approvedBudget = data.budget.filter((row) => /approved/i.test(text(row.status)) || /approved/i.test(text(row.stage)));
  const salaryRows = data.salary.map((row) => {
    const user = salaryUserMap.get(text(row.empid || row.user).toLowerCase()) || {};
    return { ...row, role: user.role || "Not specified", department: user.department || "Not specified" };
  });
  const leaveRows = data.leaves.map((row) => {
    const user = salaryUserMap.get(text(row.employeeemail).toLowerCase()) || {};
    return { ...row, role: user.role || "Not specified" };
  });
  const attendanceTotal = data.attendance.length;
  const attendancePresent = data.attendance.filter((row) => Number(row.attendance) === 1).length;
  const conductedClassKeys = new Set(data.attendance.map((row) => text(row.classid) || `${row.facultyemail}|${row.coursecode}|${row.classdate}|${row.classtime}`));
  const completedTimetable = data.timetable.filter((row) => text(row.workcompleted));

  const cards = [
    { key: "programs", label: "Programs", value: data.programs.length, tone: "#2563eb" },
    { key: "students", label: "Students", value: data.students.length, tone: "#16a34a" },
    { key: "faculty", label: "Faculty", value: faculty.length, tone: "#7c3aed" },
    { key: "departments", label: "Departments", value: uniq(nonStudentUsers.map((row) => row.department)).length, tone: "#ea580c" },
    { key: "feesCollected", label: "Fees Collected", value: sum(data.ledger, "paid"), money: true, tone: "#0891b2" },
    { key: "feesPending", label: "Fees Pending", value: sum(data.ledger, "balance"), money: true, tone: "#dc2626" },
    { key: "budget", label: "Approved Budget", value: sum(approvedBudget, "amount"), money: true, tone: "#4f46e5" },
    { key: "purchaseOrders", label: "Purchase Orders", value: sum(poRows, "grandtotal"), money: true, tone: "#0f766e" },
    { key: "salary", label: "Salary Payment", value: sum(salaryRows, "amount"), money: true, tone: "#9333ea" },
    { key: "leaves", label: "Leaves Taken", value: sum(leaveRows, "days"), tone: "#b45309" },
    { key: "classes", label: "Classes Conducted", value: conductedClassKeys.size || completedTimetable.length, tone: "#0284c7" },
    { key: "attendance", label: "Attendance %", value: attendanceTotal ? Number(((attendancePresent / attendanceTotal) * 100).toFixed(1)) : 0, suffix: "%", tone: "#65a30d" }
  ];

  const salaryByMonth = groupSum(salaryRows, "month", "amount")
    .map((row) => ({ ...row, order: salaryMonthOrder[text(row.label).toLowerCase()] || 99 }))
    .sort((a, b) => a.order - b.order);
  const facultyPerformance = Object.values(data.attendance.reduce((acc, row) => {
    const key = text(row.facultyemail) || text(row.faculty) || "Not specified";
    acc[key] = acc[key] || { faculty: row.faculty || key, facultyemail: row.facultyemail || "", classes: new Set(), total: 0, present: 0 };
    acc[key].classes.add(text(row.classid) || `${row.coursecode}|${row.classdate}|${row.classtime}`);
    acc[key].total += 1;
    acc[key].present += Number(row.attendance) === 1 ? 1 : 0;
    return acc;
  }, {})).map((row) => ({
    faculty: row.faculty,
    facultyemail: row.facultyemail,
    classes: row.classes.size,
    attendance: row.total ? Number(((row.present / row.total) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.attendance - a.attendance);

  return {
    institution: data.institution,
    cards,
    charts: {
      studentsByProgram: groupCount(data.students, "programcode").slice(0, 12),
      usersByRole: groupCount(data.users, "role").slice(0, 12),
      facultyByDepartment: groupCount(faculty, "department").slice(0, 12),
      feesByProgram: groupSum(data.ledger, "programcode", "paid").slice(0, 12),
      pendingByProgram: groupSum(data.ledger, "programcode", "balance").slice(0, 12),
      budgetByDepartment: groupSum(approvedBudget, "department", "amount").slice(0, 12),
      budgetByCategory: groupSum(approvedBudget, "category", "amount").slice(0, 12),
      poByVendor: groupSum(poRows, "vendorname", "grandtotal").slice(0, 12),
      salaryByMonth,
      salaryByRole: groupSum(salaryRows, "role", "amount").slice(0, 12),
      leaveByRole: groupSum(leaveRows, "role", "days").slice(0, 12),
      attendanceByProgram: Object.values(data.attendance.reduce((acc, row) => {
        const key = text(row.programcode) || "Not specified";
        acc[key] = acc[key] || { label: key, total: 0, present: 0 };
        acc[key].total += 1;
        acc[key].present += Number(row.attendance) === 1 ? 1 : 0;
        return acc;
      }, {})).map((row) => ({ label: row.label, attendance: row.total ? Number(((row.present / row.total) * 100).toFixed(1)) : 0 })).sort((a, b) => b.attendance - a.attendance).slice(0, 12),
      classesByFaculty: groupCount(completedTimetable.length ? completedTimetable : data.timetable, "faculty").slice(0, 12)
    },
    tables: {
      facultyPerformance: facultyPerformance.slice(0, 20),
      recentPurchaseOrders: poRows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 20),
      pendingFees: data.ledger.filter((row) => num(row.balance) > 0).slice(0, 50)
    }
  };
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [users, programs, ledger, budget] = await Promise.all([
      User.find({ colid }).select("academicyear admissionyear department role programcode").lean(),
      MPrograms.find({ colid }).select("year programcode department type level").lean(),
      Ledgerstud.find({ colid }).select("academicyear programcode").lean(),
      NewBudgetItem.find({ colid }).select("academicyear department category").lean()
    ]);
    res.json({
      success: true,
      options: {
        academicyears: uniq([
          ...users.flatMap((row) => [row.academicyear, row.admissionyear]),
          ...programs.map((row) => row.year),
          ...ledger.map((row) => row.academicyear),
          ...budget.map((row) => row.academicyear)
        ]),
        departments: uniq([...users.map((row) => row.department), ...programs.map((row) => row.department), ...budget.map((row) => row.department)]),
        roles: uniq(users.map((row) => row.role)),
        programcodes: uniq([...users.map((row) => row.programcode), ...programs.map((row) => row.programcode), ...ledger.map((row) => row.programcode)])
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.summary = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await getCoreData({ colid, academicyear: text(req.query.academicyear) });
    res.json({ success: true, data: buildSummary(data, req.query.academicyear) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.drilldown = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const type = text(req.query.type);
    const academicyear = text(req.query.academicyear);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await getCoreData({ colid, academicyear });
    const summary = buildSummary(data, academicyear);
    const map = {
      programs: data.programs,
      students: data.students,
      faculty: data.users.filter((row) => /^faculty$/i.test(text(row.role))),
      departments: groupCount(data.users, "department"),
      feesCollected: data.ledger.filter((row) => num(row.paid) > 0),
      feesPending: data.ledger.filter((row) => num(row.balance) > 0),
      budget: data.budget.filter((row) => /approved/i.test(text(row.status)) || /approved/i.test(text(row.stage))),
      purchaseOrders: data.purchaseOrders,
      salary: data.salary,
      leaves: data.leaves,
      classes: data.timetable,
      attendance: data.attendance,
      roles: groupCount(data.users, "role"),
      facultyPerformance: summary.tables.facultyPerformance
    };
    res.json({
      success: true,
      type,
      data: map[type] || [],
      charts: summary.charts,
      cards: summary.cards.filter((card) => card.key === type)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
