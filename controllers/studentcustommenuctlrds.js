const StudentCustomMenu = require('../Models/studentcustommenuds');
const User = require('../Models/user');
const MProgram = require('../Models/mprograms');

const clean = (value) => String(value || '').trim();

const scopeFilter = ({ colid, academicyear, programcode }) => {
  const filter = {};
  if (colid) filter.colid = Number(colid);
  if (academicyear) filter.academicyear = clean(academicyear);
  if (programcode) filter.programcode = clean(programcode);
  return filter;
};

exports.getRules = async (req, res) => {
  try {
    const data = await StudentCustomMenu.find(scopeFilter(req.query)).sort({ academicyear: 1, programcode: 1, order: 1, groupname: 1, title: 1 });
    res.json({ status: 'Success', data });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.getOptions = async (req, res) => {
  try {
    const { colid } = req.query;
    const filter = colid ? { colid: Number(colid) } : {};
    const [yearsFromUsers, yearsFromPrograms, programsFromUsers, programsFromMaster] = await Promise.all([
      User.distinct('academicyear', { ...filter, role: 'Student' }),
      MProgram.distinct('year', filter),
      User.find({ ...filter, role: 'Student' }).select('program programcode academicyear').lean(),
      MProgram.find(filter).select('program programcode year').lean()
    ]);
    const years = [...new Set([...yearsFromUsers, ...yearsFromPrograms].map(clean).filter(Boolean))].sort();
    const programMap = new Map();
    [...programsFromUsers, ...programsFromMaster].forEach((item) => {
      const programcode = clean(item.programcode);
      if (!programcode) return;
      const key = `${clean(item.academicyear || item.year)}|${programcode}`;
      if (!programMap.has(key)) {
        programMap.set(key, {
          academicyear: clean(item.academicyear || item.year),
          program: clean(item.program),
          programcode
        });
      }
    });
    res.json({ status: 'Success', years, programs: [...programMap.values()].sort((a, b) => `${a.academicyear}${a.program}`.localeCompare(`${b.academicyear}${b.program}`)) });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.saveRules = async (req, res) => {
  try {
    const { colid, academicyear, program, programcode, groupname, items = [], user } = req.body;
    if (!colid || !academicyear || !programcode || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ status: 'Failed', message: 'Academic year, program code and at least one menu item are required' });
    }

    const unique = new Map();
    items.forEach((item, index) => {
      const path = clean(item.path);
      if (!path || unique.has(path)) return;
      unique.set(path, {
        colid: Number(colid),
        academicyear: clean(academicyear),
        program: clean(program || item.program),
        programcode: clean(programcode),
        menugroup: clean(item.menugroup || item.group),
        groupname: clean(groupname || item.groupname || item.menugroup || item.group),
        title: clean(item.title),
        path,
        order: Number(item.order ?? index),
        user,
        status1: 'Active',
        comments: 'NA'
      });
    });

    let inserted = 0;
    let skipped = 0;
    const data = [];
    for (const item of unique.values()) {
      const exists = await StudentCustomMenu.findOne({
        colid: item.colid,
        academicyear: item.academicyear,
        programcode: item.programcode,
        path: item.path
      });
      if (exists) {
        skipped += 1;
        data.push(exists);
        continue;
      }
      const created = await StudentCustomMenu.create(item);
      inserted += 1;
      data.push(created);
    }
    res.status(201).json({ status: 'Success', inserted, skipped, data });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.updateRule = async (req, res) => {
  try {
    const { id, groupname, title, order, status1, comments } = req.body;
    const data = await StudentCustomMenu.findByIdAndUpdate(
      id,
      { groupname: clean(groupname), title: clean(title), order: Number(order || 0), status1: status1 || 'Active', comments: comments || 'NA' },
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ status: 'Failed', message: 'Menu item not found' });
    res.json({ status: 'Success', data });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.deleteRules = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const id = req.body.id;
    if (ids.length) {
      const data = await StudentCustomMenu.deleteMany({ _id: { $in: ids } });
      return res.json({ status: 'Success', deletedCount: data.deletedCount });
    }
    const data = await StudentCustomMenu.findByIdAndDelete(id);
    if (!data) return res.status(404).json({ status: 'Failed', message: 'Menu item not found' });
    res.json({ status: 'Success' });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.getEffectiveMenu = async (req, res) => {
  try {
    const { colid, user, email, regno } = req.query;
    let academicyear = clean(req.query.academicyear);
    let programcode = clean(req.query.programcode);
    let program = clean(req.query.program);

    if ((!academicyear || !programcode) && colid) {
      const student = await User.findOne({
        colid: Number(colid),
        role: 'Student',
        $or: [
          { email: clean(email || user) },
          { user: clean(user || email) },
          { regno: clean(regno) }
        ].filter((item) => Object.values(item)[0])
      }).lean();
      if (student) {
        academicyear = academicyear || clean(student.academicyear || student.admissionyear);
        programcode = programcode || clean(student.programcode);
        program = program || clean(student.program);
      }
    }

    if (!colid || !academicyear || !programcode) {
      return res.json({ status: 'Success', data: [], custom: false });
    }

    const rows = await StudentCustomMenu.find({
      colid: Number(colid),
      academicyear,
      programcode,
      status1: { $ne: 'Inactive' }
    }).sort({ order: 1, groupname: 1, title: 1 }).lean();

    if (!rows.length) {
      return res.json({ status: 'Success', data: [], custom: false });
    }

    const map = new Map();
    rows.forEach((row) => {
      const group = clean(row.groupname || row.menugroup || 'Student');
      if (!map.has(group)) map.set(group, []);
      if (!map.get(group).some((item) => item.path === row.path)) {
        map.get(group).push({ title: row.title, path: row.path, menugroup: row.menugroup, order: row.order });
      }
    });
    const data = [...map.entries()].map(([group, items]) => ({ group, items }));
    res.json({ status: 'Success', data, custom: true, scope: { academicyear, program, programcode } });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};
