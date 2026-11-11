const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { createHmac } = require('node:crypto');
const Program = require('../Models/mprograms');
const User = require('../Models/user');
const Menu = require('../Models/menuaccessds');
const Level = require('../Models/crm2campusqueuelevel');
const { Lead } = require('../Models/crm2ds');
const { Counter, Booking, Token, Sequence } = require('../Models/crm2campusqueue');
const displayKey = () => createHmac('sha256', process.env.JWT_SECRET).update('crm2-queue-display').digest();

const text = value => typeof value === 'string' ? value.trim() : '';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const staff = colid => ({ colid, role: { $exists: true, $nin: [/^(Student|Agent|Publisher)$/i, '', null] }, email: { $type: 'string', $ne: '' } });
const wrap = (handler, path = '/crm2-campus-queue-management') => async (req, res) => {
  try {
    let identity;
    try { identity = jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET); }
    catch { return res.status(401).json({ message: 'Sign in to continue' }); }
    const colid = Number(identity.colid), email = text(identity.user).toLowerCase();
    if (!Number.isFinite(colid) || colid <= 0 || !email) return res.status(401).json({ message: 'Sign in to continue' });
    const actor = await User.findOne({ colid, email: new RegExp(`^${escape(email)}$`, 'i') }).select('role').lean();
    const role = text(actor?.role);
    if (!role || /^(Student|Agent|Publisher)$/i.test(role) || path && !/^(All|crmadmin)$/i.test(role) && !await Menu.exists({ colid, role: actor.role, path, access: 'Allow' })) return res.status(403).json({ message: 'Campus queue access is not available for this role' });
    await handler(req, res, { colid, email, userid: actor._id });
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 400).json({ message: err.code === 11000 ? (req.path === '/levels' ? 'This level already exists for the selected program' : 'This counter, booking, or token already exists for the selection') : err.message });
  }
};

