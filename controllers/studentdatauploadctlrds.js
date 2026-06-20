const path = require('path');
const multer = require('multer');
const AWS = require('aws-sdk');
const User = require('../Models/user');
const Awsconfig = require('../Models/awsconfig');
const UserCustomField = require('../Models/usercustomfieldds');
const AiConfiguration = require('../Models/aiconfigurationds');

const fields = [
  'name',
  'regno',
  'email',
  'phone',
  'program',
  'programcode',
  'regulation',
  'Major',
  'Minor',
  'AEC',
  'SEC',
  'VAC',
  'IDC',
  'MDC',
  'major',
  'minor',
  'academicyear',
  'admissionyear',
  'rollno',
  'gender',
  'category',
  'state',
  'city',
  'district',
  'pincode',
  'guardianname',
  'guardianmobile',
  'guardianemail',
  'photo',
  'semester',
  'section'
];

const clean = (value) => String(value ?? '').trim();
const colidFilter = (colid) => ({ colid: Number(colid), role: 'Student' });
const upload = multer({ storage: multer.memoryStorage() });
const geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

const encodeS3Key = (key) => String(key || '').split('/').map(encodeURIComponent).join('/');
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === 'us-east-1') return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const valueFromBody = (body, field) => {
  const aliases = {
    major: ['major', 'Major'],
    minor: ['minor', 'Minor'],
    Major: ['Major', 'major'],
    Minor: ['Minor', 'minor'],
    MDC: ['MDC', 'mdc', 'mdcsub'],
    mdc: ['mdc', 'MDC', 'mdcsub'],
    mdcsub: ['mdcsub', 'MDC', 'mdc']
  };
  const keys = aliases[field] || [field];
  for (const key of keys) {
    if (body[key] !== undefined) return body[key];
  }
  return '';
};

const normalizeCustomFields = (body = {}) => {
  const custom = {};
  if (body.customFields && typeof body.customFields === 'object') Object.assign(custom, body.customFields);
  if (body.customfields && typeof body.customfields === 'object') Object.assign(custom, body.customfields);
  return custom;
};

const buildPayload = (body = {}) => {
  const customFields = normalizeCustomFields(body);
  return {
    name: clean(body.name) || 'NA',
    regno: clean(body.regno) || 'NA',
    email: clean(body.email),
    phone: clean(body.phone) || 'NA',
    program: clean(body.program) || 'NA',
    programcode: clean(body.programcode) || 'NA',
    regulation: clean(body.regulation) || 'NA',
    Major: clean(valueFromBody(body, 'Major')) || 'NA',
    Minor: clean(valueFromBody(body, 'Minor')) || 'NA',
    AEC: clean(body.AEC || body.aec) || 'NA',
    SEC: clean(body.SEC || body.sec) || 'NA',
    VAC: clean(body.VAC || body.vac) || 'NA',
    IDC: clean(body.IDC || body.idc) || 'NA',
    MDC: clean(valueFromBody(body, 'MDC')) || 'NA',
    mdcsub: clean(valueFromBody(body, 'MDC')) || 'NA',
    academicyear: clean(body.academicyear) || 'NA',
    admissionyear: clean(body.admissionyear || body.academicyear) || 'NA',
    rollno: clean(body.rollno) || 'NA',
    gender: clean(body.gender) || 'Not specified',
    category: clean(body.category) || 'General',
    state: clean(body.state) || 'NA',
    city: clean(body.city) || 'NA',
    district: clean(body.district) || 'NA',
    pincode: clean(body.pincode) || 'NA',
    guardianname: clean(body.guardianname) || 'NA',
    guardianmobile: clean(body.guardianmobile) || 'NA',
    guardianemail: clean(body.guardianemail) || 'NA',
    photo: clean(body.photo),
    semester: clean(body.semester) || 'NA',
    section: clean(body.section) || 'NA',
    password: 'NA',
    role: 'Student',
    department: 'NA',
    status: 1,
    colid: Number(body.colid),
    user: clean(body.user),
    addedby: clean(body.user),
    institution: clean(body.institution),
    customFields,
    lastlogin: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000))
  };
};

const serialize = (row) => {
  const data = row.toObject ? row.toObject() : row;
  const customFields = data.customFields instanceof Map ? Object.fromEntries(data.customFields) : (data.customFields || {});
  return {
    ...data,
    customFields,
    major: data.Major || '',
    minor: data.Minor || '',
    aec: data.AEC || '',
    sec: data.SEC || '',
    vac: data.VAC || '',
    idc: data.IDC || '',
    mdc: data.MDC || data.mdcsub || '',
    mdcsub: data.mdcsub || data.MDC || ''
  };
};

const getDefaultGeminiConfig = async (colid) => AiConfiguration.findOne({
  colid,
  type: /^Gemini$/i,
  active: /^Yes$/i,
  default: /^Yes$/i
}).lean();

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim() || ''
);

const parseGeminiValue = (value) => {
  const raw = clean(value).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.value !== undefined) return clean(parsed.value);
  } catch {
    // Gemini may return plain text; use it as the value.
  }
  return raw;
};

const callGeminiValue = async (apikey, prompt) => {
  let lastError = '';
  for (const model of geminiModels) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apikey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    });
    const data = await response.json();
    if (response.ok) return parseGeminiValue(readGeminiText(data));
    lastError = data.error?.message || `Gemini failed for ${model}`;
  }
  throw new Error(lastError || 'Gemini request failed');
};

