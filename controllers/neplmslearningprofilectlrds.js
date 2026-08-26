const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const Attendance = require("../Models/neplmsattendanceds");
const AssignmentSubmission = require("../Models/neplmsassignmentsubmissionds");
const QuizAttempt = require("../Models/neplmsquizattemptds");
const LiveQuizAttempt = require("../Models/neplmslivequizattemptds");
const LessonContentProgress = require("../Models/neplmslessoncontentprogressds");
const CourseMaterialWatch = require("../Models/neplmscoursematerialwatchds");
const DescriptiveAttempt = require("../Models/neplmsdescriptiveattemptds");
const AssessmentMark = require("../Models/neplmsassessmentmarksds");
const FinalMark = require("../Models/neplmsfinalmarksds");
const Timetable = require("../Models/neplmstimetableds");
const MentoringWorkspace = require("../Models/mentoringworkspaceds");
const MentoringMessage = require("../Models/mentoringmessageds");

const allowedFields = [
  "academicyear",
  "admissionyear",
  "program",
  "programcode",
  "regulation",
  "semester",
  "section",
  "Major",
  "Minor",
  "IDC",
  "AEC",
  "SEC",
  "VAC",
  "category",
  "gender",
  "department",
  "name",
  "email",
  "phone",
  "regno"
];

const clean = (value) => String(value || "").trim();
const number = (value) => Number(value || 0);
const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const addToMap = (map, key, seed = {}) => {
  const safeKey = clean(key) || "NA";
  if (!map.has(safeKey)) map.set(safeKey, { key: safeKey, ...seed });
  return map.get(safeKey);
};

const buildUserFilter = (body) => {
  const colid = Number(body.colid);
  const filter = { colid, role: /^Student$/i };
  const filters = Array.isArray(body.filters) ? body.filters : [];

  filters.forEach((item) => {
    const field = clean(item.field);
    const value = clean(item.value);
    if (!field || !value || !allowedFields.includes(field)) return;
    if (["name", "email", "phone", "regno"].includes(field)) {
      filter[field] = { $regex: value, $options: "i" };
    } else {
      filter[field] = value;
    }
  });

  return filter;
};

