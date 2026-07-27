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

exports.getCourseWorkspace = async (req, res) => {
  try {
    const student = await getStudent(req.query);
    const course = await verifyCourseForStudent(req.query, student);
    const base = { colid: Number(req.query.colid), academicyear: course.academicyear, semester: course.semester, coursecode: course.coursecode };
    const timetableQuery = {
      ...base,
      ...(course.regulation ? { regulation: course.regulation } : {}),
      ...(course.program ? { program: course.program } : {}),
      ...(course.programcode ? { programcode: course.programcode } : {}),
      ...(student.section ? { section: student.section } : {})
    };
    const now = new Date();
    const [resources, timetable, rawSubmissions, quizzes, quizAttempts] = await Promise.all([
      NepLmsResource.find(base).sort({ resourcetype: 1, duedate: 1, createdAt: -1 }).lean(),
      NepLmsTimetable.find(timetableQuery).sort({ classdate: 1, classtime: 1 }).lean(),
      NepLmsAssignmentSubmission.find({ colid: Number(req.query.colid), regno: text(req.query.regno), coursecode: course.coursecode }).sort({ submitteddate: -1 }).lean(),
      NepLmsQuiz.find({ ...base, status: "Active" }).sort({ startdatetime: 1 }).lean(),
      NepLmsQuizAttempt.find({ colid: Number(req.query.colid), regno: text(req.query.regno), coursecode: course.coursecode }).sort({ submitteddate: -1 }).lean()
    ]);
    const assignmentMarks = Object.fromEntries(resources.filter((item) => item.resourcetype === "Assignment").map((item) => [String(item._id), item.fullmarks || 0]));
    const submissions = rawSubmissions.map((item) => ({
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
