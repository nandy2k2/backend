const LateFine = require("../Models/latefineds");
const Ledgerstud = require("../Models/ledgerstud");
const MPrograms = require("../Models/mprograms");

const configFields = ["academicyear", "regulation", "program", "programcode", "feeitem", "latefineperday", "maxamount", "status", "comments"];
const filterFields = ["academicyear", "regulation", "program", "programcode", "feeitem", "status"];

function text(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function calculateFine(duedate, perDay, maxAmount) {
  const due = normalizeDate(duedate);
  if (!due) return 0;
  const days = Math.max(0, Math.floor((todayStart().getTime() - due.getTime()) / 86400000));
  const raw = days * Math.max(0, toNumber(perDay));
  const cap = Math.max(0, toNumber(maxAmount));
  return cap > 0 ? Math.min(raw, cap) : raw;
}

function normalizeRow(row = {}) {
  const mapped = {};
  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = String(key || "").replace(/\s+/g, "").toLowerCase();
    const matched = configFields.find((field) => field.toLowerCase() === cleanKey);
    if (matched) mapped[matched] = value;
  });
  return { ...row, ...mapped };
}

function buildConfigPayload(row = {}, context = {}) {
  const source = normalizeRow(row);
  const payload = {};
  configFields.forEach((field) => {
    if (source[field] === undefined) return;
    payload[field] = ["latefineperday", "maxamount"].includes(field) ? toNumber(source[field]) : text(source[field]);
  });
  payload.name = text(context.name || source.name || source.username || source.currentname) || "NA";
  payload.user = text(context.user || source.user || source.currentuser) || "NA";
  payload.regulation = payload.regulation || "";
  payload.program = payload.program || "";
  if (!payload.status) payload.status = "Active";
  return payload;
}

function buildConfigQuery(colid, filters = []) {
  const query = { colid };
  filters.forEach((filter) => {
    const field = text(filter.field);
    const value = text(filter.value);
    if (!field || !value || !filterFields.includes(field)) return;
    if (["program", "feeitem"].includes(field)) query[field] = new RegExp(escapeRegex(value), "i");
    else query[field] = value;
  });
  return query;
}

function ledgerQueryForConfig(config) {
  const query = {
    colid: config.colid,
    academicyear: config.academicyear,
    programcode: config.programcode,
    feeitem: config.feeitem
  };
  if (config.regulation) query.regulation = config.regulation;
  return query;
}

async function attachComputedFine(rows) {
  return Promise.all(rows.map(async (row) => {
    const ledgers = await Ledgerstud.find(ledgerQueryForConfig(row)).select("duedate Latefinedue balance").lean();
    const fines = ledgers.map((ledger) => calculateFine(ledger.duedate, row.latefineperday, row.maxamount));
    return {
      ...row,
      fineapplicabletillnow: fines.length ? Math.max(...fines) : 0,
      affectedledgercount: ledgers.length
    };
  }));
}

