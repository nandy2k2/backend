const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const User = require("../Models/user");
const InsDetails = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniqueSorted = (values = []) => Array.from(new Set(values.map(text).filter(Boolean)))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const filterFields = ["academicyear", "regulation", "program", "programcode"];
const studentSubjectFields = {
  Major: "Major",
  major: "Major",
  MAJOR: "Major",
  Minor: "Minor",
  minor: "Minor",
  MINOR: "Minor",
  AEC: "AEC",
  aec: "AEC",
  SEC: "SEC",
  sec: "SEC",
  VAC: "VAC",
  vac: "VAC",
  IDC: "IDC",
  idc: "IDC",
  MDC: "MDC",
  mdc: "MDC"
};

const monthLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Not dated";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const addFilterFields = (query, source = {}, fields = filterFields) => {
  fields.forEach((field) => {
    const value = text(source[field]);
    if (value) query[field] = value;
  });
  return query;
};

const studentQueryFor = (row = {}, includeSection = false) => {
  const query = {
    colid: row.colid,
    role: /^student$/i,
    excluded: { $ne: "Yes" },
    academicyear: row.academicyear,
    regulation: row.regulation,
    programcode: row.programcode,
    semester: row.semester
  };
  if (text(row.program)) query.program = text(row.program);
  const subjectField = studentSubjectFields[text(row.type)] || studentSubjectFields[text(row.type).toUpperCase()];
  if (subjectField && text(row.subject || row.major)) query[subjectField] = text(row.subject || row.major);
  if (includeSection && text(row.section)) query.section = text(row.section);
  return query;
};

const courseKey = (row = {}) => [
  row.academicyear,
  row.regulation,
  row.programcode,
  row.type,
  row.subject || row.major,
  row.semester,
  row.coursecode,
  row.facultyemail
].map(text).join("||");

const workloadTimetableKey = (row = {}) => [
  row.academicyear,
  row.regulation,
  row.programcode,
  row.subject || row.major,
  row.semester,
  row.coursecode,
  row.facultyemail
].map(text).join("||");

const timetableCourseKey = (row = {}) => [
  row.academicyear,
  row.regulation,
  row.programcode,
  row.major || row.subject,
  row.semester,
  row.coursecode,
  row.facultyemail
].map(text).join("||");

