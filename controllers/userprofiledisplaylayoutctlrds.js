const User = require('../Models/user');
const UserCustomField = require('../Models/usercustomfieldds');
const UserProfileDisplayLayout = require('../Models/userprofiledisplaylayoutds');

const hiddenFields = new Set(['_id', '__v', 'colid', 'user', 'customFields']);
const clean = (value) => String(value || '').trim();

const normalizeCustomFields = (customFields) => {
  if (!customFields) return {};
  if (customFields instanceof Map) return Object.fromEntries(customFields);
  if (typeof customFields === 'object') return customFields;
  return {};
};

const serializeUser = (user) => {
  const data = user?.toObject ? user.toObject() : (user || {});
  data.customFields = normalizeCustomFields(data.customFields);
  return data;
};

const fieldOptions = (field) => {
  if (field === 'gender') return ['Male', 'Female', 'Not specified'];
  if (field === 'category') return ['General', 'SC', 'ST', 'OBC', 'EBC', 'EWS', 'PH'];
  if (field === 'role') return ['Faculty', 'Student', 'All', 'Admin'];
  if (field === 'status') return ['1', '0'];
  if (field === 'semester') return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  return [];
};

const fieldType = (field) => {
  const schemaType = User.schema.paths[field];
  if (!schemaType) return 'text';
  if (schemaType.instance === 'Number') return 'number';
  if (schemaType.instance === 'Date') return 'date';
  return fieldOptions(field).length ? 'dropdown' : 'text';
};

const baseUserFields = () => Object.keys(User.schema.paths)
  .filter((field) => !hiddenFields.has(field) && !field.startsWith('customFields.'));

const payloadFromBody = (body = {}) => ({
  colid: Number(body.colid),
  role: clean(body.role),
  section: clean(body.section) || 'Profile',
  sectionorder: Number(body.sectionorder || 0),
  field: clean(body.field),
  label: clean(body.label),
  source: clean(body.source) === 'custom' ? 'custom' : 'user',
  order: Number(body.order || 0),
  visible: clean(body.visible) || 'Yes',
  user: clean(body.user)
});

exports.getFields = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const customFields = await UserCustomField.find({ colid, isactive: 'Yes' }).sort({ page: 1, section: 1, order: 1, label: 1 }).lean();
    const userFields = baseUserFields().map((field) => ({
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
    res.json({ fields: [...userFields, ...custom] });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getLayouts = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.role) filter.role = clean(req.query.role);
    const data = await UserProfileDisplayLayout.find(filter).sort({ role: 1, sectionorder: 1, section: 1, order: 1, label: 1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.saveLayout = async (req, res) => {
  try {
    const payload = payloadFromBody(req.body);
    if (!payload.colid || !payload.role || !payload.section || !payload.field || !payload.label) {
      return res.status(400).json({ msg: 'Role, section, field and label are required' });
    }
    const data = req.body.id
      ? await UserProfileDisplayLayout.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await UserProfileDisplayLayout.findOneAndUpdate(
        { colid: payload.colid, role: payload.role, section: payload.section, field: payload.field },
        payload,
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
    res.json(data);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'This field is already configured in the selected section for this role' });
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteLayout = async (req, res) => {
  try {
    const deleted = await UserProfileDisplayLayout.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!deleted) return res.status(404).json({ msg: 'Display layout row not found' });
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
    if (!colid || (!email && !regno)) return res.status(400).json({ msg: 'colid and email/regno are required' });
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
    const role = clean(req.query.role) || user.role || 'User';
    const layout = await UserProfileDisplayLayout.find({
      colid,
      role,
      visible: { $ne: 'No' }
    }).sort({ sectionorder: 1, section: 1, order: 1, label: 1 }).lean();
    res.json({ user: serializeUser(user), role, layout });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
