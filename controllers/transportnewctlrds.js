const mongoose = require("mongoose");
const {
  TransportVehicleType,
  TransportVehicle,
  TransportWaypoint,
  TransportRoute,
  TransportSchedule,
  TransportApplication,
  TransportAssignment,
  TransportTemplate,
  TransportPass
} = require("../Models/transportnewds");
const User = require("../Models/user");
const Ledgerstud = require("../Models/ledgerstud");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (value) => new RegExp(escapeRegex(value), "i");
const today = () => new Date();
const unique = (items = []) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const entities = {
  vehicleTypes: { Model: TransportVehicleType, fields: ["type", "description", "status"], required: ["type"] },
  vehicles: { Model: TransportVehicle, fields: ["vehiclename", "registrationnumber", "taxpaidtilldate", "insurancevalidtilldate", "typeid", "type", "vehicletype", "seatingcapacity", "status"], required: ["registrationnumber", "type"] },
  waypoints: { Model: TransportWaypoint, fields: ["waypoint", "description", "location", "latitude", "longitude", "status"], required: ["waypoint"] },
  routes: { Model: TransportRoute, fields: ["routename", "description", "waypoints", "status"], required: ["routename"] },
  schedules: { Model: TransportSchedule, fields: ["routeid", "routename", "vehicleid", "vehicle", "registrationnumber", "amountperseat", "timings", "status"], required: ["routeid", "vehicleid"] },
  applications: { Model: TransportApplication, fields: [], required: [] },
  assignments: { Model: TransportAssignment, fields: [], required: [] },
  templates: { Model: TransportTemplate, fields: ["templatename", "description", "html", "isdefault", "status"], required: ["templatename"] },
  passes: { Model: TransportPass, fields: [], required: [] }
};

const defaultTemplates = [
  ["Classic Blue", "#1d4ed8", "#eff6ff"], ["Emerald Route", "#047857", "#ecfdf5"], ["Royal Gold", "#92400e", "#fffbeb"],
  ["Minimal Black", "#111827", "#f9fafb"], ["Campus Sky", "#0369a1", "#e0f2fe"], ["Violet Pass", "#6d28d9", "#f5f3ff"],
  ["Crimson Pass", "#be123c", "#fff1f2"], ["Teal Transit", "#0f766e", "#f0fdfa"], ["Slate Smart", "#334155", "#f8fafc"], ["Orange Line", "#c2410c", "#fff7ed"]
].map(([name, color, bg], index) => ({
  templatename: name,
  description: "Default transport bus pass template",
  isdefault: "Yes",
  status: "Active",
  html: `<div style="width:86mm;min-height:54mm;border:2px solid ${color};border-radius:10px;background:${bg};font-family:Arial;color:#111;padding:10px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid ${color};padding-bottom:6px">
      <div><div style="font-size:15px;font-weight:800">{{institutionname}}</div><div style="font-size:10px">{{institutionaddress}}</div></div>
      <img src="{{studentphoto}}" style="width:45px;height:52px;object-fit:cover;border:1px solid #999" />
    </div>
    <div style="text-align:center;font-weight:900;color:${color};margin:6px 0">BUS PASS ${index + 1}</div>
    <table style="width:100%;font-size:10.5px;border-collapse:collapse"><tbody>
      <tr><td><b>Name</b></td><td>{{studentname}}</td><td rowspan="5" style="text-align:center"><img src="{{qrcode}}" style="width:68px;height:68px"/></td></tr>
      <tr><td><b>Reg No</b></td><td>{{regno}}</td></tr>
      <tr><td><b>Program</b></td><td>{{program}} {{programcode}}</td></tr>
      <tr><td><b>Route</b></td><td>{{routename}}</td></tr>
      <tr><td><b>Vehicle</b></td><td>{{registrationnumber}}</td></tr>
    </tbody></table>
    <div style="font-size:9px;margin-top:7px">Scan QR to verify. Generated on {{generateddate}}</div>
  </div>`
}));

const query = (source = {}, fields = []) => {
  const q = { colid: num(source.colid) };
  fields.forEach((field) => {
    if (text(source[field])) q[field] = rx(source[field]);
  });
  if (Array.isArray(source.filters)) {
    source.filters.forEach((filter) => {
      if (text(filter.field) && text(filter.value) && !text(filter.field).includes("$")) q[text(filter.field)] = rx(filter.value);
    });
  }
  return q;
};

const payload = (entity, source = {}) => {
  const meta = entities[entity];
  const data = { colid: num(source.colid), user: text(source.user), name: text(source.name), status: text(source.status) || "Active" };
  meta.fields.forEach((field) => {
    if (field === "waypoints" || field === "timings") data[field] = Array.isArray(source[field]) ? source[field] : [];
    else if (field === "amountperseat" || field === "seatingcapacity") data[field] = num(source[field]);
    else data[field] = source[field];
  });
  return data;
};

const seedDefaultTemplates = async (colid) => {
  const count = await TransportTemplate.countDocuments({ colid, isdefault: "Yes" });
  if (!count) await TransportTemplate.insertMany(defaultTemplates.map((row) => ({ ...row, colid, user: "system", name: "System" })));
};

