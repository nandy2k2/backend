const WorkloadAssignment = require("../Models/workloadassignmentds");
const ProgramPeriodSlot = require("../Models/programperiodslotds");
const FacultyAvailability = require("../Models/facultyavailabilityds");
const NepLmsTimetable = require("../Models/neplmstimetableds");
const RoomResource = require("../Models/roomresourceds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const text = (value) => String(value || "").trim();
const norm = (value) => text(value).toLowerCase();
const uniq = (items) => [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const parseDate = (value) => {
  const date = new Date(`${text(value)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateToInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const datesBetween = (start, end) => {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to || from > to) return [];
  const dates = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    dates.push({
      date: dateToInput(cursor),
      dayofweek: weekdayNames[cursor.getDay()]
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const timeToMinutes = (value) => {
  const [h, m] = text(value).split(":").map((item) => Number(item));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

const overlaps = (aStart, aEnd, bStart, bEnd) => timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);

const durationMinutes = (start, end) => Math.max(0, timeToMinutes(end) - timeToMinutes(start));
const minutesToTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const addMinutes = (start, minutes) => minutesToTime(timeToMinutes(start) + Number(minutes || 0));

const workloadSessions = (rows) => {
  const sessions = [];
  rows.forEach((row) => {
    const count = Math.max(1, Math.round(Number(row.hoursperweek || 0) || 1));
    for (let i = 0; i < count; i += 1) sessions.push({ ...row, sessionNumber: i + 1, sessionCount: count });
  });
  return sessions;
};

const buildSlots = ({ dates, periods }) => {
  const slots = [];
  dates.forEach((day) => {
    periods
      .filter((period) => norm(period.dayofweek) === norm(day.dayofweek))
      .forEach((period) => {
        slots.push({
          date: day.date,
          dayofweek: day.dayofweek,
          academicyear: period.academicyear,
          program: period.program,
          programcode: period.programcode,
          period: period.periodname,
          starttime: period.starttime,
          endtime: period.endtime
        });
      });
  });
  return slots.sort((a, b) => `${a.date} ${a.starttime} ${a.programcode}`.localeCompare(`${b.date} ${b.starttime} ${b.programcode}`));
};

const isFacultyUnavailable = (slot, facultyemail, availability) => availability.some((item) => (
  norm(item.facultyemail) === norm(facultyemail)
  && norm(item.dayofweek) === norm(slot.dayofweek)
  && overlaps(slot.starttime, slot.endtime, item.starttime, item.endtime)
));

const roomKey = (room = {}) => text(room.roomid || room._id || `${room.campus}|${room.building}|${room.floor}|${room.roomno}`);
const isPracticalWorkload = (workload = {}) => norm(workload.coursetype).includes("practical");

const roomMatchesWorkload = (room, workload) => {
  if (isPracticalWorkload(workload)) {
    return norm(room.type) === "lab" && norm(room.labcoursecode) === norm(workload.coursecode);
  }
  return norm(room.type) !== "lab";
};

const markExistingRoomBookings = (existingRows = []) => {
  const bookings = [];
  existingRows.forEach((row) => {
    const key = roomKey(row);
    if (!key || !row.classdate || !row.classtime) return;
    bookings.push({
      roomkey: key,
      classdate: row.classdate,
      starttime: row.classtime,
      endtime: addMinutes(row.classtime, row.durationminutes || 0)
    });
  });
  return bookings;
};

const isRoomBooked = (room, slot, roomBookings = []) => {
  const key = roomKey(room);
  return roomBookings.some((item) => item.roomkey === key && item.classdate === slot.date && overlaps(slot.starttime, slot.endtime, item.starttime, item.endtime));
};

const findRoomForWorkload = (workload, slot, rooms, roomBookings) => {
  const candidates = rooms
    .filter((room) => roomMatchesWorkload(room, workload))
    .sort((a, b) => Number(a.capacity || 0) - Number(b.capacity || 0) || String(a.roomno || "").localeCompare(String(b.roomno || ""), undefined, { numeric: true }));
  return candidates.find((room) => !isRoomBooked(room, slot, roomBookings)) || null;
};

const rowWithRoom = (workload, slot, room) => ({
  academicyear: workload.academicyear,
  regulation: workload.regulation,
  program: workload.program,
  programcode: workload.programcode,
  faculty: workload.facultyname,
  facultyemail: workload.facultyemail,
  major: workload.subject,
  semester: workload.semester,
  course: workload.course,
  coursecode: workload.coursecode,
  campus: room.campus || "",
  building: room.building || "",
  floor: room.floor || "",
  roomid: String(room._id || ""),
  roomno: room.roomno || "",
  classdate: slot.date,
  classtime: slot.starttime,
  period: slot.period,
  durationminutes: durationMinutes(slot.starttime, slot.endtime),
  module: "",
  topic: "",
  workcompleted: "",
  status: "Active"
});

const buildTimetableRows = ({ sessions, slots, availability }) => {
  const usedSlotKeys = new Set();
  const usedFacultyKeys = new Set();
  const scheduled = [];
  const unscheduled = [];

  sessions.forEach((workload) => {
    const slot = slots.find((candidate) => {
      if (norm(candidate.programcode) !== norm(workload.programcode)) return false;
      const slotKey = `${candidate.date}|${candidate.programcode}|${candidate.period}|${candidate.starttime}`;
      const facultyKey = `${candidate.date}|${candidate.starttime}|${candidate.endtime}|${norm(workload.facultyemail)}`;
      if (usedSlotKeys.has(slotKey) || usedFacultyKeys.has(facultyKey)) return false;
      if (isFacultyUnavailable(candidate, workload.facultyemail, availability)) return false;
      return true;
    });

    if (!slot) {
      unscheduled.push({
        academicyear: workload.academicyear,
        program: workload.program,
        programcode: workload.programcode,
        regulation: workload.regulation,
        semester: workload.semester,
        major: workload.subject,
        course: workload.course,
        coursecode: workload.coursecode,
        faculty: workload.facultyname,
        facultyemail: workload.facultyemail,
        reason: "No free matching period found for this program/faculty"
      });
      return;
    }

    usedSlotKeys.add(`${slot.date}|${slot.programcode}|${slot.period}|${slot.starttime}`);
    usedFacultyKeys.add(`${slot.date}|${slot.starttime}|${slot.endtime}|${norm(workload.facultyemail)}`);

    scheduled.push({
      academicyear: workload.academicyear,
      regulation: workload.regulation,
      program: workload.program,
      programcode: workload.programcode,
      faculty: workload.facultyname,
      facultyemail: workload.facultyemail,
      major: workload.subject,
      semester: workload.semester,
      course: workload.course,
      coursecode: workload.coursecode,
      classdate: slot.date,
      classtime: slot.starttime,
      period: slot.period,
      durationminutes: durationMinutes(slot.starttime, slot.endtime),
      module: "",
      topic: "",
      workcompleted: "",
      status: "Active"
    });
  });

  return { scheduled, unscheduled };
};

const buildRoomTimetableRows = ({ sessions, slots, availability, rooms, existingTimetable }) => {
  const usedSlotKeys = new Set();
  const usedFacultyKeys = new Set();
  const roomBookings = markExistingRoomBookings(existingTimetable);
  const scheduled = [];
  const unscheduled = [];

  sessions.forEach((workload) => {
    const slot = slots.find((candidate) => {
      if (norm(candidate.programcode) !== norm(workload.programcode)) return false;
      const slotKey = `${candidate.date}|${candidate.programcode}|${candidate.period}|${candidate.starttime}`;
      const facultyKey = `${candidate.date}|${candidate.starttime}|${candidate.endtime}|${norm(workload.facultyemail)}`;
      if (usedSlotKeys.has(slotKey) || usedFacultyKeys.has(facultyKey)) return false;
      if (isFacultyUnavailable(candidate, workload.facultyemail, availability)) return false;
      const room = findRoomForWorkload(workload, candidate, rooms, roomBookings);
      return !!room;
    });

    if (!slot) {
      unscheduled.push({
        academicyear: workload.academicyear,
        program: workload.program,
        programcode: workload.programcode,
        regulation: workload.regulation,
        semester: workload.semester,
        major: workload.subject,
        course: workload.course,
        coursecode: workload.coursecode,
        faculty: workload.facultyname,
        facultyemail: workload.facultyemail,
        coursetype: workload.coursetype || "",
        reason: isPracticalWorkload(workload) ? "No free lab found for this practical course code" : "No free matching period/faculty/room found"
      });
      return;
    }

    const room = findRoomForWorkload(workload, slot, rooms, roomBookings);
    usedSlotKeys.add(`${slot.date}|${slot.programcode}|${slot.period}|${slot.starttime}`);
    usedFacultyKeys.add(`${slot.date}|${slot.starttime}|${slot.endtime}|${norm(workload.facultyemail)}`);
    roomBookings.push({ roomkey: roomKey(room), classdate: slot.date, starttime: slot.starttime, endtime: slot.endtime });
    scheduled.push(rowWithRoom(workload, slot, room));
  });

  return { scheduled, unscheduled };
};

const capacityCheck = ({ sessions, slots }) => {
  const required = new Map();
  const available = new Map();
  sessions.forEach((item) => required.set(item.programcode, (required.get(item.programcode) || 0) + 1));
  slots.forEach((item) => available.set(item.programcode, (available.get(item.programcode) || 0) + 1));
  const shortages = [...required.entries()].map(([programcode, requiredCount]) => ({
    programcode,
    required: requiredCount,
    available: available.get(programcode) || 0
  })).filter((item) => item.available < item.required);
  return shortages;
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getAiConfig = async (colid, provider = "Gemini") => {
  const providerRegex = new RegExp(`^${escapeRegex(provider)}$`, "i");
  return AiConfiguration.findOne({ colid, type: providerRegex, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || AiConfiguration.findOne({ colid, type: providerRegex, active: /^yes$/i }).sort({ _id: -1 }).lean();
};

const getOllamaConfig = async (colid, id) => {
  if (id) return OllamaConfiguration.findOne({ _id: id, colid, active: /^yes$/i }).lean();
  return OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
    || OllamaConfiguration.findOne({ colid, active: /^yes$/i }).sort({ _id: -1 }).lean();
};

const callGemini = async (apikey, prompt, preferredModel = "gemini-2.5-flash") => {
  const fallbackModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  const models = [...new Set([text(preferredModel), ...fallbackModels].filter(Boolean))];
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25 }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    lastError = data.error?.message || `Gemini request failed for ${model}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllama = async (config, prompt) => {
  const server = text(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const model = text(config.modelname);
  const response = await fetch(`${server}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.25 } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ollama request failed at ${server}`);
  return data.response || "";
};

const extractJson = (raw) => {
  const clean = text(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(clean); } catch (error) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw error;
  }
};

const toArray = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value) ? [text(value)] : [];

const buildContext = async ({ colid, academicyear, startdate, enddate, regulation, programcodes = [], semesters = [] }) => {
  const dates = datesBetween(startdate, enddate);
  if (!dates.length) throw new Error("Valid start date and end date are required");
  const workloadQuery = { colid, academicyear, status: /^Active$/i };
  const periodQuery = { colid, academicyear };
  const programList = toArray(programcodes);
  const semesterList = toArray(semesters);
  if (text(regulation)) workloadQuery.regulation = text(regulation);
  if (programList.length) {
    workloadQuery.programcode = { $in: programList };
    periodQuery.programcode = { $in: programList };
  }
  if (semesterList.length) workloadQuery.semester = { $in: semesterList };
  const [workloads, periods, availability, ollamaConfigs] = await Promise.all([
    WorkloadAssignment.find(workloadQuery).sort({ programcode: 1, semester: 1, course: 1 }).lean(),
    ProgramPeriodSlot.find(periodQuery).sort({ programcode: 1, dayofweek: 1, starttime: 1 }).lean(),
    FacultyAvailability.find({ colid, academicyear }).lean(),
    OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
  ]);
  const sessions = workloadSessions(workloads);
  const slots = buildSlots({ dates, periods });
  return { dates, workloads, periods, availability, sessions, slots, ollamaConfigs };
};

const buildRoomContext = async ({ colid, academicyear, startdate, enddate, regulation, programcodes = [], semesters = [] }) => {
  const ctx = await buildContext({ colid, academicyear, startdate, enddate, regulation, programcodes, semesters });
  const [rooms, existingTimetable, courseMaps] = await Promise.all([
    RoomResource.find({ colid }).sort({ campus: 1, building: 1, floor: 1, roomno: 1 }).lean(),
    NepLmsTimetable.find({ colid, academicyear, classdate: { $gte: text(startdate), $lte: text(enddate) } }).lean(),
    RegulationCourseMap.find({ colid, academicyear }).select("regulation programcode type subject semester coursecode coursetype").lean()
  ]);
  const courseTypeFor = (row) => courseMaps.find((item) => (
    norm(item.regulation) === norm(row.regulation)
    && norm(item.programcode) === norm(row.programcode)
    && norm(item.type) === norm(row.type)
    && norm(item.subject) === norm(row.subject)
    && norm(item.semester) === norm(row.semester)
    && norm(item.coursecode) === norm(row.coursecode)
  ))?.coursetype || row.coursetype || "";
  const workloads = ctx.workloads.map((row) => ({ ...row, coursetype: row.coursetype || courseTypeFor(row) }));
  const sessions = ctx.sessions.map((row) => ({ ...row, coursetype: row.coursetype || courseTypeFor(row) }));
  return { ...ctx, workloads, sessions, rooms, existingTimetable };
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const [workloads, periods, ollamaConfigs] = await Promise.all([
      WorkloadAssignment.find({ colid }).select("academicyear regulation program programcode semester").lean(),
      ProgramPeriodSlot.find({ colid }).select("academicyear program programcode").lean(),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
    ]);
    const programMap = new Map();
    [...workloads, ...periods].forEach((item) => {
      if (item.programcode) programMap.set(item.programcode, { program: item.program || "", programcode: item.programcode || "" });
    });
    res.json({
      success: true,
      academicyears: uniq([...workloads.map((item) => item.academicyear), ...periods.map((item) => item.academicyear)]),
      regulations: uniq(workloads.map((item) => item.regulation)),
      programs: [...programMap.values()].sort((a, b) => String(a.programcode).localeCompare(String(b.programcode), undefined, { numeric: true })),
      semesters: uniq(workloads.map((item) => item.semester)),
      ollamaConfigs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generate = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    if (!colid || !academicyear) return res.status(400).json({ success: false, message: "colid and academic year are required" });
    const ctx = await buildContext({ colid, academicyear, startdate: req.body.startdate, enddate: req.body.enddate, regulation: req.body.regulation, programcodes: req.body.programcodes, semesters: req.body.semesters });
    if (!ctx.workloads.length) return res.status(400).json({ success: false, message: "No active workload found for this academic year" });
    if (!ctx.periods.length) return res.status(400).json({ success: false, message: "No period configuration found for this academic year" });
    const shortages = capacityCheck(ctx);
    if (shortages.length) return res.status(400).json({ success: false, message: "No of periods are less than no of workload for one or more programs", shortages });
    const result = buildTimetableRows(ctx);
    res.json({
      success: true,
      mode: "Rule based",
      counts: { workloads: ctx.workloads.length, requiredSessions: ctx.sessions.length, availableSlots: ctx.slots.length, scheduled: result.scheduled.length, unscheduled: result.unscheduled.length },
      scheduled: result.scheduled,
      unscheduled: result.unscheduled,
      shortages: []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateAi = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    if (!colid || !academicyear) return res.status(400).json({ success: false, message: "colid and academic year are required" });
    const ctx = await buildContext({ colid, academicyear, startdate: req.body.startdate, enddate: req.body.enddate, regulation: req.body.regulation, programcodes: req.body.programcodes, semesters: req.body.semesters });
    const shortages = capacityCheck(ctx);
    if (shortages.length) return res.status(400).json({ success: false, message: "No of periods are less than no of workload for one or more programs", shortages });

    const compactWorkloads = ctx.sessions.map((item, index) => ({
      sessionid: `W${index + 1}`,
      academicyear: item.academicyear,
      regulation: item.regulation,
      program: item.program,
      programcode: item.programcode,
      semester: item.semester,
      subject: item.subject,
      course: item.course,
      coursecode: item.coursecode,
      facultyname: item.facultyname,
      facultyemail: item.facultyemail
    }));
    const compactSlots = ctx.slots.map((item, index) => ({ slotid: `S${index + 1}`, ...item }));
    const prompt = `Create a weekly class timetable as JSON only.
Rules:
- Use only the provided workload sessions and period slots.
- Do not schedule a faculty in a slot if faculty availability says unavailable for that day/time.
- Do not schedule the same faculty in overlapping slots.
- Do not schedule more than one class for the same program and period slot.
- Respect these additional rules: ${text(req.body.rules) || "No additional rules."}

Return exactly this JSON shape:
{"scheduled":[{"sessionid":"W1","slotid":"S1"}],"unscheduled":[{"sessionid":"W2","reason":"reason"}]}

Workload sessions:
${JSON.stringify(compactWorkloads)}

Slots:
${JSON.stringify(compactSlots)}

Faculty unavailable:
${JSON.stringify(ctx.availability.map((item) => ({ facultyemail: item.facultyemail, dayofweek: item.dayofweek, starttime: item.starttime, endtime: item.endtime })))}`;

    let raw = "";
    if (norm(req.body.provider) === "ollama") {
      const config = await getOllamaConfig(colid, req.body.ollamaConfigId);
      if (!config) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      raw = await callOllama(config, prompt);
    } else {
      const config = await getAiConfig(colid, "Gemini");
      if (!config?.apikey) return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });
      raw = await callGemini(config.apikey, prompt, req.body.geminiModel);
    }
    const parsed = extractJson(raw);
    const sessionMap = new Map(compactWorkloads.map((item, index) => [item.sessionid, ctx.sessions[index]]));
    const slotMap = new Map(compactSlots.map((item, index) => [item.slotid, ctx.slots[index]]));
    const scheduled = [];
    const usedSession = new Set();
    (Array.isArray(parsed.scheduled) ? parsed.scheduled : []).forEach((item) => {
      const workload = sessionMap.get(text(item.sessionid));
      const slot = slotMap.get(text(item.slotid));
      if (!workload || !slot || usedSession.has(text(item.sessionid))) return;
      usedSession.add(text(item.sessionid));
      scheduled.push({
        academicyear: workload.academicyear,
        regulation: workload.regulation,
        program: workload.program,
        programcode: workload.programcode,
        faculty: workload.facultyname,
        facultyemail: workload.facultyemail,
        major: workload.subject,
        semester: workload.semester,
        course: workload.course,
        coursecode: workload.coursecode,
        classdate: slot.date,
        classtime: slot.starttime,
        period: slot.period,
        durationminutes: durationMinutes(slot.starttime, slot.endtime),
        module: "",
        topic: "",
        workcompleted: "",
        status: "Active"
      });
    });
    const unscheduled = ctx.sessions.filter((item, index) => !usedSession.has(`W${index + 1}`)).map((item, index) => ({
      academicyear: item.academicyear,
      program: item.program,
      programcode: item.programcode,
      regulation: item.regulation,
      semester: item.semester,
      major: item.subject,
      course: item.course,
      coursecode: item.coursecode,
      faculty: item.facultyname,
      facultyemail: item.facultyemail,
      reason: parsed.unscheduled?.find((row) => text(row.sessionid) === `W${index + 1}`)?.reason || "AI did not schedule this class"
    }));

    res.json({
      success: true,
      mode: norm(req.body.provider) === "ollama" ? "Ollama" : "Gemini",
      aiResponse: raw,
      counts: { workloads: ctx.workloads.length, requiredSessions: ctx.sessions.length, availableSlots: ctx.slots.length, scheduled: scheduled.length, unscheduled: unscheduled.length },
      scheduled,
      unscheduled,
      shortages: []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveGenerated = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!rows.length) return res.status(400).json({ success: false, message: "No timetable rows received" });
    const payloads = rows.map((row) => ({
      academicyear: text(row.academicyear),
      regulation: text(row.regulation),
      program: text(row.program),
      programcode: text(row.programcode),
      faculty: text(row.faculty || row.facultyname),
      facultyemail: text(row.facultyemail),
      campus: text(row.campus),
      building: text(row.building),
      floor: text(row.floor),
      roomid: text(row.roomid),
      roomno: text(row.roomno),
      major: text(row.major || row.subject),
      semester: text(row.semester),
      course: text(row.course),
      coursecode: text(row.coursecode),
      classdate: text(row.classdate),
      classtime: text(row.classtime),
      period: text(row.period),
      durationminutes: Number(row.durationminutes || 0),
      module: text(row.module),
      topic: text(row.topic),
      workcompleted: text(row.workcompleted),
      status: text(row.status) || "Active",
      colid,
      user: text(req.body.user)
    })).filter((row) => row.coursecode && row.classdate && row.classtime);
    if (!payloads.length) return res.status(400).json({ success: false, message: "No valid timetable rows received" });
    const inserted = await NepLmsTimetable.insertMany(payloads, { ordered: false });
    res.json({ success: true, saved: inserted.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.roomOptions = exports.options;

exports.generateWithRooms = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    if (!colid || !academicyear) return res.status(400).json({ success: false, message: "colid and academic year are required" });
    const ctx = await buildRoomContext({ colid, academicyear, startdate: req.body.startdate, enddate: req.body.enddate, regulation: req.body.regulation, programcodes: req.body.programcodes, semesters: req.body.semesters });
    if (!ctx.workloads.length) return res.status(400).json({ success: false, message: "No active workload found for this academic year" });
    if (!ctx.periods.length) return res.status(400).json({ success: false, message: "No period configuration found for this academic year" });
    if (!ctx.rooms.length) return res.status(400).json({ success: false, message: "No room configuration found" });
    const shortages = capacityCheck(ctx);
    if (shortages.length) return res.status(400).json({ success: false, message: "No of periods are less than no of workload for one or more programs", shortages });
    const result = buildRoomTimetableRows(ctx);
    res.json({
      success: true,
      mode: "Rule based with rooms",
      counts: {
        workloads: ctx.workloads.length,
        requiredSessions: ctx.sessions.length,
        availableSlots: ctx.slots.length,
        rooms: ctx.rooms.length,
        scheduled: result.scheduled.length,
        unscheduled: result.unscheduled.length
      },
      scheduled: result.scheduled,
      unscheduled: result.unscheduled,
      shortages: []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateAiWithRooms = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    if (!colid || !academicyear) return res.status(400).json({ success: false, message: "colid and academic year are required" });
    const ctx = await buildRoomContext({ colid, academicyear, startdate: req.body.startdate, enddate: req.body.enddate, regulation: req.body.regulation, programcodes: req.body.programcodes, semesters: req.body.semesters });
    if (!ctx.rooms.length) return res.status(400).json({ success: false, message: "No room configuration found" });
    const shortages = capacityCheck(ctx);
    if (shortages.length) return res.status(400).json({ success: false, message: "No of periods are less than no of workload for one or more programs", shortages });

    const compactWorkloads = ctx.sessions.map((item, index) => ({
      sessionid: `W${index + 1}`,
      academicyear: item.academicyear,
      regulation: item.regulation,
      program: item.program,
      programcode: item.programcode,
      semester: item.semester,
      subject: item.subject,
      course: item.course,
      coursecode: item.coursecode,
      coursetype: item.coursetype || "",
      facultyname: item.facultyname,
      facultyemail: item.facultyemail
    }));
    const compactSlots = ctx.slots.map((item, index) => ({ slotid: `S${index + 1}`, ...item }));
    const compactRooms = ctx.rooms.map((item, index) => ({
      roomid: `R${index + 1}`,
      dbroomid: String(item._id || ""),
      campus: item.campus || "",
      building: item.building || "",
      floor: item.floor || "",
      roomno: item.roomno || "",
      type: item.type || "",
      labcoursecode: item.labcoursecode || "",
      capacity: item.capacity || 0,
      examcapacity: item.examcapacity || 0
    }));
    const existingRoomBookings = markExistingRoomBookings(ctx.existingTimetable);
    const prompt = `Create a weekly class timetable with room allocation as JSON only.
Rules:
- Use only the provided workload sessions, period slots, and rooms.
- Practical workloads must use a Lab room where labcoursecode equals the workload coursecode.
- Theory/non-practical workloads must not use Lab rooms.
- Do not book the same room for multiple courses at the same date/time.
- Do not use a room if it conflicts with existing room bookings.
- Do not schedule a faculty in a slot if faculty availability says unavailable for that day/time.
- Do not schedule the same faculty in overlapping slots.
- Do not schedule more than one class for the same program and period slot.
- Respect these additional rules: ${text(req.body.rules) || "No additional rules."}

Return exactly this JSON shape:
{"scheduled":[{"sessionid":"W1","slotid":"S1","roomid":"R1"}],"unscheduled":[{"sessionid":"W2","reason":"reason"}]}

Workload sessions:
${JSON.stringify(compactWorkloads)}

Slots:
${JSON.stringify(compactSlots)}

Rooms:
${JSON.stringify(compactRooms)}

Existing room bookings:
${JSON.stringify(existingRoomBookings)}

Faculty unavailable:
${JSON.stringify(ctx.availability.map((item) => ({ facultyemail: item.facultyemail, dayofweek: item.dayofweek, starttime: item.starttime, endtime: item.endtime })))}`;

    let raw = "";
    if (norm(req.body.provider) === "ollama") {
      const config = await getOllamaConfig(colid, req.body.ollamaConfigId);
      if (!config) return res.status(400).json({ success: false, message: "Active Ollama configuration is missing" });
      raw = await callOllama(config, prompt);
    } else {
      const config = await getAiConfig(colid, "Gemini");
      if (!config?.apikey) return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });
      raw = await callGemini(config.apikey, prompt, req.body.geminiModel);
    }

    const parsed = extractJson(raw);
    const sessionMap = new Map(compactWorkloads.map((item, index) => [item.sessionid, ctx.sessions[index]]));
    const slotMap = new Map(compactSlots.map((item, index) => [item.slotid, ctx.slots[index]]));
    const roomMap = new Map(compactRooms.map((item, index) => [item.roomid, ctx.rooms[index]]));
    const scheduled = [];
    const usedSession = new Set();
    const usedSlotKeys = new Set();
    const usedFacultyKeys = new Set();
    const roomBookings = markExistingRoomBookings(ctx.existingTimetable);

    (Array.isArray(parsed.scheduled) ? parsed.scheduled : []).forEach((item) => {
      const sessionid = text(item.sessionid);
      const workload = sessionMap.get(sessionid);
      const slot = slotMap.get(text(item.slotid));
      let room = roomMap.get(text(item.roomid));
      if (!workload || !slot || usedSession.has(sessionid)) return;
      const slotKey = `${slot.date}|${slot.programcode}|${slot.period}|${slot.starttime}`;
      const facultyKey = `${slot.date}|${slot.starttime}|${slot.endtime}|${norm(workload.facultyemail)}`;
      if (usedSlotKeys.has(slotKey) || usedFacultyKeys.has(facultyKey) || isFacultyUnavailable(slot, workload.facultyemail, ctx.availability)) return;
      if (!room || !roomMatchesWorkload(room, workload) || isRoomBooked(room, slot, roomBookings)) {
        room = findRoomForWorkload(workload, slot, ctx.rooms, roomBookings);
      }
      if (!room) return;
      usedSession.add(sessionid);
      usedSlotKeys.add(slotKey);
      usedFacultyKeys.add(facultyKey);
      roomBookings.push({ roomkey: roomKey(room), classdate: slot.date, starttime: slot.starttime, endtime: slot.endtime });
      scheduled.push(rowWithRoom(workload, slot, room));
    });

    const unscheduled = ctx.sessions.filter((item, index) => !usedSession.has(`W${index + 1}`)).map((item, index) => ({
      academicyear: item.academicyear,
      program: item.program,
      programcode: item.programcode,
      regulation: item.regulation,
      semester: item.semester,
      major: item.subject,
      course: item.course,
      coursecode: item.coursecode,
      coursetype: item.coursetype || "",
      faculty: item.facultyname,
      facultyemail: item.facultyemail,
      reason: parsed.unscheduled?.find((row) => text(row.sessionid) === `W${index + 1}`)?.reason || "AI did not schedule this class with a valid room"
    }));

    res.json({
      success: true,
      mode: norm(req.body.provider) === "ollama" ? "Ollama with rooms" : "Gemini with rooms",
      aiResponse: raw,
      counts: {
        workloads: ctx.workloads.length,
        requiredSessions: ctx.sessions.length,
        availableSlots: ctx.slots.length,
        rooms: ctx.rooms.length,
        scheduled: scheduled.length,
        unscheduled: unscheduled.length
      },
      scheduled,
      unscheduled,
      shortages: []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveGeneratedWithRooms = exports.saveGenerated;
