const Syllabus = require("../Models/syllabusds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const AiConfiguration = require("../Models/aiconfigurationds");

const text = (value) => String(value || "").trim();

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const clampPercent = (value, fallback = 0) => {
  const parsed = toNumber(value);
  const safeValue = parsed === undefined ? fallback : parsed;
  return Math.max(0, Math.min(100, Math.round(safeValue)));
};

const parseGeminiJson = (value) => {
  const raw = text(value);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (innerError) {
        return {};
      }
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (innerError) {
        return {};
      }
    }
    return {};
  }
};

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim()
  || payload.text
  || ""
);

const getDefaultGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGeminiJson = async (apikey, prompt) => {
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return parseGeminiJson(readGeminiText(data));
    lastError = data.error?.message || `Gemini API request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini API request failed");
};

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
  module: text(input.module),
  syllabus: text(input.syllabus),
  colid: toNumber(input.colid),
  user: text(input.user)
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
  if (!payload.module) return "Module is required";
  if (!payload.syllabus) return "Syllabus is required";
  if (!["Major", "Minor"].includes(payload.type)) return "Type should be Major or Minor";
  return "";
};

const courseMapQueryFromPayload = (payload) => ({
  colid: payload.colid,
  academicyear: payload.academicyear,
  regulation: payload.regulation,
  program: payload.program,
  programcode: payload.programcode,
  type: payload.type,
  subject: payload.subject,
  semester: payload.semester,
  course: payload.course,
  coursecode: payload.coursecode
});

const buildQuery = (source = {}) => {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;
  ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "module"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  return query;
};

exports.getSyllabusOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const courseQuery = { colid, type: { $in: ["Major", "Minor"] } };
    ["academicyear", "regulation", "program", "programcode", "subject", "semester", "course", "coursecode"].forEach((field) => {
      if (text(req.query[field])) courseQuery[field] = text(req.query[field]);
    });
    if (text(req.query.type)) courseQuery.type = text(req.query.type);

    const [courseMaps, syllabi] = await Promise.all([
      RegulationCourseMap.find(courseQuery).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1, semester: 1, course: 1 }).lean(),
      Syllabus.find({ colid }).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1, semester: 1, course: 1, module: 1 }).lean()
    ]);

    const programMap = new Map();
    courseMaps.forEach((item) => {
      if (item.programcode) programMap.set(item.programcode, {
        program: item.program || "",
        programcode: item.programcode || ""
      });
    });

    const courseMap = new Map();
    courseMaps.forEach((item) => {
      if (item.coursecode) courseMap.set(item.coursecode, {
        course: item.course || "",
        coursecode: item.coursecode || "",
        academicyear: item.academicyear || "",
        regulation: item.regulation || "",
        program: item.program || "",
        programcode: item.programcode || "",
        type: item.type || "",
        subject: item.subject || "",
        semester: item.semester || ""
      });
    });

    res.json({
      success: true,
      academicyears: uniq(courseMaps.map((item) => item.academicyear)),
      regulations: uniq(courseMaps.map((item) => item.regulation)),
      programs: [...programMap.values()].sort((a, b) => String(a.programcode).localeCompare(String(b.programcode))),
      types: uniq(courseMaps.map((item) => item.type)),
      subjects: uniq(courseMaps.map((item) => item.subject)),
      semesters: uniq(courseMaps.map((item) => item.semester)),
      courseNames: uniq(courseMaps.map((item) => item.course)),
      courseCodes: uniq(courseMaps.map((item) => item.coursecode)),
      courses: [...courseMap.values()].sort((a, b) => String(a.coursecode).localeCompare(String(b.coursecode))),
      modules: uniq(syllabi.map((item) => item.module))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSyllabus = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const mappedCourse = await RegulationCourseMap.exists(courseMapQueryFromPayload(payload));
    if (!mappedCourse) return res.status(400).json({ success: false, message: "Selected course mapping was not found in regulation course map" });
    const data = await Syllabus.create(payload);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSyllabi = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await Syllabus.find(query).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1, semester: 1, course: 1, module: 1 });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSyllabus = async (req, res) => {
  try {
    const payload = cleanPayload(req.body);
    const error = validatePayload(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const mappedCourse = await RegulationCourseMap.exists(courseMapQueryFromPayload(payload));
    if (!mappedCourse) return res.status(400).json({ success: false, message: "Selected course mapping was not found in regulation course map" });
    const data = await Syllabus.findByIdAndUpdate(req.body.id, payload, { new: true, runValidators: true });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSyllabus = async (req, res) => {
  try {
    const data = await Syllabus.findByIdAndDelete(req.body.id);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Record deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDeleteSyllabi = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one syllabus row" });
    const data = await Syllabus.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: data.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkCreateSyllabi = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });

    const errors = [];
    const valid = [];
    for (const [index, item] of items.entries()) {
      const payload = cleanPayload({ ...item, colid: req.body.colid || item.colid, user: req.body.user || item.user });
      const error = validatePayload(payload);
      if (error) errors.push({ rowNumber: item.rowNumber || index + 2, message: error });
      else {
        const mappedCourse = await RegulationCourseMap.exists(courseMapQueryFromPayload(payload));
        if (!mappedCourse) errors.push({ rowNumber: item.rowNumber || index + 2, message: "Selected course mapping was not found in regulation course map" });
        else valid.push(payload);
      }
    }

    if (valid.length) await Syllabus.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assessSyllabusChange = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const newSyllabusChange = text(req.body.newSyllabusChange);
    if (!newSyllabusChange) return res.status(400).json({ success: false, message: "New syllabus change is required" });

    const query = buildQuery({ ...req.body.filters, colid });
    const syllabusRows = await Syllabus.find(query).sort({ academicyear: 1, regulation: 1, program: 1, type: 1, subject: 1, semester: 1, course: 1, module: 1 }).lean();
    if (!syllabusRows.length) return res.status(404).json({ success: false, message: "No existing syllabus found for the selected filters" });

    const aiConfig = await getDefaultGeminiConfig(colid);
    if (!aiConfig?.apikey) return res.status(400).json({ success: false, message: "Default active Gemini AI configuration is missing" });

    const currentSyllabus = syllabusRows.map((row, index) => ({
      index: index + 1,
      academicyear: row.academicyear || "",
      regulation: row.regulation || "",
      program: row.program || "",
      programcode: row.programcode || "",
      type: row.type || "",
      subject: row.subject || "",
      semester: row.semester || "",
      course: row.course || "",
      coursecode: row.coursecode || "",
      module: row.module || "",
      syllabus: row.syllabus || ""
    }));

    const prompt = `
You are an academic curriculum reviewer. Compare the current syllabus and the proposed new syllabus using meaning, topics, scope, learning content, and terminology.

Return only valid JSON with this exact shape:
{
  "matchPercent": number,
  "newPercent": number,
  "opinion": "short academic review paragraph",
  "matchedTerms": ["term"],
  "newTerms": ["term"],
  "moduleMatches": [
    { "module": "module name", "course": "course name", "coursecode": "course code", "similarity": number, "syllabus": "brief existing syllabus excerpt or summary" }
  ],
  "newSentences": [
    { "sentence": "new proposed concept or sentence", "score": number }
  ],
  "keySimilarities": ["point"],
  "keyNewAdditions": ["point"],
  "recommendation": "short recommendation"
}

Rules:
- matchPercent is the estimated percentage of proposed syllabus content already covered by current syllabus.
- newPercent is 100 - matchPercent.
- Use percentages from 0 to 100.
- moduleMatches should list the closest matching current modules with similarity from 0 to 100.
- newSentences should list proposed content that appears materially new, with score showing how much it matches current syllabus.
- Do not invent modules that are not present in current syllabus.

Current syllabus JSON:
${JSON.stringify(currentSyllabus)}

Proposed new syllabus:
${newSyllabusChange}
`;

    const aiResult = await callGeminiJson(aiConfig.apikey, prompt);
    const matchPercent = clampPercent(aiResult.matchPercent);
    const newPercent = clampPercent(aiResult.newPercent, 100 - matchPercent);

    res.json({
      success: true,
      data: {
        matchPercent,
        newPercent,
        opinion: text(aiResult.opinion) || text(aiResult.recommendation) || "Gemini completed the syllabus comparison.",
        matchedTerms: Array.isArray(aiResult.matchedTerms) ? aiResult.matchedTerms.map(text).filter(Boolean).slice(0, 24) : [],
        newTerms: Array.isArray(aiResult.newTerms) ? aiResult.newTerms.map(text).filter(Boolean).slice(0, 24) : [],
        moduleMatches: Array.isArray(aiResult.moduleMatches) ? aiResult.moduleMatches.map((item) => ({
          module: text(item.module) || "Module",
          course: text(item.course),
          coursecode: text(item.coursecode),
          similarity: clampPercent(item.similarity),
          syllabus: text(item.syllabus)
        })).slice(0, 10) : [],
        newSentences: Array.isArray(aiResult.newSentences) ? aiResult.newSentences.map((item) => ({
          sentence: text(item.sentence),
          score: clampPercent(item.score)
        })).filter((item) => item.sentence).slice(0, 10) : [],
        keySimilarities: Array.isArray(aiResult.keySimilarities) ? aiResult.keySimilarities.map(text).filter(Boolean).slice(0, 8) : [],
        keyNewAdditions: Array.isArray(aiResult.keyNewAdditions) ? aiResult.keyNewAdditions.map(text).filter(Boolean).slice(0, 8) : [],
        recommendation: text(aiResult.recommendation),
        recordCount: syllabusRows.length,
        courseCount: uniq(syllabusRows.map((row) => `${row.coursecode || ""} ${row.course || ""}`)).length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
