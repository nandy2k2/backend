const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../Models/user");
const Lead = require("../Models/crmh1");
const EmailConfiguration = require("../Models/emailconfigurationds");
const BulkEmailCampaign = require("../Models/bulkemailcampaignsds");
const BulkEmailLog = require("../Models/bulkemaillogds");

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

const clean = (value) => (value === undefined || value === null ? "" : String(value).trim());

const escapeRegex = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const allowedDynamicField = (field) => {
  const text = clean(field);
  return text && !text.includes("$") && !text.includes(".");
};

const applyDynamicFilters = (query, filters = []) => {
  if (!Array.isArray(filters)) return query;
  filters.forEach((item) => {
    const field = clean(item.field);
    const value = clean(item.value);
    const op = clean(item.operator || "contains").toLowerCase();
    if (!allowedDynamicField(field) || !value || value === "All") return;
    if (op === "equals") query[field] = value;
    else query[field] = { $regex: escapeRegex(value), $options: "i" };
  });
  return query;
};

const dateQuery = (from, to) => {
  const query = {};
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) query.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  return query;
};

const smtpHost = (config = {}) => config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : "");

const transporterFor = (config) => {
  const host = smtpHost(config);
  if (!config?.username || !config?.password || !host) throw new Error("Selected email configuration is incomplete");
  return nodemailer.createTransport({
    host,
    port: Number(config.port || 587),
    secure: clean(config.secure).toLowerCase() === "yes" || Number(config.port) === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const emailConfigLabel = (row) => `${row.provider || "Email"} / ${row.type || "General"} / ${row.username || ""}`;

const trackingBase = (req) => `${req.protocol}://${req.get("host")}`;

const htmlBody = (body, links = [], trackingUrl = "") => {
  const safeBody = clean(body).replace(/\n/g, "<br />");
  const linkHtml = (links || []).filter(Boolean).map((link, i) => `<div><a href="${link}">Attachment ${i + 1}</a></div>`).join("");
  const pixel = trackingUrl ? `<img src="${trackingUrl}" width="1" height="1" style="display:none" alt="" />` : "";
  return `${safeBody}${linkHtml ? `<hr />${linkHtml}` : ""}${pixel}`;
};

const attachmentList = (links = []) => (links || []).filter(Boolean).map((link, i) => ({
  filename: decodeURIComponent(String(link).split("/").pop() || `attachment-${i + 1}`),
  path: link
}));

exports.getEmailOptions = async (req, res) => {
  try {
    const colid = asNumber(req.query.colid);
    const [emailconfigs, roles, userFields, leadFields, campaigns] = await Promise.all([
      EmailConfiguration.find({ colid, isactive: { $ne: "No" } }).sort({ default: -1, provider: 1, username: 1 }).lean(),
      User.distinct("role", { colid }),
      User.findOne({ colid }).lean(),
      Lead.findOne({ colid }).lean(),
      BulkEmailCampaign.find({ colid }).sort({ createdAt: -1 }).lean()
    ]);
    res.json({
      success: true,
      emailconfigs: emailconfigs.map((row) => ({ ...row, label: emailConfigLabel(row) })),
      roles: (roles || []).filter(Boolean).sort(),
      userFields: Object.keys(userFields || {}).filter((f) => !["_id", "__v", "password", "authenticatorsecret"].includes(f)).sort(),
      leadFields: Object.keys(leadFields || {}).filter((f) => !["_id", "__v"].includes(f)).sort(),
      campaigns
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.distinctValues = async (req, res) => {
  try {
    const colid = asNumber(req.query.colid);
    const field = clean(req.query.field);
    const type = clean(req.query.type) === "lead" ? "lead" : "user";
    if (!allowedDynamicField(field)) return res.status(400).json({ success: false, message: "Invalid field" });
    const Model = type === "lead" ? Lead : User;
    const values = await Model.distinct(field, { colid });
    res.json({ success: true, values: (values || []).filter((v) => v !== undefined && v !== null && clean(v)).sort() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const query = { colid };
    if (Array.isArray(req.body.roles) && req.body.roles.length) query.role = { $in: req.body.roles.map(clean).filter(Boolean) };
    if (clean(req.body.search)) {
      const rx = new RegExp(escapeRegex(req.body.search), "i");
      query.$or = [{ name: rx }, { email: rx }, { role: rx }, { department: rx }, { designation: rx }, { regno: rx }];
    }
    applyDynamicFilters(query, req.body.dynamicFilters);
    const rows = await User.find(query).select("-password -authenticatorsecret").sort({ name: 1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.searchLeads = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const query = { colid, ...dateQuery(req.body.fromDate, req.body.toDate) };
    if (clean(req.body.search)) {
      const rx = new RegExp(escapeRegex(req.body.search), "i");
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }, { program: rx }, { programcode: rx }, { pipeline_stage: rx }, { source: rx }];
    }
    applyDynamicFilters(query, req.body.dynamicFilters);
    const rows = await Lead.find(query).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveCampaign = async (req, res) => {
  try {
    const payload = {
      colid: asNumber(req.body.colid),
      campaignname: clean(req.body.campaignname),
      description: clean(req.body.description),
      status: clean(req.body.status || "Active"),
      startdate: req.body.startdate ? new Date(req.body.startdate) : undefined,
      enddate: req.body.enddate ? new Date(req.body.enddate) : undefined,
      user: clean(req.body.user),
      name: clean(req.body.name)
    };
    if (!payload.colid || !payload.campaignname) return res.status(400).json({ success: false, message: "Campaign name is required" });
    const row = req.body.id
      ? await BulkEmailCampaign.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true })
      : await BulkEmailCampaign.create(payload);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const rows = await BulkEmailCampaign.find({ colid: asNumber(req.query.colid) }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkSend = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const recipients = Array.isArray(req.body.recipients) ? req.body.recipients : [];
    if (!recipients.length) return res.status(400).json({ success: false, message: "Select recipients" });
    if (!clean(req.body.subject) || !clean(req.body.body)) return res.status(400).json({ success: false, message: "Subject and body are required" });
    const config = await EmailConfiguration.findOne({ _id: req.body.emailconfigid, colid }).lean();
    if (!config) return res.status(400).json({ success: false, message: "Select a valid email configuration" });
    const transporter = transporterFor(config);
    const filelinks = Array.isArray(req.body.filelinks) ? req.body.filelinks.filter(Boolean) : [];
    const attachmentlinks = Array.isArray(req.body.attachmentlinks) ? req.body.attachmentlinks.filter(Boolean) : [];
    const docs = recipients.map((r) => ({
      colid,
      module: clean(req.body.module) === "CRM" ? "CRM" : "User",
      campaignid: clean(req.body.campaignid),
      campaignname: clean(req.body.campaignname),
      recipienttype: clean(req.body.recipienttype || req.body.module),
      recipientid: clean(r._id || r.id),
      recipientname: clean(r.name || r.lead || r.email),
      recipientemail: clean(r.email),
      subject: clean(req.body.subject),
      body: clean(req.body.body),
      filelinks,
      attachmentlinks,
      emailconfigid: clean(req.body.emailconfigid),
      emailconfigname: emailConfigLabel(config),
      fromemail: config.username,
      trackingtoken: crypto.randomBytes(20).toString("hex"),
      status: "Pending",
      user: clean(req.body.user),
      name: clean(req.body.name)
    })).filter((d) => d.recipientemail);
    const results = [];
    for (const doc of docs) {
      const row = await BulkEmailLog.create(doc);
      try {
        const trackUrl = `${trackingBase(req)}/api/v2/bulk-email/track/${row.trackingtoken}`;
        await transporter.sendMail({
          from: config.username,
          to: row.recipientemail,
          subject: row.subject,
          html: htmlBody(row.body, filelinks, trackUrl),
          text: `${row.body}\n\n${filelinks.join("\n")}`,
          attachments: attachmentList(attachmentlinks)
        });
        row.status = "Sent";
        row.sentat = new Date();
        await row.save();
        results.push({ email: row.recipientemail, status: "Sent" });
      } catch (err) {
        row.status = "Failed";
        row.error = err.message;
        await row.save();
        results.push({ email: row.recipientemail, status: "Failed", error: err.message });
      }
    }
    res.json({ success: true, sent: results.filter((r) => r.status === "Sent").length, failed: results.filter((r) => r.status === "Failed").length, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.trackOpen = async (req, res) => {
  try {
    await BulkEmailLog.findOneAndUpdate(
      { trackingtoken: clean(req.params.token) },
      { $set: { opened: "Yes", openedat: new Date() } }
    );
  } catch {
    // Pixel must still render even if logging fails.
  }
  const pixel = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.end(pixel);
};

exports.campaignReport = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const query = { colid, module: "CRM" };
    if (clean(req.body.campaignid)) query.campaignid = clean(req.body.campaignid);
    if (clean(req.body.opened) && clean(req.body.opened) !== "All") query.opened = clean(req.body.opened);
    Object.assign(query, dateQuery(req.body.fromDate, req.body.toDate));
    const rows = await BulkEmailLog.find(query).sort({ createdAt: -1 }).lean();
    const summary = {
      total: rows.length,
      sent: rows.filter((r) => r.status === "Sent").length,
      failed: rows.filter((r) => r.status === "Failed").length,
      opened: rows.filter((r) => r.opened === "Yes").length,
      notopened: rows.filter((r) => r.opened !== "Yes").length
    };
    res.json({ success: true, data: rows, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
