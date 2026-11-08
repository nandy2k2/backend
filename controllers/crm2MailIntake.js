const router = require('express').Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Lead } = require('../Models/crm2ds');
const User = require('../Models/user');
const { History, recordDuplicate, emailKey, phoneKey } = require('../services/crm2LeadHistory');
const { mailRange, mailboxSearch, inMailRange, storedMailRange } = require('../utils/crm2MailRange');
const Config = mongoose.models.crm2mailconfig || mongoose.model('crm2mailconfig', new mongoose.Schema({ colid: Number, name: String, provider: String, username: String, secret: String, smtpHost: String, smtpPort: Number, pop3Host: String, pop3Port: Number, imapHost: String, imapPort: Number, active: { type: Boolean, default: true } }, { timestamps: true }));
const candidateSchema = new mongoose.Schema({ colid: Number, configid: mongoose.Schema.Types.ObjectId, messageid: String, name: String, email: String, phone: String, subject: String, body: String, sentat: Date, receivedat: Date, status: { type: String, default: 'Pending' }, reviewedby: String, reviewedat: Date, deletedat: Date, deletedby: String }, { timestamps: true });
candidateSchema.index({ colid: 1, configid: 1, messageid: 1 }, { unique: true });
const Candidate = mongoose.models.crm2mailcandidate || mongoose.model('crm2mailcandidate', candidateSchema);
const esc = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wrap = fn => async (req, res) => {
  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const identity = jwt.verify(token, process.env.JWT_SECRET);
    req.actor = await User.findOne({ colid: Number(identity.colid), email: new RegExp(`^${esc(identity.user)}$`, 'i'), role: { $not: /^Student$/i } }).select('name email role colid').lean();
    if (!req.actor) return res.status(403).json({ message: 'Staff login required' });
    req.colid = req.actor.colid;
    await fn(req, res);
  } catch (err) { res.status(400).json({ message: err.message }); }
};
function encrypt(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(process.env.MAIL_CREDENTIAL_SECRET || process.env.JWT_SECRET).digest(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(v => v.toString('hex')).join(':');
}
function decrypt(value) {
  const [iv, tag, data] = value.split(':').map(v => Buffer.from(v, 'hex'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(process.env.MAIL_CREDENTIAL_SECRET || process.env.JWT_SECRET).digest(), iv);
  cipher.setAuthTag(tag); return Buffer.concat([cipher.update(data), cipher.final()]).toString();
}
router.get('/history', wrap(async (req, res) => {
  const query = { colid: req.colid };
  if (/^counsel+or$/i.test(req.actor.role) && !req.query.leadid) query.leadid = { $in: await Lead.distinct('_id', { colid: req.colid, counselloremail: new RegExp(`^${esc(req.actor.email)}$`, 'i') }) };
  if (req.query.leadid) {
    const lead = await Lead.findOne({ _id: req.query.leadid, colid: req.colid }).lean();
    if (!lead) throw new Error('Lead not found');
    if (/^counsel+or$/i.test(req.actor.role) && emailKey(lead.counselloremail) !== emailKey(req.actor.email)) throw new Error('Lead not assigned to you');
    query.leadid = lead._id;
  }
  res.json({ data: await History.find(query).sort({ createdAt: -1, order: -1 }).limit(2000).lean() });
}));
router.get('/config', wrap(async (req, res) => res.json({ data: await Config.find({ colid: req.colid }).select('-secret').sort({ name: 1 }).lean() })));
router.post('/config', wrap(async (req, res) => {
  const body = req.body;
  if (!body.name?.trim() || !body.username?.trim()) throw new Error('Name and mailbox username required');
  const data = { colid: req.colid };
  for (const key of ['name','provider','username','smtpHost','pop3Host','imapHost']) data[key] = String(body[key] || '').trim();
  for (const key of ['smtpPort','pop3Port','imapPort']) { data[key] = Number(body[key] || (key === 'smtpPort' ? 465 : key === 'pop3Port' ? 995 : 993)); if (!Number.isInteger(data[key]) || data[key] < 1 || data[key] > 65535) throw new Error('Invalid port'); }
  data.active = body.active !== false;
  if (body.password) data.secret = encrypt(String(body.password));
  if (!body._id && !data.secret) throw new Error('Mailbox password/app password required');
  const saved = body._id ? await Config.findOneAndUpdate({ _id: body._id, colid: req.colid }, { $set: data }, { new: true }) : await Config.create(data);
  if (!saved) throw new Error('Configuration not found');
  res.json({ success: true });
}));
router.post('/config/delete', wrap(async (req, res) => { await Config.deleteMany({ colid: req.colid, _id: { $in: req.body.ids || [] } }); res.json({ success: true }); }));
const candidateStatuses = new Map([['fresh', 'Pending'], ['accepted', { $in: ['Lead created', 'Duplicate recorded'] }], ['rejected', 'Rejected']]);
function selectedCandidateIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) throw new Error('Select 1 to 1000 valid intake records');
  return [...new Set(ids)];
}
router.get('/candidates', wrap(async (req, res) => {
  const query = { colid: req.colid, deletedat: null };
  const range = mailRange(req.query);
  if (Object.keys(range).length) Object.assign(query, storedMailRange(range));
  if (req.query.bucket) {
    query.status = candidateStatuses.get(req.query.bucket);
    if (!query.status) throw new Error('Invalid review tab');
  }
  if (req.query.bucket === 'fresh') {
    const ids = String(req.query.ids || '').split(',').filter(Boolean);
    if (ids.length > 100 || ids.some(id => !/^[a-f\d]{24}$/i.test(id))) throw new Error('Invalid scan results');
    query._id = { $in: ids };
  }
  res.json({ data: await Candidate.find(query).sort({ createdAt: -1 }).limit(1000).lean() });
}));
router.post('/candidates/delete', wrap(async (req, res) => {
  const ids = selectedCandidateIds(req.body.ids), status = candidateStatuses.get(req.body.bucket);
  if (!status) throw new Error('Select a valid review tab');
  // Keep the mailbox identity so a rescan cannot re-import a deleted intake record.
  const result = await Candidate.updateMany({ colid: req.colid, _id: { $in: ids }, status, deletedat: null }, { $set: { deletedat: new Date(), deletedby: req.actor.email } });
  res.json({ deleted: result.modifiedCount });
}));
router.post('/scan', wrap(async (req, res) => {
  const config = await Config.findOne({ _id: req.body.configid, colid: req.colid, active: true }).lean();
  if (!config?.imapHost) throw new Error('Select an active configuration with IMAP server details. POP3 settings are stored; intake uses IMAP.');
  require('../utils/crm2MailCriteria').validateMailCriteria(req.body);
  const range = mailRange(req.body), ranged = Object.keys(range).length > 0;
  // Prevent mailbox configuration from becoming a proxy to private network services.
  const addresses = await require('dns').promises.resolve4(config.imapHost);
  if (!addresses.length || addresses.some(address => /^(127\.|10\.|169\.254\.|192\.168\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address))) throw new Error('Use a public IPv4 mail server');
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');
  const client = new ImapFlow({ host: addresses[0], tls: { servername: config.imapHost }, port: config.imapPort || 993, secure: true, auth: { user: config.username, pass: decrypt(config.secret) }, logger: false, connectionTimeout: 15000, socketTimeout: 30000 });
  let scanned = 0, matched = 0;
  const messageids = [];
  try {
    await client.connect(); await client.mailboxOpen('INBOX', { readOnly: true });
    const count = client.mailbox.exists;
    const uids = ranged && count ? await client.search(mailboxSearch(range), { uid: true }) : null;
    const selection = ranged ? (uids || []) : count ? `${Math.max(1, count - 99)}:*` : '';
    if (selection.length) for await (const msg of client.fetch(selection, { uid: true, source: true, internalDate: true }, { uid: ranged })) {
      if (!inMailRange(msg.internalDate, range)) continue;
      scanned++;
      if (msg.source.length > 5 * 1024 * 1024) continue;
      const mail = await simpleParser(msg.source), body = String(mail.text || '').slice(0, 30000), subject = String(mail.subject || '');
      if (!require('../utils/crm2MailCriteria').matchesMailCriteria(subject, body, req.body)) continue;
      const sender = mail.from?.value?.[0]; if (!sender?.address) continue;
      const messageid = `${client.mailbox.uidValidity}:${msg.uid}`;
      const phone = require('../utils/crm2MailCriteria').extractMailPhone(subject, body);
      await Candidate.updateOne({ colid: req.colid, configid: config._id, messageid }, { $setOnInsert: { name: sender.name || sender.address.split('@')[0], email: emailKey(sender.address), phone: phone.trim(), subject, body, status: 'Pending' } }, { upsert: true });
      const candidate = { colid: req.colid, configid: config._id, messageid, deletedat: null };
      if (msg.internalDate && Number.isFinite(+new Date(msg.internalDate))) await Candidate.updateOne({ ...candidate, receivedat: null }, { $set: { receivedat: msg.internalDate } });
      if (mail.date instanceof Date && Number.isFinite(mail.date.getTime())) await Candidate.updateOne({ ...candidate, sentat: null }, { $set: { sentat: mail.date } });
      if (phone) await Candidate.updateOne({ ...candidate, status: 'Pending', phone: { $in: ['', null] } }, { $set: { phone } });
      messageids.push(messageid);
      matched++;
    }
  } finally { await client.logout().catch(() => {}); }
  if (req.body.includeFresh === true) {
    const freshIds = await Candidate.distinct('_id', { colid: req.colid, configid: config._id, messageid: { $in: messageids }, status: 'Pending', deletedat: null });
    return res.json({ scanned, matched, freshIds, message: `Checked ${scanned} emails; ${freshIds.length} ready for review.` });
  }
  res.json({ scanned, matched, message: `Checked ${scanned} emails; ${matched} matched. Review before approving.` });
}));
router.post('/review', wrap(async (req, res) => {
  const results = [];
  const statusBefore = req.body.bucket === 'rejected' && req.body.approve === true ? 'Rejected' : 'Pending';
  for (const id of selectedCandidateIds(req.body.ids)) {
    const row = await Candidate.findOneAndUpdate({ _id: id, colid: req.colid, status: statusBefore, deletedat: null }, { $set: { status: 'Processing' } }, { new: true }).lean();
    if (!row) continue;
    try {
      let status = 'Rejected';
      if (req.body.approve === true) {
        const or = [{ emailkey: emailKey(row.email) }, { email: new RegExp(`^${esc(row.email)}$`, 'i') }];
        if (phoneKey(row.phone)) or.push({ phonekey: phoneKey(row.phone) });
        const leads = await Lead.find({ colid: req.colid, $or: or }).lean();
        if (leads.length) { for (const lead of leads) await recordDuplicate(lead, row, req.actor, 'Email import'); status = 'Duplicate recorded'; }
        else {
          const { saveLead } = require('./crm2ctlrds');
          const creationMode = ['fresh', 'rejected'].includes(req.body.bucket) ? 'Email agent' : undefined;
          await saveLead({ name: row.name, email: row.email, phone: row.phone, user: req.actor.email, inputsource: 'Email import', counsellorname: req.actor.name, counselloremail: req.actor.email }, req.colid, '', null, {}, { creationMode });
          status = 'Lead created';
        }
      }
      await Candidate.updateOne({ _id: row._id, colid: req.colid }, { $set: { status, reviewedby: req.actor.email, reviewedat: new Date() } }); results.push({ id, status });
    } catch (err) { await Candidate.updateOne({ _id: row._id, colid: req.colid }, { $set: { status: statusBefore } }); results.push({ id, error: err.message }); }
  }
  res.json({ results });
}));
router.post('/candidate', wrap(async (req, res) => {
  const status = req.body.bucket === 'rejected' ? 'Rejected' : 'Pending';
  const result = await Candidate.updateOne({ _id: req.body.id, colid: req.colid, status, deletedat: null }, { $set: { name: String(req.body.name || '').trim(), phone: String(req.body.phone || '').trim() } });
  if (!result.matchedCount) throw new Error('Intake record no longer available. Refresh and try again.');
  res.json({ success: true });
}));
router.post('/lead', wrap(async (req, res) => {
  const saved = await require('./crm2ctlrds').saveLead({ ...req.body, id: undefined, user: req.actor.email, inputsource: 'API' }, req.colid);
  res.json({ success: true, id: saved._id });
}));
module.exports = router;
module.exports.smtpCredentials = async (colid, id) => {
  const config = await Config.findOne({ colid, _id: id, active: true }).lean();
  if (!config?.smtpHost || !config.secret) throw new Error('Active SMTP configuration not found');
  return { host: config.smtpHost, port: config.smtpPort || 465, username: config.username, password: decrypt(config.secret) };
};
