const DashboardWidgetDashboard = require("../Models/dashboardwidgetdashboardds");
const User = require("../Models/user");
const BudgetItem = require("../Models/newbudgetitemds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const HrLeaveApplication = require("../Models/hrleaveapplicationds");
const HrEmployeeAttendance = require("../Models/hremployeeattendanceds");
const HrSalary = require("../Models/hrsalary");
const PurchaseNewIndent = require("../Models/purchasenewindentds");
const PurchaseNewRfp = require("../Models/purchasenewrfpds");
const PurchaseNewPurchaseOrder = require("../Models/purchasenewpurchaseorderds");
const PurchaseNewInvoice = require("../Models/purchasenewinvoiceds");
const AdmissionApplicationDynamic = require("../Models/admissionapplicationdynamic");
const LedgerStud = require("../Models/ledgerstud");
const AssetNewItem = require("../Models/assetnewitemds");
const AssetNewTracking = require("../Models/assetnewtrackingds");
const AssetNewRetirement = require("../Models/assetnewretirementds");

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const academicYearDefaults = ["2029-30", "2028-29", "2027-28", "2026-27", "2025-26", "2024-25", "2023-24"];

const genericModels = {
  HrLeaveApplication,
  HrEmployeeAttendance,
  HrSalary,
  BudgetItem,
  PurchaseNewIndent,
  PurchaseNewRfp,
  PurchaseNewPurchaseOrder,
  PurchaseNewInvoice,
  User,
  AdmissionApplicationDynamic,
  LedgerStud,
  AssetNewItem,
  AssetNewTracking,
  AssetNewRetirement
};

const modelYearField = {
  HrEmployeeAttendance: "academicyear",
  HrSalary: "year",
  BudgetItem: "academicyear",
  User: "academicyear",
  AdmissionApplicationDynamic: "academicyear",
  LedgerStud: "academicyear"
};

const safeName = (value) => {
  const clean = text(value);
  return clean || "Not specified";
};

const makeWidget = (widgetid, title, description, category, model, groupField, options = {}) => ({
  widgetid,
  title,
  description,
  charttype: options.charttype || "bar",
  datasource: options.datasource || model,
  category,
  valuekey: options.valuekey || (options.sumField ? "amount" : "count"),
  valuename: options.valuename || (options.sumField ? "Amount" : "Count"),
  requiresAcademicYear: options.requiresAcademicYear !== false,
  showGrid: options.showGrid !== false,
  generic: true,
  model,
  groupField,
  sumField: options.sumField || "",
  baseFilter: options.baseFilter || {},
  yearField: options.yearField || modelYearField[model] || "",
  dateYearField: options.dateYearField || "createdAt",
  secondaryFilterField: options.secondaryFilterField || "",
  secondaryFilterLabel: options.secondaryFilterLabel || "",
  chartLimit: options.chartLimit || 12
});

const generatedWidgetCatalog = [
  makeWidget("hr_leave_status_count", "HR Leave status", "Leave applications grouped by approval status.", "HR Leave", "HrLeaveApplication", "status", { datasource: "HR Leave", charttype: "pie", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),
  makeWidget("hr_leave_type_days", "HR Leave days by type", "Total leave days grouped by leave type.", "HR Leave", "HrLeaveApplication", "leavetype", { datasource: "HR Leave", sumField: "days", valuename: "Days", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),
  makeWidget("hr_leave_department_count", "HR Leave by department", "Leave applications grouped by department.", "HR Leave", "HrLeaveApplication", "department", { datasource: "HR Leave", charttype: "pie", secondaryFilterField: "status", secondaryFilterLabel: "Status" }),
  makeWidget("hr_leave_employee_days", "HR Leave employee days", "Total leave days grouped by employee.", "HR Leave", "HrLeaveApplication", "employeename", { datasource: "HR Leave", sumField: "days", valuename: "Days", secondaryFilterField: "leavetype", secondaryFilterLabel: "Leave type" }),
  makeWidget("hr_leave_cycle_count", "HR Leave cycle count", "Leave applications grouped by leave cycle.", "HR Leave", "HrLeaveApplication", "cyclename", { datasource: "HR Leave", secondaryFilterField: "status", secondaryFilterLabel: "Status" }),

  makeWidget("hr_attendance_status_count", "HR Attendance status", "Employee attendance grouped by status.", "HR Attendance", "HrEmployeeAttendance", "status", { datasource: "HR Attendance", charttype: "pie", secondaryFilterField: "month", secondaryFilterLabel: "Month" }),
  makeWidget("hr_attendance_role_count", "HR Attendance by role", "Attendance records grouped by role.", "HR Attendance", "HrEmployeeAttendance", "role", { datasource: "HR Attendance", secondaryFilterField: "month", secondaryFilterLabel: "Month" }),
  makeWidget("hr_attendance_late_count", "Late attendance by department", "Late attendance records grouped by department.", "HR Attendance", "HrEmployeeAttendance", "department", { datasource: "HR Attendance", baseFilter: { islate: /^Yes$/i }, secondaryFilterField: "month", secondaryFilterLabel: "Month" }),
  makeWidget("hr_attendance_early_count", "Early exit by role", "Early exit records grouped by role.", "HR Attendance", "HrEmployeeAttendance", "role", { datasource: "HR Attendance", baseFilter: { isearly: /^Yes$/i }, secondaryFilterField: "month", secondaryFilterLabel: "Month" }),
  makeWidget("hr_attendance_overtime_amount", "Overtime by role", "Overtime value grouped by role.", "HR Attendance", "HrEmployeeAttendance", "role", { datasource: "HR Attendance", sumField: "overtimerate", valuename: "Overtime amount", baseFilter: { isovertime: /^Yes$/i }, secondaryFilterField: "month", secondaryFilterLabel: "Month" }),

  makeWidget("hr_salary_component_amount", "HR Salary by component", "Salary amount grouped by component.", "HR Salary", "HrSalary", "component", { datasource: "HR Salary", sumField: "amount", valuename: "Salary amount", secondaryFilterField: "month", secondaryFilterLabel: "Month" }),
  makeWidget("hr_salary_type_amount", "HR Salary earnings/deductions", "Salary amount grouped by type.", "HR Salary", "HrSalary", "type", { datasource: "HR Salary", charttype: "pie", sumField: "amount", valuename: "Salary amount", secondaryFilterField: "month", secondaryFilterLabel: "Month" }),
  makeWidget("hr_salary_status_amount", "HR Salary payment status", "Salary amount grouped by payment status.", "HR Salary", "HrSalary", "paystatus", { datasource: "HR Salary", sumField: "amount", valuename: "Salary amount", secondaryFilterField: "month", secondaryFilterLabel: "Month" }),
  makeWidget("hr_salary_employee_amount", "HR Salary by employee", "Salary amount grouped by employee.", "HR Salary", "HrSalary", "employee", { datasource: "HR Salary", sumField: "amount", valuename: "Salary amount", secondaryFilterField: "month", secondaryFilterLabel: "Month" }),
  makeWidget("hr_salary_month_amount", "HR Salary monthwise", "Salary amount grouped by month.", "HR Salary", "HrSalary", "month", { datasource: "HR Salary", sumField: "amount", valuename: "Salary amount", secondaryFilterField: "type", secondaryFilterLabel: "Type" }),

  makeWidget("budget_new_status_count", "Budget status count", "Budget entries grouped by status.", "Budget new", "BudgetItem", "status", { datasource: "Budget new", charttype: "pie", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),
  makeWidget("budget_new_department_amount", "Budget department amount", "Budget amount grouped by department.", "Budget new", "BudgetItem", "department", { datasource: "Budget new", sumField: "amount", valuename: "Budget amount", secondaryFilterField: "status", secondaryFilterLabel: "Status" }),
  makeWidget("budget_new_category_amount", "Budget category amount", "Budget amount grouped by category.", "Budget new", "BudgetItem", "category", { datasource: "Budget new", charttype: "pie", sumField: "amount", valuename: "Budget amount", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),
  makeWidget("budget_new_stage_amount", "Budget stage amount", "Budget amount grouped by workflow stage.", "Budget new", "BudgetItem", "stage", { datasource: "Budget new", sumField: "amount", valuename: "Budget amount", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),
  makeWidget("budget_new_utilized_category", "Budget utilized by category", "Utilized budget grouped by category.", "Budget new", "BudgetItem", "category", { datasource: "Budget new", sumField: "utilized", valuename: "Utilized amount", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),

  makeWidget("purchase_new_indent_status", "Purchase indent status", "Indents grouped by status.", "Purchase new", "PurchaseNewIndent", "status", { datasource: "Purchase new", charttype: "pie", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),
  makeWidget("purchase_new_indent_category_cost", "Purchase indent category cost", "Approximate indent cost grouped by category.", "Purchase new", "PurchaseNewIndent", "category", { datasource: "Purchase new", sumField: "approximatetotalcost", valuename: "Approximate cost", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),
  makeWidget("purchase_new_rfp_status", "RFP status", "RFPs grouped by status.", "Purchase new", "PurchaseNewRfp", "status", { datasource: "Purchase new", charttype: "pie", secondaryFilterField: "category", secondaryFilterLabel: "Category" }),
  makeWidget("purchase_new_po_vendor_value", "PO value by vendor", "Purchase order value grouped by vendor.", "Purchase new", "PurchaseNewPurchaseOrder", "vendorname", { datasource: "Purchase new", sumField: "grandtotal", valuename: "PO value", secondaryFilterField: "status", secondaryFilterLabel: "Status" }),
  makeWidget("purchase_new_invoice_status_value", "Invoice value by status", "Invoice value grouped by status.", "Purchase new", "PurchaseNewInvoice", "paymentstatus", { datasource: "Purchase new", sumField: "grandtotal", valuename: "Invoice value", secondaryFilterField: "vendorname", secondaryFilterLabel: "Vendor" }),

  makeWidget("user_management_role_count", "Users by role", "Active users grouped by role.", "User management", "User", "role", { datasource: "Users", charttype: "pie", secondaryFilterField: "department", secondaryFilterLabel: "Department" }),
  makeWidget("user_management_department_count", "Users by department", "Active users grouped by department.", "User management", "User", "department", { datasource: "Users", secondaryFilterField: "role", secondaryFilterLabel: "Role" }),
  makeWidget("user_management_program_count", "Students by program", "Students grouped by program.", "User management", "User", "program", { datasource: "Users", baseFilter: { role: /^Student$/i }, secondaryFilterField: "semester", secondaryFilterLabel: "Semester" }),
  makeWidget("user_management_gender_count", "Students by gender", "Students grouped by gender.", "User management", "User", "gender", { datasource: "Users", charttype: "pie", baseFilter: { role: /^Student$/i }, secondaryFilterField: "programcode", secondaryFilterLabel: "Program code" }),
  makeWidget("user_management_category_count", "Students by category", "Students grouped by category.", "User management", "User", "category", { datasource: "Users", charttype: "pie", baseFilter: { role: /^Student$/i }, secondaryFilterField: "programcode", secondaryFilterLabel: "Program code" }),

  makeWidget("admission_status_count", "Admission application status", "Admission applications grouped by status.", "Admission", "AdmissionApplicationDynamic", "applicationstatus", { datasource: "Admission", charttype: "pie", secondaryFilterField: "formid", secondaryFilterLabel: "Form" }),
  makeWidget("admission_program_count", "Admission programwise", "Admission applications grouped by program.", "Admission", "AdmissionApplicationDynamic", "programapplied", { datasource: "Admission", secondaryFilterField: "applicationstatus", secondaryFilterLabel: "Status" }),
  makeWidget("admission_payment_status", "Admission fee payment status", "Applications grouped by payment status.", "Admission", "AdmissionApplicationDynamic", "paymentstatus", { datasource: "Admission", charttype: "pie", secondaryFilterField: "formid", secondaryFilterLabel: "Form" }),
  makeWidget("admission_enrollment_status", "Admission enrollment status", "Applications grouped by enrollment status.", "Admission", "AdmissionApplicationDynamic", "enrollmentstatus", { datasource: "Admission", charttype: "pie", secondaryFilterField: "programcode", secondaryFilterLabel: "Program code" }),
  makeWidget("admission_validation_status", "AI validation status", "Applications grouped by validation status.", "Admission", "AdmissionApplicationDynamic", "validationstatus", { datasource: "Admission", charttype: "pie", secondaryFilterField: "formid", secondaryFilterLabel: "Form" }),

  makeWidget("fees_paid_by_program", "Fees paid by program", "Paid fees grouped by program.", "Fees", "LedgerStud", "program", { datasource: "Ledger", sumField: "paid", valuename: "Paid amount", secondaryFilterField: "feegroup", secondaryFilterLabel: "Fee group" }),
  makeWidget("fees_balance_by_program", "Fees balance by program", "Pending balance grouped by program.", "Fees", "LedgerStud", "program", { datasource: "Ledger", sumField: "balance", valuename: "Balance amount", secondaryFilterField: "feegroup", secondaryFilterLabel: "Fee group" }),
  makeWidget("fees_paid_by_group", "Fees paid by group", "Paid fees grouped by fee group.", "Fees", "LedgerStud", "feegroup", { datasource: "Ledger", charttype: "pie", sumField: "paid", valuename: "Paid amount", secondaryFilterField: "programcode", secondaryFilterLabel: "Program code" }),
  makeWidget("fees_balance_by_item", "Fees balance by item", "Pending balance grouped by fee item.", "Fees", "LedgerStud", "feeitem", { datasource: "Ledger", sumField: "balance", valuename: "Balance amount", secondaryFilterField: "programcode", secondaryFilterLabel: "Program code" }),
  makeWidget("fees_concession_by_category", "Fees concession by category", "Concession amount grouped by fee category.", "Fees", "LedgerStud", "feecategory", { datasource: "Ledger", sumField: "concession", valuename: "Concession amount", secondaryFilterField: "programcode", secondaryFilterLabel: "Program code" }),

  makeWidget("asset_status_count", "Asset status", "Assets grouped by status.", "Asset management", "AssetNewItem", "status", { datasource: "Assets", charttype: "pie", secondaryFilterField: "store", secondaryFilterLabel: "Store" }),
  makeWidget("asset_category_count", "Assets by category", "Assets grouped by category.", "Asset management", "AssetNewItem", "category", { datasource: "Assets", secondaryFilterField: "store", secondaryFilterLabel: "Store" }),
  makeWidget("asset_store_value", "Asset value by store", "Approximate asset value grouped by store.", "Asset management", "AssetNewItem", "store", { datasource: "Assets", sumField: "approximateprice", valuename: "Asset value", secondaryFilterField: "status", secondaryFilterLabel: "Status" }),
  makeWidget("asset_assignment_department", "Asset assignment by department", "Assigned assets grouped by department.", "Asset management", "AssetNewItem", "department", { datasource: "Assets", baseFilter: { status: /^Assigned$/i }, secondaryFilterField: "category", secondaryFilterLabel: "Category" }),
  makeWidget("asset_retirement_type", "Asset retirement type", "Retired assets grouped by retirement type.", "Asset management", "AssetNewRetirement", "retirementtype", { datasource: "Assets", charttype: "pie", secondaryFilterField: "store", secondaryFilterLabel: "Store" })
];

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
  },
  ...generatedWidgetCatalog
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
    const widget = catalogMap.get(widgetid);

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

    if (widget.generic) {
      const Model = genericModels[widget.model];
      if (!Model) return res.status(404).json({ success: false, message: "Widget model not found" });
      const query = { colid, ...(widget.baseFilter || {}) };
      if (widget.yearField) {
        academicYears = await Model.distinct(widget.yearField, { colid });
        academicYears = academicYears.map(text).filter(Boolean).sort().reverse();
        selectedAcademicYear = selectedAcademicYear || academicYears[0] || academicYearDefaults[3];
        if (selectedAcademicYear) query[widget.yearField] = selectedAcademicYear;
      } else {
        const yearRows = await Model.aggregate([
          { $match: { colid, [widget.dateYearField || "createdAt"]: { $exists: true } } },
          { $group: { _id: { $year: `$${widget.dateYearField || "createdAt"}` } } },
          { $project: { _id: 0, year: { $toString: "$_id" } } },
          { $sort: { year: -1 } }
        ]);
        academicYears = yearRows.map((row) => row.year).filter(Boolean);
        selectedAcademicYear = selectedAcademicYear || academicYears[0] || String(new Date().getFullYear());
        if (/^\d{4}$/.test(selectedAcademicYear)) {
          query[widget.dateYearField || "createdAt"] = {
            $gte: new Date(`${selectedAcademicYear}-01-01T00:00:00.000Z`),
            $lte: new Date(`${selectedAcademicYear}-12-31T23:59:59.999Z`)
          };
        }
      }

      let secondaryOptions = [];
      let selectedSecondaryValue = text(req.query.secondaryValue || req.query.secondaryvalue);
      if (widget.secondaryFilterField) {
        secondaryOptions = await Model.distinct(widget.secondaryFilterField, query);
        secondaryOptions = secondaryOptions.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b));
        if (selectedSecondaryValue) {
          query[widget.secondaryFilterField] = { $regex: `^${escapeRegex(selectedSecondaryValue)}$`, $options: "i" };
        }
      }

      const valueKey = widget.valuekey || (widget.sumField ? "amount" : "count");
      const accumulator = widget.sumField
        ? { $sum: { $ifNull: [`$${widget.sumField}`, 0] } }
        : { $sum: 1 };

      data = await Model.aggregate([
        { $match: query },
        {
          $group: {
            _id: { $ifNull: [`$${widget.groupField}`, "Not specified"] },
            [valueKey]: accumulator,
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            name: { $ifNull: ["$_id", "Not specified"] },
            [widget.groupField]: "$_id",
            [valueKey]: 1,
            count: 1
          }
        },
        { $sort: { [valueKey]: -1, name: 1 } },
        { $limit: num(widget.chartLimit, 12) }
      ]);
      data = data.map((item) => ({ ...item, name: safeName(item.name) }));

      grid = await Model.find(query).sort({ createdAt: -1 }).limit(100).lean();
      return res.json({
        success: true,
        widget,
        data,
        grid,
        academicYears,
        selectedAcademicYear,
        faculties,
        selectedFacultyEmail,
        secondaryOptions,
        selectedSecondaryValue,
        secondaryFilterField: widget.secondaryFilterField || "",
        secondaryFilterLabel: widget.secondaryFilterLabel || ""
      });
    }

    res.json({
      success: true,
      widget,
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
