const User = require('../Models/user');
const UserCustomField = require('../Models/usercustomfieldds');
const path = require('path');
const multer = require('multer');
const AWS = require('aws-sdk');
const Awsconfig = require('../Models/awsconfig');

const excludedFilterFields = new Set(['_id', '__v', 'colid', 'user', 'customFields']);
const hiddenFields = new Set([
  '_id', '__v', 'colid', 'user', 'customFields', 'lastlogin', 'photo',
  'dob', 'eligibilityname', 'srno', 'degree', 'samestate', 'admissionapplicationid',
  'minorsub', 'vocationalsub', 'mdcsub', 'othersub', 'merit', 'obtain', 'bonus',
  'weightage', 'ncctype', 'scholarship', 'expotoken', 'quota', 'status1',
  'comments', 'addedby'
]);
const upload = multer({ storage: multer.memoryStorage() });

const cleanValue = (value) => {
  if (value === undefined || value === null) return '';
  return value;
};

const dateAfterDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const hasDemoText = (payload) => {
  const name = String(payload.name || '').toLowerCase();
  const email = String(payload.email || '').toLowerCase();
  return name.includes('demo') || email.includes('demo');
};

const isHiddenSchemaPath = (field) => hiddenFields.has(field) || String(field).startsWith('customFields.');

const baseUserFields = () => Object.keys(User.schema.paths).filter((field) => !isHiddenSchemaPath(field));

const fieldOptions = (field) => {
  if (field === 'gender') return ['Male', 'Female', 'Not specified'];
  if (field === 'category') return ['General', 'SC', 'ST', 'OBC', 'EBC', 'EWS', 'PH'];
  if (field === 'isdisabled') return ['Yes', 'No'];
  if (field === 'role') return ['Faculty', 'Student', 'All', 'Admin'];
  if (field === 'status') return ['1', '0'];
  return [];
};

const numericFields = () => Object.entries(User.schema.paths)
  .filter(([, path]) => path.instance === 'Number')
  .map(([field]) => field);

const normalizeCustomFields = (customFields) => {
  if (!customFields) return {};
  if (customFields instanceof Map) return Object.fromEntries(customFields);
  if (typeof customFields === 'object') return customFields;
  return {};
};

const colidOnlyFilter = (colid) => ({ colid: Number(colid) });

const staffListFields = [
  'name',
  'email',
  'phone',
  'password',
  'role',
  'department',
  'designation',
  'joiningdate',
  'googleemail',
  'institution',
  'gender',
  'state',
  'city',
  'district',
  'pincode',
  'address',
  'pan',
  'photo',
  'skills',
  'status'
];

const studentOnlyFields = new Set([
  'semester', 'admissionyear', 'section', 'regulation', 'program', 'programcode',
  'major', 'minor', 'vac', 'nidc', 'idc', 'aec', 'sec', 'mdc', 'mdcsub',
  'Major', 'Minor', 'VAC', 'IDC', 'AEC', 'SEC', 'MDC', 'minorsub',
  'vocationalsub', 'othersub', 'scholarnumber', 'abcid', 'rollno'
]);

const staffRequiredDefaults = {
  regno: 'NA',
  programcode: 'NA',
  admissionyear: 'NA',
  semester: 'NA',
  section: 'NA',
  status: 1
};

const normalizeStaffStatus = (value) => {
  if (value === undefined || value === null || value === '') return 1;
  if (/^active$/i.test(String(value))) return 1;
  if (/^inactive$/i.test(String(value))) return 0;
  return Number(value || 0);
};

const staffPayload = (row, colid, actor) => {
  const payload = {};
  staffListFields.forEach((field) => {
    if (row[field] !== undefined && !studentOnlyFields.has(field)) {
      payload[field] = field === 'status' ? normalizeStaffStatus(row[field]) : cleanValue(row[field]);
    }
  });

  Object.entries(row || {}).forEach(([field]) => {
    if (studentOnlyFields.has(field)) delete payload[field];
  });

  payload.colid = Number(colid);
  payload.user = actor || row.user || '';
  payload.role = payload.role || 'Faculty';
  payload.status = normalizeStaffStatus(payload.status);
  payload.password = payload.password || 'Password@123';
  payload.phone = payload.phone || 'NA';
  payload.department = payload.department || 'NA';
  payload.name = payload.name || payload.email || '';
  payload.institution = payload.institution || row.institution || '';
  payload.lastlogin = hasDemoText(payload) ? dateAfterDays(3) : dateAfterDays(365);
  Object.entries(staffRequiredDefaults).forEach(([field, value]) => {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') payload[field] = value;
  });
  return payload;
};

const encodeS3Key = (key) => String(key || '').split('/').map(encodeURIComponent).join('/');

const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === 'us-east-1') return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const userPayload = (body, customFieldDefs = []) => {
  const payload = {};
  const numberFields = new Set(numericFields());
  const isNonStudent = /^non/i.test(String(body.usertype || body.userType || body.studenttype || ''));
  const nonStudentNaFields = ['program', 'programcode', 'regulation', 'Major', 'Minor', 'AEC', 'SEC', 'VAC', 'IDC', 'rollno', 'semester', 'section'];

  baseUserFields().forEach((field) => {
    if (body[field] !== undefined) {
      const bodyValue = field === 'status' && /^active$/i.test(String(body[field])) ? 1
        : field === 'status' && /^inactive$/i.test(String(body[field])) ? 0
          : body[field];
      payload[field] = numberFields.has(field) ? Number(bodyValue || 0) : cleanValue(bodyValue);
    }
  });

  if (isNonStudent) {
    nonStudentNaFields.forEach((field) => {
      payload[field] = 'NA';
    });
  }

  payload.colid = Number(body.colid);
  payload.user = body.user || '';
  if (body.photo !== undefined) payload.photo = cleanValue(body.photo);
  payload.lastlogin = hasDemoText(payload) ? dateAfterDays(3) : dateAfterDays(365);

  const customInput = normalizeCustomFields(body.customFields);
  const customValues = {};
  customFieldDefs.forEach((field) => {
    if (customInput[field.fieldname] !== undefined) {
      customValues[field.fieldname] = customInput[field.fieldname];
    } else if (body[field.fieldname] !== undefined) {
      customValues[field.fieldname] = body[field.fieldname];
    }
  });
  payload.customFields = customValues;

  return payload;
};

