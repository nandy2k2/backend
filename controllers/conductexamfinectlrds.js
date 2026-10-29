const Fine = require('../Models/conductexamfineds');
const Exam = require('../Models/conductexamds');
const Program = require('../Models/mprograms');
const text = value => String(value ?? '').trim();
const fields = ['academicyear', 'exam', 'examcode', 'program', 'programcode', 'startdate', 'enddate', 'amount', 'finetype', 'coursetype'];
const date = value => {
  if (typeof value === 'number') return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  return value instanceof Date ? value.toISOString().slice(0, 10) : text(value).slice(0, 10);
};
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const wrap = callback => async (req, res) => {
  try {
    req.colid = Number(req.body?.colid || req.query.colid);
    if (!Number.isFinite(req.colid) || req.colid <= 0) throw new Error('Institution ID is required');
    await callback(req, res);
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
async function payload(input, colid, user) {
  const value = Object.fromEntries(fields.map(field => [field, text(input[field])]));
  Object.assign(value, { colid, user: text(user), startdate: date(input.startdate), enddate: date(input.enddate), amount: Number(input.amount) });
  if (!value.academicyear || !value.examcode || !value.programcode) throw new Error('Select academic year, exam and program');
  if (!validDate(value.startdate) || !validDate(value.enddate) || value.startdate > value.enddate) throw new Error('Enter a valid start and end date range');
  if (input.amount === '' || input.amount == null || !Number.isFinite(value.amount) || value.amount < 0) throw new Error('Enter a non-negative fine amount');
  if (value.coursetype === 'overall') value.coursetype = 'flat';
  if (!['per day','flat'].includes(value.finetype) || !['per course','flat'].includes(value.coursetype)) throw new Error('Select fine type and course type');
  const [exam, program] = await Promise.all([
    Exam.findOne({ colid, academicyear: value.academicyear, examcode: value.examcode }).lean(),
    Program.findOne({ colid, programcode: value.programcode }).lean()
  ]);
  if (!exam || !program) throw new Error('The selected exam or program is not available in the masters');
  value.exam = exam.examname || exam.exam; value.program = program.program;
  return value;
}
exports.options = wrap(async (req, res) => {
  const [exams, programs] = await Promise.all([
    Exam.find({ colid: req.colid }).select('academicyear examname exam examcode').sort({ academicyear: -1, examname: 1 }).lean(),
    Program.find({ colid: req.colid }).select('academicyear program programcode').sort({ program: 1 }).lean()
  ]);
  res.json({ success: true, exams, programs, academicyears: [...new Set([...exams, ...programs].map(row => row.academicyear).filter(Boolean))].sort().reverse() });
});
exports.list = wrap(async (req, res) => {
  const query = { colid: req.colid };
  const filters = JSON.parse(req.query.filters || '[]');
  if (!Array.isArray(filters)) throw new Error('Invalid filters');
  for (const filter of filters) {
    if (!fields.includes(filter.field) || !text(filter.value)) continue;
    query[filter.field] = filter.field === 'coursetype' && ['flat','overall'].includes(text(filter.value)) ? { $in: ['flat','overall'] } : filter.field === 'amount' ? Number(filter.value) : text(filter.value);
  }
  res.json({ success: true, data: await Fine.find(query).sort({ startdate: -1, createdAt: -1 }).lean() });
});
exports.save = wrap(async (req, res) => {
  const value = await payload(req.body, req.colid, req.body.user);
  const data = req.body.id ? await Fine.findOneAndUpdate({ _id: req.body.id, colid: req.colid }, { $set: value }, { new: true, runValidators: true }) : await Fine.create(value);
  if (!data) throw new Error('Exam fine not found');
  res.json({ success: true, data });
});
exports.remove = wrap(async (req, res) => {
  if (!Array.isArray(req.body.ids) || !req.body.ids.length) throw new Error('Select fine rules to delete');
  const result = await Fine.deleteMany({ colid: req.colid, _id: { $in: req.body.ids } });
  res.json({ success: true, deleted: result.deletedCount });
});
exports.bulk = wrap(async (req, res) => {
  if (!Array.isArray(req.body.rows) || !req.body.rows.length) throw new Error('Select a workbook containing fine rules');
  const errors = []; let saved = 0;
  for (const [index, row] of req.body.rows.entries()) {
    try { await Fine.create(await payload(row, req.colid, req.body.user)); saved++; }
    catch (error) { errors.push({ row: index + 2, message: error.message }); }
  }
  res.json({ success: true, saved, errors });
});
