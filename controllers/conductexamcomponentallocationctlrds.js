const ConductExamCourse = require("../Models/conductexamcourseds");
const ConductExamRoll = require("../Models/conductexamrollds");
const ConductExamExaminer = require("../Models/conductexamexaminerds");
const AssessmentComponent = require("../Models/assessmentcomponentds");
const ComponentAllocation = require("../Models/conductexamcomponentallocationds");
const ComponentMarks = require("../Models/exammodel2componentmarksds");

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

const courseFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"];
const allocationFields = [...courseFields, "examinername", "examineremail", "student", "regno", "examdate", "examslot", "componenttype", "scoretype", "assessmentgroup", "assessmentgrouptype", "assessmentcomponent", "status"];
const marksFields = ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "student", "regno", "componenttype", "scoretype", "assessmentgroup", "assessmentgrouptype", "assessmentcomponent", "examinername", "examineremail"];

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
  course: text(body.course),
  coursecode: text(body.coursecode),
  student: text(body.student),
  regno: text(body.regno),
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
      filters: Object.fromEntries(["academicyear", "examcode", "regulation", "programcode", "coursecode", "componenttype", "assessmentcomponent"].map((field) => [field, uniq([...courses, ...components, ...allocations].map((row) => row[field]))]))
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
    const data = await ConductExamRoll.find(filter).sort({ seatno: 1, regno: 1, student: 1 }).lean();
    res.json({ success: true, data });
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
    const error = validateAllocation(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ComponentAllocation.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await ComponentAllocation.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
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
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
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
          filter: { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
          update: { $set: item },
          upsert: true
        }
      })), { ordered: false });
    }
    const data = await ComponentAllocation.find({ colid: base.colid, academicyear: base.academicyear, examcode: base.examcode, programcode: base.programcode, coursecode: base.coursecode }).sort({ assessmentcomponent: 1, examinername: 1, regno: 1 }).lean();
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
      const key = [row.academicyear, row.examcode, row.regulation, row.programcode, row.coursecode].join("||");
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
    const filter = buildFilter(req.query, ["academicyear", "examcode", "regulation", "programcode", "coursecode", "componenttype", "assessmentcomponent"]);
    filter.colid = colid;
    filter.examineremail = new RegExp(`^${escapeRegex(examineremail)}$`, "i");
    const allocations = await ComponentAllocation.find(filter).sort({ regno: 1, assessmentcomponent: 1 }).lean();
    const markFilter = buildFilter(req.query, ["academicyear", "examcode", "regulation", "programcode", "coursecode"]);
    markFilter.colid = colid;
    const marks = await ComponentMarks.find(markFilter).lean();
    const markMap = new Map(marks.map((row) => [[row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].join("||"), row]));
    res.json({
      success: true,
      data: allocations.map((row, index) => {
        const mark = markMap.get([row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].join("||"));
        return { ...row, displayid: row.seatno || `ID-${String(index + 1).padStart(4, "0")}`, marksobtained: mark?.marksobtained ?? "" };
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
    rows.forEach((row, index) => {
      const item = marksPayload({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validateMarks(item);
      if (error) {
        errors.push({ row: index + 1, regno: item.regno, message: error });
        return;
      }
      ops.push({
        updateOne: {
          filter: { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, regulation: item.regulation, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
          update: { $set: item },
          upsert: true
        }
      });
    });
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

exports.listMarks = async (req, res) => {
  try {
    const filter = buildFilter(req.query, marksFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ComponentMarks.find(filter).sort({ academicyear: -1, examcode: 1, course: 1, regno: 1, assessmentcomponent: 1 }).lean();
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
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, regulation: item.regulation, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
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
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, regulation: item.regulation, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno, componenttype: item.componenttype, assessmentgroup: item.assessmentgroup, assessmentcomponent: item.assessmentcomponent },
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
