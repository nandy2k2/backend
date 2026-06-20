const Ledgerstud = require("../Models/ledgerstud");
const MPrograms = require("../Models/mprograms");

const allowedFields = [
  "academicyear",
  "admissionyear",
  "student",
  "regno",
  "programcode",
  "regulation",
  "major",
  "minor",
  "semester",
  "feebook",
  "cashbook",
  "feegroup",
  "feeitem",
  "feecategory",
  "feetype",
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

function cleanFields(fields) {
  const raw = Array.isArray(fields) ? fields : String(fields || "").split(",");
  return raw.map((field) => String(field || "").trim()).filter((field) => allowedFields.includes(field));
}

exports.getFeesPivot = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const fields = cleanFields(req.query.fields);
    if (!fields.length) return res.status(400).json({ success: false, message: "Select at least one pivot field" });

    const paiddate = { $exists: true, $ne: null };
    const from = dateAtStart(req.query.fromdate);
    const to = dateAtEnd(req.query.todate);
    if (from) paiddate.$gte = from;
    if (to) paiddate.$lte = to;

    const match = { colid, paiddate };
    const groupId = {};
    fields.forEach((field) => {
      groupId[field] = { $ifNull: [`$${field}`, "Not specified"] };
    });

    const rows = await Ledgerstud.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$amount", 0] } },
          paid: { $sum: { $ifNull: ["$paid", 0] } },
          concession: { $sum: { $ifNull: ["$concession", 0] } },
          balance: { $sum: { $ifNull: ["$balance", 0] } }
        }
      },
      { $sort: { paid: -1, amount: -1 } },
      { $limit: 5000 }
    ]);

    const data = rows.map((row, index) => {
      const item = { id: index + 1, count: row.count, amount: row.amount, paid: row.paid, concession: row.concession, balance: row.balance };
      fields.forEach((field) => {
        item[field] = row._id?.[field] || "Not specified";
      });
      item.label = fields.map((field) => item[field]).join(" / ");
      return item;
    });

    const totals = data.reduce((sum, row) => ({
      count: sum.count + Number(row.count || 0),
      amount: sum.amount + Number(row.amount || 0),
      paid: sum.paid + Number(row.paid || 0),
      concession: sum.concession + Number(row.concession || 0),
      balance: sum.balance + Number(row.balance || 0)
    }), { count: 0, amount: 0, paid: 0, concession: 0, balance: 0 });

    res.json({ success: true, fields, data, totals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load fees pivot" });
  }
};

exports.getFeesPivot2 = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const fields = cleanFields(req.query.fields);
    if (!fields.length) return res.status(400).json({ success: false, message: "Select at least one pivot field" });

    const paiddate = { $exists: true, $ne: null };
    const from = dateAtStart(req.query.fromdate);
    const to = dateAtEnd(req.query.todate);
    if (from) paiddate.$gte = from;
    if (to) paiddate.$lte = to;

    const match = { colid, paiddate };
    const groupId = {};
    fields.forEach((field) => {
      groupId[field] = { $ifNull: [`$${field}`, "Not specified"] };
    });

    const rows = await Ledgerstud.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$amount", 0] } },
          paid: { $sum: { $ifNull: ["$paid", 0] } },
          concession: { $sum: { $ifNull: ["$concession", 0] } },
          balance: { $sum: { $ifNull: ["$balance", 0] } }
        }
      },
      { $sort: { paid: -1, amount: -1 } },
      { $limit: 5000 }
    ]);

    const addProgramDetails = fields.includes("programcode");
    let programMap = new Map();
    let programYearMap = new Map();
    if (addProgramDetails) {
      const programcodes = rows.map((row) => String(row._id?.programcode || "").trim()).filter((value) => value && value !== "Not specified");
      const programs = await MPrograms.find({ colid, programcode: { $in: [...new Set(programcodes)] } }).sort({ year: -1, Order: 1, program: 1 }).lean();
      programs.forEach((program) => {
        const code = String(program.programcode || "").trim();
        const year = String(program.year || "").trim();
        if (!code) return;
        if (year && !programYearMap.has(`${year}||${code}`)) programYearMap.set(`${year}||${code}`, program);
        if (!programMap.has(code)) programMap.set(code, program);
      });
    }

    const data = rows.map((row, index) => {
      const item = { id: index + 1, count: row.count, amount: row.amount, paid: row.paid, concession: row.concession, balance: row.balance };
      fields.forEach((field) => {
        item[field] = row._id?.[field] || "Not specified";
      });
      if (addProgramDetails) {
        const programcode = String(item.programcode || "").trim();
        const academicyear = String(item.academicyear || "").trim();
        const program = programYearMap.get(`${academicyear}||${programcode}`) || programMap.get(programcode) || {};
        item.programname = program.program || program.name || "";
        item.level = program.level || "";
      }
      item.label = fields.map((field) => {
        if (field === "programcode" && item.programname) return `${item.programcode} - ${item.programname}${item.level ? ` (${item.level})` : ""}`;
        return item[field];
      }).join(" / ");
      return item;
    });

    const totals = data.reduce((sum, row) => ({
      count: sum.count + Number(row.count || 0),
      amount: sum.amount + Number(row.amount || 0),
      paid: sum.paid + Number(row.paid || 0),
      concession: sum.concession + Number(row.concession || 0),
      balance: sum.balance + Number(row.balance || 0)
    }), { count: 0, amount: 0, paid: 0, concession: 0, balance: 0 });

    res.json({ success: true, fields, data, totals, programDetailsIncluded: addProgramDetails });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load fees pivot 2" });
  }
};

exports.getFeesPivotOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    res.json({ success: true, fields: allowedFields });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load fees pivot options" });
  }
};
