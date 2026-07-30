const mongoose = require("mongoose");
const multer = require("multer");
const AWS = require("aws-sdk");
const path = require("path");
const {
  EventNew,
  AttendeeNew,
  DistinguishedAttendeeNew,
  GuestHouseBuildingNew,
  GuestHouseRoomNew,
  GuestHouseReservationNew,
  VehicleNew,
  TransportRequirementNew,
  VehicleAllocationNew,
  EventFeedbackNew,
  EventCertificateNew,
  EventPaperSubmissionNew,
  EventChecklistConfigNew,
  EventChecklistDetailNew
} = require("../Models/eventmanagementnewds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const Awsconfig = require("../Models/awsconfig");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const models = {
  events: EventNew,
  attendees: AttendeeNew,
  distinguished: DistinguishedAttendeeNew,
  guestbuildings: GuestHouseBuildingNew,
  guestrooms: GuestHouseRoomNew,
  guestreservations: GuestHouseReservationNew,
  vehicles: VehicleNew,
  transportrequirements: TransportRequirementNew,
  vehicleallocations: VehicleAllocationNew,
  feedback: EventFeedbackNew,
  certificates: EventCertificateNew,
  papersubmissions: EventPaperSubmissionNew,
  checklistconfigs: EventChecklistConfigNew,
  checklistdetails: EventChecklistDetailNew
};

const modelFields = {
  events: ["eventname", "eventcode", "type", "mode", "academicyear", "startdate", "enddate", "venue", "description", "registrationstartdate", "registrationenddate", "status", "publicregistration", "certificateenabled", "feedbackrequired"],
  attendees: ["eventid", "eventname", "eventcode", "registrationtype", "role", "attendee", "email", "phone", "gender", "designation", "institution", "city", "state", "country", "needsaccommodation", "occupancytype", "needstransport", "pickuprequired", "droprequired", "status", "comments"],
  distinguished: ["eventid", "eventname", "eventcode", "attendee", "email", "phone", "gender", "designation", "institution", "protocol", "remarks", "status"],
  guestbuildings: ["building", "description", "type", "location", "status"],
  guestrooms: ["building", "floor", "roomno", "roomtype", "occupancytype", "genderpreference", "rentperday", "noofbeds", "status"],
  guestreservations: ["eventid", "eventname", "eventcode", "building", "floor", "roomno", "roomtype", "occupancytype", "guestname", "guestemail", "gender", "fromdate", "todate", "status", "allocationmode", "remarks"],
  vehicles: ["vehicleno", "vehiclename", "vehicletype", "capacity", "drivername", "driverphone", "status", "remarks"],
  transportrequirements: ["eventid", "eventname", "eventcode", "attendeeid", "attendee", "email", "requirementtype", "vehicletype", "passengercount", "location", "destination", "requirementdate", "requirementtime", "status", "remarks"],
  vehicleallocations: ["eventid", "eventname", "eventcode", "requirementid", "attendee", "email", "requirementtype", "vehicleno", "vehiclename", "vehicletype", "drivername", "driverphone", "allocationdate", "allocationtime", "location", "destination", "allocationmode", "status", "remarks"],
  feedback: ["eventid", "attendeeid", "eventname", "eventcode", "attendee", "email", "rating", "contentquality", "hospitality", "logistics", "comments", "submitteddate"],
  certificates: ["eventid", "attendeeid", "eventname", "eventcode", "attendee", "email", "certificateno", "issuedate", "certificatehtml", "status"],
  papersubmissions: ["eventid", "attendeeid", "eventname", "eventcode", "attendee", "email", "phone", "papertitle", "authors", "abstract", "keywords", "paperlink", "paperfilename", "submitteddate", "status", "remarks"],
  checklistconfigs: ["eventtype", "category", "checklistitem", "description", "mandatory", "order", "status"],
  checklistdetails: ["eventid", "eventname", "eventcode", "eventtype", "category", "checklistitem", "description", "mandatory", "order", "checkliststatus", "detail", "responsible", "targetdate", "completeddate", "remarks"]
};

const numberFields = new Set(["colid", "rentperday", "noofbeds", "capacity", "passengercount", "rating", "contentquality", "hospitality", "logistics", "order"]);
const dateFields = new Set(["startdate", "enddate", "registrationstartdate", "registrationenddate", "approveddate", "fromdate", "todate", "requirementdate", "allocationdate", "submitteddate", "issuedate", "targetdate", "completeddate"]);
const clean = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const oid = (value) => mongoose.Types.ObjectId.isValid(value) ? value : undefined;
const getModel = (key) => models[key];
const normalizePayload = (key, body = {}) => {
  const payload = {};
  [...(modelFields[key] || []), "colid", "user", "name"].forEach((field) => {
    if (body[field] === undefined) return;
    if (numberFields.has(field)) payload[field] = Number(body[field] || 0);
    else if (dateFields.has(field)) payload[field] = body[field] ? new Date(body[field]) : null;
    else payload[field] = body[field];
  });
  if (payload.colid === undefined) payload.colid = num(body.colid);
  return payload;
};

