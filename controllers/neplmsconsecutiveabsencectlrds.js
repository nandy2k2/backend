const NepLmsAttendance = require("../Models/neplmsattendanceds");
const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const dateKey = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};
const dayNumber = (value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 86400000);
};
const uniqueSorted = (values) => Array.from(new Set(values.map(text).filter(Boolean)))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const filterFields = ["academicyear", "regulation", "program", "programcode", "semester", "major", "course", "coursecode", "faculty", "facultyemail"];

const buildQuery = (source = {}) => {
  const colid = number(source.colid, undefined);
  if (colid === undefined) return { error: "colid is required" };
  const query = { colid };
  filterFields.forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  const from = dateKey(source.fromdate);
  const to = dateKey(source.todate);
  if (from || to) {
    query.classdate = {};
    if (from) query.classdate.$gte = from;
    if (to) query.classdate.$lte = to;
  }
  return { colid, query };
};

const groupCount = (rows, key) => {
  const map = new Map();
  rows.forEach((row) => {
    const name = text(typeof key === "function" ? key(row) : row[key]) || "Not specified";
    const item = map.get(name) || { name, count: 0 };
    item.count += 1;
    map.set(name, item);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const pairs = await Promise.all(filterFields.map(async (field) => {
      const values = await NepLmsAttendance.distinct(field, { colid });
      return [field, uniqueSorted(values)];
    }));
    res.json({ success: true, options: Object.fromEntries(pairs) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load consecutive absence options" });
  }
};

exports.report = async (req, res) => {
  try {
    const built = buildQuery(req.query);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const threshold = Math.max(1, number(req.query.days, 7));

    const attendanceRows = await NepLmsAttendance.find(built.query)
      .select("student studentemail studentphone regno program programcode academicyear semester major faculty facultyemail course coursecode classdate classtime attendance type comments")
      .sort({ regno: 1, classdate: 1, classtime: 1 })
      .limit(50000)
      .lean();

    const regnos = uniqueSorted(attendanceRows.map((row) => row.regno));
    const users = await User.find({ colid: built.colid, role: /^Student$/i, regno: { $in: regnos } })
      .select("name email phone regno academicyear admissionyear program programcode regulation Major Minor semester section category gender department photo")
      .lean();
    const userByRegno = new Map(users.map((user) => [text(user.regno), user]));

    const daily = new Map();
    attendanceRows.forEach((row) => {
      const regno = text(row.regno || row.studentemail || row.student);
      const day = dateKey(row.classdate);
      if (!regno || !day) return;
      const key = `${regno}||${day}`;
      const item = daily.get(key) || {
        regno,
        date: day,
        student: row.student || "",
        studentemail: row.studentemail || "",
        studentphone: row.studentphone || "",
        program: row.program || "",
        programcode: row.programcode || "",
        academicyear: row.academicyear || "",
        semester: row.semester || "",
        major: row.major || "",
        present: 0,
        absent: 0,
        courses: new Set(),
        coursecodes: new Set(),
        faculty: new Set()
      };
      if (Number(row.attendance) === 1) item.present += 1;
      else item.absent += 1;
      if (row.course) item.courses.add(row.course);
      if (row.coursecode) item.coursecodes.add(row.coursecode);
      if (row.faculty) item.faculty.add(row.faculty);
      daily.set(key, item);
    });

    const byStudent = new Map();
    Array.from(daily.values()).forEach((day) => {
      const student = byStudent.get(day.regno) || {
        regno: day.regno,
        name: day.student,
        email: day.studentemail,
        phone: day.studentphone,
        program: day.program,
        programcode: day.programcode,
        academicyear: day.academicyear,
        semester: day.semester,
        major: day.major,
        absentDays: [],
        presentDays: 0,
        absentEntries: 0,
        presentEntries: 0,
        courses: new Set(),
        coursecodes: new Set(),
        faculty: new Set()
      };
      if (day.present === 0 && day.absent > 0) {
        student.absentDays.push(day.date);
      } else if (day.present > 0) {
        student.presentDays += 1;
      }
      student.absentEntries += day.absent;
      student.presentEntries += day.present;
      day.courses.forEach((value) => student.courses.add(value));
      day.coursecodes.forEach((value) => student.coursecodes.add(value));
      day.faculty.forEach((value) => student.faculty.add(value));
      byStudent.set(day.regno, student);
    });

    const resultRows = [];
    byStudent.forEach((student) => {
      const absentDays = uniqueSorted(student.absentDays);
      let current = [];
      let best = [];
      const streaks = [];
      absentDays.forEach((day) => {
        if (!current.length || dayNumber(day) - dayNumber(current[current.length - 1]) === 1) {
          current.push(day);
        } else {
          streaks.push(current);
          if (current.length > best.length) best = current;
          current = [day];
        }
      });
      if (current.length) {
        streaks.push(current);
        if (current.length > best.length) best = current;
      }
      const qualifying = streaks.filter((streak) => streak.length >= threshold);
      if (!qualifying.length) return;
      const user = userByRegno.get(student.regno) || {};
      const longest = qualifying.sort((a, b) => b.length - a.length)[0];
      resultRows.push({
        id: student.regno,
        student: user.name || student.name || "",
        regno: student.regno,
        email: user.email || student.email || "",
        phone: user.phone || student.phone || "",
        academicyear: user.academicyear || student.academicyear || "",
        admissionyear: user.admissionyear || "",
        program: user.program || student.program || "",
        programcode: user.programcode || student.programcode || "",
        regulation: user.regulation || "",
        major: user.Major || student.major || "",
        minor: user.Minor || "",
        semester: user.semester || student.semester || "",
        section: user.section || "",
        category: user.category || "",
        gender: user.gender || "",
        maxConsecutiveAbsentDays: longest.length,
        streakStart: longest[0] || "",
        streakEnd: longest[longest.length - 1] || "",
        totalAbsentDays: absentDays.length,
        totalPresentDays: student.presentDays,
        absentEntries: student.absentEntries,
        presentEntries: student.presentEntries,
        courses: Array.from(student.courses).join(", "),
        coursecodes: Array.from(student.coursecodes).join(", "),
        faculty: Array.from(student.faculty).join(", "),
        absentDates: absentDays.join(", "),
        qualifyingStreaks: qualifying.map((streak) => `${streak[0]} to ${streak[streak.length - 1]} (${streak.length})`).join("; ")
      });
    });

    const summary = {
      threshold,
      attendanceRows: attendanceRows.length,
      studentsChecked: byStudent.size,
      studentsWithConsecutiveAbsence: resultRows.length,
      maxStreak: resultRows.reduce((max, row) => Math.max(max, Number(row.maxConsecutiveAbsentDays || 0)), 0),
      totalAbsentEntries: resultRows.reduce((sum, row) => sum + Number(row.absentEntries || 0), 0)
    };

    const streakBuckets = [
      { name: `${threshold}-${threshold + 2}`, count: 0 },
      { name: `${threshold + 3}-${threshold + 6}`, count: 0 },
      { name: `${threshold + 7}+`, count: 0 }
    ];
    resultRows.forEach((row) => {
      const streak = Number(row.maxConsecutiveAbsentDays || 0);
      if (streak <= threshold + 2) streakBuckets[0].count += 1;
      else if (streak <= threshold + 6) streakBuckets[1].count += 1;
      else streakBuckets[2].count += 1;
    });

    res.json({
      success: true,
      summary,
      charts: {
        byProgram: groupCount(resultRows, (row) => row.program || row.programcode),
        bySemester: groupCount(resultRows, "semester"),
        bySection: groupCount(resultRows, "section"),
        byCategory: groupCount(resultRows, "category"),
        streakBuckets
      },
      data: resultRows.sort((a, b) => Number(b.maxConsecutiveAbsentDays || 0) - Number(a.maxConsecutiveAbsentDays || 0))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load consecutive absence report" });
  }
};
