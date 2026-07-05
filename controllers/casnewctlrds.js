const CasNewEntry = require("../Models/casnewentryds");
const CasNewWorkflow = require("../Models/casnewworkflowds");
const User = require("../Models/user");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsResource = require("../Models/neplmsresourceds");
const NepLmsQuiz = require("../Models/neplmsquizds");
const NepLmsAttendance = require("../Models/neplmsattendanceds");
const NepLmsAssessmentMarks = require("../Models/neplmsassessmentmarksds");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const CAS_RULES = [
  { section: "I. Teaching, Learning and Evaluation", group: "Teaching workload", item: "Classes / workload assigned", activitytype: "Teaching", scoreperunit: 1, maxscore: 50 },
  { section: "I. Teaching, Learning and Evaluation", group: "Learning resources", item: "Course material / assignment / lesson plan", activitytype: "Resource", scoreperunit: 2, maxscore: 20 },
  { section: "I. Teaching, Learning and Evaluation", group: "Evaluation", item: "Assessment / examination work", activitytype: "Evaluation", scoreperunit: 1, maxscore: 20 },
  { section: "II. Co-curricular, Extension and Professional Development", group: "Student support", item: "Mentoring / remedial / student activity", activitytype: "Student Support", scoreperunit: 2, maxscore: 20 },
  { section: "II. Co-curricular, Extension and Professional Development", group: "Institutional contribution", item: "Committee / administrative responsibility", activitytype: "Institutional", scoreperunit: 2, maxscore: 20 },
  { section: "III. Research and Academic Contributions", group: "Publication", item: "Research publication", activitytype: "Research", scoreperunit: 10, maxscore: 100 },
  { section: "III. Research and Academic Contributions", group: "Projects and consultancy", item: "Research project / consultancy", activitytype: "Project", scoreperunit: 10, maxscore: 100 },
  { section: "III. Research and Academic Contributions", group: "Patents, awards and guidance", item: "Patent / award / research guidance", activitytype: "Recognition", scoreperunit: 10, maxscore: 100 },
  { section: "III. Research and Academic Contributions", group: "Conference and training", item: "Seminar / FDP / conference", activitytype: "Professional Development", scoreperunit: 5, maxscore: 50 }
];

const findRule = (body = {}) => {
  const section = text(body.section);
  const group = text(body.group);
  const item = text(body.item);
  return CAS_RULES.find((rule) => rule.section === section && rule.group === group && rule.item === item)
    || CAS_RULES.find((rule) => rule.section === section && rule.group === group)
    || CAS_RULES[0];
};

const computeScore = (payload) => {
  const base = payload.quantity * payload.scoreperunit;
  if (payload.maxscore > 0) return Math.min(base, payload.maxscore);
  return base;
};

const approvalStatusForNewEntry = async (payload) => {
  const workflow = await getWorkflow(payload.colid, payload.academicyear, payload.department);
  return {
    status: "Pending Approval",
    approvalstatus: "Pending",
    currentlevel: workflow[0]?.level || 1,
    workflowcomplete: "No",
    submittedat: new Date(),
    approvals: [],
    scoreapproved: 0
  };
};

const getWorkflow = async (colid, academicyear, department) => {
  return CasNewWorkflow.find({
    colid,
    status: "Active",
    $and: [
      { $or: [{ academicyear: text(academicyear) }, { academicyear: "All" }, { academicyear: "" }] },
      { $or: [{ department: text(department) }, { department: "All" }, { department: "" }] }
    ]
  }).sort({ level: 1 }).lean();
};

const workflowMatches = (workflow, row) => {
  const yearOk = !workflow.academicyear || workflow.academicyear === "All" || workflow.academicyear === row.academicyear;
  const deptOk = !workflow.department || workflow.department === "All" || workflow.department === row.department;
  return yearOk && deptOk;
};

