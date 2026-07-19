const CountryConfiguration = require('../Models/countryconfigurationds');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const payloadFromBody = (body = {}) => ({
  colid: toNumber(body.colid),
  country: body.country || '',
  default: body.default || 'No',
  status: body.status || 'Active'
});

exports.getCountryConfigurations = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    const data = await CountryConfiguration.find({ colid }).sort({ default: -1, country: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getDefaultCountryConfiguration = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    const data = await CountryConfiguration.findOne({ colid, default: 'Yes' }).sort({ updatedAt: -1 });
    res.json(data || {});
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.createCountryConfiguration = async (req, res) => {
  try {
    const payload = payloadFromBody(req.body);
    if (payload.colid === undefined) return res.status(400).json({ msg: 'colid is required' });
    if (!payload.country) return res.status(400).json({ msg: 'country is required' });
    const data = await CountryConfiguration.create(payload);
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateCountryConfiguration = async (req, res) => {
  try {
    const payload = payloadFromBody(req.body);
    if (!req.body.id) return res.status(400).json({ msg: 'id is required' });
    const data = await CountryConfiguration.findOneAndUpdate(
      { _id: req.body.id, colid: payload.colid },
      payload,
      { new: true }
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteCountryConfiguration = async (req, res) => {
  try {
    await CountryConfiguration.findOneAndDelete({
      _id: req.body.id,
      colid: toNumber(req.body.colid)
    });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
