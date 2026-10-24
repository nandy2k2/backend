const router = require('express').Router();
const Model = require('../Models/admissionscholarshipds');
const Program = require('../Models/mprograms');
const text = value => String(value ?? '').trim();
const id = value => /^[a-f\d]{24}$/i.test(text(value));
const wrap = fn => async (req, res) => {
  try {
    req.colid = Number(req.body?.colid || req.query.colid);
    if (!(req.colid > 0) || !Number.isFinite(req.colid)) throw Error('Institution is required');
    await fn(req, res);
  } catch (error) { res.status(400).json({ message: error.message }); }
};
async function payload(row, colid) {
  if (!text(row.scholarship)) throw Error('Scholarship is required');
  const result = { colid, scholarship: text(row.scholarship), description: text(row.description), academicyear: text(row.academicyear) };
  for (const [field, options] of Object.entries({ type: ['Amount', 'Percentage'], category: ['General', 'SC', 'ST', 'OBC', 'All'], merit: ['Yes', 'No'], gender: ['Male', 'Female', 'All'], active: ['Yes', 'No'] })) {
    const value = row[field] ?? ({ category: 'All', merit: 'No', gender: 'All', active: 'Yes' })[field];
    if (!options.includes(value)) throw Error(`Invalid ${field}`);
    result[field] = value;
  }
  for (const field of ['value', 'meritpercentage']) {
    const raw = row[field] ?? (field === 'meritpercentage' ? 0 : '');
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value) || value < 0 || (field === 'meritpercentage' && value > 100)) throw Error(`Invalid ${field}`);
    result[field] = value;
  }
  if (result.type === 'Percentage' && result.value > 100) throw Error('Percentage value cannot exceed 100');
  const program = await Program.findOne({ colid, programcode: text(row.programcode) }).select('program programcode').lean();
  if (!program) throw Error('Select program from program master');
  return { ...result, program: program.program, programcode: program.programcode };
}
router.get('/', wrap(async (req, res) => {
  const filter = { colid: req.colid };
  if (text(req.query.search)) filter.$or = ['scholarship', 'program', 'programcode', 'category'].map(field => ({ [field]: new RegExp(text(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
  res.json({ data: await Model.find(filter).sort({ createdAt: -1 }).limit(5000).lean() });
}));
router.post('/save', wrap(async (req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw Error('Provide 1–500 scholarship rows');
  if (req.body.id && (!id(req.body.id) || rows.length !== 1)) throw Error('Edit one record at a time');
  const plans = [];
  for (const row of rows) plans.push({ ...await payload(row, req.colid), user: text(req.body.user) });
  if (req.body.id) {
    const data = await Model.findOneAndUpdate({ colid: req.colid, _id: req.body.id }, { $set: plans[0] }, { new: true, runValidators: true });
    if (!data) throw Error('Scholarship not found');
  } else await Model.insertMany(plans);
  res.json({ saved: plans.length });
}));
router.post('/delete', wrap(async (req, res) => {
  if (!Array.isArray(req.body.ids) || !req.body.ids.length || req.body.ids.length > 500 || !req.body.ids.every(id)) throw Error('Select 1–500 records');
  const result = await Model.deleteMany({ colid: req.colid, _id: { $in: req.body.ids } });
  res.json({ deleted: result.deletedCount });
}));
module.exports = router;
