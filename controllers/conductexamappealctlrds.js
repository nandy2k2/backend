const AppealWorkflow = require("../Models/conductexamappealworkflowds");
const AppealRequest = require("../Models/conductexamappealrequestds");
const AppealAllotment = require("../Models/conductexamappealallotmentds");
const AppealMarks = require("../Models/conductexamappealmarksds");
const ConductExamFee = require("../Models/conductexamfeeds");
const ConductExaminer = require("../Models/conductexamexaminerds");
const ExamMarks = require("../Models/examinationmodel2marksds");
const ExamVivaMarks = require("../Models/examinationmodel2vivamarksds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const ConductExamCourse = require("../Models/conductexamcourseds");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniqueSorted = (values) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const workflowPayload = (body = {}) => ({
  colid: num(body.colid),
  academicyear: text(body.academicyear),
  program: text(body.program),
  programcode: text(body.programcode),
  level: num(body.level, 1),
  role: text(body.role),
  approvername: text(body.approvername || body.name),
  approveremail: text(body.approveremail || body.email),
  status: text(body.status) || "Active",
  user: text(body.user)
});

const requestPayload = (body = {}) => ({
  colid: num(body.colid),
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  exam: text(body.exam),
  examcode: text(body.examcode),
  program: text(body.program),
  programcode: text(body.programcode),
  course: text(body.course),
  coursecode: text(body.coursecode),
  semester: text(body.semester),
  type: text(body.type) || "Theory",
  component: text(body.component),
  student: text(body.student),
  studentemail: text(body.studentemail),
  regno: text(body.regno),
  fee: num(body.fee),
  approvalstatus: text(body.approvalstatus) || "Submitted",
  currentlevel: num(body.currentlevel, 1),
  remarks: text(body.remarks),
  user: text(body.user)
});

const buildFilter = (source = {}, fields = []) => {
  const filter = {};
  const colid = num(source.colid);
  if (colid) filter.colid = colid;
  fields.forEach((field) => {
    const value = source[field];
    if (Array.isArray(value) && value.length) filter[field] = { $in: value.map(text).filter(Boolean) };
    else if (text(value)) filter[field] = text(value);
  });
  if (text(source.fromdate) || text(source.todate)) {
    filter.createdAt = {};
    if (text(source.fromdate)) filter.createdAt.$gte = new Date(`${text(source.fromdate)}T00:00:00`);
    if (text(source.todate)) filter.createdAt.$lte = new Date(`${text(source.todate)}T23:59:59`);
  }
  return filter;
};

const requestFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "course", "coursecode", "semester", "type", "component", "student", "regno", "approvalstatus"];

const getInstitution = async (colid) => Institution.findOne({ colid }).sort({ _id: -1 }).lean();

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [courses, programs, workflows, requests, users, examiners, institution] = await Promise.all([
      ConductExamCourse.find({ colid }).sort({ academicyear: -1, program: 1, semester: 1, course: 1 }).lean(),
      MPrograms.find({ colid }).sort({ year: -1, program: 1 }).lean(),
      AppealWorkflow.find({ colid }).sort({ academicyear: -1, programcode: 1, level: 1 }).lean(),
      AppealRequest.find({ colid }).sort({ createdAt: -1 }).limit(1000).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email role department").sort({ name: 1 }).lean(),
      ConductExaminer.find({ colid }).sort({ examinername: 1 }).lean(),
      getInstitution(colid)
    ]);
    res.json({
      success: true,
      courses,
      programs,
      workflows,
      requests,
      users,
      examiners,
      institution,
      academicyears: uniqueSorted([...courses.map((row) => row.academicyear), ...requests.map((row) => row.academicyear)]),
      regulations: uniqueSorted([...courses.map((row) => row.regulation), ...requests.map((row) => row.regulation)]),
      exams: uniqueSorted([...courses.map((row) => `${row.examcode}||${row.exam}`), ...requests.map((row) => `${row.examcode}||${row.exam}`)]),
      programsList: uniqueSorted([...courses.map((row) => `${row.programcode}||${row.program}`), ...programs.map((row) => `${row.programcode}||${row.program || row.name || ""}`)]).map((value) => {
        const [programcode, program] = value.split("||");
        return { programcode, program };
      }),
      semesters: uniqueSorted([...courses.map((row) => row.semester), ...requests.map((row) => row.semester)]),
      coursesList: uniqueSorted([...courses.map((row) => `${row.coursecode}||${row.course}`), ...requests.map((row) => `${row.coursecode}||${row.course}`)]).map((value) => {
        const [coursecode, course] = value.split("||");
        return { coursecode, course };
      }),
      roles: uniqueSorted(users.map((row) => row.role)).filter((role) => !/^student$/i.test(role))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveWorkflow = async (req, res) => {
  try {
    const payload = workflowPayload(req.body);
    const missing = ["colid", "academicyear", "programcode", "level"].filter((field) => !payload[field]);
    if (missing.length) return res.status(400).json({ success: false, message: `Missing: ${missing.join(", ")}` });
    const data = req.body.id
      ? await AppealWorkflow.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await AppealWorkflow.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, programcode: payload.programcode, level: payload.level },
        payload,
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.code === 11000 ? "Workflow level already exists" : err.message });
  }
};

