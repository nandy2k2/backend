const ExamMarks = require("../Models/examinationmodel2marksds");
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

const markFields = [
  "academicyear", "regulation", "exam", "examcode", "program", "programcode", "semester", "course", "coursecode",
  "credit", "student", "regno", "abcid", "theorymarks", "theoryobtained", "theorypercentage", "theorygrade",
  "practicalmarks", "practicaltotal", "practicalpercentage", "practicalgrade", "overallgradepoint", "overallgrade",
  "overallpercentage", "gpa", "status", "attempt", "type", "examdate", "resultprocessdate"
];

const buildFilter = (source = {}) => {
  const filter = { colid: number(source.colid) };
  markFields.forEach((field) => {
    if (["credit", "theorymarks", "theoryobtained", "theorypercentage", "practicalmarks", "practicaltotal", "practicalpercentage", "overallgradepoint", "overallpercentage", "gpa", "attempt"].includes(field)) return;
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
    theorygrade: text(body.theorygrade),
    practicalmarks,
    practicaltotal,
    practicalpercentage: body.practicalpercentage === "" || body.practicalpercentage === undefined ? percent(practicalmarks, practicaltotal) : number(body.practicalpercentage),
    practicalgrade: text(body.practicalgrade),
    overallgradepoint,
    overallgrade: text(body.overallgrade),
    overallpercentage: body.overallpercentage === "" || body.overallpercentage === undefined ? percent(totalObtained, totalMarks) : number(body.overallpercentage),
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
    const filter = { colid, modelname: "examinationmodel2marksheet" };
    if (hash) filter.hash = hash;
    if (!hash && regno) filter["metadata.regno"] = regno;
    const records = await BlockchainLedger.find(filter).sort({ timestamp: -1 }).lean();
    res.json({ success: true, verified: records.length > 0, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