exports.uploadPhotoMiddleware = upload.single('photo');

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'Select a photo to upload' });
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });

    const extension = path.extname(req.file.originalname || '').toLowerCase();
    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png'].includes(req.file.mimetype);
    const allowedExtension = ['.jpg', '.jpeg', '.png'].includes(extension);
    if (!allowedMime || !allowedExtension) {
      return res.status(400).json({ msg: 'Photo must be a JPG, JPEG, or PNG file' });
    }

    const config = await Awsconfig.findOne({
      colid,
      type: /^aws$/i,
      default: /^yes$/i
    }).lean();
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ msg: 'Default AWS configuration is missing or incomplete' });
    }

    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, '_');
    const key = `${colid}/student-photos/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({
      accessKeyId: config.username,
      secretAccessKey: config.password,
      region: config.region
    });

    await s3.putObject({
      Bucket: config.bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }).promise();

    res.json({
      filename: cleanName,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bucket: config.bucket,
      region: config.region,
      key,
      url: s3Url(config.bucket, config.region, key)
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    const data = await User.find(colidFilter(colid)).sort({ name: 1, regno: 1 }).lean();
    res.json(data.map(serialize));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    if (!payload.colid) return res.status(400).json({ msg: 'colid is required' });
    if (!payload.email) return res.status(400).json({ msg: 'Email is required' });
    const data = await User.create(payload);
    res.json(serialize(data));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    if (!payload.colid) return res.status(400).json({ msg: 'colid is required' });
    if (!req.body.id) return res.status(400).json({ msg: 'id is required' });
    if (!payload.email) return res.status(400).json({ msg: 'Email is required' });

    const duplicate = await User.findOne({ _id: { $ne: req.body.id }, email: payload.email });
    if (duplicate) return res.status(400).json({ msg: 'Duplicate email is not allowed' });

    const data = await User.findOneAndUpdate(
      { _id: req.body.id, ...colidFilter(payload.colid) },
      payload,
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ msg: 'Student not found' });
    res.json(serialize(data));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!req.body.id) return res.status(400).json({ msg: 'id is required' });
    const data = await User.findOneAndDelete({ _id: req.body.id, ...colidFilter(colid) });
    if (!data) return res.status(404).json({ msg: 'Student not found' });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkDeleteStudents = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!ids.length) return res.status(400).json({ msg: 'Select at least one student to delete' });
    const data = await User.deleteMany({ _id: { $in: ids }, ...colidFilter(colid) });
    res.json({ msg: 'Deleted', deleted: data.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkStudents = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!items.length) return res.status(400).json({ msg: 'No rows received' });

    const errors = [];
    let saved = 0;

    for (let index = 0; index < items.length; index += 1) {
      const rowNumber = items[index].rowNumber || index + 2;
      const payload = buildPayload({
        ...items[index],
        colid,
        user: req.body.user || items[index].user,
        institution: req.body.institution || items[index].institution
      });
      if (!payload.email) {
        errors.push({ rowNumber, msg: 'Email is required' });
        continue;
      }

      try {
        await User.findOneAndUpdate(
          { email: payload.email },
          payload,
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );
        saved += 1;
      } catch (err) {
        errors.push({ rowNumber, msg: err.message });
      }
    }

    res.json({ saved, errors });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkUpdateSubject = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const field = clean(req.body.field);
    const oldValue = clean(req.body.oldValue);
    const newValue = clean(req.body.newValue);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!['Major', 'Minor'].includes(field)) return res.status(400).json({ msg: 'Field must be Major or Minor' });
    if (!oldValue) return res.status(400).json({ msg: `Select old ${field}` });
    if (!newValue) return res.status(400).json({ msg: `Enter new ${field}` });

    const result = await User.updateMany(
      { ...colidFilter(colid), [field]: oldValue },
      { $set: { [field]: newValue } }
    );
    res.json({ msg: `${field} updated`, matched: result.matchedCount || 0, modified: result.modifiedCount || 0 });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkUpdateSelectedSubjects = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const update = {};
    const major = clean(req.body.Major);
    const minor = clean(req.body.Minor);
    const idc = clean(req.body.IDC);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!ids.length) return res.status(400).json({ msg: 'Select at least one student' });
    if (major) {
      update.Major = major;
      update.major = major;
    }
    if (minor) {
      update.Minor = minor;
      update.minor = minor;
    }
    if (idc) {
      update.IDC = idc;
      update.idc = idc;
    }
    if (!Object.keys(update).length) return res.status(400).json({ msg: 'Enter Major, Minor or IDC to update' });

    const result = await User.updateMany(
      { _id: { $in: ids }, ...colidFilter(colid) },
      { $set: update }
    );
    res.json({ msg: 'Selected students updated', matched: result.matchedCount || 0, modified: result.modifiedCount || 0 });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.generateFieldWithAi = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const field = clean(req.body.field);
    const label = clean(req.body.label || field);
    const rule = clean(req.body.rule);
    const rowData = req.body.rowData && typeof req.body.rowData === 'object' ? req.body.rowData : {};
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!field) return res.status(400).json({ msg: 'Field is required' });
    if (!rule) return res.status(400).json({ msg: 'Rule is required' });

    const config = await getDefaultGeminiConfig(colid);
    if (!config?.apikey) return res.status(400).json({ msg: 'Default active Gemini configuration is missing' });

    const prompt = [
      'You generate exactly one student data field value for an ERP upload form.',
      'Use only the provided row data and the rule. Do not invent unrelated details.',
      'Return only valid JSON in this shape: {"value":"generated value"}.',
      `Target field key: ${field}`,
      `Target field label: ${label}`,
      `Rule: ${rule}`,
      `Row data JSON: ${JSON.stringify(rowData)}`
    ].join('\n');
    const value = await callGeminiValue(config.apikey, prompt);
    res.json({ success: true, field, value });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.fields = fields;
