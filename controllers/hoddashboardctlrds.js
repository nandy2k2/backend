const User = require("../Models/user");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const ConductExamCourse = require("../Models/conductexamcourseds");
const NepLmsQuiz = require("../Models/neplmsquizds");
const NepLmsLiveQuiz = require("../Models/neplmslivequizds");
const NepLmsDescriptiveAssessment = require("../Models/neplmsdescriptiveassessmentds");
const NepLmsResource = require("../Models/neplmsresourceds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const NepLmsFinalMarks = require("../Models/neplmsfinalmarksds");
const NepLmsRemedial = require("../Models/neplmsremedialds");
const NepLmsLessonContent = require("../Models/neplmslessoncontentds");
const NepLmsLessonContentProgress = require("../Models/neplmslessoncontentprogressds");
const CasNewEntry = require("../Models/casnewentryds");
const FeedbackAdvancedResponse = require("../Models/feedbackadvancedresponseds");

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
const escRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueSorted = (values) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const groupCount = (rows, key, label = "name") => {
  const map = new Map();
  rows.forEach((row) => {
    const value = text(typeof key === "function" ? key(row) : row[key]) || "Not specified";
    map.set(value, (map.get(value) || 0) + 1);
  });
  return [...map.entries()].map(([name, count]) => ({ [label]: name, count }))
    .sort((a, b) => String(a[label]).localeCompare(String(b[label]), undefined, { numeric: true }));
};

const groupAverage = (rows, key, valueKey) => {
  const map = new Map();
  rows.forEach((row) => {
    const name = text(typeof key === "function" ? key(row) : row[key]) || "Not specified";
    const item = map.get(name) || { name, total: 0, count: 0, average: 0 };
    item.total += num(typeof valueKey === "function" ? valueKey(row) : row[valueKey]);
    item.count += 1;
    item.average = item.count ? Number((item.total / item.count).toFixed(2)) : 0;
    map.set(name, item);
  });
  return [...map.values()].sort((a, b) => b.average - a.average);
};

const baseQuery = (req) => {
  const colid = toNumber(req.query.colid);
  if (colid === undefined) return { error: "colid is required" };
  const query = { colid };
  ["academicyear", "program", "programcode", "regulation", "semester"].forEach((field) => {
    const value = text(req.query[field]);
    if (value) query[field] = value;
  });
  return { colid, query };
};

const compact = (rows, fields) => rows.map((row) => {
  const item = {};
  fields.forEach((field) => {
    item[field] = row[field] ?? "";
  });
  item.id = String(row._id || `${Math.random()}`);
  return item;
});

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [workloads, courses, faculty] = await Promise.all([
      WorkloadAssignment.find({ colid }).select("academicyear regulation program programcode semester facultyname facultyemail").lean(),
      RegulationCourseMap.find({ colid }).select("academicyear regulation program programcode semester").lean(),
      User.find({ colid, role: { $not: /^student$/i } }).select("name email user department role").lean()
    ]);
    const combined = [...workloads, ...courses];
    res.json({
      success: true,
      academicyears: uniqueSorted(combined.map((item) => item.academicyear)).reverse(),
      regulations: uniqueSorted(combined.map((item) => item.regulation)),
      programs: uniqueSorted(combined.map((item) => item.program)),
      programcodes: uniqueSorted(combined.map((item) => item.programcode)),
      semesters: uniqueSorted(combined.map((item) => item.semester)),
      faculty: faculty
        .map((item) => ({
          name: item.name || item.email || item.user || "",
          email: item.email || item.user || "",
          department: item.department || "",
          role: item.role || ""
        }))
        .filter((item) => item.email || item.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load HoD dashboard options" });
  }
};

exports.summary = async (req, res) => {
  try {
    const built = baseQuery(req);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const { colid, query } = built;
    const academicYear = text(query.academicyear);
    const facultyEmail = text(req.query.facultyemail);
    const facultyClause = facultyEmail ? { facultyemail: { $regex: `^${escRegex(facultyEmail)}$`, $options: "i" } } : {};

    const [
      courseMap,
      workloads,
      examCourses,
      quizzes,
      liveQuizzes,
      assessments,
      assignments,
      timetable,
      attendance,
      finalMarks,
      remedials,
      lessonContents,
      lessonProgress,
      casRows,
      feedbackRows
    ] = await Promise.all([
      RegulationCourseMap.find(query).lean(),
      WorkloadAssignment.find({ ...query, ...facultyClause, status: { $ne: "Inactive" } }).lean(),
      ConductExamCourse.find(query).lean(),
      NepLmsQuiz.find({ ...query, ...facultyClause }).lean(),
      NepLmsLiveQuiz.find({ ...query, ...facultyClause }).lean(),
      NepLmsDescriptiveAssessment.find({ ...query, ...facultyClause }).lean(),
      NepLmsResource.find({ ...query, ...facultyClause, resourcetype: "Assignment" }).lean(),
      NepLmsTimetable.find({ ...query, ...facultyClause }).lean(),
      NepLmsAttendance.find({ ...query, ...facultyClause }).lean(),
      NepLmsFinalMarks.find(query).lean(),
      NepLmsRemedial.find(query).lean(),
      NepLmsLessonContent.find({ ...query, ...facultyClause }).lean(),
      NepLmsLessonContentProgress.find(query).lean(),
      CasNewEntry.find({ colid, ...(academicYear ? { academicyear: academicYear } : {}), ...(facultyEmail ? { facultyemail: { $regex: `^${escRegex(facultyEmail)}$`, $options: "i" } } : {}) }).lean(),
      FeedbackAdvancedResponse.find({ colid, ...(academicYear ? { academicyear: academicYear } : {}) }).lean()
    ]);

    const quizRows = [...quizzes.map((item) => ({ ...item, quiztype: "Quiz" })), ...liveQuizzes.map((item) => ({ ...item, quiztype: "Live Quiz" }))];
    const completedClasses = timetable.filter((item) => text(item.workcompleted)).length;
    const attendanceTotal = attendance.length;
    const attendancePresent = attendance.filter((item) => Number(item.attendance) === 1).length;
    const lessonCompletion = lessonContents.length
      ? Number(((new Set(lessonProgress.filter((item) => item.completed !== false).map((item) => String(item.contentid))).size / lessonContents.length) * 100).toFixed(2))
      : 0;

    const marksByExamCourse = finalMarks.map((item) => ({
      exam: `${item.semester || ""} ${item.course || item.coursecode || ""}`.trim() || "Marks",
      program: item.program || "",
      programcode: item.programcode || "",
      course: item.course || "",
      coursecode: item.coursecode || "",
      semester: item.semester || "",
      student: item.student || "",
      regno: item.regno || "",
      total: num(item.total),
      passstatus: item.passstatus || ""
    }));
    const studentProgression = groupAverage(marksByExamCourse, (row) => row.exam, "total");
    const passFail = [
      { name: "Pass", count: finalMarks.filter((item) => /^pass$/i.test(item.passstatus || "")).length },
      { name: "Fail", count: finalMarks.filter((item) => /^fail$/i.test(item.passstatus || "")).length }
    ];

    const casFaculty = groupAverage(casRows, "facultyname", (row) => num(row.scoreapproved || row.scoreclaimed));
    const casSection = groupAverage(casRows, "section", (row) => num(row.scoreapproved || row.scoreclaimed));
    const feedbackAnswerRows = [];
    feedbackRows.forEach((response) => {
      (response.answers || []).forEach((answer) => {
        if (answer.score !== undefined && answer.score !== null && answer.score !== "") {
          feedbackAnswerRows.push({
            formtitle: response.formtitle || "Feedback",
            question: answer.question || "",
            score: num(answer.score)
          });
        }
      });
    });
    const feedbackScores = groupAverage(feedbackAnswerRows, "formtitle", "score");

    const facultyPerformance = workloads.map((workload) => {
      const courseAttendance = attendance.filter((item) => item.coursecode === workload.coursecode && item.facultyemail === workload.facultyemail);
      const coursePresent = courseAttendance.filter((item) => Number(item.attendance) === 1).length;
      const classesForCourse = timetable.filter((item) => item.coursecode === workload.coursecode && item.facultyemail === workload.facultyemail);
      const done = classesForCourse.filter((item) => text(item.workcompleted)).length;
      return {
        faculty: workload.facultyname || "",
        facultyemail: workload.facultyemail || "",
        program: workload.program || "",
        programcode: workload.programcode || "",
        course: workload.course || "",
        coursecode: workload.coursecode || "",
        semester: workload.semester || "",
        classes: classesForCourse.length,
        classesCompleted: done,
        lessonCompletion: classesForCourse.length ? Number(((done / classesForCourse.length) * 100).toFixed(2)) : 0,
        attendancePercentage: courseAttendance.length ? Number(((coursePresent / courseAttendance.length) * 100).toFixed(2)) : 0
      };
    });

    res.json({
      success: true,
      filters: req.query,
      summary: {
        courses: courseMap.length || uniqueSorted(workloads.map((item) => item.coursecode)).length,
        faculty: uniqueSorted(workloads.map((item) => item.facultyemail)).length,
        exams: uniqueSorted(examCourses.map((item) => item.examcode || item.exam)).length,
        examPapers: examCourses.length,
        quizzes: quizRows.length,
        assessments: assessments.length,
        assignments: assignments.length,
        remedialItems: remedials.length,
        lessonCompletion,
        classesScheduled: timetable.length,
        classesConducted: completedClasses,
        attendancePercentage: attendanceTotal ? Number(((attendancePresent / attendanceTotal) * 100).toFixed(2)) : 0,
        casAverage: casRows.length ? Number((casRows.reduce((sum, item) => sum + num(item.scoreapproved || item.scoreclaimed), 0) / casRows.length).toFixed(2)) : 0,
        feedbackAverage: feedbackAnswerRows.length ? Number((feedbackAnswerRows.reduce((sum, item) => sum + item.score, 0) / feedbackAnswerRows.length).toFixed(2)) : 0
      },
      charts: {
        coursesBySemester: groupCount(courseMap.length ? courseMap : workloads, "semester", "name"),
        examsByProgram: groupCount(examCourses, "program", "name"),
        quizzesByCourse: groupCount(quizRows, "course", "name"),
        assessmentsByCourse: groupCount(assessments, "course", "name"),
        assignmentsByCourse: groupCount(assignments, "course", "name"),
        remedialByCourse: groupCount(remedials, "course", "name"),
        studentProgression,
        passFail,
        casFaculty,
        casSection,
        feedbackScores,
        facultyPerformance
      },
      tables: {
        facultyPerformance: facultyPerformance.slice(0, 100),
        remedials: compact(remedials.slice(0, 100), ["student", "regno", "program", "programcode", "course", "coursecode", "topic", "percentage", "contenttype", "status"]),
        examCourses: compact(examCourses.slice(0, 100), ["exam", "examcode", "program", "programcode", "course", "coursecode", "semester", "examdate", "examslot"]),
        casRows: compact(casRows.slice(0, 100), ["facultyname", "facultyemail", "section", "group", "item", "title", "scoreclaimed", "scoreapproved", "approvalstatus"]),
        feedbackRows: feedbackScores
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load HoD dashboard" });
  }
};

exports.drilldown = async (req, res) => {
  try {
    const built = baseQuery(req);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const { query, colid } = built;
    const type = text(req.query.type);
    const academicYear = text(query.academicyear);
    const facultyEmail = text(req.query.facultyemail);
    const facultyClause = facultyEmail ? { facultyemail: { $regex: `^${escRegex(facultyEmail)}$`, $options: "i" } } : {};
    let rows = [];

    if (type === "courses") rows = await RegulationCourseMap.find(query).lean();
    else if (type === "faculty") rows = await WorkloadAssignment.find({ ...query, ...facultyClause }).lean();
    else if (type === "exams") rows = await ConductExamCourse.find(query).lean();
    else if (type === "quizzes") rows = [...await NepLmsQuiz.find({ ...query, ...facultyClause }).lean(), ...await NepLmsLiveQuiz.find({ ...query, ...facultyClause }).lean()];
    else if (type === "assessments") rows = await NepLmsDescriptiveAssessment.find({ ...query, ...facultyClause }).lean();
    else if (type === "assignments") rows = await NepLmsResource.find({ ...query, ...facultyClause, resourcetype: "Assignment" }).lean();
    else if (type === "remedial") rows = await NepLmsRemedial.find(query).lean();
    else if (type === "classes") rows = await NepLmsTimetable.find({ ...query, ...facultyClause }).lean();
    else if (type === "attendance") rows = await NepLmsAttendance.find({ ...query, ...facultyClause }).lean();
    else if (type === "marks") rows = await NepLmsFinalMarks.find(query).lean();
    else if (type === "cas") rows = await CasNewEntry.find({ colid, ...(academicYear ? { academicyear: academicYear } : {}), ...(facultyEmail ? { facultyemail: { $regex: `^${escRegex(facultyEmail)}$`, $options: "i" } } : {}) }).lean();
    else if (type === "feedback") rows = await FeedbackAdvancedResponse.find({ colid, ...(academicYear ? { academicyear: academicYear } : {}) }).lean();
    else rows = await WorkloadAssignment.find(query).lean();

    res.json({ success: true, type, data: rows.slice(0, 1000).map((row) => ({ ...row, id: String(row._id) })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load drilldown" });
  }
};
