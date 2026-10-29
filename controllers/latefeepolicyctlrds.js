const Policy = require('../Models/latefeepolicyds');
const Ledger = require('../Models/latefeesledgerds');
const Program = require('../Models/mprograms');
const text = value => String(value ?? '').trim();
const fields = ['academicyear','program','programcode','startdate','enddate','amount','finetype'];
const wrap = callback => async (req, res) => {
  try {
    req.colid = Number(req.body?.colid || req.query.colid);
    if (!Number.isFinite(req.colid) || req.colid <= 0) throw new Error('Institution ID is required');
    await callback(req, res);
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
const date = value => value instanceof Date ? value.toISOString().slice(0,10) : typeof value === 'number' ? new Date(Date.UTC(1899,11,30) + value * 86400000).toISOString().slice(0,10) : text(value).slice(0,10);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
async function payload(body, colid, user) {
  const row = Object.fromEntries(fields.map(field => [field, text(body[field])]));
  Object.assign(row, { colid, user: text(user), startdate: date(body.startdate), enddate: date(body.enddate), amount: Number(body.amount) });
  if (!row.academicyear || !row.programcode) throw new Error('Select academic year and program');
  if (!validDate(row.startdate) || !validDate(row.enddate) || row.startdate > row.enddate) throw new Error('Enter a valid start and end date range');
  if (body.amount === '' || body.amount == null || !Number.isFinite(row.amount) || row.amount < 0) throw new Error('Enter a non-negative fine amount');
  if (!['per day','flat'].includes(row.finetype)) throw new Error('Select per day or flat fine type');
  const program = await Program.findOne({ colid, programcode: row.programcode }).lean();
  if (!program) throw new Error('Select a program from Program master');
  row.program = program.program;
  return row;
}
function filters(source, colid, allowed = fields) {
  const query = { colid }, entries = JSON.parse(source.filters || '[]');
  if (!Array.isArray(entries)) throw new Error('Invalid filters');
  for (const filter of entries) if (allowed.includes(filter.field) && text(filter.value)) query[filter.field] = ['amount','paid','balance'].includes(filter.field) ? Number(filter.value) : text(filter.value);
  return query;
}
exports.options = require('./conductexamfinectlrds').options;
exports.list = wrap(async (req, res) => res.json({ success: true, data: await Policy.find(filters(req.query, req.colid)).sort({ startdate: -1, createdAt: -1 }).lean() }));
exports.save = wrap(async (req, res) => {
  const row = await payload(req.body, req.colid, req.body.user);
  const data = req.body.id ? await Policy.findOneAndUpdate({ colid: req.colid, _id: req.body.id }, { $set: row }, { new: true, runValidators: true }) : await Policy.create(row);
  if (!data) throw new Error('Policy not found');
  res.json({ success: true, data });
});
exports.remove = wrap(async (req, res) => {
  if (!Array.isArray(req.body.ids) || !req.body.ids.length) throw new Error('Select policies to delete');
  const result = await Policy.deleteMany({ colid: req.colid, _id: { $in: req.body.ids } });
  res.json({ success: true, deleted: result.deletedCount });
});
exports.bulk = wrap(async (req, res) => {
  if (!Array.isArray(req.body.rows) || !req.body.rows.length) throw new Error('Upload a workbook containing policies');
  let saved = 0; const errors = [];
  for (const [index, body] of req.body.rows.entries()) {
    try { await Policy.create(await payload(body, req.colid, req.body.user)); saved++; }
    catch (error) { errors.push({ row: index + 2, message: error.message }); }
  }
  res.json({ success: true, saved, errors });
});
exports.ledger = wrap(async (req, res) => {
  const allowed = ['academicyear','program','programcode','semester','regno','student','email','gateway','finetype','refno','amount'];
  const query = filters(req.query, req.colid, allowed);
  if (req.query.fromdate || req.query.todate) {
    query.paiddate = {};
    if (req.query.fromdate) { if (!validDate(req.query.fromdate)) throw new Error('Invalid from date'); query.paiddate.$gte = new Date(`${req.query.fromdate}T00:00:00+05:30`); }
    if (req.query.todate) { if (!validDate(req.query.todate)) throw new Error('Invalid to date'); query.paiddate.$lte = new Date(`${req.query.todate}T23:59:59.999+05:30`); }
  }
  res.json({ success: true, data: await Ledger.find(query).sort({ paiddate: -1 }).lean() });
});
