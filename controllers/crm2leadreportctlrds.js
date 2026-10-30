const router = require('express').Router();
const { Lead, masterModels, masterLeadFields } = require('../Models/crm2ds');
const Program = require('../Models/mprograms');
const User = require('../Models/user');
const Institution = require('../Models/insdetails');
const { Address } = require('../Models/crm2configurationds');
const { fields, fieldByName, pathOf, queryFor, projection, escape, parse } = require('../utils/crm2LeadReport');
const text = value => String(value ?? '').trim();
const wrap = callback => async (req, res) => {
  try {
    req.colid = Number(req.user?.colid || req.query.colid);
    if (!Number.isFinite(req.colid) || req.colid <= 0) throw new Error('Institution ID is required');
    res.set('Cache-Control', 'no-store'); await callback(req, res);
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
const grouped = field => [{ $group: { _id: { $cond: [{ $in: [`$${field}`, ['', null]] }, 'Not specified', { $ifNull: [`$${field}`, 'Not specified'] }] }, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }];
router.get('/lead-report-options', wrap(async (req, res) => {
  if (!req.query.field) return res.json({ success: true, fields });
  const definition = fieldByName.get(req.query.field);
  if (!definition) throw new Error('Invalid dropdown field');
  if (definition.options?.length) return res.json({ data: definition.options });
  if (definition.type === 'Boolean') return res.json({ data: ['Yes','No'] });
  if (definition.type !== 'String') return res.json({ data: [] });
  const field = definition.field, regex = new RegExp(escape(req.query.search || ''), 'i');
  const kind = Object.keys(masterModels).find(kind => (masterLeadFields[kind] || kind) === field);
  let model = Lead, path = pathOf(field), query = { colid: req.colid };
  if (kind) { model = masterModels[kind]; path = 'name'; }
  else if (['country','state','city'].includes(field)) model = Address;
  else if (/^(counsellor|telecaller|campuscounselor|campuscounsellor)(name|email)$/.test(field)) { model = User; path = /email$/.test(field) ? 'email' : 'name'; query.role = { $not: /^Student$/i }; }
  else if (['academicyear','program','programcode','programsinterested.program','programsinterested.programcode','programsinterested.academicyear'].includes(field)) { model = Program; path = /academicyear$/.test(field) ? 'year' : /programcode$/.test(field) ? 'programcode' : 'program'; }
  const values = await model.distinct(path, { ...query, [path]: { $regex: regex } });
  res.json({ success: true, data: values.filter(value => typeof value === 'string' && value && regex.test(value)).sort((a,b) => a.localeCompare(b, undefined, { numeric: true })).slice(0, 150) });
}));
router.get('/lead-report-programs', wrap(async (req, res) => {
  const search = text(req.query.search);
  const query = { colid: req.colid, ...(search ? { $or: ['program','programcode'].map(field => ({ [field]: new RegExp(escape(search), 'i') })) } : {}) };
  const rows = await Program.find(query).select('program programcode').sort({ program: 1 }).limit(500).lean();
  res.json({ success: true, data: [...new Map(rows.filter(row => row.programcode).map(row => [row.programcode, { program: row.program, programcode: row.programcode }])).values()] });
}));
router.get('/lead-report', wrap(async (req, res) => {
  const query = queryFor(req.colid, req.query), exporting = req.query.export === 'true';
  const skip = exporting ? 0 : Math.max(0, Number(req.query.skip) || 0), limit = exporting ? 10001 : Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const summaryFields = ['pipeline','source','crmcategory','category','case','type','admitted','active','counsellorname'];
  const codes = parse(req.query.programcodes);
  const programs = [ { $unwind: '$programsinterested' }, { $match: { 'programsinterested.programcode': { $type: 'string', $ne: '' } } }, ...(codes.length ? [{ $match: { 'programsinterested.programcode': { $in: codes } } }] : []), { $group: { _id: { lead: '$_id', code: '$programsinterested.programcode' }, program: { $first: '$programsinterested.program' } } }, { $group: { _id: '$_id.code', program: { $first: '$program' }, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } } ];
  const [result = {}] = await Lead.aggregate([{ $match: query }, { $facet: {
    total: [{ $count: 'count' }], data: [{ $sort: { dateadded: -1, _id: -1 } }, { $skip: skip }, { $limit: limit }, { $project: projection }],
    ...Object.fromEntries(summaryFields.map(field => [field, grouped(field)])), programs
  } }]);
  if (exporting && result.data?.length > 10000) throw new Error('More than 10,000 leads match. Add filters before exporting or printing.');
  const summary = Object.fromEntries(summaryFields.map(field => [field, (result[field] || []).map(row => ({ name: String(row._id || 'Not specified'), count: row.count }))]));
  summary.programs = (result.programs || []).map(row => ({ name: `${row.program || ''} (${row._id})`, count: row.count }));
  const institution = await Institution.findOne({ colid: req.colid }).sort({ _id: -1 }).lean();
  res.json({ success: true, data: result.data || [], total: result.total?.[0]?.count || 0, summary, fields, institution });
}));
module.exports = router;
