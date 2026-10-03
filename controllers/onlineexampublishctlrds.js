const mongoose = require("mongoose");
const OnlineExam = require("../Models/onlineexamds");
const OnlineExamAttempt = require("../Models/onlineexamattemptds");
const OnlineExamPublish = require("../Models/onlineexampublishds");
const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = (items = []) => [...new Set(items.map(text).filter(Boolean))].sort();
const yes = (value) => /^yes|true|1|active$/i.test(text(value || "Yes"));

const safeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const publishPayload = (body = {}, exam = {}) => ({
  colid: num(body.colid),
  academicyear: text(body.academicyear || exam.academicyear),
  examid: body.examid || exam._id,
  examname: text(exam.examname || body.examname),
  examcode: text(exam.examcode || body.examcode),
  program: text(exam.program || body.program),
  programcode: text(exam.programcode || body.programcode),
  semester: text(exam.semester || body.semester),
  course: text(exam.course || body.course),
  coursecode: text(exam.coursecode || body.coursecode),
  startdate: safeDate(body.startdate),
  enddate: safeDate(body.enddate),
  active: text(body.active || "Yes") || "Yes",
  remarks: text(body.remarks),
  user: text(body.user),
  username: text(body.username)
});

const dynamicQuery = (source = {}) => {
  const query = { colid: num(source.colid) };
  ["academicyear", "examname", "examcode", "program", "programcode", "semester", "course", "coursecode", "active"].forEach((field) => {
    if (text(source[field])) query[field] = { $regex: esc(source[field]), $options: "i" };
  });
  (Array.isArray(source.dynamicFilters) ? source.dynamicFilters : []).forEach((filter) => {
    const field = text(filter.field);
    const value = text(filter.value);
    if (!field || !value || field.includes("$")) return;
    query[field] = /^equals$/i.test(text(filter.operator)) ? value : { $regex: esc(value), $options: "i" };
  });
  return query;
};

const studentLookup = async ({ colid, regno, email, user }) => {
  const clauses = [];
  if (text(regno)) clauses.push({ regno: text(regno) });
  if (text(email)) clauses.push({ email: { $regex: `^${esc(email)}$`, $options: "i" } });
  if (text(user)) clauses.push({ email: { $regex: `^${esc(user)}$`, $options: "i" } });
  if (!clauses.length) return null;
  return User.findOne({ colid, role: /^Student$/i, $or: clauses }).lean();
};

const validPublish = (publish) => {
  if (!publish || !yes(publish.active)) return false;
  const now = Date.now();
  const start = publish.startdate ? new Date(publish.startdate).getTime() : 0;
  const end = publish.enddate ? new Date(publish.enddate).getTime() : 0;
  return (!start || now >= start) && (!end || now <= end);
};

