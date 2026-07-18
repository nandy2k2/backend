const path = require('path');
const multer = require('multer');
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const RecruitmentForm = require('../Models/recruitmentformds');
const RecruitmentFormField = require('../Models/recruitmentformfieldds');
const RecruitmentDocumentType = require('../Models/recruitmentdocumenttypeds');
const RecruitmentValidationCriteria = require('../Models/recruitmentvalidationcriteriads');
const RecruitmentJobPost = require('../Models/recruitmentjobpostds');
const RecruitmentApplication = require('../Models/recruitmentapplicationds');
const RecruitmentCandidateStatus = require('../Models/recruitmentcandidatestatusds');
const RecruitmentApprovalLevel = require('../Models/recruitmentapprovallevelds');
const RecruitmentInterviewPanel = require('../Models/recruitmentinterviewpanelds');
const RecruitmentPanelMember = require('../Models/recruitmentpanelmemberds');
const RecruitmentPanelJob = require('../Models/recruitmentpaneljobds');
const RecruitmentInterviewSchedule = require('../Models/recruitmentinterviewscheduleds');
const RecruitmentOfferTemplate = require('../Models/recruitmentoffertemplateds');
const RecruitmentOnboardingStep = require('../Models/recruitmentonboardingstepds');
const RecruitmentOnboardingRecord = require('../Models/recruitmentonboardingrecordds');
const NepLmsTimetable = require('../Models/neplmstimetableds');
const Awsconfig = require('../Models/awsconfig');
const AiConfiguration = require('../Models/aiconfigurationds');
const EmailConfiguration = require('../Models/emailconfigurationds');
const Institution = require('../Models/insdetails');
const User = require('../Models/user');

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single('document');

const clean = (value) => String(value || '').trim();
const cleanKey = (value) => clean(value).replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').toLowerCase();
const normalizeOptions = (options) => Array.isArray(options)
  ? options.map((item) => clean(item)).filter(Boolean)
  : clean(options).split(',').map((item) => clean(item)).filter(Boolean);
const numberOrZero = (value) => Number(value || 0);
const defaultCandidateStatuses = ['Submitted', 'Shortlisted', 'Rejected', 'Confirmed', 'On Hold', 'Selected', 'Waiting'];
const encodeS3Key = (key) => String(key || '').split('/').map(encodeURIComponent).join('/');
const s3Url = (bucket, region, key) => region === 'us-east-1'
  ? `https://${bucket}.s3.amazonaws.com/${encodeS3Key(key)}`
  : `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;

const getColid = (req) => Number(req.body.colid || req.query.colid || 0);

const getDefaultGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid: Number(colid), type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const getSmtpHost = (config = {}) => {
  if (config.smtp) return config.smtp;
  if (config.smptp) return config.smptp;
  if (/gmail/i.test(config.provider || '')) return 'smtp.gmail.com';
  return '';
};

const getDefaultEmailConfig = async (colid) => (
  await EmailConfiguration.findOne({ colid: Number(colid), isactive: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await EmailConfiguration.findOne({ colid: Number(colid), isactive: /^yes$/i }).sort({ _id: -1 }).lean()
);

const createEmailTransporter = (config) => {
  const port = Number(config.port) || 587;
  return nodemailer.createTransport({
    host: getSmtpHost(config),
    port,
    secure: ['yes', 'true'].includes(String(config.secure || '').toLowerCase()) || port === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const sendCandidateStatusEmail = async ({ colid, candidate, subject, body, senderName }) => {
  const config = await getDefaultEmailConfig(colid);
  if (!config?.username || !config?.password || !getSmtpHost(config)) {
    throw new Error('Default active email configuration is missing or incomplete');
  }
  if (!/\S+@\S+\.\S+/.test(candidate.email || '')) throw new Error('Candidate email is missing or invalid');

  const messageText = clean(body);
  const html = messageText
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
    .join('');

  await createEmailTransporter(config).sendMail({
    from: `"${clean(senderName) || 'Recruitment'}" <${config.username}>`,
    to: candidate.email,
    subject: clean(subject) || 'Recruitment application update',
    text: messageText,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">${html}</div>`
  });
};

const callGeminiJson = async (apikey, prompt) => {
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  let lastError = '';
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    });
    const data = await response.json();
    if (response.ok) {
      const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '{}';
      try { return JSON.parse(output); } catch (err) { return { status: 'Fail', comments: output }; }
    }
    lastError = data.error?.message || `Gemini API request failed for ${model}`;
  }
  throw new Error(lastError || 'Gemini API request failed');
};

const applicationPayload = (body = {}) => ({
  colid: Number(body.colid),
  jobid: clean(body.jobid),
  formid: clean(body.formid),
  applicationno: clean(body.applicationno),
  applicantname: clean(body.applicantname || body.name),
  email: clean(body.email).toLowerCase(),
  phone: clean(body.phone),
  username: clean(body.username || body.email).toLowerCase(),
  password: clean(body.password),
  status: clean(body.status || 'Submitted'),
  photourl: clean(body.photourl),
  approvalstatus: clean(body.approvalstatus || 'Pending'),
  approvallevel: numberOrZero(body.approvallevel),
  customfields: body.customfields || {},
  documents: Array.isArray(body.documents) ? body.documents : [],
  validationstatus: clean(body.validationstatus),
  validationcomments: clean(body.validationcomments),
  mandatoryvalidationstatus: clean(body.mandatoryvalidationstatus),
  mandatoryvalidationcomments: clean(body.mandatoryvalidationcomments)
});

const hasPhoto = (payload = {}) => {
  if (payload.photourl) return true;
  return (payload.documents || []).some((doc) => /photo/i.test(clean(doc.documenttype || doc.originalname || doc.filename)) && doc.url);
};

