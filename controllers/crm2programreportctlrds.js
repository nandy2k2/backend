const { Assignment } = require('../Models/crm2programds');
const { Lead, fields, excluded } = require('../Models/crm2ds');
const Program = require('../Models/mprograms');
const text = value => String(value ?? '').trim();
const fail = message => Object.assign(new Error(message), { status: 400 });
const escape = value => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hidden = new Set([...excluded, 'password', 'emailkey', 'phonekey', 'colid', 'user', 'crm2profileversion', '__v', 'interactions']);
const assignmentFields = ['pipeline', 'case', 'counsellorname', 'counselloremail', 'location', 'followupdate'];
const extraLeadFields = ['source', 'type', 'crmcategory', 'leadrating', 'distributiontype', 'admissionstatus'];
const metadata = [
  ...fields.filter(row => ['String', 'Number', 'Date', 'Boolean'].includes(row.type) && !hidden.has(row.field) && !['academicyear', ...assignmentFields].includes(row.field)),
  ...extraLeadFields.filter(field => !fields.some(row => row.field === field)).map(field => ({ field, type: 'String' })),
  { field: 'leadacademicyear', label: 'Lead academic year', type: 'String' },
  ...assignmentFields.map(field => ({ field, type: field === 'followupdate' ? 'Date' : 'String' }))
].map(row => ({ ...row, label: row.label || row.field.replace(/([a-z])([A-Z])/g, '$1 $2') }));
const pathOf = field => assignmentFields.includes(field) ? field : `lead.${field === 'leadacademicyear' ? 'academicyear' : field}`;
const summaryFields = { pipeline: '$pipeline', category: '$lead.category', crmcategory: '$lead.crmcategory', case: '$case', source: '$lead.source', counselor: '$counselloremail', type: '$lead.type', admissionstatus: '$lead.admissionstatus' };
const groupStages = field => [{ $group: { _id: { $ifNull: [field, 'Not specified'] }, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }];
async function context(req) {
  const academicyear = text(req.query.academicyear), programcode = text(req.query.programcode);
  if (!academicyear || !programcode) throw fail('Select academic year and program');
  const program = await Program.findOne({ colid: req.colid, year: academicyear, programcode }).select('program programcode year').lean();
  if (!program) throw fail('Program was not found for the selected academic year');
  return { academicyear, programcode, program };
}
function baseStages(colid, selection) {
  return [
    { $match: { colid, academicyear: selection.academicyear, programcode: selection.programcode } },
    { $lookup: { from: Lead.collection.name, let: { leadid: '$leadid' }, pipeline: [{ $match: { colid, $expr: { $eq: ['$_id', '$$leadid'] } } }], as: 'lead' } },
    { $unwind: '$lead' }
  ];
}
function filterStages(query) {
  let filters;
  try { filters = JSON.parse(query.filters || '[]'); } catch { throw fail('Invalid filters'); }
  if (!Array.isArray(filters) || filters.length > 30) throw fail('Use at most 30 filters');
  const matches = [];
  for (const filter of filters) {
    if (!text(filter.value)) continue;
    const definition = metadata.find(row => row.field === filter.field);
    if (!definition) throw fail('Invalid report filter');
    const path = pathOf(filter.field), value = text(filter.value);
    if (definition.type === 'Date') {
      const start = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime())) throw fail('Enter a valid filter date');
      matches.push({ [path]: { $gte: start, $lt: new Date(start.getTime() + 86400000) } });
    } else if (definition.type === 'Number') {
      if (!Number.isFinite(Number(value))) throw fail('Enter a valid numeric filter');
      matches.push({ [path]: Number(value) });
    } else if (definition.type === 'Boolean') matches.push({ [path]: value.toLowerCase() === 'true' });
    else matches.push({ [path]: new RegExp(`^${escape(value)}$`, 'i') });
  }
  return matches.length ? [{ $match: { $and: matches } }] : [];
}
exports.options = async (req, res) => {
  if (!req.query.field) return res.json({ fields: metadata });
  const definition = metadata.find(row => row.field === req.query.field);
  if (!definition) throw fail('Invalid dropdown field');
  const selection = await context(req), path = pathOf(definition.field);
  const data = await Assignment.aggregate([
    ...baseStages(req.colid, selection),
    { $match: { [path]: { $type: 'string', $ne: '', $regex: new RegExp(escape(req.query.search || ''), 'i') } } },
    { $group: { _id: `$${path}` } }, { $sort: { _id: 1 } }, { $limit: 100 }
  ]);
  res.json({ data: data.map(row => row._id) });
};
exports.report = async (req, res) => {
  const selection = await context(req);
  const exporting = req.query.export === 'true';
  const skip = exporting ? 0 : Math.max(0, Number(req.query.skip) || 0);
  const limit = exporting ? 10001 : Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const projection = Object.fromEntries([...hidden].filter(field => field !== '_id').map(field => [`lead.${field}`, 0]));
  const facet = {
    total: [{ $count: 'count' }],
    unique: [{ $group: { _id: '$leadid' } }, { $count: 'count' }],
    data: [{ $sort: { updatedAt: -1, _id: -1 } }, { $skip: skip }, { $limit: limit }, { $project: projection }],
    ...Object.fromEntries(Object.entries(summaryFields).map(([name, field]) => [name, groupStages(field)]))
  };
  const [result = {}] = await Assignment.aggregate([...baseStages(req.colid, selection), ...filterStages(req.query), { $facet: facet }]);
  if (exporting && result.data?.length > 10000) throw fail('More than 10,000 entries match. Add filters before exporting or printing.');
  const summary = Object.fromEntries(Object.keys(summaryFields).map(key => [key, (result[key] || []).map(row => ({ name: row._id || 'Not specified', count: row.count }))]));
  const data = (result.data || []).map(row => {
    const { lead, ...assignment } = row;
    const safeLead = Object.fromEntries(Object.entries(lead || {}).filter(([field]) => !hidden.has(field)));
    return { ...safeLead, ...assignment, leadid: lead._id, leadacademicyear: lead.academicyear || '', program: selection.program.program };
  });
  const legacy = await Assignment.countDocuments({ colid: req.colid, programcode: selection.programcode, $or: [{ academicyear: { $exists: false } }, { academicyear: '' }, { academicyear: null }] });
  res.json({ data, total: result.total?.[0]?.count || 0, uniqueLeads: result.unique?.[0]?.count || 0, summary, fields: metadata, context: selection, legacy });
};
