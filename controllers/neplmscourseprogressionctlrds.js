const RegulationCourseMap = require("../Models/regulationcoursemapds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const NepLmsQuiz = require("../Models/neplmsquizds");
const NepLmsQuizAttempt = require("../Models/neplmsquizattemptds");
const CourseAssessment = require("../Models/courseassessmentds");
const NepLmsAssessmentMarks = require("../Models/neplmsassessmentmarksds");
const NepLmsComponentMarks = require("../Models/neplmscomponentmarksds");
const NepLmsFinalMarks = require("../Models/neplmsfinalmarksds");
const CourseOutcome = require("../Models/courseoutcomeds");
const NepLmsRemedial = require("../Models/neplmsremedialds");
const HrLeaveApplication = require("../Models/hrleaveapplicationds");
const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniqueSorted = (values) => Array.from(new Set(values.map(text).filter(Boolean)))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const filterFields = ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode"];

const buildQuery = (source = {}) => {
  const colid = number(source.colid);
  if (colid === undefined) return { error: "colid is required" };
  const query = { colid };
  filterFields.forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  return { colid, query };
};

const pct = (part, total) => total ? Number(((Number(part || 0) / Number(total || 0)) * 100).toFixed(2)) : 0;
const compactDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return text(value);
  return d.toISOString().slice(0, 10);
};
const marksBucket = (value) => {
  const n = Math.max(0, Math.min(100, Number(value || 0)));
  const start = Math.floor(n / 10) * 10;
  if (start >= 100) return "100";
  return `${start}-${start + 9}`;
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [courseRows, workloadRows, timetableRows, assessmentRows] = await Promise.all([
      RegulationCourseMap.find({ colid }).select(filterFields.join(" ")).lean(),
      WorkloadAssignment.find({ colid }).select(filterFields.join(" ")).lean(),
      NepLmsTimetable.find({ colid }).select(filterFields.join(" ")).lean(),
      CourseAssessment.find({ colid }).select(filterFields.join(" ")).lean()
    ]);
    const combined = [...courseRows, ...workloadRows, ...timetableRows, ...assessmentRows];
    res.json({
      success: true,
      options: Object.fromEntries(filterFields.map((field) => [field, uniqueSorted(combined.map((item) => item[field]))]))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load course progression options" });
  }
};

exports.report = async (req, res) => {
  try {
    const built = buildQuery(req.query);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const { colid, query } = built;

    const studentQuery = {
      colid,
      role: /^Student$/i,
      ...(query.academicyear ? { academicyear: query.academicyear } : {}),
      ...(query.regulation ? { regulation: query.regulation } : {}),
      ...(query.program ? { program: query.program } : {}),
      ...(query.programcode ? { programcode: query.programcode } : {}),
      ...(query.semester ? { semester: query.semester } : {})
    };

    const [
      courseRows,
      workloadRows,
      timetableRows,
      attendanceRows,
      quizRows,
      quizAttemptRows,
      assessmentRows,
      assessmentMarksRows,
      componentMarksRows,
      finalMarksRows,
      coRows,
      remedialRows,
      students
    ] = await Promise.all([
      RegulationCourseMap.find(query).sort({ semester: 1, course: 1 }).lean(),
      WorkloadAssignment.find({ ...query, status: { $ne: "Inactive" } }).sort({ facultyname: 1 }).lean(),
      NepLmsTimetable.find(query).sort({ classdate: 1, classtime: 1 }).lean(),
      NepLmsAttendance.find(query).lean(),
      NepLmsQuiz.find(query).lean(),
      NepLmsQuizAttempt.find(query).lean(),
      CourseAssessment.find(query).sort({ scoretype: 1, assessmentgroup: 1, assessmentcomponent: 1 }).lean(),
      NepLmsAssessmentMarks.find(query).lean(),
      NepLmsComponentMarks.find(query).lean(),
      NepLmsFinalMarks.find(query).lean(),
      CourseOutcome.find(query).lean(),
      NepLmsRemedial.find(query).lean(),
      User.find(studentQuery).select("name email regno program programcode academicyear semester regulation Major status role").lean()
    ]);

    const facultyEmails = uniqueSorted(workloadRows.map((row) => row.facultyemail || row.faculty));
    const leaveRows = facultyEmails.length
      ? await HrLeaveApplication.find({
        colid,
        employeeemail: { $in: facultyEmails },
        status: /^Approved$/i
      }).lean()
      : [];

    const timetableClassIds = uniqueSorted(timetableRows.map((row) => String(row._id)));
    const markedClassIds = uniqueSorted(attendanceRows.map((row) => String(row.classid)));
    const completedLessons = timetableRows.filter((row) => text(row.workcompleted)).length;
    const presentRows = attendanceRows.filter((row) => Number(row.attendance) === 1).length;
    const activeStudents = students.filter((student) => Number(student.status) !== 0);
    const studentCount = activeStudents.length;
    const totalQuizMarks = quizAttemptRows.reduce((sum, row) => sum + Number(row.obtainedmarks || 0), 0);
    const totalQuizMax = quizAttemptRows.reduce((sum, row) => sum + Number(row.totalmarks || 0), 0);
    const avgQuiz = quizAttemptRows.length ? Number((totalQuizMarks / quizAttemptRows.length).toFixed(2)) : 0;
    const avgAssessment = assessmentMarksRows.length
      ? Number((assessmentMarksRows.reduce((sum, row) => sum + Number(row.effectivemarks || row.marksobtained || 0), 0) / assessmentMarksRows.length).toFixed(2))
      : 0;
    const internalComponents = assessmentRows.filter((row) => /^Internal$/i.test(text(row.scoretype)));
    const enteredInternalComponents = uniqueSorted(assessmentMarksRows.filter((row) => /^Internal$/i.test(text(row.scoretype))).map((row) => `${row.assessmentgroup || ""}||${row.assessmentcomponent || ""}`)).length;
    const expectedAssessmentEntries = assessmentRows.length * studentCount;
    const expectedInternalEntries = internalComponents.length * studentCount;
    const internalEntries = assessmentMarksRows.filter((row) => /^Internal$/i.test(text(row.scoretype))).length;
    const passRows = finalMarksRows.filter((row) => /^Pass$/i.test(text(row.passstatus)));
    const failRows = finalMarksRows.filter((row) => /^Fail$/i.test(text(row.passstatus)));
    const totalLeaveDays = leaveRows.reduce((sum, row) => sum + Number(row.days || 0), 0);

    const histogramMap = new Map();
    finalMarksRows.forEach((row) => {
      const bucket = marksBucket(row.total);
      histogramMap.set(bucket, (histogramMap.get(bucket) || 0) + 1);
    });
    const histogram = Array.from(histogramMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => Number(a.name.split("-")[0]) - Number(b.name.split("-")[0]));

    const detailRows = [
      { id: "lesson", area: "Lesson plan", metric: "Scheduled classes", completed: completedLessons, total: timetableRows.length, pending: Math.max(timetableRows.length - completedLessons, 0), percentage: pct(completedLessons, timetableRows.length), status: completedLessons === timetableRows.length && timetableRows.length ? "Complete" : "Pending" },
      { id: "attendance", area: "Attendance", metric: "Classes marked", completed: markedClassIds.length, total: timetableClassIds.length, pending: Math.max(timetableClassIds.length - markedClassIds.length, 0), percentage: pct(markedClassIds.length, timetableClassIds.length), status: markedClassIds.length === timetableClassIds.length && timetableClassIds.length ? "Complete" : "Pending" },
      { id: "attendance-percentage", area: "Attendance", metric: "Overall attendance percentage", completed: presentRows, total: attendanceRows.length, pending: Math.max(attendanceRows.length - presentRows, 0), percentage: pct(presentRows, attendanceRows.length), status: pct(presentRows, attendanceRows.length) >= 75 ? "Healthy" : "Needs attention" },
      { id: "quiz", area: "Quiz", metric: "Quiz submissions", completed: quizAttemptRows.length, total: quizRows.length * studentCount, pending: Math.max((quizRows.length * studentCount) - quizAttemptRows.length, 0), percentage: pct(quizAttemptRows.length, quizRows.length * studentCount), status: quizAttemptRows.length ? "Started" : "Pending" },
      { id: "assessment", area: "Assessment", metric: "Marks entries", completed: assessmentMarksRows.length, total: expectedAssessmentEntries, pending: Math.max(expectedAssessmentEntries - assessmentMarksRows.length, 0), percentage: pct(assessmentMarksRows.length, expectedAssessmentEntries), status: assessmentMarksRows.length ? "Started" : "Pending" },
      { id: "internal", area: "Internal marks", metric: "Internal marks entries", completed: internalEntries, total: expectedInternalEntries, pending: Math.max(expectedInternalEntries - internalEntries, 0), percentage: pct(internalEntries, expectedInternalEntries), status: internalEntries ? "Started" : "Pending" },
      { id: "co", area: "CO", metric: "Course outcomes defined", completed: coRows.length, total: coRows.length || 1, pending: coRows.length ? 0 : 1, percentage: coRows.length ? 100 : 0, status: coRows.length ? "Defined" : "Missing" },
      { id: "remedial", area: "Remedial", metric: "Remedial records", completed: remedialRows.length, total: remedialRows.length, pending: 0, percentage: remedialRows.length ? 100 : 0, status: remedialRows.length ? "Available" : "No records" }
    ];

    const facultyLeave = facultyEmails.map((email) => {
      const rows = leaveRows.filter((row) => text(row.employeeemail).toLowerCase() === email.toLowerCase());
      return {
        name: rows[0]?.employeename || workloadRows.find((row) => text(row.facultyemail).toLowerCase() === email.toLowerCase())?.facultyname || email,
        email,
        leaves: rows.length,
        days: rows.reduce((sum, row) => sum + Number(row.days || 0), 0)
      };
    });

    const courseSummary = {
      academicyear: query.academicyear || "",
      regulation: query.regulation || "",
      program: query.program || courseRows[0]?.program || workloadRows[0]?.program || "",
      programcode: query.programcode || "",
      semester: query.semester || "",
      course: query.course || courseRows[0]?.course || workloadRows[0]?.course || "",
      coursecode: query.coursecode || "",
      studentCount,
      courseCount: courseRows.length,
      facultyCount: facultyEmails.length,
      scheduledClasses: timetableRows.length,
      completedLessons,
      attendanceMarkedClasses: markedClassIds.length,
      attendancePendingClasses: Math.max(timetableClassIds.length - markedClassIds.length, 0),
      attendancePercentage: pct(presentRows, attendanceRows.length),
      quizCount: quizRows.length,
      quizAttempts: quizAttemptRows.length,
      quizCompletionPercentage: pct(quizAttemptRows.length, quizRows.length * studentCount),
      averageQuizMarks: avgQuiz,
      averageQuizPercentage: pct(totalQuizMarks, totalQuizMax),
      assessmentComponents: assessmentRows.length,
      assessmentMarksEntered: assessmentMarksRows.length,
      assessmentMarksPending: Math.max(expectedAssessmentEntries - assessmentMarksRows.length, 0),
      averageAssessmentMarks: avgAssessment,
      internalComponents: internalComponents.length,
      internalComponentsWithMarks: enteredInternalComponents,
      internalMarksEntries: internalEntries,
      internalMarksPending: Math.max(expectedInternalEntries - internalEntries, 0),
      passCount: passRows.length,
      failCount: failRows.length,
      remedialCount: remedialRows.length,
      coDefined: coRows.length,
      coMissing: coRows.length ? 0 : 1,
      facultyLeaveApplications: leaveRows.length,
      facultyLeaveDays: totalLeaveDays
    };

    res.json({
      success: true,
      summary: courseSummary,
      charts: {
        lesson: [
          { name: "Completed", value: completedLessons },
          { name: "Pending", value: Math.max(timetableRows.length - completedLessons, 0) }
        ],
        attendance: [
          { name: "Marked", value: markedClassIds.length },
          { name: "Pending", value: Math.max(timetableClassIds.length - markedClassIds.length, 0) }
        ],
        quiz: [
          { name: "Submitted", value: quizAttemptRows.length },
          { name: "Pending", value: Math.max((quizRows.length * studentCount) - quizAttemptRows.length, 0) }
        ],
        assessment: [
          { name: "Entered", value: assessmentMarksRows.length },
          { name: "Pending", value: Math.max(expectedAssessmentEntries - assessmentMarksRows.length, 0) }
        ],
        passFail: [
          { name: "Pass", value: passRows.length },
          { name: "Fail", value: failRows.length }
        ],
        marksHistogram: histogram,
        facultyLeave,
        componentsByScoreType: ["Internal", "External"].map((name) => ({ name, count: assessmentRows.filter((row) => text(row.scoretype).toLowerCase() === name.toLowerCase()).length })),
        timeline: timetableRows.map((row) => ({
          id: String(row._id),
          classdate: row.classdate,
          classtime: row.classtime,
          topic: row.topic || row.module || row.course,
          workcompleted: row.workcompleted ? "Completed" : "Pending"
        }))
      },
      data: detailRows,
      faculty: facultyLeave,
      assessments: assessmentRows.map((row) => ({
        id: String(row._id),
        assessmentgroup: row.assessmentgroup || "",
        assessmentcomponent: row.assessmentcomponent || "",
        scoretype: row.scoretype || "",
        marks: row.marks || 0,
        passmarks: row.passmarks || 0,
        weightage: row.weightage || 0,
        status: row.status || ""
      })),
      leaves: leaveRows.map((row) => ({
        id: String(row._id),
        faculty: row.employeename || "",
        facultyemail: row.employeeemail || "",
        leavetype: row.leavetype || "",
        fromdate: compactDate(row.fromdate),
        todate: compactDate(row.todate),
        days: row.days || 0,
        status: row.status || ""
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load course progression report" });
  }
};