const cleanPayload = (body = {}) => {
  const rule = findRule(body);
  const payload = {
    academicyear: text(body.academicyear || body.academicYear || body["Academic Year"]),
    facultyname: text(body.facultyname || body.faculty || body.name || body["Faculty Name"]),
    facultyemail: text(body.facultyemail || body.email || body["Faculty Email"]).toLowerCase(),
    department: text(body.department || body.Department),
    designation: text(body.designation || body.Designation),
    section: text(body.section || body.Section) || rule.section,
    group: text(body.group || body.Group) || rule.group,
    item: text(body.item || body.Item) || rule.item,
    activitytype: text(body.activitytype || body.activityType || body["Activity Type"]) || rule.activitytype,
    title: text(body.title || body.Title),
    description: text(body.description || body.Description),
    date: text(body.date || body.Date),
    fromdate: text(body.fromdate || body.fromDate || body["From Date"]),
    todate: text(body.todate || body.toDate || body["To Date"]),
    quantity: number(body.quantity || body.Quantity, 1),
    scoreperunit: rule.scoreperunit,
    maxscore: rule.maxscore,
    scoreclaimed: 0,
    scoreapproved: 0,
    evidence: text(body.evidence || body.Evidence),
    source: text(body.source || body.Source) || "Manual",
    sourcemodel: text(body.sourcemodel || body.sourceModel || body["Source Model"]),
    sourceref: text(body.sourceref || body.sourceRef || body["Source Ref"]),
    status: "Pending Approval",
    approvalstatus: "Pending",
    currentlevel: 1,
    workflowcomplete: "No",
    submittedat: new Date(),
    approvals: [],
    remarks: text(body.remarks || body.Remarks),
    colid: number(body.colid, 0),
    user: text(body.user)
  };
  payload.scoreclaimed = computeScore(payload);
  return payload;
};

const validate = (payload) => {
  if (!payload.colid) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.facultyemail) return "Faculty email is required";
  if (!payload.facultyname) return "Faculty name is required";
  if (!payload.section) return "Section is required";
  if (!payload.group) return "Group is required";
  if (!payload.item) return "Item is required";
  if (!payload.title) return "Title is required";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = number(source.colid, 0);
  if (colid) query.colid = colid;
  ["academicyear", "facultyemail", "department", "section", "group", "item", "source", "status"].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

