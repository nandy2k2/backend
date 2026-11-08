const router = require('express').Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../Models/user');
const Menu = require('../Models/menuaccessds');
const { Lead } = require('../Models/crm2ds');
const { comparisonFields, safeFields, validId, maxLeads, filterQuery, mergeChanges, versionOf } = require('../utils/crm2MergeLead');
const escape = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = value => new RegExp(`^${escape(value)}$`, 'i');
const projection = comparisonFields.map(field => field.field).join(' ');
const wrap = fn => async (req, res) => {
  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    let identity;
    try { identity = jwt.verify(token, process.env.JWT_SECRET); } catch { return res.status(401).json({ message: 'Sign in to continue' }); }
    const colid = Number(identity.colid), email = String(identity.user || '').trim().toLowerCase();
    if (!Number.isFinite(colid) || colid <= 0 || !email) return res.status(401).json({ message: 'Sign in to continue' });
    const user = await User.findOne({ colid, email: exact(email) }).select('role').lean();
    const role = String(user?.role || '').trim();
    if (!role || /^(student|agent|publisher|telecaller)$/i.test(role) || !/^(all|crmadmin)$/i.test(role) && !await Menu.exists({ colid, role: user.role, path: '/crm2-merge-lead-wizard', access: 'Allow' })) return res.status(403).json({ message: 'Merge wizard access is not available for this role' });
    const scope = { colid, ...(/^counsel+or$/i.test(role) ? { counselloremail: exact(email) } : {}) };
    await fn(req, res, scope, email);
  } catch (err) { res.status(400).json({ message: /replica set|Transaction numbers/i.test(err.message) ? 'The database does not support atomic merges. No changes were saved.' : err.message }); }
};
router.get('/fields', wrap(async (req, res) => res.json({ data: comparisonFields, maxLeads })));
router.get('/filter-options', wrap(async (req, res, scope) => {
  const field = safeFields.get(req.query.field);
  if (field?.type !== 'String') throw Error('Invalid filter field');
  const search = new RegExp(escape(String(req.query.search || '').slice(0, 200)), 'i');
  const values = await Lead.aggregate([{ $match: { $and: [scope, { [field.field]: { $type: 'string', $ne: '', $regex: search } }] } }, { $group: { _id: `$${field.field}` } }, { $sort: { _id: 1 } }, { $limit: 100 }]);
  res.json({ data: values.map(row => ({ name: row._id })) });
}));
router.get('/leads', wrap(async (req, res, scope) => {
  const query = filterQuery(scope, req.query), limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25)), skip = Math.max(0, Number(req.query.skip) || 0);
  const exclude = String(req.query.exclude || '').split(',').filter(Boolean);
  if (exclude.length > maxLeads || !exclude.every(validId)) throw Error('Invalid lead selection');
  if (exclude.length) query._id = { $nin: exclude };
  const [data, total] = await Promise.all([Lead.find(query).select('name email phone active academicyear pipeline leadgroup dateadded').sort({ dateadded: -1, _id: -1 }).skip(skip).limit(limit).lean(), Lead.countDocuments(query)]);
  res.json({ data, total });
}));
router.get('/lead/:id', wrap(async (req, res, scope) => {
  if (!validId(req.params.id)) throw Error('Select a lead');
  const lead = await Lead.findOne({ ...scope, _id: req.params.id }).select(projection).lean();
  if (!lead) throw Error('Lead not found or not accessible');
  res.json({ data: lead, version: versionOf(lead) });
}));
router.post('/merge', wrap(async (req, res, scope, actor) => {
  const { ids, primaryId, choices, versions } = req.body;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > maxLeads || new Set(ids).size !== ids.length || !ids.every(validId) || !ids.includes(primaryId)) throw Error(`Select 2 to ${maxLeads} different leads and one primary lead`);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const rows = await Lead.find({ ...scope, _id: { $in: ids } }).select(projection).session(session).lean();
      if (rows.length !== ids.length) throw Error('Some selected leads are no longer available');
      const changes = mergeChanges(rows, primaryId, choices, versions);
      changes.$set.updatedby = actor;
      const primary = await Lead.updateOne({ ...scope, _id: primaryId }, changes, { session, runValidators: true });
      const others = await Lead.updateMany({ ...scope, _id: { $in: ids.filter(id => id !== primaryId) } }, { $set: { active: 'No', updatedby: actor } }, { session, runValidators: true });
      if (primary.matchedCount !== 1 || others.matchedCount !== ids.length - 1) throw Error('Lead selection changed. Refresh and try again.');
    });
  } finally { await session.endSession(); }
  res.json({ primaryId, deactivated: ids.length - 1, message: `Primary lead saved; ${ids.length - 1} other lead(s) marked inactive.` });
}));
module.exports = router;
