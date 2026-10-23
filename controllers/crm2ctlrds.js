const router = require("express").Router();
const mongoose = require("mongoose");
const { Lead, masterModels, masters, masterLeadFields, fields, managed, excluded } = require("../Models/crm2ds");
const multer = require("multer");
const AWS = require("aws-sdk");
const Awsconfig = require("../Models/awsconfig");
const User = require("../Models/user");
const { randomBytes, scrypt } = require("node:crypto");
const deriveKey = require("node:util").promisify(scrypt);
const text = value => String(value ?? "").trim();
const regex = value => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const emailKey = value => text(value).toLowerCase();
const exactEmail = value => new RegExp(`^${regex(value).source}$`, "i");
const phoneKey = value => text(value).replace(/\D/g, "");
const demographicCategories = ["SC", "ST", "General", "OBC"];
function publicLead(saved) {
  const data = saved.toObject ? saved.toObject({ flattenMaps: true }) : { ...saved };
  if (data.category && (data.crm2profileversion !== 2 || !demographicCategories.includes(data.category))) {
    if (!data.crmcategory) data.crmcategory = data.category;
    delete data.category;
  }
  for (const field of excluded) if (field !== "_id") delete data[field];
  delete data.password; delete data.emailkey; delete data.phonekey;
  delete data.crm2profileversion;
  delete data.interactions;
  return data;
}
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = handler => async (req, res) => {
  try {
    const colid = Number(req.body?.colid || req.query.colid);
    if (!Number.isFinite(colid) || colid <= 0) throw error("Institution ID is required");
    req.colid = colid;
    await handler(req, res);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : err.status || 500).json({ success: false, message: err.code === 11000 ? "Duplicate found. The email, phone or master name already exists; cannot proceed." : err.message });
  }
};
const masterModel = kind => { if (!masterModels[kind]) throw error("Unknown CRM 2 master"); return masterModels[kind]; };

router.get("/metadata", wrap(async (req, res) => res.json({ success: true, masters, fields })));
router.post("/upload", multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).single("file"), wrap(async (req, res) => {
  if (!req.file) throw error("Select a file");
  if (req.body.kind === "photo" && !/^image\/(jpeg|png|webp|gif)$/.test(req.file.mimetype)) throw error("Choose a JPG, PNG, WebP or GIF photo");
  const config = await Awsconfig.findOne({ colid: req.colid, type: /^aws$/i, default: /^yes$/i }).lean();
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) throw error("Default AWS configuration is incomplete");
  const filename = require("node:path").basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
  const key = `${req.colid}/crm2/${randomBytes(16).toString("hex")}-${filename}`;
  await new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region }).putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
  res.json({ success: true, title: filename, url: `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}` });
}));
router.get("/counsellors", wrap(async (req, res) => {
  const query = { colid: req.colid, role: { $not: /^Student$/i } };
  if (text(req.query.search)) query.$or = ["name", "email"].map(field => ({ [field]: regex(req.query.search) }));
  res.json({ success: true, data: await User.find(query).select("name email designation department").sort({ name: 1 }).limit(30).lean() });
}));
router.get("/field-options", wrap(async (req, res) => {
  const field = text(req.query.field);
  if (field === "password" || !fields.some(item => item.field === field && item.type === "String")) throw error("Invalid dropdown field");
  const Model = User.schema.path(field) ? User : Lead;
  const values = await Model.aggregate([
    { $match: { colid: req.colid, [field]: { $type: "string", $ne: "", $regex: regex(req.query.search || "") } } },
    { $group: { _id: `$${field}` } }, { $sort: { _id: 1 } }, { $limit: 30 }
  ]);
  res.json({ success: true, data: values.map(row => row._id) });
}));

