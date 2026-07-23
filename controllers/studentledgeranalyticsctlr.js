const Ledgerstud = require("../Models/ledgerstud");

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function text(value) {
  return String(value || "").trim();
}

const filterFields = [
  "academicyear",
  "regulation",
  "programcode",
  "feegroup",
  "feeitem",
  "feebook",
  "cashbook",
  "status",
  "major",
  "minor",
  "semester",
  "feecategory",
  "refundable"
];

function groupRows(rows, field) {
  const map = new Map();
  rows.forEach((row) => {
    const key = text(row[field]) || "Not specified";
    const item = map.get(key) || {
      _id: key,
      label: key,
      count: 0,
      amount: 0,
      concession: 0,
      paid: 0,
      balance: 0
    };
    item.count += 1;
    item.amount += toNumber(row.amount) || 0;
    item.concession += toNumber(row.concession) || 0;
    item.paid += toNumber(row.paid) || 0;
    item.balance += toNumber(row.balance) || 0;
    map.set(key, item);
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

exports.getStudentLedgerAnalytics = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid };
    filterFields.forEach((field) => {
      if (req.query[field]) query[field] = req.query[field];
    });

    const data = await Ledgerstud.find(query)
      .select("academicyear regulation programcode feegroup feeitem feebook cashbook status major minor semester feecategory amount concession paid balance colid")
      .sort({ academicyear: -1, programcode: 1, feegroup: 1, feeitem: 1 })
      .limit(5000)
      .lean();

    const totals = data.reduce((sum, row) => ({
      amount: sum.amount + (toNumber(row.amount) || 0),
      concession: sum.concession + (toNumber(row.concession) || 0),
      paid: sum.paid + (toNumber(row.paid) || 0),
      balance: sum.balance + (toNumber(row.balance) || 0)
    }), { amount: 0, concession: 0, paid: 0, balance: 0 });

    const options = {};
    filterFields.forEach((field) => {
      options[field] = Array.from(new Set(data.map((row) => text(row[field])).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    });

    res.json({
      success: true,
      count: data.length,
      totals,
      options,
      data,
      summaries: {
        feeitem: groupRows(data, "feeitem"),
        feegroup: groupRows(data, "feegroup"),
        programcode: groupRows(data, "programcode"),
        academicyear: groupRows(data, "academicyear")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
