const ConductExamRoll = require("../Models/conductexamrollds");
const StudentViewControl = require("../Models/conductexamstudentviewcontrolds");
const Institution = require("../Models/insdetails");
const User = require("../Models/user");
const BlockchainLedger = require("../Models/blockchainledgerds");
const { appendBlock } = require("./blockchainledgerctlrds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const splitValues = (value) => text(value).split(",").map((item) => item.trim()).filter(Boolean);
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const addMultiFilter = (query, source, field) => {
  const values = splitValues(source[field]);
  if (values.length === 1) query[field] = values[0];
  if (values.length > 1) query[field] = { $in: values };
};

const filterFields = ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "semester", "section", "student", "regno", "course", "coursecode"];
const controlFields = ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "admitcard", "result", "reeval"];
const yesNo = (value) => (text(value).toLowerCase() === "yes" ? "Yes" : "No");

const buildRollQuery = (source = {}) => {
  const query = { colid: number(source.colid) };
  filterFields.forEach((field) => addMultiFilter(query, source, field));
  return query;
};

const buildControlPayload = (input = {}) => ({
  colid: number(input.colid),
  academicyear: text(input.academicyear),
  exam: text(input.exam),
  examcode: text(input.examcode),
  regulation: text(input.regulation),
  program: text(input.program),
  programcode: text(input.programcode),
  admitcard: yesNo(input.admitcard),
  result: yesNo(input.result),
  reeval: yesNo(input.reeval),
  user: text(input.user)
});

const validateControl = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "exam", "examcode"]) {
    if (!payload[field]) return `${field} is required`;
  }
  return "";
};

const eligibleQuery = (query = {}) => ({
  ...query,
  attendance: "Yes",
  fees: "Yes",
  atkt: "Yes",
  disciplinary: "Yes"
});

