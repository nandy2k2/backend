const nodemailer = require('nodemailer');
const AdmissionApplication = require('../Models/admissionapplicationdynamic');
const AdmissionFormField = require('../Models/admissionformfield');
const EmailConfiguration = require('../Models/emailconfigurationds');
const RegulationMaster = require('../Models/regulationmasterds');
const RegulationSubject = require('../Models/regulationsubjectds');
const MPrograms = require('../Models/mprograms');
const User = require('../Models/user');

const baseFields = [
  'formid',
  'academicyear',
  'name',
  'username',
  'password',
  'email',
  'phone',
  'regno',
  'address',
  'pin',
  'country_form',
  'state_form',
  'district_form',
  'result_status_12th',
  'board_12th',
  'marks_type_12th',
  'marks_12',
  'cgpa_12',
  'result_status_10th',
  'board_10th',
  'marks_type_10th',
  'marks_10',
  'cgpa_10',
  'University_UG',
  'result_status_UG',
  'marks_type_UG',
  'marks_UG',
  'cgpa_UG',
  'University_PG',
  'result_status_PG',
  'marks_type_PG',
  'marks_PG',
  'cgpa_PG',
  'gender',
  'category',
  'ews',
  'ph',
  'minority',
  'tenthmarks',
  'twelvemarks',
  'externaltheorymarks',
  'englishmarks',
  'dateofbirth',
  'dateofapplication',
  'age',
  'twelvesubjects',
  'programtype',
  'programapplied',
  'programcode',
  'applicationstatus',
  'enrollmentstatus',
  'applicationcomments',
  'validationstatus',
  'validationcomments',
  'applicationfeeamount',
  'paymentstatus',
  'paymentrefno',
  'paidamount',
  'paiddate',
  'provisionalfeeamount',
  'provisionalpaymentstatus',
  'provisionalpaymentrefno',
  'provisionalpaidamount',
  'provisionalpaiddate',
  'user',
  'createdAt',
  'updatedAt'
];

