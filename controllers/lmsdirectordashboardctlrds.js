const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");

const text = (value) => String(value ?? "").trim();
const toNumber = (value) => {
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

const filterFields = ["program", "programcode", "semester", "facultyemail"];
const classKey = (row = {}) => text(row.classid || row._id) || [
  row.academicyear,
  row.programcode,
  row.semester,
  row.section,
  row.coursecode,
  row.facultyemail,
  row.classdate,
  row.classtime
].map(text).join("|");

const dateClause = (fromdate, todate) => {
  const clause = {};
  if (text(fromdate)) clause.$gte = text(fromdate);
  if (text(todate)) clause.$lte = text(todate);
  return Object.keys(clause).length ? { classdate: clause } : {};
};

const buildQuery = (req) => {
  const colid = toNumber(req.query.colid);
  if (colid === undefined) return { error: "colid is required" };
  const query = { colid, ...dateClause(req.query.fromdate, req.query.todate) };
  const academicyear = text(req.query.academicyear);
  if (academicyear) query.academicyear = academicyear;
  filterFields.forEach((field) => {
    const values = parseMulti(req.query[field]);
    if (values.length) query[field] = { $in: values };
  });
  return { query, colid };
};

const groupScheduledConducted = (timetableRows, attendanceRows, fields) => {
  const map = new Map();
  const conductedKeys = new Set(attendanceRows.map(classKey));
  timetableRows.forEach((row) => {
    const label = fields.map((field) => text(row[field]) || "Not specified").join(" / ");
    const item = map.get(label) || fields.reduce((acc, field) => ({ ...acc, [field]: text(row[field]) || "Not specified" }), {
      id: label,
      label,
      scheduledKeys: new Set(),
      conductedKeys: new Set()
    });
    const key = classKey(row);
    item.scheduledKeys.add(key);
    if (conductedKeys.has(key)) item.conductedKeys.add(key);
    map.set(label, item);
  });
  attendanceRows.forEach((row) => {
    const label = fields.map((field) => text(row[field]) || "Not specified").join(" / ");
    const item = map.get(label) || fields.reduce((acc, field) => ({ ...acc, [field]: text(row[field]) || "Not specified" }), {
      id: label,
      label,
      scheduledKeys: new Set(),
      conductedKeys: new Set()
    });
    item.conductedKeys.add(classKey(row));
    map.set(label, item);
  });
  return [...map.values()].map((row) => {
    const scheduled = row.scheduledKeys.size;
    const conducted = row.conductedKeys.size;
    return {
      ...fields.reduce((acc, field) => ({ ...acc, [field]: row[field] }), {}),
      id: row.id,
      label: row.label,
      scheduled,
      conducted,
      percentage: scheduled ? Number(((conducted / scheduled) * 100).toFixed(1)) : 0,
      statuscolor: scheduled && (conducted / scheduled) < 0.9 ? "red" : "green"
    };
  }).sort((a, b) => b.scheduled - a.scheduled);
};

const facultyRows = (timetableRows, attendanceRows) => groupScheduledConducted(timetableRows, attendanceRows, ["faculty", "facultyemail"])
  .map((row, index) => ({ id: row.facultyemail || row.id || String(index), ...row }));

const buildStudentAttendance = (attendanceRows) => {
  const map = new Map();
  attendanceRows.forEach((row) => {
    const key = [row.regno, row.studentemail, row.programcode, row.semester].map(text).join("|");
    const item = map.get(key) || {
      id: key,
      student: row.student || "",
      regno: row.regno || "",
      rollno: row.rollno || "",
      studentemail: row.studentemail || "",
      program: row.program || "",
      programcode: row.programcode || "",
      semester: row.semester || "",
      section: row.section || "",
      total: 0,
      present: 0
    };
    item.total += 1;
    item.present += Number(row.attendance) === 1 ? 1 : 0;
    map.set(key, item);
  });
  return [...map.values()].map((row) => ({
    ...row,
    absent: row.total - row.present,
    attendancepercentage: row.total ? Number(((row.present / row.total) * 100).toFixed(1)) : 0
  })).sort((a, b) => a.attendancepercentage - b.attendancepercentage || String(a.student).localeCompare(String(b.student)));
};

const histogram = (studentRows) => {
  const bins = [
    { label: "0-49", min: 0, max: 49.999, count: 0 },
    { label: "50-59", min: 50, max: 59.999, count: 0 },
    { label: "60-69", min: 60, max: 69.999, count: 0 },
    { label: "70-79", min: 70, max: 79.999, count: 0 },
    { label: "80-89", min: 80, max: 89.999, count: 0 },
    { label: "90-100", min: 90, max: 100, count: 0 }
  ];
  studentRows.forEach((row) => {
    const pct = Number(row.attendancepercentage || 0);
    const bin = bins.find((item) => pct >= item.min && pct <= item.max) || bins[0];
    bin.count += 1;
  });
  return bins;
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [timetable, attendance] = await Promise.all([
      NepLmsTimetable.find({ colid }).select("academicyear program programcode semester faculty facultyemail").lean(),
      NepLmsAttendance.find({ colid }).select("academicyear program programcode semester faculty facultyemail").lean()
    ]);
    const rows = [...timetable, ...attendance];
    res.json({
      success: true,
      options: {
        academicyears: uniqueSorted(rows.map((row) => row.academicyear)).reverse(),
        programs: uniqueSorted(rows.map((row) => row.program)),
        programcodes: uniqueSorted(rows.map((row) => row.programcode)),
        semesters: uniqueSorted(rows.map((row) => row.semester)),
        faculties: uniqueSorted(rows.map((row) => row.faculty).filter(Boolean)),
        facultyemails: uniqueSorted(rows.map((row) => row.facultyemail))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load LMS director dashboard options" });
  }
};

exports.summary = async (req, res) => {
  try {
    const built = buildQuery(req);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const [timetableRows, attendanceRows] = await Promise.all([
      NepLmsTimetable.find(built.query).lean(),
      NepLmsAttendance.find(built.query).lean()
    ]);
    const scheduledKeys = new Set(timetableRows.map(classKey));
    const conductedKeys = new Set(attendanceRows.map(classKey));
    const conductedMatched = [...conductedKeys].filter((key) => scheduledKeys.has(key)).length || conductedKeys.size;
    const students = buildStudentAttendance(attendanceRows);
    const lowFaculty = facultyRows(timetableRows, attendanceRows).filter((row) => row.scheduled && row.percentage < 90).length;

    res.json({
      success: true,
      data: {
        cards: [
          { key: "scheduled", label: "Classes Scheduled", value: scheduledKeys.size, tone: "#2563eb" },
          { key: "conducted", label: "Classes Conducted", value: conductedMatched, tone: "#16a34a" },
          { key: "coverage", label: "Conducted %", value: scheduledKeys.size ? Number(((conductedMatched / scheduledKeys.size) * 100).toFixed(1)) : 0, suffix: "%", tone: "#0891b2" },
          { key: "students", label: "Students Tracked", value: students.length, tone: "#7c3aed" },
          { key: "lowfaculty", label: "Faculty Below 90%", value: lowFaculty, tone: "#dc2626" }
        ],
        charts: {
          programSemester: groupScheduledConducted(timetableRows, attendanceRows, ["programcode", "semester"]).slice(0, 24),
          programwise: groupScheduledConducted(timetableRows, attendanceRows, ["programcode"]).slice(0, 16),
          semesterwise: groupScheduledConducted(timetableRows, attendanceRows, ["semester"]).slice(0, 12),
          facultywise: facultyRows(timetableRows, attendanceRows).slice(0, 30),
          attendanceHistogram: histogram(students)
        },
        tables: {
          faculty: facultyRows(timetableRows, attendanceRows),
          students
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load LMS director dashboard" });
  }
};
