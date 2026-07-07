const GradeConfiguration = require("../Models/gradeconfigurationds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const RegulationSubject = require("../Models/regulationsubjectds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const text = (value) => String(value || "").trim();

const cleanPayload = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear),
  regulation: text(input.regulation),
  program: text(input.program),
  programcode: text(input.programcode),
  type: text(input.type),
  subject: text(input.subject),
  semester: text(input.semester),
  course: text(input.course),
  coursecode: text(input.coursecode),
  frompercentage: toNumber(input.frompercentage || input.fromPercentage) || 0,
  topercentage: toNumber(input.topercentage || input.toPercentage) || 0,
  gradepoint: toNumber(input.gradepoint || input.gradePoint) || 0,
  grade: text(input.grade),
  colid: toNumber(input.colid),
  user: text(input.user),
  status: text(input.status) || "Active"
});

const validatePayload = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.regulation) return "Regulation is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.type) return "Type is required";
  if (!payload.subject) return "Subject is required";
  if (!payload.semester) return "Semester is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  if (!payload.grade) return "Grade is required";
  if (payload.frompercentage > payload.topercentage) return "From percentage cannot be more than to percentage";
  return "";
};

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  [
    "academicyear",
    "regulation",
    "program",
    "programcode",
    "type",
    "subject",
    "semester",
    "course",
    "coursecode",
    "grade",
    "status"
  ].forEach((field) => {
    if (source[field]) query[field] = source[field];
  });
  return query;
};

const uniqueSorted = (values) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const geminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || ""
);

const getDefaultGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGeminiText = async ({ colid, model, prompt }) => {
  const config = await getDefaultGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini configuration is missing");
  const selectedModel = text(model) || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15 }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini validation failed");
  return readGeminiText(data) || "Gemini did not return validation text.";
};

