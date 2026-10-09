const BillingInvoice = require("../Models/billinginvoiceds");
const BillingSubscription = require("../Models/billingsubscriptionds");
const User = require("../Models/user");

const PASSWORD = "kumropatash";
const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateOrNull = (value) => value ? new Date(value) : null;
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const calcTotal = (body = {}) => {
  const amount = num(body.amount);
  const gst = num(body.gst);
  const total = body.total === "" || body.total === undefined || body.total === null ? amount + gst : num(body.total);
  return { amount, gst, total };
};

const invoicePayload = (body = {}) => {
  const { amount, gst, total } = calcTotal(body);
  return {
    colid: num(body.colid),
    user: text(body.user),
    username: text(body.username),
    item: text(body.item),
    fromdate: dateOrNull(body.fromdate),
    todate: dateOrNull(body.todate),
    amount,
    gst,
    total,
    filelink: text(body.filelink),
    filename: text(body.filename),
    status: /^paid$/i.test(body.status) ? "Paid" : "Pending",
    remarks: text(body.remarks),
    metadata: body.metadata || undefined
  };
};

const payPayload = (body = {}, existing = {}) => {
  const paidamount = num(body.paidamount);
  const currentTotal = num(existing.total || body.total);
  const tdsdeducted = body.tdsdeducted === "" || body.tdsdeducted === undefined || body.tdsdeducted === null
    ? Math.max(currentTotal - paidamount, 0)
    : num(body.tdsdeducted);
  return {
    paidamount,
    tdsdeducted,
    tdspaiddate: dateOrNull(body.tdspaiddate),
    paiddate: dateOrNull(body.paiddate),
    paidaccount: text(body.paidaccount),
    refno: text(body.refno),
    paymode: text(body.paymode),
    status: /^paid$/i.test(body.status) || paidamount > 0 ? "Paid" : "Pending",
    remarks: text(body.remarks)
  };
};

const requirePassword = (req, res) => {
  const password = text(req.body.password || req.query.password || req.headers["x-billing-password"]);
  if (password !== PASSWORD) {
    res.status(403).json({ success: false, message: "Invalid password" });
    return false;
  }
  return true;
};

