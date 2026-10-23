const router = require('express').Router();
const Exam = require('../Models/conductexamds');
const Course = require('../Models/conductexamcourseds');
const Roll = require('../Models/conductexamrollds');
const Institution = require('../Models/insdetails');
const scope = req => {
  const colid = Number(req.query.colid);
  if (!Number.isFinite(colid) || colid <= 0) throw new Error('Institution is required');
  return { colid };
};
router.get('/options', async (req, res) => {
  try {
    const filter = scope(req);
    if (req.query.academicyear) filter.academicyear = String(req.query.academicyear);
    const exams = await Exam.find(filter).select('academicyear examname examcode').lean();
    const courses = req.query.examcode ? await Course.find({ ...filter, examcode: String(req.query.examcode) }).select('program programcode course coursecode semester').lean() : [];
    res.json({ exams, courses });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
router.get('/sheet', async (req, res) => {
  try {
    const filter = scope(req);
    for (const field of ['academicyear', 'examcode', 'program', 'programcode', 'course', 'coursecode']) {
      if (!req.query[field]) throw new Error('Select academic year, exam, program and course');
      filter[field] = String(req.query[field]);
    }
    const exam = await Exam.findOne({ colid: filter.colid, academicyear: filter.academicyear, examcode: filter.examcode }).lean();
    const course = await Course.findOne(filter).lean();
    if (!exam || !course) throw new Error('Selected exam/course was not found in the masters');
    const institution = await Institution.findOne({ colid: filter.colid }).lean();
    const rows = await Roll.find(filter).select('seatno examseatno shortbarcode blockno building examroom campus examdate examslot section semester regno').lean();
    res.json({ institution: institution || {}, exam, course, rows });
  } catch (error) { res.status(400).json({ message: error.message }); }
});
module.exports = router;
