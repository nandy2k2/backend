const Lead = require("../Models/crmh1");
const Source = require("../Models/sourceds");
const PipelineStage = require("../Models/PipelineStageag");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const clean = (value) => (value === undefined || value === null ? "" : String(value).trim());
const allowedSourceTypes = ["Organic", "Paid", "Referral", "Direct", "Social Media", "Other"];
const normalizeSourceType = (value) => {
  const text = clean(value);
  return allowedSourceTypes.includes(text) ? text : "Other";
};
const truthy = (value) => ["true", "yes", "1", "active"].includes(clean(value).toLowerCase());

const dateRange = (from, to, field) => {
  const query = {};
  if (from || to) {
    query[field] = {};
    if (from) query[field].$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) query[field].$lte = new Date(`${to}T23:59:59.999Z`);
  }
  return query;
};

const leadSearchQuery = (body = {}) => {
  const colid = asNumber(body.colid);
  const query = { colid };
  const exactFields = ["year", "source", "pipeline_stage", "leadstatus", "assignedto", "category", "course_interested", "program", "program_type"];
  exactFields.forEach((field) => {
    if (clean(body[field]) && clean(body[field]) !== "All") query[field] = clean(body[field]);
  });
  if (body.fromDate || body.toDate) Object.assign(query, dateRange(body.fromDate, body.toDate, "createdAt"));
  if (clean(body.search)) {
    const regex = new RegExp(clean(body.search), "i");
    query.$or = [
      { name: regex },
      { phone: regex },
      { email: regex },
      { category: regex },
      { course_interested: regex },
      { pipeline_stage: regex },
      { source: regex },
      { assignedto: regex }
    ];
  }
  if (Array.isArray(body.dynamicFilters)) {
    body.dynamicFilters.forEach((item) => {
      const field = clean(item.field);
      const value = clean(item.value);
      const operator = clean(item.operator || "contains").toLowerCase();
      if (!field || !value || field.includes("$") || field.includes(".")) return;
      if (operator === "equals") query[field] = value;
      else query[field] = { $regex: value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    });
  }
  return query;
};

const normalizeLead = (row, context = {}) => ({
  ...row,
  colid: asNumber(row.colid || context.colid),
  user: clean(row.user || context.user || row.assignedto || "NA"),
  name: clean(row.name || row.lead || "NA"),
  phone: clean(row.phone || ""),
  email: clean(row.email || ""),
  category: clean(row.category || "NA"),
  source: clean(row.source || "NA"),
  assignedto: clean(row.assignedto || context.user || "NA"),
  pipeline_stage: clean(row.pipeline_stage || "New Lead"),
  leadstatus: clean(row.leadstatus || "Active")
});

exports.getCrmOptions = async (req, res) => {
  try {
    const colid = asNumber(req.query.colid);
    const [sources, stages, users, institution, leadOptions] = await Promise.all([
      Source.find({ colid }).sort({ source_name: 1 }).lean(),
      PipelineStage.find({ colid }).sort({ stagename: 1, name: 1 }).lean(),
      User.find({ colid }).select("name email role department").sort({ name: 1 }).lean(),
      Institution.findOne({ colid }).lean(),
      Lead.aggregate([
        { $match: { colid } },
        {
          $group: {
            _id: null,
            categories: { $addToSet: "$category" },
            courses: { $addToSet: "$course_interested" },
            statuses: { $addToSet: "$leadstatus" },
            programs: { $addToSet: "$program" },
            programTypes: { $addToSet: "$program_type" }
          }
        }
      ])
    ]);
    res.json({
      success: true,
      sources,
      stages,
      users,
      institution,
      leadOptions: leadOptions[0] || { categories: [], courses: [], statuses: [], programs: [], programTypes: [] }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSources = async (req, res) => {
  try {
    const rows = await Source.find({ colid: asNumber(req.query.colid) }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveSource = async (req, res) => {
  try {
    const body = { ...req.body, colid: asNumber(req.body.colid) };
    body.source_type = normalizeSourceType(body.source_type);
    const row = body.id
      ? await Source.findByIdAndUpdate(body.id, body, { new: true })
      : await Source.create(body);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteSource = async (req, res) => {
  try {
    await Source.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkSources = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const rows = (req.body.items || []).filter((row) => clean(row.source_name || row.Source));
    const docs = rows.map((row) => ({
      colid,
      source_name: clean(row.source_name || row.Source),
      source_type: normalizeSourceType(row.source_type || row.Type || "Other"),
      description: clean(row.description || row.Description),
      is_active: clean(row.is_active || row.Active || "Yes"),
      created_by: clean(row.created_by || req.body.user)
    }));
    if (docs.length) await Source.insertMany(docs, { ordered: false });
    res.json({ success: true, saved: docs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStages = async (req, res) => {
  try {
    const rows = await PipelineStage.find({ colid: asNumber(req.query.colid) }).sort({ stagename: 1, name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveStage = async (req, res) => {
  try {
    const body = { ...req.body, colid: asNumber(req.body.colid), name: req.body.name || req.body.stagename || "Stage" };
    const row = body.id
      ? await PipelineStage.findByIdAndUpdate(body.id, body, { new: true })
      : await PipelineStage.create(body);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteStage = async (req, res) => {
  try {
    await PipelineStage.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkStages = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const docs = (req.body.items || [])
      .filter((row) => clean(row.stagename || row.Stage))
      .map((row) => ({
        colid,
        user: clean(row.user || req.body.user || "NA"),
        name: clean(row.name || row.stagename || row.Stage),
        stagename: clean(row.stagename || row.Stage),
        description: clean(row.description || row.Description),
        isactive: row.isactive === undefined && row.Active === undefined ? true : truthy(row.isactive || row.Active),
        is_final_stage: truthy(row.is_final_stage || row.Final)
      }));
    if (docs.length) await PipelineStage.insertMany(docs, { ordered: false });
    res.json({ success: true, saved: docs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.searchLeads = async (req, res) => {
  try {
    const page = Math.max(0, Number(req.body.page || 0));
    const limit = Math.min(100, Math.max(1, Number(req.body.limit || 100)));
    const query = leadSearchQuery(req.body);
    const [rows, total] = await Promise.all([
      Lead.find(query).sort({ updatedAt: -1 }).skip(page * limit).limit(limit).lean(),
      Lead.countDocuments(query)
    ]);
    res.json({ success: true, data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveLead = async (req, res) => {
  try {
    const data = normalizeLead(req.body, req.body);
    const row = req.body.id
      ? await Lead.findByIdAndUpdate(req.body.id, data, { new: true })
      : await Lead.create(data);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkLeads = async (req, res) => {
  try {
    const docs = (req.body.items || []).map((row) => normalizeLead(row, req.body));
    if (docs.length) await Lead.insertMany(docs, { ordered: false });
    res.json({ success: true, saved: docs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateLeadAction = async (req, res) => {
  try {
    const update = {};
    const increment = {};
    if (clean(req.body.pipeline_stage)) update.pipeline_stage = clean(req.body.pipeline_stage);
    if (clean(req.body.followupdate)) update.followupdate = new Date(req.body.followupdate);
    if (clean(req.body.next_followup_date)) update.next_followup_date = new Date(req.body.next_followup_date);
    if (clean(req.body.assignedto)) {
      update.assignedto = clean(req.body.assignedto);
      update.assigned_date = new Date();
      increment.reassignment_count = 1;
    }
    if (clean(req.body.fcomments)) update.fcomments = clean(req.body.fcomments);
    const payload = Object.keys(increment).length ? { $set: update, $inc: increment } : { $set: update };
    const row = await Lead.findOneAndUpdate({ _id: req.body.id, colid: asNumber(req.body.colid) }, payload, { new: true });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMyLeads = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const assignedto = clean(req.body.assignedto || req.body.user || req.body.email);
    if (!assignedto) return res.status(400).json({ success: false, message: "assigned user is required" });
    const query = { ...leadSearchQuery({ ...req.body, colid }), assignedto };
    const rows = await Lead.find(query).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createMyLead = async (req, res) => {
  try {
    const assignedto = clean(req.body.assignedto || req.body.user || req.body.email);
    if (!assignedto) return res.status(400).json({ success: false, message: "assigned user is required" });
    const data = normalizeLead({ ...req.body, assignedto, user: assignedto }, { ...req.body, user: assignedto });
    const row = await Lead.create(data);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateMyLeadStatus = async (req, res) => {
  try {
    const assignedto = clean(req.body.assignedto || req.body.user || req.body.email);
    if (!assignedto) return res.status(400).json({ success: false, message: "assigned user is required" });
    const update = {};
    if (clean(req.body.pipeline_stage)) update.pipeline_stage = clean(req.body.pipeline_stage);
    if (clean(req.body.leadstatus)) update.leadstatus = clean(req.body.leadstatus);
    const nextFollowup = clean(req.body.next_followup_date || req.body.nextfollowupdate);
    if (nextFollowup) update.next_followup_date = new Date(nextFollowup);
    if (clean(req.body.comments)) {
      update.comments = clean(req.body.comments);
      update.fcomments = clean(req.body.comments);
    }
    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: "Nothing to update" });
    const row = await Lead.findOneAndUpdate(
      { _id: req.body.id, colid: asNumber(req.body.colid), assignedto },
      { $set: update },
      { new: true }
    );
    if (!row) return res.status(404).json({ success: false, message: "Lead not found for this user" });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMyFollowups = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const assignedto = clean(req.body.assignedto || req.body.user || req.body.email);
    if (!assignedto) return res.status(400).json({ success: false, message: "assigned user is required" });
    const { fromDate, toDate, ...searchBody } = req.body;
    const query = {
      ...leadSearchQuery({ ...searchBody, colid }),
      assignedto,
      ...dateRange(fromDate, toDate, "next_followup_date")
    };
    const rows = await Lead.find(query).sort({ next_followup_date: 1, updatedAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const reportType = req.body.reportType || "counselor";
    const match = { colid };
    if (req.body.assignedto && req.body.assignedto !== "All") match.assignedto = req.body.assignedto;
    if (req.body.pipeline_stage && req.body.pipeline_stage !== "All") match.pipeline_stage = req.body.pipeline_stage;
    if (req.body.source && req.body.source !== "All") match.source = req.body.source;
    if (req.body.course_interested && req.body.course_interested !== "All") match.course_interested = req.body.course_interested;
    const dateField = reportType === "followup"
      ? "followupdate"
      : reportType === "nextFollowup"
        ? "next_followup_date"
        : "createdAt";
    Object.assign(match, dateRange(req.body.fromDate, req.body.toDate, dateField));

    let data = [];
    if (reportType === "counselor") {
      data = await Lead.aggregate([
        { $match: match },
        { $group: { _id: { counselor: "$assignedto", stage: "$pipeline_stage" }, count: { $sum: 1 } } },
        { $project: { _id: 0, counselor: { $ifNull: ["$_id.counselor", "Unassigned"] }, pipeline_stage: { $ifNull: ["$_id.stage", "Unknown"] }, count: 1 } },
        { $sort: { counselor: 1, pipeline_stage: 1 } }
      ]);
    } else if (reportType === "dailyAdded") {
      data = await Lead.aggregate([
        { $match: match },
        { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, stage: "$pipeline_stage" }, count: { $sum: 1 } } },
        { $project: { _id: 0, date: "$_id.day", pipeline_stage: { $ifNull: ["$_id.stage", "Unknown"] }, count: 1 } },
        { $sort: { date: 1, pipeline_stage: 1 } }
      ]);
    } else if (reportType === "followup" || reportType === "nextFollowup") {
      data = await Lead.aggregate([
        { $match: match },
        { $project: { name: 1, phone: 1, email: 1, assignedto: 1, pipeline_stage: 1, followupdate: 1, next_followup_date: 1, source: 1, course_interested: 1 } },
        { $sort: reportType === "nextFollowup" ? { next_followup_date: 1 } : { followupdate: 1 } }
      ]);
    } else {
      data = await Lead.aggregate([
        { $match: match },
        { $group: { _id: "$pipeline_stage", count: { $sum: 1 } } },
        { $project: { _id: 0, pipeline_stage: { $ifNull: ["$_id", "Unknown"] }, count: 1 } },
        { $sort: { pipeline_stage: 1 } }
      ]);
    }
    const institution = await Institution.findOne({ colid }).lean();
    res.json({ success: true, data, institution });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
