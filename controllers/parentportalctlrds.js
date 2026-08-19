const mongoose = require("mongoose");
const ParentPortal = require("../Models/parentportalds");
const ParentStudentLink = require("../Models/parentstudentlinkds");
const User = require("../Models/user");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const NepLmsResource = require("../Models/neplmsresourceds");
const NepLmsAssignmentSubmission = require("../Models/neplmsassignmentsubmissionds");
const Ledgerstud = require("../Models/ledgerstud");
const StudentOnlinePayment = require("../Models/studentonlinepaymentds");
const CounterFee2Transaction = require("../Models/counterfee2transactionds");
const MasterGateway = require("../Models/mastergatewayds");
const DisciplinaryAction = require("../Models/disciplinaryactionds");
const AcademicCalendar = require("../Models/macadcal");
const ExamMarks2 = require("../Models/exammarks2ds");
const ExamMarksAll = require("../Models/exammarksall");
const ExamModel2 = require("../Models/examinationmodel2marksds");
const ExamModel2Viva = require("../Models/examinationmodel2vivamarksds");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (value) => ({ $regex: esc(value), $options: "i" });
const cleanEmail = (value) => text(value).toLowerCase();
const asIdList = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(",").map(text).filter(Boolean);
const unique = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const parentFields = ["parentname", "email", "phone", "address", "city", "pin", "state", "country", "occupation", "income", "caste", "password", "status"];
const linkFields = ["academicyear", "regulation", "program", "programcode", "semester", "section", "parentemail", "parent", "student", "regno", "studentemail", "photo", "status"];
const searchableStudentFields = ["name", "email", "regno", "academicyear", "regulation", "program", "programcode", "semester", "section", "gender", "admissionyear"];

function queryFrom(source = {}, fields = []) {
  const query = { colid: Number(source.colid) };
  fields.forEach((field) => {
    const value = source[field];
    if (text(value)) query[field] = ["parentname", "parent", "student", "address", "occupation"].includes(field) ? rx(value) : text(value);
  });
  let filters = Array.isArray(source.filters) ? source.filters : [];
  if (typeof source.filters === "string") {
    try {
      const parsed = JSON.parse(source.filters);
      filters = Array.isArray(parsed) ? parsed : [];
    } catch {
      filters = [];
    }
  }
  filters.forEach((filter) => {
    const field = text(filter.field);
    const value = filter.value;
    if (!field || value === undefined || value === null || value === "") return;
    const values = Array.isArray(value) ? value.map(text).filter(Boolean) : [text(value)];
    if (!values.length) return;
    query[field] = values.length > 1 ? { $in: values } : values[0];
  });
  return query;
}

function parentPayload(body = {}) {
  const payload = {};
  parentFields.forEach((field) => {
    if (body[field] !== undefined) payload[field] = field === "email" ? cleanEmail(body[field]) : body[field];
  });
  payload.colid = Number(body.colid);
  payload.name = text(body.name);
  payload.user = text(body.user);
  if (!payload.password) payload.password = "Password@123";
  if (!payload.status) payload.status = "Active";
  return payload;
}

async function hydrateLinkPayload(body = {}) {
  const colid = Number(body.colid);
  const payload = {};
  linkFields.forEach((field) => {
    if (body[field] !== undefined) payload[field] = field === "parentemail" ? cleanEmail(body[field]) : body[field];
  });
  payload.colid = colid;
  payload.name = text(body.name);
  payload.user = text(body.user);
  const parent = payload.parentemail
    ? await ParentPortal.findOne({ colid, email: payload.parentemail }).lean()
    : null;
  if (parent) {
    payload.parentid = String(parent._id);
    payload.parent = payload.parent || parent.parentname;
  }
  const studentQuery = { colid, role: /^student$/i };
  if (text(payload.regno)) studentQuery.regno = text(payload.regno);
  else if (text(payload.studentemail)) studentQuery.email = cleanEmail(payload.studentemail);
  const student = await User.findOne(studentQuery).lean();
  if (student) {
    payload.studentid = String(student._id);
    payload.student = payload.student || student.name;
    payload.regno = payload.regno || student.regno;
    payload.studentemail = payload.studentemail || student.email;
    payload.photo = payload.photo || student.photo;
    ["academicyear", "regulation", "program", "programcode", "semester", "section"].forEach((field) => {
      if (!text(payload[field]) && text(student[field])) payload[field] = student[field];
    });
  }
  payload.status = payload.status || "Active";
  return payload;
}

