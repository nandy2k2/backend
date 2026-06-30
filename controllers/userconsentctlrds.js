const ConsentContent = require('../Models/userconsentcontentds');
const ConsentAudit = require('../Models/userconsentauditds');

const clean = (value) => String(value || '').trim();
const number = (value) => Number(value || 0);
const ipAddress = (req) => clean(
  req.headers['x-forwarded-for']?.split(',')?.[0]
  || req.headers['x-real-ip']
  || req.ip
  || req.socket?.remoteAddress
);

const standardContent = (role = 'User') => `I understand that the institution will collect and process my personal data for lawful academic, administrative, financial, examination, LMS, communication, identity verification, compliance, security, and service delivery purposes relevant to my role as ${role}.

The data may include identity details, contact details, academic or employment records, attendance, fees or salary records, documents uploaded by me, system activity records, and other information required for institutional services. The institution may share limited data with authorised processors, statutory bodies, payment gateways, IT service providers, examination partners, auditors, and other parties where required for the stated purposes or by law.

The institution will use reasonable security controls, retain data only as required for institutional, legal, regulatory, audit, and legitimate operational purposes, and process data in line with applicable requirements including India's Digital Personal Data Protection Act, GDPR principles where applicable, and applicable United States privacy requirements where relevant.

I understand that I may request access, correction, grievance redressal, or withdrawal of consent where legally permitted. Withdrawal may affect services that require my data for legal, contractual, academic, employment, or statutory reasons. I confirm that the information I provide is accurate and that I consent to this processing.`;

const currentContent = async (colid, role) => {
  const filter = { colid, role: clean(role) || 'User', status: /^active$/i };
  const exact = await ConsentContent.findOne(filter).lean();
  if (exact) return { ...exact, defaultcontent: false };
  const all = await ConsentContent.findOne({ colid, role: 'All', status: /^active$/i }).lean();
  if (all) return { ...all, defaultcontent: false };
  return {
    role: clean(role) || 'User',
    title: 'Standard data processing consent',
    content: standardContent(role),
    status: 'Active',
    defaultcontent: true
  };
};

exports.getContents = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    const filter = { colid };
    if (clean(req.query.role)) filter.role = new RegExp(clean(req.query.role), 'i');
    const data = await ConsentContent.find(filter).sort({ role: 1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.saveContent = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const role = clean(req.body.role);
    if (!colid || !role) return res.status(400).json({ msg: 'colid and role are required' });
    const payload = {
      colid,
      role,
      title: clean(req.body.title) || 'Data processing consent',
      content: clean(req.body.content),
      status: clean(req.body.status) || 'Active',
      user: clean(req.body.user)
    };
    let saved;
    if (clean(req.body.id)) {
      saved = await ConsentContent.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true });
    } else {
      saved = await ConsentContent.findOneAndUpdate({ colid, role }, payload, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    }
    res.json({ msg: 'Consent content saved', data: saved });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteContent = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = clean(req.body.id);
    if (!colid || !id) return res.status(400).json({ msg: 'colid and id are required' });
    await ConsentContent.deleteOne({ _id: id, colid });
    res.json({ msg: 'Consent content deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkDeleteContents = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!colid || !ids.length) return res.status(400).json({ msg: 'Select consent content rows to delete' });
    const result = await ConsentContent.deleteMany({ colid, _id: { $in: ids } });
    res.json({ msg: 'Deleted', deleted: result.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getConsentContent = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const role = clean(req.query.role) || 'User';
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    res.json(await currentContent(colid, role));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getConsentStatus = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const owneruser = clean(req.query.owneruser);
    if (!colid || !owneruser) return res.status(400).json({ msg: 'colid and owneruser are required' });
    const latest = await ConsentAudit.findOne({ colid, owneruser }).sort({ activitytime: -1 }).lean();
    const hasConsent = !!(latest && latest.action === 'ConsentGiven' && latest.status === 'Active');
    res.json({ hasConsent, latest });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.giveConsent = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const role = clean(req.body.role) || 'User';
    const owneruser = clean(req.body.owneruser);
    if (!colid || !owneruser) return res.status(400).json({ msg: 'colid and user are required' });
    const content = await currentContent(colid, role);
    const audit = await ConsentAudit.create({
      colid,
      role,
      owneruser,
      ownername: clean(req.body.ownername),
      action: 'ConsentGiven',
      status: 'Active',
      contentid: content._id ? String(content._id) : '',
      title: content.title,
      content: content.content,
      actoruser: clean(req.body.actoruser) || owneruser,
      actorname: clean(req.body.actorname) || clean(req.body.ownername),
      ipaddress: ipAddress(req),
      useragent: clean(req.headers['user-agent']),
      activitytime: new Date()
    });
    res.json({ msg: 'Consent recorded', data: audit });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.withdrawConsent = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const role = clean(req.body.role) || 'User';
    const owneruser = clean(req.body.owneruser);
    if (!colid || !owneruser) return res.status(400).json({ msg: 'colid and user are required' });
    const content = await currentContent(colid, role);
    const audit = await ConsentAudit.create({
      colid,
      role,
      owneruser,
      ownername: clean(req.body.ownername),
      action: 'ConsentWithdrawn',
      status: 'Withdrawn',
      contentid: content._id ? String(content._id) : '',
      title: content.title,
      content: content.content,
      comments: clean(req.body.comments),
      actoruser: clean(req.body.actoruser) || owneruser,
      actorname: clean(req.body.actorname) || clean(req.body.ownername),
      ipaddress: ipAddress(req),
      useragent: clean(req.headers['user-agent']),
      activitytime: new Date()
    });
    res.json({ msg: 'Consent withdrawal recorded', data: audit });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getAudits = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    const filter = { colid };
    ['role', 'owneruser', 'ownername', 'action', 'status', 'actoruser', 'actorname'].forEach((field) => {
      if (clean(req.query[field])) filter[field] = new RegExp(clean(req.query[field]), 'i');
    });
    if (clean(req.query.fromdate) || clean(req.query.todate)) {
      filter.activitytime = {};
      if (clean(req.query.fromdate)) filter.activitytime.$gte = new Date(req.query.fromdate);
      if (clean(req.query.todate)) {
        const toDate = new Date(req.query.todate);
        toDate.setHours(23, 59, 59, 999);
        filter.activitytime.$lte = toDate;
      }
    }
    const data = await ConsentAudit.find(filter).sort({ activitytime: -1 }).limit(Number(req.query.limit || 3000)).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getAuditOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const field = clean(req.query.field);
    const allowed = new Set(['role', 'owneruser', 'ownername', 'action', 'status', 'actoruser', 'actorname']);
    if (!colid || !allowed.has(field)) return res.json([]);
    const values = await ConsentAudit.distinct(field, { colid });
    res.json(values.filter((item) => clean(item)).sort());
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkDeleteAudits = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!colid || !ids.length) return res.status(400).json({ msg: 'Select consent audit rows to delete' });
    const result = await ConsentAudit.deleteMany({ colid, _id: { $in: ids } });
    res.json({ msg: 'Deleted', deleted: result.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
