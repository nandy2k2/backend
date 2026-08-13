const AiConfiguration = require("../Models/aiconfigurationds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const Fees = require("../Models/fees");
const Ledgerstud = require("../Models/ledgerstud");
const MFeesCol = require("../Models/mfeescol");
const CounterFee2Transaction = require("../Models/counterfee2transactionds");
const FeesReceiptNote = require("../Models/feesreceiptnoteds");
const MenuAccess = require("../Models/menuaccessds");
const RegulationMaster = require("../Models/regulationmasterds");
const RegulationSubject = require("../Models/regulationsubjectds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const AssessmentComponent = require("../Models/assessmentcomponentds");
const CourseAssessment = require("../Models/courseassessmentds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const NepLmsResource = require("../Models/neplmsresourceds");
const NepLmsLessonContent = require("../Models/neplmslessoncontentds");
const NepLmsQuiz = require("../Models/neplmsquizds");
const NepLmsAssignmentSubmission = require("../Models/neplmsassignmentsubmissionds");
const Attendance = require("../Models/neplmsattendanceds");

const MODEL_CHANGE_PASSWORD = "kumropatash";

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(escapeRegex(value), "i");

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim()
  || payload.candidates?.[0]?.content?.parts?.[0]?.text
  || ""
);

const getGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGemini = async ({ colid, prompt, model = "gemini-2.5-flash" }) => {
  const config = await getGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini configuration is missing");
  const models = [...new Set([text(model), "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean))];
  let lastError = "";
  for (const item of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(item)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return readGeminiText(data) || "Gemini returned an empty response.";
    lastError = data.error?.message || `Gemini request failed for ${item}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const extractJson = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

const normalizeHistory = (history) => (
  Array.isArray(history)
    ? history.slice(-20).map((item) => ({
      role: ["user", "assistant"].includes(text(item.role)) ? text(item.role) : "user",
      content: text(item.content)
    })).filter((item) => item.content)
    : []
);

const addIf = (query, field, value, exact = false) => {
  if (text(value)) query[field] = exact ? text(value) : regex(value);
};

const limitNumber = (value, fallback = 10) => Math.max(1, Math.min(50, Number(value) || fallback));
const isAdminRole = (role) => ["all", "admin"].includes(text(role).toLowerCase());
const normalizeAction = (value) => {
  const action = text(value).toLowerCase();
  if (["add", "create", "insert", "new"].includes(action)) return "add";
  if (["edit", "update", "modify", "patch"].includes(action)) return "update";
  return "view";
};
const toArray = (value) => Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
const omitEmpty = (obj = {}) => Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ""));
const safeRegexFields = new Set(["name", "student", "faculty", "facultyname", "course", "program", "title", "module", "topic", "section", "description", "assignmenttitle"]);

const schemaFields = (Model) => Object.keys(Model.schema.paths).filter((field) => (
  !field.includes(".")
  && !["_id", "__v", "createdAt", "updatedAt", "colid", "password", "authenticatorsecret", "expotoken"].includes(field)
));

const pickFields = (source = {}, allowedFields = []) => {
  const output = {};
  allowedFields.forEach((field) => {
    if (source[field] !== undefined) output[field] = source[field];
  });
  return output;
};

const queryFromInput = ({ input = {}, fields = [], colid, defaults = {}, context = {}, ownerField = "" }) => {
  const query = { colid, ...defaults };
  const filterSource = { ...(input.filters || {}), ...input };
  fields.forEach((field) => {
    if (["action", "data", "filters", "limit", "id", "context", "colid"].includes(field)) return;
    const value = filterSource[field];
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) query[field] = { $in: value.map(text).filter(Boolean) };
    else query[field] = safeRegexFields.has(field) ? regex(value) : text(value);
  });
  if (!context.adminScope) {
    if (context.role?.toLowerCase() === "student") {
      if (context.regno && fields.includes("regno")) query.regno = context.regno;
      if (context.email && fields.includes("email")) query.email = context.email;
      if (context.email && fields.includes("studentemail")) query.studentemail = context.email;
    } else if (ownerField && context.email && fields.includes(ownerField)) {
      query[ownerField] = context.email;
    } else if (context.email && fields.includes("facultyemail")) {
      query.facultyemail = context.email;
    }
  }
  return query;
};

const ensureMutationAllowed = ({ context = {}, adminOnly = false, ownerField = "", data = {}, moduleName = "record" }) => {
  if (context.adminScope) return;
  if (adminOnly) throw new Error(`${moduleName} add/update is restricted to All/Admin users.`);
  if (ownerField && context.email) data[ownerField] = context.email;
};

const verdict = (ok, label, detail, data = undefined) => ({ status: ok ? "pass" : "fail", label, detail, ...(data !== undefined ? { data } : {}) });
const warn = (label, detail, data = undefined) => ({ status: "warning", label, detail, ...(data !== undefined ? { data } : {}) });
const info = (label, detail, data = undefined) => ({ status: "info", label, detail, ...(data !== undefined ? { data } : {}) });

const scopedStudentQuery = ({ colid, regno, context = {} }) => {
  const query = { colid, role: /^Student$/i };
  if (context.role?.toLowerCase() === "student") {
    query.regno = context.regno || regno;
    if (context.email) query.$or = [{ email: context.email }, { user: context.email }, { googleemail: context.email }, { regno: query.regno }];
  } else {
    query.regno = text(regno);
  }
  return query;
};

const getStudentForDiagnostic = async ({ colid, regno, context = {} }) => {
  const query = scopedStudentQuery({ colid, regno, context });
  return User.findOne(query).select("-password -authenticatorsecret -expotoken").lean();
};

const exactStudentCourseFields = (student = {}, overrides = {}) => ({
  academicyear: text(overrides.academicyear || student.academicyear || student.admissionyear),
  regulation: text(overrides.regulation || student.regulation),
  program: text(overrides.program || student.program),
  programcode: text(overrides.programcode || student.programcode),
  semester: text(overrides.semester || student.semester),
  section: text(overrides.section || student.section),
  major: text(overrides.major || student.Major || student.major),
  minor: text(overrides.minor || student.Minor || student.minor),
  course: text(overrides.course),
  coursecode: text(overrides.coursecode)
});

const buildFeeDuplicateKey = (row = {}) => [
  text(row.academicyear),
  text(row.regulation),
  text(row.programcode),
  text(row.semester),
  text(row.feegroup),
  text(row.feeeitem || row.feeitem)
].join("|").toLowerCase();

const dateQuery = ({ from, to }) => {
  const range = {};
  if (text(from)) range.$gte = new Date(from);
  if (text(to)) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : undefined;
};

const makeCrudTool = ({
  name,
  description,
  Model,
  filterFields,
  mutateFields,
  defaults = {},
  ownerField = "",
  adminMutationOnly = false,
  adminViewOnly = false,
  extraScope = null,
  sort = { updatedAt: -1 }
}) => ({
  name,
  description,
  schema: {
    action: "view | add | update. Delete is not available.",
    id: "required for update unless the exact record id is known from previous view result",
    filters: `optional filter object with fields: ${filterFields.join(", ")}`,
    data: `payload for add/update with fields: ${mutateFields.join(", ")}`,
    limit: "optional, default 10, max 50"
  },
  handler: async (input = {}) => {
    const action = normalizeAction(input.action);
    const context = input.context || {};
    if (action === "view") {
      if (adminViewOnly && !context.adminScope) throw new Error(`${name} view is restricted to All/Admin users.`);
      const query = queryFromInput({ input, fields: filterFields, colid: input.colid, defaults, context, ownerField });
      if (extraScope) await extraScope({ query, input, context, action });
      const rows = await Model.find(query).sort(sort).limit(limitNumber(input.limit)).lean();
      return { action, query, count: rows.length, rows };
    }

    const payload = omitEmpty({
      ...defaults,
      ...pickFields(input, mutateFields),
      ...pickFields(input.data || {}, mutateFields),
      colid: input.colid,
      user: input.user || context.user || context.email || input.user
    });
    ensureMutationAllowed({ context, adminOnly: adminMutationOnly, ownerField, data: payload, moduleName: name });

    if (action === "add") {
      if (extraScope) await extraScope({ query: payload, input, context, action });
      const data = await Model.create(payload);
      return { action, message: "Record added.", data };
    }

    const id = text(input.id || input.data?._id || input.data?.id);
    if (!id) throw new Error(`${name} update requires id from a view result.`);
    const updateQuery = { _id: id, colid: input.colid, ...defaults };
    if (extraScope) await extraScope({ query: updateQuery, input, context, action });
    const data = await Model.findOneAndUpdate(updateQuery, { $set: payload }, { new: true, runValidators: true });
    if (!data) throw new Error(`${name} record not found for update.`);
    return { action, message: "Record updated.", data };
  }
});

const moduleRules = {
  workload: [
    "Use Workload Assignment to map academic year, regulation, program, semester, course and faculty.",
    "Faculty workload should normally be created after Program, Regulation Course Map and faculty users are ready.",
    "Important fields are academicyear, regulation, programcode, semester, coursecode, facultyemail and hoursperweek.",
    "For troubleshooting, verify that coursecode matches Regulation Course Map and faculty email matches User email."
  ],
  course_material: [
    "Course material is stored as LMS resources with resourcetype Course Material and may include files, video links, sections and order.",
    "Files must use the existing AWS upload flow and save the returned link; do not upload files directly to the backend server.",
    "Students see course material in order, and course group/section filters may restrict visibility.",
    "For troubleshooting, check academicyear, regulation, programcode, semester, coursecode, facultyemail, section and status."
  ],
  attendance: [
    "Attendance records are stored studentwise and classwise with attendance 1 for present and 0 for absent.",
    "Sectionwise, class group, enrollment group and specialization attendance add extra grouping fields but keep the regular attendance model.",
    "For a student to show in sectionwise attendance, the student User record must match the selected class on academicyear, regulation, program/programcode, semester and section; the class course/coursecode should also match course allocation/enrollment logic.",
    "For reporting issues, check classdate, coursecode, section, regno, facultyemail and attendance value.",
    "OTP, photo and proxy attendance should still create normal attendance records after confirmation."
  ],
  fees: [
    "Fee structure is stored in Fees with field feeeitem for the fee item, while the student ledger stores feeitem.",
    "Fees Application Auto loads templates by student academicyear or admissionyear, regulation, programcode and semester.",
    "Duplicate fee application is prevented by feeid or by academicyear, regulation, programcode, semester, feegroup and feeitem.",
    "Outstanding fees are ledgerstud rows with balance greater than 0; past due also requires duedate before today.",
    "Counter fee receipts are stored as CounterFee2Transaction records with item-level ledger history."
  ],
  academic_configuration: [
    "Program Management is stored in mprograms; course lists are in regulationcoursemapds.",
    "Regulation subjects must match academicyear, regulation, program/programcode, subject group and type.",
    "Assessment components must match academicyear, regulation, programcode, coursecode and component metadata.",
    "When something is not showing, compare colid first, then academic year, regulation, programcode, semester, coursecode and status."
  ],
  menu_access: [
    "Menu access is stored rolewise in menuaccessds with menugroup, groupname, title, path, role and access.",
    "If a menu item is missing, check same colid, role, path/title match, access Allow/Deny, status and custom groupname.",
    "Role-specific menu access should not be confused with the static menuall source."
  ],
  lesson_plan: [
    "Lesson plan and sequential content use LMS resource/content records linked by lessonresourceid and course metadata.",
    "Sequential content opens in order; completion should be tracked stepwise in progress records.",
    "Useful fields include lessonplantitle, sequence, contenttype, title, section, topics, coursecode and facultyemail.",
    "When AI generation is used, model selection and additional prompt should be shown before generation."
  ],
  users: [
    "Users are institution scoped by colid. Student users have regno, program, programcode, semester and section.",
    "Staff/faculty users should have email, name, role, department, designation and date of joining where applicable.",
    "Google login uses googleemail matching; authenticator settings are skipped for Student login.",
    "For access issues, verify role, status, colid, email/googleemail and menu access."
  ],
  operational_tools: [
    "AI Help can view, add and update configured ERP records when the user has permission.",
    "No delete tool is registered in AI Help.",
    "All/Admin can work institution-wide; other roles are scoped to the current user, current role, faculty email or student regno as applicable.",
    "For add/update requests, provide the exact values and use the record id returned by a view tool for updates.",
    "Diagnostic tools return pass/fail/warning checks and recommended fixes for visibility problems."
  ]
};

const tools = [
  {
    name: "get_default_rules",
    description: "Return default help rules for workload, course material, attendance, lesson plan, users and operational tools.",
    schema: { module: "optional: workload | course_material | attendance | fees | academic_configuration | menu_access | lesson_plan | users | operational_tools | all" },
    handler: async ({ module }) => {
      const key = text(module).toLowerCase();
      return key && key !== "all" && moduleRules[key] ? { [key]: moduleRules[key] } : moduleRules;
    }
  },
  {
    name: "workload_summary",
    description: "Read-only workload counts by faculty, course or program.",
    schema: { academicyear: "optional", programcode: "optional", semester: "optional", facultyemail: "optional", groupBy: "facultyemail | coursecode | programcode" },
    handler: async ({ colid, academicyear, programcode, semester, facultyemail, groupBy = "facultyemail" }) => {
      const query = { colid };
      addIf(query, "academicyear", academicyear, true);
      addIf(query, "programcode", programcode, true);
      addIf(query, "semester", semester, true);
      addIf(query, "facultyemail", facultyemail, true);
      const groupField = ["facultyemail", "coursecode", "programcode"].includes(groupBy) ? groupBy : "facultyemail";
      const rows = await WorkloadAssignment.aggregate([
        { $match: query },
        { $group: { _id: `$${groupField}`, count: { $sum: 1 }, hoursperweek: { $sum: "$hoursperweek" } } },
        { $sort: { count: -1 } },
        { $limit: 25 }
      ]);
      return { query, groupBy: groupField, rows };
    }
  },
  {
    name: "workload_search",
    description: "Read-only search of workload assignment records.",
    schema: { academicyear: "optional", coursecode: "optional", facultyemail: "optional", programcode: "optional", limit: "optional" },
    handler: async ({ colid, limit, ...input }) => {
      const query = { colid };
      ["academicyear", "coursecode", "facultyemail", "programcode", "semester"].forEach((field) => addIf(query, field, input[field], true));
      return WorkloadAssignment.find(query).sort({ updatedAt: -1 }).limit(limitNumber(limit)).lean();
    }
  },
  {
    name: "course_material_summary",
    description: "Read-only count of course material resources by course, faculty or section.",
    schema: { academicyear: "optional", coursecode: "optional", facultyemail: "optional", groupBy: "coursecode | facultyemail | section" },
    handler: async ({ colid, academicyear, coursecode, facultyemail, groupBy = "coursecode" }) => {
      const query = { colid, resourcetype: /course material/i };
      addIf(query, "academicyear", academicyear, true);
      addIf(query, "coursecode", coursecode, true);
      addIf(query, "facultyemail", facultyemail, true);
      const groupField = ["coursecode", "facultyemail", "section"].includes(groupBy) ? groupBy : "coursecode";
      const rows = await NepLmsResource.aggregate([
        { $match: query },
        { $group: { _id: `$${groupField}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 25 }
      ]);
      return { query, groupBy: groupField, rows };
    }
  },
  {
    name: "course_material_search",
    description: "Read-only search of LMS course material resources.",
    schema: { academicyear: "optional", coursecode: "optional", facultyemail: "optional", title: "optional", limit: "optional" },
    handler: async ({ colid, limit, title, ...input }) => {
      const query = { colid, resourcetype: /course material/i };
      ["academicyear", "coursecode", "facultyemail", "programcode", "semester", "section"].forEach((field) => addIf(query, field, input[field], true));
      addIf(query, "title", title);
      return NepLmsResource.find(query).sort({ order: 1, updatedAt: -1 }).limit(limitNumber(limit)).lean();
    }
  },
  {
    name: "attendance_summary",
    description: "Read-only attendance summary for LMS attendance.",
    schema: { academicyear: "optional", coursecode: "optional", regno: "optional", classdate: "optional" },
    handler: async ({ colid, ...input }) => {
      const query = { colid };
      ["academicyear", "coursecode", "regno", "classdate", "programcode", "semester", "section", "facultyemail"].forEach((field) => addIf(query, field, input[field], true));
      const [total, present, absent, latest] = await Promise.all([
        Attendance.countDocuments(query),
        Attendance.countDocuments({ ...query, attendance: 1 }),
        Attendance.countDocuments({ ...query, attendance: 0 }),
        Attendance.find(query).sort({ classdate: -1, updatedAt: -1 }).limit(10).lean()
      ]);
      return { query, total, present, absent, percentage: total ? Number(((present / total) * 100).toFixed(2)) : 0, latest };
    }
  },
  {
    name: "lesson_plan_summary",
    description: "Read-only summary of sequential lesson plan content.",
    schema: { academicyear: "optional", coursecode: "optional", facultyemail: "optional", contenttype: "optional" },
    handler: async ({ colid, ...input }) => {
      const query = { colid };
      ["academicyear", "coursecode", "facultyemail", "contenttype", "programcode", "semester", "section"].forEach((field) => addIf(query, field, input[field], true));
      const rows = await NepLmsLessonContent.aggregate([
        { $match: query },
        { $group: { _id: { coursecode: "$coursecode", contenttype: "$contenttype" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 30 }
      ]);
      return { query, rows };
    }
  },
  {
    name: "lesson_plan_search",
    description: "Read-only search of lesson plan sequential content.",
    schema: { academicyear: "optional", coursecode: "optional", lessonplantitle: "optional", contenttype: "optional", limit: "optional" },
    handler: async ({ colid, limit, lessonplantitle, ...input }) => {
      const query = { colid };
      ["academicyear", "coursecode", "facultyemail", "contenttype", "programcode", "semester", "section"].forEach((field) => addIf(query, field, input[field], true));
      addIf(query, "lessonplantitle", lessonplantitle);
      return NepLmsLessonContent.find(query).sort({ sequence: 1, updatedAt: -1 }).limit(limitNumber(limit)).lean();
    }
  },
  {
    name: "user_summary",
    description: "Read-only user counts by role, department, program or status.",
    schema: { role: "optional", department: "optional", programcode: "optional", groupBy: "role | department | programcode | status" },
    handler: async ({ colid, role, department, programcode, groupBy = "role" }) => {
      const query = { colid };
      addIf(query, "role", role, true);
      addIf(query, "department", department, true);
      addIf(query, "programcode", programcode, true);
      const groupField = ["role", "department", "programcode", "status"].includes(groupBy) ? groupBy : "role";
      const rows = await User.aggregate([
        { $match: query },
        { $group: { _id: `$${groupField}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 30 }
      ]);
      return { query, groupBy: groupField, rows };
    }
  },
  {
    name: "user_search",
    description: "Read-only search of users. Sensitive fields like password/authenticator secret are never returned.",
    schema: { role: "optional", name: "optional", email: "optional", regno: "optional", programcode: "optional", limit: "optional" },
    handler: async ({ colid, limit, name, email, regno, ...input }) => {
      const query = { colid };
      ["role", "programcode", "semester", "section", "department", "status"].forEach((field) => addIf(query, field, input[field], true));
      addIf(query, "name", name);
      addIf(query, "email", email);
      addIf(query, "regno", regno);
      return User.find(query).select("-password -authenticatorsecret -expotoken").sort({ updatedAt: -1 }).limit(limitNumber(limit)).lean();
    }
  }
];

const commonAcademicFilters = ["academicyear", "regulation", "program", "programcode", "semester", "course", "coursecode", "faculty", "facultyemail", "section", "coursegroup", "status"];
const resourceFields = schemaFields(NepLmsResource);
const timetableFields = schemaFields(NepLmsTimetable);
const attendanceFields = schemaFields(Attendance);

tools.push(
  makeCrudTool({
    name: "program_manage",
    description: "View, add or update program master records. Mutations require All/Admin. No delete action is available.",
    Model: MPrograms,
    filterFields: ["year", "program", "programcode", "type", "level", "institution", "department", "faculty", "typeofsession", "status1"],
    mutateFields: schemaFields(MPrograms),
    adminMutationOnly: true,
    sort: { year: -1, Order: 1, program: 1 }
  }),
  makeCrudTool({
    name: "course_manage",
    description: "View, add or update Regulation Course Map/course records. Mutations require All/Admin. No delete action is available.",
    Model: RegulationCourseMap,
    filterFields: ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "coursetype", "deliverytype", "faculty", "institution", "department", "status"],
    mutateFields: schemaFields(RegulationCourseMap),
    adminMutationOnly: true,
    sort: { academicyear: -1, regulation: 1, programcode: 1, semester: 1, coursecode: 1 }
  }),
  makeCrudTool({
    name: "workload_manage",
    description: "View, add or update workload assignments. Non-admin users can view their own faculty workload; mutations require All/Admin.",
    Model: WorkloadAssignment,
    filterFields: ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "coursetype", "facultyname", "facultyemail", "facultydepartment", "status"],
    mutateFields: schemaFields(WorkloadAssignment),
    ownerField: "facultyemail",
    adminMutationOnly: true,
    sort: { academicyear: -1, programcode: 1, semester: 1, coursecode: 1 }
  }),
  makeCrudTool({
    name: "timetable_manage",
    description: "View, add or update LMS timetable classes. Non-admin users are scoped to their own faculty email.",
    Model: NepLmsTimetable,
    filterFields: timetableFields,
    mutateFields: timetableFields,
    ownerField: "facultyemail",
    adminMutationOnly: false,
    sort: { classdate: -1, classtime: 1 }
  }),
  makeCrudTool({
    name: "sectionwise_timetable_manage",
    description: "View, add or update sectionwise timetable classes. Include section in filters/data. Non-admin users are scoped to their own faculty email.",
    Model: NepLmsTimetable,
    filterFields: timetableFields,
    mutateFields: timetableFields,
    ownerField: "facultyemail",
    adminMutationOnly: false,
    sort: { classdate: -1, classtime: 1 }
  }),
  makeCrudTool({
    name: "sectionwise_attendance_manage",
    description: "View, add or update sectionwise attendance records. Use attendance 1 for Present and 0 for Absent. Non-admin users are scoped to own faculty/student context.",
    Model: Attendance,
    filterFields: attendanceFields,
    mutateFields: attendanceFields,
    ownerField: "facultyemail",
    adminMutationOnly: false,
    sort: { classdate: -1, classtime: 1 }
  }),
  makeCrudTool({
    name: "course_material_manage",
    description: "View, add or update course material records. Files must already be uploaded to AWS and supplied as link/url. No delete action is available.",
    Model: NepLmsResource,
    filterFields: resourceFields,
    mutateFields: resourceFields,
    defaults: { resourcetype: "Course Material" },
    ownerField: "facultyemail",
    adminMutationOnly: false,
    sort: { order: 1, updatedAt: -1 }
  }),
  makeCrudTool({
    name: "assignment_manage",
    description: "View, add or update LMS assignment records. Files must already be uploaded to AWS and supplied as link/url. No delete action is available.",
    Model: NepLmsResource,
    filterFields: resourceFields,
    mutateFields: resourceFields,
    defaults: { resourcetype: "Assignment" },
    ownerField: "facultyemail",
    adminMutationOnly: false,
    sort: { duedate: -1, updatedAt: -1 }
  }),
  makeCrudTool({
    name: "assignment_submission_manage",
    description: "View or update assignment submissions, including marks/faculty comments/status. Non-admin users are scoped to their own faculty/student context.",
    Model: NepLmsAssignmentSubmission,
    filterFields: schemaFields(NepLmsAssignmentSubmission),
    mutateFields: ["marks", "facultycomments", "gradedby", "gradeddate", "status", "comments", "fullmarks"],
    ownerField: "",
    adminMutationOnly: false,
    extraScope: async ({ query, context }) => {
      if (context.adminScope) return;
      if (context.role?.toLowerCase() === "student") {
        if (context.regno) query.regno = context.regno;
        else if (context.email) query.email = context.email;
        return;
      }
      if (!context.email) throw new Error("Assignment submission access requires the current user email.");
      const assignments = await NepLmsResource.find({ colid: query.colid, resourcetype: "Assignment", facultyemail: context.email }).select("_id").lean();
      const ids = assignments.map((item) => item._id);
      if (!ids.length) throw new Error("No assignment submissions are available for the current faculty context.");
      query.assignmentid = { $in: ids };
    },
    sort: { submitteddate: -1, updatedAt: -1 }
  }),
  makeCrudTool({
    name: "lesson_plan_manage",
    description: "View, add or update lesson plan resource records. Use lesson_plan_content_manage for sequential lesson steps.",
    Model: NepLmsResource,
    filterFields: resourceFields,
    mutateFields: resourceFields,
    defaults: { resourcetype: "Lesson Plan" },
    ownerField: "facultyemail",
    adminMutationOnly: false,
    sort: { order: 1, updatedAt: -1 }
  }),
  makeCrudTool({
    name: "lesson_plan_content_manage",
    description: "View, add or update sequential lesson plan content steps such as text, file, video, quiz, flash card or mindmap.",
    Model: NepLmsLessonContent,
    filterFields: schemaFields(NepLmsLessonContent),
    mutateFields: schemaFields(NepLmsLessonContent),
    ownerField: "facultyemail",
    adminMutationOnly: false,
    sort: { sequence: 1, updatedAt: -1 }
  }),
  makeCrudTool({
    name: "quiz_manage",
    description: "View, add or update LMS quiz records including sections/questions. Non-admin users are scoped to their own faculty email.",
    Model: NepLmsQuiz,
    filterFields: schemaFields(NepLmsQuiz),
    mutateFields: schemaFields(NepLmsQuiz),
    ownerField: "facultyemail",
    adminMutationOnly: false,
    sort: { startdatetime: -1, updatedAt: -1 }
  }),
  {
    name: "attendance_report",
    description: "View attendance report with totals, present/absent count and percentage by student, course, faculty, date or section.",
    schema: {
      filters: `optional filter object with fields: ${commonAcademicFilters.join(", ")}, regno, classdate`,
      groupBy: "regno | coursecode | facultyemail | classdate | section | programcode",
      limit: "optional, default 25, max 50"
    },
    handler: async ({ colid, filters = {}, groupBy = "coursecode", limit, context = {}, ...input }) => {
      const query = queryFromInput({
        input: { ...input, filters },
        fields: attendanceFields,
        colid,
        context,
        ownerField: "facultyemail"
      });
      const groupField = ["regno", "coursecode", "facultyemail", "classdate", "section", "programcode"].includes(groupBy) ? groupBy : "coursecode";
      const rows = await Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: `$${groupField}`,
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ["$attendance", 1] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ["$attendance", 0] }, 1, 0] } }
          }
        },
        { $addFields: { percentage: { $cond: [{ $gt: ["$total", 0] }, { $round: [{ $multiply: [{ $divide: ["$present", "$total"] }, 100] }, 2] }, 0] } } },
        { $sort: { percentage: 1, total: -1 } },
        { $limit: limitNumber(limit, 25) }
      ]);
      return { query, groupBy: groupField, rows };
    }
  }
);

tools.push(
  {
    name: "attendance_student_visibility_diagnostic",
    description: "Diagnose why a student regno is not showing in attendance for a selected course/class/section.",
    schema: { regno: "required", academicyear: "optional", regulation: "optional", programcode: "optional", semester: "optional", section: "optional", coursecode: "optional", classid: "optional" },
    handler: async ({ colid, regno, context = {}, ...input }) => {
      const checks = [];
      const student = await getStudentForDiagnostic({ colid, regno, context });
      checks.push(verdict(!!student, "Student record", student ? "Student found in User for this institution." : "No Student role user found for this regno in the current institution.", student));
      if (!student) return { regno, checks, recommendation: "Verify regno, role Student, colid and whether the logged-in user may access this student." };

      const expected = exactStudentCourseFields(student, input);
      const classQuery = { colid };
      ["academicyear", "regulation", "programcode", "semester", "section", "coursecode"].forEach((field) => {
        if (expected[field]) classQuery[field] = expected[field];
      });
      if (text(input.classid)) classQuery._id = input.classid;
      const classes = await NepLmsTimetable.find(classQuery).sort({ classdate: -1, classtime: 1 }).limit(20).lean();
      checks.push(verdict(classes.length > 0, "Timetable class match", classes.length ? `${classes.length} matching class row(s) found.` : "No timetable class matches the student's academic year/regulation/programcode/semester/section/course.", classes));

      const courseMapQuery = { colid };
      ["academicyear", "regulation", "programcode", "semester", "coursecode"].forEach((field) => {
        if (expected[field]) courseMapQuery[field] = expected[field];
      });
      const courseMaps = await RegulationCourseMap.find(courseMapQuery).limit(20).lean();
      checks.push(verdict(courseMaps.length > 0, "Regulation course map", courseMaps.length ? "Course mapping exists for selected academic context." : "No regulation course map row matches this academic context.", courseMaps));

      const mismatches = [];
      ["academicyear", "regulation", "programcode", "semester", "section"].forEach((field) => {
        if (input[field] && text(input[field]) !== text(expected[field])) mismatches.push(`${field}: selected ${input[field]} but student has ${expected[field] || "-"}`);
      });
      if (mismatches.length) checks.push(warn("Student/class field mismatch", mismatches.join("; ")));

      const attendanceQuery = { colid, regno: student.regno };
      ["academicyear", "programcode", "semester", "section", "coursecode"].forEach((field) => {
        if (expected[field]) attendanceQuery[field] = expected[field];
      });
      const attendanceRows = await Attendance.find(attendanceQuery).sort({ classdate: -1, classtime: 1 }).limit(20).lean();
      checks.push(info("Existing attendance rows", `${attendanceRows.length} existing attendance row(s) found for this context.`, attendanceRows));

      return {
        regno,
        studentContext: expected,
        checks,
        recommendation: checks.some((item) => item.status === "fail")
          ? "Fix the failed academic/context match first: usually academicyear, regulation, programcode, semester, section or coursecode."
          : "The student should be eligible to appear. If not visible in UI, check frontend filters and selected classid."
      };
    }
  },
  {
    name: "fee_student_visibility_diagnostic",
    description: "Diagnose why a student or fee item is not showing in fees, fee application, ledger, receipts or outstanding report.",
    schema: { regno: "required", academicyear: "optional", regulation: "optional", programcode: "optional", semester: "optional", feegroup: "optional", feeitem: "optional", pastdue: "optional yes/no" },
    handler: async ({ colid, regno, context = {}, ...input }) => {
      const checks = [];
      const student = await getStudentForDiagnostic({ colid, regno, context });
      checks.push(verdict(!!student, "Student record", student ? "Student found in User for this institution." : "No Student role user found for this regno in the current institution.", student));
      if (!student) return { regno, checks, recommendation: "Verify regno, role Student and colid." };

      const academic = exactStudentCourseFields(student, input);
      const feeTemplateQuery = {
        colid,
        academicyear: academic.academicyear,
        regulation: academic.regulation,
        programcode: academic.programcode,
        semester: academic.semester
      };
      if (text(input.feegroup)) feeTemplateQuery.feegroup = text(input.feegroup);
      if (text(input.feeitem)) feeTemplateQuery.feeeitem = regex(input.feeitem);
      const feeTemplates = await Fees.find(feeTemplateQuery).sort({ feegroup: 1, feeeitem: 1 }).limit(50).lean();
      checks.push(verdict(feeTemplates.length > 0, "Fee structure match", feeTemplates.length ? `${feeTemplates.length} fee structure row(s) match Fees Application Auto.` : "No Fees template matches student academicyear/admissionyear, regulation, programcode and semester.", { query: feeTemplateQuery, rows: feeTemplates }));

      const ledgerQuery = { colid, regno: student.regno };
      ["academicyear", "regulation", "programcode", "semester", "feegroup"].forEach((field) => {
        const value = field === "academicyear" ? academic.academicyear : (input[field] || academic[field]);
        if (value) ledgerQuery[field] = text(value);
      });
      if (text(input.feeitem)) ledgerQuery.feeitem = regex(input.feeitem);
      const ledgerRows = await Ledgerstud.find(ledgerQuery).sort({ duedate: 1, feegroup: 1, feeitem: 1 }).limit(100).lean();
      checks.push(info("Student fee ledger", `${ledgerRows.length} ledger row(s) found for the selected context.`, { query: ledgerQuery, rows: ledgerRows }));

      const existingKeys = new Set(ledgerRows.map(buildFeeDuplicateKey));
      const duplicateTemplates = feeTemplates.filter((fee) => existingKeys.has(buildFeeDuplicateKey(fee)));
      checks.push(duplicateTemplates.length ? warn("Fee application duplicate check", `${duplicateTemplates.length} matching fee template(s) are already applied and will be skipped.`, duplicateTemplates) : verdict(true, "Fee application duplicate check", "No duplicate fee template found in current ledger rows."));

      const outstandingQuery = { colid, regno: student.regno, balance: { $gt: 0 } };
      if (text(input.pastdue).toLowerCase() === "yes") outstandingQuery.duedate = { $lt: new Date() };
      const outstanding = await Ledgerstud.find(outstandingQuery).sort({ duedate: 1 }).limit(100).lean();
      checks.push(info("Outstanding fees", `${outstanding.length} outstanding row(s) found${text(input.pastdue).toLowerCase() === "yes" ? " with past due date" : ""}.`, outstanding));

      const receipts = await CounterFee2Transaction.find({ colid, regno: student.regno }).sort({ paiddate: -1, createdAt: -1 }).limit(25).lean();
      checks.push(info("Counter fee receipts", `${receipts.length} receipt transaction(s) found for this regno.`, receipts));

      return {
        regno,
        studentContext: academic,
        checks,
        recommendation: feeTemplates.length
          ? "If rows are not visible, compare UI filters against the fee structure and ledger query shown here."
          : "Create or correct Fees template rows for academicyear/admissionyear, regulation, programcode and semester."
      };
    }
  },
  {
    name: "fee_application_diagnostic",
    description: "Run the exact Fees Application Auto matching logic for a regno and show eligible, already-applied and missing fee items.",
    schema: { regno: "required" },
    handler: async ({ colid, regno, context = {} }) => {
      const student = await getStudentForDiagnostic({ colid, regno, context });
      if (!student) return { checks: [verdict(false, "Student record", "Student not found for fee application.")] };
      const query = {
        colid,
        academicyear: student.academicyear || student.admissionyear || "",
        regulation: student.regulation || "",
        programcode: student.programcode || "",
        semester: student.semester || ""
      };
      const [fees, existing] = await Promise.all([
        Fees.find(query).sort({ feegroup: 1, feeeitem: 1 }).lean(),
        Ledgerstud.find({ colid, regno: student.regno }).select("feeid academicyear regulation programcode semester feegroup feeitem balance paid amount").lean()
      ]);
      const existingFeeIds = new Set(existing.map((row) => text(row.feeid)).filter(Boolean));
      const existingKeys = new Set(existing.map(buildFeeDuplicateKey));
      const feeRows = fees.map((fee) => ({
        ...fee,
        alreadyApplied: existingFeeIds.has(String(fee._id)) || existingKeys.has(buildFeeDuplicateKey(fee))
      }));
      return {
        student,
        matchingQuery: query,
        totalFeeTemplates: fees.length,
        notApplied: feeRows.filter((row) => !row.alreadyApplied),
        alreadyApplied: feeRows.filter((row) => row.alreadyApplied),
        existingLedger: existing,
        checks: [
          verdict(fees.length > 0, "Fee templates", fees.length ? "Fee templates found by auto-application query." : "No fee templates match the auto-application query."),
          fees.length && feeRows.every((row) => row.alreadyApplied) ? warn("All matching fees already applied", "Fees Application Auto will not apply duplicates.") : info("Applicable fees", `${feeRows.filter((row) => !row.alreadyApplied).length} fee template(s) can still be applied.`)
        ]
      };
    }
  },
  {
    name: "menu_access_diagnostic",
    description: "Diagnose why a menu link is not showing for a role or user.",
    schema: { role: "required", path: "optional", title: "optional", menugroup: "optional" },
    handler: async ({ colid, role, path, title, menugroup }) => {
      const query = { colid };
      if (text(role)) query.role = text(role);
      if (text(path)) query.path = text(path);
      if (text(title)) query.title = regex(title);
      if (text(menugroup)) query.menugroup = regex(menugroup);
      const rows = await MenuAccess.find(query).sort({ menugroup: 1, groupname: 1, title: 1 }).limit(100).lean();
      const denied = rows.filter((row) => /^deny$/i.test(text(row.access)));
      return {
        query,
        rows,
        checks: [
          verdict(rows.length > 0, "Menu access rows", rows.length ? `${rows.length} menu access row(s) found.` : "No matching menu access row found for this role/path/title/group."),
          denied.length ? warn("Denied menu rows", `${denied.length} row(s) are explicitly Deny.`, denied) : verdict(true, "Allow/Deny", "No matching Deny row found."),
          info("Display group rule", "If groupname is set, actual rendering should group by groupname; otherwise menugroup is used.")
        ]
      };
    }
  },
  {
    name: "academic_configuration_visibility_diagnostic",
    description: "Diagnose why regulation, subject group, course map or assessment component is not showing for a selected academic context.",
    schema: { academicyear: "optional", regulation: "optional", programcode: "optional", semester: "optional", coursecode: "optional", subject: "optional", type: "optional" },
    handler: async ({ colid, ...input }) => {
      const base = {};
      ["academicyear", "regulation", "programcode", "semester", "coursecode", "subject", "type"].forEach((field) => {
        if (text(input[field])) base[field] = text(input[field]);
      });
      const [regulations, subjects, courses, assessments, components, programs] = await Promise.all([
        RegulationMaster.find({ colid, ...(base.regulation ? { regulation: base.regulation } : {}) }).limit(50).lean(),
        RegulationSubject.find({ colid, ...omitEmpty({ academicyear: base.academicyear, regulation: base.regulation, programcode: base.programcode, subject: base.subject, type: base.type }) }).limit(100).lean(),
        RegulationCourseMap.find({ colid, ...omitEmpty({ academicyear: base.academicyear, regulation: base.regulation, programcode: base.programcode, semester: base.semester, coursecode: base.coursecode, subject: base.subject, type: base.type }) }).limit(100).lean(),
        CourseAssessment.find({ colid, ...omitEmpty({ academicyear: base.academicyear, regulation: base.regulation, programcode: base.programcode, semester: base.semester, coursecode: base.coursecode, subject: base.subject, type: base.type }) }).limit(100).lean(),
        AssessmentComponent.find({ colid, ...omitEmpty({ academicyear: base.academicyear, regulation: base.regulation, programcode: base.programcode, semester: base.semester, coursecode: base.coursecode, subject: base.subject, type: base.type }) }).limit(100).lean(),
        MPrograms.find({ colid, ...(base.programcode ? { programcode: base.programcode } : {}) }).limit(100).lean()
      ]);
      return {
        context: base,
        checks: [
          verdict(programs.length > 0, "Program management", programs.length ? "Program exists in Program Management." : "No program master row found."),
          verdict(regulations.length > 0, "Regulation master", regulations.length ? "Regulation exists." : "No regulation master row found."),
          verdict(subjects.length > 0, "Regulation subjects", subjects.length ? "Subject group rows found." : "No regulation subject rows match."),
          verdict(courses.length > 0, "Regulation course map", courses.length ? "Course map rows found." : "No regulation course map rows match."),
          verdict(assessments.length > 0 || components.length > 0, "Assessment components", (assessments.length || components.length) ? "Assessment/course component rows found." : "No assessment component rows match.")
        ],
        data: { programs, regulations, subjects, courses, courseAssessments: assessments, assessmentComponents: components },
        recommendation: "If a dropdown is blank, start from the first failed check and compare colid, academic year, regulation, programcode, semester, coursecode, subject and type."
      };
    }
  },
  {
    name: "fee_pivot_report",
    description: "Build a fee pivot from student ledger with dynamic group fields and paid/balance/concession totals.",
    schema: { groupBy: "array or comma list, e.g. programcode,semester,feegroup", filters: "optional", datefrom: "optional", dateto: "optional", limit: "optional" },
    handler: async ({ colid, groupBy = ["programcode", "feegroup"], filters = {}, datefrom, dateto, limit }) => {
      const groups = toArray(groupBy).flatMap((item) => text(item).split(",")).map(text).filter(Boolean).slice(0, 5);
      const query = { colid };
      Object.entries(filters || {}).forEach(([field, value]) => { if (text(value)) query[field] = safeRegexFields.has(field) ? regex(value) : text(value); });
      const range = dateQuery({ from: datefrom, to: dateto });
      if (range) query.classdate = range;
      const rows = await Ledgerstud.aggregate([
        { $match: query },
        { $group: { _id: Object.fromEntries(groups.map((field) => [field, `$${field}`])), amount: { $sum: "$amount" }, paid: { $sum: "$paid" }, concession: { $sum: "$concession" }, balance: { $sum: "$balance" }, count: { $sum: 1 } } },
        { $sort: { balance: -1, paid: -1 } },
        { $limit: limitNumber(limit, 50) }
      ]);
      return { query, groupBy: groups, rows };
    }
  },
  {
    name: "fee_pivot2_report",
    description: "Build an alternate ledger pivot including feetype/fee category fields for Fee Pivot 2 checks.",
    schema: { groupBy: "array or comma list, defaults to programcode,feetype,feegroup", filters: "optional", datefrom: "optional", dateto: "optional", limit: "optional" },
    handler: async (args) => tools.find((tool) => tool.name === "fee_pivot_report").handler({ ...args, groupBy: args.groupBy || ["programcode", "feetype", "feegroup"] })
  },
  {
    name: "outstanding_fees_report",
    description: "Show outstanding fee ledger rows where balance is greater than 0, optionally past due.",
    schema: { regno: "optional", programcode: "optional", academicyear: "optional", pastdue: "yes/no", limit: "optional" },
    handler: async ({ colid, context = {}, limit, pastdue, ...input }) => {
      const query = { colid, balance: { $gt: 0 } };
      ["regno", "programcode", "academicyear", "regulation", "semester", "feegroup", "feeitem", "feetype", "feecategory"].forEach((field) => addIf(query, field, input[field], ["regno", "programcode", "academicyear", "regulation", "semester"].includes(field)));
      if (!context.adminScope && context.role?.toLowerCase() === "student" && context.regno) query.regno = context.regno;
      if (text(pastdue).toLowerCase() === "yes") query.duedate = { $lt: new Date() };
      const rows = await Ledgerstud.find(query).sort({ duedate: 1, balance: -1 }).limit(limitNumber(limit, 50)).lean();
      const totalBalance = rows.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
      return { query, count: rows.length, totalBalance, rows };
    }
  }
);

tools.push(
  makeCrudTool({ name: "fee_structure_manage", description: "View, add or update Fees fee structure rows. Fee item field is feeeitem. Mutations require All/Admin.", Model: Fees, filterFields: schemaFields(Fees), mutateFields: schemaFields(Fees), adminMutationOnly: true, sort: { academicyear: -1, programcode: 1, semester: 1, feegroup: 1 } }),
  makeCrudTool({ name: "student_fee_ledger_manage", description: "View, add or update ledgerstud student fee ledger rows. View/mutations require All/Admin; students should use fee diagnostics scoped by regno.", Model: Ledgerstud, filterFields: schemaFields(Ledgerstud), mutateFields: schemaFields(Ledgerstud), adminMutationOnly: true, adminViewOnly: true, sort: { academicyear: -1, regno: 1, duedate: 1 } }),
  makeCrudTool({ name: "counter_fee_transactions_manage", description: "View or update Counter Fee receipt transactions. View/mutations require All/Admin.", Model: CounterFee2Transaction, filterFields: schemaFields(CounterFee2Transaction), mutateFields: schemaFields(CounterFee2Transaction), adminMutationOnly: true, adminViewOnly: true, sort: { paiddate: -1, createdAt: -1 } }),
  makeCrudTool({ name: "legacy_counter_fee_collections_manage", description: "View, add or update legacy mfeescol counter fee collection rows. View/mutations require All/Admin.", Model: MFeesCol, filterFields: schemaFields(MFeesCol), mutateFields: schemaFields(MFeesCol), adminMutationOnly: true, adminViewOnly: true, sort: { paydate: -1, regno: 1 } }),
  makeCrudTool({ name: "fees_receipt_note_manage", description: "View, add or update active fee receipt note configuration. Mutations require All/Admin.", Model: FeesReceiptNote, filterFields: schemaFields(FeesReceiptNote), mutateFields: schemaFields(FeesReceiptNote), adminMutationOnly: true, sort: { updatedAt: -1 } }),
  makeCrudTool({ name: "menu_access_manage", description: "View, add or update menu access control rows. View/mutations require All/Admin.", Model: MenuAccess, filterFields: schemaFields(MenuAccess), mutateFields: schemaFields(MenuAccess), adminMutationOnly: true, adminViewOnly: true, sort: { menugroup: 1, groupname: 1, title: 1 } }),
  makeCrudTool({ name: "regulation_master_manage", description: "View, add or update regulation master rows. Mutations require All/Admin.", Model: RegulationMaster, filterFields: schemaFields(RegulationMaster), mutateFields: schemaFields(RegulationMaster), adminMutationOnly: true, sort: { regulation: 1 } }),
  makeCrudTool({ name: "regulation_subject_manage", description: "View, add or update regulation subject/subject group rows. Mutations require All/Admin.", Model: RegulationSubject, filterFields: schemaFields(RegulationSubject), mutateFields: schemaFields(RegulationSubject), adminMutationOnly: true, sort: { academicyear: -1, regulation: 1, programcode: 1, subject: 1 } }),
  makeCrudTool({ name: "assessment_component_manage", description: "View, add or update Assessment Component rows. Mutations require All/Admin.", Model: AssessmentComponent, filterFields: schemaFields(AssessmentComponent), mutateFields: schemaFields(AssessmentComponent), adminMutationOnly: true, sort: { academicyear: -1, regulation: 1, programcode: 1, coursecode: 1 } }),
  makeCrudTool({ name: "course_assessment_manage", description: "View, add or update Course Assessment rows. Mutations require All/Admin.", Model: CourseAssessment, filterFields: schemaFields(CourseAssessment), mutateFields: schemaFields(CourseAssessment), adminMutationOnly: true, sort: { academicyear: -1, regulation: 1, programcode: 1, coursecode: 1 } })
);

const toolRegistry = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const publicTools = tools.map(({ name, description, schema }) => ({ name, description, schema }));

exports.tools = async (_req, res) => {
  res.json({ success: true, tools: publicTools, rules: moduleRules, note: "AI Help tools can view, add and update permitted records. No delete tool is available." });
};

exports.chat = async (req, res) => {
  const steps = [];
  try {
    const colid = number(req.body.colid);
    const query = text(req.body.query);
    const currentUser = text(req.body.user);
    const currentName = text(req.body.name);
    const currentRole = text(req.body.role);
    const currentRegno = text(req.body.regno);
    const adminScope = isAdminRole(currentRole);
    const selectedModel = text(req.body.model) || "gemini-2.5-flash";
    const modelChanged = selectedModel !== "gemini-2.5-flash";
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!query) return res.status(400).json({ success: false, message: "Query is required" });
    if (modelChanged && text(req.body.password) !== MODEL_CHANGE_PASSWORD) {
      return res.status(403).json({ success: false, message: "Password is required to change Gemini model" });
    }
    const history = normalizeHistory(req.body.history);
    const currentUserRecord = currentUser
      ? await User.findOne({ colid, $or: [{ email: currentUser }, { googleemail: currentUser }, { user: currentUser }] }).select("email googleemail name role regno programcode semester section department").lean()
      : null;
    const scopedEmail = currentUserRecord?.email || currentUser;
    const scopedRegno = currentUserRecord?.regno || currentRegno;
    steps.push({ status: "done", label: "LangChain-style tools loaded", detail: `${publicTools.length} operational tools available for view/add/update. No delete tools are registered.` });
    steps.push({
      status: "done",
      label: "User context applied",
      detail: adminScope
        ? `Role ${currentRole || "Admin"} may ask about any user in this institution.`
        : `Role ${currentRole || "User"} is restricted to current user context: ${scopedEmail || currentName || "current user"}.`
    });
    steps.push({ status: "running", label: "Gemini planning", detail: "Gemini will choose permitted tools or answer from rules." });
    const prompt = `You are AI Help, a LangChain-style ERP help assistant for Central Ticketing.
You can answer normally and can request permitted ERP tools for viewing, adding and updating data. You must never suggest deleting data and no delete tool exists.
Only add or update data when the user explicitly asks for that action and the required values are clear. If required values are missing, ask a follow-up question instead of guessing.

Current user context:
${JSON.stringify({ name: currentName || currentUserRecord?.name, user: currentUser, role: currentRole, regno: scopedRegno, email: scopedEmail, adminScope }, null, 2)}

Access rule:
${adminScope ? "The current role is All/Admin, so questions about any user in the same institution are allowed." : "The current role is not All/Admin. Execute data questions only in the context of the current user/current role. Do not request tools for another user's private data."}

Conversation:
${history.map((item) => `${item.role.toUpperCase()}: ${item.content}`).join("\n") || "No previous messages."}

Latest user message:
${query}

Default module rules:
${JSON.stringify(moduleRules, null, 2)}

Available tools:
${JSON.stringify(publicTools, null, 2)}

Return JSON only:
{
  "reply": "conversation reply. If tools are needed, briefly say what you are checking.",
  "needsUserInput": false,
  "question": "",
  "toolCalls": [
    { "name": "exact tool name", "arguments": { "key": "value" }, "reason": "why needed" }
  ],
  "usageTip": "one short helpful instruction for the user"
}

If more information is needed, set needsUserInput true and ask in question.`;
    const aiText = await callGemini({ colid, prompt, model: selectedModel });
    const plan = extractJson(aiText) || { reply: aiText, toolCalls: [], needsUserInput: false };
    const toolResults = [];
    for (const call of Array.isArray(plan.toolCalls) ? plan.toolCalls : []) {
      const tool = toolRegistry[text(call.name)];
      if (!tool) {
        toolResults.push({ name: call.name, status: "skipped", result: "Tool is not registered." });
        steps.push({ status: "warning", label: `Tool skipped: ${call.name}`, detail: "Tool is not registered." });
        continue;
      }
      steps.push({ status: "running", label: `Using tool: ${tool.name}`, detail: call.reason || tool.description });
      const scopedArguments = { ...(call.arguments || {}) };
      if (!adminScope) {
        if (["user_search", "user_summary"].includes(tool.name)) {
          scopedArguments.email = scopedEmail;
          if (scopedRegno) scopedArguments.regno = scopedRegno;
          scopedArguments.role = currentRole || currentUserRecord?.role || scopedArguments.role;
          scopedArguments.groupBy = "role";
        }
        if (["workload_summary", "workload_search", "course_material_summary", "course_material_search", "lesson_plan_summary", "lesson_plan_search"].includes(tool.name) && scopedEmail) {
          scopedArguments.facultyemail = scopedEmail;
        }
        if (tool.name === "attendance_summary") {
          if (scopedRegno) scopedArguments.regno = scopedRegno;
          if (scopedEmail && !scopedRegno) scopedArguments.facultyemail = scopedEmail;
        }
      }
      const result = await tool.handler({
        ...scopedArguments,
        colid,
        user: currentUser,
        context: {
          name: currentName || currentUserRecord?.name,
          user: currentUser,
          email: scopedEmail,
          role: currentRole || currentUserRecord?.role,
          regno: scopedRegno,
          adminScope
        }
      });
      toolResults.push({ name: tool.name, status: "done", reason: call.reason, result });
      steps.push({ status: "done", label: `Tool completed: ${tool.name}`, detail: "Tool result loaded." });
    }
    let finalAnswer = plan.question || plan.reply || aiText;
    if (toolResults.length) {
      steps.push({ status: "running", label: "Gemini final answer", detail: "Summarizing tool results into a conversational help answer." });
      finalAnswer = await callGemini({
        colid,
        model: selectedModel,
        prompt: `You are AI Help. Use the tool results to answer the user clearly.

Conversation:
${[...history, { role: "user", content: query }].map((item) => `${item.role.toUpperCase()}: ${item.content}`).join("\n")}

Plan:
${JSON.stringify(plan, null, 2)}

Tool results:
${JSON.stringify(toolResults, null, 2)}

Current user context:
${JSON.stringify({ name: currentName || currentUserRecord?.name, user: currentUser, role: currentRole, adminScope }, null, 2)}

Give a helpful answer with steps. Include only relevant records/summaries and clearly mention any record added or updated. Mention that no delete tool is available. If the user is not All/Admin, clearly say the answer is scoped to their own user/role context.`
      });
      steps.push({ status: "done", label: "Answer ready", detail: "Gemini summarized the help result." });
    }
    steps.push({ status: "done", label: "Conversation updated", detail: "User may reply and continue." });
    res.json({
      success: true,
      assistantMessage: finalAnswer,
      needsUserInput: !!plan.needsUserInput,
      plan,
      toolResults,
      tools: publicTools,
      rules: moduleRules,
      steps,
      rawGemini: aiText
    });
  } catch (error) {
    steps.push({ status: "error", label: "AI Help failed", detail: error.message });
    res.status(500).json({ success: false, message: error.message, steps });
  }
};
