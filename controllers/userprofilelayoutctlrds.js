const User = require('../Models/user');
const UserCustomField = require('../Models/usercustomfieldds');
const UserProfileLayout = require('../Models/userprofilelayoutds');
const UserProfileApprovalWorkflow = require('../Models/userprofileapprovalworkflowds');
const UserProfileEditRequest = require('../Models/userprofileeditrequestds');
const userProfileAuditLogController = require('./userprofileauditlogctlrds');
const { createApprovalTasks } = require('../utils/approvalTaskHelper');

const hiddenFields = new Set(['_id', '__v', 'colid', 'user', 'customFields']);
const clean = (value) => String(value || '').trim();
const yes = (value) => /^yes$/i.test(clean(value));

const normalizeOptions = (options) => {
  if (Array.isArray(options)) return options.map((item) => clean(item)).filter(Boolean);
  return clean(options).split(',').map((item) => clean(item)).filter(Boolean);
};

const normalizeCustomFields = (customFields) => {
  if (!customFields) return {};
  if (customFields instanceof Map) return Object.fromEntries(customFields);
  if (typeof customFields === 'object') return customFields;
  return {};
};

const fieldOptions = (field) => {
  if (field === 'gender') return ['Male', 'Female', 'Not specified'];
  if (field === 'category') return ['General', 'SC', 'ST', 'OBC', 'EBC', 'EWS', 'PH'];
  if (field === 'isdisabled') return ['Yes', 'No'];
  if (field === 'role') return ['Faculty', 'Student', 'All', 'Admin'];
  if (field === 'status') return ['1', '0'];
  if (field === 'semester') return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  return [];
};

const baseUserFields = () => Object.keys(User.schema.paths)
  .filter((field) => !hiddenFields.has(field) && !field.startsWith('customFields.'));

const fieldType = (field) => {
  const schemaType = User.schema.paths[field];
  if (!schemaType) return 'text';
  if (schemaType.instance === 'Number') return 'number';
  if (schemaType.instance === 'Date') return 'date';
  return fieldOptions(field).length ? 'dropdown' : 'text';
};

const serializeUser = (user) => {
  const data = user?.toObject ? user.toObject() : (user || {});
  data.customFields = normalizeCustomFields(data.customFields);
  return data;
};

const getValue = (user, field) => {
  if (field.startsWith('customFields.')) return normalizeCustomFields(user.customFields)[field.replace('customFields.', '')] ?? '';
  return user[field] ?? '';
};

const setValue = (user, field, value) => {
  if (field.startsWith('customFields.')) {
    const key = field.replace('customFields.', '');
    const current = normalizeCustomFields(user.customFields);
    current[key] = value;
    user.customFields = current;
  } else {
    user[field] = value;
  }
};

const profileWorkflow = async (colid, role) => UserProfileApprovalWorkflow.find({
  colid,
  role,
  status: { $ne: 'Inactive' },
  $or: [{ requesttype: 'Profile' }, { requesttype: 'All' }, { requesttype: '' }, { requesttype: { $exists: false } }]
}).sort({ level: 1 }).lean();

const layoutPayload = (body = {}) => ({
  colid: Number(body.colid),
  role: clean(body.role),
  field: clean(body.field),
  label: clean(body.label),
  source: clean(body.source) === 'custom' ? 'custom' : 'user',
  tab: clean(body.tab) || 'Profile',
  taborder: Number(body.taborder || 0),
  order: Number(body.order || 0),
  editable: clean(body.editable) || 'No',
  visible: clean(body.visible) || 'Yes',
  type: clean(body.type) || 'text',
  options: normalizeOptions(body.options),
  user: clean(body.user)
});

