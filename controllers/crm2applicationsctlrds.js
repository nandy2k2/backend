const router = require('express').Router();
const mongoose = require('mongoose');
const Application = require('../Models/admissionapplicationdynamic');
const { Lead } = require('../Models/crm2ds');
const { FormMapping } = require('../Models/crm2configurationds');
const Program = require('../Models/mprograms');
const { Assignment } = require('../Models/crm2programds');
const ApplicationFee = require('../Models/applicationfeeds');
const ProvisionalFee = require('../Models/provisionaladmissionfeeds');
const User = require('../Models/user');
const ensureIndexes = require('../services/crm2ApplicationIndexes');
const text = value => String(value || '').trim();
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const wrap = fn => async (req, res) => {
  try {
    if (req.portalLead) {
      await fn(req, res, { colid: req.portalLead.colid, user: req.portalLead.email, lead: req.portalLead });
      return;
    }
    const input = require('../utils/crm2DashboardScope').dashboardIdentity({ ...req.query, ...req.body }, req);
    const colid = Number(input.dashboardyear ? input.colid : req.user?.colid || input.colid), user = text(input.dashboardyear ? input.user : req.user?.email || input.user);
    if (!Number.isFinite(colid) || colid <= 0 || !user || !mongoose.isValidObjectId(input.leadid)) throw new Error('Select a lead in your institution');
    const query = { _id: input.leadid, colid, ...require('../utils/crm2DashboardScope').yearScope(input.dashboardyear) };
    if (input.dashboardyear && !input.leadmode) input.leadmode = 'my';
    if (input.leadmode) {
      if (!['my','agent'].includes(input.leadmode) || !await User.exists({ colid, email: exact(user), role: { $not: /^Student$/i } })) throw new Error('Invalid user workspace');
      query[input.leadmode === 'my' ? 'counselloremail' : 'agentemail'] = exact(user);
    }
    const lead = await Lead.findOne(query).lean();
    if (!lead) throw new Error('Lead not found or not assigned to you');
    await fn(req, res, { colid, user, lead, dashboardyear: input.dashboardyear });
  } catch (error) { res.status(400).json({ msg: error.code === 11000 ? 'An application already exists for this program and form' : error.message }); }
};
const applicationsQuery = ({ colid, lead, dashboardyear }) => ({ colid, ...(dashboardyear ? { academicyear: dashboardyear } : {}), $or: [{ crmleadid: lead._id }, { crmleadid: { $exists: false }, email: exact(lead.email), phone: text(lead.phone) }] });
async function selectedPrograms(colid, lead) {
  const assigned = await Assignment.find({ colid, leadid: lead._id, active: { $ne: 'No' } }).select('academicyear programcode').lean();
  return [...(lead.programsinterested || []), ...assigned].filter(row => row.academicyear && row.programcode);
}
router.get('/', wrap(async (req, res, context) => {
  const rows = await Application.find(applicationsQuery(context)).select('-password -paymentdetails -provisionalpaymentdetails').sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: rows });
}));
router.get('/choices', wrap(async (req, res, { colid, lead, dashboardyear }) => {
  const selected = (await selectedPrograms(colid, lead)).filter(row => !dashboardyear || row.academicyear === dashboardyear);
  const data = selected.length ? await FormMapping.find({ colid, $or: selected.map(row => ({ academicyear: row.academicyear, programcode: row.programcode })) }).sort({ academicyear: -1, program: 1 }).lean() : [];
  res.json({ success: true, data: data.map(row => ({ ...row, name: `${row.academicyear} · ${row.program} (${row.programcode}) · ${row.formtitle || row.formid}` })) });
}));
router.get('/application', wrap(async (req, res, context) => {
  if (!mongoose.isValidObjectId(req.query.id)) throw new Error('Invalid application');
  const row = await Application.findOne({ ...applicationsQuery(context), _id: req.query.id }).select('-password -paymentdetails -provisionalpaymentdetails').lean();
  if (!row) throw new Error('Application not found');
  res.json(row);
}));
router.post('/new', wrap(async (req, res, context) => {
  const { colid, user, lead } = context;
  if (!mongoose.isValidObjectId(req.body.mappingid)) throw new Error('Select a mapped program and form');
  const mapping = await FormMapping.findOne({ _id: req.body.mappingid, colid }).lean();
  if (context.dashboardyear && mapping?.academicyear !== context.dashboardyear) throw new Error('Select a form for the dashboard academic year');
  if (!mapping || !(await selectedPrograms(colid, lead)).some(row => row.academicyear === mapping.academicyear && row.programcode === mapping.programcode)) throw new Error('Select a program assigned to this lead or in Programs interested');
  const program = await Program.findOne({ colid, year: mapping.academicyear, programcode: mapping.programcode }).lean();
  if (!program) throw new Error('Program no longer exists in the program master');
  const key = { colid, academicyear: mapping.academicyear, programcode: mapping.programcode, formid: mapping.formid };
  let row = await Application.findOne({ ...applicationsQuery(context), ...key });
  if (!row) {
    await ensureIndexes(Application);
    const id = new mongoose.Types.ObjectId();
    const copied = Object.fromEntries(Object.keys(Application.schema.paths).filter(field => !['_id','password','createdAt','updatedAt','__v'].includes(field) && lead[field] !== undefined).map(field => [field, lead[field]]));
    const feeQuery = { colid, academicyear: key.academicyear, programcode: key.programcode, amount: { $gt: 0 } };
    const [fee, provisional] = await Promise.all([ApplicationFee.findOne({ ...feeQuery, active: 'Yes' }).lean(), ProvisionalFee.findOne(feeQuery).lean()]);
    row = await Application.create({ ...copied, ...key, _id: id, applicationid: String(id), applicationnumber: String(id), crmleadid: lead._id, name: lead.name, email: text(lead.email).toLowerCase(), phone: text(lead.phone), programapplied: program.program, programtype: program.type || program.programtype || 'Program', level: program.level, country_form: lead.country, state_form: lead.state, district_form: lead.city, applicationstatus: 'Draft', dateofapplication: new Date().toISOString().slice(0,10), applicationfeeamount: fee?.amount || 0, paymentstatus: fee ? 'Pending' : 'Not Required', provisionalfeeamount: provisional?.amount || 0, provisionalpaymentstatus: provisional ? 'Pending' : 'Not Required', user });
  }
  res.json({ success: true, data: row });
}));
router.post('/save', wrap(async (req, res, context) => {
  if (!mongoose.isValidObjectId(req.body.id)) throw new Error('Invalid application');
  const current = await Application.findOne({ ...applicationsQuery(context), _id: req.body.id });
  if (!current || current.applicationstatus !== 'Draft' && !(req.portalLead && current.applicationstatus === 'Applied')) throw new Error('This application cannot be edited');
  const protectedFields = new Set(['_id','colid','crmleadid','formid','academicyear','programcode','programapplied','programtype','applicationid','applicationnumber','createdAt','updatedAt','__v','user','password','applicationstatus','applicationcomments','validationstatus','validationcomments','enrollmentstatus']);
  const data = Object.fromEntries(Object.keys(Application.schema.paths).filter(field => !protectedFields.has(field) && !/payment|paid|feeamount/i.test(field) && Object.prototype.hasOwnProperty.call(req.body, field)).map(field => [field, req.body[field]]));
  if (!text(data.name || current.name) || !text(data.email || current.email) || !text(data.phone || current.phone)) throw new Error('Name, email and phone are required');
  if (req.body.submit && current.applicationstatus === 'Draft') data.applicationstatus = 'Applied';
  const row = await Application.findOneAndUpdate({ _id: current._id, colid: context.colid, applicationstatus: current.applicationstatus }, { $set: { ...data, user: context.user } }, { new: true, runValidators: true });
  if (!row) throw new Error('Application was already submitted; reload it');
  res.json(row);
}));
module.exports = { router };
