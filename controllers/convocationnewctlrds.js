const nodemailer = require("nodemailer");
const User = require("../Models/user");
const Ledgerstud = require("../Models/ledgerstud");
const ExamVivaMarks = require("../Models/examinationmodel2vivamarksds");
const EmailConfiguration = require("../Models/emailconfigurationds");
const {
  ConvocationDress,
  ConvocationDressOrder,
  ConvocationProgramFee,
  ConvocationRegistration,
  ConvocationEmailLog
} = require("../Models/convocationnewds");

const text = (value) => String(value || "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const split = (value) => text(value).split(",").map((item) => item.trim()).filter(Boolean);
const uniq = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};
const smtpHost = (config = {}) => config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : "");
const transporterFor = (config) => {
  const host = smtpHost(config);
  if (!config?.username || !config?.password || !host) throw new Error("Selected email configuration is incomplete");
  return nodemailer.createTransport({
    host,
    port: Number(config.port || 587),
    secure: text(config.secure).toLowerCase() === "yes" || Number(config.port) === 465,
    auth: { user: config.username, pass: config.password }
  });
};

const studentFields = "name email phone regno gender academicyear admissionyear regulation program programcode semester section colid";
const studentByRegno = (colid, regno) => User.findOne({ colid, role: /^student$/i, regno: text(regno) }).select(studentFields).lean();

const addMulti = (query, source, field, like = false) => {
  const values = split(source[field]);
  if (!values.length) return;
  if (values.length === 1) query[field] = like ? regex(values[0]) : values[0];
  if (values.length > 1) query[field] = { $in: values };
};