const serializeUser = (row) => {
  const data = row.toObject ? row.toObject() : row;
  data.customFields = normalizeCustomFields(data.customFields);
  return data;
};

const buildFilter = (colid, filters = []) => {
  const mongoFilter = colidOnlyFilter(colid);
  const numberFields = new Set(numericFields());

  filters.forEach((filter) => {
    if (!filter?.field || excludedFilterFields.has(filter.field)) return;
    const value = filter.value;
    if (value === undefined || value === null || String(value).trim() === '') return;

    const fieldPath = String(filter.field).startsWith('customFields.')
      ? filter.field
      : filter.field;

    if (numberFields.has(filter.field)) {
      mongoFilter[fieldPath] = Number(value);
    } else {
      mongoFilter[fieldPath] = { $regex: String(value), $options: 'i' };
    }
  });

  return mongoFilter;
};

exports.getMeta = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const customFields = await UserCustomField.find({ ...colidOnlyFilter(colid), isactive: 'Yes' }).sort({ page: 1, section: 1, order: 1, label: 1 }).lean();
    const fields = baseUserFields().map((field) => ({
      field,
      label: field,
      type: User.schema.paths[field]?.instance === 'Number' ? 'number' : 'text',
      options: fieldOptions(field),
      source: 'user'
    }));
    const custom = customFields.map((field) => ({
      field: `customFields.${field.fieldname}`,
      fieldname: field.fieldname,
      label: field.label,
      type: field.type || 'text',
      options: field.options || [],
      source: 'custom'
    }));

    res.json({ fields, customFields: customFields || [], filterFields: [...fields, ...custom] });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getOptions = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const field = req.query.field;
    if (!field || excludedFilterFields.has(field) || String(field).includes('$')) return res.json([]);
    const values = await User.distinct(field, colidOnlyFilter(colid));
    res.json(values.filter((item) => item !== undefined && item !== null && String(item).trim() !== '').sort());
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getStaffList = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    const search = String(req.query.search || '').trim();
    const filter = {
      colid,
      $nor: [{ role: /^student$/i }]
    };

    if (search) {
      filter.$or = staffListFields
        .filter((field) => field !== 'status')
        .map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
    }

    const data = await User.find(filter)
      .select([...staffListFields, 'colid'].join(' '))
      .sort({ name: 1, email: 1 })
      .lean();

    res.json({ data, fields: staffListFields });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkStaffList = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (items.length === 0) return res.status(400).json({ msg: 'No rows received' });

    const errors = [];
    let saved = 0;

    for (let index = 0; index < items.length; index += 1) {
      const row = items[index] || {};
      const rowNumber = row.rowNumber || index + 2;
      const role = String(row.role || '').trim();
      if (/^student$/i.test(role)) {
        errors.push({ rowNumber, msg: 'Student role is not allowed in Staff list upload' });
        continue;
      }

      const payload = staffPayload(row, colid, req.body.user);
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
    const key = `${colid}/user-photos/${Date.now()}-${cleanName}`;
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

exports.search = async (req, res) => {
  try {
    const filter = buildFilter(req.body.colid, req.body.filters || []);
    const data = await User.find(filter).sort({ createdAt: -1, name: 1 }).limit(Number(req.body.limit || 1000));
    res.json(data.map(serializeUser));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const customFieldDefs = await UserCustomField.find({ ...colidOnlyFilter(colid), isactive: 'Yes' }).lean();
    const payload = userPayload(req.body, customFieldDefs);
    const data = await User.create(payload);
    res.json(serializeUser(data));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const customFieldDefs = await UserCustomField.find({ ...colidOnlyFilter(colid), isactive: 'Yes' }).lean();
    const payload = userPayload(req.body, customFieldDefs);
    const duplicate = await User.findOne({ _id: { $ne: req.body.id }, email: payload.email });
    if (duplicate) return res.status(400).json({ msg: 'Duplicate email is not allowed' });

    const data = await User.findOneAndUpdate(
      { _id: req.body.id, ...colidOnlyFilter(colid) },
      payload,
      { new: true, runValidators: true }
    );
    res.json(serializeUser(data));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await User.findOneAndDelete({ _id: req.body.id, ...colidOnlyFilter(req.body.colid) });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkCreate = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const colid = Number(req.body.colid);
    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (items.length === 0) return res.status(400).json({ msg: 'No rows received' });

    const customFieldDefs = await UserCustomField.find({ ...colidOnlyFilter(colid), isactive: 'Yes' }).lean();
    const errors = [];
    let saved = 0;

    for (let index = 0; index < items.length; index += 1) {
      const rowNumber = items[index].rowNumber || index + 2;
      const payload = userPayload({ ...items[index], colid, user: req.body.user || items[index].user }, customFieldDefs);
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
