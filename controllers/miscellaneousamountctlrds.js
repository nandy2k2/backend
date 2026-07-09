const MiscellaneousAmount = require("../Models/miscellaneousamountds");
const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const CounterFee2Transaction = require("../Models/counterfee2transactionds");

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const escapeRegex = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value) => new RegExp(escapeRegex(value), "i");
const studentFields = ["academicyear", "admissionyear", "regulation", "program", "programcode", "semester", "section", "Major", "Minor", "IDC", "name", "email", "phone", "regno"];
const miscFields = ["academicyear", "feegroup", "feeitem", "feecategory", "feetype", "feebook", "cashbook", "status"];

const txid = (colid) => {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return `MISC-${colid}-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
};

const applyFilters = (query, filters = [], textFields = []) => {
  filters.forEach((item) => {
    const field = clean(item.field);
    const value = clean(item.value);
    if (!field || !value) return;
    query[field] = textFields.includes(field) ? regex(value) : value;
  });
};

const payload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: clean(body.academicyear),
  feegroup: clean(body.feegroup) || "Miscellaneous",
  feeitem: clean(body.feeitem),
  description: clean(body.description),
  amount: number(body.amount),
  feebook: clean(body.feebook),
  cashbook: clean(body.cashbook),
  feecategory: clean(body.feecategory) || "Miscellaneous",
  feetype: clean(body.feetype) || "Miscellaneous",
  status: clean(body.status) || "Active",
  user: clean(body.user),
  name: clean(body.name)
});

exports.list = async (req, res) => {
  try {
    const query = { colid: number(req.query.colid) };
    miscFields.forEach((field) => {
      if (clean(req.query[field])) query[field] = clean(req.query[field]);
    });
    const data = await MiscellaneousAmount.find(query).sort({ academicyear: -1, feegroup: 1, feeitem: 1 }).limit(3000).lean();
    const options = {};
    miscFields.forEach((field) => {
      options[field] = [...new Set(data.map((row) => clean(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    res.json({ success: true, data, options, fields: miscFields });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    const data = payload(req.body);
    if (!data.colid || !data.feeitem) return res.status(400).json({ success: false, message: "Fee item is required" });
    const id = req.body.id || req.body._id;
    const saved = id
      ? await MiscellaneousAmount.findOneAndUpdate({ _id: id, colid: data.colid }, data, { new: true, runValidators: true })
      : await MiscellaneousAmount.create(data);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const deleted = await MiscellaneousAmount.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!deleted) return res.status(404).json({ success: false, message: "Miscellaneous amount not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!colid || !rows.length) return res.status(400).json({ success: false, message: "Rows are required" });
    const docs = rows.map((row) => payload({ ...row, colid, user: req.body.user, name: req.body.name })).filter((row) => row.feeitem);
    if (!docs.length) return res.status(400).json({ success: false, message: "No valid rows found" });
    await MiscellaneousAmount.insertMany(docs);
    res.json({ success: true, inserted: docs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.studentOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const base = { colid, role: /^Student$/i };
    const options = {};
    await Promise.all(studentFields.map(async (field) => {
      const values = await User.distinct(field, base);
      options[field] = values.map(clean).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({ success: true, fields: studentFields, options });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.searchStudents = async (req, res) => {
  try {
    const query = { colid: number(req.body.colid), role: /^Student$/i };
    applyFilters(query, Array.isArray(req.body.filters) ? req.body.filters : [], ["name", "email", "phone", "regno"]);
    const data = await User.find(query)
      .select("name email user phone address regno academicyear admissionyear program programcode regulation semester section Major Minor IDC category gender colid")
      .sort({ academicyear: -1, program: 1, name: 1 })
      .limit(1000)
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.collect = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const student = req.body.student || {};
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const paiddate = req.body.paiddate ? new Date(req.body.paiddate) : new Date();
    if (!colid || !clean(student.regno)) return res.status(400).json({ success: false, message: "Student is required" });
    if (!items.length) return res.status(400).json({ success: false, message: "Select miscellaneous amounts" });
    const user = await User.findOne({ colid, regno: clean(student.regno), role: /^Student$/i }).lean();
    if (!user) return res.status(404).json({ success: false, message: "Student not found" });
    const transactionid = txid(colid);
    const ledgers = [];
    const txItems = [];
    for (const item of items) {
      const amount = Math.max(0, number(item.paidamount ?? item.amount));
      if (amount <= 0) continue;
      const ledger = await Ledgerstud.create({
        name: user.name,
        user: user.email || user.user || "",
        feegroup: clean(item.feegroup) || "Miscellaneous",
        regno: user.regno,
        student: user.name,
        feeitem: clean(item.feeitem),
        amount,
        paid: amount,
        concession: 0,
        balance: 0,
        cash: clean(req.body.paymode).toLowerCase() === "cash" ? amount : 0,
        upi: clean(req.body.paymode).toLowerCase() === "upi" ? amount : 0,
        cheque: clean(req.body.paymode).toLowerCase() === "cheque" ? amount : 0,
        card: clean(req.body.paymode).toLowerCase() === "card" ? amount : 0,
        pg: clean(req.body.paymode).toLowerCase() === "pg" ? amount : 0,
        neft: clean(req.body.paymode).toLowerCase() === "neft" ? amount : 0,
        feebook: clean(item.feebook),
        cashbook: clean(item.cashbook),
        feecounter: clean(req.body.user),
        paymode: clean(req.body.paymode) || "Cash",
        paydetails: clean(req.body.paydetails || req.body.referenceNumber),
        feecategory: clean(item.feecategory) || "Miscellaneous",
        feetype: clean(item.feetype) || "Miscellaneous",
        semester: clean(user.semester),
        institution: clean(user.institution),
        type: "Miscellaneous",
        comments: clean(req.body.remarks),
        academicyear: clean(item.academicyear || user.academicyear) || "NA",
        colid,
        classdate: new Date(),
        paiddate,
        status: "paid",
        programcode: clean(user.programcode),
        regulation: clean(user.regulation),
        major: clean(user.Major || user.major),
        minor: clean(user.Minor || user.minor),
        feeid: clean(item._id),
        admissionyear: clean(user.admissionyear)
      });
      ledgers.push(ledger);
      txItems.push({
        ledgerid: String(ledger._id),
        academicyear: ledger.academicyear,
        admissionyear: ledger.admissionyear,
        regulation: ledger.regulation,
        program: clean(user.program),
        programcode: ledger.programcode,
        semester: ledger.semester,
        section: clean(user.section),
        major: ledger.major,
        minor: ledger.minor,
        student: user.name,
        regno: user.regno,
        email: clean(user.email || user.user),
        phone: clean(user.phone),
        address: clean(user.address),
        feegroup: ledger.feegroup,
        feeitem: ledger.feeitem,
        feecategory: ledger.feecategory,
        feetype: ledger.feetype,
        feebook: ledger.feebook,
        cashbook: ledger.cashbook,
        amount,
        previouspaid: 0,
        previousbalance: amount,
        paidamount: amount,
        newpaid: amount,
        newbalance: 0
      });
    }
    if (!txItems.length) return res.status(400).json({ success: false, message: "No valid amount entered" });
    const first = txItems[0];
    const totalpaid = txItems.reduce((sum, item) => sum + number(item.paidamount), 0);
    const transaction = await CounterFee2Transaction.create({
      colid,
      transactionid,
      paiddate,
      referenceNumber: clean(req.body.referenceNumber),
      paymode: clean(req.body.paymode) || "Cash",
      paydetails: clean(req.body.paydetails),
      remarks: clean(req.body.remarks),
      collectedby: clean(req.body.user),
      collectedbyname: clean(req.body.name),
      totalpaid,
      academicyear: first.academicyear,
      admissionyear: first.admissionyear,
      regulation: first.regulation,
      program: first.program,
      programcode: first.programcode,
      semester: first.semester,
      section: first.section,
      major: first.major,
      minor: first.minor,
      student: first.student,
      regno: first.regno,
      email: first.email,
      phone: first.phone,
      address: first.address,
      items: txItems
    });
    const institution = await Institution.findOne({ colid }).lean();
    res.json({ success: true, transactionid, data: transaction, institution: institution || null, ledgers: ledgers.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
