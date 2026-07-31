const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const User = require("../Models/user");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsResource = require("../Models/neplmsresourceds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAssignmentSubmission = require("../Models/neplmsassignmentsubmissionds");
const NepLmsQuiz = require("../Models/neplmsquizds");
const NepLmsQuizAttempt = require("../Models/neplmsquizattemptds");
const Awsconfig = require("../Models/awsconfig");
const NepLmsClassGroup = require("../Models/neplmsclassgroupds");
const NepLmsCourseMaterialWatch = require("../Models/neplmscoursematerialwatchds");
const NepLmsCourseMaterialQa = require("../Models/neplmscoursematerialqads");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const escRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getStudent = async (source = {}) => {
  const colid = Number(source.colid);
  const regno = text(source.regno);
  if (!colid) throw new Error("colid is required");
  if (!regno) throw new Error("regno is required");
  const student = await User.findOne({ colid, regno }).lean();
  if (!student) throw new Error("Student not found");
  return student;
};

const studentMajor = (student) => text(student.Major || student.major || student.majorname || student.department);
const selectedCourseGroup = (source = {}) => text(source.coursegroup || source.coursegrouo || source.groupname);

const verifyCourseGroupForStudent = async ({ colid, academicyear, regulation, programcode, semester, coursecode, coursegroup }, student) => {
  if (!coursegroup) return;
  const query = {
    colid: Number(colid),
    academicyear: text(academicyear),
    programcode: text(programcode),
    semester: text(semester),
    coursecode: text(coursecode),
    groupname: text(coursegroup),
    regno: text(student.regno)
  };
  if (text(regulation)) query.regulation = text(regulation);
  const row = await NepLmsClassGroup.findOne(query).lean();
  if (!row) throw new Error("Course group is not available for this student");
};

const buildCourseQuery = (source, student) => {
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

const verifyCourseForStudent = async (source, student) => {
  const query = buildCourseQuery(source, student);
  if (text(source.coursecode)) query.coursecode = text(source.coursecode);
  const course = await WorkloadAssignment.findOne(query).lean();
  if (!course) throw new Error("Course is not available for this student");
  return course;
};

const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
const emailRegex = (email) => ({ $regex: `^${escRegex(text(email))}$`, $options: "i" });

const buildFacultyCourseQuery = (source = {}) => {
  const query = {
    colid: Number(source.colid),
    status: "Active",
    facultyemail: emailRegex(source.facultyemail || source.email || source.user)
  };
  ["academicyear", "regulation", "program", "programcode", "semester", "coursecode"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  return query;
};

const verifyCourseForFaculty = async (source = {}) => {
  if (!Number(source.colid)) throw new Error("colid is required");
  if (!text(source.facultyemail || source.email || source.user)) throw new Error("faculty email is required");
  const course = await WorkloadAssignment.findOne(buildFacultyCourseQuery(source)).lean();
  if (!course) throw new Error("Course is not assigned to this faculty");
  return course;
};

exports.getStudentCourses = async (req, res) => {
  try {
    const student = await getStudent(req.query);
    const query = buildCourseQuery(req.query, student);
    const courses = await WorkloadAssignment.find(query).sort({ academicyear: 1, semester: 1, course: 1 }).lean();
    res.json({
      success: true,
      student: {
        name: student.name || "",
        regno: student.regno || "",
        email: student.email || "",
        academicyear: student.academicyear || "",
        program: student.program || "",
        programcode: student.programcode || "",
        major: studentMajor(student),
        semester: student.semester || "",
        section: student.section || ""
      },
      courses,
      options: {
        academicyears: uniq(courses.map((item) => item.academicyear)),
        programs: uniq(courses.map((item) => item.program)),
        programcodes: uniq(courses.map((item) => item.programcode)),
        majors: uniq(courses.map((item) => item.subject)),
        semesters: uniq(courses.map((item) => item.semester))
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getFacultyMaterialCourses = async (req, res) => {
  try {
    if (!Number(req.query.colid)) throw new Error("colid is required");
    if (!text(req.query.facultyemail || req.query.email || req.query.user)) throw new Error("faculty email is required");
    const courses = await WorkloadAssignment.find(buildFacultyCourseQuery(req.query)).sort({ academicyear: 1, semester: 1, course: 1 }).lean();
    res.json({
      success: true,
      faculty: {
        name: text(req.query.name),
        email: text(req.query.facultyemail || req.query.email || req.query.user)
      },
      courses,
      options: {
        academicyears: uniq(courses.map((item) => item.academicyear)),
        regulations: uniq(courses.map((item) => item.regulation)),
        programs: uniq(courses.map((item) => item.program)),
        programcodes: uniq(courses.map((item) => item.programcode)),
        semesters: uniq(courses.map((item) => item.semester))
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getCourseWorkspace = async (req, res) => {
  try {
    const student = await getStudent(req.query);
    const course = await verifyCourseForStudent(req.query, student);
    const base = { colid: Number(req.query.colid), academicyear: course.academicyear, semester: course.semester, coursecode: course.coursecode };
    const coursegroup = selectedCourseGroup(req.query);
    await verifyCourseGroupForStudent({ ...course, colid: req.query.colid, coursegroup }, student);
    if (coursegroup) base.coursegroup = coursegroup;
    const timetableQuery = {
      ...base,
      ...(course.regulation ? { regulation: course.regulation } : {}),
      ...(course.program ? { program: course.program } : {}),
      ...(course.programcode ? { programcode: course.programcode } : {}),
      ...(student.section ? { section: student.section } : {})
    };
    const now = new Date();
    const quizAttemptFilter = { colid: Number(req.query.colid), regno: text(req.query.regno), coursecode: course.coursecode };
    if (coursegroup) quizAttemptFilter.coursegroup = coursegroup;
    const [resources, timetable, rawSubmissions, quizzes, quizAttempts] = await Promise.all([
      NepLmsResource.find(base).sort({ resourcetype: 1, duedate: 1, createdAt: -1 }).lean(),
      NepLmsTimetable.find(timetableQuery).sort({ classdate: 1, classtime: 1 }).lean(),
      NepLmsAssignmentSubmission.find({ colid: Number(req.query.colid), regno: text(req.query.regno), coursecode: course.coursecode }).sort({ submitteddate: -1 }).lean(),
      NepLmsQuiz.find({ ...base, status: "Active" }).sort({ startdatetime: 1 }).lean(),
      NepLmsQuizAttempt.find(quizAttemptFilter).sort({ submitteddate: -1 }).lean()
    ]);
    const visibleAssignmentIds = new Set(resources.filter((item) => item.resourcetype === "Assignment").map((item) => String(item._id)));
    const visibleSubmissions = coursegroup
      ? rawSubmissions.filter((item) => visibleAssignmentIds.has(String(item.assignmentid || "")))
      : rawSubmissions;
    const assignmentMarks = Object.fromEntries(resources.filter((item) => item.resourcetype === "Assignment").map((item) => [String(item._id), item.fullmarks || 0]));
    const submissions = visibleSubmissions.map((item) => ({
      ...item,
      fullmarks: item.fullmarks || assignmentMarks[String(item.assignmentid)] || 0
    }));
    const submittedAssignmentIds = new Set(submissions.map((item) => String(item.assignmentid || "")));
    const attemptedQuizIds = new Set(quizAttempts.map((attempt) => String(attempt.quizid || "")));
    const activeQuizzes = quizzes.filter((quiz) => (
      new Date(quiz.startdatetime) <= now
      && new Date(quiz.enddatetime) >= now
      && !attemptedQuizIds.has(String(quiz._id))
    ));
    const today = now.toISOString().slice(0, 10);
    const upcomingAssignments = resources.filter((item) => (
      item.resourcetype === "Assignment"
      && item.duedate
      && item.duedate >= today
      && !submittedAssignmentIds.has(String(item._id))
    ));
    res.json({ success: true, course, resources, timetable, submissions, upcomingAssignments, quizzes, activeQuizzes, quizAttempts });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getCourseMaterials = async (req, res) => {
  try {
    const student = await getStudent(req.query);
    const course = await verifyCourseForStudent(req.query, student);
    const query = {
      colid: Number(req.query.colid),
      academicyear: course.academicyear,
      semester: course.semester,
      coursecode: course.coursecode,
      resourcetype: "Course Material",
      status: "Active"
    };
    if (course.regulation) query.regulation = course.regulation;
    if (course.program) query.program = course.program;
    if (course.programcode) query.programcode = course.programcode;
    const coursegroup = selectedCourseGroup(req.query);
    await verifyCourseGroupForStudent({ ...course, colid: req.query.colid, coursegroup }, student);
    if (coursegroup) query.coursegroup = coursegroup;
    const materials = await NepLmsResource.find(query).sort({ order: 1, createdAt: 1 }).lean();
    const materialIds = materials.map((item) => item._id);
    const [progress, qa] = await Promise.all([
      NepLmsCourseMaterialWatch.find({ colid: Number(req.query.colid), regno: student.regno, materialid: { $in: materialIds } }).lean(),
      NepLmsCourseMaterialQa.find({ colid: Number(req.query.colid), materialid: { $in: materialIds } }).sort({ createdAt: -1 }).lean()
    ]);
    res.json({
      success: true,
      student: {
        name: student.name || "",
        regno: student.regno || "",
        email: student.email || "",
        academicyear: student.academicyear || "",
        regulation: student.regulation || "",
        program: student.program || "",
        programcode: student.programcode || "",
        semester: student.semester || "",
        section: student.section || ""
      },
      course,
      materials,
      progress,
      qa
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getFacultyCourseMaterials = async (req, res) => {
  try {
    const course = await verifyCourseForFaculty(req.query);
    const query = {
      colid: Number(req.query.colid),
      academicyear: course.academicyear,
      semester: course.semester,
      coursecode: course.coursecode,
      resourcetype: "Course Material",
      status: "Active"
    };
    if (course.regulation) query.regulation = course.regulation;
    if (course.program) query.program = course.program;
    if (course.programcode) query.programcode = course.programcode;
    const coursegroup = selectedCourseGroup(req.query);
    if (coursegroup) query.coursegroup = coursegroup;
    const materials = await NepLmsResource.find(query).sort({ order: 1, createdAt: 1 }).lean();
    const materialIds = materials.map((item) => item._id);
    const qa = await NepLmsCourseMaterialQa.find({ colid: Number(req.query.colid), materialid: { $in: materialIds } }).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      faculty: {
        name: course.facultyname || text(req.query.name),
        email: course.facultyemail || text(req.query.facultyemail || req.query.email || req.query.user)
      },
      course,
      materials,
      progress: [],
      qa
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveCourseMaterialProgress = async (req, res) => {
  try {
    const student = await getStudent(req.body);
    const material = await NepLmsResource.findOne({
      _id: req.body.materialid,
      colid: Number(req.body.colid),
      resourcetype: "Course Material"
    }).lean();
    if (!material) return res.status(404).json({ success: false, message: "Course material not found" });
    await verifyCourseForStudent({ ...req.body, academicyear: material.academicyear, semester: material.semester, coursecode: material.coursecode }, student);
    await verifyCourseGroupForStudent({ ...material, colid: req.body.colid, coursegroup: material.coursegroup }, student);
    const duration = Math.max(0, Number(req.body.durationseconds || 0));
    const watched = Math.max(0, Number(req.body.watchedseconds || 0));
    const percent = duration ? Math.min(100, Math.round((watched / duration) * 100)) : Math.max(0, Math.min(100, Number(req.body.watchedpercent || 0)));
    const data = await NepLmsCourseMaterialWatch.findOneAndUpdate(
      { colid: Number(req.body.colid), materialid: material._id, regno: student.regno },
      {
        materialid: material._id,
        academicyear: material.academicyear,
        regulation: material.regulation,
        program: material.program,
        programcode: material.programcode,
        semester: material.semester,
        course: material.course,
        coursecode: material.coursecode,
        title: material.title,
        student: student.name || "",
        studentemail: student.email || "",
        regno: student.regno,
        watchedseconds: watched,
        durationseconds: duration,
        watchedpercent: percent,
        lastwatchedat: new Date(),
        colid: Number(req.body.colid),
        user: text(req.body.user)
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.addCourseMaterialQuestion = async (req, res) => {
  try {
    const student = await getStudent(req.body);
    const material = await NepLmsResource.findOne({
      _id: req.body.materialid,
      colid: Number(req.body.colid),
      resourcetype: "Course Material"
    }).lean();
    if (!material) return res.status(404).json({ success: false, message: "Course material not found" });
    const question = text(req.body.question);
    if (!question) return res.status(400).json({ success: false, message: "Question is required" });
    await verifyCourseForStudent({ ...req.body, academicyear: material.academicyear, semester: material.semester, coursecode: material.coursecode }, student);
    await verifyCourseGroupForStudent({ ...material, colid: req.body.colid, coursegroup: material.coursegroup }, student);
    const data = await NepLmsCourseMaterialQa.create({
      materialid: material._id,
      academicyear: material.academicyear,
      regulation: material.regulation,
      program: material.program,
      programcode: material.programcode,
      semester: material.semester,
      course: material.course,
      coursecode: material.coursecode,
      materialtitle: material.title,
      question,
      student: student.name || "",
      studentemail: student.email || "",
      regno: student.regno,
      faculty: material.faculty || "",
      facultyemail: material.facultyemail || "",
      status: "Open",
      colid: Number(req.body.colid),
      user: text(req.body.user)
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.answerCourseMaterialQuestion = async (req, res) => {
  try {
    const answer = text(req.body.answer);
    if (!answer) return res.status(400).json({ success: false, message: "Answer is required" });
    const data = await NepLmsCourseMaterialQa.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid) },
      {
        answer,
        answeredby: text(req.body.answeredby || req.body.name),
        answeredbyemail: text(req.body.answeredbyemail || req.body.user),
        answeredat: new Date(),
        status: "Answered"
      },
      { new: true }
    ).lean();
    if (!data) return res.status(404).json({ success: false, message: "Question not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.submitAssignment = async (req, res) => {
  try {
    const student = await getStudent(req.body);
    if (!req.file) return res.status(400).json({ success: false, message: "Please select a document to upload" });
    const assignment = await NepLmsResource.findOne({
      _id: req.body.assignmentid,
      colid: Number(req.body.colid),
      resourcetype: "Assignment"
    }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });
    await verifyCourseForStudent({ ...req.body, coursecode: assignment.coursecode, academicyear: assignment.academicyear, semester: assignment.semester }, student);
    await verifyCourseGroupForStudent({ ...assignment, colid: req.body.colid, coursegroup: assignment.coursegroup }, student);

    const config = await getDefaultAwsConfig(req.body.colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const key = `${Number(req.body.colid)}/nep-lms-submissions/${student.regno}/${assignment.coursecode}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({
      accessKeyId: config.username,
      secretAccessKey: config.password,
      region: config.region
    });
    await s3.putObject({
      Bucket: config.bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }).promise();

    const data = await NepLmsAssignmentSubmission.create({
      assignmentid: assignment._id,
      academicyear: assignment.academicyear,
      regulation: assignment.regulation,
      program: assignment.program,
      programcode: assignment.programcode,
      type: assignment.type,
      major: assignment.major,
      semester: assignment.semester,
      course: assignment.course,
      coursecode: assignment.coursecode,
      coursegroup: assignment.coursegroup,
      assignmenttitle: assignment.title,
      fullmarks: assignment.fullmarks || 0,
      student: student.name || "",
      regno: student.regno,
      email: student.email || "",
      phone: student.phone || "",
      comments: text(req.body.comments),
      filename: cleanName,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bucket: config.bucket,
      region: config.region,
      key,
      url: s3Url(config.bucket, config.region, key),
      status: "Submitted",
      colid: Number(req.body.colid),
      user: text(req.body.user)
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
