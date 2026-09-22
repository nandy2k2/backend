const StudentAcademicActivity = require('../Models/studentacademicactivityds');
const User = require('../Models/user');
const Institution = require('../Models/insdetails');

const text = (value) => String(value ?? '').trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const validTypes = new Set(['Seminar', 'Publication']);

const activityType = (value) => {
  const clean = text(value);
  if (/^publication$/i.test(clean)) return 'Publication';
  return 'Seminar';
};

const dateValue = (value) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const payload = (body) => {
  const type = activityType(body.activitytype || body.type);
  return {
    colid: num(body.colid),
    activitytype: type,
    academicyear: text(body.academicyear || body['Academic Year']),
    regulation: text(body.regulation || body.Regulation),
    institution: text(body.institution || body.Institution),
    department: text(body.department || body.Department),
    program: text(body.program || body.Program),
    programcode: text(body.programcode || body['Program Code']),
    semester: text(body.semester || body.Semester),
    section: text(body.section || body.Section),
    student: text(body.student || body.Student || body.name),
    regno: text(body.regno || body.Regno || body['Reg No']),
    studentemail: text(body.studentemail || body.studentEmail || body.Email),
    title: text(body.title || body.Title),
    category: text(body.category || body.Category),
    level: text(body.level || body.Level),
    organizer: text(body.organizer || body.Organizer),
    venue: text(body.venue || body.Venue),
    activitydate: dateValue(body.activitydate || body.activityDate || body.Date),
    journal: text(body.journal || body.Journal),
    publicationtype: text(body.publicationtype || body.publicationType || body['Publication Type']),
    issn: text(body.issn || body.ISSN),
    doi: text(body.doi || body.DOI),
    link: text(body.link || body.Link),
    filelink: text(body.filelink || body.fileLink || body['File Link']),
    status: text(body.status || body.Status || 'Active') || 'Active',
    remarks: text(body.remarks || body.Remarks),
    name: text(body.name || body.createdby || body.createdBy),
    user: text(body.user || body.useremail || body.userEmail)
  };
};

