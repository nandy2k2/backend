const mongoose = require("mongoose");
const CourseMaster = require("../Models/moocvaluedcoursemasterds");
const Offering = require("../Models/moocvalueaddedofferingds");
const StudentResult = require("../Models/moocvalueaddedstudentds");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const date = (value) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const pick = (obj, fields) => fields.reduce((acc, field) => {
  if (obj[field] !== undefined) acc[field] = obj[field];
  return acc;
}, {});

const courseFields = ["academicyear", "valueaddedcourse", "vaccode", "department", "description", "coursetype", "category", "provider", "credittype", "credit"];
const offeringFields = ["academicyear", "category", "courseid", "valueaddedcourse", "vaccode", "coursetype", "provider", "credittype", "credit", "startdate", "enddate", "syllabus"];
const studentFields = ["offeringid", "academicyear", "regulation", "program", "programcode", "semester", "department", "valueaddedcoursecategory", "valueaddedcourse", "vaccode", "student", "regno", "marksobtained", "totalmarks", "status"];

function applyFilters(query, filters = {}, fields = []) {
  fields.forEach((field) => {
    if (text(filters[field])) query[field] = regex(filters[field]);
  });
  if (filters.fromdate || filters.todate) {
    const range = {};
    const from = date(filters.fromdate);
    const to = date(filters.todate);
    if (from) range.$gte = from;
    if (to) {
      to.setHours(23, 59, 59, 999);
      range.$lte = to;
    }
    query.createdAt = range;
  }
}

async function distinctOptions(Model, colid, fields) {
  const options = {};
  await Promise.all(fields.map(async (field) => {
    options[field] = (await Model.distinct(field, { colid })).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }));
  return options;
}

