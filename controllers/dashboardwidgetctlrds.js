const DashboardWidgetDashboard = require("../Models/dashboardwidgetdashboardds");
const User = require("../Models/user");
const BudgetItem = require("../Models/newbudgetitemds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const widgetCatalog = [
  {
    widgetid: "programwise_student_count",
    title: "Programwise student count",
    description: "Shows active student count grouped by program and program code.",
    charttype: "bar",
    datasource: "Users",
    category: "Student"
  },
  {
    widgetid: "departmentwise_faculty_count",
    title: "Departmentwise faculty count",
    description: "Shows active faculty count grouped by department.",
    charttype: "pie",
    datasource: "Users",
    category: "Faculty"
  },
  {
    widgetid: "departmentwise_budget",
    title: "Departmentwise budget",
    description: "Shows approved budget amount grouped by department for the selected academic year.",
    charttype: "bar",
    datasource: "New Budget",
    category: "Budget",
    valuekey: "amount",
    valuename: "Budget amount",
    requiresAcademicYear: true
  },
  {
    widgetid: "categorywise_budget",
    title: "Categorywise budget",
    description: "Shows approved budget amount grouped by category for the selected academic year.",
    charttype: "pie",
    datasource: "New Budget",
    category: "Budget",
    valuekey: "amount",
    valuename: "Budget amount",
    requiresAcademicYear: true
  },
  {
    widgetid: "faculty_workload",
    title: "Faculty workload",
    description: "Shows selected faculty workload grouped by program and semester.",
    charttype: "bar",
    datasource: "Workload Assignment",
    category: "Faculty",
    valuekey: "count",
    valuename: "Assigned courses",
    requiresAcademicYear: true,
    requiresFaculty: true,
    showGrid: true
  },
  {
    widgetid: "faculty_classwise_average_attendance",
    title: "Faculty classwise average attendance",
    description: "Shows classwise average attendance for the selected faculty.",
    charttype: "bar",
    datasource: "NEP LMS Attendance",
    category: "Attendance",
    valuekey: "average",
    valuename: "Average attendance %",
    requiresAcademicYear: true,
    requiresFaculty: true,
    showGrid: true
  }
];

const catalogMap = new Map(widgetCatalog.map((item) => [item.widgetid, item]));

const dashboardPayload = (body) => ({
  colid: num(body.colid),
  dashboardname: text(body.dashboardname),
  role: text(body.role),
  description: text(body.description),
  status: text(body.status || "Active"),
  user: text(body.user),
  widgets: (Array.isArray(body.widgets) ? body.widgets : [])
    .filter((item) => catalogMap.has(text(item.widgetid)))
    .map((item, index) => ({
      widgetid: text(item.widgetid),
      title: text(item.title || catalogMap.get(text(item.widgetid))?.title || ""),
      order: num(item.order, index)
    }))
});

