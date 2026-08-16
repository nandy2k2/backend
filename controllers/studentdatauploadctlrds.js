const path = require('path');
const multer = require('multer');
const AWS = require('aws-sdk');
const mongoose = require('mongoose');
const User = require('../Models/user');
const Awsconfig = require('../Models/awsconfig');
const UserCustomField = require('../Models/usercustomfieldds');
const AiConfiguration = require('../Models/aiconfigurationds');
const OllamaConfiguration = require('../Models/ollamaconfigurationds');

const fields = [
  'name',
  'regno',
  'scholarnumber',
  'abcid',
  'password',
  'email',
  'googleemail',
  'excluded',
  'phone',
  'program',
  'programcode',
  'Mediumofinstruction',
  'regulation',
  'specialization1',
  'specialization2',
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
const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

const randomPassword = (length = 10) => {
  const size = Math.max(6, Math.min(32, Number(length) || 10));
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%&*'
  ];
  const allChars = groups.join('');
  const chars = groups.map((group) => group[Math.floor(Math.random() * group.length)]);
  for (let index = chars.length; index < size; index += 1) {
    chars.push(allChars[Math.floor(Math.random() * allChars.length)]);
  }
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join('');
};

const randomRegno = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const generateRegnoValue = (payload, mode = 'random') => {
  if (clean(mode) === 'academicYearMongo') {
    return `${clean(payload.academicyear) || 'NA'}/${new mongoose.Types.ObjectId().toString()}`;
  }
  return randomRegno();
};

const addGeneratedRegno = async (payload, mode = 'random', excludeId = '') => {
  if (clean(payload.regno)) return payload;
  const selectedMode = clean(mode) || 'random';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const regno = generateRegnoValue(payload, selectedMode);
    const query = { colid: Number(payload.colid), role: 'Student', regno };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await User.exists(query);
    if (!exists) {
      payload.regno = regno;
      return payload;
    }
  }
  payload.regno = generateRegnoValue(payload, selectedMode);
  return payload;
};

const scholarYearCode = (academicYear) => {
  const value = clean(academicYear);
  const match = value.match(/^(\d{2,4})\D+(\d{2,4})$/);
  if (match) return `${match[1].slice(-2)}${match[2].slice(-2)}`;
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 8) return `${digits.slice(2, 4)}${digits.slice(6, 8)}`;
  if (digits.length === 6) return `${digits.slice(2, 4)}${digits.slice(4, 6)}`;
  if (digits.length >= 4) return digits.slice(-4);
  return digits.padEnd(4, '0') || '0000';
};

const scholarPrefix = (payload) => `${scholarYearCode(payload.academicyear)}${clean(payload.programcode).replace(/\s+/g, '') || 'NA'}`;