exports.listWorkflow = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "programcode", "role", "approveremail", "status"]);
    const data = await AppealWorkflow.find(filter).sort({ academicyear: -1, programcode: 1, level: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteWorkflow = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await AppealWorkflow.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.studentCourses = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const regno = text(req.query.regno);
    const semester = text(req.query.semester);
    if (!colid || !regno || !semester) return res.status(400).json({ success: false, message: "colid, regno and semester are required" });
    const student = await User.findOne({ colid, $or: [{ regno }, { email: regno }, { email: text(req.query.email) }] }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const base = { colid, regno: student.regno || regno, semester };
    const marks = await ExamVivaMarks.find(base).sort({ academicyear: -1, examcode: 1, coursecode: 1 }).lean();
    const fallback = marks.length ? [] : await ExamMarks.find(base).sort({ academicyear: -1, examcode: 1, coursecode: 1 }).lean();
    const rows = (marks.length ? marks : fallback);
    const fees = await ConductExamFee.find({
      colid,
      status: { $ne: "Inactive" },
      programcode: student.programcode || { $exists: true },
      semester,
      coursecode: { $in: rows.map((row) => row.coursecode) }
    }).lean();
    const feeMap = new Map(fees.map((fee) => [`${fee.academicyear}||${fee.examcode}||${fee.programcode}||${fee.coursecode}`, fee]));
    const data = rows.map((row) => {
      const fee = feeMap.get(`${row.academicyear}||${row.examcode}||${row.programcode}||${row.coursecode}`)
        || fees.find((item) => item.coursecode === row.coursecode)
        || {};
      return { ...row, appealfee: num(fee.appealfee), studentemail: student.email || "" };
    });
    res.json({ success: true, student, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitRequests = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No appeal rows selected" });
    let saved = 0;
    const errors = [];
    for (let index = 0; index < items.length; index += 1) {
      const payload = requestPayload({ ...items[index], colid: req.body.colid, user: req.body.user });
      const missing = ["colid", "academicyear", "examcode", "programcode", "coursecode", "semester", "type", "regno"].filter((field) => !payload[field]);
      if (missing.length) {
        errors.push({ row: index + 1, message: `Missing ${missing.join(", ")}` });
        continue;
      }
      const firstWorkflow = await AppealWorkflow.findOne({ colid: payload.colid, academicyear: payload.academicyear, programcode: payload.programcode, status: { $ne: "Inactive" } }).sort({ level: 1 }).lean();
      payload.currentlevel = firstWorkflow?.level || 1;
      payload.approvalstatus = firstWorkflow ? "Pending" : "Approved";
      await AppealRequest.findOneAndUpdate(
        {
          colid: payload.colid,
          academicyear: payload.academicyear,
          examcode: payload.examcode,
          programcode: payload.programcode,
          semester: payload.semester,
          coursecode: payload.coursecode,
          regno: payload.regno,
          type: payload.type,
          component: payload.component
        },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.code === 11000 ? "Duplicate appeal request exists" : err.message });
  }
};

exports.listRequests = async (req, res) => {
  try {
    const filter = buildFilter(req.query, requestFields);
    if (text(req.query.approveremail)) {
      const levels = await AppealWorkflow.find({ colid: filter.colid, approveremail: text(req.query.approveremail), status: { $ne: "Inactive" } }).lean();
      filter.$or = levels.map((level) => ({ academicyear: level.academicyear, programcode: level.programcode, currentlevel: level.level, approvalstatus: "Pending" }));
      if (!filter.$or.length) return res.json({ success: true, data: [] });
    }
    const data = await AppealRequest.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data, institution: await getInstitution(filter.colid) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteRequests = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await AppealRequest.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approveRequests = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const action = text(req.body.action) || "Approved";
    const remarks = text(req.body.remarks);
    if (!ids.length) return res.status(400).json({ success: false, message: "Select appeal requests" });
    let updated = 0;
    for (const id of ids) {
      const request = await AppealRequest.findOne({ _id: id, colid: num(req.body.colid) });
      if (!request) continue;
      const currentLevel = request.currentlevel || 1;
      request.approvalhistory.push({
        level: currentLevel,
        approvername: text(req.body.approvername),
        approveremail: text(req.body.approveremail),
        status: action,
        remarks
      });
      if (/reject/i.test(action)) {
        request.approvalstatus = "Rejected";
      } else {
        const next = await AppealWorkflow.findOne({
          colid: request.colid,
          academicyear: request.academicyear,
          programcode: request.programcode,
          level: { $gt: currentLevel },
          status: { $ne: "Inactive" }
        }).sort({ level: 1 }).lean();
        if (next) {
          request.currentlevel = next.level;
          request.approvalstatus = "Pending";
        } else {
          request.approvalstatus = "Approved";
        }
      }
      await request.save();
      updated += 1;
    }
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.allocateRandom = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const filter = buildFilter(req.body, ["academicyear", "examcode", "programcode", "coursecode", "semester", "type", "component"]);
    filter.approvalstatus = "Approved";
    const selectedIds = Array.isArray(req.body.requestIds) ? req.body.requestIds : [];
    if (selectedIds.length) filter._id = { $in: selectedIds };
    const requests = await AppealRequest.find(filter).sort({ coursecode: 1, regno: 1 }).lean();
    const examiners = await ConductExaminer.find({
      colid,
      academicyear: text(req.body.academicyear),
      examcode: text(req.body.examcode),
      ...(text(req.body.programcode) ? { programcode: text(req.body.programcode) } : {}),
      ...(text(req.body.coursecode) ? { coursecode: text(req.body.coursecode) } : {})
    }).lean();
    if (!requests.length) return res.status(400).json({ success: false, message: "No approved appeal requests found" });
    if (!examiners.length) return res.status(400).json({ success: false, message: "No examiners found for selected exam/course" });
    let saved = 0;
    for (let index = 0; index < requests.length; index += 1) {
      const request = requests[index];
      const available = examiners.filter((examiner) => !request.coursecode || examiner.coursecode === request.coursecode);
      const examiner = (available.length ? available : examiners)[index % (available.length ? available.length : examiners.length)];
      await AppealAllotment.findOneAndUpdate(
        { colid, requestid: request._id, examineremail: examiner.examineremail },
        {
          colid,
          requestid: request._id,
          academicyear: request.academicyear,
          regulation: request.regulation,
          exam: request.exam,
          examcode: request.examcode,
          program: request.program,
          programcode: request.programcode,
          course: request.course,
          coursecode: request.coursecode,
          semester: request.semester,
          type: request.type,
          component: request.component,
          student: request.student,
          regno: request.regno,
          examinername: examiner.examinername,
          examineremail: examiner.examineremail,
          status: "Allotted",
          user: text(req.body.user)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listAllotments = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "course", "coursecode", "semester", "type", "component", "regno", "examineremail", "status"]);
    const data = await AppealAllotment.find(filter).sort({ createdAt: -1 }).lean();
    const marks = await AppealMarks.find({ colid: filter.colid, allotmentid: { $in: data.map((row) => row._id) } }).lean();
    const markMap = new Map(marks.map((row) => [String(row.allotmentid), row]));
    res.json({ success: true, data: data.map((row) => ({ ...row, markstatus: markMap.get(String(row._id))?.status || "Allotted", revisedmarks: markMap.get(String(row._id))?.revisedmarks ?? "" })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.reassignAllotments = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length || !text(req.body.examineremail)) return res.status(400).json({ success: false, message: "Select rows and examiner" });
    const examiner = await ConductExaminer.findOne({ colid: num(req.body.colid), examineremail: text(req.body.examineremail) }).lean();
    await AppealAllotment.updateMany(
      { _id: { $in: ids }, colid: num(req.body.colid) },
      { $set: { examinername: text(req.body.examinername || examiner?.examinername), examineremail: text(req.body.examineremail), status: "Reassigned", remarks: text(req.body.remarks) } }
    );
    res.json({ success: true, updated: ids.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const originalMarksFor = async (request) => {
  const query = {
    colid: request.colid,
    academicyear: request.academicyear,
    examcode: request.examcode,
    programcode: request.programcode,
    semester: request.semester,
    coursecode: request.coursecode,
    regno: request.regno
  };
  return await ExamVivaMarks.findOne(query).lean() || await ExamMarks.findOne(query).lean();
};

const originalValue = (row, type) => {
  if (/practical/i.test(type)) return num(row?.practicalmarks || row?.practicalobtained);
  if (/viva/i.test(type)) return num(row?.vivaobtained);
  return num(row?.theoryobtained);
};

const maxValue = (row, type) => {
  if (/practical/i.test(type)) return num(row?.practicaltotal);
  if (/viva/i.test(type)) return num(row?.vivatotal);
  return num(row?.theorymarks);
};

exports.saveMarks = async (req, res) => {
  try {
    const allotment = await AppealAllotment.findOne({ _id: req.body.allotmentid, colid: num(req.body.colid) }).lean();
    if (!allotment) return res.status(404).json({ success: false, message: "Allotment not found" });
    const original = await originalMarksFor(allotment);
    const status = text(req.body.status) || "Draft";
    const payload = {
      ...allotment,
      requestid: allotment.requestid,
      allotmentid: allotment._id,
      maxmarks: num(req.body.maxmarks, maxValue(original, allotment.type)),
      revisedmarks: num(req.body.revisedmarks),
      comments: text(req.body.comments),
      status,
      submitteddate: status === "Submitted" ? new Date() : undefined,
      user: text(req.body.user)
    };
    delete payload._id;
    const data = await AppealMarks.findOneAndUpdate({ colid: allotment.colid, allotmentid: allotment._id }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    await AppealAllotment.findOneAndUpdate({ _id: allotment._id }, { status });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.coeReview = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "course", "coursecode", "semester", "type", "component", "regno"]);
    const requests = await AppealRequest.find({ ...filter, approvalstatus: "Approved" }).sort({ regno: 1, coursecode: 1 }).lean();
    const marks = await AppealMarks.find({ colid: filter.colid, requestid: { $in: requests.map((row) => row._id) } }).lean();
    const byRequest = new Map();
    marks.forEach((mark) => {
      const key = String(mark.requestid);
      byRequest.set(key, [...(byRequest.get(key) || []), mark]);
    });
    const data = [];
    for (const request of requests) {
      const original = await originalMarksFor(request);
      const revisedRows = byRequest.get(String(request._id)) || [];
      const submitted = revisedRows.filter((row) => row.status === "Submitted");
      const average = submitted.length ? Number((submitted.reduce((sum, row) => sum + num(row.revisedmarks), 0) / submitted.length).toFixed(2)) : 0;
      const originalMark = originalValue(original, request.type);
      data.push({
        ...request,
        originalmarks: originalMark,
        maxmarks: maxValue(original, request.type),
        revisedmarkslist: revisedRows.map((row) => `${row.examinername}: ${row.revisedmarks} (${row.status})`).join("; "),
        submittedcount: submitted.length,
        average,
        deviation: Number((average - originalMark).toFixed(2))
      });
    }
    res.json({ success: true, data, institution: await getInstitution(filter.colid) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
