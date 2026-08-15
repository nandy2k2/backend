const ConductExamCourse = require("../Models/conductexamcourseds");
const mongoose = require("mongoose");
const ConductExamRoll = require("../Models/conductexamrollds");
const ConductExamExaminer = require("../Models/conductexamexaminerds");
const AssessmentComponent = require("../Models/assessmentcomponentds");
const ComponentAllocation = require("../Models/conductexamcomponentallocationds");
const ComponentMarks = require("../Models/exammodel2componentmarksds");
const Institution = require("../Models/insdetails");
const OnlineExam = require("../Models/onlineexamds");
const OnlineExamAttempt = require("../Models/onlineexamattemptds");
const ExamVivaMarks = require("../Models/examinationmodel2vivamarksds");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const numberOrUndefined = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const uniq = (values) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const todayString = () => new Date().toISOString().slice(0, 10);
const dateInsideWindow = (startdate, enddate, date = todayString()) => {
  const start = text(startdate);
  const end = text(enddate);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
};
const percent = (obtained, total) => number(total) ? Number(((number(obtained) / number(total)) * 100).toFixed(2)) : 0;
const institutionFor = async (colid) => {
  const item = await Institution.findOne({ colid }).lean();
  return item ? {
    institutionname: item.institutionname || item.name || "",
    address: item.address || "",
    logolink: item.logolink || item.logo || ""
  } : null;
};

const courseFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"];
const allocationFields = [...courseFields, "examinername", "examineremail", "student", "regno", "examrollno", "examdate", "examslot", "componenttype", "scoretype", "assessmentgroup", "assessmentgrouptype", "assessmentcomponent", "status"];
const marksFields = ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "semester", "course", "coursecode", "student", "regno", "examrollno", "componenttype", "scoretype", "assessmentgroup", "assessmentgrouptype", "assessmentcomponent", "examinername", "examineremail"];

const buildFilter = (source = {}, fields = []) => {
  const filter = {};
  const colid = numberOrUndefined(source.colid);
  if (colid !== undefined) filter.colid = colid;
  fields.forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const baseCoursePayload = (body = {}) => ({
  colid: numberOrUndefined(body.colid),
  academicyear: text(body.academicyear || body.academicYear),
  regulation: text(body.regulation),
  exam: text(body.exam || body.examname),
  examcode: text(body.examcode),
  program: text(body.program),
  programcode: text(body.programcode),
  type: text(body.type),
  subject: text(body.subject),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  user: text(body.user)
});

const componentPayload = (component = {}) => ({
  componenttype: text(component.componenttype || component.componentType),
  scoretype: text(component.scoretype || component.scoreType),
  assessmentgroup: text(component.assessmentgroup || component.assessmentGroup),
  assessmentgrouptype: text(component.assessmentgrouptype || component.grouptype || component.groupType),
  assessmentcomponent: text(component.assessmentcomponent || component.assessmentComponent),
  maxmarks: number(component.maxmarks ?? component.marks),
  credits: number(component.credits ?? component.credit)
});

const allocationPayload = (body = {}) => ({
  ...baseCoursePayload(body),
  examinername: text(body.examinername || body.examiner || body.name),
  examineremail: text(body.examineremail || body.email),
  student: text(body.student),
  regno: text(body.regno),
  email: text(body.studentemail || body.emailstudent || body.studentEmail || body.ledgeremail || body.email),
  examrollno: text(body.examrollno || body.examseatno || body.examRollNo || body.uniqueid || body.uniqueId),
  seatno: text(body.seatno),
  examdate: text(body.examdate),
  examslot: text(body.examslot || body.slot),
  startdate: text(body.startdate),
  enddate: text(body.enddate),
  ...componentPayload(body),
  status: text(body.status) || "Allocated"
});

const marksPayload = (body = {}) => ({
  colid: numberOrUndefined(body.colid),
  academicyear: text(body.academicyear),
  exam: text(body.exam),
  examcode: text(body.examcode),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  student: text(body.student),
  regno: text(body.regno),
  examrollno: text(body.examrollno || body.examseatno || body.examRollNo || body.uniqueid || body.uniqueId),
  componenttype: text(body.componenttype),
  scoretype: text(body.scoretype),
  assessmentgroup: text(body.assessmentgroup),
  assessmentgrouptype: text(body.assessmentgrouptype || body.grouptype),
  assessmentcomponent: text(body.assessmentcomponent),
  maxmarks: number(body.maxmarks),
  marksobtained: number(body.marksobtained),
  credits: number(body.credits),
  examinername: text(body.examinername),
  examineremail: text(body.examineremail),
  submissionstatus: text(body.submissionstatus) === "Submitted" ? "Submitted" : "Draft",
  submitteddate: text(body.submitteddate),
  submittedby: text(body.submittedby),
  user: text(body.user)
});

const validateAllocation = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "course", "coursecode", "examinername", "examineremail", "student", "regno", "assessmentcomponent"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const validateMarks = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "examcode", "coursecode", "regno", "assessmentcomponent"]) {
    if (!item[field]) return `${field} is required`;
  }
  if (item.marksobtained > item.maxmarks) return "Marks obtained cannot be more than max marks";
  return "";
};