router.get('/programs', wrap(async (req, res, { colid }) => {
  const search = new RegExp(escape(text(req.query.search).slice(0, 100)), 'i');
  const data = await Program.aggregate([
    { $match: { colid, program: { $type: 'string', $ne: '' }, programcode: { $type: 'string', $ne: '' } } },
    { $sort: { year: -1, _id: -1 } },
    { $group: { _id: '$programcode', program: { $first: '$program' } } },
    { $match: { $or: [{ program: search }, { _id: search }] } },
    { $sort: { program: 1, _id: 1 } }, { $limit: 100 },
    { $project: { _id: 0, programcode: '$_id', program: 1 } }
  ]);
  res.json({ data });
}, null));
router.get('/counsellors', wrap(async (req, res, { colid }) => {
  const search = new RegExp(escape(text(req.query.search).slice(0, 100)), 'i');
  const data = await User.find({ ...staff(colid), $or: [{ name: search }, { email: search }] }).select('name email').sort({ name: 1, _id: 1 }).limit(100).lean();
  res.json({ data });
}));
router.get('/levels', wrap(async (req, res, { colid }) => {
  const programcode = text(req.query.programcode);
  res.json({ data: await Level.find({ colid, ...(programcode ? { programcode } : {}) }).sort({ program: 1, programcode: 1, level: 1 }).lean() });
}));
router.post('/levels', wrap(async (req, res, { colid, email }) => {
  const { id, active } = req.body, programcode = text(req.body.programcode), title = text(req.body.title), description = text(req.body.description);
  const raw = req.body.level;
  const level = typeof raw === 'number' || /^\d+$/.test(text(raw)) ? Number(raw) : NaN;
  if (id && !validId(id) || !programcode || !Number.isSafeInteger(level) || level < 1 || !title || title.length > 150 || description.length > 2000 || !['Yes', 'No'].includes(active)) throw Error('Select a program, positive whole-number level, title and active status');
  const program = await Program.findOne({ colid, programcode }).select('program programcode').sort({ year: -1, _id: -1 }).lean();
  if (!program?.program) throw Error('Select a program from this institution');
  const values = { program: program.program, programcode: program.programcode, level, title, description, active, updatedby: email };
  if (id) {
    const current = await Level.findOne({ colid, _id: id }).lean();
    if (!current) throw Error('Hierarchy level not found');
    if ((current.programcode !== programcode || current.level !== level || active === 'No') && await Token.exists({ colid, levelid: id, status: { $in: ['Waiting', 'Serving'] } })) throw Error('Finish the tokens at this level before moving or deactivating it');
  }
  await Level.init();
  const data = id ? await Level.findOneAndUpdate({ _id: id, colid }, { $set: values }, { new: true, runValidators: true }).lean() : await Level.create({ ...values, colid });
  if (!data) throw Error('Hierarchy level not found');
  res.json({ data });
}));
router.post('/levels/:id/counsellor', wrap(async (req, res, { colid, email }) => {
  const id = req.params.id, userid = req.body.userid;
  if (!validId(id) || userid !== null && !validId(userid)) throw Error('Select a level and a valid counsellor');
  const person = userid === null ? null : await User.findOne({ ...staff(colid), _id: userid }).select('name email').lean();
  if (userid !== null && (!person || !text(person.email))) throw Error('Select a staff user from this institution');
  if (await Token.exists({ colid, levelid: id, status: 'Serving', claimedby: { $ne: person?._id || null } })) throw Error('Finish the token in service before changing the counsellor');
  const data = await Level.findOneAndUpdate({ _id: id, colid }, { $set: { campuscounselorid: person?._id || null, campuscounselor: person?.name || '', campuscounseloremail: text(person?.email), updatedby: email } }, { new: true, runValidators: true }).lean();
  if (!data) throw Error('Hierarchy level not found');
  res.json({ data });
}));
const counterPage = '/crm2-queue-counter-master', tokenPage = '/crm2-campus-queue', displayPage = '/crm2-campus-queue-display';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function queueDay(value) {
  if (!value) return today();
  const date = new Date(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw Error('Select a valid queue date');
  return value;
}
const levelFields = row => ({ levelid: row._id, level: row.level, title: row.title });
async function ownLevel(colid, userid, id) {
  if (!validId(id)) throw Error('Select a queue level');
  const row = await Level.findOne({ colid, _id: id, campuscounselorid: userid, active: 'Yes' }).lean();
  if (!row) throw Error('This active level is not assigned to you');
  return row;
}
router.get('/counter-master', wrap(async (req, res, { colid }) => {
  const [levels, counters] = await Promise.all([Level.find({ colid }).sort({ program: 1, level: 1 }).lean(), Counter.find({ colid }).sort({ number: 1 }).lean()]);
  res.json({ levels, counters });
}, counterPage));
router.post('/counter-master', wrap(async (req, res, { colid }) => {
  const { id, levelid, active } = req.body, number = text(req.body.number);
  if (!validId(levelid) || id && !validId(id) || !number || number.length > 30 || !['Yes', 'No'].includes(active)) throw Error('Select a level, counter number and active status');
  if (!await Level.exists({ colid, _id: levelid })) throw Error('Level not found');
  await Counter.init();
  const data = id ? await Counter.findOneAndUpdate({ colid, _id: id, levelid }, { $set: { number, active } }, { new: true }).lean() : await Counter.create({ colid, levelid, number, active });
  if (!data) throw Error('Counter not found for this level');
  res.json({ data });
}, counterPage));
router.get('/my-levels', wrap(async (req, res, { colid, userid }) => {
  res.json({ day: today(), data: await Level.find({ colid, campuscounselorid: userid, active: 'Yes' }).sort({ program: 1, level: 1 }).lean() });
}, null));
router.get('/counter-options', wrap(async (req, res, { colid, userid }) => {
  const level = await ownLevel(colid, userid, req.query.levelid), day = queueDay(req.query.day);
  const [booking, data] = await Promise.all([
    Booking.findOne({ colid, levelid: level._id, day, userid }).lean(),
    Counter.find({ colid, levelid: level._id, active: 'Yes' }).sort({ number: 1 }).lean()
  ]);
  const savedCounter = booking && await Counter.findOne({ colid, levelid: level._id, _id: booking.counterid }).select('number active').lean();
  res.json({ data, current: booking?.counterid || null, savedCounter: savedCounter || null });
}, null));
router.get('/counter-admin', wrap(async (req, res, { colid }) => {
  const day = queueDay(req.query.day);
  const bookings = await Booking.find({ colid, day }).lean();
  const [levels, counters, users] = await Promise.all([
    Level.find({ colid, _id: { $in: bookings.map(row => row.levelid) } }).select('program programcode level title').lean(),
    Counter.find({ colid, _id: { $in: bookings.map(row => row.counterid) } }).select('number').lean(),
    User.find({ colid, _id: { $in: bookings.map(row => row.userid) } }).select('name email').lean()
  ]);
  const index = rows => new Map(rows.map(row => [String(row._id), row]));
  const byLevel = index(levels), byCounter = index(counters), byUser = index(users);
  const data = bookings.map(row => {
    const level = byLevel.get(String(row.levelid)), user = byUser.get(String(row.userid));
    return { _id: row._id, day, program: level?.program, programcode: level?.programcode, level: level?.level, title: level?.title, counter: byCounter.get(String(row.counterid))?.number, user: user?.name, email: user?.email };
  }).sort((a, b) => (a.program || '').localeCompare(b.program || '') || (a.level || 0) - (b.level || 0) || (a.counter || '').localeCompare(b.counter || '', undefined, { numeric: true }));
  res.json({ day, data });
}, '/crm2-queue-counter-admin'));
router.post('/book-counter', wrap(async (req, res, { colid, userid }) => {
  const level = await ownLevel(colid, userid, req.body.levelid), day = queueDay(req.body.day);
  if (day < today() || !validId(req.body.counterid)) throw Error('Select an available counter for today or a future date');
  const counter = await Counter.findOne({ colid, levelid: level._id, _id: req.body.counterid, active: 'Yes' }).lean();
  if (!counter) throw Error('Counter is not active for this level');
  if (await Token.exists({ colid, levelid: level._id, day, claimedby: userid, status: 'Serving', counter: { $ne: counter.number } })) throw Error('Complete your token before changing counters');
  await Booking.init();
  // Each level has one counsellor. Reassignment replaces that level's daily booking.
  await Booking.updateOne({ colid, levelid: level._id, day }, { $set: { userid, counterid: counter._id } }, { upsert: true });
  res.json({ message: 'Counter saved' });
}, null));
router.get('/leads', wrap(async (req, res, { colid }) => {
  const search = new RegExp(escape(text(req.query.search).slice(0, 100)), 'i');
  res.json({ data: await Lead.find({ colid, active: { $ne: 'No' }, $or: [{ name: search }, { email: search }, { phone: search }] }).select('name email').sort({ name: 1 }).limit(100).lean() });
}, tokenPage));
router.post('/tokens', wrap(async (req, res, { colid }) => {
  const programcode = text(req.body.programcode), leadid = req.body.leadid, day = today();
  if (!programcode || !validId(leadid)) throw Error('Select a program and lead');
  const [level, lead] = await Promise.all([Level.findOne({ colid, programcode, level: 1, active: 'Yes' }).lean(), Lead.findOne({ colid, _id: leadid, active: { $ne: 'No' } }).select('name').lean()]);
  if (!lead || !level?.campuscounselorid) throw Error('An active lead and an assigned active Level 1 counsellor are required');
  await Token.init();
  const scope = { colid, programcode, day };
  const existing = await Token.findOne({ ...scope, leadid }).lean();
  if (existing) return res.json({ data: existing, existing: true });
  const sequence = await Sequence.findOneAndUpdate({ _id: JSON.stringify([colid, programcode, day]) }, { $inc: { value: 1 } }, { upsert: true, new: true });
  try {
    const data = await Token.create({ ...scope, ...levelFields(level), program: level.program, number: sequence.value, leadid, lead: lead.name, status: 'Waiting', claimedby: null, counter: '' });
    res.json({ data });
  } catch (err) {
    const duplicate = err.code === 11000 && await Token.findOne({ ...scope, leadid }).lean();
    if (!duplicate) throw err;
    res.json({ data: duplicate, existing: true });
  }
}, tokenPage));
router.get('/my-queue', wrap(async (req, res, { colid, userid }) => {
  const level = await ownLevel(colid, userid, req.query.levelid), day = queueDay(req.query.day);
  res.json({ data: await Token.find({ colid, day, levelid: level._id, $or: [{ status: 'Waiting' }, { status: 'Serving', claimedby: userid }] }).sort({ number: 1 }).lean() });
}, null));
router.post('/tokens/:id/:action', wrap(async (req, res, { colid, userid }) => {
  const { id, action } = req.params;
  if (!validId(id) || !['claim', 'complete'].includes(action)) throw Error('Invalid token action');
  const token = await Token.findOne({ colid, _id: id }).lean();
  if (!token) throw Error('Token not found');
  const level = await ownLevel(colid, userid, String(token.levelid));
  if (action === 'claim') {
    const booking = await Booking.findOne({ colid, userid, levelid: level._id, day: token.day }).lean();
    const counter = booking && await Counter.findOne({ colid, _id: booking.counterid, levelid: level._id, active: 'Yes' }).lean();
    if (!counter) throw Error('Select an active counter for the token date first');
    const updated = await Token.updateOne({ colid, _id: id, levelid: level._id, status: 'Waiting' }, { $set: { status: 'Serving', claimedby: userid, counter: counter.number } });
    if (!updated.matchedCount) throw Error('Token was already claimed or moved');
    return res.json({ message: 'Token assigned to you' });
  }
  const next = await Level.findOne({ colid, programcode: token.programcode, active: 'Yes', level: { $gt: token.level } }).sort({ level: 1 }).lean();
  const updated = await Token.updateOne({ colid, _id: id, levelid: level._id, status: 'Serving', claimedby: userid }, { $set: next ? { ...levelFields(next), status: 'Waiting', claimedby: null, counter: '' } : { status: 'Completed' } });
  if (!updated.matchedCount) throw Error('Only the current claimant can complete this token');
  res.json({ message: next ? `Token sent to Level ${next.level}` : 'Token completed' });
}, null));
router.post('/display-link', wrap(async (req, res, { colid }) => {
  const programcode = text(req.body.programcode);
  if (!programcode || !await Level.exists({ colid, programcode })) throw Error('Select a program with a queue hierarchy');
  const permission = jwt.sign({ purpose: 'crm2-queue-display', colid, programcode }, displayKey(), { expiresIn: '30d', algorithm: 'HS256' });
  res.json({ permission, colid, programcode });
}, displayPage));
router.get('/public-display', async (req, res) => {
  try {
    const grant = jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i, ''), displayKey(), { algorithms: ['HS256'] });
    if (grant.purpose !== 'crm2-queue-display' || String(grant.colid) !== req.query.colid || grant.programcode !== req.query.programcode) return res.status(403).json({ message: 'Invalid display permission' });
    const scope = { colid: grant.colid, programcode: grant.programcode };
    const [level, data] = await Promise.all([Level.findOne(scope).select('program -_id').lean(), Token.find({ ...scope, day: today(), status: { $in: ['Waiting', 'Serving'] } }).select('number level title counter status -_id').sort({ level: 1, number: 1 }).limit(500).lean()]);
    res.set('Cache-Control', 'no-store').json({ program: level?.program || grant.programcode, data });
  } catch (err) {
    res.status(err.name?.includes('Token') || err.name === 'JsonWebTokenError' ? 403 : 500).json({ message: 'Display could not load. Check the link or generate a new one.' });
  }
});
module.exports = router;
