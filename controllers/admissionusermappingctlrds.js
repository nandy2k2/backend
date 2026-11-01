const mongoose = require('mongoose');
const Application = require('../Models/admissionapplicationdynamic');
const FormField = require('../Models/admissionformfield');
const User = require('../Models/user');
const Mapping = mongoose.models.admissionusermappingds || mongoose.model('admissionusermappingds', new mongoose.Schema({
  colid: { type: Number, required: true, index: true }, source: { type: String, required: true }, target: { type: String, required: true }, user: String
}, { timestamps: true }).index({ colid: 1, target: 1 }, { unique: true }));
const protectedFields = ['name','email','program','programcode','regno','rollno','semester','regulation','academicyear','admissionyear'];
const systemFields = ['_id','__v','colid','createdAt','updatedAt'];
const authFields = ['role','authenticator','authenticatorsecret','authenticatordate','authenticatorsetupdate','lastlogin','password','excluded'];
const safePath = value => typeof value === 'string' && value.split('.').every(key => /^[A-Za-z0-9_ -]+$/.test(key) && !['__proto__','constructor','prototype'].includes(key));
const scope = req => {
  const colid = Number(req.user?.colid || req.body?.colid || req.query?.colid);
  if (!Number.isFinite(colid) || colid <= 0) throw new Error('Institution ID is required');
  return colid;
};
const read = (row, path) => path.startsWith('extraFields.') ? row.extraFields?.[path.slice(12)] : row[path];
const targetFields = () => Object.keys(User.schema.paths).filter(field => safePath(field) && ![...systemFields,...authFields].includes(field));
async function catalog(colid) {
  const custom = await FormField.find({ colid }).select('fieldname label formid').lean();
  const observed = await Application.aggregate([
    { $match: { colid } }, { $project: { fields: { $objectToArray: { $cond: [{ $eq: [{ $type: '$extraFields' }, 'object'] }, '$extraFields', {}] } } } },
    { $unwind: '$fields' }, { $group: { _id: '$fields.k' } }
  ]);
  const sources = new Map(Object.keys(Application.schema.paths).filter(field => safePath(field) && !systemFields.includes(field) && field !== 'extraFields').map(field => [field, { field, label: field, forms: [] }]));
  for (const item of [...custom, ...observed.map(row => ({ fieldname: row._id }))]) {
    const field = `extraFields.${item.fieldname}`;
    if (!safePath(field)) continue;
    const entry = sources.get(field) || { field, label: item.label || item.fieldname, forms: [] };
    if (item.formid && !entry.forms.includes(item.formid)) entry.forms.push(item.formid);
    sources.set(field, entry);
  }
  return [...sources.values()].sort((a,b) => a.label.localeCompare(b.label));
}
exports.options = async (req,res) => {
  try { const colid = scope(req); res.json({ sources: await catalog(colid), targets: targetFields().map(field => ({ field, protected: protectedFields.includes(field) })), mappings: await Mapping.find({ colid }).lean(), protectedFields }); }
  catch (error) { res.status(400).json({ error: error.message }); }
};
exports.save = async (req,res) => {
  try {
    const colid = scope(req), { source, target } = req.body;
    if (!targetFields().includes(target) || !safePath(source) || systemFields.includes(source) || source === 'extraFields') throw new Error('Select valid admission and User fields');
    const sourceExists = source.startsWith('extraFields.')
      ? await FormField.exists({ colid, fieldname: source.slice(12) }) || await Application.exists({ colid, [source]: { $exists: true } })
      : !!Application.schema.path(source);
    if (!sourceExists) throw new Error('Select an admission field available in this institution');
    const data = await Mapping.findOneAndUpdate({ colid, target }, { $set: { source, user: req.body.user } }, { upsert: true, new: true, runValidators: true });
    res.json({ data });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
exports.remove = async (req,res) => {
  try { const colid = scope(req); const ids = req.body.ids; if (!Array.isArray(ids) || ids.some(id => !mongoose.isValidObjectId(id))) throw new Error('Select valid mappings'); const result = await Mapping.deleteMany({ colid, _id: { $in: ids } }); res.json({ deleted: result.deletedCount }); }
  catch (error) { res.status(400).json({ error: error.message }); }
};
exports.transfer = async (req,res) => {
  try {
    const colid = scope(req), ids = [...new Set(req.body.ids || [])];
    if (!ids.length || ids.length > 100 || ids.some(id => !mongoose.isValidObjectId(id))) throw new Error('Select 1-100 valid applications per batch');
    const mappings = (await Mapping.find({ colid }).lean()).filter(row => targetFields().includes(row.target) && !protectedFields.includes(row.target) && safePath(row.source));
    if (!mappings.length) throw new Error('No transferable field mappings. Configure Admission to User mapping first.');
    const applications = await Application.find({ colid, _id: { $in: ids } }).lean();
    const results = [];
    for (const id of ids) {
      const application = applications.find(row => String(row._id) === id);
      const result = { id, name: application?.name || '', regno: application?.regno || '', status: 'Skipped', details: '' };
      try {
        if (!application) throw new Error('Application not found in this institution');
        if (!application.regno?.trim()) throw new Error('Application has no regno');
        if (applications.filter(row => row.regno === application.regno).length > 1) throw new Error('Multiple selected applications share this regno. Select one application per student.');
        const students = await User.find({ colid, regno: application.regno, role: 'Student' }).select('_id').limit(2).lean();
        if (students.length !== 1) throw new Error(students.length ? 'Duplicate student regno; repair before transfer' : 'No Student found for this colid and regno');
        const update = {};
        for (const mapping of mappings) {
          const value = read(application, mapping.source);
          if (value === undefined || value === null || value === '') continue;
          const path = User.schema.path(mapping.target);
          if (path.instance === 'String' && typeof value === 'object') throw new Error(`${mapping.source} contains structured data and cannot map to ${mapping.target}`);
          update[mapping.target] = path.cast(value);
        }
        if (!Object.keys(update).length) throw new Error('Mapped source fields are empty; existing values retained');
        const saved = await User.updateOne({ _id: students[0]._id, colid, regno: application.regno, role: 'Student' }, { $set: update }, { runValidators: true });
        if (!saved.matchedCount) throw new Error('Student changed during transfer; load and retry');
        result.status = 'Transferred'; result.details = `${Object.keys(update).length} mapped fields processed`;
      } catch (error) { result.details = error.message; }
      results.push(result);
    }
    res.json({ results, transferred: results.filter(row => row.status === 'Transferred').length });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
exports.sendPing = async (req,res) => {
  try {
    const colid = scope(req), ids = [...new Set(req.body.applicationids || [])];
    if (!ids.length || ids.length > 10 || ids.some(id => !mongoose.isValidObjectId(id))) throw new Error('Select 1-10 valid applications per batch');
    const applications = await Application.find({ colid, _id: { $in: ids } }).select('phone').lean();
    if (applications.length !== ids.length) throw new Error('Application not found in this institution');
    const mobileNumbers = applications.map(row => row.phone || 'invalid').join(',');
    return require('./pingwhatsappsendctlrds').sendDirect({ ...req, body: { ...req.body, colid, mobileNumbers } }, res);
  } catch (error) { res.status(400).json({ error: error.message }); }
};
