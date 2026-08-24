const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const StudentOnlinePayment = require("../Models/studentonlinepaymentds");

const filterFields = [
  "academicyear",
  "admissionyear",
  "regulation",
  "program",
  "programcode",
  "major",
  "minor",
  "semester",
  "section",
  "student",
  "name",
  "regno",
  "user",
  "feegroup",
  "feecategory",
  "feeitem",
  "feebook",
  "cashbook",
  "refundable",
  "status",
  "paymode",
  "type",
  "installment"
];

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function text(value) {
  return String(value || "").trim();
}

function dateAtStart(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateAtEnd(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value || "")
    .split(",")
    .map(text)
    .filter(Boolean);
}

function buildQuery(queryParams) {
  const colid = toNumber(queryParams.colid);
  if (colid === undefined) {
    return { error: "colid is required" };
  }

  const paiddate = { $exists: true, $ne: null };
  const from = dateAtStart(queryParams.fromdate);
  const to = dateAtEnd(queryParams.todate);
  if (from) paiddate.$gte = from;
  if (to) paiddate.$lte = to;

  const query = { colid, paiddate };
  filterFields.forEach((field) => {
    const values = normalizeArray(queryParams[field]);
    if (values.length === 1) query[field] = values[0];
    if (values.length > 1) query[field] = { $in: values };
  });

  return { query };
}

function groupRows(rows, field) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = text(row[field]) || "Not specified";
    const current = grouped.get(key) || {
      id: key,
      label: key,
      count: 0,
      amount: 0,
      paidamount: 0,
      concession: 0,
      balance: 0
    };
    current.count += 1;
    current.amount += Number(row.amount || 0);
    current.paidamount += Number(row.paidamount || 0);
    current.concession += Number(row.concession || 0);
    current.balance += Number(row.balance || 0);
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.paidamount - a.paidamount);
}

exports.getFeesPaidReportOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const baseQuery = { colid };
    const paiddate = {};
    const from = dateAtStart(req.query.fromdate);
    const to = dateAtEnd(req.query.todate);
    if (from) paiddate.$gte = from;
    if (to) paiddate.$lte = to;
    if (Object.keys(paiddate).length) baseQuery.paiddate = paiddate;

    const optionPairs = await Promise.all(
      filterFields.map(async (field) => {
        const values = await Ledgerstud.distinct(field, baseQuery);
        return [field, values.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b))];
      })
    );

    res.json({
      success: true,
      fields: filterFields,
      options: Object.fromEntries(optionPairs)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load fees paid report options" });
  }
};

exports.getFeesPaidReport = async (req, res) => {
  try {
    const { query, error } = buildQuery(req.query);
    if (error) return res.status(400).json({ success: false, message: error });

    const data = await Ledgerstud.find(query)
      .select("academicyear admissionyear regulation program programcode major minor semester section student name regno user feegroup feecategory feeitem feebook cashbook status paymode paydetails type installment paiddate amount paid concession balance comments colid")
      .sort({ programcode: 1, student: 1, paiddate: -1, feegroup: 1, feeitem: 1 })
      .limit(10000)
      .lean();

    const regnos = [...new Set(data.map((row) => text(row.regno)).filter(Boolean))];
    const ledgerIds = data.map((row) => String(row._id)).filter(Boolean);
    const [students, onlinePayments] = await Promise.all([
      User.find({ colid: query.colid, regno: { $in: regnos } })
        .select("regno program programcode academicyear admissionyear semester section")
        .lean(),
      StudentOnlinePayment.find({ colid: query.colid, "ledgeritems.ledgerid": { $in: ledgerIds } })
        .select("refno gatewayrefno gateway gatewaytype paymentstatus paiddate paidamount totalamount description ledgeritems")
        .lean()
    ]);

    const studentByRegno = new Map(students.map((student) => [text(student.regno), student]));
    const paymentByLedgerId = new Map();
    onlinePayments.forEach((payment) => {
      (payment.ledgeritems || []).forEach((item) => {
        if (item.ledgerid) paymentByLedgerId.set(String(item.ledgerid), payment);
      });
    });

    const rows = data.map((row) => ({
      ...row,
      program: row.program || studentByRegno.get(text(row.regno))?.program || row.programcode || "Not specified",
      student: row.student || row.name || "Not specified",
      paidamount: Number(row.paid || 0),
      paymentreference: row.paydetails || paymentByLedgerId.get(String(row._id))?.gatewayrefno || paymentByLedgerId.get(String(row._id))?.refno || "",
      onlinepaymentrefno: paymentByLedgerId.get(String(row._id))?.refno || "",
      gatewayrefno: paymentByLedgerId.get(String(row._id))?.gatewayrefno || "",
      gateway: paymentByLedgerId.get(String(row._id))?.gateway || "",
      gatewaytype: paymentByLedgerId.get(String(row._id))?.gatewaytype || "",
      paymentstatus: paymentByLedgerId.get(String(row._id))?.paymentstatus || row.status || "",
      transactiondescription: paymentByLedgerId.get(String(row._id))?.description || row.comments || ""
    }));

    const totals = rows.reduce((sum, row) => ({
      count: sum.count + 1,
      amount: sum.amount + Number(row.amount || 0),
      paidamount: sum.paidamount + Number(row.paidamount || 0),
      concession: sum.concession + Number(row.concession || 0),
      balance: sum.balance + Number(row.balance || 0)
    }), { count: 0, amount: 0, paidamount: 0, concession: 0, balance: 0 });

    res.json({
      success: true,
      count: rows.length,
      totals,
      data: rows,
      summaries: {
        program: groupRows(rows, "program"),
        programcode: groupRows(rows, "programcode"),
        feegroup: groupRows(rows, "feegroup"),
        feecategory: groupRows(rows, "feecategory"),
        feeitem: groupRows(rows, "feeitem"),
        paiddate: groupRows(rows.map((row) => ({
          ...row,
          paiddate: row.paiddate ? new Date(row.paiddate).toISOString().slice(0, 10) : ""
        })), "paiddate")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load fees paid report" });
  }
};
