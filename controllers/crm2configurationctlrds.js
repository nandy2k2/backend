const router = require('express').Router();
const { Address, FormMapping } = require('../Models/crm2configurationds');
const Program = require('../Models/mprograms');
const Form = require('../Models/admissiondynamicform');
const { Lead } = require('../Models/crm2ds');
const { interestedQuery } = require('../utils/crm2InterestedQuery');
const mongoose = require('mongoose');
const text = value => String(value ?? '').trim();
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const contains = value => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const model = kind => { if (!['address', 'form-mapping'].includes(kind)) throw new Error('Invalid configuration'); return kind === 'address' ? Address : FormMapping; };
const wrap = fn => async (req, res) => {
  try {
    const colid = Number(req.query.colid || req.body?.colid);
    if (!Number.isFinite(colid) || colid <= 0) throw new Error('Institution is required');
    await fn(req, res, colid);
  } catch (error) { res.status(400).json({ success: false, message: error.code === 11000 ? 'This configuration already exists' : error.message }); }
};
async function payload(kind, body, colid, user) {
  if (kind === 'address') {
    const values = Object.fromEntries(['country','state','city'].map(field => [field, text(body[field])]));
    if (Object.values(values).some(value => !value)) throw new Error('Country, state and city are required');
    return { colid, ...values, countrykey: values.country.toLowerCase(), statekey: values.state.toLowerCase(), citykey: values.city.toLowerCase(), user };
  }
  const academicyear = text(body.academicyear), programcode = text(body.programcode), formid = text(body.formid);
  if (!academicyear || !programcode || !formid) throw new Error('Academic year, program and admission form are required');
  const program = await Program.findOne({ colid, year: academicyear, programcode }).lean();
  const form = await Form.findOne({ colid, formid }).lean();
  if (!program || !form) throw new Error('Select a program for this academic year and a valid dynamic admission form');
  return { colid, academicyear, programcode: program.programcode, program: program.program, formid: form.formid, formtitle: form.title, user };
}
router.get('/forms', wrap(async (req, res, colid) => {
  const query = { colid };
  if (text(req.query.search)) query.$or = [{ title: contains(req.query.search) }, { formid: contains(req.query.search) }];
  const rows = await Form.find(query).select('formid title').sort({ title: 1 }).limit(100).lean();
  res.json({ success: true, data: rows.map(row => ({ ...row, name: `${row.title || row.formid} (${row.formid})` })) });
}));
router.get('/interested-leads', wrap(async (req, res, colid) => {
  const query = interestedQuery(colid, req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0), limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const [data, total] = await Promise.all([
    Lead.find(query).select('name email phone academicyear programsinterested pipeline source admitted active crmcategory category counsellorname counselloremail agentname agentemail country state city followupdate dateadded createdAt').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Lead.countDocuments(query)
  ]);
  res.json({ success: true, data, total });
}));
router.get('/address-options', wrap(async (req, res, colid) => {
  const field = text(req.query.field);
  if (!['country','state','city'].includes(field)) throw new Error('Invalid address field');
  if ((field !== 'country' && !text(req.query.country)) || (field === 'city' && !text(req.query.state))) return res.json({ success: true, data: [] });
  const query = { colid, [field]: { $regex: contains(req.query.search || '') } };
  if (field !== 'country') query.country = exact(req.query.country);
  if (field === 'city') query.state = exact(req.query.state);
  const rows = await Address.aggregate([{ $match: query }, { $group: { _id: `$${field}` } }, { $sort: { _id: 1 } }, { $limit: 100 }]);
  res.json({ success: true, data: rows.map(row => row._id) });
}));
router.get('/:kind', wrap(async (req, res, colid) => {
  const Model = model(req.params.kind), query = { colid };
  if (text(req.query.search)) query.$or = (req.params.kind === 'address' ? ['country','state','city'] : ['academicyear','program','programcode','formtitle','formid']).map(field => ({ [field]: contains(req.query.search) }));
  res.json({ success: true, data: await Model.find(query).sort({ createdAt: -1 }).limit(5000).lean() });
}));
router.post('/:kind/save', wrap(async (req, res, colid) => {
  const Model = model(req.params.kind);
  const data = await payload(req.params.kind, req.body, colid, text(req.body.user));
  if (req.body.id && !mongoose.isValidObjectId(req.body.id)) throw new Error('Invalid record');
  const saved = req.body.id ? await Model.findOneAndUpdate({ colid, _id: req.body.id }, data, { new: true, runValidators: true }) : await Model.create(data);
  if (!saved) throw new Error('Record not found');
  res.json({ success: true, data: saved });
}));
router.post('/:kind/delete', wrap(async (req, res, colid) => {
  const Model = model(req.params.kind), ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !mongoose.isValidObjectId(id))) throw new Error('Select up to 500 records');
  const result = await Model.deleteMany({ colid, _id: { $in: ids } });
  res.json({ success: true, deleted: result.deletedCount });
}));
router.post('/:kind/bulk', wrap(async (req, res, colid) => {
  const Model = model(req.params.kind), rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('Upload 1 to 500 rows');
  let saved = 0; const errors = [];
  for (const [i, row] of rows.entries()) {
    try { await Model.create(await payload(req.params.kind, row, colid, text(req.body.user))); saved++; }
    catch (error) { errors.push({ row: i + 2, message: error.code === 11000 ? 'Already exists' : error.message }); }
  }
  res.json({ success: true, saved, errors });
}));
module.exports = { router, payload };
