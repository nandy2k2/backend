const router = require('express').Router();
const { Mapping, Assignment } = require('../Models/crm2programds');
const { Lead, masterModels } = require('../Models/crm2ds');
const Program = require('../Models/mprograms');
const User = require('../Models/user');
const ensureYearIndex = require('../utils/crm2ProgramYearIndex');
const text = value => String(value ?? '').trim();
const regex = value => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const id = value => /^[a-f\d]{24}$/i.test(text(value));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = fn => async (req, res) => {
  try {
    req.colid = Number(req.body?.colid || req.query.colid);
    if (!(req.colid > 0) || !Number.isFinite(req.colid)) throw fail('Institution is required');
    await fn(req, res);
  } catch (error) { res.status(error.code === 11000 ? 409 : error.status || 400).json({ message: error.code === 11000 ? 'This counselor/program/location mapping already exists.' : error.message }); }
};
const actor = req => text(req.user?.email || req.body?.user || req.query.user).toLowerCase();
async function owner(req) {
  const email = actor(req);
  if (!email || !await User.exists({ colid: req.colid, email: new RegExp(`^${regex(email).source}$`, 'i'), role: { $not: /^Student$/i } })) throw fail('A logged-in non-student user is required', 403);
  return email;
}
const pagination = query => ({ limit: Math.min(100, Math.max(1, Number(query.limit) || 25)), skip: Math.max(0, Number(query.skip) || 0) });
const leadFields = ['name', 'email', 'phone', 'academicyear', 'source', 'type', 'crmcategory', 'category', 'state', 'city', 'active', 'admissionstatus', 'agentname', 'admissionoffice'];
const assignmentFields = ['academicyear', 'program', 'programcode', 'pipeline', 'case', 'location'];
function filtersOf(source) {
  let filters;
  try { filters = JSON.parse(source.filters || '[]'); } catch { throw fail('Invalid filters'); }
  if (!Array.isArray(filters) || filters.length > 30) throw fail('Invalid filters');
  return filters;
}
router.get('/programs', wrap(async (req, res) => {
  const query = { colid: req.colid };
  if (text(req.query.academicyear)) query.year = text(req.query.academicyear);
  if (text(req.query.search)) query.$or = ['program', 'programcode'].map(field => ({ [field]: regex(req.query.search) }));
  const rows = await Program.find(query).select('program programcode year').sort({ program: 1 }).lean();
  const unique = new Map(rows.filter(row => row.program && row.programcode).map(row => [row.programcode, row]));
  res.json({ data: [...unique.values()] });
}));
router.get('/academic-years', wrap(async (req, res) => {
  const values = await Program.distinct('year', { colid: req.colid });
  res.json({ data: values.filter(Boolean).sort().reverse() });
}));
router.get('/mappings', wrap(async (req, res) => {
  const query = { colid: req.colid };
  if (req.query.programcode) query.programcode = text(req.query.programcode);
  if (text(req.query.search)) query.$or = ['program', 'programcode', 'counsellorname', 'counselloremail', 'location'].map(field => ({ [field]: regex(req.query.search) }));
  res.json({ data: await Mapping.find(query).sort({ program: 1, counsellorname: 1 }).lean() });
}));
router.post('/mappings/save', wrap(async (req, res) => {
  if (req.body.id && !id(req.body.id)) throw fail('Select a valid mapping');
  if (!text(req.body.counselloremail) || !text(req.body.programcode)) throw fail('Select a program and counselor');
  const program = await Program.findOne({ colid: req.colid, programcode: text(req.body.programcode) }).lean();
  const person = await User.findOne({ colid: req.colid, email: new RegExp(`^${regex(req.body.counselloremail).source}$`, 'i'), role: { $not: /^Student$/i } }).select('name email').lean();
  if (!program || !person) throw fail('Select a program and counselor from the masters');
  const payload = { program: program.program, programcode: program.programcode, counsellorname: person.name, counselloremail: text(person.email).toLowerCase(), location: text(req.body.location), createdby: actor(req) };
  const data = req.body.id ? await Mapping.findOneAndUpdate({ colid: req.colid, _id: req.body.id }, { $set: payload }, { new: true, runValidators: true }) : await Mapping.create({ colid: req.colid, ...payload });
  if (!data) throw fail('Mapping not found', 404);
  res.json({ data });
}));
router.post('/mappings/delete', wrap(async (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length || !ids.every(id)) throw fail('Select valid mappings');
  const result = await Mapping.deleteMany({ colid: req.colid, _id: { $in: ids } });
  res.json({ deleted: result.deletedCount });
}));
router.post('/assign', wrap(async (req, res) => {
  const academicyear = text(req.body.academicyear);
  if (!academicyear) throw fail('Select an academic year');
  const leadids = Array.isArray(req.body.leadids) ? [...new Set(req.body.leadids)] : [];
  const selections = Array.isArray(req.body.programs) ? req.body.programs : [];
  if (!leadids.length || leadids.length > 100 || !leadids.every(id) || !selections.length || selections.length > 50) throw fail('Select 1-100 leads and 1-50 programs');
  if (new Set(selections.map(row => row.programcode)).size !== selections.length) throw fail('Select each program once');
  const leads = await Lead.find({ colid: req.colid, _id: { $in: leadids } }).select('pipeline case followupdate').lean();
  if (leads.length !== leadids.length) throw fail('One or more leads were not found in this institution');
  // Validate all programs and mapped counselors before writing any assignments.
  const plans = [];
  for (const selection of selections) {
    const program = await Program.findOne({ colid: req.colid, year: academicyear, programcode: text(selection.programcode) }).lean();
    if (!program) throw fail('Selected program no longer exists');
    const mappings = await Mapping.find({ colid: req.colid, programcode: program.programcode }).sort({ _id: 1 }).lean();
    const people = await User.find({ colid: req.colid, email: { $in: mappings.map(row => new RegExp(`^${regex(row.counselloremail).source}$`, 'i')) }, role: { $not: /^Student$/i } }).select('email').lean();
    const eligible = mappings.filter(row => people.some(person => text(person.email).toLowerCase() === row.counselloremail));
    if (!eligible.length) throw fail(`No available counselor is mapped to ${program.program}`);
    if (req.body.autoassign !== true && !eligible.some(row => String(row._id) === String(selection.mappingid))) throw fail(`Select a mapped counselor for ${program.program}`);
    const counts = await Assignment.aggregate([{ $match: { colid: req.colid, academicyear, programcode: program.programcode } }, { $group: { _id: '$counselloremail', count: { $sum: 1 } } }]);
    plans.push({ program, eligible, selected: eligible.find(row => String(row._id) === String(selection.mappingid)), counts: new Map(counts.map(row => [row._id, row.count])) });
  }
  let saved = 0;
  await ensureYearIndex(Assignment.collection);
  for (const lead of leads) for (const plan of plans) {
    const mapping = req.body.autoassign === true ? [...plan.eligible].sort((a, b) => (plan.counts.get(a.counselloremail) || 0) - (plan.counts.get(b.counselloremail) || 0))[0] : plan.selected;
    await Assignment.findOneAndUpdate({ colid: req.colid, leadid: lead._id, academicyear, programcode: plan.program.programcode }, { $set: { program: plan.program.program, mappingid: mapping._id, counsellorname: mapping.counsellorname, counselloremail: mapping.counselloremail, location: mapping.location, assignedby: actor(req) }, $setOnInsert: { colid: req.colid, leadid: lead._id, academicyear, programcode: plan.program.programcode, pipeline: lead.pipeline || '', case: lead.case || '', followupdate: lead.followupdate || null } }, { upsert: true, new: true, runValidators: true });
    plan.counts.set(mapping.counselloremail, (plan.counts.get(mapping.counselloremail) || 0) + 1); saved += 1;
  }
  res.json({ saved });
}));
router.get('/lead-assignments/:id', wrap(async (req, res) => {
  if (!id(req.params.id)) throw fail('Select a valid lead');
  if (!await Lead.findOne({ colid: req.colid, _id: req.params.id }).select('_id').lean()) throw fail('Lead not found', 404);
  const data = await Assignment.find({ colid: req.colid, leadid: req.params.id }).sort({ program: 1, programcode: 1 }).lean();
  res.json({ data });
}));
router.get('/my-leads', wrap(async (req, res) => {
  const email = await owner(req), query = { colid: req.colid, counselloremail: email }, leadQuery = { colid: req.colid };
  let filterLeads = false;
  for (const filter of filtersOf(req.query)) {
    if (!text(filter.value)) continue;
    if (filter.field === 'followupdate') {
      const start = new Date(`${text(filter.value)}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime())) throw fail('Enter a valid follow-up filter date');
      query.followupdate = { $gte: start, $lt: new Date(start.getTime() + 86400000) };
    } else if (assignmentFields.includes(filter.field)) query[filter.field] = regex(filter.value);
    else if (leadFields.includes(filter.field)) { leadQuery[filter.field] = regex(filter.value); filterLeads = true; }
  }
  if (req.query.search) { leadQuery.$or = ['name', 'email', 'phone'].map(field => ({ [field]: regex(req.query.search) })); filterLeads = true; }
  if (filterLeads) query.leadid = { $in: (await Lead.find(leadQuery).select('_id').lean()).map(row => row._id) };
  const { skip, limit } = pagination(req.query);
  const rows = await Assignment.find(query).select('-interactions').sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit).lean();
  const leads = await Lead.find({ colid: req.colid, _id: { $in: rows.map(row => row.leadid) } }).select(leadFields.join(' ')).lean();
  res.json({ data: rows.map(row => ({ ...row, lead: leads.find(lead => String(lead._id) === String(row.leadid)) || {} })), total: await Assignment.countDocuments(query) });
}));
router.get('/filter-options', wrap(async (req, res) => {
  const field = text(req.query.field), email = await owner(req);
  if (![...leadFields, ...assignmentFields].includes(field)) throw fail('Invalid filter field');
  const query = { colid: req.colid, counselloremail: email };
  let values;
  if (assignmentFields.includes(field)) values = await Assignment.distinct(field, query);
  else {
    const leadids = await Assignment.distinct('leadid', query);
    values = await Lead.distinct(field, { colid: req.colid, _id: { $in: leadids } });
  }
  const search = text(req.query.search).toLowerCase();
  res.json({ data: values.filter(value => value && String(value).toLowerCase().includes(search)).sort().slice(0, 100) });
}));
router.get('/my-leads/:id', wrap(async (req, res) => {
  if (!id(req.params.id)) throw fail('Select a valid assignment');
  const email = await owner(req);
  const data = await Assignment.findOne({ colid: req.colid, _id: req.params.id, counselloremail: email }).lean();
  if (!data) throw fail('Assigned lead not found', 404);
  const lead = await Lead.findOne({ colid: req.colid, _id: data.leadid }).select(leadFields.join(' ')).lean();
  res.json({ data: { ...data, lead: lead || {} } });
}));
router.post('/my-leads/save', wrap(async (req, res) => {
  const email = await owner(req), body = req.body;
  if (!id(body.id)) throw fail('Select a valid assignment');
  const query = { colid: req.colid, _id: body.id, counselloremail: email };
  if (!await Assignment.exists(query)) throw fail('Assigned lead not found', 404);
  const changes = { updatedby: email };
  for (const field of ['pipeline', 'case']) if (body[field] !== undefined) {
    const value = text(body[field]);
    if (value && !await masterModels[field].exists({ colid: req.colid, name: value })) throw fail(`Select ${field} from its master`);
    changes[field] = value;
  }
  if (body.followupdate !== undefined) {
    changes.followupdate = body.followupdate ? new Date(body.followupdate) : null;
    if (changes.followupdate && Number.isNaN(changes.followupdate.getTime())) throw fail('Enter a valid follow-up date');
  }
  const update = { $set: changes };
  if (text(body.details)) {
    if (!await masterModels.interactionmode.exists({ colid: req.colid, name: text(body.mode) })) throw fail('Select an interaction mode');
    update.$push = { interactions: { details: text(body.details), mode: text(body.mode), pipeline: changes.pipeline, case: changes.case, followupdate: changes.followupdate, createdby: email, createdAt: new Date() } };
  }
  const data = await Assignment.findOneAndUpdate(query, update, { new: true, runValidators: true });
  if (!data) throw fail('Assigned lead not found', 404);
  res.json({ data });
}));
const reports = require('./crm2programreportctlrds');
router.get('/report-options', wrap(reports.options));
router.get('/report', wrap(reports.report));
module.exports = router;