const regexFilter = (field, value) => {
  const clean = text(value);
  return clean ? { [field]: { $regex: clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
};

const buildQuery = (body = {}) => {
  const colid = num(body.colid);
  const query = {};
  if (colid !== undefined) query.colid = colid;
  if (body.activitytype || body.type) query.activitytype = activityType(body.activitytype || body.type);
  const filters = Array.isArray(body.filters) ? body.filters : [];
  filters.forEach((filter) => {
    const field = text(filter.field);
    const value = text(filter.value);
    if (!field || !value) return;
    if (field === 'activitydatefrom') {
      query.activitydate = { ...(query.activitydate || {}), $gte: dateValue(value) };
    } else if (field === 'activitydateto') {
      const toDate = dateValue(value);
      if (toDate) {
        toDate.setHours(23, 59, 59, 999);
        query.activitydate = { ...(query.activitydate || {}), $lte: toDate };
      }
    } else {
      Object.assign(query, regexFilter(field, value));
    }
  });
  ['academicyear', 'regulation', 'institution', 'department', 'program', 'programcode', 'semester', 'section', 'regno', 'student', 'category', 'level', 'status'].forEach((field) => {
    if (body[field]) Object.assign(query, regexFilter(field, body[field]));
  });
  return query;
};

const grouped = (rows, keys) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = keys.map((item) => row[item] || 'Blank').join('||');
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        count: 0,
        students: new Set(),
        ...Object.fromEntries(keys.map((item) => [item, row[item] || 'Blank']))
      });
    }
    const entry = map.get(key);
    entry.count += 1;
    if (row.regno) entry.students.add(row.regno);
  });
  return Array.from(map.values()).map((item) => ({
    ...item,
    students: item.students.size
  })).sort((a, b) => String(a.academicyear || '').localeCompare(String(b.academicyear || '')) || String(a.program || '').localeCompare(String(b.program || '')));
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (colid === undefined) return res.status(400).json({ message: 'College id is required' });
    const [students, rows, institution] = await Promise.all([
      User.find({ colid, role: /^Student$/i }).select('name email regno academicyear regulation institution department program programcode semester section').sort({ name: 1 }).limit(5000).lean(),
      StudentAcademicActivity.find({ colid }).select('academicyear regulation institution department program programcode semester section category level status activitytype').lean(),
      Institution.findOne({ colid }).lean()
    ]);
    const unique = (values) => Array.from(new Set(values.map(text).filter(Boolean))).sort();
    res.json({
      students,
      institution,
      options: {
        academicyears: unique([...students.map((item) => item.academicyear), ...rows.map((item) => item.academicyear)]),
        regulations: unique([...students.map((item) => item.regulation), ...rows.map((item) => item.regulation)]),
        institutions: unique([...students.map((item) => item.institution), ...rows.map((item) => item.institution)]),
        departments: unique([...students.map((item) => item.department), ...rows.map((item) => item.department)]),
        programs: unique([...students.map((item) => item.program), ...rows.map((item) => item.program)]),
        programcodes: unique([...students.map((item) => item.programcode), ...rows.map((item) => item.programcode)]),
        semesters: unique([...students.map((item) => item.semester), ...rows.map((item) => item.semester)]),
        sections: unique([...students.map((item) => item.section), ...rows.map((item) => item.section)]),
        categories: unique(rows.map((item) => item.category)),
        levels: unique(rows.map((item) => item.level)),
        statuses: unique(rows.map((item) => item.status))
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const query = buildQuery(req.body);
    if (!query.colid) return res.status(400).json({ message: 'College id is required' });
    const data = await StudentAcademicActivity.find(query).sort({ activitydate: -1, createdAt: -1 }).limit(5000).lean();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    const data = payload(req.body);
    if (!data.colid) return res.status(400).json({ message: 'College id is required' });
    if (!validTypes.has(data.activitytype)) return res.status(400).json({ message: 'Invalid activity type' });
    if (!data.student || !data.regno || !data.title) return res.status(400).json({ message: 'Student, regno and title are required' });
    const saved = req.body.id || req.body._id
      ? await StudentAcademicActivity.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: data.colid }, data, { new: true })
      : await StudentAcademicActivity.create(data);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (colid === undefined) return res.status(400).json({ message: 'College id is required' });
    let saved = 0;
    const errors = [];
    for (let index = 0; index < items.length; index += 1) {
      const rowNumber = items[index].rowNumber || index + 2;
      const data = payload({ ...items[index], colid, user: req.body.user, name: req.body.name });
      if (!data.student || !data.regno || !data.title) {
        errors.push({ rowNumber, message: 'Student, regno and title are required' });
        continue;
      }
      try {
        await StudentAcademicActivity.create(data);
        saved += 1;
      } catch (err) {
        errors.push({ rowNumber, message: err.message });
      }
    }
    res.json({ saved, errors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteRows = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ message: 'College id is required' });
    if (!ids.length) return res.status(400).json({ message: 'Select records to delete' });
    const result = await StudentAcademicActivity.deleteMany({ colid, _id: { $in: ids } });
    res.json({ deleted: result.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.report = async (req, res) => {
  try {
    const query = buildQuery(req.body);
    if (!query.colid) return res.status(400).json({ message: 'College id is required' });
    const [rows, institution] = await Promise.all([
      StudentAcademicActivity.find(query).sort({ academicyear: 1, institution: 1, program: 1, student: 1 }).limit(10000).lean(),
      Institution.findOne({ colid: query.colid }).lean()
    ]);
    res.json({
      data: rows,
      institution,
      summary: {
        total: rows.length,
        students: new Set(rows.map((item) => item.regno).filter(Boolean)).size,
        programs: new Set(rows.map((item) => item.programcode).filter(Boolean)).size,
        institutions: new Set(rows.map((item) => item.institution).filter(Boolean)).size
      },
      academicyearProgram: grouped(rows, ['academicyear', 'program', 'programcode']),
      institutionWise: grouped(rows, ['academicyear', 'institution']),
      categoryWise: grouped(rows, ['academicyear', 'category'])
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
