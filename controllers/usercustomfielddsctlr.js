const UserCustomField = require('../Models/usercustomfieldds');

const cleanFieldName = (value) => String(value || '')
  .trim()
  .replace(/[^a-zA-Z0-9_]/g, '_')
  .replace(/_+/g, '_')
  .toLowerCase();

const normalizeOptions = (options) => {
  if (Array.isArray(options)) return options.map((item) => String(item).trim()).filter(Boolean);
  return String(options || '').split(',').map((item) => item.trim()).filter(Boolean);
};

const fieldPayload = (body) => ({
  colid: Number(body.colid),
  fieldname: cleanFieldName(body.fieldname || body.fieldName || body['Field Key'] || body.label),
  label: String(body.label || body.Label || '').trim(),
  page: body.page || body.Page || 'Page 1',
  section: body.section || body.Section || 'Additional Details',
  type: body.type || body.Type || 'text',
  options: normalizeOptions(body.options || body.Options),
  isrequired: body.isrequired || body.required || body.Required || 'No',
  isactive: body.isactive || body.active || body.Active || 'Yes',
  order: Number(body.order || body.Order || 0),
  user: body.user || ''
});

exports.getAll = async (req, res) => {
  try {
    const filter = { colid: Number(req.query.colid) };
    if (req.query.activeOnly !== 'No') filter.isactive = 'Yes';
    const data = await UserCustomField.find(filter).sort({ page: 1, section: 1, order: 1, label: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = fieldPayload(req.body);
    if (!payload.colid || !payload.label || !payload.fieldname) {
      return res.status(400).json({ msg: 'Label is required' });
    }
    const data = await UserCustomField.create(payload);
    res.json(data);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Field key already exists' });
    res.status(500).json({ msg: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = fieldPayload(req.body);
    if (!payload.label || !payload.fieldname) {
      return res.status(400).json({ msg: 'Label is required' });
    }
    const duplicate = await UserCustomField.findOne({
      _id: { $ne: req.body.id },
      colid: payload.colid,
      fieldname: payload.fieldname
    });
    if (duplicate) return res.status(400).json({ msg: 'Field key already exists' });

    const data = await UserCustomField.findOneAndUpdate(
      { _id: req.body.id, colid: payload.colid },
      payload,
      { new: true }
    );
    res.json(data);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: 'Field key already exists' });
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteField = async (req, res) => {
  try {
    const deleted = await UserCustomField.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!deleted) return res.status(404).json({ msg: 'Custom field not found' });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (!ids.length) return res.status(400).json({ msg: 'No custom fields selected' });

    const result = await UserCustomField.deleteMany({ _id: { $in: ids }, colid });
    res.json({ msg: 'Deleted', deleted: result.deletedCount || 0 });
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

    const errors = [];
    let saved = 0;

    for (let index = 0; index < items.length; index += 1) {
      const rowNumber = items[index].rowNumber || index + 2;
      const payload = fieldPayload({ ...items[index], colid, user: req.body.user || items[index].user });
      if (!payload.label || !payload.fieldname) {
        errors.push({ rowNumber, msg: 'Label is required' });
        continue;
      }

      try {
        await UserCustomField.findOneAndUpdate(
          { colid, fieldname: payload.fieldname },
          payload,
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
