const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const CentralTicket = require("../Models/centralticketds");
const CentralTicketResponse = require("../Models/centralticketresponseds");
const Awsconfig = require("../Models/awsconfig");
const User = require("../Models/user");

const upload = multer({ storage: multer.memoryStorage() });

const clean = (value) => (value === undefined || value === null ? "" : String(value).trim());
const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getAwsConfig = async (colid, configid) => {
  const filter = { colid: asNumber(colid) };
  if (configid) filter._id = configid;
  else filter.type = /^aws$/i;
  return Awsconfig.findOne(filter).sort({ default: -1, _id: -1 }).lean();
};

const uploadAttachment = async (file, body, folderPrefix) => {
  if (!file) return [];
  const colid = asNumber(body.colid);
  const config = await getAwsConfig(colid, body.awsconfigid);
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
    throw new Error("AWS configuration is incomplete");
  }
  const folder = clean(body.folder || folderPrefix).replace(/^\/+|\/+$/g, "");
  const cleanName = path.basename(file.originalname).replace(/[^\w.\-() ]/g, "_");
  const key = `${colid}/${folder ? `${folder}/` : ""}${Date.now()}-${cleanName}`;
  const s3 = new AWS.S3({
    accessKeyId: config.username,
    secretAccessKey: config.password,
    region: config.region
  });
  await s3.putObject({
    Bucket: config.bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }).promise();
  return [{
    filename: cleanName,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    url: s3Url(config.bucket, config.region, key),
    key,
    bucket: config.bucket,
    region: config.region
  }];
};

const nextTicketNo = async (colid) => {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await CentralTicket.countDocuments({ colid, ticketno: { $regex: `^TKT${day}` } });
  return `TKT${day}-${String(count + 1).padStart(4, "0")}`;
};

const dateRange = (from, to) => {
  const filter = {};
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  return filter;
};

const bucketKey = (date, mode) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  if (mode === "day") return d.toISOString().slice(0, 10);
  if (mode === "week") {
    const start = new Date(d);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return `${start.getFullYear()}-W${String(Math.ceil((((start - new Date(start.getFullYear(), 0, 1)) / 86400000) + 1) / 7)).padStart(2, "0")}`;
  }
  return `${year}-${month}`;
};

