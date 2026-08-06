const ConductExamRoll = require("../Models/conductexamrollds");
const ExamVivaMarks = require("../Models/examinationmodel2vivamarksds");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const parseMulti = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value)
    .split(",")
    .map(text)
    .filter(Boolean)
    .filter((item) => item.toLowerCase() !== "all");
};
const yes = (value) => ["yes", "y", "1", "true", "present"].includes(text(value).toLowerCase());
const fail = (value) => text(value).toLowerCase() === "fail" || text(value).toUpperCase() === "F";

const filterFields = ["program", "programcode", "exam", "examcode", "regulation", "semester"];
const getInstitution = (colid) => Institution.findOne({ colid }).sort({ _id: -1 }).lean();

const buildQuery = (source = {}) => {
  const colid = toNumber(source.colid);
  if (colid === undefined) return { error: "colid is required" };
  const query = { colid };
  const years = parseMulti(source.academicyear);
  if (years.length) query.academicyear = { $in: years };
  filterFields.forEach((field) => {
    const values = parseMulti(source[field]);
    if (values.length) query[field] = { $in: values };
  });
  return { colid, query };
};

const makeKey = (row) => [
  text(row.academicyear),
  text(row.programcode),
  text(row.program),
  text(row.examcode),
  text(row.exam)
].join("||");

const initBucket = (row = {}) => ({
  id: makeKey(row),
  academicyear: text(row.academicyear),
  program: text(row.program),
  programcode: text(row.programcode),
  exam: text(row.exam),
  examcode: text(row.examcode),
  applied: 0,
  admiteligible: 0,
  appeared: 0,
  passed: 0,
  failed: 0,
  marksentered: 0,
  distinctStudents: new Set(),
  appearedStudents: new Set(),
  passedStudents: new Set(),
  failedStudents: new Set()
});

