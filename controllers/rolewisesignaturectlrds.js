const router = require('express').Router();
const Signature = require('../Models/rolewisesignatureds');
const User = require('../Models/user');
function colidOf(source) {
  const colid = Number(source.colid);
  if (!(colid > 0) || !Number.isFinite(colid)) throw new Error('Institution is required');
  return colid;
}
router.get('/', async (req, res) => {
  try {
    const colid = colidOf(req.query);
    const rows = await Signature.find({ colid }).sort({ role: 1 }).lean();
    const roles = await User.distinct('role', { colid });
    res.json({ data: rows, roles: [...new Set(['coe', ...roles, ...rows.map(row => row.role)].filter(Boolean).map(role => String(role).toLowerCase()))].sort() });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
router.post('/', async (req, res) => {
  try {
    const colid = colidOf(req.body), role = String(req.body.role || '').trim().toLowerCase();
    const signaturelink = String(req.body.signaturelink || '').trim();
    if (!role || !/^https?:\/\//i.test(signaturelink)) throw new Error('Select a role and upload an image or provide a valid signature URL');
    const payload = { role, signaturelink, status: req.body.status === 'Inactive' ? 'Inactive' : 'Active', remarks: String(req.body.remarks || ''), user: String(req.body.user || '') };
    const data = req.body.id
      ? await Signature.findOneAndUpdate({ colid, _id: req.body.id }, { $set: payload }, { new: true, runValidators: true })
      : await Signature.findOneAndUpdate({ colid, role }, { $set: payload, $setOnInsert: { colid } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    if (!data) return res.status(404).json({ message: 'Signature not found' });
    res.json({ data });
  } catch (error) { res.status(400).json({ message: error.code === 11000 ? 'A signature already exists for this role. Edit the existing entry.' : error.message }); }
});
router.post('/delete', async (req, res) => {
  try {
    const colid = colidOf(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) throw new Error('Select signatures to delete');
    const result = await Signature.deleteMany({ colid, _id: { $in: ids } });
    res.json({ deleted: result.deletedCount });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
module.exports = router;
