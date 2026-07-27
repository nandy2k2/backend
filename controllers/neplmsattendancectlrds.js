const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const User = require("../Models/user");
const NepLmsClassGroup = require("../Models/neplmsclassgroupds");
const NepLmsAttendanceOtp = require("../Models/neplmsattendanceotpds");
const { emitActivityEvent } = require("./activitymonitoringctlrds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const regexText = (value) => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const randomOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const parseClassDate = (classdate) => {
  const value = text(classdate);
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
};
const parseTimeParts = (value) => {
  const input = text(value).toLowerCase();
  const match = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
};
const buildOtpValidityWindow = (classInfo = {}) => {
  const classDate = parseClassDate(classInfo.classdate);
  const startParts = parseTimeParts(classInfo.classtime);
  if (!classDate || !startParts) return {};
  const validfrom = new Date(classDate);
  validfrom.setHours(startParts.hour, startParts.minute, 0, 0);

  const timeText = text(classInfo.classtime);
  const endText = timeText.includes("-") ? timeText.split("-").slice(1).join("-") : "";
  const endParts = parseTimeParts(endText);
  const validtill = new Date(validfrom);
  if (endParts) {
    validtill.setHours(endParts.hour, endParts.minute, 0, 0);
    if (validtill <= validfrom) validtill.setDate(validtill.getDate() + 1);
  } else {
    validtill.setMinutes(validtill.getMinutes() + (number(classInfo.durationminutes) || 60));
  }
  return { validfrom, validtill };
};
const formatValidity = (date) => date ? date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "";

const classFields = [
  "academicyear",
  "regulation",
  "program",
  "programcode",
  "type",
  "major",
  "semester",
  "section",
  "classgroup",
  "specialization",
  "course",
  "coursecode",
  "faculty",
  "facultyemail",
  "classdate",
  "classtime",
  "period",
  "status"
];

const studentSelect = "name email phone regno rollno admissionyear academicyear program programcode regulation Major Minor semester section category gender department photo colid";

const buildClassFilter = (source = {}) => {
  const filter = {};
  classFields.forEach((field) => {
    if (field === "facultyemail") return;
    if (source[field]) filter[field] = text(source[field]);
  });
  return filter;
};