exports.list = async (req, res) => {
  try {
    const entity = text(req.params.entity);
    const meta = entities[entity];
    if (!meta) return res.status(400).json({ success: false, message: "Invalid transport entity" });
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (entity === "templates") await seedDefaultTemplates(colid);
    const data = await meta.Model.find(query(req.query, meta.fields)).sort({ updatedAt: -1 }).limit(5000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const entity = text(req.params.entity);
    const meta = entities[entity];
    if (!meta || ["applications", "assignments", "passes"].includes(entity)) return res.status(400).json({ success: false, message: "Invalid transport save entity" });
    const data = payload(entity, req.body);
    const missing = meta.required.filter((field) => !text(data[field]));
    if (!data.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (missing.length) return res.status(400).json({ success: false, message: `${missing.join(", ")} required` });
    const row = req.body.id
      ? await meta.Model.findOneAndUpdate({ _id: req.body.id, colid: data.colid }, data, { new: true, runValidators: true })
      : await meta.Model.create(data);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRows = async (req, res) => {
  try {
    const entity = text(req.params.entity);
    const meta = entities[entity];
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    if (!meta || !ids.length) return res.status(400).json({ success: false, message: "Invalid delete request" });
    const result = await meta.Model.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [vehicleTypes, vehicles, waypoints, routes, schedules, users, templates] = await Promise.all([
      TransportVehicleType.find({ colid }).lean(),
      TransportVehicle.find({ colid }).lean(),
      TransportWaypoint.find({ colid }).lean(),
      TransportRoute.find({ colid }).lean(),
      TransportSchedule.find({ colid }).lean(),
      User.find({ colid, role: /^student$/i }).select("name email regno academicyear admissionyear regulation program programcode semester section photo").lean(),
      TransportTemplate.find({ colid }).lean()
    ]);
    res.json({
      success: true,
      vehicleTypes, vehicles, waypoints, routes, schedules, templates,
      studentOptions: {
        academicyear: unique(users.map((r) => r.academicyear)),
        regulation: unique(users.map((r) => r.regulation)),
        program: unique(users.map((r) => r.program)),
        programcode: unique(users.map((r) => r.programcode)),
        semester: unique(users.map((r) => r.semester)),
        section: unique(users.map((r) => r.section)),
        name: unique(users.map((r) => r.name)),
        regno: unique(users.map((r) => r.regno))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const q = { colid, role: /^student$/i };
    (req.body.filters || []).forEach((filter) => {
      const field = text(filter.field);
      const value = text(filter.value);
      if (field && value && !field.includes("$")) q[field] = rx(value);
    });
    const data = await User.find(q).select("name email regno academicyear admissionyear regulation program programcode semester section photo phone").limit(1000).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const currentAssignments = async (colid, scheduleid) => TransportAssignment.countDocuments({ colid, scheduleid, status: "Active" });
const scheduleWithVehicle = async (colid, scheduleid) => {
  const schedule = await TransportSchedule.findOne({ _id: scheduleid, colid }).lean();
  if (!schedule) throw new Error("Schedule not found");
  const vehicle = await TransportVehicle.findOne({ _id: schedule.vehicleid, colid }).lean();
  if (!vehicle) throw new Error("Vehicle not found");
  return { schedule, vehicle };
};
const ensureCapacity = async (colid, scheduleid, excludeRegno = "") => {
  const { schedule, vehicle } = await scheduleWithVehicle(colid, scheduleid);
  const used = await currentAssignments(colid, scheduleid);
  const assignedSame = excludeRegno ? await TransportAssignment.findOne({ colid, scheduleid, regno: excludeRegno, status: "Active" }).lean() : null;
  if (!assignedSame && used >= num(vehicle.seatingcapacity)) throw new Error(`No seat available. Capacity ${vehicle.seatingcapacity}, assigned ${used}.`);
  return { schedule, vehicle, used };
};
const createLedger = async ({ colid, student, schedule, source, user }) => {
  const amount = num(schedule.amountperseat);
  const ledger = await Ledgerstud.create({
    name: source.studentname || student.name || "",
    user: user || source.studentemail || student.email || "",
    feegroup: "Transport",
    regno: source.regno || student.regno || "",
    student: source.studentname || student.name || "",
    feeitem: `Transport Fee - ${schedule.routename || ""}`,
    amount,
    paid: 0,
    concession: 0,
    balance: amount,
    Latefinedue: 0,
    Latefinepaid: 0,
    feecategory: "Transport",
    feetype: "Transport",
    semester: source.semester || student.semester || "",
    programcode: source.programcode || student.programcode || "",
    regulation: source.regulation || student.regulation || "",
    admissionyear: student.admissionyear || "",
    academicyear: source.academicyear || student.academicyear || "",
    classdate: today(),
    duedate: today(),
    status: "Due",
    colid,
    comments: `Transport assignment for ${schedule.routename || ""} / ${schedule.registrationnumber || ""}`
  });
  return ledger;
};

exports.applySeat = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const student = await User.findOne({ colid, email: rx(req.body.studentemail || req.body.user), role: /^student$/i }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const { schedule } = await scheduleWithVehicle(colid, req.body.scheduleid);
    const existing = await TransportApplication.findOne({ colid, scheduleid: String(schedule._id), regno: student.regno, approvalstatus: "Pending" }).lean();
    if (existing) return res.status(400).json({ success: false, message: "Pending request already exists for this route and vehicle." });
    const data = await TransportApplication.create({
      colid, user: req.body.user, name: req.body.name, scheduleid: String(schedule._id), routeid: schedule.routeid,
      routename: schedule.routename, vehicleid: schedule.vehicleid, registrationnumber: schedule.registrationnumber,
      amountperseat: schedule.amountperseat, academicyear: student.academicyear, regulation: student.regulation,
      program: student.program, programcode: student.programcode, semester: student.semester, studentname: student.name,
      studentemail: student.email, regno: student.regno, approvalstatus: "Pending", status: "Active"
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveSeat = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const application = await TransportApplication.findOne({ _id: req.body.id, colid }).lean();
    if (!application) return res.status(404).json({ success: false, message: "Application not found" });
    if (req.body.approvalstatus === "Rejected") {
      const data = await TransportApplication.findOneAndUpdate({ _id: req.body.id, colid }, { approvalstatus: "Rejected", comments: text(req.body.comments), approvedby: text(req.body.user), approveddate: today() }, { new: true });
      return res.json({ success: true, data });
    }
    const { schedule } = await ensureCapacity(colid, application.scheduleid, application.regno);
    const student = await User.findOne({ colid, regno: application.regno, role: /^student$/i }).lean();
    const ledger = await createLedger({ colid, student: student || {}, schedule, source: application, user: req.body.user });
    await TransportAssignment.deleteMany({ colid, regno: application.regno, status: "Active" });
    const assignment = await TransportAssignment.create({ ...application, applicationid: String(application._id), ledgerid: String(ledger._id), assignedby: text(req.body.user), assigneddate: today(), status: "Active" });
    const data = await TransportApplication.findOneAndUpdate({ _id: req.body.id, colid }, { approvalstatus: "Approved", ledgerid: String(ledger._id), approvedby: text(req.body.user), approveddate: today(), comments: text(req.body.comments) }, { new: true });
    res.json({ success: true, data, assignment, ledger });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.manualAssign = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const student = await User.findOne({ _id: req.body.studentid, colid, role: /^student$/i }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const { schedule } = await ensureCapacity(colid, req.body.scheduleid, student.regno);
    await TransportAssignment.deleteMany({ colid, regno: student.regno, status: "Active" });
    const source = { studentname: student.name, studentemail: student.email, regno: student.regno, academicyear: student.academicyear, regulation: student.regulation, program: student.program, programcode: student.programcode, semester: student.semester };
    const ledger = await createLedger({ colid, student, schedule, source, user: req.body.user });
    const data = await TransportAssignment.create({
      ...source, colid, user: req.body.user, name: req.body.name, scheduleid: String(schedule._id), routeid: schedule.routeid,
      routename: schedule.routename, vehicleid: schedule.vehicleid, registrationnumber: schedule.registrationnumber,
      amountperseat: schedule.amountperseat, assignedby: text(req.body.user), assigneddate: today(), ledgerid: String(ledger._id), status: "Active"
    });
    res.json({ success: true, data, ledger });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const render = (html, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{{${key}}}`, text(value)), html || "");

exports.generatePass = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const assignment = await TransportAssignment.findOne({ _id: req.body.assignmentid, colid }).lean();
    const template = await TransportTemplate.findOne({ _id: req.body.templateid, colid }).lean();
    if (!assignment || !template) return res.status(404).json({ success: false, message: "Assignment or template not found" });
    const student = await User.findOne({ colid, regno: assignment.regno, role: /^student$/i }).lean();
    const qrid = text(req.body.qrid) || new mongoose.Types.ObjectId().toString();
    const verifyurl = text(req.body.verifyurl) || `${text(req.body.frontendbase) || ""}/transport-new-verify/${qrid}`;
    const values = {
      institutionname: text(req.body.institutionname) || "Institution",
      institutionaddress: text(req.body.institutionaddress),
      studentphoto: student?.photo || "",
      studentname: assignment.studentname,
      regno: assignment.regno,
      program: assignment.program,
      programcode: assignment.programcode,
      semester: assignment.semester,
      routename: assignment.routename,
      registrationnumber: assignment.registrationnumber,
      amountperseat: assignment.amountperseat,
      generateddate: new Date().toLocaleDateString("en-IN"),
      qrcode: text(req.body.qrcode),
      verifyurl
    };
    const passhtml = render(template.html, values);
    const data = await TransportPass.create({ ...values, colid, user: req.body.user, name: req.body.name, assignmentid: String(assignment._id), templateid: String(template._id), templatename: template.templatename, passhtml, qrid, status: "Active" });
    res.json({ success: true, data, html: passhtml, verifyurl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyPass = async (req, res) => {
  try {
    const data = await TransportPass.findOne({ qrid: req.params.qrid }).lean();
    if (!data) return res.status(404).json({ success: false, message: "Bus pass not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