exports.createForm = async (req, res) => {
  try {
    const colid = getColid(req);
    const formid = cleanKey(req.body.formid || req.body.title || `form_${Date.now()}`);
    const data = await RecruitmentForm.findOneAndUpdate(
      { colid, formid },
      { colid, formid, title: clean(req.body.title), description: clean(req.body.description), isactive: clean(req.body.isactive || 'Yes'), user: clean(req.body.user) },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getForms = async (req, res) => {
  try { res.json(await RecruitmentForm.find({ colid: getColid(req) }).sort({ createdAt: -1 }).lean()); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteForm = async (req, res) => {
  try {
    const colid = getColid(req);
    const formid = clean(req.body.formid);
    await RecruitmentForm.deleteOne({ _id: req.body.id, colid });
    if (formid) {
      await RecruitmentFormField.deleteMany({ colid, formid });
      await RecruitmentDocumentType.deleteMany({ colid, formid });
      await RecruitmentValidationCriteria.deleteMany({ colid, formid });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveField = async (req, res) => {
  try {
    const colid = getColid(req);
    const formid = clean(req.body.formid);
    const fieldname = cleanKey(req.body.fieldname || req.body.label);
    const payload = {
      colid,
      formid,
      fieldname,
      label: clean(req.body.label || fieldname),
      fieldtype: clean(req.body.fieldtype || 'Text'),
      options: normalizeOptions(req.body.options),
      isrequired: clean(req.body.isrequired || 'No'),
      page: clean(req.body.page || 'Page 1'),
      section: clean(req.body.section || 'Additional details'),
      order: numberOrZero(req.body.order)
    };
    const data = req.body.id
      ? await RecruitmentFormField.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentFormField.findOneAndUpdate({ colid, formid, fieldname }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getFields = async (req, res) => {
  try { res.json(await RecruitmentFormField.find({ colid: getColid(req), formid: clean(req.query.formid) }).sort({ order: 1, createdAt: 1 }).lean()); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteField = async (req, res) => {
  try { await RecruitmentFormField.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveDocumentType = async (req, res) => {
  try {
    const colid = getColid(req);
    const payload = {
      colid,
      formid: clean(req.body.formid),
      documenttype: clean(req.body.documenttype),
      description: clean(req.body.description),
      isrequired: clean(req.body.isrequired || 'No')
    };
    const data = req.body.id
      ? await RecruitmentDocumentType.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentDocumentType.findOneAndUpdate({ colid, formid: payload.formid, documenttype: payload.documenttype }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getDocumentTypes = async (req, res) => {
  try { res.json(await RecruitmentDocumentType.find({ colid: getColid(req), formid: clean(req.query.formid) }).sort({ documenttype: 1 }).lean()); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteDocumentType = async (req, res) => {
  try { await RecruitmentDocumentType.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getCandidateStatuses = async (req, res) => {
  try {
    const colid = getColid(req);
    const data = await RecruitmentCandidateStatus.find({ colid }).sort({ status: 1 }).lean();
    if (data.length) return res.json(data);
    res.json(defaultCandidateStatuses.map((status) => ({ colid, status, description: '', isactive: 'Yes', isdefault: true })));
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveCandidateStatus = async (req, res) => {
  try {
    const colid = getColid(req);
    const payload = {
      colid,
      status: clean(req.body.status),
      description: clean(req.body.description),
      isactive: clean(req.body.isactive || 'Yes'),
      user: clean(req.body.user)
    };
    if (!payload.status) return res.status(400).json({ msg: 'Status is required' });
    const data = req.body.id
      ? await RecruitmentCandidateStatus.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentCandidateStatus.findOneAndUpdate({ colid, status: payload.status }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteCandidateStatus = async (req, res) => {
  try { await RecruitmentCandidateStatus.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getApprovalLevels = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.jobid) query.jobid = clean(req.query.jobid);
    res.json(await RecruitmentApprovalLevel.find(query).sort({ jobid: 1, level: 1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveApprovalLevel = async (req, res) => {
  try {
    const colid = getColid(req);
    const payload = {
      colid,
      jobid: clean(req.body.jobid),
      jobtitle: clean(req.body.jobtitle),
      level: Number(req.body.level || 1),
      approverrole: clean(req.body.approverrole),
      approvername: clean(req.body.approvername),
      approveremail: clean(req.body.approveremail).toLowerCase(),
      description: clean(req.body.description),
      isactive: clean(req.body.isactive || 'Yes'),
      user: clean(req.body.user)
    };
    if (!payload.jobid) return res.status(400).json({ msg: 'Job is required' });
    if (!payload.level) return res.status(400).json({ msg: 'Level is required' });
    const data = req.body.id
      ? await RecruitmentApprovalLevel.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentApprovalLevel.findOneAndUpdate({ colid, jobid: payload.jobid, level: payload.level }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteApprovalLevel = async (req, res) => {
  try { await RecruitmentApprovalLevel.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveValidationCriteria = async (req, res) => {
  try {
    const colid = getColid(req);
    const formid = clean(req.body.formid);
    const data = await RecruitmentValidationCriteria.findOneAndUpdate(
      { colid, formid },
      { colid, formid, formname: clean(req.body.formname), mandatorycriteria: clean(req.body.mandatorycriteria), validationcriteria: clean(req.body.validationcriteria) },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getValidationCriteria = async (req, res) => {
  try { res.json(await RecruitmentValidationCriteria.findOne({ colid: getColid(req), formid: clean(req.query.formid) }).lean() || {}); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveJob = async (req, res) => {
  try {
    const colid = getColid(req);
    const jobid = clean(req.body.jobid || `JOB${Date.now()}`);
    const status = clean(req.body.status || 'Draft');
    const isPosted = /^posted$/i.test(status);
    const existingJob = req.body.id
      ? await RecruitmentJobPost.findOne({ _id: req.body.id, colid }).lean()
      : await RecruitmentJobPost.findOne({ colid, jobid }).lean();
    const currentShareToken = clean(req.body.sharetoken || existingJob?.sharetoken);
    const payload = {
      colid,
      jobid,
      title: clean(req.body.title),
      department: clean(req.body.department),
      location: clean(req.body.location),
      employmenttype: clean(req.body.employmenttype),
      openings: Number(req.body.openings || 1),
      salaryrange: clean(req.body.salaryrange),
      description: clean(req.body.description),
      eligibility: clean(req.body.eligibility),
      skills: clean(req.body.skills),
      formid: clean(req.body.formid),
      status,
      sharetoken: isPosted ? (currentShareToken || `${jobid}_${Date.now()}`) : currentShareToken,
      posteddate: isPosted ? (req.body.posteddate || existingJob?.posteddate || new Date()) : req.body.posteddate,
      lastdate: req.body.lastdate || null,
      user: clean(req.body.user),
      createdByName: clean(req.body.createdByName)
    };
    const data = req.body.id
      ? await RecruitmentJobPost.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentJobPost.findOneAndUpdate({ colid, jobid }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getJobs = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.status) query.status = clean(req.query.status);
    res.json(await RecruitmentJobPost.find(query).sort({ createdAt: -1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteJob = async (req, res) => {
  try { await RecruitmentJobPost.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getPublicJobBundle = async (req, res) => {
  try {
    const colid = getColid(req);
    const job = await RecruitmentJobPost.findOne({ colid, jobid: clean(req.query.jobid), status: 'Posted' }).lean();
    if (!job) return res.status(404).json({ msg: 'Job not found or not posted' });
    if (job.sharetoken && req.query.token && job.sharetoken !== req.query.token) return res.status(403).json({ msg: 'Invalid job link' });
    const [form, fields, documents, criteria] = await Promise.all([
      RecruitmentForm.findOne({ colid, formid: job.formid }).lean(),
      RecruitmentFormField.find({ colid, formid: job.formid }).sort({ order: 1, createdAt: 1 }).lean(),
      RecruitmentDocumentType.find({ colid, formid: job.formid }).sort({ documenttype: 1 }).lean(),
      RecruitmentValidationCriteria.findOne({ colid, formid: job.formid }).lean()
    ]);
    res.json({ job, form, fields, documents, criteria });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'Select a file to upload' });
    const colid = getColid(req);
    const documenttype = clean(req.body.documenttype);
    if (!colid || !documenttype) return res.status(400).json({ msg: 'College id and document type are required' });
    if (/photo/i.test(documenttype)) {
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) return res.status(400).json({ msg: 'Photo must be JPG/JPEG/PNG' });
    }
    const config = await Awsconfig.findOne({ colid, type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean();
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) return res.status(400).json({ msg: 'Default AWS configuration is missing' });
    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, '_');
    const key = `${colid}/recruitment/${clean(req.body.jobid) || 'jobs'}/${cleanKey(documenttype)}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();
    res.json({
      documenttype,
      description: clean(req.body.description),
      originalname: req.file.originalname,
      filename: cleanName,
      mimetype: req.file.mimetype,
      size: req.file.size,
      key,
      url: s3Url(config.bucket, config.region, key),
      uploadedAt: new Date()
    });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.validateApplication = async (req, res) => {
  try {
    const payload = applicationPayload(req.body);
    const [fields, documents, criteria] = await Promise.all([
      RecruitmentFormField.find({ colid: payload.colid, formid: payload.formid }).lean(),
      RecruitmentDocumentType.find({ colid: payload.colid, formid: payload.formid }).lean(),
      RecruitmentValidationCriteria.findOne({ colid: payload.colid, formid: payload.formid }).lean()
    ]);
    const issues = [];
    if (!payload.applicantname) issues.push('Applicant name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) issues.push('Valid email is required.');
    if (String(payload.phone || '').replace(/\D/g, '').length < 10) issues.push('Valid phone number is required.');
    if (!hasPhoto(payload)) issues.push('Candidate photo is required.');
    fields.filter((f) => /^yes$/i.test(f.isrequired)).forEach((field) => {
      if (!clean(payload.customfields?.[field.fieldname])) issues.push(`${field.label || field.fieldname} is required.`);
    });
    documents.filter((d) => /^yes$/i.test(d.isrequired)).forEach((doc) => {
      const found = payload.documents.some((item) => clean(item.documenttype).toLowerCase() === clean(doc.documenttype).toLowerCase() && item.url);
      if (!found) issues.push(`${doc.documenttype} document is required.`);
    });

    const aiConfig = await getDefaultGeminiConfig(payload.colid);
    if (!aiConfig?.apikey) {
      const comments = [
        issues.length ? `Mandatory validation failed:\n${issues.map((item) => `- ${item}`).join('\n')}` : 'Mandatory validation passed.',
        criteria?.mandatorycriteria ? `Mandatory criteria not evaluated by AI because Gemini configuration is missing:\n${criteria.mandatorycriteria}` : '',
        criteria?.validationcriteria ? `Optional criteria not evaluated by AI because Gemini configuration is missing:\n${criteria.validationcriteria}` : ''
      ].filter(Boolean).join('\n\n');
      return res.json({ validationstatus: issues.length ? 'Fail' : 'Pass', mandatoryFailed: issues.length > 0 || !!criteria?.mandatorycriteria, validationcomments: comments, criteriaissues: issues });
    }

    const prompt = `
Validate this recruitment application. Return ONLY JSON:
{
 "validationstatus":"Pass/Fail",
 "mandatorycriteriaresult":"Pass/Fail",
 "validationcomments":"short summary",
 "criteriaissues":[{"criteriaType":"Mandatory/Optional","tab":"","field":"","status":"Pass/Fail","comment":""}]
}
Mandatory criteria:
${criteria?.mandatorycriteria || 'None'}
Optional criteria:
${criteria?.validationcriteria || 'None'}
System mandatory issues already detected:
${issues.map((item) => `- ${item}`).join('\n') || '- None'}
Application:
${JSON.stringify(payload, null, 2)}
Documents:
${JSON.stringify(payload.documents.map((doc) => ({ documenttype: doc.documenttype, url: doc.url, description: doc.description })), null, 2)}
If any system mandatory issue or mandatory criterion fails, mandatorycriteriaresult must be Fail.`;
    const ai = await callGeminiJson(aiConfig.apikey, prompt);
    const mandatoryFailed = issues.length > 0 || /^fail$/i.test(clean(ai.mandatorycriteriaresult)) || (ai.criteriaissues || []).some((item) => /mandatory/i.test(clean(item.criteriaType)) && /^fail$/i.test(clean(item.status)));
    const comments = [
      issues.length ? `System mandatory issues:\n${issues.map((item) => `- ${item}`).join('\n')}` : 'System mandatory checks passed.',
      ai.validationcomments || JSON.stringify(ai)
    ].join('\n\n');
    res.json({ validationstatus: mandatoryFailed ? 'Fail' : clean(ai.validationstatus || 'Pass'), mandatoryFailed, validationcomments: comments, criteriaissues: ai.criteriaissues || [], ai });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.submitApplication = async (req, res) => {
  try {
    const payload = applicationPayload(req.body);
    if (!payload.colid || !payload.jobid || !payload.formid) return res.status(400).json({ msg: 'Job, form and college id are required' });
    if (!payload.email || !payload.phone) return res.status(400).json({ msg: 'Email and phone are required' });
    if (!hasPhoto(payload)) return res.status(400).json({ msg: 'Candidate photo is required' });
    const existing = await RecruitmentApplication.findOne({ colid: payload.colid, jobid: payload.jobid, $or: [{ email: payload.email }, { phone: payload.phone }] });
    if (existing && clean(req.body.mode) !== 'update') return res.status(400).json({ msg: 'Application already exists for this email or phone' });
    if (!payload.applicationno) payload.applicationno = `REC-${payload.jobid}-${Date.now()}`;
    const data = existing
      ? await RecruitmentApplication.findByIdAndUpdate(existing._id, payload, { new: true, runValidators: true })
      : await RecruitmentApplication.create(payload);
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.retrieveApplication = async (req, res) => {
  try {
    const colid = getColid(req);
    const query = { colid };
    if (req.body.applicationno) query.applicationno = clean(req.body.applicationno);
    else if (req.body.email && req.body.phone) Object.assign(query, { email: clean(req.body.email).toLowerCase(), phone: clean(req.body.phone) });
    else return res.status(400).json({ msg: 'Enter application number or email and phone' });
    const data = await RecruitmentApplication.findOne(query).lean();
    if (!data) return res.status(404).json({ msg: 'Application not found' });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getApplications = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.jobid) query.jobid = clean(req.query.jobid);
    if (req.query.status) query.status = clean(req.query.status);
    res.json(await RecruitmentApplication.find(query).sort({ submittedat: -1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const colid = getColid(req);
    const status = clean(req.body.status);
    const data = await RecruitmentApplication.findOneAndUpdate(
      { _id: req.body.id, colid: getColid(req) },
      { status, shortlistcomments: clean(req.body.shortlistcomments), ...(req.body.approvalstatus ? { approvalstatus: clean(req.body.approvalstatus) } : {}) },
      { new: true }
    );

    if (!data) return res.status(404).json({ msg: 'Candidate not found' });

    let mailSent = false;
    if (/^confirmed$/i.test(status) && clean(req.body.emailbody)) {
      await sendCandidateStatusEmail({
        colid,
        candidate: data,
        subject: clean(req.body.emailsubject) || 'Recruitment confirmation',
        body: req.body.emailbody,
        senderName: clean(req.body.senderName || req.body.name || 'Recruitment')
      });
      mailSent = true;
    }

    res.json({ ...data.toObject(), mailSent });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.updateApplicationApproval = async (req, res) => {
  try {
    const colid = getColid(req);
    const action = clean(req.body.action);
    const comments = clean(req.body.comments);
    const application = await RecruitmentApplication.findOne({ _id: req.body.id, colid });
    if (!application) return res.status(404).json({ msg: 'Candidate not found' });

    const levels = await RecruitmentApprovalLevel.find({ colid, jobid: application.jobid, isactive: /^yes$/i }).sort({ level: 1 }).lean();
    const currentIndex = levels.findIndex((level) => Number(level.level) > Number(application.approvallevel || 0));
    const currentLevel = currentIndex >= 0 ? levels[currentIndex] : levels[levels.length - 1];
    const historyItem = {
      action,
      comments,
      level: currentLevel?.level || application.approvallevel || 0,
      approvername: clean(req.body.approvername),
      approveremail: clean(req.body.approveremail),
      time: new Date()
    };

    if (/reject/i.test(action)) {
      application.approvalstatus = 'Rejected';
      application.status = clean(req.body.status || 'Rejected');
    } else if (/approve/i.test(action)) {
      if (!levels.length || currentIndex === levels.length - 1) {
        application.approvalstatus = 'Approved';
        application.status = clean(req.body.status || 'Approved');
        application.approvallevel = currentLevel?.level || application.approvallevel || 0;
      } else {
        application.approvalstatus = 'Pending';
        application.status = clean(req.body.status || `Pending Level ${levels[currentIndex + 1].level}`);
        application.approvallevel = currentLevel?.level || 0;
      }
    } else {
      return res.status(400).json({ msg: 'Action must be Approve or Reject' });
    }

    application.shortlistcomments = comments || application.shortlistcomments;
    application.approvalhistory = [...(application.approvalhistory || []), historyItem];
    await application.save();
    res.json(application);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.shortlistWithAi = async (req, res) => {
  try {
    const colid = getColid(req);
    const jobid = clean(req.body.jobid);
    const instruction = clean(req.body.instruction);
    const applications = await RecruitmentApplication.find({ colid, jobid }).lean();
    const aiConfig = await getDefaultGeminiConfig(colid);
    if (!aiConfig?.apikey) return res.status(400).json({ msg: 'Active/default Gemini configuration is missing' });
    const prompt = `
You are shortlisting recruitment candidates. Return ONLY JSON:
{"selected":[{"applicationno":"","reason":""}],"rejected":[{"applicationno":"","reason":""}]}
Instruction in English:
${instruction}
Candidates:
${JSON.stringify(applications.map((app) => ({
  applicationno: app.applicationno,
  applicantname: app.applicantname,
  email: app.email,
  phone: app.phone,
  customfields: app.customfields,
  validationstatus: app.validationstatus,
  validationcomments: app.validationcomments
})), null, 2)}`;
    const ai = await callGeminiJson(aiConfig.apikey, prompt);
    const selected = Array.isArray(ai.selected) ? ai.selected : [];
    for (const item of selected) {
      await RecruitmentApplication.updateOne(
        { colid, jobid, applicationno: item.applicationno },
        { status: 'Shortlisted', shortlistcomments: item.reason || instruction }
      );
    }
    res.json({ success: true, ai, selectedCount: selected.length });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

const regex = (value) => ({ $regex: clean(value), $options: 'i' });

exports.searchRecruitmentUsers = async (req, res) => {
  try {
    const colid = getColid(req);
    const term = clean(req.query.search);
    const query = { colid };
    if (term) {
      query.$or = [
        { name: regex(term) },
        { email: regex(term) },
        { phone: regex(term) },
        { department: regex(term) },
        { designation: regex(term) }
      ];
    }
    const data = await User.find(query)
      .select('name email phone department designation role colid')
      .sort({ name: 1 })
      .limit(100)
      .lean();
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveInterviewPanel = async (req, res) => {
  try {
    const colid = getColid(req);
    const panelid = clean(req.body.panelid || `PANEL${Date.now()}`);
    const payload = {
      colid,
      panelid,
      panelname: clean(req.body.panelname),
      description: clean(req.body.description),
      status: clean(req.body.status || 'Active'),
      user: clean(req.body.user),
      createdByName: clean(req.body.createdByName)
    };
    if (!payload.panelname) return res.status(400).json({ msg: 'Panel name is required' });
    const data = req.body.id
      ? await RecruitmentInterviewPanel.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentInterviewPanel.findOneAndUpdate({ colid, panelid }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getInterviewPanels = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.status) query.status = clean(req.query.status);
    res.json(await RecruitmentInterviewPanel.find(query).sort({ createdAt: -1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteInterviewPanel = async (req, res) => {
  try {
    const colid = getColid(req);
    const panel = await RecruitmentInterviewPanel.findOne({ _id: req.body.id, colid }).lean();
    await RecruitmentInterviewPanel.deleteOne({ _id: req.body.id, colid });
    if (panel?.panelid) {
      await RecruitmentPanelMember.deleteMany({ colid, panelid: panel.panelid });
      await RecruitmentPanelJob.deleteMany({ colid, panelid: panel.panelid });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.savePanelMember = async (req, res) => {
  try {
    const colid = getColid(req);
    const payload = {
      colid,
      panelid: clean(req.body.panelid),
      panelname: clean(req.body.panelname),
      membername: clean(req.body.membername || req.body.name),
      memberemail: clean(req.body.memberemail || req.body.email).toLowerCase(),
      memberphone: clean(req.body.memberphone || req.body.phone),
      designation: clean(req.body.designation),
      department: clean(req.body.department),
      qualification: clean(req.body.qualification),
      remunerationtype: clean(req.body.remunerationtype),
      remunerationamount: Number(req.body.remunerationamount || 0),
      remarks: clean(req.body.remarks),
      user: clean(req.body.user)
    };
    if (!payload.panelid) return res.status(400).json({ msg: 'Panel is required' });
    if (!payload.membername || !payload.memberemail) return res.status(400).json({ msg: 'Member name and email are required' });
    const data = req.body.id
      ? await RecruitmentPanelMember.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentPanelMember.findOneAndUpdate({ colid, panelid: payload.panelid, memberemail: payload.memberemail }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getPanelMembers = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.panelid) query.panelid = clean(req.query.panelid);
    res.json(await RecruitmentPanelMember.find(query).sort({ panelname: 1, membername: 1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deletePanelMember = async (req, res) => {
  try { await RecruitmentPanelMember.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.savePanelJob = async (req, res) => {
  try {
    const colid = getColid(req);
    const payload = {
      colid,
      panelid: clean(req.body.panelid),
      panelname: clean(req.body.panelname),
      jobid: clean(req.body.jobid),
      jobtitle: clean(req.body.jobtitle),
      department: clean(req.body.department),
      status: clean(req.body.status || 'Active'),
      remarks: clean(req.body.remarks),
      user: clean(req.body.user)
    };
    if (!payload.panelid || !payload.jobid) return res.status(400).json({ msg: 'Panel and job are required' });
    const data = req.body.id
      ? await RecruitmentPanelJob.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentPanelJob.findOneAndUpdate({ colid, panelid: payload.panelid, jobid: payload.jobid }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getPanelJobs = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.panelid) query.panelid = clean(req.query.panelid);
    if (req.query.jobid) query.jobid = clean(req.query.jobid);
    res.json(await RecruitmentPanelJob.find(query).sort({ createdAt: -1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deletePanelJob = async (req, res) => {
  try { await RecruitmentPanelJob.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getInterviewPanelJobs = async (req, res) => {
  try {
    const colid = getColid(req);
    const jobid = clean(req.query.jobid);
    if (!jobid) return res.json([]);
    res.json(await RecruitmentPanelJob.find({ colid, jobid, status: /^active$/i }).sort({ panelname: 1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveInterviewSchedule = async (req, res) => {
  try {
    const colid = getColid(req);
    const selected = Array.isArray(req.body.candidates) ? req.body.candidates : [req.body];
    const common = {
      colid,
      jobid: clean(req.body.jobid),
      jobtitle: clean(req.body.jobtitle),
      panelid: clean(req.body.panelid),
      panelname: clean(req.body.panelname),
      interviewdate: req.body.interviewdate || null,
      interviewtime: clean(req.body.interviewtime),
      mode: clean(req.body.mode || 'Offline'),
      venue: clean(req.body.venue),
      meetinglink: clean(req.body.meetinglink),
      status: clean(req.body.status || 'Scheduled'),
      remarks: clean(req.body.remarks),
      user: clean(req.body.user)
    };
    if (!common.jobid || !common.panelid || !common.interviewdate) return res.status(400).json({ msg: 'Job, panel and interview date are required' });
    const saved = [];
    for (const candidate of selected) {
      const payload = {
        ...common,
        applicationid: clean(candidate.applicationid || candidate._id || req.body.applicationid),
        applicationno: clean(candidate.applicationno || req.body.applicationno),
        candidate: clean(candidate.candidate || candidate.applicantname || req.body.candidate),
        candidateemail: clean(candidate.candidateemail || candidate.email || req.body.candidateemail).toLowerCase(),
        candidatephone: clean(candidate.candidatephone || candidate.phone || req.body.candidatephone)
      };
      if (!payload.applicationid && !payload.candidateemail) continue;
      const data = req.body.id && selected.length === 1
        ? await RecruitmentInterviewSchedule.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
        : await RecruitmentInterviewSchedule.findOneAndUpdate(
          { colid, jobid: payload.jobid, panelid: payload.panelid, applicationid: payload.applicationid },
          payload,
          { upsert: true, new: true, runValidators: true }
        );
      saved.push(data);
    }
    res.json({ success: true, saved });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getInterviewSchedules = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.jobid) query.jobid = clean(req.query.jobid);
    if (req.query.panelid) query.panelid = clean(req.query.panelid);
    if (req.query.status) query.status = clean(req.query.status);
    res.json(await RecruitmentInterviewSchedule.find(query).sort({ interviewdate: -1, interviewtime: 1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteInterviewSchedule = async (req, res) => {
  try { await RecruitmentInterviewSchedule.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getPanelClassCalendar = async (req, res) => {
  try {
    const colid = getColid(req);
    const panelid = clean(req.query.panelid);
    const classdate = clean(req.query.classdate || req.query.interviewdate);
    if (!panelid || !classdate) return res.json({ members: [], classes: [] });

    const members = await RecruitmentPanelMember.find({ colid, panelid }).sort({ membername: 1 }).lean();
    const emails = members.map((member) => clean(member.memberemail).toLowerCase()).filter(Boolean);
    if (!emails.length) return res.json({ members, classes: [] });

    const classes = await NepLmsTimetable.find({
      colid,
      classdate,
      facultyemail: { $in: emails.map((email) => new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
    }).sort({ classtime: 1, faculty: 1 }).lean();

    res.json({ members, classes });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

const sampleOfferTemplates = [
  ['PERM_FAC_ASSISTANT', 'Permanent Faculty - Assistant Professor', 'Assistant Professor'],
  ['PERM_FAC_ASSOCIATE', 'Permanent Faculty - Associate Professor', 'Associate Professor'],
  ['PERM_FAC_PROFESSOR', 'Permanent Faculty - Professor', 'Professor'],
  ['CONTRACT_FAC_LECTURE', 'Contractual Faculty - Lecture Wise', 'Contractual Faculty'],
  ['CONTRACT_FAC_MONTHLY', 'Contractual Faculty - Monthly', 'Contractual Faculty'],
  ['VISITING_FACULTY', 'Visiting Faculty', 'Visiting Faculty'],
  ['ADMIN_STAFF', 'Administrative Staff', 'Administrative Officer'],
  ['LAB_TECHNICIAN', 'Laboratory Technician', 'Lab Technician'],
  ['COUNSELOR', 'Admission Counselor', 'Counselor'],
  ['LIBRARIAN', 'Librarian', 'Librarian']
].map(([templateid, templatename, jobrole]) => ({
  templateid,
  templatename,
  jobrole,
  description: `Sample offer letter template for ${jobrole}`,
  status: 'Active',
  issample: 'Yes',
  htmlcontent: `
<div style="font-family:Arial,sans-serif;color:#111;line-height:1.55;font-size:14px">
  <div style="text-align:center;border-bottom:1px solid #111;padding-bottom:10px;margin-bottom:18px">
    <img src="{{institutionlogo}}" style="max-height:70px;max-width:140px;object-fit:contain" />
    <h2 style="margin:8px 0 4px 0">{{institutionname}}</h2>
    <div>{{institutionaddress}}</div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:18px">
    <div><b>Offer No:</b> {{offerid}}</div>
    <div><b>Date:</b> {{today}}</div>
  </div>
  <p>Dear {{name}},</p>
  <p>We are pleased to offer you the position of <b>{{designation}}</b> for the role/category <b>${jobrole}</b> at {{institutionname}}.</p>
  <p>Your registered email is <b>{{email}}</b> and contact number is <b>{{phone}}</b>. The proposed salary/contract value is <b>{{salary}}</b>, subject to institutional policy, verification of documents, and completion of onboarding requirements.</p>
  <p>You will report as per the joining instructions issued by the institution. This offer is governed by institutional service rules, statutory compliance, confidentiality obligations, and satisfactory document verification.</p>
  <p>Kindly sign and return a copy of this offer as acceptance.</p>
  <br/>
  <table style="width:100%;margin-top:30px">
    <tr><td style="width:50%"><b>Candidate Signature</b></td><td style="text-align:right"><b>Authorized Signatory</b></td></tr>
  </table>
</div>`
}));

const seedOfferTemplates = async (colid) => {
  const count = await RecruitmentOfferTemplate.countDocuments({ colid });
  if (count > 0) return;
  await RecruitmentOfferTemplate.insertMany(sampleOfferTemplates.map((template) => ({ ...template, colid })));
};

const replaceOfferPlaceholders = (html, data = {}) => String(html || '').replace(/\{\{\s*([a-zA-Z0-9_.$-]+)\s*\}\}/g, (_, key) => {
  const normalized = String(key || '').toLowerCase();
  if (data[normalized] !== undefined && data[normalized] !== null) return String(data[normalized]);
  return '';
});

const finalCandidateQuery = (colid, jobid) => ({
  colid,
  ...(jobid ? { jobid } : {}),
  $or: [
    { approvalstatus: /^approved$/i },
    { status: /^approved$/i },
    { status: /^confirmed$/i },
    { status: /^selected$/i },
    { status: /^final approved$/i }
  ]
});

exports.getOfferTemplates = async (req, res) => {
  try {
    const colid = getColid(req);
    await seedOfferTemplates(colid);
    const query = { colid };
    if (req.query.status) query.status = clean(req.query.status);
    res.json(await RecruitmentOfferTemplate.find(query).sort({ issample: -1, templatename: 1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveOfferTemplate = async (req, res) => {
  try {
    const colid = getColid(req);
    const templateid = cleanKey(req.body.templateid || req.body.templatename || `offer_${Date.now()}`);
    const payload = {
      colid,
      templateid,
      templatename: clean(req.body.templatename),
      jobrole: clean(req.body.jobrole),
      description: clean(req.body.description),
      htmlcontent: String(req.body.htmlcontent || ''),
      status: clean(req.body.status || 'Active'),
      issample: clean(req.body.issample || 'No'),
      user: clean(req.body.user)
    };
    if (!payload.templatename) return res.status(400).json({ msg: 'Template name is required' });
    const data = req.body.id
      ? await RecruitmentOfferTemplate.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentOfferTemplate.findOneAndUpdate({ colid, templateid }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteOfferTemplate = async (req, res) => {
  try { await RecruitmentOfferTemplate.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getFinalCandidates = async (req, res) => {
  try {
    const colid = getColid(req);
    const jobid = clean(req.query.jobid);
    res.json(await RecruitmentApplication.find(finalCandidateQuery(colid, jobid)).sort({ applicantname: 1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.generateOfferLetter = async (req, res) => {
  try {
    const colid = getColid(req);
    const [candidate, template, job, institution] = await Promise.all([
      RecruitmentApplication.findOne({ _id: req.body.applicationid, colid }).lean(),
      RecruitmentOfferTemplate.findOne({ _id: req.body.templateid, colid }).lean(),
      RecruitmentJobPost.findOne({ colid, jobid: clean(req.body.jobid) }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    if (!candidate) return res.status(404).json({ msg: 'Candidate not found' });
    if (!template) return res.status(404).json({ msg: 'Offer template not found' });
    const values = {
      institutionname: institution?.institutionname || '',
      institutionlogo: institution?.logolink || '',
      institutionaddress: institution?.address || '',
      offerid: `OFFER-${candidate.applicationno || candidate._id}`,
      today: new Date().toISOString().slice(0, 10),
      name: candidate.applicantname,
      email: candidate.email,
      phone: candidate.phone,
      designation: clean(req.body.designation || job?.title || template.jobrole),
      salary: clean(req.body.salary || job?.salaryrange),
      jobtitle: job?.title || '',
      jobid: job?.jobid || candidate.jobid,
      department: job?.department || '',
      ...Object.fromEntries(Object.entries(candidate.customfields || {}).map(([key, value]) => [String(key).toLowerCase(), value]))
    };
    const html = replaceOfferPlaceholders(template.htmlcontent, values);
    res.json({ html, candidate, template, job, institution });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getOnboardingSteps = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.role) query.role = clean(req.query.role);
    if (req.query.status) query.status = clean(req.query.status);
    res.json(await RecruitmentOnboardingStep.find(query).sort({ role: 1, order: 1, stepname: 1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveOnboardingStep = async (req, res) => {
  try {
    const colid = getColid(req);
    const role = clean(req.body.role);
    const stepid = cleanKey(req.body.stepid || req.body.stepname || `step_${Date.now()}`);
    const payload = {
      colid,
      role,
      stepid,
      stepname: clean(req.body.stepname),
      description: clean(req.body.description),
      order: numberOrZero(req.body.order),
      documentrequired: clean(req.body.documentrequired || 'No'),
      status: clean(req.body.status || 'Active'),
      user: clean(req.body.user)
    };
    if (!payload.role || !payload.stepname) return res.status(400).json({ msg: 'Role and step name are required' });
    const data = req.body.id
      ? await RecruitmentOnboardingStep.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await RecruitmentOnboardingStep.findOneAndUpdate({ colid, role, stepid }, payload, { upsert: true, new: true, runValidators: true });
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.deleteOnboardingStep = async (req, res) => {
  try { await RecruitmentOnboardingStep.deleteOne({ _id: req.body.id, colid: getColid(req) }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.addCandidatesToUsers = async (req, res) => {
  try {
    const colid = getColid(req);
    const role = clean(req.body.role);
    if (!role) return res.status(400).json({ msg: 'Role is required' });
    const ids = Array.isArray(req.body.applicationids) ? req.body.applicationids : [];
    const mappedUsers = Array.isArray(req.body.mappedUsers) ? req.body.mappedUsers : [];
    const mappedByApplication = new Map(mappedUsers.map((item) => [clean(item.applicationid), item]));
    const applications = await RecruitmentApplication.find({ colid, _id: { $in: ids } }).lean();
    const saved = [];
    for (const app of applications) {
      const reviewed = mappedByApplication.get(String(app._id)) || {};
      const reviewedCustomFields = reviewed.customFields && typeof reviewed.customFields === 'object' ? reviewed.customFields : {};
      const email = clean(reviewed.email || app.email).toLowerCase();
      if (!email) continue;
      const payload = {
        email,
        name: clean(reviewed.name || app.applicantname) || 'NA',
        phone: clean(reviewed.phone || app.phone) || 'NA',
        password: clean(reviewed.password || app.password) || Math.random().toString(36).slice(2, 10),
        role: clean(reviewed.role || role),
        regno: clean(reviewed.regno) || email,
        scholarnumber: clean(reviewed.scholarnumber),
        abcid: clean(reviewed.abcid),
        program: clean(reviewed.program) || 'NA',
        programcode: clean(reviewed.programcode) || 'NA',
        admissionyear: clean(reviewed.admissionyear) || 'NA',
        academicyear: clean(reviewed.academicyear) || 'NA',
        rollno: clean(reviewed.rollno),
        semester: clean(reviewed.semester) || 'NA',
        section: clean(reviewed.section) || 'NA',
        gender: clean(reviewed.gender),
        state: clean(reviewed.state),
        city: clean(reviewed.city),
        district: clean(reviewed.district),
        pincode: clean(reviewed.pincode),
        department: clean(reviewed.department || req.body.department || app.customfields?.department) || 'NA',
        designation: clean(reviewed.designation || req.body.designation || app.customfields?.designation) || 'NA',
        address: clean(reviewed.address || app.customfields?.address) || 'NA',
        category: clean(reviewed.category),
        institution: clean(reviewed.institution),
        Mediumofinstruction: clean(reviewed.Mediumofinstruction || reviewed.mediumofinstruction),
        regulation: clean(reviewed.regulation),
        Major: clean(reviewed.Major || reviewed.major),
        Minor: clean(reviewed.Minor || reviewed.minor),
        AEC: clean(reviewed.AEC || reviewed.aec),
        SEC: clean(reviewed.SEC || reviewed.sec),
        VAC: clean(reviewed.VAC || reviewed.vac),
        IDC: clean(reviewed.IDC || reviewed.idc),
        MDC: clean(reviewed.MDC || reviewed.mdc),
        specialization1: clean(reviewed.specialization1),
        specialization2: clean(reviewed.specialization2),
        colid,
        status: Number(reviewed.status || 1),
        user: clean(req.body.user),
        addedby: clean(req.body.user),
        joiningdate: reviewed.joiningdate || req.body.joiningdate || new Date(),
        lastlogin: reviewed.lastlogin || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        photo: clean(reviewed.photo || app.photourl),
        customFields: { ...(app.customfields || {}), ...reviewedCustomFields }
      };
      const user = await User.findOneAndUpdate({ email }, payload, { upsert: true, new: true, runValidators: true });
      await RecruitmentApplication.updateOne({ _id: app._id, colid }, { status: 'Onboarding', approvalstatus: app.approvalstatus || 'Approved' });
      saved.push(user);
    }
    res.json({ success: true, count: saved.length, saved });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveOnboardingRecord = async (req, res) => {
  try {
    const colid = getColid(req);
    const candidate = await RecruitmentApplication.findOne({ _id: req.body.applicationid, colid }).lean();
    if (!candidate) return res.status(404).json({ msg: 'Candidate not found' });
    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
    const completed = steps.length && steps.every((step) => /^complete$/i.test(clean(step.status)));
    const payload = {
      colid,
      jobid: clean(req.body.jobid || candidate.jobid),
      jobtitle: clean(req.body.jobtitle),
      applicationid: clean(req.body.applicationid),
      applicationno: candidate.applicationno,
      candidate: candidate.applicantname,
      candidateemail: candidate.email,
      candidatephone: candidate.phone,
      role: clean(req.body.role),
      overallstatus: completed ? 'Complete' : clean(req.body.overallstatus || 'Pending'),
      steps,
      remarks: clean(req.body.remarks),
      completedat: completed ? new Date() : null,
      user: clean(req.body.user)
    };
    const data = await RecruitmentOnboardingRecord.findOneAndUpdate(
      { colid, jobid: payload.jobid, applicationid: payload.applicationid },
      payload,
      { upsert: true, new: true, runValidators: true }
    );
    res.json(data);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getOnboardingRecords = async (req, res) => {
  try {
    const query = { colid: getColid(req) };
    if (req.query.jobid) query.jobid = clean(req.query.jobid);
    if (req.query.applicationid) query.applicationid = clean(req.query.applicationid);
    if (req.query.role) query.role = clean(req.query.role);
    if (req.query.overallstatus) query.overallstatus = clean(req.query.overallstatus);
    res.json(await RecruitmentOnboardingRecord.find(query).sort({ updatedAt: -1 }).lean());
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getOnboardingReport = async (req, res) => {
  try {
    const colid = getColid(req);
    const jobid = clean(req.query.jobid);
    const records = await RecruitmentOnboardingRecord.find({ colid, ...(jobid ? { jobid } : {}) }).sort({ candidate: 1 }).lean();
    const stageMap = new Map();
    for (const record of records) {
      for (const step of record.steps || []) {
        const key = clean(step.stepname || step.stepid || 'Unknown');
        const current = stageMap.get(key) || { stage: key, complete: 0, pending: 0, total: 0 };
        current.total += 1;
        if (/^complete$/i.test(clean(step.status))) current.complete += 1;
        else current.pending += 1;
        stageMap.set(key, current);
      }
    }
    const summary = records.reduce((acc, row) => {
      const key = clean(row.overallstatus || 'Pending');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    res.json({ records, stagewise: Array.from(stageMap.values()), summary });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};
