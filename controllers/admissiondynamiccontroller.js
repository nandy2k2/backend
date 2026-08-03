const AdmissionFormField = require('./../Models/admissionformfield');
const AdmissionApplication = require('./../Models/admissionapplicationdynamic');
const AdmissionDynamicForm = require('./../Models/admissiondynamicform');
const EmailConfiguration = require('./../Models/emailconfigurationds');
const MPrograms = require('./../Models/mprograms');
const Awsconfig = require('./../Models/awsconfig');
const AiConfiguration = require('./../Models/aiconfigurationds');
const AdmissionValidationCriteria = require('./../Models/admissionvalidationcriteria');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const { emitAdmissionApplicationSubmitted } = require('./admissionaiagentctlrds');

const upload = multer({ storage: multer.memoryStorage() });

const cleanFieldName = (value) => String(value || '')
  .trim()
  .replace(/[^a-zA-Z0-9_]/g, '_')
  .replace(/_+/g, '_')
  .toLowerCase();

const normalizeOptions = (options) => {
  if (Array.isArray(options)) return options.map((item) => String(item).trim()).filter(Boolean);
  return String(options || '').split(',').map((item) => item.trim()).filter(Boolean);
};

const textValue = (value) => String(value || '').trim();

const randomUsername = () => `app${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
const randomPassword = () => `Aa1!${crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;

const normalizeApplicationResponse = (application) => {
  const data = typeof application?.toObject === 'function' ? application.toObject() : { ...(application || {}) };
  const id = String(data._id || data.applicationid || data.applicationnumber || '').trim();
  if (id) {
    data.applicationid = String(data.applicationid || id);
    data.applicationnumber = String(data.applicationnumber || id);
  }
  return data;
};

const ensureApplicationIdentifiers = async (application) => {
  if (!application) return null;
  const id = String(application._id || '').trim();
  if (!id) return application;
  const needsApplicationId = !String(application.applicationid || '').trim();
  const needsApplicationNumber = !String(application.applicationnumber || '').trim();
  if (needsApplicationId || needsApplicationNumber) {
    if (needsApplicationId) application.applicationid = id;
    if (needsApplicationNumber) application.applicationnumber = id;
  }
  if ((needsApplicationId || needsApplicationNumber) || (typeof application.isModified === 'function' && application.isModified())) {
    await application.save();
  }
  return application;
};

const getNestedValueByHints = (source = {}, hints = []) => {
  const entries = Object.entries(source || {});
  const found = entries.find(([key]) => {
    const normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    return hints.every((hint) => normalizedKey.includes(hint));
  });
  return found ? found[1] : '';
};

const extractYear = (value) => {
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

const findDoc = (documents = [], patterns = []) => documents.find((doc) => {
  const haystack = [
    doc.documenttype,
    doc.description,
    doc.originalname,
    doc.filename,
    doc.url
  ].map((item) => String(item || '').toLowerCase()).join(' ');
  return patterns.some((pattern) => haystack.includes(pattern));
});

const getDefaultGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const getDocumentMimeType = (doc = {}) => {
  const value = String(doc.mimetype || '').toLowerCase();
  if (value) return value;
  const url = String(doc.url || doc.originalname || doc.filename || '').toLowerCase();
  if (url.includes('.pdf')) return 'application/pdf';
  if (url.includes('.png')) return 'image/png';
  if (url.includes('.jpg') || url.includes('.jpeg')) return 'image/jpeg';
  return '';
};

const buildGeminiDocumentParts = async (documents = []) => {
  const relevantDocs = documents
    .filter((doc) => findDoc([doc], ['marksheet', 'mark sheet', '10th', '12th', 'tenth', 'twelve', 'caste']))
    .filter((doc) => doc.url)
    .slice(0, 4);
  const parts = [];
  for (const doc of relevantDocs) {
    const mimeType = getDocumentMimeType(doc);
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(mimeType)) {
      parts.push({ text: `Document ${doc.documenttype || doc.originalname || doc.url} was not attached because its file type is unsupported for AI document reading.` });
      continue;
    }
    try {
      const response = await fetch(doc.url);
      if (!response.ok) throw new Error(`Unable to fetch document: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 6 * 1024 * 1024) {
        parts.push({ text: `Document ${doc.documenttype || doc.originalname || doc.url} was not attached because it is larger than 6 MB.` });
        continue;
      }
      parts.push({ text: `Attached document for validation: ${doc.documenttype || doc.originalname || doc.url}` });
      parts.push({
        inlineData: {
          mimeType,
          data: buffer.toString('base64')
        }
      });
    } catch (err) {
      parts.push({ text: `Document ${doc.documenttype || doc.originalname || doc.url} could not be read for AI validation: ${err.message}` });
    }
  }
  return parts;
};

const criteriaRequiresDocumentValidation = (criteriaText = '') => (
  /document|upload|file|pdf|image|photo|certificate|marksheet|mark sheet|aadhar|aadhaar|caste|migration|transfer|leaving|proof/i
    .test(String(criteriaText || ''))
);

const callGeminiJson = async (apikey, prompt, extraParts = []) => {
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  let lastError = '';
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...extraParts] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    });
    const data = await response.json();
    if (response.ok) {
      const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '{}';
      try {
        return JSON.parse(output);
      } catch (err) {
        return { validationstatus: 'Fail', validationcomments: output };
      }
    }
    lastError = data.error?.message || `Gemini API request failed for ${model}`;
  }
  throw new Error(lastError || 'Gemini API request failed');
};

const cleanFormId = (value) => cleanFieldName(value || 'default') || 'default';

const encodeS3Key = (key) => String(key || '').split('/').map(encodeURIComponent).join('/');

const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === 'us-east-1') return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const ensureDefaultForm = async (colid) => {
  let form = await AdmissionDynamicForm.findOne({ colid, formid: 'default' });
  if (!form) {
    form = await AdmissionDynamicForm.create({
      colid,
      formid: 'default',
      title: 'Default Admission Form',
      level: '',
      description: '',
      isactive: 'Yes'
    });
  }
  return form;
};

AdmissionFormField.collection.dropIndex('colid_1_fieldname_1').catch(() => {});

const createAdmissionMailTransport = (config) => {
  const smtpHost = config.smtp || config.smptp;
  if (smtpHost) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: Number(config.port || 587),
      secure: String(config.secure || '').toLowerCase() === 'yes',
      auth: {
        user: config.username,
        pass: config.password
      }
    });
  }

  return nodemailer.createTransport({
    service: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use true for port 465
    auth: {
      user: config.username,
      pass: config.password
    }
  });
};

const sendAdmissionConfirmationMail = async (application) => {
  try {
    if (!application?.email) return { sent: false, reason: 'Applicant email missing' };

    const mailConfig = await EmailConfiguration.findOne({
      colid: application.colid,
      provider: /^gmail$/i,
      type: /^admission$/i,
      isactive: 'Yes'
    }).lean();

    if (!mailConfig?.username || !mailConfig?.password) {
      return { sent: false, reason: 'Admission Gmail configuration missing' };
    }

    const formDefinition = await AdmissionDynamicForm.findOne({
      colid: application.colid,
      formid: application.formid || 'default'
    }).lean();

    const transporter = createAdmissionMailTransport(mailConfig);
    const subject = `Admission application received - ${application._id}`;
    const text = [
      `Dear ${application.name || 'Applicant'},`,
      '',
      'Thank you for submitting your admission application.',
      `Application ID: ${application._id}`,
      `Academic Year: ${application.academicyear || ''}`,
      `Program: ${application.programapplied || application.programcode || ''}`,
      `Form: ${formDefinition?.title || application.formid || 'Admission Application'}`,
      '',
      'Please keep the application acknowledgement for future reference.',
      '',
      'This is an automated confirmation email.'
    ].join('\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
        <p>Dear ${application.name || 'Applicant'},</p>
        <p>Thank you for submitting your admission application.</p>
        <table style="border-collapse:collapse;margin:12px 0">
          <tr><td style="padding:6px 10px;border:1px solid #d1d5db"><b>Application ID</b></td><td style="padding:6px 10px;border:1px solid #d1d5db">${application._id}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #d1d5db"><b>Academic Year</b></td><td style="padding:6px 10px;border:1px solid #d1d5db">${application.academicyear || ''}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #d1d5db"><b>Program</b></td><td style="padding:6px 10px;border:1px solid #d1d5db">${application.programapplied || application.programcode || ''}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #d1d5db"><b>Form</b></td><td style="padding:6px 10px;border:1px solid #d1d5db">${formDefinition?.title || application.formid || 'Admission Application'}</td></tr>
        </table>
        <p>Please keep the application acknowledgement for future reference.</p>
        <p style="font-size:12px;color:#6b7280">This is an automated confirmation email.</p>
      </div>
    `;

    await transporter.sendMail({
      from: `${formDefinition?.title || 'Admissions'} <${mailConfig.username}>`,
      to: application.email,
      subject,
      text,
      html
    });

    return { sent: true };
  } catch (err) {
    console.error('Admission confirmation mail failed:', err.message);
    return { sent: false, reason: err.message };
  }
};

exports.getForms = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    await ensureDefaultForm(colid);
    const data = await AdmissionDynamicForm.find({
      colid,
      ...(req.query.activeOnly === 'No' ? {} : { isactive: 'Yes' })
    }).sort({ createdAt: -1, title: 1 });

    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getForm = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const formid = cleanFormId(req.query.formid);
    if (formid === 'default') await ensureDefaultForm(colid);
    const data = await AdmissionDynamicForm.findOne({ colid, formid, isactive: 'Yes' });
    if (!data) return res.status(404).json({ msg: 'Admission form not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createForm = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ msg: 'Form title is required' });

    const data = await AdmissionDynamicForm.create({
      colid,
      formid: cleanFormId(req.body.formid || title),
      title,
      level: req.body.level || '',
      description: req.body.description || '',
      isactive: req.body.isactive || 'Yes',
      user: req.body.user || ''
    });

    res.json(data);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Form id already exists' });
    res.status(500).json({ msg: err.message });
  }
};

exports.updateForm = async (req, res) => {
  try {
    const data = await AdmissionDynamicForm.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid) },
      {
        title: req.body.title,
        level: req.body.level || '',
        description: req.body.description || '',
        isactive: req.body.isactive || 'Yes'
      },
      { new: true }
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteForm = async (req, res) => {
  try {
    await AdmissionDynamicForm.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid) },
      { isactive: 'No' },
      { new: true }
    );
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getPrograms = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.year) filter.year = req.query.year;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.level) filter.level = req.query.level;

    const data = await MPrograms.find(filter).sort({ Order: 1, program: 1, programcode: 1 });

    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getProgramTypes = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.year) filter.year = req.query.year;
    if (req.query.level) filter.level = req.query.level;

    const types = await MPrograms.aggregate([
      { $match: { ...filter, type: { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$type',
          minOrder: { $min: { $ifNull: ['$Order', 0] } }
        }
      },
      { $sort: { minOrder: 1, _id: 1 } }
    ]);
    res.json(types.map((item) => item._id).filter(Boolean));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getProgramLevels = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.year) filter.year = req.query.year;
    if (req.query.type) filter.type = req.query.type;

    const levels = await MPrograms.distinct('level', filter);
    res.json(levels.filter(Boolean).sort());
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getFields = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const formid = cleanFormId(req.query.formid);
    if (formid === 'default') await ensureDefaultForm(colid);
    const formFilter = formid === 'default'
      ? { $or: [{ formid }, { formid: { $exists: false } }] }
      : { formid };
    const data = await AdmissionFormField.find({
      colid,
      ...formFilter,
      ...(req.query.activeOnly === 'No' ? {} : { isactive: 'Yes' })
    }).sort({ order: 1, createdAt: 1, label: 1 });

    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createField = async (req, res) => {
  try {
    const fieldname = cleanFieldName(req.body.fieldname || req.body.label);
    if (!fieldname || !req.body.label) {
      return res.status(400).json({ msg: 'Field label is required' });
    }

    const data = await AdmissionFormField.create({
      colid: Number(req.body.colid),
      formid: cleanFormId(req.body.formid),
      fieldname,
      label: req.body.label,
      page: req.body.page || 'Page 1',
      section: req.body.section || 'Additional Details',
      type: req.body.type || 'text',
      options: normalizeOptions(req.body.options),
      isrequired: req.body.isrequired || 'No',
      isactive: req.body.isactive || 'Yes',
      order: Number(req.body.order || 0)
    });

    res.json(data);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Field already exists' });
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkCreateFields = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const colid = Number(req.body.colid);
    const formid = cleanFormId(req.body.formid);

    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (items.length === 0) return res.status(400).json({ msg: 'No rows received' });

    const errors = [];
    let saved = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const rowNumber = item.rowNumber || index + 2;
      const label = String(item.label || item.Label || '').trim();
      const fieldname = cleanFieldName(item.fieldname || item.fieldName || item['Field Key'] || label);

      if (!label || !fieldname) {
        errors.push({ rowNumber, msg: 'Label is required' });
        continue;
      }

      try {
        await AdmissionFormField.findOneAndUpdate(
          { colid, formid, fieldname },
          {
            colid,
            formid,
            fieldname,
            label,
            page: item.page || item.Page || 'Page 1',
            section: item.section || item.Section || 'Additional Details',
            type: item.type || item.Type || 'text',
            options: normalizeOptions(item.options || item.Options),
            isrequired: item.isrequired || item.required || item.Required || 'No',
            isactive: item.isactive || item.active || item.Active || 'Yes',
            order: Number(item.order || item.Order || 0)
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        saved += 1;
      } catch (err) {
        errors.push({ rowNumber, msg: err.message });
      }
    }

    res.json({ saved, errors });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateField = async (req, res) => {
  try {
    const formid = cleanFormId(req.body.formid);
    const formFilter = formid === 'default'
      ? { $or: [{ formid }, { formid: { $exists: false } }] }
      : { formid };
    const data = await AdmissionFormField.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid), ...formFilter },
      {
        label: req.body.label,
        page: req.body.page || 'Page 1',
        section: req.body.section || 'Additional Details',
        type: req.body.type,
        options: normalizeOptions(req.body.options),
        isrequired: req.body.isrequired,
        isactive: req.body.isactive,
        order: Number(req.body.order || 0)
      },
      { new: true }
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteField = async (req, res) => {
  try {
    const formid = cleanFormId(req.body.formid);
    const formFilter = formid === 'default'
      ? { $or: [{ formid }, { formid: { $exists: false } }] }
      : { formid };
    await AdmissionFormField.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid), ...formFilter },
      { isactive: 'No' },
      { new: true }
    );
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const normalizeEducationMarks = (body, resultStatusField, institutionField, marksTypeField, marksField, cgpaField) => {
  const resultStatus = String(body[resultStatusField] || '').trim();
  if (/^awaited$/i.test(resultStatus)) {
    return {
      resultStatus,
      institution: '',
      marksType: '',
      marks: 0,
      cgpa: 'NA'
    };
  }
  const marksType = String(body[marksTypeField] || '').trim();
  const isCgpa = /^cgpa$/i.test(marksType);
  const isPercentage = /^percentage$/i.test(marksType);
  const isGrade = /^grade$/i.test(marksType);
  return {
    resultStatus,
    institution: body[institutionField],
    marksType,
    marks: (isCgpa || isGrade) ? 0 : Number(body[marksField] || 0),
    cgpa: isPercentage ? 'NA' : String(body[cgpaField] || '').trim()
  };
};

const applicationPayload = (body) => {
  const tenthEducation = normalizeEducationMarks(body, 'result_status_10th', 'board_10th', 'marks_type_10th', 'marks_10', 'cgpa_10');
  const twelveEducation = normalizeEducationMarks(body, 'result_status_12th', 'board_12th', 'marks_type_12th', 'marks_12', 'cgpa_12');
  const ugEducation = normalizeEducationMarks(body, 'result_status_UG', 'University_UG', 'marks_type_UG', 'marks_UG', 'cgpa_UG');
  const pgEducation = normalizeEducationMarks(body, 'result_status_PG', 'University_PG', 'marks_type_PG', 'marks_PG', 'cgpa_PG');
  return ({
  colid: Number(body.colid),
  formid: cleanFormId(body.formid),
  applicationid: String(body.applicationid || body.applicationId || body.applicationnumber || body.applicationNumber || '').trim(),
  applicationnumber: String(body.applicationnumber || body.applicationNumber || body.applicationid || body.applicationId || '').trim(),
  academicyear: body.academicyear,
  name: body.name,
  username: String(body.username || '').trim(),
  password: String(body.password || '').trim(),
  email: String(body.email || '').trim().toLowerCase(),
  phone: String(body.phone || '').trim(),
  regno: String(body.regno || '').trim(),
  address: body.address,
  pin: body.pin,
  country_form: body.country_form,
  state_form: body.state_form,
  district_form: body.district_form,
  result_status_12th: twelveEducation.resultStatus,
  board_12th: twelveEducation.institution,
  marks_type_12th: twelveEducation.marksType,
  marks_12: twelveEducation.marks,
  cgpa_12: twelveEducation.cgpa,
  result_status_10th: tenthEducation.resultStatus,
  board_10th: tenthEducation.institution,
  marks_type_10th: tenthEducation.marksType,
  marks_10: tenthEducation.marks,
  cgpa_10: tenthEducation.cgpa,
  result_status_UG: ugEducation.resultStatus,
  University_UG: ugEducation.institution,
  marks_type_UG: ugEducation.marksType,
  marks_UG: ugEducation.marks,
  cgpa_UG: ugEducation.cgpa,
  result_status_PG: pgEducation.resultStatus,
  University_PG: pgEducation.institution,
  marks_type_PG: pgEducation.marksType,
  marks_PG: pgEducation.marks,
  cgpa_PG: pgEducation.cgpa,
  gender: body.gender,
  category: body.category,
  ews: body.ews,
  ph: body.ph,
  minority: body.minority,
  tenthmarks: Number(body.tenthmarks || 0),
  twelvemarks: Number(body.twelvemarks || 0),
  externaltheorymarks: Number(body.externaltheorymarks || 0),
  englishmarks: Number(body.englishmarks || 0),
  dateofbirth: body.dateofbirth,
  dateofapplication: body.dateofapplication,
  age: Number(body.age || 0),
  twelvesubjects: body.twelvesubjects,
  level: body.level,
  programtype: body.programtype,
  programapplied: body.programapplied,
  programcode: body.programcode,
  applicationstatus: body.applicationstatus || 'Applied',
  enrollmentstatus: body.enrollmentstatus || '',
  applicationcomments: body.applicationcomments || '',
  validationstatus: body.validationstatus || '',
  validationcomments: body.validationcomments || '',
  tenthsubjectmarks: body.tenthsubjectmarks || [],
  twelvesubjectmarks: body.twelvesubjectmarks || [],
  documents: body.documents || [],
  extraFields: body.extraFields || {},
  user: body.user || ''
});
};

exports.uploadDocumentMiddleware = upload.single('file');

exports.uploadApplicationDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'Select a file to upload' });

    const colid = Number(req.body.colid);
    const documenttype = String(req.body.documenttype || '').trim();
    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (!documenttype) return res.status(400).json({ msg: 'Document type is required' });
    if (/^photo$/i.test(documenttype)) {
      const extension = path.extname(req.file.originalname || '').toLowerCase();
      const allowedMime = ['image/jpeg', 'image/jpg', 'image/png'].includes(req.file.mimetype);
      const allowedExtension = ['.jpg', '.jpeg', '.png'].includes(extension);
      if (!allowedMime || !allowedExtension) {
        return res.status(400).json({ msg: 'Photo must be a JPG, JPEG, or PNG file' });
      }
    }

    const config = await Awsconfig.findOne({
      colid,
      type: /^aws$/i,
      default: /^yes$/i
    }).lean();

    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ msg: 'Default AWS configuration is missing or incomplete' });
    }

    const formid = cleanFormId(req.body.formid);
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, '_');
    const cleanType = cleanFieldName(documenttype) || 'document';
    const key = `${colid}/admission-applications/${formid}/${cleanType}/${Date.now()}-${cleanName}`;

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
      documenttype,
      description: req.body.description || '',
      filename: cleanName,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bucket: config.bucket,
      region: config.region,
      key,
      url: s3Url(config.bucket, config.region, key),
      uploadedAt: new Date()
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.validateApplicationWithAi = async (req, res) => {
  try {
    const payload = applicationPayload(req.body || {});
    if (!payload.colid) return res.status(400).json({ msg: 'College id is required' });

    const requestedFormId = textValue(req.body.formid);
    const normalizedRequestedFormId = requestedFormId ? cleanFormId(requestedFormId) : '';
    const sameFormIds = [...new Set([requestedFormId, normalizedRequestedFormId].filter(Boolean))];
    const formCriteria = sameFormIds.length
      ? await AdmissionValidationCriteria.findOne({
          colid: Number(payload.colid),
          formid: { $in: sameFormIds }
        }).lean()
      : null;
    const additionalValidationCriteria = textValue(formCriteria?.validationcriteria);
    const mandatoryValidationCriteria = textValue(formCriteria?.mandatorycriteria);
    const combinedCriteria = [mandatoryValidationCriteria, additionalValidationCriteria].filter(Boolean).join('\n\n');

    if (!formCriteria || !combinedCriteria) {
      const comments = 'AI validation skipped because no validation criteria are configured for this form.';
      return res.json({
        validationstatus: 'Pass',
        validationcomments: comments,
        summary: comments,
        mandatoryFailed: false,
        criteriaissues: [],
        skipped: true,
        ai: null
      });
    }

    const aiConfig = await getDefaultGeminiConfig(payload.colid);
    if (!aiConfig?.apikey) {
      const comments = 'AI validation skipped because active/default Gemini API configuration is missing.';
      return res.json({
        validationstatus: 'Pass',
        validationcomments: comments,
        summary: comments,
        mandatoryFailed: false,
        criteriaissues: [],
        skipped: true,
        ai: null
      });
    }

    const documents = payload.documents || [];
    const extraFields = payload.extraFields || {};
    const includeDocumentValidation = criteriaRequiresDocumentValidation(combinedCriteria);
    const prompt = `
You are validating an admission application. Return ONLY JSON with:
{
  "validationstatus": "Pass" or "Fail",
  "validationcomments": "clear bullet-style summary",
  "mandatorycriteriaresult": "Pass" or "Fail",
  "checks": [{"check":"", "status":"Pass/Fail", "comment":""}],
  "criteriaissues": [{"criteriaType":"Mandatory/Other", "tab":"", "field":"", "status":"Pass/Fail", "comment":""}]
}

Validate ONLY the criteria configured for this exact form and college. Do not apply any default or assumed validation rule.
${mandatoryValidationCriteria ? `\nMandatory criteria for this form (${formCriteria.formname || payload.formid}):\n${mandatoryValidationCriteria}\nThese criteria are compulsory. If any mandatory criterion is not satisfied, set validationstatus to Fail, set mandatorycriteriaresult to Fail, and explain it in validationcomments.` : ''}
${additionalValidationCriteria ? `\nAdditional validation criteria for this form (${formCriteria.formname || payload.formid}):\n${additionalValidationCriteria}\nApply these criteria and include the result in validationcomments.` : ''}
${includeDocumentValidation ? 'Document validation is requested by the configured criteria. Use attached documents where relevant. If required document content is unreadable, mark the relevant criterion as Fail.' : 'Document validation is not requested by the configured criteria. Do not fail the application because documents are missing or unreadable.'}
When a mandatory or additional criterion fails, add one criteriaissues item with criteriaType, tab, field, status and a correction-oriented comment. Use tab names such as Basic Registration, Applicant Details, Documents, or the custom page name when it is clear. Use field names exactly as shown in the application where possible.

Application:
${JSON.stringify({
  name: payload.name,
  email: payload.email,
  phone: payload.phone,
  category: payload.category,
  program: payload.programapplied,
  programcode: payload.programcode,
  extraFields,
  documents: includeDocumentValidation ? documents.map((doc) => ({
    documenttype: doc.documenttype,
    description: doc.description,
    originalname: doc.originalname,
    filename: doc.filename,
    url: doc.url
  })) : []
}, null, 2)}
`;

    const documentParts = includeDocumentValidation ? await buildGeminiDocumentParts(documents) : [];
    const aiResult = await callGeminiJson(aiConfig.apikey, prompt, documentParts);
    const aiComments = textValue(aiResult.validationcomments || aiResult.summary);
    const aiChecksText = JSON.stringify(aiResult.checks || aiResult);
    const hasManualOrFailedDocumentCheck = includeDocumentValidation && /manual|unreadable|cannot be completed|could not be read/i.test(aiChecksText);
    const criteriaIssues = Array.isArray(aiResult.criteriaissues) ? aiResult.criteriaissues : [];
    const mandatoryCriteriaFailed = criteriaIssues.some((issue) => (
      /mandatory/i.test(textValue(issue.criteriaType || issue.type)) && /^fail$/i.test(textValue(issue.status))
    )) || /^fail$/i.test(textValue(aiResult.mandatorycriteriaresult));
    const combinedComments = [
      includeDocumentValidation ? 'Document validation enabled by configured criteria.' : 'Document validation skipped because configured criteria did not request it.',
      'AI validation summary:',
      aiComments || JSON.stringify(aiResult.checks || aiResult)
    ].join('\n').trim();

    const status = hasManualOrFailedDocumentCheck ? 'Fail' : (/^fail$/i.test(aiResult.validationstatus) ? 'Fail' : 'Pass');
    res.json({
      validationstatus: status,
      validationcomments: combinedComments,
      summary: combinedComments,
      mandatoryFailed: mandatoryCriteriaFailed,
      criteriaissues: criteriaIssues,
      ai: aiResult
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createApplication = async (req, res) => {
  try {
    const payload = applicationPayload(req.body);
    const generatedId = new mongoose.Types.ObjectId();
    payload._id = generatedId;
    payload.applicationid = payload.applicationid || String(generatedId);
    payload.applicationnumber = payload.applicationnumber || String(generatedId);
    if (!payload.email || !payload.phone) {
      return res.status(400).json({ msg: 'Email and phone are required' });
    }

    const duplicate = await AdmissionApplication.findOne({
      colid: payload.colid,
      $or: [{ email: payload.email }, { phone: payload.phone }]
    });

    if (duplicate) {
      return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    }

    const data = await AdmissionApplication.create(payload);
    const mailStatus = await sendAdmissionConfirmationMail(data);
    emitAdmissionApplicationSubmitted({
      colid: data.colid,
      formid: data.formid || 'default',
      applicationid: String(data._id)
    });
    const response = normalizeApplicationResponse(data);
    response.mailStatus = mailStatus;
    res.json(response);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.saveDraftApplication = async (req, res) => {
  try {
    const payload = applicationPayload({
      ...req.body,
      applicationstatus: 'Draft'
    });
    if (!payload.email || !payload.phone) {
      return res.status(400).json({ msg: 'Email and phone are required before saving the application' });
    }

    const id = String(req.body.id || '').trim();
    if (id) {
      payload.applicationid = payload.applicationid || id;
      payload.applicationnumber = payload.applicationnumber || id;
    }
    const duplicateFilter = {
      colid: payload.colid,
      $or: [{ email: payload.email }, { phone: payload.phone }]
    };
    if (id) duplicateFilter._id = { $ne: id };

    const duplicate = await AdmissionApplication.findOne(duplicateFilter);
    if (duplicate) {
      return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    }

    if (id) {
      const current = await AdmissionApplication.findOne({ _id: id, colid: payload.colid });
      if (!current) return res.status(404).json({ msg: 'Application not found' });
      if (current.applicationstatus !== 'Draft') {
        return res.status(400).json({ msg: 'Submitted application cannot be edited' });
      }
      const data = await AdmissionApplication.findOneAndUpdate(
        { _id: id, colid: payload.colid },
        payload,
        { new: true }
      );
      const repaired = await ensureApplicationIdentifiers(data);
      return res.json(normalizeApplicationResponse(repaired));
    }

    const generatedId = new mongoose.Types.ObjectId();
    payload._id = generatedId;
    payload.applicationid = payload.applicationid || String(generatedId);
    payload.applicationnumber = payload.applicationnumber || String(generatedId);
    const data = await AdmissionApplication.create(payload);
    res.json(normalizeApplicationResponse(data));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.submitDraftApplication = async (req, res) => {
  try {
    const payload = applicationPayload({
      ...req.body,
      applicationstatus: 'Applied'
    });
    if (!req.body.id) return res.status(400).json({ msg: 'Application id is required' });
    payload.applicationid = payload.applicationid || String(req.body.id);
    payload.applicationnumber = payload.applicationnumber || String(req.body.id);
    if (!payload.email || !payload.phone) {
      return res.status(400).json({ msg: 'Email and phone are required' });
    }

    const duplicate = await AdmissionApplication.findOne({
      _id: { $ne: req.body.id },
      colid: payload.colid,
      $or: [{ email: payload.email }, { phone: payload.phone }]
    });
    if (duplicate) {
      return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    }

    const current = await AdmissionApplication.findOne({ _id: req.body.id, colid: payload.colid });
    if (!current) return res.status(404).json({ msg: 'Application not found' });
    if (current.applicationstatus !== 'Draft') {
      return res.status(400).json({ msg: 'Only draft applications can be submitted from this page' });
    }

    const data = await AdmissionApplication.findOneAndUpdate(
      { _id: req.body.id, colid: payload.colid },
      payload,
      { new: true }
    );
    const mailStatus = await sendAdmissionConfirmationMail(data);
    const repaired = await ensureApplicationIdentifiers(data);
    emitAdmissionApplicationSubmitted({
      colid: repaired.colid,
      formid: repaired.formid || 'default',
      applicationid: String(repaired._id)
    });
    const response = normalizeApplicationResponse(repaired);
    response.mailStatus = mailStatus;
    res.json(response);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkCreateApplications = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ msg: 'No rows received' });
    }

    const payloads = items.map((item, index) => ({
      rowNumber: item.rowNumber || index + 2,
      data: applicationPayload({ ...item, colid: req.body.colid || item.colid, formid: req.body.formid || item.formid })
    }));

    const errors = [];
    const valid = [];
    const seenEmails = new Set();
    const seenPhones = new Set();
    const seenUsernames = new Set();

    payloads.forEach((item) => {
      const payload = item.data;
      payload.username = String(payload.username || payload.phone || payload.email || randomUsername()).trim();
      payload.password = String(payload.password || randomPassword()).trim();
      if (!payload.email || !payload.phone) {
        errors.push({ rowNumber: item.rowNumber, msg: 'Email and phone are required' });
        return;
      }
      if (seenEmails.has(payload.email)) {
        errors.push({ rowNumber: item.rowNumber, msg: 'Duplicate email in Excel' });
        return;
      }
      if (seenPhones.has(payload.phone)) {
        errors.push({ rowNumber: item.rowNumber, msg: 'Duplicate phone in Excel' });
        return;
      }
      seenEmails.add(payload.email);
      seenPhones.add(payload.phone);
      valid.push({ rowNumber: item.rowNumber, data: payload });
    });

    if (valid.length === 0) {
      return res.json({ inserted: 0, errors });
    }

    const colid = Number(req.body.colid || valid[0].data.colid);
    const existing = await AdmissionApplication.find({
      colid,
      $or: [
        { email: { $in: valid.map((item) => item.data.email) } },
        { phone: { $in: valid.map((item) => item.data.phone) } },
        { username: { $in: valid.map((item) => item.data.username).filter(Boolean) } }
      ]
    }).select('email phone username').lean();

    const existingEmails = new Set(existing.map((item) => item.email));
    const existingPhones = new Set(existing.map((item) => item.phone));
    const existingUsernames = new Set(existing.map((item) => item.username).filter(Boolean));
    const insertable = [];

    valid.forEach((item) => {
      if (existingEmails.has(item.data.email) || existingPhones.has(item.data.phone)) {
        errors.push({ rowNumber: item.rowNumber, msg: 'Duplicate email or phone already exists' });
      } else {
        if (existingUsernames.has(item.data.username) || seenUsernames.has(item.data.username)) {
          item.data.username = randomUsername();
          while (existingUsernames.has(item.data.username) || seenUsernames.has(item.data.username)) {
            item.data.username = randomUsername();
          }
        }
        seenUsernames.add(item.data.username);
        const generatedId = new mongoose.Types.ObjectId();
        item.data._id = generatedId;
        item.data.applicationid = item.data.applicationid || String(generatedId);
        item.data.applicationnumber = item.data.applicationnumber || String(generatedId);
        insertable.push(item.data);
      }
    });

    if (insertable.length > 0) {
      await AdmissionApplication.insertMany(insertable, { ordered: false });
    }

    res.json({ inserted: insertable.length, errors });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.updateApplication = async (req, res) => {
  try {
    const payload = applicationPayload(req.body);
    if (req.body.id) {
      payload.applicationid = payload.applicationid || String(req.body.id);
      payload.applicationnumber = payload.applicationnumber || String(req.body.id);
    }
    const duplicate = await AdmissionApplication.findOne({
      _id: { $ne: req.body.id },
      colid: payload.colid,
      $or: [{ email: payload.email }, { phone: payload.phone }]
    });

    if (duplicate) {
      return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    }

    const data = await AdmissionApplication.findOneAndUpdate(
      { _id: req.body.id, colid: payload.colid },
      payload,
      { new: true }
    );

    const repaired = await ensureApplicationIdentifiers(data);
    res.json(normalizeApplicationResponse(repaired));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Duplicate email or phone is not allowed' });
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteApplication = async (req, res) => {
  try {
    const data = await AdmissionApplication.findOneAndDelete({
      _id: req.body.id,
      colid: Number(req.body.colid)
    });

    if (!data) return res.status(404).json({ msg: 'Application not found' });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getApplications = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.formid) filter.formid = cleanFormId(req.query.formid);
    if (req.query.academicyear) filter.academicyear = req.query.academicyear;
    if (req.query.programcode) filter.programcode = req.query.programcode;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.name) filter.name = { $regex: req.query.name, $options: 'i' };
    if (req.query.email) filter.email = { $regex: req.query.email, $options: 'i' };
    if (req.query.phone) filter.phone = { $regex: req.query.phone, $options: 'i' };

    const data = await AdmissionApplication.find(filter).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getFilterOptions = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.formid) filter.formid = cleanFormId(req.query.formid);
    const data = await AdmissionApplication.find(filter)
      .select('programapplied programcode category')
      .lean();

    const programMap = new Map();
    const categorySet = new Set();

    data.forEach((item) => {
      if (item.programcode) {
        programMap.set(item.programcode, {
          programcode: item.programcode,
          programapplied: item.programapplied || item.programcode
        });
      }
      if (item.category) categorySet.add(item.category);
    });

    res.json({
      programs: Array.from(programMap.values()).sort((a, b) => String(a.programapplied).localeCompare(String(b.programapplied))),
      categories: Array.from(categorySet).sort()
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    const id = String(req.query.id || req.query.applicationnumber || '').trim();
    const colid = Number(req.query.colid);
    if (!id) return res.status(400).json({ msg: 'Application number is required' });
    const idFilters = [
      { applicationid: id },
      { applicationnumber: id }
    ];
    if (mongoose.Types.ObjectId.isValid(id)) idFilters.unshift({ _id: id });
    const data = await AdmissionApplication.findOne({ colid, $or: idFilters });
    if (!data) return res.status(404).json({ msg: 'Application not found' });
    const repaired = await ensureApplicationIdentifiers(data);
    res.json(normalizeApplicationResponse(repaired));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getStudentApplications = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const email = String(req.query.email || req.query.user || '').trim().toLowerCase();
    const regno = String(req.query.regno || '').trim();
    const username = String(req.query.username || req.query.user || '').trim();
    const phone = String(req.query.phone || '').trim();

    if (!colid) return res.status(400).json({ msg: 'College id is required' });

    const orFilters = [];
    if (email) orFilters.push({ email }, { user: email }, { username: email });
    if (username && username !== email) orFilters.push({ username }, { user: username });
    if (regno) orFilters.push({ regno });
    if (phone) orFilters.push({ phone });

    if (!orFilters.length) {
      return res.status(400).json({ msg: 'Student email, registration number, username, or phone is required' });
    }

    const applications = await AdmissionApplication.find({ colid, $or: orFilters }).sort({ updatedAt: -1, createdAt: -1 });
    for (const application of applications) await ensureApplicationIdentifiers(application);

    res.json(applications.map(normalizeApplicationResponse));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.checkDuplicateEmail = async (req, res) => {
  try {
    const colid = Number(req.body.colid || req.query.colid);
    const email = String(req.body.email || req.query.email || '').trim().toLowerCase();
    const excludeId = String(req.body.id || req.query.id || '').trim();

    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (!email) return res.status(400).json({ msg: 'Email is required' });

    const query = { colid, email };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) query._id = { $ne: excludeId };
    const existing = await AdmissionApplication.findOne(query).select('_id applicationid applicationnumber applicationstatus email').lean();

    res.json({
      duplicate: !!existing,
      applicationid: existing ? String(existing.applicationid || existing.applicationnumber || existing._id || '') : '',
      applicationstatus: existing?.applicationstatus || ''
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.retrieveApplication = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const id = String(req.query.id || req.query.applicationnumber || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();
    const phone = String(req.query.phone || '').trim();
    const formid = req.query.formid ? cleanFormId(req.query.formid) : '';

    if (!colid) return res.status(400).json({ msg: 'College id is required' });

    const filter = { colid };
    if (formid) filter.formid = formid;

    if (id) {
      const idFilters = [
        { applicationid: id },
        { applicationnumber: id }
      ];
      if (mongoose.Types.ObjectId.isValid(id)) idFilters.unshift({ _id: id });
      filter.$or = idFilters;
    } else {
      if (!email || !phone) {
        return res.status(400).json({ msg: 'Enter application number or both email and phone' });
      }
      filter.email = email;
      filter.phone = phone;
    }

    const data = await AdmissionApplication.findOne(filter).sort({ createdAt: -1 });
    if (!data) return res.status(404).json({ msg: 'Application not found' });
    const repaired = await ensureApplicationIdentifiers(data);
    res.json(normalizeApplicationResponse(repaired));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.retrieveApplicationByCredential = async (req, res) => {
  try {
    const colid = Number(req.body.colid || req.query.colid);
    const username = String(req.body.username || req.query.username || '').trim();
    const password = String(req.body.password || req.query.password || '').trim();
    const formid = req.body.formid || req.query.formid ? cleanFormId(req.body.formid || req.query.formid) : '';

    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (!username || !password) return res.status(400).json({ msg: 'Username and password are required' });

    const credentialMatch = {
      $and: [
        {
          $or: [
            { username },
            { email: username.toLowerCase() },
            { phone: username },
            { 'extraFields.username': username },
            { 'extraFields.Username': username },
            { 'extraFields.userName': username },
            { 'extraFields.UserName': username }
          ]
        },
        {
          $or: [
            { password },
            { 'extraFields.password': password },
            { 'extraFields.Password': password }
          ]
        }
      ]
    };
    const requestedFormFilter = formid ? { formid } : {};
    const fallbackFormFilter = formid ? {
      $or: [
        { formid },
        { formid: 'default' },
        { formid: '' },
        { formid: { $exists: false } }
      ]
    } : {};

    let data = await AdmissionApplication.findOne({ colid, ...credentialMatch, ...requestedFormFilter }).sort({ updatedAt: -1, createdAt: -1 });
    if (!data && formid) {
      data = await AdmissionApplication.findOne({ colid, ...credentialMatch, ...fallbackFormFilter }).sort({ updatedAt: -1, createdAt: -1 });
      if (data && (!data.formid || data.formid === 'default')) {
        data.formid = formid;
      }
    }
    if (!data) return res.status(404).json({ msg: 'Application not found or password is incorrect' });
    const repaired = await ensureApplicationIdentifiers(data);
    res.json(normalizeApplicationResponse(repaired));
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.forgotApplicationPassword = async (req, res) => {
  try {
    const colid = Number(req.body.colid || req.query.colid);
    const email = String(req.body.email || req.query.email || '').trim().toLowerCase();
    const formid = req.body.formid || req.query.formid ? cleanFormId(req.body.formid || req.query.formid) : '';

    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (!email) return res.status(400).json({ msg: 'Email is required' });

    const filter = { colid, email };
    if (formid) filter.formid = formid;
    const application = await AdmissionApplication.findOne(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
    if (!application) return res.status(404).json({ msg: 'Application not found for this email' });
    if (!application.username || !application.password) return res.status(400).json({ msg: 'Username/password is not available for this application' });

    const mailConfig = await EmailConfiguration.findOne({
      colid,
      provider: /^gmail$/i,
      type: /^admission$/i,
      isactive: 'Yes'
    }).lean();

    if (!mailConfig?.username || !mailConfig?.password) {
      return res.status(400).json({ msg: 'Admission Gmail configuration missing' });
    }

    const formDefinition = await AdmissionDynamicForm.findOne({
      colid,
      formid: application.formid || 'default'
    }).lean();

    const transporter = createAdmissionMailTransport(mailConfig);
    await transporter.sendMail({
      from: `${formDefinition?.title || 'Admissions'} <${mailConfig.username}>`,
      to: email,
      subject: `Admission application login details - ${application._id}`,
      text: [
        `Dear ${application.name || 'Applicant'},`,
        '',
        'Your admission application login details are:',
        `Application ID: ${application._id}`,
        `Username: ${application.username}`,
        `Password: ${application.password}`,
        '',
        'Please keep these details safe for continuing your application.',
        '',
        'This is an automated email.'
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
          <p>Dear ${application.name || 'Applicant'},</p>
          <p>Your admission application login details are:</p>
          <table style="border-collapse:collapse;margin:12px 0">
            <tr><td style="padding:6px 10px;border:1px solid #d1d5db"><b>Application ID</b></td><td style="padding:6px 10px;border:1px solid #d1d5db">${application._id}</td></tr>
            <tr><td style="padding:6px 10px;border:1px solid #d1d5db"><b>Username</b></td><td style="padding:6px 10px;border:1px solid #d1d5db">${application.username}</td></tr>
            <tr><td style="padding:6px 10px;border:1px solid #d1d5db"><b>Password</b></td><td style="padding:6px 10px;border:1px solid #d1d5db">${application.password}</td></tr>
          </table>
          <p>Please keep these details safe for continuing your application.</p>
          <p style="font-size:12px;color:#6b7280">This is an automated email.</p>
        </div>
      `
    });

    res.json({ msg: 'Login details sent to email' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
