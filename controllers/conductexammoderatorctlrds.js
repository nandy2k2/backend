const ConductExamCourse = require("../Models/conductexamcourseds");
const Moderator = require("../Models/conductexammoderatords");
const ModeratorPanel = require("../Models/conductexammoderatorpanelds");
const ModeratorPanelMember = require("../Models/conductexammoderatorpanelmemberds");
const QuestionPaper = require("../Models/conductexamquestionpaperds");
const ModerationAudit = require("../Models/conductexammoderationauditds");
const AiConfiguration = require("../Models/aiconfigurationds");
const User = require("../Models/user");
const { createApprovalTasks, completeApprovalTasks } = require("../utils/approvalTaskHelper");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const arr = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : String(value || "").split(/[,;|]/).map(text).filter(Boolean);
const dateOrUndefined = (value) => {
  if (!text(value)) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const docs = (value) => Array.isArray(value) ? value.map((doc) => ({
  title: text(doc.title),
  filename: text(doc.filename || doc.originalname),
  url: text(doc.url),
  uploadedby: text(doc.uploadedby),
  uploadeddate: dateOrUndefined(doc.uploadeddate) || new Date()
})).filter((doc) => doc.url) : [];
const uniq = (values) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const stripCodeFence = (content) => text(content).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
const parseJson = (content) => {
  const clean = stripCodeFence(content);
  const startObj = clean.indexOf("{");
  const startArr = clean.indexOf("[");
  const start = startArr >= 0 && (startObj < 0 || startArr < startObj) ? startArr : startObj;
  const end = startArr >= 0 && start === startArr ? clean.lastIndexOf("]") : clean.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean);
};

const courseFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"];
const moderatorFields = [...courseFields, "moderatorname", "moderatoremail", "status"];
const panelFields = ["academicyear", "regulation", "program", "programcode", "panelname", "status"];
const panelMemberFields = [...panelFields, "membername", "memberemail", "role", "department", "approvalstatus", "status"];

const buildFilter = (source = {}, fields = []) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  fields.forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const baseCoursePayload = (body = {}) => ({
  colid: number(body.colid),
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

const moderatorPayload = (body = {}) => ({
  ...baseCoursePayload(body),
  moderatorname: text(body.moderatorname || body.moderator || body.name),
  moderatoremail: text(body.moderatoremail || body.email).toLowerCase(),
  startdate: dateOrUndefined(body.startdate),
  enddate: dateOrUndefined(body.enddate),
  admindocuments: docs(body.admindocuments),
  status: text(body.status) || "assigned"
});

const panelPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  panelname: text(body.panelname),
  description: text(body.description),
  status: text(body.status) || "Active",
  name: text(body.name),
  user: text(body.user)
});

const panelMemberPayload = (body = {}, panel = null) => ({
  colid: number(body.colid || panel?.colid),
  panelid: text(body.panelid || panel?._id),
  academicyear: text(body.academicyear || panel?.academicyear),
  regulation: text(body.regulation || panel?.regulation),
  program: text(body.program || panel?.program),
  programcode: text(body.programcode || panel?.programcode),
  panelname: text(body.panelname || panel?.panelname),
  membername: text(body.membername || body.name),
  memberemail: text(body.memberemail || body.email).toLowerCase(),
  role: text(body.role),
  department: text(body.department),
  designation: text(body.designation),
  institution: text(body.institution),
  approvalstatus: text(body.approvalstatus) || "Pending",
  comments: text(body.comments),
  status: text(body.status) || "Active",
  name: text(body.createdby || body.name),
  user: text(body.createduser || body.user)
});

const validateModerator = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "course", "coursecode", "moderatorname", "moderatoremail"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const validatePanel = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "regulation", "program", "programcode", "panelname"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const validatePanelMember = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["panelid", "academicyear", "regulation", "program", "programcode", "panelname", "membername", "memberemail"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const getAiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGemini = async (colid, model, prompt) => {
  const config = await getAiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini AI configuration is missing");
  const models = model ? [model] : ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let lastError = "";
  for (const geminiModel of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
      })
    });
    const data = await response.json();
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini API request failed for ${geminiModel}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

const moderatorReadyStatuses = ["InvigilatorSubmitted", "Moderation In Progress", "Moderation Submitted"];

const findPaperForModerator = async (moderator) => QuestionPaper.findOne({
  colid: moderator.colid,
  academicyear: moderator.academicyear,
  examcode: moderator.examcode,
  programcode: moderator.programcode,
  coursecode: moderator.coursecode,
  status: { $in: moderatorReadyStatuses }
}).sort({ updatedAt: -1 }).lean();

