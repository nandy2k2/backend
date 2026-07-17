const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const CounterFee2Transaction = require("../Models/counterfee2transactionds");
const ChequeFeesPayment = require("../Models/chequefeespaymentds");
const FeesReceiptNote = require("../Models/feesreceiptnoteds");

const allowedFilters = [
  "academicyear", "admissionyear", "student", "regno", "regulation", "major", "minor",
  "program", "programcode", "semester", "section", "feegroup", "feeitem", "feebook",
  "cashbook", "feecategory", "feetype", "paymode", "transactionid", "referenceNumber"
];

const ledgerFilters = allowedFilters.filter((field) => !["paymode", "transactionid", "referenceNumber"].includes(field));

function toNumber(value, fallback = undefined) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value ?? "").trim();
}

function regex(value) {
  return new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function dayRange(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { $gte: start, $lte: end };
}

function startOfTomorrow() {
  const date = new Date();
  date.setHours(24, 0, 0, 0);
  return date;
}

function transactionId(colid) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  return `CF2-${colid}-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function applyQueryFilters(query, source, fields) {
  fields.forEach((field) => {
    const value = source[field];
    if (!value) return;
    if (["student", "feeitem", "feegroup", "regno", "transactionid", "referenceNumber"].includes(field)) query[field] = regex(value);
    else query[field] = value;
  });
}

async function studentInfo(colid, regno, userEmail) {
  if (!regno && !userEmail) return {};
  const query = { colid };
  if (regno) query.regno = regno;
  else query.user = userEmail;
  return await User.findOne(query)
    .select("name student email user phone address regno academicyear admissionyear program programcode regulation semester section Major Minor major minor colid")
    .lean() || {};
}

exports.getPendingLedger = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid, balance: { $gt: 0 } };
    applyQueryFilters(query, req.query, ledgerFilters);
    const data = await Ledgerstud.find(query)
      .sort({ academicyear: -1, student: 1, regno: 1, feegroup: 1, feeitem: 1 })
      .limit(3000)
      .lean();

    const options = {};
    ledgerFilters.forEach((field) => {
      options[field] = Array.from(new Set(data.map((row) => text(row[field])).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    res.json({ success: true, count: data.length, data, options, fields: ledgerFilters });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.postPayment = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const paiddate = req.body.paiddate ? new Date(req.body.paiddate) : new Date();
    if (colid === undefined || !items.length) return res.status(400).json({ success: false, message: "colid and payment items are required" });
    if (Number.isNaN(paiddate.getTime())) return res.status(400).json({ success: false, message: "Valid paid date is required" });
    if (paiddate >= startOfTomorrow()) return res.status(400).json({ success: false, message: "Future receipt date is not allowed" });

    const txid = transactionId(colid);
    const updatedLedgers = [];
    const txItems = [];
    const pendingCheques = [];
    const mode = text(req.body.paymode) || "Cash";
    const isCheque = mode.toLowerCase() === "cheque";

    for (const item of items) {
      const amountReceived = toNumber(item.amountreceived, 0);
      if (!item.id || amountReceived <= 0) continue;
      const ledger = await Ledgerstud.findOne({ _id: item.id, colid });
      if (!ledger) continue;
      const previousPaid = toNumber(ledger.paid, 0);
      const previousBalance = Math.max(0, toNumber(ledger.balance, 0));
      const paidAmount = Math.min(amountReceived, previousBalance);
      if (paidAmount <= 0) continue;

      const info = await studentInfo(colid, ledger.regno, ledger.user);
      const newPaid = previousPaid + paidAmount;
      const newBalance = Math.max(0, previousBalance - paidAmount);
      const modeField = mode.toLowerCase();

      const history = Array.isArray(ledger.approvalhistory) ? ledger.approvalhistory : [];
      history.push({
        action: "Counter Fee 2 Payment",
        transactionid: txid,
        user: text(req.body.user),
        remarks: text(req.body.remarks),
        date: new Date(),
        paiddate,
        amountreceived: paidAmount,
        oldpaid: previousPaid,
        newpaid: newPaid,
        oldbalance: previousBalance,
        newbalance: newBalance
      });

      const row = {
        ledgerid: String(ledger._id),
        academicyear: ledger.academicyear || info.academicyear || "",
        admissionyear: ledger.admissionyear || info.admissionyear || "",
        regulation: ledger.regulation || info.regulation || "",
        program: info.program || "",
        programcode: ledger.programcode || info.programcode || "",
        semester: ledger.semester || info.semester || "",
        section: info.section || "",
        major: ledger.major || info.Major || info.major || "",
        minor: ledger.minor || info.Minor || info.minor || "",
        student: ledger.student || info.name || "",
        regno: ledger.regno || info.regno || "",
        email: info.email || info.user || ledger.user || "",
        phone: info.phone || "",
        address: info.address || "",
        feegroup: ledger.feegroup || "",
        feeitem: ledger.feeitem || "",
        feecategory: ledger.feecategory || "",
        feetype: ledger.feetype || "",
        feebook: ledger.feebook || "",
        cashbook: ledger.cashbook || "",
        amount: toNumber(ledger.amount, 0),
        previouspaid: previousPaid,
        previousbalance: previousBalance,
        paidamount: paidAmount,
        newpaid: newPaid,
        newbalance: newBalance
      };

      if (isCheque) {
        const pending = await ChequeFeesPayment.create({
          colid,
          source: "Counter Fee 2",
          ledgerid: String(ledger._id),
          transactionid: txid,
          originaldate: paiddate,
          referenceNumber: text(req.body.referenceNumber) || text(req.body.paydetails),
          chequenumber: text(req.body.chequenumber),
          paydetails: text(req.body.paydetails),
          remarks: text(req.body.remarks),
          status: "Pending",
          ...row,
          chequeamount: paidAmount,
          collectedby: text(req.body.user),
          collectedbyname: text(req.body.name)
        });
        pendingCheques.push(pending);
        txItems.push(row);
        continue;
      }

      ledger.paid = newPaid;
      ledger.balance = newBalance;
      ledger.paiddate = paiddate;
      ledger.paymode = mode;
      ledger.paydetails = text(req.body.paydetails) || text(req.body.referenceNumber) || ledger.paydetails;
      ledger.feecounter = text(req.body.feecounter) || text(req.body.user) || ledger.feecounter;
      ledger.status = newBalance <= 0 ? "paid" : ledger.status;
      if (["cash", "upi", "cheque", "card", "pg", "neft"].includes(modeField)) ledger[modeField] = toNumber(ledger[modeField], 0) + paidAmount;
      ledger.approvalhistory = history;
      await ledger.save();

      txItems.push(row);
      updatedLedgers.push(ledger);
    }

    if (!txItems.length) return res.status(400).json({ success: false, message: "No valid payment item was updated" });
    if (isCheque) {
      return res.json({
        success: true,
        cheque: true,
        pending: pendingCheques.length,
        transactionid: txid,
        message: "Cheque payment recorded as pending. Ledger will update after cheque realization.",
        data: pendingCheques
      });
    }
    const first = txItems[0];
    const totalpaid = txItems.reduce((sum, item) => sum + toNumber(item.paidamount, 0), 0);
    const transaction = await CounterFee2Transaction.create({
      colid,
      transactionid: txid,
      paiddate,
      referenceNumber: text(req.body.referenceNumber) || text(req.body.paydetails),
      chequenumber: text(req.body.chequenumber),
      paymode: text(req.body.paymode) || "Cash",
      paydetails: text(req.body.paydetails),
      remarks: text(req.body.remarks),
      collectedby: text(req.body.user),
      collectedbyname: text(req.body.name),
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

    res.json({ success: true, updated: updatedLedgers.length, transactionid: txid, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    applyQueryFilters(query, req.query, allowedFilters);
    const from = dayRange(req.query.fromdate);
    const to = dayRange(req.query.todate);
    if (from || to) query.paiddate = { ...(from ? { $gte: from.$gte } : {}), ...(to ? { $lte: to.$lte } : {}) };
    const data = await CounterFee2Transaction.find(query).sort({ paiddate: -1, createdAt: -1 }).limit(3000).lean();
    const options = {};
    allowedFilters.forEach((field) => {
      options[field] = Array.from(new Set(data.map((row) => text(row[field])).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    res.json({ success: true, count: data.length, data, options, fields: allowedFilters });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReceipt = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const transactionid = text(req.query.transactionid);
    if (colid === undefined || !transactionid) return res.status(400).json({ success: false, message: "colid and transaction id are required" });
    const [transaction, institution, note] = await Promise.all([
      CounterFee2Transaction.findOne({ colid, transactionid }).lean(),
      Institution.findOne({ colid }).lean(),
      FeesReceiptNote.findOne({ colid, isactive: "Yes", note: { $ne: "" } }).sort({ updatedAt: -1 }).lean()
    ]);
    if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found" });
    res.json({ success: true, data: transaction, institution: institution || null, note: note || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
