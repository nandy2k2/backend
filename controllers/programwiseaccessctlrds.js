const ProgramwiseAccess = require("../Models/programwiseaccessds");
const Users = require("../Models/user");
const MPrograms = require("../Models/mprograms");
const Ledgerstud = require("../Models/ledgerstud");

const ledgerFields = [
  "academicyear",
  "admissionyear",
  "regulation",
  "programcode",
  "major",
  "minor",
  "semester",
  "student",
  "name",
  "regno",
  "user",
  "feegroup",
  "feecategory",
  "feetype",
  "feeitem",
  "feebook",
  "cashbook",
  "status",
  "paymode",
  "type",
  "installment"
];

function text(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function uniqueSorted(values) {
  return Array.from(new Set((values || []).map(text).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value || "")
    .split(",")
    .map(text)
    .filter(Boolean);
}

function escapeRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function totalRows(rows) {
  return rows.reduce(
    (sum, row) => ({
      count: sum.count + 1,
      amount: sum.amount + Number(row.amount || 0),
      paid: sum.paid + Number(row.paid || 0),
      concession: sum.concession + Number(row.concession || 0),
      balance: sum.balance + Number(row.balance || 0)
    }),
    { count: 0, amount: 0, paid: 0, concession: 0, balance: 0 }
  );
}

function groupRows(rows, key) {
  const grouped = new Map();
  rows.forEach((row) => {
    const label = text(row[key]) || "Not specified";
    const current = grouped.get(label) || { id: label, label, count: 0, amount: 0, paid: 0, concession: 0, balance: 0 };
    current.count += 1;
    current.amount += Number(row.amount || 0);
    current.paid += Number(row.paid || 0);
    current.concession += Number(row.concession || 0);
    current.balance += Number(row.balance || 0);
    grouped.set(label, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
}

async function getAccessPrograms(colid, useremail) {
  const access = await ProgramwiseAccess.find({ colid, useremail: text(useremail) })
    .select("program programcode department useremail username")
    .lean();
  const codes = uniqueSorted(access.map((row) => row.programcode));
  if (!codes.length) return { access, programs: [], codes: [], departments: [] };
  const programs = await MPrograms.find({ colid, programcode: { $in: codes } })
    .select("program programcode department year level type Order")
    .sort({ department: 1, Order: 1, program: 1, programcode: 1 })
    .lean();
  const programByCode = new Map(programs.map((row) => [text(row.programcode), row]));
  const merged = access.map((row) => ({
    ...row,
    program: row.program || programByCode.get(text(row.programcode))?.program || row.programcode,
    department: row.department || programByCode.get(text(row.programcode))?.department || "Not specified"
  }));
  return {
    access: merged,
    programs: merged,
    codes,
    departments: uniqueSorted(merged.map((row) => row.department || "Not specified"))
  };
}

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [users, programs] = await Promise.all([
      Users.find({ colid, role: { $not: /^Student$/i } })
        .select("name email role department")
        .sort({ name: 1, email: 1 })
        .limit(5000)
        .lean(),
      MPrograms.find({ colid })
        .select("year program programcode department level type Order")
        .sort({ department: 1, Order: 1, program: 1, programcode: 1 })
        .lean()
    ]);
    res.json({
      success: true,
      users,
      programs,
      departments: uniqueSorted(programs.map((row) => row.department))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load programwise access options" });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ProgramwiseAccess.find({ colid }).sort({ username: 1, department: 1, program: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load programwise access" });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (Array.isArray(req.body.entries)) {
      const entries = req.body.entries
        .map((entry) => ({
          colid,
          username: text(entry.username),
          useremail: text(entry.useremail),
          userid: text(entry.userid),
          program: text(entry.program),
          programcode: text(entry.programcode),
          department: text(entry.department),
          createdby: text(req.body.createdby || req.body.user),
          user: text(req.body.user)
        }))
        .filter((entry) => entry.useremail && entry.programcode);

      if (!entries.length) return res.status(400).json({ success: false, message: "Select at least one user and one program" });

      const data = [];
      for (const entry of entries) {
        const saved = await ProgramwiseAccess.findOneAndUpdate(
          { colid, useremail: entry.useremail, programcode: entry.programcode },
          entry,
          { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
        );
        data.push(saved);
      }
      return res.json({ success: true, data, message: `${data.length} program access entries saved` });
    }

    if (!text(req.body.useremail)) return res.status(400).json({ success: false, message: "User email is required" });
    if (!text(req.body.programcode)) return res.status(400).json({ success: false, message: "Program code is required" });

    const payload = {
      colid,
      username: text(req.body.username),
      useremail: text(req.body.useremail),
      userid: text(req.body.userid),
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      department: text(req.body.department),
      createdby: text(req.body.createdby || req.body.user),
      user: text(req.body.user)
    };

    let data;
    if (req.body.id) {
      data = await ProgramwiseAccess.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true });
    } else {
      data = await ProgramwiseAccess.findOneAndUpdate(
        { colid, useremail: payload.useremail, programcode: payload.programcode },
        payload,
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
    }
    res.json({ success: true, data, message: "Program access saved" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to save program access" });
  }
};

exports.remove = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined || !req.body.id) return res.status(400).json({ success: false, message: "colid and id are required" });
    await ProgramwiseAccess.findOneAndDelete({ _id: req.body.id, colid });
    res.json({ success: true, message: "Program access deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to delete program access" });
  }
};

exports.reportOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const accessData = await getAccessPrograms(colid, req.query.useremail);
    const baseQuery = accessData.codes.length ? { colid, programcode: { $in: accessData.codes } } : { colid, _id: null };
    const optionPairs = await Promise.all(
      ledgerFields.map(async (field) => {
        const values = await Ledgerstud.distinct(field, baseQuery);
        return [field, uniqueSorted(values)];
      })
    );
    res.json({
      success: true,
      departments: accessData.departments,
      programs: accessData.programs,
      fields: ledgerFields,
      options: Object.fromEntries(optionPairs)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load programwise fees report options" });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const accessData = await getAccessPrograms(colid, req.body.useremail);
    let allowedPrograms = accessData.programs;
    const selectedDepartments = normalizeArray(req.body.departments);
    if (selectedDepartments.length) {
      allowedPrograms = allowedPrograms.filter((row) => selectedDepartments.includes(text(row.department) || "Not specified"));
    }
    const allowedCodes = uniqueSorted(allowedPrograms.map((row) => row.programcode));
    if (!allowedCodes.length) {
      return res.json({ success: true, data: [], totals: totalRows([]), summaries: {}, message: "No program access found" });
    }

    const query = { colid, programcode: { $in: allowedCodes } };
    const from = dateAtStart(req.body.fromdate);
    const to = dateAtEnd(req.body.todate);
    if (from || to) {
      query.paiddate = {};
      if (from) query.paiddate.$gte = from;
      if (to) query.paiddate.$lte = to;
    }

    (req.body.filters || []).forEach((filter) => {
      const field = text(filter.field);
      if (!ledgerFields.includes(field)) return;
      const values = normalizeArray(filter.values);
      if (!values.length) return;
      if (["student", "name", "regno", "feeitem"].includes(field) && values.length === 1) {
        query[field] = { $regex: escapeRegex(values[0]), $options: "i" };
      } else {
        query[field] = values.length === 1 ? values[0] : { $in: values };
      }
    });

    const programMap = new Map(allowedPrograms.map((row) => [text(row.programcode), row]));
    const data = await Ledgerstud.find(query)
      .select("academicyear admissionyear regulation programcode major minor semester student name regno user feegroup feecategory feetype feeitem feebook cashbook status paymode type installment paiddate duedate amount paid concession balance colid")
      .sort({ programcode: 1, student: 1, feegroup: 1, feeitem: 1 })
      .limit(15000)
      .lean();

    const rows = data.map((row) => {
      const program = programMap.get(text(row.programcode)) || {};
      return {
        ...row,
        department: program.department || "Not specified",
        program: program.program || row.programcode || "Not specified",
        student: row.student || row.name || "Not specified"
      };
    });

    res.json({
      success: true,
      data: rows,
      totals: totalRows(rows),
      summaries: {
        department: groupRows(rows, "department"),
        program: groupRows(rows, "program"),
        programcode: groupRows(rows, "programcode"),
        feegroup: groupRows(rows, "feegroup"),
        feecategory: groupRows(rows, "feecategory"),
        feeitem: groupRows(rows, "feeitem")
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to generate programwise fees report" });
  }
};
