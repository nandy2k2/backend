const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { randomBytes } = require('node:crypto');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const User = require('../Models/user');
const Menu = require('../Models/menuaccessds');
const Email = require('../Models/emailconfigurationds');
const { Lead } = require('../Models/crm2ds');
const { Campaign, Member, Run, Delivery, TrackingSettings } = require('../Models/crm2campaignds');
const { applyFilters } = require('../utils/crm2LeadFilters');
const { mailRange } = require('../utils/crm2MailRange');
const { emailContent, metrics, trackingOrigin } = require('../utils/crm2Campaign');
const ping = require('./pingwhatsappsendctlrds');
const mail = require('./crm2MailIntake');
const text = v => typeof v === 'string' ? v.trim() : '';
const regex = v => text(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = v => new RegExp(`^${regex(v)}$`, 'i');
const oid = v => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const trackingSettingsPath = '/email-tracking-configuration';
const readTracking = colid => TrackingSettings.findById(colid).select('publicUrl').lean();
const trackingBase = async colid => {
  const config = await readTracking(colid);
  return config?.publicUrl ? `${trackingOrigin(config.publicUrl)}/api/v2/crm2-campaigns` : '';
};
const wrap = (fn, settings = false) => async (req, res) => {
  try {
    const token = text(req.get('authorization')).replace(/^Bearer\s+/i, '');
    let identity;
    try { identity = jwt.verify(token, process.env.JWT_SECRET); } catch { return res.status(401).json({ message: 'Sign in to continue' }); }
    const colid = Number(identity.colid), email = text(identity.user).toLowerCase();
    if (!(colid > 0) || !email) return res.status(401).json({ message: 'Sign in to continue' });
    const actor = await User.findOne({ colid, email: exact(email) }).select('email role').lean();
    const role = text(actor?.role);
    const own = /^counsel+or$/i.test(role);
    if ((settings || !own) && (!role || /^(student|agent|publisher|telecaller)$/i.test(role) || !/^(all|crmadmin)$/i.test(role) && !await Menu.exists({ colid, role, path: settings ? trackingSettingsPath : '/crm2-campaign-wizard', access: 'Allow' }))) return res.status(403).json({ message: settings ? 'You do not have access to email tracking configuration' : 'Campaign access is not available for this role' });
    const campaignScope = { colid, ...(own ? { owner: email } : {}) }, leadScope = { colid, ...(own ? { counselloremail: exact(email) } : {}) };
    await fn(req, res, { colid, email, campaignScope, leadScope });
  } catch (err) {
    if (req.campaignRun) return res.status(500).json({ run: req.campaignRun, message: 'Send outcome could not be confirmed. Check the campaign report before retrying.' });
    res.status(400).json({ message: err.code === 11000 ? 'This campaign or send request already exists' : err.message });
  }
};
async function campaignFor(scope, id) {
  if (!oid(id)) throw Error('Select a campaign');
  const campaign = await Campaign.findOne({ ...scope.campaignScope, _id: id }).lean();
  if (!campaign) throw Error('Campaign not found or not accessible');
  return campaign;
}
function idsOf(input, limit = 1000) {
  if (!Array.isArray(input) || !input.length || input.length > limit || input.some(id => !oid(id))) throw Error(`Select 1 to ${limit} leads`);
  return [...new Set(input)];
}
const leadFields = 'name email phone pipeline source addedby leadgroup counsellorname academicyear dateadded';
router.get('/tracking-settings', wrap(async (req, res, scope) => {
  const row = await readTracking(scope.colid);
  res.json({ publicUrl: row?.publicUrl || '' });
}, true));
router.post('/tracking-settings', wrap(async (req, res, scope) => {
  const publicUrl = trackingOrigin(req.body.publicUrl);
  await TrackingSettings.updateOne({ _id: scope.colid }, { $set: { publicUrl, updatedby: scope.email } }, { upsert: true, runValidators: true });
  res.json({ publicUrl });
}, true));
router.get('/', wrap(async (req, res, scope) => res.json({ data: await Campaign.find(scope.campaignScope).sort({ createdAt: -1 }).lean() })));
router.post('/', wrap(async (req, res, scope) => {
  const name = text(req.body.name), description = text(req.body.description);
  if (!name || name.length > 150 || description.length > 2000) throw Error('Enter a campaign name up to 150 characters and description up to 2000 characters');
  res.json({ data: await Campaign.create({ colid: scope.colid, owner: scope.email, name, namekey: name.toLowerCase(), description }) });
}));
router.get('/filter-options', wrap(async (req, res, scope) => {
  const field = text(req.query.field);
  if (Lead.schema.path(field)?.instance !== 'String' || /password|token|secret|emailkey|phonekey|^_|\./i.test(field)) throw Error('Invalid filter field');
  const search = new RegExp(regex(req.query.search).slice(0, 200), 'i');
  const rows = await Lead.aggregate([{ $match: { $and: [scope.leadScope, { [field]: { $type: 'string', $ne: '', $regex: search } }] } }, { $group: { _id: `$${field}` } }, { $sort: { _id: 1 } }, { $limit: 100 }]);
  res.json({ data: rows.map(row => ({ name: row._id })) });
}));
router.get('/leads', wrap(async (req, res, scope) => {
  const query = applyFilters({ ...scope.leadScope }, req.query);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25)), skip = Math.max(0, Number(req.query.skip) || 0);
  const [data, total] = await Promise.all([Lead.find(query).select(leadFields).sort({ dateadded: -1, _id: -1 }).skip(skip).limit(limit).lean(), Lead.countDocuments(query)]);
  res.json({ data, total });
}));
router.get('/:id/members', wrap(async (req, res, scope) => {
  const campaign = await campaignFor(scope, req.params.id);
  const ids = await Member.distinct('lead', { colid: scope.colid, campaign: campaign._id });
  res.json({ data: await Lead.find({ ...scope.leadScope, _id: { $in: ids } }).select(leadFields).sort({ name: 1 }).lean() });
}));
router.post('/:id/members', wrap(async (req, res, scope) => {
  const campaign = await campaignFor(scope, req.params.id), ids = idsOf(req.body.ids);
  const allowed = await Lead.distinct('_id', { ...scope.leadScope, _id: { $in: ids } });
  if (allowed.length !== ids.length) throw Error('Some leads are no longer available to you');
  const result = await Member.bulkWrite(allowed.map(lead => ({ updateOne: { filter: { colid: scope.colid, campaign: campaign._id, lead }, update: { $setOnInsert: { colid: scope.colid, campaign: campaign._id, lead } }, upsert: true } })));
  res.json({ added: result.upsertedCount });
}));
function pingCall(action, scope, body) {
  return new Promise((resolve, reject) => {
    let status = 200;
    Promise.resolve(action({ user: { colid: scope.colid }, body: { ...body, user: scope.email } }, { status(code) { status = code; return this; }, json(data) { if (status >= 400) reject(Object.assign(new Error(data.error || 'Ping request failed'), { status })); else resolve(data); } })).catch(reject);
  });
}
router.get('/send-options', wrap(async (req, res, scope) => {
  const [legacy, smtp, whatsapp, base] = await Promise.all([
    Email.find({ colid: scope.colid, isactive: /^yes$/i }).select('username provider smtp smptp').lean(),
    mongoose.models.crm2mailconfig.find({ colid: scope.colid, active: true, smtpHost: { $nin: [null, ''] } }).select('name username').lean(),
    pingCall(ping.options, scope, {}),
    trackingBase(scope.colid)
  ]);
  res.json({ legacy, smtp, whatsapp, trackingEnabled: Boolean(base) });
}));
async function mailTransport(scope, body) {
  if (!oid(body.configid)) throw Error('Select an email configuration');
  let config;
  if (body.mailType === 'smtp') config = await mail.smtpCredentials(scope.colid, body.configid);
  else if (body.mailType === 'legacy') {
    const row = await Email.findOne({ colid: scope.colid, _id: body.configid, isactive: /^yes$/i }).lean();
    if (row) config = { host: row.smtp || row.smptp || (/gmail/i.test(row.provider || '') ? 'smtp.gmail.com' : ''), port: row.port || 587, secure: /^(yes|true)$/i.test(row.secure), username: row.username, password: row.password };
  }
  if (!config?.host || !config.username || !config.password) throw Error('Email configuration is incomplete');
  const secure = config.secure || Number(config.port) === 465;
  const addresses = await require('node:dns').promises.resolve4(config.host);
  const blocked = new (require('node:net').BlockList)();
  for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',3]]) blocked.addSubnet(address, prefix);
  if (!addresses.length || addresses.some(address => blocked.check(address))) throw Error('Configure a public IPv4 SMTP server');
  return { from: config.username, transport: nodemailer.createTransport({ host: addresses[0], tls: { servername: config.host }, port: Number(config.port), secure, requireTLS: !secure, auth: { user: config.username, pass: config.password }, connectionTimeout: 12000, greetingTimeout: 10000, socketTimeout: 20000 }) };
}
const phoneAddress = value => { const digits = String(value || '').replace(/\D/g, ''); return digits.length === 10 ? `91${digits}` : digits; };
router.post('/:id/send', wrap(async (req, res, scope) => {
  const campaign = await campaignFor(scope, req.params.id), body = req.body, ids = idsOf(body.ids, 50);
  const mode = body.mode, subject = text(body.subject), message = text(body.message), requestId = text(body.requestId);
  if (!/^[\w-]{16,100}$/.test(requestId) || !['Email','WhatsApp'].includes(mode)) throw Error('Invalid send request');
  await Run.init();
  const prior = await Run.findOne({ colid: scope.colid, owner: scope.email, requestId }).lean();
  if (prior) {
    if (String(prior.campaign) !== String(campaign._id)) throw Error('Send request already exists for another campaign');
    return res.json({ run: prior._id, status: prior.status, ...metrics(await Delivery.find({ colid: scope.colid, run: prior._id }).lean()) });
  }
  const members = await Member.distinct('lead', { colid: scope.colid, campaign: campaign._id, lead: { $in: ids } });
  const leads = await Lead.find({ ...scope.leadScope, _id: { $in: members } }).select('name email phone').lean();
  if (leads.length !== ids.length) throw Error('Some selected recipients are not in your campaign or are no longer assigned to you');
  let email, templateLabel;
  if (mode === 'Email') {
    if (!subject || subject.length > 250 || !message || message.length > 30000) throw Error('Enter an email subject and message');
    email = await mailTransport(scope, body);
  } else {
    const options = await pingCall(ping.options, scope, {});
    const template = options.templates.find(row => String(row._id) === body.templateid);
    if (!template || !options.configs.some(row => String(row._id) === body.configid)) throw Error('Select an active Ping configuration and template');
    ping.buildPayload({ ...body, template }, '919000000000');
    templateLabel = template.templatename || template.templatecode;
    const phones = new Set(leads.map(lead => phoneAddress(lead.phone)).filter(number => /^[1-9]\d{7,14}$/.test(number)));
    if (options.balance < phones.size) throw Error(`Insufficient WhatsApp credits. Required: ${phones.size}.`);
  }
  const base = mode === 'Email' ? await trackingBase(scope.colid) : '';
  const run = await Run.create({ colid: scope.colid, campaign: campaign._id, owner: scope.email, requestId, mode, subject: templateLabel || subject, status: 'Sending', total: leads.length });
  req.campaignRun = run._id;
  const seen = new Set(), rendered = new Map();
  const deliveries = await Delivery.insertMany(leads.map(lead => {
    const address = mode === 'Email' ? text(lead.email).toLowerCase() : phoneAddress(lead.phone);
    const valid = mode === 'Email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) : /^[1-9]\d{7,14}$/.test(address);
    const error = !valid ? 'Invalid recipient address' : seen.has(address) ? 'Duplicate recipient address' : '';
    seen.add(address);
    const token = base && !error ? randomBytes(24).toString('hex') : undefined;
    const content = mode === 'Email' && !error ? emailContent(message, base, token) : null;
    if (content) rendered.set(address, content);
    return { colid: scope.colid, campaign: campaign._id, run: run._id, lead: lead._id, name: lead.name, address, mode, status: error ? 'Failed' : 'Pending', error, token, links: content?.links || [] };
  }));
  const update = async (row, values) => { await Delivery.updateOne({ _id: row._id, colid: scope.colid }, { $set: values }); Object.assign(row, values); };
  const pending = deliveries.filter(row => row.status === 'Pending');
  for (let i = 0; i < pending.length; i += mode === 'Email' ? 5 : 10) {
    const batch = pending.slice(i, i + (mode === 'Email' ? 5 : 10));
    if (mode === 'Email') await Promise.all(batch.map(async row => {
      let values;
      try {
        const content = rendered.get(row.address);
        const result = await email.transport.sendMail({ from: email.from, to: row.address, subject, text: content.text, html: content.html });
        values = result.accepted?.length ? { status: 'Sent', sentat: new Date(), providerid: result.messageId } : { status: 'Failed', error: 'SMTP did not accept recipient' };
      } catch (err) { values = { status: Number(err.responseCode) >= 400 ? 'Failed' : 'Unknown', error: 'SMTP did not confirm sending. Check the mailbox before retrying.' }; }
      await update(row, values);
    }));
    else {
      let result, creditError;
      try { result = await pingCall(ping.sendDirect, scope, { configid: body.configid, templateid: body.templateid, language: body.language, values: body.values, header: body.header, mobileNumbers: batch.map(row => row.address).join(',') }); }
      catch (err) { if (err.status === 402) creditError = err.message; }
      await Promise.all(batch.map(row => {
        const report = result?.recipients?.find(item => item.phone === row.address);
        return update(row, report?.status === 'Accepted' ? { status: 'Sent', providerid: report.messageid, sentat: new Date() } : { status: creditError || ['Failed','Skipped'].includes(report?.status) ? 'Failed' : 'Unknown', error: creditError || report?.error || 'Ping did not confirm sending. Check credits and provider logs before retrying.' });
      }));
    }
  }
  await Run.updateOne({ _id: run._id, colid: scope.colid }, { $set: { status: 'Completed' } });
  res.json({ run: run._id, status: 'Completed', ...metrics(deliveries) });
}));
router.get('/:id/report', wrap(async (req, res, scope) => {
  const campaign = await campaignFor(scope, req.params.id), range = mailRange(req.query);
  const query = { colid: scope.colid, campaign: campaign._id, ...(Object.keys(range).length ? { createdAt: range } : {}) };
  if (['Email','WhatsApp'].includes(req.query.mode)) query.mode = req.query.mode;
  const runs = await Run.find(query).select('-requestId').sort({ createdAt: -1 }).lean();
  const runIds = runs.filter(row => !req.query.run || String(row._id) === req.query.run).map(row => row._id);
  const deliveries = { colid: scope.colid, campaign: campaign._id, run: { $in: runIds } };
  if (['Sent','Failed','Pending','Unknown'].includes(req.query.status)) deliveries.status = req.query.status;
  if (text(req.query.search)) deliveries.$or = ['name','address'].map(field => ({ [field]: new RegExp(regex(req.query.search).slice(0, 200), 'i') }));
  const rows = await Delivery.find(deliveries).select('-links').sort({ createdAt: -1 }).lean();
  res.json({ runs, summary: metrics(rows), data: rows.map(publicDelivery) });
}));
function publicDelivery(row) { const { token, links, ...data } = row; return { ...data, tracked: Boolean(token) }; }
router.get('/lead/:id/history', wrap(async (req, res, scope) => {
  if (!oid(req.params.id) || !await Lead.exists({ ...scope.leadScope, _id: req.params.id })) throw Error('Lead is not accessible');
  const campaigns = await Campaign.find(scope.campaignScope).select('name').lean();
  const names = new Map(campaigns.map(row => [String(row._id), row.name]));
  const rows = await Delivery.find({ colid: scope.colid, lead: req.params.id, campaign: { $in: campaigns.map(row => row._id) } }).select('-links').sort({ createdAt: -1 }).limit(1000).lean();
  res.json({ data: rows.map(row => ({ ...publicDelivery(row), campaignName: names.get(String(row.campaign)) })) });
}));
const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
router.get('/track/:token/open', async (req, res) => {
  if (/^[a-f\d]{48}$/.test(req.params.token)) await Delivery.updateOne({ token: req.params.token, openedat: null }, { $set: { openedat: new Date() } }).catch(() => {});
  res.set('Cache-Control', 'no-store').type('gif').send(pixel);
});
router.get('/track/:token/click/:index', async (req, res) => {
  try {
    if (!/^[a-f\d]{48}$/.test(req.params.token) || !/^\d+$/.test(req.params.index)) return res.sendStatus(404);
    const row = await Delivery.findOne({ token: req.params.token }).select('links').lean();
    const link = row?.links[Number(req.params.index)];
    if (!link || !/^https?:\/\//i.test(link)) return res.sendStatus(404);
    await Delivery.updateOne({ _id: row._id, clickedat: null }, { $set: { clickedat: new Date() } }).catch(() => {});
    return res.set('Cache-Control', 'no-store').redirect(302, link);
  } catch { return res.sendStatus(404); }
});
module.exports = router;
