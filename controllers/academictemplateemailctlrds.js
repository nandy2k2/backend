const nodemailer = require("nodemailer");
const XLSX = require("xlsx");
const EmailConfiguration = require("../Models/emailconfigurationds");

const clean = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};
const smtpHost = (config = {}) => config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : "");
const emailConfigLabel = (row = {}) => `${row.provider || "Email"} / ${row.type || "General"} / ${row.username || ""}`;

const transporterFor = (config = {}) => {
  const host = smtpHost(config);
  if (!config.username || !config.password || !host) throw new Error("Selected email configuration is incomplete");
  return nodemailer.createTransport({
    host,
    port: Number(config.port || 587),
    secure: ["yes", "true"].includes(clean(config.secure).toLowerCase()) || Number(config.port) === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const row = (group, key, page, fields, sample = {}) => ({
  group,
  key,
  page,
  fields,
  sample
});

const catalog = [
  row("Academic configuration", "program-management", "Program management", ["academicyear", "program", "programcode", "faculty", "institution", "department", "status", "excluded"], { academicyear: "2026-27", program: "B.Tech", programcode: "BT001", faculty: "Engineering", institution: "Main Institute", department: "Computer Science", status: "Active", excluded: "No" }),
  row("Academic configuration", "regulation", "Regulation", ["academicyear", "regulation", "program", "programcode", "description", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", description: "Regulation 2026", status: "Active" }),
  row("Academic configuration", "regulation-subjects", "Regulation subjects", ["academicyear", "regulation", "program", "programcode", "semester", "subjecttype", "subject", "subjectcode", "credits", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", subjecttype: "Major", subject: "Programming", subjectcode: "CS101", credits: "4", status: "Active" }),
  row("Academic configuration", "regulation-course-map", "Regulation course map", ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "coursetype", "credits", "amount", "deliverytype", "paytype", "electivetype", "prerequisitecourse", "prerequisitecoursecode", "faculty", "institution", "department", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", course: "Programming", coursecode: "CS101", coursetype: "Theory", credits: "4", amount: "0", deliverytype: "Compulsory", paytype: "Unpaid", electivetype: "Open", prerequisitecourse: "", prerequisitecoursecode: "", faculty: "Engineering", institution: "Main Institute", department: "Computer Science", status: "Active" }),
  row("Academic configuration", "assessment-components", "Assessment components", ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "componenttype", "scoretype", "assessmentcomponent", "maxmarks", "credits"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", course: "Programming", coursecode: "CS101", componenttype: "Theory", scoretype: "Internal", assessmentcomponent: "Internal Test 1", maxmarks: "20", credits: "4" }),
  row("Academic configuration", "specialization-new", "Specialization new", ["academicyear", "regulation", "program", "programcode", "semester", "specialization", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "5", specialization: "Artificial Intelligence", status: "Active" }),

  row("Fees", "fee-configuration-regulation", "Fee configuration regulation", ["academicyear", "admissionyear", "regulation", "program", "programcode", "semester", "feegroup", "feeitem", "feecategory", "amount", "duedate", "status"], { academicyear: "2026-27", admissionyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", feegroup: "Tuition", feeitem: "Tuition Fee", feecategory: "Academic", amount: "50000", duedate: "2026-08-31", status: "Active" }),
  row("Fees", "student-ledger", "Student ledger", ["academicyear", "regulation", "program", "programcode", "semester", "student", "regno", "user", "feegroup", "feeitem", "amount", "paid", "concession", "balance", "duedate", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", student: "Sample Student", regno: "BT26001", user: "student@example.com", feegroup: "Tuition", feeitem: "Tuition Fee", amount: "50000", paid: "0", concession: "0", balance: "50000", duedate: "2026-08-31", status: "Due" }),
  row("Fees", "counter-fees", "Counter fees", ["academicyear", "program", "programcode", "student", "regno", "feegroup", "feeitem", "amount", "paymode", "referenceNumber", "paiddate", "status"], { academicyear: "2026-27", program: "B.Tech", programcode: "BT001", student: "Sample Student", regno: "BT26001", feegroup: "Certificate", feeitem: "Bonafide", amount: "200", paymode: "Cash", referenceNumber: "CF001", paiddate: "2026-09-01", status: "Paid" }),

  row("Workload", "workload-assignment", "Workload assignment", ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "faculty", "facultyemail", "hours", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", course: "Programming", coursecode: "CS101", faculty: "Faculty Name", facultyemail: "faculty@example.com", hours: "4", status: "Active" }),
  row("Workload", "faculty-qualification", "Faculty qualification", ["user", "useremail", "subject", "expertise", "phd", "status"], { user: "Faculty Name", useremail: "faculty@example.com", subject: "Computer Science", expertise: "AI", phd: "Yes", status: "Active" }),
  row("Workload", "module-allocation", "Module allocation", ["order", "academicyear", "regulation", "program", "programcode", "course", "coursecode", "faculty", "facultyemail", "module", "topic", "weightage", "refbook", "description"], { order: "1", academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", course: "Programming", coursecode: "CS101", faculty: "Faculty Name", facultyemail: "faculty@example.com", module: "Module 1", topic: "Basics", weightage: "20", refbook: "Reference Book", description: "Introductory module" }),

  row("LMS", "sectionwise-timetable", "Sectionwise timetable", ["academicyear", "regulation", "program", "programcode", "semester", "section", "course", "coursecode", "faculty", "facultyemail", "classdate", "starttime", "endtime", "lecturetype"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", section: "A", course: "Programming", coursecode: "CS101", faculty: "Faculty Name", facultyemail: "faculty@example.com", classdate: "2026-09-01", starttime: "10:00", endtime: "11:00", lecturetype: "Theory" }),
  row("LMS", "course-material", "Course material", ["academicyear", "regulation", "program", "programcode", "semester", "section", "course", "coursecode", "module", "topic", "title", "filelink", "contenttype", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", section: "A", course: "Programming", coursecode: "CS101", module: "Module 1", topic: "Basics", title: "Introduction", filelink: "https://example.com/file.pdf", contenttype: "PDF", status: "Active" }),
  row("LMS", "lesson-plan-2", "Lesson plan 2", ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "module", "topic", "lectureno", "planneddatefrom", "planneddateto", "actualdatefrom", "actualdateto"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", course: "Programming", coursecode: "CS101", module: "Module 1", topic: "Basics", lectureno: "1", planneddatefrom: "2026-09-01", planneddateto: "2026-09-01", actualdatefrom: "", actualdateto: "" }),

  row("Conduct examination", "create-exam", "Create exam", ["academicyear", "regulation", "program", "programcode", "semester", "examname", "examcode", "session", "type", "startdate", "enddate", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", examname: "Semester I Regular Exam", examcode: "EX2601", session: "Odd", type: "Regular", startdate: "2026-12-01", enddate: "2026-12-20", status: "Active" }),
  row("Conduct examination", "populate-exam-courses", "Populate exam courses", ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode", "coursetype", "examdate", "examslot"], { academicyear: "2026-27", regulation: "R2026", exam: "Semester I Regular Exam", examcode: "EX2601", program: "B.Tech", programcode: "BT001", semester: "1", course: "Programming", coursecode: "CS101", coursetype: "Theory", examdate: "2026-12-05", examslot: "10:00-13:00" }),
  row("Conduct examination", "exam-roll", "Exam roll", ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode", "student", "regno", "examrollno", "examseatno", "admitcardeligible", "attendance"], { academicyear: "2026-27", regulation: "R2026", exam: "Semester I Regular Exam", examcode: "EX2601", program: "B.Tech", programcode: "BT001", semester: "1", course: "Programming", coursecode: "CS101", student: "Sample Student", regno: "BT26001", examrollno: "ER001", examseatno: "S001", admitcardeligible: "Yes", attendance: "Yes" }),
  row("Conduct examination", "exam-rate-card", "Exam rate card", ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "papersetterrate", "moderatorrate", "examinerrate", "practicalrate", "status"], { academicyear: "2026-27", exam: "Semester I Regular Exam", examcode: "EX2601", regulation: "R2026", program: "B.Tech", programcode: "BT001", course: "Programming", coursecode: "CS101", papersetterrate: "1000", moderatorrate: "800", examinerrate: "25", practicalrate: "500", status: "Active" }),

  row("PhD", "phd-thesis-assignment", "PhD thesis assignment", ["academicyear", "regulation", "program", "programcode", "student", "regno", "topic", "subject", "guidename", "guideemail", "startdate", "enddate", "status"], { academicyear: "2026-27", regulation: "PhD2026", program: "PhD", programcode: "PHD001", student: "Research Scholar", regno: "PHD26001", topic: "Research Topic", subject: "Management", guidename: "Guide Name", guideemail: "guide@example.com", startdate: "2026-09-01", enddate: "", status: "Active" }),
  row("PhD", "phd-examiner-panel", "PhD examiner panel", ["academicyear", "regulation", "program", "programcode", "panelname", "description", "status"], { academicyear: "2026-27", regulation: "PhD2026", program: "PhD", programcode: "PHD001", panelname: "Panel A", description: "Thesis examiner panel", status: "Pending" }),
  row("PhD", "phd-examiner-rubrics", "PhD examiner assessment rubrics", ["academicyear", "regulation", "program", "programcode", "group", "topic", "status"], { academicyear: "2026-27", regulation: "PhD2026", program: "PhD", programcode: "PHD001", group: "Originality", topic: "Research contribution", status: "Active" }),

  row("Feedback", "quick-feedback", "Quick feedback", ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "question", "scale", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", course: "Programming", coursecode: "CS101", question: "The session was useful", scale: "Likert 5", status: "Active" }),
  row("Feedback", "continuous-feedback-response", "Continuous feedback response", ["academicyear", "program", "programcode", "course", "coursecode", "student", "regno", "question", "rating", "comments"], { academicyear: "2026-27", program: "B.Tech", programcode: "BT001", course: "Programming", coursecode: "CS101", student: "Sample Student", regno: "BT26001", question: "The session was useful", rating: "5", comments: "Good" }),

  row("Question paper management", "question-pattern", "Question pattern", ["academicyear", "program", "programcode", "pattern", "description", "status"], { academicyear: "2026-27", program: "B.Tech", programcode: "BT001", pattern: "Mid Sem Pattern", description: "Pattern details", status: "Active" }),
  row("Question paper management", "question-pattern-details", "Question pattern details", ["pattern", "section", "question", "group", "subquestion", "questiontype", "mathematical", "prompt", "marks"], { pattern: "Mid Sem Pattern", section: "A", question: "1", group: "", subquestion: "a", questiontype: "Descriptive", mathematical: "No", prompt: "Ask from module 1", marks: "5" }),
  row("Question paper management", "paper-setter-registration", "Paper setter registration", ["academicyear", "regulation", "program", "programcode", "exam", "examcode", "course", "coursecode", "papersetter", "papersetteremail", "startdate", "enddate", "status"], { academicyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", exam: "Semester I Regular Exam", examcode: "EX2601", course: "Programming", coursecode: "CS101", papersetter: "Faculty Name", papersetteremail: "faculty@example.com", startdate: "2026-10-01", enddate: "2026-10-10", status: "Active" }),

  row("Hostel new", "hostel-room", "Hostel room", ["academicyear", "hostel", "building", "floor", "room", "capacity", "status"], { academicyear: "2026-27", hostel: "Boys Hostel", building: "Block A", floor: "1", room: "101", capacity: "3", status: "Active" }),
  row("Hostel new", "hostel-bed", "Hostel bed", ["academicyear", "hostel", "room", "bed", "student", "regno", "status"], { academicyear: "2026-27", hostel: "Boys Hostel", room: "101", bed: "A", student: "Sample Student", regno: "BT26001", status: "Allotted" }),

  row("User management", "user-data-upload", "User data upload", ["name", "email", "phone", "password", "role", "regno", "program", "programcode", "department", "designation", "dateofjoining", "googleemail", "excluded"], { name: "Faculty Name", email: "faculty@example.com", phone: "9999999999", password: "Password@123", role: "Faculty", regno: "EMP001", program: "", programcode: "", department: "Computer Science", designation: "Assistant Professor", dateofjoining: "2026-08-01", googleemail: "faculty@gmail.com", excluded: "No" }),
  row("User management", "student-data-upload", "Student data upload", ["name", "email", "phone", "password", "role", "regno", "academicyear", "admissionyear", "regulation", "program", "programcode", "semester", "section", "fathername", "mothername", "dateofbirth", "category", "annualincome", "freeshipcardholder", "gender", "nationality", "address", "state", "pincode", "googleemail", "excluded"], { name: "Sample Student", email: "student@example.com", phone: "9999999999", password: "Password@123", role: "Student", regno: "BT26001", academicyear: "2026-27", admissionyear: "2026-27", regulation: "R2026", program: "B.Tech", programcode: "BT001", semester: "1", section: "A", fathername: "Father Name", mothername: "Mother Name", dateofbirth: "2008-01-01", category: "General", annualincome: "250000", freeshipcardholder: "No", gender: "Female", nationality: "Indian", address: "Address", state: "State", pincode: "462001", googleemail: "student@gmail.com", excluded: "No" })
];

const makeWorkbookBuffer = (template) => {
  const workbook = XLSX.utils.book_new();
  const sampleRow = template.fields.reduce((acc, field) => ({ ...acc, [field]: template.sample[field] ?? "" }), {});
  const sheet = XLSX.utils.json_to_sheet([sampleRow], { header: template.fields });
  XLSX.utils.book_append_sheet(workbook, sheet, "Upload Format");
  const notes = XLSX.utils.aoa_to_sheet([
    ["Page", template.page],
    ["Group", template.group],
    ["Instruction", "Keep the header row unchanged. Fill one row per record. Dates should be in YYYY-MM-DD format where applicable."],
    ["Generated", new Date().toISOString()]
  ]);
  XLSX.utils.book_append_sheet(workbook, notes, "Notes");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const emailconfigs = await EmailConfiguration.find({ colid, isactive: { $ne: "No" } }).sort({ default: -1, provider: 1, username: 1 }).lean();
    res.json({
      success: true,
      categories: [...new Set(catalog.map((item) => item.group))],
      templates: catalog,
      emailconfigs: emailconfigs.map((row) => ({ ...row, label: emailConfigLabel(row) }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendTemplates = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const selectedKeys = Array.isArray(req.body.pages) ? req.body.pages.map(clean).filter(Boolean) : [];
    if (!selectedKeys.length) return res.status(400).json({ success: false, message: "Select at least one page template" });
    if (!clean(req.body.toemail)) return res.status(400).json({ success: false, message: "To email is required" });
    const config = await EmailConfiguration.findOne({ _id: req.body.emailconfigid, colid }).lean();
    if (!config) return res.status(400).json({ success: false, message: "Select a valid email configuration" });
    const selected = catalog.filter((item) => selectedKeys.includes(item.key));
    const attachments = selected.map((item) => ({
      filename: `${item.page.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}_upload_template.xlsx`,
      content: makeWorkbookBuffer(item),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }));
    const pageList = selected.map((item, index) => `${index + 1}. ${item.group} - ${item.page}`).join("<br />");
    const body = clean(req.body.body) || `Dear User,<br /><br />Please find attached the selected ERP sample upload templates.<br /><br />${pageList}<br /><br />Regards`;
    await transporterFor(config).sendMail({
      from: config.username,
      to: clean(req.body.toemail),
      subject: clean(req.body.subject) || "ERP sample upload templates",
      html: body.replace(/\n/g, "<br />"),
      text: body.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
      attachments
    });
    res.json({ success: true, sent: true, attachments: attachments.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