const markKey = (row) => [row.colid, row.academicyear, row.examcode, row.regulation, row.programcode, row.coursecode, row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].map(text).join("||");

exports.options = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [courses, examiners, components, allocations] = await Promise.all([
      ConductExamCourse.find(buildFilter(req.query, courseFields)).sort({ academicyear: -1, examcode: 1, program: 1, course: 1 }).lean(),
      ConductExamExaminer.find({ colid }).sort({ examinername: 1 }).lean(),
      AssessmentComponent.find({ colid }).sort({ academicyear: -1, program: 1, course: 1, componenttype: 1, assessmentcomponent: 1 }).lean(),
      ComponentAllocation.find({ colid }).select(allocationFields.join(" ")).lean()
    ]);
    res.json({
      success: true,
      courses,
      examiners,
      components,
      filters: Object.fromEntries(["academicyear", "examcode", "regulation", "programcode", "semester", "coursecode", "componenttype", "assessmentcomponent"].map((field) => [field, uniq([...courses, ...components, ...allocations].map((row) => row[field]))]))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.presentStudents = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    filter.attended = "Yes";
    const data = await ConductExamRoll.find(filter).sort({ regno: 1, student: 1 }).lean();
    res.json({ success: true, data: data.map((row) => ({ ...row, examrollno: String(row._id), examseatno: row.examseatno || String(row._id) })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listAllocations = async (req, res) => {
  try {
    const filter = buildFilter(req.query, allocationFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ComponentAllocation.find(filter).sort({ academicyear: -1, examcode: 1, course: 1, assessmentcomponent: 1, examinername: 1, regno: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveAllocation = async (req, res) => {
  try {
    const item = allocationPayload(req.body);
    if (!item.examrollno) {
      const roll = await ConductExamRoll.findOne({
        colid: item.colid,
        academicyear: item.academicyear,
        examcode: item.examcode,
        regulation: item.regulation,
        programcode: item.programcode,
        semester: item.semester,
        coursecode: item.coursecode,
        regno: item.regno
      }).select("_id examseatno").lean();
      item.examrollno = roll ? String(roll._id) : "";
    }
    const error = validateAllocation(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ComponentAllocation.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await ComponentAllocation.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, semester: item.semester, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.code === 11000 ? "This component allocation already exists" : err.message });
  }
};

exports.deleteAllocation = async (req, res) => {
  try {
    await ComponentAllocation.findOneAndDelete({ _id: req.body.id, colid: numberOrUndefined(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkDeleteAllocations = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const result = await ComponentAllocation.deleteMany({ colid: numberOrUndefined(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkAllocations = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows || req.body.items) ? (req.body.rows || req.body.items) : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const item = allocationPayload({ ...rows[index], colid: req.body.colid || rows[index].colid, user: req.body.user || rows[index].user });
      const error = validateAllocation(item);
      if (error) {
        errors.push({ row: index + 2, message: error });
        continue;
      }
      await ComponentAllocation.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, semester: item.semester, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.randomAllocate = async (req, res) => {
  try {
    const base = baseCoursePayload(req.body);
    const componentIds = Array.isArray(req.body.componentids) ? req.body.componentids.map(text).filter(Boolean) : [];
    const examinerEmails = Array.isArray(req.body.examineremails) ? req.body.examineremails.map(text).filter(Boolean) : [];
    const papersPerExaminer = numberOrUndefined(req.body.papersperexaminer);
    if (!examinerEmails.length) return res.status(400).json({ success: false, message: "Select at least one examiner" });
    if (!componentIds.length) return res.status(400).json({ success: false, message: "Select at least one component" });

    const [students, examiners, components] = await Promise.all([
      ConductExamRoll.find({ colid: base.colid, academicyear: base.academicyear, examcode: base.examcode, regulation: base.regulation, programcode: base.programcode, coursecode: base.coursecode, attended: "Yes" }).sort({ regno: 1 }).lean(),
      ConductExamExaminer.find({ colid: base.colid, academicyear: base.academicyear, examcode: base.examcode, programcode: base.programcode, coursecode: base.coursecode, examineremail: { $in: examinerEmails.map((email) => new RegExp(`^${escapeRegex(email)}$`, "i")) } }).lean(),
      AssessmentComponent.find({ _id: { $in: componentIds }, colid: base.colid }).lean()
    ]);
    if (!students.length) return res.status(400).json({ success: false, message: "No present students found" });
    if (!examiners.length) return res.status(400).json({ success: false, message: "No matching examiners found" });
    if (!components.length) return res.status(400).json({ success: false, message: "No matching components found" });

    const assignments = [];
    components.forEach((component) => {
      const shuffled = [...students].sort(() => Math.random() - 0.5);
      const max = papersPerExaminer ? Math.min(shuffled.length, papersPerExaminer * examiners.length) : shuffled.length;
      for (let index = 0; index < max; index += 1) {
        const student = shuffled[index];
        const examiner = examiners[index % examiners.length];
        assignments.push({
          ...base,
          type: base.type || student.type || component.type || "",
          subject: base.subject || student.subject || component.subject || "",
          semester: base.semester || student.semester || component.semester || "",
          examinername: examiner.examinername,
          examineremail: examiner.examineremail,
          student: student.student,
          regno: student.regno,
          email: student.email || "",
          examrollno: String(student._id),
          seatno: student.seatno || "",
          examdate: student.examdate || "",
          examslot: student.examslot || "",
          startdate: text(req.body.startdate),
          enddate: text(req.body.enddate),
          ...componentPayload(component),
          status: "Allocated"
        });
      }
    });

    if (assignments.length) {
      await ComponentAllocation.bulkWrite(assignments.map((item) => ({
        updateOne: {
          filter: { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, semester: item.semester, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
          update: { $set: item },
          upsert: true
        }
      })), { ordered: false });
    }
    const data = await ComponentAllocation.find({ colid: base.colid, academicyear: base.academicyear, examcode: base.examcode, programcode: base.programcode, semester: base.semester, coursecode: base.coursecode }).sort({ assessmentcomponent: 1, examinername: 1, regno: 1 }).lean();
    res.json({ success: true, saved: assignments.length, data, airesponse: text(req.body.airules) ? "AI rules captured with componentwise allocation request. Allocation saved using balanced random distribution." : "" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.examinerPapers = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.query.colid);
    const examineremail = text(req.query.examineremail || req.query.user);
    if (colid === undefined || !examineremail) return res.status(400).json({ success: false, message: "colid and examineremail are required" });
    const rows = await ComponentAllocation.find({ colid, examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i") }).sort({ academicyear: -1, examcode: 1, course: 1, assessmentcomponent: 1 }).lean();
    const map = new Map();
    rows.forEach((row) => {
      const key = [row.academicyear, row.examcode, row.regulation, row.programcode, row.semester, row.coursecode].join("||");
      if (!map.has(key)) map.set(key, { ...row, components: 0, students: new Set() });
      map.get(key).components += 1;
      map.get(key).students.add(row.regno);
    });
    res.json({ success: true, data: [...map.values()].map((item) => ({ ...item, students: item.students.size })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.examinerRows = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.query.colid);
    const examineremail = text(req.query.examineremail || req.query.user);
    const filter = buildFilter(req.query, ["academicyear", "examcode", "regulation", "programcode", "semester", "coursecode", "componenttype", "assessmentcomponent"]);
    filter.colid = colid;
    filter.examineremail = new RegExp(`^${escapeRegex(examineremail)}$`, "i");
    const allocations = await ComponentAllocation.find(filter).sort({ regno: 1, assessmentcomponent: 1 }).lean();
    const markFilter = buildFilter(req.query, ["academicyear", "examcode", "regulation", "programcode", "semester", "coursecode"]);
    markFilter.colid = colid;
    const [marks, examRolls] = await Promise.all([
      ComponentMarks.find(markFilter).lean(),
      ConductExamRoll.find(buildFilter(req.query, ["academicyear", "examcode", "regulation", "programcode", "coursecode"])).select("_id regno").lean()
    ]);
    const rollMap = new Map(examRolls.map((row) => [row.regno, String(row._id)]));
    const markMap = new Map(marks.map((row) => [[row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].join("||"), row]));
    res.json({
      success: true,
      data: allocations.map((row, index) => {
        const mark = markMap.get([row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].join("||"));
        const examrollno = row.examrollno || rollMap.get(row.regno) || "";
        return {
          ...row,
          examrollno,
          displayid: examrollno || `ID-${String(index + 1).padStart(4, "0")}`,
          marksobtained: mark?.marksobtained ?? "",
          submissionstatus: mark?.submissionstatus || "Draft",
          submitteddate: mark?.submitteddate || "",
          submittedby: mark?.submittedby || ""
        };
      })
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveExaminerMarks = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const errors = [];
    const ops = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const item = marksPayload({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validateMarks(item);
      if (error) {
        errors.push({ row: index + 1, regno: item.regno, message: error });
        continue;
      }
      const allocation = await ComponentAllocation.findOne({
        colid: item.colid,
        academicyear: item.academicyear,
        examcode: item.examcode,
        regulation: item.regulation,
        programcode: item.programcode,
        semester: item.semester,
        coursecode: item.coursecode,
        regno: item.regno,
        componenttype: item.componenttype,
        assessmentgroup: item.assessmentgroup,
        assessmentcomponent: item.assessmentcomponent,
        examineremail: new RegExp(`^${escapeRegex(item.examineremail)}$`, "i")
      }).select("startdate enddate examrollno semester").lean();
      if (!allocation) {
        errors.push({ row: index + 1, regno: item.regno, message: "Allocation not found for this examiner and component" });
        continue;
      }
      if (!item.semester && allocation.semester) item.semester = allocation.semester;
      if (!dateInsideWindow(allocation.startdate, allocation.enddate)) {
        errors.push({ row: index + 1, regno: item.regno, message: `Marks entry is allowed only from ${allocation.startdate || "start"} to ${allocation.enddate || "end"}` });
        continue;
      }
      const existing = await ComponentMarks.findOne({
        colid: item.colid,
        academicyear: item.academicyear,
        examcode: item.examcode,
        regulation: item.regulation,
        programcode: item.programcode,
        coursecode: item.coursecode,
        regno: item.regno,
        componenttype: item.componenttype,
        assessmentgroup: item.assessmentgroup,
        assessmentcomponent: item.assessmentcomponent
      }).select("submissionstatus").lean();
      if (existing?.submissionstatus === "Submitted") {
        errors.push({ row: index + 1, regno: item.regno, message: "Marks already submitted and cannot be edited" });
        continue;
      }
      item.examrollno = item.examrollno || allocation.examrollno || "";
      item.submissionstatus = "Draft";
      item.submitteddate = "";
      item.submittedby = "";
      ops.push({
        updateOne: {
          filter: { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, regulation: item.regulation, programcode: item.programcode, semester: item.semester, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
          update: { $set: item },
          upsert: true
        }
      });
    }
    let saved = 0;
    if (ops.length) {
      const result = await ComponentMarks.bulkWrite(ops, { ordered: false });
      saved = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitExaminerMarks = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const errors = [];
    const ops = [];
    const submitteddate = todayString();
    const submittedby = text(req.body.user);
    for (let index = 0; index < rows.length; index += 1) {
      const item = marksPayload({ ...rows[index], colid: req.body.colid || rows[index].colid, user: submittedby, submissionstatus: "Submitted", submitteddate, submittedby });
      const error = validateMarks(item);
      if (error) {
        errors.push({ row: index + 1, regno: item.regno, message: error });
        continue;
      }
      const allocation = await ComponentAllocation.findOne({
        colid: item.colid,
        academicyear: item.academicyear,
        examcode: item.examcode,
        regulation: item.regulation,
        programcode: item.programcode,
        semester: item.semester,
        coursecode: item.coursecode,
        regno: item.regno,
        componenttype: item.componenttype,
        assessmentgroup: item.assessmentgroup,
        assessmentcomponent: item.assessmentcomponent,
        examineremail: new RegExp(`^${escapeRegex(item.examineremail)}$`, "i")
      }).select("startdate enddate examrollno semester").lean();
      if (!allocation) {
        errors.push({ row: index + 1, regno: item.regno, message: "Allocation not found for this examiner and component" });
        continue;
      }
      if (!item.semester && allocation.semester) item.semester = allocation.semester;
      if (!dateInsideWindow(allocation.startdate, allocation.enddate)) {
        errors.push({ row: index + 1, regno: item.regno, message: `Submission is allowed only from ${allocation.startdate || "start"} to ${allocation.enddate || "end"}` });
        continue;
      }
      const existing = await ComponentMarks.findOne({
        colid: item.colid,
        academicyear: item.academicyear,
        examcode: item.examcode,
        regulation: item.regulation,
        programcode: item.programcode,
        coursecode: item.coursecode,
        regno: item.regno,
        componenttype: item.componenttype,
        assessmentgroup: item.assessmentgroup,
        assessmentcomponent: item.assessmentcomponent
      }).select("submissionstatus").lean();
      if (existing?.submissionstatus === "Submitted") {
        errors.push({ row: index + 1, regno: item.regno, message: "Marks already submitted" });
        continue;
      }
      item.examrollno = item.examrollno || allocation.examrollno || "";
      item.submissionstatus = "Submitted";
      item.submitteddate = submitteddate;
      item.submittedby = submittedby;
      ops.push({
        updateOne: {
          filter: { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, regulation: item.regulation, programcode: item.programcode, semester: item.semester, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
          update: { $set: item },
          upsert: true
        }
      });
    }
    let submitted = 0;
    if (ops.length) {
      const result = await ComponentMarks.bulkWrite(ops, { ordered: false });
      submitted = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }
    res.json({ success: true, submitted, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listMarks = async (req, res) => {
  try {
    const requestedSemester = text(req.query.semester);
    const filter = buildFilter(req.query, marksFields.filter((field) => field !== "semester"));
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    let data = await ComponentMarks.find(filter).sort({ academicyear: -1, examcode: 1, course: 1, regno: 1, assessmentcomponent: 1 }).lean();
    const missingSemester = data.filter((row) => !text(row.semester));
    if (missingSemester.length) {
      const allocationFilter = {
        colid: filter.colid,
        $or: missingSemester.map((row) => ({
          academicyear: row.academicyear,
          examcode: row.examcode,
          regulation: row.regulation,
          programcode: row.programcode,
          coursecode: row.coursecode,
          regno: row.regno,
          componenttype: row.componenttype,
          assessmentgroup: row.assessmentgroup,
          assessmentcomponent: row.assessmentcomponent
        }))
      };
      const allocations = await ComponentAllocation.find(allocationFilter).select("academicyear examcode regulation programcode coursecode regno componenttype assessmentgroup assessmentcomponent semester").lean();
      const allocationMap = new Map(allocations.map((row) => [[row.academicyear, row.examcode, row.regulation, row.programcode, row.coursecode, row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].map(text).join("||"), row.semester]));
      data.forEach((row) => {
        if (text(row.semester)) return;
        const key = [row.academicyear, row.examcode, row.regulation, row.programcode, row.coursecode, row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].map(text).join("||");
        row.semester = allocationMap.get(key) || "";
      });
    }
    if (requestedSemester) data = data.filter((row) => text(row.semester) === requestedSemester);
    res.json({ success: true, data, options: Object.fromEntries(marksFields.map((field) => [field, uniq(data.map((row) => row[field]))])) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveMark = async (req, res) => {
  try {
    const item = marksPayload(req.body);
    const error = validateMarks(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ComponentMarks.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await ComponentMarks.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, regulation: item.regulation, programcode: item.programcode, semester: item.semester, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.code === 11000 ? "This component marks row already exists" : err.message });
  }
};

exports.deleteMark = async (req, res) => {
  try {
    await ComponentMarks.findOneAndDelete({ _id: req.body.id, colid: numberOrUndefined(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkMarks = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows || req.body.items) ? (req.body.rows || req.body.items) : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const item = marksPayload({ ...rows[index], colid: req.body.colid || rows[index].colid, user: req.body.user || rows[index].user });
      const error = validateMarks(item);
      if (error) {
        errors.push({ row: index + 2, message: error });
        continue;
      }
      await ComponentMarks.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, regulation: item.regulation, programcode: item.programcode, semester: item.semester, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.onlineExamSources = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const coreFilter = { colid };
    ["academicyear", "programcode", "coursecode"].forEach((field) => {
      if (text(req.query[field])) coreFilter[field] = { $regex: `^${escapeRegex(req.query[field])}$`, $options: "i" };
    });
    if (text(req.query.createdby || req.query.createdbyemail || req.query.user)) {
      coreFilter.user = { $regex: `^${escapeRegex(req.query.createdby || req.query.createdbyemail || req.query.user)}$`, $options: "i" };
    }
    const queries = [
      { ...coreFilter, status: /^Published$/i },
      { ...coreFilter, status: { $not: /^Draft$/i } },
      coreFilter
    ];
    let data = [];
    for (const filter of queries) {
      data = await OnlineExam.find(filter)
      .select("academicyear program programcode course coursecode examname examcode durationminutes starttime endtime timezone status")
      .sort({ starttime: -1, examname: 1 })
      .lean();
      if (data.length) break;
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.onlineExamAttemptMarks = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const examid = text(req.query.onlineexamid || req.query.examid);
    if (!examid) return res.status(400).json({ success: false, message: "onlineexamid is required" });
    const examIdValues = [examid];
    if (mongoose.Types.ObjectId.isValid(examid)) examIdValues.push(new mongoose.Types.ObjectId(examid));
    const attempts = await OnlineExamAttempt.find({
      colid,
      examid: { $in: examIdValues },
      $or: [
        { submittime: { $ne: null } },
        { status: /^Submitted$/i }
      ]
    })
      .select("examid examname examcode academicyear program programcode course coursecode student email regno submittime status totalmarks marksobtained grade comments")
      .sort({ regno: 1, student: 1 })
      .lean();
    let existing = [];
    if (text(req.query.academicyear) && text(req.query.examcode) && text(req.query.programcode) && text(req.query.coursecode) && text(req.query.componenttype) && text(req.query.assessmentcomponent)) {
      existing = await ComponentMarks.find({
        colid,
        academicyear: text(req.query.academicyear),
        examcode: text(req.query.examcode),
        regulation: text(req.query.regulation),
        programcode: text(req.query.programcode),
        coursecode: text(req.query.coursecode),
        componenttype: text(req.query.componenttype),
        assessmentgroup: text(req.query.assessmentgroup),
        assessmentcomponent: text(req.query.assessmentcomponent)
      }).select("regno marksobtained maxmarks submissionstatus").lean();
    }
    const existingMap = new Map(existing.map((row) => [text(row.regno), row]));
    res.json({
      success: true,
      data: attempts.map((row) => ({
        ...row,
        existingmark: existingMap.get(text(row.regno))?.marksobtained,
        existingstatus: existingMap.get(text(row.regno))?.submissionstatus || ""
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.transferOnlineExamMarks = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const onlineexamid = text(req.body.onlineexamid || req.body.examid);
    const attemptids = Array.isArray(req.body.attemptids) ? req.body.attemptids.map(text).filter(Boolean) : [];
    if (!onlineexamid) return res.status(400).json({ success: false, message: "Select an online exam" });
    if (!attemptids.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const target = {
      colid,
      academicyear: text(req.body.academicyear),
      exam: text(req.body.exam),
      examcode: text(req.body.examcode),
      regulation: text(req.body.regulation),
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      course: text(req.body.course),
      coursecode: text(req.body.coursecode),
      componenttype: text(req.body.componenttype),
      scoretype: text(req.body.scoretype),
      assessmentgroup: text(req.body.assessmentgroup),
      assessmentgrouptype: text(req.body.assessmentgrouptype || req.body.grouptype),
      assessmentcomponent: text(req.body.assessmentcomponent),
      maxmarks: number(req.body.maxmarks),
      credits: number(req.body.credits),
      examinername: text(req.body.examinername || "Online Exam"),
      examineremail: text(req.body.examineremail || req.body.user),
      user: text(req.body.user)
    };
    for (const field of ["academicyear", "examcode", "programcode", "coursecode", "componenttype", "assessmentcomponent"]) {
      if (!target[field]) return res.status(400).json({ success: false, message: `${field} is required` });
    }
    const [onlineExam, attempts] = await Promise.all([
      OnlineExam.findOne({ _id: onlineexamid, colid }).lean(),
      OnlineExamAttempt.find({ _id: { $in: attemptids }, colid, examid: onlineexamid, submittime: { $ne: null } }).lean()
    ]);
    if (!onlineExam) return res.status(404).json({ success: false, message: "Online exam not found" });
    if (!attempts.length) return res.status(400).json({ success: false, message: "No submitted online exam attempts found for selected students" });
    const regnos = attempts.map((row) => text(row.regno)).filter(Boolean);
    const rolls = await ConductExamRoll.find({
      colid,
      academicyear: target.academicyear,
      examcode: target.examcode,
      regulation: target.regulation,
      programcode: target.programcode,
      coursecode: target.coursecode,
      regno: { $in: regnos }
    }).lean();
    const rollMap = new Map(rolls.map((row) => [text(row.regno), row]));
    const errors = [];
    const ops = [];
    for (const attempt of attempts) {
      const existing = await ComponentMarks.findOne({
        colid,
        academicyear: target.academicyear,
        examcode: target.examcode,
        regulation: target.regulation,
        programcode: target.programcode,
        coursecode: target.coursecode,
        regno: text(attempt.regno),
        componenttype: target.componenttype,
        assessmentgroup: target.assessmentgroup,
        assessmentcomponent: target.assessmentcomponent
      }).select("submissionstatus").lean();
      if (existing?.submissionstatus === "Submitted") {
        errors.push({ regno: attempt.regno, message: "Existing component mark is already submitted" });
        continue;
      }
      const roll = rollMap.get(text(attempt.regno));
      const item = {
        ...target,
        student: text(attempt.student),
        regno: text(attempt.regno),
        examrollno: roll ? String(roll._id) : "",
        marksobtained: number(attempt.marksobtained),
        submissionstatus: "Draft",
        submitteddate: "",
        submittedby: ""
      };
      ops.push({
        updateOne: {
          filter: {
            colid,
            academicyear: target.academicyear,
            examcode: target.examcode,
            regulation: target.regulation,
            programcode: target.programcode,
            coursecode: target.coursecode,
            regno: item.regno,
            componenttype: target.componenttype,
            assessmentgroup: target.assessmentgroup,
            assessmentcomponent: target.assessmentcomponent
          },
          update: { $set: item },
          upsert: true
        }
      });
    }
    let transferred = 0;
    if (ops.length) {
      const result = await ComponentMarks.bulkWrite(ops, { ordered: false });
      transferred = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }
    res.json({ success: true, transferred, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.transferOnlineExamMarksToViva = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const onlineexamid = text(req.body.onlineexamid || req.body.examid);
    const attemptids = Array.isArray(req.body.attemptids) ? req.body.attemptids.map(text).filter(Boolean) : [];
    if (!onlineexamid) return res.status(400).json({ success: false, message: "Select an online exam" });
    if (!attemptids.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const target = {
      colid,
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      exam: text(req.body.exam),
      examcode: text(req.body.examcode),
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      semester: text(req.body.semester),
      course: text(req.body.course),
      coursecode: text(req.body.coursecode),
      credit: number(req.body.credits ?? req.body.credit),
      componenttype: text(req.body.componenttype),
      maxmarks: number(req.body.maxmarks),
      user: text(req.body.user)
    };
    for (const field of ["academicyear", "examcode", "programcode", "semester", "coursecode", "componenttype"]) {
      if (!target[field]) return res.status(400).json({ success: false, message: `${field} is required` });
    }
    const [onlineExam, attempts] = await Promise.all([
      OnlineExam.findOne({ _id: onlineexamid, colid }).lean(),
      OnlineExamAttempt.find({ _id: { $in: attemptids }, colid, examid: onlineexamid, submittime: { $ne: null } }).lean()
    ]);
    if (!onlineExam) return res.status(404).json({ success: false, message: "Online exam not found" });
    if (!attempts.length) return res.status(400).json({ success: false, message: "No submitted online exam attempts found for selected students" });

    let transferred = 0;
    const errors = [];
    for (const attempt of attempts) {
      const regno = text(attempt.regno);
      if (!regno) {
        errors.push({ regno: "", message: "Attempt has no regno" });
        continue;
      }
      const existing = await ExamVivaMarks.findOne({
        colid,
        academicyear: target.academicyear,
        examcode: target.examcode,
        programcode: target.programcode,
        semester: target.semester,
        coursecode: target.coursecode,
        regno,
        attempt: 1
      }).lean();
      const payload = {
        colid,
        academicyear: target.academicyear,
        regulation: target.regulation,
        exam: target.exam,
        examcode: target.examcode,
        program: target.program,
        programcode: target.programcode,
        semester: target.semester,
        course: target.course,
        coursecode: target.coursecode,
        credit: target.credit,
        student: text(attempt.student),
        regno,
        abcid: text(existing?.abcid),
        theorymarks: number(existing?.theorymarks),
        theoryobtained: number(existing?.theoryobtained),
        theorygradepoint: number(existing?.theorygradepoint),
        theorygrade: text(existing?.theorygrade),
        theorystatus: text(existing?.theorystatus) || "Pass",
        practicalmarks: number(existing?.practicalmarks),
        practicaltotal: number(existing?.practicaltotal),
        practicalgradepoint: number(existing?.practicalgradepoint),
        practicalgrade: text(existing?.practicalgrade),
        practicalstatus: text(existing?.practicalstatus) || "Pass",
        vivatotal: number(existing?.vivatotal),
        vivaobtained: number(existing?.vivaobtained),
        vivagpa: number(existing?.vivagpa),
        vivagrade: text(existing?.vivagrade),
        overallgradepoint: number(existing?.overallgradepoint),
        overallgrade: text(existing?.overallgrade),
        status: text(existing?.status) || "Pass",
        attempt: 1,
        type: text(existing?.type) || "Regular",
        examdate: text(existing?.examdate),
        resultprocessdate: text(existing?.resultprocessdate),
        user: target.user
      };
      if (/^theory$/i.test(target.componenttype)) {
        payload.theorymarks = target.maxmarks;
        payload.theoryobtained = number(attempt.marksobtained);
      } else if (/^practical$/i.test(target.componenttype)) {
        payload.practicaltotal = target.maxmarks;
        payload.practicalmarks = number(attempt.marksobtained);
      } else if (/^viva$/i.test(target.componenttype)) {
        payload.vivatotal = target.maxmarks;
        payload.vivaobtained = number(attempt.marksobtained);
      } else {
        errors.push({ regno, message: `Unsupported component type ${target.componenttype}` });
        continue;
      }
      payload.theorypercentage = percent(payload.theoryobtained, payload.theorymarks);
      payload.practicalpercentage = percent(payload.practicalmarks, payload.practicaltotal);
      payload.vivapercentage = percent(payload.vivaobtained, payload.vivatotal);
      payload.overalltotalmarks = number(payload.theorymarks) + number(payload.practicaltotal) + number(payload.vivatotal);
      payload.overallobtained = number(payload.theoryobtained) + number(payload.practicalmarks) + number(payload.vivaobtained);
      payload.overallpercentage = percent(payload.overallobtained, payload.overalltotalmarks);
      payload.gpa = Number((number(payload.credit) * number(payload.overallgradepoint)).toFixed(2));

      await ExamVivaMarks.findOneAndUpdate(
        {
          colid,
          academicyear: target.academicyear,
          examcode: target.examcode,
          programcode: target.programcode,
          semester: target.semester,
          coursecode: target.coursecode,
          regno,
          attempt: 1
        },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      transferred += 1;
    }
    res.json({ success: true, transferred, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.code === 11000 ? "Duplicate viva marks entry for this student, course, exam and attempt" : err.message });
  }
};

exports.monitoringOptions = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [allocations, marks, courses, examiners] = await Promise.all([
      ComponentAllocation.find({ colid }).select(allocationFields.join(" ")).lean(),
      ComponentMarks.find({ colid }).select(marksFields.join(" ")).lean(),
      ConductExamCourse.find({ colid }).select(courseFields.join(" ")).lean(),
      ConductExamExaminer.find({ colid }).sort({ examinername: 1 }).lean()
    ]);
    const fields = ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "examinername", "examineremail", "componenttype", "assessmentcomponent"];
    const optionRows = [...allocations, ...marks, ...courses, ...examiners];
    res.json({
      success: true,
      options: Object.fromEntries(fields.map((field) => [field, uniq(optionRows.map((row) => row[field]))])),
      examiners
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.marksEntryMonitoring = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "examinername", "examineremail", "componenttype", "assessmentcomponent"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [allocations, marks, institution] = await Promise.all([
      ComponentAllocation.find(filter).lean(),
      ComponentMarks.find(buildFilter(req.query, ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "examinername", "examineremail", "componenttype", "assessmentcomponent"])).lean(),
      institutionFor(filter.colid)
    ]);
    const markMap = new Map(marks.map((row) => [markKey(row), row]));
    const grouped = new Map();
    allocations.forEach((row) => {
      const key = [row.examineremail, row.coursecode].map(text).join("||");
      if (!grouped.has(key)) {
        grouped.set(key, {
          examinername: row.examinername,
          examineremail: row.examineremail,
          academicyear: row.academicyear,
          exam: row.exam,
          examcode: row.examcode,
          program: row.program,
          programcode: row.programcode,
          course: row.course,
          coursecode: row.coursecode,
          allocated: 0,
          draft: 0,
          submitted: 0,
          completed: 0,
          pending: 0
        });
      }
      const item = grouped.get(key);
      item.allocated += 1;
      const mark = markMap.get(markKey(row));
      if (mark?.submissionstatus === "Submitted") {
        item.submitted += 1;
        item.completed += 1;
      } else if (mark) {
        item.draft += 1;
      } else {
        item.pending += 1;
      }
    });
    const details = allocations.map((row) => {
      const mark = markMap.get(markKey(row));
      return { ...row, marked: mark?.submissionstatus === "Submitted" ? "Submitted" : mark ? "Draft" : "Pending" };
    });
    const rows = [...grouped.values()].map((row, index) => ({ ...row, id: `${row.examineremail}-${row.coursecode}-${index}`, completionpercentage: row.allocated ? Number(((row.completed / row.allocated) * 100).toFixed(2)) : 0 }));
    const totals = rows.reduce((acc, row) => ({
      allocated: acc.allocated + row.allocated,
      draft: acc.draft + row.draft,
      submitted: acc.submitted + row.submitted,
      completed: acc.completed + row.completed,
      pending: acc.pending + row.pending
    }), { allocated: 0, draft: 0, submitted: 0, completed: 0, pending: 0 });
    res.json({ success: true, data: rows, details, totals, institution });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.daywiseMarksEntryMonitoring = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "examinername", "examineremail", "componenttype", "assessmentcomponent"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [allocations, marks, institution] = await Promise.all([
      ComponentAllocation.find(filter).lean(),
      ComponentMarks.find(filter).lean(),
      institutionFor(filter.colid)
    ]);
    const grouped = new Map();
    const ensureDay = (sourceRow, date) => {
      const key = [date, sourceRow.examineremail, sourceRow.coursecode].map(text).join("||");
      if (!grouped.has(key)) {
        grouped.set(key, {
          date,
          examinername: sourceRow.examinername,
          examineremail: sourceRow.examineremail,
          academicyear: sourceRow.academicyear,
          exam: sourceRow.exam,
          examcode: sourceRow.examcode,
          program: sourceRow.program,
          programcode: sourceRow.programcode,
          course: sourceRow.course,
          coursecode: sourceRow.coursecode,
          allocated: 0,
          draft: 0,
          submitted: 0,
          marked: 0
        });
      }
      return grouped.get(key);
    };
    allocations.forEach((row) => {
      const date = (row.createdAt || row.updatedAt || new Date()).toISOString().slice(0, 10);
      ensureDay(row, date).allocated += 1;
    });
    marks.forEach((row) => {
      const date = row.submissionstatus === "Submitted" && row.submitteddate ? row.submitteddate : (row.updatedAt || row.createdAt || new Date()).toISOString().slice(0, 10);
      const item = ensureDay(row, date);
      item.marked += 1;
      if (row.submissionstatus === "Submitted") item.submitted += 1;
      else item.draft += 1;
    });
    const rows = [...grouped.values()].sort((a, b) => `${b.date}${b.coursecode}`.localeCompare(`${a.date}${a.coursecode}`)).map((row, index) => ({ ...row, id: `${row.date}-${row.examineremail}-${row.coursecode}-${index}` }));
    const totals = {
      allocated: rows.reduce((sum, row) => sum + row.allocated, 0),
      draft: rows.reduce((sum, row) => sum + row.draft, 0),
      submitted: rows.reduce((sum, row) => sum + row.submitted, 0),
      marked: rows.reduce((sum, row) => sum + row.marked, 0),
      days: uniq(rows.map((row) => row.date)).length
    };
    res.json({ success: true, data: rows, totals, institution });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.reassignmentRows = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "examinername", "examineremail", "componenttype", "assessmentcomponent"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [allocations, marks, examiners] = await Promise.all([
      ComponentAllocation.find(filter).sort({ coursecode: 1, examinername: 1, regno: 1 }).lean(),
      ComponentMarks.find(buildFilter(req.query, ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "examinername", "examineremail", "componenttype", "assessmentcomponent"])).lean(),
      ConductExamExaminer.find({ colid: filter.colid }).sort({ examinername: 1 }).lean()
    ]);
    const markMap = new Map(marks.map((row) => [markKey(row), row]));
    const rows = allocations.map((row) => ({ ...row, markedstatus: markMap.has(markKey(row)) ? "Marked" : "Pending" }));
    const relevantCourses = uniq(rows.map((row) => row.coursecode));
    res.json({ success: true, marked: rows.filter((row) => row.markedstatus === "Marked"), pending: rows.filter((row) => row.markedstatus === "Pending"), examiners: examiners.filter((row) => !relevantCourses.length || relevantCourses.includes(row.coursecode)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.reassignExaminer = async (req, res) => {
  try {
    const colid = numberOrUndefined(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const examineremail = text(req.body.examineremail);
    const examinername = text(req.body.examinername);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one paper" });
    if (!examineremail) return res.status(400).json({ success: false, message: "Select target examiner" });
    const rows = await ComponentAllocation.find({ colid, _id: { $in: ids } }).lean();
    const coursecodes = uniq(rows.map((row) => row.coursecode));
    if (coursecodes.length > 1) return res.status(400).json({ success: false, message: "Reassign papers from one course code at a time" });
    const result = await ComponentAllocation.updateMany({ colid, _id: { $in: ids } }, { $set: { examinername, examineremail, user: text(req.body.user) } });
    res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
