const https = require('https');
const jwt = require('jsonwebtoken');
const User = require('../Models/user');
const GoogleRegistrationLink = require('../Models/googleregistrationlinkds');
const authenticator = require('./authenticatorctlrds');

const clean = (value) => String(value ?? '').trim();
const normEmail = (value) => clean(value).toLowerCase();

const verifyGoogleCredential = (credential) => new Promise((resolve, reject) => {
  const token = encodeURIComponent(clean(credential));
  if (!token) return reject(new Error('Google credential is required'));
  https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`, (response) => {
    let raw = '';
    response.on('data', (chunk) => { raw += chunk; });
    response.on('end', () => {
      try {
        const data = JSON.parse(raw || '{}');
        if (response.statusCode !== 200) return reject(new Error(data.error_description || data.error || 'Google token verification failed'));
        if (data.email_verified !== true && data.email_verified !== 'true') return reject(new Error('Google email is not verified'));
        const configuredClientId = clean(process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID);
        if (configuredClientId && data.aud !== configuredClientId) return reject(new Error('Google token audience does not match configured client id'));
        return resolve(data);
      } catch (err) {
        return reject(err);
      }
    });
  }).on('error', reject);
});

const tokenForUser = (user) => jwt.sign(
  { user: user.email, colid: String([user.colid]) },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
);

const loginResponse = (user) => ({
  status: 'Success',
  colid: user.colid,
  name: user.name,
  user: user.email,
  email: user.email,
  googleemail: user.googleemail,
  regno: user.regno,
  role: user.role,
  semester: user.semester,
  programcode: user.programcode,
  section: user.section,
  lastlogin: user.lastlogin,
  category: user.category,
  department: user.department,
  designation: user.designation,
  statuslog: user.status,
  token: tokenForUser(user),
  twofa: authenticator.statusForUser(user)
});

exports.login = async (req, res) => {
  try {
    const verified = await verifyGoogleCredential(req.body.credential);
    const googleemail = normEmail(verified.email);
    const user = await User.findOne({
      status: 1,
      $or: [
        { googleemail: new RegExp(`^${googleemail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        { email: new RegExp(`^${googleemail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      ]
    });
    if (!user) return res.status(404).json({ status: 'Not found', message: 'No active user is mapped to this Google email' });
    if (!clean(user.googleemail)) {
      user.googleemail = googleemail;
      await user.save();
    }
    res.json(loginResponse(user));
  } catch (err) {
    res.status(401).json({ status: 'Error', message: err.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const search = clean(req.query.search);
    const query = { colid };
    if (search) query.$or = ['name', 'email', 'googleemail', 'role', 'department', 'designation'].map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
    const data = await User.find(query).select('name email googleemail role department designation regno status colid authenticator authenticatordate authenticatorsetupdate').sort({ name: 1 }).limit(500).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateGoogleEmail = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const id = clean(req.body.id);
    const googleemail = normEmail(req.body.googleemail);
    if (!colid || !id) return res.status(400).json({ success: false, message: 'User and colid are required' });
    if (googleemail) {
      const duplicate = await User.findOne({ _id: { $ne: id }, colid, googleemail: new RegExp(`^${googleemail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
      if (duplicate) return res.status(400).json({ success: false, message: 'Google email already mapped to another user' });
    }
    const data = await User.findOneAndUpdate({ _id: id, colid }, { $set: { googleemail } }, { new: true }).select('name email googleemail role department designation regno status colid');
    if (!data) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createRegistrationLink = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const role = clean(req.body.role);
    if (!colid || !role) return res.status(400).json({ success: false, message: 'Role and colid are required' });
    const payload = {
      colid,
      role,
      department: clean(req.body.department),
      designation: clean(req.body.designation),
      createdby: clean(req.body.user),
      createdname: clean(req.body.name)
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: req.body.expiresIn || '365d' });
    const frontendBase = clean(req.body.frontendBase) || 'https://campustechnology.me';
    const url = `${frontendBase.replace(/\/+$/, '')}/google-role-registration/${encodeURIComponent(token)}`;
    const data = await GoogleRegistrationLink.create({ ...payload, token, url, status: clean(req.body.status) || 'Active' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listRegistrationLinks = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const data = await GoogleRegistrationLink.find({ colid }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.registrationConfig = async (req, res) => {
  try {
    const token = clean(req.query.token);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const stored = await GoogleRegistrationLink.findOne({ token, status: /^Active$/i }).lean();
    if (!stored) return res.status(404).json({ success: false, message: 'Registration link is inactive or not found' });
    res.json({ success: true, data: { colid: decoded.colid, role: decoded.role, department: decoded.department, designation: decoded.designation } });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Invalid or expired registration link' });
  }
};

exports.registerWithGoogle = async (req, res) => {
  try {
    const token = clean(req.body.token);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const stored = await GoogleRegistrationLink.findOne({ token, status: /^Active$/i }).lean();
    if (!stored) return res.status(404).json({ success: false, message: 'Registration link is inactive or not found' });
    const verified = await verifyGoogleCredential(req.body.credential);
    const googleemail = normEmail(verified.email);
    let user = await User.findOne({ colid: Number(decoded.colid), $or: [{ googleemail }, { email: googleemail }] });
    if (!user) {
      user = await User.create({
        name: clean(verified.name) || googleemail,
        email: googleemail,
        googleemail,
        phone: clean(req.body.phone) || 'NA',
        password: Math.random().toString(36).slice(2, 12),
        role: clean(decoded.role),
        regno: `USER-${Date.now()}`,
        programcode: 'NA',
        admissionyear: String(new Date().getFullYear()),
        academicyear: clean(req.body.academicyear) || '',
        semester: 'NA',
        section: 'NA',
        department: clean(decoded.department) || 'NA',
        designation: clean(decoded.designation),
        colid: Number(decoded.colid),
        authenticator: /^student$/i.test(clean(decoded.role)) ? 'No' : 'Yes',
        status: 1,
        lastlogin: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000))
      });
    } else {
      user.googleemail = googleemail;
      user.role = user.role || clean(decoded.role);
      user.department = user.department || clean(decoded.department) || 'NA';
      user.designation = user.designation || clean(decoded.designation);
      await user.save();
    }
    res.json(loginResponse(user));
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
