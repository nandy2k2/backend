const User = require('../Models/user');
const Marks = require('../Models/exammodel2componentmarksds');
const text = value => String(value ?? '').trim();
async function list(req, res, includeWeightage = false, report = false) {
  try {
    const colid = Number(req.user?.colid || req.query.colid);
    const email = text(req.user?.email || req.query.email || req.query.user).toLowerCase();
    if (!Number.isFinite(colid) || colid <= 0 || !email) return res.status(400).json({ message: 'Student session is unavailable. Please sign in again.' });
    const student = await User.findOne({ colid, email, role: 'Student' }).select(report ? 'regno name email program programcode regulation semester' : 'regno name').lean();
    if (!student?.regno) return res.status(403).json({ message: 'Student enrollment number is unavailable.' });
    // Resolve enrollment from User; never use a caller-supplied regno or status filter.
    const data = await Marks.find({ colid, regno: student.regno, scoretype: 'Internal', approvalstatus: 'Approved' })
      .select(`academicyear regulation program programcode semester exam examcode course coursecode componenttype assessmentgroup assessmentcomponent scoretype maxmarks marksobtained attendance approvalstatus ${includeWeightage ? 'assessmentgrouptype' : 'passstatus'} ${report ? 'rawmarks updatedAt' : ''}`)
      .sort({ semester: 1, academicyear: -1, examcode: 1, coursecode: 1, assessmentcomponent: 1 }).lean();
    res.set('Cache-Control', 'no-store');
    let components, institution;
    if (report) {
      const courses = [...new Map(data.map(row => { const query = Object.fromEntries(['academicyear','regulation','programcode','coursecode'].map(field => [field, text(row[field])])); return [JSON.stringify(query), query]; })).values()];
      components = courses.length ? await require('../Models/assessmentcomponentds').find({ colid, scoretype: 'Internal', status: { $not: /^Inactive$/i }, $or: courses }).select('academicyear regulation programcode semester coursecode componenttype assessmentgroup grouptype assessmentcomponent marks weightage').lean() : [];
      institution = await require('../Models/insdetails').findOne({ colid }).sort({ _id: -1 }).lean();
    }
    const result = includeWeightage ? await require('../services/studentInternalWeightage').addWeightage(colid, data, components) : data;
    return res.json({ success: true, data: result, ...(report ? { components, institution, student } : {}) });
  } catch (error) { return res.status(500).json({ message: error.message }); }
}
exports.list = (req, res) => list(req, res);
exports.list2 = (req, res) => list(req, res, true);
exports.list3 = (req, res) => list(req, res, true, true);