const summarize = (rows = []) => {
  const bySection = {};
  const byGroup = {};
  let totalClaimed = 0;
  let totalApproved = 0;
  rows.forEach((row) => {
    const claimed = number(row.scoreclaimed);
    const approved = number(row.scoreapproved);
    totalClaimed += claimed;
    totalApproved += approved;
    const sectionKey = row.section || "Unclassified";
    const groupKey = `${row.section || "Unclassified"} / ${row.group || "General"}`;
    bySection[sectionKey] = bySection[sectionKey] || { name: sectionKey, entries: 0, scoreclaimed: 0, scoreapproved: 0 };
    byGroup[groupKey] = byGroup[groupKey] || { name: groupKey, section: row.section || "Unclassified", group: row.group || "General", entries: 0, scoreclaimed: 0, scoreapproved: 0 };
    bySection[sectionKey].entries += 1;
    bySection[sectionKey].scoreclaimed += claimed;
    bySection[sectionKey].scoreapproved += approved;
    byGroup[groupKey].entries += 1;
    byGroup[groupKey].scoreclaimed += claimed;
    byGroup[groupKey].scoreapproved += approved;
  });
  return {
    totalEntries: rows.length,
    totalClaimed,
    totalApproved,
    bySection: Object.values(bySection),
    byGroup: Object.values(byGroup)
  };
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [users, entries] = await Promise.all([
      User.find({ colid, role: { $ne: "Student" } }).select("name email department designation role").sort({ name: 1 }).lean(),
      CasNewEntry.find({ colid }).select("academicyear department section group item source status facultyemail").lean()
    ]);
    res.json({
      success: true,
      rules: CAS_RULES,
      faculty: users.map((user) => ({
        name: user.name || "",
        email: user.email || "",
        department: user.department || "",
        designation: user.designation || "",
        role: user.role || ""
      })),
      academicyears: uniq(entries.map((item) => item.academicyear)),
      departments: uniq([...users.map((item) => item.department), ...entries.map((item) => item.department)]),
      sections: uniq([...CAS_RULES.map((item) => item.section), ...entries.map((item) => item.section)]),
      groups: uniq([...CAS_RULES.map((item) => item.group), ...entries.map((item) => item.group)]),
      items: uniq([...CAS_RULES.map((item) => item.item), ...entries.map((item) => item.item)]),
      sources: uniq(["Manual", "NEP LMS", ...entries.map((item) => item.source)]),
      statuses: uniq(["Pending Approval", "Approved", "Rejected", ...entries.map((item) => item.status)])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getWorkloads = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    const academicyear = text(req.query.academicyear);
    const facultyemail = text(req.query.facultyemail || req.query.user).toLowerCase();
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    if (academicyear) query.academicyear = academicyear;
    if (facultyemail) query.facultyemail = facultyemail;
    const rows = await WorkloadAssignment.find(query)
      .sort({ academicyear: -1, program: 1, semester: 1, course: 1 })
      .lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEntries = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await CasNewEntry.find(query).sort({ academicyear: -1, section: 1, group: 1, createdAt: -1 }).lean();
    res.json({ success: true, data: rows, summary: summarize(rows) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveEntry = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validate(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    Object.assign(payload, await approvalStatusForNewEntry(payload));
    const data = req.body.id
      ? await CasNewEntry.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await CasNewEntry.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "CAS entry not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const data = await CasNewEntry.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, 0) });
    if (!data) return res.status(404).json({ success: false, message: "CAS entry not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDeleteEntries = async (req, res) => {
  try {
    const colid = number(req.body.colid, 0);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select CAS entries to delete" });
    const result = await CasNewEntry.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });
    const valid = [];
    const errors = [];
    for (const [index, row] of items.entries()) {
      const payload = cleanPayload({ ...row, colid: req.body.colid || row.colid, user: req.body.user || row.user });
      const error = validate(payload);
      if (error) errors.push({ rowNumber: row.rowNumber || index + 2, message: error });
      else valid.push({ ...payload, ...(await approvalStatusForNewEntry(payload)) });
    }
    if (valid.length) await CasNewEntry.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const upsertImported = async (entry) => {
  Object.assign(entry, await approvalStatusForNewEntry(entry));
  await CasNewEntry.findOneAndUpdate(
    {
      colid: entry.colid,
      academicyear: entry.academicyear,
      facultyemail: entry.facultyemail,
      source: entry.source,
      sourcemodel: entry.sourcemodel,
      sourceref: entry.sourceref
    },
    entry,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

exports.importFromNepLms = async (req, res) => {
  try {
    const colid = number(req.body.colid, 0);
    const academicyear = text(req.body.academicyear);
    const facultyemail = text(req.body.facultyemail).toLowerCase();
    const facultyname = text(req.body.facultyname || req.body.name);
    const department = text(req.body.department);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!academicyear) return res.status(400).json({ success: false, message: "Academic year is required" });
    if (!facultyemail) return res.status(400).json({ success: false, message: "Faculty email is required" });

    const base = { colid, academicyear, facultyemail, facultyname, department, user: text(req.body.user), source: "NEP LMS", status: "Imported" };
    let imported = 0;
    const sourceTypes = Array.isArray(req.body.sources) && req.body.sources.length ? req.body.sources : ["workload", "resources", "quizzes", "attendance", "assessment"];

    if (sourceTypes.includes("workload")) {
      const rows = await WorkloadAssignment.find({ colid, academicyear, facultyemail }).lean();
      for (const row of rows) {
        const payload = cleanPayload({
          ...base,
          section: "I. Teaching, Learning and Evaluation",
          group: "Teaching workload",
          item: "Classes / workload assigned",
          activitytype: "Teaching",
          title: `${row.course || row.coursecode} workload`,
          description: `${row.program || ""} ${row.semester ? `Semester ${row.semester}` : ""} ${row.hoursperweek || 0} hours/week`,
          quantity: number(row.hoursperweek, 1),
          source: "NEP LMS",
          sourcemodel: "workloadassignmentds",
          sourceref: String(row._id)
        });
        await upsertImported(payload);
        imported += 1;
      }
    }

    if (sourceTypes.includes("resources")) {
      const rows = await NepLmsResource.find({ colid, academicyear, facultyemail }).lean();
      for (const row of rows) {
        const payload = cleanPayload({
          ...base,
          section: "I. Teaching, Learning and Evaluation",
          group: "Learning resources",
          item: "Course material / assignment / lesson plan",
          activitytype: row.resourcetype || "Resource",
          title: row.title || `${row.resourcetype || "Resource"} ${row.course || ""}`,
          description: row.description || `${row.course || ""} ${row.module || ""} ${row.topic || ""}`,
          evidence: row.url || "",
          quantity: 1,
          source: "NEP LMS",
          sourcemodel: "neplmsresourceds",
          sourceref: String(row._id)
        });
        await upsertImported(payload);
        imported += 1;
      }
    }

    if (sourceTypes.includes("quizzes")) {
      const rows = await NepLmsQuiz.find({ colid, academicyear, facultyemail }).lean();
      for (const row of rows) {
        const questionCount = (row.sections || []).reduce((sum, section) => sum + ((section.questions || []).length), 0);
        const payload = cleanPayload({
          ...base,
          section: "I. Teaching, Learning and Evaluation",
          group: "Evaluation",
          item: "Assessment / examination work",
          activitytype: "Quiz",
          title: row.title || `Quiz ${row.course || ""}`,
          description: `${row.course || ""} ${questionCount} questions`,
          quantity: Math.max(1, questionCount),
          source: "NEP LMS",
          sourcemodel: "neplmsquizds",
          sourceref: String(row._id)
        });
        await upsertImported(payload);
        imported += 1;
      }
    }

    if (sourceTypes.includes("attendance")) {
      const rows = await NepLmsAttendance.aggregate([
        { $match: { colid, academicyear, facultyemail } },
        { $group: { _id: { coursecode: "$coursecode", course: "$course", classdate: "$classdate" }, present: { $sum: "$attendance" }, total: { $sum: 1 } } }
      ]);
      for (const row of rows) {
        const payload = cleanPayload({
          ...base,
          section: "I. Teaching, Learning and Evaluation",
          group: "Evaluation",
          item: "Assessment / examination work",
          activitytype: "Attendance",
          title: `${row._id.course || row._id.coursecode} attendance ${row._id.classdate || ""}`,
          description: `Attendance recorded: ${row.present}/${row.total}`,
          quantity: 1,
          source: "NEP LMS",
          sourcemodel: "NepLmsAttendance",
          sourceref: `${row._id.coursecode || ""}-${row._id.classdate || ""}`
        });
        await upsertImported(payload);
        imported += 1;
      }
    }

    if (sourceTypes.includes("assessment")) {
      const rows = await NepLmsAssessmentMarks.aggregate([
        { $match: { colid, academicyear, facultyemail } },
        { $group: { _id: { coursecode: "$coursecode", course: "$course", component: "$assessmentcomponent" }, count: { $sum: 1 } } }
      ]);
      for (const row of rows) {
        const payload = cleanPayload({
          ...base,
          section: "I. Teaching, Learning and Evaluation",
          group: "Evaluation",
          item: "Assessment / examination work",
          activitytype: "Assessment marks",
          title: `${row._id.component || "Assessment"} - ${row._id.course || row._id.coursecode}`,
          description: `${row.count} student marks entered`,
          quantity: Math.max(1, Math.ceil(row.count / 10)),
          source: "NEP LMS",
          sourcemodel: "neplmsassessmentmarksds",
          sourceref: `${row._id.coursecode || ""}-${row._id.component || ""}`
        });
        await upsertImported(payload);
        imported += 1;
      }
    }

    res.json({ success: true, imported });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.summary = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await CasNewEntry.find(query).sort({ section: 1, group: 1, item: 1 }).lean();
    res.json({ success: true, data: rows, summary: summarize(rows) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getWorkflow = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await CasNewWorkflow.find({ colid }).sort({ academicyear: 1, department: 1, level: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveWorkflow = async (req, res) => {
  try {
    const payload = {
      academicyear: text(req.body.academicyear) || "All",
      department: text(req.body.department) || "All",
      level: number(req.body.level, 1),
      approverrole: text(req.body.approverrole),
      approvername: text(req.body.approvername),
      approveremail: text(req.body.approveremail).toLowerCase(),
      actiontype: text(req.body.actiontype) || "Approve",
      status: text(req.body.status) || "Active",
      colid: number(req.body.colid, 0),
      user: text(req.body.user)
    };
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.level) return res.status(400).json({ success: false, message: "Level is required" });
    const data = req.body.id
      ? await CasNewWorkflow.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await CasNewWorkflow.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Workflow level not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteWorkflow = async (req, res) => {
  try {
    const data = await CasNewWorkflow.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, 0) });
    if (!data) return res.status(404).json({ success: false, message: "Workflow level not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPendingApprovals = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    const useremail = text(req.query.useremail || req.query.user).toLowerCase();
    const role = text(req.query.role);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const admin = role === "All" || role === "Admin";
    const workflows = await CasNewWorkflow.find(admin ? { colid, status: "Active" } : {
      colid,
      status: "Active",
      $or: [{ approveremail: useremail }, { approverrole: role }]
    }).lean();
    const levels = admin ? [] : [...new Set(workflows.map((item) => number(item.level, 0)).filter(Boolean))];
    const query = { colid, approvalstatus: "Pending" };
    if (!admin) query.currentlevel = { $in: levels.length ? levels : [-1] };
    const rows = await CasNewEntry.find(query).sort({ facultyname: 1, submittedat: -1 }).lean();
    const data = admin ? rows : rows.filter((row) => workflows.some((workflow) => number(workflow.level) === number(row.currentlevel) && workflowMatches(workflow, row)));
    const applicants = uniq(data.map((row) => `${row.facultyname || row.facultyemail} <${row.facultyemail}>`));
    res.json({ success: true, data, applicants });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveEntries = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const colid = number(req.body.colid, 0);
    const action = text(req.body.action) === "Rejected" ? "Rejected" : "Approved";
    if (!colid || !ids.length) return res.status(400).json({ success: false, message: "Select entries for approval" });
    let updated = 0;
    for (const id of ids) {
      const row = await CasNewEntry.findOne({ _id: id, colid });
      if (!row || row.approvalstatus !== "Pending") continue;
      row.approvals.push({
        level: row.currentlevel,
        approverrole: text(req.body.approverrole || req.body.role),
        approvername: text(req.body.approvername || req.body.name),
        approveremail: text(req.body.approveremail || req.body.user).toLowerCase(),
        action,
        comments: text(req.body.comments),
        actiondate: new Date()
      });
      if (action === "Rejected") {
        row.status = "Rejected";
        row.approvalstatus = "Rejected";
        row.workflowcomplete = "Yes";
        row.scoreapproved = 0;
      } else {
        const workflow = await getWorkflow(row.colid, row.academicyear, row.department);
        const next = workflow.find((item) => number(item.level) > number(row.currentlevel));
        if (next) {
          row.currentlevel = number(next.level, row.currentlevel + 1);
          row.status = "Pending Approval";
          row.approvalstatus = "Pending";
          row.workflowcomplete = "No";
        } else {
          row.status = "Approved";
          row.approvalstatus = "Approved";
          row.workflowcomplete = "Yes";
          row.scoreapproved = row.scoreclaimed;
        }
      }
      await row.save();
      updated += 1;
    }
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPastApprovals = async (req, res) => {
  try {
    const colid = number(req.query.colid, 0);
    const approveremail = text(req.query.approveremail || req.query.user).toLowerCase();
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await CasNewEntry.find({ colid, "approvals.approveremail": approveremail }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getApprovalStatus = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!query.facultyemail && req.query.user) query.facultyemail = text(req.query.user).toLowerCase();
    const rows = await CasNewEntry.find(query).sort({ academicyear: -1, submittedat: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