exports.uploadMiddleware = upload.single("file");

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({ colid: asNumber(req.query.colid) }).select("name email role department").sort({ name: 1 }).lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createTicket = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    if (!clean(req.body.title)) return res.status(400).json({ success: false, message: "Title is required" });
    const attachments = await uploadAttachment(req.file, req.body, "central-tickets");
    const status = "Open";
    const ticket = await CentralTicket.create({
      ticketno: await nextTicketNo(colid),
      title: clean(req.body.title),
      details: clean(req.body.details),
      startdatetime: req.body.startdatetime ? new Date(req.body.startdatetime) : new Date(),
      status,
      priority: clean(req.body.priority || "Normal"),
      raisedby: clean(req.body.raisedby || req.body.name),
      raisedbyemail: clean(req.body.raisedbyemail || req.body.user || req.body.email),
      raisedbyrole: clean(req.body.raisedbyrole || req.body.role),
      attachments,
      colid,
      user: clean(req.body.user)
    });
    res.json({ success: true, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTickets = async (req, res) => {
  try {
    const colid = asNumber(req.query.colid || req.body.colid);
    const filter = { colid, ...dateRange(req.query.fromDate, req.query.toDate) };
    const scope = clean(req.query.scope || req.body.scope);
    const user = clean(req.query.user || req.body.user);
    if (scope === "mine" && user) filter.raisedbyemail = user;
    if (clean(req.query.status) && clean(req.query.status) !== "All") filter.status = clean(req.query.status);
    if (clean(req.query.assignedtoemail)) filter.assignedtoemail = clean(req.query.assignedtoemail);
    if (clean(req.query.search)) {
      const regex = new RegExp(clean(req.query.search), "i");
      filter.$or = [{ ticketno: regex }, { title: regex }, { details: regex }, { raisedby: regex }, { raisedbyemail: regex }, { assignedtoemail: regex }];
    }
    const data = await CentralTicket.find(filter).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTicketDetails = async (req, res) => {
  try {
    const ticket = await CentralTicket.findOne({ _id: req.query.id, colid: asNumber(req.query.colid) }).lean();
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
    const responses = await CentralTicketResponse.find({ ticketid: ticket._id, colid: ticket.colid }).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: ticket, responses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const status = clean(req.body.status);
    const update = {};
    if (status) {
      update.status = status;
      if (/^closed$/i.test(status)) update.closedat = new Date();
      if (!/^closed$/i.test(status)) update.closedat = null;
    }
    if (clean(req.body.assignedtoemail)) {
      update.assignedto = clean(req.body.assignedto || req.body.assignedtoname || req.body.assignedtoemail);
      update.assignedtoemail = clean(req.body.assignedtoemail);
      update.assignedat = new Date();
      if (!status) update.status = "Pending";
    }
    const ticket = await CentralTicket.findOneAndUpdate({ _id: req.body.id, colid: asNumber(req.body.colid) }, { $set: update }, { new: true });
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
    res.json({ success: true, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.respondTicket = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const ticket = await CentralTicket.findOne({ _id: req.body.ticketid, colid });
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
    const attachments = await uploadAttachment(req.file, req.body, "central-ticket-responses");
    const status = clean(req.body.status || ticket.status);
    const response = await CentralTicketResponse.create({
      ticketid: ticket._id,
      ticketno: ticket.ticketno,
      response: clean(req.body.response),
      status,
      assignedto: clean(req.body.assignedto),
      assignedtoemail: clean(req.body.assignedtoemail),
      respondedby: clean(req.body.respondedby || req.body.name),
      respondedbyemail: clean(req.body.respondedbyemail || req.body.user),
      attachments,
      colid,
      user: clean(req.body.user)
    });
    const update = { status };
    if (!ticket.firstresponseat) update.firstresponseat = new Date();
    if (/^closed$/i.test(status)) update.closedat = new Date();
    if (clean(req.body.assignedtoemail)) {
      update.assignedto = clean(req.body.assignedto || req.body.assignedtoemail);
      update.assignedtoemail = clean(req.body.assignedtoemail);
      update.assignedat = new Date();
    }
    await CentralTicket.updateOne({ _id: ticket._id }, { $set: update });
    res.json({ success: true, data: response });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    const colid = asNumber(req.query.colid || req.body.colid);
    const tickets = await CentralTicket.find({ colid, ...dateRange(req.query.fromDate, req.query.toDate) }).lean();
    const build = (mode) => {
      const map = {};
      tickets.forEach((ticket) => {
        const key = bucketKey(ticket.createdAt, mode);
        if (!map[key]) map[key] = { period: key, raised: 0, solved: 0 };
        map[key].raised += 1;
        if (/^closed$/i.test(clean(ticket.status))) map[key].solved += 1;
      });
      return Object.values(map).sort((a, b) => String(a.period).localeCompare(String(b.period)));
    };
    const closeMap = {};
    tickets.filter((ticket) => ticket.closedat).forEach((ticket) => {
      const key = bucketKey(ticket.closedat, "week");
      if (!closeMap[key]) closeMap[key] = { period: key, totalHours: 0, closed: 0 };
      closeMap[key].totalHours += (new Date(ticket.closedat) - new Date(ticket.createdAt)) / 3600000;
      closeMap[key].closed += 1;
    });
    const avgCloseTime = Object.values(closeMap).map((row) => ({
      period: row.period,
      closed: row.closed,
      averageHoursToClose: row.closed ? Number((row.totalHours / row.closed).toFixed(2)) : 0
    })).sort((a, b) => String(a.period).localeCompare(String(b.period)));
    const byStatus = ["Open", "Pending", "Closed"].map((status) => ({ status, count: tickets.filter((ticket) => clean(ticket.status).toLowerCase() === status.toLowerCase()).length }));
    res.json({
      success: true,
      summary: { total: tickets.length, open: byStatus[0].count, pending: byStatus[1].count, closed: byStatus[2].count },
      daywise: build("day"),
      weekwise: build("week"),
      monthwise: build("month"),
      avgCloseTime,
      byStatus,
      details: tickets
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