async function addUserAcademicDepartmentOptions(options, colid) {
  const [userAcademicYears, departments] = await Promise.all([
    User.distinct("academicyear", { colid }),
    User.distinct("department", { colid })
  ]);
  options.academicyear = Array.from(new Set([...(options.academicyear || []), ...userAcademicYears].map(text).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  options.department = Array.from(new Set([...(options.department || []), ...departments].map(text).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return options;
}

async function institution(colid) {
  return await Institution.findOne({ colid }).sort({ _id: -1 }).lean() || {};
}

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [courseOptionsRaw, offeringOptions, studentOptions, courses, students, ins] = await Promise.all([
      distinctOptions(CourseMaster, colid, courseFields),
      distinctOptions(Offering, colid, ["academicyear", "category", "valueaddedcourse", "vaccode", "coursetype", "provider", "credittype"]),
      distinctOptions(StudentResult, colid, ["academicyear", "regulation", "program", "programcode", "semester", "department", "valueaddedcoursecategory", "valueaddedcourse", "vaccode", "status"]),
      CourseMaster.find({ colid }).sort({ valueaddedcourse: 1 }).lean(),
      User.find({ colid, role: /^Student$/i }).select("name regno academicyear admissionyear regulation program programcode semester section department gender email phone photo").sort({ name: 1 }).lean(),
      institution(colid)
    ]);
    const courseOptions = await addUserAcademicDepartmentOptions(courseOptionsRaw, colid);
    res.json({ success: true, courseOptions, offeringOptions, studentOptions, courses, students, institution: ins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listCourses = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    applyFilters(query, req.query, courseFields);
    const data = await CourseMaster.find(query).sort({ academicyear: -1, category: 1, valueaddedcourse: 1 }).lean();
    const options = await addUserAcademicDepartmentOptions(await distinctOptions(CourseMaster, colid, courseFields), colid);
    res.json({ success: true, data, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveCourse = async (req, res) => {
  try {
    const payload = pick(req.body, courseFields);
    payload.colid = number(req.body.colid, undefined);
    payload.credit = number(payload.credit, 0);
    payload.name = req.body.name;
    payload.user = req.body.user;
    if (!payload.colid && payload.colid !== 0) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(payload.valueaddedcourse) || !text(payload.vaccode)) return res.status(400).json({ success: false, message: "Course and VAC code are required" });
    const data = req.body.id
      ? await CourseMaster.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true })
      : await CourseMaster.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCourses = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const result = await CourseMaster.deleteMany({ colid, _id: { $in: validIds } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkCourses = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => ({ ...pick(row, courseFields), colid, credit: number(row.credit, 0), name: req.body.name, user: req.body.user }));
    const created = docs.length ? await CourseMaster.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, saved: created.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listOfferings = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    applyFilters(query, req.query, ["academicyear", "category", "valueaddedcourse", "vaccode", "coursetype", "provider", "credittype"]);
    const data = await Offering.find(query).sort({ academicyear: -1, startdate: -1, valueaddedcourse: 1 }).lean();
    res.json({ success: true, data, options: await distinctOptions(Offering, colid, ["academicyear", "category", "valueaddedcourse", "vaccode", "coursetype", "provider", "credittype"]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveOffering = async (req, res) => {
  try {
    const payload = pick(req.body, offeringFields);
    payload.colid = number(req.body.colid, undefined);
    payload.credit = number(payload.credit, 0);
    payload.startdate = date(payload.startdate);
    payload.enddate = date(payload.enddate);
    payload.syllabus = Array.isArray(req.body.syllabus) ? req.body.syllabus.map((row, index) => ({ module: text(row.module), topics: text(row.topics), description: text(row.description), order: number(row.order, index + 1) })).filter((row) => row.module || row.topics) : [];
    payload.name = req.body.name;
    payload.user = req.body.user;
    if (!payload.colid && payload.colid !== 0) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(payload.academicyear) || !text(payload.valueaddedcourse)) return res.status(400).json({ success: false, message: "Academic year and course are required" });
    const data = req.body.id
      ? await Offering.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true })
      : await Offering.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOfferings = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id]).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const result = await Offering.deleteMany({ colid, _id: { $in: ids } });
    await StudentResult.deleteMany({ colid, offeringid: { $in: ids.map(String) } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveStudents = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const saved = [];
    for (const row of rows) {
      const payload = pick(row, studentFields);
      payload.colid = colid;
      payload.marksobtained = number(payload.marksobtained, 0);
      payload.totalmarks = number(payload.totalmarks, 0);
      payload.name = req.body.name;
      payload.user = req.body.user;
      if (!text(payload.regno) || !text(payload.valueaddedcourse)) continue;
      const existing = row.id || row._id;
      const doc = existing
        ? await StudentResult.findOneAndUpdate({ _id: existing, colid }, payload, { new: true })
        : await StudentResult.create(payload);
      saved.push(doc);
    }
    res.json({ success: true, saved: saved.length, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listStudents = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const query = { colid };
    applyFilters(query, req.query, ["offeringid", "academicyear", "regulation", "program", "programcode", "semester", "department", "valueaddedcoursecategory", "valueaddedcourse", "vaccode", "student", "regno", "status"]);
    const data = await StudentResult.find(query).sort({ academicyear: -1, valueaddedcourse: 1, student: 1 }).lean();
    res.json({ success: true, data, options: await distinctOptions(StudentResult, colid, ["academicyear", "regulation", "program", "programcode", "semester", "department", "valueaddedcoursecategory", "valueaddedcourse", "vaccode", "status"]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteStudents = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id]).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const result = await StudentResult.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const query = { colid };
    applyFilters(query, req.body.filters || {}, ["academicyear", "regulation", "program", "programcode", "semester", "department", "valueaddedcoursecategory", "valueaddedcourse", "vaccode", "status"]);
    const students = await StudentResult.find(query).sort({ valueaddedcourse: 1, student: 1 }).lean();
    const offeringIds = Array.from(new Set(students.map((row) => text(row.offeringid)).filter(Boolean)));
    const offerings = await Offering.find({ colid, $or: [{ _id: { $in: offeringIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) } }, { vaccode: { $in: students.map((row) => row.vaccode).filter(Boolean) } }] }).lean();
    const courseMap = new Map(offerings.map((row) => [String(row._id), row]));
    const total = students.length;
    const passed = students.filter((row) => /^pass$/i.test(text(row.status))).length;
    const failed = students.filter((row) => /^fail$/i.test(text(row.status))).length;
    const byCourse = {};
    const byCategory = {};
    students.forEach((row) => {
      const c = text(row.valueaddedcourse) || "Unknown";
      const cat = text(row.valueaddedcoursecategory) || "Unspecified";
      byCourse[c] = byCourse[c] || { name: c, total: 0, pass: 0, fail: 0 };
      byCategory[cat] = byCategory[cat] || { name: cat, total: 0, pass: 0, fail: 0 };
      byCourse[c].total += 1;
      byCategory[cat].total += 1;
      if (/^pass$/i.test(text(row.status))) { byCourse[c].pass += 1; byCategory[cat].pass += 1; }
      if (/^fail$/i.test(text(row.status))) { byCourse[c].fail += 1; byCategory[cat].fail += 1; }
    });
    const syllabusSummary = offerings.map((row) => ({
      offeringid: String(row._id),
      valueaddedcourse: row.valueaddedcourse,
      vaccode: row.vaccode,
      category: row.category,
      modulecount: row.syllabus?.length || 0,
      topiccount: (row.syllabus || []).reduce((sum, item) => sum + text(item.topics).split(/[,;\n]/).filter(Boolean).length, 0),
      syllabus: row.syllabus || []
    }));
    res.json({
      success: true,
      institution: await institution(colid),
      students: students.map((row) => ({ ...row, offering: courseMap.get(text(row.offeringid)) || null })),
      offerings,
      syllabusSummary,
      summary: { total, passed, failed, passpercentage: total ? Number(((passed / total) * 100).toFixed(2)) : 0, failpercentage: total ? Number(((failed / total) * 100).toFixed(2)) : 0 },
      charts: { byCourse: Object.values(byCourse), byCategory: Object.values(byCategory) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentCourses = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    const regno = text(req.query.regno);
    const email = text(req.query.email || req.query.user);
    let student = null;
    if (regno) student = await User.findOne({ colid, regno }).lean();
    if (!student && email) student = await User.findOne({ colid, $or: [{ email }, { user: email }, { googleemail: email }] }).lean();
    const query = { colid };
    if (student?.regno) query.regno = student.regno;
    else if (regno) query.regno = regno;
    else return res.json({ success: true, student: null, data: [], institution: await institution(colid) });
    const data = await StudentResult.find(query).sort({ academicyear: -1, valueaddedcourse: 1 }).lean();
    const offeringIds = data.map((row) => text(row.offeringid)).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const offerings = await Offering.find({ colid, _id: { $in: offeringIds } }).lean();
    const map = new Map(offerings.map((row) => [String(row._id), row]));
    res.json({ success: true, student, data: data.map((row) => ({ ...row, offering: map.get(text(row.offeringid)) || null })), institution: await institution(colid) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
