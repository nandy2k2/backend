const OllamaConfiguration = require('../Models/ollamaconfigurationds');

const text = (value) => String(value || '').trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const payloadFromBody = (body = {}) => ({
  colid: number(body.colid),
  name: text(body.name),
  serveraddress: text(body.serveraddress) || 'http://localhost:11434',
  modelname: text(body.modelname) || 'llama3.1',
  description: text(body.description),
  active: text(body.active || 'Yes'),
  default: text(body.default || 'No'),
  user: text(body.user)
});

exports.getOllamaConfigurations = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    const data = await OllamaConfiguration.find({ colid }).sort({ default: -1, active: -1, name: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createOllamaConfiguration = async (req, res) => {
  try {
    const payload = payloadFromBody(req.body);
    if (payload.colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    if (!payload.name) return res.status(400).json({ msg: 'name is required' });
    const data = await OllamaConfiguration.create(payload);
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateOllamaConfiguration = async (req, res) => {
  try {
    const payload = payloadFromBody(req.body);
    if (!req.body.id) return res.status(400).json({ msg: 'id is required' });
    const data = await OllamaConfiguration.findOneAndUpdate(
      { _id: req.body.id, colid: payload.colid },
      payload,
      { new: true, runValidators: true }
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteOllamaConfiguration = async (req, res) => {
  try {
    await OllamaConfiguration.findOneAndDelete({
      _id: req.body.id,
      colid: number(req.body.colid)
    });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
