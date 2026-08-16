const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const Institution = require("../Models/insdetails");
const Project = require("../Models/projects");
const Publication = require("../Models/publications");
const Patent = require("../Models/patents");
const TeacherFellow = require("../Models/teacherfs");
const Consultancy = require("../Models/consultancy");
const Seminar = require("../Models/seminar");
const Book = require("../Models/book");
const MoocStudent = require("../Models/moocvalueaddedstudentds");
const ExamMarksAll = require("../Models/exammarksall");
const ExamModel2Marks = require("../Models/examinationmodel2marksds");
const ExamModel2Viva = require("../Models/examinationmodel2vivamarksds");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const parseMulti = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(",").map(text).filter(Boolean).filter((item) => item.toLowerCase() !== "all");
const notExcluded = { $ne: "Yes" };

const statusOptionDefaults = {
  submissionstatus: ["Submitted", "Approved", "Rejected"],
  documentstatus: ["Blank", "Approved", "Rejected"],
  aivalidationstatus: ["Pass", "Fail"],
  overallstatus: ["Submitted", "Approved", "Rejected"],
  status: ["Pass", "Fail", "Submitted", "Approved", "Rejected"],
  overallgrade: ["A++", "A+", "A", "B+", "B", "C", "D", "F"]
};

const personalModels = {
  projects: { label: "Projects", Model: Project, fields: ["project", "agency", "type", "yop", "department", "funds", "level", "duration"] },
  publications: { label: "Publications", Model: Publication, fields: ["department", "title", "journal", "yop", "issn", "articlelink", "journallink", "hindex", "citation", "citationindex", "ugclisted"] },
  patents: { label: "Patents", Model: Patent, fields: ["title", "patentnumber", "doa", "agency", "patentstatus", "yop"] },
  teacherfellow: { label: "Fellowship and Awards", Model: TeacherFellow, fields: ["year", "tname", "workshop", "profbody", "amount", "source", "level", "award", "purpose", "duration"] },
  consultancy: { label: "Consultancy", Model: Consultancy, fields: ["year", "duration", "consultant", "advisor", "department", "trainees", "title", "role", "agency", "contact", "revenue"] },
  seminar: { label: "Seminars", Model: Seminar, fields: ["title", "duration", "yop", "membership", "amount", "role", "paper", "level", "type"] },
  book: { label: "Books", Model: Book, fields: ["booktitle", "papertitle", "proceeding", "yop", "issn", "publisher", "conferencename", "level", "type", "affiliated"] }
};

async function institution(colid) {
  return await Institution.findOne({ colid }).sort({ _id: -1 }).lean() || {};
}

function applyFilters(query, source = {}, fields = []) {
  fields.forEach((field) => {
    const values = parseMulti(source[field]);
    if (values.length === 1) query[field] = regex(values[0]);
    if (values.length > 1) query[field] = { $in: values };
  });
}

function applyAcademicYearFilter(query, source = {}, fields = ["academicyear"]) {
  const years = parseMulti(source.academicyear);
  if (!years.length) return;
  query.$and = query.$and || [];
  query.$and.push({ $or: fields.map((field) => ({ [field]: { $in: years } })) });
}

async function excludedMaps(colid) {
  const [users, programs] = await Promise.all([
    User.find({ colid, excluded: /^yes$/i }).select("email user regno").lean(),
    MPrograms.find({ colid, excluded: /^yes$/i }).select("programcode program").lean()
  ]);
  return {
    users,
    emails: new Set(users.flatMap((row) => [text(row.email).toLowerCase(), text(row.user).toLowerCase()]).filter(Boolean)),
    regnos: new Set(users.map((row) => text(row.regno).toLowerCase()).filter(Boolean)),
    programcodes: new Set(programs.map((row) => text(row.programcode).toLowerCase()).filter(Boolean))
  };
}

