const crypto = require("crypto");
const ConductExamCourse = require("../Models/conductexamcourseds");
const PaperSetter = require("../Models/conductexampapersetterds");
const QuestionPaper = require("../Models/conductexamquestionpaperds");
const ModerationAudit = require("../Models/conductexammoderationauditds");
const BlockchainLedger = require("../Models/blockchainledgerds");
const Institution = require("../Models/insdetails");
const AiConfiguration = require("../Models/aiconfigurationds");
const blockchainledgerctlrds = require("./blockchainledgerctlrds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (values) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const stableStringify = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const buildHash = ({ colid, blockindex, modelname, collectionname, recordid, action, datahash, previoushash, timestamp, user }) => sha256(stableStringify({
  colid,
  blockindex,
  modelname,
  collectionname,
  recordid,
  action,
  datahash,
  previoushash,
  timestamp,
  user
}));

const buildFilter = (source = {}, fields = []) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  fields.forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const verificationUrl = (req, paperId, hash = "") => {
  const forwardedProto = text(req.get("x-forwarded-proto")).split(",")[0];
  const forwardedHost = text(req.get("x-forwarded-host")).split(",")[0];
  const forwardedOrigin = forwardedProto && forwardedHost ? `${forwardedProto}://${forwardedHost}` : "";
  const origin = text(req.body?.origin || req.query?.origin || req.get("origin") || forwardedOrigin) || `${req.protocol}://${req.get("host")}`;
  const params = new URLSearchParams({ paperid: String(paperId || "") });
  if (hash) params.set("hash", hash);
  return `${origin}/verify-question-paper-blockchain?${params.toString()}`;
};

const getAiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i, apikey: { $exists: true, $ne: "" } }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, apikey: { $exists: true, $ne: "" } }).sort({ _id: -1 }).lean()
);

const stripCodeFence = (value) => text(value).replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

