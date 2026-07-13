const Ledgerstud = require("../Models/ledgerstud");
const ChequeFeesPayment = require("../Models/chequefeespaymentds");

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function text(value) {
  return String(value || "").trim();
}

function regex(value) {
  return new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

const allowedFilters = [
  "academicyear",
  "student",
  "regno",
  "regulation",
  "major",
  "minor",
  "programcode",
  "feegroup",
  "feeitem",
  "feebook",
  "cashbook",
  "semester",
  "feecategory"
];

exports.getCounterPaymentLedger = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid, balance: { $gt: 0 } };
    allowedFilters.forEach((field) => {
      if (!req.query[field]) return;
      query[field] = ["student", "feeitem", "feegroup"].includes(field) ? regex(req.query[field]) : req.query[field];
    });

    const data = await Ledgerstud.find(query)
      .sort({ academicyear: -1, student: 1, regno: 1, feegroup: 1, feeitem: 1 })
      .limit(3000)
      .lean();

    const students = Array.from(new Map(data.map((item) => [
      item.regno || item.student,
      {
        regno: item.regno || "",
        student: item.student || "",
        programcode: item.programcode || "",
        academicyear: item.academicyear || item.admissionyear || ""
      }
    ])).values()).sort((a, b) => `${a.student}${a.regno}`.localeCompare(`${b.student}${b.regno}`));

    const options = {};
    allowedFilters.forEach((field) => {
      options[field] = Array.from(new Set(data.map((row) => text(row[field])).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    });

    res.json({ success: true, count: data.length, data, students, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.postCounterPayment = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const paiddate = req.body.paiddate ? new Date(req.body.paiddate) : new Date();
    if (colid === undefined || !items.length) {
      return res.status(400).json({ success: false, message: "colid and payment items are required" });
    }
    if (Number.isNaN(paiddate.getTime())) {
      return res.status(400).json({ success: false, message: "Valid paid date is required" });
    }

    const mode = text(req.body.paymode) || "Cash";
    const isCheque = mode.toLowerCase() === "cheque";
    const updated = [];
    const pendingCheques = [];
    for (const item of items) {
      const amountReceived = toNumber(item.amountreceived);
      if (!item.id || !amountReceived || amountReceived <= 0) continue;

      const ledger = await Ledgerstud.findOne({ _id: item.id, colid });
      if (!ledger) continue;

      const currentPaid = toNumber(ledger.paid) || 0;
      const currentBalance = Math.max(0, toNumber(ledger.balance) || 0);
      const appliedAmount = Math.min(amountReceived, currentBalance);
      if (appliedAmount <= 0) continue;

      if (isCheque) {
        const pending = await ChequeFeesPayment.create({
          colid,
          source: "Counter Fee Payment",
          ledgerid: String(ledger._id),
          originaldate: paiddate,
          referenceNumber: text(req.body.referenceNumber) || text(req.body.paydetails),
          paydetails: text(req.body.paydetails),
          remarks: text(req.body.remarks),
          status: "Pending",
          academicyear: ledger.academicyear || "",
          admissionyear: ledger.admissionyear || "",
          regulation: ledger.regulation || "",
          programcode: ledger.programcode || "",
          semester: ledger.semester || "",
          major: ledger.major || "",
          minor: ledger.minor || "",
          student: ledger.student || "",
          regno: ledger.regno || "",
          email: ledger.user || "",
          feegroup: ledger.feegroup || "",
          feeitem: ledger.feeitem || "",
          feecategory: ledger.feecategory || "",
          feetype: ledger.feetype || "",
          feebook: ledger.feebook || "",
          cashbook: ledger.cashbook || "",
          amount: toNumber(ledger.amount) || 0,
          previouspaid: currentPaid,
          previousbalance: currentBalance,
          chequeamount: appliedAmount,
          collectedby: text(req.body.user),
          collectedbyname: text(req.body.name)
        });
        pendingCheques.push(pending);
        continue;
      }

      const newPaid = currentPaid + appliedAmount;
      const newBalance = Math.max(0, currentBalance - appliedAmount);
      const history = Array.isArray(ledger.approvalhistory) ? ledger.approvalhistory : [];
      history.push({
        action: "Counter Payment",
        user: text(req.body.user),
        remarks: text(req.body.remarks),
        date: new Date(),
        paiddate,
        amountreceived: appliedAmount,
        oldpaid: currentPaid,
        newpaid: newPaid,
        oldbalance: currentBalance,
        newbalance: newBalance
      });

      ledger.paid = newPaid;
      ledger.balance = newBalance;
      ledger.paiddate = paiddate;
      ledger.paymode = mode || ledger.paymode;
      ledger.paydetails = text(req.body.paydetails) || ledger.paydetails;
      ledger.feecounter = text(req.body.feecounter) || text(req.body.user) || ledger.feecounter;
      ledger.status = newBalance <= 0 ? "paid" : ledger.status;
      ledger.approvalhistory = history;
      await ledger.save();
      updated.push(ledger);
    }

    if (isCheque) {
      if (!pendingCheques.length) return res.status(400).json({ success: false, message: "No valid cheque payment item was recorded" });
      return res.json({ success: true, pending: pendingCheques.length, cheque: true, data: pendingCheques });
    }
    if (!updated.length) return res.status(400).json({ success: false, message: "No valid payment item was updated" });
    res.json({ success: true, updated: updated.length, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