const groupCount = (rows = [], getter) => {
  const map = new Map();
  rows.forEach((row) => {
    const name = text(typeof getter === "function" ? getter(row) : row[getter]) || "Not specified";
    const item = map.get(name) || { name, count: 0, ready: 0, notready: 0 };
    item.count += 1;
    if (row.ready) item.ready += 1;
    else item.notready += 1;
    map.set(name, item);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const same = (left, right) => text(left).toLowerCase() === text(right).toLowerCase();

const studentMatches = (student = {}, row = {}, includeSection = false) => {
  if (!same(student.academicyear, row.academicyear)) return false;
  if (!same(student.regulation, row.regulation)) return false;
  if (!same(student.programcode, row.programcode)) return false;
  if (text(row.program) && !same(student.program, row.program)) return false;
  if (!same(student.semester, row.semester)) return false;
  const subjectField = studentSubjectFields[text(row.type)] || studentSubjectFields[text(row.type).toUpperCase()];
  if (subjectField && text(row.subject || row.major) && !same(student[subjectField], row.subject || row.major)) return false;
  if (includeSection && text(row.section) && !same(student.section, row.section)) return false;
  return true;
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = addFilterFields({ colid }, req.query);
    const rows = await WorkloadAssignment.find(query).select(filterFields.join(" ")).lean();
    res.json({
      success: true,
      options: Object.fromEntries(filterFields.map((field) => [field, uniqueSorted(rows.map((row) => row[field]))]))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load LMS doctor options" });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = addFilterFields({ colid, status: { $not: /^inactive$/i } }, req.query);
    if (!query.academicyear || !query.regulation || !query.programcode) {
      return res.status(400).json({ success: false, message: "Academic year, regulation and program code are required" });
    }

    const timetableQuery = addFilterFields({ colid, status: { $not: /^inactive$/i } }, req.query);
    const studentQuery = {
      colid,
      role: /^student$/i,
      excluded: { $ne: "Yes" },
      academicyear: query.academicyear,
      regulation: query.regulation,
      programcode: query.programcode
    };
    if (query.program) studentQuery.program = query.program;

    const [workloads, timetableRows, students, institution] = await Promise.all([
      WorkloadAssignment.find(query).sort({ facultyname: 1, semester: 1, course: 1 }).lean(),
      NepLmsTimetable.find(timetableQuery).sort({ faculty: 1, course: 1, classdate: 1, section: 1 }).lean(),
      User.find(studentQuery)
        .select("academicyear regulation program programcode semester section role excluded Major Minor AEC SEC VAC IDC MDC")
        .lean(),
      InsDetails.findOne({ colid }).sort({ _id: -1 }).lean()
    ]);

    const timetableByKey = new Map();
    timetableRows.forEach((row) => {
      const key = timetableCourseKey(row);
      const items = timetableByKey.get(key) || [];
      items.push(row);
      timetableByKey.set(key, items);
    });

    const details = [];
    const timetableDetails = [];
    const facultyMap = new Map();

    for (const workload of workloads) {
      const base = {
        ...workload,
        colid,
        subject: workload.subject || workload.major
      };
      const matchingTimetable = timetableByKey.get(workloadTimetableKey(base)) || timetableRows.filter((row) => (
        text(row.academicyear) === text(base.academicyear)
        && text(row.regulation) === text(base.regulation)
        && text(row.programcode) === text(base.programcode)
        && text(row.semester) === text(base.semester)
        && text(row.coursecode) === text(base.coursecode)
        && text(row.facultyemail).toLowerCase() === text(base.facultyemail).toLowerCase()
        && (!text(row.major) || !text(base.subject) || text(row.major) === text(base.subject))
      ));
      const studentCount = students.filter((student) => studentMatches(student, base)).length;

      const sectionMonthMap = new Map();
      matchingTimetable.forEach((row) => {
        const section = text(row.section) || "No section";
        const month = monthLabel(row.classdate);
        const key = `${section}||${month}`;
        const item = sectionMonthMap.get(key) || { section, month, classcount: 0, row };
        item.classcount += 1;
        sectionMonthMap.set(key, item);
      });

      const sectionMonthRows = [];
      for (const item of sectionMonthMap.values()) {
        const count = students.filter((student) => studentMatches(student, { ...base, section: item.section }, item.section !== "No section")).length;
        const row = {
          id: `${courseKey(base)}||${item.section}||${item.month}`,
          facultyname: base.facultyname,
          facultyemail: base.facultyemail,
          academicyear: base.academicyear,
          regulation: base.regulation,
          program: base.program,
          programcode: base.programcode,
          type: base.type,
          subject: base.subject,
          semester: base.semester,
          section: item.section,
          month: item.month,
          course: base.course,
          coursecode: base.coursecode,
          classcount: item.classcount,
          studentcount: count,
          status: count > 0 ? "Ready" : "No students",
          ready: count > 0
        };
        sectionMonthRows.push(row);
        timetableDetails.push(row);
      }

      const timetableReady = matchingTimetable.length > 0 && sectionMonthRows.length > 0 && sectionMonthRows.every((row) => row.studentcount > 0);
      const studentMappingReady = studentCount > 0;
      const ready = studentMappingReady && timetableReady;
      const detail = {
        id: courseKey(base),
        facultyname: base.facultyname,
        facultyemail: base.facultyemail,
        academicyear: base.academicyear,
        regulation: base.regulation,
        program: base.program,
        programcode: base.programcode,
        type: base.type,
        subject: base.subject,
        semester: base.semester,
        course: base.course,
        coursecode: base.coursecode,
        coursetype: base.coursetype,
        workloadstudentcount: studentCount,
        timetableclasscount: matchingTimetable.length,
        timetablegroups: sectionMonthRows.length,
        workloadstatus: studentMappingReady ? "Ready" : "No students",
        timetablestatus: timetableReady ? "Ready" : matchingTimetable.length ? "Section/month mismatch" : "No timetable",
        ready,
        remarks: [
          studentMappingReady ? "" : "No students match workload academic/program/semester/subject",
          timetableReady ? "" : matchingTimetable.length ? "One or more section/month timetable groups has no matching students" : "No timetable entry found"
        ].filter(Boolean).join("; ") || "Ready"
      };
      details.push(detail);

      const facultyKey = text(base.facultyemail).toLowerCase() || text(base.facultyname);
      const faculty = facultyMap.get(facultyKey) || {
        id: facultyKey,
        facultyname: base.facultyname,
        facultyemail: base.facultyemail,
        coursecount: 0,
        readycourses: 0,
        notreadycourses: 0,
        workloadreadycourses: 0,
        workloaddriftcourses: 0,
        timetablereadycourses: 0,
        timetabledriftcourses: 0,
        courses: []
      };
      faculty.coursecount += 1;
      if (ready) faculty.readycourses += 1;
      else faculty.notreadycourses += 1;
      if (studentMappingReady) faculty.workloadreadycourses += 1;
      else faculty.workloaddriftcourses += 1;
      if (timetableReady) faculty.timetablereadycourses += 1;
      else faculty.timetabledriftcourses += 1;
      faculty.courses.push(`${base.coursecode} - ${base.course}`);
      facultyMap.set(facultyKey, faculty);
    }

    const facultySummary = Array.from(facultyMap.values()).map((row) => ({
      ...row,
      courses: uniqueSorted(row.courses).join(", "),
      readinesspercent: row.coursecount ? Number(((row.readycourses / row.coursecount) * 100).toFixed(2)) : 0
    })).sort((a, b) => b.notreadycourses - a.notreadycourses || a.facultyname.localeCompare(b.facultyname));

    const readyCourses = details.filter((row) => row.ready).length;
    const workloadReady = details.filter((row) => row.workloadstatus === "Ready").length;
    const timetableReady = details.filter((row) => row.timetablestatus === "Ready").length;
    res.json({
      success: true,
      institution,
      summary: {
        totalFaculty: facultySummary.length,
        totalCourses: details.length,
        readyCourses,
        notReadyCourses: details.length - readyCourses,
        workloadReady,
        workloadNotReady: details.length - workloadReady,
        timetableReady,
        timetableNotReady: details.length - timetableReady,
        timetableClasses: timetableRows.length,
        sectionMonthChecks: timetableDetails.length
      },
      charts: {
        courseReadiness: [
          { name: "Ready", count: readyCourses },
          { name: "Not ready", count: details.length - readyCourses }
        ],
        workloadReadiness: [
          { name: "Student mapping ready", count: workloadReady },
          { name: "Student mapping pending", count: details.length - workloadReady }
        ],
        timetableReadiness: [
          { name: "Timetable ready", count: timetableReady },
          { name: "Timetable pending", count: details.length - timetableReady }
        ],
        facultywise: facultySummary.map((row) => ({ name: row.facultyname || row.facultyemail, ready: row.readycourses, notready: row.notreadycourses })),
        semesterwise: groupCount(details, "semester")
      },
      facultySummary,
      courseDetails: details,
      timetableDetails
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to run LMS doctor" });
  }
};
