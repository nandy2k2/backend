const router = require('express').Router();
const Attendance = require('../Models/hrbiometricattendanceds');
const { processRow } = require('../services/biometricAttendance');
router.get('/', async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!(colid > 0) || !req.query.academicyear || !req.query.fromdate || !req.query.todate) return res.status(400).json({ message: 'Academic year and date range are required' });
    const filter = { colid, academicyear: String(req.query.academicyear), date: { $gte: String(req.query.fromdate), $lte: String(req.query.todate) } };
    if (req.query.biometricid) filter.biometricid = String(req.query.biometricid).trim();
    const data = await Attendance.find(filter).sort({ date: -1, name: 1 }).limit(10001).lean();
    if (data.length > 10000) return res.status(400).json({ message: 'Narrow the date range: more than 10,000 records' });
    res.json({ data });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
router.post('/save', async (req, res) => {
  try {
    if (!Array.isArray(req.body.rows) || !req.body.rows.length || req.body.rows.length > 100) throw Error('Send 1–100 attendance rows per batch');
    const results = [];
    for (const [index, row] of req.body.rows.entries()) {
      try { results.push({ index, success: true, data: await processRow(row, req.body.colid, req.body.user) }); }
      catch (error) { results.push({ index, success: false, biometricid: row.biometricid, date: row.date, message: /Transaction numbers|replica set/i.test(error.message) ? 'Atomic payroll processing requires MongoDB configured as a replica set. No partial deduction was saved.' : error.message }); }
    }
    res.json({ results });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
router.post('/delete', async (req, res) => {
  try {
    if (!Array.isArray(req.body.ids) || !req.body.ids.length || req.body.ids.length > 100) throw Error('Select 1–100 rows per deletion batch');
    const results = [];
    for (const id of req.body.ids) {
      try { await processRow({ id }, req.body.colid, req.body.user, true); results.push({ id, success: true }); }
      catch (error) { results.push({ id, success: false, message: error.message }); }
    }
    res.json({ results });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
module.exports = router;
