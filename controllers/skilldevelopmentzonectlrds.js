const {
  SkillZoneExam,
  SkillZoneAttempt,
  SkillZoneAccess,
  SkillZoneProject,
  SkillZoneProjectSubmission,
  SkillZoneCertificate,
  SkillZoneCoupon,
  SkillZoneCertificationProjectLink,
  SkillZoneClass,
  SkillZoneClassRegistration
} = require("../Models/skilldevelopmentzoneds");
const CashfreePaymentLog = require("../Models/cashfreepaymentlogds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const { normalizeProjectSteps } = require("../utils/skillZoneProjectContent");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (value) => ({ $regex: esc(value), $options: "i" });
const zoneOf = (value) => /^cert/i.test(text(value)) ? "Certification" : "Practice";
const emailOf = (body = {}) => text(body.email || body.user || body.studentemail);
const isPaidStatus = (value) => /^(paid|success|successful)$/i.test(text(value));
const stripCodeFence = (value) => text(value).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

const commonFilter = (source = {}, allowed = []) => {
  const query = {};
  allowed.forEach((field) => {
    if (text(source[field])) query[field] = rx(source[field]);
  });
  return query;
};

const categoryFilter = (source = {}) => {
  const raw = source.categories || source.category;
  const values = Array.isArray(raw) ? raw : text(raw).split(",");
  const cleaned = values.map(text).filter(Boolean);
  if (!cleaned.length) return {};
  return { category: { $in: cleaned.map((value) => new RegExp(esc(value), "i")) } };
};

const dateRangeFilter = (source = {}, field = "classdate") => {
  const query = {};
  if (text(source.fromdate)) query.$gte = new Date(source.fromdate);
  if (text(source.todate)) {
    const end = new Date(source.todate);
    end.setHours(23, 59, 59, 999);
    query.$lte = end;
  }
  return Object.keys(query).length ? { [field]: query } : {};
};

const getGemini = async (colid) => AiConfiguration.findOne({ colid: num(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({ colid: num(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();

const callGemini = async (colid, model, prompt) => {
  const config = await getGemini(colid);
  if (!config?.apikey) throw new Error("Active Gemini configuration is missing");
  const models = [...new Set([text(model), "gemini-2.5-flash", "gemini-2.0-flash"].filter(Boolean))];
  let last = "";
  for (const geminiModel of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return text(data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n"));
    last = data.error?.message || `Gemini request failed for ${geminiModel}`;
  }
  throw new Error(last || "Gemini request failed");
};

const callOllama = async (colid, id, prompt) => {
  const config = id
    ? await OllamaConfiguration.findOne({ _id: id, colid: num(colid), active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid: num(colid), active: /^yes$/i, default: /^yes$/i }).lean()
      || await OllamaConfiguration.findOne({ colid: num(colid), active: /^yes$/i }).lean();
  if (!config) throw new Error("Active Ollama configuration is missing");
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return text(data.response);
};

const parseJson = (raw, fallback) => {
  try {
    return JSON.parse(stripCodeFence(raw));
  } catch {
    return fallback;
  }
};

const normalizeQuestion = (question = {}, index = 0) => ({
  questiontext: text(question.questiontext || question.question || question.title),
  questionhtml: text(question.questionhtml),
  questiontype: text(question.questiontype || question.type) || "MCQ",
  marks: num(question.marks) || 1,
  options: Array.isArray(question.options) ? question.options.map((option, optionIndex) => ({
    optiontext: text(option.optiontext || option.text || option.label || option),
    iscorrect: Boolean(option.iscorrect || option.correct || String(question.correctoption || question.answer || "").trim() === String(optionIndex + 1))
  })) : [],
  answerkey: text(question.answerkey || question.answer || question.correctanswer),
  explanation: text(question.explanation || question.comments),
  modules: Array.isArray(question.modules) ? question.modules.map(text).filter(Boolean) : [],
  topics: Array.isArray(question.topics) ? question.topics.map(text).filter(Boolean) : [],
  cos: Array.isArray(question.cos || question.cos) ? (question.cos || question.cos).map(text).filter(Boolean) : [],
  bloomlevels: Array.isArray(question.bloomlevels) ? question.bloomlevels.map(text).filter(Boolean) : [],
  tabledata: Array.isArray(question.tabledata) ? question.tabledata : [],
  order: num(question.order) || index + 1
});

const gradeAnswers = (exam, submittedAnswers = []) => {
  const answerMap = new Map((submittedAnswers || []).map((answer) => [String(answer.questionid), answer]));
  const answers = [];
  let totalmarks = 0;
  let marksobtained = 0;
  (exam.sections || []).forEach((section) => {
    (section.questions || []).forEach((question) => {
      const submitted = answerMap.get(String(question._id)) || {};
      const maxmarks = num(question.marks) || 0;
      totalmarks += maxmarks;
      const correct = (question.options || []).find((option) => option.iscorrect);
      const selectedOption = (question.options || []).find((option) => String(option._id) === String(submitted.selectedoptionid));
      const selectedText = text(submitted.selectedoptiontext || selectedOption?.optiontext);
      let iscorrect = false;
      let mark = 0;
      if (/mcq|fill/i.test(text(question.questiontype))) {
        iscorrect = correct
          ? String(correct._id) === String(submitted.selectedoptionid) || text(correct.optiontext).toLowerCase() === selectedText.toLowerCase()
          : text(question.answerkey).toLowerCase() === selectedText.toLowerCase();
        mark = iscorrect ? maxmarks : 0;
      } else {
        mark = num(submitted.marksobtained);
      }
      marksobtained += mark;
      answers.push({
        sectionid: String(section._id),
        sectionname: section.sectionname,
        questionid: String(question._id),
        questiontext: question.questiontext,
        questionhtml: question.questionhtml,
        questiontype: question.questiontype,
        selectedoptionid: text(submitted.selectedoptionid),
        selectedoptiontext: selectedText,
        answertext: text(submitted.answertext),
        correctanswer: text(correct?.optiontext || question.answerkey),
        iscorrect,
        maxmarks,
        marksobtained: mark,
        comments: iscorrect ? "Correct" : "Review answer"
      });
    });
  });
  const percentage = totalmarks ? Number(((marksobtained / totalmarks) * 100).toFixed(2)) : 0;
  return { answers, totalmarks, marksobtained, percentage, passstatus: percentage >= num(exam.passpercentage || 40) ? "Pass" : "Fail" };
};

const oneMonthFromNow = () => {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
};

const validCouponQuery = (couponcode) => {
  const now = new Date();
  return {
    couponcode: new RegExp(`^${esc(couponcode)}$`, "i"),
    status: /^Active$/i,
    $and: [
      { $or: [{ fromdate: null }, { fromdate: { $exists: false } }, { fromdate: { $lte: now } }] },
      { $or: [{ todate: null }, { todate: { $exists: false } }, { todate: { $gte: now } }] }
    ]
  };
};
const KHARABILLU_COUPON = "kharabillu";
const isKharabillu = (couponcode) => text(couponcode).toLowerCase() === KHARABILLU_COUPON;

exports.options = async (req, res) => {
  try {
    const [examCategories, projectCategories, classCategories, ollama] = await Promise.all([
      SkillZoneExam.distinct("category", {}),
      SkillZoneProject.distinct("category", {}),
      SkillZoneClass.distinct("category", {}),
      OllamaConfiguration.find({ colid: num(req.query.colid || req.body.colid), active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
    ]);
    res.json({
      success: true,
      examCategories: examCategories.filter(Boolean).sort(),
      projectCategories: projectCategories.filter(Boolean).sort(),
      classCategories: classCategories.filter(Boolean).sort(),
      geminiModels: ["gemini-3.5-pro", "gemini-3.0-pro", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
      ollama
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listExams = async (req, res) => {
  try {
    const query = { zone: zoneOf(req.query.zone || req.body.zone), ...commonFilter(req.query, ["examname", "examcode", "status"]), ...categoryFilter(req.query) };
    if (text(req.query.id || req.body.id)) query._id = text(req.query.id || req.body.id);
    const rows = await SkillZoneExam.find(query).sort({ createdAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveExam = async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      zone: zoneOf(body.zone),
      category: text(body.category),
      examname: text(body.examname),
      examcode: text(body.examcode) || `SK-${Date.now()}`,
      durationminutes: num(body.durationminutes) || 60,
      instructions: text(body.instructions),
      passpercentage: num(body.passpercentage) || 80,
      status: text(body.status) || "Published",
      sections: Array.isArray(body.sections) ? body.sections : [],
      user: text(body.user),
      username: text(body.username || body.name),
      colid: num(body.colid)
    };
    if (!payload.category || !payload.examname) return res.status(400).json({ success: false, message: "Category and exam name are required" });
    const data = body.id
      ? await SkillZoneExam.findByIdAndUpdate(body.id, payload, { new: true, runValidators: true })
      : await SkillZoneExam.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    await SkillZoneExam.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateQuestions = async (req, res) => {
  try {
    const count = Math.max(1, num(req.body.count) || 5);
    const prompt = `Generate ${count} questions for the Skill development ${zoneOf(req.body.zone)} zone.
Category: ${text(req.body.category)}
Question type: ${text(req.body.questiontype) || "MCQ"}
Difficulty: ${text(req.body.difficulty) || "Medium"}
Additional prompt: ${text(req.body.prompt)}
Return only JSON array. Each item must have questiontext, questiontype, marks, options [{optiontext, iscorrect}], answerkey, explanation.`;
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama(req.body.colid, req.body.ollamaConfigId, prompt)
      : await callGemini(req.body.colid, req.body.geminiModel || "gemini-2.5-flash", prompt);
    const parsed = parseJson(raw, []);
    const questions = (Array.isArray(parsed) ? parsed : parsed.questions || []).map(normalizeQuestion);
    res.json({ success: true, data: questions, raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitAttempt = async (req, res) => {
  try {
    const existing = req.body.attemptid ? await SkillZoneAttempt.findById(req.body.attemptid).lean() : null;
    const examid = req.body.examid || existing?.examid;
    const exam = await SkillZoneExam.findById(examid).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const graded = gradeAnswers(exam, req.body.answers || []);
    const payload = {
      zone: exam.zone,
      examid: exam._id,
      category: exam.category,
      examname: exam.examname,
      examcode: exam.examcode,
      student: text(req.body.student || req.body.name),
      email: emailOf(req.body),
      regno: text(req.body.regno),
      starttime: req.body.starttime ? new Date(req.body.starttime) : new Date(),
      submittime: new Date(),
      status: "Submitted",
      autosubmitted: req.body.autosubmitted ? "Yes" : "No",
      submitreason: text(req.body.submitreason || "Submitted"),
      remainingseconds: num(req.body.remainingseconds),
      deviceid: text(req.body.deviceid),
      ...graded,
      colid: num(req.body.colid)
    };
    const attempt = existing
      ? await SkillZoneAttempt.findByIdAndUpdate(existing._id, payload, { new: true })
      : await SkillZoneAttempt.create(payload);
    res.json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startAttempt = async (req, res) => {
  try {
    const exam = await SkillZoneExam.findById(req.body.examid).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const answers = [];
    (exam.sections || []).forEach((section) => {
      (section.questions || []).forEach((question) => {
        answers.push({
          sectionid: String(section._id),
          sectionname: section.sectionname,
          questionid: String(question._id),
          questiontext: question.questiontext,
          questionhtml: question.questionhtml,
          questiontype: question.questiontype,
          maxmarks: num(question.marks)
        });
      });
    });
    const attempt = await SkillZoneAttempt.create({
      zone: exam.zone,
      examid: exam._id,
      category: exam.category,
      examname: exam.examname,
      examcode: exam.examcode,
      student: text(req.body.student || req.body.name),
      email: emailOf(req.body),
      regno: text(req.body.regno),
      starttime: new Date(),
      status: "Started",
      remainingseconds: Math.max(1, num(exam.durationminutes) || 60) * 60,
      deviceid: text(req.body.deviceid),
      answers,
      colid: num(req.body.colid)
    });
    res.json({ success: true, exam, attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAttempt = async (req, res) => {
  try {
    const attempt = await SkillZoneAttempt.findById(req.body.attemptid);
    if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found" });
    if (attempt.submittime) return res.json({ success: true, data: attempt });
    attempt.answers = (attempt.answers || []).map((answer) => {
      const next = (req.body.answers || []).find((item) => String(item.questionid) === String(answer.questionid));
      return next ? { ...answer.toObject(), ...next } : answer;
    });
    attempt.remainingseconds = num(req.body.remainingseconds);
    attempt.deviceid = text(req.body.deviceid || attempt.deviceid);
    attempt.colid = num(req.body.colid || attempt.colid);
    await attempt.save();
    res.json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAttempts = async (req, res) => {
  try {
    const query = { ...commonFilter(req.query, ["zone", "category", "examname", "examcode", "email", "regno", "passstatus"]) };
    if (req.query.examid) query.examid = req.query.examid;
    const rows = await SkillZoneAttempt.find(query).sort({ createdAt: -1 }).limit(3000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.accessStatus = async (req, res) => {
  try {
    const email = emailOf(req.query);
    if (!email) return res.json({ success: true, active: false });
    const access = await SkillZoneAccess.findOne({ email: rx(email), paymentstatus: /^Paid$/i, accesstill: { $gte: new Date() } }).sort({ accesstill: -1 }).lean();
    res.json({ success: true, active: Boolean(access), data: access });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAccessPurchases = async (req, res) => {
  try {
    const query = commonFilter(req.query, ["student", "orderid", "paymentstatus"]);
    const identity = [];
    if (text(req.query.email)) identity.push({ email: rx(req.query.email) });
    if (text(req.query.regno)) identity.push({ regno: rx(req.query.regno) });
    if (identity.length) query.$or = identity;
    const rows = await SkillZoneAccess.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.validateCoupon = async (req, res) => {
  try {
    const couponcode = text(req.query.couponcode || req.body.couponcode);
    const amount = num(req.query.amount || req.body.amount) || 600;
    if (!couponcode) return res.status(400).json({ success: false, message: "Coupon code is required" });
    if (isKharabillu(couponcode)) {
      const discountamount = Math.max(0, Number((amount - 1).toFixed(2)));
      return res.json({ success: true, data: { couponcode: "KHARABILLU", status: "Active" }, discountamount, payableamount: 1 });
    }
    const coupon = await SkillZoneCoupon.findOne(validCouponQuery(couponcode)).sort({ _id: -1 }).lean();
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon is invalid or expired" });
    const discountamount = Math.min(amount, Math.max(0, num(coupon.discountamount)));
    res.json({ success: true, data: coupon, discountamount, payableamount: Math.max(0, amount - discountamount) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.activateCouponAccess = async (req, res) => {
  try {
    const email = emailOf(req.body);
    const couponcode = text(req.body.couponcode);
    if (!email || !couponcode) return res.status(400).json({ success: false, message: "email and coupon code are required" });
    const coupon = await SkillZoneCoupon.findOne(validCouponQuery(couponcode)).sort({ _id: -1 }).lean();
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon is invalid or expired" });
    const originalamount = 600;
    const discountamount = Math.min(originalamount, Math.max(0, num(coupon.discountamount)));
    if (originalamount - discountamount > 0) return res.status(400).json({ success: false, message: "Coupon does not cover full amount. Please pay remaining amount." });
    const { start, end } = oneMonthFromNow();
    const orderid = `SKILL-COUPON-${Date.now()}`;
    const data = await SkillZoneAccess.create({
      email,
      regno: text(req.body.regno),
      student: text(req.body.student || req.body.name),
      originalamount,
      amount: 0,
      discountamount,
      couponcode,
      orderid,
      paymentstatus: "Paid",
      accessfrom: start,
      accesstill: end,
      colid: num(req.body.colid)
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.activatePaidAccess = async (req, res) => {
  try {
    const orderid = text(req.body.orderid || req.body.order_id);
    const email = emailOf(req.body);
    if (!orderid || !email) return res.status(400).json({ success: false, message: "orderid and email are required" });
    const log = await CashfreePaymentLog.findOne({ orderid }).sort({ updatedAt: -1 }).lean();
    if (!log || !isPaidStatus(log.paymentstatus || log.status)) return res.status(400).json({ success: false, message: "Payment is not marked paid yet" });
    const { start, end } = oneMonthFromNow();
    const data = await SkillZoneAccess.findOneAndUpdate(
      { email, orderid },
      {
        email,
        regno: text(req.body.regno || log.regno),
        student: text(req.body.student || req.body.name || log.customername),
        originalamount: num(req.body.originalamount) || 600,
        amount: num(log.paidamount || log.amount) || num(req.body.amount) || 600,
        discountamount: num(req.body.discountamount),
        couponcode: text(req.body.couponcode),
        orderid,
        paymentstatus: "Paid",
        accessfrom: start,
        accesstill: end,
        colid: num(req.body.colid || log.colid)
      },
      { new: true, upsert: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listProjects = async (req, res) => {
  try {
    const query = { ...commonFilter(req.query, ["projecttitle", "status"]), ...categoryFilter(req.query) };
    if (text(req.query.id)) query._id = text(req.query.id);
    const rows = await SkillZoneProject.find(query).sort({ createdAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listCoupons = async (req, res) => {
  try {
    const query = commonFilter(req.query, ["couponcode", "status"]);
    const rows = await SkillZoneCoupon.find(query).sort({ createdAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveCoupon = async (req, res) => {
  try {
    const payload = {
      couponcode: text(req.body.couponcode).toUpperCase(),
      discountamount: num(req.body.discountamount),
      fromdate: req.body.fromdate ? new Date(req.body.fromdate) : null,
      todate: req.body.todate ? new Date(req.body.todate) : null,
      status: text(req.body.status) || "Active",
      user: text(req.body.user),
      username: text(req.body.username || req.body.name),
      colid: num(req.body.colid)
    };
    if (!payload.couponcode) return res.status(400).json({ success: false, message: "Coupon code is required" });
    const data = req.body.id
      ? await SkillZoneCoupon.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await SkillZoneCoupon.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    await SkillZoneCoupon.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listCertificationLinks = async (req, res) => {
  try {
    const query = { ...commonFilter(req.query, ["status"]), ...categoryFilter(req.query) };
    if (text(req.query.examid)) query.examids = text(req.query.examid);
    if (text(req.query.projectid)) query.projectids = text(req.query.projectid);
    const rows = await SkillZoneCertificationProjectLink.find(query).sort({ createdAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveCertificationLink = async (req, res) => {
  try {
    const examids = Array.isArray(req.body.examids) ? req.body.examids.map(text).filter(Boolean) : [];
    const projectids = Array.isArray(req.body.projectids) ? req.body.projectids.map(text).filter(Boolean) : [];
    if (!examids.length || !projectids.length) return res.status(400).json({ success: false, message: "Select at least one certification exam and one project" });
    const [exams, projects] = await Promise.all([
      SkillZoneExam.find({ _id: { $in: examids }, zone: "Certification" }).lean(),
      SkillZoneProject.find({ _id: { $in: projectids } }).lean()
    ]);
    const payload = {
      category: text(req.body.category || exams[0]?.category || projects[0]?.category),
      examids,
      examnames: exams.map((item) => item.examname).filter(Boolean),
      projectids,
      projecttitles: projects.map((item) => item.projecttitle).filter(Boolean),
      status: text(req.body.status) || "Active",
      user: text(req.body.user),
      username: text(req.body.username || req.body.name),
      colid: num(req.body.colid)
    };
    const data = req.body.id
      ? await SkillZoneCertificationProjectLink.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await SkillZoneCertificationProjectLink.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCertificationLink = async (req, res) => {
  try {
    await SkillZoneCertificationProjectLink.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listClasses = async (req, res) => {
  try {
    const query = { ...commonFilter(req.query, ["topic", "status"]), ...categoryFilter(req.query), ...dateRangeFilter(req.query) };
    if (text(req.query.id)) query._id = text(req.query.id);
    const rows = await SkillZoneClass.find(query).sort({ classdate: 1, classtime: 1 }).limit(3000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveClass = async (req, res) => {
  try {
    const payload = {
      classdate: req.body.classdate ? new Date(req.body.classdate) : null,
      classtime: text(req.body.classtime),
      topic: text(req.body.topic),
      category: text(req.body.category),
      link: text(req.body.link),
      capacity: num(req.body.capacity),
      status: text(req.body.status) || "Active",
      user: text(req.body.user),
      username: text(req.body.username || req.body.name),
      colid: num(req.body.colid)
    };
    if (!payload.classdate || !payload.topic || !payload.category) return res.status(400).json({ success: false, message: "Class date, topic and category are required" });
    const data = req.body.id
      ? await SkillZoneClass.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await SkillZoneClass.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    await SkillZoneClass.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const promoteNextWaitlist = async (classid) => {
  const next = await SkillZoneClassRegistration.findOne({ classid, registrationstatus: "Waitlist", enabled: /^Yes$/i }).sort({ waitlistno: 1, createdAt: 1 });
  if (next) {
    next.registrationstatus = "Confirmed";
    next.waitlistno = 0;
    await next.save();
  }
};

exports.registerClass = async (req, res) => {
  try {
    const klass = await SkillZoneClass.findById(req.body.classid).lean();
    if (!klass || !/^active$/i.test(text(klass.status))) return res.status(404).json({ success: false, message: "Class is not available" });
    const email = emailOf(req.body);
    if (!email) return res.status(400).json({ success: false, message: "Student email is required" });
    const access = await SkillZoneAccess.findOne({ email: rx(email), paymentstatus: /^Paid$/i, accesstill: { $gte: new Date() } }).sort({ accesstill: -1 }).lean();
    if (!access) return res.status(402).json({ success: false, message: "Payment is required before class registration" });
    const existing = await SkillZoneClassRegistration.findOne({ classid: klass._id, email: rx(email), registrationstatus: { $in: ["Confirmed", "Waitlist"] } }).lean();
    if (existing) return res.json({ success: true, data: existing, message: `Already ${existing.registrationstatus}` });
    const confirmed = await SkillZoneClassRegistration.countDocuments({ classid: klass._id, registrationstatus: "Confirmed", enabled: /^Yes$/i });
    const waiting = await SkillZoneClassRegistration.countDocuments({ classid: klass._id, registrationstatus: "Waitlist", enabled: /^Yes$/i });
    let registrationstatus = "Confirmed";
    let waitlistno = 0;
    if (confirmed >= num(klass.capacity)) {
      if (waiting >= 25) return res.status(409).json({ success: false, message: "Regret, class is Full" });
      registrationstatus = "Waitlist";
      waitlistno = waiting + 1;
    }
    const data = await SkillZoneClassRegistration.create({
      classid: klass._id,
      classdate: klass.classdate,
      classtime: klass.classtime,
      topic: klass.topic,
      category: klass.category,
      student: text(req.body.student || req.body.name),
      email,
      regno: text(req.body.regno),
      registrationstatus,
      enabled: "Yes",
      waitlistno,
      registeredat: new Date(),
      colid: num(req.body.colid)
    });
    res.json({ success: true, data, message: registrationstatus === "Confirmed" ? "Registration confirmed" : `Added to waiting list ${waitlistno}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelClassRegistration = async (req, res) => {
  try {
    const query = req.body.id ? { _id: req.body.id } : { classid: req.body.classid, email: rx(emailOf(req.body)), registrationstatus: { $in: ["Confirmed", "Waitlist"] } };
    const row = await SkillZoneClassRegistration.findOne(query);
    if (!row) return res.status(404).json({ success: false, message: "Registration not found" });
    const wasConfirmed = row.registrationstatus === "Confirmed";
    row.registrationstatus = "Cancelled";
    row.cancelledat = new Date();
    await row.save();
    if (wasConfirmed) await promoteNextWaitlist(row.classid);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listClassRegistrations = async (req, res) => {
  try {
    const query = commonFilter(req.query, ["student", "email", "regno", "registrationstatus", "enabled", "category", "topic"]);
    if (text(req.query.classid)) query.classid = text(req.query.classid);
    const rows = await SkillZoneClassRegistration.find(query).sort({ classdate: 1, classtime: 1, waitlistno: 1, createdAt: 1 }).limit(5000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateClassRegistrationStatus = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [];
    const enabled = /^no$/i.test(text(req.body.enabled)) ? "No" : "Yes";
    const rows = await SkillZoneClassRegistration.find({ _id: { $in: ids } });
    for (const row of rows) {
      const wasConfirmed = row.registrationstatus === "Confirmed" && row.enabled !== "No";
      row.enabled = enabled;
      if (enabled === "No" && row.registrationstatus !== "Cancelled") row.registrationstatus = "Disabled";
      if (enabled === "Yes" && row.registrationstatus === "Disabled") row.registrationstatus = "Waitlist";
      await row.save();
      if (wasConfirmed && enabled === "No") await promoteNextWaitlist(row.classid);
    }
    res.json({ success: true, count: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveProject = async (req, res) => {
  try {
    const payload = {
      category: text(req.body.category),
      projecttitle: text(req.body.projecttitle),
      description: text(req.body.description),
      difficulty: text(req.body.difficulty),
      status: text(req.body.status) || "Published",
      steps: normalizeProjectSteps(req.body.steps),
      user: text(req.body.user),
      username: text(req.body.username || req.body.name),
      colid: num(req.body.colid)
    };
    if (!payload.category || !payload.projecttitle) return res.status(400).json({ success: false, message: "Category and project title are required" });
    const data = req.body.id
      ? await SkillZoneProject.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true })
      : await SkillZoneProject.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    await SkillZoneProject.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateProject = async (req, res) => {
  try {
    const prompt = `Create one skill-development project as JSON with category, projecttitle, description, difficulty, and steps array.
Each step must have steptitle, description, task, maxmarks and order.
steptitle, description and task must be strings, not arrays or objects. For multiple tasks, use one task string with separate paragraphs. maxmarks and order must be numbers.
Category: ${text(req.body.category)}
Topic/prompt: ${text(req.body.prompt)}
Difficulty: ${text(req.body.difficulty) || "Medium"}
Return only JSON object.`;
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama(req.body.colid, req.body.ollamaConfigId, prompt)
      : await callGemini(req.body.colid, req.body.geminiModel || "gemini-2.5-flash", prompt);
    const project = parseJson(raw, {});
    project.steps = normalizeProjectSteps(project.steps);
    res.json({ success: true, data: project, raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitProject = async (req, res) => {
  try {
    const project = await SkillZoneProject.findById(req.body.projectid).lean();
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });
    const responses = (project.steps || []).map((step) => {
      const submitted = (req.body.responses || []).find((item) => String(item.stepid) === String(step._id)) || {};
      return {
        stepid: String(step._id),
        steptitle: step.steptitle,
        response: text(submitted.response),
        filelink: text(submitted.filelink),
        maxmarks: num(step.maxmarks) || 10,
        status: "Submitted"
      };
    });
    const payload = {
      projectid: project._id,
      category: project.category,
      projecttitle: project.projecttitle,
      student: text(req.body.student || req.body.name),
      email: emailOf(req.body),
      regno: text(req.body.regno),
      status: "Submitted",
      responses,
      colid: num(req.body.colid)
    };
    const identity = emailOf(req.body) ? { email: emailOf(req.body) } : { regno: text(req.body.regno) };
    const existing = await SkillZoneProjectSubmission.findOne({
      projectid: project._id,
      ...identity,
      status: { $ne: "Accepted" }
    }).sort({ updatedAt: -1 });
    const data = existing
      ? await SkillZoneProjectSubmission.findByIdAndUpdate(existing._id, payload, { new: true, runValidators: true })
      : await SkillZoneProjectSubmission.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.evaluateProject = async (req, res) => {
  try {
    const submission = await SkillZoneProjectSubmission.findById(req.body.id);
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    const project = await SkillZoneProject.findById(submission.projectid).lean();
    const updatedResponses = [];
    for (const response of submission.responses || []) {
      const step = (project?.steps || []).find((item) => String(item._id) === String(response.stepid)) || {};
      let marks = Math.min(num(response.maxmarks), Math.round((text(response.response).length ? 0.7 : 0.2) * (num(response.maxmarks) || 10)));
      let comments = "Auto evaluated from submitted response. Please review before accepting.";
      if (text(req.body.provider)) {
        const prompt = `Evaluate this project step response. Return JSON {"marks":number,"comments":"..."}.
Step task: ${text(step.task || step.description)}
Max marks: ${num(response.maxmarks)}
Student response: ${text(response.response)}
File link: ${text(response.filelink)}`;
        const raw = /^ollama$/i.test(text(req.body.provider))
          ? await callOllama(req.body.colid, req.body.ollamaConfigId, prompt)
          : await callGemini(req.body.colid, req.body.geminiModel || "gemini-2.5-flash", prompt);
        const parsed = parseJson(raw, {});
        marks = Math.min(num(response.maxmarks), Math.max(0, num(parsed.marks)));
        comments = text(parsed.comments) || raw || comments;
      }
      updatedResponses.push({ ...response.toObject(), marksobtained: marks, aicomments: comments, status: "Evaluated" });
    }
    const totalmarks = updatedResponses.reduce((sum, item) => sum + num(item.maxmarks), 0);
    const marksobtained = updatedResponses.reduce((sum, item) => sum + num(item.marksobtained), 0);
    submission.responses = updatedResponses;
    submission.totalmarks = totalmarks;
    submission.marksobtained = marksobtained;
    submission.percentage = totalmarks ? Number(((marksobtained / totalmarks) * 100).toFixed(2)) : 0;
    submission.status = "Evaluated";
    await submission.save();
    res.json({ success: true, data: submission });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reviewProject = async (req, res) => {
  try {
    const submission = await SkillZoneProjectSubmission.findById(req.body.id);
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    const incomingResponses = Array.isArray(req.body.responses) ? req.body.responses : [];
    if (incomingResponses.length) {
      submission.responses = (submission.responses || []).map((response) => {
        const next = incomingResponses.find((item) => String(item._id || item.stepid) === String(response._id) || String(item.stepid) === String(response.stepid));
        if (!next) return response;
        response.usercomments = text(next.usercomments);
        if (next.marksobtained !== undefined) response.marksobtained = num(next.marksobtained);
        response.status = text(next.status || response.status);
        return response;
      });
      submission.totalmarks = (submission.responses || []).reduce((sum, item) => sum + num(item.maxmarks), 0);
      submission.marksobtained = (submission.responses || []).reduce((sum, item) => sum + num(item.marksobtained), 0);
      submission.percentage = submission.totalmarks ? Number(((submission.marksobtained / submission.totalmarks) * 100).toFixed(2)) : 0;
    }
    submission.status = text(req.body.status) || "Accepted";
    submission.reviewercomments = text(req.body.reviewercomments);
    submission.redoinstructions = text(req.body.redoinstructions);
    const data = await submission.save();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listProjectSubmissions = async (req, res) => {
  try {
    const query = commonFilter(req.query, ["category", "projecttitle", "email", "regno", "status"]);
    if (text(req.query.projectid)) query.projectid = text(req.query.projectid);
    const rows = await SkillZoneProjectSubmission.find(query).sort({ createdAt: -1 }).limit(3000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateCertificate = async (req, res) => {
  try {
    const project = await SkillZoneProjectSubmission.findById(req.body.projectsubmissionid).lean();
    const attempt = await SkillZoneAttempt.findById(req.body.certificationattemptid).lean();
    if (!project || project.status !== "Accepted") return res.status(400).json({ success: false, message: "Accepted project submission is required" });
    if (!attempt || attempt.passstatus !== "Pass") return res.status(400).json({ success: false, message: "Passed certification exam attempt is required" });
    const link = await SkillZoneCertificationProjectLink.findOne({
      status: /^Active$/i,
      examids: String(attempt.examid),
      projectids: String(project.projectid)
    }).lean();
    if (!link) return res.status(400).json({ success: false, message: "This project is not linked with the selected certification examination" });
    const certificatecode = `SKILL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const data = await SkillZoneCertificate.create({
      student: project.student || attempt.student,
      email: project.email || attempt.email,
      regno: project.regno || attempt.regno,
      projectsubmissionid: String(project._id),
      certificationattemptid: String(attempt._id),
      projecttitle: project.projecttitle,
      examname: attempt.examname,
      certificatecode,
      issuedate: new Date(),
      colid: num(req.body.colid)
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listCertificates = async (req, res) => {
  try {
    const query = commonFilter(req.query, ["email", "regno", "student", "certificatecode"]);
    const rows = await SkillZoneCertificate.find(query).sort({ createdAt: -1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