const cleanBucket = (bucket) => {
  const applied = num(bucket.applied);
  const appeared = num(bucket.appeared);
  const marksentered = num(bucket.marksentered);
  const passed = num(bucket.passed);
  const failed = num(bucket.failed);
  return {
    id: bucket.id,
    academicyear: bucket.academicyear,
    program: bucket.program,
    programcode: bucket.programcode,
    exam: bucket.exam,
    examcode: bucket.examcode,
    applied,
    admiteligible: num(bucket.admiteligible),
    appeared,
    passed,
    failed,
    marksentered,
    pendingAppearance: Math.max(applied - appeared, 0),
    pendingResult: Math.max(appeared - marksentered, 0),
    passPercent: marksentered ? Number(((passed / marksentered) * 100).toFixed(2)) : 0,
    failPercent: marksentered ? Number(((failed / marksentered) * 100).toFixed(2)) : 0,
    appearancePercent: applied ? Number(((appeared / applied) * 100).toFixed(2)) : 0,
    distinctStudents: bucket.distinctStudents.size,
    appearedStudents: bucket.appearedStudents.size,
    passedStudents: bucket.passedStudents.size,
    failedStudents: bucket.failedStudents.size
  };
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [rolls, marks] = await Promise.all([
      ConductExamRoll.find({ colid }).select("academicyear regulation exam examcode program programcode semester").lean(),
      ExamVivaMarks.find({ colid }).select("academicyear regulation exam examcode program programcode semester").lean()
    ]);
    const rows = [...rolls, ...marks];
    res.json({
      success: true,
      options: {
        academicyears: uniqueSorted(rows.map((row) => row.academicyear)).reverse(),
        regulations: uniqueSorted(rows.map((row) => row.regulation)),
        exams: uniqueSorted(rows.map((row) => row.exam)),
        examcodes: uniqueSorted(rows.map((row) => row.examcode)),
        programs: uniqueSorted(rows.map((row) => row.program)),
        programcodes: uniqueSorted(rows.map((row) => row.programcode)),
        semesters: uniqueSorted(rows.map((row) => row.semester))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load exam dashboard options" });
  }
};

exports.summary = async (req, res) => {
  try {
    const built = buildQuery(req.query);
    if (built.error) return res.status(400).json({ success: false, message: built.error });

    const [rollRows, markRows, institution] = await Promise.all([
      ConductExamRoll.find(built.query).lean(),
      ExamVivaMarks.find(built.query).lean(),
      getInstitution(built.colid)
    ]);

    const map = new Map();
    const ensure = (row) => {
      const key = makeKey(row);
      if (!map.has(key)) map.set(key, initBucket(row));
      return map.get(key);
    };

    rollRows.forEach((row) => {
      const bucket = ensure(row);
      const regno = text(row.regno);
      if (regno) bucket.distinctStudents.add(regno);
      if (yes(row.applied) || !text(row.applied)) bucket.applied += 1;
      if (yes(row.admitcardeligible)) bucket.admiteligible += 1;
      if (yes(row.attended)) {
        bucket.appeared += 1;
        if (regno) bucket.appearedStudents.add(regno);
      }
    });

    markRows.forEach((row) => {
      const bucket = ensure(row);
      const regno = text(row.regno);
      bucket.marksentered += 1;
      if (fail(row.status) || fail(row.overallgrade) || fail(row.theorystatus) || fail(row.practicalstatus)) {
        bucket.failed += 1;
        if (regno) bucket.failedStudents.add(regno);
      } else {
        bucket.passed += 1;
        if (regno) bucket.passedStudents.add(regno);
      }
      if (regno) bucket.distinctStudents.add(regno);
    });

    const table = [...map.values()]
      .map(cleanBucket)
      .sort((a, b) => a.academicyear.localeCompare(b.academicyear, undefined, { numeric: true }) || a.programcode.localeCompare(b.programcode, undefined, { numeric: true }) || a.examcode.localeCompare(b.examcode, undefined, { numeric: true }));

    const totals = table.reduce((acc, row) => {
      ["applied", "admiteligible", "appeared", "passed", "failed", "marksentered", "pendingAppearance", "pendingResult"].forEach((field) => { acc[field] += num(row[field]); });
      return acc;
    }, { applied: 0, admiteligible: 0, appeared: 0, passed: 0, failed: 0, marksentered: 0, pendingAppearance: 0, pendingResult: 0 });

    const cards = [
      { key: "applied", label: "Applied", value: totals.applied, tone: "#2563eb" },
      { key: "admiteligible", label: "Admit Eligible", value: totals.admiteligible, tone: "#7c3aed" },
      { key: "appeared", label: "Appeared", value: totals.appeared, tone: "#0891b2" },
      { key: "passed", label: "Passed", value: totals.passed, tone: "#16a34a" },
      { key: "failed", label: "Failed", value: totals.failed, tone: "#dc2626" },
      { key: "passPercent", label: "Pass %", value: totals.marksentered ? Number(((totals.passed / totals.marksentered) * 100).toFixed(2)) : 0, suffix: "%", tone: "#ea580c" }
    ];

    const programMap = new Map();
    table.forEach((row) => {
      const label = `${row.programcode || "No code"}${row.program ? ` - ${row.program}` : ""}`;
      const item = programMap.get(label) || { label, applied: 0, admiteligible: 0, appeared: 0, passed: 0, failed: 0 };
      ["applied", "admiteligible", "appeared", "passed", "failed"].forEach((field) => { item[field] += num(row[field]); });
      programMap.set(label, item);
    });
    const programwise = [...programMap.values()].sort((a, b) => b.applied - a.applied);

    const yearMap = new Map();
    table.forEach((row) => {
      const item = yearMap.get(row.academicyear) || { label: row.academicyear || "No year", applied: 0, appeared: 0, passed: 0, failed: 0 };
      ["applied", "appeared", "passed", "failed"].forEach((field) => { item[field] += num(row[field]); });
      yearMap.set(row.academicyear, item);
    });

    res.json({
      success: true,
      data: {
        cards,
        totals,
        charts: {
          programwise,
          yearwise: [...yearMap.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
          passFail: [
            { label: "Passed", count: totals.passed },
            { label: "Failed", count: totals.failed }
          ],
          appliedAppeared: [
            { label: "Applied", count: totals.applied },
            { label: "Admit Eligible", count: totals.admiteligible },
            { label: "Appeared", count: totals.appeared }
          ]
        },
        table,
        institution: institution || {}
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load exam dashboard" });
  }
};

const makeStudentKey = (row) => [
  text(row.academicyear),
  text(row.programcode),
  text(row.program),
  text(row.examcode),
  text(row.exam),
  text(row.regno)
].join("||");

exports.summaryStudentwise = async (req, res) => {
  try {
    const built = buildQuery(req.query);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const failRule = text(req.query.failrule || "any").toLowerCase() === "all" ? "all" : "any";

    const [rollRows, markRows, institution] = await Promise.all([
      ConductExamRoll.find(built.query).lean(),
      ExamVivaMarks.find(built.query).lean(),
      getInstitution(built.colid)
    ]);

    const studentMap = new Map();
    const ensureStudent = (row) => {
      const key = makeStudentKey(row);
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          key,
          academicyear: text(row.academicyear),
          program: text(row.program),
          programcode: text(row.programcode),
          exam: text(row.exam),
          examcode: text(row.examcode),
          student: text(row.student),
          regno: text(row.regno),
          applied: false,
          admiteligible: false,
          appeared: false,
          marksentered: 0,
          failedSubjects: 0
        });
      }
      const item = studentMap.get(key);
      if (!item.student && row.student) item.student = text(row.student);
      return item;
    };

    rollRows.forEach((row) => {
      const item = ensureStudent(row);
      if (yes(row.applied) || !text(row.applied)) item.applied = true;
      if (yes(row.admitcardeligible)) item.admiteligible = true;
      if (yes(row.attended)) item.appeared = true;
    });

    markRows.forEach((row) => {
      const item = ensureStudent(row);
      item.marksentered += 1;
      if (fail(row.status) || fail(row.overallgrade) || fail(row.theorystatus) || fail(row.practicalstatus)) {
        item.failedSubjects += 1;
      }
    });

    const bucketMap = new Map();
    const ensureBucket = (row) => {
      const key = [
        text(row.academicyear),
        text(row.programcode),
        text(row.program),
        text(row.examcode),
        text(row.exam)
      ].join("||");
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          id: key,
          academicyear: text(row.academicyear),
          program: text(row.program),
          programcode: text(row.programcode),
          exam: text(row.exam),
          examcode: text(row.examcode),
          applied: 0,
          admiteligible: 0,
          appeared: 0,
          passed: 0,
          failed: 0,
          marksentered: 0,
          distinctStudents: 0
        });
      }
      return bucketMap.get(key);
    };

    [...studentMap.values()].forEach((student) => {
      const bucket = ensureBucket(student);
      bucket.distinctStudents += 1;
      if (student.applied) bucket.applied += 1;
      if (student.admiteligible) bucket.admiteligible += 1;
      if (student.appeared) bucket.appeared += 1;
      if (student.marksentered > 0) {
        bucket.marksentered += 1;
        const isFailed = failRule === "all"
          ? student.failedSubjects > 0 && student.failedSubjects === student.marksentered
          : student.failedSubjects > 0;
        if (isFailed) bucket.failed += 1;
        else bucket.passed += 1;
      }
    });

    const table = [...bucketMap.values()]
      .map((row) => ({
        ...row,
        pendingAppearance: Math.max(num(row.applied) - num(row.appeared), 0),
        pendingResult: Math.max(num(row.appeared) - num(row.marksentered), 0),
        passPercent: row.marksentered ? Number(((row.passed / row.marksentered) * 100).toFixed(2)) : 0,
        failPercent: row.marksentered ? Number(((row.failed / row.marksentered) * 100).toFixed(2)) : 0,
        appearancePercent: row.applied ? Number(((row.appeared / row.applied) * 100).toFixed(2)) : 0
      }))
      .sort((a, b) => a.academicyear.localeCompare(b.academicyear, undefined, { numeric: true }) || a.programcode.localeCompare(b.programcode, undefined, { numeric: true }) || a.examcode.localeCompare(b.examcode, undefined, { numeric: true }));

    const totals = table.reduce((acc, row) => {
      ["applied", "admiteligible", "appeared", "passed", "failed", "marksentered", "pendingAppearance", "pendingResult", "distinctStudents"].forEach((field) => { acc[field] += num(row[field]); });
      return acc;
    }, { applied: 0, admiteligible: 0, appeared: 0, passed: 0, failed: 0, marksentered: 0, pendingAppearance: 0, pendingResult: 0, distinctStudents: 0 });

    const cards = [
      { key: "distinctStudents", label: "Students", value: totals.distinctStudents, tone: "#2563eb" },
      { key: "admiteligible", label: "Admit Eligible", value: totals.admiteligible, tone: "#7c3aed" },
      { key: "appeared", label: "Appeared", value: totals.appeared, tone: "#0891b2" },
      { key: "passed", label: "Passed", value: totals.passed, tone: "#16a34a" },
      { key: "failed", label: "Failed", value: totals.failed, tone: "#dc2626" },
      { key: "passPercent", label: "Pass %", value: totals.marksentered ? Number(((totals.passed / totals.marksentered) * 100).toFixed(2)) : 0, suffix: "%", tone: "#ea580c" }
    ];

    const programMap = new Map();
    table.forEach((row) => {
      const label = `${row.programcode || "No code"}${row.program ? ` - ${row.program}` : ""}`;
      const item = programMap.get(label) || { label, applied: 0, admiteligible: 0, appeared: 0, passed: 0, failed: 0 };
      ["applied", "admiteligible", "appeared", "passed", "failed"].forEach((field) => { item[field] += num(row[field]); });
      programMap.set(label, item);
    });

    const yearMap = new Map();
    table.forEach((row) => {
      const item = yearMap.get(row.academicyear) || { label: row.academicyear || "No year", applied: 0, appeared: 0, passed: 0, failed: 0 };
      ["applied", "appeared", "passed", "failed"].forEach((field) => { item[field] += num(row[field]); });
      yearMap.set(row.academicyear, item);
    });

    res.json({
      success: true,
      data: {
        cards,
        totals,
        failRule,
        charts: {
          programwise: [...programMap.values()].sort((a, b) => b.applied - a.applied),
          yearwise: [...yearMap.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
          passFail: [
            { label: "Passed", count: totals.passed },
            { label: "Failed", count: totals.failed }
          ],
          appliedAppeared: [
            { label: "Applied", count: totals.applied },
            { label: "Admit Eligible", count: totals.admiteligible },
            { label: "Appeared", count: totals.appeared }
          ]
        },
        table,
        institution: institution || {}
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load studentwise exam dashboard" });
  }
};
