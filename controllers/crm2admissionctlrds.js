const router = require('express').Router();
const service = require('../services/crm2Admission');
const User = require('../Models/user');
const Ledger = require('../Models/ledgerstud');
const wrap = fn => async (req, res) => {
  try {
    const source = { ...req.query, ...req.body };
    const colid = Number(source.colid), actor = String(req.user?.email || source.user || '').trim().toLowerCase();
    if (!(colid > 0) || !Number.isFinite(colid) || !actor || !await User.exists({ colid, email: actor, role: { $not: /^Student$/i } })) throw Error('Institution and logged-in non-student user are required');
    res.json(await fn({ ...source, colid, actor }));
  } catch (error) { res.status(400).json({ message: /replica set|Transaction numbers/i.test(error.message) ? 'Atomic admission requires MongoDB replica-set support. No partial admission was saved.' : error.code === 11000 ? 'Student, registration number, or admission already exists. Reload the admission.' : error.message }); }
};
router.post('/admit', wrap(service.admit));
router.post('/apply', wrap(service.apply));
router.get('/details', wrap(async source => {
  const data = await service.choices(source.colid, source.actor, source.admissionid, null);
  const ledger = await Ledger.find({ colid: source.colid, regno: data.student.regno }).sort({ classdate: 1, _id: 1 }).lean();
  return { ...data, ledger };
}));
module.exports = router;