const auditBase = (moderator, paper, body = {}) => ({
  colid: moderator.colid,
  moderatorid: moderator._id,
  questionpaperid: paper?._id,
  academicyear: moderator.academicyear,
  regulation: moderator.regulation,
  exam: moderator.exam,
  examcode: moderator.examcode,
  program: moderator.program,
  programcode: moderator.programcode,
  course: moderator.course,
  coursecode: moderator.coursecode,
  actorname: text(body.actorname || body.name),
  actoremail: text(body.actoremail || body.user),
  user: text(body.user)
});

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const courseFilter = buildFilter(req.query, courseFields);
    const [courses, moderators, users] = await Promise.all([
      ConductExamCourse.find(courseFilter).sort({ academicyear: -1, examcode: 1, program: 1, course: 1 }).lean(),
      Moderator.find({ colid }).sort({ moderatorname: 1 }).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email role department").sort({ name: 1, email: 1 }).lean()
    ]);
    res.json({ success: true, courses, moderators, users, academicyears: uniq(courses.map((row) => row.academicyear)), examcodes: uniq(courses.map((row) => row.examcode)) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPanels = async (req, res) => {
  try {
    const filter = buildFilter(req.query, panelFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ModeratorPanel.find(filter).sort({ academicyear: -1, program: 1, panelname: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePanel = async (req, res) => {
  try {
    const item = panelPayload(req.body);
    const error = validatePanel(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ModeratorPanel.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await ModeratorPanel.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, regulation: item.regulation, programcode: item.programcode, panelname: item.panelname },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "This moderator panel already exists." : error.message });
  }
};

exports.deletePanel = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await ModeratorPanel.deleteMany({ _id: { $in: ids }, colid });
    await ModeratorPanelMember.deleteMany({ panelid: { $in: ids }, colid });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkPanels = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = panelPayload({ ...items[index], colid: req.body.colid || items[index].colid, name: req.body.name || items[index].name, user: req.body.user || items[index].user });
      const error = validatePanel(item);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await ModeratorPanel.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, regulation: item.regulation, programcode: item.programcode, panelname: item.panelname },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPanelMembers = async (req, res) => {
  try {
    const filter = buildFilter(req.query, panelMemberFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (text(req.query.panelid)) filter.panelid = text(req.query.panelid);
    const data = await ModeratorPanelMember.find(filter).sort({ academicyear: -1, program: 1, panelname: 1, membername: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePanelMembers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const panelid = text(req.body.panelid);
    if (colid === undefined || !panelid) return res.status(400).json({ success: false, message: "colid and panelid are required" });
    const panel = await ModeratorPanel.findOne({ _id: panelid, colid }).lean();
    if (!panel) return res.status(404).json({ success: false, message: "Panel not found" });
    const users = Array.isArray(req.body.users) && req.body.users.length ? req.body.users : [req.body];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < users.length; index += 1) {
      const item = panelMemberPayload({ ...users[index], colid, panelid, createdby: req.body.name, createduser: req.body.user }, panel);
      const error = validatePanelMember(item);
      if (error) {
        errors.push({ rowNumber: users[index].rowNumber || index + 1, message: error });
        continue;
      }
      const savedMember = await ModeratorPanelMember.findOneAndUpdate(
        { colid: item.colid, panelid: item.panelid, memberemail: item.memberemail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await createApprovalTasks({
        colid,
        user: text(req.body.user),
        createdby: text(req.body.name),
        academicyear: item.academicyear,
        approverrole: "All",
        title: `Approve moderator panel member: ${item.membername || item.memberemail}`,
        category: "Moderator panel approval",
        pagelink: "/conduct-exam-moderator-panel-approval",
        comments: `Moderator panel ${item.panelname} has a member pending approval.`,
        referenceModel: "conductexammoderatorpanelmemberds",
        referenceId: savedMember?._id,
        level: "Panel"
      });
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "This member is already assigned to the panel." : error.message });
  }
};

exports.deletePanelMembers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await ModeratorPanelMember.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvePanelMembers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const approvalstatus = text(req.body.approvalstatus) || "Approved";
    if (colid === undefined || !ids.length) return res.status(400).json({ success: false, message: "Select at least one member" });
    const result = await ModeratorPanelMember.updateMany(
      { _id: { $in: ids }, colid },
      {
        $set: {
          approvalstatus,
          comments: text(req.body.comments),
          approvedby: text(req.body.approvedby || req.body.name),
          approvedbyemail: text(req.body.approvedbyemail || req.body.user),
          approveddate: new Date()
        }
      }
    );
    for (const id of ids) {
      await completeApprovalTasks({
        colid,
        category: "Moderator panel approval",
        referenceModel: "conductexammoderatorpanelmemberds",
        referenceId: id,
        level: "Panel",
        comments: `Moderator panel member marked ${approvalstatus} by ${text(req.body.name || req.body.user)}`
      });
    }
    res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getModerators = async (req, res) => {
  try {
    const filter = buildFilter(req.query, moderatorFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await Moderator.find(filter).sort({ academicyear: -1, examcode: 1, program: 1, course: 1, moderatorname: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveModerator = async (req, res) => {
  try {
    const item = moderatorPayload(req.body);
    const error = validateModerator(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await Moderator.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await Moderator.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, moderatoremail: item.moderatoremail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "This moderator is already assigned for this course" : error.message });
  }
};

exports.deleteModerator = async (req, res) => {
  try {
    await Moderator.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkModerators = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = moderatorPayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user || items[index].user });
      const error = validateModerator(item);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await Moderator.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, moderatoremail: item.moderatoremail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignedPapers = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "exam", "examcode", "programcode", "coursecode", "status"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (text(req.query.moderatoremail || req.query.email)) filter.moderatoremail = text(req.query.moderatoremail || req.query.email).toLowerCase();
    const moderators = await Moderator.find(filter).sort({ academicyear: -1, examcode: 1, course: 1 }).lean();
    const data = [];
    for (const moderator of moderators) {
      const paper = await findPaperForModerator(moderator);
      if (paper) data.push({ ...moderator, questionpaperid: paper._id || "", paperstatus: paper.status || "", haspaper: true });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getModerationPaper = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const moderatorid = text(req.query.moderatorid);
    if (colid === undefined || !moderatorid) return res.status(400).json({ success: false, message: "colid and moderatorid are required" });
    const moderator = await Moderator.findOne({ _id: moderatorid, colid }).lean();
    if (!moderator) return res.status(404).json({ success: false, message: "Moderator assignment not found" });
    const paper = await findPaperForModerator(moderator);
    if (!paper) return res.status(404).json({ success: false, message: "Question paper is not submitted for moderation" });
    const audit = await ModerationAudit.find({ colid, moderatorid, questionpaperid: paper._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, moderator, paper, audit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveModerationPaper = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const moderatorid = text(req.body.moderatorid);
    if (colid === undefined || !moderatorid) return res.status(400).json({ success: false, message: "colid and moderatorid are required" });
    const moderator = await Moderator.findOne({ _id: moderatorid, colid }).lean();
    if (!moderator) return res.status(404).json({ success: false, message: "Moderator assignment not found" });
    const paper = await findPaperForModerator(moderator);
    if (!paper) return res.status(404).json({ success: false, message: "Question paper is not available" });
    if (/^Moderation Submitted$/i.test(paper.status)) return res.status(400).json({ success: false, message: "Moderation is already submitted. No changes allowed." });

    const incomingSections = Array.isArray(req.body.sections) ? req.body.sections : [];
    const auditRows = [];
    incomingSections.forEach((section, sectionIndex) => {
      (section.questions || []).forEach((question, questionIndex) => {
        const oldQuestion = paper.sections?.[sectionIndex]?.questions?.[questionIndex] || {};
        if (
          text(oldQuestion.question) !== text(question.question)
          || text(oldQuestion.answer) !== text(question.answer)
          || text(oldQuestion.conumber) !== text(question.conumber)
          || JSON.stringify(arr(oldQuestion.bloomlevels)) !== JSON.stringify(arr(question.bloomlevels))
        ) {
          auditRows.push({
            ...auditBase(moderator, paper, req.body),
            sectionindex: sectionIndex,
            questionindex: questionIndex,
            action: "Manual edit",
            oldquestion: text(oldQuestion.question),
            oldanswer: text(oldQuestion.answer),
            newquestion: text(question.question),
            newanswer: text(question.answer),
            oldco: text(oldQuestion.conumber || oldQuestion.co),
            newco: text(question.conumber || question.co),
            oldbloomlevels: arr(oldQuestion.bloomlevels),
            newbloomlevels: arr(question.bloomlevels),
            comments: text(req.body.comments)
          });
        }
      });
    });

    const updatePayload = { sections: incomingSections, status: text(req.body.status) || "Moderation In Progress", user: text(req.body.user) };
    if (Array.isArray(req.body.moderationdocuments)) updatePayload.moderationdocuments = docs(req.body.moderationdocuments);
    const data = await QuestionPaper.findOneAndUpdate(
      { _id: paper._id, colid },
      updatePayload,
      { new: true, runValidators: true }
    );
    if (auditRows.length) await ModerationAudit.insertMany(auditRows);
    await Moderator.findOneAndUpdate({ _id: moderatorid, colid }, { status: text(req.body.status) || "Moderation In Progress" });
    const audit = await ModerationAudit.find({ colid, moderatorid, questionpaperid: paper._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data, audit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.geminiModerate = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const moderatorid = text(req.body.moderatorid);
    if (colid === undefined || !moderatorid) return res.status(400).json({ success: false, message: "colid and moderatorid are required" });
    const moderator = await Moderator.findOne({ _id: moderatorid, colid }).lean();
    if (!moderator) return res.status(404).json({ success: false, message: "Moderator assignment not found" });
    const paper = await findPaperForModerator(moderator);
    if (!paper) return res.status(404).json({ success: false, message: "Question paper is not available" });
    if (/^Moderation Submitted$/i.test(paper.status)) return res.status(400).json({ success: false, message: "Moderation is already submitted. No changes allowed." });

    const selected = Array.isArray(req.body.questions) ? req.body.questions : [];
    if (!selected.length) return res.status(400).json({ success: false, message: "Select at least one question" });
    const prompt = `Return valid JSON only as {"questions":[...]}.
You are moderating an examination question paper.
Course: ${moderator.course} (${moderator.coursecode})
Subject: ${moderator.subject}
Moderator rules: ${text(req.body.rules)}
Review the selected questions for clarity, correctness, marks suitability, CO mapping, Bloom taxonomy mapping, answer quality and exam appropriateness.
For each item, return sectionindex, questionindex, question, answer, conumber, co, bloomlevels array, comments.
Selected questions: ${JSON.stringify(selected)}`;
    const raw = await callGemini(colid, text(req.body.geminiModel), prompt);
    const parsed = parseJson(raw);
    const suggestions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    const current = JSON.parse(JSON.stringify(paper.sections || []));
    const auditRows = [];
    suggestions.forEach((item) => {
      const sectionIndex = Number(item.sectionindex);
      const questionIndex = Number(item.questionindex);
      if (!current[sectionIndex]?.questions?.[questionIndex]) return;
      const oldQuestion = current[sectionIndex].questions[questionIndex];
      current[sectionIndex].questions[questionIndex] = {
        ...oldQuestion,
        question: text(item.question) || oldQuestion.question,
        answer: text(item.answer) || oldQuestion.answer,
        conumber: text(item.conumber) || oldQuestion.conumber,
        co: text(item.co) || oldQuestion.co,
        bloomlevels: arr(item.bloomlevels).length ? arr(item.bloomlevels) : arr(oldQuestion.bloomlevels),
        aimappingcomments: text(item.comments) || oldQuestion.aimappingcomments
      };
      auditRows.push({
        ...auditBase(moderator, paper, req.body),
        sectionindex: sectionIndex,
        questionindex: questionIndex,
        action: "Gemini moderation",
        rules: text(req.body.rules),
        oldquestion: text(oldQuestion.question),
        oldanswer: text(oldQuestion.answer),
        newquestion: text(current[sectionIndex].questions[questionIndex].question),
        newanswer: text(current[sectionIndex].questions[questionIndex].answer),
        oldco: text(oldQuestion.conumber || oldQuestion.co),
        newco: text(current[sectionIndex].questions[questionIndex].conumber || current[sectionIndex].questions[questionIndex].co),
        oldbloomlevels: arr(oldQuestion.bloomlevels),
        newbloomlevels: arr(current[sectionIndex].questions[questionIndex].bloomlevels),
        comments: text(item.comments)
      });
    });
    const data = await QuestionPaper.findOneAndUpdate({ _id: paper._id, colid }, { sections: current, status: "Moderation In Progress", airesponse: raw, user: text(req.body.user) }, { new: true, runValidators: true });
    if (auditRows.length) await ModerationAudit.insertMany(auditRows);
    await Moderator.findOneAndUpdate({ _id: moderatorid, colid }, { status: "Moderation In Progress" });
    const audit = await ModerationAudit.find({ colid, moderatorid, questionpaperid: paper._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data, audit, suggestions, raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitModeration = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const moderatorid = text(req.body.moderatorid);
    if (colid === undefined || !moderatorid) return res.status(400).json({ success: false, message: "colid and moderatorid are required" });
    const moderator = await Moderator.findOne({ _id: moderatorid, colid }).lean();
    if (!moderator) return res.status(404).json({ success: false, message: "Moderator assignment not found" });
    const paper = await findPaperForModerator(moderator);
    if (!paper) return res.status(404).json({ success: false, message: "Question paper is not available" });
    const data = await QuestionPaper.findOneAndUpdate({ _id: paper._id, colid }, { status: "Moderation Submitted", user: text(req.body.user) }, { new: true });
    await Moderator.findOneAndUpdate({ _id: moderatorid, colid }, { status: "Moderation Submitted" });
    await ModerationAudit.create({ ...auditBase(moderator, paper, req.body), action: "Final submit", comments: text(req.body.comments) });
    const audit = await ModerationAudit.find({ colid, moderatorid, questionpaperid: paper._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data, audit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
