const ConductExam = require("../Models/conductexamds");
const ConductExamCourse = require("../Models/conductexamcourseds");
const ConductExamRoll = require("../Models/conductexamrollds");
const ConductExamRoom = require("../Models/conductexamroomds");
const ConductExamInvigilatorAllocation = require("../Models/conductexaminvigilatorallocationds");
const ExamVivaMarks = require("../Models/examinationmodel2vivamarksds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const RoomResource = require("../Models/roomresourceds");
const User = require("../Models/user");
const AcademicCalendar = require("../Models/macadcal");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const InsDetails = require("../Models/insdetails");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (values) => [...new Set(values.map((item) => text(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const dateKey = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};
const parseDateOnly = (value) => {
  const key = dateKey(value);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
};
const sameOrBlank = (calendarValue, rowValue) => {
  const left = text(calendarValue);
  return !left || left === text(rowValue);
};
const getDefaultGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGeminiText = async (apikey, prompt, requestedModel = "") => {
  const allowedModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];
  const selectedModel = text(requestedModel);
  const models = selectedModel && allowedModels.includes(selectedModel)
    ? [selectedModel, ...allowedModels.filter((model) => model !== selectedModel)]
    : allowedModels;
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    const data = await response.json();
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllamaText = async (colid, ollamaConfigId, prompt) => {
  const config = ollamaConfigId
    ? await OllamaConfiguration.findOne({ _id: ollamaConfigId, colid, active: /^yes$/i }).lean()
    : await OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).lean()
      || await OllamaConfiguration.findOne({ colid, active: /^yes$/i }).lean();
  if (!config) throw new Error("Active Ollama configuration is missing");
  const base = text(config.serveraddress || config.serverAddress || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ollama request failed");
  return data.response || "";
};

const buildExamCourseScheduleFilter = (body = {}) => {
  const filter = buildFilter(body, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"]);
  return filter;
};

const buildExamCodeOnlyScheduleFilter = (body = {}) => {
  const colid = number(body.colid);
  const examcode = text(body.examcode);
  const filter = {};
  if (colid !== undefined) filter.colid = colid;
  if (examcode) filter.examcode = examcode;
  const programcodes = Array.isArray(body.programcodes) ? body.programcodes.map(text).filter(Boolean) : [];
  if (programcodes.length) filter.programcode = { $in: programcodes };
  ["academicyear", "regulation", "semester"].forEach((field) => {
    if (text(body[field])) filter[field] = text(body[field]);
  });
  return filter;
};

const loadHolidayRows = async (colid, fromDate, toDate) => {
  const rows = await AcademicCalendar.find({
    colid,
    type: /^holiday$/i,
    activitydate: { $gte: fromDate, $lte: toDate }
  }).lean();
  const map = new Map();
  rows.forEach((row) => {
    const key = dateKey(row.activitydate);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
};

const isHolidayForCourse = (row, holidays = []) => holidays.some((holiday) => (
  sameOrBlank(holiday.academicyear, row.academicyear)
  && sameOrBlank(holiday.regulation, row.regulation)
  && (sameOrBlank(holiday.programcode, row.programcode) || sameOrBlank(holiday.program, row.program))
  && sameOrBlank(holiday.semester, row.semester)
));

const buildAvailableSlots = (rows, holidaysByDate, fromDate, toDate, slots) => {
  const available = [];
  const current = new Date(fromDate.getTime());
  while (current <= toDate) {
    const day = current.getUTCDay();
    const key = current.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6) {
      const holidays = holidaysByDate.get(key) || [];
      rows.forEach((row) => {
        if (!isHolidayForCourse(row, holidays)) {
          slots.forEach((slot) => available.push({ date: key, slot, rowKey: String(row._id) }));
        }
      });
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return available;
};

const scheduleExamCourseRows = async ({ colid, filter, fromdate, todate, slot1, slot2, aiOrder = [] }) => {
  const fromDate = parseDateOnly(fromdate);
  const toDate = parseDateOnly(todate);
  if (!fromDate || !toDate) throw new Error("Valid from date and to date are required");
  if (fromDate > toDate) throw new Error("From date cannot be after to date");

  const rows = await ConductExamCourse.find({ ...filter, colid }).sort({ semester: 1, program: 1, subject: 1, course: 1 }).lean();
  if (!rows.length) throw new Error("No exam course rows found for scheduling");

  const slots = [text(slot1) || "Slot 1", text(slot2) || "Slot 2"];
  const holidaysByDate = await loadHolidayRows(colid, fromDate, toDate);
  const rowAllowedSlotKeys = buildAvailableSlots(rows, holidaysByDate, fromDate, toDate, slots).reduce((acc, item) => {
    if (!acc.has(item.rowKey)) acc.set(item.rowKey, []);
    acc.get(item.rowKey).push(`${item.date}||${item.slot}`);
    return acc;
  }, new Map());

  const orderMap = new Map(aiOrder.map((code, index) => [text(code), index]));
  const sortedRows = [...rows].sort((a, b) => {
    const aOrder = orderMap.has(text(a.coursecode)) ? orderMap.get(text(a.coursecode)) : Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.has(text(b.coursecode)) ? orderMap.get(text(b.coursecode)) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const sem = text(a.semester).localeCompare(text(b.semester), undefined, { numeric: true });
    if (sem) return sem;
    return text(a.course).localeCompare(text(b.course));
  });

  const usedSemestersBySlot = new Map();
  const assignments = [];
  for (const row of sortedRows) {
    const allowedKeys = rowAllowedSlotKeys.get(String(row._id)) || [];
    const selectedKey = allowedKeys.find((key) => !usedSemestersBySlot.get(key)?.has(text(row.semester)));
    if (!selectedKey) throw new Error(`No valid slot available for ${row.course || row.coursecode} semester ${row.semester}`);
    const [examdate, examslot] = selectedKey.split("||");
    if (!usedSemestersBySlot.has(selectedKey)) usedSemestersBySlot.set(selectedKey, new Set());
    usedSemestersBySlot.get(selectedKey).add(text(row.semester));
    assignments.push({ id: row._id, examdate, examslot });
  }

  if (assignments.length) {
    await ConductExamCourse.bulkWrite(assignments.map((item) => ({
      updateOne: {
        filter: { _id: item.id, colid },
        update: { $set: { examdate: item.examdate, examslot: item.examslot } }
      }
    })));
  }

  const updated = await ConductExamCourse.find({ ...filter, colid }).sort({ examdate: 1, examslot: 1, semester: 1, course: 1 }).lean();
  return { saved: assignments.length, data: updated, assignments };
};

const examPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  examname: text(body.examname || body.exam),
  examcode: text(body.examcode),
  program: text(body.program),
  programcode: text(body.programcode),
  faculty: text(body.faculty),
  institution: text(body.institution),
  department: text(body.department),
  semester: text(body.semester),
  session: text(body.session),
  type: text(body.type),
  user: text(body.user)
});

const examCoursePayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  exam: text(body.exam || body.examname),
  examcode: text(body.examcode),
  program: text(body.program),
  programcode: text(body.programcode),
  type: text(body.type),
  subject: text(body.subject),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  coursetype: ["Theory", "Practical", "Tutorial", "Internship", "Project", "Experiential learning"].includes(text(body.coursetype || body.courseType)) ? text(body.coursetype || body.courseType) : "Theory",
  deliverytype: text(body.deliverytype || body.deliveryType),
  coursemastercode: text(body.coursemastercode || body.courseMasterCode),
  examdate: text(body.examdate),
  examslot: text(body.examslot),
  user: text(body.user)
});

const rollPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  exam: text(body.exam || body.examname),
  examcode: text(body.examcode),
  program: text(body.program),
  programcode: text(body.programcode),
  type: text(body.type),
  subject: text(body.subject),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  student: text(body.student || body.name),
  regno: text(body.regno),
  email: text(body.email),
  phone: text(body.phone),
  section: text(body.section),
  examsection: text(body.examsection || body.examSection || body["Exam Section"]),
  applied: text(body.applied) || "Yes",
  admitcardeligible: text(body.admitcardeligible) || "Yes",
  attended: text(body.attended) || "No",
  attendance: text(body.attendance),
  fees: text(body.fees),
  disciplinary: text(body.disciplinary),
  noofbacklogs: number(body.noofbacklogs || body.noOfBacklogs || body["No of Backlogs"]) || 0,
  atkt: text(body.atkt),
  remarks: text(body.remarks),
  examdate: text(body.examdate),
  examslot: text(body.examslot),
  campus: text(body.campus),
  building: text(body.building),
  examroom: text(body.examroom),
  seatno: text(body.seatno),
  examseatno: text(body.examseatno),
  user: text(body.user)
});

const roomPayload = (body = {}) => ({
  colid: number(body.colid),
  campus: text(body.campus),
  building: text(body.building),
  floor: text(body.floor),
  room: text(body.room),
  noofseats: number(body.noofseats || body.noOfSeats || body["No of seats"]),
  roomresourceid: text(body.roomresourceid || body.roomResourceId),
  status: ["Pending", "Approved", "Rejected"].includes(text(body.status)) ? text(body.status) : "Pending",
  approvalcomments: text(body.approvalcomments),
  approvedby: text(body.approvedby),
  approveddate: text(body.approveddate),
  user: text(body.user)
});

const validateExam = (p) => {
  if (p.colid === undefined) return "colid is required";
  if (!p.academicyear) return "Academic year is required";
  if (!p.examname) return "Exam name is required";
  if (!p.examcode) return "Exam code is required";
  if (!["Odd", "Even"].includes(p.session)) return "Session is required";
  if (!["Regular", "Supplementary"].includes(p.type)) return "Exam type is required";
  return "";
};

const validateExamCourse = (p) => {
  if (p.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"]) {
    if (!p[field]) return `${field} is required`;
  }
  if (!["Major", "Minor", "AEC", "SEC", "VAC", "IDC"].includes(p.type)) return "Type must be Major, Minor, AEC, SEC, VAC, IDC";
  return "";
};

const validateRoll = (p) => {
  const courseError = validateExamCourse(p);
  if (courseError) return courseError;
  if (!p.student) return "Student is required";
  if (!p.regno) return "Reg no is required";
  return "";
};

const validateRoom = (p) => {
  if (p.colid === undefined) return "colid is required";
  if (!p.campus) return "Campus is required";
  if (!p.building) return "Building is required";
  if (!p.room) return "Room is required";
  if (p.noofseats === undefined) return "No of seats is required";
  if (p.noofseats < 0) return "No of seats cannot be negative";
  return "";
};

const buildFilter = (source = {}, fields = []) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  fields.forEach((field) => {
    if (source[field]) filter[field] = source[field];
  });
  return filter;
};

const rollListFilterFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "student", "regno", "email", "phone", "section", "examsection", "applied", "admitcardeligible", "attended", "attendance", "fees", "disciplinary", "atkt", "examdate", "examslot", "campus", "building", "examroom", "seatno", "examseatno"];
const defaultRollListComponents = ["Section-A", "Section-B", "Pr"];