exports.getOptions = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ msg: "College id is required" });

    const base = { colid, role: /^Student$/i };
    const options = {};
    for (const field of allowedFields) {
      options[field] = (await User.distinct(field, base)).filter(Boolean).sort();
    }

    res.json({ fields: allowedFields, options });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ msg: "College id is required" });
    const filter = buildUserFilter(req.body);
    const students = await User.find(filter)
      .select("name email phone regno academicyear admissionyear program programcode regulation semester section Major Minor IDC AEC SEC VAC category gender department photo status colid")
      .sort({ academicyear: -1, program: 1, semester: 1, name: 1 })
      .limit(100)
      .lean();
    res.json(students);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const id = clean(req.body.id);
    const regno = clean(req.body.regno);
    const email = clean(req.body.email);
    if (!colid) return res.status(400).json({ msg: "College id is required" });
    if (!id && !regno && !email) return res.status(400).json({ msg: "Select a student" });

    const studentFilter = { colid, role: /^Student$/i };
    if (id) studentFilter._id = id;
    else if (regno) studentFilter.regno = regno;
    else studentFilter.email = email;

    const student = await User.findOne(studentFilter)
      .select("-password -__v")
      .lean();
    if (!student) return res.status(404).json({ msg: "Student not found" });

    const studentRegno = clean(student.regno);
    const studentEmail = clean(student.email);
    const studentName = clean(student.name);

    const [
      institution,
      attendance,
      finalMarks,
      assignments,
      quizzes,
      descriptiveAttempts,
      assessmentMarks,
      liveQuizAttempts,
      sequentialProgress,
      courseMaterialWatch,
      timetable,
      mentoringWorkspaces
    ] = await Promise.all([
      Institution.findOne({ colid }).lean(),
      Attendance.find({ colid, regno: studentRegno }).sort({ academicyear: 1, semester: 1, course: 1, classdate: 1 }).lean(),
      FinalMark.find({ colid, regno: studentRegno }).sort({ academicyear: 1, semester: 1, course: 1 }).lean(),
      AssignmentSubmission.find({ colid, regno: studentRegno }).sort({ submitteddate: -1 }).lean(),
      QuizAttempt.find({ colid, regno: studentRegno }).sort({ submitteddate: -1 }).lean(),
      DescriptiveAttempt.find({ colid, regno: studentRegno }).sort({ submitteddate: -1 }).lean(),
      AssessmentMark.find({ colid, regno: studentRegno }).sort({ academicyear: 1, semester: 1, course: 1, assessmentcomponent: 1 }).lean(),
      LiveQuizAttempt.find({ colid, regno: studentRegno }).sort({ lastactivitydate: -1, submitteddate: -1 }).lean(),
      LessonContentProgress.find({ colid, regno: studentRegno }).sort({ completedat: -1 }).lean(),
      CourseMaterialWatch.find({ colid, regno: studentRegno }).sort({ lastwatchedat: -1 }).lean(),
      Timetable.find({
        colid,
        academicyear: student.academicyear,
        semester: student.semester,
        $or: [
          { programcode: student.programcode },
          { program: student.program },
          { major: student.Major }
        ]
      }).sort({ classdate: 1, classtime: 1 }).limit(500).lean(),
      MentoringWorkspace.find({ colid, "students.regno": studentRegno }).sort({ updatedAt: -1 }).lean()
    ]);

    const workspaceIds = mentoringWorkspaces.map((item) => item._id);
    const mentoringMessages = workspaceIds.length
      ? await MentoringMessage.find({ colid, workspaceid: { $in: workspaceIds } }).sort({ createdAt: -1 }).limit(300).lean()
      : [];

    const attendanceCourseMap = new Map();
    const attendanceSemesterMap = new Map();
    attendance.forEach((row) => {
      const key = `${row.academicyear || ""}|${row.semester || ""}|${row.coursecode || row.course || ""}`;
      const course = addToMap(attendanceCourseMap, key, {
        academicyear: row.academicyear || "",
        semester: row.semester || "",
        course: row.course || "",
        coursecode: row.coursecode || "",
        total: 0,
        present: 0
      });
      course.total += 1;
      course.present += number(row.attendance);

      const semester = addToMap(attendanceSemesterMap, row.semester || "NA", { semester: row.semester || "NA", total: 0, present: 0 });
      semester.total += 1;
      semester.present += number(row.attendance);
    });
    const attendanceByCourse = Array.from(attendanceCourseMap.values()).map((row) => ({
      ...row,
      percentage: row.total ? round2((row.present / row.total) * 100) : 0
    }));
    const attendanceBySemester = Array.from(attendanceSemesterMap.values()).map((row) => ({
      semester: row.semester,
      total: row.total,
      present: row.present,
      percentage: row.total ? round2((row.present / row.total) * 100) : 0
    }));

    const semesterMap = new Map();
    finalMarks.forEach((row) => {
      const sem = addToMap(semesterMap, row.semester || "NA", {
        semester: row.semester || "NA",
        credits: 0,
        gpaTotal: 0,
        courses: 0,
        passed: 0,
        failed: 0,
        totalMarks: 0
      });
      const credits = number(row.credits);
      sem.credits += credits;
      sem.gpaTotal += number(row.gpa) || number(row.gradepoint) * credits;
      sem.courses += 1;
      sem.totalMarks += number(row.total);
      if (clean(row.passstatus).toLowerCase() === "pass") sem.passed += 1;
      else sem.failed += 1;
    });
    const semesterResults = Array.from(semesterMap.values()).map((row) => ({
      ...row,
      sgpa: row.credits ? round2(row.gpaTotal / row.credits) : 0,
      averageMarks: row.courses ? round2(row.totalMarks / row.courses) : 0
    })).sort((a, b) => Number(a.semester) - Number(b.semester));
    const totalCredits = semesterResults.reduce((sum, item) => sum + number(item.credits), 0);
    const totalGpa = semesterResults.reduce((sum, item) => sum + number(item.gpaTotal), 0);
    const cgpa = totalCredits ? round2(totalGpa / totalCredits) : 0;

    const courseMap = new Map();
    const absorbCourse = (row, source) => {
      const key = `${row.academicyear || ""}|${row.semester || ""}|${row.coursecode || row.course || ""}`;
      const item = addToMap(courseMap, key, {
        academicyear: row.academicyear || "",
        semester: row.semester || "",
        course: row.course || "",
        coursecode: row.coursecode || "",
        attendanceClasses: 0,
        attendancePresent: 0,
        assignments: 0,
        assignmentMarks: 0,
        quizzes: 0,
        quizMarks: 0,
        assessments: 0,
        assessmentMarks: 0,
        finalTotal: null,
        grade: "",
        gradepoint: 0,
        credits: 0,
        passstatus: ""
      });
      if (source === "attendance") {
        item.attendanceClasses += 1;
        item.attendancePresent += number(row.attendance);
      }
      if (source === "assignment") {
        item.assignments += 1;
        item.assignmentMarks += number(row.marks);
      }
      if (source === "quiz") {
        item.quizzes += 1;
        item.quizMarks += number(row.obtainedmarks);
      }
      if (source === "assessment") {
        item.assessments += 1;
        item.assessmentMarks += number(row.obtainedmarks);
      }
      if (source === "final") {
        item.finalTotal = number(row.total);
        item.grade = row.grade || "";
        item.gradepoint = number(row.gradepoint);
        item.credits = number(row.credits);
        item.passstatus = row.passstatus || "";
      }
      return item;
    };
    attendance.forEach((row) => absorbCourse(row, "attendance"));
    assignments.forEach((row) => absorbCourse(row, "assignment"));
    quizzes.forEach((row) => absorbCourse(row, "quiz"));
    liveQuizAttempts.forEach((row) => absorbCourse(row, "quiz"));
    sequentialProgress.forEach((row) => {
      const item = absorbCourse(row, "sequence");
      if (item) item.sequenceCompleted = (item.sequenceCompleted || 0) + (row.completed ? 1 : 0);
    });
    courseMaterialWatch.forEach((row) => {
      const item = absorbCourse(row, "material");
      if (item) {
        item.courseMaterials = (item.courseMaterials || 0) + 1;
        item.averageWatchedPercentTotal = (item.averageWatchedPercentTotal || 0) + number(row.watchedpercent);
      }
    });
    descriptiveAttempts.forEach((row) => absorbCourse(row, "assessment"));
    finalMarks.forEach((row) => absorbCourse(row, "final"));

    const courses = Array.from(courseMap.values()).map((row) => ({
      ...row,
      attendancePercentage: row.attendanceClasses ? round2((row.attendancePresent / row.attendanceClasses) * 100) : 0,
      averageAssignmentMarks: row.assignments ? round2(row.assignmentMarks / row.assignments) : 0,
      averageQuizMarks: row.quizzes ? round2(row.quizMarks / row.quizzes) : 0,
      averageAssessmentMarks: row.assessments ? round2(row.assessmentMarks / row.assessments) : 0,
      averageMaterialWatch: row.courseMaterials ? round2(row.averageWatchedPercentTotal / row.courseMaterials) : 0
    })).sort((a, b) => Number(a.semester) - Number(b.semester) || clean(a.course).localeCompare(clean(b.course)));

    const semesterActivityMap = new Map();
    const countActivity = (rows, field) => rows.forEach((row) => {
      const sem = addToMap(semesterActivityMap, row.semester || "NA", {
        semester: row.semester || "NA",
        assignments: 0,
        quizzes: 0,
        assessments: 0,
        marksEntries: 0
      });
      sem[field] += 1;
    });
    countActivity(assignments, "assignments");
    countActivity(quizzes, "quizzes");
    countActivity(liveQuizAttempts, "quizzes");
    countActivity(descriptiveAttempts, "assessments");
    countActivity(assessmentMarks, "marksEntries");
    const semesterActivity = Array.from(semesterActivityMap.values()).sort((a, b) => Number(a.semester) - Number(b.semester));

    const messagesByWorkspace = new Map();
    mentoringMessages.forEach((message) => {
      const id = String(message.workspaceid);
      if (!messagesByWorkspace.has(id)) messagesByWorkspace.set(id, []);
      messagesByWorkspace.get(id).push(message);
    });
    const mentoring = mentoringWorkspaces.map((workspace) => {
      const msgs = messagesByWorkspace.get(String(workspace._id)) || [];
      const facultyMessages = msgs.filter((item) => item.senderrole === "Faculty").length;
      const studentMessages = msgs.filter((item) => item.senderrole === "Student").length;
      const recent = msgs.slice(0, 5).map((item) => ({
        date: item.createdAt,
        senderrole: item.senderrole,
        sendername: item.sendername,
        itemtype: item.itemtype,
        title: item.title,
        message: item.message,
        url: item.url
      }));
      return {
        id: workspace._id,
        groupname: workspace.groupname,
        facultyname: workspace.facultyname,
        facultyemail: workspace.facultyemail,
        totalMessages: msgs.length,
        facultyMessages,
        studentMessages,
        documents: msgs.filter((item) => item.itemtype === "Document").length,
        links: msgs.filter((item) => item.itemtype === "Link").length,
        summary: msgs.length
          ? `${msgs.length} mentoring interactions recorded with ${facultyMessages} faculty posts and ${studentMessages} student posts.`
          : "No mentoring conversation has been recorded yet.",
        recent
      };
    });

    const summary = {
      courses: courses.length,
      classes: attendance.length,
      attendancePercentage: attendance.length ? round2((attendance.reduce((sum, row) => sum + number(row.attendance), 0) / attendance.length) * 100) : 0,
      assignments: assignments.length,
      quizzes: quizzes.length,
      liveQuizzes: liveQuizAttempts.length,
      sequentialCompleted: sequentialProgress.filter((row) => row.completed).length,
      courseMaterialsWatched: courseMaterialWatch.length,
      averageMaterialWatch: courseMaterialWatch.length ? round2(courseMaterialWatch.reduce((sum, row) => sum + number(row.watchedpercent), 0) / courseMaterialWatch.length) : 0,
      assessments: descriptiveAttempts.length,
      finalMarkCourses: finalMarks.length,
      cgpa,
      credits: totalCredits,
      mentoringGroups: mentoring.length,
      mentoringMessages: mentoringMessages.length
    };

    res.json({
      institution,
      student,
      summary,
      courses,
      attendanceByCourse,
      attendanceBySemester,
      semesterActivity,
      finalMarks,
      semesterResults,
      assignments,
      quizzes,
      liveQuizAttempts,
      sequentialProgress,
      courseMaterialWatch,
      descriptiveAttempts,
      assessmentMarks,
      timetable,
      mentoring
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