const addDefaultScholarNumber = async (payload, excludeId = '') => {
  if (clean(payload.scholarnumber)) return payload;
  const prefix = scholarPrefix(payload);
  const query = {
    colid: Number(payload.colid),
    role: 'Student',
    scholarnumber: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{4}$`)
  };
  if (excludeId) query._id = { $ne: excludeId };
  const count = await User.countDocuments(query);
  payload.scholarnumber = `${prefix}${String(count + 1).padStart(4, '0')}`;
  return payload;
};

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
    Mediumofinstruction: ['Mediumofinstruction', 'mediumofinstruction', 'medium of instruction'],
    specialization1: ['specialization1', 'specialization 1', 'specialisation1', 'specialisation 1'],
    specialization2: ['specialization2', 'specialization 2', 'specialisation2', 'specialisation 2'],
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
    regno: clean(body.autogenerateregno) === 'Yes' ? '' : (clean(body.regno) || 'NA'),
    scholarnumber: clean(body.autogeneratescholarnumber) === 'Yes' ? '' : clean(body.scholarnumber),
    abcid: clean(body.abcid) || 'NA',
    password: clean(body.password) || 'NA',
    email: clean(body.email),
    googleemail: clean(body.googleemail),
    excluded: /^yes$/i.test(clean(body.excluded)) ? 'Yes' : 'No',
    phone: clean(body.phone) || 'NA',
    program: clean(body.program) || 'NA',
    programcode: clean(body.programcode) || 'NA',
    Mediumofinstruction: clean(valueFromBody(body, 'Mediumofinstruction')) || 'NA',
    regulation: clean(body.regulation) || 'NA',
    specialization1: clean(valueFromBody(body, 'specialization1')) || '',
    specialization2: clean(valueFromBody(body, 'specialization2')) || '',
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
}).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({
    colid,
    type: /^Gemini$/i,
    active: /^Yes$/i
  }).sort({ _id: -1 }).lean();

const getOllamaConfig = async (colid, configId) => {
  const baseQuery = {
    colid: Number(colid),
    active: /^Yes$/i
  };
  if (clean(configId)) {
    const selected = await OllamaConfiguration.findOne({ ...baseQuery, _id: configId }).lean();
    if (selected) return selected;
  }
  return OllamaConfiguration.findOne({ ...baseQuery, default: /^Yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne(baseQuery).sort({ _id: -1 }).lean();
};

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

const callGeminiValue = async (apikey, prompt, selectedModel) => {
  let lastError = '';
  const preferredModel = clean(selectedModel);
  const models = preferredModel
    ? [preferredModel, ...geminiModels.filter((model) => model !== preferredModel)]
    : geminiModels;
  for (const model of models) {
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

const callOllamaValue = async (config, prompt) => {
  const server = clean(config.serveraddress || 'http://localhost:11434').replace(/\/+$/, '');
  const model = clean(config.modelname);
  if (!server) throw new Error('Ollama server address is missing');
  if (!model) throw new Error('Ollama model name is missing');

  const response = await fetch(`${server}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.2 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ollama request failed at ${server}`);
  return parseGeminiValue(data.response || '');
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
    await addGeneratedRegno(payload, req.body.regnogenerationmode);
    await addDefaultScholarNumber(payload);
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
    await addGeneratedRegno(payload, req.body.regnogenerationmode, req.body.id);
    await addDefaultScholarNumber(payload, req.body.id);

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
      const row = { ...items[index] };
      if (clean(req.body.generateRandomPassword) === 'Yes') {
        row.password = randomPassword(req.body.passwordLength);
      }
      const payload = buildPayload({
        ...row,
        colid,
        user: req.body.user || row.user,
        institution: req.body.institution || row.institution
      });
      if (!payload.email) {
        errors.push({ rowNumber, msg: 'Email is required' });
        continue;
      }
      await addGeneratedRegno(payload, row.regnogenerationmode || req.body.regnogenerationmode);
      await addDefaultScholarNumber(payload);

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

exports.updateStudentSpecialization = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const id = clean(req.body.id);
    const target = clean(req.body.target);
    const specialization = clean(req.body.specialization);
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!id) return res.status(400).json({ msg: 'Student is required' });
    if (!['specialization1', 'specialization2'].includes(target)) return res.status(400).json({ msg: 'Select Specialization 1 or Specialization 2' });
    if (!specialization) return res.status(400).json({ msg: 'Select specialization' });
    const data = await User.findOneAndUpdate(
      { _id: id, ...colidFilter(colid) },
      { $set: { [target]: specialization } },
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ msg: 'Student not found' });
    res.json(serialize(data));
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
    const provider = clean(req.body.provider || 'Gemini');
    const rowData = req.body.rowData && typeof req.body.rowData === 'object' ? req.body.rowData : {};
    if (!colid) return res.status(400).json({ msg: 'colid is required' });
    if (!field) return res.status(400).json({ msg: 'Field is required' });
    if (!rule) return res.status(400).json({ msg: 'Rule is required' });

    const prompt = [
      'You generate exactly one student data field value for an ERP upload form.',
      'Use only the provided row data and the rule. Do not invent unrelated details.',
      'Return only valid JSON in this shape: {"value":"generated value"}.',
      `Target field key: ${field}`,
      `Target field label: ${label}`,
      `Rule: ${rule}`,
      `Row data JSON: ${JSON.stringify(rowData)}`
    ].join('\n');

    let value = '';
    if (provider.toLowerCase() === 'ollama') {
      const ollamaConfig = await getOllamaConfig(colid, req.body.ollamaConfigId);
      if (!ollamaConfig) return res.status(400).json({ msg: 'Active Ollama configuration is missing' });
      value = await callOllamaValue(ollamaConfig, prompt);
    } else {
      const config = await getDefaultGeminiConfig(colid);
      if (!config?.apikey) return res.status(400).json({ msg: 'Default active Gemini configuration is missing' });
      value = await callGeminiValue(config.apikey, prompt, req.body.geminiModel);
    }
    res.json({ success: true, field, value });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.fields = fields;
