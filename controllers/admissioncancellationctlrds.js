const User = require("../Models/user");
const Ledgerstud = require("../Models/ledgerstud");
const AdmissionRefund = require("../Models/admissionrefundds");
const Institution = require("../Models/insdetails");

const studentFilterFields = [
  { field: "academicyear", label: "Academic Year" },
  { field: "regulation", label: "Regulation" },
  { field: "program", label: "Program" },
  { field: "programcode", label: "Program Code" },
  { field: "section", label: "Section" },
  { field: "semester", label: "Semester" },
  { field: "Major", label: "Major" },
  { field: "Minor", label: "Minor" },
  { field: "IDC", label: "IDC" },
  { field: "name", label: "Name" },
  { field: "email", label: "Email" },
  { field: "regno", label: "Reg No" },
  { field: "phone", label: "Phone" }
];

const refundFilterFields = [
  { field: "academicyear", label: "Academic Year" },
  { field: "regulation", label: "Regulation" },
  { field: "program", label: "Program" },
  { field: "programcode", label: "Program Code" },
  { field: "section", label: "Section" },
  { field: "semester", label: "Semester" },
  { field: "major", label: "Major" },
  { field: "minor", label: "Minor" },
  { field: "student", label: "Student" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "regno", label: "Reg No" },
  { field: "feegroup", label: "Fee Group" },
  { field: "feeitem", label: "Fee Item" },
  { field: "refundmode", label: "Refund Mode" },
  { field: "refundrefno", label: "Refund Ref No" }
];

const studentAllowed = new Set(studentFilterFields.map((item) => item.field));
const refundAllowed = new Set(refundFilterFields.map((item) => item.field));

const clean = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escapeRegex = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFilterQuery = (filters = [], allowedFields, textFields = []) => {
  const query = {};
  filters.forEach((filter) => {
    const field = clean(filter.field);
    if (!allowedFields.has(field)) return;
    const raw = filter.value;
    if (Array.isArray(raw)) {
      const values = raw.map(clean).filter(Boolean);
      if (values.length) query[field] = { $in: values };
      return;
    }
    const value = clean(raw);
    if (!value) return;
    if (textFields.includes(field) || clean(filter.operator) === "contains") {
      query[field] = { $regex: escapeRegex(value), $options: "i" };
    } else {
      query[field] = value;
    }
  });
  return query;
};

const summaryTotals = (rows) => rows.reduce((sum, row) => ({
  amount: sum.amount + Number(row.amount || 0),
  paid: sum.paid + Number(row.paid || 0),
  refunded: sum.refunded + Number(row.refunded || 0),
  administrativecharges: sum.administrativecharges + Number(row.administrativecharges || 0),
  netrefund: sum.netrefund + Number(row.netrefund || row.refunded || 0),
  count: sum.count + 1
}), { amount: 0, paid: 0, refunded: 0, administrativecharges: 0, netrefund: 0, count: 0 });

