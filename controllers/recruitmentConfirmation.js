const router = require('express').Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../Models/user');
const Menu = require('../Models/menuaccessds');
const Candidate = require('../Models/recruitmentapplicationds');
const Job = require('../Models/recruitmentjobpostds');
const Template = require('../Models/recruitmentoffertemplateds');
const Structure = require('../Models/hrstructure');
const Component = require('../Models/hrstructuresal');
const Salary = require('../Models/hrsalstructure');
const Email = require('../Models/emailconfigurationds');
const Institution = require('../Models/academicmasterinstitutionds');
const Department = require('../Models/academicmasterdepartmentds');
const Designation = require('../Models/academicdesignationds');
const ping = require('./pingwhatsappsendctlrds');
const Letter = mongoose.model('recruitmentconfirmationoffer', new mongoose.Schema({
  colid: Number, candidate: mongoose.Schema.Types.ObjectId, template: mongoose.Schema.Types.ObjectId,
  joiningdate: String, content: String
}, { timestamps: true }));
const text = value => typeof value === 'string' ? value.trim() : '';
const exact = value => new RegExp('^' + text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
const wrap = fn => async (req, res) => {
  try {
    let identity;
    try { identity = jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET); }
    catch { return res.status(401).json({ message: 'Sign in to continue' }); }
    const colid = Number(identity.colid);
    if (!(colid > 0) || !text(identity.user)) return res.sendStatus(401);
    const actor = await User.findOne({ colid, email: exact(identity.user) }).select('role email name').lean();
    if (!actor || /^(student|agent|publisher|telecaller)$/i.test(actor.role) || !/^All$/i.test(actor.role) && !await Menu.exists({ colid, role: actor.role, path: '/recruitment-confirmation-wizard', access: 'Allow' })) return res.sendStatus(403);
    await fn(req, res, colid, actor);
  } catch (err) { res.status(err.status || (err.code === 11000 ? 409 : 400)).json({ message: err.code === 11000 ? 'An account with that email already exists. Change the account email or cancel.' : err.message }); }
};
const candidate = async (colid, id) => {
  const row = await Candidate.findOne({ colid, _id: id }).select('applicantname email phone applicationno jobid customfields photourl confirmationuserid').lean();
  if (!row) throw Error('Candidate not found');
  return row;
};
const employee = async (colid, row) => {
  const user = row.confirmationuserid && await User.findOne({ colid, _id: row.confirmationuserid }).select('name email designation department institution').lean();
  if (!user) throw Error('Create the candidate account first');
  return user;
};
function pingCall(action, colid, body = {}) {
  return new Promise((resolve, reject) => {
    let status = 200;
    Promise.resolve(action({ user: { colid }, body }, { status(value) { status = value; return this; }, json(data) { status >= 400 ? reject(Error(data.error || 'Ping request failed')) : resolve(data); } })).catch(reject);
  });
}
router.get('/options', wrap(async (req, res, colid) => {
  const [jobs, roles, menuRoles, institutions, departments, designations, structures, templates, emails, whatsapp] = await Promise.all([
    Job.find({ colid }).select('jobid title').lean(), User.distinct('role', { colid }), Menu.distinct('role', { colid }),
    Institution.distinct('institution', { colid, status: 'Active' }), Department.find({ colid, status: 'Active' }).select('institution department').lean(),
    Designation.distinct('designation', { colid, status: 'Active' }), Structure.find({ colid }).select('struture').lean(),
    Template.find({ colid, status: 'Active' }).select('templatename').lean(), Email.find({ colid, isactive: /^yes$/i }).select('username provider').lean(), pingCall(ping.options, colid)
  ]);
  res.json({ jobs, roles: [...new Set([...roles, ...menuRoles])].filter(role => role && !/^(all|student)$/i.test(role)).sort(), institutions, departments, designations, structures, templates, emails, whatsapp });
}));
router.get('/candidates', wrap(async (req, res, colid) => {
  res.json(await Candidate.find({ colid, jobid: text(req.query.jobid) }).select('applicantname applicationno email status confirmationuserid').sort({ applicantname: 1 }).lean());
}));
router.post('/accounts', wrap(async (req, res, colid, actor) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw Error('Select 1 to 100 candidates');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const input of rows) {
        const row = await Candidate.findOne({ colid, jobid: text(req.body.jobid), _id: input.id }).session(session);
        if (!row) throw Error('Candidate does not belong to the selected job');
        if (row.confirmationuserid) continue;
        const role = text(input.role), designation = text(input.designation), department = text(input.department), institution = text(input.institution), password = text(input.password);
        if (!role || /^(all|student)$/i.test(role) || /^crmadmin$/i.test(role) && !/^All$/i.test(actor.role) || password.length < 8) throw Error('Select a permitted role and enter a password of at least eight characters for each candidate');
        if (!await User.exists({ colid, role }).session(session) && !await Menu.exists({ colid, role }).session(session)) throw Error('Select a configured role');
        if (!await Institution.exists({ colid, institution, status: 'Active' }).session(session) || !await Department.exists({ colid, institution, department, status: 'Active' }).session(session) || !await Designation.exists({ colid, designation, status: 'Active' }).session(session)) throw Error('Select valid institution, department and designation');
        const email = text(input.email ?? row.email).toLowerCase();
        if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw Error('Enter a valid account email for ' + row.applicantname);
        if (await User.exists({ email: exact(email) }).session(session)) throw Object.assign(new Error('Account already exists for ' + row.applicantname + ' (' + email + '). Change the account email or cancel.'), { status: 409 });
        const [user] = await User.create([{ colid, email, name: row.applicantname, phone: row.phone || 'NA', password, role, designation, department, institution, status: 1, regno: email, programcode: 'NA', admissionyear: 'NA', semester: 'NA', section: 'NA', user: actor.email, addedby: actor.email, photo: row.photourl, lastlogin: new Date(Date.now() + 365 * 86400000) }], { session });
        row.confirmationuserid = user._id;
        row.status = 'Onboarding';
        await row.save({ session });
      }
    });
  } finally { await session.endSession(); }
  res.json({ success: true });
}));
router.get('/salary/:id', wrap(async (req, res, colid) => {
  const user = await employee(colid, await candidate(colid, req.params.id));
  res.json(await Salary.find({ colid, empid: user.email, level: 'Active' }).select('component amount type structure').lean());
}));
router.post('/salary/:id', wrap(async (req, res, colid, actor) => {
  const user = await employee(colid, await candidate(colid, req.params.id));
  const structure = req.body.structureid && await Structure.findOne({ colid, _id: req.body.structureid }).lean();
  if (req.body.structureid && !structure) throw Error('Salary structure not found');
  const rows = structure ? await Component.find({ colid, stuctureid: String(structure._id) }).lean() : req.body.components;
  if (!Array.isArray(rows) || !rows.length || rows.length > 100 || rows.some(row => !text(row.component) || row.amount === '' || row.amount == null || !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0 || !text(row.type))) throw Error('Enter valid salary components and amounts');
  const docs = rows.map(row => ({ colid, name: actor.name || actor.email, user: actor.email, empid: user.email, employee: user.name, structure: structure?.struture || 'Recruitment manual', structureid: structure ? String(structure._id) : '', component: text(row.component), amount: Number(row.amount), type: text(row.type), level: 'Active', status1: row.status1 || 'Active', effectivedate: new Date(), applieddate: new Date() }));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Salary.updateMany({ colid, empid: user.email, level: { $ne: 'Archived' } }, { $set: { level: 'Archived' } }, { session });
      await Salary.insertMany(docs, { session });
    });
  } finally { await session.endSession(); }
  res.json({ success: true });
}));
router.get('/offers/:id', wrap(async (req, res, colid) => {
  await candidate(colid, req.params.id);
  res.json(await Letter.find({ colid, candidate: req.params.id }).sort({ createdAt: -1 }).lean());
}));
router.post('/offers/:id', wrap(async (req, res, colid) => {
  const row = await candidate(colid, req.params.id), user = await employee(colid, row);
  const joiningdate = text(req.body.joiningdate);
  const date = new Date(joiningdate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningdate) || !Number.isFinite(+date) || date.toISOString().slice(0,10) !== joiningdate) throw Error('Select a valid joining date');
  const template = await Template.findOne({ colid, _id: req.body.template, status: 'Active' }).lean();
  if (!template) throw Error('Select an active offer template');
  let content = text(req.body.content);
  if (!content && !req.body.letterid) {
    const salary = await Salary.find({ colid, empid: user.email, level: 'Active' }).select('component amount').lean();
    const job = await Job.findOne({ colid, jobid: row.jobid }).select('title').lean();
    const values = { ...row.customfields, name: row.applicantname, email: row.email, phone: row.phone, designation: user.designation, department: user.department, institutionname: user.institution, joiningdate, salary: salary.map(item => `${item.component}: ${item.amount}`).join(', '), offerid: `OFFER-${row.applicationno || row._id}`, today: new Date().toISOString().slice(0,10), jobtitle: job?.title, jobid: row.jobid };
    content = require('html-to-text').convert(template.htmlcontent || '').replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (match, key) => Object.hasOwn(values, key.toLowerCase()) ? String(values[key.toLowerCase()] ?? '') : '');
    if (!/\{\{\s*joiningdate\s*\}\}/i.test(template.htmlcontent || '')) content += '\n\nJoining date: ' + joiningdate;
  }
  if (!content || content.length > 30000) throw Error('Enter offer content up to 30,000 characters');
  const values = { template: template._id, joiningdate, content };
  const saved = req.body.letterid ? await Letter.findOneAndUpdate({ colid, candidate: row._id, _id: req.body.letterid }, values, { new: true }) : await Letter.create({ colid, candidate: row._id, ...values });
  if (!saved) throw Error('Offer not found');
  res.json(saved);
}));
router.delete('/letters/:id', wrap(async (req, res, colid) => {
  await Letter.deleteOne({ colid, _id: req.params.id });
  res.json({ success: true });
}));
router.post('/letters/:id/send', wrap(async (req, res, colid, actor) => {
  const letter = await Letter.findOne({ colid, _id: req.params.id }).lean();
  if (!letter) throw Error('Offer not found');
  const row = await candidate(colid, letter.candidate);
  if (req.body.mode === 'whatsapp') {
    const phone = String(row.phone || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(phone)) throw Error('Candidate phone number is invalid');
    const result = await pingCall(ping.sendDirect, colid, { configid: req.body.configid, templateid: req.body.templateid, language: text(req.body.language) || 'en', values: req.body.values, mobileNumbers: phone, user: actor.email });
    if (!result.sent) throw Error(result.unknown ? 'Ping did not confirm the send. Check provider logs before retrying.' : result.recipients?.[0]?.error || 'Message not sent');
    return res.json({ message: 'WhatsApp message accepted by Ping' });
  }
  if (req.body.mode !== 'email' || !text(req.body.subject) || !text(req.body.body)) throw Error('Enter the email subject and body');
  const config = await Email.findOne({ colid, _id: req.body.configid, isactive: /^yes$/i }).lean();
  if (!config?.username || !config.password || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(row.email || '')) throw Error('Active email configuration and valid candidate email are required');
  const host = config.smtp || config.smptp || (/gmail/i.test(config.provider) ? 'smtp.gmail.com' : '');
  if (!host) throw Error('SMTP host is missing');
  const addresses = await require('node:dns').promises.resolve4(host);
  const blocked = new (require('node:net').BlockList)();
  for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['224.0.0.0',3]]) blocked.addSubnet(address, prefix);
  if (!addresses.length || addresses.some(address => blocked.check(address))) throw Error('Use a public SMTP server');
  const port = Number(config.port) || 587, secure = port === 465 || /^(yes|true)$/i.test(config.secure);
  const transport = require('nodemailer').createTransport({ host: addresses[0], tls: { servername: host }, port, secure, requireTLS: !secure, auth: { user: config.username, pass: config.password }, connectionTimeout: 12000, socketTimeout: 20000 });
  const pdf = await new Promise((resolve, reject) => {
    const document = new (require('pdfkit'))({ margin: 54 }), chunks = [];
    document.on('data', chunk => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject);
    document.fontSize(11).text(letter.content); document.end();
  });
  const sent = await transport.sendMail({ from: config.username, to: row.email, subject: text(req.body.subject), text: text(req.body.body), attachments: [{ filename: 'offer-letter.pdf', content: pdf }] });
  if (!sent.accepted?.length) throw Error('SMTP did not accept the message');
  res.json({ message: 'Offer email accepted by SMTP' });
}));
module.exports = router;
