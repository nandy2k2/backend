const Config = require('../Models/pingwhatsappconfigds');
const text = value => String(value ?? '').trim();
const escaped = value => Array.from(text(value), char => '\\^$.*+?()[]{}|'.includes(char) ? `\\${char}` : char).join('');
const wrap = callback => async (req, res) => {
  try {
    req.colid = Number(req.user?.colid || req.body?.colid || req.query.colid);
    if (!Number.isFinite(req.colid) || req.colid <= 0) throw new Error('Institution ID is required');
    res.set('Cache-Control', 'no-store'); await callback(req, res);
  } catch (error) { res.status(400).json({ success: false, message: error.code === 11000 ? 'A configuration already exists for this Phone ID.' : error.message }); }
};
function payload(body, colid, user) {
  const phoneid = text(body.phoneid), apiid = text(body.apiid), active = text(body.active || 'Yes').toLowerCase();
  if (!phoneid || !apiid) throw new Error('Phone ID and API ID are required');
  if (!['yes','no'].includes(active)) throw new Error('Active must be Yes or No');
  return { colid, phoneid, apiid, active: active === 'yes' ? 'Yes' : 'No', user: text(user) };
}
exports.list = wrap(async (req, res) => {
  const query = { colid: req.colid };
  for (const field of ['phoneid','apiid']) if (text(req.query[field])) query[field] = new RegExp(escaped(req.query[field]), 'i');
  if (req.query.active) { if (!['Yes','No'].includes(req.query.active)) throw new Error('Active must be Yes or No'); query.active = req.query.active; }
  res.json({ success: true, data: await Config.find(query).sort({ updatedAt: -1 }).lean() });
});
exports.save = wrap(async (req, res) => {
  const value = payload(req.body, req.colid, req.body.user);
  const row = req.body.id ? await Config.findOneAndUpdate({ _id: req.body.id, colid: req.colid }, { $set: value }, { new: true, runValidators: true }) : await Config.create(value);
  if (!row) throw new Error('Configuration not found');
  res.json({ success: true, data: row });
});
exports.remove = wrap(async (req, res) => {
  if (!Array.isArray(req.body.ids) || !req.body.ids.length) throw new Error('Select configurations to delete');
  const result = await Config.deleteMany({ colid: req.colid, _id: { $in: req.body.ids } });
  res.json({ success: true, deleted: result.deletedCount });
});
exports.bulk = wrap(async (req, res) => {
  if (!Array.isArray(req.body.rows) || !req.body.rows.length) throw new Error('Select a workbook containing configurations');
  const errors = []; let saved = 0;
  for (const [index, row] of req.body.rows.entries()) {
    try {
      const value = payload(row, req.colid, req.body.user);
      await Config.findOneAndUpdate({ colid: req.colid, phoneid: value.phoneid }, { $set: value }, { upsert: true, new: true, runValidators: true }); saved++;
    } catch (error) { errors.push({ row: index + 2, message: error.message }); }
  }
  res.json({ success: true, saved, errors });
});
