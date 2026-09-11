const Assignment = require("../Models/mentoringnewassignmentds");
const Interaction = require("../Models/mentoringnewinteractionds");
const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const moduleName = (value) => (/student\s*welfare/i.test(text(value)) ? "Student Welfare" : "Mentoring");
const asArray = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value) ? [text(value)] : [];
const addMulti = (query, field, value) => {
  const values = asArray(value);
  if (values.length === 1) query[field] = values[0];
  if (values.length > 1) query[field] = { $in: values };
};

const baseFilter = (source = {}) => {
  const query = { colid: number(source.colid, 0), module: moduleName(source.module) };
  ["academicyear", "regulation", "program", "programcode", "semester", "officeremail", "regno", "status"].forEach((field) => addMulti(query, field, source[field]));
  return query;
};

const studentFilter = (source = {}) => {
  const query = { colid: number(source.colid, 0), role: /^Student$/i };
  ["academicyear", "regulation", "program", "programcode", "semester", "section"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  if (source.search) {
    const rx = new RegExp(escapeRegex(source.search), "i");
    query.$or = [{ name: rx }, { email: rx }, { regno: rx }];
  }
  return query;
};

const assignmentPayload = (body = {}, student = {}) => ({
  module: moduleName(body.module),
  academicyear: text(body.academicyear || student.academicyear),
  regulation: text(body.regulation || student.regulation),
  program: text(body.program || student.program),
  programcode: text(body.programcode || student.programcode),
  semester: text(body.semester || student.semester),
  student: text(student.student || student.name),
  studentemail: text(student.studentemail || student.email).toLowerCase(),
  regno: text(student.regno),
  section: text(student.section),
  officer: text(body.officer),
  officeremail: text(body.officeremail).toLowerCase(),
  assigneddate: body.assigneddate ? new Date(body.assigneddate) : new Date(),
  status: text(body.status) || "Active",
  colid: number(body.colid, 0),
  user: text(body.user)
});

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [students, assignments, interactions, staff] = await Promise.all([
      User.find({ colid, role: /^Student$/i }).select("academicyear regulation program programcode semester section").limit(5000).lean(),
      Assignment.find({ colid, module: moduleName(req.query.module) }).select("academicyear regulation program programcode semester section officer officeremail status").limit(5000).lean(),
      Interaction.find({ colid, module: moduleName(req.query.module) }).select("academicyear regulation program programcode semester officer officeremail interactiontype status").limit(5000).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email role department designation").sort({ name: 1 }).limit(2000).lean()
    ]);
    const rows = [...students, ...assignments, ...interactions];
    res.json({
      success: true,
      academicyears: uniq(rows.map((row) => row.academicyear)),
      regulations: uniq(rows.map((row) => row.regulation)),
      programs: uniq(rows.map((row) => `${row.program || ""}|||${row.programcode || ""}`).filter((value) => !value.endsWith("|||"))),
      semesters: uniq(rows.map((row) => row.semester)),
      sections: uniq(rows.map((row) => row.section)),
      officers: staff.map((row) => ({ name: row.name, email: row.email, role: row.role, department: row.department, designation: row.designation })),
      assignedOfficers: uniq(assignments.map((row) => `${row.officer || ""}|||${row.officeremail || ""}`).filter((value) => !value.endsWith("|||"))),
      interactiontypes: uniq(["Counselling", "Academic", "Attendance", "Fees", "Discipline", "Career", ...interactions.map((row) => row.interactiontype)]),
      statuses: uniq(["Active", "Transferred", "Closed", ...assignments.map((row) => row.status), ...interactions.map((row) => row.status)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.unassignedStudents = async (req, res) => {
  try {
    const query = studentFilter(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const assigned = await Assignment.find({
      colid: query.colid,
      module: moduleName(req.query.module),
      academicyear: req.query.academicyear,
      regulation: req.query.regulation,
      programcode: req.query.programcode,
      semester: req.query.semester,
      status: "Active"
    }).select("regno").lean();
    const assignedRegnos = assigned.map((row) => row.regno).filter(Boolean);
    if (assignedRegnos.length) query.regno = { $nin: assignedRegnos };
    const rows = await User.find(query).select("name email phone regno academicyear regulation program programcode semester section category gender").sort({ name: 1 }).limit(2000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assign = async (req, res) => {
  try {
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    if (!students.length) return res.status(400).json({ success: false, message: "Select students" });
    if (!text(req.body.officeremail)) return res.status(400).json({ success: false, message: "Select mentor/officer" });
    let saved = 0;
    for (const student of students) {
      const payload = assignmentPayload(req.body, student);
      if (!payload.colid || !payload.academicyear || !payload.programcode || !payload.semester || !payload.regno) continue;
      await Assignment.findOneAndUpdate(
        { colid: payload.colid, module: payload.module, academicyear: payload.academicyear, programcode: payload.programcode, semester: payload.semester, regno: payload.regno },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignments = async (req, res) => {
  try {
    const query = baseFilter(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await Assignment.find(query).sort({ officer: 1, student: 1 }).limit(5000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.transfer = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const colid = number(req.body.colid, 0);
    if (!colid || !ids.length) return res.status(400).json({ success: false, message: "Select assigned students" });
    if (!text(req.body.officeremail)) return res.status(400).json({ success: false, message: "Select target mentor/officer" });
    const existing = await Assignment.find({ colid, _id: { $in: ids } }).lean();
    const ops = existing.map((row) => ({
      updateOne: {
        filter: { _id: row._id, colid },
        update: {
          $set: {
            officer: text(req.body.officer),
            officeremail: text(req.body.officeremail).toLowerCase(),
            transferredfrom: row.officer,
            transferredfromemail: row.officeremail,
            transferremarks: text(req.body.transferremarks),
            assigneddate: new Date(),
            status: "Active",
            user: text(req.body.user)
          }
        }
      }
    }));
    if (ops.length) await Assignment.bulkWrite(ops);
    res.json({ success: true, updated: ops.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeAssignments = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const colid = number(req.body.colid, 0);
    if (!colid || !ids.length) return res.status(400).json({ success: false, message: "Select rows" });
    const result = await Assignment.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveInteraction = async (req, res) => {
  try {
    const assignment = await Assignment.findOne({ _id: req.body.assignmentid, colid: number(req.body.colid, 0) }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });
    const data = await Interaction.create({
      ...assignment,
      _id: undefined,
      assignmentid: assignment._id,
      interactiondate: text(req.body.interactiondate),
      interactiontype: text(req.body.interactiontype) || "Counselling",
      interaction: text(req.body.interaction),
      actiontaken: text(req.body.actiontaken),
      followupdate: text(req.body.followupdate),
      remarks: text(req.body.remarks),
      user: text(req.body.user)
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.interactions = async (req, res) => {
  try {
    const query = baseFilter(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (req.query.fromdate || req.query.todate) {
      query.interactiondate = {};
      if (req.query.fromdate) query.interactiondate.$gte = req.query.fromdate;
      if (req.query.todate) query.interactiondate.$lte = req.query.todate;
    }
    const rows = await Interaction.find(query).sort({ interactiondate: -1, student: 1 }).limit(5000).lean();
    res.json({ success: true, data: rows, summary: summarizeInteractions(rows) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const query = baseFilter(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await Assignment.find(query).sort({ officer: 1, student: 1 }).limit(5000).lean();
    const byOfficer = Object.values(rows.reduce((acc, row) => {
      const key = row.officeremail || "Not assigned";
      acc[key] = acc[key] || { officer: row.officer || "Not assigned", officeremail: row.officeremail || "", students: 0 };
      acc[key].students += 1;
      return acc;
    }, {}));
    const byProgram = Object.values(rows.reduce((acc, row) => {
      const key = row.programcode || "NA";
      acc[key] = acc[key] || { program: row.program || "", programcode: row.programcode || "", students: 0 };
      acc[key].students += 1;
      return acc;
    }, {}));
    res.json({ success: true, data: rows, byOfficer, byProgram, totals: { students: rows.length, officers: byOfficer.length, programs: byProgram.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function summarizeInteractions(rows) {
  const byOfficer = Object.values(rows.reduce((acc, row) => {
    const key = row.officeremail || "Not assigned";
    acc[key] = acc[key] || { officer: row.officer || "Not assigned", officeremail: row.officeremail || "", sessions: 0 };
    acc[key].sessions += 1;
    return acc;
  }, {}));
  const byType = Object.values(rows.reduce((acc, row) => {
    const key = row.interactiontype || "Other";
    acc[key] = acc[key] || { interactiontype: key, sessions: 0 };
    acc[key].sessions += 1;
    return acc;
  }, {}));
  const byDate = Object.values(rows.reduce((acc, row) => {
    const key = row.interactiondate || "No date";
    acc[key] = acc[key] || { interactiondate: key, sessions: 0 };
    acc[key].sessions += 1;
    return acc;
  }, {})).sort((a, b) => String(a.interactiondate).localeCompare(String(b.interactiondate)));
  return { byOfficer, byType, byDate, totals: { sessions: rows.length, officers: byOfficer.length } };
}
