const HrStructure = require('../Models/hrstructure');

const clean = (value) => String(value || '').trim();
const getColid = (req) => Number(req.body.colid || req.query.colid || 0);

const payloadFrom = (body = {}) => ({
  name: clean(body.name || body.Name || body.struture || body.Structure) || 'NA',
  user: clean(body.user || body.User) || 'NA',
  colid: Number(body.colid || body.Colid || 0),
  struture: clean(body.struture || body.structure || body.Structure || body['Salary Structure']),
  description: clean(body.description || body.Description),
  businessrole: clean(body.businessrole || body.businessRole || body['Business Role']),
  paycommission: clean(body.paycommission || body.payCommission || body['Pay Commission']),
  designation: clean(body.designation || body.Designation),
  type: clean(body.type || body.Type),
  level: clean(body.level || body.Level),
  status1: clean(body.status1 || body.status || body.Status || 'Active'),
  comments: clean(body.comments || body.Comments)
});

exports.getAll = async (req, res) => {
  try {
    const colid = getColid(req);
    const query = { colid };
    ['struture', 'designation', 'businessrole', 'paycommission', 'type', 'level', 'status1'].forEach((field) => {
      if (req.query[field]) query[field] = clean(req.query[field]);
    });
    const data = await HrStructure.find(query).sort({ struture: 1, designation: 1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    const payload = payloadFrom(req.body);
    if (!payload.colid) return res.status(400).json({ msg: 'College id is required' });
    if (!payload.struture) return res.status(400).json({ msg: 'Structure is required' });
    const data = req.body.id
      ? await HrStructure.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await HrStructure.create(payload);
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const deleted = await HrStructure.findOneAndDelete({ _id: req.body.id, colid: getColid(req) });
    if (!deleted) return res.status(404).json({ msg: 'Salary structure not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = getColid(req);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!colid) return res.status(400).json({ msg: 'College id is required' });
    if (!items.length) return res.status(400).json({ msg: 'No rows received' });
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const rowNumber = items[index].rowNumber || index + 2;
      const payload = payloadFrom({ ...items[index], colid, user: req.body.user || items[index].user });
      if (!payload.struture) {
        errors.push({ rowNumber, msg: 'Structure is required' });
        continue;
      }
      try {
        await HrStructure.create(payload);
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
