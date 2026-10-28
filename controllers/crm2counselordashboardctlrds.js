const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { createHash } = require('node:crypto');
const Logins = require('../Models/crm2staffloginds');
const User = require('../Models/user');
const { Lead, masterModels } = require('../Models/crm2ds');
const { Task, Note } = require('../Models/crm2leadrecordsds');
const { applyFilters } = require('../utils/crm2LeadFilters');
const Program = require('../Models/mprograms');
const { yearScope, newAssignedScope, admittedScope } = require('../utils/crm2DashboardScope');
const text = value => String(value || '').trim();
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
async function staffScope(req) {
  const identity = jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET);
  const colid = Number(identity.colid), email = text(identity.user).toLowerCase(), year = text(req.query.academicyear || req.body?.academicyear);
  if (!colid || !email || !year || !await User.exists({ colid, email: exact(email), role: req.telecallerDashboard ? { $in: [/^telecaller$/i, /^All$/i] } : { $nin: [/^Student$/i, /^telecaller$/i] } })) throw new Error('Select an academic year with a valid user session');
  return { colid, email, year, query: applyFilters({ colid, [req.telecallerDashboard ? 'telecalleremail' : 'counselloremail']: exact(email), ...yearScope(year) }, req.method === 'POST' ? req.body : req.query) };
}
const validId = value => /^[a-f\d]{24}$/i.test(String(value || ''));
async function ownLead(req) {
  const context = await staffScope(req);
  if (!validId(req.params.id)) throw new Error('Invalid lead');
  const lead = await Lead.findOne({ ...context.query, _id: req.params.id }).select('-password -emailkey -phonekey -interactions').lean();
  if (!lead) throw new Error('Lead not found or not assigned to you');
  return { ...context, lead };
}
router.get('/leads', wrap(async (req, res) => {
  const context = await staffScope(req), query = context.query;
  if (req.query.view === 'new') {
    const logins = await Logins.find({ colid: context.colid, email: context.email }).sort({ loggedAt: -1, _id: -1 }).limit(2).lean();
    const since = logins[1]?.loggedAt;
    if (since) query.$and = [...(query.$and || []), { $or: [{ telecallerassignedat: { $gt: since } }, { telecallerassignedat: null, createdAt: { $gt: since } }] }];
  }
  if (text(req.query.search)) query.$and = [...(query.$and || []), { $or: ['name','email','phone'].map(field => ({ [field]: new RegExp(text(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })) }];
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25)), skip = Math.max(0, Number(req.query.skip) || 0);
  const [data, total] = await Promise.all([Lead.find(query).select('-password -emailkey -phonekey -interactions').sort({ dateadded: -1, _id: -1 }).skip(skip).limit(limit).lean(), Lead.countDocuments(query)]);
  res.json({ success: true, data, total });
}));
router.get('/pipeline-options', wrap(async (req, res) => {
  const context = await staffScope(req);
  res.json({ success: true, data: await masterModels.pipeline.find({ colid: context.colid, status: 'Active' }).select('name').sort({ name: 1 }).limit(500).lean() });
}));
router.get('/filter-options', wrap(async (req, res) => {
  const context = await staffScope(req), field = text(req.query.field), schema = Lead.schema.path(field);
  if (!schema || schema.instance !== 'String' || /password|token|secret|emailkey|phonekey|^colid$|^_|\./i.test(field)) throw new Error('Invalid filter field');
  const search = new RegExp(text(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const kind = ({ crmcategory: 'category', source: 'source', pipeline: 'pipeline', type: 'type', case: 'case' }[field]);
  const data = kind ? await masterModels[kind].find({ colid: context.colid, name: search, status: 'Active' }).select('name').limit(100).lean() : (await Lead.distinct(field, { ...context.query, [field]: search })).filter(Boolean).slice(0,100).map(name => ({ name }));
  res.json({ success: true, data });
}));
router.post('/lead/:id/pipeline', wrap(async (req, res) => {
  if (!req.telecallerDashboard) throw new Error('Use the lead editor for counselor updates');
  if (Object.keys(req.body).some(key => !['academicyear','pipeline'].includes(key))) throw new Error('Only pipeline changes are allowed');
  const context = await ownLead(req), pipeline = text(req.body.pipeline);
  if (!pipeline || !await masterModels.pipeline.exists({ colid: context.colid, name: pipeline, status: 'Active' })) throw new Error('Select a pipeline stage from its master');
  const data = await Lead.findOneAndUpdate({ colid: context.colid, _id: context.lead._id, telecalleremail: exact(context.email) }, { $set: { pipeline, updatedby: context.email } }, { new: true, runValidators: true }).select('-password -emailkey -phonekey -interactions').lean();
  if (!data) throw new Error('Lead assignment changed; refresh');
  res.json({ success: true, data });
}));
router.get('/lead/:id/notes', wrap(async (req, res) => {
  const context = await ownLead(req);
  res.json({ success: true, data: await Note.find({ colid: context.colid, leadid: context.lead._id }).sort({ createdAt: -1 }).limit(1000).lean() });
}));
router.post('/lead/:id/notes', wrap(async (req, res) => {
  if (!req.telecallerDashboard || Object.keys(req.body).some(key => !['academicyear','note','noteid'].includes(key))) throw new Error('Only lead notes may be changed');
  const context = await ownLead(req), note = text(req.body.note);
  if (!note || note.length > 20000) throw new Error('Enter a note up to 20000 characters');
  const payload = { note, updatedby: context.email };
  let data;
  if (req.body.noteid) {
    if (!validId(req.body.noteid)) throw new Error('Invalid note');
    data = await Note.findOneAndUpdate({ colid: context.colid, leadid: context.lead._id, _id: req.body.noteid }, { $set: payload }, { new: true, runValidators: true });
    if (!data) throw new Error('Note not found');
  } else data = await Note.create({ ...payload, colid: context.colid, leadid: context.lead._id, academicyear: context.year, lead: context.lead.name, leademail: context.lead.email, leadphone: context.lead.phone, createdby: context.email });
  res.json({ success: true, data });
}));
async function taskQuery(context, leadid) {
  const ids = await Lead.distinct('_id', context.query);
  return { colid: context.colid, leadid: { $in: leadid ? ids.filter(id => String(id) === String(leadid)) : ids }, status: { $in: ['Open','Pending'] }, $or: [{ academicyear: context.year }, { academicyear: { $in: [null, ''] } }] };
}
router.get('/admitted', wrap(async (req, res) => {
  const context = await staffScope(req), clauses = [context.query, admittedScope];
  if (text(req.query.search)) clauses.push({ $or: ['name','email','phone'].map(field => ({ [field]: new RegExp(text(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })) });
  const query = { $and: clauses }, limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25)), skip = Math.max(0, Number(req.query.skip) || 0);
  const [data, total] = await Promise.all([Lead.find(query).select('-password -emailkey -phonekey -interactions').sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Lead.countDocuments(query)]);
  res.json({ success: true, data, total });
}));
router.get('/tasks', wrap(async (req, res) => {
  const context = await staffScope(req), query = await taskQuery(context, req.query.leadid);
  res.json({ success: true, data: await Task.find(query).sort({ duedate: 1, _id: 1 }).limit(5000).lean() });
}));
router.post('/tasks/:id/status', wrap(async (req, res) => {
  if (req.telecallerDashboard) throw new Error('Telecallers can only view tasks');
  if (!/^[a-f\d]{24}$/i.test(req.params.id) || !['Open','Pending','Closed'].includes(req.body.status)) throw new Error('Select a task and valid status');
  const context = await staffScope(req), query = await taskQuery(context);
  const data = await Task.findOneAndUpdate({ ...query, _id: req.params.id }, { $set: { status: req.body.status, updatedby: context.email } }, { new: true, runValidators: true });
  if (!data) throw new Error('Pending task not found or not assigned to you');
  res.json({ success: true, data });
}));
router.get('/lead/:id', wrap(async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new Error('Invalid lead');
  const context = await staffScope(req);
  const data = await Lead.findOne({ ...context.query, _id: req.params.id }).select('-password -emailkey -phonekey -interactions').lean();
  if (!data) throw new Error('Lead not found or not assigned to you');
  res.json({ success: true, data });
}));
router.post('/login', wrap(async (req, res) => {
  const token = text(req.body.token), identity = jwt.verify(token, process.env.JWT_SECRET);
  const colid = Number(identity.colid), email = text(identity.user).toLowerCase();
  if (!colid || !email || !await User.exists({ colid, email: exact(email), role: { $not: /^Student$/i } })) throw new Error('Invalid staff login');
  const tokenhash = createHash('sha256').update(token).digest('hex');
  await Logins.updateOne({ tokenhash }, { $setOnInsert: { colid, email, tokenhash, loggedAt: new Date() } }, { upsert: true });
  const staff = await User.findOne({ colid, email: exact(email) }).select('colid email role').lean();
  if (staff) await require('../services/crm2CounselorAccess')(staff);
  res.json({ success: true });
}));
router.get('/', wrap(async (req, res) => {
  const token = text(req.get('authorization')).replace(/^Bearer\s+/i, ''), identity = jwt.verify(token, process.env.JWT_SECRET);
  const colid = Number(identity.colid), email = text(identity.user).toLowerCase(), academicyear = text(req.query.academicyear);
  if (!colid || !email || !await User.exists({ colid, email: exact(email), role: req.telecallerDashboard ? { $in: [/^telecaller$/i, /^All$/i] } : { $nin: [/^Student$/i, /^telecaller$/i] } })) throw new Error('Your user session is unavailable');
  if (!academicyear) return res.json({ success: true, years: (await Program.distinct('year', { colid })).filter(Boolean).sort().reverse() });
  const logins = await Logins.find({ colid, email }).sort({ loggedAt: -1, _id: -1 }).limit(2).lean();
  const since = logins[1]?.loggedAt || null;
  const query = applyFilters({ colid, [req.telecallerDashboard ? 'telecalleremail' : 'counselloremail']: exact(email), ...yearScope(academicyear) }, req.query);
  const fresh = req.telecallerDashboard && since ? { $or: [{ telecallerassignedat: { $gt: since } }, { telecallerassignedat: null, createdAt: { $gt: since } }] } : newAssignedScope(since);
  const [leadids, newleads, admitted] = await Promise.all([
    Lead.distinct('_id', query),
    Lead.countDocuments({ $and: [query, fresh] }),
    Lead.countDocuments({ $and: [query, admittedScope] })
  ]);
  const pending = await Task.countDocuments({ colid, leadid: { $in: leadids }, status: { $in: ['Open','Pending'] }, $or: [{ academicyear }, { academicyear: { $in: [null, ''] } }] });
  res.json({ success: true, data: { academicyear, newleads, pending, admitted, total: leadids.length, since } });
}));
module.exports = { router };
