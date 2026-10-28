const User = require('../Models/user');
const Marks = require('../Models/exammodel2componentmarksds');
const text = value => String(value ?? '').trim();
exports.list = async (req, res) => {
  try {
    const colid = Number(req.user?.colid || req.query.colid);
    const email = text(req.user?.email || req.query.email || req.query.user).toLowerCase();
    if (!Number.isFinite(colid) || colid <= 0 || !email) return res.status(400).json({ message: 'Student session is unavailable. Please sign in again.' });
    const student = await User.findOne({ colid, email, role: 'Student' }).select('regno name').lean();
    if (!student?.regno) return res.status(403).json({ message: 'Student enrollment number is unavailable.' });
    // Resolve enrollment from User; never use a caller-supplied regno or status filter.
    const data = await Marks.find({ colid, regno: student.regno, scoretype: 'Internal', approvalstatus: 'Approved' })
      .select('academicyear regulation program programcode semester exam examcode course coursecode componenttype assessmentgroup assessmentcomponent scoretype maxmarks marksobtained attendance passstatus approvalstatus')
      .sort({ semester: 1, academicyear: -1, examcode: 1, coursecode: 1, assessmentcomponent: 1 }).lean();
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data });
  } catch (error) { return res.status(500).json({ message: error.message }); }
};