exports.listInvoices = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const status = text(req.query.status || req.body.status);
    const query = { colid };
    if (/^(Paid|Pending)$/i.test(status)) query.status = new RegExp(`^${esc(status)}$`, "i");
    const filters = req.body.dynamicFilters || [];
    filters.forEach((filter) => {
      const field = text(filter.field);
      const value = text(filter.value);
      if (!field || !value) return;
      if (["fromdate", "todate", "paiddate", "tdspaiddate", "createdAt"].includes(field)) {
        query[field] = { $gte: new Date(value) };
      } else {
        query[field] = { $regex: esc(value), $options: "i" };
      }
    });
    const rows = await BillingInvoice.find(query).sort({ fromdate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveInvoice = async (req, res) => {
  try {
    if (!requirePassword(req, res)) return;
    const payload = invoicePayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.item) return res.status(400).json({ success: false, message: "Item is required" });
    const data = req.body.id
      ? await BillingInvoice.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true })
      : await BillingInvoice.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePayDetails = async (req, res) => {
  try {
    if (!requirePassword(req, res)) return;
    const colid = num(req.body.colid);
    const id = text(req.body.id);
    if (!colid || !id) return res.status(400).json({ success: false, message: "Invoice and colid are required" });
    const invoice = await BillingInvoice.findOne({ _id: id, colid });
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    const data = await BillingInvoice.findOneAndUpdate({ _id: id, colid }, payPayload(req.body, invoice), { new: true });
    if (data && /^paid$/i.test(data.status)) {
      await exports.extendUserLastLoginForInvoice(data);
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteInvoices = async (req, res) => {
  try {
    if (!requirePassword(req, res)) return;
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!colid || !ids.length) return res.status(400).json({ success: false, message: "Select invoices to delete" });
    await BillingInvoice.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.tdsReport = async (req, res) => {
  try {
    const colid = num(req.body.colid || req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    (req.body.dynamicFilters || []).forEach((filter) => {
      const field = text(filter.field);
      const value = text(filter.value);
      if (!field || !value) return;
      query[field] = { $regex: esc(value), $options: "i" };
    });
    if (req.body.fromdate || req.body.todate) {
      query.fromdate = {};
      if (req.body.fromdate) query.fromdate.$gte = new Date(req.body.fromdate);
      if (req.body.todate) query.fromdate.$lte = new Date(req.body.todate);
    }
    const rows = await BillingInvoice.find(query).sort({ fromdate: -1 }).lean();
    const totalTdsDeducted = rows.reduce((sum, row) => sum + num(row.tdsdeducted), 0);
    const totalTdsPaid = rows.filter((row) => row.tdspaiddate).reduce((sum, row) => sum + num(row.tdsdeducted), 0);
    const statusSummary = ["Paid", "Pending"].map((status) => ({
      status,
      invoices: rows.filter((row) => row.status === status).length,
      tdsdeducted: rows.filter((row) => row.status === status).reduce((sum, row) => sum + num(row.tdsdeducted), 0)
    }));
    res.json({ success: true, data: rows, statusSummary, summary: { totalTdsDeducted, totalTdsPaid, totalTdsPending: totalTdsDeducted - totalTdsPaid, invoices: rows.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSubscription = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const row = await BillingSubscription.findOne({ colid }).lean();
    res.json({ success: true, data: row || { colid, active: "Yes" } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveSubscription = async (req, res) => {
  try {
    if (!requirePassword(req, res)) return;
    const colid = num(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = {
      colid,
      active: /^no$/i.test(req.body.active) ? "No" : "Yes",
      reason: text(req.body.reason),
      user: text(req.body.user),
      username: text(req.body.username)
    };
    const data = await BillingSubscription.findOneAndUpdate({ colid }, payload, { upsert: true, new: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.isSubscriptionActive = async (colid) => {
  const row = await BillingSubscription.findOne({ colid: num(colid) }).lean();
  return !row || !/^no$/i.test(row.active);
};

const addMonths = (date, months) => {
  const parsed = date && !Number.isNaN(new Date(date).getTime()) ? new Date(date) : new Date();
  const base = parsed.getTime() > Date.now() ? parsed : new Date();
  const next = new Date(base);
  next.setMonth(next.getMonth() + Math.max(0, num(months)));
  return next;
};

exports.extendUserLastLoginForInvoice = async (invoice = {}) => {
  const meta = invoice.metadata || {};
  if (text(meta.type) !== "UserLastLoginExtension") return { matched: 0, modified: 0 };
  if (/^yes$/i.test(text(meta.applied))) return { matched: 0, modified: 0, skipped: true };
  const colid = num(invoice.colid);
  const months = num(meta.months);
  const emails = Array.isArray(meta.users) ? meta.users.map((u) => text(u.email)).filter(Boolean) : [];
  if (!colid || !months || !emails.length) return { matched: 0, modified: 0 };
  const users = await User.find({ colid, email: { $in: emails }, role: { $not: /^student$/i } });
  let modified = 0;
  for (const user of users) {
    user.lastlogin = addMonths(user.lastlogin, months);
    await user.save();
    modified += 1;
  }
  invoice.metadata = {
    ...meta,
    applied: "Yes",
    appliedAt: new Date(),
    appliedUsers: modified
  };
  await BillingInvoice.findOneAndUpdate({ _id: invoice._id, colid }, { metadata: invoice.metadata });
  return { matched: users.length, modified };
};

exports.listNonStudentRoles = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const roles = await User.distinct("role", { colid, role: { $not: /^student$/i } });
    res.json({ success: true, data: roles.filter(Boolean).sort((a, b) => text(a).localeCompare(text(b))) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listUsersForExtension = async (req, res) => {
  try {
    const colid = num(req.body.colid || req.query.colid);
    const roles = Array.isArray(req.body.roles) ? req.body.roles.map(text).filter(Boolean) : [];
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!roles.length) return res.json({ success: true, data: [] });
    const rows = await User.find(
      { colid, role: { $in: roles, $not: /^student$/i } },
      { name: 1, email: 1, password: 1, designation: 1, role: 1, lastlogin: 1 }
    ).sort({ role: 1, name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.extendUserLastLogin = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const months = num(req.body.months);
    const emails = Array.isArray(req.body.emails) ? req.body.emails.map(text).filter(Boolean) : [];
    const password = text(req.body.password);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!emails.length) return res.status(400).json({ success: false, message: "Select users" });
    if (months < 1 || months > 12) return res.status(400).json({ success: false, message: "Select months from 1 to 12" });
    const users = await User.find(
      { colid, email: { $in: emails }, role: { $not: /^student$/i } },
      { name: 1, email: 1, password: 1, designation: 1, role: 1, lastlogin: 1 }
    ).sort({ role: 1, name: 1 });
    if (!users.length) return res.status(404).json({ success: false, message: "No matching non-student users found" });
    if (password === PASSWORD) {
      for (const user of users) {
        user.lastlogin = addMonths(user.lastlogin, months);
        await user.save();
      }
      return res.json({ success: true, mode: "extended", updated: users.length });
    }
    const amount = users.length * months * 1000;
    const invoice = await BillingInvoice.create({
      colid,
      user: text(req.body.user),
      username: text(req.body.username),
      item: `User last login extension - ${users.length} user(s) for ${months} month(s)`,
      fromdate: new Date(),
      amount,
      gst: 0,
      total: amount,
      status: "Pending",
      remarks: "Pay this invoice to extend selected user login validity.",
      metadata: {
        type: "UserLastLoginExtension",
        months,
        ratePerUserPerMonth: 1000,
        users: users.map((user) => ({
          name: user.name,
          email: user.email,
          role: user.role,
          designation: user.designation,
          previousLastLogin: user.lastlogin
        })),
        applied: "No"
      }
    });
    res.json({ success: true, mode: "invoice", amount, invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
