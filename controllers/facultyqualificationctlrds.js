const FacultyQualification = require("../Models/facultyqualificationds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const User = require("../Models/user");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = (rows) => [...new Set((rows || []).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const norm = (value) => text(value).toLowerCase();

const cleanQualification = (body = {}) => ({
  user: text(body.user || body.name),
  useremail: text(body.useremail || body.email || body.userEmail),
  subject: text(body.subject),
  expertise: text(body.expertise),
  phd: /^yes$/i.test(text(body.phd)) ? "Yes" : "No",
  colid: num(body.colid),
  createdby: text(body.createdby || body.createdBy),
  createdbyname: text(body.createdbyname || body.createdByName)
});

const validateQualification = (row) => {
  if (row.colid === undefined) return "colid is required";
  if (!row.user) return "User is required";
  if (!row.useremail) return "User email is required";
  if (!row.subject) return "Subject is required";
  return "";
};

const buildFilterQuery = (source = {}, fields = []) => {
  const query = {};
  const colid = num(source.colid);
  if (colid !== undefined) query.colid = colid;
  fields.forEach((field) => {
    if (text(source[field])) query[field] = { $regex: esc(source[field]), $options: "i" };
  });
  if (Array.isArray(source.dynamicFilters)) {
    source.dynamicFilters.forEach((filter) => {
      const field = text(filter.field);
      const value = text(filter.value);
      if (!field || !value || field.includes("$")) return;
      query[field] = text(filter.operator).toLowerCase() === "equals" ? value : { $regex: esc(value), $options: "i" };
    });
  }
  return query;
};

const getGemini = async (colid) => AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean();

const getOllama = async (colid, id) => id
  ? OllamaConfiguration.findOne({ _id: id, colid, active: /^yes$/i }).lean()
  : OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne({ colid, active: /^yes$/i }).sort({ _id: -1 }).lean();

const callGemini = async (colid, prompt, model = "gemini-2.5-flash") => {
  const config = await getGemini(colid);
  if (!config?.apikey) throw new Error("Active/default Gemini AI configuration is missing");
  const models = [...new Set([text(model), "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean))];
  let last = "";
  for (const item of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(item)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    last = data.error?.message || `Gemini failed for ${item}`;
  }
  throw new Error(last || "Gemini request failed");
};

const callOllama = async (colid, prompt, id) => {
  const config = await getOllama(colid, id);
  if (!config) throw new Error("Active Ollama configuration is missing");
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false, options: { temperature: 0.2 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const parseJson = (raw) => {
  const clean = text(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(clean); } catch (error) {
    const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw error;
  }
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [users, courses, qualifications, workloads, ollamaConfigs] = await Promise.all([
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email department role designation").sort({ name: 1 }).lean(),
      RegulationCourseMap.find({ colid }).select("academicyear regulation program programcode type subject semester course coursecode coursetype").sort({ academicyear: -1, program: 1, course: 1 }).lean(),
      FacultyQualification.find({ colid }).lean(),
      WorkloadAssignment.find({ colid }).select("academicyear regulation program programcode type subject semester course coursecode coursetype facultyemail facultyname").lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
    ]);
    const combined = [...courses, ...workloads];
    res.json({
      success: true,
      users,
      courses,
      academicyears: uniq(combined.map((row) => row.academicyear)),
      regulations: uniq(combined.map((row) => row.regulation)),
      programs: uniq(combined.map((row) => row.program)),
      programcodes: uniq(combined.map((row) => row.programcode)),
      types: uniq(combined.map((row) => row.type)),
      subjects: uniq([...combined.map((row) => row.subject), ...qualifications.map((row) => row.subject)]),
      semesters: uniq(combined.map((row) => row.semester)),
      coursesList: uniq(combined.map((row) => row.course)),
      coursecodes: uniq(combined.map((row) => row.coursecode)),
      phdOptions: ["Yes", "No"],
      ollamaConfigs,
      geminiModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listQualifications = async (req, res) => {
  try {
    const query = buildFilterQuery(req.query, ["user", "useremail", "subject", "expertise", "phd"]);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await FacultyQualification.find(query).sort({ user: 1, subject: 1, expertise: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveQualification = async (req, res) => {
  try {
    const payload = cleanQualification(req.body);
    const error = validateQualification(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const row = req.body.id
      ? await FacultyQualification.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await FacultyQualification.create(payload);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteQualification = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [req.body.id].filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one record" });
    const result = await FacultyQualification.deleteMany({ _id: { $in: ids }, colid: num(req.body.colid) });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkQualifications = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No rows received" });
    const valid = [];
    const errors = [];
    items.forEach((item, index) => {
      const payload = cleanQualification({ ...item, colid: req.body.colid || item.colid, createdby: req.body.user || item.createdby, createdbyname: req.body.username || item.createdbyname });
      const error = validateQualification(payload);
      if (error) errors.push({ rowNumber: item.rowNumber || index + 2, message: error });
      else valid.push(payload);
    });
    if (valid.length) await FacultyQualification.insertMany(valid, { ordered: false });
    res.json({ success: true, inserted: valid.length, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.previewAutoAllocation = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const courseIds = Array.isArray(req.body.courseIds) ? req.body.courseIds.filter(Boolean) : [];
    const facultyEmails = Array.isArray(req.body.facultyEmails) ? req.body.facultyEmails.map(text).filter(Boolean) : [];
    if (!courseIds.length) return res.status(400).json({ success: false, message: "Select at least one course" });
    if (!facultyEmails.length) return res.status(400).json({ success: false, message: "Select at least one faculty" });

    const [courses, qualifications, facultyUsers, existing] = await Promise.all([
      RegulationCourseMap.find({ colid, _id: { $in: courseIds } }).lean(),
      FacultyQualification.find({ colid, useremail: { $in: facultyEmails } }).lean(),
      User.find({ colid, email: { $in: facultyEmails } }).select("name email department").lean(),
      WorkloadAssignment.find({ colid }).select("academicyear regulation programcode coursecode facultyemail").lean()
    ]);

    const facultyByEmail = new Map(facultyUsers.map((user) => [text(user.email).toLowerCase(), user]));
    const existingKeys = new Set(existing.map((row) => `${row.academicyear}|${row.regulation}|${row.programcode}|${row.coursecode}`.toLowerCase()));
    const facultyLoad = Object.fromEntries(facultyEmails.map((email) => [email.toLowerCase(), existing.filter((row) => text(row.facultyemail).toLowerCase() === email.toLowerCase()).length]));
    const qByEmail = new Map();
    qualifications.forEach((row) => {
      const key = text(row.useremail).toLowerCase();
      const list = qByEmail.get(key) || [];
      list.push(row);
      qByEmail.set(key, list);
    });

    const preview = courses.map((course) => {
      const subject = text(course.subject).toLowerCase();
      const courseText = `${course.course} ${course.coursecode}`.toLowerCase();
      const candidates = facultyEmails.map((email) => {
        const key = email.toLowerCase();
        const quals = qByEmail.get(key) || [];
        let score = 0;
        quals.forEach((qual) => {
          const qSubject = text(qual.subject).toLowerCase();
          const qExpertise = text(qual.expertise).toLowerCase();
          if (qSubject && (qSubject === subject || subject.includes(qSubject) || qSubject.includes(subject))) score += 60;
          if (qExpertise && (courseText.includes(qExpertise) || qExpertise.includes(subject))) score += 25;
          if (/^yes$/i.test(qual.phd)) score += 10;
        });
        score -= (facultyLoad[key] || 0) * 2;
        return { email, user: facultyByEmail.get(key), score, qualifications: quals };
      }).sort((a, b) => b.score - a.score || (facultyLoad[a.email.toLowerCase()] || 0) - (facultyLoad[b.email.toLowerCase()] || 0));
      const chosen = candidates[0] || {};
      if (chosen.email) facultyLoad[chosen.email.toLowerCase()] = (facultyLoad[chosen.email.toLowerCase()] || 0) + 1;
      const duplicate = existingKeys.has(`${course.academicyear}|${course.regulation}|${course.programcode}|${course.coursecode}`.toLowerCase());
      return {
        courseid: course._id,
        academicyear: course.academicyear,
        regulation: course.regulation,
        program: course.program,
        programcode: course.programcode,
        type: course.type,
        subject: course.subject,
        semester: course.semester,
        course: course.course,
        coursecode: course.coursecode,
        coursetype: course.coursetype || "",
        facultyname: chosen.user?.name || chosen.qualifications?.[0]?.user || "",
        facultyemail: chosen.email || "",
        facultydepartment: chosen.user?.department || "",
        hoursperweek: course.coursetype === "Practical" ? 4 : 3,
        matchscore: Number(chosen.score || 0),
        reason: duplicate ? "Existing workload found for this course; approval will skip duplicate insert." : chosen.score > 0 ? "Matched by subject/expertise/PhD and current load." : "No subject match; allocated by lowest current load.",
        duplicate
      };
    });
    res.json({ success: true, data: preview });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.previewAutoAllocationAi = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const courseIds = Array.isArray(req.body.courseIds) ? req.body.courseIds.filter(Boolean) : [];
    const facultyEmails = Array.isArray(req.body.facultyEmails) ? req.body.facultyEmails.map(text).filter(Boolean) : [];
    if (!courseIds.length) return res.status(400).json({ success: false, message: "Select at least one course" });
    if (!facultyEmails.length) return res.status(400).json({ success: false, message: "Select at least one faculty" });

    const [courses, qualifications, facultyUsers, existing] = await Promise.all([
      RegulationCourseMap.find({ colid, _id: { $in: courseIds } }).lean(),
      FacultyQualification.find({ colid, useremail: { $in: facultyEmails } }).lean(),
      User.find({ colid, email: { $in: facultyEmails } }).select("name email department").lean(),
      WorkloadAssignment.find({ colid }).select("academicyear regulation programcode coursecode facultyemail").lean()
    ]);
    const existingKeys = new Set(existing.map((row) => `${row.academicyear}|${row.regulation}|${row.programcode}|${row.coursecode}`.toLowerCase()));
    const facultyLoad = Object.fromEntries(facultyEmails.map((email) => [email, existing.filter((row) => norm(row.facultyemail) === norm(email)).length]));
    const compactCourses = courses.map((course) => ({
      courseid: String(course._id),
      academicyear: course.academicyear,
      regulation: course.regulation,
      program: course.program,
      programcode: course.programcode,
      type: course.type,
      subject: course.subject,
      semester: course.semester,
      course: course.course,
      coursecode: course.coursecode,
      coursetype: course.coursetype
    }));
    const compactFaculty = facultyUsers.map((user) => ({
      name: user.name,
      email: user.email,
      department: user.department,
      currentload: facultyLoad[user.email] || 0,
      qualifications: qualifications.filter((q) => norm(q.useremail) === norm(user.email)).map((q) => ({ subject: q.subject, expertise: q.expertise, phd: q.phd }))
    }));
    const prompt = `Allocate workload courses to faculty. Return ONLY JSON array.
Each item must be {"courseid":"","facultyemail":"","reason":"","matchscore":0}.
Use best match by subject, expertise, PhD and balanced current workload. Do not use any faculty outside the given list.
Additional rules: ${text(req.body.rules) || "No additional rules."}
Courses:
${JSON.stringify(compactCourses)}
Faculty:
${JSON.stringify(compactFaculty)}`;
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama(colid, prompt, req.body.ollamaConfigId)
      : await callGemini(colid, prompt, req.body.geminiModel);
    const parsed = parseJson(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.allocations || [];
    const courseMap = new Map(courses.map((course) => [String(course._id), course]));
    const facultyMap = new Map(facultyUsers.map((user) => [norm(user.email), user]));
    const fallbackFaculty = facultyUsers[0] || {};
    const preview = compactCourses.map((courseInfo) => {
      const match = items.find((item) => String(item.courseid) === String(courseInfo.courseid)) || {};
      const faculty = facultyMap.get(norm(match.facultyemail)) || fallbackFaculty;
      const course = courseMap.get(String(courseInfo.courseid)) || courseInfo;
      const duplicate = existingKeys.has(`${course.academicyear}|${course.regulation}|${course.programcode}|${course.coursecode}`.toLowerCase());
      return {
        courseid: courseInfo.courseid,
        academicyear: course.academicyear,
        regulation: course.regulation,
        program: course.program,
        programcode: course.programcode,
        type: course.type,
        subject: course.subject,
        semester: course.semester,
        course: course.course,
        coursecode: course.coursecode,
        coursetype: course.coursetype || "",
        facultyname: faculty.name || "",
        facultyemail: faculty.email || "",
        facultydepartment: faculty.department || "",
        hoursperweek: course.coursetype === "Practical" ? 4 : 3,
        matchscore: Number(match.matchscore || 0),
        reason: duplicate ? "Existing workload found for this course; approval will skip duplicate insert." : text(match.reason) || "AI selected this faculty.",
        duplicate
      };
    });
    res.json({ success: true, data: preview, aiResponse: raw });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveAutoAllocation = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: "No allocation rows received" });
    const valid = rows.filter((row) => row && !row.duplicate && text(row.facultyemail)).map((row) => ({
      academicyear: text(row.academicyear),
      regulation: text(row.regulation),
      program: text(row.program),
      programcode: text(row.programcode),
      type: text(row.type),
      subject: text(row.subject),
      semester: text(row.semester),
      course: text(row.course),
      coursecode: text(row.coursecode),
      coursetype: text(row.coursetype),
      facultyname: text(row.facultyname),
      facultyemail: text(row.facultyemail),
      facultydepartment: text(row.facultydepartment),
      hoursperweek: Number(row.hoursperweek || 0),
      status: "Active",
      colid,
      user: text(req.body.user)
    }));
    const inserted = [];
    for (const row of valid) {
      const exists = await WorkloadAssignment.findOne({ colid, academicyear: row.academicyear, regulation: row.regulation, programcode: row.programcode, coursecode: row.coursecode });
      if (!exists) inserted.push(await WorkloadAssignment.create(row));
    }
    res.json({ success: true, inserted: inserted.length, data: inserted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
