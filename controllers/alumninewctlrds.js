const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const Awsconfig = require("../Models/awsconfig");
const User = require("../Models/user");
const AlumniProfile = require("../Models/alumninewprofileds");
const AlumniJobPost = require("../Models/alumninewjobpostds");
const AlumniMessage = require("../Models/alumninewmessageds");
const AlumniEvent = require("../Models/alumnineweventds");
const AlumniEventRegistration = require("../Models/alumnineweventregistrationds");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single("file");

const text = (value) => String(value || "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(escapeRegex(value), "i");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({ colid: number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || Awsconfig.findOne({ colid: number(colid), type: /^aws$/i }).sort({ _id: -1 }).lean();

const userSelect = "name email phone role regno photo city country colid";

const getUserByEmail = (colid, email) => User.findOne({
  colid: number(colid),
  email: regex(email)
}).select(userSelect).lean();

const profilePayload = (body = {}, user = {}) => ({
  colid: number(body.colid),
  userid: user?._id,
  useremail: text(body.useremail || body.email || body.user || user.email),
  name: text(body.name || user.name),
  phone: text(body.phone || user.phone),
  photo: text(body.photo || user.photo),
  company: text(body.company),
  designation: text(body.designation),
  sector: text(body.sector || body.jobsector || body.industry),
  industry: text(body.industry),
  city: text(body.city || user.city),
  country: text(body.country || user.country),
  latitude: body.latitude === "" ? undefined : number(body.latitude, undefined),
  longitude: body.longitude === "" ? undefined : number(body.longitude, undefined),
  linkedin: text(body.linkedin),
  website: text(body.website),
  skills: text(body.skills),
  professionalsummary: text(body.professionalsummary || body.summary),
  currentstatus: text(body.currentstatus) || "Active",
  allowsearch: text(body.allowsearch) || "Yes",
  status: text(body.status) || "Active",
  user: text(body.user || body.useremail || user.email)
});

const jobPayload = (body = {}) => ({
  colid: number(body.colid),
  alumniemail: text(body.alumniemail || body.useremail || body.user),
  alumniname: text(body.alumniname || body.name),
  type: text(body.type) || "Job",
  title: text(body.title),
  company: text(body.company),
  sector: text(body.sector || body.jobsector),
  industry: text(body.industry),
  city: text(body.city),
  country: text(body.country),
  location: text(body.location),
  description: text(body.description),
  eligibility: text(body.eligibility),
  applylink: text(body.applylink),
  contactemail: text(body.contactemail),
  startdate: text(body.startdate),
  enddate: text(body.enddate),
  status: text(body.status) || "Active",
  user: text(body.user)
});

const eventPayload = (body = {}) => ({
  colid: number(body.colid),
  title: text(body.title),
  description: text(body.description),
  eventdate: text(body.eventdate),
  starttime: text(body.starttime),
  venue: text(body.venue),
  city: text(body.city),
  country: text(body.country),
  registrationstart: text(body.registrationstart),
  registrationend: text(body.registrationend),
  status: text(body.status) || "Active",
  createdby: text(body.createdby || body.user),
  user: text(body.user)
});

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

exports.getDashboard = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const email = text(req.query.email || req.query.user);
    const [profile, alumniCount, jobCount, eventCount, messageCount, registrations] = await Promise.all([
      AlumniProfile.findOne({ colid, useremail: regex(email) }).lean(),
      AlumniProfile.countDocuments({ colid, allowsearch: /^Yes$/i }),
      AlumniJobPost.countDocuments({ colid, status: /^Active$/i }),
      AlumniEvent.countDocuments({ colid, status: /^Active$/i }),
      AlumniMessage.countDocuments({ colid, $or: [{ alumniemail: regex(email) }, { studentemail: regex(email) }] }),
      AlumniEventRegistration.find({ colid, alumniemail: regex(email) }).lean()
    ]);
    res.json({ success: true, data: { profile, alumniCount, jobCount, eventCount, messageCount, registrations } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const email = text(req.query.email || req.query.useremail || req.query.user);
    const [user, profile] = await Promise.all([
      getUserByEmail(colid, email),
      AlumniProfile.findOne({ colid, useremail: regex(email) }).lean()
    ]);
    res.json({ success: true, data: profile || profilePayload({ colid, useremail: email }, user || {}) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveProfile = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const email = text(req.body.useremail || req.body.email || req.body.user);
    const user = await getUserByEmail(colid, email);
    const payload = profilePayload(req.body, user || {});
    if (!payload.useremail) return res.status(400).json({ success: false, message: "Alumni email is required" });
    const data = await AlumniProfile.findOneAndUpdate(
      { colid, useremail: regex(payload.useremail) },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadProfilePhoto = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const email = text(req.body.useremail || req.body.email || req.body.user);
    if (!colid || !email) return res.status(400).json({ success: false, message: "colid and user email are required" });
    if (!req.file) return res.status(400).json({ success: false, message: "Select a file to upload" });
    const config = await getDefaultAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "Default AWS configuration is missing or incomplete" });
    }
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/alumni-new/profile/${email}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    const url = s3Url(config.bucket, config.region, key);
    const data = await AlumniProfile.findOneAndUpdate(
      { colid, useremail: regex(email) },
      { $set: { photo: url, colid, useremail: email, user: text(req.body.user || email) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await User.findOneAndUpdate({ colid, email: regex(email) }, { $set: { photo: url } });
    res.json({ success: true, url, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchAlumni = async (req, res) => {
  try {
    const colid = number(req.body.colid || req.query.colid);
    const query = { colid, allowsearch: /^Yes$/i, status: { $not: /^Deleted$/i } };
    ["company", "sector", "industry", "city", "country"].forEach((field) => {
      if (text(req.body[field] || req.query[field])) query[field] = regex(req.body[field] || req.query[field]);
    });
    const keyword = text(req.body.keyword || req.query.keyword);
    if (keyword) {
      query.$or = ["name", "company", "designation", "sector", "industry", "city", "country", "skills"].map((field) => ({ [field]: regex(keyword) }));
    }
    const lat = number(req.body.latitude ?? req.query.latitude, undefined);
    const lon = number(req.body.longitude ?? req.query.longitude, undefined);
    const distance = number(req.body.distanceKm || req.query.distanceKm || req.body.distance || req.query.distance, undefined);
    let data = await AlumniProfile.find(query).sort({ name: 1 }).lean();
    if (lat !== undefined && lon !== undefined && distance !== undefined) {
      data = data
        .map((row) => ({ ...row, distanceKm: haversineKm(lat, lon, number(row.latitude, undefined), number(row.longitude, undefined)) }))
        .filter((row) => Number.isFinite(row.distanceKm) && row.distanceKm <= distance)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getJobs = async (req, res) => {
  try {
    const colid = number(req.query.colid || req.body.colid);
    const query = { colid, status: { $not: /^Deleted$/i } };
    if (text(req.query.alumniemail || req.body.alumniemail)) query.alumniemail = regex(req.query.alumniemail || req.body.alumniemail);
    ["type", "company", "sector", "industry", "city", "country"].forEach((field) => {
      const value = text(req.query[field] || req.body[field]);
      if (value) query[field] = regex(value);
    });
    const keyword = text(req.query.keyword || req.body.keyword);
    if (keyword) query.$or = ["title", "company", "description", "sector", "industry"].map((field) => ({ [field]: regex(keyword) }));
    const data = await AlumniJobPost.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveJob = async (req, res) => {
  try {
    const payload = jobPayload(req.body);
    if (!payload.colid || !payload.title) return res.status(400).json({ success: false, message: "Title is required" });
    let data;
    if (req.body._id) data = await AlumniJobPost.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true });
    else data = await AlumniJobPost.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const colid = number(req.body.colid || req.query.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id || req.query.id].filter(Boolean);
    await AlumniJobPost.updateMany({ colid, _id: { $in: ids } }, { $set: { status: "Deleted" } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEvents = async (req, res) => {
  try {
    const colid = number(req.query.colid || req.body.colid);
    const query = { colid, status: { $not: /^Deleted$/i } };
    ["status", "city", "country"].forEach((field) => {
      const value = text(req.query[field] || req.body[field]);
      if (value) query[field] = regex(value);
    });
    const keyword = text(req.query.keyword || req.body.keyword);
    if (keyword) query.$or = ["title", "description", "venue", "city", "country"].map((field) => ({ [field]: regex(keyword) }));
    const data = await AlumniEvent.find(query).sort({ eventdate: 1, createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveEvent = async (req, res) => {
  try {
    const payload = eventPayload(req.body);
    if (!payload.colid || !payload.title) return res.status(400).json({ success: false, message: "Event title is required" });
    let data;
    if (req.body._id) data = await AlumniEvent.findOneAndUpdate({ _id: req.body._id, colid: payload.colid }, payload, { new: true });
    else data = await AlumniEvent.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const colid = number(req.body.colid || req.query.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id || req.query.id].filter(Boolean);
    await AlumniEvent.updateMany({ colid, _id: { $in: ids } }, { $set: { status: "Deleted" } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.registerEvent = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const eventid = text(req.body.eventid);
    const alumniemail = text(req.body.alumniemail || req.body.useremail || req.body.user);
    if (!colid || !eventid || !alumniemail) return res.status(400).json({ success: false, message: "Event and alumni email are required" });
    const event = await AlumniEvent.findOne({ _id: eventid, colid }).lean();
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    const data = await AlumniEventRegistration.findOneAndUpdate(
      { colid, eventid, alumniemail: regex(alumniemail) },
      {
        colid,
        eventid,
        eventtitle: event.title,
        alumniemail,
        alumniname: text(req.body.alumniname || req.body.name),
        phone: text(req.body.phone),
        status: "Registered",
        user: text(req.body.user)
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEventRegistrations = async (req, res) => {
  try {
    const colid = number(req.query.colid || req.body.colid);
    const query = { colid };
    if (text(req.query.eventid || req.body.eventid)) query.eventid = text(req.query.eventid || req.body.eventid);
    if (text(req.query.alumniemail || req.body.alumniemail)) query.alumniemail = regex(req.query.alumniemail || req.body.alumniemail);
    const data = await AlumniEventRegistration.find(query).sort({ registeredat: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const colid = number(req.query.colid || req.body.colid);
    const email = text(req.query.email || req.query.user || req.body.email || req.body.user);
    const role = text(req.query.role || req.body.role).toLowerCase();
    const query = { colid };
    if (role === "alumni") query.alumniemail = regex(email);
    else if (role === "student") query.studentemail = regex(email);
    const data = await AlumniMessage.find(query).sort({ lastmessageat: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startMessage = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const alumniemail = text(req.body.alumniemail);
    const studentemail = text(req.body.studentemail || req.body.useremail || req.body.user);
    if (!colid || !alumniemail || !studentemail) return res.status(400).json({ success: false, message: "Alumni and student are required" });
    const message = {
      senderrole: text(req.body.senderrole) || "Student",
      senderemail: studentemail,
      sendername: text(req.body.studentname || req.body.sendername),
      message: text(req.body.message),
      date: new Date()
    };
    const data = await AlumniMessage.findOneAndUpdate(
      { colid, alumniemail: regex(alumniemail), studentemail: regex(studentemail) },
      {
        $setOnInsert: {
          colid,
          alumniemail,
          alumniname: text(req.body.alumniname),
          studentemail,
          studentregno: text(req.body.studentregno),
          studentname: text(req.body.studentname),
          subject: text(req.body.subject) || "Alumni connect",
          status: "Open"
        },
        $push: { messages: message },
        $set: { lastmessageat: new Date() }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.replyMessage = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = text(req.body.id || req.body._id);
    if (!colid || !id) return res.status(400).json({ success: false, message: "Conversation is required" });
    const message = {
      senderrole: text(req.body.senderrole),
      senderemail: text(req.body.senderemail || req.body.user),
      sendername: text(req.body.sendername || req.body.name),
      message: text(req.body.message),
      attachment: text(req.body.attachment),
      date: new Date()
    };
    const data = await AlumniMessage.findOneAndUpdate(
      { _id: id, colid },
      { $push: { messages: message }, $set: { status: text(req.body.status) || "Open", lastmessageat: new Date() } },
      { new: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
