const express = require("express");
const { Question, Mark } = require("../Models/internalquestionwiseds");
const Course = require("../Models/regulationcoursemapds");
const CO = require("../Models/courseoutcomeds");
const Exam = require("../Models/conductexamds");
const User = require("../Models/user");
const Assessment = require("../Models/assessmentcomponentds");
const ComponentMarks = require("../Models/exammodel2componentmarksds");
const existing = require("./conductexamcomponentallocationctlrds");
const router = express.Router();
const text = value => String(value ?? "").trim();
let questionIndexReady;
function ensureQuestionIndex() {
  if (!questionIndexReady) questionIndexReady = (async () => {
    await Question.collection.createIndex({ colid: 1, academicyear: 1, examcode: 1, regulation: 1, programcode: 1, semester: 1, coursecode: 1, assessmentid: 1, questionno: 1 }, { unique: true });
    const legacy = "colid_1_academicyear_1_examcode_1_regulation_1_programcode_1_semester_1_coursecode_1_questionno_1";
    try { await Question.collection.dropIndex(legacy); } catch (error) { if (![26, 27].includes(error.code)) throw error; }
  })().catch(error => { questionIndexReady = null; throw error; });
  return questionIndexReady;
}
const fields = ["academicyear", "examcode", "regulation", "programcode", "semester", "coursecode"];
const fail = message => { const error = new Error(message); error.status = 400; throw error; };
const query = (source, colid, required = true) => {
  const scope = { colid };
  for (const field of fields) { if (text(source[field])) scope[field] = text(source[field]); else if (required) fail(`Select ${field}`); }
  return scope;
};
const wrap = handler => async (req, res) => { try { const colid = Number(req.body.colid || req.query.colid); if (!(colid > 0)) fail("Institution is required"); await handler(req, res, colid); } catch (error) { res.status(error.status || 500).json({ message: error.message }); } };
async function requireEntryDates(source, colid) {
  let status = 200, result;
  await existing.checkInternalMarksEntryDate({ query: { ...query(source, colid) } }, { status(value) { status = value; return this; }, json(value) { result = value; } });
  if (status !== 200 || !result?.allowed) fail(result?.message || "Internal marks entry dates are not activated. Please inform admin.");
  return result;
}
const courseContext = async (source, colid) => {
  const scope = query(source, colid), { examcode, ...courseScope } = scope;
  const [course, exam] = await Promise.all([Course.findOne(courseScope).lean(), Exam.findOne({ colid, academicyear: scope.academicyear, examcode }).lean()]);
  if (!course || !exam) fail("Select a valid course and exam from their masters");
  return { ...scope, program: course.program, course: course.course, exam: exam.examname };
};
const assessmentContext = async (source, colid) => {
  const context = await courseContext(source, colid), { examcode, ...courseScope } = query(context, colid);
  if (!text(source.assessmentid)) fail("Select an assessment component for this course");
  const assessment = await Assessment.findOne({ ...courseScope, _id: text(source.assessmentid), scoretype: "Internal" }).lean();
  if (!assessment) fail("Assessment component does not match this course");
  return { ...context, assessmentid: String(assessment._id), assessmentcomponent: assessment.assessmentcomponent, componenttype: assessment.componenttype, scoretype: assessment.scoretype, assessmentgroup: assessment.assessmentgroup || "" };
};
router.get("/options", wrap(async (req, res, colid) => {
  const scope = query(req.query, colid, false); delete scope.examcode;
  if (!scope.academicyear) return res.json({ exams: await Exam.find({ colid }).select("academicyear examname examcode regulation").lean(), courses: [], cos: [] });
  const courses = await Course.find(scope).select("academicyear regulation program programcode semester course coursecode").lean();
  const cos = scope.coursecode ? await CO.find(scope).select("conumber co coursecode").lean() : [];
  const assessments = scope.coursecode ? await Assessment.find({ ...scope, scoretype: "Internal" }).lean() : [];
  res.json({ courses, cos, assessments });
}));
router.get("/questions", wrap(async (req, res, colid) => {
  if (!text(req.query.assessmentid)) fail("Select an assessment component");
  res.json({ data: await Question.find({ ...query(req.query, colid, false), $or: [{ assessmentid: text(req.query.assessmentid) }, { assessmentid: { $exists: false } }, { assessmentid: "" }] }).sort({ questionno: 1 }).lean() });
}));
router.post("/questions/link-component", wrap(async (req, res, colid) => {
  const context = await assessmentContext(req.body, colid), scope = query(context, colid);
  const ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length) fail("Select legacy questions to link");
  const legacy = await Question.find({ ...scope, _id: { $in: ids }, $or: [{ assessmentid: { $exists: false } }, { assessmentid: "" }] }).lean();
  if (legacy.length !== ids.length) fail("Select only unlinked questions from this course");
  for (const row of legacy) if (await Question.exists({ ...scope, assessmentid: context.assessmentid, questionno: row.questionno })) fail(`Question ${row.questionno} already exists for this assessment component`);
  await ensureQuestionIndex();
  const snapshot = Object.fromEntries(["assessmentid", "assessmentcomponent", "componenttype", "scoretype", "assessmentgroup"].map(field => [field, context[field]]));
  await Question.updateMany({ ...scope, _id: { $in: ids } }, { $set: snapshot });
  await Mark.updateMany({ colid, questionid: { $in: ids } }, { $set: snapshot });
  res.json({ linked: ids.length });
}));
const saveQuestion = async (body, colid) => {
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (!targets.length || targets.length > 200) fail("Select between 1 and 200 courses");
  if (!text(body.questionno) || !text(body.question) || !["MCQ", "Descriptive", "Practical"].includes(body.questiontype) || body.fullmarks === "" || !Number.isFinite(Number(body.fullmarks)) || Number(body.fullmarks) < 0) fail("Enter question number, question, type and valid full marks");
  const validated = [];
  for (const target of targets) {
    const context = await assessmentContext({ ...body, ...target }, colid);
    const co = await CO.findOne({ _id: target.coid, colid, academicyear: context.academicyear, regulation: context.regulation, programcode: context.programcode, semester: context.semester, coursecode: context.coursecode }).lean();
    if (!co) fail(`Select a CO for ${context.coursecode}`);
    validated.push({ ...context, questionno: text(body.questionno), question: text(body.question), questiontype: body.questiontype, fullmarks: Number(body.fullmarks), coid: String(co._id), conumber: co.conumber, co: co.co, user: text(body.user) });
  }
  for (const value of validated) {
    const scope = { ...query(value, colid), assessmentid: value.assessmentid, questionno: value.questionno };
    const old = await Question.findOne(scope).lean();
    if (old && await Mark.exists({ colid, questionid: String(old._id) })) fail(`Question ${value.questionno} already has marks; it cannot be edited`);
  }
  await ensureQuestionIndex();
  for (const value of validated) await Question.findOneAndUpdate({ ...query(value, colid), assessmentid: value.assessmentid, questionno: value.questionno }, { $set: value }, { upsert: true, runValidators: true });
  return validated.length;
};
router.post("/questions/save", wrap(async (req, res, colid) => res.json({ saved: await saveQuestion(req.body, colid) })));
router.post("/questions/bulk", wrap(async (req, res, colid) => {
  if (!Array.isArray(req.body.rows) || req.body.rows.length > 1000) fail("Upload up to 1000 rows");
  let saved = 0; const errors = [];
  for (const [index, row] of req.body.rows.entries()) { try { saved += await saveQuestion({ ...row, user: req.body.user, targets: [row] }, colid); } catch (error) { errors.push(`Row ${index + 1}: ${error.message}`); } }
  res.json({ saved, errors });
}));
router.post("/questions/delete", wrap(async (req, res, colid) => {
  const ids = req.body.ids; if (!Array.isArray(ids) || !ids.length) fail("Select questions");
  if (await Mark.exists({ colid, questionid: { $in: ids } })) fail("Questions with marks cannot be deleted");
  res.json(await Question.deleteMany({ colid, _id: { $in: ids } }));
}));
async function loadGrid(source, colid) {
  const context = await assessmentContext(source, colid), scope = query(context, colid);
  const { examcode, coursecode, ...studentScope } = scope;
  const [questions, students, marks, assessments] = await Promise.all([
    Question.find({ ...scope, assessmentid: context.assessmentid }).sort({ questionno: 1 }).lean(), User.find({ ...studentScope, role: /^Student$/i }).select("name regno email").sort({ name: 1 }).lean(), Mark.find({ ...scope, assessmentid: context.assessmentid }).lean(), Assessment.find({ ...studentScope, coursecode, _id: context.assessmentid, scoretype: "Internal" }).lean()
  ]);
  return { context, questions, students, marks, assessments };
}
router.get("/grid", wrap(async (req, res, colid) => {
  const entryWindow = req.query.mode === "entry" ? await requireEntryDates(req.query, colid) : null;
  res.json({ ...await loadGrid(req.query, colid), entryWindow });
}));
router.post("/marks/save", wrap(async (req, res, colid) => {
  await requireEntryDates(req.body, colid);
  const grid = await loadGrid(req.body, colid), students = new Map(grid.students.map(row => [row.regno, row])), questions = new Map(grid.questions.map(row => [String(row._id), row]));
  const cells = req.body.cells; if (!Array.isArray(cells) || cells.length > 50000) fail("Provide up to 50000 mark cells");
  const operations = cells.map(cell => {
    const student = students.get(cell.regno), question = questions.get(cell.questionid);
    if (!student || !question) fail("Student or question is outside the selected course");
    const scope = { colid, regno: student.regno, questionid: String(question._id) };
    if (cell.marks === "" || cell.marks == null) return { deleteOne: { filter: scope } };
    const marks = Number(cell.marks); if (!Number.isFinite(marks) || marks < 0 || marks > question.fullmarks) fail(`Marks must be between 0 and ${question.fullmarks} for Q${question.questionno}`);
    return { updateOne: { filter: scope, update: { $set: { ...grid.context, ...scope, questionno: question.questionno, question: question.question, questiontype: question.questiontype, fullmarks: question.fullmarks, coid: question.coid, conumber: question.conumber, co: question.co, student: student.name, email: student.email, marks, user: text(req.body.user) } }, upsert: true } };
  });
  if (operations.length) await Mark.bulkWrite(operations);
  res.json({ saved: operations.length });
}));
router.post("/aggregate", wrap(async (req, res, colid) => {
  const grid = await loadGrid(req.body, colid), assessment = grid.assessments.find(row => String(row._id) === req.body.assessmentid);
  if (!assessment) fail("Select an internal assessment component for this course");
  if (!Array.isArray(req.body.regnos) || !req.body.regnos.length || !grid.questions.length) fail("Select students and ensure questions exist");
  const total = grid.questions.reduce((sum, question) => sum + question.fullmarks, 0);
  if (Math.abs(total - Number(assessment.marks)) > 0.001) fail(`Question full marks total (${total}) must equal assessment marks (${assessment.marks})`);
  const rows = [];
  for (const regno of [...new Set(req.body.regnos)]) {
    const student = grid.students.find(row => row.regno === regno); if (!student) fail("Invalid student selection");
    const marks = grid.questions.map(question => grid.marks.find(row => row.regno === regno && row.questionid === String(question._id)));
    if (marks.some(row => !row)) fail(`Enter all question marks for ${regno} before aggregation`);
    const previous = await ComponentMarks.findOne({ ...query(grid.context, colid), regno, componenttype: assessment.componenttype, assessmentgroup: assessment.assessmentgroup || "", assessmentcomponent: assessment.assessmentcomponent }).lean();
    if (previous && (["Pending", "Approved"].includes(previous.approvalstatus) || previous.submissionstatus === "Submitted")) fail(`Marks for ${regno} are submitted/approved and cannot be overwritten`);
    rows.push({ student: student.name, regno, rawmarks: Number(marks.reduce((sum, row) => sum + row.marks, 0).toFixed(2)), attendance: "Present" });
  }
  return existing.saveInternalMarks({ body: { colid, exam: grid.context.exam, examcode: grid.context.examcode, assessmentid: req.body.assessmentid, rows, user: req.body.user, username: req.body.username } }, res);
}));
module.exports = router;