function isExcludedUser(row, maps) {
  return maps.emails.has(text(row.user || row.email).toLowerCase()) || maps.regnos.has(text(row.regno).toLowerCase());
}

function isExcludedProgram(row, maps) {
  return maps.programcodes.has(text(row.programcode).toLowerCase());
}

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const personalPromises = Object.values(personalModels).map(({ Model, fields }) => (
      Model.find({ colid }).select([...fields, "name", "user", "submissionstatus", "documentstatus", "aivalidationstatus", "overallstatus", "accreditationframework"].join(" ")).lean()
    ));
    const [users, programs, mooc, marks1, marks2, marks3, ...personalRowsByKind] = await Promise.all([
      User.find({ colid }).select("academicyear admissionyear role department program programcode semester regulation section gender category designation institution excluded").lean(),
      MPrograms.find({ colid }).select("year program programcode faculty institution department excluded").lean(),
      MoocStudent.find({ colid }).select("academicyear regulation program programcode semester department valueaddedcoursecategory valueaddedcourse vaccode status").lean(),
      ExamMarksAll.find({ colid }).select("academicyear exam examcode program programcode semester status egrade").lean(),
      ExamModel2Marks.find({ colid }).select("academicyear exam examcode program programcode semester status overallgrade").lean(),
      ExamModel2Viva.find({ colid }).select("academicyear exam examcode program programcode semester status overallgrade").lean(),
      ...personalPromises
    ]);
    const personalRows = personalRowsByKind.flat();
    const rows = [...users, ...programs, ...mooc, ...marks1, ...marks2, ...marks3, ...personalRows];
    const fieldOptions = {};
    Object.values(personalModels).forEach(({ fields }) => {
      [...fields, "name", "user", "submissionstatus", "documentstatus", "aivalidationstatus", "overallstatus", "accreditationframework"].forEach((field) => {
        fieldOptions[field] = uniqueSorted([...(fieldOptions[field] || []), ...personalRows.map((row) => row[field])]);
      });
    });
    res.json({
      success: true,
      institution: await institution(colid),
      options: {
        ...fieldOptions,
        academicyear: uniqueSorted(rows.flatMap((row) => [row.academicyear, row.year, row.admissionyear])).reverse(),
        role: uniqueSorted(users.map((row) => row.role)),
        department: uniqueSorted(rows.map((row) => row.department)),
        program: uniqueSorted(rows.map((row) => row.program)),
        programcode: uniqueSorted(rows.map((row) => row.programcode)),
        semester: uniqueSorted(rows.map((row) => row.semester)),
        regulation: uniqueSorted(rows.map((row) => row.regulation)),
        exam: uniqueSorted(rows.map((row) => row.exam)),
        examcode: uniqueSorted(rows.map((row) => row.examcode)),
        status: uniqueSorted([...mooc.map((row) => row.status), ...marks1.map((row) => row.status), ...marks2.map((row) => row.status), ...marks3.map((row) => row.status), ...statusOptionDefaults.status]),
        overallgrade: uniqueSorted([...marks1.map((row) => row.egrade), ...marks2.map((row) => row.overallgrade), ...marks3.map((row) => row.overallgrade), ...statusOptionDefaults.overallgrade]),
        submissionstatus: uniqueSorted([...(fieldOptions.submissionstatus || []), ...statusOptionDefaults.submissionstatus]),
        documentstatus: uniqueSorted([...(fieldOptions.documentstatus || []), ...statusOptionDefaults.documentstatus]),
        aivalidationstatus: uniqueSorted([...(fieldOptions.aivalidationstatus || []), ...statusOptionDefaults.aivalidationstatus]),
        overallstatus: uniqueSorted([...(fieldOptions.overallstatus || []), ...statusOptionDefaults.overallstatus]),
        valueaddedcourse: uniqueSorted(mooc.map((row) => row.valueaddedcourse)),
        valueaddedcoursecategory: uniqueSorted(mooc.map((row) => row.valueaddedcoursecategory)),
        vaccode: uniqueSorted(mooc.map((row) => row.vaccode)),
        admissionyear: uniqueSorted(users.map((row) => row.admissionyear)),
        designation: uniqueSorted(users.map((row) => row.designation)),
        gender: uniqueSorted(users.map((row) => row.gender)),
        category: uniqueSorted(users.map((row) => row.category)),
        section: uniqueSorted(users.map((row) => row.section)),
        institution: uniqueSorted(programs.map((row) => row.institution))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.personalData = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const config = personalModels[req.params.kind] || personalModels.projects;
    const query = { colid };
    applyAcademicYearFilter(query, req.query, ["academicyear", "yop", "year"]);
    applyFilters(query, req.query, [...config.fields, "submissionstatus", "documentstatus", "aivalidationstatus", "overallstatus", "accreditationframework", "name", "user"]);
    const maps = await excludedMaps(colid);
    const data = (await config.Model.find(query).sort({ updatedAt: -1, _id: -1 }).lean())
      .filter((row) => !isExcludedUser(row, maps));
    res.json({ success: true, institution: await institution(colid), label: config.label, fields: config.fields, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.valueAdded = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const query = { colid };
    applyAcademicYearFilter(query, req.body.filters || {}, ["academicyear"]);
    applyFilters(query, req.body.filters || {}, ["academicyear", "regulation", "program", "programcode", "semester", "department", "valueaddedcoursecategory", "valueaddedcourse", "vaccode", "status"]);
    const maps = await excludedMaps(colid);
    const data = (await MoocStudent.find(query).sort({ academicyear: -1, valueaddedcourse: 1, student: 1 }).lean())
      .filter((row) => !isExcludedUser(row, maps) && !isExcludedProgram(row, maps));
    const total = data.length;
    const passed = data.filter((row) => /^pass$/i.test(text(row.status))).length;
    const failed = data.filter((row) => /^fail$/i.test(text(row.status))).length;
    const byCourse = {};
    const byCategory = {};
    data.forEach((row) => {
      const course = text(row.valueaddedcourse) || "Unknown";
      const category = text(row.valueaddedcoursecategory) || "Unspecified";
      byCourse[course] = byCourse[course] || { label: course, total: 0, pass: 0, fail: 0 };
      byCategory[category] = byCategory[category] || { label: category, total: 0, pass: 0, fail: 0 };
      byCourse[course].total += 1;
      byCategory[category].total += 1;
      if (/^pass$/i.test(text(row.status))) { byCourse[course].pass += 1; byCategory[category].pass += 1; }
      if (/^fail$/i.test(text(row.status))) { byCourse[course].fail += 1; byCategory[category].fail += 1; }
    });
    res.json({
      success: true,
      institution: await institution(colid),
      data,
      summary: { total, passed, failed, passpercentage: total ? Number(((passed / total) * 100).toFixed(2)) : 0 },
      charts: { byCourse: Object.values(byCourse), byCategory: Object.values(byCategory) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function normalizedMarksRows(rows, source) {
  return rows.map((row) => ({
    source,
    academicyear: row.academicyear,
    exam: row.exam,
    examcode: row.examcode,
    program: row.program,
    programcode: row.programcode,
    semester: row.semester,
    student: row.student || row.name,
    regno: row.regno,
    status: row.status || row.status1 || (/^f$/i.test(text(row.egrade)) ? "Fail" : "Pass"),
    overallgrade: row.overallgrade || row.egrade
  }));
}

exports.passPercentage = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const filters = req.body.filters || {};
    const query = { colid };
    applyAcademicYearFilter(query, filters, ["academicyear"]);
    applyFilters(query, filters, ["exam", "examcode", "program", "programcode", "semester"]);
    const maps = await excludedMaps(colid);
    const [m1, m2, m3] = await Promise.all([
      ExamMarksAll.find(query).lean(),
      ExamModel2Marks.find(query).lean(),
      ExamModel2Viva.find(query).lean()
    ]);
    const statusFilters = parseMulti(filters.status);
    const gradeFilters = parseMulti(filters.overallgrade);
    const data = [...normalizedMarksRows(m1, "exammarksall"), ...normalizedMarksRows(m2, "exammodel2marks"), ...normalizedMarksRows(m3, "exammodel2viva")]
      .filter((row) => !statusFilters.length || statusFilters.some((value) => regex(value).test(text(row.status))))
      .filter((row) => !gradeFilters.length || gradeFilters.some((value) => regex(value).test(text(row.overallgrade))))
      .filter((row) => !isExcludedUser(row, maps) && !isExcludedProgram(row, maps));
    const map = new Map();
    data.forEach((row) => {
      const key = [row.academicyear, row.examcode, row.programcode].map(text).join("||");
      if (!map.has(key)) map.set(key, { id: key, academicyear: row.academicyear, exam: row.exam, examcode: row.examcode, program: row.program, programcode: row.programcode, students: new Map() });
      const bucket = map.get(key);
      const regno = text(row.regno);
      if (!regno) return;
      const existing = bucket.students.get(regno) || { failed: false, rows: 0 };
      existing.rows += 1;
      if (/^fail$/i.test(text(row.status)) || /^f$/i.test(text(row.overallgrade))) existing.failed = true;
      bucket.students.set(regno, existing);
    });
    const rows = [...map.values()].map((bucket) => {
      const students = [...bucket.students.values()];
      const appeared = students.length;
      const failed = students.filter((item) => item.failed).length;
      const passed = appeared - failed;
      return { ...bucket, students: undefined, appeared, passed, failed, passpercentage: appeared ? Number(((passed / appeared) * 100).toFixed(2)) : 0 };
    }).sort((a, b) => text(a.academicyear).localeCompare(text(b.academicyear), undefined, { numeric: true }) || text(a.programcode).localeCompare(text(b.programcode), undefined, { numeric: true }));
    const totalAppeared = rows.reduce((sum, row) => sum + row.appeared, 0);
    const totalPassed = rows.reduce((sum, row) => sum + row.passed, 0);
    res.json({ success: true, institution: await institution(colid), data: rows, raw: data, summary: { appeared: totalAppeared, passed: totalPassed, failed: totalAppeared - totalPassed, passpercentage: totalAppeared ? Number(((totalPassed / totalAppeared) * 100).toFixed(2)) : 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.userDetails = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const role = /^student$/i.test(text(req.params.role)) ? "Student" : "Faculty";
    const query = { colid, role: new RegExp(`^${role}$`, "i"), excluded: notExcluded };
    const years = parseMulti(req.body.academicyear);
    if (years.length) query.$or = [{ academicyear: { $in: years } }, { admissionyear: { $in: years } }];
    applyFilters(query, req.body.filters || {}, ["admissionyear", "department", "program", "programcode", "semester", "section", "regulation", "gender", "category", "institution", "designation"]);
    const data = await User.find(query).select("-password -authenticatorsecret -expotoken").sort({ academicyear: -1, department: 1, programcode: 1, name: 1 }).lean();
    const byYear = {};
    const byDepartment = {};
    const byProgram = {};
    data.forEach((row) => {
      const year = text(row.academicyear || row.admissionyear) || "Unspecified";
      const dept = text(row.department) || "Unspecified";
      const program = text(row.programcode) || "Unspecified";
      byYear[year] = (byYear[year] || 0) + 1;
      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      byProgram[program] = (byProgram[program] || 0) + 1;
    });
    const toChart = (obj) => Object.entries(obj).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    res.json({ success: true, institution: await institution(colid), role, data, summary: { total: data.length }, charts: { byYear: toChart(byYear), byDepartment: toChart(byDepartment), byProgram: toChart(byProgram) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