exports.getStudentOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const baseQuery = { colid, role: { $regex: /^Student$/i } };
    const entries = await Promise.all(studentFilterFields.map(async ({ field, label }) => {
      const values = await User.distinct(field, baseQuery);
      return [field, { label, values: values.map(clean).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }];
    }));
    res.json({ success: true, fields: studentFilterFields, options: Object.fromEntries(entries) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filters = Array.isArray(req.body.filters) ? req.body.filters : [];
    const query = {
      colid,
      role: { $regex: /^Student$/i },
      ...buildFilterQuery(filters, studentAllowed, ["name", "email", "regno", "phone"])
    };
    const data = await User.find(query)
      .select("name email user phone regno academicyear admissionyear program programcode regulation semester section Major Minor IDC category gender status colid")
      .sort({ academicyear: -1, program: 1, semester: 1, section: 1, name: 1 })
      .limit(500)
      .lean();
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentPaidFees = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const regno = clean(req.body.regno);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });

    const [student, fees] = await Promise.all([
      User.findOne({ colid, regno }).select("name email user phone regno academicyear admissionyear program programcode regulation semester section Major Minor IDC category gender status colid").lean(),
      Ledgerstud.find({ colid, regno, paid: { $gt: 0 } })
        .select("academicyear regulation programcode major minor semester feegroup feeitem amount paid concession balance paiddate feebook cashbook status")
        .sort({ academicyear: -1, feegroup: 1, feeitem: 1 })
        .lean()
    ]);

    res.json({ success: true, student, data: fees, count: fees.length, totals: summaryTotals(fees) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveCancellation = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const student = req.body.student || {};
    const refunds = Array.isArray(req.body.refunds) ? req.body.refunds : [];
    const regno = clean(student.regno || req.body.regno);
    const refunddate = req.body.refunddate ? new Date(req.body.refunddate) : new Date();
    const refundmode = clean(req.body.refundmode);
    const refundrefno = clean(req.body.refundrefno);
    const administrativecharges = Math.max(0, Number(req.body.administrativecharges || 0));

    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno) return res.status(400).json({ success: false, message: "Please select a student" });
    if (!refundmode) return res.status(400).json({ success: false, message: "Refund mode is required" });

    const validRefunds = refunds
      .map((row) => ({ ...row, refunded: Number(row.refunded || 0) }))
      .filter((row) => row.refunded > 0);
    if (!validRefunds.length) return res.status(400).json({ success: false, message: "Please enter refund amount for at least one fee item" });

    const user = await User.findOne({ colid, regno, role: { $regex: /^Student$/i } }).lean();
    if (!user) return res.status(404).json({ success: false, message: "Student not found" });

    const grossRefund = validRefunds.reduce((sum, row) => sum + Number(row.refunded || 0), 0);
    const totalCharges = Math.min(administrativecharges, grossRefund);
    const docs = validRefunds.map((row, index) => {
      const refunded = Number(row.refunded || 0);
      const proportionalCharge = grossRefund > 0 ? (refunded / grossRefund) * totalCharges : 0;
      const rowCharge = index === validRefunds.length - 1
        ? totalCharges - validRefunds.slice(0, index).reduce((sum, item) => sum + (grossRefund > 0 ? (Number(item.refunded || 0) / grossRefund) * totalCharges : 0), 0)
        : proportionalCharge;
      return ({
      academicyear: clean(user.academicyear || row.academicyear),
      regulation: clean(user.regulation || row.regulation),
      major: clean(user.Major || row.major),
      minor: clean(user.Minor || row.minor),
      program: clean(user.program || student.program),
      programcode: clean(user.programcode || row.programcode),
      semester: clean(user.semester || row.semester),
      section: clean(user.section || student.section),
      student: clean(user.name || student.name),
      email: clean(user.email || student.email),
      phone: clean(user.phone || student.phone),
      regno,
      feegroup: clean(row.feegroup),
      feeitem: clean(row.feeitem),
      amount: Number(row.amount || 0),
      paid: Number(row.paid || 0),
      refunded,
      grossrefund: refunded,
      administrativecharges: Math.round(rowCharge * 100) / 100,
      netrefund: Math.max(0, Math.round((refunded - rowCharge) * 100) / 100),
      refunddate,
      refundmode,
      refundrefno,
      ledgerid: clean(row._id || row.ledgerid),
      colid,
      createdby: clean(req.body.createdby),
      createdname: clean(req.body.createdname)
    });
    });

    await AdmissionRefund.insertMany(docs);
    await User.updateOne({ _id: user._id, colid }, { $set: { status: 0, status1: "Admission Cancelled" } });

    res.json({ success: true, message: `Admission cancelled and ${docs.length} refund item(s) saved`, inserted: docs.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRefundOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const baseQuery = { colid };
    const entries = await Promise.all(refundFilterFields.map(async ({ field, label }) => {
      const values = await AdmissionRefund.distinct(field, baseQuery);
      return [field, { label, values: values.map(clean).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }];
    }));
    res.json({ success: true, fields: refundFilterFields, options: Object.fromEntries(entries) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchRefunds = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filters = Array.isArray(req.body.filters) ? req.body.filters : [];
    const query = {
      colid,
      ...buildFilterQuery(filters, refundAllowed, ["student", "email", "phone", "regno", "refundrefno"])
    };
    const [data, institution] = await Promise.all([
      AdmissionRefund.find(query).sort({ refunddate: -1, student: 1, feegroup: 1, feeitem: 1 }).lean(),
      Institution.findOne({ colid }).lean()
    ]);
    res.json({ success: true, data, count: data.length, totals: summaryTotals(data), institution: institution || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
