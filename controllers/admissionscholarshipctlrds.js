const router = require('express').Router();
const mongoose = require('mongoose');
const Model = require('../Models/admissionscholarshipds');
const Program = require('../Models/mprograms');
const Fees = require('../Models/fees');
const text = value => String(value ?? '').trim();
const id = value => /^[a-f\d]{24}$/i.test(text(value));
const wrap = fn => async (req, res) => {
  try {
    req.colid = Number(req.user?.colid || req.body?.colid || req.query.colid);
    if (!(req.colid > 0) || !Number.isFinite(req.colid)) throw Error('Institution is required');
    await fn(req, res);
  } catch (error) { res.status(400).json({ message: error.message }); }
};
async function payload(row, colid, requireFee = false) {
  if (!text(row.scholarship)) throw Error('Scholarship is required');
  const result = { colid, scholarship: text(row.scholarship), description: text(row.description), academicyear: text(row.academicyear) };
  result.scholarshiptype = text(row.scholarshiptype) || 'Total';
  if (!['Total','Balance','Paid'].includes(result.scholarshiptype)) throw Error('Invalid scholarship type. Select Total, Balance or Paid');
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
  const program = await Program.findOne({ colid, programcode: text(row.programcode), ...(result.academicyear?{year:result.academicyear}:{}) }).select('program programcode').lean();
  if (!program) throw Error('Select program from program master');
  if (requireFee || row.semester || row.feeitem || row.feecategory || row.feeconfigurationid) {
    if (!result.academicyear || !text(row.semester) || !text(row.feeitem) || !text(row.feecategory)) throw Error('Select academic year, semester, fee category and fee item');
    const fee = await Fees.findOne({ colid, academicyear: result.academicyear, program: program.program, programcode: program.programcode, semester: text(row.semester), feecategory: text(row.feecategory), feeeitem: text(row.feeitem), ...(row.feeconfigurationid ? {_id:row.feeconfigurationid} : {}) }).lean();
    if (!fee) throw Error('Fee item does not match Fees configuration for the selected year, program and semester');
    Object.assign(result,{semester:fee.semester,feecategory:fee.feecategory,feeitem:fee.feeeitem,feeconfigurationid:fee._id});
  }
  return { ...result, program: program.program, programcode: program.programcode };
}
router.get('/fee-options', wrap(async(req,res)=>{
  const query={colid:req.colid};
  for(const field of ['academicyear','programcode','semester','feecategory']) if(text(req.query[field]))query[field]=text(req.query[field]);
  if(!query.academicyear||!query.programcode)return res.json({data:[]});
  res.json({data:await Fees.find(query).select('academicyear program programcode semester feecategory feeeitem amount gender').sort({semester:1,feeeitem:1}).lean()});
}));
router.get('/', wrap(async (req, res) => {
  const filter = { colid: req.colid };
  if (text(req.query.search)) filter.$or = ['scholarship', 'program', 'programcode', 'category'].map(field => ({ [field]: new RegExp(text(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
  const rows = await Model.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
  res.json({ data: rows.map(row => ({ ...row, scholarshiptype: row.scholarshiptype || 'Total' })) });
}));
router.post('/save', wrap(async (req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw Error('Provide 1–500 scholarship rows');
  if (req.body.id && !id(req.body.id)) throw Error('Invalid scholarship record');
  const plans = [];
  for (const row of rows) plans.push({ ...await payload(row, req.colid, !req.body.id), user: text(req.body.user) });
  if (req.body.id && plans.length > 1) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const data = await Model.findOneAndUpdate({ colid: req.colid, _id: req.body.id }, { $set: plans[0] }, { new: true, runValidators: true, session });
        if (!data) throw Error('Scholarship not found');
        await Model.insertMany(plans.slice(1), { session });
      });
    } finally { await session.endSession(); }
  } else if (req.body.id) {
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
