const FlyingSquad = require("../Models/conductexamflyingsquadds");
const FlyingSquadMember = require("../Models/conductexamflyingsquadmemberds");
const FlyingSquadAssignment = require("../Models/conductexamflyingsquadassignmentds");
const UnfairMeans = require("../Models/conductexamunfairmeansds");
const Exam = require("../Models/conductexamds");
const InvigilatorAllocation = require("../Models/conductexaminvigilatorallocationds");
const ExamRoll = require("../Models/conductexamrollds");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");

const text = (value) => String(value || "").trim();
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const models = {
  squads: {
    Model: FlyingSquad,
    fields: ["academicyear", "exam", "examcode", "squadname", "description", "status"]
  },
  members: {
    Model: FlyingSquadMember,
    fields: ["squadid", "squadname", "academicyear", "exam", "examcode", "membername", "memberemail", "role", "phone", "status"]
  },
  assignments: {
    Model: FlyingSquadAssignment,
    fields: ["squadid", "squadname", "academicyear", "exam", "examcode", "allocationid", "examdate", "slot", "campus", "building", "room", "remarks", "status"]
  },
  unfairmeans: {
    Model: UnfairMeans,
    fields: ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "semester", "course", "coursecode", "examdate", "slot", "campus", "building", "room", "student", "regno", "email", "invigilator", "invigilatoremail", "incidenttype", "details", "actiontaken", "remarks", "status"]
  }
};

const payloadFor = (kind, body = {}) => {
  const payload = { colid: Number(body.colid), user: text(body.user) };
  (models[kind]?.fields || []).forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  return payload;
};

const filterFor = (kind, source = {}) => {
  const filter = { colid: Number(source.colid) };
  (models[kind]?.fields || []).forEach((field) => {
    if (text(source[field])) filter[field] = regex(source[field]);
  });
  if (text(source.fromdate) || text(source.todate)) {
    filter.examdate = {};
    if (text(source.fromdate)) filter.examdate.$gte = text(source.fromdate);
    if (text(source.todate)) filter.examdate.$lte = text(source.todate);
  }
  return filter;
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const [exams, squads, allocations, users, unfairmeans] = await Promise.all([
      Exam.find({ colid }).sort({ academicyear: -1, examname: 1 }).lean(),
      FlyingSquad.find({ colid }).sort({ createdAt: -1 }).lean(),
      InvigilatorAllocation.find({ colid }).sort({ examdate: -1, slot: 1, room: 1 }).limit(5000).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email user phone role").sort({ name: 1 }).lean(),
      UnfairMeans.find({ colid }).sort({ createdAt: -1 }).limit(1000).lean()
    ]);
    res.json({
      success: true,
      exams,
      squads,
      allocations,
      users,
      unfairmeans,
      academicyears: uniqueSorted([...exams.map((item) => item.academicyear), ...allocations.map((item) => item.academicyear)]),
      examcodes: uniqueSorted([...exams.map((item) => item.examcode), ...allocations.map((item) => item.examcode)]),
      rooms: uniqueSorted(allocations.map((item) => item.room)),
      dates: uniqueSorted(allocations.map((item) => item.examdate)),
      slots: uniqueSorted(allocations.map((item) => item.slot))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const config = models[req.params.kind];
    if (!config) return res.status(404).json({ success: false, message: "Unknown flying squad model" });
    const data = await config.Model.find(filterFor(req.params.kind, req.query)).sort({ createdAt: -1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const config = models[req.params.kind];
    if (!config) return res.status(404).json({ success: false, message: "Unknown flying squad model" });
    const payload = payloadFor(req.params.kind, req.body);
    const data = req.body.id
      ? await config.Model.findOneAndUpdate({ _id: req.body.id, colid: Number(req.body.colid) }, payload, { new: true, runValidators: true })
      : await config.Model.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRows = async (req, res) => {
  try {
    const config = models[req.params.kind];
    if (!config) return res.status(404).json({ success: false, message: "Unknown flying squad model" });
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await config.Model.deleteMany({ _id: { $in: ids }, colid: Number(req.body.colid) });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.roomStudents = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const allocation = await InvigilatorAllocation.findOne({ _id: req.query.allocationid, colid }).lean();
    if (!allocation) return res.status(404).json({ success: false, message: "Room assignment not found" });
    const students = await ExamRoll.find({
      colid,
      academicyear: allocation.academicyear,
      examcode: allocation.examcode,
      examdate: allocation.examdate,
      examslot: allocation.slot,
      examroom: allocation.room
    }).sort({ seatno: 1, student: 1 }).lean();
    res.json({ success: true, allocation, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const rows = await UnfairMeans.find(filterFor("unfairmeans", req.query)).sort({ createdAt: -1 }).limit(5000).lean();
    const institution = await Institution.findOne({ colid }).lean();
    const makeGroup = (field) => Object.values(rows.reduce((acc, item) => {
      const key = item[field] || "Not specified";
      acc[key] = acc[key] || { name: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}));
    res.json({
      success: true,
      rows,
      institution,
      byCourse: makeGroup("coursecode"),
      byRoom: makeGroup("room"),
      byIncident: makeGroup("incidenttype"),
      byStatus: makeGroup("status"),
      summary: {
        total: rows.length,
        students: uniqueSorted(rows.map((item) => item.regno)).length,
        rooms: uniqueSorted(rows.map((item) => item.room)).length,
        courses: uniqueSorted(rows.map((item) => item.coursecode)).length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