const labels = {
  formid: 'Form ID',
  academicyear: 'Academic Year',
  name: 'Name',
  username: 'Username',
  password: 'Password',
  email: 'Email',
  phone: 'Phone',
  regno: 'Reg No',
  country_form: 'Country',
  state_form: 'State',
  district_form: 'District',
  programtype: 'Program Type',
  programapplied: 'Program',
  programcode: 'Program Code',
  applicationstatus: 'Application Status',
  enrollmentstatus: 'Enrollment Status',
  applicationcomments: 'Application Comments',
  validationstatus: 'Validation Status',
  paymentstatus: 'Application Fee Status',
  provisionalpaymentstatus: 'Provisional Fee Status'
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const clean = (value) => String(value ?? '').trim();
const escapeRegex = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const safeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const customFieldId = (fieldname) => `extraFields.${fieldname}`;
const fieldLabel = (field) => labels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const randomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const getNestedValue = (row, field) => {
  if (field.startsWith('extraFields.')) return row.extraFields?.[field.replace('extraFields.', '')];
  return row[field];
};

const addFilter = (query, filter) => {
  if (!filter?.field) return;
  const value = filter.value;
  if (value === undefined || value === null || (Array.isArray(value) && !value.length) || (!Array.isArray(value) && clean(value) === '')) return;
  if (Array.isArray(value)) {
    const values = value.map(clean).filter(Boolean);
    if (values.length) query[filter.field] = { $in: values };
    return;
  }
  query[filter.field] = { $regex: escapeRegex(value), $options: 'i' };
};

const getSmtpHost = (config = {}) => {
  if (config.smtp) return config.smtp;
  if (config.smptp) return config.smptp;
  if (/gmail/i.test(config.provider || '')) return 'smtp.gmail.com';
  return '';
};

const createTransporter = (config) => {
  const port = Number(config.port) || (/gmail/i.test(config.provider || '') ? 465 : 587);
  const secureValue = String(config.secure || '').toLowerCase();
  return nodemailer.createTransport({
    host: getSmtpHost(config),
    port,
    secure: secureValue === 'yes' || secureValue === 'true' || port === 465,
    auth: {
      user: config.username,
      pass: config.password
    }
  });
};

const loadDefaultGmailConfig = async (colid) => {
  const base = { colid, provider: /^gmail$/i, isactive: /^Yes$/i };
  const defaultConfig = await EmailConfiguration.findOne({ ...base, default: /^Yes$/i }).sort({ updatedAt: -1, createdAt: -1 }).lean();
  if (defaultConfig) return defaultConfig;
  return EmailConfiguration.findOne(base).sort({ updatedAt: -1, createdAt: -1 }).lean();
};

exports.getOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });

    const customFields = await AdmissionFormField.find({ colid, isactive: /^Yes$/i })
      .select('fieldname label formid page section order')
      .sort({ formid: 1, order: 1, createdAt: 1 })
      .lean();
    const observedApplications = await AdmissionApplication.find({ colid }).select('extraFields').lean();
    const observedExtraKeys = Array.from(new Set(
      observedApplications.flatMap((item) => {
        if (!item.extraFields || typeof item.extraFields !== 'object' || Array.isArray(item.extraFields)) return [];
        return Object.keys(item.extraFields);
      })
    )).sort();

    const customMap = new Map();
    customFields.forEach((field) => {
      if (!field.fieldname) return;
      customMap.set(field.fieldname, {
        field: customFieldId(field.fieldname),
        label: field.label || field.fieldname,
        source: 'custom',
        formid: field.formid || '',
        page: field.page || '',
        section: field.section || ''
      });
    });
    observedExtraKeys.forEach((fieldname) => {
      if (!fieldname || customMap.has(fieldname)) return;
      customMap.set(fieldname, {
        field: customFieldId(fieldname),
        label: fieldname,
        source: 'custom',
        formid: '',
        page: '',
        section: ''
      });
    });

    const fields = [
      ...baseFields.map((field) => ({ field, label: fieldLabel(field), source: 'base' })),
      ...Array.from(customMap.values())
    ];

    const options = {};
    await Promise.all(fields.map(async ({ field }) => {
      if (field === 'password' || field === 'validationcomments') return;
      const values = await AdmissionApplication.distinct(field, { colid });
      options[field] = values.map(clean).filter(Boolean).sort((a, b) => a.localeCompare(b));
    }));

    res.json({ fields, options });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.searchApplications = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    const query = { colid };
    (Array.isArray(req.body.filters) ? req.body.filters : []).forEach((filter) => addFilter(query, filter));
    const data = await AdmissionApplication.find(query).sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getGeneralAdmissionOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const academicyear = clean(req.query.academicyear);
    const regulation = clean(req.query.regulation);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });

    const yearValues = await Promise.all([
      AdmissionApplication.distinct('academicyear', { colid }),
      RegulationSubject.distinct('academicyear', { colid }),
      MPrograms.distinct('year', { colid })
    ]);
    const academicyears = Array.from(new Set(yearValues.flat().map(clean).filter(Boolean))).sort();

    let regulationValues = [];
    if (academicyear) {
      regulationValues = await RegulationSubject.distinct('regulation', { colid, academicyear });
    }
    if (!regulationValues.length) {
      regulationValues = (await RegulationMaster.find({ colid, isactive: /^Yes$/i }).select('regulation').lean()).map((item) => item.regulation);
    }
    const regulations = Array.from(new Set(regulationValues.map(clean).filter(Boolean))).sort();

    const programMap = new Map();
    const subjectQuery = { colid };
    if (academicyear) subjectQuery.academicyear = academicyear;
    if (regulation) subjectQuery.regulation = regulation;
    const subjectPrograms = await RegulationSubject.find(subjectQuery).select('program programcode').lean();
    subjectPrograms.forEach((item) => {
      const programcode = clean(item.programcode);
      const program = clean(item.program);
      if (programcode || program) programMap.set(programcode || program, { program, programcode });
    });
    if (!programMap.size) {
      const programQuery = { colid };
      if (academicyear) programQuery.year = academicyear;
      const programs = await MPrograms.find(programQuery).select('program programcode name Order').sort({ Order: 1, program: 1 }).lean();
      programs.forEach((item) => {
        const programcode = clean(item.programcode);
        const program = clean(item.program || item.name);
        if (programcode || program) programMap.set(programcode || program, { program, programcode });
      });
    }

    res.json({
      academicyears,
      regulations,
      programs: Array.from(programMap.values()).sort((a, b) => `${a.program} ${a.programcode}`.localeCompare(`${b.program} ${b.programcode}`))
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.generalAdmissionBulkAdmit = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const applicationIds = Array.isArray(req.body.applicationIds) ? req.body.applicationIds.filter(Boolean) : [];
    const contactOverrides = req.body.contactOverrides && typeof req.body.contactOverrides === 'object' ? req.body.contactOverrides : {};
    const academicyear = clean(req.body.academicyear);
    const regulation = clean(req.body.regulation);
    const program = clean(req.body.program);
    const programcode = clean(req.body.programcode);
    const semester = clean(req.body.semester);
    const section = clean(req.body.section);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    if (!applicationIds.length) return res.status(400).json({ msg: 'Select at least one applicant' });
    const missingPanel = [];
    if (!academicyear) missingPanel.push('academic year');
    if (!regulation) missingPanel.push('regulation');
    if (!program) missingPanel.push('program');
    if (!programcode) missingPanel.push('program code');
    if (!semester) missingPanel.push('semester');
    if (!section) missingPanel.push('section');
    if (missingPanel.length) return res.status(400).json({ msg: `Missing fields: ${missingPanel.join(', ')}` });

    // console.log('[GeneralAdmission] Bulk admit request', {
    //   colid,
    //   academicyear,
    //   regulation,
    //   program,
    //   programcode,
    //   semester,
    //   section,
    //   applicationCount: applicationIds.length,
    //   actionUser: clean(req.body.user)
    // });

    const applications = await AdmissionApplication.find({ colid, _id: { $in: applicationIds } }).lean();
    // console.log('[GeneralAdmission] Applications loaded', {
    //   requested: applicationIds.length,
    //   found: applications.length,
    //   ids: applications.map((item) => String(item._id))
    // });
    const applicationById = new Map(applications.map((item) => [String(item._id), item]));
    const created = [];
    const errors = [];
    let sequence = await User.countDocuments({
      colid,
      role: { $regex: /^Student$/i },
      academicyear,
      programcode
    });

    for (const applicationId of applicationIds) {
      const application = applicationById.get(String(applicationId));
      // console.log('[GeneralAdmission] Processing application', {
      //   applicationId,
      //   found: Boolean(application),
      //   name: application?.name,
      //   status: application?.applicationstatus,
      //   email: application?.email,
      //   phone: application?.phone
      // });
      if (!application) {
        errors.push({ applicationId, msg: 'Application not found' });
        continue;
      }
      if (application.applicationstatus && !/^Applied$/i.test(application.applicationstatus)) {
        errors.push({ applicationId, name: application.name, msg: `Application status is ${application.applicationstatus}` });
        continue;
      }
      const overrides = contactOverrides[String(applicationId)] || {};
      const email = clean(overrides.email || application.email).toLowerCase();
      const phone = clean(overrides.phone || application.phone);
      if (!email || !phone) {
        errors.push({ applicationId, name: application.name, msg: 'Email and phone are required' });
        continue;
      }
      const duplicate = await User.findOne({ email }).select('_id email').lean();
      if (duplicate) {
        // console.log('[GeneralAdmission] Duplicate user found', { applicationId, email, duplicateId: String(duplicate._id) });
        errors.push({ applicationId, name: application.name, email, msg: 'User already exists with this email' });
        continue;
      }

      sequence += 1;
      const rollno = String(sequence).padStart(4, '0');
      const regno = `${academicyear}-${programcode}-${rollno}`;
      const password = randomPassword();
      const userPayload = {
        name: clean(application.name) || email,
        email,
        phone,
        password,
        role: 'Student',
        regno,
        program,
        programcode,
        admissionyear: academicyear,
        academicyear,
        rollno,
        semester,
        section,
        gender: clean(application.gender) || 'NA',
        state: clean(application.state || application.extraFields?.state) || 'NA',
        city: clean(application.city || application.extraFields?.city) || 'NA',
        district: clean(application.district || application.extraFields?.district) || 'NA',
        pincode: clean(application.pincode || application.pin || application.extraFields?.pincode) || 'NA',
        department: program,
        category: clean(application.category) || 'NA',
        address: clean(application.address) || 'NA',
        guardianname: clean(application.guardianname || application.extraFields?.guardianname) || 'NA',
        guardianmobile: clean(application.guardianmobile || application.extraFields?.guardianmobile) || 'NA',
        guardianemail: clean(application.guardianemail || application.extraFields?.guardianemail) || 'NA',
        fathername: clean(application.fathername || application.extraFields?.fathername) || 'NA',
        mothername: clean(application.mothername || application.extraFields?.mothername) || 'NA',
        dob: clean(application.dateofbirth || application.dob || application.extraFields?.dob) || 'NA',
        colid,
        status: 1,
        user: email,
        addedby: clean(req.body.user),
        institution: clean(req.body.institution),
        regulation,
        Major: clean(application.Major || application.major || application.extraFields?.Major || application.extraFields?.major) || 'NA',
        Minor: clean(application.Minor || application.minor || application.extraFields?.Minor || application.extraFields?.minor) || 'NA',
        AEC: clean(application.AEC || application.aec || application.extraFields?.AEC || application.extraFields?.aec) || 'NA',
        SEC: clean(application.SEC || application.sec || application.extraFields?.SEC || application.extraFields?.sec) || 'NA',
        VAC: clean(application.VAC || application.vac || application.extraFields?.VAC || application.extraFields?.vac) || 'NA',
        IDC: clean(application.IDC || application.idc || application.extraFields?.IDC || application.extraFields?.idc) || 'NA',
        isdisabled: 'No',
        admissionapplicationid: String(application._id),
        lastlogin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      };

      try {
        const validationDoc = new User(userPayload);
        const validationError = validationDoc.validateSync();
        // console.log('[GeneralAdmission] User payload before create', {
        //   applicationId,
        //   payload: userPayload,
        //   validationErrors: validationError
        //     ? Object.fromEntries(Object.entries(validationError.errors || {}).map(([key, value]) => [key, value.message]))
        //     : null
        // });
        if (validationError) {
          throw validationError;
        }
        const user = await User.create(userPayload);
        // console.log('[GeneralAdmission] User created', {
        //   applicationId,
        //   userId: String(user._id),
        //   email: user.email,
        //   regno: user.regno
        // });
        const updateResult = await AdmissionApplication.updateOne(
          { _id: application._id, colid },
          { $set: { applicationstatus: 'Admitted', regno, email, phone, username: email, password } }
        );
        // console.log('[GeneralAdmission] Application update status', {
        //   applicationId,
        //   matchedCount: updateResult.matchedCount,
        //   modifiedCount: updateResult.modifiedCount,
        //   acknowledged: updateResult.acknowledged
        // });
        created.push({
          applicationId: String(application._id),
          userId: String(user._id),
          name: user.name,
          email,
          phone,
          rollno,
          regno,
          password
        });
      } catch (err) {
        sequence -= 1;
        // console.error('[GeneralAdmission] User create/update failed', {
        //   applicationId,
        //   name: application.name,
        //   email,
        //   error: err.message,
        //   code: err.code,
        //   errors: err.errors
        //     ? Object.fromEntries(Object.entries(err.errors).map(([key, value]) => [key, value.message]))
        //     : undefined
        // });
        errors.push({
          applicationId,
          name: application.name,
          email,
          msg: err.message,
          details: err.errors
            ? Object.fromEntries(Object.entries(err.errors).map(([key, value]) => [key, value.message]))
            : undefined
        });
      }
    }

    // console.log('[GeneralAdmission] Bulk admit completed', {
    //   created: created.length,
    //   errors: errors.length,
    //   errorSummary: errors
    // });

    res.json({
      msg: `Admitted ${created.length} applicant${created.length === 1 ? '' : 's'}`,
      created,
      errors
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkDeleteApplications = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    if (!ids.length) return res.status(400).json({ msg: 'Select at least one application' });
    const result = await AdmissionApplication.deleteMany({ colid, _id: { $in: ids } });
    res.json({ msg: 'Deleted', deleted: result.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkUpdateApplicationStatus = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const fromStatus = clean(req.body.fromStatus || req.body.currentstatus || req.body.currentStatus);
    const applicationstatus = clean(req.body.applicationstatus);
    const allowedStatuses = ['Draft', 'Applied', 'Admitted'];
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    if (!ids.length) return res.status(400).json({ msg: 'Select at least one application' });
    if (!allowedStatuses.includes(fromStatus)) {
      return res.status(400).json({ msg: 'Select Draft, Applied or Admitted as source status' });
    }
    if (!allowedStatuses.includes(applicationstatus)) {
      return res.status(400).json({ msg: 'Select Draft, Applied or Admitted as status' });
    }
    if (fromStatus === applicationstatus) {
      return res.status(400).json({ msg: 'Source and target status should be different' });
    }
    const result = await AdmissionApplication.updateMany(
      { colid, _id: { $in: ids }, applicationstatus: fromStatus },
      { $set: { applicationstatus } }
    );
    res.json({
      msg: `Application status changed from ${fromStatus} to ${applicationstatus}`,
      matched: result.matchedCount || result.n || 0,
      modified: result.modifiedCount || result.nModified || 0,
      fromStatus,
      applicationstatus
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkUpdateApplicationCommentsStatus = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const allowedStatuses = ['Enrolled', 'Partially Enrolled', 'Hold'];
    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
    const fallbackIds = Array.isArray(req.body.ids) ? req.body.ids : [];
    const items = requestedItems.length
      ? requestedItems
      : fallbackIds.map((id) => ({
        id,
        enrollmentstatus: req.body.enrollmentstatus,
        applicationcomments: req.body.applicationcomments
      }));

    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    if (!items.length) return res.status(400).json({ msg: 'Select at least one application' });

    const operations = items
      .map((item) => ({
        id: clean(item.id || item._id),
        enrollmentstatus: clean(item.enrollmentstatus || item.applicationstatus),
        applicationcomments: clean(item.applicationcomments)
      }))
      .filter((item) => mongoose.Types.ObjectId.isValid(item.id) && allowedStatuses.includes(item.enrollmentstatus))
      .map((item) => ({
        updateOne: {
          filter: { colid, _id: item.id },
          update: {
            $set: {
              enrollmentstatus: item.enrollmentstatus,
              applicationcomments: item.applicationcomments
            }
          }
        }
      }));

    if (!operations.length) {
      return res.status(400).json({ msg: 'Select applications and a valid status' });
    }

    const result = await AdmissionApplication.bulkWrite(operations);
    res.json({
      msg: 'Enrollment status and application comments updated',
      matched: result.matchedCount || 0,
      modified: result.modifiedCount || 0
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.sendEmail = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const subject = clean(req.body.subject || 'Message from institution');
    const message = clean(req.body.message);
    const includeCredentials = Boolean(req.body.includeCredentials);
    const institution = clean(req.body.institution) || 'Institution';
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    if (!ids.length) return res.status(400).json({ msg: 'Select at least one recipient' });
    if (!message) return res.status(400).json({ msg: 'Message is required' });

    const applications = await AdmissionApplication.find({ colid, _id: { $in: ids } })
      .select('name email username password')
      .lean();
    const recipients = applications.filter((item) => /\S+@\S+\.\S+/.test(item.email || ''));
    if (!recipients.length) return res.status(400).json({ msg: 'No selected application has a valid email' });

    const config = await loadDefaultGmailConfig(colid);
    if (!config?.username || !config?.password || !getSmtpHost(config)) {
      return res.status(400).json({ msg: 'Default active Gmail configuration is missing or incomplete' });
    }

    const transporter = createTransporter(config);
    const errors = [];
    let sent = 0;

    for (const recipient of recipients) {
      const credentialText = includeCredentials
        ? `\n\nUsername: ${recipient.username || recipient.email || ''}\nPassword: ${recipient.password || ''}`
        : '';
      const body = `${message}${credentialText}`;
      const html = body.split('\n').map((line) => `<p>${safeHtml(line) || '&nbsp;'}</p>`).join('');
      try {
        await transporter.sendMail({
          from: `"${institution}" <${config.username}>`,
          to: recipient.email,
          subject,
          text: body,
          html: `<div>${html}</div>`
        });
        sent += 1;
      } catch (err) {
        errors.push({ email: recipient.email, name: recipient.name, msg: err.message });
      }
    }

    res.json({ msg: `Email sent to ${sent} recipient${sent === 1 ? '' : 's'}`, sent, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