const loadHallTicketPayload = async ({ colid, academicyear, examcode, regno, requireControl = false }) => {
  const base = { colid, academicyear: text(academicyear), examcode: text(examcode), regno: text(regno) };
  const rows = await ConductExamRoll.find(eligibleQuery(base)).sort({ examdate: 1, examslot: 1, course: 1 }).lean();
  if (!rows.length) return { error: "No eligible exam roll entries found for this student" };
  const first = rows[0];
  if (requireControl) {
    const control = await StudentViewControl.findOne({
      colid,
      academicyear: first.academicyear,
      examcode: first.examcode,
      $or: [
        { programcode: first.programcode },
        { programcode: "" },
        { programcode: { $exists: false } }
      ],
      admitcard: "Yes"
    }).lean();
    if (!control) return { error: "Admit card is not enabled for this exam" };
  }
  const [institution, student] = await Promise.all([
    Institution.findOne({ colid }).lean(),
    User.findOne({ colid, regno: first.regno }).lean()
  ]);
  return {
    institution,
    student: student || {
      name: first.student,
      regno: first.regno,
      email: first.email,
      phone: first.phone,
      program: first.program,
      programcode: first.programcode,
      semester: first.semester,
      section: first.section
    },
    exam: {
      academicyear: first.academicyear,
      exam: first.exam,
      examcode: first.examcode,
      regulation: first.regulation,
      program: first.program,
      programcode: first.programcode
    },
    rows
  };
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [rolls, controls] = await Promise.all([
      ConductExamRoll.find({ colid }).lean(),
      StudentViewControl.find({ colid }).lean()
    ]);
    const allRows = [...rolls, ...controls];
    const options = {};
    [...new Set([...filterFields, ...controlFields])].forEach((field) => {
      options[field] = uniqueSorted(allRows.map((row) => row[field]));
    });
    options.admitcard = uniqueSorted(["Yes", "No", ...controls.map((row) => row.admitcard)]);
    options.result = uniqueSorted(["Yes", "No", ...controls.map((row) => row.result)]);
    options.reeval = uniqueSorted(["Yes", "No", ...controls.map((row) => row.reeval)]);
    res.json({ success: true, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFeeDefaulters = async (req, res) => {
  try {
    const query = buildRollQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExamRoll.find({ ...query, fees: "FEES_DEFAULTER" }).sort({ programcode: 1, regno: 1, course: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEligibleStudents = async (req, res) => {
  try {
    const query = buildRollQuery(req.query);
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await ConductExamRoll.find(eligibleQuery(query)).sort({ student: 1, course: 1 }).lean();
    const map = new Map();
    rows.forEach((row) => {
      const key = `${row.regno}||${row.academicyear}||${row.examcode}`;
      if (!map.has(key)) map.set(key, { ...row, coursecount: 0 });
      map.get(key).coursecount += 1;
    });
    res.json({ success: true, data: [...map.values()] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHallTicket = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = await loadHallTicketPayload({
      colid,
      academicyear: req.query.academicyear,
      examcode: req.query.examcode,
      regno: req.query.regno,
      requireControl: text(req.query.requireControl).toLowerCase() === "yes"
    });
    if (payload.error) return res.status(400).json({ success: false, message: payload.error });
    res.json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.storeHallTicketBlockchain = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const regno = text(req.body.regno);
    const academicyear = text(req.body.academicyear);
    const examcode = text(req.body.examcode);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno || !academicyear || !examcode) return res.status(400).json({ success: false, message: "regno, academic year and exam code are required" });
    const payload = await loadHallTicketPayload({ colid, academicyear, examcode, regno });
    if (payload.error) return res.status(400).json({ success: false, message: payload.error });
    const block = await appendBlock({
      colid,
      modelname: "conductexamhallticket",
      collectionname: "conductexamrollds",
      recordid: `${regno}::${academicyear}::${examcode}`,
      action: "HALL_TICKET_STORE",
      payload: { ...payload, storedAt: new Date().toISOString() },
      metadata: { regno, academicyear, examcode, student: payload.student?.name || "" },
      user: text(req.body.user)
    });
    res.json({ success: true, data: block });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyHallTicketBlockchain = async (req, res) => {
  try {
    const regno = text(req.query.regno);
    const hash = text(req.query.hash);
    const colid = number(req.query.colid);
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    const query = {
      modelname: "conductexamhallticket",
      recordid: { $regex: `^${regno.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}::`, $options: "i" }
    };
    if (hash) query.hash = hash;
    if (colid !== undefined) query.colid = colid;
    const blocks = await BlockchainLedger.find(query).sort({ timestamp: -1 }).lean();
    res.json({ success: true, verified: !!blocks.length, data: blocks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getControls = async (req, res) => {
  try {
    const query = { colid: number(req.query.colid) };
    if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    controlFields.forEach((field) => addMultiFilter(query, req.query, field));
    const data = await StudentViewControl.find(query).sort({ academicyear: -1, exam: 1, program: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveControl = async (req, res) => {
  try {
    const payload = buildControlPayload(req.body);
    const error = validateControl(payload);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await StudentViewControl.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await StudentViewControl.findOneAndUpdate(
        { colid: payload.colid, academicyear: payload.academicyear, examcode: payload.examcode, regulation: payload.regulation, programcode: payload.programcode },
        payload,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteControl = async (req, res) => {
  try {
    const data = await StudentViewControl.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Control not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentAdmitCardOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const regno = text(req.query.regno);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });
    const rolls = await ConductExamRoll.find(eligibleQuery({ colid, regno })).lean();
    const controls = await StudentViewControl.find({ colid, admitcard: "Yes" }).lean();
    const enabled = rolls.filter((row) => controls.some((control) => (
      control.academicyear === row.academicyear
      && control.examcode === row.examcode
      && (!control.regulation || control.regulation === row.regulation)
      && (!control.programcode || control.programcode === row.programcode)
    )));
    res.json({
      success: true,
      options: {
        academicyear: uniqueSorted(enabled.map((row) => row.academicyear)),
        exam: uniqueSorted(enabled.map((row) => row.exam)),
        examcode: uniqueSorted(enabled.map((row) => row.examcode))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