const sectionSummary = (answers = []) => {
  const map = {};
  answers.forEach((answer) => {
    const key = text(answer.sectionname || answer.sectionid || "Section");
    map[key] = map[key] || { sectionname: key, score: 0, total: 0, questions: 0 };
    map[key].score += num(answer.marksobtained);
    map[key].total += num(answer.maxmarks);
    map[key].questions += 1;
  });
  return Object.values(map).map((row) => ({
    ...row,
    score: Number(row.score.toFixed(2)),
    total: Number(row.total.toFixed(2)),
    percentage: row.total ? Number(((row.score / row.total) * 100).toFixed(2)) : 0
  }));
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [examYears, publishYears, values] = await Promise.all([
      OnlineExam.distinct("academicyear", { colid, examcontext: /^Student$/i }),
      OnlineExamPublish.distinct("academicyear", { colid }),
      Promise.all(["examname", "examcode", "program", "programcode", "semester", "course", "coursecode", "active"].map((field) => OnlineExamPublish.distinct(field, { colid })))
    ]);
    const fields = ["examname", "examcode", "program", "programcode", "semester", "course", "coursecode", "active"];
    const filterValues = {};
    fields.forEach((field, index) => { filterValues[field] = uniq(values[index]); });
    res.json({ success: true, academicyears: uniq([...examYears, ...publishYears]), filterValues });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.examOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid, examcontext: /^Student$/i };
    if (text(req.query.academicyear)) query.academicyear = text(req.query.academicyear);
    if (text(req.query.search)) {
      const rx = { $regex: esc(req.query.search), $options: "i" };
      query.$or = [{ examname: rx }, { examcode: rx }, { course: rx }, { coursecode: rx }, { program: rx }, { programcode: rx }];
    }
    const exams = await OnlineExam.find(query).select("academicyear examname examcode program programcode semester course coursecode status").sort({ academicyear: -1, examname: 1 }).limit(1500).lean();
    res.json({ success: true, data: exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = dynamicQuery({ ...req.query, dynamicFilters: req.body?.dynamicFilters || [] });
    const rows = await OnlineExamPublish.find(query).sort({ updatedAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.search = async (req, res) => {
  try {
    const rows = await OnlineExamPublish.find(dynamicQuery(req.body)).sort({ updatedAt: -1 }).limit(3000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const examids = Array.isArray(req.body.examids) ? req.body.examids.map(text).filter(Boolean) : [text(req.body.examid)].filter(Boolean);
    if (!colid || !text(req.body.academicyear) || !examids.length) {
      return res.status(400).json({ success: false, message: "Academic year and at least one exam are required" });
    }
    const saved = [];
    for (const examid of examids) {
      if (!mongoose.Types.ObjectId.isValid(examid)) continue;
      const exam = await OnlineExam.findOne({ _id: examid, colid }).lean();
      if (!exam) continue;
      const payload = publishPayload({ ...req.body, examid }, exam);
      const row = req.body.id && examids.length === 1
        ? await OnlineExamPublish.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, upsert: false })
        : await OnlineExamPublish.findOneAndUpdate(
          { colid, academicyear: payload.academicyear, examid: payload.examid },
          payload,
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      if (row) saved.push(row);
    }
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    const errors = [];
    for (const [index, row] of rows.entries()) {
      try {
        const criteria = { colid, examcontext: /^Student$/i };
        if (mongoose.Types.ObjectId.isValid(text(row.examid))) criteria._id = text(row.examid);
        else {
          criteria.academicyear = text(row.academicyear);
          if (text(row.examcode)) criteria.examcode = text(row.examcode);
          if (text(row.examname)) criteria.examname = { $regex: `^${esc(row.examname)}$`, $options: "i" };
        }
        const exam = await OnlineExam.findOne(criteria).lean();
        if (!exam) throw new Error("Matching online exam not found");
        const payload = publishPayload({ ...row, colid, examid: exam._id }, exam);
        await OnlineExamPublish.findOneAndUpdate(
          { colid, academicyear: payload.academicyear, examid: payload.examid },
          payload,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        saved += 1;
      } catch (error) {
        errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRows = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one row" });
    const result = await OnlineExamPublish.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deletedCount: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const student = await studentLookup({ colid, regno: req.query.regno, email: req.query.email, user: req.query.user });
    const regno = text(student?.regno || req.query.regno);
    const attempts = regno
      ? await OnlineExamAttempt.find({ colid, examcontext: /^Student$/i, regno }).select("academicyear examid examname examcode course coursecode status submittime marksobtained totalmarks").sort({ updatedAt: -1 }).lean()
      : [];
    const examIds = attempts.map((attempt) => attempt.examid).filter(Boolean);
    const exams = examIds.length ? await OnlineExam.find({ colid, _id: { $in: examIds } }).select("academicyear examname examcode course coursecode program programcode semester").lean() : [];
    const examById = Object.fromEntries(exams.map((exam) => [String(exam._id), exam]));
    res.json({
      success: true,
      student,
      academicyears: uniq(attempts.map((attempt) => attempt.academicyear)),
      exams: attempts.map((attempt) => ({ ...attempt, exam: examById[String(attempt.examid)] || null }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentMarks = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const student = await studentLookup({ colid, regno: req.query.regno, email: req.query.email, user: req.query.user });
    const regno = text(student?.regno || req.query.regno);
    const examid = text(req.query.examid);
    if (!regno || !mongoose.Types.ObjectId.isValid(examid)) {
      return res.status(400).json({ success: false, message: "Student and exam are required" });
    }
    const publish = await OnlineExamPublish.findOne({ colid, examid, academicyear: text(req.query.academicyear) }).lean();
    if (!validPublish(publish)) {
      return res.json({ success: true, published: false, message: "Exam result is not published" });
    }
    const attempt = await OnlineExamAttempt.findOne({ colid, examid, regno }).lean();
    if (!attempt) return res.status(404).json({ success: false, message: "No submitted exam response found" });
    const answers = (attempt.answers || []).map((answer, index) => ({
      id: String(answer._id || index + 1),
      sectionname: answer.sectionname,
      questiontext: answer.questiontext,
      questionhtml: answer.questionhtml,
      questiontype: answer.questiontype,
      selectedoptiontext: answer.selectedoptiontext,
      answertext: answer.answertext,
      marksobtained: num(answer.marksobtained),
      maxmarks: num(answer.maxmarks),
      grade: answer.grade,
      comments: answer.comments,
      aicomments: answer.aicomments,
      gradingstatus: answer.gradingstatus
    }));
    res.json({
      success: true,
      published: true,
      student,
      publish,
      summary: {
        examname: attempt.examname,
        examcode: attempt.examcode,
        academicyear: attempt.academicyear,
        course: attempt.course,
        coursecode: attempt.coursecode,
        totalScore: Number(num(attempt.marksobtained).toFixed(2)),
        totalMarks: Number(num(attempt.totalmarks).toFixed(2)),
        percentage: num(attempt.totalmarks) ? Number(((num(attempt.marksobtained) / num(attempt.totalmarks)) * 100).toFixed(2)) : 0,
        status: attempt.status,
        comments: attempt.comments,
        submittedAt: attempt.submittime
      },
      sectionwise: sectionSummary(attempt.answers),
      questionwise: answers
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