const normalizeExamSection = (value) => {
  const item = text(value);
  if (!item) return "";
  const lower = item.toLowerCase().replace(/\s+/g, "");
  if (["sectiona", "seca", "a"].includes(lower)) return "Section-A";
  if (["sectionb", "secb", "b"].includes(lower)) return "Section-B";
  if (["pr", "practical", "pract"].includes(lower)) return "Pr";
  return item;
};

const parseExamSections = (value) => {
  const raw = text(value);
  if (!raw) return [...defaultRollListComponents];
  const parts = raw.split(/[,;|/]+/).map(normalizeExamSection).filter(Boolean);
  return parts.length ? uniq(parts) : [...defaultRollListComponents];
};

const parseDynamicFilters = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
};

const addDynamicFiltersToQuery = (query, dynamicFilters = []) => {
  dynamicFilters.forEach((item) => {
    const field = text(item.field);
    if (!rollListFilterFields.includes(field)) return;
    const values = Array.isArray(item.values)
      ? item.values.map(text).filter(Boolean)
      : text(item.value).split(",").map(text).filter(Boolean);
    if (!values.length) return;
    query[field] = values.length === 1 ? values[0] : { $in: values };
  });
};

const yearLabelFromSemester = (semester) => {
  const sem = Number(text(semester).replace(/[^0-9]/g, ""));
  if (!sem) return text(semester);
  if (sem <= 2) return "First";
  if (sem <= 4) return "Second";
  if (sem <= 6) return "Third";
  if (sem <= 8) return "Fourth";
  return "Final";
};