const modelMap = {
  dress: ConvocationDress,
  programfee: ConvocationProgramFee
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [dresses, fees, vivaYears, vivaPrograms, vivaSemesters, emailconfigs] = await Promise.all([
      ConvocationDress.find({ colid }).sort({ gender: 1, dresstype: 1, size: 1 }).lean(),
      ConvocationProgramFee.find({ colid }).sort({ academicyear: -1, programcode: 1 }).lean(),
      ExamVivaMarks.distinct("academicyear", { colid }),
      ExamVivaMarks.distinct("programcode", { colid }),
      ExamVivaMarks.distinct("semester", { colid }),
      EmailConfiguration.find({ colid, isactive: { $not: /^no$/i } }).sort({ default: -1, provider: 1, username: 1 }).lean()
    ]);
    res.json({
      success: true,
      dresses,
      fees,
      academicyears: uniq([...vivaYears, ...fees.map((row) => row.academicyear)]),
      programcodes: uniq([...vivaPrograms, ...fees.map((row) => row.programcode)]),
      semesters: uniq(vivaSemesters),
      genders: uniq(["Male", "Female", "Other", ...dresses.map((row) => row.gender)]),
      dresstypes: uniq(dresses.map((row) => row.dresstype)),
      sizes: uniq(dresses.map((row) => row.size)),
      emailconfigs: emailconfigs.map((row) => ({ ...row, label: `${row.provider || "Email"} / ${row.type || "General"} / ${row.username || ""}` }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const model = modelMap[req.params.kind];
    if (!model) return res.status(404).json({ success: false, message: "Unknown convocation model" });
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["academicyear", "programcode", "gender", "dresstype", "size", "status"].forEach((field) => addMulti(query, req.query, field));
    const data = await model.find(query).sort({ academicyear: -1, gender: 1, dresstype: 1, programcode: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const model = modelMap[req.params.kind];
    if (!model) return res.status(404).json({ success: false, message: "Unknown convocation model" });
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = { ...req.body, colid };
    delete payload.id;
    const data = req.body.id
      ? await model.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await model.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const model = modelMap[req.params.kind];
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    if (!model) return res.status(404).json({ success: false, message: "Unknown convocation model" });
    if (colid === undefined || !ids.length) return res.status(400).json({ success: false, message: "colid and ids are required" });
    const result = await model.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createLedger = async ({ colid, student, amount, feegroup, feeitem, feecategory = "Convocation", feetype = "One time", comments = "" }) => {
  const existing = await Ledgerstud.findOne({ colid, regno: student.regno, feegroup, feeitem, balance: { $gt: 0 } }).lean();
  if (existing) return existing;
  return Ledgerstud.create({
    colid,
    name: student.name || student.student || "Student",
    student: student.name || student.student || "Student",
    user: student.email || student.user || student.regno,
    regno: student.regno,
    academicyear: student.academicyear || "",
    admissionyear: student.admissionyear || "",
    regulation: student.regulation || "",
    program: student.program || "",
    programcode: student.programcode || "",
    semester: student.semester || "",
    feegroup,
    feecategory,
    feeitem,
    feetype,
    amount,
    paid: 0,
    concession: 0,
    balance: amount,
    classdate: today(),
    duedate: today(),
    status: "Due",
    comments
  });
};

const ledgerPaid = async (colid, ledgerid) => {
  if (!ledgerid) return false;
  const row = await Ledgerstud.findOne({ _id: ledgerid, colid }).lean();
  return row && Number(row.balance || 0) <= 0;
};

exports.studentProfile = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const regno = text(req.query.regno);
    if (colid === undefined || !regno) return res.status(400).json({ success: false, message: "colid and regno are required" });
    const student = await studentByRegno(colid, regno);
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const [orders, registrations] = await Promise.all([
      ConvocationDressOrder.find({ colid, regno }).sort({ createdAt: -1 }).lean(),
      ConvocationRegistration.find({ colid, regno }).sort({ createdAt: -1 }).lean()
    ]);
    res.json({ success: true, student, orders, registrations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyDress = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const regno = text(req.body.regno);
    const dress = await ConvocationDress.findOne({ _id: req.body.dressid, colid, status: { $not: /^inactive$/i } }).lean();
    if (colid === undefined || !regno || !dress) return res.status(400).json({ success: false, message: "Student and active dress are required" });
    const student = await studentByRegno(colid, regno);
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const ledger = await createLedger({
      colid,
      student,
      amount: num(dress.cost),
      feegroup: "Convocation dress",
      feeitem: `${dress.dresstype} - ${dress.size}`,
      comments: "Convocation dress selection"
    });
    const data = await ConvocationDressOrder.findOneAndUpdate(
      { colid, regno, dressid: dress._id },
      {
        colid,
        dressid: dress._id,
        academicyear: student.academicyear,
        regulation: student.regulation,
        program: student.program,
        programcode: student.programcode,
        semester: student.semester,
        student: student.name,
        regno,
        studentemail: student.email,
        gender: dress.gender,
        dresstype: dress.dresstype,
        size: dress.size,
        cost: num(dress.cost),
        ledgerid: String(ledger._id),
        paymentstatus: Number(ledger.balance || 0) <= 0 ? "Paid" : "Pending"
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data, ledger });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.studentRegister = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const regno = text(req.body.regno);
    const academicyear = text(req.body.academicyear);
    if (colid === undefined || !regno || !academicyear) return res.status(400).json({ success: false, message: "colid, regno and academic year are required" });
    const student = await studentByRegno(colid, regno);
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const fee = await ConvocationProgramFee.findOne({ colid, academicyear, programcode: student.programcode, status: { $not: /^inactive$/i } }).sort({ updatedAt: -1 }).lean();
    if (!fee) return res.status(404).json({ success: false, message: "Convocation fee is not configured for this program and academic year" });
    const ledger = await createLedger({
      colid,
      student: { ...student, academicyear },
      amount: num(fee.fees),
      feegroup: "Convocation fee",
      feeitem: `Convocation registration - ${academicyear}`,
      comments: "Convocation registration"
    });
    const data = await ConvocationRegistration.findOneAndUpdate(
      { colid, regno, academicyear },
      {
        colid,
        academicyear,
        regulation: student.regulation,
        program: student.program,
        programcode: student.programcode,
        semester: student.semester,
        student: student.name,
        regno,
        studentemail: student.email,
        fees: num(fee.fees),
        ledgerid: String(ledger._id),
        paymentstatus: Number(ledger.balance || 0) <= 0 ? "Paid" : "Pending",
        status: "Registered"
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data, ledger });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.shippingRows = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["gender", "dresstype", "size", "shippingstatus", "academicyear", "programcode"].forEach((field) => addMulti(query, req.query, field));
    const orders = await ConvocationDressOrder.find(query).sort({ createdAt: -1 }).lean();
    const ledgers = await Ledgerstud.find({ colid, _id: { $in: orders.map((row) => row.ledgerid).filter(Boolean) } }).select("balance paid").lean();
    const ledgerMap = new Map(ledgers.map((row) => [String(row._id), row]));
    const data = orders.map((row) => {
      const ledger = ledgerMap.get(String(row.ledgerid));
      const paid = ledger ? Number(ledger.balance || 0) <= 0 : row.paymentstatus === "Paid";
      return { ...row, paymentstatus: paid ? "Paid" : "Pending", ledgerbalance: ledger?.balance || 0, ledgerpaid: ledger?.paid || 0 };
    }).filter((row) => row.paymentstatus === "Paid");
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateShipping = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    if (colid === undefined || !ids.length) return res.status(400).json({ success: false, message: "colid and ids are required" });
    const patch = {
      shippingstatus: "Shipped",
      shippingaddress: text(req.body.shippingaddress),
      courier: text(req.body.courier),
      trackingno: text(req.body.trackingno),
      shippeddate: req.body.shippeddate ? new Date(req.body.shippeddate) : new Date(),
      shippingremarks: text(req.body.shippingremarks)
    };
    await ConvocationDressOrder.updateMany({ colid, _id: { $in: ids } }, { $set: patch });
    res.json({ success: true, updated: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const groupCounts = (rows, field) => Object.values(rows.reduce((acc, row) => {
  const label = row[field] || "NA";
  acc[label] = acc[label] || { id: label, label, count: 0, amount: 0 };
  acc[label].count += 1;
  acc[label].amount += num(row.cost || row.fees);
  return acc;
}, {}));

exports.dressReport = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["academicyear", "programcode", "semester", "gender", "dresstype", "size", "paymentstatus", "shippingstatus"].forEach((field) => addMulti(query, req.query, field));
    const data = await ConvocationDressOrder.find(query).sort({ createdAt: -1 }).lean();
    const paid = data.filter((row) => row.paymentstatus === "Paid").length;
    res.json({ success: true, data, totals: { count: data.length, paid, pending: data.length - paid, amount: data.reduce((s, r) => s + num(r.cost), 0) }, summaries: { byDress: groupCounts(data, "dresstype"), byGender: groupCounts(data, "gender"), byProgram: groupCounts(data, "programcode") } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.convocationFeeReport = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["academicyear", "programcode", "semester", "paymentstatus"].forEach((field) => addMulti(query, req.query, field));
    const data = await ConvocationRegistration.find(query).sort({ createdAt: -1 }).lean();
    const paid = data.filter((row) => row.paymentstatus === "Paid").length;
    res.json({ success: true, data, totals: { count: data.length, paid, pending: data.length - paid, amount: data.reduce((s, r) => s + num(r.fees), 0) }, summaries: { byProgram: groupCounts(data, "programcode"), byYear: groupCounts(data, "academicyear") } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const passRowsOnly = (rows) => rows.every((row) => /^pass$/i.test(text(row.status)) && !/^f/i.test(text(row.overallgrade)));

exports.goldMedalList = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const query = { colid, academicyear: text(req.query.academicyear), programcode: text(req.query.programcode), semester: text(req.query.semester) };
    if (colid === undefined || !query.academicyear || !query.programcode || !query.semester) return res.status(400).json({ success: false, message: "academic year, program code and semester are required" });
    const semRows = await ExamVivaMarks.find(query).lean();
    const regnos = uniq(semRows.map((row) => row.regno));
    const allRows = await ExamVivaMarks.find({ colid, academicyear: query.academicyear, programcode: query.programcode, regno: { $in: regnos } }).lean();
    const allByRegno = new Map(regnos.map((regno) => [regno, allRows.filter((row) => row.regno === regno)]));
    const grouped = Object.values(semRows.reduce((acc, row) => {
      const key = row.regno;
      acc[key] = acc[key] || { id: key, regno: key, student: row.student, program: row.program, programcode: row.programcode, semester: row.semester, totalmarks: 0, courses: 0 };
      acc[key].totalmarks += num(row.overallobtained || row.theoryobtained);
      acc[key].courses += 1;
      return acc;
    }, {})).filter((row) => passRowsOnly(allByRegno.get(row.regno) || [])).sort((a, b) => b.totalmarks - a.totalmarks);
    res.json({ success: true, data: grouped, topper: grouped[0] || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.eligibleStudents = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const query = { colid, academicyear: text(req.query.academicyear), programcode: text(req.query.programcode), semester: text(req.query.semester) };
    if (colid === undefined || !query.academicyear || !query.programcode || !query.semester) return res.status(400).json({ success: false, message: "academic year, program code and semester are required" });
    const semRows = await ExamVivaMarks.find(query).lean();
    const regnos = uniq(semRows.map((row) => row.regno));
    const allRows = await ExamVivaMarks.find({ colid, academicyear: query.academicyear, programcode: query.programcode, regno: { $in: regnos } }).lean();
    const users = await User.find({ colid, role: /^student$/i, regno: { $in: regnos } }).select("name email regno phone program programcode academicyear semester").lean();
    const userByRegno = new Map(users.map((row) => [text(row.regno), row]));
    const data = regnos.map((regno) => {
      const rows = allRows.filter((row) => row.regno === regno);
      const first = rows[0] || {};
      const user = userByRegno.get(regno) || {};
      return { id: regno, regno, student: user.name || first.student, email: user.email || first.user, program: first.program || user.program, programcode: first.programcode || user.programcode, semester: query.semester, courses: rows.length, totalmarks: rows.reduce((s, row) => s + num(row.overallobtained || row.theoryobtained), 0), eligible: passRowsOnly(rows) ? "Yes" : "No" };
    }).filter((row) => row.eligible === "Yes").sort((a, b) => String(a.student).localeCompare(String(b.student)));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendStudentMail = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const recipients = Array.isArray(req.body.recipients) ? req.body.recipients : [];
    if (colid === undefined || !recipients.length) return res.status(400).json({ success: false, message: "colid and recipients are required" });
    const config = await EmailConfiguration.findOne({ _id: req.body.emailconfigurationid, colid }).lean();
    const transporter = transporterFor(config);
    const to = recipients.map((row) => row.email).filter(Boolean);
    if (!to.length) return res.status(400).json({ success: false, message: "No email address found for selected students" });
    await transporter.sendMail({ from: `"Convocation" <${config.username}>`, to: to.join(","), subject: text(req.body.subject) || "Convocation information", html: text(req.body.body).replace(/\n/g, "<br />"), text: text(req.body.body) });
    const log = await ConvocationEmailLog.create({ colid, academicyear: text(req.body.academicyear), programcode: text(req.body.programcode), semester: text(req.body.semester), subject: text(req.body.subject), body: text(req.body.body), emailconfigurationid: text(req.body.emailconfigurationid), sentcount: to.length, recipients, status: "Sent" });
    res.json({ success: true, sent: to.length, log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
