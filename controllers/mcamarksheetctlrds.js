const mongoose = require("mongoose");
const McaMarksheet = require("../Models/mcamarksheetds");
const User = require("../Models/user");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const ConductExam = require("../Models/conductexamds");
const MoocStudent = require("../Models/moocvalueaddedstudentds");
const Institution = require("../Models/insdetails");
const GradingTemplateDetail = require("../Models/exammodel2gradingtemplatedetailds");
const ClassConfiguration = require("../Models/exammodel2classconfigurationds");
const { appendBlock } = require("./blockchainledgerctlrds");

const fields = [
  "academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "student", "regno",
  "abcid", "exam", "examcode", "specialization", "mediumofinstruction", "oldenrolmmentno", "credit",
  "cceobtained", "ccetotal", "ccepercentage", "ccegrade", "seetheoryobtained", "seetheorytotal", "seetheorypercentage", "seetheorygrade",
  "seepracticalobtained", "seepracticaltotal", "seepracticalpercentage", "seepracticalgrade", "overallobtained", "overalltotal",
  "overallpercentage", "overallgrade", "gradepoint", "overallgradepoints", "statementno", "blockchainhash", "blockchainrecordid", "status"
];
const numericFields = ["credit", "cceobtained", "ccetotal", "ccepercentage", "seetheoryobtained", "seetheorytotal", "seetheorypercentage", "seepracticalobtained", "seepracticaltotal", "seepracticalpercentage", "overallobtained", "overalltotal", "overallpercentage", "gradepoint", "overallgradepoints"];
const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (value) => new RegExp(escapeRegex(value), "i");

function pick(source = {}) {
  const payload = {};
  fields.forEach((field) => {
    if (source[field] !== undefined) payload[field] = source[field];
  });
  numericFields.forEach((field) => {
    payload[field] = number(payload[field], 0);
  });
  return payload;
}

function filters(source = {}, allowed = fields) {
  const query = {};
  allowed.forEach((field) => {
    if (text(source[field])) query[field] = rx(source[field]);
  });
  return query;
}

