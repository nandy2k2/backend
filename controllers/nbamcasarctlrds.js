const mongoose = require("mongoose");
const NbaMcaSarResponse = require("../Models/nbamcasarresponseds");
const User = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const Institution = require("../Models/insdetails");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const CourseOutcome = require("../Models/courseoutcomeds");
const Syllabus = require("../Models/syllabusds");
const Attendance = require("../Models/neplmsattendanceds");
const ExamViva = require("../Models/examinationmodel2vivamarksds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const num = (value) => Number(value || 0);
const clean = (value) => String(value ?? "").trim();
const esc = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(esc(value), "i");
const uniqueSorted = (values = []) => [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const parseMulti = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value).split(",").map(clean).filter(Boolean);
const geminiModelFallbacks = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b"
];

const mcaSarQuestions = [
  ["1", "Vision, Mission and Program Educational Objectives", "1.1", "State the Vision and Mission of the Department and Institute, and describe the process used for dissemination.", 5, "program_profile"],
  ["1", "Vision, Mission and Program Educational Objectives", "1.2", "Describe the process for defining and reviewing Program Educational Objectives for MCA.", 10, "manual"],
  ["1", "Vision, Mission and Program Educational Objectives", "1.3", "Show the consistency of PEOs with mission statements and stakeholder needs.", 10, "manual"],
  ["1", "Vision, Mission and Program Educational Objectives", "1.4", "Describe attainment evaluation of PEOs and actions taken.", 15, "placement"],
  ["2", "Program Curriculum and Teaching-Learning Processes", "2.1", "List MCA curriculum structure, credits, semesters, electives and laboratory/project components.", 30, "curriculum"],
  ["2", "Program Curriculum and Teaching-Learning Processes", "2.2", "Show course articulation matrix, prerequisites and curriculum gaps if any.", 20, "curriculum"],
  ["2", "Program Curriculum and Teaching-Learning Processes", "2.3", "Provide syllabus coverage, module/topic planning and lesson delivery records.", 25, "syllabus"],
  ["2", "Program Curriculum and Teaching-Learning Processes", "2.4", "Describe teaching-learning innovations, ICT/LMS usage and learning resources.", 25, "lms_content"],
  ["2", "Program Curriculum and Teaching-Learning Processes", "2.5", "Show process for identifying slow/advanced learners and remedial/bridge support.", 20, "attendance"],
  ["3", "Course Outcomes and Program Outcomes", "3.1", "List all Course Outcomes for the selected MCA program and academic year.", 20, "co"],
  ["3", "Course Outcomes and Program Outcomes", "3.2", "Show mapping of COs to POs/PSOs and strength of mapping.", 25, "co"],
  ["3", "Course Outcomes and Program Outcomes", "3.3", "Describe direct and indirect attainment process for CO/PO/PSO.", 25, "assessment"],
  ["3", "Course Outcomes and Program Outcomes", "3.4", "Provide attainment summary and corrective actions for low attained outcomes.", 30, "marks"],
  ["4", "Students' Performance", "4.1", "Provide sanctioned intake, admissions and enrolment details for MCA.", 20, "students"],
  ["4", "Students' Performance", "4.2", "Provide semester/year-wise academic performance, pass percentage and backlog status.", 30, "marks"],
  ["4", "Students' Performance", "4.3", "Show student progression to higher studies, employment, entrepreneurship and internships.", 20, "placement"],
  ["4", "Students' Performance", "4.4", "Provide student participation in co-curricular, cultural, sports and professional activities.", 15, "student_activities"],
  ["4", "Students' Performance", "4.5", "Provide mentoring, counselling, feedback and grievance redressal evidence.", 15, "mentoring"],
  ["5", "Faculty Contributions", "5.1", "Provide faculty strength, cadre ratio, qualifications and experience for MCA.", 25, "faculty"],
  ["5", "Faculty Contributions", "5.2", "Provide faculty workload, courses taught and continuity of course handling.", 20, "workload"],
  ["5", "Faculty Contributions", "5.3", "Provide faculty publications, patents, books, consultancy and funded projects.", 25, "research"],
  ["5", "Faculty Contributions", "5.4", "List FDPs, seminars, workshops and professional development activities.", 15, "faculty_development"],
  ["5", "Faculty Contributions", "5.5", "Describe faculty performance appraisal, awards and recognitions.", 15, "faculty_development"],
  ["6", "Facilities and Technical Support", "6.1", "Describe classrooms, laboratories, seminar halls, computing resources and internet facilities.", 30, "rooms"],
  ["6", "Facilities and Technical Support", "6.2", "List software, tools, library/e-resources and learning infrastructure available for MCA.", 25, "library"],
  ["6", "Facilities and Technical Support", "6.3", "Provide maintenance, utilization and upgradation of facilities.", 20, "estate"],
  ["6", "Facilities and Technical Support", "6.4", "Provide technical/support staff availability and responsibilities.", 15, "staff"],
  ["7", "Continuous Improvement", "7.1", "Describe quality improvement initiatives taken from previous assessment/feedback.", 25, "feedback"],
  ["7", "Continuous Improvement", "7.2", "Show improvements in results, placements, curriculum enrichment and student support.", 25, "marks"],
  ["7", "Continuous Improvement", "7.3", "Provide evidence of feedback analysis and action taken reports.", 25, "feedback"],
  ["7", "Continuous Improvement", "7.4", "Describe risk areas, gaps and planned corrective/preventive actions.", 25, "manual"],
  ["8", "Student Support Systems", "8.1", "Describe academic advising, mentoring, career guidance and placement support.", 20, "mentoring"],
  ["8", "Student Support Systems", "8.2", "Provide scholarship, financial aid and support for diverse learners.", 15, "fees"],
  ["8", "Student Support Systems", "8.3", "Provide student professional society, alumni and industry interaction details.", 20, "alumni"],
  ["8", "Student Support Systems", "8.4", "Describe grievance, anti-ragging, counselling, wellness and safety systems.", 15, "manual"],
  ["9", "Governance, Institutional Support and Financial Resources", "9.1", "Describe governance structure, academic administration and decision-making processes.", 20, "program_profile"],
  ["9", "Governance, Institutional Support and Financial Resources", "9.2", "Provide budget, purchase, infrastructure and financial support for the MCA program.", 25, "finance"],
  ["9", "Governance, Institutional Support and Financial Resources", "9.3", "Provide faculty recruitment, retention, leave, salary and HR support details.", 20, "hr"],
  ["9", "Governance, Institutional Support and Financial Resources", "9.4", "Describe strategic plan, institutional development and compliance systems.", 20, "manual"],
  ["10", "Program Specific Criteria", "10.1", "Show MCA-specific computing, programming, software development and project learning environment.", 30, "curriculum"],
  ["10", "Program Specific Criteria", "10.2", "Provide industry-linked projects, internships, trainings and employability initiatives.", 25, "placement"],
  ["10", "Program Specific Criteria", "10.3", "Provide capstone/project work, evaluation process and outcome evidence.", 25, "projects"],
  ["10", "Program Specific Criteria", "10.4", "Describe professional ethics, teamwork, communication and lifelong learning integration.", 20, "co"]
].map(([criterionno, criterion, questionno, question, maxmarks, erpsource], index) => ({
  id: questionno,
  criterionno,
  criterion,
  questionno,
  question,
  maxmarks,
  erpsource,
  order: index + 1
}));

