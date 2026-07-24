const User = require("../Models/user");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const NepLmsResource = require("../Models/neplmsresourceds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAssignmentSubmission = require("../Models/neplmsassignmentsubmissionds");
const NepLmsQuiz = require("../Models/neplmsquizds");
const NepLmsQuizAttempt = require("../Models/neplmsquizattemptds");
const NepLmsLessonContent = require("../Models/neplmslessoncontentds");

const text = (value) => String(value || "").trim();
const escRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const studentMajor = (student) => text(student.Major || student.major || student.majorname || student.department);

const courseQueryForStudent = (source, student) => {
  const query = { colid: Number(source.colid), status: "Active" };
  const academicyear = text(source.academicyear || student.academicyear);
  const program = text(source.program || student.program);
  const programcode = text(source.programcode || student.programcode);
  const regulation = text(source.regulation || student.regulation);
  const semester = text(source.semester || student.semester);
  const major = text(source.major || studentMajor(student));

  if (academicyear) query.academicyear = academicyear;
  if (program) query.program = program;
  if (programcode) query.programcode = programcode;
  if (regulation) query.regulation = regulation;
  if (semester) query.semester = semester;
  if (major) query.subject = { $regex: `^${escRegex(major)}$`, $options: "i" };
  return query;
};

const compactCourse = (course) => ({
  id: String(course._id),
  academicyear: course.academicyear || "",
  regulation: course.regulation || "",
  program: course.program || "",
  programcode: course.programcode || "",
  type: course.type || "",
  major: course.subject || "",
  semester: course.semester || "",
  course: course.course || "",
  coursecode: course.coursecode || "",
  faculty: course.facultyname || "",
  facultyemail: course.facultyemail || "",
  facultydepartment: course.facultydepartment || ""
});

const courseBaseQueries = (courses, colid) => courses.map((course) => ({
  colid,
  academicyear: course.academicyear,
  semester: course.semester,
  coursecode: course.coursecode
}));

const courseKey = (item = {}) => [
  text(item.academicyear),
  text(item.semester),
  text(item.coursecode)
].join("||");

const maxDate = (...values) => {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
};

const activityDate = (item = {}, fallback = null) => maxDate(
  item.updatedAt,
  item.createdAt,
  item.duedate,
  item.startdatetime,
  item.enddatetime,
  item.classdate,
  fallback
);

const activityStamp = (item) => {
  const date = activityDate(item);
  return date ? date.getTime() : 0;
};

const compactActivity = (kind, item = {}) => {
  const date = activityDate(item);
  return {
    id: String(item._id || ""),
    kind,
    title: item.title || item.lessonplantitle || item.quiztitle || item.originalname || item.topic || item.module || kind,
    subtitle: item.description || item.topics || item.topic || item.module || "",
    academicyear: item.academicyear || "",
    semester: item.semester || "",
    course: item.course || "",
    coursecode: item.coursecode || "",
    module: item.module || "",
    topic: item.topic || item.topics || "",
    date: date ? date.toISOString() : "",
    dueDate: item.duedate || "",
    startDateTime: item.startdatetime || "",
    endDateTime: item.enddatetime || "",
    sequence: item.sequence || 0,
    marks: item.fullmarks || 0,
    link: item.url || item.filelink || item.videolink || "",
    contenttype: item.contenttype || "",
    lessonresourceid: item.lessonresourceid ? String(item.lessonresourceid) : "",
    resourceid: item.resourceid ? String(item.resourceid) : ""
  };
};

const latestForCourse = (items, course, kind) => items
  .filter((item) => courseKey(item) === courseKey(course))
  .sort((a, b) => activityStamp(b) - activityStamp(a))
  .map((item) => compactActivity(kind, item));

exports.getStudentDashboard = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const regno = text(req.query.regno);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });

    const student = await User.findOne({ colid, regno }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });

    const semesterOptionQuery = courseQueryForStudent(req.query, student);
    delete semesterOptionQuery.semester;
    const semesterOptions = await WorkloadAssignment.distinct("semester", semesterOptionQuery);
    const courses = await WorkloadAssignment.find(courseQueryForStudent(req.query, student))
      .sort({ semester: 1, course: 1 })
      .lean();
    const baseQueries = courseBaseQueries(courses, colid);
    const courseCodes = courses.map((course) => course.coursecode).filter(Boolean);
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    const emptyOr = baseQueries.length ? { $or: baseQueries } : { coursecode: { $in: [] } };
    const [attendanceRows, resources, timetable, submissions, quizzes, quizAttempts, lessonContent] = await Promise.all([
      NepLmsAttendance.find({ colid, regno, coursecode: { $in: courseCodes } }).sort({ classdate: 1 }).lean(),
      NepLmsResource.find({ ...emptyOr, colid }).sort({ duedate: 1, createdAt: -1 }).lean(),
      NepLmsTimetable.find({ ...emptyOr, colid }).sort({ classdate: 1, classtime: 1 }).lean(),
      NepLmsAssignmentSubmission.find({ colid, regno, coursecode: { $in: courseCodes } }).lean(),
      NepLmsQuiz.find({ ...emptyOr, colid, status: "Active" }).sort({ startdatetime: 1 }).lean(),
      NepLmsQuizAttempt.find({ colid, regno, coursecode: { $in: courseCodes } }).lean(),
      NepLmsLessonContent.find({ ...emptyOr, colid, status: "Active" }).sort({ sequence: 1 }).lean()
    ]);

    const courseActivityMap = new Map(courses.map((course) => [courseKey(course), {
      assignmentCount: 0,
      materialCount: 0,
      lessonPlanCount: 0,
      quizCount: 0,
      sequenceCount: 0,
      latestActivityAt: null
    }]));
    resources.forEach((item) => {
      const key = courseKey(item);
      const stats = courseActivityMap.get(key);
      if (!stats) return;
      if (item.resourcetype === "Assignment") stats.assignmentCount += 1;
      if (item.resourcetype === "Course Material") stats.materialCount += 1;
      if (item.resourcetype === "Lesson Plan") stats.lessonPlanCount += 1;
      stats.latestActivityAt = maxDate(stats.latestActivityAt, item.updatedAt, item.createdAt, item.duedate);
    });
    quizzes.forEach((item) => {
      const key = courseKey(item);
      const stats = courseActivityMap.get(key);
      if (!stats) return;
      stats.quizCount += 1;
      stats.latestActivityAt = maxDate(stats.latestActivityAt, item.updatedAt, item.createdAt, item.startdatetime, item.enddatetime);
    });
    lessonContent.forEach((item) => {
      const key = courseKey(item);
      const stats = courseActivityMap.get(key);
      if (!stats) return;
      stats.sequenceCount += 1;
      stats.latestActivityAt = maxDate(stats.latestActivityAt, item.updatedAt, item.createdAt);
    });
    const coursesWithActivity = courses.map((course) => {
      const stats = courseActivityMap.get(courseKey(course)) || {};
      const totalContent = Number(stats.assignmentCount || 0)
        + Number(stats.materialCount || 0)
        + Number(stats.lessonPlanCount || 0)
        + Number(stats.quizCount || 0)
        + Number(stats.sequenceCount || 0);
      const assignments = latestForCourse(resources.filter((item) => item.resourcetype === "Assignment"), course, "Assignment");
      const courseMaterials = latestForCourse(resources.filter((item) => item.resourcetype === "Course Material"), course, "Course Material");
      const lessonPlans = latestForCourse(resources.filter((item) => item.resourcetype === "Lesson Plan"), course, "Lesson Plan");
      const courseQuizzes = latestForCourse(quizzes, course, "Quiz");
      const sequences = latestForCourse(lessonContent, course, "Sequence");
      return {
        ...compactCourse(course),
        assignmentCount: stats.assignmentCount || 0,
        materialCount: stats.materialCount || 0,
        lessonPlanCount: stats.lessonPlanCount || 0,
        quizCount: stats.quizCount || 0,
        sequenceCount: stats.sequenceCount || 0,
        totalContent,
        hasContent: totalContent > 0,
        latestActivityAt: stats.latestActivityAt ? stats.latestActivityAt.toISOString() : "",
        activities: {
          lessonPlans,
          courseMaterials,
          quizzes: courseQuizzes,
          sequences,
          assignments
        }
      };
    }).sort((a, b) => {
      if (a.hasContent !== b.hasContent) return a.hasContent ? -1 : 1;
      const bDate = b.latestActivityAt ? new Date(b.latestActivityAt).getTime() : 0;
      const aDate = a.latestActivityAt ? new Date(a.latestActivityAt).getTime() : 0;
      if (bDate !== aDate) return bDate - aDate;
      return `${a.semester || ""}${a.course || ""}`.localeCompare(`${b.semester || ""}${b.course || ""}`);
    });

    const attendanceMap = new Map();
    attendanceRows.forEach((row) => {
      const key = row.coursecode || row.course || "";
      const item = attendanceMap.get(key) || {
        course: row.course || "",
        coursecode: row.coursecode || "",
        total: 0,
        present: 0,
        absent: 0,
        percentage: 0
      };
      item.total += 1;
      if (Number(row.attendance) === 1) item.present += 1;
      else item.absent += 1;
      item.percentage = item.total ? Number(((item.present / item.total) * 100).toFixed(2)) : 0;
      attendanceMap.set(key, item);
    });

    const submittedAssignmentIds = new Set(submissions.map((item) => String(item.assignmentid || "")));
    const attemptedQuizIds = new Set(quizAttempts.map((item) => String(item.quizid || "")));
    const upcomingAssignments = resources.filter((item) => (
      item.resourcetype === "Assignment"
      && item.duedate
      && item.duedate >= today
      && !submittedAssignmentIds.has(String(item._id))
    ));
    const courseMaterial = resources.filter((item) => item.resourcetype === "Course Material");
    const upcomingClasses = timetable.filter((item) => item.classdate && item.classdate >= today);
    const pastClasses = timetable.filter((item) => item.classdate && item.classdate < today).reverse();
    const upcomingQuizzes = quizzes.filter((item) => (
      new Date(item.enddatetime) >= now
      && !attemptedQuizIds.has(String(item._id))
    ));

    const summary = {
      courses: courses.length,
      faculties: new Set(courses.map((course) => course.facultyemail || course.facultyname).filter(Boolean)).size,
      upcomingClasses: upcomingClasses.length,
      pastClasses: pastClasses.length,
      upcomingAssignments: upcomingAssignments.length,
      upcomingQuizzes: upcomingQuizzes.length,
      courseMaterials: courseMaterial.length,
      attendancePercentage: attendanceRows.length
        ? Number(((attendanceRows.filter((row) => Number(row.attendance) === 1).length / attendanceRows.length) * 100).toFixed(2))
        : 0
    };

    res.json({
      success: true,
      semesterOptions: [...new Set([student.semester, ...semesterOptions].map(text).filter(Boolean))]
        .sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b))),
      student: {
        name: student.name || "",
        regno: student.regno || "",
        email: student.email || "",
        phone: student.phone || "",
        academicyear: student.academicyear || "",
        program: student.program || "",
        programcode: student.programcode || "",
        major: studentMajor(student),
        semester: student.semester || "",
        section: student.section || ""
      },
      summary,
      courses: coursesWithActivity,
      attendance: [...attendanceMap.values()].sort((a, b) => String(a.coursecode).localeCompare(String(b.coursecode))),
      upcomingClasses,
      pastClasses: pastClasses.slice(0, 12),
      upcomingAssignments: upcomingAssignments.slice(0, 12),
      upcomingQuizzes: upcomingQuizzes.slice(0, 12),
      courseMaterial: courseMaterial.slice(0, 12),
      quizAttempts,
      submissions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
