const Ledgerstud = require("../Models/ledgerstud");
const ChequeFeesPayment = require("../Models/chequefeespaymentds");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const dayRange = (from, to) => {
  const query = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);
      query.$gte = start;
    }
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      query.$lte = end;
    }
  }
  return Object.keys(query).length ? query : null;
};

const filterFields = [
  "academicyear", "admissionyear", "regulation", "program", "programcode", "semester", "section",
  "major", "minor", "student", "regno", "feegroup", "feeitem", "feecategory", "feetype",
  "feebook", "cashbook", "status", "source", "referenceNumber", "transactionid"
];

exports.list = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    filterFields.forEach((field) => {
      if (!req.query[field]) return;
      query[field] = ["student", "regno", "feeitem", "referenceNumber", "transactionid"].includes(field)
        ? regex(req.query[field])
        : req.query[field];
    });
    const originalRange = dayRange(req.query.originalfrom, req.query.originalto);
    if (originalRange) query.originaldate = originalRange;
    const realizedRange = dayRange(req.query.realizedfrom, req.query.realizedto);
    if (realizedRange) query.chequerealizeddate = realizedRange;
    const data = await ChequeFeesPayment.find(query).sort({ originaldate: -1, createdAt: -1 }).limit(5000).lean();
    const options = {};
    filterFields.forEach((field) => {
      options[field] = Array.from(new Set(data.map((row) => text(row[field])).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    res.json({ success: true, data, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.realize = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const realizedDate = req.body.chequerealizeddate ? new Date(req.body.chequerealizeddate) : new Date();
    if (colid === undefined || !ids.length) return res.status(400).json({ success: false, message: "colid and cheque record are required" });
    if (Number.isNaN(realizedDate.getTime())) return res.status(400).json({ success: false, message: "Valid cheque realized date is required" });

    const updated = [];
    for (const id of ids) {
      const cheque = await ChequeFeesPayment.findOne({ _id: id, colid });
      if (!cheque || cheque.status === "Paid") continue;
      const ledger = await Ledgerstud.findOne({ _id: cheque.ledgerid, colid });
      if (!ledger) continue;
      const currentPaid = number(ledger.paid);
      const currentBalance = Math.max(0, number(ledger.balance));
      const paidAmount = Math.min(number(cheque.chequeamount), currentBalance);
      if (paidAmount <= 0) continue;
      const newPaid = currentPaid + paidAmount;
      const newBalance = Math.max(0, currentBalance - paidAmount);
      const history = Array.isArray(ledger.approvalhistory) ? ledger.approvalhistory : [];
      history.push({
        action: "Cheque Realized",
        chequeid: String(cheque._id),
        transactionid: cheque.transactionid,
        user: text(req.body.user),
        remarks: text(req.body.remarks) || cheque.remarks,
        date: new Date(),
        originaldate: cheque.originaldate,
        chequerealizeddate: realizedDate,
        amountreceived: paidAmount,
        oldpaid: currentPaid,
        newpaid: newPaid,
        oldbalance: currentBalance,
        newbalance: newBalance
      });

      ledger.paid = newPaid;
      ledger.balance = newBalance;
      ledger.paiddate = realizedDate;
      ledger.paymode = "Cheque";
      ledger.paydetails = cheque.paydetails || cheque.referenceNumber || ledger.paydetails;
      ledger.feecounter = cheque.collectedby || text(req.body.user) || ledger.feecounter;
      ledger.cheque = number(ledger.cheque) + paidAmount;
      ledger.status = newBalance <= 0 ? "paid" : ledger.status;
      ledger.approvalhistory = history;
      await ledger.save();

      cheque.status = "Paid";
      cheque.chequerealizeddate = realizedDate;
      cheque.realizedby = text(req.body.user);
      cheque.realizedbyname = text(req.body.name);
      cheque.newpaid = newPaid;
      cheque.newbalance = newBalance;
      if (req.body.remarks) cheque.remarks = text(req.body.remarks);
      await cheque.save();
      updated.push(cheque);
    }
    if (!updated.length) return res.status(400).json({ success: false, message: "No pending cheque could be realized" });
    res.json({ success: true, updated: updated.length, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