async function distinctSorted(Model, field, query) {
  return (await Model.distinct(field, query))
    .filter((item) => item !== null && item !== undefined && item !== "")
    .map((item) => String(item))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

exports.getOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const base = { colid };
    const [academicyears, regulations, feeitems, ledgerProgramCodes, configuredPrograms, mprogramRows] = await Promise.all([
      distinctSorted(Ledgerstud, "academicyear", base),
      distinctSorted(Ledgerstud, "regulation", base),
      distinctSorted(Ledgerstud, "feeitem", base),
      distinctSorted(Ledgerstud, "programcode", base),
      distinctSorted(LateFine, "program", base),
      MPrograms.find({ colid }).select("year regulation program programcode").sort({ program: 1, programcode: 1 }).lean()
    ]);
    const programMap = new Map();
    mprogramRows.forEach((row) => {
      if (!row.programcode) return;
      programMap.set(String(row.programcode), {
        academicyear: row.year || "",
        regulation: row.regulation || "",
        program: row.program || row.programcode,
        programcode: row.programcode
      });
    });
    ledgerProgramCodes.forEach((programcode) => {
      if (!programMap.has(programcode)) programMap.set(programcode, { program: programcode, programcode });
    });
    configuredPrograms.forEach((program) => {
      const exists = [...programMap.values()].some((row) => row.program === program);
      if (!exists) programMap.set(`program-${program}`, { program, programcode: "" });
    });
    res.json({
      success: true,
      options: {
        academicyears,
        regulations,
        feeitems,
        programcodes: ledgerProgramCodes,
        programs: [...programMap.values()].sort((a, b) => String(a.program || "").localeCompare(String(b.program || "")))
      },
      fields: configFields,
      filterFields
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await LateFine.find(buildConfigQuery(colid, req.body.filters || [])).sort({ academicyear: -1, program: 1, feeitem: 1 }).lean();
    res.json({ success: true, data: await attachComputedFine(rows), count: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const feeitems = Array.isArray(req.body.feeitems) && req.body.feeitems.length ? req.body.feeitems : [req.body.feeitem];
    const saved = [];
    for (const item of feeitems) {
      const payload = { ...buildConfigPayload({ ...req.body, feeitem: item }, req.body), colid };
      if (!payload.academicyear || !payload.programcode || !payload.feeitem) {
        return res.status(400).json({ success: false, message: "Academic year, program code and fee item are required" });
      }
      const query = req.body.id
        ? { _id: req.body.id, colid }
        : { colid, academicyear: payload.academicyear, regulation: payload.regulation || "", programcode: payload.programcode, feeitem: payload.feeitem };
      const row = await LateFine.findOneAndUpdate(query, payload, { new: true, upsert: !req.body.id, runValidators: true, setDefaultsOnInsert: true });
      saved.push(row);
    }
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows found" });
    const errors = [];
    let saved = 0;
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const payload = { ...buildConfigPayload(rows[index], req.body), colid };
        if (!payload.academicyear || !payload.programcode || !payload.feeitem) throw new Error("Academic year, program code and fee item are required");
        await LateFine.findOneAndUpdate(
          { colid, academicyear: payload.academicyear, regulation: payload.regulation || "", programcode: payload.programcode, feeitem: payload.feeitem },
          payload,
          { upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );
        saved += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    res.json({ success: true, inserted: saved, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMany = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one row" });
    const result = await LateFine.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyLateFine = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid, undefined);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one late fine rule" });
    const configs = await LateFine.find({ colid, _id: { $in: ids } }).lean();
    let matched = 0;
    let modified = 0;
    let balanceDelta = 0;
    let totalFine = 0;
    const details = [];
    for (const config of configs) {
      const ledgers = await Ledgerstud.find(ledgerQueryForConfig(config)).select("_id duedate Latefinedue balance student regno feeitem").lean();
      let ruleModified = 0;
      let ruleDelta = 0;
      let ruleFine = 0;
      for (const ledger of ledgers) {
        matched += 1;
        const newFine = calculateFine(ledger.duedate, config.latefineperday, config.maxamount);
        const oldFine = toNumber(ledger.Latefinedue);
        const delta = newFine - oldFine;
        if (delta !== 0) {
          await Ledgerstud.updateOne(
            { _id: ledger._id, colid },
            {
              $set: { Latefinedue: newFine },
              $inc: { balance: delta }
            }
          );
          modified += 1;
          ruleModified += 1;
          ruleDelta += delta;
          balanceDelta += delta;
        }
        totalFine += newFine;
        ruleFine += newFine;
      }
      await LateFine.updateOne(
        { _id: config._id, colid },
        { $set: { lastappliedat: new Date(), lastappliedcount: ledgers.length, lastappliedamount: ruleFine } }
      );
      details.push({ id: config._id, feeitem: config.feeitem, matched: ledgers.length, modified: ruleModified, balanceDelta: ruleDelta });
    }
    res.json({ success: true, matched, modified, balanceDelta, totalFine, details });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
