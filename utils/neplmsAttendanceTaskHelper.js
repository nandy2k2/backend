const AcademicNewTask = require("../Models/academicnewtaskds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseDate = (value) => {
  if (!text(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const taskLinkForClass = (row = {}) => {
  if (text(row.enrollmentgroupid)) return "/neplmsenrollmentattendance";
  if (text(row.classgroup)) return "/neplmsgroupattendance";
  if (text(row.specialization)) return "/specializationnewattendance";
  return "/neplmssectionwiseattendance";
};

async function completeAttendanceTask({ colid, classid, completedBy = "" }) {
  const scopedColid = number(colid);
  const id = text(classid);
  if (scopedColid === undefined || !id) return { modifiedCount: 0 };
  return AcademicNewTask.updateMany({
    colid: scopedColid,
    referenceModel: "neplmstimetableds",
    referenceId: id,
    referenceLevel: "Attendance",
    status: { $not: /^completed$/i }
  }, {
    status: "Completed",
    comments: `Attendance taken${completedBy ? ` by ${completedBy}` : ""}`
  });
}

async function hasAttendance(row) {
  return NepLmsAttendance.exists({ colid: row.colid, classid: row._id });
}

async function createMissingAttendanceTasks({ colid, fromdate, todate, academicyear, user }) {
  const scopedColid = number(colid);
  if (scopedColid === undefined) throw new Error("colid is required");
  const today = new Date();
  const query = { colid: scopedColid, status: { $not: /^cancelled$/i } };
  if (text(academicyear)) query.academicyear = text(academicyear);
  if (text(fromdate) || text(todate)) {
    query.classdate = {};
    if (text(fromdate)) query.classdate.$gte = text(fromdate);
    if (text(todate)) query.classdate.$lte = text(todate);
  } else {
    query.classdate = { $lte: today.toISOString().slice(0, 10) };
  }
  const classes = await NepLmsTimetable.find(query).sort({ classdate: 1, classtime: 1 }).limit(5000).lean();
  let created = 0;
  let skipped = 0;
  for (const row of classes) {
    if (!text(row.facultyemail)) {
      skipped += 1;
      continue;
    }
    if (await hasAttendance(row)) {
      await completeAttendanceTask({ colid: scopedColid, classid: row._id, completedBy: user });
      skipped += 1;
      continue;
    }
    const classDate = parseDate(row.classdate) || today;
    const existing = await AcademicNewTask.findOne({
      colid: scopedColid,
      referenceModel: "neplmstimetableds",
      referenceId: String(row._id),
      referenceLevel: "Attendance",
      status: { $not: /^completed$/i }
    }).lean();
    if (existing) {
      skipped += 1;
      continue;
    }
    await AcademicNewTask.create({
      colid: scopedColid,
      user: text(user),
      createdby: "Attendance audit agent",
      academicyear: text(row.academicyear),
      faculty: text(row.faculty),
      facultyemail: text(row.facultyemail),
      task: `Take attendance for ${text(row.course) || text(row.coursecode)} on ${text(row.classdate)} ${text(row.classtime)}`,
      category: "Attendance pending",
      criticality: "High",
      pagelink: taskLinkForClass(row),
      startdate: classDate,
      duedate: classDate,
      status: "New",
      comments: "Created automatically because no attendance record exists for this timetable class.",
      referenceModel: "neplmstimetableds",
      referenceId: String(row._id),
      referenceLevel: "Attendance"
    });
    created += 1;
  }
  return { scanned: classes.length, created, skipped };
}

async function completeTakenAttendanceTasks({ colid, user }) {
  const scopedColid = number(colid);
  if (scopedColid === undefined) throw new Error("colid is required");
  const tasks = await AcademicNewTask.find({
    colid: scopedColid,
    referenceModel: "neplmstimetableds",
    referenceLevel: "Attendance",
    status: { $not: /^completed$/i }
  }).limit(5000).lean();
  let completed = 0;
  for (const task of tasks) {
    const exists = await NepLmsAttendance.exists({ colid: scopedColid, classid: task.referenceId });
    if (exists) {
      await completeAttendanceTask({ colid: scopedColid, classid: task.referenceId, completedBy: user });
      completed += 1;
    }
  }
  return { scanned: tasks.length, completed };
}

module.exports = {
  completeAttendanceTask,
  createMissingAttendanceTasks,
  completeTakenAttendanceTasks
};