async function saveMaster(kind, body, colid) {
  const Model = masterModel(kind);
  if (!text(body.name)) throw error("Name is required");
  const existing = body.id ? await Model.findOne({ _id: body.id, colid }).lean() : null;
  if (body.id && !existing) throw error("Record not found", 404);
  const payload = { colid, name: text(body.name), namekey: text(body.name).toLowerCase(), description: text(body.description), status: body.status || "Active", order: Number(body.order || 0), createdby: text(body.user) };
  if (kind === "agent") {
    payload.email = emailKey(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw error("Enter a valid agent email");
    for (const field of ["phone", "pan", "gst", "address", "state", "country"]) payload[field] = text(body[field]);
  }
  const data = body.id ? await Model.findOneAndUpdate({ _id: body.id, colid }, payload, { new: true, runValidators: true }) : await Model.create(payload);
  if (!data) throw error("Record not found", 404);
  if (kind === "agent" && existing) await Lead.updateMany({ colid, agentemail: existing.email }, { $set: { agentname: payload.name, agentemail: payload.email } });
  if (existing && existing.name !== payload.name) {
    if (kind === "document") await Lead.updateMany({ colid, "documents.documentname": existing.name }, { $set: { "documents.$[doc].documentname": payload.name } }, { arrayFilters: [{ "doc.documentname": existing.name }] });
    else if (kind === "interactionmode") await Lead.updateMany({ colid, "interactions.mode": existing.name }, { $set: { "interactions.$[entry].mode": payload.name } }, { arrayFilters: [{ "entry.mode": existing.name }] });
    else { const field = masterLeadFields[kind] || kind; await Lead.updateMany({ colid, [field]: existing.name }, { $set: { [field]: payload.name } }); }
  }
  return data;
}
router.get("/masters/:kind", wrap(async (req, res) => {
  const Model = masterModel(req.params.kind), query = { colid: req.colid };
  if (text(req.query.search)) query.$or = (req.params.kind === "agent" ? ["name", "email", "phone", "pan", "gst", "state", "country"] : ["name", "description"]).map(field => ({ [field]: regex(req.query.search) }));
  if (req.query.status) query.status = req.query.status;
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100), skip = Math.max(Number(req.query.skip) || 0, 0);
  const [data, total] = await Promise.all([Model.find(query).sort({ order: 1, name: 1 }).skip(skip).limit(limit).lean(), Model.countDocuments(query)]);
  res.json({ success: true, data, total });
}));
router.post("/masters/:kind/save", wrap(async (req, res) => res.json({ success: true, data: await saveMaster(req.params.kind, req.body, req.colid) })));
router.post("/masters/:kind/delete", wrap(async (req, res) => {
  const Model = masterModel(req.params.kind);
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const rows = await Model.find({ colid: req.colid, _id: { $in: ids } }).lean();
  if (await Lead.exists({ colid: req.colid, [masterLeadFields[req.params.kind] || req.params.kind]: { $in: rows.map(row => row.name) } })) throw error("A selected value is used by leads. Set it to Inactive instead of deleting it.");
  const result = await Model.deleteMany({ colid: req.colid, _id: { $in: ids } });
  res.json({ success: true, deleted: result.deletedCount });
}));

