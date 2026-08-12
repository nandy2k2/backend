const ExamMarks = require("../Models/examinationmodel2marksds");
const ExamVivaMarks = require("../Models/examinationmodel2vivamarksds");
const GradingTemplate = require("../Models/exammodel2gradingtemplateds");
const GradingTemplateDetail = require("../Models/exammodel2gradingtemplatedetailds");
const ClassConfiguration = require("../Models/exammodel2classconfigurationds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const ConductExam = require("../Models/conductexamds");
const ConductExamCourse = require("../Models/conductexamcourseds");
const ProgramwiseMarksheetConfiguration = require("../Models/programwisemarksheetconfigurationds");
const Institution = require("../Models/insdetails");
const BlockchainLedger = require("../Models/blockchainledgerds");
const ComponentMarks = require("../Models/exammodel2componentmarksds");
const ComponentAllocation = require("../Models/conductexamcomponentallocationds");
const GradeConfiguration = require("../Models/gradeconfigurationds");
const PassMarksConfiguration = require("../Models/passmarksconfigurationds");
const ConductExamRoll = require("../Models/conductexamrollds");
const { appendBlock } = require("./blockchainledgerctlrds");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniqueSorted = (values) => Array.from(new Set(values.map(text).filter(Boolean)))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const percent = (obtained, total) => number(total) ? Number(((number(obtained) / number(total)) * 100).toFixed(2)) : 0;
const yes = (value) => ["yes", "true", "1", "on"].includes(text(value).toLowerCase()) || value === true;
const selectedComponentsFrom = (source = {}) => {
  if (Array.isArray(source.components)) return source.components.map(text).filter(Boolean);
  if (text(source.components)) return text(source.components).split(",").map(text).filter(Boolean);
  return ["Theory", "Practical", "Viva"];
};
const wantsVivaMarks = (source = {}) => selectedComponentsFrom(source).some((item) => /^viva$/i.test(item));
const getUGCGrade = (percentage) => {
  const value = number(percentage);
  if (value >= 90) return { grade: "O", gradepoint: 10 };
  if (value >= 80) return { grade: "A+", gradepoint: 9 };
  if (value >= 70) return { grade: "A", gradepoint: 8 };
  if (value >= 60) return { grade: "B+", gradepoint: 7 };
  if (value >= 50) return { grade: "B", gradepoint: 6 };
  if (value >= 40) return { grade: "C", gradepoint: 5 };
  if (value >= 36) return { grade: "P", gradepoint: 4 };
  return { grade: "F", gradepoint: 0 };
};
const componentMarkKey = (row) => [row.colid, row.academicyear, row.examcode, row.regulation, row.programcode, row.coursecode, row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].map(text).join("||");
const studentCourseKey = (row) => [row.colid, row.academicyear, row.examcode, row.regulation, row.programcode, row.semester, row.coursecode, row.regno].map(text).join("||");
const gradeFromRules = (percentage, rows = []) => {
  const value = number(percentage);
  const rule = rows.find((item) => value >= number(item.frompercentage) && value <= number(item.topercentage));
  return rule ? { grade: text(rule.grade), gradepoint: number(rule.gradepoint) } : getUGCGrade(value);
};
const passStatusFromRule = (component, obtained, total, rules = []) => {
  const rule = rules.find((item) => text(item.component).toLowerCase() === text(component).toLowerCase());
  if (!rule) return "Pass";
  const threshold = number(rule.passpercentage) || percent(rule.passmarks, rule.maxmarks || total);
  return percent(obtained, total) >= threshold ? "Pass" : "Fail";
};

const markFields = [
  "academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode",
  "credit", "student", "regno", "abcid", "examrollno", "examseatno", "theorymarks", "theoryobtained", "theorypercentage", "theorygradepoint", "theorygrade",
  "practicalmarks", "practicaltotal", "practicalpercentage", "practicalgradepoint", "practicalgrade", "overalltotalmarks", "overallobtained", "overallgradepoint", "overallgrade",
  "overallpercentage", "gpa", "status", "attempt", "type", "examdate", "resultprocessdate"
];
const vivaMarkFields = [
  "academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode",
  "credit", "student", "regno", "abcid", "theorymarks", "theoryobtained", "theorypercentage", "theorygradepoint", "theorygrade",
  "theorystatus",
  "practicalmarks", "practicaltotal", "practicalpercentage", "practicalgradepoint", "practicalgrade",
  "practicalstatus",
  "vivatotal", "vivaobtained", "vivapercentage", "vivagpa", "vivagrade",
  "overalltotalmarks", "overallobtained", "overallgradepoint", "overallgrade", "overallpercentage", "gpa", "status", "attempt", "type", "examdate", "resultprocessdate"
];
const gradingTemplateFields = ["academicyear", "templatedescription", "status"];
const gradingTemplateDetailFields = ["academicyear", "templatename", "templateid", "frommarks", "tomarks", "gradepoint", "grade"];
const classConfigurationFields = ["academicyear", "program", "programcode", "fromsgpa", "tosgpa", "classassigned"];
const passMarksFields = ["academicyear", "regulation", "program", "programcode", "course", "coursecode", "component", "maxmarks", "passmarks", "passpercentage", "status"];

const buildFilter = (source = {}) => {
  const filter = { colid: number(source.colid) };
  markFields.forEach((field) => {
    if (["credit", "theorymarks", "theoryobtained", "theorypercentage", "theorygradepoint", "practicalmarks", "practicaltotal", "practicalpercentage", "practicalgradepoint", "overalltotalmarks", "overallobtained", "overallgradepoint", "overallpercentage", "gpa", "attempt"].includes(field)) return;
    if (text(source[field])) filter[field] = text(source[field]);
  });
  if (text(source.name)) filter.student = new RegExp(escapeRegex(source.name), "i");
  if (text(source.studentsearch)) {
    const regex = new RegExp(escapeRegex(source.studentsearch), "i");
    filter.$or = [{ student: regex }, { regno: regex }, { abcid: regex }];
  }
  return filter;
};

const buildVivaFilter = (source = {}) => {
  const filter = { colid: number(source.colid) };
  vivaMarkFields.forEach((field) => {
    if (["credit", "theorymarks", "theoryobtained", "theorypercentage", "theorygradepoint", "practicalmarks", "practicaltotal", "practicalpercentage", "practicalgradepoint", "vivatotal", "vivaobtained", "vivapercentage", "vivagpa", "overalltotalmarks", "overallobtained", "overallgradepoint", "overallpercentage", "gpa", "attempt"].includes(field)) return;
    if (text(source[field])) filter[field] = text(source[field]);
  });
  if (text(source.name)) filter.student = new RegExp(escapeRegex(source.name), "i");
  if (text(source.studentsearch)) {
    const regex = new RegExp(escapeRegex(source.studentsearch), "i");
    filter.$or = [{ student: regex }, { regno: regex }, { abcid: regex }];
  }
  return filter;
};

const payloadFrom = (body = {}) => {
  const theorymarks = number(body.theorymarks);
  const theoryobtained = number(body.theoryobtained);
  const practicalmarks = number(body.practicalmarks);
  const practicaltotal = number(body.practicaltotal);
  const credit = number(body.credit);
  const overallgradepoint = number(body.overallgradepoint);
  const totalObtained = theoryobtained + practicalmarks;
  const totalMarks = theorymarks + practicaltotal;
  const overalltotalmarks = body.overalltotalmarks === "" || body.overalltotalmarks === undefined
    ? totalMarks
    : number(body.overalltotalmarks);
  const overallobtained = body.overallobtained === "" || body.overallobtained === undefined
    ? totalObtained
    : number(body.overallobtained);
  return {
    colid: number(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    exam: text(body.exam),
    examcode: text(body.examcode),
    program: text(body.program),
    programcode: text(body.programcode),
    semester: text(body.semester),
    course: text(body.course),
    coursecode: text(body.coursecode),
    credit,
    student: text(body.student),
    regno: text(body.regno),
    abcid: text(body.abcid),
    examrollno: text(body.examrollno),
    examseatno: text(body.examseatno),
    theorymarks,
    theoryobtained,
    theorypercentage: body.theorypercentage === "" || body.theorypercentage === undefined ? percent(theoryobtained, theorymarks) : number(body.theorypercentage),
    theorygradepoint: number(body.theorygradepoint),
    theorygrade: text(body.theorygrade),
    theorystatus: text(body.theorystatus) || "Pass",
    practicalmarks,
    practicaltotal,
    practicalpercentage: body.practicalpercentage === "" || body.practicalpercentage === undefined ? percent(practicalmarks, practicaltotal) : number(body.practicalpercentage),
    practicalgradepoint: number(body.practicalgradepoint),
    practicalgrade: text(body.practicalgrade),
    practicalstatus: text(body.practicalstatus) || "Pass",
    overalltotalmarks,
    overallobtained,
    overallgradepoint,
    overallgrade: text(body.overallgrade),
    overallpercentage: body.overallpercentage === "" || body.overallpercentage === undefined ? percent(overallobtained, overalltotalmarks) : number(body.overallpercentage),
    gpa: Number((credit * overallgradepoint).toFixed(2)),
    status: text(body.status) || "Pass",
    attempt: number(body.attempt, 1),
    type: text(body.type) || "Regular",
    examdate: text(body.examdate),
    resultprocessdate: text(body.resultprocessdate),
    user: text(body.user)
  };
};

const vivaPayloadFrom = (body = {}) => {
  const theorymarks = number(body.theorymarks);
  const theoryobtained = number(body.theoryobtained);
  const practicalmarks = number(body.practicalmarks);
  const practicaltotal = number(body.practicaltotal);
  const vivatotal = number(body.vivatotal);
  const vivaobtained = number(body.vivaobtained);
  const credit = number(body.credit);
  const overallgradepoint = number(body.overallgradepoint);
  const totalObtained = theoryobtained + practicalmarks + vivaobtained;
  const totalMarks = theorymarks + practicaltotal + vivatotal;
  const overalltotalmarks = body.overalltotalmarks === "" || body.overalltotalmarks === undefined
    ? totalMarks
    : number(body.overalltotalmarks);
  const overallobtained = body.overallobtained === "" || body.overallobtained === undefined
    ? totalObtained
    : number(body.overallobtained);
  return {
    colid: number(body.colid),
    academicyear: text(body.academicyear),
    regulation: text(body.regulation),
    exam: text(body.exam),
    examcode: text(body.examcode),
    program: text(body.program),
    programcode: text(body.programcode),
    semester: text(body.semester),
    course: text(body.course),
    coursecode: text(body.coursecode),
    credit,
    student: text(body.student),
    regno: text(body.regno),
    abcid: text(body.abcid),
    theorymarks,
    theoryobtained,
    theorypercentage: body.theorypercentage === "" || body.theorypercentage === undefined ? percent(theoryobtained, theorymarks) : number(body.theorypercentage),
    theorygradepoint: number(body.theorygradepoint),
    theorygrade: text(body.theorygrade),
    practicalmarks,
    practicaltotal,
    practicalpercentage: body.practicalpercentage === "" || body.practicalpercentage === undefined ? percent(practicalmarks, practicaltotal) : number(body.practicalpercentage),
    practicalgradepoint: number(body.practicalgradepoint),
    practicalgrade: text(body.practicalgrade),
    vivatotal,
    vivaobtained,
    vivapercentage: body.vivapercentage === "" || body.vivapercentage === undefined ? percent(vivaobtained, vivatotal) : number(body.vivapercentage),
    vivagpa: number(body.vivagpa),
    vivagrade: text(body.vivagrade),
    overalltotalmarks,
    overallobtained,
    overallgradepoint,
    overallgrade: text(body.overallgrade),
    overallpercentage: body.overallpercentage === "" || body.overallpercentage === undefined ? percent(overallobtained, overalltotalmarks) : number(body.overallpercentage),
    gpa: Number((credit * overallgradepoint).toFixed(2)),
    status: text(body.status) || "Pass",
    attempt: number(body.attempt, 1),
    type: text(body.type) || "Regular",
    examdate: text(body.examdate),
    resultprocessdate: text(body.resultprocessdate),
    user: text(body.user)
  };
};

const getInstitution = async (colid) => Institution.findOne({ colid }).sort({ _id: -1 }).lean();

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [marks, vivaMarks, programs, courses, exams] = await Promise.all([
      ExamMarks.find({ colid }).select(markFields.join(" ")).lean(),
      ExamVivaMarks.find({ colid }).select(vivaMarkFields.join(" ")).lean(),
      MPrograms.find({ colid }).select("year program programcode totalcredits").lean(),
      RegulationCourseMap.find({ colid }).select("academicyear regulation program programcode semester course coursecode credit").lean(),
      ConductExam.find({ colid }).select("academicyear examname exam examcode").lean()
    ]);
    const examCourseRows = await ConductExamCourse.find({ colid }).select("academicyear regulation program programcode semester course coursecode exam examcode examdate").lean().catch(() => []);
    const combined = [...marks, ...vivaMarks, ...courses, ...examCourseRows];
    res.json({
      success: true,
      options: {
        academicyear: uniqueSorted([...combined.map((x) => x.academicyear), ...programs.map((x) => x.year), ...exams.map((x) => x.academicyear)]),
        regulation: uniqueSorted(combined.map((x) => x.regulation)),
        exam: uniqueSorted([...marks.map((x) => x.exam), ...vivaMarks.map((x) => x.exam), ...exams.map((x) => x.exam || x.examname), ...examCourseRows.map((x) => x.exam)]),
        examcode: uniqueSorted([...marks.map((x) => x.examcode), ...vivaMarks.map((x) => x.examcode), ...exams.map((x) => x.examcode), ...examCourseRows.map((x) => x.examcode)]),
        program: uniqueSorted([...combined.map((x) => x.program), ...programs.map((x) => x.program)]),
        programcode: uniqueSorted([...combined.map((x) => x.programcode), ...programs.map((x) => x.programcode)]),
        semester: uniqueSorted(combined.map((x) => x.semester)),
        course: uniqueSorted(combined.map((x) => x.course)),
        coursecode: uniqueSorted(combined.map((x) => x.coursecode)),
        statuses: ["Pass", "Fail"],
        types: ["Regular", "Supplementary"]
      },
      programs,
      courses: [...courses, ...examCourseRows]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.students = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const filter = { colid, role: /^Student$/i };
    ["academicyear", "regulation", "program", "programcode", "semester", "section", "category", "gender"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    if (text(req.query.major)) filter.Major = text(req.query.major);
    if (text(req.query.name)) filter.name = new RegExp(escapeRegex(req.query.name), "i");
    if (text(req.query.email)) filter.email = new RegExp(escapeRegex(req.query.email), "i");
    if (text(req.query.regno)) filter.regno = new RegExp(escapeRegex(req.query.regno), "i");
    const data = await User.find(filter).select("name regno abcid email phone photo academicyear regulation program programcode semester section Major").sort({ name: 1, regno: 1 }).limit(1000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.vivaStudents = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const markFilter = { colid };
    ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester"].forEach((field) => {
      if (text(req.query[field])) markFilter[field] = text(req.query[field]);
    });
    if (text(req.query.regno)) markFilter.regno = new RegExp(escapeRegex(req.query.regno), "i");

    const userFilter = { colid, role: /^Student$/i };
    if (text(req.query.name)) userFilter.name = new RegExp(escapeRegex(req.query.name), "i");
    if (text(req.query.email)) userFilter.email = new RegExp(escapeRegex(req.query.email), "i");
    if (text(req.query.phone)) userFilter.phone = new RegExp(escapeRegex(req.query.phone), "i");
    if (text(req.query.regno)) userFilter.regno = new RegExp(escapeRegex(req.query.regno), "i");

    let userMap = new Map();
    const needsUserFilter = text(req.query.name) || text(req.query.email) || text(req.query.phone) || text(req.query.regno);
    if (needsUserFilter) {
      const matchedUsers = await User.find(userFilter).select("name regno abcid email phone photo academicyear regulation program programcode semester section Major").limit(1000).lean();
      const regnos = matchedUsers.map((item) => text(item.regno)).filter(Boolean);
      if (!regnos.length) return res.json({ success: true, data: [] });
      markFilter.regno = { $in: regnos };
      userMap = new Map(matchedUsers.map((item) => [text(item.regno), item]));
    }

    const marks = await ExamVivaMarks.find(markFilter)
      .select("academicyear regulation exam examcode program programcode semester student regno abcid")
      .sort({ academicyear: -1, programcode: 1, semester: 1, regno: 1 })
      .limit(5000)
      .lean();
    const grouped = new Map();
    marks.forEach((row) => {
      const key = text(row.regno);
      if (!key || grouped.has(key)) return;
      grouped.set(key, row);
    });

    if (!userMap.size) {
      const regnos = Array.from(grouped.keys());
      const users = await User.find({ colid, regno: { $in: regnos } }).select("name regno abcid email phone photo academicyear regulation program programcode semester section Major").lean();
      userMap = new Map(users.map((item) => [text(item.regno), item]));
    }

    const data = Array.from(grouped.values()).map((row) => {
      const user = userMap.get(text(row.regno)) || {};
      return {
        _id: `${row.regno}-${row.academicyear}-${row.examcode}`,
        name: user.name || row.student,
        regno: row.regno,
        abcid: row.abcid || user.abcid || "",
        email: user.email || "",
        phone: user.phone || "",
        photo: user.photo || "",
        academicyear: row.academicyear,
        regulation: row.regulation,
        exam: row.exam,
        examcode: row.examcode,
        program: row.program,
        programcode: row.programcode,
        semester: row.semester,
        section: user.section || ""
      };
    });
    res.json({ success: true, data: data.slice(0, 1000) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    if (!filter.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ExamMarks.find(filter).sort({ academicyear: -1, examcode: 1, regno: 1, semester: 1, coursecode: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = payloadFrom(req.body);
    if (!payload.colid || !payload.academicyear || !payload.examcode || !payload.programcode || !payload.semester || !payload.coursecode || !payload.regno) {
      return res.status(400).json({ success: false, message: "Academic year, exam code, program code, semester, course code and student regno are required" });
    }
    const id = req.body.id || req.body._id;
    const data = id
      ? await ExamMarks.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ExamMarks.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: "Duplicate marks entry for this student, course, exam and attempt" });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length) {
      const result = await ExamMarks.deleteMany({ _id: { $in: ids }, colid: number(req.body.colid) });
      if (!result.deletedCount) return res.status(404).json({ success: false, message: "No marks entries found" });
      return res.json({ success: true, message: "Deleted", deleted: result.deletedCount });
    }
    const data = await ExamMarks.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Marks entry not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpdateExamName = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const exam = text(req.body.exam);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select one or more marks entries" });
    if (!exam) return res.status(400).json({ success: false, message: "Exam name is required" });
    const result = await ExamMarks.updateMany(
      { _id: { $in: ids }, colid },
      { $set: { exam, user: text(req.body.user) } },
      { runValidators: true }
    );
    res.json({ success: true, updated: result.modifiedCount || result.matchedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpdateRollSeat = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows found for update" });
    let updated = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const examrollno = text(row.examrollno || row.examroll || row["Exam Roll No"] || row["Exam Roll No."]);
      const examseatno = text(row.examseatno || row.examseat || row["Exam Seat No"] || row["Exam Seat No."]);
      if (!examrollno && !examseatno) {
        errors.push({ row: index + 2, message: "examrollno or examseatno is required" });
        continue;
      }
      const filter = { colid };
      if (text(row._id || row.id)) {
        filter._id = text(row._id || row.id);
      } else {
        ["academicyear", "examcode", "programcode", "semester", "coursecode", "regno"].forEach((field) => {
          if (text(row[field])) filter[field] = text(row[field]);
        });
        filter.attempt = text(row.attempt) ? number(row.attempt, 1) : 1;
      }
      const missingKey = !filter._id && ["academicyear", "examcode", "programcode", "semester", "coursecode", "regno"].some((field) => !filter[field]);
      if (missingKey) {
        errors.push({ row: index + 2, message: "Provide _id or academic year, exam code, program code, semester, course code and regno" });
        continue;
      }
      try {
        const result = await ExamMarks.updateMany(
          filter,
          { $set: { examrollno, examseatno, user: text(req.body.user || row.user) } },
          { runValidators: true }
        );
        const count = result.modifiedCount || result.matchedCount || 0;
        if (!count) errors.push({ row: index + 2, message: "No matching marks entry found" });
        updated += count;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, updated, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    let saved = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      const payload = payloadFrom({ ...rows[index], colid, user: req.body.user || rows[index].user });
      if (!payload.academicyear || !payload.examcode || !payload.programcode || !payload.semester || !payload.coursecode || !payload.regno) {
        errors.push({ row: index + 2, message: "Required fields missing" });
        continue;
      }
      try {
        await ExamMarks.findOneAndUpdate(
          {
            colid,
            academicyear: payload.academicyear,
            examcode: payload.examcode,
            programcode: payload.programcode,
            semester: payload.semester,
            coursecode: payload.coursecode,
            regno: payload.regno,
            attempt: payload.attempt
          },
          payload,
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.vivaList = async (req, res) => {
  try {
    const filter = buildVivaFilter(req.query);
    if (!filter.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ExamVivaMarks.find(filter).sort({ academicyear: -1, examcode: 1, regno: 1, semester: 1, coursecode: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.vivaSave = async (req, res) => {
  try {
    const payload = vivaPayloadFrom(req.body);
    if (!payload.colid || !payload.academicyear || !payload.examcode || !payload.programcode || !payload.semester || !payload.coursecode || !payload.regno) {
      return res.status(400).json({ success: false, message: "Academic year, exam code, program code, semester, course code and student regno are required" });
    }
    const id = req.body.id || req.body._id;
    const data = id
      ? await ExamVivaMarks.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ExamVivaMarks.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: "Duplicate viva marks entry for this student, course, exam and attempt" });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.vivaDelete = async (req, res) => {
  try {
    const data = await ExamVivaMarks.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Viva marks entry not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.vivaBulk = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    let saved = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      const payload = vivaPayloadFrom({ ...rows[index], colid, user: req.body.user || rows[index].user });
      if (!payload.academicyear || !payload.examcode || !payload.programcode || !payload.semester || !payload.coursecode || !payload.regno) {
        errors.push({ row: index + 2, message: "Required fields missing" });
        continue;
      }
      try {
        await ExamVivaMarks.findOneAndUpdate(
          {
            colid,
            academicyear: payload.academicyear,
            examcode: payload.examcode,
            programcode: payload.programcode,
            semester: payload.semester,
            coursecode: payload.coursecode,
            regno: payload.regno,
            attempt: payload.attempt
          },
          payload,
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processInterimMarksTransfer = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    const requestedSemester = text(req.body.semester);
    ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "scoretype", "student", "regno"].forEach((field) => {
      if (text(req.body[field])) filter[field] = text(req.body[field]);
    });
    const ids = toArray(req.body.ids);
    if (ids.length) filter._id = { $in: ids };
    const selectedRegnos = toArray(req.body.regnos);
    if (selectedRegnos.length) filter.regno = { $in: selectedRegnos };

    const componentRows = await ComponentMarks.find(filter).lean();
    if (!componentRows.length) return res.status(404).json({ success: false, message: "No component marks found for selected filters" });

    const baseFilter = { colid };
    ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode"].forEach((field) => {
      if (text(req.body[field])) baseFilter[field] = text(req.body[field]);
    });
    const [allocations, passRules, gradeRules, users] = await Promise.all([
      ComponentAllocation.find(baseFilter).lean(),
      PassMarksConfiguration.find({ colid, status: /^Active$/i }).lean(),
      GradeConfiguration.find({ colid, status: /^Active$/i }).sort({ frompercentage: 1 }).lean(),
      User.find({ colid, regno: { $in: uniqueSorted(componentRows.map((row) => row.regno)) } }).select("name regno abcid").lean()
    ]);
    const allocationMap = new Map(allocations.map((row) => [componentMarkKey(row), row]));
    const userMap = new Map(users.map((row) => [text(row.regno), row]));
    const grouped = new Map();
    componentRows.forEach((mark) => {
      const allocation = allocationMap.get(componentMarkKey(mark)) || {};
      const merged = { ...allocation, ...mark, semester: allocation.semester || mark.semester || "" };
      if (requestedSemester && text(merged.semester) !== requestedSemester) return;
      const key = studentCourseKey(merged);
      if (!grouped.has(key)) {
        const user = userMap.get(text(merged.regno)) || {};
        grouped.set(key, {
          base: {
            colid,
            academicyear: merged.academicyear,
            regulation: merged.regulation,
            exam: merged.exam,
            examcode: merged.examcode,
            program: merged.program,
            programcode: merged.programcode,
            semester: merged.semester,
            course: merged.course,
            coursecode: merged.coursecode,
            credit: number(merged.credits || merged.credit),
            student: merged.student || user.name || "",
            regno: merged.regno,
            abcid: user.abcid || merged.abcid || "",
            attempt: number(req.body.attempt, 1),
            type: text(req.body.type) || "Regular",
            examdate: text(req.body.examdate || merged.examdate),
            resultprocessdate: text(req.body.resultprocessdate) || new Date().toISOString().slice(0, 10),
            user: text(req.body.user)
          },
          Theory: { total: 0, obtained: 0 },
          Practical: { total: 0, obtained: 0 },
          Viva: { total: 0, obtained: 0 }
        });
      }
      const bucket = grouped.get(key)[text(merged.componenttype)] || grouped.get(key).Theory;
      bucket.total += number(merged.maxmarks);
      bucket.obtained += number(merged.marksobtained);
      if (number(merged.credits) > number(grouped.get(key).base.credit)) grouped.get(key).base.credit = number(merged.credits);
    });

    let processed = 0;
    const preview = [];
    const errors = [];
    for (const group of grouped.values()) {
      try {
        const base = group.base;
        if (!base.semester) throw new Error(`Semester not found for ${base.regno} ${base.coursecode}`);
        const matchingPassRules = passRules.filter((rule) => text(rule.academicyear) === text(base.academicyear) && text(rule.regulation) === text(base.regulation) && text(rule.programcode) === text(base.programcode) && text(rule.coursecode) === text(base.coursecode));
        const matchingGradeRules = gradeRules.filter((rule) => text(rule.academicyear) === text(base.academicyear) && text(rule.regulation) === text(base.regulation) && text(rule.programcode) === text(base.programcode) && text(rule.coursecode) === text(base.coursecode));
        const theoryPct = percent(group.Theory.obtained, group.Theory.total);
        const practicalPct = percent(group.Practical.obtained, group.Practical.total);
        const vivaPct = percent(group.Viva.obtained, group.Viva.total);
        const overallTotal = group.Theory.total + group.Practical.total + group.Viva.total;
        const overallObtained = group.Theory.obtained + group.Practical.obtained + group.Viva.obtained;
        const overallPct = percent(overallObtained, overallTotal);
        const theoryGrade = gradeFromRules(theoryPct, matchingGradeRules);
        const practicalGrade = gradeFromRules(practicalPct, matchingGradeRules);
        const vivaGrade = gradeFromRules(vivaPct, matchingGradeRules);
        const overallGrade = gradeFromRules(overallPct, matchingGradeRules);
        const theorystatus = passStatusFromRule("Theory", group.Theory.obtained, group.Theory.total, matchingPassRules);
        const practicalstatus = passStatusFromRule("Practical", group.Practical.obtained, group.Practical.total, matchingPassRules);
        const vivastatus = passStatusFromRule("Viva", group.Viva.obtained, group.Viva.total, matchingPassRules);
        const status = [theorystatus, practicalstatus, vivastatus].includes("Fail") || overallGrade.grade === "F" ? "Fail" : "Pass";
        const payload = vivaPayloadFrom({
          ...base,
          theorymarks: group.Theory.total,
          theoryobtained: group.Theory.obtained,
          theorypercentage: theoryPct,
          theorygradepoint: theoryGrade.gradepoint,
          theorygrade: theoryGrade.grade,
          theorystatus,
          practicaltotal: group.Practical.total,
          practicalmarks: group.Practical.obtained,
          practicalpercentage: practicalPct,
          practicalgradepoint: practicalGrade.gradepoint,
          practicalgrade: practicalGrade.grade,
          practicalstatus,
          vivatotal: group.Viva.total,
          vivaobtained: group.Viva.obtained,
          vivapercentage: vivaPct,
          vivagpa: vivaGrade.gradepoint,
          vivagrade: vivaGrade.grade,
          overalltotalmarks: overallTotal,
          overallobtained: overallObtained,
          overallpercentage: overallPct,
          overallgradepoint: overallGrade.gradepoint,
          overallgrade: status === "Fail" ? "F" : overallGrade.grade,
          status
        });
        if (status === "Fail") {
          payload.overallgrade = "F";
          payload.overallgradepoint = 0;
          payload.gpa = 0;
        }
        await ExamVivaMarks.findOneAndUpdate(
          { colid, academicyear: payload.academicyear, examcode: payload.examcode, programcode: payload.programcode, semester: payload.semester, coursecode: payload.coursecode, regno: payload.regno, attempt: payload.attempt },
          payload,
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        processed += 1;
        preview.push(payload);
      } catch (error) {
        errors.push({ key: group.base?.regno || "", message: error.message });
      }
    }
    res.json({ success: true, processed, errors, data: preview.slice(0, 500) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateInterimComponentScoreType = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const scoretype = text(req.body.scoretype);
    if (!["Internal", "External"].includes(scoretype)) return res.status(400).json({ success: false, message: "Select Internal or External" });
    if (!text(req.body.coursecode)) return res.status(400).json({ success: false, message: "Course code is required" });
    if (!text(req.body.assessmentcomponent)) return res.status(400).json({ success: false, message: "Assessment component is required" });

    const filter = {
      colid,
      coursecode: text(req.body.coursecode),
      assessmentcomponent: text(req.body.assessmentcomponent)
    };
    ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "semester", "course", "componenttype", "assessmentgroup"].forEach((field) => {
      if (text(req.body[field])) filter[field] = text(req.body[field]);
    });

    const result = await ComponentMarks.updateMany(filter, {
      $set: {
        scoretype,
        user: text(req.body.user)
      }
    });
    res.json({ success: true, matched: result.matchedCount || 0, modified: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const templatePayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  templatedescription: text(body.templatedescription),
  status: text(body.status) || "Active",
  user: text(body.user)
});

const templateDetailPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  templatename: text(body.templatename),
  templateid: text(body.templateid),
  frommarks: number(body.frommarks),
  tomarks: number(body.tomarks),
  gradepoint: number(body.gradepoint),
  grade: text(body.grade),
  user: text(body.user)
});

const classConfigurationPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  program: text(body.program),
  programcode: text(body.programcode),
  fromsgpa: number(body.fromsgpa),
  tosgpa: number(body.tosgpa),
  classassigned: text(body.classassigned),
  user: text(body.user)
});

const passMarksPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  course: text(body.course),
  coursecode: text(body.coursecode),
  component: text(body.component),
  maxmarks: number(body.maxmarks),
  passmarks: number(body.passmarks),
  passpercentage: number(body.passpercentage),
  status: text(body.status) || "Active",
  user: text(body.user)
});

exports.passMarksConfigurations = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    passMarksFields.forEach((field) => {
      if (["maxmarks", "passmarks", "passpercentage"].includes(field)) return;
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await PassMarksConfiguration.find(filter).sort({ academicyear: -1, programcode: 1, coursecode: 1, component: 1 }).lean();
    const optionSource = data.length ? data : await RegulationCourseMap.find({ colid }).select("academicyear regulation program programcode course coursecode").lean();
    res.json({
      success: true,
      data,
      options: Object.fromEntries(passMarksFields.filter((field) => !["maxmarks", "passmarks", "passpercentage"].includes(field)).map((field) => [field, uniqueSorted(optionSource.map((row) => row[field]))]))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePassMarksConfiguration = async (req, res) => {
  try {
    const payload = passMarksPayload(req.body);
    if (!payload.colid || !payload.academicyear || !payload.regulation || !payload.programcode || !payload.coursecode || !payload.component) {
      return res.status(400).json({ success: false, message: "Academic year, regulation, program code, course code and component are required" });
    }
    const id = req.body.id || req.body._id;
    const data = id
      ? await PassMarksConfiguration.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await PassMarksConfiguration.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode, coursecode: payload.coursecode, component: payload.component },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Duplicate passmarks configuration" : error.message });
  }
};

exports.deletePassMarksConfiguration = async (req, res) => {
  try {
    const data = await PassMarksConfiguration.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Passmarks configuration not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkPassMarksConfigurations = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const payload = passMarksPayload({ ...rows[index], colid, user: req.body.user || rows[index].user });
        if (!payload.academicyear || !payload.regulation || !payload.programcode || !payload.coursecode || !payload.component) throw new Error("Required fields missing");
        await PassMarksConfiguration.findOneAndUpdate(
          { colid, academicyear: payload.academicyear, regulation: payload.regulation, programcode: payload.programcode, coursecode: payload.coursecode, component: payload.component },
          payload,
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.gradingTemplates = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    gradingTemplateFields.forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await GradingTemplate.find(filter).sort({ academicyear: -1, templatedescription: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveGradingTemplate = async (req, res) => {
  try {
    const payload = templatePayload(req.body);
    if (!payload.colid || !payload.academicyear) return res.status(400).json({ success: false, message: "Academic year is required" });
    const id = req.body.id || req.body._id;
    const data = id
      ? await GradingTemplate.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await GradingTemplate.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteGradingTemplate = async (req, res) => {
  try {
    const data = await GradingTemplate.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Template not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkGradingTemplates = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const payload = templatePayload({ ...rows[index], colid, user: req.body.user || rows[index].user });
        if (!payload.academicyear) throw new Error("Academic year is required");
        await GradingTemplate.create(payload);
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.gradingTemplateDetails = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    gradingTemplateDetailFields.forEach((field) => {
      if (["frommarks", "tomarks", "gradepoint"].includes(field)) return;
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await GradingTemplateDetail.find(filter).sort({ academicyear: -1, templateid: 1, frommarks: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveGradingTemplateDetail = async (req, res) => {
  try {
    const payload = templateDetailPayload(req.body);
    if (!payload.colid || !payload.academicyear || !payload.templateid) {
      return res.status(400).json({ success: false, message: "Academic year and template are required" });
    }
    const id = req.body.id || req.body._id;
    const data = id
      ? await GradingTemplateDetail.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await GradingTemplateDetail.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteGradingTemplateDetail = async (req, res) => {
  try {
    const data = await GradingTemplateDetail.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Template detail not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkGradingTemplateDetails = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const payload = templateDetailPayload({ ...rows[index], colid, user: req.body.user || rows[index].user });
        if (!payload.academicyear || !payload.templateid) throw new Error("Academic year and template id are required");
        await GradingTemplateDetail.create(payload);
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.classConfigurations = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    classConfigurationFields.forEach((field) => {
      if (["fromsgpa", "tosgpa"].includes(field)) return;
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const data = await ClassConfiguration.find(filter).sort({ academicyear: -1, programcode: 1, fromsgpa: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveClassConfiguration = async (req, res) => {
  try {
    const payload = classConfigurationPayload(req.body);
    if (!payload.colid || !payload.academicyear || !payload.programcode || !payload.classassigned) {
      return res.status(400).json({ success: false, message: "Academic year, program code and class assigned are required" });
    }
    const id = req.body.id || req.body._id;
    const data = id
      ? await ClassConfiguration.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ClassConfiguration.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteClassConfiguration = async (req, res) => {
  try {
    const data = await ClassConfiguration.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Class configuration not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkClassConfigurations = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const payload = classConfigurationPayload({ ...rows[index], colid, user: req.body.user || rows[index].user });
        if (!payload.academicyear || !payload.programcode || !payload.classassigned) throw new Error("Academic year, program code and class assigned are required");
        await ClassConfiguration.create(payload);
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const toArray = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map(text).filter(Boolean);
};

exports.processGrades = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    const exam = text(req.body.exam);
    const examcode = text(req.body.examcode);
    const templateid = text(req.body.templateid);
    const component = text(req.body.component);
    const programcodes = toArray(req.body.programcodes);
    const coursecodes = toArray(req.body.coursecodes);
    if (!colid || !academicyear || !examcode || !templateid || !component) {
      return res.status(400).json({ success: false, message: "Academic year, exam code, template and component are required" });
    }
    const details = await GradingTemplateDetail.find({ colid, templateid }).sort({ frommarks: -1 }).lean();
    if (!details.length) return res.status(404).json({ success: false, message: "No grade ranges found for selected template" });
    const filter = { colid, academicyear, examcode };
    if (exam) filter.exam = exam;
    if (programcodes.length) filter.programcode = { $in: programcodes };
    if (coursecodes.length) filter.coursecode = { $in: coursecodes };
    const rows = await ExamMarks.find(filter).sort({ programcode: 1, coursecode: 1, regno: 1 });
    let updated = 0;
    const skipped = [];
    const preview = [];
    for (const row of rows) {
      let sourceValue = 0;
      if (component === "Theory") {
        const overallTotal = number(row.overalltotalmarks);
        if (!overallTotal) {
          skipped.push({ id: row._id, regno: row.regno, coursecode: row.coursecode, marks: number(row.theoryobtained), reason: "Overall total is missing" });
          continue;
        }
        sourceValue = percent(row.theoryobtained, overallTotal);
        row.theorypercentage = sourceValue;
      } else if (component === "Practical") {
        sourceValue = number(row.practicalmarks);
      } else {
        const overallTotal = number(row.overalltotalmarks);
        if (!overallTotal) {
          skipped.push({ id: row._id, regno: row.regno, coursecode: row.coursecode, marks: number(row.overallobtained), reason: "Overall total is missing" });
          continue;
        }
        sourceValue = percent(row.overallobtained, overallTotal);
        row.overallpercentage = sourceValue;
      }
      const gradeRule = details.find((item) => sourceValue >= number(item.frommarks) && sourceValue <= number(item.tomarks));
      if (!gradeRule) {
        skipped.push({ id: row._id, regno: row.regno, coursecode: row.coursecode, marks: sourceValue });
        continue;
      }
      if (component === "Theory") {
        row.theorygradepoint = number(gradeRule.gradepoint);
        row.theorygrade = text(gradeRule.grade);
      } else if (component === "Practical") {
        row.practicalgradepoint = number(gradeRule.gradepoint);
        row.practicalgrade = text(gradeRule.grade);
      } else {
        row.overallgradepoint = number(gradeRule.gradepoint);
        row.overallgrade = text(gradeRule.grade);
        row.gpa = Number((number(row.credit) * number(gradeRule.gradepoint)).toFixed(2));
      }
      await row.save();
      updated += 1;
      preview.push(row.toObject());
    }
    res.json({ success: true, updated, skipped, data: preview.slice(0, 500) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processPercentages = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    const exam = text(req.body.exam);
    const examcode = text(req.body.examcode);
    const component = text(req.body.component);
    const programcodes = toArray(req.body.programcodes);
    const coursecodes = toArray(req.body.coursecodes);
    if (!colid || !academicyear || !examcode || !component) {
      return res.status(400).json({ success: false, message: "Academic year, exam code and component are required" });
    }
    const filter = { colid, academicyear, examcode };
    if (exam) filter.exam = exam;
    if (programcodes.length) filter.programcode = { $in: programcodes };
    if (coursecodes.length) filter.coursecode = { $in: coursecodes };
    const rows = await ExamMarks.find(filter).sort({ programcode: 1, coursecode: 1, regno: 1 });
    let updated = 0;
    const preview = [];
    for (const row of rows) {
      const update = {};
      if (component === "Theory") {
        update.theorypercentage = percent(row.theoryobtained, row.theorymarks);
      } else if (component === "Practical") {
        update.practicalpercentage = percent(row.practicalmarks, row.practicaltotal);
      } else {
        const totalMarks = number(row.theorymarks) + number(row.practicaltotal);
        const obtained = number(row.theoryobtained) + number(row.practicalmarks);
        update.overalltotalmarks = totalMarks;
        update.overallobtained = obtained;
        update.overallpercentage = percent(obtained, totalMarks);
      }
      await ExamMarks.updateOne({ _id: row._id, colid }, { $set: update });
      Object.assign(row, update);
      updated += 1;
      preview.push(row.toObject());
    }
    res.json({ success: true, updated, data: preview.slice(0, 500) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processComponentFailRule = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    const exam = text(req.body.exam);
    const examcode = text(req.body.examcode);
    const regulation = text(req.body.regulation);
    const semester = text(req.body.semester);
    const programcodes = toArray(req.body.programcodes);
    const coursecodes = toArray(req.body.coursecodes);
    const components = toArray(req.body.components).length ? toArray(req.body.components) : ["Theory", "Practical"];
    if (!colid || !academicyear || !examcode) {
      return res.status(400).json({ success: false, message: "Academic year and exam code are required" });
    }
    const filter = { colid, academicyear, examcode };
    if (exam) filter.exam = exam;
    if (regulation) filter.regulation = regulation;
    if (semester) filter.semester = semester;
    if (programcodes.length) filter.programcode = { $in: programcodes };
    if (coursecodes.length) filter.coursecode = { $in: coursecodes };

    const rows = await ExamMarks.find(filter).sort({ programcode: 1, semester: 1, coursecode: 1, regno: 1 });
    let updated = 0;
    const preview = [];
    for (const row of rows) {
      const theoryFail = components.includes("Theory") && /^f$/i.test(text(row.theorygrade));
      const practicalFail = components.includes("Practical") && /^f$/i.test(text(row.practicalgrade));
      if (!theoryFail && !practicalFail) continue;
      const failUpdate = {
        overallgrade: "F",
        overallgradepoint: 0,
        gpa: 0,
        status: "Fail",
        user: text(req.body.user) || row.user
      };
      await ExamMarks.updateOne({ _id: row._id, colid }, { $set: failUpdate });
      Object.assign(row, failUpdate);
      updated += 1;
      preview.push(row.toObject());
    }
    res.json({ success: true, updated, checked: rows.length, data: preview.slice(0, 1000) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processFinalGradeStatus = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    const exam = text(req.body.exam);
    const examcode = text(req.body.examcode);
    const regulation = text(req.body.regulation);
    const semester = text(req.body.semester);
    const programcodes = toArray(req.body.programcodes);
    const coursecodes = toArray(req.body.coursecodes);
    if (!colid || !academicyear || !examcode) {
      return res.status(400).json({ success: false, message: "Academic year and exam code are required" });
    }

    const filter = { colid, academicyear, examcode };
    if (exam) filter.exam = exam;
    if (regulation) filter.regulation = regulation;
    if (semester) filter.semester = semester;
    if (programcodes.length) filter.programcode = { $in: programcodes };
    if (coursecodes.length) filter.coursecode = { $in: coursecodes };

    const rows = await ExamMarks.find(filter).sort({ programcode: 1, semester: 1, coursecode: 1, regno: 1 });
    let updated = 0;
    let passCount = 0;
    let failCount = 0;
    const preview = [];
    for (const row of rows) {
      const nextStatus = /^f$/i.test(text(row.overallgrade)) ? "Fail" : "Pass";
      if (nextStatus === "Fail") failCount += 1;
      else passCount += 1;
      const update = { status: nextStatus, user: text(req.body.user) || row.user };
      await ExamMarks.updateOne({ _id: row._id, colid }, { $set: update });
      Object.assign(row, update);
      updated += 1;
      preview.push(row.toObject());
    }

    res.json({ success: true, checked: rows.length, updated, passCount, failCount, data: preview.slice(0, 1000) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const vivaGradeSource = (row, component) => {
  const selectedComponent = text(component).toLowerCase();
  if (selectedComponent === "theory") return number(row.theoryobtained);
  if (selectedComponent === "practical") return number(row.practicalmarks);
  if (selectedComponent === "viva") return number(row.vivaobtained);
  const obtained = number(row.theoryobtained) + number(row.practicalmarks) + number(row.vivaobtained);
  row.overallobtained = obtained;
  return number(row.overallobtained || obtained);
};

const vivaUgcGradeSource = (row, component) => {
  const selectedComponent = text(component).toLowerCase();
  if (selectedComponent === "theory") return percent(row.theoryobtained, row.theorymarks);
  if (selectedComponent === "practical") return percent(row.practicalmarks, row.practicaltotal);
  if (selectedComponent === "viva") return percent(row.vivaobtained, row.vivatotal);
  const totalMarks = number(row.theorymarks) + number(row.practicaltotal) + number(row.vivatotal);
  const obtained = number(row.theoryobtained) + number(row.practicalmarks) + number(row.vivaobtained);
  row.overalltotalmarks = totalMarks;
  row.overallobtained = obtained;
  row.overallpercentage = percent(obtained, totalMarks);
  return row.overallpercentage;
};

exports.vivaProcessGrades = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    const exam = text(req.body.exam);
    const examcode = text(req.body.examcode);
    const templateid = text(req.body.templateid);
    const component = text(req.body.component);
    const useUgcTemplate = yes(req.body.useUgcTemplate);
    const programcodes = toArray(req.body.programcodes);
    const coursecodes = toArray(req.body.coursecodes);
    if (!colid || !academicyear || !examcode || !component || (!useUgcTemplate && !templateid)) {
      return res.status(400).json({ success: false, message: "Academic year, exam code, component and grading template are required unless UGC template is selected" });
    }
    const details = useUgcTemplate ? [] : await GradingTemplateDetail.find({ colid, templateid }).sort({ frommarks: -1 }).lean();
    if (!useUgcTemplate && !details.length) return res.status(404).json({ success: false, message: "No grade ranges found for selected template" });
    const filter = { colid, academicyear, examcode };
    if (exam) filter.exam = exam;
    if (programcodes.length) filter.programcode = { $in: programcodes };
    if (coursecodes.length) filter.coursecode = { $in: coursecodes };
    const rows = await ExamVivaMarks.find(filter).sort({ programcode: 1, coursecode: 1, regno: 1 });
    let updated = 0;
    const skipped = [];
    const preview = [];
    for (const row of rows) {
      const sourceValue = useUgcTemplate ? vivaUgcGradeSource(row, component) : vivaGradeSource(row, component);
      const gradeRule = useUgcTemplate
        ? getUGCGrade(sourceValue)
        : details.find((item) => sourceValue >= number(item.frommarks) && sourceValue <= number(item.tomarks));
      if (!gradeRule) {
        skipped.push({ id: row._id, regno: row.regno, coursecode: row.coursecode, marks: sourceValue });
        continue;
      }
      const selectedComponent = text(component).toLowerCase();
      if (selectedComponent === "theory") {
        row.theorygradepoint = number(gradeRule.gradepoint);
        row.theorygrade = text(gradeRule.grade);
      } else if (selectedComponent === "practical") {
        row.practicalgradepoint = number(gradeRule.gradepoint);
        row.practicalgrade = text(gradeRule.grade);
      } else if (selectedComponent === "viva") {
        row.vivagpa = number(gradeRule.gradepoint);
        row.vivagrade = text(gradeRule.grade);
      } else {
        const totalMarks = number(row.theorymarks) + number(row.practicaltotal) + number(row.vivatotal);
        const obtained = number(row.theoryobtained) + number(row.practicalmarks) + number(row.vivaobtained);
        row.overalltotalmarks = totalMarks;
        row.overallobtained = obtained;
        row.overallpercentage = percent(obtained, totalMarks);
        row.overallgradepoint = number(gradeRule.gradepoint);
        row.overallgrade = text(gradeRule.grade);
        row.gpa = Number((number(row.credit) * number(row.overallgradepoint)).toFixed(2));
      }
      await row.save();
      updated += 1;
      preview.push(row.toObject());
    }
    res.json({ success: true, updated, skipped, data: preview.slice(0, 500) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.vivaProcessPercentages = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    const exam = text(req.body.exam);
    const examcode = text(req.body.examcode);
    const component = text(req.body.component);
    const programcodes = toArray(req.body.programcodes);
    const coursecodes = toArray(req.body.coursecodes);
    if (!colid || !academicyear || !examcode || !component) {
      return res.status(400).json({ success: false, message: "Academic year, exam code and component are required" });
    }
    const filter = { colid, academicyear, examcode };
    if (exam) filter.exam = exam;
    if (programcodes.length) filter.programcode = { $in: programcodes };
    if (coursecodes.length) filter.coursecode = { $in: coursecodes };
    const rows = await ExamVivaMarks.find(filter).sort({ programcode: 1, coursecode: 1, regno: 1 });
    let updated = 0;
    const preview = [];
    for (const row of rows) {
      if (component === "Theory") {
        row.theorypercentage = percent(row.theoryobtained, row.theorymarks);
      } else if (component === "Practical") {
        row.practicalpercentage = percent(row.practicalmarks, row.practicaltotal);
      } else if (component === "Viva") {
        row.vivapercentage = percent(row.vivaobtained, row.vivatotal);
      } else {
        const totalMarks = number(row.theorymarks) + number(row.practicaltotal) + number(row.vivatotal);
        const obtained = number(row.theoryobtained) + number(row.practicalmarks) + number(row.vivaobtained);
        row.overalltotalmarks = totalMarks;
        row.overallobtained = obtained;
        row.overallpercentage = percent(obtained, totalMarks);
      }
      await row.save();
      updated += 1;
      preview.push(row.toObject());
    }
    res.json({ success: true, updated, data: preview.slice(0, 500) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.vivaProcessComponentFailRule = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    const exam = text(req.body.exam);
    const examcode = text(req.body.examcode);
    const regulation = text(req.body.regulation);
    const semester = text(req.body.semester);
    const programcodes = toArray(req.body.programcodes);
    const coursecodes = toArray(req.body.coursecodes);
    const components = toArray(req.body.components).length ? toArray(req.body.components) : ["Theory", "Practical", "Viva"];
    if (!colid || !academicyear || !examcode) {
      return res.status(400).json({ success: false, message: "Academic year and exam code are required" });
    }
    const filter = { colid, academicyear, examcode };
    if (exam) filter.exam = exam;
    if (regulation) filter.regulation = regulation;
    if (semester) filter.semester = semester;
    if (programcodes.length) filter.programcode = { $in: programcodes };
    if (coursecodes.length) filter.coursecode = { $in: coursecodes };
    const rows = await ExamVivaMarks.find(filter).sort({ programcode: 1, semester: 1, coursecode: 1, regno: 1 });
    let updated = 0;
    const preview = [];
    for (const row of rows) {
      const theoryFail = components.includes("Theory") && /^f$/i.test(text(row.theorygrade));
      const practicalFail = components.includes("Practical") && /^f$/i.test(text(row.practicalgrade));
      const vivaFail = components.includes("Viva") && /^f$/i.test(text(row.vivagrade));
      if (!theoryFail && !practicalFail && !vivaFail) continue;
      const failUpdate = {
        overallgrade: "F",
        overallgradepoint: 0,
        gpa: 0,
        status: "Fail",
        user: text(req.body.user) || row.user
      };
      await ExamVivaMarks.updateOne({ _id: row._id, colid }, { $set: failUpdate });
      Object.assign(row, failUpdate);
      updated += 1;
      preview.push(row.toObject());
    }
    res.json({ success: true, updated, checked: rows.length, data: preview.slice(0, 1000) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.marksheet = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const filter = buildFilter(req.query);
    if (!colid || !filter.regno) return res.status(400).json({ success: false, message: "colid and regno are required" });
    const marks = await ExamMarks.find(filter).sort({ semester: 1, coursecode: 1 }).lean();
    if (!marks.length) return res.status(404).json({ success: false, message: "No marks found for selected student" });
    const first = marks[0];
    const [student, program, config, institution] = await Promise.all([
      User.findOne({ colid, $or: [{ regno: first.regno }, { email: first.regno }] }).lean(),
      MPrograms.findOne({ colid, year: first.academicyear, programcode: first.programcode }).sort({ _id: -1 }).lean(),
      ProgramwiseMarksheetConfiguration.findOne({ colid, academicyear: first.academicyear, regulation: first.regulation, programcode: first.programcode }).lean(),
      getInstitution(colid)
    ]);
    const creditsEarned = marks.filter((row) => /^Pass$/i.test(text(row.status))).reduce((sum, row) => sum + number(row.credit), 0);
    const creditsAttempted = marks.reduce((sum, row) => sum + number(row.credit), 0);
    const totalGpa = marks.reduce((sum, row) => sum + number(row.gpa), 0);
    const sgpa = creditsAttempted ? Number((totalGpa / creditsAttempted).toFixed(2)) : 0;
    const allStudentMarks = await ExamMarks.find({
      colid,
      regno: first.regno,
      academicyear: first.academicyear,
      programcode: first.programcode
    }).lean();
    const allCredits = allStudentMarks.reduce((sum, row) => sum + number(row.credit), 0);
    const allGpa = allStudentMarks.reduce((sum, row) => sum + number(row.gpa), 0);
    const cgpa = allCredits ? Number((allGpa / allCredits).toFixed(2)) : sgpa;
    const classRule = await ClassConfiguration.findOne({
      colid,
      academicyear: first.academicyear,
      programcode: first.programcode,
      fromsgpa: { $lte: sgpa },
      tosgpa: { $gte: sgpa }
    }).sort({ fromsgpa: -1 }).lean();
    res.json({
      success: true,
      student: {
        name: student?.name || first.student,
        regno: first.regno,
        abcid: first.abcid || student?.abcid || "",
        photo: student?.photo || "",
        email: student?.email || "",
        phone: student?.phone || "",
        program: first.program,
        programcode: first.programcode,
        semester: first.semester,
        academicyear: first.academicyear,
        regulation: first.regulation
      },
      marks,
      summary: {
        creditsoffered: number(program?.totalcredits),
        creditsearned: creditsEarned,
        creditsattempted: creditsAttempted,
        sgpa,
        cgpa,
        classassigned: classRule?.classassigned || "",
        resultprocessdate: first.resultprocessdate || marks.find((row) => row.resultprocessdate)?.resultprocessdate || "",
        result: marks.some((row) => /^Fail$/i.test(text(row.status))) ? "Fail" : "Pass"
      },
      marksheetconfiguration: config || {},
      institution: institution || {}
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.vivaMarksheet = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const filter = buildVivaFilter(req.query);
    if (!colid || !filter.regno) return res.status(400).json({ success: false, message: "colid and regno are required" });
    const TargetModel = wantsVivaMarks(req.query) ? ExamVivaMarks : ExamMarks;
    const marks = await TargetModel.find(filter).sort({ semester: 1, coursecode: 1 }).lean();
    if (!marks.length) return res.status(404).json({ success: false, message: wantsVivaMarks(req.query) ? "No viva marks found for selected student" : "No marks found for selected student" });
    const first = marks[0];
    const [student, program, config, institution] = await Promise.all([
      User.findOne({ colid, $or: [{ regno: first.regno }, { email: first.regno }] }).lean(),
      MPrograms.findOne({ colid, year: first.academicyear, programcode: first.programcode }).sort({ _id: -1 }).lean(),
      ProgramwiseMarksheetConfiguration.findOne({ colid, academicyear: first.academicyear, regulation: first.regulation, programcode: first.programcode }).lean(),
      getInstitution(colid)
    ]);
    const creditsEarned = marks.filter((row) => /^Pass$/i.test(text(row.status))).reduce((sum, row) => sum + number(row.credit), 0);
    const creditsAttempted = marks.reduce((sum, row) => sum + number(row.credit), 0);
    const totalGpa = marks.reduce((sum, row) => sum + number(row.gpa), 0);
    const sgpa = creditsAttempted ? Number((totalGpa / creditsAttempted).toFixed(2)) : 0;
    const allStudentMarks = await TargetModel.find({
      colid,
      regno: first.regno,
      academicyear: first.academicyear,
      programcode: first.programcode
    }).lean();
    const allCredits = allStudentMarks.reduce((sum, row) => sum + number(row.credit), 0);
    const allGpa = allStudentMarks.reduce((sum, row) => sum + number(row.gpa), 0);
    const cgpa = allCredits ? Number((allGpa / allCredits).toFixed(2)) : sgpa;
    const classRule = await ClassConfiguration.findOne({
      colid,
      academicyear: first.academicyear,
      programcode: first.programcode,
      fromsgpa: { $lte: sgpa },
      tosgpa: { $gte: sgpa }
    }).sort({ fromsgpa: -1 }).lean();
    res.json({
      success: true,
      student: {
        name: student?.name || first.student,
        regno: first.regno,
        abcid: first.abcid || student?.abcid || "",
        photo: student?.photo || "",
        email: student?.email || "",
        phone: student?.phone || "",
        program: first.program,
        programcode: first.programcode,
        semester: first.semester,
        academicyear: first.academicyear,
        regulation: first.regulation
      },
      marks,
      summary: {
        creditsoffered: number(program?.totalcredits),
        creditsearned: creditsEarned,
        creditsattempted: creditsAttempted,
        sgpa,
        cgpa,
        classassigned: classRule?.classassigned || "",
        resultprocessdate: first.resultprocessdate || marks.find((row) => row.resultprocessdate)?.resultprocessdate || "",
        result: marks.some((row) => /^Fail$/i.test(text(row.status))) ? "Fail" : "Pass"
      },
      marksheetconfiguration: config || {},
      institution: institution || {}
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.interimSampleMarksheet2 = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid || !text(req.query.regno)) return res.status(400).json({ success: false, message: "colid and regno are required" });
    const requestedSemester = text(req.query.semester);
    const filter = { colid, componenttype: "Theory", regno: text(req.query.regno) };
    ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    let componentRows = await ComponentMarks.find(filter).sort({ coursecode: 1, scoretype: 1, assessmentcomponent: 1 }).lean();
    const missingSemester = componentRows.filter((row) => !text(row.semester));
    if (missingSemester.length) {
      const allocations = await ComponentAllocation.find({
        colid,
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
      }).select("academicyear examcode regulation programcode coursecode regno componenttype assessmentgroup assessmentcomponent semester").lean();
      const allocationMap = new Map(allocations.map((row) => [[row.academicyear, row.examcode, row.regulation, row.programcode, row.coursecode, row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].map(text).join("||"), row.semester]));
      componentRows.forEach((row) => {
        if (text(row.semester)) return;
        const key = [row.academicyear, row.examcode, row.regulation, row.programcode, row.coursecode, row.regno, row.componenttype, row.assessmentgroup, row.assessmentcomponent].map(text).join("||");
        row.semester = allocationMap.get(key) || "";
      });
    }
    if (requestedSemester) componentRows = componentRows.filter((row) => text(row.semester) === requestedSemester);
    if (!componentRows.length) return res.status(404).json({ success: false, message: "No theory interim marks found for selected student" });
    const first = componentRows[0];
    const grouped = new Map();
    componentRows.forEach((row) => {
      const key = [row.academicyear, row.examcode, row.regulation, row.programcode, row.semester, row.coursecode, row.regno].map(text).join("||");
      if (!grouped.has(key)) {
        grouped.set(key, {
          _id: key,
          academicyear: row.academicyear,
          regulation: row.regulation,
          exam: row.exam,
          examcode: row.examcode,
          program: row.program,
          programcode: row.programcode,
          semester: row.semester,
          course: row.course,
          coursecode: row.coursecode,
          credit: number(row.credits),
          student: row.student,
          regno: row.regno,
          examrollno: row.examrollno || "",
          theorymarks: 0,
          theoryobtained: 0,
          internalmarks: 0,
          internalobtained: 0,
          overalltotalmarks: 0,
          overallobtained: 0,
          overallpercentage: 0,
          overallgradepoint: 0,
          overallgrade: "",
          gpa: 0,
          status: "Pass",
          assessmentcomponents: []
        });
      }
      const item = grouped.get(key);
      if (text(row.scoretype).toLowerCase() === "internal") {
        item.internalmarks += number(row.maxmarks);
        item.internalobtained += number(row.marksobtained);
      } else {
        item.theorymarks += number(row.maxmarks);
        item.theoryobtained += number(row.marksobtained);
      }
      item.overalltotalmarks += number(row.maxmarks);
      item.overallobtained += number(row.marksobtained);
      item.assessmentcomponents.push(row.assessmentcomponent);
      if (number(row.credits) > number(item.credit)) item.credit = number(row.credits);
    });
    const marks = Array.from(grouped.values());
    const [student, program, institution, gradeRules, passRules, classRule] = await Promise.all([
      User.findOne({ colid, $or: [{ regno: first.regno }, { email: first.regno }] }).lean(),
      MPrograms.findOne({ colid, year: first.academicyear, programcode: first.programcode }).sort({ _id: -1 }).lean(),
      getInstitution(colid),
      GradeConfiguration.find({ colid, status: /^Active$/i, academicyear: first.academicyear, regulation: first.regulation, programcode: first.programcode }).sort({ frompercentage: 1 }).lean(),
      PassMarksConfiguration.find({ colid, status: /^Active$/i, academicyear: first.academicyear, regulation: first.regulation, programcode: first.programcode }).lean(),
      ClassConfiguration.findOne({ colid, academicyear: first.academicyear, programcode: first.programcode }).sort({ fromsgpa: -1 }).lean()
    ]);
    marks.forEach((row) => {
      row.overallpercentage = percent(row.overallobtained, row.overalltotalmarks);
      const courseGradeRules = gradeRules.filter((rule) => !text(rule.coursecode) || text(rule.coursecode) === text(row.coursecode));
      const grade = gradeFromRules(row.overallpercentage, courseGradeRules);
      row.overallgrade = grade.grade;
      row.overallgradepoint = grade.gradepoint;
      row.gpa = Number((number(row.credit) * number(grade.gradepoint)).toFixed(2));
      const coursePassRules = passRules.filter((rule) => text(rule.coursecode) === text(row.coursecode));
      row.status = passStatusFromRule("Theory", row.overallobtained, row.overalltotalmarks, coursePassRules) === "Fail" || grade.grade === "F" ? "Fail" : "Pass";
    });
    const creditsEarned = marks.filter((row) => /^Pass$/i.test(text(row.status))).reduce((sum, row) => sum + number(row.credit), 0);
    const creditsAttempted = marks.reduce((sum, row) => sum + number(row.credit), 0);
    const totalGpa = marks.reduce((sum, row) => sum + number(row.gpa), 0);
    const sgpa = creditsAttempted ? Number((totalGpa / creditsAttempted).toFixed(2)) : 0;
    const cgpa = sgpa;
    res.json({
      success: true,
      source: "exammodel2componentmarksds",
      componenttype: "Theory",
      student: {
        name: student?.name || first.student,
        regno: first.regno,
        abcid: student?.abcid || "",
        photo: student?.photo || "",
        email: student?.email || "",
        phone: student?.phone || "",
        program: first.program,
        programcode: first.programcode,
        semester: first.semester,
        academicyear: first.academicyear,
        regulation: first.regulation
      },
      marks,
      summary: {
        creditsoffered: number(program?.totalcredits),
        creditsearned: creditsEarned,
        creditsattempted: creditsAttempted,
        sgpa,
        cgpa,
        classassigned: classRule?.classassigned || "",
        resultprocessdate: "",
        result: marks.some((row) => /^Fail$/i.test(text(row.status))) ? "Fail" : "Pass"
      },
      institution: institution || {}
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.trReport = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "type"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    if (!filter.academicyear || !filter.examcode || !filter.programcode || !filter.semester) {
      return res.status(400).json({ success: false, message: "Academic year, exam code, program code and semester are required" });
    }

    const useModel = /^marks$/i.test(text(req.query.model)) ? "marks" : "viva";
    let TargetModel = useModel === "marks" ? ExamMarks : ExamVivaMarks;
    let marks = await TargetModel.find(filter).sort({ regno: 1, coursecode: 1, attempt: 1 }).lean();
    if (!marks.length && useModel !== "marks") {
      TargetModel = ExamMarks;
      marks = await TargetModel.find(filter).sort({ regno: 1, coursecode: 1, attempt: 1 }).lean();
    }
    if (!marks.length) return res.status(404).json({ success: false, message: "No marks found for selected TR filters" });

    const first = marks[0];
    const regnos = uniqueSorted(marks.map((row) => row.regno));
    const coursecodes = uniqueSorted(marks.map((row) => row.coursecode));
    const rollFilter = {
      colid,
      academicyear: first.academicyear,
      examcode: first.examcode,
      programcode: first.programcode,
      semester: first.semester,
      regno: { $in: regnos },
      coursecode: { $in: coursecodes }
    };
    if (text(first.regulation)) rollFilter.regulation = text(first.regulation);
    const [users, rolls, program, exam, institution] = await Promise.all([
      User.find({ colid, regno: { $in: regnos } }).select("name regno email phone photo fathername mothername gender admissionyear academicyear program programcode semester section category abcid").lean(),
      ConductExamRoll.find(rollFilter).select("regno coursecode examsection section seatno examseatno attended admitcardeligible remarks").lean().catch(() => []),
      MPrograms.findOne({ colid, year: first.academicyear, programcode: first.programcode }).sort({ _id: -1 }).lean(),
      ConductExam.findOne({ colid, academicyear: first.academicyear, examcode: first.examcode }).lean(),
      getInstitution(colid)
    ]);

    const userMap = new Map(users.map((row) => [text(row.regno), row]));
    const rollMap = new Map(rolls.map((row) => [`${text(row.regno)}||${text(row.coursecode)}`, row]));
    const courseMap = new Map();
    marks.forEach((row) => {
      if (!courseMap.has(text(row.coursecode))) {
        courseMap.set(text(row.coursecode), {
          course: row.course,
          coursecode: row.coursecode,
          credit: number(row.credit),
          theorymarks: number(row.theorymarks),
          practicaltotal: number(row.practicaltotal),
          vivatotal: number(row.vivatotal),
          overalltotalmarks: number(row.overalltotalmarks)
        });
      }
    });

    const studentRows = regnos.map((regno, index) => {
      const studentMarks = marks.filter((row) => text(row.regno) === regno);
      const user = userMap.get(regno) || {};
      const aggregateObtained = studentMarks.reduce((sum, row) => sum + number(row.overallobtained), 0);
      const aggregateMax = studentMarks.reduce((sum, row) => sum + number(row.overalltotalmarks), 0);
      const failedCodes = studentMarks.filter((row) => /^fail$/i.test(text(row.status)) || /^f$/i.test(text(row.overallgrade))).map((row) => row.coursecode);
      const courseRows = studentMarks.map((row) => {
        const roll = rollMap.get(`${regno}||${text(row.coursecode)}`) || {};
        return {
          _id: row._id,
          course: row.course,
          coursecode: row.coursecode,
          credit: number(row.credit),
          theorymax: number(row.theorymarks),
          theoryobtained: number(row.theoryobtained),
          theorypercentage: number(row.theorypercentage),
          theorygrade: row.theorygrade,
          theorystatus: row.theorystatus || "",
          practicalmax: number(row.practicaltotal),
          practicalobtained: number(row.practicalmarks),
          practicalpercentage: number(row.practicalpercentage),
          practicalgrade: row.practicalgrade,
          practicalstatus: row.practicalstatus || "",
          vivamax: number(row.vivatotal),
          vivaobtained: number(row.vivaobtained),
          vivapercentage: number(row.vivapercentage),
          vivagrade: row.vivagrade || "",
          overallmax: number(row.overalltotalmarks),
          overallobtained: number(row.overallobtained),
          overallpercentage: number(row.overallpercentage),
          overallgrade: row.overallgrade,
          gradepoint: number(row.overallgradepoint),
          gpa: number(row.gpa),
          status: row.status,
          attempt: number(row.attempt, 1),
          type: row.type,
          examdate: row.examdate,
          resultprocessdate: row.resultprocessdate,
          examsection: roll.examsection || roll.section || "",
          seatno: roll.seatno || roll.examseatno || "",
          attended: roll.attended || ""
        };
      });
      return {
        srno: index + 1,
        enrolmentno: regno,
        regno,
        abcid: studentMarks.find((row) => text(row.abcid))?.abcid || user.abcid || "",
        name: user.name || studentMarks[0]?.student || "",
        fathername: user.fathername || "",
        mothername: user.mothername || "",
        gender: user.gender || "",
        studentstatus: studentMarks[0]?.type || "",
        batch: user.admissionyear || "",
        branchname: studentMarks[0]?.program || program?.program || "",
        program: studentMarks[0]?.program || program?.program || "",
        programcode: studentMarks[0]?.programcode || program?.programcode || "",
        section: user.section || "",
        courses: courseRows,
        aggregate: {
          obtained: Number(aggregateObtained.toFixed(2)),
          max: Number(aggregateMax.toFixed(2)),
          percentage: aggregateMax ? Number(((aggregateObtained / aggregateMax) * 100).toFixed(2)) : 0,
          result: failedCodes.length ? "Fail" : "Pass",
          remarks: failedCodes.length ? `Fail in Paper Code: ${failedCodes.join(", ")}` : "",
          attempt: Math.max(...studentMarks.map((row) => number(row.attempt, 1)), 1)
        }
      };
    });

    const genderSummary = ["M", "F", "Other"].map((gender) => {
      const rows = studentRows.filter((row) => {
        const value = text(row.gender).toLowerCase();
        if (gender === "M") return value === "m" || value === "male";
        if (gender === "F") return value === "f" || value === "female";
        return value && !["m", "male", "f", "female"].includes(value);
      });
      return {
        gender,
        appeared: rows.length,
        passed: rows.filter((row) => row.aggregate.result === "Pass").length,
        failed: rows.filter((row) => row.aggregate.result === "Fail").length
      };
    });
    const totalSummary = {
      appeared: studentRows.length,
      passed: studentRows.filter((row) => row.aggregate.result === "Pass").length,
      failed: studentRows.filter((row) => row.aggregate.result === "Fail").length
    };

    res.json({
      success: true,
      source: TargetModel.modelName,
      filters: {
        academicyear: first.academicyear,
        regulation: first.regulation,
        exam: first.exam || exam?.examname || exam?.exam || "",
        examcode: first.examcode,
        program: first.program || program?.program || "",
        programcode: first.programcode,
        semester: first.semester,
        type: first.type || exam?.type || ""
      },
      institution: institution || {},
      program: program || {},
      courses: [...courseMap.values()],
      students: studentRows,
      summary: { genderwise: genderSummary, total: totalSummary },
      missingMappings: [
        "Internal assessment split for theory/practical is not available in exammodel2 marks.",
        "Section A / Section B question-wise marks are not available in exammodel2 marks.",
        "Grace mark detail is not stored separately in exammodel2 marks.",
        "Division is not stored separately in exammodel2 marks."
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verificationUrl = (origin, { colid, regno, hash }) => {
  const params = new URLSearchParams({ colid: String(colid), regno: text(regno), hash: text(hash) });
  return `${origin}/verify-exam-model2-marksheet?${params.toString()}`;
};

exports.storeMarksheetBlockchain = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const regno = text(req.body.regno);
    if (!colid || !regno) return res.status(400).json({ success: false, message: "colid and regno are required" });
    const mockReq = { query: { ...req.body, colid, regno } };
    let payload;
    await new Promise((resolve, reject) => {
      const mockRes = {
        status: (code) => ({ json: (data) => reject(new Error(data.message || `Failed with ${code}`)) }),
        json: (data) => { payload = data; resolve(); }
      };
      exports.marksheet(mockReq, mockRes);
    });
    const block = await appendBlock({
      colid,
      modelname: "examinationmodel2marksheet",
      collectionname: "examinationmodel2marksds",
      recordid: `${regno}-${text(req.body.academicyear)}-${text(req.body.examcode)}-${text(req.body.semester)}`,
      action: "MARKSHEET",
      payload,
      metadata: { regno, academicyear: req.body.academicyear, examcode: req.body.examcode, semester: req.body.semester },
      user: req.body.user
    });
    const origin = text(req.body.origin) || "";
    const url = origin ? verificationUrl(origin, { colid, regno, hash: block.hash }) : "";
    res.json({ success: true, message: "Marksheet stored in blockchain", data: { ...block.toObject(), verificationurl: url } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyMarksheetBlockchain = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const hash = text(req.query.hash);
    const regno = text(req.query.regno);
    const filter = { colid, modelname: { $in: ["examinationmodel2marksheet", "examinationmodel2vivamarksheet"] } };
    if (hash) filter.hash = hash;
    if (!hash && regno) filter["metadata.regno"] = regno;
    const records = await BlockchainLedger.find(filter).sort({ timestamp: -1 }).lean();
    res.json({ success: true, verified: records.length > 0, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.storeVivaMarksheetBlockchain = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const regno = text(req.body.regno);
    if (!colid || !regno) return res.status(400).json({ success: false, message: "colid and regno are required" });
    const mockReq = { query: { ...req.body, colid, regno } };
    let payload;
    await new Promise((resolve, reject) => {
      const mockRes = {
        status: (code) => ({ json: (data) => reject(new Error(data.message || `Failed with ${code}`)) }),
        json: (data) => { payload = data; resolve(); }
      };
      exports.vivaMarksheet(mockReq, mockRes);
    });
    const block = await appendBlock({
      colid,
      modelname: "examinationmodel2vivamarksheet",
      collectionname: "examinationmodel2vivamarksds",
      recordid: `${regno}-${text(req.body.academicyear)}-${text(req.body.examcode)}-${text(req.body.semester)}`,
      action: "VIVA_MARKSHEET",
      payload,
      metadata: { regno, academicyear: req.body.academicyear, examcode: req.body.examcode, semester: req.body.semester },
      user: req.body.user
    });
    const origin = text(req.body.origin) || "";
    const url = origin ? verificationUrl(origin, { colid, regno, hash: block.hash }) : "";
    res.json({ success: true, message: "Viva marksheet stored in blockchain", data: { ...block.toObject(), verificationurl: url } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
