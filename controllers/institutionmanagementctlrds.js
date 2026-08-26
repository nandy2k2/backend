const InstitutionAchievement = require("../Models/institutionachievementds");
const InstitutionAccreditationStatus = require("../Models/institutionaccreditationstatusds");
const InstitutionStatute = require("../Models/institutionstatuteds");
const InstitutionStatuteWorkflow = require("../Models/institutionstatuteworkflowds");
const InstitutionRule = require("../Models/institutionruleds");
const InstitutionSchoolStatute = require("../Models/institutionschoolstatuteds");
const InstitutionMou = require("../Models/institutionmouds");
const InstitutionMouWorkflow = require("../Models/institutionmouworkflowds");
const InstitutionMouActivity = require("../Models/institutionmouactivityds");
const MPrograms = require("../Models/mprograms");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const User = require("../Models/user");
const AcademicNewTask = require("../Models/academicnewtaskds");
const InsDetails = require("../Models/insdetails");
const Project = require("../Models/projects");
const Publication = require("../Models/lpublications");
const Patent = require("../Models/patents");
const Seminar = require("../Models/seminar");
const HrSalary = require("../Models/hrsalary");
const PlacementRecord = require("../Models/placementnewrecordds");
const { EventNew } = require("../Models/eventmanagementnewds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const amount = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const scoped = (source = {}) => {
  const colid = number(source.colid);
  if (colid === undefined) throw new Error("colid is required");
  return { colid };
};
const dateOnly = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const arrayText = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(/[,;|]/).map(text).filter(Boolean);
const toClient = (row) => {
  const item = row?.toObject ? row.toObject() : { ...(row || {}) };
  ["achievementdate", "accreditationdate", "validitydate", "startdate", "duedate", "submittedat", "approvedat", "rejectedat", "actiondate"].forEach((field) => {
    if (item[field]) item[field] = new Date(item[field]).toISOString().slice(0, 10);
  });
  return item;
};
const countBy = (rows = [], keyFn) => Object.values(rows.reduce((acc, row) => {
  const key = text(typeof keyFn === "function" ? keyFn(row) : row[keyFn]) || "Not specified";
  acc[key] = acc[key] || { label: key, count: 0 };
  acc[key].count += 1;
  return acc;
}, {})).sort((a, b) => b.count - a.count);
const academicYearStart = (value) => {
  const match = text(value).match(/\d{4}/);
  return match ? match[0] : "";
};
const matchesAcademicYear = (row = {}, academicyear = "") => {
  const year = text(academicyear);
  if (!year) return true;
  const exactFields = ["academicyear", "year", "yop"];
  if (exactFields.some((field) => text(row[field]) === year)) return true;
  const startYear = academicYearStart(year);
  if (!startYear) return false;
  return ["achievementdate", "accreditationdate", "validitydate", "doa", "startdate", "enddate", "createdAt", "updatedAt"].some((field) => {
    if (!row[field]) return false;
    const date = new Date(row[field]);
    return !Number.isNaN(date.getTime()) && String(date.getFullYear()) === startYear;
  });
};

const configs = {
  achievements: {
    Model: InstitutionAchievement,
    fields: ["academicyear", "type", "name", "regno", "achievement", "achievementtype", "category", "achievementdate", "agency", "location", "status"],
    dateFields: ["achievementdate"]
  },
  accreditation: {
    Model: InstitutionAccreditationStatus,
    fields: ["accreditation", "type", "program", "department", "accreditationdate", "validitydate", "status"],
    dateFields: ["accreditationdate", "validitydate"]
  },
  rules: {
    Model: InstitutionRule,
    fields: ["type", "rule", "description", "role", "filelink", "active", "startdate", "enddate"],
    dateFields: ["startdate", "enddate"],
    arrayFields: ["role"]
  },
  statute: {
    Model: InstitutionStatute,
    fields: ["academicyear", "statute", "description", "filelink", "approvalstatus"],
    dateFields: []
  },
  schoolstatute: {
    Model: InstitutionSchoolStatute,
    fields: ["academicyear", "faculty", "statute", "description", "filelink", "approvalstatus"],
    dateFields: []
  },
  mou: {
    Model: InstitutionMou,
    fields: ["academicyear", "mou", "details", "type", "party", "description", "level", "startdate", "enddate", "faculty", "department", "approvalstatus"],
    dateFields: ["startdate", "enddate"]
  },
  mouactivity: {
    Model: InstitutionMouActivity,
    fields: ["mouid", "mou", "academicyear", "activity", "activitydate", "description", "filelink", "brochurelink", "reportlink", "guest", "location", "attendancelist"],
    dateFields: ["activitydate"]
  }
};