const writable = new Set([...fields.map(item => item.field), ...Object.keys(masters).filter(kind => !["document", "interactionmode"].includes(kind)).map(kind => masterLeadFields[kind] || kind), "education", "documents", "counsellorname", "counselloremail"]);
async function saveLead(body, colid) {
  const existing = body.id ? await Lead.findOne({ _id: body.id, colid }).select("-interactions").lean() : null;
  if (body.id && !existing) throw error("Lead not found", 404);
  const input = { ...existing, ...body };
  if (!text(input.name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(input.email)) || !/^[+\d\s().-]+$/.test(text(input.phone)) || phoneKey(input.phone).length < 7 || phoneKey(input.phone).length > 15) throw error("Enter a name, valid email and phone number (7–15 digits)");
  const emailkey = emailKey(input.email), phonekey = phoneKey(input.phone);
  const duplicate = await Lead.exists({ colid, ...(body.id ? { _id: { $ne: body.id } } : {}), $or: [{ emailkey }, { phonekey }] });
  if (duplicate) throw error("Duplicate found: email or phone already exists. Cannot proceed.", 409);
  const payload = { colid, emailkey, phonekey, updatedby: text(body.user), crm2profileversion: 2 };
  for (const field of writable) {
    if (managed.has(field) || body[field] === undefined) continue;
    const value = body[field];
    if (field === "password") {
      if (text(value)) { const salt = randomBytes(16).toString("hex"); payload.password = `scrypt:${salt}:${(await deriveKey(String(value), salt, 64)).toString("hex")}`; }
    }
    else if (field === "customFields" && typeof value === "string") {
      try { payload[field] = value.trim() ? JSON.parse(value) : {}; } catch { throw error("Custom fields must contain valid JSON"); }
      if (!payload[field] || typeof payload[field] !== "object" || Array.isArray(payload[field])) throw error("Custom fields must be a JSON object");
    }
    else if (value === "" && fields.find(item => item.field === field)?.options?.length) payload[field] = null;
    else if (fields.find(item => item.field === field)?.type === "Date" && value === "") payload[field] = null;
    else if (fields.find(item => item.field === field)?.type === "Number" && value === "") payload[field] = null;
    else payload[field] = typeof value === "string" ? value.trim() : value;
  }
  payload.name = text(input.name); payload.email = emailkey; payload.phone = text(input.phone);
  if (payload.education !== undefined) {
    if (typeof payload.education === "string") { try { payload.education = JSON.parse(payload.education); } catch { throw error("Education must be a JSON array"); } }
    if (!Array.isArray(payload.education) || payload.education.length > 50) throw error("Enter up to 50 education records");
    payload.education = payload.education.map(record => {
      if (!text(record?.level) || !Array.isArray(record.subjects) || record.subjects.length > 200) throw error("Each education record needs a level and up to 200 subjects");
      const marks = record.marks === "" || record.marks == null ? null : Number(record.marks);
      if (marks !== null && (!Number.isFinite(marks) || marks < 0)) throw error("Enter valid non-negative education marks");
      return { level: text(record.level), institution: text(record.institution), board: text(record.board), passingyear: text(record.passingyear), marks, grade: text(record.grade), subjects: record.subjects.map(row => {
        const obtained = row.obtained === "" || row.obtained == null ? null : Number(row.obtained);
        const total = row.total === "" || row.total == null ? null : Number(row.total);
        if (!text(row.subject) || [obtained, total].some(value => value !== null && (!Number.isFinite(value) || value < 0)) || (obtained !== null && total !== null && obtained > total)) throw error("Enter valid subject marks: obtained cannot exceed total");
        return { subject: text(row.subject), obtained, total, grade: text(row.grade) };
      }) };
    });
  }
  if (payload.photo && !/^https?:\/\//i.test(text(payload.photo))) throw error("Photo link must be an http or https URL");
  if (existing?.category && (existing.crm2profileversion !== 2 || !demographicCategories.includes(existing.category))) {
    if (!payload.crmcategory && !existing.crmcategory) payload.crmcategory = existing.category;
    if (body.category === undefined || (body.category === existing.category && (!body.crmcategory || !demographicCategories.includes(body.category)))) payload.category = null;
  }
  for (const kind of Object.keys(masters)) {
    if (["document", "interactionmode", "admissionoffice", "agent"].includes(kind)) continue;
    const field = masterLeadFields[kind] || kind;
    if (payload[field] && !await masterModels[kind].exists({ colid, name: payload[field] })) throw error(`Select ${masters[kind]} from its CRM 2 master`);
  }
  if (body.agentemail !== undefined) {
    const email = emailKey(body.agentemail);
    const agent = email ? await masterModels.agent.findOne({ colid, email }).lean() : null;
    if (email && !agent) throw error("Select an agent from this institution's Agent master");
    payload.agentname = agent?.name || ""; payload.agentemail = agent?.email || "";
  } else delete payload.agentname;
  if (body.admissionofficeid !== undefined || body.admissionoffice !== undefined) {
    const id = text(body.admissionofficeid), name = text(body.admissionoffice);
    const office = id || name ? await masterModels.admissionoffice.findOne({ colid, ...(id ? { _id: id } : { name }) }).lean() : null;
    if ((id || name) && !office) throw error("Select an admission office from this institution");
    payload.admissionofficeid = office ? String(office._id) : ""; payload.admissionoffice = office?.name || "";
  }
  if (body.campuscounseloremail !== undefined) {
    const email = emailKey(body.campuscounseloremail);
    const counsellor = email ? await User.findOne({ colid, email: exactEmail(email), role: { $not: /^Student$/i } }).select("name email").lean() : null;
    if (email && !counsellor) throw error("Select a valid campus counsellor from this institution");
    payload.campuscounsellor = counsellor?.name || ""; payload.campuscounseloremail = counsellor?.email || "";
  } else delete payload.campuscounsellor;
  if (payload.documents !== undefined) {
    if (typeof payload.documents === "string") { try { payload.documents = JSON.parse(payload.documents || "[]"); } catch { throw error("Documents must be a JSON array"); } }
    if (!Array.isArray(payload.documents)) throw error("Documents must be an array");
    for (const document of payload.documents) {
      if (!/^https?:\/\//i.test(text(document.url)) || !await masterModels.document.exists({ colid, name: document.documentname })) throw error("Each document needs a valid link and a selection from Document master");
    }
  }
  if (body.counselloremail !== undefined) {
    const email = emailKey(body.counselloremail);
    const counsellor = email ? await User.findOne({ colid, email: exactEmail(email), role: { $not: /^Student$/i } }).select("name email").lean() : null;
    if (email && !counsellor) throw error("Select a valid counsellor from this institution");
    payload.counsellorname = counsellor?.name || ""; payload.counselloremail = counsellor?.email || "";
  } else delete payload.counsellorname;
  if (!existing) { payload.createdby = text(body.user); payload.user = text(body.user); payload.addedby = text(body.user); }
  return existing ? Lead.findOneAndUpdate({ _id: body.id, colid }, payload, { new: true, runValidators: true }) : Lead.create(payload);
}
router.post("/leads/save", wrap(async (req, res) => {
  const saved = await saveLead(req.body, req.colid);
  res.json({ success: true, data: publicLead(saved) });
}));
router.get("/leads", wrap(async (req, res) => {
  const query = { colid: req.colid };
  if (text(req.query.search)) query.$or = ["name", "email", "phone"].map(field => ({ [field]: regex(req.query.search) }));
  let filters = [];
  try { filters = JSON.parse(req.query.filters || "[]"); } catch { throw error("Invalid filters"); }
  for (const filter of Array.isArray(filters) ? filters : []) {
    if (!writable.has(filter.field) || filter.field === "password" || !text(filter.value)) continue;
    const type = Lead.schema.path(filter.field)?.instance;
    query[filter.field] = type === "Number" ? Number(filter.value) : type === "Date" ? new Date(filter.value) : regex(filter.value);
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100), skip = Math.max(Number(req.query.skip) || 0, 0);
  const [data, total] = await Promise.all([Lead.find(query).select("-interactions").sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Lead.countDocuments(query)]);
  res.json({ success: true, data: data.map(publicLead), total });
}));
router.post("/leads/delete", wrap(async (req, res) => {
  const result = await Lead.deleteMany({ colid: req.colid, _id: { $in: Array.isArray(req.body.ids) ? req.body.ids : [] } });
  res.json({ success: true, deleted: result.deletedCount });
}));
router.post("/leads/bulk-update", wrap(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(text))] : [];
  const field = text(req.body.field), value = text(req.body.value);
  if (!ids.length || ids.length > 1000) throw error("Select between 1 and 1000 leads");
  const changes = { updatedby: text(req.body.user) };
  if (["pipeline", "type", "source"].includes(field)) {
    if (!value || !await masterModels[field].exists({ colid: req.colid, name: value })) throw error(`Select ${masters[field]} from its master`);
    changes[field] = value;
  } else if (field === "counselloremail") {
    const person = await User.findOne({ colid: req.colid, email: exactEmail(value), role: { $not: /^Student$/i } }).select("name email").lean();
    if (!person) throw error("Select a counsellor from this institution");
    changes.counsellorname = person.name; changes.counselloremail = person.email;
  } else if (field === "active" && ["Yes", "No"].includes(value)) changes.active = value;
  else if (field === "admissionstatus" && ["Admitted", "Not admitted"].includes(value)) changes.admissionstatus = value;
  else throw error("Invalid bulk update field or value");
  const result = await Lead.updateMany({ colid: req.colid, _id: { $in: ids } }, { $set: changes }, { runValidators: true });
  res.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
}));