const rollListOptionsFromRows = (rows = []) => rollListFilterFields.reduce((acc, field) => {
  acc[field] = uniq(rows.map((row) => row[field]));
  return acc;
}, {});

const shuffle = (items = []) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const pickSeatCandidate = (pool, previousCourse) => {
  const eligible = pool.filter((row) => row.coursecode !== previousCourse);
  const candidates = eligible.length ? eligible : pool;
  const counts = candidates.reduce((acc, row) => {
    const key = row.coursecode || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const maxCount = Math.max(...Object.values(counts));
  const dominantCourses = Object.keys(counts).filter((key) => counts[key] === maxCount);
  const dominantCandidates = candidates.filter((row) => dominantCourses.includes(row.coursecode || "Unknown"));
  return dominantCandidates[Math.floor(Math.random() * dominantCandidates.length)];
};

exports.getExams = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "examname", "examcode", "program", "programcode", "faculty", "institution", "department", "semester", "session", "type"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExam.find(filter).sort({ academicyear: -1, examname: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveExam = async (req, res) => {
  try {
    const payload = examPayload(req.body);
    const error = validateExam(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ConductExam.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ConductExam.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: "Exam code already exists for this academic year" });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    await ConductExam.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkExams = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const payload = examPayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user || items[index].user });
      const error = validateExam(payload);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await ConductExam.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, examcode: payload.examcode },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRooms = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["campus", "building", "floor", "room", "status"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExamRoom.find(filter).sort({ campus: 1, building: 1, room: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveRoom = async (req, res) => {
  try {
    let payload = roomPayload(req.body);
    if (payload.roomresourceid) {
      const resource = await RoomResource.findOne({ _id: payload.roomresourceid, colid: payload.colid }).lean();
      if (!resource) return res.status(404).json({ success: false, message: "Selected room resource not found" });
      payload = {
        ...payload,
        campus: resource.campus,
        building: resource.building,
        floor: resource.floor,
        room: resource.roomno,
        noofseats: Number(resource.examcapacity) || Number(resource.capacity) || 0
      };
    }
    const error = validateRoom(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ConductExamRoom.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, { ...payload, status: payload.status || "Pending" }, { new: true, runValidators: true })
      : await ConductExamRoom.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: "Room already exists for this campus and building" });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approveRoom = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const status = text(req.body.status);
    if (colid === undefined || !req.body.id) return res.status(400).json({ success: false, message: "id and colid are required" });
    if (!["Approved", "Rejected", "Pending"].includes(status)) return res.status(400).json({ success: false, message: "Valid status is required" });
    const data = await ConductExamRoom.findOneAndUpdate(
      { _id: req.body.id, colid },
      {
        status,
        approvalcomments: text(req.body.approvalcomments),
        approvedby: text(req.body.user),
        approveddate: new Date().toISOString()
      },
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Room usage request not found" });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    await ConductExamRoom.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkRooms = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const payload = roomPayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user || items[index].user, status: items[index].status || "Pending" });
      const error = validateRoom(payload);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await ConductExamRoom.findOneAndUpdate(
        { colid: payload.colid, campus: payload.campus, building: payload.building, room: payload.room },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExamCourses = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "coursetype", "deliverytype", "coursemastercode", "examdate", "examslot"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExamCourse.find(filter).sort({ academicyear: -1, exam: 1, program: 1, type: 1, semester: 1, course: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveExamCourses = async (req, res) => {
  try {
    const courses = Array.isArray(req.body.courses) ? req.body.courses : [req.body];
    const saved = [];
    for (const course of courses) {
      const payload = examCoursePayload({ ...req.body, ...course });
      const error = validateExamCourse(payload);
      if (error) return res.status(400).json({ success: false, message: error });
      const data = req.body.id && courses.length === 1
        ? await ConductExamCourse.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
        : await ConductExamCourse.findOneAndUpdate(
          { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, examcode: payload.examcode, programcode: payload.programcode, type: payload.type, subject: payload.subject, semester: payload.semester, coursecode: payload.coursecode },
          payload,
          { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );
      saved.push(data);
    }
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteExamCourse = async (req, res) => {
  try {
    await ConductExamCourse.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkExamCourses = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const payload = examCoursePayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user || items[index].user });
      const error = validateExamCourse(payload);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await ConductExamCourse.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, examcode: payload.examcode, programcode: payload.programcode, type: payload.type, subject: payload.subject, semester: payload.semester, coursecode: payload.coursecode },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const atktFilterFromSource = (source = {}) => {
  const colid = number(source.colid);
  const programcodes = Array.isArray(source.programcodes)
    ? source.programcodes.map(text).filter(Boolean)
    : text(source.programcodes)
      ? text(source.programcodes).split(",").map(text).filter(Boolean)
      : text(source.programcode)
        ? [text(source.programcode)]
      : [];
  const filter = { status: /^fail$/i };
  if (colid !== undefined) filter.colid = colid;
  ["academicyear", "regulation", "semester"].forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  if (programcodes.length) filter.programcode = { $in: programcodes };
  return { colid, filter, programcodes };
};

const loadAtktMarks = async (source = {}) => {
  const { colid, filter } = atktFilterFromSource(source);
  if (colid === undefined) throw new Error("colid is required");
  if (!text(source.academicyear)) throw new Error("Academic year is required");
  const failed = await ExamVivaMarks.find(filter).sort({ program: 1, programcode: 1, semester: 1, course: 1, student: 1 }).lean();
  const courseKeys = new Set(failed.map((row) => [row.academicyear, row.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||")));
  const mapQuery = { colid };
  if (text(source.academicyear)) mapQuery.academicyear = text(source.academicyear);
  if (text(source.regulation)) mapQuery.regulation = text(source.regulation);
  const programcodes = uniq(failed.map((row) => row.programcode));
  if (programcodes.length) mapQuery.programcode = { $in: programcodes };
  const courseMapRows = programcodes.length ? await RegulationCourseMap.find(mapQuery).lean() : [];
  const courseMap = new Map(courseMapRows.map((row) => [[row.academicyear, row.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||"), row]));
  const courses = [...courseKeys].map((key) => {
    const sample = failed.find((row) => [row.academicyear, row.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||") === key) || {};
    const mapped = courseMap.get(key) || {};
    const students = failed.filter((row) => [row.academicyear, row.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||") === key);
    return {
      id: key,
      academicyear: sample.academicyear || "",
      regulation: sample.regulation || "",
      program: sample.program || mapped.program || "",
      programcode: sample.programcode || mapped.programcode || "",
      type: mapped.type || "Major",
      subject: mapped.subject || sample.course || "",
      semester: sample.semester || mapped.semester || "",
      course: sample.course || mapped.course || "",
      coursecode: sample.coursecode || mapped.coursecode || "",
      coursetype: mapped.coursetype || "Theory",
      deliverytype: mapped.deliverytype || "",
      coursemastercode: mapped.coursemastercode || "",
      failedstudents: students.length
    };
  }).sort((a, b) => `${a.programcode}${a.semester}${a.course}`.localeCompare(`${b.programcode}${b.semester}${b.course}`, undefined, { numeric: true }));
  return { failed, courses };
};

exports.getAtktSchedulerData = async (req, res) => {
  try {
    const result = await loadAtktMarks(req.query);
    res.json({ success: true, courses: result.courses, students: result.failed });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.confirmAtktScheduler = async (req, res) => {
  try {
    const selectedCourses = Array.isArray(req.body.courses) ? req.body.courses : [];
    if (!selectedCourses.length) return res.status(400).json({ success: false, message: "Select at least one course" });
    const colid = number(req.body.colid);
    const base = {
      colid,
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      exam: text(req.body.exam || req.body.examname),
      examcode: text(req.body.examcode),
      user: text(req.body.user)
    };
    if (colid === undefined || !base.academicyear || !base.regulation || !base.exam || !base.examcode) {
      return res.status(400).json({ success: false, message: "Academic year, regulation, exam and exam code are required" });
    }
    const selectedKeys = new Set(selectedCourses.map((row) => [row.academicyear || base.academicyear, row.regulation || base.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||")));
    const { failed, courses } = await loadAtktMarks({ ...req.body, colid, academicyear: base.academicyear, regulation: base.regulation });
    const courseByKey = new Map(courses.map((row) => [[row.academicyear, row.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||"), row]));
    let courseSaved = 0;
    let rollSaved = 0;
    const errors = [];
    for (const key of selectedKeys) {
      const course = courseByKey.get(key) || selectedCourses.find((row) => [row.academicyear || base.academicyear, row.regulation || base.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||") === key);
      if (!course) continue;
      const coursePayload = examCoursePayload({ ...base, ...course, type: course.type || "Major" });
      const courseError = validateExamCourse(coursePayload);
      if (courseError) {
        errors.push({ coursecode: course.coursecode, message: courseError });
        continue;
      }
      await ConductExamCourse.findOneAndUpdate(
        { colid, academicyear: base.academicyear, regulation: base.regulation, examcode: base.examcode, programcode: coursePayload.programcode, type: coursePayload.type, subject: coursePayload.subject, semester: coursePayload.semester, coursecode: coursePayload.coursecode },
        coursePayload,
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );
      courseSaved += 1;
      const matchingStudents = failed.filter((row) => [row.academicyear, row.regulation, row.programcode, row.semester, row.coursecode].map(text).join("||") === key);
      for (const student of matchingStudents) {
        const roll = rollPayload({
          ...coursePayload,
          student: student.student || student.name || student.regno,
          regno: student.regno,
          applied: "Yes",
          admitcardeligible: "No",
          attended: "No",
          atkt: "Yes",
          remarks: "ATKT scheduler"
        });
        const rollError = validateRoll(roll);
        if (rollError) {
          errors.push({ regno: student.regno, coursecode: course.coursecode, message: rollError });
          continue;
        }
        const data = await ConductExamRoll.findOneAndUpdate(
          { colid, academicyear: roll.academicyear, regulation: roll.regulation, examcode: roll.examcode, programcode: roll.programcode, semester: roll.semester, coursecode: roll.coursecode, regno: roll.regno },
          roll,
          { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );
        if (data && !data.examseatno) await ConductExamRoll.updateOne({ _id: data._id }, { $set: { examseatno: String(data._id) } });
        rollSaved += 1;
      }
    }
    res.json({ success: true, courseSaved, rollSaved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.autoScheduleExamCourses = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(req.body.examcode)) return res.status(400).json({ success: false, message: "Exam code is required for scheduling" });
    const filter = buildExamCodeOnlyScheduleFilter(req.body);
    const result = await scheduleExamCourseRows({
      colid,
      filter,
      fromdate: req.body.fromdate,
      todate: req.body.todate,
      slot1: req.body.slot1,
      slot2: req.body.slot2
    });
    res.json({ success: true, ...result, message: `${result.saved} papers scheduled.` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.aiScheduleExamCourses = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(req.body.examcode)) return res.status(400).json({ success: false, message: "Exam code is required for Gemini scheduling" });
    const filter = buildExamCodeOnlyScheduleFilter(req.body);
    const rows = await ConductExamCourse.find({ ...filter, colid }).sort({ semester: 1, program: 1, subject: 1, course: 1 }).lean();
    if (!rows.length) return res.status(400).json({ success: false, message: "No exam course rows found for scheduling" });
    const prompt = [
      "Create an exam paper scheduling order from the following papers.",
      "Hard rules: only two slots per day, do not schedule two courses of the same semester in the same slot, no Saturday or Sunday, skip holidays handled separately by software.",
      "Return a concise recommendation and a JSON array named coursecodes in preferred scheduling order.",
      `User rules: ${text(req.body.rules) || "Use balanced scheduling."}`,
      `Date range: ${text(req.body.fromdate)} to ${text(req.body.todate)}.`,
      `Slots: ${text(req.body.slot1) || "Slot 1"}, ${text(req.body.slot2) || "Slot 2"}.`,
      `Papers: ${JSON.stringify(rows.map((row) => ({ coursecode: row.coursecode, course: row.course, semester: row.semester, programcode: row.programcode, subject: row.subject })))}`
    ].join("\n");
    let aiText = "";
    if (/^ollama$/i.test(text(req.body.provider))) {
      aiText = await callOllamaText(colid, req.body.ollamaConfigId || req.body.ollamaId, prompt);
    } else {
      const config = await getDefaultGeminiConfig(colid);
      if (!config?.apikey) return res.status(400).json({ success: false, message: "Default active Gemini AI configuration is missing" });
      aiText = await callGeminiText(config.apikey, prompt, req.body.geminiModel);
    }
    const jsonMatch = aiText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    let aiOrder = [];
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        aiOrder = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.coursecodes) ? parsed.coursecodes : []);
      } catch (parseErr) {
        aiOrder = [];
      }
    }
    const result = await scheduleExamCourseRows({
      colid,
      filter,
      fromdate: req.body.fromdate,
      todate: req.body.todate,
      slot1: req.body.slot1,
      slot2: req.body.slot2,
      aiOrder
    });
    res.json({ success: true, ...result, aiText, message: `${result.saved} papers scheduled with Gemini guidance.` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getCourseMapOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = { colid };
    ["academicyear", "regulation", "program", "programcode", "type", "subject", "semester"].forEach((field) => {
      if (req.query[field]) filter[field] = req.query[field];
    });
    const rows = await RegulationCourseMap.find(filter).sort({ program: 1, type: 1, subject: 1, semester: 1, course: 1 }).lean();
    res.json({
      success: true,
      data: rows,
      academicyears: uniq(rows.map((r) => r.academicyear)),
      regulations: uniq(rows.map((r) => r.regulation)),
      programs: uniq(rows.map((r) => `${r.programcode}||${r.program}`)).map((value) => {
        const [programcode, program] = value.split("||");
        return { programcode, program };
      }),
      types: uniq(rows.map((r) => r.type)),
      subjects: uniq(rows.map((r) => r.subject)),
      semesters: uniq(rows.map((r) => r.semester)),
      courses: rows.map((r) => ({ course: r.course, coursecode: r.coursecode, coursetype: r.coursetype, deliverytype: r.deliverytype, coursemastercode: r.coursemastercode, examdate: r.examdate, examslot: r.examslot, subject: r.subject, type: r.type, semester: r.semester, program: r.program, programcode: r.programcode, regulation: r.regulation }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExamRolls = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode", "student", "regno", "email", "phone", "section", "examsection", "applied", "admitcardeligible", "attended", "attendance", "fees", "disciplinary", "noofbacklogs", "atkt", "remarks", "examdate", "examslot", "campus", "building", "examroom", "seatno", "examseatno"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExamRoll.find(filter).sort({ program: 1, semester: 1, course: 1, regno: 1 }).lean();
    res.json({ success: true, data: data.map((row) => ({ ...row, examseatno: row.examseatno || String(row._id) })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExamRollListReportOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await ConductExamRoll.find({ colid }).select(rollListFilterFields.join(" ")).lean();
    const regnos = uniq(rows.map((row) => row.regno));
    const users = regnos.length
      ? await User.find({ colid, regno: { $in: regnos } }).select("admissionyear academicyear").lean()
      : [];
    const batchOptions = uniq(users.map((user) => user.admissionyear || user.academicyear));
    res.json({ success: true, options: { ...rollListOptionsFromRows(rows), batch: batchOptions, admissionyear: batchOptions } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExamRollListReport = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    addDynamicFiltersToQuery(filter, parseDynamicFilters(req.query.filters));
    const rows = await ConductExamRoll.find(filter).sort({ program: 1, semester: 1, coursecode: 1, regno: 1 }).lean();
    const regnos = uniq(rows.map((row) => row.regno));
    const users = await User.find({ colid, regno: { $in: regnos } })
      .select("name regno fathername guardianname admissionyear academicyear rollno section program programcode photo email phone")
      .lean();
    const userMap = new Map(users.map((user) => [text(user.regno), user]));

    const courseMap = new Map();
    const courseComponentMap = new Map();
    rows.forEach((row) => {
      const key = text(row.coursecode) || text(row.course);
      if (!key || courseMap.has(key)) return;
      courseMap.set(key, {
        coursecode: text(row.coursecode),
        course: text(row.course),
        subject: text(row.subject),
        type: text(row.type),
        semester: text(row.semester)
      });
    });
    rows.forEach((row) => {
      const key = text(row.coursecode) || text(row.course);
      if (!key) return;
      if (!courseComponentMap.has(key)) courseComponentMap.set(key, new Set());
      parseExamSections(row.examsection).forEach((component) => courseComponentMap.get(key).add(component));
    });
    const courses = [...courseMap.values()]
      .map((course) => {
        const key = text(course.coursecode) || text(course.course);
        const components = [...(courseComponentMap.get(key) || new Set())];
        return { ...course, components: components.length ? components : [...defaultRollListComponents] };
      })
      .sort((a, b) => text(a.coursecode || a.course).localeCompare(text(b.coursecode || b.course), undefined, { numeric: true }));

    const studentMap = new Map();
    rows.forEach((row) => {
      const key = text(row.regno) || text(row.email) || text(row.student);
      if (!key) return;
      const user = userMap.get(text(row.regno)) || {};
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          id: key,
          student: text(row.student || user.name),
          regno: text(row.regno || user.regno),
          enrollmentno: text(row.regno || user.regno),
          rollno: text(user.rollno),
          fathername: text(user.fathername || user.guardianname),
          batch: text(user.admissionyear || user.academicyear || row.academicyear),
          section: text(row.section || user.section),
          courses: {}
        });
      }
      const courseKey = text(row.coursecode) || text(row.course);
      const isApplied = text(row.applied).toLowerCase() !== "no";
      const existing = studentMap.get(key).courses[courseKey] || {};
      parseExamSections(row.examsection).forEach((component) => {
        existing[component] = isApplied ? "1" : "";
      });
      existing.sectionA = existing["Section-A"] || "";
      existing.sectionB = existing["Section-B"] || "";
      existing.practical = existing.Pr || "";
      studentMap.get(key).courses[courseKey] = existing;
    });

    const batchFilterValues = parseDynamicFilters(req.query.filters)
      .filter((item) => ["batch", "admissionyear"].includes(text(item.field)))
      .flatMap((item) => Array.isArray(item.values) ? item.values.map(text) : [text(item.value)])
      .filter(Boolean);
    const students = [...studentMap.values()]
      .filter((student) => !batchFilterValues.length || batchFilterValues.includes(student.batch))
      .sort((a, b) => {
        const batchSort = text(a.batch).localeCompare(text(b.batch), undefined, { numeric: true });
        if (batchSort) return batchSort;
        return text(a.enrollmentno || a.student).localeCompare(text(b.enrollmentno || b.student), undefined, { numeric: true });
      })
      .map((student, index) => ({ ...student, serial: index + 1 }));

    const totals = courses.map((course) => {
      const key = text(course.coursecode) || text(course.course);
      const components = {};
      (course.components || defaultRollListComponents).forEach((component) => {
        components[component] = students.filter((student) => student.courses[key]?.[component]).length;
      });
      return {
        coursecode: course.coursecode,
        components,
        sectionA: components["Section-A"] || 0,
        sectionB: components["Section-B"] || 0,
        practical: components.Pr || 0
      };
    });

    const institution = await InsDetails.findOne({ colid }).sort({ _id: -1 }).lean();
    const first = rows[0] || {};
    const exam = first.exam || "";
    const examMaster = first.examcode ? await ConductExam.findOne({ colid, examcode: first.examcode }).lean() : null;
    const header = {
      institutionname: text(institution?.institutionname) || "Institution",
      address: text(institution?.address),
      logolink: text(institution?.logolink),
      examName: text(exam || examMaster?.examname),
      institute: text(req.query.institute || institution?.institutionname),
      examCentre: text(req.query.examCentre || req.query.examcentre),
      course: text(first.program || first.programcode),
      year: yearLabelFromSemester(first.semester),
      status: text(req.query.statusLabel || examMaster?.type || "Main")
    };

    const optionRows = await ConductExamRoll.find({ colid }).select(rollListFilterFields.join(" ")).lean();
    const optionRegnos = uniq(optionRows.map((row) => row.regno));
    const optionUsers = optionRegnos.length
      ? await User.find({ colid, regno: { $in: optionRegnos } }).select("admissionyear academicyear").lean()
      : [];
    const batchOptions = uniq(optionUsers.map((user) => user.admissionyear || user.academicyear));
    res.json({
      success: true,
      header,
      courses,
      students,
      totals,
      options: { ...rollListOptionsFromRows(optionRows), batch: batchOptions, admissionyear: batchOptions },
      summary: {
        studentCount: students.length,
        courseCount: courses.length,
        theoryTotal: totals.reduce((sum, item) => sum + item.sectionA + item.sectionB, 0),
        practicalTotal: totals.reduce((sum, item) => sum + item.practical, 0)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.generateExamRolls = async (req, res) => {
  try {
    const selectedCourses = Array.isArray(req.body.courses) ? req.body.courses : [];
    if (!selectedCourses.length) return res.status(400).json({ success: false, message: "Select at least one course" });
    const base = {
      colid: number(req.body.colid),
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      exam: text(req.body.exam),
      examcode: text(req.body.examcode),
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      type: text(req.body.type),
      subject: text(req.body.subject),
      semester: text(req.body.semester),
      user: text(req.body.user)
    };
    if (base.colid === undefined || !base.academicyear || !base.regulation || !base.exam || !base.examcode || !base.programcode || !base.type || !base.semester) {
      return res.status(400).json({ success: false, message: "Exam, regulation, program, type and semester are required" });
    }
    const studentFilter = {
      colid: base.colid,
      academicyear: base.academicyear,
      programcode: base.programcode,
      semester: base.semester,
      role: /^student$/i
    };
    if (base.type === "Major") studentFilter.Major = base.subject;
    if (base.type === "Minor") studentFilter.Minor = base.subject;
    const students = await User.find(studentFilter).select("name regno email phone section program programcode").lean();
    let saved = 0;
    const errors = [];
    for (const course of selectedCourses) {
      for (const student of students) {
        const payload = rollPayload({
          ...base,
          course: course.course,
          coursecode: course.coursecode,
          examdate: course.examdate,
          examslot: course.examslot,
          student: student.name,
          regno: student.regno,
          email: student.email,
          phone: student.phone,
          section: student.section,
          program: base.program || student.program,
          applied: "Yes",
          admitcardeligible: "Yes",
          attended: "No"
        });
        const error = validateRoll(payload);
        if (error) {
          errors.push({ regno: student.regno, coursecode: course.coursecode, message: error });
          continue;
        }
        const data = await ConductExamRoll.findOneAndUpdate(
          { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, examcode: payload.examcode, programcode: payload.programcode, semester: payload.semester, coursecode: payload.coursecode, regno: payload.regno },
          payload,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (data && !data.examseatno) {
          await ConductExamRoll.updateOne({ _id: data._id }, { $set: { examseatno: String(data._id) } });
        }
        saved += 1;
      }
    }
    res.json({ success: true, saved, studentCount: students.length, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveExamRoll = async (req, res) => {
  try {
    const payload = rollPayload(req.body);
    const error = validateRoll(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ConductExamRoll.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await ConductExamRoll.create(payload);
    if (data && !data.examseatno) {
      data.examseatno = String(data._id);
      await data.save();
    }
    res.json({ success: true, data });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: "This student is already added for the selected course" });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteExamRoll = async (req, res) => {
  try {
    await ConductExamRoll.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteExamRollsBulk = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one exam roll entry" });
    const result = await ConductExamRoll.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkExamRolls = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const payload = rollPayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user || items[index].user });
      const error = validateRoll(payload);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      const data = await ConductExamRoll.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, regulation: payload.regulation, examcode: payload.examcode, programcode: payload.programcode, semester: payload.semester, coursecode: payload.coursecode, regno: payload.regno },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (data && !data.examseatno) {
        await ConductExamRoll.updateOne({ _id: data._id }, { $set: { examseatno: String(data._id) } });
      }
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudentExamRegistration = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const regno = text(req.query.regno);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    const filter = { colid, regno };
    ["academicyear", "exam", "examcode"].forEach((field) => {
      if (text(req.query[field])) filter[field] = text(req.query[field]);
    });
    const rows = await ConductExamRoll.find(filter).sort({ academicyear: -1, exam: 1, semester: 1, course: 1 }).lean();
    const allRows = await ConductExamRoll.find({ colid, regno }).select("academicyear exam examcode").lean();
    const exams = uniq(allRows.map((row) => `${row.academicyear}||${row.examcode}||${row.exam}`)).map((value) => {
      const [academicyear, examcode, exam] = value.split("||");
      return { academicyear, examcode, exam };
    });
    res.json({
      success: true,
      data: rows,
      options: {
        academicyears: uniq(allRows.map((row) => row.academicyear)),
        exams
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveStudentExamRegistration = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const regno = text(req.body.regno);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    if (!items.length) return res.status(400).json({ success: false, message: "No courses selected for update" });
    const ops = items
      .filter((item) => item.id)
      .map((item) => ({
        updateOne: {
          filter: { _id: item.id, colid, regno },
          update: { $set: { applied: text(item.applied) === "Yes" ? "Yes" : "No", user: text(req.body.user) } }
        }
      }));
    if (!ops.length) return res.status(400).json({ success: false, message: "No valid exam registration rows selected" });
    const result = await ConductExamRoll.bulkWrite(ops);
    const rows = await ConductExamRoll.find({ colid, regno, _id: { $in: items.map((item) => item.id).filter(Boolean) } }).sort({ semester: 1, course: 1 }).lean();
    res.json({ success: true, updated: result.modifiedCount || 0, data: rows, message: "Exam registration updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getInvigilatorStudentAttendanceOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const invigilatoremail = text(req.query.invigilatoremail || req.query.user || req.query.email);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!invigilatoremail) return res.status(400).json({ success: false, message: "invigilator email is required" });
    const allocations = await ConductExamInvigilatorAllocation.find({
      colid,
      invigilatoremail: new RegExp(`^${invigilatoremail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    }).sort({ academicyear: -1, examdate: 1, slot: 1, campus: 1, building: 1, room: 1 }).lean();
    res.json({
      success: true,
      allocations,
      academicyears: uniq(allocations.map((row) => row.academicyear)),
      exams: uniq(allocations.map((row) => `${row.examcode}||${row.exam}`)).map((value) => {
        const [examcode, exam] = value.split("||");
        return { examcode, exam };
      }),
      examdates: uniq(allocations.map((row) => row.examdate)),
      slots: uniq(allocations.map((row) => row.slot)),
      rooms: allocations.map((row) => ({
        campus: row.campus,
        building: row.building,
        room: row.room,
        examdate: row.examdate,
        slot: row.slot,
        academicyear: row.academicyear,
        exam: row.exam,
        examcode: row.examcode
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getInvigilatorRoomStudents = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const invigilatoremail = text(req.query.invigilatoremail || req.query.user || req.query.email);
    const academicyear = text(req.query.academicyear);
    const examcode = text(req.query.examcode);
    const examdate = text(req.query.examdate);
    const slot = text(req.query.slot);
    const campus = text(req.query.campus);
    const building = text(req.query.building);
    const room = text(req.query.room);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!invigilatoremail || !academicyear || !examcode || !examdate || !slot || !room) {
      return res.status(400).json({ success: false, message: "Invigilator, academic year, exam, date, slot and room are required" });
    }
    const allocationFilter = {
      colid,
      academicyear,
      examcode,
      examdate,
      slot,
      room,
      invigilatoremail: new RegExp(`^${invigilatoremail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    };
    if (campus) allocationFilter.campus = campus;
    if (building) allocationFilter.building = building;
    const allocation = await ConductExamInvigilatorAllocation.findOne(allocationFilter).lean();
    if (!allocation) return res.status(403).json({ success: false, message: "No invigilation allocation found for this room, date and slot." });
    const filter = {
      colid,
      academicyear,
      examcode,
      examdate,
      examslot: slot,
      examroom: room
    };
    if (campus) filter.campus = campus;
    if (building) filter.building = building;
    const data = await ConductExamRoll.find(filter).sort({ seatno: 1, student: 1, regno: 1, course: 1 }).lean();
    res.json({ success: true, data, allocation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markExamRollAttendance = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const attended = text(req.body.attended);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    if (!["Yes", "No"].includes(attended)) return res.status(400).json({ success: false, message: "Attendance must be Yes or No" });
    const result = await ConductExamRoll.updateMany(
      { colid, _id: { $in: ids } },
      { $set: { attended, user: text(req.body.user) } }
    );
    res.json({ success: true, updated: result.modifiedCount || result.nModified || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.allocateExamSeats = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const examcode = text(req.body.examcode);
    const examdate = text(req.body.examdate);
    const examslot = text(req.body.examslot);
    const roomIds = Array.isArray(req.body.roomIds) ? req.body.roomIds.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!examcode || !examdate || !examslot) return res.status(400).json({ success: false, message: "Exam, exam date and slot are required" });
    if (!roomIds.length) return res.status(400).json({ success: false, message: "Select at least one room" });

    const rooms = await ConductExamRoom.find({ _id: { $in: roomIds }, colid, status: "Approved" }).sort({ campus: 1, building: 1, room: 1 }).lean();
    if (!rooms.length) return res.status(400).json({ success: false, message: "No valid rooms found" });

    const rolls = await ConductExamRoll.find({
      colid,
      examcode,
      examdate,
      examslot,
      applied: "Yes",
      admitcardeligible: "Yes"
    }).sort({ coursecode: 1, regno: 1 }).lean();
    if (!rolls.length) return res.status(400).json({ success: false, message: "No eligible exam roll entries found for the selected slot" });

    const totalSeats = rooms.reduce((sum, room) => sum + (Number(room.noofseats) || 0), 0);
    if (totalSeats < rolls.length) {
      return res.status(400).json({ success: false, message: `Selected rooms have ${totalSeats} seats, but ${rolls.length} students need seats.` });
    }

    const remaining = shuffle(rolls);
    const allocations = [];
    let unavoidableAdjacent = 0;

    for (const room of rooms) {
      const seatCount = Number(room.noofseats) || 0;
      let previousCourse = "";
      for (let seatIndex = 1; seatIndex <= seatCount && remaining.length; seatIndex += 1) {
        const candidate = pickSeatCandidate(remaining, previousCourse);
        if (!candidate) break;
        if (previousCourse && candidate.coursecode === previousCourse) unavoidableAdjacent += 1;
        const poolIndex = remaining.findIndex((row) => String(row._id) === String(candidate._id));
        if (poolIndex >= 0) remaining.splice(poolIndex, 1);
        allocations.push({
          ...candidate,
          campus: room.campus,
          building: room.building,
          examroom: room.room,
          seatno: `Seat ${seatIndex}`
        });
        previousCourse = candidate.coursecode;
      }
    }

    await ConductExamRoll.bulkWrite(allocations.map((row) => ({
      updateOne: {
        filter: { _id: row._id, colid },
        update: { $set: { campus: row.campus, building: row.building, examroom: row.examroom, seatno: row.seatno } }
      }
    })));

    res.json({
      success: true,
      allocated: allocations.length,
      totalStudents: rolls.length,
      totalSeats,
      unavoidableAdjacent,
      data: allocations
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
