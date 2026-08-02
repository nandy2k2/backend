const Lead = require("../Models/crmh1");
const Source = require("../Models/sourceds");
const PipelineStage = require("../Models/PipelineStageag");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const LeadActivity = require("../Models/leadactivityds");
const TelecallerMapping = require("../Models/crmtelecallermappingds");
const CampusVisitQueue = require("../Models/crmcampusvisitqueueds");

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
  const exactFields = ["year", "source", "pipeline_stage", "leadstatus", "assignedto", "telecalleremail", "campusvisitcounseloremail", "category", "course_interested", "program", "programcode", "program_code", "program_type"];
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
      { assignedto: regex },
      { telecaller: regex },
      { telecalleremail: regex },
      { campusvisitcounselor: regex },
      { campusvisitcounseloremail: regex }
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
    if (row) {
      await LeadActivity.create({
        lead_id: row._id,
        colid: asNumber(req.body.colid),
        activity_type: "Lead Update",
        activity_date: new Date(),
        performed_by: clean(req.body.performed_by || req.body.user || req.body.assignedto || row.assignedto),
        notes: clean(req.body.fcomments || req.body.comments),
        outcome: [update.pipeline_stage, update.assignedto ? `Assigned to ${update.assignedto}` : ""].filter(Boolean).join(" / "),
        next_action: update.next_followup_date ? "Follow up" : "",
        next_followup_date: update.next_followup_date
      });
    }
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTelecallerMappings = async (req, res) => {
  try {
    const rows = await TelecallerMapping.find({ colid: asNumber(req.query.colid) }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveTelecallerMappings = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const people = Array.isArray(req.body.telecallers) ? req.body.telecallers : [];
    if (!clean(req.body.academicyear) || !clean(req.body.programcode) || !people.length) {
      return res.status(400).json({ success: false, message: "Academic year, program and users are required" });
    }
    const docs = people.map((person) => ({
      academicyear: clean(req.body.academicyear),
      program: clean(req.body.program),
      programcode: clean(req.body.programcode),
      telecallername: clean(person.name || person.telecallername || person.email),
      telecalleremail: clean(person.email || person.telecalleremail),
      type: clean(req.body.type) === "Campus Visit Counselor" ? "Campus Visit Counselor" : "Telecaller",
      status: clean(req.body.status || "Active"),
      colid,
      user: clean(req.body.user)
    })).filter((item) => item.telecalleremail);
    if (docs.length) {
      await TelecallerMapping.bulkWrite(docs.map((doc) => ({
        updateOne: {
          filter: { colid, academicyear: doc.academicyear, programcode: doc.programcode, telecalleremail: doc.telecalleremail, type: doc.type },
          update: { $set: doc },
          upsert: true
        }
      })), { ordered: false });
    }
    res.json({ success: true, saved: docs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteTelecallerMappings = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    await TelecallerMapping.deleteMany({ _id: { $in: ids }, colid: asNumber(req.body.colid) });
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkAssignTelecallers = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const person = req.body.telecaller || {};
    const email = clean(person.email || req.body.telecalleremail);
    const assignmentType = clean(req.body.assignmentType) === "Campus Visit Counselor" ? "Campus Visit Counselor" : "Telecaller";
    if (!ids.length || !email) return res.status(400).json({ success: false, message: "Select leads and user" });
    const setFields = assignmentType === "Campus Visit Counselor"
      ? { campusvisitcounselor: clean(person.name || req.body.telecallername || email), campusvisitcounseloremail: email, campus_visit_assigned_date: new Date() }
      : { telecaller: clean(person.name || req.body.telecallername || email), telecalleremail: email, telecaller_assigned_date: new Date() };
    const result = await Lead.updateMany(
      { _id: { $in: ids }, colid: asNumber(req.body.colid) },
      { $set: setFields }
    );
    const leads = await Lead.find({ _id: { $in: ids }, colid: asNumber(req.body.colid) }).select("_id").lean();
    await LeadActivity.insertMany(leads.map((lead) => ({
      lead_id: lead._id,
      colid: asNumber(req.body.colid),
      activity_type: `${assignmentType} Assignment`,
      activity_date: new Date(),
      performed_by: clean(req.body.user),
      notes: `Assigned to ${email}`,
      outcome: "Assigned",
      next_action: "Telecalling"
    })), { ordered: false });
    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.randomAssignTelecallers = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const telecallers = Array.isArray(req.body.telecallers) ? req.body.telecallers.filter((item) => clean(item.email)) : [];
    const leadsPerTelecaller = Math.max(1, Number(req.body.leadsPerTelecaller || 1));
    const assignmentType = clean(req.body.assignmentType) === "Campus Visit Counselor" ? "Campus Visit Counselor" : "Telecaller";
    if (!telecallers.length) return res.status(400).json({ success: false, message: "Select users" });
    const query = leadSearchQuery({
      colid,
      year: req.body.academicyear,
      pipeline_stage: req.body.pipeline_stage,
      leadstatus: req.body.leadstatus,
      source: req.body.source,
      dynamicFilters: req.body.dynamicFilters
    });
    const andRules = [];
    if (clean(req.body.program) || clean(req.body.programcode)) {
      andRules.push({
        $or: [
          { program: clean(req.body.program) },
          { course_interested: clean(req.body.program) },
          { programcode: clean(req.body.programcode) },
          { program_code: clean(req.body.programcode) }
        ].filter((item) => Object.values(item)[0])
      });
    }
    if (clean(req.body.onlyUnassigned || "Yes") !== "No") {
      const field = assignmentType === "Campus Visit Counselor" ? "campusvisitcounseloremail" : "telecalleremail";
      andRules.push({ $or: [{ [field]: { $exists: false } }, { [field]: "" }, { [field]: "NA" }] });
    }
    if (andRules.length) query.$and = [...(query.$and || []), ...andRules];
    const limit = telecallers.length * leadsPerTelecaller;
    const leads = await Lead.find(query).sort({ updatedAt: 1 }).limit(limit).lean();
    const operations = [];
    const activities = [];
    leads.forEach((lead, index) => {
      const person = telecallers[Math.floor(index / leadsPerTelecaller) % telecallers.length];
      const setFields = assignmentType === "Campus Visit Counselor"
        ? { campusvisitcounselor: clean(person.name || person.email), campusvisitcounseloremail: clean(person.email), campus_visit_assigned_date: new Date() }
        : { telecaller: clean(person.name || person.email), telecalleremail: clean(person.email), telecaller_assigned_date: new Date() };
      operations.push({
        updateOne: {
          filter: { _id: lead._id, colid },
          update: { $set: setFields }
        }
      });
      activities.push({
        lead_id: lead._id,
        colid,
        activity_type: `Random ${assignmentType} Assignment`,
        activity_date: new Date(),
        performed_by: clean(req.body.user),
        notes: `Auto assigned to ${clean(person.email)}`,
        outcome: "Assigned",
        next_action: "Telecalling"
      });
    });
    if (operations.length) await Lead.bulkWrite(operations, { ordered: false });
    if (activities.length) await LeadActivity.insertMany(activities, { ordered: false });
    res.json({ success: true, assigned: operations.length, preview: leads.map((lead, index) => ({ lead: lead.name, phone: lead.phone, email: lead.email, assignedto: telecallers[Math.floor(index / leadsPerTelecaller) % telecallers.length]?.email, assignmentType })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.telecallerReport = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid || req.query.colid);
    const query = leadSearchQuery({ ...req.body, colid });
    const assignmentType = clean(req.body.assignmentType) === "Campus Visit Counselor" ? "Campus Visit Counselor" : "Telecaller";
    if (clean(req.body.telecalleremail)) {
      if (assignmentType === "Campus Visit Counselor") query.campusvisitcounseloremail = clean(req.body.telecalleremail);
      else query.telecalleremail = clean(req.body.telecalleremail);
    }
    const rows = await Lead.find(query).sort({ updatedAt: -1 }).limit(5000).lean();
    const activities = await LeadActivity.find({ colid, activity_type: { $in: ["Lead Update", "Telecaller Assignment", "Random Telecaller Assignment", "Campus Visit Counselor Assignment", "Random Campus Visit Counselor Assignment"] } }).sort({ activity_date: -1 }).limit(10000).lean();
    const byTelecaller = {};
    const byStage = {};
    rows.forEach((lead) => {
      const key = assignmentType === "Campus Visit Counselor"
        ? clean(lead.campusvisitcounseloremail) || "Unassigned"
        : clean(lead.telecalleremail) || "Unassigned";
      byTelecaller[key] = (byTelecaller[key] || 0) + 1;
      const stage = clean(lead.pipeline_stage) || "Not specified";
      byStage[stage] = (byStage[stage] || 0) + 1;
    });
    const leadIdSet = new Set(rows.map((row) => String(row._id)));
    const relatedActivities = activities.filter((item) => leadIdSet.has(String(item.lead_id)));
    res.json({
      success: true,
      data: rows,
      activities: relatedActivities,
      summary: {
        total: rows.length,
        assigned: rows.filter((row) => assignmentType === "Campus Visit Counselor" ? clean(row.campusvisitcounseloremail) : clean(row.telecalleremail)).length,
        active: rows.filter((row) => /^active$/i.test(clean(row.leadstatus))).length,
        interactions: relatedActivities.length,
        byTelecaller: Object.entries(byTelecaller).map(([name, count]) => ({ name, count })),
        byStage: Object.entries(byStage).map(([name, count]) => ({ name, count }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const leadOwnerQuery = (email) => ({
  $or: [
    { assignedto: email },
    { telecalleremail: email },
    { campusvisitcounseloremail: email }
  ]
});

exports.assignCounselorFromTelecaller = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const counselor = req.body.counselor || {};
    const counseloremail = clean(counselor.email || req.body.counseloremail);
    const telecalleremail = clean(req.body.telecalleremail || req.body.user || req.body.email);
    if (!ids.length || !counseloremail) return res.status(400).json({ success: false, message: "Select leads and counselor" });
    const result = await Lead.updateMany(
      { _id: { $in: ids }, colid: asNumber(req.body.colid), telecalleremail },
      {
        $set: {
          assignedto: counseloremail,
          counselorname: clean(counselor.name || req.body.counselorname || counseloremail),
          assigned_date: new Date()
        },
        $inc: { reassignment_count: 1 }
      }
    );
    const leads = await Lead.find({ _id: { $in: ids }, colid: asNumber(req.body.colid), telecalleremail }).select("_id name").lean();
    await LeadActivity.insertMany(leads.map((lead) => ({
      lead_id: lead._id,
      colid: asNumber(req.body.colid),
      activity_type: "Counselor Assignment",
      activity_date: new Date(),
      performed_by: telecalleremail,
      notes: `Telecaller assigned counselor ${counseloremail}`,
      outcome: "Assigned to counselor",
      next_action: "Counselor follow-up"
    })), { ordered: false });
    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markCampusVisit = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const counselor = req.body.campusCounselor || {};
    const campusEmail = clean(counselor.email || req.body.campusvisitcounseloremail);
    const useremail = clean(req.body.user || req.body.email || req.body.assignedto);
    if (!ids.length || !campusEmail || !clean(req.body.visitdate) || !clean(req.body.visittime)) {
      return res.status(400).json({ success: false, message: "Select leads, campus visit counselor, date and time" });
    }
    const result = await Lead.updateMany(
      { _id: { $in: ids }, colid: asNumber(req.body.colid), assignedto: useremail },
      {
        $set: {
          campusvisitcounselor: clean(counselor.name || req.body.campusvisitcounselor || campusEmail),
          campusvisitcounseloremail: campusEmail,
          campus_visit_assigned_date: new Date(),
          campus_visit_date: new Date(`${clean(req.body.visitdate)}T${clean(req.body.visittime) || "00:00"}`),
          campus_visit_completed: "No"
        }
      }
    );
    const leads = await Lead.find({ _id: { $in: ids }, colid: asNumber(req.body.colid), assignedto: useremail }).select("_id name").lean();
    await LeadActivity.insertMany(leads.map((lead) => ({
      lead_id: lead._id,
      colid: asNumber(req.body.colid),
      activity_type: "Campus Visit Marked",
      activity_date: new Date(),
      performed_by: useremail,
      notes: clean(req.body.comments) || `Marked for campus visit on ${clean(req.body.visitdate)} ${clean(req.body.visittime)}`,
      outcome: `Campus visit counselor ${campusEmail}`,
      next_action: "Campus visit"
    })), { ordered: false });
    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const nextCampusToken = async (colid) => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await CampusVisitQueue.countDocuments({ colid, tokennumber: { $regex: `^CV${date}` } });
  return `CV${date}-${String(count + 1).padStart(4, "0")}`;
};

exports.submitCampusVisitForm = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const phone = clean(req.body.phone);
    const email = clean(req.body.email);
    if (!clean(req.body.name) || (!phone && !email)) return res.status(400).json({ success: false, message: "Name and phone or email are required" });
    let lead = await Lead.findOne({
      colid,
      $or: [{ phone }, { email }].filter((item) => Object.values(item)[0])
    });
    if (!lead) {
      lead = await Lead.create(normalizeLead({
        ...req.body,
        year: clean(req.body.academicyear || req.body.year),
        source: clean(req.body.source || "Campus Visit"),
        pipeline_stage: clean(req.body.pipeline_stage || "Campus Visit Queue"),
        leadstatus: "Active",
        assignedto: clean(req.body.assignedto || "NA"),
        user: clean(req.body.user || "campus-visit-form")
      }, { colid, user: clean(req.body.user || "campus-visit-form") }));
    }
    const tokennumber = await nextCampusToken(colid);
    const queue = await CampusVisitQueue.create({
      tokennumber,
      leadid: lead._id,
      name: clean(req.body.name || lead.name),
      phone: clean(req.body.phone || lead.phone),
      email: clean(req.body.email || lead.email),
      academicyear: clean(req.body.academicyear || req.body.year || lead.year),
      program: clean(req.body.program || lead.program),
      programcode: clean(req.body.programcode || lead.programcode),
      course_interested: clean(req.body.course_interested || lead.course_interested),
      source: clean(req.body.source || "Campus Visit"),
      visitdate: clean(req.body.visitdate) || new Date().toISOString().slice(0, 10),
      visittime: clean(req.body.visittime) || new Date().toTimeString().slice(0, 5),
      purpose: clean(req.body.purpose),
      status: "Waiting",
      colid,
      user: clean(req.body.user || "campus-visit-form")
    });
    await LeadActivity.create({
      lead_id: lead._id,
      colid,
      activity_type: "Campus Visit Queue",
      activity_date: new Date(),
      performed_by: clean(req.body.user || "campus-visit-form"),
      notes: `Campus visit form submitted. Token ${tokennumber}`,
      outcome: "Waiting",
      next_action: "Campus visit counseling"
    });
    res.json({ success: true, tokennumber, data: queue, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCampusVisitQueue = async (req, res) => {
  try {
    const colid = asNumber(req.query.colid || req.body.colid);
    const status = clean(req.query.status || req.body.status || "Waiting");
    const filter = { colid };
    if (status !== "All") filter.status = status;
    if (clean(req.query.counseloremail || req.body.counseloremail)) filter.counseloremail = clean(req.query.counseloremail || req.body.counseloremail);
    const rows = await CampusVisitQueue.find(filter).sort({ createdAt: 1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.takeCampusVisitQueue = async (req, res) => {
  try {
    const counselor = req.body.counselor || {};
    const counseloremail = clean(counselor.email || req.body.counseloremail || req.body.user);
    const row = await CampusVisitQueue.findOneAndUpdate(
      { _id: req.body.id, colid: asNumber(req.body.colid), status: "Waiting" },
      { $set: { status: "Assigned", counselorname: clean(counselor.name || req.body.counselorname || counseloremail), counseloremail, takenat: new Date() } },
      { new: true }
    );
    if (!row) return res.status(404).json({ success: false, message: "Queue token is already taken or not found" });
    await Lead.findOneAndUpdate(
      { _id: row.leadid, colid: asNumber(req.body.colid) },
      { $set: { campusvisitcounselor: row.counselorname, campusvisitcounseloremail: row.counseloremail, campus_visit_completed: "In Progress" } }
    );
    await LeadActivity.create({
      lead_id: row.leadid,
      colid: asNumber(req.body.colid),
      activity_type: "Campus Visit Token Taken",
      activity_date: new Date(),
      performed_by: counseloremail,
      notes: `Token ${row.tokennumber} taken by ${counseloremail}`,
      outcome: "Assigned",
      next_action: "Counseling"
    });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.campusVisitComment = async (req, res) => {
  try {
    const queue = await CampusVisitQueue.findOne({ _id: req.body.queueid, colid: asNumber(req.body.colid) }).lean();
    const leadid = req.body.leadid || queue?.leadid;
    if (!leadid) return res.status(400).json({ success: false, message: "Lead is required" });
    const comment = clean(req.body.comments);
    const update = {
      campus_visit_completed: clean(req.body.status) || "Yes",
      comments: comment,
      fcomments: comment
    };
    if (clean(req.body.pipeline_stage)) update.pipeline_stage = clean(req.body.pipeline_stage);
    if (clean(req.body.next_followup_date)) update.next_followup_date = new Date(req.body.next_followup_date);
    const lead = await Lead.findOneAndUpdate({ _id: leadid, colid: asNumber(req.body.colid) }, { $set: update }, { new: true });
    if (queue?._id) {
      await CampusVisitQueue.findOneAndUpdate(
        { _id: queue._id, colid: asNumber(req.body.colid) },
        { $set: { status: clean(req.body.queueStatus || "Completed"), comments: comment } }
      );
    }
    await LeadActivity.create({
      lead_id: leadid,
      colid: asNumber(req.body.colid),
      activity_type: "Campus Visit Comment",
      activity_date: new Date(),
      performed_by: clean(req.body.user || req.body.counseloremail),
      notes: comment,
      outcome: clean(req.body.pipeline_stage || req.body.status),
      next_action: clean(req.body.next_followup_date) ? "Follow up" : "",
      next_followup_date: update.next_followup_date
    });
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMyLeads = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const assignedto = clean(req.body.assignedto || req.body.user || req.body.email);
    if (!assignedto) return res.status(400).json({ success: false, message: "assigned user is required" });
    const query = leadSearchQuery({ ...req.body, colid, assignedto: "" });
    const ownerOr = [
      { assignedto },
      { telecalleremail: assignedto },
      { campusvisitcounseloremail: assignedto }
    ];
    if (query.$or) {
      query.$and = [...(query.$and || []), { $or: query.$or }, { $or: ownerOr }];
      delete query.$or;
    } else {
      query.$or = ownerOr;
    }
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
      {
        _id: req.body.id,
        colid: asNumber(req.body.colid),
        $or: [
          { assignedto },
          { telecalleremail: assignedto },
          { campusvisitcounseloremail: assignedto }
        ]
      },
      { $set: update },
      { new: true }
    );
    if (!row) return res.status(404).json({ success: false, message: "Lead not found for this user" });
    await LeadActivity.create({
      lead_id: row._id,
      colid: asNumber(req.body.colid),
      activity_type: "Lead Update",
      activity_date: new Date(),
      performed_by: assignedto,
      notes: clean(req.body.comments),
      outcome: [update.pipeline_stage, update.leadstatus].filter(Boolean).join(" / "),
      next_action: update.next_followup_date ? "Follow up" : "",
      next_followup_date: update.next_followup_date
    });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.dailyInteractionReport = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid || req.query.colid);
    const fromDate = clean(req.body.fromDate || req.query.fromDate);
    const toDate = clean(req.body.toDate || req.query.toDate);
    const useremail = clean(req.body.useremail || req.query.useremail);
    const match = { colid, activity_type: "Lead Update" };
    if (fromDate || toDate) {
      match.activity_date = {};
      if (fromDate) match.activity_date.$gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) match.activity_date.$lte = new Date(`${toDate}T23:59:59.999Z`);
    }
    if (useremail && useremail !== "All") match.performed_by = useremail;
    const [activities, users, loggedLeadIds] = await Promise.all([
      LeadActivity.find(match).populate("lead_id", "name phone email source course_interested pipeline_stage leadstatus").sort({ activity_date: -1 }).lean(),
      User.find({ colid }).select("name email role department").lean(),
      LeadActivity.distinct("lead_id", { colid, activity_type: "Lead Update" })
    ]);
    const userMap = new Map(users.map((item) => [clean(item.email).toLowerCase(), item]));
    const activityRows = activities.map((item) => {
      const user = userMap.get(clean(item.performed_by).toLowerCase()) || {};
      const lead = item.lead_id || {};
      return {
        _id: item._id,
        activitydate: item.activity_date,
        activitydateshort: item.activity_date ? new Date(item.activity_date).toISOString().slice(0, 10) : "",
        user: user.name || item.performed_by,
        useremail: item.performed_by,
        nextfollowupdate: item.next_followup_date,
        nextfollowupdateshort: item.next_followup_date ? new Date(item.next_followup_date).toISOString().slice(0, 10) : "",
        comments: item.notes || "",
        outcome: item.outcome || "",
        lead: lead.name || "",
        leadphone: lead.phone || "",
        leademail: lead.email || "",
        source: lead.source || "",
        course_interested: lead.course_interested || "",
        pipeline_stage: lead.pipeline_stage || "",
        leadstatus: lead.leadstatus || ""
      };
    });
    const legacyLeadQuery = {
      colid,
      _id: { $nin: loggedLeadIds },
      $or: [
        { comments: { $exists: true, $nin: ["", null] } },
        { fcomments: { $exists: true, $nin: ["", null] } }
      ]
    };
    if (fromDate || toDate) Object.assign(legacyLeadQuery, dateRange(fromDate, toDate, "updatedAt"));
    if (useremail && useremail !== "All") legacyLeadQuery.assignedto = useremail;
    const legacyLeads = await Lead.find(legacyLeadQuery)
      .select("name phone email source course_interested pipeline_stage leadstatus assignedto comments fcomments next_followup_date updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    const legacyRows = legacyLeads.map((lead) => {
      const user = userMap.get(clean(lead.assignedto).toLowerCase()) || {};
      const commentText = clean(lead.comments) || clean(lead.fcomments);
      return {
        _id: `legacy-${lead._id}`,
        activitydate: lead.updatedAt,
        activitydateshort: lead.updatedAt ? new Date(lead.updatedAt).toISOString().slice(0, 10) : "",
        user: user.name || lead.assignedto,
        useremail: lead.assignedto,
        nextfollowupdate: lead.next_followup_date,
        nextfollowupdateshort: lead.next_followup_date ? new Date(lead.next_followup_date).toISOString().slice(0, 10) : "",
        comments: commentText,
        outcome: "Legacy My Leads comment",
        lead: lead.name || "",
        leadphone: lead.phone || "",
        leademail: lead.email || "",
        source: lead.source || "",
        course_interested: lead.course_interested || "",
        pipeline_stage: lead.pipeline_stage || "",
        leadstatus: lead.leadstatus || ""
      };
    });
    const rows = [...activityRows, ...legacyRows].sort((a, b) => new Date(b.activitydate || 0) - new Date(a.activitydate || 0));
    const byDateMap = new Map();
    const byUserMap = new Map();
    rows.forEach((row) => {
      byDateMap.set(row.activitydateshort, (byDateMap.get(row.activitydateshort) || 0) + 1);
      byUserMap.set(row.user || row.useremail, (byUserMap.get(row.user || row.useremail) || 0) + 1);
    });
    const byDate = Array.from(byDateMap.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
    const byUser = Array.from(byUserMap.entries()).map(([user, count]) => ({ user, count })).sort((a, b) => b.count - a.count);
    const today = new Date().toISOString().slice(0, 10);
    const dueFollowups = rows.filter((row) => row.nextfollowupdateshort && row.nextfollowupdateshort <= today).length;
    res.json({
      success: true,
      data: rows,
      summary: {
        total: rows.length,
        users: byUser.length,
        dueFollowups,
        withComments: rows.filter((row) => clean(row.comments)).length,
        byDate,
        byUser
      },
      users
    });
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
