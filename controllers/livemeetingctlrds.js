const crypto = require('crypto');
const nodemailer = require('nodemailer');
const LiveMeeting = require('../Models/livemeetingds');
const User = require('../Models/user');
const EmailConfiguration = require('../Models/emailconfigurationds');

const text = (value) => String(value || '').trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validEmail = (value) => /\S+@\S+\.\S+/.test(text(value));

const normalizeParticipants = (participants) => {
  const seen = new Set();
  return (Array.isArray(participants) ? participants : [])
    .map((item) => ({
      name: text(item.name),
      email: text(item.email || item.user).toLowerCase(),
      role: text(item.role),
      department: text(item.department)
    }))
    .filter((item) => {
      if (!item.email || seen.has(item.email)) return false;
      seen.add(item.email);
      return true;
    });
};

const parseExternalEmails = (value) => {
  const source = Array.isArray(value) ? value.join(',') : text(value);
  const seen = new Set();
  return source
    .split(',')
    .map((email) => text(email).toLowerCase())
    .filter((email) => {
      if (!validEmail(email) || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
};

const originFrom = (req, body = {}) => text(body.origin) || `${req.protocol}://${req.get('host')}`;
const buildLinks = (req, meeting) => {
  const origin = originFrom(req, req.body || {});
  const roomPath = text(req.body?.roomPath || req.body?.roompath) || '/live-meeting-room';
  const cleanRoomPath = roomPath.startsWith('/') ? roomPath : `/${roomPath}`;
  const meetingLink = `${origin}${cleanRoomPath}?meetingid=${meeting._id}`;
  const externalMeetingLink = `${origin}${cleanRoomPath}?meetingid=${meeting._id}&external=Yes&token=${encodeURIComponent(meeting.publicJoinToken)}`;
  return { meetingLink, externalMeetingLink };
};

const smtpHost = (config = {}) => {
  if (config.smtp) return config.smtp;
  if (config.smptp) return config.smptp;
  if (/gmail/i.test(config.provider || '')) return 'smtp.gmail.com';
  return '';
};

const transporterFor = (config) => {
  const port = Number(config.port) || 587;
  return nodemailer.createTransport({
    host: smtpHost(config),
    port,
    secure: ['yes', 'true'].includes(String(config.secure || '').toLowerCase()) || port === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const loadEmailConfig = async (colid) => {
  const query = { colid, isactive: /^Yes$/i };
  return await EmailConfiguration.findOne({ ...query, default: /^Yes$/i }).lean()
    || await EmailConfiguration.findOne(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
};

const sendExternalInvites = async ({ colid, meeting, senderName }) => {
  const emails = meeting.externalParticipantEmails || [];
  if (!emails.length) return { sent: 0 };
  const config = await loadEmailConfig(colid);
  if (!config?.username || !config?.password || !smtpHost(config)) {
    throw new Error('Default active email configuration is missing or incomplete');
  }
  const transporter = transporterFor(config);
  await transporter.sendMail({
    from: `"${senderName || meeting.hostName || 'Institution'}" <${config.username}>`,
    to: emails.join(','),
    subject: `Meeting invitation: ${meeting.title || 'Live meeting'}`,
    text: `${meeting.description || ''}\n\nJoin meeting: ${meeting.externalMeetingLink}`,
    html: `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55">
      <h2>${text(meeting.title) || 'Live meeting'}</h2>
      <p>${text(meeting.description) || ''}</p>
      <p><b>Time:</b> ${meeting.startDateTime ? new Date(meeting.startDateTime).toLocaleString() : ''} - ${meeting.endDateTime ? new Date(meeting.endDateTime).toLocaleString() : ''}</p>
      <p><a href="${meeting.externalMeetingLink}">Join the live meeting</a></p>
      <p>External participants will wait in the lobby until the host allows entry.</p>
    </div>`
  });
  return { sent: emails.length };
};

exports.searchUsers = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    const q = text(req.query.q);
    const filter = { colid };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { department: { $regex: q, $options: 'i' } }
      ];
    }
    const users = await User.find(filter).select('name email role department phone').sort({ name: 1 }).limit(100).lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getMeetings = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    const filter = { colid };
    const start = toDate(req.query.start);
    const end = toDate(req.query.end);
    if (start || end) {
      filter.startDateTime = {};
      if (start) filter.startDateTime.$gte = start;
      if (end) filter.startDateTime.$lte = end;
    }
    const email = text(req.query.email || req.query.user).toLowerCase();
    if (String(req.query.my || '').toLowerCase() === 'yes' && email) {
      filter.$or = [
        { hostEmail: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } },
        { internalParticipantEmails: email },
        { externalParticipantEmails: email }
      ];
    }
    const meetings = await LiveMeeting.find(filter).sort({ startDateTime: 1 }).lean();
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getMeeting = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const id = text(req.query.id || req.query.meetingid);
    const token = text(req.query.token);
    const filter = { _id: id };
    if (colid !== undefined) filter.colid = colid;
    const meeting = await LiveMeeting.findOne(filter).lean();
    if (!meeting) return res.status(404).json({ msg: 'Meeting not found' });
    if (String(req.query.external || '').toLowerCase() === 'yes' && token !== meeting.publicJoinToken) {
      return res.status(403).json({ msg: 'Invalid external meeting link' });
    }
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.saveMeeting = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = number(body.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    const startDateTime = toDate(body.startDateTime);
    const endDateTime = toDate(body.endDateTime);
    if (!startDateTime || !endDateTime) return res.status(400).json({ msg: 'Valid start and end date time are required' });
    if (endDateTime <= startDateTime) return res.status(400).json({ msg: 'End time should be after start time' });

    const internalParticipants = normalizeParticipants(body.internalParticipants || body.participants);
    const externalEmails = parseExternalEmails(body.externalEmails || body.externalParticipantEmails);
    const payload = {
      colid,
      hostName: text(body.hostName),
      hostEmail: text(body.hostEmail).toLowerCase(),
      title: text(body.title || body.topic),
      description: text(body.description),
      startDateTime,
      endDateTime,
      internalParticipants,
      internalParticipantEmails: internalParticipants.map((item) => item.email),
      externalParticipants: externalEmails.map((email) => ({ email, status: 'Invited' })),
      externalParticipantEmails: externalEmails,
      status: text(body.status) || 'Scheduled',
      createdBy: text(body.createdBy || body.user),
      publicJoinToken: text(body.publicJoinToken) || crypto.randomBytes(18).toString('hex')
    };
    if (!payload.hostName) return res.status(400).json({ msg: 'Host name is required' });
    if (!payload.hostEmail) return res.status(400).json({ msg: 'Host email is required' });
    if (!payload.title) return res.status(400).json({ msg: 'Title is required' });

    let saved;
    if (body.id) {
      saved = await LiveMeeting.findOneAndUpdate({ _id: body.id, colid }, payload, { new: true, runValidators: true });
      if (!saved) return res.status(404).json({ msg: 'Meeting not found' });
    } else {
      saved = await LiveMeeting.create(payload);
    }
    const links = buildLinks(req, saved);
    saved = await LiveMeeting.findOneAndUpdate({ _id: saved._id, colid }, links, { new: true }).lean();

    let emailResult = null;
    if (body.sendExternalEmail === true || String(body.sendExternalEmail).toLowerCase() === 'yes') {
      emailResult = await sendExternalInvites({ colid, meeting: saved, senderName: body.senderName || body.createdBy });
    }
    res.json({ ...saved, emailResult });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteMeeting = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    const deleted = await LiveMeeting.findOneAndDelete({ _id: req.body.id, colid });
    if (!deleted) return res.status(404).json({ msg: 'Meeting not found' });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