function baseFilter(input = {}) {
  const filter = { colid: num(input.colid) };
  ["sarformat", "academicyear", "regulation", "program", "programcode", "criterion", "questionno", "status"].forEach((field) => {
    const values = parseMulti(input[field]);
    if (values.length === 1) filter[field] = regex(values[0]);
    if (values.length > 1) filter[field] = { $in: values };
  });
  return filter;
}

async function institution(colid) {
  return Institution.findOne({ colid }).sort({ _id: -1 }).lean() || {};
}

async function countCollection(name, filter) {
  try {
    return await mongoose.connection.collection(name).countDocuments(filter);
  } catch (_) {
    return 0;
  }
}

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim()
  || payload.text
  || ""
);

async function getDefaultGeminiConfig(colid) {
  return await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();
}

async function getGeminiModels(apikey) {
  if (!apikey) return geminiModelFallbacks;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apikey)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return geminiModelFallbacks;
    const models = (data.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
      .map((model) => String(model.name || "").replace(/^models\//, ""))
      .filter((name) => /^gemini-/i.test(name));
    return [...new Set([...models, ...geminiModelFallbacks])];
  } catch (_) {
    return geminiModelFallbacks;
  }
}

async function callGeminiText({ colid, model, prompt }) {
  const config = await getDefaultGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini configuration is missing");
  const selectedModel = clean(model) || "gemini-2.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Gemini SAR content generation failed");
  return readGeminiText(data);
}