const payloadFor = (kind, source = {}) => {
  const config = configs[kind];
  const payload = scoped(source);
  config.fields.forEach((field) => {
    if ((config.arrayFields || []).includes(field)) payload[field] = arrayText(source[field]);
    else payload[field] = config.dateFields.includes(field) ? dateOnly(source[field]) : text(source[field]);
  });
  if (kind === "mouactivity" && text(source.mouid)) payload.mouid = source.mouid;
  payload.user = text(source.user);
  payload.namecreated = text(source.namecreated || source.createdby || source.name);
  return payload;
};

const buildQuery = (kind, source = {}) => {
  const config = configs[kind];
  const query = scoped(source);
  config.fields.forEach((field) => {
    if (config.dateFields.includes(field)) return;
    if (text(source[field])) query[field] = regex(source[field]);
  });
  config.dateFields.forEach((field) => {
    const from = dateOnly(source[`${field}from`]);
    const to = dateOnly(source[`${field}to`]);
    if (from || to) {
      query[field] = {};
      if (from) query[field].$gte = from;
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        query[field].$lte = end;
      }
    }
  });
  return query;
};

exports.options = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const [achievements, accreditation, statutes, schoolStatutes, mous, mouActivities, workflows, programs, users, courses, placementRecords] = await Promise.all([
      InstitutionAchievement.find({ colid }).lean(),
      InstitutionAccreditationStatus.find({ colid }).lean(),
      InstitutionStatute.find({ colid }).lean(),
      InstitutionSchoolStatute.find({ colid }).lean(),
      InstitutionMou.find({ colid }).lean(),
      InstitutionMouActivity.find({ colid }).lean(),
      InstitutionStatuteWorkflow.find({ colid }).lean(),
      MPrograms.find({ colid }).select("year program programcode institution department faculty").lean(),
      User.find({ colid }).select("name email user regno role department program programcode academicyear category").limit(5000).lean(),
      RegulationCourseMap.find({ colid }).select("academicyear").lean(),
      PlacementRecord.find({ colid }).select("academicyear").lean()
    ]);
    res.json({
      success: true,
      academicyears: uniqueSorted([...achievements.map((row) => row.academicyear), ...statutes.map((row) => row.academicyear), ...schoolStatutes.map((row) => row.academicyear), ...mous.map((row) => row.academicyear), ...mouActivities.map((row) => row.academicyear), ...workflows.map((row) => row.academicyear), ...programs.map((row) => row.year), ...users.map((row) => row.academicyear), ...courses.map((row) => row.academicyear), ...placementRecords.map((row) => row.academicyear)]),
      programs: uniqueSorted(programs.map((row) => row.program)),
      departments: uniqueSorted([...programs.map((row) => row.department), ...users.map((row) => row.department), ...accreditation.map((row) => row.department)]),
      institutions: uniqueSorted(programs.map((row) => row.institution)),
      faculties: uniqueSorted(programs.map((row) => row.faculty)),
      achievementtypes: uniqueSorted([...achievements.map((row) => row.achievementtype), "Academic Project", "National award", "International award", "Publication", "Patent", "Fellowship", "1st Prize", "Runner up"]),
      categories: uniqueSorted([...achievements.map((row) => row.category), "Academic", "Sports", "Extra curricular"]),
      users: users.map((row) => ({
        label: `${row.name || row.email || row.user || row.regno} (${row.regno || row.email || row.user || ""})`,
        name: row.name || "",
        email: row.email || row.user || "",
        regno: row.regno || row.email || row.user || "",
        role: row.role || ""
      })),
      accreditations: uniqueSorted(accreditation.map((row) => row.accreditation)),
      mous: mous.map((row) => ({ id: row._id, _id: row._id, label: `${row.mou || "MoU"} (${row.academicyear || ""})`, mou: row.mou || "", academicyear: row.academicyear || "" }))
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const kind = req.params.kind;
    const config = configs[kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid institution model" });
    const rows = await config.Model.find(buildQuery(kind, req.query)).sort({ updatedAt: -1 }).limit(5000);
    res.json({ success: true, rows: rows.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const kind = req.params.kind;
    const config = configs[kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid institution model" });
    const payload = payloadFor(kind, req.body);
    const row = req.body.id
      ? await config.Model.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await config.Model.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, row: toClient(row) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const kind = req.params.kind;
    const config = configs[kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid institution model" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => payloadFor(kind, { ...row, colid: req.body.colid, user: req.body.user, namecreated: req.body.namecreated }));
    const result = docs.length ? await config.Model.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: result.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const kind = req.params.kind;
    const config = configs[kind];
    if (!config) return res.status(404).json({ success: false, message: "Invalid institution model" });
    const { colid } = scoped(req.body);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await config.Model.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.vcDashboard = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const academicyear = text(req.query.academicyear);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      programs,
      courses,
      achievements,
      accreditations,
      projects,
      publications,
      patents,
      seminars,
      events,
      users,
      salaryRows,
      placementRecords,
      institution,
      tasks
    ] = await Promise.all([
      MPrograms.find({ colid, excluded: { $ne: "Yes" } }).lean(),
      RegulationCourseMap.find({ colid }).lean(),
      InstitutionAchievement.find({ colid }).lean(),
      InstitutionAccreditationStatus.find({ colid }).lean(),
      Project.find({ colid }).lean(),
      Publication.find({ colid }).lean(),
      Patent.find({ colid }).lean(),
      Seminar.find({ colid }).lean(),
      EventNew.find({ colid }).lean(),
      User.find({ colid, excluded: { $ne: "Yes" } }).select("role program programcode category academicyear isfinalyear").lean(),
      HrSalary.find({ colid }).lean(),
      PlacementRecord.find({ colid }).lean(),
      InsDetails.findOne({ colid }).sort({ updatedAt: -1 }).lean(),
      AcademicNewTask.find({ colid }).sort({ duedate: 1, updatedAt: -1 }).limit(1000).lean()
    ]);

    const filteredPrograms = programs.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredCourses = courses.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredAchievements = achievements.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredProjects = projects.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredPublications = publications.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredPatents = patents.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredSeminars = seminars.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredEvents = events.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredUsers = users.filter((row) => !academicyear || !text(row.academicyear) || text(row.academicyear) === academicyear);
    const filteredPlacementRecords = placementRecords.filter((row) => matchesAcademicYear(row, academicyear));
    const filteredSalaryRows = salaryRows.filter((row) => matchesAcademicYear(row, academicyear));
    const nonStudents = filteredUsers.filter((row) => !/^student$/i.test(text(row.role)));
    const students = filteredUsers.filter((row) => /^student$/i.test(text(row.role)));
    const facultyUsers = filteredUsers.filter((row) => /^faculty$/i.test(text(row.role)));
    const finalYearStudents = users.filter((row) => /^student$/i.test(text(row.role)) && /^yes$/i.test(text(row.isfinalyear)) && (!academicyear || text(row.academicyear) === academicyear));
    const studentAchievements = filteredAchievements.filter((row) => /^student$/i.test(text(row.type)));
    const otherAchievements = filteredAchievements.filter((row) => !/^student$/i.test(text(row.type)));
    const programCount = uniqueSorted(filteredPrograms.map((row) => row.programcode || row.program)).length;
    const courseCount = uniqueSorted(filteredCourses.map((row) => row.coursecode || row.course)).length;
    const expiredAccreditation = accreditations.filter((row) => matchesAcademicYear(row, academicyear) && row.validitydate && new Date(row.validitydate) < today).length;
    const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
    const currentYear = String(today.getFullYear());
    const monthlySalaryRows = filteredSalaryRows.filter((row) => {
      const month = text(row.month);
      const year = text(row.year);
      return (!year || year === currentYear) && (!month || month === currentMonth || month.toLowerCase() === today.toLocaleString("en-US", { month: "long" }).toLowerCase());
    });
    const totalMonthlySalary = monthlySalaryRows.reduce((sum, row) => sum + amount(row.amount), 0);
    const placedKeys = new Set(filteredPlacementRecords.filter((row) => !/^inactive$/i.test(text(row.status))).map((row) => text(row.regno) || `${text(row.student)}-${text(row.programcode)}`).filter(Boolean));
    const finalYearKeys = new Set(finalYearStudents.map((row) => text(row.regno) || text(row.email) || text(row.user)).filter(Boolean));
    const placedFinalYear = [...placedKeys].filter((key) => finalYearKeys.has(key)).length || placedKeys.size;
    const placementPercentage = finalYearStudents.length ? Number(((placedFinalYear / finalYearStudents.length) * 100).toFixed(2)) : 0;

    const currentEmail = text(req.query.useremail || req.query.facultyemail || req.query.user).toLowerCase();
    const filteredTasks = tasks.filter((row) => {
      const taskEmail = text(row.facultyemail).toLowerCase();
      return matchesAcademicYear(row, academicyear) && (!currentEmail || taskEmail === currentEmail);
    });
    const activeTasks = filteredTasks.filter((row) => !/^completed$/i.test(text(row.status)) && (!row.startdate || new Date(row.startdate) <= today) && (!row.duedate || new Date(row.duedate) >= today));
    const overdueTasks = filteredTasks.filter((row) => !/^completed$/i.test(text(row.status)) && row.duedate && new Date(row.duedate) < today);
    const cards = [
      ["institutions", "Institutions", uniqueSorted(filteredPrograms.map((row) => row.institution)).length],
      ["faculties", "Faculties", uniqueSorted(filteredPrograms.map((row) => row.faculty)).length],
      ["teachers", "Teachers", facultyUsers.length],
      ["programs", "Programs", programCount],
      ["courses", "Courses", courseCount],
      ["accreditation", "Total Accreditation", accreditations.filter((row) => matchesAcademicYear(row, academicyear)).length],
      ["expired", "Expired Accreditation", expiredAccreditation],
      ["studentAchievements", "Achievements by Students", studentAchievements.length],
      ["otherAchievements", "Achievements by Other Users", otherAchievements.length],
      ["projects", "Projects", filteredProjects.length],
      ["publications", "Publications", filteredPublications.length],
      ["patents", "Patents", filteredPatents.length],
      ["seminars", "Seminars", filteredSeminars.length],
      ["events", "Events Organized", filteredEvents.length],
      ["users", "Users Except Students", nonStudents.length],
      ["ratio", "Faculty/Student Ratio", students.length ? Number((facultyUsers.length / students.length).toFixed(2)) : 0],
      ["salary", "Total Monthly Salary", totalMonthlySalary, true],
      ["placement", "Placement %", placementPercentage, false, "%"]
    ].map(([key, label, value, money, suffix]) => ({ key, label, value, money: Boolean(money), suffix: suffix || "", tone: key === "expired" ? "#dc2626" : key === "salary" ? "#16a34a" : "#2563eb" }));

    res.json({
      success: true,
      data: {
        institution: institution || {},
        cards,
        tasks: {
          active: activeTasks.map(toClient),
          overdue: overdueTasks.map(toClient)
        },
        charts: {
          programwiseStudents: countBy(students, (row) => row.programcode || row.program),
          categorywiseStudents: countBy(students, (row) => row.category || "Not specified")
        },
        tables: {
          programs: filteredPrograms.map((row, index) => ({ id: row._id || index, institution: row.institution, faculty: row.faculty, department: row.department, program: row.program, programcode: row.programcode })),
          accreditation: accreditations.filter((row) => matchesAcademicYear(row, academicyear)).map(toClient),
          achievements: filteredAchievements.map(toClient),
          placement: filteredPlacementRecords.map(toClient)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load Vice Chancellor dashboard" });
  }
};

const workflowPayload = (body = {}) => ({
  ...scoped(body),
  user: text(body.user),
  namecreated: text(body.namecreated || body.createdby || body.name),
  academicyear: text(body.academicyear),
  level: Number(body.level || 1),
  approverrole: text(body.approverrole),
  approvername: text(body.approvername),
  approveremail: text(body.approveremail),
  active: text(body.active) || "Yes",
  comments: text(body.comments)
});

const approvalConfig = (kind = "statute") => {
  if (kind === "mou") return { Model: InstitutionMou, Workflow: InstitutionMouWorkflow, label: "MoU", link: "/institution-mou-approval" };
  if (kind === "schoolstatute") return { Model: InstitutionSchoolStatute, Workflow: InstitutionStatuteWorkflow, label: "School statute", link: "/institution-school-statute-approval" };
  return { Model: InstitutionStatute, Workflow: InstitutionStatuteWorkflow, label: "Statute", link: "/institution-statute-approval" };
};

const workflowQuery = (source = {}) => {
  const query = scoped(source);
  ["academicyear", "approverrole", "approvername", "approveremail", "active"].forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
  if (text(source.level)) query.level = Number(source.level);
  return query;
};

const workflowLevels = async (colid, academicyear = "", Workflow = InstitutionStatuteWorkflow) => {
  const query = { colid, active: /^yes$/i };
  const year = text(academicyear);
  if (year) query.$or = [{ academicyear: year }, { academicyear: "" }, { academicyear: { $exists: false } }];
  return Workflow.find(query).sort({ level: 1, approvername: 1 }).lean();
};

const firstWorkflowLevel = (levels = []) => {
  const sorted = [...levels].filter((row) => row.level).sort((a, b) => Number(a.level) - Number(b.level));
  return sorted[0] || null;
};

const nextWorkflowLevel = (levels = [], currentLevel = 0) => {
  const sorted = [...levels].filter((row) => Number(row.level) > Number(currentLevel || 0)).sort((a, b) => Number(a.level) - Number(b.level));
  return sorted[0] || null;
};

const approverMatches = (workflow = {}, useremail = "", role = "") => {
  const email = text(useremail).toLowerCase();
  const approverEmail = text(workflow.approveremail).toLowerCase();
  const roleValue = text(role).toLowerCase();
  const approverRole = text(workflow.approverrole).toLowerCase();
  return (!approverEmail || approverEmail === email || approverEmail === "all") && (!approverRole || approverRole === roleValue || approverRole === "all");
};

const addApprovalTask = async (statute, approver, config = approvalConfig("statute")) => {
  if (!approver?.approveremail) return;
  const startdate = new Date();
  const duedate = new Date(startdate);
  duedate.setDate(duedate.getDate() + 7);
  await AcademicNewTask.create({
    colid: statute.colid,
    user: statute.user,
    createdby: statute.namecreated,
    academicyear: statute.academicyear,
    faculty: approver.approvername || approver.approveremail,
    facultyemail: approver.approveremail,
    task: `Approve ${config.label}: ${statute.statute || statute.mou}`,
    category: `${config.label} approval`,
    criticality: "High",
    pagelink: config.link,
    startdate,
    duedate,
    status: "New",
    comments: `${config.label} ${statute.statute || statute.mou} is pending approval at level ${approver.level}.`
  });
};

exports.workflowList = async (req, res) => {
  try {
    const Workflow = text(req.query.workflowkind) === "mou" ? InstitutionMouWorkflow : InstitutionStatuteWorkflow;
    const rows = await Workflow.find(workflowQuery(req.query)).sort({ academicyear: -1, level: 1, approvername: 1 }).limit(5000).lean();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.workflowSave = async (req, res) => {
  try {
    const payload = workflowPayload(req.body);
    const Workflow = text(req.body.workflowkind) === "mou" ? InstitutionMouWorkflow : InstitutionStatuteWorkflow;
    if (!payload.approveremail) return res.status(400).json({ success: false, message: "Approver email is required" });
    const row = req.body.id
      ? await Workflow.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await Workflow.create(payload);
    if (!row) return res.status(404).json({ success: false, message: "Workflow row not found" });
    res.json({ success: true, row });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.workflowBulk = async (req, res) => {
  try {
    const scope = scoped(req.body);
    const Workflow = text(req.body.workflowkind) === "mou" ? InstitutionMouWorkflow : InstitutionStatuteWorkflow;
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => workflowPayload({ ...row, ...scope, user: req.body.user, namecreated: req.body.namecreated })).filter((row) => row.approveremail);
    const result = docs.length ? await Workflow.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: result.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.workflowRemove = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const Workflow = text(req.body.workflowkind) === "mou" ? InstitutionMouWorkflow : InstitutionStatuteWorkflow;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    await Workflow.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.submitStatute = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const config = approvalConfig(text(req.body.kind) || "statute");
    const statute = await config.Model.findOne({ _id: req.body.id, colid });
    if (!statute) return res.status(404).json({ success: false, message: `${config.label} not found` });
    const levels = await workflowLevels(colid, statute.academicyear, config.Workflow);
    const first = firstWorkflowLevel(levels);
    if (!first) return res.status(400).json({ success: false, message: `No active ${config.label} approval workflow found` });
    statute.approvalstatus = `Pending Level ${first.level}`;
    statute.currentlevel = first.level;
    statute.pendingapprovername = first.approvername;
    statute.pendingapproveremail = first.approveremail;
    statute.pendingapproverrole = first.approverrole;
    statute.submittedat = new Date();
    statute.rejectedat = undefined;
    statute.approvalhistory.push({
      level: first.level,
      action: "Submitted",
      approvername: text(req.body.namecreated || req.body.name),
      approveremail: text(req.body.user),
      approverrole: text(req.body.role),
      comments: text(req.body.comments || "Submitted for approval")
    });
    await statute.save();
    await addApprovalTask(statute, first, config);
    res.json({ success: true, row: toClient(statute), message: `${config.label} submitted for approval` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.pendingStatutes = async (req, res) => {
  try {
    const { colid } = scoped(req.query);
    const config = approvalConfig(text(req.query.kind) || "statute");
    const email = text(req.query.useremail || req.query.user);
    const role = text(req.query.role);
    const rows = await config.Model.find({ colid, approvalstatus: /^Pending Level/i }).sort({ submittedat: -1 }).lean();
    const matched = rows.filter((row) => approverMatches({ approveremail: row.pendingapproveremail, approverrole: row.pendingapproverrole }, email, role));
    res.json({ success: true, rows: matched.map(toClient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.approveStatute = async (req, res) => {
  try {
    const { colid } = scoped(req.body);
    const config = approvalConfig(text(req.body.kind) || "statute");
    const action = /^reject/i.test(text(req.body.action)) ? "Rejected" : "Approved";
    const statute = await config.Model.findOne({ _id: req.body.id, colid });
    if (!statute) return res.status(404).json({ success: false, message: `${config.label} not found` });
    if (!approverMatches({ approveremail: statute.pendingapproveremail, approverrole: statute.pendingapproverrole }, req.body.approveremail || req.body.user, req.body.approverrole || req.body.role)) {
      return res.status(403).json({ success: false, message: `This ${config.label} is not pending for the current user` });
    }
    statute.approvalhistory.push({
      level: statute.currentlevel,
      action,
      approvername: text(req.body.approvername || req.body.name),
      approveremail: text(req.body.approveremail || req.body.user),
      approverrole: text(req.body.approverrole || req.body.role),
      comments: text(req.body.comments)
    });
    if (action === "Rejected") {
      statute.approvalstatus = "Rejected";
      statute.rejectedat = new Date();
      statute.pendingapprovername = "";
      statute.pendingapproveremail = "";
      statute.pendingapproverrole = "";
      await statute.save();
      return res.json({ success: true, row: toClient(statute), message: `${config.label} rejected` });
    }
    const levels = await workflowLevels(colid, statute.academicyear, config.Workflow);
    const next = nextWorkflowLevel(levels, statute.currentlevel);
    if (next) {
      statute.currentlevel = next.level;
      statute.approvalstatus = `Pending Level ${next.level}`;
      statute.pendingapprovername = next.approvername;
      statute.pendingapproveremail = next.approveremail;
      statute.pendingapproverrole = next.approverrole;
      await statute.save();
      await addApprovalTask(statute, next, config);
      return res.json({ success: true, row: toClient(statute), message: `Moved to level ${next.level}` });
    }
    statute.approvalstatus = "Approved";
    statute.approvedat = new Date();
    statute.pendingapprovername = "";
    statute.pendingapproveremail = "";
    statute.pendingapproverrole = "";
    await statute.save();
    res.json({ success: true, row: toClient(statute), message: `${config.label} approved` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