exports.getWidgets = async (req, res) => {
  try {
    res.json({ success: true, data: widgetCatalog });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getWidgetData = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const widgetid = text(req.query.widgetid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!catalogMap.has(widgetid)) return res.status(404).json({ success: false, message: "Widget not found" });

    let data = [];
    let grid = [];
    let academicYears = [];
    let selectedAcademicYear = text(req.query.academicyear || req.query.academicYear);
    let faculties = [];
    let selectedFacultyEmail = text(req.query.facultyemail || req.query.facultyEmail);
    if (widgetid === "programwise_student_count") {
      data = await User.aggregate([
        { $match: { colid, role: /^Student$/i, status: 1 } },
        {
          $group: {
            _id: {
              program: { $ifNull: ["$program", "Not specified"] },
              programcode: { $ifNull: ["$programcode", ""] }
            },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            name: {
              $trim: {
                input: { $concat: ["$_id.program", " ", "$_id.programcode"] }
              }
            },
            program: "$_id.program",
            programcode: "$_id.programcode",
            count: 1
          }
        },
        { $sort: { count: -1, name: 1 } }
      ]);
    }

    if (widgetid === "departmentwise_faculty_count") {
      data = await User.aggregate([
        { $match: { colid, role: /^Faculty$/i, status: 1 } },
        {
          $group: {
            _id: { $ifNull: ["$department", "Not specified"] },
            count: { $sum: 1 }
          }
        },
        { $project: { _id: 0, name: "$_id", department: "$_id", count: 1 } },
        { $sort: { count: -1, name: 1 } }
      ]);
    }

    if (widgetid === "departmentwise_budget" || widgetid === "categorywise_budget") {
      academicYears = await BudgetItem.distinct("academicyear", { colid, status: "Approved" });
      academicYears = academicYears.filter(Boolean).sort().reverse();
      selectedAcademicYear = selectedAcademicYear || academicYears[0] || "2026-27";
      const groupField = widgetid === "departmentwise_budget" ? "$department" : "$category";
      data = await BudgetItem.aggregate([
        { $match: { colid, status: "Approved", academicyear: selectedAcademicYear } },
        {
          $group: {
            _id: { $ifNull: [groupField, "Not specified"] },
            amount: { $sum: { $ifNull: ["$amount", 0] } },
            items: { $sum: 1 }
          }
        },
        { $project: { _id: 0, name: "$_id", amount: 1, items: 1 } },
        { $sort: { amount: -1, name: 1 } }
      ]);
    }

    if (widgetid === "faculty_workload" || widgetid === "faculty_classwise_average_attendance") {
      const workloadYears = await WorkloadAssignment.distinct("academicyear", { colid });
      const attendanceYears = await NepLmsAttendance.distinct("academicyear", { colid });
      academicYears = Array.from(new Set([...workloadYears, ...attendanceYears].filter(Boolean))).sort().reverse();
      selectedAcademicYear = selectedAcademicYear || academicYears[0] || "2026-27";

      const workloadFacultyRows = await WorkloadAssignment.aggregate([
        { $match: { colid, academicyear: selectedAcademicYear } },
        {
          $group: {
            _id: "$facultyemail",
            facultyname: { $first: "$facultyname" },
            facultyemail: { $first: "$facultyemail" }
          }
        },
        { $project: { _id: 0, facultyname: 1, facultyemail: 1 } }
      ]);
      const attendanceFacultyRows = await NepLmsAttendance.aggregate([
        { $match: { colid, academicyear: selectedAcademicYear } },
        {
          $group: {
            _id: "$facultyemail",
            facultyname: { $first: "$faculty" },
            facultyemail: { $first: "$facultyemail" }
          }
        },
        { $project: { _id: 0, facultyname: 1, facultyemail: 1 } }
      ]);
      const facultyMap = new Map();
      [...workloadFacultyRows, ...attendanceFacultyRows].forEach((item) => {
        const email = text(item.facultyemail);
        if (email) facultyMap.set(email.toLowerCase(), {
          facultyemail: email,
          facultyname: text(item.facultyname) || email,
          label: `${text(item.facultyname) || email} (${email})`
        });
      });
      faculties = Array.from(facultyMap.values()).sort((a, b) => a.label.localeCompare(b.label));
      selectedFacultyEmail = selectedFacultyEmail || faculties[0]?.facultyemail || "";
      if (selectedFacultyEmail && !faculties.some((item) => text(item.facultyemail).toLowerCase() === selectedFacultyEmail.toLowerCase())) {
        selectedFacultyEmail = faculties[0]?.facultyemail || "";
      }
    }

    if (widgetid === "faculty_workload" && selectedFacultyEmail) {
      data = await WorkloadAssignment.aggregate([
        { $match: { colid, academicyear: selectedAcademicYear, facultyemail: new RegExp(`^${selectedFacultyEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
        {
          $group: {
            _id: { program: "$program", programcode: "$programcode", semester: "$semester" },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            name: { $concat: [{ $ifNull: ["$_id.programcode", "NA"] }, " Sem ", { $ifNull: ["$_id.semester", "NA"] }] },
            program: "$_id.program",
            programcode: "$_id.programcode",
            semester: "$_id.semester",
            count: 1
          }
        },
        { $sort: { programcode: 1, semester: 1 } }
      ]);
      grid = await WorkloadAssignment.find({
        colid,
        academicyear: selectedAcademicYear,
        facultyemail: new RegExp(`^${selectedFacultyEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
      })
        .select("academicyear facultyname facultyemail program programcode semester type subject course coursecode status")
        .sort({ programcode: 1, semester: 1, course: 1 })
        .lean();
    }

    if (widgetid === "faculty_classwise_average_attendance" && selectedFacultyEmail) {
      data = await NepLmsAttendance.aggregate([
        { $match: { colid, academicyear: selectedAcademicYear, facultyemail: new RegExp(`^${selectedFacultyEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
        {
          $group: {
            _id: { classid: "$classid", course: "$course", coursecode: "$coursecode", classdate: "$classdate", classtime: "$classtime" },
            total: { $sum: 1 },
            present: { $sum: "$attendance" }
          }
        },
        {
          $project: {
            _id: 0,
            classid: "$_id.classid",
            course: "$_id.course",
            coursecode: "$_id.coursecode",
            classdate: "$_id.classdate",
            classtime: "$_id.classtime",
            name: {
              $trim: {
                input: { $concat: [{ $ifNull: ["$_id.coursecode", "Course"] }, " ", { $ifNull: ["$_id.classdate", ""] }] }
              }
            },
            total: 1,
            present: 1,
            average: { $round: [{ $multiply: [{ $divide: ["$present", { $cond: [{ $eq: ["$total", 0] }, 1, "$total"] }] }, 100] }, 2] }
          }
        },
        { $sort: { classdate: 1, classtime: 1, coursecode: 1 } }
      ]);
      grid = data;
    }

    res.json({
      success: true,
      widget: catalogMap.get(widgetid),
      data,
      grid,
      academicYears,
      selectedAcademicYear,
      faculties,
      selectedFacultyEmail
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getDashboards = async (req, res) => {
  try {
    const filter = {};
    if (req.query.colid) filter.colid = num(req.query.colid);
    if (req.query.role) filter.role = text(req.query.role);
    if (req.query.status) filter.status = text(req.query.status);
    const data = await DashboardWidgetDashboard.find(filter).sort({ role: 1, dashboardname: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.saveDashboard = async (req, res) => {
  try {
    const payload = dashboardPayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.dashboardname) return res.status(400).json({ success: false, message: "Dashboard name is required" });
    if (!payload.role) return res.status(400).json({ success: false, message: "Role is required" });
    if (!payload.widgets.length) return res.status(400).json({ success: false, message: "Select at least one widget" });
    const data = req.body.id
      ? await DashboardWidgetDashboard.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await DashboardWidgetDashboard.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteDashboard = async (req, res) => {
  try {
    await DashboardWidgetDashboard.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
