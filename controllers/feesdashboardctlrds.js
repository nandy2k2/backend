const Ledgerstud = require("../Models/ledgerstud");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const dateAtStart = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};
const dateAtEnd = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
};

const filterFields = [
  "academicyear",
  "admissionyear",
  "regulation",
  "program",
  "programcode",
  "major",
  "minor",
  "semester",
  "feegroup",
  "feecategory",
  "feetype",
  "feeitem",
  "feebook",
  "cashbook",
  "paymode",
  "status",
  "type"
];

const makeQuery = (source = {}, includePaidDate = false) => {
  const colid = toNumber(source.colid);
  if (colid === undefined) return { error: "colid is required" };
  const query = { colid };
  filterFields.forEach((field) => {
    const value = text(source[field]);
    if (value) query[field] = value;
  });
  if (includePaidDate) {
    const paiddate = { $exists: true, $ne: null };
    const from = dateAtStart(source.fromdate);
    const to = dateAtEnd(source.todate);
    if (from) paiddate.$gte = from;
    if (to) paiddate.$lte = to;
    query.paiddate = paiddate;
  }
  return { colid, query };
};

const monthKey = (dateValue) => {
  if (!dateValue) return "No date";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "No date";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const groupRows = (rows, key, amountKey = "paid") => {
  const map = new Map();
  rows.forEach((row) => {
    const label = text(typeof key === "function" ? key(row) : row[key]) || "Not specified";
    const item = map.get(label) || { id: label, name: label, count: 0, amount: 0, paid: 0, concession: 0, balance: 0 };
    item.count += 1;
    item.amount += num(row.amount);
    item.paid += num(row.paid);
    item.concession += num(row.concession);
    item.balance += num(row.balance);
    item.value = item[amountKey] ?? item.paid;
    map.set(label, item);
  });
  return [...map.values()].sort((a, b) => num(b.value) - num(a.value));
};

const totals = (rows) => rows.reduce((sum, row) => ({
  count: sum.count + 1,
  amount: sum.amount + num(row.amount),
  paid: sum.paid + num(row.paid),
  concession: sum.concession + num(row.concession),
  balance: sum.balance + num(row.balance),
  lateFineDue: sum.lateFineDue + num(row.Latefinedue),
  lateFinePaid: sum.lateFinePaid + num(row.Latefinepaid)
}), { count: 0, amount: 0, paid: 0, concession: 0, balance: 0, lateFineDue: 0, lateFinePaid: 0 });

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const optionPairs = await Promise.all(filterFields.map(async (field) => {
      const values = await Ledgerstud.distinct(field, { colid });
      return [field, values.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
    }));
    res.json({ success: true, fields: filterFields, options: Object.fromEntries(optionPairs) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load fees dashboard options" });
  }
};

exports.summary = async (req, res) => {
  try {
    const built = makeQuery(req.query, false);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const paidBuilt = makeQuery(req.query, true);
    const ledgerRows = await Ledgerstud.find(built.query)
      .select("academicyear admissionyear regulation program programcode major minor semester student name regno user feegroup feecategory feetype feeitem feebook cashbook status paymode type paiddate duedate amount paid concession balance Latefinedue Latefinepaid cash upi cheque card pg neft")
      .sort({ academicyear: -1, programcode: 1, student: 1 })
      .limit(20000)
      .lean();
    const paidRows = await Ledgerstud.find(paidBuilt.query)
      .select("academicyear admissionyear regulation program programcode major minor semester student name regno user feegroup feecategory feetype feeitem feebook cashbook status paymode type paiddate amount paid concession balance Latefinedue Latefinepaid cash upi cheque card pg neft")
      .sort({ paiddate: -1 })
      .limit(20000)
      .lean();
    const pendingRows = ledgerRows.filter((row) => num(row.balance) > 0);
    const dueRows = pendingRows.filter((row) => row.duedate && new Date(row.duedate) < new Date());
    const total = totals(ledgerRows);
    const collected = totals(paidRows);
    const pending = totals(pendingRows);

    const paymentSourceRows = [];
    paidRows.forEach((row) => {
      ["cash", "upi", "cheque", "card", "pg", "neft"].forEach((source) => {
        if (num(row[source]) > 0) paymentSourceRows.push({ ...row, source, paid: num(row[source]) });
      });
      if (!["cash", "upi", "cheque", "card", "pg", "neft"].some((source) => num(row[source]) > 0)) {
        paymentSourceRows.push({ ...row, source: row.paymode || row.type || "Not specified", paid: num(row.paid) });
      }
    });

    res.json({
      success: true,
      filters: req.query,
      summary: {
        ledgerItems: total.count,
        totalDemand: total.amount,
        totalCollected: collected.paid,
        totalPending: pending.balance,
        totalConcession: total.concession,
        overduePending: totals(dueRows).balance,
        lateFineDue: total.lateFineDue,
        lateFinePaid: total.lateFinePaid,
        collectionRate: total.amount ? Number(((collected.paid / total.amount) * 100).toFixed(2)) : 0
      },
      charts: {
        collectedByMonth: groupRows(paidRows, (row) => monthKey(row.paiddate), "paid").sort((a, b) => a.name.localeCompare(b.name)),
        pendingByProgram: groupRows(pendingRows, (row) => row.program || row.programcode, "balance"),
        pendingByFeeGroup: groupRows(pendingRows, "feegroup", "balance"),
        paymentBySource: groupRows(paymentSourceRows, "source", "paid"),
        collectionByFeeGroup: groupRows(paidRows, "feegroup", "paid"),
        collectionByFeeItem: groupRows(paidRows, "feeitem", "paid"),
        collectionByBook: groupRows(paidRows, "feebook", "paid"),
        collectionByCashbook: groupRows(paidRows, "cashbook", "paid"),
        concessionByProgram: groupRows(ledgerRows, (row) => row.program || row.programcode, "concession"),
        overdueByProgram: groupRows(dueRows, (row) => row.program || row.programcode, "balance")
      },
      tables: {
        recentCollections: paidRows.slice(0, 100),
        topPending: pendingRows.sort((a, b) => num(b.balance) - num(a.balance)).slice(0, 100),
        overdue: dueRows.sort((a, b) => num(b.balance) - num(a.balance)).slice(0, 100)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load fees dashboard" });
  }
};

exports.drilldown = async (req, res) => {
  try {
    const type = text(req.query.type);
    const usePaid = ["collected", "month", "source", "feegroup-collected", "feeitem-collected", "book-collected"].includes(type);
    const built = makeQuery(req.query, usePaid);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const query = { ...built.query };
    if (type === "pending" || type === "program-pending" || type === "overdue") query.balance = { $gt: 0 };
    if (type === "overdue") query.duedate = { $lt: new Date() };
    const rows = await Ledgerstud.find(query)
      .select("academicyear admissionyear regulation program programcode major minor semester student name regno user feegroup feecategory feetype feeitem feebook cashbook status paymode type paiddate duedate amount paid concession balance Latefinedue Latefinepaid cash upi cheque card pg neft")
      .sort(type === "pending" || type === "overdue" ? { balance: -1 } : { paiddate: -1 })
      .limit(1000)
      .lean();
    res.json({ success: true, type, data: rows.map((row) => ({ ...row, id: String(row._id) })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load fees dashboard drilldown" });
  }
};