const callOllamaText = async ({ colid, ollamaId, prompt }) => {
  const config = ollamaId
    ? await OllamaConfiguration.findOne({ _id: ollamaId, colid, active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || await OllamaConfiguration.findOne({ colid, active: /^yes$/i }).sort({ _id: -1 }).lean();
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${config.serveraddress.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ollama validation failed");
  return data.response || "Ollama did not return validation text.";
};

exports.createGradeConfiguration = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await GradeConfiguration.create(payload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getGradeConfigurations = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await GradeConfiguration.find(query).sort({
      academicyear: 1,
      regulation: 1,
      programcode: 1,
      type: 1,
      subject: 1,
      semester: 1,
      course: 1,
      frompercentage: 1
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateGradeConfiguration = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await GradeConfiguration.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteGradeConfiguration = async (req, res) => {
  try {
    const data = await GradeConfiguration.findOneAndDelete({ _id: req.body.id, colid: toNumber(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Record deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkCreateGradeConfigurations = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });

    const errors = [];
    const valid = [];
    items.forEach((item, index) => {
      const payload = cleanPayload({ ...item, colid: req.body.colid || item.colid, user: req.body.user || item.user });
      const error = validatePayload(payload);
      if (error) errors.push({ rowNumber: item.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });

    if (valid.length) await GradeConfiguration.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getGradeConfigurationOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const courseQuery = { colid };
    const subjectQuery = { colid };
    ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester"].forEach((field) => {
      if (req.query[field]) {
        courseQuery[field] = req.query[field];
        subjectQuery[field] = req.query[field];
      }
    });
    delete subjectQuery.semester;
    if (req.query.status) {
      courseQuery.status = req.query.status;
      subjectQuery.status = req.query.status;
    }

    const [allCourseMaps, courseMaps, regulationSubjects, grades] = await Promise.all([
      RegulationCourseMap.find({ colid }).sort({
        academicyear: 1,
        regulation: 1,
        programcode: 1,
        type: 1,
        subject: 1,
        semester: 1,
        course: 1
      }).lean(),
      RegulationCourseMap.find(courseQuery).sort({
        academicyear: 1,
        regulation: 1,
        programcode: 1,
        type: 1,
        subject: 1,
        semester: 1,
        course: 1
      }).lean(),
      RegulationSubject.find(subjectQuery).sort({
        academicyear: 1,
        regulation: 1,
        programcode: 1,
        type: 1,
        subject: 1
      }).lean(),
      GradeConfiguration.find({ colid }).lean()
    ]);
    const allRows = [...allCourseMaps, ...grades, ...regulationSubjects];

    res.json({
      success: true,
      academicyears: uniqueSorted(allRows.map((item) => item.academicyear)),
      regulations: uniqueSorted(allRows.map((item) => item.regulation)),
      programs: (() => {
        const programMap = new Map();
        allRows.forEach((item) => {
          if (item.programcode) {
            programMap.set(item.programcode, {
              programcode: item.programcode,
              program: item.program || ""
            });
          }
        });
        return [...programMap.values()].sort((a, b) => String(a.programcode).localeCompare(String(b.programcode)));
      })(),
      types: uniqueSorted(allRows.map((item) => item.type)),
      subjects: uniqueSorted(regulationSubjects.map((item) => item.subject)),
      semesters: uniqueSorted(allRows.map((item) => item.semester)),
      courses: courseMaps.map((item) => ({
        _id: item._id,
        academicyear: item.academicyear || "",
        regulation: item.regulation || "",
        program: item.program || "",
        programcode: item.programcode || "",
        type: item.type || "",
        subject: item.subject || "",
        semester: item.semester || "",
        course: item.course || "",
        coursecode: item.coursecode || ""
      })),
      grades: uniqueSorted(grades.map((item) => item.grade))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getGradeConfigurationAiOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [gemini, ollama] = await Promise.all([
      AiConfiguration.find({ colid, type: /^gemini$/i, active: /^yes$/i }).select("description default").lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).select("name serveraddress modelname default").lean()
    ]);
    res.json({ success: true, geminiConfigured: gemini.length > 0, geminiModels, ollama });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.validateGradeConfigurationWithAi = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const coursecode = text(req.body.coursecode);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!coursecode) return res.status(400).json({ success: false, message: "Course code is required" });

    const query = { colid, coursecode };
    ["academicyear", "regulation", "programcode", "semester"].forEach((field) => {
      if (req.body[field]) query[field] = text(req.body[field]);
    });
    const rows = await GradeConfiguration.find(query).sort({ frompercentage: 1, topercentage: 1 }).lean();
    if (!rows.length) return res.status(404).json({ success: false, message: "No grade configuration found for selected course code" });

    const rules = text(req.body.rules);
    const prompt = `
You are validating an academic grade configuration for one course.
Check whether percentage ranges are complete, non-overlapping, logically ordered, and whether grade points and grade labels are consistent.
If any issue exists, give exact corrections. If valid, say clearly that it is valid.
Course scope:
${JSON.stringify({
  academicyear: query.academicyear || "Any",
  regulation: query.regulation || "Any",
  programcode: query.programcode || "Any",
  semester: query.semester || "Any",
  coursecode
}, null, 2)}
User validation rules:
${rules || "Validate normal academic grading best practices, full 0-100 coverage where applicable, no gaps, no overlaps, highest marks should have highest grade point."}
Grade rows:
${JSON.stringify(rows.map((row) => ({
  frompercentage: row.frompercentage,
  topercentage: row.topercentage,
  grade: row.grade,
  gradepoint: row.gradepoint,
  status: row.status
})), null, 2)}
Return a concise validation report with sections: Status, Issues, Recommendations.
`;
    const provider = text(req.body.provider || "Gemini");
    const report = /^ollama$/i.test(provider)
      ? await callOllamaText({ colid, ollamaId: req.body.ollamaId, prompt })
      : await callGeminiText({ colid, model: req.body.geminiModel, prompt });
    res.json({ success: true, report, rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.validateProgramGradeConfigurationWithAi = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const academicyear = text(req.body.academicyear);
    const programcode = text(req.body.programcode);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!academicyear) return res.status(400).json({ success: false, message: "Academic year is required" });
    if (!programcode) return res.status(400).json({ success: false, message: "Program code is required" });

    const courseQuery = { colid, academicyear, programcode };
    const gradeQuery = { colid, academicyear, programcode };
    if (req.body.regulation) {
      courseQuery.regulation = text(req.body.regulation);
      gradeQuery.regulation = text(req.body.regulation);
    }

    const [courses, gradeRows] = await Promise.all([
      RegulationCourseMap.find(courseQuery).sort({ semester: 1, coursecode: 1 }).lean(),
      GradeConfiguration.find(gradeQuery).sort({ coursecode: 1, frompercentage: 1 }).lean()
    ]);
    if (!courses.length && !gradeRows.length) return res.status(404).json({ success: false, message: "No courses or grade configuration found for selected program and year" });

    const gradeMap = new Map();
    gradeRows.forEach((row) => {
      const key = text(row.coursecode);
      if (!gradeMap.has(key)) gradeMap.set(key, []);
      gradeMap.get(key).push({
        frompercentage: row.frompercentage,
        topercentage: row.topercentage,
        grade: row.grade,
        gradepoint: row.gradepoint,
        status: row.status
      });
    });
    const courseMap = new Map();
    courses.forEach((course) => {
      const key = text(course.coursecode);
      if (key && !courseMap.has(key)) {
        courseMap.set(key, {
          academicyear: course.academicyear || "",
          regulation: course.regulation || "",
          program: course.program || "",
          programcode: course.programcode || "",
          semester: course.semester || "",
          type: course.type || "",
          subject: course.subject || "",
          course: course.course || "",
          coursecode: key
        });
      }
    });
    gradeRows.forEach((row) => {
      const key = text(row.coursecode);
      if (key && !courseMap.has(key)) {
        courseMap.set(key, {
          academicyear: row.academicyear || "",
          regulation: row.regulation || "",
          program: row.program || "",
          programcode: row.programcode || "",
          semester: row.semester || "",
          type: row.type || "",
          subject: row.subject || "",
          course: row.course || "",
          coursecode: key
        });
      }
    });
    const courseSummaries = [...courseMap.values()].map((course) => ({
      ...course,
      gradeRows: gradeMap.get(course.coursecode) || []
    }));

    const rules = text(req.body.rules);
    const prompt = `
You are validating grade configuration for every course in one academic program.
For each course, check if grade configuration exists, if percentage ranges are complete, non-overlapping, logically ordered, and if grade labels/grade points are consistent.
Also give a program-level summary of missing course grade configuration, inconsistent grade schemes across courses, and exact corrections.
Program scope:
${JSON.stringify({ academicyear, regulation: gradeQuery.regulation || "Any", programcode }, null, 2)}
User validation rules:
${rules || "Each course should normally have full 0-100 coverage, no gaps, no overlaps, highest percentage should have highest grade point, and active grade rows should be used for final result processing."}
Course and grade configuration data:
${JSON.stringify(courseSummaries, null, 2)}
Return a concise validation report with sections: Overall Status, Coursewise Issues, Missing Configurations, Recommendations.
`;
    const provider = text(req.body.provider || "Gemini");
    const report = /^ollama$/i.test(provider)
      ? await callOllamaText({ colid, ollamaId: req.body.ollamaId, prompt })
      : await callGeminiText({ colid, model: req.body.geminiModel, prompt });
    res.json({ success: true, report, courses: courseSummaries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
