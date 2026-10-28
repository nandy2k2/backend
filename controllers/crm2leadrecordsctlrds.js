const router = require('express').Router();
const mongoose = require('mongoose');
const { Task, Note } = require('../Models/crm2leadrecordsds');
const { Lead } = require('../Models/crm2ds');
const User = require('../Models/user');
const text = value => String(value ?? '').trim();
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const regex = value => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const model = kind => { if (!['tasks','notes'].includes(kind)) throw new Error('Invalid lead record type'); return kind === 'tasks' ? Task : Note; };
const wrap = fn => async (req, res) => {
  try {
    const input = require('../utils/crm2DashboardScope').dashboardIdentity({ ...req.query, ...req.body }, req);
    req.colid = Number(input.dashboardyear ? input.colid : req.user?.colid || input.colid); req.actor = text(input.dashboardyear ? input.user : req.user?.email || input.user).toLowerCase();
    if (!Number.isFinite(req.colid) || req.colid <= 0 || !req.actor) throw new Error('User session is required');
    req.owner = {};
    if (input.dashboardyear && !input.leadmode) input.leadmode = 'my';
    req.dashboardyear = input.dashboardyear;
    if (input.leadmode) {
      if (!['my','agent'].includes(input.leadmode) || !await User.exists({ colid: req.colid, email: exact(req.actor), role: { $not: /^Student$/i } })) throw new Error('Invalid user workspace');
      req.owner[input.leadmode === 'my' ? 'counselloremail' : 'agentemail'] = exact(req.actor);
    }
    await fn(req, res);
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
async function selectedLead(req, id) {
  if (!mongoose.isValidObjectId(id)) throw new Error('Select a valid lead');
  const lead = await Lead.findOne({ _id: id, colid: req.colid, ...req.owner, ...require('../utils/crm2DashboardScope').yearScope(req.dashboardyear) }).select('name email phone academicyear').lean();
  if (!lead) throw new Error('Lead not found or not assigned to you');
  return lead;
}
async function scopedQuery(req) {
  const query = { colid: req.colid };
  if (req.dashboardyear) query.$and = [{ $or: [{ academicyear: req.dashboardyear }, { academicyear: { $in: [null, ''] } }] }];
  if (req.query.leadid) { const lead = await selectedLead(req, req.query.leadid); query.leadid = lead._id; }
  else if (Object.keys(req.owner).length) query.leadid = { $in: await Lead.distinct('_id', { colid: req.colid, ...req.owner, ...require('../utils/crm2DashboardScope').yearScope(req.dashboardyear) }) };
  return query;
}
async function save(req, body) {
  const Model = model(req.params.kind);
  let existing;
  if (body.id) {
    if (!mongoose.isValidObjectId(body.id)) throw new Error('Invalid record');
    existing = await Model.findOne({ _id: body.id, colid: req.colid }).lean();
    if (!existing) throw new Error('Record not found');
  }
  if (existing && body.leadid && String(existing.leadid) !== String(body.leadid)) throw new Error('A record cannot be moved to another lead');
  const lead = await selectedLead(req, existing?.leadid || body.leadid);
  const data = { colid: req.colid, leadid: lead._id, lead: lead.name, leademail: lead.email || '', leadphone: lead.phone || '', updatedby: req.actor };
  data.academicyear = req.dashboardyear || existing?.academicyear || lead.academicyear;
  if (req.params.kind === 'tasks') {
    data.task = text(body.task); data.duedate = body.duedate ? new Date(body.duedate) : null; data.status = body.status || 'Open';
    if (!data.task || !data.duedate || Number.isNaN(data.duedate.getTime()) || !['Open','Pending','Closed'].includes(data.status)) throw new Error('Enter task, valid due date and status');
  } else { data.note = text(body.note); if (!data.note) throw new Error('Enter a lead note'); }
  return existing ? Model.findOneAndUpdate({ _id: existing._id, colid: req.colid, leadid: lead._id }, { $set: data }, { new: true, runValidators: true }) : Model.create({ ...data, createdby: req.actor });
}
router.get('/:kind', wrap(async (req, res) => {
  const Model = model(req.params.kind), query = await scopedQuery(req);
  if (req.query.status && req.params.kind === 'tasks') {
    if (!['Open','Pending','Closed','Unclosed'].includes(req.query.status)) throw new Error('Invalid task status');
    query.status = req.query.status === 'Unclosed' ? { $in: ['Open','Pending'] } : req.query.status;
  }
  if (text(req.query.search)) query.$or = ['lead','leademail','leadphone', req.params.kind === 'tasks' ? 'task' : 'note'].map(field => ({ [field]: regex(req.query.search) }));
  res.json({ success: true, data: await Model.find(query).sort(req.params.kind === 'tasks' ? { duedate: 1, createdAt: -1 } : { createdAt: -1 }).limit(5000).lean() });
}));
router.post('/:kind/save', wrap(async (req, res) => res.json({ success: true, data: await save(req, req.body) })));
router.post('/:kind/delete', wrap(async (req, res) => {
  const Model = model(req.params.kind), ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !mongoose.isValidObjectId(id))) throw new Error('Select 1 to 500 records');
  const query = await scopedQuery({ ...req, query: { leadid: req.body.leadid } });
  query._id = { $in: ids };
  res.json({ success: true, deleted: (await Model.deleteMany(query)).deletedCount });
}));
router.post('/:kind/bulk', wrap(async (req, res) => {
  if (!Array.isArray(req.body.rows) || !req.body.rows.length || req.body.rows.length > 500) throw new Error('Upload 1 to 500 rows');
  let saved = 0; const errors = [];
  for (const [i, row] of req.body.rows.entries()) {
    try { await save(req, { ...row, id: undefined, leadid: req.body.leadid || row.leadid }); saved++; }
    catch (error) { errors.push({ row: i + 2, message: error.message }); }
  }
  res.json({ success: true, saved, errors });
}));
module.exports = { router };
