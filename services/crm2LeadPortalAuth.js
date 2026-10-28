const { randomBytes, scrypt, createHash, timingSafeEqual } = require('node:crypto');
const derive = require('node:util').promisify(scrypt);
const { Lead } = require('../Models/crm2ds');
const Session = require('../Models/crm2leadportalsessionds');
const digest = value => createHash('sha256').update(String(value)).digest('hex');
const active = lead => lead && lead.active !== 'No' && lead.isdisabled !== 'Yes';
async function verify(password, stored) {
  if (typeof password !== 'string' || !password || password.length > 1024 || !stored) return false;
  if (stored.startsWith('scrypt:')) {
    const [, salt, hash] = stored.split(':');
    if (!/^[a-f0-9]{32}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(hash || '')) return false;
    return timingSafeEqual(await derive(password, salt, 64), Buffer.from(hash, 'hex'));
  }
  return timingSafeEqual(Buffer.from(digest(password), 'hex'), Buffer.from(digest(stored), 'hex'));
}
async function login(email, password, colid) {
  const query = { emailkey: String(email || '').trim().toLowerCase() };
  if (!query.emailkey || !password) throw new Error('Enter email and password');
  if (colid) {
    if (!Number.isFinite(Number(colid)) || Number(colid) <= 0) throw new Error('Invalid institution ID');
    query.colid = Number(colid);
  }
  const candidates = await Lead.find(query).select('+password').limit(20).lean();
  const matches = [];
  for (const lead of candidates) if (active(lead) && await verify(password, lead.password)) matches.push(lead);
  if (!matches.length) throw new Error('Invalid credentials or lead account is inactive');
  if (matches.length > 1) throw new Error('Enter your institution ID to select your lead account');
  const lead = matches[0], token = randomBytes(32).toString('hex');
  await Session.create({ tokenhash: digest(token), leadid: lead._id, colid: lead.colid, credentialhash: digest(lead.password), expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) });
  return { token, leadid: lead._id, colid: lead.colid };
}
async function authenticate(req, res, next) {
  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Please log in to the lead portal');
    const session = await Session.findOne({ tokenhash: digest(token), expiresAt: { $gt: new Date() } }).lean();
    if (!session) throw new Error('Your lead session has expired. Please log in again');
    const lead = await Lead.findOne({ _id: session.leadid, colid: session.colid }).select('+password').lean();
    if (!active(lead) || digest(lead.password) !== session.credentialhash) throw new Error('Your lead session has expired. Please log in again');
    req.portalLead = lead; req.portalSession = session;
    next();
  } catch (error) { res.status(401).json({ success: false, message: error.message }); }
}
module.exports = { login, authenticate, verify, digest };
