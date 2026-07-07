const RegulationCourseMap = require("../Models/regulationcoursemapds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsTimetable = require("../Models/neplmstimetableds");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniqueSorted = (values) => Array.from(new Set(values.map(text).filter(Boolean)))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const filterFields = ["academicyear", "regulation", "program", "programcode", "semester", "type", "subject"];

const buildQuery = (source = {}) => {
  const colid = number(source.colid);
  if (colid === undefined) return { error: "colid is required" };
  const query = { colid };
  filterFields.forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  return { colid, query };
};

const courseKey = (row = {}) => [
  row.academicyear,
  row.regulation,
  row.programcode,
  row.semester,
  row.coursecode
].map(text).join("||");

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
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [courseRows, workloadRows] = await Promise.all([
      RegulationCourseMap.find({ colid }).select(filterFields.join(" ")).lean(),
      WorkloadAssignment.find({ colid }).select(filterFields.join(" ")).lean()
    ]);
    const combined = [...courseRows, ...workloadRows];
    res.json({
      success: true,
      options: Object.fromEntries(filterFields.map((field) => [field, uniqueSorted(combined.map((item) => item[field]))]))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load missing timetable options" });
  }
};

exports.report = async (req, res) => {
  try {
    const built = buildQuery(req.query);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const { query } = built;

    const [courseMapRows, workloadRows, timetableRows] = await Promise.all([
      RegulationCourseMap.find(query).sort({ semester: 1, course: 1 }).lean(),
      WorkloadAssignment.find({ ...query, status: { $ne: "Inactive" } }).sort({ semester: 1, course: 1, facultyname: 1 }).lean(),
      NepLmsTimetable.find(query).sort({ classdate: 1, classtime: 1 }).lean()
    ]);

    const courseSource = courseMapRows.length ? courseMapRows : workloadRows;
    const workloadByKey = new Map();
    workloadRows.forEach((row) => {
      const key = courseKey(row);
      const item = workloadByKey.get(key) || [];
      item.push(row);
      workloadByKey.set(key, item);
    });

    const timetableByKey = new Map();
    timetableRows.forEach((row) => {
      const key = courseKey(row);
      const item = timetableByKey.get(key) || [];
      item.push(row);
      timetableByKey.set(key, item);
    });

    const seen = new Set();
    const details = [];
    courseSource.forEach((course) => {
      const key = courseKey(course);
      if (seen.has(key)) return;
      seen.add(key);
      const workload = workloadByKey.get(key) || [];
      const timetable = timetableByKey.get(key) || [];
      const facultyNames = uniqueSorted(workload.map((row) => row.facultyname || row.faculty));
      const facultyEmails = uniqueSorted(workload.map((row) => row.facultyemail));
      const classDates = uniqueSorted(timetable.map((row) => row.classdate));
      details.push({
        id: key,
        academicyear: course.academicyear || "",
        regulation: course.regulation || "",
        program: course.program || "",
        programcode: course.programcode || "",
        semester: course.semester || "",
        type: course.type || "",
        subject: course.subject || course.major || "",
        course: course.course || "",
        coursecode: course.coursecode || "",
        coursetype: course.coursetype || "",
        facultycount: facultyEmails.length,
        facultyname: facultyNames.join(", "),
        facultyemail: facultyEmails.join(", "),
        timetableclasses: timetable.length,
        firstclassdate: classDates[0] || "",
        lastclassdate: classDates[classDates.length - 1] || "",
        status: timetable.length ? "Uploaded" : "Missing",
        facultyuploadstatus: facultyEmails.length ? "Faculty assigned" : "Faculty not assigned"
      });
    });

    const uploadedRows = details.filter((row) => row.status === "Uploaded");
    const missingRows = details.filter((row) => row.status === "Missing");
    const facultyAssignedRows = details.filter((row) => row.facultycount > 0);

    res.json({
      success: true,
      summary: {
        totalCourses: details.length,
        uploadedCourses: uploadedRows.length,
        missingCourses: missingRows.length,
        facultyAssignedCourses: facultyAssignedRows.length,
        facultyMissingCourses: details.length - facultyAssignedRows.length,
        timetableClasses: timetableRows.length,
        facultyCount: uniqueSorted(workloadRows.map((row) => row.facultyemail)).length,
        uploadPercentage: details.length ? Number(((uploadedRows.length / details.length) * 100).toFixed(2)) : 0
      },
      charts: {
        status: [
          { name: "Uploaded", count: uploadedRows.length },
          { name: "Missing", count: missingRows.length }
        ],
        facultyStatus: [
          { name: "Faculty assigned", count: facultyAssignedRows.length },
          { name: "Faculty not assigned", count: details.length - facultyAssignedRows.length }
        ],
        missingBySemester: groupCount(missingRows, "semester"),
        uploadedBySemester: groupCount(uploadedRows, "semester"),
        classesByCourse: details
          .filter((row) => row.timetableclasses > 0)
          .sort((a, b) => Number(b.timetableclasses || 0) - Number(a.timetableclasses || 0))
          .slice(0, 20)
          .map((row) => ({ name: row.coursecode || row.course, count: row.timetableclasses }))
      },
      data: details.sort((a, b) => a.status.localeCompare(b.status) || String(a.semester).localeCompare(String(b.semester), undefined, { numeric: true }) || String(a.course).localeCompare(String(b.course)))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load missing timetable report" });
  }
};
