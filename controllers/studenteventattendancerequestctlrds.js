const EventAttendanceRequest = require("../Models/studenteventattendancerequestds");
const User = require("../Models/user");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const InsDetails = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(esc(value), "i");
const scoped = (source = {}) => {
  const colid = num(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};
const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");
const toClient = (row) => {
  const item = row?.toObject ? row.toObject() : { ...(row || {}) };
  if (item.reviewedat) item.reviewedat = dateOnly(item.reviewedat);
  return item;
};
function requestQuery(source, colid) {
  const query = { colid };
  ["status", "eventname", "eventtype", "student", "studentemail", "regno", "academicyear", "program", "programcode", "semester", "section"].forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
  if (source.fromdate || source.todate) {
    query.eventdate = {};
    if (source.fromdate) query.eventdate.$gte = dateOnly(source.fromdate);
    if (source.todate) query.eventdate.$lte = dateOnly(source.todate);
  }
  return query;
}

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [requests, institution] = await Promise.all([
      EventAttendanceRequest.find({ colid }).select("academicyear regulation program programcode semester section eventtype status").limit(5000).lean(),
      InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean().catch(() => null)
    ]);
    const unique = (field) => [...new Set(requests.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    res.json({
      institution,
      statuses: ["Open", "Approved", "Rejected"],
      eventTypes: ["Sports", "NCC", "NSS", "Cultural", "Academic", "Placement", "Institution", "Other"],
      academicyears: unique("academicyear"),
      regulations: unique("regulation"),
      programs: unique("program"),
      programcodes: unique("programcode"),
      semesters: unique("semester"),
      sections: unique("section")
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.submitRequest = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    if (!text(req.body.eventdate) || !text(req.body.eventname)) throw new Error("Event date and event name are required");
    const student = await User.findOne({
      colid,
      role: /^Student$/i,
      $or: [{ email: regex(req.body.user || req.body.studentemail || "") }, { regno: text(req.body.regno) }]
    }).lean();
    const payload = {
      colid,
      studentid: student?._id,
      student: student?.name || req.body.student || req.body.namecreated || "",
      studentemail: student?.email || req.body.studentemail || req.body.user || "",
      regno: student?.regno || req.body.regno || "",
      academicyear: student?.academicyear || req.body.academicyear || "",
      regulation: student?.regulation || req.body.regulation || "",
      program: student?.program || req.body.program || "",
      programcode: student?.programcode || req.body.programcode || "",
      semester: student?.semester || req.body.semester || "",
      section: student?.section || req.body.section || "",
      eventdate: dateOnly(req.body.eventdate),
      eventname: text(req.body.eventname),
      eventtype: req.body.eventtype,
      organizer: req.body.organizer,
      venue: req.body.venue,
      reason: req.body.reason,
      remarks: req.body.remarks,
      documentlinks: Array.isArray(req.body.documentlinks) ? req.body.documentlinks : [],
      status: "Open",
      user: req.body.user,
      namecreated: req.body.namecreated
    };
    const row = await EventAttendanceRequest.create(payload);
    res.json({ data: toClient(row) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.myRequests = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const query = { colid, studentemail: regex(req.query.user || req.query.studentemail || "") };
    const rows = await EventAttendanceRequest.find(query).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.listRequests = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const rows = await EventAttendanceRequest.find(requestQuery(req.query, colid)).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.reviewRequest = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const request = await EventAttendanceRequest.findOne({ _id: req.body.id, colid }).lean();
    if (!request) throw new Error("Request not found");
    const status = /^approved$/i.test(text(req.body.status)) ? "Approved" : /^rejected$/i.test(text(req.body.status)) ? "Rejected" : "";
    if (!status) throw new Error("Approval status is required");
    let modified = 0;
    if (status === "Approved") {
      const result = await NepLmsAttendance.updateMany(
        { colid, regno: request.regno, classdate: request.eventdate },
        { $set: { attendance: 1, comments: `Event attendance approved: ${request.eventname}`, changedby: req.body.user, changedat: new Date() } }
      );
      modified = result.modifiedCount || 0;
    }
    const row = await EventAttendanceRequest.findOneAndUpdate(
      { _id: request._id, colid },
      {
        $set: {
          status,
          welfarecomment: req.body.welfarecomment,
          welfaredocumentlinks: Array.isArray(req.body.welfaredocumentlinks) ? req.body.welfaredocumentlinks : request.welfaredocumentlinks || [],
          reviewedby: req.body.namecreated,
          reviewedbyemail: req.body.user,
          reviewedat: new Date(),
          attendancemodifiedcount: modified
        }
      },
      { new: true }
    );
    res.json({ data: toClient(row), attendancemodifiedcount: modified });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
