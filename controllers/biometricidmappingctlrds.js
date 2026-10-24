const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../Models/user');
const fields = ['role', 'institution', 'department', 'designation', 'academicyear', 'regulation', 'program', 'programcode', 'semester', 'section', 'name', 'email', 'regno', 'biometricid'];
const text = value => String(value ?? '').trim();
const wrap = handler => async (req, res) => {
  try {
    const colid = Number(req.query.colid || req.body?.colid);
    if (!(colid > 0) || !Number.isFinite(colid)) return res.status(400).json({ message: 'Institution is required' });
    await handler(req, res, colid);
  } catch (error) { res.status(500).json({ message: error.message }); }
};
router.get('/options', wrap(async (req, res, colid) => {
  if (req.query.field) {
    const field = text(req.query.field);
    if (!fields.includes(field)) return res.status(400).json({ message: 'Invalid filter field' });
    const search = text(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows = await User.aggregate([{ $match: { colid, [field]: { $type: 'string', $ne: '', $regex: new RegExp(search, 'i') } } }, { $group: { _id: `$${field}` } }, { $sort: { _id: 1 } }, { $limit: 100 }]);
    return res.json({ data: rows.map(row => row._id) });
  }
  const programs = await User.aggregate([{ $match: { colid } }, { $group: { _id: { program: '$program', programcode: '$programcode' } } }]);
  res.json({ fields, options: {}, programs: programs.map(row => row._id) });
}));
router.post('/users', wrap(async (req, res, colid) => {
  const clauses = [];
  for (const filter of Array.isArray(req.body.filters) ? req.body.filters : []) {
    if (!fields.includes(filter.field)) continue;
    const values = (Array.isArray(filter.value) ? filter.value : [filter.value]).map(text).filter(Boolean);
    if (values.length) clauses.push({ [filter.field]: { $in: values } });
  }
  if (!clauses.length) return res.status(400).json({ message: 'Apply at least one user filter before loading' });
  const query = { colid, $and: clauses };
  const data = await User.find(query).select('name email biometricid role regno institution department designation academicyear regulation program programcode semester section').sort({ name: 1, email: 1 }).limit(5000).lean();
  res.json({ data, total: await User.countDocuments(query), limit: 5000 });
}));
router.post('/save', wrap(async (req, res, colid) => {
  const rows = req.body.rows;
  if (req.body.field !== 'biometricid' || !Array.isArray(rows) || !rows.length || rows.length > 5000) return res.status(400).json({ message: 'Submit between 1 and 5000 biometric ID changes' });
  if (rows.some(row => !mongoose.Types.ObjectId.isValid(row.id) || typeof row.value !== 'string' || row.value.length > 200)) return res.status(400).json({ message: 'Invalid user ID or biometric ID (maximum 200 characters)' });
  const results = [];
  for (const row of rows) {
    const query = { colid, _id: row.id }, value = text(row.value);
    const user = await User.findOne(query).select('biometricid').lean();
    if (!user) { results.push({ id: row.id, status: 'error', message: 'User not found in this institution' }); continue; }
    if (text(user.biometricid) !== text(row.oldvalue)) { results.push({ id: row.id, status: 'error', message: 'Biometric ID changed since loading. Reload before editing.' }); continue; }
    if (text(user.biometricid) === value) { results.push({ id: row.id, status: 'unchanged', value }); continue; }
    const previous = user.biometricid;
    const condition = previous == null || previous === '' ? { $or: [{ biometricid: { $exists: false } }, { biometricid: null }, { biometricid: '' }] } : { biometricid: previous };
    const saved = await User.updateOne({ ...query, ...condition }, { $set: { biometricid: value } }, { runValidators: true });
    const matched = saved.matchedCount ?? saved.n ?? 0;
    results.push({ id: row.id, status: matched ? 'saved' : 'error', value, message: matched ? 'Updated' : 'User changed while saving. Reload.' });
  }
  res.json({ results, saved: results.filter(row => row.status === 'saved').length });
}));
module.exports = router;