const callGeminiHtml = async (colid, prompt) => {
  const config = await getAiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini AI configuration is missing");
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return stripCodeFence(data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "");
    lastError = data.error?.message || `Gemini API request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = buildFilter(req.query, ["academicyear", "exam", "examcode", "regulation", "programcode", "coursecode"]);
    const [courses, setters] = await Promise.all([
      ConductExamCourse.find(filter).sort({ academicyear: -1, examcode: 1, program: 1, course: 1 }).lean(),
      PaperSetter.find({ colid }).sort({ papersettername: 1 }).lean()
    ]);
    res.json({
      success: true,
      courses,
      setters,
      academicyears: uniq(courses.map((row) => row.academicyear)),
      examcodes: uniq(courses.map((row) => row.examcode))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPapers = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode", "papersetteremail", "status"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await QuestionPaper.find(filter).sort({ academicyear: -1, examcode: 1, program: 1, course: 1, papersettername: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPaperDetails = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const paperid = text(req.query.paperid);
    if (colid === undefined || !paperid) return res.status(400).json({ success: false, message: "colid and paperid are required" });
    const paper = await QuestionPaper.findOne({ _id: paperid, colid }).lean();
    if (!paper) return res.status(404).json({ success: false, message: "Question paper not found" });
    const audit = await ModerationAudit.find({ colid, questionpaperid: paper._id }).sort({ createdAt: -1 }).lean();
    const blocks = await BlockchainLedger.find({ colid, modelname: "conductexamquestionpaperds", recordid: String(paper._id) }).sort({ timestamp: -1 }).lean();
    res.json({ success: true, paper, audit, blocks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.acceptPaper = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const paperid = text(req.body.paperid);
    const paperids = Array.isArray(req.body.paperids) ? req.body.paperids.map(text).filter(Boolean) : [];
    if (colid === undefined || (!paperid && !paperids.length)) return res.status(400).json({ success: false, message: "colid and paperid are required" });
    if (paperids.length) {
      await QuestionPaper.updateMany(
        { _id: { $in: paperids }, colid },
        { status: "Accepted", acceptedby: text(req.body.user), accepteddate: new Date(), user: text(req.body.user) }
      );
      const data = await QuestionPaper.find({ _id: { $in: paperids }, colid }).lean();
      return res.json({ success: true, data, message: `${data.length} question paper(s) accepted` });
    }
    const paper = await QuestionPaper.findOneAndUpdate(
      { _id: paperid, colid },
      { status: "Accepted", acceptedby: text(req.body.user), accepteddate: new Date(), user: text(req.body.user) },
      { new: true }
    ).lean();
    if (!paper) return res.status(404).json({ success: false, message: "Question paper not found" });
    res.json({ success: true, data: paper });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePaperStatus = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const paperids = Array.isArray(req.body.paperids) ? req.body.paperids.map(text).filter(Boolean) : [];
    const paperstatus = text(req.body.paperstatus);
    const allowed = ["Default", "Backup", "Emergency", "Reserve"];
    if (colid === undefined || !paperids.length || !paperstatus) return res.status(400).json({ success: false, message: "colid, paperids and paperstatus are required" });
    if (!allowed.includes(paperstatus)) return res.status(400).json({ success: false, message: "Invalid paper status" });
    await QuestionPaper.updateMany({ _id: { $in: paperids }, colid }, { paperstatus, user: text(req.body.user) });
    const data = await QuestionPaper.find({ _id: { $in: paperids }, colid }).lean();
    res.json({ success: true, data, message: `${data.length} question paper(s) updated to ${paperstatus}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.storeBlockchain = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const paperid = text(req.body.paperid);
    const paperids = Array.isArray(req.body.paperids) ? req.body.paperids.map(text).filter(Boolean) : [];
    if (colid === undefined || (!paperid && !paperids.length)) return res.status(400).json({ success: false, message: "colid and paperid are required" });
    if (paperids.length) {
      const results = [];
      for (const selectedPaperId of paperids) {
        const paper = await QuestionPaper.findOne({ _id: selectedPaperId, colid }).lean();
        if (!paper) {
          results.push({ paperid: selectedPaperId, success: false, message: "Question paper not found" });
          continue;
        }
        if (!/^Accepted$/i.test(paper.status)) {
          results.push({ paperid: selectedPaperId, success: false, message: "Only accepted question papers can be stored in blockchain" });
          continue;
        }
        const payload = {
          paperid: String(paper._id),
          academicyear: paper.academicyear,
          regulation: paper.regulation,
          exam: paper.exam,
          examcode: paper.examcode,
          program: paper.program,
          programcode: paper.programcode,
          course: paper.course,
          coursecode: paper.coursecode,
          papersettername: paper.papersettername,
          papersetteremail: paper.papersetteremail,
          status: paper.status,
          paperstatus: paper.paperstatus,
          acceptedby: paper.acceptedby,
          accepteddate: paper.accepteddate,
          sections: paper.sections || []
        };
        const block = await blockchainledgerctlrds.appendBlock({
          colid,
          modelname: "conductexamquestionpaperds",
          collectionname: "conductexamquestionpaperds",
          recordid: String(paper._id),
          action: "ACCEPTED_QUESTION_PAPER",
          payload,
          metadata: { examcode: paper.examcode, coursecode: paper.coursecode },
          user: text(req.body.user)
        });
        const url = verificationUrl(req, paper._id, block.hash);
        const updated = await QuestionPaper.findOneAndUpdate(
          { _id: selectedPaperId, colid },
          { blockchainhash: block.hash, blockchainverificationurl: url },
          { new: true }
        ).lean();
        results.push({ paperid: selectedPaperId, success: true, data: block, paper: updated, verificationUrl: url });
      }
      return res.json({ success: true, results, message: `${results.filter((item) => item.success).length} question paper(s) stored in blockchain` });
    }
    const paper = await QuestionPaper.findOne({ _id: paperid, colid }).lean();
    if (!paper) return res.status(404).json({ success: false, message: "Question paper not found" });
    if (!/^Accepted$/i.test(paper.status)) return res.status(400).json({ success: false, message: "Only accepted question papers can be stored in blockchain" });
    const payload = {
      paperid: String(paper._id),
      academicyear: paper.academicyear,
      regulation: paper.regulation,
      exam: paper.exam,
      examcode: paper.examcode,
      program: paper.program,
      programcode: paper.programcode,
      course: paper.course,
      coursecode: paper.coursecode,
      papersettername: paper.papersettername,
      papersetteremail: paper.papersetteremail,
      status: paper.status,
      paperstatus: paper.paperstatus,
      acceptedby: paper.acceptedby,
      accepteddate: paper.accepteddate,
      sections: paper.sections || []
    };
    const block = await blockchainledgerctlrds.appendBlock({
      colid,
      modelname: "conductexamquestionpaperds",
      collectionname: "conductexamquestionpaperds",
      recordid: String(paper._id),
      action: "ACCEPTED_QUESTION_PAPER",
      payload,
      metadata: { examcode: paper.examcode, coursecode: paper.coursecode },
      user: text(req.body.user)
    });
    const url = verificationUrl(req, paper._id, block.hash);
    const updated = await QuestionPaper.findOneAndUpdate(
      { _id: paperid, colid },
      { blockchainhash: block.hash, blockchainverificationurl: url },
      { new: true }
    ).lean();
    res.json({ success: true, data: block, paper: updated, verificationUrl: url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyBlockchain = async (req, res) => {
  try {
    const paperid = text(req.query.paperid);
    const hash = text(req.query.hash);
    if (!paperid && !hash) return res.status(400).json({ success: false, message: "paperid or hash is required" });
    const query = { modelname: "conductexamquestionpaperds" };
    if (paperid) query.recordid = paperid;
    if (hash) query.hash = hash;
    const blocks = await BlockchainLedger.find(query).sort({ timestamp: -1 }).lean();
    const data = [];
    for (const block of blocks) {
      const previous = block.blockindex === 1
        ? null
        : await BlockchainLedger.findOne({ colid: block.colid, blockindex: Number(block.blockindex) - 1 }).lean();
      const expectedPreviousHash = block.blockindex === 1 ? "GENESIS" : previous?.hash;
      const expectedDataHash = sha256(stableStringify(block.payload || {}));
      const expectedHash = buildHash({
        colid: block.colid,
        blockindex: block.blockindex,
        modelname: block.modelname,
        collectionname: block.collectionname,
        recordid: block.recordid,
        action: block.action,
        datahash: block.datahash,
        previoushash: block.previoushash,
        timestamp: new Date(block.timestamp).toISOString(),
        user: block.user
      });
      data.push({
        ...block,
        valid: block.previoushash === expectedPreviousHash && block.datahash === expectedDataHash && block.hash === expectedHash
      });
    }
    const colid = data[0]?.colid;
    const institution = colid ? await Institution.findOne({ colid }).lean() : null;
    res.json({ success: true, verified: data.some((item) => item.valid), data, institution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.formatVerifiedQuestionPaperPrint = async (req, res) => {
  try {
    const paperid = text(req.body.paperid || req.body.payload?.paperid);
    const hash = text(req.body.hash);
    const blockQuery = { modelname: "conductexamquestionpaperds" };
    if (paperid) blockQuery.recordid = paperid;
    if (hash) blockQuery.hash = hash;
    const block = await BlockchainLedger.findOne(blockQuery).sort({ timestamp: -1 }).lean();
    const colid = number(block?.colid || req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "Unable to identify institution colid from blockchain record" });
    const payload = block?.payload || req.body.payload || {};
    const institution = await Institution.findOne({ colid }).lean() || {};
    const rules = text(req.body.rules) || "Create a compact formal university examination question paper print preview.";
    const prompt = `Return only clean HTML inside a single div. Do not include markdown, scripts, external CSS, body, html, or style tags.
Use inline styles only. Format for A4 printing.
Institution: ${JSON.stringify(institution)}
Rules from user: ${rules}
Question paper payload: ${JSON.stringify(payload)}
The HTML must include institution name, address, exam, program, course, course code, question sections, questions, marks, CO and Bloom levels where available.`;
    const html = await callGeminiHtml(colid, prompt);
    res.json({ success: true, html });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
