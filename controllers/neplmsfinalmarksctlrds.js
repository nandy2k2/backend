const NepLmsComponentMarks = require("../Models/neplmscomponentmarksds");
const NepLmsFinalMarks = require("../Models/neplmsfinalmarksds");
const NepLmsAssessmentMarks = require("../Models/neplmsassessmentmarksds");
const GradeConfiguration = require("../Models/gradeconfigurationds");
const RelativeGradingConfiguration = require("../Models/relativegradingconfigurationds");
const ZScoreConfiguration = require("../Models/zscoreconfigurationds");
const User = require("../Models/user");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const ProgramwiseMarksheetConfiguration = require("../Models/programwisemarksheetconfigurationds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const BlockchainLedger = require("../Models/blockchainledgerds");
const { appendBlock } = require("./blockchainledgerctlrds");
const crypto = require("crypto");

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const text = (value) => String(value || "").trim();
const normalizePassStatus = (value) => (text(value).toLowerCase() === "pass" ? "Pass" : "Fail");
const getPassStatusFromGrade = (grade) => (text(grade).toUpperCase() === "F" ? "Fail" : "Pass");
const stableStringify = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const buildBlockchainHash = ({ colid, blockindex, modelname, collectionname, recordid, action, datahash, previoushash, timestamp, user }) => sha256(stableStringify({
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

const defaultMarksheetConfig = {
  programnamedisplay: "Full",
  course: "Yes",
  coursecode: "Yes",
  internal: "Yes",
  external: "Yes",
  total: "Yes",
  grade: "Yes",
  credits: "Yes",
  backlogindicator: "Yes",
  attendance: "No",
  signature: "Yes",
  qrcodeposition: "bottomright",
  watermark: "Original",
  language: "English"
};

const gradeCardVerificationUrl = ({ origin = "", colid, regno, student = "", hash = "" }) => {
  if (!origin) return "";
  const params = new URLSearchParams();
  if (student) params.set("student", student);
  if (regno) params.set("regno", regno);
  if (colid !== undefined) params.set("colid", String(colid));
  if (hash) params.set("hash", hash);
  return `${origin}/verify-grade-card-blockchain?${params.toString()}`;
};

const loadAdvancedGradeCardPayload = async ({ colid, regno, semester }) => {
  const payload = await buildGradeCardPayload({ colid, regno, semester });
  if (!payload.student) return payload;
  const marks = Array.isArray(payload.marks) ? payload.marks : [];
  const courseCodes = marks.map((row) => text(row.coursecode)).filter(Boolean);
  const attendanceRows = courseCodes.length
    ? await NepLmsAttendance.find({ colid, regno, semester, coursecode: { $in: courseCodes } }).lean()
    : [];
  const attendanceMap = new Map();
  attendanceRows.forEach((row) => {
    const key = text(row.coursecode);
    const item = attendanceMap.get(key) || {
      course: row.course || "",
      coursecode: key,
      totalclasses: 0,
      present: 0,
      absent: 0,
      percentage: 0
    };
    item.totalclasses += 1;
    if (Number(row.attendance) === 1) item.present += 1;
    else item.absent += 1;
    item.percentage = item.totalclasses ? Number(((item.present / item.totalclasses) * 100).toFixed(2)) : 0;
    attendanceMap.set(key, item);
  });
  const attendance = marks.map((mark) => {
    const key = text(mark.coursecode);
    return attendanceMap.get(key) || {
      course: mark.course || "",
      coursecode: key,
      totalclasses: 0,
      present: 0,
      absent: 0,
      percentage: 0
    };
  });
  const backlog = (payload.allMarks || []).filter((row) => normalizePassStatus(row.passstatus) === "Fail").map((row) => ({
    academicyear: row.academicyear || "",
    semester: row.semester || "",
    course: row.course || "",
    coursecode: row.coursecode || "",
    total: row.total || 0,
    grade: row.grade || "",
    passstatus: row.passstatus || "Fail"
  }));
  const config = await ProgramwiseMarksheetConfiguration.findOne({
    colid,
    academicyear: payload.student.academicyear || "",
    regulation: payload.student.regulation || "",
    programcode: payload.student.programcode || ""
  }).lean();
  return {
    ...payload,
    attendance,
    backlog,
    marksheetconfiguration: { ...defaultMarksheetConfig, ...(config || {}) }
  };
};

const buildFinalMarkPayload = (source = {}, colid, user = "") => {
  const internalmarks = toNumber(source.internalmarks) || 0;
  const externalmarks = toNumber(source.externalmarks) || 0;
  const total = toNumber(source.total);
  const gradepoint = toNumber(source.gradepoint) || 0;
  const zscore = toNumber(source.zscore) || 0;
  const credits = toNumber(source.credits) || 0;
  const gpa = toNumber(source.gpa);

  return {
    academicyear: text(source.academicyear),
    semester: text(source.semester),
    program: text(source.program),
    programcode: text(source.programcode),
    regulation: text(source.regulation),
    course: text(source.course),
    coursecode: text(source.coursecode),
    major: text(source.major),
    subject: text(source.subject),
    student: text(source.student),
    regno: text(source.regno),
    internalmarks,
    externalmarks,
    total: total !== undefined ? total : Number((internalmarks + externalmarks).toFixed(2)),
    grade: text(source.grade),
    gradepoint,
    zscore,
    credits,
    gpa: gpa !== undefined ? gpa : Number((gradepoint * credits).toFixed(2)),
    passstatus: normalizePassStatus(source.passstatus),
    attempt: toNumber(source.attempt) || 1,
    failmode: text(source.failmode),
    grademode: text(source.grademode),
    colid,
    user
  };
};

const getUgcGrade = (percentage) => {
  if (percentage >= 90) return { grade: "O", gradepoint: 10 };
  if (percentage >= 80) return { grade: "A+", gradepoint: 9 };
  if (percentage >= 70) return { grade: "A", gradepoint: 8 };
  if (percentage >= 60) return { grade: "B+", gradepoint: 7 };
  if (percentage >= 50) return { grade: "B", gradepoint: 6 };
  if (percentage >= 40) return { grade: "C", gradepoint: 5 };
  if (percentage >= 36) return { grade: "P", gradepoint: 4 };
  return { grade: "F", gradepoint: 0 };
};

const buildGradeKey = (row) => [
  row.academicyear,
  row.regulation,
  row.programcode,
  row.subject,
  row.semester,
  row.coursecode
].map((value) => text(value).toLowerCase()).join("||");

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  [
    "academicyear",
    "semester",
    "program",
    "programcode",
    "regulation",
    "course",
    "coursecode",
    "major",
    "subject",
    "student",
    "regno",
    "grade",
    "passstatus",
    "attempt",
    "failmode",
    "grademode"
  ].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

const buildFinalMarksScopeQuery = (source = {}) => {
  const colid = toNumber(source.colid);
  const query = { colid };
  ["academicyear", "regulation", "program", "programcode", "course", "coursecode"].forEach((field) => {
    query[field] = text(source[field]);
  });
  const missing = Object.entries(query)
    .filter(([key, value]) => key !== "colid" && !value)
    .map(([key]) => key);
  return { query, missing, colid };
};

const getFinalMarksRowsForScope = async (source = {}) => {
  const { query, missing, colid } = buildFinalMarksScopeQuery(source);
  if (colid === undefined) {
    const error = new Error("colid is required");
    error.statusCode = 400;
    throw error;
  }
  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
  const marksRows = await NepLmsFinalMarks.find(query).lean();
  if (!marksRows.length) {
    const error = new Error("No final marks found for selected filter");
    error.statusCode = 400;
    throw error;
  }
  return { marksRows, query, colid };
};

exports.processFinalMarks = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const failmode = text(req.body.failmode) || "Any Component";
    const grademode = text(req.body.grademode) || "UGC";

    const query = { colid };
    ["academicyear", "semester", "programcode", "coursecode", "course", "major", "subject", "regno"].forEach((field) => {
      if (req.body[field]) query[field] = req.body[field];
    });

    const componentRows = await NepLmsComponentMarks.find(query).lean();
    if (!componentRows.length) return res.status(400).json({ success: false, message: "No componentwise marks found for processing" });

    const rawQuery = { colid };
    ["academicyear", "semester", "programcode", "coursecode"].forEach((field) => {
      if (query[field]) rawQuery[field] = query[field];
    });
    const rawMarks = await NepLmsAssessmentMarks.find(rawQuery)
      .select("academicyear semester program programcode regulation subject course coursecode regno")
      .lean();
    const rawMap = new Map();
    rawMarks.forEach((item) => {
      const key = [item.academicyear, item.semester, item.programcode, item.coursecode, item.regno]
        .map((value) => text(value).toLowerCase()).join("||");
      if (!rawMap.has(key)) rawMap.set(key, item);
    });

    const gradeRows = await GradeConfiguration.find({ colid, status: "Active" }).lean();
    const gradeMap = new Map();
    gradeRows.forEach((item) => {
      const key = buildGradeKey(item);
      if (!gradeMap.has(key)) gradeMap.set(key, []);
      gradeMap.get(key).push(item);
    });

    const getConfiguredGrade = (row, total) => {
      const configs = gradeMap.get(buildGradeKey(row)) || [];
      const found = configs.find((item) => total >= (Number(item.frompercentage) || 0) && total <= (Number(item.topercentage) || 0));
      if (found) return { grade: text(found.grade), gradepoint: Number(found.gradepoint) || 0 };
      return getUgcGrade(total);
    };

    const groups = new Map();
    componentRows.forEach((row) => {
      const key = [row.academicyear, row.semester, row.programcode, row.coursecode, row.regno]
        .map((value) => text(value)).join("||");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    const ops = [];
    groups.forEach((rows) => {
      const first = rows[0] || {};
      const rawKey = [first.academicyear, first.semester, first.programcode, first.coursecode, first.regno]
        .map((value) => text(value).toLowerCase()).join("||");
      const raw = rawMap.get(rawKey) || {};
      const internalmarks = rows
        .filter((row) => text(row.scoretype).toLowerCase() === "internal")
        .reduce((sum, row) => sum + (Number(row.marks) || 0), 0);
      const externalRows = rows.filter((row) => text(row.scoretype).toLowerCase() === "external");
      const externalmarks = externalRows.reduce((sum, row) => sum + (Number(row.marks) || 0), 0);
      const total = internalmarks + externalmarks;
      const anyComponentFailed = rows.some((row) => row.passstatus === "Fail");
      const externalFailed = externalRows.some((row) => row.passstatus === "Fail");
      const failByExternalOnly = failmode.toLowerCase().includes("external");
      const passstatus = (failByExternalOnly ? externalFailed : anyComponentFailed) ? "Fail" : "Pass";
      const enriched = {
        ...first,
        program: raw.program || first.program || "",
        regulation: raw.regulation || first.regulation || "",
        subject: first.subject || raw.subject || "",
        major: first.major || first.subject || raw.subject || ""
      };
      const gradeInfo = grademode.toLowerCase().includes("configuration")
        ? getConfiguredGrade(enriched, total)
        : getUgcGrade(total);
      const gradepoint = passstatus === "Fail" ? 0 : gradeInfo.gradepoint;
      const credits = rows.map((row) => toNumber(row.credits)).find((value) => value !== undefined) || 0;

      const payload = {
        academicyear: text(first.academicyear),
        semester: text(first.semester),
        program: text(enriched.program),
        programcode: text(first.programcode),
        regulation: text(enriched.regulation),
        course: text(first.course),
        coursecode: text(first.coursecode),
        major: text(enriched.major),
        subject: text(enriched.subject),
        student: text(first.student),
        regno: text(first.regno),
        internalmarks: Number(internalmarks.toFixed(2)),
        externalmarks: Number(externalmarks.toFixed(2)),
        total: Number(total.toFixed(2)),
        grade: passstatus === "Fail" ? "F" : gradeInfo.grade,
        gradepoint,
        zscore: 0,
        credits,
        gpa: Number((gradepoint * credits).toFixed(2)),
        passstatus,
        attempt: 1,
        failmode,
        grademode,
        colid,
        user: text(req.body.user)
      };

      ops.push({
        updateOne: {
          filter: {
            colid,
            academicyear: payload.academicyear,
            semester: payload.semester,
            coursecode: payload.coursecode,
            regno: payload.regno
          },
          update: { $set: payload },
          upsert: true
        }
      });
    });

    let processed = 0;
    if (ops.length) {
      const result = await NepLmsFinalMarks.bulkWrite(ops, { ordered: false });
      processed = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }

    res.json({ success: true, processed });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.getFinalMarks = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const data = await NepLmsFinalMarks.find(query)
      .sort({ academicyear: 1, semester: 1, course: 1, regno: 1 })
      .lean();

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpdateFinalMarksField = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const academicyear = text(req.body.academicyear);
    const programcode = text(req.body.programcode);
    const coursecode = text(req.body.coursecode);
    const field = text(req.body.field).toLowerCase();
    const value = text(req.body.value);
    const allowedFields = ["regulation", "program"];

    const missing = [];
    if (!academicyear) missing.push("academic year");
    if (!programcode) missing.push("program code");
    if (!coursecode) missing.push("course code");
    if (!allowedFields.includes(field)) missing.push("valid field");
    if (!value) missing.push("value");
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(", ")}` });
    }

    const query = { colid, academicyear, programcode, coursecode };
    const result = await NepLmsFinalMarks.updateMany(query, {
      $set: {
        [field]: value,
        user: text(req.body.user)
      }
    });

    res.json({
      success: true,
      message: `${field} updated successfully`,
      matched: result.matchedCount || result.n || 0,
      modified: result.modifiedCount || result.nModified || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUploadFinalMarks = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows received for bulk upload" });

    const user = text(req.body.user);
    const errors = [];
    const ops = [];

    rows.forEach((row, index) => {
      const payload = buildFinalMarkPayload(row, colid, user);
      const missing = ["academicyear", "semester", "coursecode", "regno"].filter((field) => !payload[field]);
      if (missing.length) {
        errors.push({ row: index + 2, message: `Missing required fields: ${missing.join(", ")}` });
        return;
      }

      ops.push({
        updateOne: {
          filter: {
            colid,
            academicyear: payload.academicyear,
            semester: payload.semester,
            coursecode: payload.coursecode,
            regno: payload.regno
          },
          update: { $set: payload },
          upsert: true
        }
      });
    });

    if (!ops.length) {
      return res.status(400).json({ success: false, message: "No valid rows found", errors });
    }

    const result = await NepLmsFinalMarks.bulkWrite(ops, { ordered: false });
    res.json({
      success: true,
      message: `Bulk upload completed. Valid rows: ${ops.length}. Rejected rows: ${errors.length}.`,
      inserted: result.upsertedCount || 0,
      updated: result.modifiedCount || 0,
      matched: result.matchedCount || 0,
      errors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processRelativeGrading = async (req, res) => {
  try {
    const { marksRows, query, colid } = await getFinalMarksRowsForScope(req.body);

    const bandRows = await RelativeGradingConfiguration.find(query).sort({ from: 1 }).lean();
    if (!bandRows.length) {
      return res.status(400).json({ success: false, message: "No relative grading bands found for selected filter" });
    }

    const totals = marksRows.map((row) => Number(row.total)).filter((value) => Number.isFinite(value));
    if (!totals.length) {
      return res.status(400).json({ success: false, message: "No valid total marks found for selected filter" });
    }

    const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;
    const variance = totals.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / totals.length;
    const standardDeviation = Math.sqrt(variance);
    const computedBands = bandRows.map((band) => {
      const lower = mean + ((Number(band.from) || 0) * standardDeviation);
      const upper = mean + ((Number(band.to) || 0) * standardDeviation);
      return {
        lower,
        upper,
        grade: text(band.grade),
        gradepoint: toNumber(band.gradepoint) || 0,
        label: `${Number(band.from) || 0} SD to ${Number(band.to) || 0} SD (${lower.toFixed(2)} - ${upper.toFixed(2)})`
      };
    });

    const ops = marksRows.map((row) => {
      const total = Number(row.total);
      const matchedBand = computedBands.find((band) => total >= band.lower && total <= band.upper);
      const grade = matchedBand?.grade || "F";
      const gradepoint = matchedBand?.gradepoint || 0;
      const credits = Number(row.credits) || 0;
      return {
        updateOne: {
          filter: { _id: row._id, colid },
          update: {
            $set: {
              grade,
              gradepoint,
              gpa: Number((gradepoint * credits).toFixed(2)),
              passstatus: getPassStatusFromGrade(grade),
              grademode: matchedBand?.label || "No matching band",
              zscore: standardDeviation ? Number(((total - mean) / standardDeviation).toFixed(4)) : 0,
              user: text(req.body.user || row.user)
            }
          }
        }
      };
    });

    const result = await NepLmsFinalMarks.bulkWrite(ops, { ordered: false });
    res.json({
      success: true,
      message: "Relative grading processed",
      mean: Number(mean.toFixed(4)),
      standardDeviation: Number(standardDeviation.toFixed(4)),
      updated: (result.modifiedCount || 0) + (result.matchedCount || 0),
      count: marksRows.length,
      bands: computedBands.map((band) => ({
        grade: band.grade,
        gradepoint: band.gradepoint,
        lower: Number(band.lower.toFixed(4)),
        upper: Number(band.upper.toFixed(4)),
        label: band.label
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processAutomaticZScoreGrading = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = {
      colid,
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      course: text(req.body.course),
      coursecode: text(req.body.coursecode)
    };

    const missing = Object.entries(query)
      .filter(([key, value]) => key !== "colid" && !value)
      .map(([key]) => key);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(", ")}` });
    }

    const marksRows = await NepLmsFinalMarks.find(query).lean();
    if (!marksRows.length) {
      return res.status(400).json({ success: false, message: "No final marks found for selected filter" });
    }

    const validRows = marksRows.filter((row) => Number.isFinite(Number(row.total)));
    if (!validRows.length) {
      return res.status(400).json({ success: false, message: "No valid total marks found for selected filter" });
    }

    const totals = validRows.map((row) => Number(row.total));
    const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;
    const variance = totals.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / totals.length;
    const standardDeviation = Math.sqrt(variance);
    const scoredRows = validRows.map((row) => ({
      row,
      zscore: standardDeviation ? Number(((Number(row.total) - mean) / standardDeviation).toFixed(4)) : 0
    }));

    const minZScore = Math.min(...scoredRows.map((item) => item.zscore));
    const maxZScore = Math.max(...scoredRows.map((item) => item.zscore));
    const spread = maxZScore - minZScore;
    const interval = spread ? spread / 8 : 0;
    const gradeScale = [
      { grade: "F", gradepoint: 0 },
      { grade: "P", gradepoint: 4 },
      { grade: "C", gradepoint: 5 },
      { grade: "B", gradepoint: 6 },
      { grade: "B+", gradepoint: 7 },
      { grade: "A", gradepoint: 8 },
      { grade: "A+", gradepoint: 9 },
      { grade: "O", gradepoint: 10 }
    ];
    const bands = gradeScale.map((item, index) => {
      const lower = spread ? minZScore + (interval * index) : minZScore;
      const upper = spread ? (index === gradeScale.length - 1 ? maxZScore : minZScore + (interval * (index + 1))) : maxZScore;
      return {
        ...item,
        lower: Number(lower.toFixed(4)),
        upper: Number(upper.toFixed(4)),
        label: spread
          ? `Z ${lower.toFixed(4)} ${index === gradeScale.length - 1 ? "to" : "to below"} ${upper.toFixed(4)}`
          : "All students have the same z-score"
      };
    });

    const getBand = (zscore) => {
      if (!spread) return bands[bands.length - 1];
      const index = Math.min(gradeScale.length - 1, Math.max(0, Math.floor((zscore - minZScore) / interval)));
      return bands[index];
    };

    const ops = scoredRows.map(({ row, zscore }) => {
      const band = getBand(zscore);
      const credits = Number(row.credits) || 0;
      return {
        updateOne: {
          filter: { _id: row._id, colid },
          update: {
            $set: {
              zscore,
              grade: band.grade,
              gradepoint: band.gradepoint,
              gpa: Number((band.gradepoint * credits).toFixed(2)),
              passstatus: getPassStatusFromGrade(band.grade),
              grademode: band.label,
              user: text(req.body.user || row.user)
            }
          }
        }
      };
    });

    const result = await NepLmsFinalMarks.bulkWrite(ops, { ordered: false });
    res.json({
      success: true,
      message: "Automatic z-score grading processed",
      mean: Number(mean.toFixed(4)),
      standardDeviation: Number(standardDeviation.toFixed(4)),
      minZScore: Number(minZScore.toFixed(4)),
      maxZScore: Number(maxZScore.toFixed(4)),
      spread: Number(spread.toFixed(4)),
      interval: Number(interval.toFixed(4)),
      updated: result.modifiedCount || 0,
      count: scoredRows.length,
      bands
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.processUgcGradeScale = async (req, res) => {
  try {
    const { marksRows, colid } = await getFinalMarksRowsForScope(req.body);
    const validRows = marksRows.filter((row) => Number.isFinite(Number(row.total)));
    if (!validRows.length) {
      return res.status(400).json({ success: false, message: "No valid total marks found for selected filter" });
    }

    const ops = validRows.map((row) => {
      const gradeInfo = getUgcGrade(Number(row.total));
      const credits = Number(row.credits) || 0;
      return {
        updateOne: {
          filter: { _id: row._id, colid },
          update: {
            $set: {
              grade: gradeInfo.grade,
              gradepoint: gradeInfo.gradepoint,
              gpa: Number((gradeInfo.gradepoint * credits).toFixed(2)),
              passstatus: getPassStatusFromGrade(gradeInfo.grade),
              grademode: "UGC grade scale",
              user: text(req.body.user || row.user)
            }
          }
        }
      };
    });

    const result = await NepLmsFinalMarks.bulkWrite(ops, { ordered: false });
    res.json({
      success: true,
      message: "UGC grade scale processed",
      updated: result.modifiedCount || 0,
      count: validRows.length,
      bands: [
        { grade: "O", gradepoint: 10, lower: 90, upper: 100, label: "90 and above" },
        { grade: "A+", gradepoint: 9, lower: 80, upper: 89.99, label: "80 to below 90" },
        { grade: "A", gradepoint: 8, lower: 70, upper: 79.99, label: "70 to below 80" },
        { grade: "B+", gradepoint: 7, lower: 60, upper: 69.99, label: "60 to below 70" },
        { grade: "B", gradepoint: 6, lower: 50, upper: 59.99, label: "50 to below 60" },
        { grade: "C", gradepoint: 5, lower: 40, upper: 49.99, label: "40 to below 50" },
        { grade: "P", gradepoint: 4, lower: 36, upper: 39.99, label: "36 to below 40" },
        { grade: "F", gradepoint: 0, lower: 0, upper: 35.99, label: "Below 36" }
      ]
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.processConfiguredGradeScale = async (req, res) => {
  try {
    const { marksRows, colid } = await getFinalMarksRowsForScope(req.body);
    const validRows = marksRows.filter((row) => Number.isFinite(Number(row.total)));
    if (!validRows.length) {
      return res.status(400).json({ success: false, message: "No valid total marks found for selected filter" });
    }

    const gradeRows = await GradeConfiguration.find({ colid, status: "Active" }).sort({ frompercentage: 1 }).lean();
    if (!gradeRows.length) {
      return res.status(400).json({ success: false, message: "No active grade configuration found" });
    }

    const gradeMap = new Map();
    gradeRows.forEach((item) => {
      const key = buildGradeKey(item);
      if (!gradeMap.has(key)) gradeMap.set(key, []);
      gradeMap.get(key).push(item);
    });

    let noConfigCount = 0;
    const usedBands = new Map();
    const ops = validRows.map((row) => {
      const total = Number(row.total);
      const configs = gradeMap.get(buildGradeKey(row)) || [];
      const found = configs.find((item) => total >= (Number(item.frompercentage) || 0) && total <= (Number(item.topercentage) || 0));
      if (!found) noConfigCount += 1;
      const grade = found ? text(found.grade) : "F";
      const gradepoint = found ? (Number(found.gradepoint) || 0) : 0;
      const credits = Number(row.credits) || 0;
      const label = found
        ? `Configured grade ${Number(found.frompercentage) || 0} to ${Number(found.topercentage) || 0}`
        : "No configured grade band";
      if (found) {
        usedBands.set(`${grade}-${found.frompercentage}-${found.topercentage}`, {
          grade,
          gradepoint,
          lower: Number(found.frompercentage) || 0,
          upper: Number(found.topercentage) || 0,
          label
        });
      }
      return {
        updateOne: {
          filter: { _id: row._id, colid },
          update: {
            $set: {
              grade,
              gradepoint,
              gpa: Number((gradepoint * credits).toFixed(2)),
              passstatus: getPassStatusFromGrade(grade),
              grademode: label,
              user: text(req.body.user || row.user)
            }
          }
        }
      };
    });

    const result = await NepLmsFinalMarks.bulkWrite(ops, { ordered: false });
    res.json({
      success: true,
      message: "Configured grade scale processed",
      updated: result.modifiedCount || 0,
      count: validRows.length,
      noConfigCount,
      bands: [...usedBands.values()]
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.processConfiguredZScoreScale = async (req, res) => {
  try {
    const { marksRows, query, colid } = await getFinalMarksRowsForScope(req.body);
    const validRows = marksRows.filter((row) => Number.isFinite(Number(row.total)));
    if (!validRows.length) {
      return res.status(400).json({ success: false, message: "No valid total marks found for selected filter" });
    }

    const configRows = await ZScoreConfiguration.find(query).sort({ from: 1 }).lean();
    if (!configRows.length) {
      return res.status(400).json({ success: false, message: "No z score configuration found for selected filter" });
    }

    const totals = validRows.map((row) => Number(row.total));
    const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;
    const variance = totals.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / totals.length;
    const standardDeviation = Math.sqrt(variance);
    const scoredRows = validRows.map((row) => ({
      row,
      zscore: standardDeviation ? Number(((Number(row.total) - mean) / standardDeviation).toFixed(4)) : 0
    }));

    const minZScore = Math.min(...scoredRows.map((item) => item.zscore));
    const maxZScore = Math.max(...scoredRows.map((item) => item.zscore));
    const spread = maxZScore - minZScore;
    let noConfigCount = 0;

    const bands = configRows.map((band) => ({
      grade: text(band.grade),
      gradepoint: Number(band.gradepoint) || 0,
      lower: Number(band.from) || 0,
      upper: Number(band.to) || 0,
      label: `Configured z score ${Number(band.from) || 0} to ${Number(band.to) || 0}`
    }));

    const ops = scoredRows.map(({ row, zscore }) => {
      const matchedBand = bands.find((band) => zscore >= band.lower && zscore <= band.upper);
      if (!matchedBand) noConfigCount += 1;
      const grade = matchedBand?.grade || "F";
      const gradepoint = matchedBand?.gradepoint || 0;
      const credits = Number(row.credits) || 0;
      return {
        updateOne: {
          filter: { _id: row._id, colid },
          update: {
            $set: {
              zscore,
              grade,
              gradepoint,
              gpa: Number((gradepoint * credits).toFixed(2)),
              passstatus: getPassStatusFromGrade(grade),
              grademode: matchedBand?.label || "No configured z score band",
              user: text(req.body.user || row.user)
            }
          }
        }
      };
    });

    const result = await NepLmsFinalMarks.bulkWrite(ops, { ordered: false });
    res.json({
      success: true,
      message: "Configured z score scale processed",
      mean: Number(mean.toFixed(4)),
      standardDeviation: Number(standardDeviation.toFixed(4)),
      minZScore: Number(minZScore.toFixed(4)),
      maxZScore: Number(maxZScore.toFixed(4)),
      spread: Number(spread.toFixed(4)),
      updated: result.modifiedCount || 0,
      count: scoredRows.length,
      noConfigCount,
      bands
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.deleteFinalMark = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const id = text(req.body.id || req.body._id);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!id) return res.status(400).json({ success: false, message: "id is required" });

    const deleted = await NepLmsFinalMarks.findOneAndDelete({ _id: id, colid });
    if (!deleted) return res.status(404).json({ success: false, message: "Final marks entry not found" });

    res.json({ success: true, data: deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDeleteFinalMarks = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => text(id)).filter(Boolean) : [];

    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one final marks row" });

    const result = await NepLmsFinalMarks.deleteMany({ colid, _id: { $in: ids } });
    res.json({
      success: true,
      message: "Selected final marks deleted",
      deleted: result.deletedCount || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchGradeCardStudents = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid, role: /^Student$/i };
    const exactFields = ["academicyear", "admissionyear", "program", "programcode", "semester", "section"];
    exactFields.forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });
    if (req.query.major) query.Major = req.query.major;
    if (req.query.minor) query.Minor = req.query.minor;
    ["name", "email", "phone", "regno"].forEach((field) => {
      if (req.query[field]) query[field] = { $regex: text(req.query[field]), $options: "i" };
    });

    const students = await User.find(query)
      .select("name email phone regno rollno academicyear admissionyear program programcode semester section Major Minor category gender regulation colid")
      .sort({ academicyear: 1, programcode: 1, semester: 1, section: 1, name: 1 })
      .limit(500)
      .lean();

    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getGradeCardOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const students = await User.find({ colid, role: /^Student$/i })
      .select("academicyear admissionyear program programcode semester section Major Minor")
      .lean();
    const uniqueSorted = (values) => [...new Set(values.map(text).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    res.json({
      success: true,
      academicyears: uniqueSorted(students.map((item) => item.academicyear)),
      admissionyears: uniqueSorted(students.map((item) => item.admissionyear)),
      programs: uniqueSorted(students.map((item) => item.program)),
      programcodes: uniqueSorted(students.map((item) => item.programcode)),
      semesters: uniqueSorted(students.map((item) => item.semester)),
      sections: uniqueSorted(students.map((item) => item.section)),
      majors: uniqueSorted(students.map((item) => item.Major)),
      minors: uniqueSorted(students.map((item) => item.Minor))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getGradeCard = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const regno = text(req.query.regno);
    const semester = text(req.query.semester);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    if (!semester) return res.status(400).json({ success: false, message: "semester is required" });

    const [student, semesterMarks, allMarks] = await Promise.all([
      User.findOne({ colid, regno }).select("name email phone regno rollno academicyear admissionyear program programcode semester section Major Minor category gender regulation colid").lean(),
      NepLmsFinalMarks.find({ colid, regno, semester }).sort({ course: 1, coursecode: 1 }).lean(),
      NepLmsFinalMarks.find({ colid, regno }).sort({ semester: 1, course: 1 }).lean()
    ]);

    const getSummary = (rows) => {
      const totalCredits = rows.reduce((sum, row) => sum + (Number(row.credits) || 0), 0);
      const totalGpa = rows.reduce((sum, row) => sum + (Number(row.gpa) || 0), 0);
      return {
        totalCredits: Number(totalCredits.toFixed(2)),
        totalGpa: Number(totalGpa.toFixed(2)),
        value: totalCredits ? Number((totalGpa / totalCredits).toFixed(2)) : 0
      };
    };

    const selectedSemesterNumber = Number(semester);
    const cgpaRows = Number.isNaN(selectedSemesterNumber)
      ? allMarks
      : allMarks.filter((row) => {
        const rowSemester = Number(row.semester);
        return !Number.isNaN(rowSemester) && rowSemester <= selectedSemesterNumber;
      });

    res.json({
      success: true,
      student,
      marks: semesterMarks,
      sgpa: getSummary(semesterMarks),
      cgpa: getSummary(cgpaRows),
      allMarks: cgpaRows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const buildGradeCardPayload = async ({ colid, regno, semester }) => {
  const [student, semesterMarks, allMarks] = await Promise.all([
    User.findOne({ colid, regno }).select("name email phone regno rollno academicyear admissionyear program programcode semester section Major Minor category gender regulation colid").lean(),
    NepLmsFinalMarks.find({ colid, regno, semester }).sort({ course: 1, coursecode: 1 }).lean(),
    NepLmsFinalMarks.find({ colid, regno }).sort({ semester: 1, course: 1 }).lean()
  ]);

  const getSummary = (rows) => {
    const totalCredits = rows.reduce((sum, row) => sum + (Number(row.credits) || 0), 0);
    const totalGpa = rows.reduce((sum, row) => sum + (Number(row.gpa) || 0), 0);
    return {
      totalCredits: Number(totalCredits.toFixed(2)),
      totalGpa: Number(totalGpa.toFixed(2)),
      value: totalCredits ? Number((totalGpa / totalCredits).toFixed(2)) : 0
    };
  };

  const selectedSemesterNumber = Number(semester);
  const cgpaRows = Number.isNaN(selectedSemesterNumber)
    ? allMarks
    : allMarks.filter((row) => {
      const rowSemester = Number(row.semester);
      return !Number.isNaN(rowSemester) && rowSemester <= selectedSemesterNumber;
    });

  return {
    student,
    semester,
    marks: semesterMarks,
    sgpa: getSummary(semesterMarks),
    cgpa: getSummary(cgpaRows),
    allMarks: cgpaRows
  };
};

exports.storeGradeCardOnBlockchain = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const regno = text(req.body.regno);
    const semester = text(req.body.semester);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    if (!semester) return res.status(400).json({ success: false, message: "semester is required" });

    const payload = await buildGradeCardPayload({ colid, regno, semester });
    if (!payload.student) return res.status(404).json({ success: false, message: "Student not found" });
    if (!payload.marks.length) return res.status(400).json({ success: false, message: "No final marks found for this semester" });

    const block = await appendBlock({
      colid,
      modelname: "neplmsgradecard",
      collectionname: "neplmsfinalmarksds",
      recordid: `${regno}::${semester}`,
      action: "GRADE_CARD_STORE",
      payload: {
        ...payload,
        storedAt: new Date().toISOString()
      },
      metadata: {
        regno,
        student: payload.student.name || "",
        semester,
        academicyear: payload.student.academicyear || "",
        programcode: payload.student.programcode || ""
      },
      user: text(req.body.user)
    });

    res.json({ success: true, message: "Grade card stored in blockchain", data: block });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdvancedGradeCard = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const regno = text(req.query.regno);
    const semester = text(req.query.semester);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    if (!semester) return res.status(400).json({ success: false, message: "semester is required" });
    const payload = await loadAdvancedGradeCardPayload({ colid, regno, semester });
    if (!payload.student) return res.status(404).json({ success: false, message: "Student not found" });
    res.json({ success: true, ...payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdvancedGradeCardAiOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [gemini, ollama] = await Promise.all([
      AiConfiguration.find({ colid, type: /^gemini$/i, active: /^yes$/i }).select("description default").lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).select("name serveraddress modelname default").lean()
    ]);
    res.json({
      success: true,
      geminiModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"],
      geminiConfigured: gemini.length > 0,
      ollama
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function callGeminiForGradeCard({ colid, model, prompt }) {
  const config = await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();
  if (!config?.apikey) throw new Error("Gemini API key is not configured");
  const selectedModel = text(model) || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini formatting failed");
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
}

async function callOllamaForGradeCard({ colid, ollamaId, prompt }) {
  const config = ollamaId
    ? await OllamaConfiguration.findOne({ _id: ollamaId, colid, active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || await OllamaConfiguration.findOne({ colid, active: /^yes$/i }).sort({ _id: -1 }).lean();
  if (!config?.serveraddress || !config?.modelname) throw new Error("Ollama configuration is not available");
  const response = await fetch(`${config.serveraddress.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ollama formatting failed");
  return data.response || "";
}

const extractHtml = (value = "") => text(value).replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

exports.formatAdvancedGradeCard = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const payload = req.body.gradecard || {};
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.student?.regno) return res.status(400).json({ success: false, message: "grade card data is required" });
    const provider = text(req.body.provider || "Gemini");
    const rules = text(req.body.rules);
    const prompt = `
Create a polished A4 printable marksheet HTML fragment for the following grade card data.
Return only HTML inside one wrapping <div>; no markdown, no script tags.
Use compact professional styling suitable for international academic records.
Follow this programwise marksheet configuration strictly:
${JSON.stringify(payload.marksheetconfiguration || {}, null, 2)}
Additional user rules:
${rules || "Use a clean official university style. Include attendance and backlog sections if data exists."}
Grade card data:
${JSON.stringify(payload, null, 2)}
`;
    const html = /^ollama$/i.test(provider)
      ? await callOllamaForGradeCard({ colid, ollamaId: req.body.ollamaId, prompt })
      : await callGeminiForGradeCard({ colid, model: req.body.geminiModel, prompt });
    res.json({ success: true, html: extractHtml(html) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.storeAdvancedGradeCardOnBlockchain = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const regno = text(req.body.regno);
    const semester = text(req.body.semester);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    if (!semester) return res.status(400).json({ success: false, message: "semester is required" });

    const payload = req.body.gradecard?.student?.regno
      ? req.body.gradecard
      : await loadAdvancedGradeCardPayload({ colid, regno, semester });
    if (!payload.student) return res.status(404).json({ success: false, message: "Student not found" });
    if (!Array.isArray(payload.marks) || !payload.marks.length) return res.status(400).json({ success: false, message: "No final marks found for this semester" });

    const block = await appendBlock({
      colid,
      modelname: "neplmsadvancedgradecard",
      collectionname: "neplmsfinalmarksds",
      recordid: `${regno}::${semester}::advanced`,
      action: "ADVANCED_GRADE_CARD_STORE",
      payload: {
        ...payload,
        formattedHtml: req.body.formattedHtml || payload.formattedHtml || "",
        storedAt: new Date().toISOString()
      },
      metadata: {
        regno,
        student: payload.student.name || "",
        semester,
        academicyear: payload.student.academicyear || "",
        programcode: payload.student.programcode || ""
      },
      user: text(req.body.user)
    });
    const verificationurl = gradeCardVerificationUrl({
      origin: text(req.body.origin),
      colid,
      regno,
      student: payload.student.name || "",
      hash: block.hash
    });
    res.json({ success: true, message: "Advanced grade card stored in blockchain", data: { ...block.toObject(), verificationurl } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyGradeCardFromBlockchain = async (req, res) => {
  try {
    const regno = text(req.query.regno);
    const studentName = text(req.query.student || req.query.name);
    const colid = toNumber(req.query.colid);
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    if (!studentName) return res.status(400).json({ success: false, message: "student name is required" });

    const hash = text(req.query.hash);
    const query = {
      modelname: { $in: ["neplmsgradecard", "neplmsadvancedgradecard"] },
      recordid: { $regex: `^${regno.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}::`, $options: "i" }
    };
    if (colid !== undefined) query.colid = colid;
    if (hash) query.hash = hash;

    const blocks = await BlockchainLedger.find(query).sort({ timestamp: -1 }).lean();
    const matches = [];
    for (const block of blocks) {
      const payloadName = text(block.payload?.student?.name);
      const payloadRegno = text(block.payload?.student?.regno);
      if (payloadRegno.toLowerCase() !== regno.toLowerCase()) continue;
      if (payloadName.toLowerCase() !== studentName.toLowerCase()) continue;

      const previousBlock = block.previoushash === "GENESIS"
        ? null
        : await BlockchainLedger.findOne({ colid: block.colid, blockindex: Number(block.blockindex) - 1 }).lean();
      const expectedPreviousHash = previousBlock ? previousBlock.hash : "GENESIS";
      const expectedDataHash = sha256(stableStringify(block.payload || {}));
      const expectedHash = buildBlockchainHash({
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
      const errors = [];
      if (block.previoushash !== expectedPreviousHash) errors.push("Previous hash mismatch");
      if (block.datahash !== expectedDataHash) errors.push("Payload hash mismatch");
      if (block.hash !== expectedHash) errors.push("Block hash mismatch");

      matches.push({
        blockid: block._id,
        colid: block.colid,
        blockindex: block.blockindex,
        recordid: block.recordid,
        hash: block.hash,
        timestamp: block.timestamp,
        valid: errors.length === 0,
        errors,
        payload: block.payload
      });
    }

    res.json({
      success: true,
      verified: matches.some((item) => item.valid),
      count: matches.length,
      data: matches
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