async function callOllamaText({ colid, ollamaConfigId, prompt }) {
  const config = ollamaConfigId
    ? await OllamaConfiguration.findOne({ _id: ollamaConfigId, colid, active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || await OllamaConfiguration.findOne({ colid, active: /^yes$/i }).sort({ _id: -1 }).lean();
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${config.serveraddress.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama SAR content generation failed");
  return data.response || "";
}

function buildSarPrompt(body = {}) {
  return `
Generate professional NBA SAR response content for an MCA programme under Tier 1.

Return only the response text. Do not return markdown fences or JSON.
Write in a factual SAR style suitable for accreditation documentation.
Include headings, concise evidence points, measurable indicators and action-taken notes where appropriate.
Do not invent exact numbers unless ERP data is provided. If data is missing, write clearly as "To be updated from institutional records".

SAR context:
Format: ${clean(body.sarformat) || "NBA SAR Tier 1 MCA"}
Academic year: ${clean(body.academicyear)}
Regulation: ${clean(body.regulation)}
Program: ${clean(body.program)} (${clean(body.programcode)})
Criterion: ${clean(body.criterion)}
Question number: ${clean(body.questionno)}
Question: ${clean(body.question)}
Maximum marks: ${clean(body.maxmarks)}
ERP source: ${clean(body.erpsource)}

Existing / ERP pulled data:
${clean(body.erpdata || body.data) || "No ERP data supplied."}

Additional user prompt:
${clean(body.additionalprompt || body.prompt) || "No additional prompt."}
`;
}

async function erpSummary({ colid, academicyear, regulation, program, programcode, erpsource }) {
  const common = { colid };
  if (academicyear) common.academicyear = regex(academicyear);
  if (regulation) common.regulation = regex(regulation);
  if (programcode) common.programcode = regex(programcode);
  if (program) common.program = regex(program);
  const userCommon = { colid };
  if (academicyear) userCommon.$or = [{ academicyear: regex(academicyear) }, { admissionyear: regex(academicyear) }];
  if (programcode) userCommon.programcode = regex(programcode);
  if (program) userCommon.program = regex(program);
  const rows = [];
  const add = (label, value) => rows.push({ label, value });

  if (erpsource === "program_profile") {
    const programRows = await MPrograms.find({ colid, ...(programcode ? { programcode: regex(programcode) } : {}) }).lean();
    add("Programs matched", programRows.length);
    add("Faculty values in program master", uniqueSorted(programRows.map((r) => r.faculty)).join(", "));
    add("Departments in program master", uniqueSorted(programRows.map((r) => r.department)).join(", "));
  } else if (erpsource === "curriculum") {
    const courses = await RegulationCourseMap.find(common).lean();
    add("Mapped courses", courses.length);
    add("Total credits", courses.reduce((sum, row) => sum + Number(row.credit || 0), 0));
    add("Elective courses", courses.filter((row) => /elective/i.test(clean(row.deliverytype))).length);
    add("Course types", uniqueSorted(courses.map((row) => row.coursetype)).join(", "));
  } else if (erpsource === "syllabus") {
    add("Syllabus module/topic rows", await Syllabus.countDocuments(common));
    add("Courses with syllabus", (await Syllabus.distinct("coursecode", common)).length);
  } else if (erpsource === "co") {
    add("Course outcomes defined", await CourseOutcome.countDocuments(common));
    add("Courses with CO", (await CourseOutcome.distinct("coursecode", common)).length);
  } else if (erpsource === "students") {
    add("Students enrolled", await User.countDocuments({ ...userCommon, role: /^Student$/i, excluded: { $ne: "Yes" } }));
    add("Sections", uniqueSorted(await User.distinct("section", { ...userCommon, role: /^Student$/i })).join(", "));
  } else if (erpsource === "faculty") {
    add("Faculty/non-student users", await User.countDocuments({ colid, role: { $not: /^Student$/i }, excluded: { $ne: "Yes" } }));
    add("Faculty role users", await User.countDocuments({ colid, role: /^Faculty$/i, excluded: { $ne: "Yes" } }));
  } else if (erpsource === "attendance") {
    const total = await Attendance.countDocuments(common);
    const present = await Attendance.countDocuments({ ...common, attendance: 1 });
    add("Attendance records", total);
    add("Present records", present);
    add("Attendance percentage", total ? `${((present / total) * 100).toFixed(2)}%` : "0%");
  } else if (erpsource === "marks") {
    const marks = await ExamViva.find(common).lean();
    const students = uniqueSorted(marks.map((row) => row.regno));
    add("Marks rows", marks.length);
    add("Unique students with marks", students.length);
    add("Pass rows", marks.filter((row) => /^pass$/i.test(clean(row.status))).length);
    add("Fail rows", marks.filter((row) => /^fail$/i.test(clean(row.status))).length);
  } else if (erpsource === "mentoring") {
    add("Mentoring sessions", await countCollection("mentoringsessionds", { colid, ...(academicyear ? { academicyear: regex(academicyear) } : {}) }));
    add("Home visits", await countCollection("mentoringhomevisitds", { colid, ...(academicyear ? { academicyear: regex(academicyear) } : {}) }));
  } else if (erpsource === "research") {
    add("Projects", await countCollection("projects", { colid }));
    add("Publications", await countCollection("publications", { colid }));
    add("Patents", await countCollection("patents", { colid }));
    add("Consultancy", await countCollection("consultancies", { colid }));
  } else if (erpsource === "placement") {
    add("Placement records", await countCollection("placementnewplacementrecordsds", { colid, ...(academicyear ? { academicyear: regex(academicyear) } : {}) }));
    add("SIP records", await countCollection("placementnewsipstudentds", { colid }));
  } else if (erpsource === "lms_content") {
    add("Course material rows", await countCollection("neplmsresourceds", { colid, type: /material|course/i }));
    add("Assignments", await countCollection("neplmsassignmentds", { colid }));
    add("Quizzes", await countCollection("neplmsquizds", { colid }));
    add("Sequential content", await countCollection("neplmslessoncontentds", { colid }));
  } else if (erpsource === "feedback") {
    add("Continuous feedback forms", await countCollection("continuousfeedbackformds", { colid }));
    add("Feedback responses", await countCollection("continuousfeedbackresponseds", { colid }));
  } else if (erpsource === "finance") {
    add("Budget entries", await countCollection("newbudgetentryds", { colid }));
    add("Purchase orders", await countCollection("storepoorderds2", { colid }));
    add("Journal rows", await countCollection("mjournal", { colid }));
  } else if (erpsource === "hr") {
    add("Salary rows", await countCollection("dashmhrsalary", { colid }));
    add("Leave records", await countCollection("hrleaveapplyds", { colid }));
    add("HR attendance records", await countCollection("hremployeeattendanceds", { colid }));
  } else if (erpsource === "library") {
    add("Books", await countCollection("librarybookds", { colid }));
    add("Issues/returns", await countCollection("libraryissueds", { colid }));
  } else if (erpsource === "rooms") {
    add("Rooms", await countCollection("roomconfigurationds", { colid }));
    add("Exam rooms", await countCollection("conductexamroomds", { colid }));
  } else if (erpsource === "estate") {
    add("Estate assets", await countCollection("estaterealestateds", { colid }));
    add("Maintenance schedules", await countCollection("estatemaintenancescheduleds", { colid }));
  } else if (erpsource === "student_activities") {
    add("Cultural activities", await countCollection("mentoringculturalactivityds", { colid, ...(academicyear ? { academicyear: regex(academicyear) } : {}) }));
    add("Sports activities", await countCollection("mentoringsportsactivityds", { colid, ...(academicyear ? { academicyear: regex(academicyear) } : {}) }));
  } else if (erpsource === "projects") {
    add("Student project rows", await countCollection("placementnewprojectstageentryds", { colid }));
    add("Academic projects", await countCollection("projects", { colid }));
  } else if (erpsource === "fees") {
    add("Student ledger rows", await countCollection("ledgerstuds", { colid }));
    add("Outstanding fee rows", await countCollection("ledgerstuds", { colid, balance: { $gt: 0 } }));
  } else if (erpsource === "staff") {
    add("Non-student users", await User.countDocuments({ colid, role: { $not: /^Student$/i }, excluded: { $ne: "Yes" } }));
    add("Departments represented", uniqueSorted(await User.distinct("department", { colid, role: { $not: /^Student$/i } })).join(", "));
  } else if (erpsource === "alumni") {
    add("Alumni records", await countCollection("alumninewprofileds", { colid }));
    add("Alumni events", await countCollection("alumnineweventds", { colid }));
  } else {
    add("ERP auto pull", "No mapped source yet. Enter SAR data manually and add evidence link.");
  }

  return rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}

exports.questions = async (_req, res) => {
  res.json({ success: true, formats: ["NBA SAR Tier 1 MCA"], questions: mcaSarQuestions });
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [programs, users, courses, responses] = await Promise.all([
      MPrograms.find({ colid, excluded: { $ne: "Yes" } }).select("year regulation program programcode faculty institution department").lean(),
      User.find({ colid }).select("academicyear admissionyear regulation program programcode semester department").lean(),
      RegulationCourseMap.find({ colid }).select("academicyear regulation program programcode semester course coursecode").lean(),
      NbaMcaSarResponse.find({ colid }).select("academicyear regulation program programcode criterion questionno status sarformat").lean()
    ]);
    const rows = [...programs, ...users, ...courses, ...responses];
    res.json({
      success: true,
      institution: await institution(colid),
      formats: ["NBA SAR Tier 1 MCA"],
      programs: programs.map((row) => ({
        academicyear: row.year || row.academicyear || "",
        regulation: row.regulation || "",
        program: row.program || "",
        programcode: row.programcode || "",
        faculty: row.faculty || "",
        institution: row.institution || "",
        department: row.department || ""
      })),
      options: {
        academicyear: uniqueSorted(rows.flatMap((row) => [row.academicyear, row.year, row.admissionyear])).reverse(),
        regulation: uniqueSorted(rows.map((row) => row.regulation)),
        program: uniqueSorted(rows.map((row) => row.program)),
        programcode: uniqueSorted(rows.map((row) => row.programcode)),
        semester: uniqueSorted(rows.map((row) => row.semester)),
        department: uniqueSorted(rows.map((row) => row.department)),
        criterion: uniqueSorted(mcaSarQuestions.map((row) => row.criterion)),
        questionno: uniqueSorted(mcaSarQuestions.map((row) => row.questionno)),
        status: uniqueSorted(["Draft", "Submitted", "Reviewed", "Approved", ...responses.map((row) => row.status)]),
        sarformat: ["NBA SAR Tier 1 MCA"]
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.aiOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const [gemini, ollamaConfigs] = await Promise.all([
      getDefaultGeminiConfig(colid),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).select("name serveraddress modelname default active").lean()
    ]);
    res.json({ success: true, geminiConfigured: !!gemini?.apikey, geminiModels: await getGeminiModels(gemini?.apikey), ollamaConfigs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateContent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const prompt = buildSarPrompt(req.body);
    const provider = clean(req.body.provider || "Gemini");
    const data = /^ollama$/i.test(provider)
      ? await callOllamaText({ colid, ollamaConfigId: req.body.ollamaConfigId || req.body.ollamaId, prompt })
      : await callGeminiText({ colid, model: req.body.geminiModel || req.body.model, prompt });
    res.json({ success: true, data, raw: data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const filter = baseFilter(req.query);
    const data = await NbaMcaSarResponse.find(filter).sort({ criterion: 1, questionno: 1, updatedAt: -1 }).lean();
    res.json({ success: true, institution: await institution(filter.colid), data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = num(body.colid);
    const payload = {
      colid,
      sarformat: clean(body.sarformat) || "NBA SAR Tier 1 MCA",
      academicyear: clean(body.academicyear),
      regulation: clean(body.regulation),
      program: clean(body.program),
      programcode: clean(body.programcode),
      criterion: clean(body.criterion),
      questionno: clean(body.questionno),
      question: clean(body.question),
      maxmarks: num(body.maxmarks),
      erpsource: clean(body.erpsource),
      data: clean(body.data),
      numericvalue: num(body.numericvalue),
      evidenceurl: clean(body.evidenceurl),
      remarks: clean(body.remarks),
      datapulled: clean(body.datapulled) || "No",
      status: clean(body.status) || "Draft",
      name: clean(body.name),
      user: clean(body.user)
    };
    const data = body._id
      ? await NbaMcaSarResponse.findOneAndUpdate({ _id: body._id, colid }, payload, { new: true })
      : await NbaMcaSarResponse.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await NbaMcaSarResponse.deleteMany({ colid: num(req.body.colid), _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.importFromErp = async (req, res) => {
  try {
    const body = req.body || {};
    const data = await erpSummary({
      colid: num(body.colid),
      academicyear: clean(body.academicyear),
      regulation: clean(body.regulation),
      program: clean(body.program),
      programcode: clean(body.programcode),
      erpsource: clean(body.erpsource)
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