exports.getFacultyAttendanceContext = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const facultyemail = text(req.query.facultyemail || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!facultyemail) return res.status(400).json({ success: false, message: "faculty email is required" });

    const assignments = await WorkloadAssignment.find({
      colid,
      facultyemail: regexText(facultyemail),
      status: /^Active$/i
    }).sort({ academicyear: -1, semester: 1, course: 1 }).lean();

    const courseCodes = [...new Set(assignments.map((item) => text(item.coursecode)).filter(Boolean))];
    const timetableQuery = {
      colid,
      ...(courseCodes.length ? { coursecode: { $in: courseCodes } } : {}),
      ...buildClassFilter(req.query)
    };

    const classes = await NepLmsTimetable.find(timetableQuery).sort({ classdate: 1, classtime: 1 }).lean();
    res.json({ success: true, assignments, classes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentsForAttendance = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid, role: /^Student$/i };
    if (req.query.academicyear) query.academicyear = text(req.query.academicyear);
    if (req.query.semester) query.semester = text(req.query.semester);
    if (req.query.major) query.Major = text(req.query.major);
    if (req.query.programcode) query.programcode = text(req.query.programcode);
    if (req.query.section) query.section = text(req.query.section);
    if (req.query.name) query.name = new RegExp(text(req.query.name), "i");
    if (req.query.email) query.email = new RegExp(text(req.query.email), "i");
    if (req.query.phone) query.phone = new RegExp(text(req.query.phone), "i");
    if (req.query.regno) query.regno = new RegExp(text(req.query.regno), "i");
    if (req.query.category) query.category = text(req.query.category);
    if (req.query.gender) query.gender = text(req.query.gender);

    const [students, attendanceRows] = await Promise.all([
      User.find(query).select(studentSelect).sort({ name: 1, regno: 1 }).lean(),
      req.query.classid
        ? NepLmsAttendance.find({ colid, classid: req.query.classid, type: text(req.query.type) || "Regular" }).lean()
        : []
    ]);

    const attendanceByStudent = new Map(attendanceRows.map((row) => [String(row.studentid), row]));
    const data = students.map((student) => {
      const attendance = attendanceByStudent.get(String(student._id));
      return {
        ...student,
        existingAttendance: attendance?.attendance,
        attendanceId: attendance?._id,
        attendanceComments: attendance?.comments || "",
        changereason: attendance?.changereason || "",
        changedby: attendance?.changedby || "",
        changedat: attendance?.changedat || ""
      };
    });

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getClassGroupStudentsForAttendance = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.query.groupname) return res.status(400).json({ success: false, message: "groupname is required" });

    const query = { colid, groupname: text(req.query.groupname) };
    ["academicyear", "regulation", "programcode", "semester", "coursecode", "facultyemail"].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });

    const [groupRows, attendanceRows] = await Promise.all([
      NepLmsClassGroup.find(query).sort({ student: 1, regno: 1 }).lean(),
      req.query.classid
        ? NepLmsAttendance.find({ colid, classid: req.query.classid, type: text(req.query.type) || "Regular" }).lean()
        : []
    ]);

    const attendanceByStudent = new Map(attendanceRows.map((row) => [String(row.studentid), row]));
    const data = groupRows.map((row) => {
      const studentKey = String(row.studentid || row._id);
      const attendance = attendanceByStudent.get(studentKey);
      return {
        _id: row.studentid || row._id,
        classgroupid: row._id,
        name: row.student,
        email: row.studentemail,
        phone: row.studentphone,
        regno: row.regno,
        programcode: row.programcode,
        regulation: row.regulation,
        Major: row.subject,
        semester: row.semester,
        section: row.section,
        category: row.category,
        gender: row.gender,
        existingAttendance: attendance?.attendance,
        attendanceId: attendance?._id,
        attendanceComments: attendance?.comments || ""
      };
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAttendance = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const classInfo = req.body.classInfo || {};
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    const attendanceType = text(req.body.type) || "Regular";
    const comments = text(req.body.comments);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!classInfo._id && !classInfo.classid) return res.status(400).json({ success: false, message: "Class is required" });
    if (!students.length) return res.status(400).json({ success: false, message: "Select at least one student" });

    const classid = classInfo._id || classInfo.classid;
    const saved = [];
    for (const item of students) {
      const studentid = item.studentid || item._id;
      if (!studentid) continue;
      const payload = {
        classid,
        studentid,
        student: text(item.student || item.name),
        studentemail: text(item.studentemail || item.email),
        studentphone: text(item.studentphone || item.phone),
        regno: text(item.regno),
        rollno: text(item.rollno),
        program: text(classInfo.program),
        programcode: text(classInfo.programcode || item.programcode),
        academicyear: text(classInfo.academicyear),
        semester: text(classInfo.semester || item.semester),
        section: text(classInfo.section || item.section),
        classgroup: text(classInfo.classgroup || item.groupname),
        enrollmentgroup: text(classInfo.enrollmentgroup || item.enrollmentgroup),
        enrollmentgroupid: classInfo.enrollmentgroupid || item.enrollmentgroupid || undefined,
        specialization: text(classInfo.specialization || item.specialization),
        major: text(classInfo.major || item.Major),
        faculty: text(classInfo.faculty),
        facultyemail: text(classInfo.facultyemail),
        course: text(classInfo.course),
        coursecode: text(classInfo.coursecode),
        classdate: text(classInfo.classdate),
        classtime: text(classInfo.classtime),
        attendance: Number(item.attendance) === 0 ? 0 : 1,
        type: attendanceType,
        comments,
        colid,
        user: text(req.body.user)
      };
      const row = await NepLmsAttendance.findOneAndUpdate(
        { colid, classid, studentid, type: attendanceType },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(row);
    }

    if (req.body.raiseActivityEvent) {
      emitActivityEvent({
        colid,
        academicyear: text(classInfo.academicyear),
        activity: "Attendance",
        role: text(req.body.role) || "Faculty",
        user: text(req.body.user),
        username: text(classInfo.faculty),
        useremail: text(classInfo.facultyemail || req.body.user),
        date: text(classInfo.classdate) || new Date().toISOString().slice(0, 10),
        source: "neplmsattendance",
        sourceid: `${classid}-${attendanceType}-${text(classInfo.facultyemail || req.body.user)}`
      });
    }

    res.json({ success: true, saved: saved.length, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const attendancePayloadFrom = ({ colid, classInfo, item, attendanceType, attendance, comments, user, changereason }) => ({
  classid: classInfo._id || classInfo.classid,
  studentid: item.studentid || item._id,
  student: text(item.student || item.name),
  studentemail: text(item.studentemail || item.email),
  studentphone: text(item.studentphone || item.phone),
  regno: text(item.regno),
  rollno: text(item.rollno),
  program: text(classInfo.program),
  programcode: text(classInfo.programcode || item.programcode),
  academicyear: text(classInfo.academicyear || item.academicyear),
  semester: text(classInfo.semester || item.semester),
  section: text(classInfo.section || item.section),
  classgroup: text(classInfo.classgroup || item.groupname),
  enrollmentgroup: text(classInfo.enrollmentgroup || item.enrollmentgroup),
  enrollmentgroupid: classInfo.enrollmentgroupid || item.enrollmentgroupid || undefined,
  major: text(classInfo.major || item.Major),
  faculty: text(classInfo.faculty),
  facultyemail: text(classInfo.facultyemail),
  course: text(classInfo.course),
  coursecode: text(classInfo.coursecode),
  classdate: text(classInfo.classdate),
  classtime: text(classInfo.classtime),
  attendance: Number(attendance) === 0 ? 0 : 1,
  type: attendanceType,
  comments: text(comments),
  changereason: text(changereason),
  changedby: changereason ? text(user) : undefined,
  changedat: changereason ? new Date() : undefined,
  colid,
  user: text(user)
});

exports.createAttendanceOtps = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const classInfo = req.body.classInfo || {};
    const attendanceType = text(req.body.type) || "Regular";
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!classInfo._id && !classInfo.classid) return res.status(400).json({ success: false, message: "Class is required" });
    const validity = buildOtpValidityWindow(classInfo);
    if (!validity.validfrom || !validity.validtill) {
      return res.status(400).json({ success: false, message: "Class date and class time are required to create period-valid OTPs" });
    }
    const now = new Date();
    if (now < validity.validfrom) {
      return res.status(400).json({
        success: false,
        message: `OTP can be generated only during the class period. This class starts at ${formatValidity(validity.validfrom)}.`
      });
    }
    if (now > validity.validtill) {
      return res.status(400).json({
        success: false,
        message: `OTP cannot be generated because the class period ended at ${formatValidity(validity.validtill)}.`
      });
    }
    const otps = Array.from({ length: 6 }, randomOtp);
    const classid = classInfo._id || classInfo.classid;
    await NepLmsAttendanceOtp.updateMany({ colid, classid, type: attendanceType, status: "Active" }, { status: "Closed" });
    const data = await NepLmsAttendanceOtp.create({
      classid,
      otps,
      academicyear: text(classInfo.academicyear),
      program: text(classInfo.program),
      programcode: text(classInfo.programcode),
      semester: text(classInfo.semester),
      major: text(classInfo.major),
      faculty: text(classInfo.faculty),
      facultyemail: text(classInfo.facultyemail),
      course: text(classInfo.course),
      coursecode: text(classInfo.coursecode),
      classdate: text(classInfo.classdate),
      classtime: text(classInfo.classtime),
      durationminutes: number(classInfo.durationminutes) || 0,
      validfrom: validity.validfrom,
      validtill: validity.validtill,
      type: attendanceType,
      status: "Active",
      colid,
      user: text(req.body.user),
      createdby: text(req.body.user)
    });
    res.json({ success: true, data, otps, validfrom: validity.validfrom, validtill: validity.validtill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentOtpSessions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const regno = text(req.query.regno);
    const email = text(req.query.email || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno && !email) return res.status(400).json({ success: false, message: "student regno or email is required" });
    const student = await User.findOne({
      colid,
      role: /^Student$/i,
      ...(regno ? { regno } : { email: regexText(email) })
    }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const query = {
      colid,
      status: "Active",
      academicyear: text(student.academicyear),
      programcode: text(student.programcode),
      semester: text(student.semester)
    };
    if (text(student.Major)) query.major = text(student.Major);
    await NepLmsAttendanceOtp.updateMany({ colid, status: "Active", validtill: { $lt: new Date() } }, { status: "Expired" });
    query.validfrom = { $lte: new Date() };
    query.validtill = { $gte: new Date() };
    const data = await NepLmsAttendanceOtp.find(query).sort({ createdAt: -1 }).select("-otps").lean();
    res.json({ success: true, student, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitStudentOtps = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const sessionid = text(req.body.sessionid);
    const submittedOtps = Array.isArray(req.body.otps) ? req.body.otps.map(text) : [];
    const regno = text(req.body.regno);
    const email = text(req.body.email || req.body.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!sessionid) return res.status(400).json({ success: false, message: "OTP session is required" });
    if (submittedOtps.length !== 6 || submittedOtps.some((otp) => !/^\d{6}$/.test(otp))) {
      return res.status(400).json({ success: false, message: "Enter all six 6 digit OTPs" });
    }
    const session = await NepLmsAttendanceOtp.findOne({ _id: sessionid, colid, status: "Active" }).lean();
    if (!session) return res.status(404).json({ success: false, message: "Active OTP session not found" });
    const now = new Date();
    if (session.validfrom && now < new Date(session.validfrom)) {
      return res.status(400).json({ success: false, message: `OTP is valid only from ${formatValidity(new Date(session.validfrom))}.` });
    }
    if (session.validtill && now > new Date(session.validtill)) {
      await NepLmsAttendanceOtp.updateOne({ _id: session._id, colid }, { status: "Expired" });
      return res.status(400).json({ success: false, message: `OTP expired at ${formatValidity(new Date(session.validtill))}. Attendance cannot be marked after the class period.` });
    }
    const matches = session.otps.every((otp, index) => text(otp) === submittedOtps[index]);
    if (!matches) return res.status(400).json({ success: false, message: "OTP values do not match" });
    const student = await User.findOne({
      colid,
      role: /^Student$/i,
      ...(regno ? { regno } : { email: regexText(email) })
    }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    if (
      text(student.academicyear) !== text(session.academicyear)
      || text(student.programcode) !== text(session.programcode)
      || text(student.semester) !== text(session.semester)
      || (text(session.major) && text(student.Major) !== text(session.major))
    ) {
      return res.status(400).json({ success: false, message: "This OTP session is not for the selected student/class" });
    }
    const classInfo = {
      _id: session.classid,
      academicyear: session.academicyear,
      program: session.program,
      programcode: session.programcode,
      semester: session.semester,
      major: session.major,
      faculty: session.faculty,
      facultyemail: session.facultyemail,
      course: session.course,
      coursecode: session.coursecode,
      classdate: session.classdate,
      classtime: session.classtime
    };
    const payload = attendancePayloadFrom({
      colid,
      classInfo,
      item: student,
      attendanceType: text(session.type) || "Regular",
      attendance: 1,
      comments: "OTP attendance",
      user: email || regno
    });
    const data = await NepLmsAttendance.findOneAndUpdate(
      { colid, classid: session.classid, studentid: student._id, type: payload.type },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, message: "Attendance marked present", data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.changeAttendanceStatus = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const classInfo = req.body.classInfo || {};
    const student = req.body.student || {};
    const attendanceType = text(req.body.type) || "Regular";
    const reason = text(req.body.reason);
    const attendance = Number(req.body.attendance) === 0 ? 0 : 1;
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!classInfo._id && !classInfo.classid) return res.status(400).json({ success: false, message: "Class is required" });
    if (!student.studentid && !student._id) return res.status(400).json({ success: false, message: "Student is required" });
    if (!reason) return res.status(400).json({ success: false, message: "Reason is required when changing status" });
    const payload = attendancePayloadFrom({
      colid,
      classInfo,
      item: student,
      attendanceType,
      attendance,
      comments: text(req.body.comments) || "Attendance status changed",
      user: req.body.user,
      changereason: reason
    });
    const data = await NepLmsAttendance.findOneAndUpdate(
      { colid, classid: payload.classid, studentid: payload.studentid, type: attendanceType },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    [
      "academicyear",
      "program",
      "programcode",
      "semester",
      "major",
      "facultyemail",
      "coursecode",
      "classdate",
      "type",
      "regno"
    ].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });
    const data = await NepLmsAttendance.find(query).sort({ classdate: -1, classtime: 1, student: 1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentwiseAttendanceReport = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    [
      "academicyear",
      "program",
      "programcode",
      "semester",
      "major",
      "course",
      "coursecode",
      "facultyemail",
      "type"
    ].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });

    const data = await NepLmsAttendance.find(query).sort({ student: 1, classdate: 1, classtime: 1 }).lean();
    const map = new Map();
    data.forEach((row) => {
      const key = String(row.studentid || row.regno || row.student || "");
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          studentid: row.studentid,
          student: row.student || "",
          regno: row.regno || "",
          email: row.studentemail || "",
          phone: row.studentphone || "",
          program: row.program || "",
          programcode: row.programcode || "",
          academicyear: row.academicyear || "",
          semester: row.semester || "",
          major: row.major || "",
          total: 0,
          present: 0,
          absent: 0,
          percentage: 0
        });
      }
      const item = map.get(key);
      item.total += 1;
      if (Number(row.attendance) === 1) item.present += 1;
      else item.absent += 1;
      item.percentage = item.total ? Number(((item.present / item.total) * 100).toFixed(2)) : 0;
    });

    const rows = [...map.values()].sort((a, b) => String(a.student).localeCompare(String(b.student)));
    const summary = {
      totalStudents: rows.length,
      totalClasses: data.length,
      present: data.filter((row) => Number(row.attendance) === 1).length,
      absent: data.filter((row) => Number(row.attendance) !== 1).length
    };
    summary.percentage = summary.totalClasses ? Number(((summary.present / summary.totalClasses) * 100).toFixed(2)) : 0;

    const groupRows = (field) => [...data.reduce((acc, row) => {
      const key = row[field] || "-";
      const current = acc.get(key) || { name: key, total: 0, present: 0, absent: 0, percentage: 0 };
      current.total += 1;
      if (Number(row.attendance) === 1) current.present += 1;
      else current.absent += 1;
      current.percentage = current.total ? Number(((current.present / current.total) * 100).toFixed(2)) : 0;
      acc.set(key, current);
      return acc;
    }, new Map()).values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const uniq = (field) => [...new Set(data.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    res.json({
      success: true,
      rows,
      raw: data,
      summary,
      charts: {
        byCourse: groupRows("coursecode"),
        bySemester: groupRows("semester"),
        byProgram: groupRows("programcode"),
        presentAbsent: [
          { name: "Present", value: summary.present },
          { name: "Absent", value: summary.absent }
        ]
      },
      options: {
        academicyear: uniq("academicyear"),
        program: uniq("program"),
        programcode: uniq("programcode"),
        semester: uniq("semester"),
        major: uniq("major"),
        course: uniq("course"),
        coursecode: uniq("coursecode"),
        type: uniq("type")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentCoursewiseAttendanceReport = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid };
    [
      "academicyear",
      "program",
      "programcode",
      "semester",
      "major",
      "course",
      "coursecode",
      "faculty",
      "facultyemail",
      "type"
    ].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });
    if (req.query.name || req.query.student) query.student = new RegExp(text(req.query.name || req.query.student), "i");
    if (req.query.email) query.studentemail = new RegExp(text(req.query.email), "i");
    if (req.query.regno) query.regno = new RegExp(text(req.query.regno), "i");

    const data = await NepLmsAttendance.find(query).sort({ student: 1, coursecode: 1, classdate: 1, classtime: 1 }).lean();

    const studentMap = new Map();
    data.forEach((row) => {
      const key = String(row.studentid || row.regno || row.studentemail || row.student || "");
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          id: key,
          studentid: row.studentid,
          student: row.student || "",
          regno: row.regno || "",
          email: row.studentemail || "",
          phone: row.studentphone || "",
          academicyear: row.academicyear || "",
          program: row.program || "",
          programcode: row.programcode || "",
          semester: row.semester || "",
          major: row.major || "",
          total: 0,
          present: 0,
          absent: 0,
          percentage: 0
        });
      }
      const item = studentMap.get(key);
      item.total += 1;
      if (Number(row.attendance) === 1) item.present += 1;
      else item.absent += 1;
      item.percentage = item.total ? Number(((item.present / item.total) * 100).toFixed(2)) : 0;
    });

    const students = [...studentMap.values()].sort((a, b) => String(a.student).localeCompare(String(b.student)));
    const selectedKey = text(req.query.studentid || req.query.selectedStudentId || req.query.selectedStudent || "");
    const selectedRegno = text(req.query.selectedRegno || "");
    const selectedEmail = text(req.query.selectedEmail || "");
    const selectedStudent = students.find((item) => (
      (selectedKey && String(item.id) === selectedKey)
      || (selectedKey && String(item.studentid) === selectedKey)
      || (selectedRegno && text(item.regno).toLowerCase() === selectedRegno.toLowerCase())
      || (selectedEmail && text(item.email).toLowerCase() === selectedEmail.toLowerCase())
    )) || null;

    const selectedRows = selectedStudent
      ? data.filter((row) => {
        const key = String(row.studentid || row.regno || row.studentemail || row.student || "");
        return key === String(selectedStudent.id)
          || (selectedStudent.studentid && String(row.studentid) === String(selectedStudent.studentid))
          || (selectedStudent.regno && text(row.regno).toLowerCase() === text(selectedStudent.regno).toLowerCase())
          || (selectedStudent.email && text(row.studentemail).toLowerCase() === text(selectedStudent.email).toLowerCase());
      })
      : [];

    const courseMap = new Map();
    selectedRows.forEach((row) => {
      const key = [
        row.coursecode || row.course || "",
        row.academicyear || "",
        row.programcode || "",
        row.semester || "",
        row.major || "",
        row.type || ""
      ].join("||");
      if (!courseMap.has(key)) {
        courseMap.set(key, {
          id: key,
          course: row.course || "",
          coursecode: row.coursecode || "",
          academicyear: row.academicyear || "",
          program: row.program || "",
          programcode: row.programcode || "",
          semester: row.semester || "",
          major: row.major || "",
          type: row.type || "",
          totalClasses: 0,
          classesAttended: 0,
          classesAbsent: 0,
          percentage: 0
        });
      }
      const item = courseMap.get(key);
      item.totalClasses += 1;
      if (Number(row.attendance) === 1) item.classesAttended += 1;
      else item.classesAbsent += 1;
      item.percentage = item.totalClasses ? Number(((item.classesAttended / item.totalClasses) * 100).toFixed(2)) : 0;
    });

    const courseRows = [...courseMap.values()].sort((a, b) => String(a.coursecode || a.course).localeCompare(String(b.coursecode || b.course)));
    const summary = {
      totalCourses: courseRows.length,
      totalClasses: selectedRows.length,
      classesAttended: selectedRows.filter((row) => Number(row.attendance) === 1).length,
      classesAbsent: selectedRows.filter((row) => Number(row.attendance) !== 1).length
    };
    summary.percentage = summary.totalClasses ? Number(((summary.classesAttended / summary.totalClasses) * 100).toFixed(2)) : 0;

    const uniq = (field) => [...new Set(data.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    res.json({
      success: true,
      students,
      selectedStudent,
      rows: courseRows,
      raw: selectedRows,
      summary,
      charts: {
        courseAttendance: courseRows.map((row) => ({
          name: row.coursecode || row.course || "-",
          percentage: row.percentage,
          totalClasses: row.totalClasses,
          classesAttended: row.classesAttended
        })),
        presentAbsent: [
          { name: "Attended", value: summary.classesAttended },
          { name: "Absent", value: summary.classesAbsent }
        ]
      },
      options: {
        academicyear: uniq("academicyear"),
        program: uniq("program"),
        programcode: uniq("programcode"),
        semester: uniq("semester"),
        major: uniq("major"),
        course: uniq("course"),
        coursecode: uniq("coursecode"),
        name: [...new Set(data.map((row) => text(row.student)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        email: [...new Set(data.map((row) => text(row.studentemail)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        regno: uniq("regno"),
        type: uniq("type")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyStudentAttendanceSummary = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const regno = text(req.query.regno);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });

    const query = { colid, regno: regexText(regno) };
    ["academicyear", "semester", "course", "coursecode", "type"].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });

    const data = await NepLmsAttendance.find(query).sort({ semester: 1, coursecode: 1, classdate: 1, classtime: 1 }).lean();
    const student = data[0] ? {
      student: data[0].student || "",
      regno: data[0].regno || "",
      email: data[0].studentemail || "",
      phone: data[0].studentphone || "",
      program: data[0].program || "",
      programcode: data[0].programcode || "",
      academicyear: data[0].academicyear || "",
      major: data[0].major || ""
    } : {};

    const courseMap = new Map();
    data.forEach((row) => {
      const key = [row.semester || "", row.coursecode || row.course || "", row.type || ""].join("||");
      if (!courseMap.has(key)) {
        courseMap.set(key, {
          id: key,
          academicyear: row.academicyear || "",
          semester: row.semester || "",
          program: row.program || "",
          programcode: row.programcode || "",
          major: row.major || "",
          course: row.course || "",
          coursecode: row.coursecode || "",
          faculty: row.faculty || "",
          facultyemail: row.facultyemail || "",
          type: row.type || "",
          totalClasses: 0,
          present: 0,
          absent: 0,
          percentage: 0
        });
      }
      const item = courseMap.get(key);
      item.totalClasses += 1;
      if (Number(row.attendance) === 1) item.present += 1;
      else item.absent += 1;
      item.percentage = item.totalClasses ? Number(((item.present / item.totalClasses) * 100).toFixed(2)) : 0;
    });

    const rows = [...courseMap.values()].sort((a, b) => (
      String(a.semester).localeCompare(String(b.semester), undefined, { numeric: true })
      || String(a.coursecode || a.course).localeCompare(String(b.coursecode || b.course))
    ));
    const summary = {
      totalCourses: rows.length,
      totalClasses: data.length,
      present: data.filter((row) => Number(row.attendance) === 1).length,
      absent: data.filter((row) => Number(row.attendance) !== 1).length
    };
    summary.percentage = summary.totalClasses ? Number(((summary.present / summary.totalClasses) * 100).toFixed(2)) : 0;

    const groupRows = (field) => [...data.reduce((acc, row) => {
      const key = row[field] || "-";
      const current = acc.get(key) || { name: key, total: 0, present: 0, absent: 0, percentage: 0 };
      current.total += 1;
      if (Number(row.attendance) === 1) current.present += 1;
      else current.absent += 1;
      current.percentage = current.total ? Number(((current.present / current.total) * 100).toFixed(2)) : 0;
      acc.set(key, current);
      return acc;
    }, new Map()).values()].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

    const detailRows = data.map((row) => ({
      id: String(row._id),
      academicyear: row.academicyear || "",
      semester: row.semester || "",
      course: row.course || "",
      coursecode: row.coursecode || "",
      faculty: row.faculty || "",
      facultyemail: row.facultyemail || "",
      classdate: row.classdate || "",
      classtime: row.classtime || "",
      type: row.type || "",
      attendance: Number(row.attendance) === 1 ? 1 : 0,
      status: Number(row.attendance) === 1 ? "Present" : "Absent",
      comments: row.comments || ""
    }));

    const uniq = (field) => [...new Set(data.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    res.json({
      success: true,
      student,
      rows,
      detailRows,
      summary,
      charts: {
        bySemester: groupRows("semester"),
        byCourse: rows.map((row) => ({ name: row.coursecode || row.course || "-", percentage: row.percentage, total: row.totalClasses, present: row.present })),
        presentAbsent: [
          { name: "Present", value: summary.present },
          { name: "Absent", value: summary.absent }
        ]
      },
      options: {
        academicyear: uniq("academicyear"),
        semester: uniq("semester"),
        course: uniq("course"),
        coursecode: uniq("coursecode"),
        type: uniq("type")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFacultyCoursewiseLowAttendanceReport = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const threshold = Number(req.query.threshold || 75);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    [
      "academicyear",
      "program",
      "programcode",
      "semester",
      "major",
      "course",
      "coursecode",
      "faculty",
      "facultyemail",
      "type"
    ].forEach((field) => {
      if (req.query[field]) query[field] = text(req.query[field]);
    });

    const data = await NepLmsAttendance.find(query).sort({ faculty: 1, coursecode: 1, classdate: 1 }).lean();
    const map = new Map();
    data.forEach((row) => {
      const key = [
        row.facultyemail || row.faculty || "",
        row.coursecode || "",
        row.programcode || "",
        row.semester || "",
        row.major || "",
        row.academicyear || ""
      ].join("||");
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          faculty: row.faculty || "",
          facultyemail: row.facultyemail || "",
          course: row.course || "",
          coursecode: row.coursecode || "",
          program: row.program || "",
          programcode: row.programcode || "",
          academicyear: row.academicyear || "",
          semester: row.semester || "",
          major: row.major || "",
          total: 0,
          present: 0,
          absent: 0,
          averageAttendance: 0
        });
      }
      const item = map.get(key);
      item.total += 1;
      if (Number(row.attendance) === 1) item.present += 1;
      else item.absent += 1;
      item.averageAttendance = item.total ? Number(((item.present / item.total) * 100).toFixed(2)) : 0;
    });

    const allRows = [...map.values()].sort((a, b) => (
      String(a.faculty).localeCompare(String(b.faculty))
      || String(a.coursecode).localeCompare(String(b.coursecode))
    ));
    const rows = allRows.filter((row) => Number(row.averageAttendance || 0) < threshold);

    const groupRows = (items, field) => [...items.reduce((acc, row) => {
      const key = row[field] || "-";
      const current = acc.get(key) || { name: key, courses: 0, total: 0, present: 0, absent: 0, averageAttendance: 0 };
      current.courses += 1;
      current.total += Number(row.total || 0);
      current.present += Number(row.present || 0);
      current.absent += Number(row.absent || 0);
      current.averageAttendance = current.total ? Number(((current.present / current.total) * 100).toFixed(2)) : 0;
      acc.set(key, current);
      return acc;
    }, new Map()).values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const uniq = (field) => [...new Set(data.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const summary = {
      totalCourseRows: allRows.length,
      lowCourseRows: rows.length,
      totalEntries: rows.reduce((sum, row) => sum + Number(row.total || 0), 0),
      present: rows.reduce((sum, row) => sum + Number(row.present || 0), 0),
      absent: rows.reduce((sum, row) => sum + Number(row.absent || 0), 0),
      threshold
    };
    summary.averageAttendance = summary.totalEntries ? Number(((summary.present / summary.totalEntries) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      rows,
      allRows,
      summary,
      charts: {
        byFaculty: groupRows(rows, "faculty"),
        byCourse: groupRows(rows, "coursecode"),
        byProgram: groupRows(rows, "programcode"),
        thresholdSummary: [
          { name: "Below Threshold", value: rows.length },
          { name: "At or Above", value: Math.max(allRows.length - rows.length, 0) }
        ]
      },
      options: {
        academicyear: uniq("academicyear"),
        program: uniq("program"),
        programcode: uniq("programcode"),
        semester: uniq("semester"),
        major: uniq("major"),
        course: uniq("course"),
        coursecode: uniq("coursecode"),
        faculty: uniq("faculty"),
        facultyemail: uniq("facultyemail"),
        type: uniq("type")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
