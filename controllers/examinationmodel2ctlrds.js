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

const markFields = [
  "academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode",
  "credit", "student", "regno", "abcid", "theorymarks", "theoryobtained", "theorypercentage", "theorygradepoint", "theorygrade",
  "practicalmarks", "practicaltotal", "practicalpercentage", "practicalgradepoint", "practicalgrade", "overalltotalmarks", "overallobtained", "overallgradepoint", "overallgrade",
  "overallpercentage", "gpa", "status", "attempt", "type", "examdate", "resultprocessdate"
];
const vivaMarkFields = [
  "academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode",
  "credit", "student", "regno", "abcid", "theorymarks", "theoryobtained", "theorypercentage", "theorygradepoint", "theorygrade",
  "practicalmarks", "practicaltotal", "practicalpercentage", "practicalgradepoint", "practicalgrade",
  "vivatotal", "vivaobtained", "vivapercentage", "vivagpa", "vivagrade",
  "overalltotalmarks", "overallobtained", "overallgradepoint", "overallgrade", "overallpercentage", "gpa", "status", "attempt", "type", "examdate", "resultprocessdate"
];
const gradingTemplateFields = ["academicyear", "templatedescription", "status"];
const gradingTemplateDetailFields = ["academicyear", "templatename", "templateid", "frommarks", "tomarks", "gradepoint", "grade"];
const classConfigurationFields = ["academicyear", "program", "programcode", "fromsgpa", "tosgpa", "classassigned"];

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
    const [marks, programs, courses, exams] = await Promise.all([
      ExamMarks.find({ colid }).select(markFields.join(" ")).lean(),
      MPrograms.find({ colid }).select("year program programcode totalcredits").lean(),
      RegulationCourseMap.find({ colid }).select("academicyear regulation program programcode semester course coursecode credit").lean(),
      ConductExam.find({ colid }).select("academicyear examname exam examcode").lean()
    ]);
    const examCourseRows = await ConductExamCourse.find({ colid }).select("academicyear regulation program programcode semester course coursecode exam examcode examdate").lean().catch(() => []);
    const combined = [...marks, ...courses, ...examCourseRows];
    res.json({
      success: true,
      options: {
        academicyear: uniqueSorted([...combined.map((x) => x.academicyear), ...programs.map((x) => x.year), ...exams.map((x) => x.academicyear)]),
        regulation: uniqueSorted(combined.map((x) => x.regulation)),
        exam: uniqueSorted([...marks.map((x) => x.exam), ...exams.map((x) => x.exam || x.examname), ...examCourseRows.map((x) => x.exam)]),
        examcode: uniqueSorted([...marks.map((x) => x.examcode), ...exams.map((x) => x.examcode), ...examCourseRows.map((x) => x.examcode)]),
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
    const data = await ExamMarks.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Marks entry not found" });
    res.json({ success: true, message: "Deleted" });
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
      const sourceValue = component === "Theory"
        ? number(row.theoryobtained)
        : component === "Practical"
          ? number(row.practicalmarks)
          : number(row.overallobtained || (number(row.theoryobtained) + number(row.practicalmarks)));
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
    const marks = await ExamVivaMarks.find(filter).sort({ semester: 1, coursecode: 1 }).lean();
    if (!marks.length) return res.status(404).json({ success: false, message: "No viva marks found for selected student" });
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
    const allStudentMarks = await ExamVivaMarks.find({
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
