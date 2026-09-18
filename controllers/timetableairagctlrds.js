const crypto = require("crypto");
const multer = require("multer");
const XLSX = require("xlsx");
const Batch = require("../Models/timetableaitrainingbatchds");
const Generated = require("../Models/timetableaigeneratedds");
const EpaathsalaAiConfiguration = require("../Models/epaathsalaaiconfigurationds");
const MPrograms = require("../Models/mprograms");
const User = require("../Models/user");
const WorkloadAssignment = require("../Models/workloadassignmentds");
const ProgramPeriodSlot = require("../Models/programperiodslotds");
const RoomResource = require("../Models/roomresourceds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const NepLmsTimetable = require("../Models/neplmstimetableds");

const upload = multer({ storage: multer.memoryStorage() });
exports.uploadMiddleware = upload.single("file");

const requiredSheets = ["Programs", "Faculties", "Rooms", "Courses", "Sections", "Section_Courses", "Timeslots", "Availability"];
const trainingSheets = [...requiredSheets, "Historical_Schedule"];
const text = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toColid = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(esc(value), "i");
const uniq = (items) => [...new Set((items || []).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dayCode = (value) => text(value).slice(0, 3).toUpperCase();
const asBool = (value) => typeof value === "boolean" ? value : ["1", "true", "yes", "y"].includes(text(value).toLowerCase());
const startOfDay = (value) => {
  const date = new Date(`${text(value)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const dateOnly = (date) => {
  const d = date instanceof Date ? date : startOfDay(date);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const pad2 = (value) => String(value).padStart(2, "0");
const timezoneOffsetMinutes = (timezone, utcDate) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(utcDate).reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
    const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second || 0));
    return (localAsUtc - utcDate.getTime()) / 60000;
  } catch (error) {
    return 0;
  }
};
const zonedDateTimeToUtcFields = (classdate, classtime, timezone) => {
  const dateText = text(classdate);
  const timeText = text(classtime);
  const zone = text(timezone) || "UTC";
  if (!dateText || !timeText || zone === "UTC") return { classdate: dateText, classtime: timeText };
  const [year, month, day] = dateText.split("-").map(Number);
  const [hour = 0, minute = 0] = timeText.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return { classdate: dateText, classtime: timeText };
  const guessedUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = timezoneOffsetMinutes(zone, guessedUtc);
  const utc = new Date(guessedUtc.getTime() - offset * 60000);
  return {
    classdate: `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`,
    classtime: `${pad2(utc.getUTCHours())}:${pad2(utc.getUTCMinutes())}`
  };
};
const weekday = (date) => dayOrder[((date instanceof Date ? date : startOfDay(date))?.getDay?.() || 0) - 1] || "Sunday";
const datesForDay = (from, to, day) => {
  const start = startOfDay(from);
  const end = startOfDay(to || from);
  if (!start || !end || start > end) return [];
  const rows = [];
  const target = text(day).toLowerCase();
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (weekday(cursor).toLowerCase() === target) rows.push(dateOnly(cursor));
  }
  return rows;
};
const timeToMinutes = (value) => {
  const [h, m] = text(value).slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};
const durationMinutes = (start, end) => Math.max(0, timeToMinutes(end) - timeToMinutes(start));
const readWorkbook = (buffer) => XLSX.read(buffer, { type: "buffer", cellDates: true });
const sheetRows = (workbook, sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }).filter((row) => Object.values(row).some((value) => text(value)));
};
const buildRagUrl = (server, endpoint, query = "") => `${text(server).replace(/\/+$/, "")}${endpoint}${query}`;
const detailToMessage = (detail, fallback) => {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === "string") return item;
      const loc = Array.isArray(item?.loc) ? item.loc.join(".") : text(item?.loc);
      const msg = text(item?.msg || item?.message || item?.error);
      const type = text(item?.type);
      return [loc, msg, type].filter(Boolean).join(": ");
    }).filter(Boolean).join("; ") || JSON.stringify(detail);
  }
  if (typeof detail === "object") return detail.message || detail.error || JSON.stringify(detail);
  return text(detail) || fallback;
};
const ragHeaders = (config, extra = {}) => {
  const headers = { ...extra };
  if (config?.xapikey) headers["X-Admin-Key"] = config.xapikey;
  return headers;
};
const resolveRagConfig = async (colid, providedServer = "") => {
  const server = text(providedServer);
  if (server) {
    const configured = await EpaathsalaAiConfiguration.findOne({ colid, server, active: "Yes" }).lean();
    return { server, xapikey: configured?.xapikey || "" };
  }
  const configured = await EpaathsalaAiConfiguration.findOne({ colid, active: "Yes", default: "Yes" }).lean()
    || await EpaathsalaAiConfiguration.findOne({ colid, active: "Yes" }).lean();
  return { server: configured?.server || "", xapikey: configured?.xapikey || "" };
};
async function callRagRetrain({ colid, ragserver, file, mode }) {
  const config = await resolveRagConfig(colid, ragserver);
  if (!config.server) throw new Error("Configure an active Epaathsala AI server in Settings > Epaathsala AI.");
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: file.mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), file.originalname || "timetable_training.xlsx");
  const response = await fetch(buildRagUrl(config.server, "/model/retrain", `?mode=${encodeURIComponent(mode)}`), { method: "POST", headers: ragHeaders(config), body: form });
  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
  if (!response.ok) throw new Error(detailToMessage(body?.detail || body?.message || body?.error, `Timetable training failed with status ${response.status}`));
  return { config, body };
}
async function callRagGenerate({ colid, ragserver, request }) {
  const config = await resolveRagConfig(colid, ragserver);
  if (!config.server) throw new Error("Configure an active Epaathsala AI server in Settings > Epaathsala AI.");
  const response = await fetch(buildRagUrl(config.server, "/generate"), {
    method: "POST",
    headers: ragHeaders(config, { "Content-Type": "application/json", Accept: "application/json" }),
    body: JSON.stringify(request)
  });
  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
  if (!response.ok) throw new Error(detailToMessage(body?.detail || body?.message || body?.error, `Timetable generation failed with status ${response.status}`));
  return { config, body };
}
const normalizeRoomType = (value) => /lab|practical/i.test(text(value)) ? "lab" : "classroom";
const sectionId = (row) => [row.programcode, `S${row.semester || ""}`, row.section || "A"].map((x) => text(x).replace(/\s+/g, "")).join("-");
const slotId = (period) => `${text(period.programcode)}-${dayCode(period.dayofweek)}-${text(period.periodname || period.order || "1").replace(/\s+/g, "")}`;
const periodOrder = (period, index = 0) => {
  const fromOrder = num(period.order, NaN);
  const fromName = num(text(period.periodname).replace(/\D/g, ""), NaN);
  const value = Number.isFinite(fromOrder) ? fromOrder : Number.isFinite(fromName) ? fromName : index + 1;
  return Math.max(1, Math.round(value));
};

exports.options = async (req, res) => {
  try {
    const colid = toColid(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [workloads, periods, programs] = await Promise.all([
      WorkloadAssignment.find({ colid }).select("academicyear regulation program programcode semester").limit(5000).lean(),
      ProgramPeriodSlot.find({ colid }).select("academicyear program programcode").limit(5000).lean(),
      MPrograms.find({ colid }).select("program programcode year").limit(5000).lean()
    ]);
    const all = [...workloads, ...periods, ...programs];
    res.json({
      success: true,
      academicyears: uniq(all.map((x) => x.academicyear || x.year)),
      regulations: uniq(workloads.map((x) => x.regulation)),
      programs: uniq(all.map((x) => x.program)),
      programcodes: uniq(all.map((x) => x.programcode)),
      semesters: uniq(workloads.map((x) => x.semester))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.train = async (req, res) => {
  try {
    const colid = toColid(req.body.colid);
    const mode = text(req.body.mode).toLowerCase() === "reset" ? "reset" : "append";
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.file?.buffer) return res.status(400).json({ success: false, message: "Select an Excel training file" });
    const workbook = readWorkbook(req.file.buffer);
    const missing = trainingSheets.filter((name) => !workbook.Sheets[name]);
    if (missing.length) return res.status(400).json({ success: false, message: `Missing sheets: ${missing.join(", ")}` });
    const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const existing = await Batch.findOne({ colid, sha256 }).lean();
    if (existing && mode !== "reset") return res.json({ success: true, skipped: true, message: "This workbook was already trained", summary: existing });
    const ragResult = await callRagRetrain({ colid, ragserver: req.body.ragserver, file: req.file, mode });
    if (mode === "reset") await Batch.deleteMany({ colid });
    const counts = Object.fromEntries(trainingSheets.map((sheet) => [sheet, sheetRows(workbook, sheet).length]));
    const batch = await Batch.create({
      colid,
      batchid: `TT-AI-${colid}-${Date.now()}`,
      filename: req.file.originalname || "",
      sha256,
      mode,
      programs: counts.Programs || 0,
      faculties: counts.Faculties || 0,
      rooms: counts.Rooms || 0,
      courses: counts.Courses || 0,
      sections: counts.Sections || 0,
      section_courses: counts.Section_Courses || 0,
      timeslots: counts.Timeslots || 0,
      historical_schedule: counts.Historical_Schedule || 0,
      new_examples: num(ragResult.body?.new_examples),
      total_examples: num(ragResult.body?.total_examples),
      total_batches: num(ragResult.body?.total_batches),
      holdout_accuracy: ragResult.body?.holdout_accuracy,
      ragserver: ragResult.config.server,
      ragstatus: ragResult.body?.status || "trained",
      name: text(req.body.name),
      user: text(req.body.user)
    });
    res.json({ success: true, summary: batch, remote: ragResult.body, progress: [{ label: "Workbook validated", value: 25 }, { label: "RAG server trained", value: 80 }, { label: "Training logged", value: 100 }] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.batches = async (req, res) => {
  try {
    const colid = toColid(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await Batch.find({ colid }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.deleteBatches = async (req, res) => {
  try {
    const colid = toColid(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    await Batch.deleteMany({ colid, _id: { $in: req.body.ids || [] } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function buildRequestFromModels({ colid, academicyear, regulation, programcodes, semesters, seed = 42 }) {
  const programList = Array.isArray(programcodes) ? programcodes.map(text).filter(Boolean) : text(programcodes).split(",").map(text).filter(Boolean);
  const semesterList = Array.isArray(semesters) ? semesters.map(text).filter(Boolean) : text(semesters).split(",").map(text).filter(Boolean);
  const query = { colid };
  if (text(academicyear)) query.academicyear = text(academicyear);
  if (text(regulation)) query.regulation = text(regulation);
  if (programList.length) query.programcode = { $in: programList };
  if (semesterList.length) query.semester = { $in: semesterList };
  const [workloads, courseMap, periodRows, roomRows, studentRows, existingTimetable, programRows] = await Promise.all([
    WorkloadAssignment.find(query).lean(),
    RegulationCourseMap.find(query).lean(),
    ProgramPeriodSlot.find({ colid, academicyear: text(academicyear), ...(programList.length ? { programcode: { $in: programList } } : {}) }).sort({ programcode: 1, dayofweek: 1, starttime: 1 }).lean(),
    RoomResource.find({ colid }).lean(),
    User.find({ colid, role: /^Student$/i, ...(text(academicyear) ? { academicyear: text(academicyear) } : {}), ...(programList.length ? { programcode: { $in: programList } } : {}), ...(semesterList.length ? { semester: { $in: semesterList } } : {}) }).lean(),
    NepLmsTimetable.find(query).sort({ classdate: 1 }).limit(2000).lean(),
    MPrograms.find({ colid, ...(programList.length ? { programcode: { $in: programList } } : {}) }).lean()
  ]);
  if (!workloads.length) throw new Error("No workload found for selected filters");
  if (!periodRows.length) throw new Error("No period slots found for selected academic year/program");
  const programByCode = new Map(programRows.map((row) => [text(row.programcode), row]));
  const programs = uniq(workloads.map((row) => row.programcode)).map((code) => ({ program_id: code, program_name: programByCode.get(code)?.program || workloads.find((row) => text(row.programcode) === code)?.program || code }));
  const faculties = [...new Map(workloads.map((row) => [text(row.facultyemail || row.facultyname), row])).values()].map((row) => ({
    faculty_id: text(row.facultyemail || row.facultyname),
    faculty_name: text(row.facultyname || row.facultyemail),
    max_weekly_slots: Math.max(6, num(row.max_weekly_slots, 18)),
    max_daily_slots: Math.max(2, num(row.max_daily_slots, 6))
  }));
  const courseSource = courseMap.length ? courseMap : workloads;
  const courses = [...new Map(courseSource.map((row) => [text(row.coursecode), row])).values()].map((row) => ({
    course_id: text(row.coursecode),
    course_name: text(row.course),
    required_room_type: normalizeRoomType(row.coursetype)
  })).filter((row) => row.course_id);
  const studentGroups = new Map();
  studentRows.forEach((row) => {
    const key = [row.programcode, row.semester, row.section || "A"].map(text).join("|");
    if (!studentGroups.has(key)) studentGroups.set(key, { programcode: text(row.programcode), program: text(row.program), semester: text(row.semester), section: text(row.section || "A"), count: 0 });
    studentGroups.get(key).count += 1;
  });
  if (!studentGroups.size) {
    workloads.forEach((row) => {
      const key = [row.programcode, row.semester, "A"].map(text).join("|");
      if (!studentGroups.has(key)) studentGroups.set(key, { programcode: text(row.programcode), program: text(row.program), semester: text(row.semester), section: "A", count: 40 });
    });
  }
  const sections = [...studentGroups.values()].map((row) => ({
    section_id: sectionId(row),
    section_name: `${row.program || row.programcode} Sem ${row.semester} - ${row.section}`,
    program_id: row.programcode,
    semester: num(row.semester, 1),
    student_count: row.count || 40
  }));
  const sectionLookup = new Map(sections.map((row) => [`${row.program_id}|${row.semester}|${text(row.section_id).split("-").at(-1)}`, row.section_id]));
  const sectionCourses = [];
  workloads.forEach((row) => {
    const sectionMatches = sections.filter((section) => section.program_id === text(row.programcode) && String(section.semester) === String(num(row.semester, 1)));
    (sectionMatches.length ? sectionMatches : [null]).forEach((section) => sectionCourses.push({
      section_id: section?.section_id || sectionId({ ...row, section: "A" }),
      course_id: text(row.coursecode),
      faculty_id: text(row.facultyemail || row.facultyname),
      sessions_per_week: Math.max(1, Math.round(num(row.hoursperweek, 1))),
      duration_slots: 1
    }));
  });
  const assignmentsBySection = new Map();
  sectionCourses.forEach((assignment) => {
    const list = assignmentsBySection.get(assignment.section_id) || [];
    list.push(assignment);
    assignmentsBySection.set(assignment.section_id, list);
  });
  const sectionsWithAssignments = sections.map((section) => ({
    ...section,
    course_assignments: assignmentsBySection.get(section.section_id) || []
  }));
  const rooms = roomRows.map((room) => ({
    room_id: text(room._id),
    room_name: [room.campus, room.building, room.floor, room.roomno].map(text).filter(Boolean).join(" / ") || text(room.roomno || room._id),
    capacity: num(room.capacity, 40),
    room_type: normalizeRoomType(room.type)
  }));
  if (!rooms.length) rooms.push({ room_id: "DEFAULT-ROOM", room_name: "Default Classroom", capacity: 60, room_type: "classroom" });
  const timeslots = periodRows.map((period, index) => ({
    slot_id: slotId(period),
    program_id: text(period.programcode),
    day: text(period.dayofweek),
    start_time: text(period.starttime).slice(0, 5),
    end_time: text(period.endtime).slice(0, 5),
    order: periodOrder(period, index)
  }));
  const availability = [];
  const slotByProgramDayTime = new Map(timeslots.map((slot) => [`${slot.program_id}|${slot.day}|${slot.start_time}`, slot.slot_id]));
  const historical_schedule = existingTimetable.map((row, index) => {
    const day = weekday(row.classdate);
    const slot = slotByProgramDayTime.get(`${text(row.programcode)}|${day}|${text(row.classtime).slice(0, 5)}`) || slotId({ programcode: row.programcode, dayofweek: day, periodname: row.period || index + 1 });
    return {
      record_id: `ERP-${index + 1}`,
      year: text(row.academicyear || academicyear),
      program_id: text(row.programcode),
      semester: num(row.semester, 1),
      section_id: sectionId({ ...row, section: row.section || "A" }),
      course_id: text(row.coursecode),
      faculty_id: text(row.facultyemail || row.faculty),
      room_id: text(row.roomid || "DEFAULT-ROOM"),
      slot_id: slot,
      satisfaction_rating: 4
    };
  }).filter((row) => row.program_id && row.course_id && row.faculty_id && row.slot_id);
  return { programs, faculties, rooms, courses, sections: sectionsWithAssignments, section_courses: sectionCourses, timeslots, availability, historical_schedule, seed: num(seed, 42) };
}

const firstArray = (...values) => values.find((value) => Array.isArray(value)) || [];

const expandRows = ({ timetable, startdate, enddate, academicyear, regulation }) => {
  const rows = [];
  (timetable || []).forEach((row) => {
    const dates = datesForDay(startdate, enddate, row.day);
    dates.forEach((classdate) => rows.push({
      academicyear,
      regulation,
      program: row.program_name || row.program || row.program_id,
      programcode: row.program_id,
      faculty: row.faculty_name,
      facultyemail: row.faculty_id,
      roomid: row.room_id,
      roomno: row.room_name,
      semester: String(row.semester || ""),
      section: text(row.section_name).split("-").pop()?.trim() || "",
      course: row.course_name,
      coursecode: row.course_id,
      classdate,
      classtime: row.start_time,
      period: row.slot_id,
      durationminutes: durationMinutes(row.start_time, row.end_time),
      lecturetype: "Theory",
      status: "Active"
    }));
  });
  return rows;
};

const buildConstraintGuide = (request, responseBody = {}) => {
  const tips = [];
  const requiredSlots = (request.sections || []).reduce((sum, section) => sum + (section.course_assignments || []).reduce((inner, item) => inner + Math.max(1, num(item.sessions_per_week, 1)) * Math.max(1, num(item.duration_slots, 1)), 0), 0);
  const slotCountByProgram = new Map();
  (request.timeslots || []).forEach((slot) => slotCountByProgram.set(slot.program_id, (slotCountByProgram.get(slot.program_id) || 0) + 1));
  const facultyLoad = new Map();
  (request.sections || []).forEach((section) => (section.course_assignments || []).forEach((item) => {
    facultyLoad.set(item.faculty_id, (facultyLoad.get(item.faculty_id) || 0) + Math.max(1, num(item.sessions_per_week, 1)) * Math.max(1, num(item.duration_slots, 1)));
  }));
  const facultyLimit = new Map((request.faculties || []).map((faculty) => [faculty.faculty_id, num(faculty.max_weekly_slots, 18)]));
  const overloaded = [...facultyLoad.entries()].filter(([faculty, load]) => load > (facultyLimit.get(faculty) || 18)).slice(0, 5);
  const noSlots = (request.programs || []).filter((program) => !slotCountByProgram.get(program.program_id)).map((program) => program.program_name || program.program_id).slice(0, 5);
  const sectionsWithoutCourses = (request.sections || []).filter((section) => !(section.course_assignments || []).length).map((section) => section.section_name || section.section_id).slice(0, 5);
  const roomTypes = new Map();
  (request.rooms || []).forEach((room) => roomTypes.set(room.room_type || "classroom", (roomTypes.get(room.room_type || "classroom") || 0) + 1));
  const missingRoomTypes = [...new Set((request.courses || []).map((course) => course.required_room_type || "classroom"))].filter((type) => !roomTypes.get(type));
  const roomCapacityIssues = (request.sections || []).filter((section) => !(request.rooms || []).some((room) => num(room.capacity, 0) >= num(section.student_count, 0))).map((section) => `${section.section_name || section.section_id} (${section.student_count})`).slice(0, 5);
  const unavailable = (request.availability || []).filter((row) => row.available === false).length;
  if (requiredSlots) tips.push(`Required teaching slots: ${requiredSlots}; available period rows sent: ${(request.timeslots || []).length}. Add more periods if required slots are too high for the week.`);
  if (noSlots.length) tips.push(`No period slots found for: ${noSlots.join(", ")}.`);
  if (sectionsWithoutCourses.length) tips.push(`Sections without course assignments: ${sectionsWithoutCourses.join(", ")}.`);
  if (overloaded.length) tips.push(`Faculty weekly load exceeds limit: ${overloaded.map(([faculty, load]) => `${faculty} needs ${load}, limit ${facultyLimit.get(faculty) || 18}`).join("; ")}.`);
  if (missingRoomTypes.length) tips.push(`Missing room type(s): ${missingRoomTypes.join(", ")}. Add matching rooms or change course room type.`);
  if (roomCapacityIssues.length) tips.push(`No room capacity is enough for: ${roomCapacityIssues.join(", ")}.`);
  if (unavailable) tips.push(`${unavailable} availability blocks were sent. Too many blocked faculty/room/section slots can make the timetable infeasible.`);
  if (Array.isArray(responseBody.unscheduled) && responseBody.unscheduled.length) tips.push(`Unscheduled details: ${detailToMessage(responseBody.unscheduled.slice(0, 8), "")}`);
  tips.push("Quick fixes: increase period slots, reduce sessions per week in workload, increase faculty max weekly slots, add rooms with required type/capacity, or remove conflicting availability blocks.");
  return tips.join(" ");
};

exports.generateFromModels = async (req, res) => {
  try {
    const colid = toColid(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const request = await buildRequestFromModels({ colid, ...req.body });
    const { section_courses, ...ragRequest } = request;
    const ragResult = await callRagGenerate({ colid, ragserver: req.body.ragserver, request: ragRequest });
    const body = ragResult.body?.data || ragResult.body?.result || ragResult.body || {};
    const timetable = firstArray(body.timetable, body.generated_timetable, body.Generated_Timetable, body.schedule);
    if (!timetable.length && body.status && text(body.status).toLowerCase() !== "success") {
      const reason = detailToMessage(body.message || body.detail || body.unscheduled, "Timetable AI could not schedule the selected data");
      throw new Error(`${reason}. Guide: ${buildConstraintGuide(request, body)}`);
    }
    const expandedrows = expandRows({ timetable, startdate: req.body.startdate, enddate: req.body.enddate, academicyear: req.body.academicyear, regulation: req.body.regulation });
    const generated = await Generated.create({
      colid,
      generationid: `TTGEN-${colid}-${Date.now()}`,
      academicyear: req.body.academicyear,
      regulation: req.body.regulation,
      programcodes: Array.isArray(req.body.programcodes) ? req.body.programcodes : text(req.body.programcodes).split(",").map(text).filter(Boolean),
      semesters: Array.isArray(req.body.semesters) ? req.body.semesters : text(req.body.semesters).split(",").map(text).filter(Boolean),
      startdate: req.body.startdate,
      enddate: req.body.enddate,
      quality_score: body.quality_score,
      timetable,
      expandedrows,
      faculty_workload: firstArray(body.faculty_workload, body.workload, body.Faculty_Workload),
      unscheduled: firstArray(body.unscheduled, body.warnings, body.errors),
      request_json: request,
      ragserver: ragResult.config.server,
      name: text(req.body.name),
      user: text(req.body.user)
    });
    res.json({ success: true, data: generated, requestSummary: { programs: request.programs.length, sections: request.sections.length, section_courses: section_courses.length, timeslots: request.timeslots.length, rooms: request.rooms.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generated = async (req, res) => {
  try {
    const colid = toColid(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await Generated.find({ colid }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.confirm = async (req, res) => {
  try {
    const colid = toColid(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const generated = await Generated.findOne({ colid, _id: req.body.id }).lean();
    if (!generated) return res.status(404).json({ success: false, message: "Generated timetable not found" });
    const defaultTimezone = text(req.body.timezone) || "Asia/Kolkata";
    const rows = (generated.expandedrows || []).map((row) => {
      const timezone = text(row.timezone) || defaultTimezone;
      const localclassdate = text(row.localclassdate || row.classdate);
      const localclasstime = text(row.localclasstime || row.classtime);
      const adjusted = zonedDateTimeToUtcFields(localclassdate, localclasstime, timezone);
      return {
        ...row,
        timezone,
        localclassdate,
        localclasstime,
        classdate: adjusted.classdate,
        classtime: adjusted.classtime,
        colid,
        user: text(req.body.user)
      };
    });
    if (!rows.length) return res.status(400).json({ success: false, message: "No timetable rows available to insert" });
    await NepLmsTimetable.insertMany(rows, { ordered: false });
    await Generated.updateOne({ _id: generated._id, colid }, { $set: { status: "Inserted", insertedcount: rows.length } });
    res.json({ success: true, inserted: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