router.get("/lead-options", wrap(async (req, res) => {
  const query = { colid: req.colid };
  if (text(req.query.search)) query.$or = ["name", "email", "phone"].map(field => ({ [field]: regex(req.query.search) }));
  res.json({ success: true, data: await Lead.find(query).select("name email phone pipeline followupdate").sort({ name: 1 }).limit(30).lean() });
}));
const validId = value => /^[a-f\d]{24}$/i.test(text(value));
router.get("/interactions", wrap(async (req, res) => {
  if (!validId(req.query.leadid)) throw error("Select a lead");
  const skip = Math.max(Number(req.query.skip) || 0, 0), limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const result = await Lead.aggregate([
    { $match: { colid: req.colid, _id: new mongoose.Types.ObjectId(req.query.leadid) } },
    { $project: { name: 1, email: 1, total: { $size: { $ifNull: ["$interactions", []] } }, data: { $slice: [{ $reverseArray: { $ifNull: ["$interactions", []] } }, skip, limit] } } }
  ]);
  if (!result[0]) throw error("Lead not found", 404);
  res.json({ success: true, data: result[0].data, total: result[0].total });
}));
async function saveInteraction(body, colid) {
  if (!validId(body.leadid) || (body.id && !validId(body.id))) throw error("Select a valid lead and interaction");
  if (!text(body.details)) throw error("Interaction details are required");
  if (!text(body.mode) || !await masterModels.interactionmode.exists({ colid, name: text(body.mode) })) throw error("Select a mode from Interaction master");
  if (!text(body.pipeline) || !await masterModels.pipeline.exists({ colid, name: text(body.pipeline) })) throw error("Select a pipeline stage");
  const nextfollowupdate = body.nextfollowupdate ? new Date(body.nextfollowupdate) : null;
  const interactiondate = body.interactiondate ? new Date(body.interactiondate) : new Date();
  if ((nextfollowupdate && Number.isNaN(nextfollowupdate.getTime())) || Number.isNaN(interactiondate.getTime())) throw error("Enter valid interaction and follow-up dates");
  const values = { details: text(body.details), mode: text(body.mode), pipeline: text(body.pipeline), nextfollowupdate, interactiondate, updatedby: text(body.user), updatedAt: new Date() };
  const update = { $set: { pipeline: values.pipeline, followupdate: nextfollowupdate, updatedby: text(body.user) } };
  if (body.id) for (const [field, value] of Object.entries(values)) update.$set[`interactions.$.${field}`] = value;
  else update.$push = { interactions: { ...values, _id: new mongoose.Types.ObjectId(), createdby: text(body.user), createdAt: new Date() } };
  const lead = await Lead.findOneAndUpdate({ _id: body.leadid, colid, ...(body.id ? { "interactions._id": body.id } : {}) }, update, { new: true, runValidators: true, projection: { name: 1, email: 1, pipeline: 1, followupdate: 1 } });
  if (!lead) throw error("Lead or interaction not found", 404);
  return lead;
}
router.post("/interactions/save", wrap(async (req, res) => res.json({ success: true, data: await saveInteraction(req.body, req.colid) })));
router.post("/interactions/delete", wrap(async (req, res) => {
  if (!validId(req.body.leadid)) throw error("Select a lead");
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (!ids.length || !ids.every(validId)) throw error("Select valid interactions");
  const result = await Lead.updateOne({ _id: req.body.leadid, colid: req.colid }, { $pull: { interactions: { _id: { $in: ids } } } });
  res.json({ success: true, modified: result.modifiedCount });
}));
router.post("/interactions/bulk", wrap(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length || rows.length > 1000) throw error("Upload between 1 and 1000 interactions");
  let saved = 0; const errors = [];
  for (const [index, row] of rows.entries()) {
    try { await saveInteraction({ ...row, id: undefined, leadid: req.body.leadid, user: req.body.user }, req.colid); saved++; }
    catch (err) { errors.push({ row: index + 2, message: err.message }); }
  }
  res.json({ success: true, saved, errors });
}));
router.post("/bulk/:entity", wrap(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length || rows.length > 1000) throw error("Upload between 1 and 1000 rows per file");
  if (req.params.entity !== "leads") masterModel(req.params.entity);
  let saved = 0; const errors = [];
  for (const [index, row] of rows.entries()) {
    try {
      const input = { ...row, user: req.body.user }; delete input.id; delete input._id;
      if (req.params.entity === "leads") await saveLead(input, req.colid);
      else await saveMaster(req.params.entity, input, req.colid);
      saved++;
    } catch (err) { errors.push({ row: index + 2, message: err.code === 11000 ? "Duplicate email, phone or name" : err.message }); }
  }
  res.json({ success: true, saved, errors });
}));
module.exports = router;
