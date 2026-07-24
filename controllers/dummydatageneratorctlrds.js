const User = require("../Models/user");
const crypto = require("crypto");
const mongoose = require("mongoose");
const MenuAccess = require("../Models/menuaccessds");
const DummyDataLog = require("../Models/dummydatageneratorlogds");
const MPrograms = require("../Models/mprograms");
const RegulationMaster = require("../Models/regulationmasterds");
const RegulationSubject = require("../Models/regulationsubjectds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const CourseAssessment = require("../Models/courseassessmentds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const Timetable = require("../Models/neplmstimetableds");
const Attendance = require("../Models/neplmsattendanceds");
const LedgerStud = require("../Models/ledgerstud");
const MFeesCol = require("../Models/mfeescol");
const ConductExam = require("../Models/conductexamds");
const ConductExamCourse = require("../Models/conductexamcourseds");
const ConductExamRoll = require("../Models/conductexamrollds");
const ConductExamFee = require("../Models/conductexamfeeds");
const Invigilation = require("../Models/conductexaminvigilationds");
const InvigilatorAllocation = require("../Models/conductexaminvigilatorallocationds");
const Examiner = require("../Models/conductexamexaminerds");
const ExaminerAllotment = require("../Models/conductexamexaminerallotmentds");
const ExamMarks2 = require("../Models/examinationmodel2marksds");
const BudgetCategory = require("../Models/newbudgetcategoryds");
const BudgetItem = require("../Models/newbudgetitemds");
const Vendor = require("../Models/purchasenewvendords");
const Store = require("../Models/purchasenewstoreds");
const ItemMaster = require("../Models/purchasenewitemmasterds");
const Indent = require("../Models/purchasenewindentds");
const Rfp = require("../Models/purchasenewrfpds");
const PurchaseOrder = require("../Models/purchasenewpurchaseorderds");
const LeaveType = require("../Models/hrleavetypeds");
const LeaveBalance = require("../Models/hrleavebalanceds");
const LeaveApplication = require("../Models/hrleaveapplicationds");
const EmployeeAttendance = require("../Models/hremployeeattendanceds");
const HrStructure = require("../Models/hrstructure");
const HrSalary = require("../Models/hrsalary");

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const today = new Date();
const dateString = (offset = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const objectIdFor = (value) => new mongoose.Types.ObjectId(crypto.createHash("md5").update(String(value)).digest("hex").slice(0, 24));
const monthName = (date = today) => date.toLocaleString("en-US", { month: "long" });
const academicYears = ["2026-27", "2027-28", "2028-29"];
const semesters = ["1", "2", "3", "4", "5", "6"];
const departments = ["Computer Science", "Management", "Dental Sciences", "Accounts", "HR"];
const subjects = ["Core", "Applied", "Clinical", "Research", "Professional"];
const roleWiseRoles = ["Admin", "HR", "Faculty", "HOD", "Purchase", "Budget", "Finance", "Fees"];
const roleMenuMap = {
  Admin: [
    ["Dashboard", "Management Dashboard", "/management-dashboard"],
    ["Settings", "Configuration Wizard", "/configuration"],
    ["Settings", "Dummy data generator", "/dummy-data-generator"],
    ["User Management", "User data upload", "/studentdataupload"],
    ["Menu Management", "Menu Access Control", "/menuaccesscontrol"]
  ],
  HR: [
    ["Dashboard", "Management Dashboard", "/management-dashboard"],
    ["HR Leave", "Leave Dashboard", "/hrleavedashboard"],
    ["HR Attendance", "Employee Attendance", "/hremployeeattendance"],
    ["HR and Salary", "Employee salary register", "/hrsalaryregister"],
    ["User Management", "Employee database", "/employeedatabase"]
  ],
  Faculty: [
    ["Dashboard", "Faculty dashboard", "/facultydashboard"],
    ["Integrated LMS", "Course Workspace", "/neplmscourseworkspace"],
    ["Integrated LMS", "My Classes", "/neplmsmyclasses"],
    ["Integrated LMS", "Attendance", "/neplmsattendance"],
    ["Integrated LMS", "Class groups", "/neplmsclassgroups"]
  ],
  HOD: [
    ["Dashboard", "HoD dashboard", "/hod-dashboard"],
    ["Integrated LMS", "Course progression", "/neplmscourseprogression"],
    ["Integrated LMS", "Missing timetable", "/neplmsmissingtimetable"],
    ["Examination marks", "View final marks", "/neplmsfinalmarks"],
    ["Academic Configuration", "Course Assessment", "/courseassessment"]
  ],
  Purchase: [
    ["Purchase new", "Indent history", "/purchasenewindenthistory"],
    ["Purchase new", "Officer workbench", "/purchasenewofficerworkbench"],
    ["Purchase new", "Approved RFPs", "/purchasenewapprovedrfps"],
    ["Purchase new", "Vendor comparison", "/purchasenewvendorcomparison"],
    ["Purchase new", "Purchase invoice", "/purchasenewinvoice"]
  ],
  Budget: [
    ["Budget approval", "Budget entry", "/newbudgetentry"],
    ["Budget approval", "Department approval", "/newbudgetdepartmentapproval"],
    ["Budget approval", "Institution approval", "/newbudgetinstitutionapproval"],
    ["Budget approval", "Budget analysis", "/newbudgetanalysis"],
    ["Budget approval", "Budget report", "/newbudgetreport"]
  ],
  Finance: [
    ["Finance", "Journal entry new", "/finance-journal-new"],
    ["Finance", "Payment voucher", "/payment-voucher-new"],
    ["Finance", "Fees cheque reconcilliation", "/fees-cheque-reconciliation"],
    ["HR and Salary", "Salary slip", "/salaryslip"],
    ["Purchase new", "Invoice payment", "/purchasenewinvoicepayment"]
  ],
  Fees: [
    ["Dashboard", "Fees dashboard", "/fees-dashboard"],
    ["Fees", "Fee configuration regulation", "/mfeesconfig"],
    ["Fees", "Fees Application Auto", "/feesapplicationauto"],
    ["Fees", "Counter Fee 5", "/counterfee5"],
    ["Fees", "Fees paid report", "/feespaidreport"],
    ["Fees", "Pending fees", "/pendingfees"]
  ]
};
const feeItems = [
  { feegroup: "Tuition", feeitem: "Tuition Fee", amount: 25000 },
  { feegroup: "Library", feeitem: "Library Fee", amount: 2500 },
  { feegroup: "Exam", feeitem: "Examination Fee", amount: 3000 },
  { feegroup: "Development", feeitem: "Development Fee", amount: 5000 }
];

const summaryLine = (label, count, skipped = false) => ({ label, count, status: skipped ? "Skipped" : "Created / updated" });

async function upsertMany(Model, rows, keys) {
  if (!rows.length) return 0;
  const ops = rows.map((row) => {
    const filter = {};
    keys.forEach((key) => { filter[key] = row[key]; });
    return {
      updateOne: {
        filter,
        update: { $set: row },
        upsert: true
      }
    };
  });
  const result = await Model.bulkWrite(ops, { ordered: false });
  return (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
}

function userPayload({ colid, user, index, role, academicyear, program, programcode, regulation, semester }) {
  const isStudent = /^student$/i.test(role);
  const emailPrefix = isStudent ? "dummy.student" : `dummy.${role.toLowerCase().replace(/\s+/g, "")}`;
  const email = `${emailPrefix}.${colid}.${index}@example.edu`;
  return {
    email,
    name: `${role} Dummy ${index}`,
    phone: `90000${String(index).padStart(5, "0")}`.slice(0, 10),
    password: `Dummy@${colid}${index}`,
    role,
    regno: isStudent ? `${academicyear.replace("-", "")}-${programcode}-${String(index).padStart(4, "0")}` : email,
    scholarnumber: isStudent ? `${academicyear.slice(2, 4)}${academicyear.slice(5, 7)}${programcode}${String(index).padStart(4, "0")}` : "NA",
    abcid: isStudent ? `ABC${colid}${String(index).padStart(6, "0")}` : "NA",
    program: isStudent ? program : "NA",
    programcode: isStudent ? programcode : "NA",
    admissionyear: academicyear,
    academicyear,
    rollno: isStudent ? String(index).padStart(4, "0") : "NA",
    semester: isStudent ? semester : "NA",
    section: isStudent ? ["A", "B"][index % 2] : "NA",
    gender: index % 2 ? "Male" : "Female",
    category: ["General", "SC", "ST", "OBC"][index % 4],
    state: "State",
    city: "City",
    district: "District",
    pincode: "700001",
    department: departments[index % departments.length],
    designation: isStudent ? "Student" : role === "Faculty" ? ["Assistant Professor", "Associate Professor", "Professor"][index % 3] : role,
    joiningdate: new Date(`${academicyear.slice(0, 4)}-07-01`),
    regulation,
    Major: isStudent ? subjects[index % subjects.length] : "NA",
    Minor: isStudent ? subjects[(index + 1) % subjects.length] : "NA",
    AEC: isStudent ? "Communication" : "NA",
    SEC: isStudent ? "Skill Lab" : "NA",
    VAC: isStudent ? "Ethics" : "NA",
    IDC: isStudent ? "Data Literacy" : "NA",
    institution: "Demo Institution",
    Mediumofinstruction: "English",
    user,
    colid,
    status: 1,
    lastlogin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    customFields: { dummydata: "Yes" }
  };
}

function programPayload({ colid, user, index, academicyear }) {
  return {
    name: `Demo Program ${index}`,
    user,
    colid,
    year: academicyear,
    program: `Demo Program ${index}`,
    programcode: `DMP${String(index).padStart(2, "0")}`,
    type: ["Grant-in", "Non Grant"][index % 2],
    level: ["UG", "PG"][index % 2],
    institution: "Demo Institution",
    department: departments[index % departments.length],
    durationinyear: index % 2 ? 3 : 2,
    totalcredits: 120,
    typeofsession: "Semester",
    introductionyear: "2026",
    Order: index,
    status1: "Active"
  };
}

exports.generateDummyData = async (req, res) => {
  const started = Date.now();
  const colid = num(req.body.colid);
  const user = text(req.body.user) || "dummy.generator";
  const count = clamp(num(req.body.count, 5), 1, 100);
  const academicyear = text(req.body.academicyear) || academicYears[0];
  const includeExistingUsers = req.body.includeExistingUsers !== false;
  const summary = [];

  try {
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const existingRun = await DummyDataLog.findOne({ colid }).sort({ createdAt: 1 }).lean();
    const password = text(req.body.password);
    const rerun = !!existingRun;
    if (rerun && password !== "kumropatash") {
      return res.status(403).json({
        success: false,
        needsPassword: true,
        message: "Dummy data was already generated for this institution. Enter the override password to run it again.",
        summary
      });
    }

    const programCount = clamp(num(req.body.programs, Math.max(2, Math.ceil(count / 5))), 1, 20);
    const studentCount = clamp(num(req.body.students, count), 1, 200);
    const employeeCount = clamp(Math.max(num(req.body.employees, Math.max(3, Math.ceil(count / 2))), roleWiseRoles.length), roleWiseRoles.length, 100);
    const perCourseCount = clamp(num(req.body.recordsPerCourse, Math.min(count, 10)), 1, 50);

    const programs = Array.from({ length: programCount }, (_, i) => programPayload({ colid, user, index: i + 1, academicyear }));
    await upsertMany(MPrograms, programs, ["colid", "programcode"]);
    summary.push(summaryLine("Program management", programs.length));

    const regulation = `REG-${academicyear}`;
    await upsertMany(RegulationMaster, [{ colid, regulation, description: `Dummy regulation for ${academicyear}`, isactive: "Yes" }], ["colid", "regulation"]);
    summary.push(summaryLine("Regulation master", 1));

    const studentRows = Array.from({ length: studentCount }, (_, i) => {
      const p = programs[i % programs.length];
      return userPayload({ colid, user, index: i + 1, role: "Student", academicyear, program: p.program, programcode: p.programcode, regulation, semester: semesters[i % semesters.length] });
    });
    const employeeRows = Array.from({ length: employeeCount }, (_, i) => {
      const role = roleWiseRoles[i % roleWiseRoles.length];
      const p = programs[i % programs.length];
      return userPayload({ colid, user, index: i + 1, role, academicyear, program: p.program, programcode: p.programcode, regulation, semester: "NA" });
    });
    await upsertMany(User, [...studentRows, ...employeeRows], ["email"]);
    summary.push(summaryLine("Users: students", studentRows.length));
    summary.push(summaryLine("Users: employees / faculty", employeeRows.length));

    const menuAccessRows = roleWiseRoles.flatMap((role) => (roleMenuMap[role] || []).map(([menugroup, title, path]) => ({
      colid,
      menugroup,
      groupname: menugroup,
      title,
      path,
      role,
      access: "Allow",
      user,
      status1: "Submitted",
      comments: "Dummy data generator"
    })));
    await upsertMany(MenuAccess, menuAccessRows, ["colid", "menugroup", "title", "path", "role"]);
    summary.push(summaryLine("Role wise menu access", menuAccessRows.length));

    const students = includeExistingUsers
      ? await User.find({ colid, role: /^Student$/i }).limit(Math.max(studentCount, 200)).lean()
      : studentRows;
    const employees = includeExistingUsers
      ? await User.find({ colid, role: { $not: /^Student$/i } }).limit(Math.max(employeeCount, 100)).lean()
      : employeeRows;
    const faculties = employees.filter((row) => /^Faculty$/i.test(row.role)) || employees;

    const subjectRows = [];
    const courseRows = [];
    programs.forEach((p, pi) => {
      subjects.slice(0, 3).forEach((subject, si) => {
        const type = si === 0 ? "Major" : si === 1 ? "Minor" : "IDC";
        const semester = semesters[(pi + si) % semesters.length];
        subjectRows.push({ colid, user, regulation, academicyear, program: p.program, programcode: p.programcode, subject, type, totalseats: 60, status: "Active" });
        for (let c = 1; c <= Math.max(2, Math.ceil(perCourseCount / 3)); c += 1) {
          courseRows.push({
            colid,
            user,
            academicyear,
            regulation,
            subject,
            type,
            semester,
            program: p.program,
            programcode: p.programcode,
            course: `${subject} Course ${c}`,
            coursecode: `${p.programcode}-${type.slice(0, 2).toUpperCase()}${si + 1}${c}`,
            coursetype: c % 3 === 0 ? "Practical" : "Theory",
            deliverytype: si === 2 ? "Elective" : "Compulsory",
            coursemastercode: `${subject.slice(0, 3).toUpperCase()}-${c}`,
            credit: c % 3 === 0 ? 2 : 4,
            status: "Active"
          });
        }
      });
    });
    await upsertMany(RegulationSubject, subjectRows, ["colid", "academicyear", "regulation", "programcode", "subject", "type"]);
    await upsertMany(RegulationCourseMap, courseRows, ["colid", "academicyear", "regulation", "programcode", "coursecode"]);
    summary.push(summaryLine("Regulation subjects", subjectRows.length));
    summary.push(summaryLine("Regulation course map", courseRows.length));

    const assessmentRows = courseRows.flatMap((course) => ([
      { ...course, assessmentgroup: "Internal", grouptype: "Average", scoretype: "Internal", assessmentcomponent: "Assignment", marks: 20, passmarks: 8, weightage: 20, credits: course.credit },
      { ...course, assessmentgroup: "External", grouptype: "Average", scoretype: "External", assessmentcomponent: "End Semester", marks: 80, passmarks: 32, weightage: 80, credits: course.credit }
    ]));
    await upsertMany(CourseAssessment, assessmentRows, ["colid", "academicyear", "regulation", "programcode", "coursecode", "assessmentcomponent"]);
    summary.push(summaryLine("Course assessment", assessmentRows.length));

    const workloadRows = courseRows.map((course, i) => {
      const faculty = faculties[i % Math.max(1, faculties.length)] || employees[i % Math.max(1, employees.length)];
      return {
        ...course,
        facultyname: faculty?.name || "Dummy Faculty",
        facultyemail: faculty?.email || faculty?.user || `dummy.faculty.${colid}@example.edu`,
        facultydepartment: faculty?.department || departments[i % departments.length],
        hoursperweek: course.coursetype === "Practical" ? 4 : 3,
        status: "Active"
      };
    });
    await upsertMany(WorkloadAssignment, workloadRows, ["colid", "academicyear", "programcode", "coursecode", "facultyemail"]);
    summary.push(summaryLine("Workload assignment", workloadRows.length));

    const timetableRows = workloadRows.flatMap((course, i) => Array.from({ length: Math.min(perCourseCount, 6) }, (_, j) => ({
      colid,
      user,
      academicyear,
      regulation,
      program: course.program,
      programcode: course.programcode,
      faculty: course.facultyname,
      facultyemail: course.facultyemail,
      campus: "Main Campus",
      building: "Academic Block",
      floor: String((i % 3) + 1),
      roomno: `R-${100 + i}`,
      major: course.subject,
      semester: course.semester,
      section: ["A", "B"][j % 2],
      course: course.course,
      coursecode: course.coursecode,
      classdate: dateString(-(j + 1)),
      classtime: `${9 + (j % 5)}:00`,
      period: `P${(j % 5) + 1}`,
      durationminutes: 60,
      module: `Module ${j + 1}`,
      topic: `${course.course} Topic ${j + 1}`,
      workcompleted: j % 2 === 0 ? `${course.course} Topic ${j + 1}` : "",
      status: "Active"
    })));
    await upsertMany(Timetable, timetableRows, ["colid", "academicyear", "coursecode", "facultyemail", "classdate", "classtime"]);
    summary.push(summaryLine("LMS timetable", timetableRows.length));

    const attendanceRows = [];
    timetableRows.forEach((cls, ci) => {
      const matching = students.filter((s) => text(s.programcode) === text(cls.programcode) && text(s.semester) === text(cls.semester)).slice(0, Math.min(25, studentCount));
      matching.forEach((student, si) => attendanceRows.push({
        classid: cls._id || objectIdFor(`${colid}-${cls.coursecode}-${cls.classdate}-${cls.classtime}`),
        studentid: student._id || objectIdFor(`${colid}-${student.email || student.regno}`),
        student: student.name,
        studentemail: student.email,
        studentphone: student.phone,
        regno: student.regno,
        rollno: student.rollno,
        program: student.program,
        programcode: student.programcode,
        academicyear,
        semester: student.semester,
        section: student.section,
        major: student.Major,
        faculty: cls.faculty,
        facultyemail: cls.facultyemail,
        course: cls.course,
        coursecode: cls.coursecode,
        classdate: cls.classdate,
        classtime: cls.classtime,
        attendance: (ci + si) % 7 === 0 ? 0 : 1,
        type: "Regular",
        comments: "Dummy attendance",
        colid,
        user
      }));
    });
    await upsertMany(Attendance, attendanceRows, ["colid", "regno", "coursecode", "classdate", "classtime", "type"]);
    summary.push(summaryLine("LMS attendance", attendanceRows.length));

    const ledgerRows = students.flatMap((student, i) => feeItems.map((fee, fi) => {
      const paid = fi % 2 === 0 ? Math.round(fee.amount * 0.5) : 0;
      return {
        name: student.name,
        user,
        feegroup: fee.feegroup,
        regno: student.regno,
        student: student.name,
        feeitem: fee.feeitem,
        amount: fee.amount,
        paid,
        concession: 0,
        balance: fee.amount - paid,
        Latefinedue: 0,
        Latefinepaid: 0,
        refundable: "No",
        refundamount: 0,
        feebook: "Default",
        feecounter: "Counter 1",
        paymode: paid ? "Cash" : "",
        feecategory: "Regular",
        feetype: "Academic",
        semester: student.semester,
        cashbook: "Main",
        institution: student.institution || "Demo Institution",
        type: "Regular",
        comments: "Dummy ledger",
        academicyear,
        colid,
        classdate: new Date(),
        duedate: new Date(Date.now() - (i + fi + 1) * 24 * 60 * 60 * 1000),
        paiddate: paid ? new Date() : undefined,
        status: "Active",
        programcode: student.programcode,
        regulation: student.regulation,
        major: student.Major,
        minor: student.Minor,
        gender: student.gender
      };
    }));
    await upsertMany(LedgerStud, ledgerRows, ["colid", "regno", "academicyear", "feegroup", "feeitem"]);
    await upsertMany(MFeesCol, ledgerRows.filter((r) => r.paid).map((r) => ({
      name: r.student,
      user,
      colid,
      year: academicyear,
      programcode: r.programcode,
      student: r.student,
      regno: r.regno,
      feegroup: r.feegroup,
      feeitem: r.feeitem,
      semester: r.semester,
      feecategory: r.feecategory,
      paydate: new Date(),
      amount: r.paid,
      paymode: "Cash",
      payref: `DUMMY-${r.regno}-${r.feeitem}`,
      paystatus: "Paid",
      status1: "Active"
    })), ["colid", "regno", "year", "feeitem", "payref"]);
    summary.push(summaryLine("Fees ledgerstud", ledgerRows.length));
    summary.push(summaryLine("Fees collection", ledgerRows.filter((r) => r.paid).length));

    const exam = { colid, user, academicyear, examname: `Dummy Regular Exam ${academicyear}`, examcode: `DUMMY-${academicyear}`, session: "Odd", type: "Regular" };
    await upsertMany(ConductExam, [exam], ["colid", "academicyear", "examcode"]);
    const examCourseRows = courseRows.map((course, i) => ({
      colid,
      user,
      academicyear,
      regulation,
      exam: exam.examname,
      examcode: exam.examcode,
      program: course.program,
      programcode: course.programcode,
      type: course.type === "Minor" ? "Minor" : "Major",
      subject: course.subject,
      semester: course.semester,
      course: course.course,
      coursecode: course.coursecode,
      coursetype: course.coursetype,
      coursemastercode: course.coursemastercode,
      examdate: dateString(10 + i),
      examslot: i % 2 ? "Afternoon" : "Morning"
    }));
    await upsertMany(ConductExamCourse, examCourseRows, ["colid", "academicyear", "regulation", "examcode", "programcode", "coursecode"]);
    await upsertMany(ConductExamFee, examCourseRows.map((row) => ({ ...row, regularfee: 500, supplementaryfee: 800, status: "Active" })), ["colid", "academicyear", "examcode", "programcode", "semester", "coursecode"]);
    summary.push(summaryLine("Conduct exam", 1));
    summary.push(summaryLine("Conduct exam courses / fees", examCourseRows.length));

    const examRollRows = [];
    examCourseRows.forEach((course) => {
      students.filter((s) => text(s.programcode) === text(course.programcode) && text(s.semester) === text(course.semester)).slice(0, Math.min(30, studentCount)).forEach((student, si) => {
        examRollRows.push({
          colid,
          user,
          academicyear,
          regulation,
          exam: exam.examname,
          examcode: exam.examcode,
          program: student.program,
          programcode: student.programcode,
          type: course.type,
          subject: course.subject,
          semester: student.semester,
          course: course.course,
          coursecode: course.coursecode,
          student: student.name,
          regno: student.regno,
          email: student.email,
          phone: student.phone,
          section: student.section,
          applied: "Yes",
          admitcardeligible: "Yes",
          attended: si % 8 === 0 ? "No" : "Yes",
          attendance: "Yes",
          fees: "Yes",
          disciplinary: "Yes",
          atkt: "Yes",
          examdate: course.examdate,
          examslot: course.examslot,
          campus: "Main Campus",
          building: "Academic Block",
          examroom: `R-${100 + (si % 10)}`,
          seatno: `Seat ${si + 1}`
        });
      });
    });
    await upsertMany(ConductExamRoll, examRollRows, ["colid", "academicyear", "regulation", "examcode", "programcode", "semester", "coursecode", "regno"]);
    summary.push(summaryLine("Exam roll", examRollRows.length));

    const invigilators = employees.slice(0, Math.min(10, employees.length));
    await upsertMany(Invigilation, invigilators.map((emp) => ({ colid, user, academicyear, regulation, exam: exam.examname, examcode: exam.examcode, invigilatorname: emp.name, invigilatoremail: emp.email, amountpersession: 750 })), ["colid", "academicyear", "regulation", "examcode", "invigilatoremail"]);
    await upsertMany(InvigilatorAllocation, examCourseRows.slice(0, Math.min(20, examCourseRows.length)).map((course, i) => {
      const emp = invigilators[i % Math.max(1, invigilators.length)] || employees[0];
      return { colid, user, academicyear, regulation, exam: exam.examname, examcode: exam.examcode, campus: "Main Campus", building: "Academic Block", room: `R-${100 + i}`, invigilator: emp?.name || "Dummy Invigilator", invigilatoremail: emp?.email || user, examdate: course.examdate, slot: course.examslot, attendance: i % 3 ? "Present" : "" };
    }), ["colid", "academicyear", "examcode", "examdate", "slot", "room"]);
    summary.push(summaryLine("Invigilation", invigilators.length));

    await upsertMany(Examiner, examCourseRows.map((course, i) => {
      const emp = employees[i % Math.max(1, employees.length)];
      return { ...course, examinername: emp?.name || "Dummy Examiner", examineremail: emp?.email || user };
    }), ["colid", "academicyear", "examcode", "programcode", "coursecode", "examineremail"]);
    await upsertMany(ExaminerAllotment, examRollRows.slice(0, Math.min(500, examRollRows.length)).map((roll, i) => {
      const emp = employees[i % Math.max(1, employees.length)];
      return { ...roll, examinername: emp?.name || "Dummy Examiner", examineremail: emp?.email || user, startdate: dateString(15), enddate: dateString(25), status: "Allocated", evaluationstatus: i % 3 ? "Evaluated" : "", evaluationdate: i % 3 ? dateString(18) : "" };
    }), ["colid", "academicyear", "examcode", "programcode", "coursecode", "regno"]);
    summary.push(summaryLine("Examiner allotment", Math.min(500, examRollRows.length)));

    const markRows = examRollRows.slice(0, Math.min(500, examRollRows.length)).map((roll, i) => {
      const theoryObtained = 45 + (i % 45);
      const practicalObtained = 20 + (i % 25);
      const total = 100;
      const obtained = theoryObtained + practicalObtained;
      const gradepoint = obtained >= 85 ? 10 : obtained >= 75 ? 9 : obtained >= 65 ? 8 : obtained >= 55 ? 7 : obtained >= 45 ? 6 : 0;
      return {
        colid,
        user,
        academicyear,
        regulation,
        exam: exam.examname,
        examcode: exam.examcode,
        program: roll.program,
        programcode: roll.programcode,
        semester: roll.semester,
        course: roll.course,
        coursecode: roll.coursecode,
        credit: 4,
        student: roll.student,
        regno: roll.regno,
        abcid: students.find((s) => s.regno === roll.regno)?.abcid || "",
        theorymarks: 70,
        theoryobtained: theoryObtained,
        theorypercentage: Number(((theoryObtained / 70) * 100).toFixed(2)),
        theorygradepoint: gradepoint,
        theorygrade: gradepoint ? "A" : "F",
        practicalmarks: 30,
        practicaltotal: 30,
        practicalpercentage: Number(((practicalObtained / 30) * 100).toFixed(2)),
        practicalgradepoint: gradepoint,
        practicalgrade: gradepoint ? "A" : "F",
        overalltotalmarks: total,
        overallobtained: obtained,
        overallpercentage: obtained,
        overallgradepoint: gradepoint,
        overallgrade: gradepoint ? "A" : "F",
        gpa: gradepoint * 4,
        status: gradepoint ? "Pass" : "Fail",
        attempt: 1,
        type: "Regular",
        examdate: roll.examdate,
        resultprocessdate: dateString(30)
      };
    });
    await upsertMany(ExamMarks2, markRows, ["colid", "academicyear", "examcode", "programcode", "semester", "coursecode", "regno", "attempt"]);
    summary.push(summaryLine("Examination marks model 2", markRows.length));

    const budgetCategories = ["IT Equipment", "Laboratory", "Library", "Maintenance"].map((category) => ({ colid, user, category, type: "Operational", active: "Yes", description: `Dummy ${category}` }));
    await upsertMany(BudgetCategory, budgetCategories, ["colid", "category"]);
    const budgetRows = employees.slice(0, Math.min(employeeCount, 20)).flatMap((emp, i) => budgetCategories.map((category, ci) => ({
      colid,
      academicyear,
      department: emp.department || departments[i % departments.length],
      category: category.category,
      categorytype: category.type,
      item: `${category.category} Item ${ci + 1}`,
      amount: 50000 + (i + ci) * 2500,
      utilized: 10000 + ci * 500,
      remaining: 40000 + i * 2000,
      status: "Approved",
      stage: "Institution Approved",
      currentlevel: 99,
      submittedby: emp.email,
      submittedbyname: emp.name,
      submittedrole: emp.role,
      approvedat: new Date(),
      history: [{ action: "Dummy Approved", stage: "Institution Approved", username: emp.name, useremail: emp.email, role: emp.role, amount: 50000 }]
    })));
    await upsertMany(BudgetItem, budgetRows, ["colid", "academicyear", "department", "category", "item"]);
    summary.push(summaryLine("Budget categories", budgetCategories.length));
    summary.push(summaryLine("Budget approved items", budgetRows.length));

    const vendorRows = Array.from({ length: Math.min(count, 20) }, (_, i) => ({
      colid,
      companyname: `Dummy Vendor ${i + 1}`,
      type: "Pvt Ltd",
      address: "Demo Vendor Address",
      gstno: `GSTDUMMY${colid}${i + 1}`,
      panno: `PANDM${String(i + 1).padStart(4, "0")}`,
      contactperson: `Vendor Contact ${i + 1}`,
      contactemail: `vendor.${colid}.${i + 1}@example.com`,
      contactphone: `98888${String(i + 1).padStart(5, "0")}`.slice(0, 10),
      username: `vendor.${colid}.${i + 1}@example.com`,
      password: `Vendor@${i + 1}`,
      status: "Active",
      createdby: user,
      createdbyname: "Dummy Generator"
    }));
    await upsertMany(Vendor, vendorRows, ["colid", "username"]);
    const stores = ["Central Store", "Laboratory Store", "Library Store"].map((store) => ({ colid, user, store, description: `${store} dummy data`, status: "Active" }));
    await upsertMany(Store, stores, ["colid", "store"]);
    const itemRows = stores.flatMap((store, si) => budgetCategories.map((cat, ci) => ({ colid, user, store: store.store, storedescription: store.description, category: cat.category, categorytype: cat.type, item: `${cat.category} ${si + 1}-${ci + 1}`, description: "Dummy item", approximateprice: 1000 + ci * 500, quantityavailable: 100, unit: "Nos", dimension: "Standard", status: "Active" })));
    await upsertMany(ItemMaster, itemRows, ["colid", "store", "category", "item"]);
    const indentRows = itemRows.slice(0, Math.min(50, itemRows.length)).map((item, i) => {
      const emp = employees[i % Math.max(1, employees.length)];
      const quantity = 2 + (i % 5);
      return { colid, department: emp?.department || departments[i % departments.length], store: item.store, storedescription: item.storedescription, category: item.category, categorytype: item.categorytype, item: item.item, description: item.description, quantity, approxprice: item.approximateprice, approximatevalue: item.approximateprice, approximatetotalcost: quantity * item.approximateprice, status: "Approved", stage: "Institution Approved", procurementstatus: "Pending RFP", currentlevel: 99, submittedby: emp?.email || user, submittedbyname: emp?.name || "Dummy User", submittedrole: emp?.role || "User", approvedat: new Date() };
    });
    await upsertMany(Indent, indentRows, ["colid", "department", "store", "category", "item", "submittedby"]);
    const rfpRows = vendorRows.slice(0, Math.min(5, vendorRows.length)).map((vendor, i) => ({ colid, rfpid: `RFP-DUMMY-${colid}-${i + 1}`, title: `Dummy RFP ${i + 1}`, category: budgetCategories[i % budgetCategories.length].category, officername: employees[i % Math.max(1, employees.length)]?.name || "Purchase Officer", officeremail: employees[i % Math.max(1, employees.length)]?.email || user, items: indentRows.slice(i, i + 2).map((ind) => ({ department: ind.department, requestedby: ind.submittedby, requestedbyname: ind.submittedbyname, item: ind.item, description: ind.description, quantity: ind.quantity, approximatevalue: ind.approximatevalue, approximatetotalcost: ind.approximatetotalcost })), qualificationcriteria: "Standard eligibility", experience: "Three years", startdatetime: new Date(), enddatetime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), paymentterms: "30 days", deliveryterms: "Within 15 days", terms: "Dummy RFP terms", status: "Approved", stage: "Approved", currentlevel: 99, createdby: user, createdbyname: "Dummy Generator", approvedat: new Date() }));
    await upsertMany(Rfp, rfpRows, ["colid", "rfpid"]);
    await upsertMany(PurchaseOrder, rfpRows.map((rfp, i) => {
      const vendor = vendorRows[i % vendorRows.length];
      const items = (rfp.items || []).map((item) => ({ item: item.item, description: item.description, quantity: item.quantity, unitprice: item.approximatevalue, gstpercent: 18, gstamount: item.approximatetotalcost * 0.18, total: item.approximatetotalcost * 1.18 }));
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitprice), 0);
      const gsttotal = subtotal * 0.18;
      return { colid, poid: `PO-DUMMY-${colid}-${i + 1}`, title: `PO for ${rfp.title}`, rfpid: rfp.rfpid, rfptitle: rfp.title, vendorname: vendor.companyname, vendorusername: vendor.username, vendoremail: vendor.contactemail, items, subtotal, gsttotal, grandtotal: subtotal + gsttotal, paymentterms: rfp.paymentterms, deliveryterms: rfp.deliveryterms, penaltyclause: "As per RFP", generalterms: "Dummy PO terms", status: "Approved", stage: "Approved", currentlevel: 99, createdby: user, createdbyname: "Dummy Generator", approvedat: new Date() };
    }), ["colid", "poid"]);
    summary.push(summaryLine("Vendors", vendorRows.length));
    summary.push(summaryLine("Purchase stores / items", stores.length + itemRows.length));
    summary.push(summaryLine("Purchase indents / RFP / PO", indentRows.length + rfpRows.length + rfpRows.length));

    const leaveTypes = [
      { colid, user, leavetype: "Casual Leave", leavetypecategory: "Non EL", code: "CL", description: "Dummy casual leave", roles: "All", annualquota: 12, status: "Active" },
      { colid, user, leavetype: "Earned Leave", leavetypecategory: "EL", code: "EL", description: "Dummy earned leave", roles: "All", annualquota: 18, carryforwardcriteria: "Carry Forward", carryforwardmaxdays: 30, status: "Active" },
      { colid, user, leavetype: "Compensatory Leave", leavetypecategory: "Non EL", code: "COMP", description: "Dummy compensatory leave", roles: "All", annualquota: 0, status: "Active" }
    ];
    await upsertMany(LeaveType, leaveTypes, ["colid", "leavetype"]);
    const cycle = `${academicyear} Cycle`;
    const balanceRows = employees.flatMap((emp) => leaveTypes.map((lt) => ({ colid, user, cyclename: cycle, employeename: emp.name, employeeemail: emp.email, department: emp.department, leavetype: lt.leavetype, openingbalance: lt.annualquota, carryforward: 0, earned: 0, used: lt.leavetype === "Casual Leave" ? 1 : 0, balance: lt.leavetype === "Casual Leave" ? lt.annualquota - 1 : lt.annualquota, status: "Active" })));
    await upsertMany(LeaveBalance, balanceRows, ["colid", "cyclename", "employeeemail", "leavetype"]);
    await upsertMany(LeaveApplication, employees.slice(0, Math.min(20, employees.length)).map((emp, i) => ({ colid, user, cyclename: cycle, employeename: emp.name, employeeemail: emp.email, department: emp.department, leavetype: "Casual Leave", fromdate: dateString(-(i + 3)), todate: dateString(-(i + 3)), days: 1, reason: "Dummy leave", employeecomment: "Dummy request", currentlevel: 1, balancededucted: i % 2 === 0, status: i % 2 === 0 ? "Approved" : "Applied", finalcomment: "Dummy workflow" })), ["colid", "employeeemail", "fromdate", "leavetype"]);
    const employeeAttendanceRows = employees.flatMap((emp, i) => Array.from({ length: Math.min(perCourseCount, 10) }, (_, j) => ({ colid, user, academicyear, month: monthName(), date: dateString(-j), employeename: emp.name, employeeemail: emp.email, role: emp.role, attendance: (i + j) % 9 === 0 ? 0 : 1, status: (i + j) % 9 === 0 ? "Absent" : "Present", intime: "09:30", outtime: "17:30", islate: j % 4 === 0 ? "Yes" : "No", isearly: "No", isovertime: j % 5 === 0 ? "Yes" : "No", overtimerate: j % 5 === 0 ? 250 : 0, latesalarydeduction: j % 4 === 0 ? 100 : 0, netsalary: j % 5 === 0 ? 250 : j % 4 === 0 ? -100 : 0, approvalstatus: "Approved", actiontype: "Add", currentlevel: 1 })));
    await upsertMany(EmployeeAttendance, employeeAttendanceRows, ["colid", "academicyear", "month", "employeeemail", "date"]);
    await upsertMany(HrStructure, employees.slice(0, Math.min(20, employees.length)).map((emp) => ({ colid, user, name: emp.name, struture: "Dummy Structure", description: "Dummy salary structure", businessrole: emp.role, paycommission: "Institution", designation: emp.designation, type: "Earning", level: "Level 1", status1: "Active" })), ["colid", "name", "designation"]);
    const salaryRows = employees.flatMap((emp) => ([
      { colid, user, name: emp.name, year: academicyear, month: monthName(), duedate: new Date(), structure: "Dummy Structure", employee: emp.name, empid: emp.email, component: "Basic", amount: 50000, type: "Earning", level: "Monthly", paystatus: "Due", status1: "Active" },
      { colid, user, name: emp.name, year: academicyear, month: monthName(), duedate: new Date(), structure: "Dummy Structure", employee: emp.name, empid: emp.email, component: "HRA", amount: 15000, type: "Earning", level: "Monthly", paystatus: "Due", status1: "Active" },
      { colid, user, name: emp.name, year: academicyear, month: monthName(), duedate: new Date(), structure: "Dummy Structure", employee: emp.name, empid: emp.email, component: "TDS", amount: -2500, type: "Deduction", level: "Monthly", paystatus: "Due", status1: "Active" }
    ]));
    await upsertMany(HrSalary, salaryRows, ["colid", "year", "month", "empid", "component"]);
    summary.push(summaryLine("HR leave", leaveTypes.length + balanceRows.length));
    summary.push(summaryLine("HR attendance", employeeAttendanceRows.length));
    summary.push(summaryLine("HR salary processing", salaryRows.length));

    const roleUsers = await User.find({ colid, role: { $in: roleWiseRoles } })
      .select("name email password role department designation status")
      .sort({ role: 1, name: 1 })
      .lean();

    await DummyDataLog.create({
      colid,
      academicyear,
      generatedby: user,
      generatedbyname: text(req.body.username),
      count,
      rerun: rerun ? "Yes" : "No",
      summary
    });

    res.json({
      success: true,
      message: "Dummy data generation completed",
      summary,
      roleUsers,
      meta: { colid, academicyear, count, rerun: rerun ? "Yes" : "No", seconds: Number(((Date.now() - started) / 1000).toFixed(2)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, summary });
  }
};
