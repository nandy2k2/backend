const Fees = require("../Models/fees");

const filterFields = [
  "academicyear",
  "program",
  "programcode",
  "feecategory",
  "feegroup",
  "feeeitem",
  "feebook",
  "cashbook",
  "regulation",
  "major",
  "minor",
  "refundable"
];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildQuery(source = {}) {
  const query = {};
  const colid = toNumber(source.colid);
  if (colid !== undefined) query.colid = colid;

  filterFields.forEach((field) => {
    const values = parseList(source[field]);
    if (values.length) query[field] = { $in: values };
  });

  return query;
}

function moneyNumber(value) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function groupRows(rows, field) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row[field] || "Not specified";
    const current = map.get(key) || { name: key, count: 0, amount: 0 };
    current.count += 1;
    current.amount += moneyNumber(row.amount);
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

exports.getFeesModelReport = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) {
      return res.status(400).json({ success: false, message: "colid is required" });
    }

    const baseQuery = { colid };
    const query = buildQuery(req.query);

    const [rows, distinctValues] = await Promise.all([
      Fees.find(query)
        .sort({ academicyear: -1, programcode: 1, feegroup: 1, feeeitem: 1 })
        .lean(),
      Promise.all(filterFields.map((field) => Fees.distinct(field, baseQuery)))
    ]);

    const options = {};
    filterFields.forEach((field, index) => {
      options[field] = distinctValues[index]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    });

    const totalAmount = rows.reduce((sum, row) => sum + moneyNumber(row.amount), 0);
    const summary = {
      totalItems: rows.length,
      totalAmount,
      selectedFilters: filterFields.reduce((acc, field) => {
        acc[field] = parseList(req.query[field]);
        return acc;
      }, {}),
      byAcademicYear: groupRows(rows, "academicyear"),
      byProgram: groupRows(rows, "programcode"),
      byFeeGroup: groupRows(rows, "feegroup"),
      byFeeItem: groupRows(rows, "feeeitem"),
      byFeeBook: groupRows(rows, "feebook"),
      byCashBook: groupRows(rows, "cashbook")
    };

    res.json({ success: true, count: rows.length, data: rows, options, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
