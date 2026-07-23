const Ledgerstud = require("../Models/ledgerstud");
const FeeRefund = require("../Models/feerefundds");
const UserBankAccount = require("../Models/userbankaccountds");
const MPrograms = require("../Models/mprograms");

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toDate = (value, fallback = undefined) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};
const escapeRegex = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const refundFields = Object.keys(FeeRefund.schema.paths).filter((field) => field !== "__v");
const editableRefundFields = refundFields.filter((field) => !["_id", "createdAt", "updatedAt"].includes(field));
const numberFields = refundFields.filter((field) => FeeRefund.schema.paths[field]?.instance === "Number");
const dateFields = refundFields.filter((field) => FeeRefund.schema.paths[field]?.instance === "Date");

const optionFields = [
  "academicyear", "admissionyear", "programcode", "program", "regulation", "major", "minor",
  "semester", "student", "regno", "user", "feegroup", "feeitem", "feecategory", "feetype",
  "refundable", "refundmode", "status"
];

function buildQuery(colid, filters = []) {
  const query = { colid };
  filters.forEach((filter) => {
    const field = clean(filter.field);
    const value = filter.value;
    if (!field || value === "" || value === null || value === undefined) return;
    if (numberFields.includes(field)) query[field] = number(value, undefined);
    else if (dateFields.includes(field)) {
      const date = toDate(value, null);
      if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        query[field] = { $gte: start, $lte: end };
      }
    } else query[field] = new RegExp(escapeRegex(value), "i");
  });
  return query;
}

function normalizeRefundPayload(body = {}) {
  const payload = {};
  editableRefundFields.forEach((field) => {
    if (body[field] === undefined || field === "colid") return;
    if (numberFields.includes(field)) payload[field] = number(body[field], 0);
    else if (dateFields.includes(field)) payload[field] = toDate(body[field], undefined);
    else payload[field] = clean(body[field]);
  });
  return payload;
}

async function programNames(colid, codes = []) {
  const rows = await MPrograms.find({ colid, programcode: { $in: [...new Set(codes.filter(Boolean))] } }).select("program programcode").lean();
  const map = new Map();
  rows.forEach((row) => map.set(row.programcode, row.program || ""));
  return map;
}

async function bankMapForLedgers(colid, ledgers = []) {
  const ownerusers = ledgers.map((item) => item.user).filter(Boolean);
  const regnos = ledgers.map((item) => item.regno).filter(Boolean);
  const banks = await UserBankAccount.find({
    colid,
    status: { $ne: "Inactive" },
    $or: [
      { owneruser: { $in: ownerusers } },
      { regno: { $in: regnos } }
    ]
  }).sort({ isdefault: -1, updatedAt: -1 }).lean();
  const map = new Map();
  banks.forEach((bank) => {
    const keys = [bank.owneruser, bank.regno].filter(Boolean);
    keys.forEach((key) => {
      if (!map.has(key) || bank.isdefault === "Yes") map.set(key, bank);
    });
  });
  return map;
}

