const nodemailer = require("nodemailer");
const User = require("../Models/user");
const UserLocation = require("../Models/userlocationds");
const EmailConfiguration = require("../Models/emailconfigurationds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const emailRegex = /\S+@\S+\.\S+/;

const publicSelect = "name regno role city country latitude longitude lattitude distanceKm";
const userSelect = "name email phone regno role city country colid";

const getSmtpHost = (config = {}) => {
  if (config.smtp) return config.smtp;
  if (config.smptp) return config.smptp;
  if (/gmail/i.test(config.provider || "")) return "smtp.gmail.com";
  return "";
};

const createTransporter = (config) => {
  const port = Number(config.port) || (/gmail/i.test(config.provider || "") ? 465 : 587);
  const secureValue = String(config.secure || "").toLowerCase();
  return nodemailer.createTransport({
    host: getSmtpHost(config),
    port,
    secure: secureValue === "yes" || secureValue === "true" || port === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const loadDefaultEmailConfig = async (colid) => {
  const activeQuery = { colid, isactive: /^Yes$/i };
  return await EmailConfiguration.findOne({ ...activeQuery, default: /^Yes$/i }).sort({ updatedAt: -1, createdAt: -1 }).lean()
    || await EmailConfiguration.findOne(activeQuery).sort({ updatedAt: -1, createdAt: -1 }).lean();
};

const roleQuery = (mode) => mode === "student"
  ? { role: /^Student$/i }
  : { role: { $not: /^Student$/i } };

const toPublicRow = (row) => {
  const obj = row.toObject ? row.toObject() : row;
  const latitude = number(obj.latitude ?? obj.lattitude);
  const longitude = number(obj.longitude);
  return {
    _id: obj._id,
    name: obj.user || obj.name || "",
    regno: obj.regno || "",
    role: obj.role || "",
    city: obj.city || "",
    country: obj.country || "",
    latitude,
    longitude,
    lattitude: latitude,
    distanceKm: obj.distanceKm
  };
};

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

exports.getCurrentLocation = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const useremail = text(req.query.useremail || req.query.user);
    if (colid === undefined || !useremail) return res.status(400).json({ success: false, message: "colid and user email are required" });
    const [user, location] = await Promise.all([
      User.findOne({ colid, email: new RegExp(`^${escapeRegex(useremail)}$`, "i") }).select(userSelect).lean(),
      UserLocation.findOne({ colid, useremail: new RegExp(`^${escapeRegex(useremail)}$`, "i") }).lean()
    ]);
    res.json({ success: true, user, location });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveLocation = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const useremail = text(req.body.useremail || req.body.email || req.body.user);
    if (colid === undefined || !useremail) return res.status(400).json({ success: false, message: "colid and user email are required" });
    const user = await User.findOne({ colid, email: new RegExp(`^${escapeRegex(useremail)}$`, "i") }).select(userSelect).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const latitude = number(req.body.latitude ?? req.body.lattitude);
    const longitude = number(req.body.longitude);
    const payload = {
      userid: user._id,
      user: text(req.body.userName || req.body.name || user.name),
      useremail: user.email,
      role: text(user.role),
      city: text(req.body.city || user.city),
      country: text(req.body.country || user.country),
      latitude,
      lattitude: latitude,
      longitude,
      published: text(req.body.published) || "Yes",
      colid,
      updatedby: text(req.body.updatedby || req.body.currentuser)
    };
    const data = await UserLocation.findOneAndUpdate({ colid, useremail: user.email }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.search = async (req, res) => {
  try {
    const colid = number(req.body.colid || req.query.colid);
    const mode = text(req.body.mode || req.query.mode).toLowerCase() === "student" ? "student" : "user";
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, published: /^Yes$/i, ...roleQuery(mode) };
    if (req.body.country) query.country = new RegExp(escapeRegex(req.body.country), "i");
    if (req.body.city) query.city = new RegExp(escapeRegex(req.body.city), "i");
    if (req.body.contact) query.$or = [
      { user: new RegExp(escapeRegex(req.body.contact), "i") },
      { role: new RegExp(escapeRegex(req.body.contact), "i") }
    ];

    const lat = number(req.body.latitude ?? req.body.lattitude);
    const lon = number(req.body.longitude);
    const distance = number(req.body.distanceKm || req.body.distance);
    let rows = await UserLocation.find(query).sort({ user: 1 }).lean();
    if (lat !== undefined && lon !== undefined && distance !== undefined) {
      rows = rows
        .map((row) => ({ ...row, distanceKm: haversineKm(lat, lon, number(row.latitude ?? row.lattitude), number(row.longitude)) }))
        .filter((row) => Number.isFinite(row.distanceKm) && row.distanceKm <= distance)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }
    res.json({ success: true, data: rows.map(toPublicRow) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.contact = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const mode = text(req.body.mode).toLowerCase() === "student" ? "student" : "user";
    const senderEmail = text(req.body.senderemail || req.body.useremail || req.body.user);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (colid === undefined || !senderEmail) return res.status(400).json({ success: false, message: "colid and sender are required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one recipient" });

    const [sender, recipients, config] = await Promise.all([
      User.findOne({ colid, email: new RegExp(`^${escapeRegex(senderEmail)}$`, "i") }).select(userSelect).lean(),
      UserLocation.find({ _id: { $in: ids }, colid, ...roleQuery(mode), published: /^Yes$/i }).lean(),
      loadDefaultEmailConfig(colid)
    ]);
    if (!sender) return res.status(404).json({ success: false, message: "Sender not found" });
    if (!config?.username || !config?.password || !getSmtpHost(config)) {
      return res.status(400).json({ success: false, message: "Default active email configuration is missing or incomplete" });
    }

    const validRecipients = recipients.filter((row) => emailRegex.test(row.useremail || ""));
    if (!validRecipients.length) return res.status(400).json({ success: false, message: "No selected recipient has a valid email" });

    const transporter = createTransporter(config);
    let sent = 0;
    const errors = [];
    for (const recipient of validRecipients) {
      try {
        const html = `
          <p>Dear ${recipient.user || "User"},</p>
          <p>${sender.name || sender.email} would like to connect with you through the institution location search.</p>
          <p><strong>Contact details</strong><br/>
          Name: ${sender.name || ""}<br/>
          Email: ${sender.email || ""}<br/>
          Phone: ${sender.phone || ""}<br/>
          Role: ${sender.role || ""}</p>
          <p>Please reply directly if you wish to connect.</p>`;
        await transporter.sendMail({
          from: `"Institution" <${config.username}>`,
          to: recipient.useremail,
          subject: `Contact request from ${sender.name || sender.email}`,
          text: `${sender.name || sender.email} would like to connect. Email: ${sender.email || ""}, Phone: ${sender.phone || ""}`,
          html
        });
        sent += 1;
      } catch (error) {
        errors.push({ id: recipient._id, message: error.message });
      }
    }
    res.json({ success: true, message: `Contact email sent to ${sent} recipient${sent === 1 ? "" : "s"}`, sent, failed: errors.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