const filterQuery = (body = {}) => {
  const query = { colid: num(body.colid ?? body.query?.colid) };
  (body.filters || []).forEach(({ field, value }) => {
    if (!field || value === undefined || value === "") return;
    if (dateFields.has(field)) query[field] = new Date(value);
    else query[field] = { $regex: clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  });
  Object.entries(body.query || {}).forEach(([field, value]) => {
    if (field === "colid" || value === undefined || value === "") return;
    query[field] = dateFields.has(field) ? new Date(value) : value;
  });
  return query;
};

const overlaps = (fromA, toA, fromB, toB) => new Date(fromA) <= new Date(toB) && new Date(toA) >= new Date(fromB);
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1" ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}` : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;
const getDefaultAwsConfig = async (colid) =>
  Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i }).sort({ _id: -1 }).lean();

async function getOllama(colid, id) {
  const query = { colid: num(colid), active: /^yes$/i };
  if (id) {
    const selected = await OllamaConfiguration.findOne({ ...query, _id: id }).lean();
    if (selected) return selected;
  }
  return OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean();
}

async function aiText({ colid, provider, geminiModel, ollamaConfigId, prompt }) {
  if (clean(provider).toLowerCase() === "ollama") {
    const config = await getOllama(colid, ollamaConfigId);
    if (!config) throw new Error("Active Ollama configuration is missing");
    const server = clean(config.serveraddress).replace(/\/$/, "");
    const response = await fetch(`${server}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.modelname, prompt, stream: false })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Ollama allocation failed");
    return data.response || "";
  }
  const gemini = await AiConfiguration.findOne({ colid: num(colid), type: /^Gemini$/i, active: /^yes$/i, default: /^yes$/i }).lean()
    || await AiConfiguration.findOne({ colid: num(colid), type: /^Gemini$/i, active: /^yes$/i }).lean();
  if (!gemini?.apikey) throw new Error("Gemini API key is missing");
  const model = clean(geminiModel) || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gemini.apikey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Gemini allocation failed");
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
}

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [events, rooms, vehicles, ollama] = await Promise.all([
      EventNew.find({ colid }).select("eventname eventcode type startdate enddate status").sort({ startdate: -1 }).lean(),
      GuestHouseRoomNew.find({ colid, status: { $ne: "Inactive" } }).sort({ building: 1, floor: 1, roomno: 1 }).lean(),
      VehicleNew.find({ colid, status: { $ne: "Inactive" } }).sort({ vehicletype: 1, vehicleno: 1 }).lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).select("name modelname default").lean()
    ]);
    res.json({
      success: true,
      fields: modelFields,
      events,
      rooms,
      vehicles,
      ollama,
      geminiModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const Model = getModel(req.params.model);
    if (!Model) return res.status(404).json({ success: false, message: "Unknown event management model" });
    const data = await Model.find(filterQuery(req.body)).sort({ createdAt: -1 }).limit(Number(req.body.limit || 5000)).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    const Model = getModel(req.params.model);
    if (!Model) return res.status(404).json({ success: false, message: "Unknown event management model" });
    const payload = normalizePayload(req.params.model, req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = req.body.id
      ? await Model.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true })
      : await Model.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const Model = getModel(req.params.model);
    if (!Model) return res.status(404).json({ success: false, message: "Unknown event management model" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const data = await Model.insertMany(rows.map((row) => normalizePayload(req.params.model, { ...row, colid: req.body.colid, user: req.body.user, name: req.body.name })), { ordered: false });
    res.json({ success: true, count: data.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const Model = getModel(req.params.model);
    if (!Model) return res.status(404).json({ success: false, message: "Unknown event management model" });
    await Model.deleteMany({ _id: { $in: req.body.ids || [req.body.id].filter(Boolean) }, colid: num(req.body.colid) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.publicEvents = async (req, res) => {
  const colid = num(req.query.colid);
  const data = await EventNew.find({ colid, status: /^active$/i, publicregistration: /^yes$/i }).sort({ startdate: -1 }).lean();
  res.json({ success: true, data });
};

exports.publicRegister = async (req, res) => {
  try {
    const event = await EventNew.findOne({ _id: oid(req.body.eventid), colid: num(req.body.colid) }).lean();
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    const payload = normalizePayload("attendees", {
      ...req.body,
      eventname: event.eventname,
      eventcode: event.eventcode,
      registrationtype: req.body.registrationtype || "External",
      status: "Applied"
    });
    payload.eventid = event._id;
    const data = await AttendeeNew.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approveAttendees = async (req, res) => {
  try {
    await AttendeeNew.updateMany(
      { _id: { $in: req.body.ids || [] }, colid: num(req.body.colid) },
      { status: req.body.status || "Approved", comments: req.body.comments || "", approvedby: req.body.user || "", approveddate: new Date() }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.roomAvailability = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const rooms = await GuestHouseRoomNew.find({ colid, status: { $ne: "Inactive" } }).lean();
    const reservations = await GuestHouseReservationNew.find({ colid, status: { $ne: "Cancelled" } }).lean();
    const from = req.body.fromdate || new Date();
    const to = req.body.todate || from;
    const data = rooms.map((room) => {
      const taken = reservations.filter((resv) => resv.building === room.building && resv.floor === room.floor && resv.roomno === room.roomno && overlaps(from, to, resv.fromdate, resv.todate));
      const occupied = taken.length;
      return { ...room, occupied, availablebeds: Math.max(Number(room.noofbeds || 1) - occupied, 0), reservations: taken };
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.allocateGuestHouse = async (req, res) => {
  try {
    const event = await EventNew.findOne({ _id: oid(req.body.eventid), colid: num(req.body.colid) }).lean();
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    let airesponse = "";
    if (req.body.useai === "Yes") {
      const prompt = `Suggest guest house allocation rules for this event. Return concise operational guidance.\nRules: ${req.body.rules || ""}\nEvent: ${JSON.stringify(event)}`;
      airesponse = await aiText({ colid: req.body.colid, provider: req.body.provider, geminiModel: req.body.geminiModel, ollamaConfigId: req.body.ollamaConfigId, prompt });
    }
    const attendees = await AttendeeNew.find({ colid: event.colid, eventid: event._id, status: /^approved$/i, needsaccommodation: /^yes$/i }).lean();
    const rooms = await GuestHouseRoomNew.find({ colid: event.colid, status: { $ne: "Inactive" } }).sort({ building: 1, floor: 1, roomno: 1 }).lean();
    const existing = await GuestHouseReservationNew.find({ colid: event.colid, status: { $ne: "Cancelled" } }).lean();
    const made = [];
    for (const attendee of attendees) {
      const already = existing.concat(made).some((r) => clean(r.guestemail).toLowerCase() === clean(attendee.email).toLowerCase() && overlaps(event.startdate, event.enddate, r.fromdate, r.todate));
      if (already) continue;
      const room = rooms.find((room) => {
        const taken = existing.concat(made).filter((r) => r.building === room.building && r.floor === room.floor && r.roomno === room.roomno && overlaps(event.startdate, event.enddate, r.fromdate, r.todate));
        if (taken.length >= Number(room.noofbeds || 1)) return false;
        if (/double/i.test(room.occupancytype || attendee.occupancytype || "") && taken.some((r) => clean(r.gender).toLowerCase() !== clean(attendee.gender).toLowerCase())) return false;
        if (room.genderpreference && !/any|mixed/i.test(room.genderpreference) && clean(room.genderpreference).toLowerCase() !== clean(attendee.gender).toLowerCase()) return false;
        return true;
      });
      if (!room) continue;
      made.push({
        colid: event.colid,
        user: req.body.user,
        name: req.body.name,
        eventid: event._id,
        eventname: event.eventname,
        eventcode: event.eventcode,
        building: room.building,
        floor: room.floor,
        roomno: room.roomno,
        roomtype: room.roomtype,
        occupancytype: room.occupancytype,
        guestname: attendee.attendee,
        guestemail: attendee.email,
        gender: attendee.gender,
        fromdate: event.startdate,
        todate: event.enddate,
        allocationmode: req.body.useai === "Yes" ? "AI assisted" : "Auto",
        remarks: airesponse
      });
    }
    const data = made.length ? await GuestHouseReservationNew.insertMany(made) : [];
    res.json({ success: true, count: data.length, data, airesponse });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.allocateVehicles = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    let airesponse = "";
    if (req.body.useai === "Yes") {
      const prompt = `Suggest vehicle allocation approach. Return concise guidance.\nRules: ${req.body.rules || ""}`;
      airesponse = await aiText({ colid, provider: req.body.provider, geminiModel: req.body.geminiModel, ollamaConfigId: req.body.ollamaConfigId, prompt });
    }
    const requirements = await TransportRequirementNew.find({ colid, eventid: oid(req.body.eventid), status: { $ne: "Allocated" } }).sort({ requirementdate: 1, requirementtime: 1 }).lean();
    const vehicles = await VehicleNew.find({ colid, status: { $ne: "Inactive" } }).sort({ capacity: 1 }).lean();
    const existing = await VehicleAllocationNew.find({ colid, status: { $ne: "Cancelled" } }).lean();
    const made = [];
    for (const reqt of requirements) {
      const vehicle = vehicles.find((vehicle) => {
        if (reqt.vehicletype && clean(vehicle.vehicletype).toLowerCase() !== clean(reqt.vehicletype).toLowerCase()) return false;
        if (Number(vehicle.capacity || 0) < Number(reqt.passengercount || 1)) return false;
        return !existing.concat(made).some((alloc) => alloc.vehicleno === vehicle.vehicleno && String(alloc.allocationdate).slice(0, 10) === String(reqt.requirementdate).slice(0, 10) && alloc.allocationtime === reqt.requirementtime);
      });
      if (!vehicle) continue;
      made.push({
        colid,
        user: req.body.user,
        name: req.body.name,
        eventid: reqt.eventid,
        eventname: reqt.eventname,
        eventcode: reqt.eventcode,
        requirementid: String(reqt._id),
        attendee: reqt.attendee,
        email: reqt.email,
        requirementtype: reqt.requirementtype,
        vehicleno: vehicle.vehicleno,
        vehiclename: vehicle.vehiclename,
        vehicletype: vehicle.vehicletype,
        drivername: vehicle.drivername,
        driverphone: vehicle.driverphone,
        allocationdate: reqt.requirementdate,
        allocationtime: reqt.requirementtime,
        location: reqt.location,
        destination: reqt.destination,
        allocationmode: req.body.useai === "Yes" ? "AI assisted" : "Auto",
        remarks: airesponse
      });
    }
    const data = made.length ? await VehicleAllocationNew.insertMany(made) : [];
    if (data.length) await TransportRequirementNew.updateMany({ _id: { $in: data.map((d) => d.requirementid) } }, { status: "Allocated" });
    res.json({ success: true, count: data.length, data, airesponse });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    const attendee = await AttendeeNew.findOne({ _id: oid(req.body.attendeeid), colid: num(req.body.colid) }).lean();
    if (!attendee) return res.status(404).json({ success: false, message: "Registration not found" });
    const feedback = await EventFeedbackNew.create(normalizePayload("feedback", {
      ...req.body,
      eventid: attendee.eventid,
      eventname: attendee.eventname,
      eventcode: attendee.eventcode,
      attendee: attendee.attendee,
      email: attendee.email,
      submitteddate: new Date()
    }));
    const certno = `EVT-${attendee.eventcode || "CERT"}-${String(Date.now()).slice(-8)}`;
    const certificatehtml = `<h1>Certificate of Participation</h1><p>This is to certify that <strong>${attendee.attendee}</strong> participated in <strong>${attendee.eventname}</strong>.</p><p>Certificate No: ${certno}</p>`;
    const certificate = await EventCertificateNew.create({
      colid: attendee.colid,
      eventid: attendee.eventid,
      attendeeid: String(attendee._id),
      eventname: attendee.eventname,
      eventcode: attendee.eventcode,
      attendee: attendee.attendee,
      email: attendee.email,
      certificateno: certno,
      issuedate: new Date(),
      certificatehtml
    });
    res.json({ success: true, feedback, certificate });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.certificate = async (req, res) => {
  const certificate = await EventCertificateNew.findOne({ _id: oid(req.query.id), colid: num(req.query.colid) }).lean();
  if (!certificate) return res.status(404).json({ success: false, message: "Certificate not found" });
  res.json({ success: true, data: certificate });
};

exports.uploadPaperFile = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });
    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
    }
    const cleanName = path.basename(req.file.originalname || "paper").replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/event-new/papers/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    res.json({ success: true, url: s3Url(config.bucket, config.region, key), filename: cleanName });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.attendeePaperOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const email = clean(req.query.email).toLowerCase();
    const phone = clean(req.query.phone);
    const query = { colid, status: /^approved$/i };
    if (email || phone) query.$or = [{ email: { $regex: email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { phone }];
    const attendees = await AttendeeNew.find(query).sort({ eventname: 1 }).lean();
    const submissions = await EventPaperSubmissionNew.find({ colid, email: { $regex: email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }).lean();
    res.json({ success: true, attendees, submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitPaper = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const attendee = await AttendeeNew.findOne({ _id: oid(req.body.attendeeid), colid }).lean();
    if (!attendee) return res.status(404).json({ success: false, message: "Approved attendee registration not found" });
    const payload = normalizePayload("papersubmissions", {
      ...req.body,
      colid,
      eventid: attendee.eventid,
      attendeeid: String(attendee._id),
      eventname: attendee.eventname,
      eventcode: attendee.eventcode,
      attendee: attendee.attendee,
      email: attendee.email,
      phone: attendee.phone,
      submitteddate: new Date(),
      status: "Submitted"
    });
    const data = await EventPaperSubmissionNew.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const [events, attendees, reservations, vehicles, allocations, feedback, papersubmissions, checklistconfigs, checklistdetails] = await Promise.all([
      EventNew.find({ colid }).lean(),
      AttendeeNew.find({ colid }).lean(),
      GuestHouseReservationNew.find({ colid }).lean(),
      VehicleNew.find({ colid }).lean(),
      VehicleAllocationNew.find({ colid }).lean(),
      EventFeedbackNew.find({ colid }).lean(),
      EventPaperSubmissionNew.find({ colid }).lean(),
      EventChecklistConfigNew.find({ colid }).lean(),
      EventChecklistDetailNew.find({ colid }).lean()
    ]);
    res.json({ success: true, data: { events, attendees, reservations, vehicles, allocations, feedback, papersubmissions, checklistconfigs, checklistdetails } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.checklistReport = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const eventQuery = { colid };
    if (req.body.fromdate || req.body.todate) {
      eventQuery.startdate = {};
      if (req.body.fromdate) eventQuery.startdate.$gte = new Date(req.body.fromdate);
      if (req.body.todate) eventQuery.startdate.$lte = new Date(req.body.todate);
    }
    (req.body.filters || []).forEach(({ field, value }) => {
      if (!field || value === undefined || value === "") return;
      if (["eventname", "eventcode", "type", "mode", "academicyear", "venue", "status"].includes(field)) {
        eventQuery[field] = { $regex: clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      }
    });
    const events = await EventNew.find(eventQuery).sort({ startdate: -1 }).lean();
    const eventIds = events.map((event) => event._id);
    const detailQuery = { colid, eventid: { $in: eventIds } };
    (req.body.filters || []).forEach(({ field, value }) => {
      if (!field || value === undefined || value === "") return;
      if (["category", "checklistitem", "checkliststatus", "responsible", "mandatory"].includes(field)) {
        detailQuery[field] = { $regex: clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      }
    });
    const details = await EventChecklistDetailNew.find(detailQuery).sort({ eventname: 1, order: 1, category: 1 }).lean();
    const configs = await EventChecklistConfigNew.find({ colid, status: { $ne: "Inactive" } }).sort({ eventtype: 1, order: 1, category: 1 }).lean();
    const detailKey = (row) => [String(row.eventid || ""), clean(row.category), clean(row.checklistitem)].join("||");
    const detailMap = new Map(details.map((row) => [detailKey(row), row]));
    const rows = [];
    events.forEach((event) => {
      const matchingConfigs = configs.filter((cfg) => !cfg.eventtype || clean(cfg.eventtype).toLowerCase() === clean(event.type).toLowerCase());
      matchingConfigs.forEach((cfg) => {
        const detail = detailMap.get([String(event._id), clean(cfg.category), clean(cfg.checklistitem)].join("||"));
        rows.push({
          id: `${event._id}-${cfg._id}`,
          eventid: event._id,
          eventname: event.eventname,
          eventcode: event.eventcode,
          eventtype: event.type,
          mode: event.mode,
          academicyear: event.academicyear,
          startdate: event.startdate,
          enddate: event.enddate,
          venue: event.venue,
          category: cfg.category,
          checklistitem: cfg.checklistitem,
          mandatory: cfg.mandatory,
          order: cfg.order,
          checkliststatus: detail?.checkliststatus || "Pending",
          detail: detail?.detail || "",
          responsible: detail?.responsible || "",
          targetdate: detail?.targetdate || null,
          completeddate: detail?.completeddate || null,
          remarks: detail?.remarks || ""
        });
      });
    });
    const totals = rows.reduce((acc, row) => {
      acc.total += 1;
      const status = clean(row.checkliststatus) || "Pending";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { total: 0 });
    res.json({ success: true, data: rows, events, details, configs, totals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
