const StudentCouncil = require("../Models/studentcouncilds");
const StudentCouncilMember = require("../Models/studentcouncilmemberds");
const StudentCouncilMeeting = require("../Models/studentcouncilmeetingds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const InsDetails = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const dateValue = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const scoped = (source = {}) => {
  const colid = num(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};
const toClient = (row) => {
  const item = row?.toObject ? row.toObject() : { ...(row || {}) };
  ["startdate", "enddate", "meetingdate"].forEach((field) => {
    if (item[field]) item[field] = new Date(item[field]).toISOString().slice(0, 10);
  });
  return item;
};
const applyTextFilters = (query, source, fields) => {
  fields.forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
};

const councilPayload = (source = {}) => {
  const payload = scoped(source);
  payload.user = text(source.user);
  payload.namecreated = text(source.namecreated || source.createdby || source.name);
  payload.academicyear = text(source.academicyear);
  payload.councilname = text(source.councilname);
  payload.startdate = dateValue(source.startdate);
  payload.enddate = dateValue(source.enddate);
  payload.status = text(source.status) || "Active";
  return payload;
};

const meetingPayload = async (source = {}) => {
  const payload = scoped(source);
  const council = await StudentCouncil.findOne({ _id: source.councilid, colid: payload.colid }).lean();
  if (!council) throw new Error("Student council is required");
  payload.user = text(source.user);
  payload.namecreated = text(source.namecreated || source.createdby || source.name);
  payload.academicyear = text(source.academicyear || council.academicyear);
  payload.councilid = council._id;
  payload.councilname = council.councilname;
  payload.meeting = text(source.meeting);
  payload.meetingdate = dateValue(source.meetingdate);
  payload.agenda = text(source.agenda);
  payload.discussion = text(source.discussion);
  payload.actionitems = text(source.actionitems);
  payload.issues = text(source.issues);
  payload.filelink = text(source.filelink);
  payload.filename = text(source.filename);
  payload.status = text(source.status) || "Active";
  return payload;
};

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [users, programs, councils, institution] = await Promise.all([
      User.find({ colid }).select("name email user role regno academicyear regulation program programcode semester section department").sort({ name: 1 }).limit(5000).lean(),
      MPrograms.find({ colid }).select("year regulation program programcode semester department faculty institution").sort({ year: -1, program: 1 }).lean(),
      StudentCouncil.find({ colid }).sort({ academicyear: -1, councilname: 1 }).lean(),
      InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null)
    ]);
    const students = users.filter((row) => String(row.role || "").toLowerCase() === "student");
    res.json({
      success: true,
      institution,
      academicyears: uniqueSorted([...programs.map((row) => row.year), ...students.map((row) => row.academicyear), ...councils.map((row) => row.academicyear)]),
      regulations: uniqueSorted([...programs.map((row) => row.regulation), ...students.map((row) => row.regulation)]),
      programs: uniqueSorted([...programs.map((row) => row.program), ...students.map((row) => row.program)]),
      programcodes: uniqueSorted([...programs.map((row) => row.programcode), ...students.map((row) => row.programcode)]),
      semesters: uniqueSorted([...programs.map((row) => row.semester), ...students.map((row) => row.semester)]),
      sections: uniqueSorted(students.map((row) => row.section)),
      positions: ["President", "Vice President", "Chairperson", "Secretary", "Joint Secretary", "Coordinator", "Treasurer", "Class Representative", "Member"],
      councils: councils.map((row) => ({ ...toClient(row), label: `${row.academicyear || ""} - ${row.councilname || ""}` }))
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listCouncils = async (req, res) => {
  try {
    const query = scoped(req.query);
    applyTextFilters(query, req.query, ["academicyear", "councilname", "status"]);
    const rows = await StudentCouncil.find(query).sort({ academicyear: -1, startdate: -1, councilname: 1 }).limit(5000).lean();
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveCouncil = async (req, res) => {
  try {
    const payload = councilPayload(req.body);
    if (!payload.academicyear || !payload.councilname) return res.status(400).json({ success: false, message: "Academic year and council name are required" });
    const row = req.body.id
      ? await StudentCouncil.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await StudentCouncil.create(payload);
    res.json({ success: true, row: toClient(row) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkCouncils = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => councilPayload({ ...row, colid: req.body.colid, user: req.body.user, namecreated: req.body.namecreated }));
    const result = docs.length ? await StudentCouncil.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: result.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteCouncils = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await Promise.all([
      StudentCouncil.deleteMany({ colid, _id: { $in: ids } }),
      StudentCouncilMember.deleteMany({ colid, councilid: { $in: ids } }),
      StudentCouncilMeeting.deleteMany({ colid, councilid: { $in: ids } })
    ]);
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const query = scoped(req.body);
    query.role = /^Student$/i;
    applyTextFilters(query, req.body, ["academicyear", "regulation", "program", "programcode", "semester", "section", "regno", "name"]);
    if (text(req.body.search)) {
      const search = regex(req.body.search);
      query.$or = [{ name: search }, { email: search }, { regno: search }, { program: search }, { programcode: search }];
    }
    const rows = await User.find(query).select("name email user regno academicyear regulation program programcode semester section phone").sort({ program: 1, semester: 1, name: 1 }).limit(5000).lean();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listMembers = async (req, res) => {
  try {
    const query = scoped(req.query);
    applyTextFilters(query, req.query, ["academicyear", "councilname", "student", "studentemail", "regno", "regulation", "program", "programcode", "semester", "section", "position", "status"]);
    if (text(req.query.councilid)) query.councilid = req.query.councilid;
    const rows = await StudentCouncilMember.find(query).sort({ councilname: 1, position: 1, student: 1 }).limit(5000).lean();
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveMembers = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const council = await StudentCouncil.findOne({ _id: req.body.councilid, colid }).lean();
    if (!council) return res.status(400).json({ success: false, message: "Select a student council" });
    const selected = Array.isArray(req.body.students) ? req.body.students : [];
    if (!selected.length && !req.body.regno) return res.status(400).json({ success: false, message: "Select at least one student" });
    const students = selected.length ? selected : [req.body];
    let saved = 0;
    for (const student of students) {
      const regno = text(student.regno);
      if (!regno) continue;
      const payload = {
        colid,
        user: text(req.body.user),
        namecreated: text(req.body.namecreated || req.body.name),
        academicyear: council.academicyear,
        councilid: council._id,
        councilname: council.councilname,
        student: text(student.name || student.student),
        studentemail: text(student.email || student.user || student.studentemail),
        regno,
        regulation: text(student.regulation),
        program: text(student.program),
        programcode: text(student.programcode),
        semester: text(student.semester),
        section: text(student.section),
        position: text(req.body.position) || "Member",
        startdate: dateValue(req.body.startdate),
        enddate: dateValue(req.body.enddate),
        status: text(req.body.status) || "Active"
      };
      await StudentCouncilMember.findOneAndUpdate({ colid, councilid: council._id, regno }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkMembers = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const { colid } = scoped(req.body);
    let saved = 0;
    for (const row of rows) {
      const councilQuery = row.councilid
        ? { colid, _id: row.councilid }
        : { colid, councilname: text(row.councilname), academicyear: text(row.academicyear) };
      const council = await StudentCouncil.findOne(councilQuery).lean();
      if (!council) continue;
      const student = await User.findOne({ colid, role: /^Student$/i, $or: [{ regno: text(row.regno) }, { email: text(row.studentemail || row.email || row.user) }] }).lean();
      const source = student ? { ...student, student: student.name, studentemail: student.email, ...row } : row;
      await StudentCouncilMember.findOneAndUpdate(
        { colid, councilid: council._id, regno: text(source.regno) },
        {
          colid,
          user: text(req.body.user),
          namecreated: text(req.body.namecreated || req.body.name),
          academicyear: council.academicyear,
          councilid: council._id,
          councilname: council.councilname,
          student: text(source.student || source.name),
          studentemail: text(source.studentemail || source.email || source.user),
          regno: text(source.regno),
          regulation: text(source.regulation),
          program: text(source.program),
          programcode: text(source.programcode),
          semester: text(source.semester),
          section: text(source.section),
          position: text(source.position) || "Member",
          startdate: dateValue(source.startdate),
          enddate: dateValue(source.enddate),
          status: text(source.status) || "Active"
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteMembers = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await StudentCouncilMember.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listMeetings = async (req, res) => {
  try {
    const query = scoped(req.query);
    applyTextFilters(query, req.query, ["academicyear", "councilname", "meeting", "agenda", "status"]);
    if (text(req.query.councilid)) query.councilid = req.query.councilid;
    if (text(req.query.fromdate) || text(req.query.todate)) {
      query.meetingdate = {};
      if (text(req.query.fromdate)) query.meetingdate.$gte = new Date(`${text(req.query.fromdate)}T00:00:00`);
      if (text(req.query.todate)) query.meetingdate.$lte = new Date(`${text(req.query.todate)}T23:59:59`);
    }
    const rows = await StudentCouncilMeeting.find(query).sort({ meetingdate: -1, updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveMeeting = async (req, res) => {
  try {
    const payload = await meetingPayload(req.body);
    if (!payload.meeting) return res.status(400).json({ success: false, message: "Meeting title is required" });
    const row = req.body.id
      ? await StudentCouncilMeeting.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await StudentCouncilMeeting.create(payload);
    res.json({ success: true, row: toClient(row) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkMeetings = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let inserted = 0;
    for (const row of rows) {
      const council = await StudentCouncil.findOne({ colid: num(req.body.colid), $or: [{ _id: row.councilid }, { councilname: row.councilname, academicyear: row.academicyear }] }).lean();
      if (!council) continue;
      const payload = await meetingPayload({ ...row, colid: req.body.colid, user: req.body.user, namecreated: req.body.namecreated, councilid: council._id });
      if (!payload.meeting) continue;
      await StudentCouncilMeeting.create(payload);
      inserted += 1;
    }
    res.json({ success: true, inserted });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteMeetings = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await StudentCouncilMeeting.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const council = await StudentCouncil.findOne({ _id: req.query.councilid, colid }).lean();
    if (!council) return res.status(400).json({ success: false, message: "Select a student council" });
    const [members, meetings, institution] = await Promise.all([
      StudentCouncilMember.find({ colid, councilid: council._id }).sort({ position: 1, student: 1 }).lean(),
      StudentCouncilMeeting.find({ colid, councilid: council._id }).sort({ meetingdate: 1 }).lean(),
      InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null)
    ]);
    const byPosition = members.reduce((acc, row) => {
      const key = row.position || "Member";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    res.json({ success: true, institution, council: toClient(council), members: members.map(toClient), meetings: meetings.map(toClient), summary: { membercount: members.length, meetingcount: meetings.length, byPosition } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