exports.getCandidates = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = {
      colid,
      balance: 0,
      refundable: /^Yes$/i
    };
    ["academicyear", "programcode", "regulation"].forEach((field) => {
      if (clean(req.query[field])) query[field] = clean(req.query[field]);
    });
    const ledgers = await Ledgerstud.find(query).sort({ academicyear: -1, programcode: 1, student: 1, feeitem: 1 }).limit(5000).lean();
    const [bankMap, programMap] = await Promise.all([
      bankMapForLedgers(colid, ledgers),
      programNames(colid, ledgers.map((item) => item.programcode))
    ]);
    const data = ledgers.map((row) => {
      const bank = bankMap.get(row.user) || bankMap.get(row.regno) || {};
      return {
        ...row,
        id: row._id,
        program: row.program || programMap.get(row.programcode) || "",
        bankname: bank.bankname || "",
        branchname: bank.branchname || "",
        accountholdername: bank.accountholdername || "",
        accountnumber: bank.accountnumber || "",
        ifsccode: bank.ifsccode || "",
        accounttype: bank.accounttype || "",
        upiid: bank.upiid || "",
        bankattachmenturl: bank.attachment?.url || ""
      };
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processRefunds = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one ledger row" });
    const refunddate = toDate(req.body.refunddate, new Date());
    const refundedamountInput = req.body.refundedamount;
    const refundmode = clean(req.body.refundmode);
    const refundrefno = clean(req.body.refundrefno);
    const refundcomments = clean(req.body.refundcomments);

    const ledgers = await Ledgerstud.find({ _id: { $in: ids }, colid }).lean();
    const [bankMap, programMap] = await Promise.all([
      bankMapForLedgers(colid, ledgers),
      programNames(colid, ledgers.map((item) => item.programcode))
    ]);
    const created = [];

    for (const ledger of ledgers) {
      const defaultRefundAmount = number(ledger.refundamount, 0);
      const refundedamount = refundedamountInput === "" || refundedamountInput === undefined || refundedamountInput === null
        ? defaultRefundAmount
        : number(refundedamountInput, defaultRefundAmount);
      const bank = bankMap.get(ledger.user) || bankMap.get(ledger.regno) || {};
      await Ledgerstud.findOneAndUpdate(
        { _id: ledger._id, colid },
        { refunddate, refundedamount, refundmode, refundrefno, refundcomments },
        { new: true }
      );
      const refund = await FeeRefund.create({
        colid,
        ledgerid: String(ledger._id),
        academicyear: ledger.academicyear,
        admissionyear: ledger.admissionyear,
        program: ledger.program || programMap.get(ledger.programcode) || "",
        programcode: ledger.programcode,
        regulation: ledger.regulation,
        major: ledger.major,
        minor: ledger.minor,
        semester: ledger.semester,
        student: ledger.student,
        regno: ledger.regno,
        user: ledger.user,
        feegroup: ledger.feegroup,
        feeitem: ledger.feeitem,
        feecategory: ledger.feecategory,
        feetype: ledger.feetype,
        amount: number(ledger.amount, 0),
        paid: number(ledger.paid, 0),
        concession: number(ledger.concession, 0),
        balance: number(ledger.balance, 0),
        refundable: ledger.refundable || "Yes",
        refundamount: defaultRefundAmount,
        refunddate,
        refundedamount,
        refundmode,
        refundrefno,
        refundcomments,
        bankname: bank.bankname || "",
        branchname: bank.branchname || "",
        accountholdername: bank.accountholdername || "",
        accountnumber: bank.accountnumber || "",
        ifsccode: bank.ifsccode || "",
        accounttype: bank.accounttype || "",
        upiid: bank.upiid || "",
        bankattachmenturl: bank.attachment?.url || "",
        status: "Refunded",
        processedby: clean(req.body.user),
        processedbyname: clean(req.body.name),
        createdby: clean(req.body.user),
        updatedby: clean(req.body.user)
      });
      created.push(refund);
    }
    res.json({ success: true, updated: ledgers.length, created: created.length, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const values = {};
    await Promise.all(optionFields.map(async (field) => {
      values[field] = (await FeeRefund.distinct(field, { colid }))
        .filter((item) => item !== null && item !== undefined && item !== "")
        .map((item) => String(item))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({ success: true, fields: refundFields, editableFields: editableRefundFields, numberFields, dateFields, optionFields, values });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = buildQuery(colid, Array.isArray(req.body.filters) ? req.body.filters : []);
    const data = await FeeRefund.find(query).sort({ refunddate: -1, createdAt: -1 }).limit(10000).lean();
    const totals = data.reduce((sum, row) => ({
      count: sum.count + 1,
      refundamount: sum.refundamount + number(row.refundamount, 0),
      refundedamount: sum.refundedamount + number(row.refundedamount, 0)
    }), { count: 0, refundamount: 0, refundedamount: 0 });
    res.json({ success: true, count: data.length, data, totals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = { ...normalizeRefundPayload(req.body), colid, updatedby: clean(req.body.user) };
    const id = req.body.id || req.body._id;
    const data = id
      ? await FeeRefund.findOneAndUpdate({ _id: id, colid }, payload, { new: true, runValidators: true })
      : await FeeRefund.create({ ...payload, createdby: clean(req.body.user) });
    if (!data) return res.status(404).json({ success: false, message: "Refund record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const data = await FeeRefund.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid, undefined) });
    if (!data) return res.status(404).json({ success: false, message: "Refund record not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = rows.map((row) => ({ ...normalizeRefundPayload(row), colid, createdby: clean(req.body.user), updatedby: clean(req.body.user) }));
    const data = docs.length ? await FeeRefund.insertMany(docs, { ordered: false }) : [];
    res.json({ success: true, inserted: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
