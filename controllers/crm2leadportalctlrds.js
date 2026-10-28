const router = require('express').Router();
const { fields, Lead, masterModels } = require('../Models/crm2ds');
const Session = require('../Models/crm2leadportalsessionds');
const { login, authenticate } = require('../services/crm2LeadPortalAuth');
const Program = require('../Models/mprograms');
const Application = require('../Models/admissionapplicationdynamic');
const { Address } = require('../Models/crm2configurationds');
const crm = require('./crm2ctlrds');
const applications = require('./crm2applicationsctlrds').router;
const text = value => String(value ?? '').trim();
const escaped = value => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = value => new RegExp(`^${escaped(value)}$`, 'i');
const internal = new Set(['password', 'active', 'admitted', 'admissionstatus', 'isdisabled', 'scholarship', 'followupdate', 'campusvisitdate', 'campuscounsellor', 'campuscounseloremail', 'agentname', 'agentemail', 'admissionoffice', 'admissionofficeid', 'telecallername', 'telecalleremail', 'dateadded']);
const profileFields = fields.filter(field => !internal.has(field.field) && ['Identity', 'Family & Address', 'Education & Work', 'Additional Details'].includes(field.group) && ['String','Number','Date','Boolean'].includes(field.type));
// Explicitly exclude operational fields even when they originate in the general User schema.
const blocked = /password|token|secret|authenticat|approval|status|permission|access|payment|paid|balance|salary|role|colid|createdby|updatedby|lastlogin|^login|^expiry|^isadmin|^mfa|^otp|^excluded|^menu|^user$|^addedby$/i;
const editable = profileFields.filter(field => !blocked.test(field.field));
const allowed = new Set([...editable.map(field => field.field), 'education', 'documents', 'programsinterested']);
function profile(lead) {
  return { _id: lead._id, colid: lead.colid, ...Object.fromEntries([...allowed].filter(key => lead[key] !== undefined).map(key => [key, lead[key]])) };
}
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.status || 400).json({ success: false, message: error.code === 11000 ? 'Email or phone already belongs to another lead' : error.message }); } };
const attempts = new Map();
router.post('/login', wrap(async (req, res) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown', now = Date.now();
  for (const [ip, row] of attempts) if (row.until < now) attempts.delete(ip);
  const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (attempt.count >= 15) return res.status(429).json({ message: 'Too many login attempts. Try again in 15 minutes' });
  attempt.count++; attempts.set(key, attempt);
  const data = await login(req.body.email, req.body.password, req.body.colid);
  attempts.delete(key); res.json({ success: true, ...data });
}));
router.use(authenticate);
router.post('/logout', wrap(async (req, res) => { await Session.deleteOne({ _id: req.portalSession._id }); res.json({ success: true }); }));
router.get('/profile', (req, res) => res.json({ success: true, data: profile(req.portalLead), fields: editable }));
router.post('/profile', wrap(async (req, res) => {
  const body = Object.fromEntries([...allowed].filter(field => req.body[field] !== undefined).map(field => [field, req.body[field]]));
  if (body.email !== undefined && text(body.email).toLowerCase() !== text(req.portalLead.email).toLowerCase() || body.phone !== undefined && text(body.phone) !== text(req.portalLead.phone)) {
    await Application.updateMany({ colid: req.portalLead.colid, crmleadid: { $exists: false }, email: exact(req.portalLead.email), phone: text(req.portalLead.phone) }, { $set: { crmleadid: req.portalLead._id } });
  }
  const saved = await crm.saveLead({ ...body, id: req.portalLead._id, user: req.portalLead.email }, req.portalLead.colid);
  res.json({ success: true, data: profile(saved) });
}));
router.get('/academic-years', wrap(async (req, res) => {
  const data = await Program.distinct('year', { colid: req.portalLead.colid, year: { $ne: '' } });
  res.json({ success: true, data: data.filter(Boolean).sort().reverse() });
}));
router.get('/programs', wrap(async (req, res) => {
  if (!text(req.query.academicyear)) return res.json({ success: true, data: [] });
  const query = { colid: req.portalLead.colid, year: text(req.query.academicyear) };
  if (text(req.query.search)) query.$or = ['program','programcode'].map(key => ({ [key]: new RegExp(escaped(req.query.search), 'i') }));
  const data = await Program.find(query).select('program programcode year').sort({ program: 1 }).limit(100).lean();
  res.json({ success: true, data: data.map(row => ({ ...row, name: `${row.program} (${row.programcode})` })) });
}));
router.get('/options', wrap(async (req, res) => {
  const field = text(req.query.field), colid = req.portalLead.colid, search = new RegExp(escaped(req.query.search), 'i');
  const masters = { quota: 'quota', Mediumofinstruction: 'mediumofinstruction', document: 'document' };
  if (masters[field]) {
    const data = await masterModels[masters[field]].find({ colid, status: 'Active', name: search }).select('name').sort({ name: 1 }).limit(100).lean();
    return res.json({ success: true, data });
  }
  if (!['country','state','city'].includes(field)) throw new Error('Invalid dropdown');
  if (field !== 'country' && !text(req.query.country) || field === 'city' && !text(req.query.state)) return res.json({ success: true, data: [] });
  const query = { colid, [field]: search };
  if (field !== 'country') query.country = exact(req.query.country);
  if (field === 'city') query.state = exact(req.query.state);
  const values = await Address.distinct(field, query);
  res.json({ success: true, data: values.filter(Boolean).sort().slice(0,100).map(name => ({ name })) });
}));
router.post('/upload', (req, res, next) => {
  req.url = '/upload';
  // The CRM upload uses only the authenticated institution, never a multipart colid supplied by the lead.
  req.query = { colid: req.portalLead.colid };
  req.portalUpload = true;
  crm(req, res, next);
});
router.use('/applications', applications);
module.exports = { router, allowed, profile, editable };