exports.getFields = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const customFields = await UserCustomField.find({ colid, isactive: 'Yes' }).sort({ page: 1, section: 1, order: 1, label: 1 }).lean();
    const fields = baseUserFields().map((field) => ({
      field,
      label: field,
      source: 'user',
      type: fieldType(field),
      options: fieldOptions(field)
    }));
    const custom = customFields.map((field) => ({
      field: `customFields.${field.fieldname}`,
      label: field.label,
      source: 'custom',
      type: field.type || 'text',
      options: field.options || []
    }));
    res.json({ fields: [...fields, ...custom] });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getLayouts = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.role) filter.role = clean(req.query.role);
    const data = await UserProfileLayout.find(filter).sort({ role: 1, taborder: 1, tab: 1, order: 1, label: 1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.saveLayout = async (req, res) => {
  try {
    const payload = layoutPayload(req.body);
    if (!payload.colid || !payload.role || !payload.field || !payload.label) {
      return res.status(400).json({ msg: 'Role, field and label are required' });
    }
    const data = req.body.id
      ? await UserProfileLayout.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await UserProfileLayout.findOneAndUpdate(
        { colid: payload.colid, role: payload.role, field: payload.field },
        payload,
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
    res.json(data);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'This field is already configured for the selected role' });
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteLayout = async (req, res) => {
  try {
    const deleted = await UserProfileLayout.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!deleted) return res.status(404).json({ msg: 'Profile layout row not found' });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const email = clean(req.query.email || req.query.user);
    const regno = clean(req.query.regno);
    const requestedRole = clean(req.query.role);
    if (!email && !regno) return res.status(400).json({ msg: 'Email or registration number is required' });
    const identifierFilter = email && regno
      ? { $and: [{ $or: [{ email }, { user: email }] }, { regno }] }
      : {
        $or: [
          ...(email ? [{ email }, { user: email }, { regno: email }] : []),
          ...(regno ? [{ regno }] : [])
        ]
      };
    const user = await User.findOne({ colid, ...identifierFilter }).lean();
    if (!user) return res.status(404).json({ msg: 'User not found' });
    const role = requestedRole || user.role || 'User';
    let layout = await UserProfileLayout.find({ colid, role, visible: { $ne: 'No' } }).sort({ taborder: 1, tab: 1, order: 1, label: 1 }).lean();
    if (!layout.length) {
      const defaults = ['name', 'email', 'phone', 'role', 'department', 'designation', 'program', 'programcode', 'regno', 'semester', 'section'];
      layout = defaults.filter((field) => user[field] !== undefined).map((field, index) => ({
        field,
        label: field,
        source: 'user',
        tab: 'Profile',
        taborder: 0,
        order: index + 1,
        editable: 'No',
        visible: 'Yes',
        type: fieldType(field),
        options: fieldOptions(field)
      }));
    }
    const data = serializeUser(user);
    const values = {};
    layout.forEach((item) => {
      values[item.field] = getValue(data, item.field);
    });
    const ownerKeys = [email, user.email, user.user, user.regno].map(clean).filter(Boolean);
    const pendingRequests = await UserProfileEditRequest.find({
      colid,
      owneruser: { $in: [...new Set(ownerKeys)] },
      status: 'Pending'
    }).sort({ createdAt: 1 }).lean();
    const configuredFields = new Set(layout.map((item) => item.field));
    const pendingValues = {};
    pendingRequests.forEach((request) => {
      (request.fields || [])
        .filter((field) => field.status === 'Pending' && configuredFields.has(field.field))
        .forEach((field) => {
          values[field.field] = field.newvalue;
          pendingValues[field.field] = {
            requestid: request._id,
            label: field.label || field.field,
            oldvalue: field.oldvalue,
            newvalue: field.newvalue,
            level: field.level,
            status: field.status,
            submittedAt: request.createdAt
          };
        });
    });
    res.json({ user: data, role, layout, values, pendingValues });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const email = clean(req.body.email || req.body.user);
    const role = clean(req.body.role);
    const user = await User.findOne({
      colid,
      $or: [
        { email },
        { user: email },
        { regno: email }
      ]
    });
    if (!user) return res.status(404).json({ msg: 'User not found' });
    const layout = await UserProfileLayout.find({ colid, role: role || user.role, visible: { $ne: 'No' } }).lean();
    const editableFields = new Set(layout.filter((field) => yes(field.editable)).map((field) => field.field));
    const labels = Object.fromEntries(layout.map((field) => [field.field, field.label || field.field]));
    const values = req.body.values || {};
    const currentUser = serializeUser(user);
    const fields = Object.keys(values)
      .filter((field) => editableFields.has(field))
      .map((field) => ({
        field,
        label: labels[field] || field,
        oldvalue: getValue(currentUser, field),
        newvalue: values[field],
        level: 1,
        status: 'Pending',
        decisions: []
      }))
      .filter((field) => String(field.oldvalue ?? '') !== String(field.newvalue ?? ''));

    if (!fields.length) return res.json({ msg: 'No changed editable fields to submit', user: serializeUser(user) });
    const workflow = await profileWorkflow(colid, role || user.role);
    if (!workflow.length) return res.status(400).json({ msg: `Profile approval workflow is not configured for role ${role || user.role}` });

    const request = await UserProfileEditRequest.create({
      colid,
      role: role || user.role,
      owneruser: email,
      ownername: user.name,
      submittedby: email,
      status: 'Pending',
      fields
    });
    for (const field of fields) {
      const firstApprovers = workflow.filter((item) => Number(item.level) === Number(field.level));
      for (const approver of firstApprovers) {
        await createApprovalTasks({
          colid,
          user: email,
          createdby: user.name || email,
          academicyear: user.academicyear,
          approvername: approver.approvername,
          approveremail: approver.approveremail,
          approverrole: approver.approverrole,
          title: `Approve profile field ${field.label || field.field} for ${user.name || email}`,
          category: 'User profile approval',
          pagelink: '/userprofileapproval',
          comments: `Profile field ${field.label || field.field} is pending approval at level ${field.level}.`,
          referenceModel: 'userprofileeditrequestds',
          referenceId: `${request._id}:${field.field}`,
          level: field.level
        });
      }
    }
    for (const field of fields) {
      await userProfileAuditLogController.createAuditLog(req, {
        colid,
        action: 'Submitted',
        requesttype: 'Profile',
        role: role || user.role,
        owneruser: email,
        ownername: user.name,
        actorname: clean(req.body.actorname || req.body.name) || user.name,
        actoremail: clean(req.body.actoruser || req.body.submittedby || req.body.email || req.body.user) || email,
        actorrole: role || user.role,
        field: field.field,
        label: field.label,
        oldvalue: field.oldvalue,
        newvalue: field.newvalue,
        status: field.status,
        requestid: String(request._id),
        details: { level: field.level }
      });
    }
    res.json({ msg: 'Profile changes submitted for approval', request, user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateProfilePhoto = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const email = clean(req.body.email || req.body.user);
    const photo = clean(req.body.photo);
    if (!colid || !email || !photo) return res.status(400).json({ msg: 'colid, email and photo are required' });

    const user = await User.findOneAndUpdate(
      {
        colid,
        $or: [
          { email },
          { user: email },
          { regno: email }
        ]
      },
      { $set: { photo } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json({ msg: 'Photo updated', user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