async function institution(colid) {
  return await Institution.findOne({ colid: Number(colid) }).sort({ _id: -1 }).lean() || {};
}

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [parents, students, parentRows, linkRows, institutionData] = await Promise.all([
      ParentPortal.find({ colid }).select("parentname email phone city state country status").sort({ parentname: 1 }).lean(),
      User.find({ colid, role: /^student$/i }).select("name email regno photo academicyear regulation program programcode semester section gender admissionyear").sort({ name: 1 }).limit(5000).lean(),
      ParentPortal.find({ colid }).lean(),
      ParentStudentLink.find({ colid }).lean(),
      institution(colid)
    ]);
    const options = {};
    [...parentFields, ...linkFields, ...searchableStudentFields].forEach((field) => {
      options[field] = unique([...parentRows.map((row) => row[field]), ...linkRows.map((row) => row[field]), ...students.map((row) => row[field])]);
    });
    res.json({ success: true, parents, students, options, institution: institutionData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listParents = async (req, res) => {
  try {
    const data = await ParentPortal.find(queryFrom(req.query, parentFields)).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveParent = async (req, res) => {
  try {
    const payload = parentPayload(req.body);
    if (!payload.colid || !payload.parentname || !payload.email) return res.status(400).json({ success: false, message: "Parent name, email and colid are required" });
    const data = req.body.id || req.body._id
      ? await ParentPortal.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ParentPortal.findOneAndUpdate({ colid: payload.colid, email: payload.email }, payload, { new: true, upsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkParents = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const saved = [];
    for (const row of rows) {
      const payload = parentPayload({ ...row, colid: req.body.colid, name: req.body.name, user: req.body.user });
      if (!payload.parentname || !payload.email) continue;
      saved.push(await ParentPortal.findOneAndUpdate({ colid: payload.colid, email: payload.email }, payload, { upsert: true, new: true, runValidators: true }));
    }
    res.json({ success: true, data: saved, count: saved.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteParents = async (req, res) => {
  try {
    const ids = asIdList(req.body.ids || req.body.id).filter((id) => mongoose.Types.ObjectId.isValid(id));
    await ParentPortal.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, count: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listLinks = async (req, res) => {
  try {
    const data = await ParentStudentLink.find(queryFrom(req.query, linkFields)).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveLink = async (req, res) => {
  try {
    const payload = await hydrateLinkPayload(req.body);
    if (!payload.colid || !payload.parentemail || !payload.regno) return res.status(400).json({ success: false, message: "Parent and student are required" });
    const data = req.body.id || req.body._id
      ? await ParentStudentLink.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ParentStudentLink.findOneAndUpdate({ colid: payload.colid, parentemail: payload.parentemail, regno: payload.regno }, payload, { new: true, upsert: true, runValidators: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkLinks = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const saved = [];
    for (const row of rows) {
      const payload = await hydrateLinkPayload({ ...row, colid: req.body.colid, name: req.body.name, user: req.body.user });
      if (!payload.parentemail || !payload.regno) continue;
      saved.push(await ParentStudentLink.findOneAndUpdate({ colid: payload.colid, parentemail: payload.parentemail, regno: payload.regno }, payload, { upsert: true, new: true, runValidators: true }));
    }
    res.json({ success: true, data: saved, count: saved.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteLinks = async (req, res) => {
  try {
    const ids = asIdList(req.body.ids || req.body.id).filter((id) => mongoose.Types.ObjectId.isValid(id));
    await ParentStudentLink.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, count: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = text(req.body.password);
    const query = { email, status: /^active$/i };
    if (Number(req.body.colid)) query.colid = Number(req.body.colid);
    const parent = await ParentPortal.findOne(query).lean();
    if (!parent || text(parent.password) !== password) return res.status(401).json({ success: false, message: "Invalid parent login" });
    const linkedStudents = await ParentStudentLink.find({ colid: parent.colid, parentemail: parent.email, status: /^active$/i }).sort({ student: 1 }).lean();
    res.json({ success: true, parent: { ...parent, password: undefined }, linkedStudents, institution: await institution(parent.colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const parent = await ParentPortal.findOne({ colid: Number(req.body.colid), email: cleanEmail(req.body.email) });
    if (!parent || text(parent.password) !== text(req.body.oldpassword)) return res.status(400).json({ success: false, message: "Old password is not correct" });
    if (!text(req.body.newpassword)) return res.status(400).json({ success: false, message: "New password is required" });
    parent.password = text(req.body.newpassword);
    await parent.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentContext = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const parentemail = cleanEmail(req.query.parentemail);
    const regno = text(req.query.regno);
    const link = await ParentStudentLink.findOne({ colid, parentemail, regno, status: /^active$/i }).lean();
    if (!link) return res.status(403).json({ success: false, message: "This student is not linked to the parent account" });
    const student = await User.findOne({ colid, regno, role: /^student$/i }).lean() || {};
    const studentCore = {
      academicyear: text(student.academicyear || link.academicyear),
      regulation: text(student.regulation || link.regulation),
      program: text(student.program || link.program),
      programcode: text(student.programcode || link.programcode),
      semester: text(student.semester || link.semester),
      section: text(student.section || link.section)
    };
    const courseQuery = { colid, status: "Active", ...studentCore };
    const [coursesByWorkload, coursesByMap, ledger, onlinePayments, counterPayments, disciplinary, calendar, resources, submissions, exam2, exam2viva, examOld, examAll, gateways, institutionData] = await Promise.all([
      WorkloadAssignment.find(courseQuery).sort({ semester: 1, course: 1 }).lean(),
      RegulationCourseMap.find({ colid, ...studentCore }).sort({ semester: 1, course: 1 }).lean(),
      Ledgerstud.find({ colid, regno }).sort({ duedate: 1, feegroup: 1, feeitem: 1 }).lean(),
      StudentOnlinePayment.find({ colid, regno }).sort({ paiddate: -1, initiationdate: -1 }).lean(),
      CounterFee2Transaction.find({ colid, regno }).sort({ paiddate: -1, createdAt: -1 }).lean(),
      DisciplinaryAction.find({ colid, regno }).sort({ actiondate: -1 }).lean(),
      AcademicCalendar.find({ colid, academicyear: studentCore.academicyear, regulation: studentCore.regulation, programcode: studentCore.programcode }).sort({ activitydate: 1 }).lean(),
      NepLmsResource.find({ colid, academicyear: studentCore.academicyear, regulation: studentCore.regulation, programcode: studentCore.programcode, semester: studentCore.semester, status: "Active" }).sort({ order: 1, duedate: 1, createdAt: -1 }).lean(),
      NepLmsAssignmentSubmission.find({ colid, regno }).sort({ submitteddate: -1 }).lean(),
      ExamModel2.find({ colid, regno }).sort({ academicyear: -1, examcode: 1, semester: 1, coursecode: 1 }).lean(),
      ExamModel2Viva.find({ colid, regno }).sort({ academicyear: -1, examcode: 1, semester: 1, coursecode: 1 }).lean(),
      ExamMarks2.find({ colid, regno }).sort({ year: -1, examcode: 1, semester: 1, papercode: 1 }).lean(),
      ExamMarksAll.find({ colid, regno }).sort({ academicyear: -1, examcode: 1, semester: 1, coursecode: 1 }).lean(),
      MasterGateway.find({ colid, status: "Active" }).sort({ gatewayname: 1 }).lean(),
      institution(colid)
    ]);
    const courseMap = new Map();
    [...coursesByMap, ...coursesByWorkload].forEach((course) => {
      const key = text(course.coursecode);
      if (key && !courseMap.has(key)) courseMap.set(key, course);
    });
    const submittedIds = new Set(submissions.map((row) => String(row.assignmentid || "")));
    const assignments = resources.filter((row) => row.resourcetype === "Assignment").map((row) => ({
      ...row,
      submissionstatus: submittedIds.has(String(row._id)) ? "Submitted" : "Due"
    }));
    res.json({
      success: true,
      parentemail,
      link,
      student: { ...student, password: undefined },
      institution: institutionData,
      courses: Array.from(courseMap.values()),
      ledger,
      pendingFees: ledger.filter((row) => num(row.balance) > 0),
      onlinePayments,
      counterPayments,
      disciplinary,
      calendar,
      assignments,
      submissions,
      examMarks: { exammodel2: exam2, exammodel2viva: exam2viva, exammarks2: examOld, exammarksall: examAll },
      gateways
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