async function distinct(Model, colid, field, base = {}) {
  return (await Model.distinct(field, { colid, ...base })).map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function institution(colid) {
  return await Institution.findOne({ colid }).sort({ _id: -1 }).lean() || {};
}

function percentage(obtained, total) {
  const denominator = number(total, 0);
  if (!denominator) return 0;
  return Number(((number(obtained, 0) / denominator) * 100).toFixed(2));
}

function gradeFor(value, details = []) {
  const percent = number(value, 0);
  return details.find((row) => percent >= number(row.frommarks, 0) && percent <= number(row.tomarks, 0)) || {};
}

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const base = filters(req.query, ["academicyear", "regulation", "program", "programcode", "semester"]);
    const studentBase = { role: /^Student$/i, ...base };
    const courseBase = filters(req.query, ["academicyear", "regulation", "program", "programcode", "semester"]);
    const examBase = filters(req.query, ["academicyear", "program", "programcode", "semester"]);
    const [students, courses, exams, gradingRows, classConfigurations, ins] = await Promise.all([
      User.find({ colid, ...studentBase }).select("name regno email abcid photo program programcode regulation semester academicyear").sort({ name: 1 }).limit(1000).lean(),
      RegulationCourseMap.find({ colid, ...courseBase }).select("course coursecode credit academicyear regulation program programcode semester").sort({ course: 1 }).limit(1000).lean(),
      ConductExam.find({ colid, ...examBase }).select("examname examcode academicyear program programcode semester").sort({ academicyear: -1, examname: 1 }).limit(500).lean(),
      GradingTemplateDetail.find({ colid }).select("academicyear templatename templateid").sort({ academicyear: -1, templatename: 1 }).lean(),
      ClassConfiguration.find({ colid }).sort({ academicyear: -1, programcode: 1, fromsgpa: -1 }).lean(),
      institution(colid)
    ]);
    const options = {};
    await Promise.all(["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "exam", "examcode", "specialization", "mediumofinstruction", "status"].map(async (field) => {
      options[field] = await distinct(McaMarksheet, colid, field);
    }));
    const userAcademicYears = await distinct(User, colid, "academicyear", { role: /^Student$/i });
    options.academicyear = Array.from(new Set([...options.academicyear, ...userAcademicYears])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    options.regulation = Array.from(new Set([...options.regulation, ...(await distinct(RegulationCourseMap, colid, "regulation", courseBase)), ...(await distinct(User, colid, "regulation", studentBase))])).sort();
    options.program = Array.from(new Set([...options.program, ...(await distinct(RegulationCourseMap, colid, "program", courseBase)), ...(await distinct(User, colid, "program", studentBase))])).sort();
    options.programcode = Array.from(new Set([...options.programcode, ...(await distinct(RegulationCourseMap, colid, "programcode", courseBase)), ...(await distinct(User, colid, "programcode", studentBase))])).sort();
    options.semester = Array.from(new Set([...options.semester, ...(await distinct(RegulationCourseMap, colid, "semester", courseBase)), ...(await distinct(User, colid, "semester", studentBase))])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const seenTemplates = new Set();
    const gradingTemplates = gradingRows.filter((row) => {
      const key = row.templateid || row._id;
      if (!key || seenTemplates.has(String(key))) return false;
      seenTemplates.add(String(key));
      return true;
    }).map((row) => ({ templateid: row.templateid, templatename: row.templatename, academicyear: row.academicyear }));
    res.json({ success: true, options, students, courses, exams, gradingTemplates, classConfigurations, institution: ins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await McaMarksheet.find({ colid, ...filters(req.query) }).sort({ academicyear: -1, program: 1, semester: 1, regno: 1, coursecode: 1 }).limit(number(req.query.limit, 500)).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = { ...pick(req.body), colid, name: req.body.name || "", user: req.body.user || "" };
    if (!text(payload.academicyear) || !text(payload.regno) || !text(payload.coursecode)) return res.status(400).json({ success: false, message: "Academic year, reg no and course code are required" });
    const id = req.body.id || req.body._id;
    const data = id && mongoose.Types.ObjectId.isValid(id)
      ? await McaMarksheet.findOneAndUpdate({ _id: id, colid }, payload, { new: true })
      : await McaMarksheet.findOneAndUpdate({
        colid,
        academicyear: payload.academicyear,
        examcode: payload.examcode,
        regulation: payload.regulation,
        programcode: payload.programcode,
        semester: payload.semester,
        regno: payload.regno,
        coursecode: payload.coursecode
      }, payload, { new: true, upsert: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Duplicate marksheet row" : error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let saved = 0;
    for (const row of rows) {
      const payload = { ...pick(row), colid, name: req.body.name || "", user: req.body.user || "" };
      if (!text(payload.academicyear) || !text(payload.regno) || !text(payload.coursecode)) continue;
      await McaMarksheet.findOneAndUpdate({
        colid,
        academicyear: payload.academicyear,
        examcode: payload.examcode,
        regulation: payload.regulation,
        programcode: payload.programcode,
        semester: payload.semester,
        regno: payload.regno,
        coursecode: payload.coursecode
      }, payload, { upsert: true, setDefaultsOnInsert: true });
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMany = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id]).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const result = await McaMarksheet.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processGrades = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const templateid = text(req.body.templateid);
    if (colid === undefined || !templateid) return res.status(400).json({ success: false, message: "colid and grading scheme are required" });
    const details = await GradingTemplateDetail.find({ colid, templateid }).sort({ frommarks: -1 }).lean();
    if (!details.length) return res.status(400).json({ success: false, message: "No grading scheme details found for selected template" });
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const query = ids.length ? { colid, _id: { $in: ids } } : { colid, ...filters(req.body.filters || {}) };
    const rows = await McaMarksheet.find(query);
    let updated = 0;
    for (const row of rows) {
      row.ccepercentage = percentage(row.cceobtained, row.ccetotal);
      row.seetheorypercentage = percentage(row.seetheoryobtained, row.seetheorytotal);
      row.seepracticalpercentage = percentage(row.seepracticalobtained, row.seepracticaltotal);
      row.overallobtained = number(row.cceobtained) + number(row.seetheoryobtained) + number(row.seepracticalobtained);
      row.overalltotal = number(row.ccetotal) + number(row.seetheorytotal) + number(row.seepracticaltotal);
      row.overallpercentage = percentage(row.overallobtained, row.overalltotal);
      const cce = number(row.ccetotal) ? gradeFor(row.ccepercentage, details) : {};
      const theory = number(row.seetheorytotal) ? gradeFor(row.seetheorypercentage, details) : {};
      const practical = number(row.seepracticaltotal) ? gradeFor(row.seepracticalpercentage, details) : {};
      const overall = number(row.overalltotal) ? gradeFor(row.overallpercentage, details) : {};
      row.ccegrade = number(row.ccetotal) ? (cce.grade || row.ccegrade || "") : "-";
      row.seetheorygrade = number(row.seetheorytotal) ? (theory.grade || row.seetheorygrade || "") : "-";
      row.seepracticalgrade = number(row.seepracticaltotal) ? (practical.grade || row.seepracticalgrade || "") : "-";
      row.overallgrade = number(row.overalltotal) ? (overall.grade || row.overallgrade || "") : "-";
      row.gradepoint = number(row.overalltotal) ? number(overall.gradepoint, row.gradepoint) : 0;
      row.overallgradepoints = Number((number(row.credit) * number(row.gradepoint)).toFixed(2));
      await row.save();
      updated += 1;
    }
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.marksheet = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, ...filters(req.query, ["academicyear", "regulation", "program", "programcode", "semester", "regno", "examcode"]) };
    const rows = await McaMarksheet.find(query).sort({ coursecode: 1, course: 1 }).lean();
    const first = rows[0] || {};
    const student = await User.findOne({ colid, role: /^Student$/i, $or: [{ regno: first.regno || req.query.regno }, { name: first.student || req.query.student }] }).select("name regno abcid photo program programcode regulation semester academicyear").lean();
    const moocQuery = {
      colid,
      academicyear: first.academicyear || req.query.academicyear,
      programcode: first.programcode || req.query.programcode,
      semester: first.semester || req.query.semester
    };
    if (first.regno || req.query.regno) moocQuery.regno = first.regno || req.query.regno;
    const mooc = await MoocStudent.find(moocQuery).sort({ valueaddedcourse: 1 }).lean();
    const creditsOffered = rows.reduce((sum, row) => sum + number(row.credit), 0);
    const creditsEarned = rows.reduce((sum, row) => /^(f|fail|ab)$/i.test(text(row.overallgrade)) ? sum : sum + number(row.credit), 0);
    const gradePointsEarned = rows.reduce((sum, row) => /^(f|fail|ab)$/i.test(text(row.overallgrade)) ? sum : sum + number(row.overallgradepoints, number(row.credit) * number(row.gradepoint)), 0);
    const spi = creditsEarned ? gradePointsEarned / creditsEarned : 0;
    const result = rows.some((row) => /^(f|fail|ab)$/i.test(text(row.overallgrade))) ? "Promoted" : "Pass";
    const selectedClassId = text(req.query.classconfigurationid);
    const selectedClassProgram = text(req.query.classconfigurationprogram);
    const selectedClassRule = selectedClassId && mongoose.Types.ObjectId.isValid(selectedClassId)
      ? await ClassConfiguration.findOne({ _id: selectedClassId, colid }).lean()
      : null;
    const classProgramFilter = selectedClassProgram
      ? { program: new RegExp(`^${escapeRegex(selectedClassProgram)}$`, "i") }
      : { academicyear: first.academicyear || req.query.academicyear, programcode: first.programcode || req.query.programcode };
    const autoClassRule = result === "Pass" ? await ClassConfiguration.findOne({
      colid,
      ...classProgramFilter,
      fromsgpa: { $lte: spi },
      tosgpa: { $gte: spi }
    }).sort({ fromsgpa: -1 }).lean() : null;
    const classRule = selectedClassRule || autoClassRule;
    res.json({
      success: true,
      rows,
      student,
      mooc,
      institution: await institution(colid),
      summary: {
        creditsOffered,
        creditsEarned,
        gradePointsEarned: Number(gradePointsEarned.toFixed(2)),
        spi: Number(spi.toFixed(2)),
        result,
        classassigned: result === "Promoted" ? "Promoted" : classRule?.classassigned || "",
        classconfigurationid: classRule?._id || "",
        classconfigurationprogram: selectedClassProgram || classRule?.program || ""
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const mcaVerificationUrl = (origin, { colid, regno, hash }) => {
  const params = new URLSearchParams({ colid: String(colid), regno: text(regno), hash: text(hash) });
  return `${origin}/verify-mca-marksheet?${params.toString()}`;
};

exports.storeMarksheetBlockchain = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const regno = text(req.body.regno);
    if (colid === undefined || !regno) return res.status(400).json({ success: false, message: "colid and regno are required" });
    const mockReq = { query: { ...req.body, colid, regno } };
    let payload;
    await new Promise((resolve, reject) => {
      const mockRes = {
        status: (code) => ({ json: (data) => reject(new Error(data.message || `Failed with ${code}`)) }),
        json: (data) => {
          payload = data;
          resolve();
        }
      };
      exports.marksheet(mockReq, mockRes);
    });
    if (!(payload?.rows || []).length) return res.status(404).json({ success: false, message: "No MCA marksheet rows found for blockchain storage" });
    const first = payload.rows[0] || {};
    const block = await appendBlock({
      colid,
      modelname: "mcamarksheet",
      collectionname: "mcamarksheetds",
      recordid: `${regno}-${text(req.body.academicyear || first.academicyear)}-${text(req.body.examcode || first.examcode)}-${text(req.body.semester || first.semester)}`,
      action: "MCA_MARKSHEET",
      payload,
      metadata: {
        regno,
        academicyear: req.body.academicyear || first.academicyear,
        examcode: req.body.examcode || first.examcode,
        semester: req.body.semester || first.semester
      },
      user: req.body.user
    });
    const statementno = String(block._id || block.hash);
    await McaMarksheet.updateMany(
      { _id: { $in: (payload.rows || []).map((row) => row._id).filter(Boolean) }, colid },
      { $set: { statementno, blockchainhash: block.hash, blockchainrecordid: statementno } }
    );
    const origin = text(req.body.origin) || "";
    const verificationurl = origin ? mcaVerificationUrl(origin, { colid, regno, hash: block.hash }) : "";
    res.json({ success: true, message: "MCA marksheet stored in blockchain", data: { ...block.toObject(), statementno, verificationurl } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
