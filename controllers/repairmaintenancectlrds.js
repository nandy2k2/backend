const mongoose = require("mongoose");
const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");

const PASSWORD = "kumropatash";
const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactRegex = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");

const filterFields = [
  "academicyear",
  "admissionyear",
  "regulation",
  "program",
  "programcode",
  "semester",
  "section",
  "student",
  "name",
  "regno",
  "user",
  "feegroup",
  "feecategory",
  "feeitem",
  "status"
];

const parseFilters = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const requirePassword = (value) => {
  if (text(value) !== PASSWORD) {
    const error = new Error("Invalid password");
    error.statusCode = 403;
    throw error;
  }
};

const buildLedgerQuery = (source = {}) => {
  const colid = number(source.colid);
  if (colid === undefined) {
    const error = new Error("colid is required");
    error.statusCode = 400;
    throw error;
  }
  const query = { colid };
  parseFilters(source.filters).forEach((filter) => {
    const field = text(filter.field);
    if (!filterFields.includes(field)) return;
    const values = Array.isArray(filter.value) ? filter.value.map(text).filter(Boolean) : [text(filter.value)].filter(Boolean);
    if (!values.length) return;
    query[field] = values.length > 1 ? { $in: values } : values[0];
  });
  return query;
};

const matchUserForLedger = async (ledger) => {
  const colid = number(ledger.colid);
  const studentName = text(ledger.student || ledger.name);
  const base = {
    colid,
    role: /^student$/i,
    programcode: exactRegex(ledger.programcode),
    name: exactRegex(studentName)
  };
  if (text(ledger.academicyear)) base.academicyear = exactRegex(ledger.academicyear);
  if (text(ledger.regulation)) base.regulation = exactRegex(ledger.regulation);
  if (!studentName || !text(ledger.programcode)) return null;

  let user = await User.findOne(base).select("name email regno academicyear regulation program programcode semester section").lean();
  if (!user && text(ledger.admissionyear)) {
    const fallback = { ...base };
    delete fallback.academicyear;
    fallback.admissionyear = exactRegex(ledger.admissionyear);
    user = await User.findOne(fallback).select("name email regno academicyear admissionyear regulation program programcode semester section").lean();
  }
  return user;
};

exports.options = async (req, res) => {
  try {
    requirePassword(req.query.password);
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const pairs = await Promise.all(filterFields.map(async (field) => {
      const values = await Ledgerstud.distinct(field, { colid });
      return [field, values.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b))];
    }));
    res.json({ success: true, fields: filterFields, options: Object.fromEntries(pairs) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.listLedgerMatches = async (req, res) => {
  try {
    requirePassword(req.body.password || req.query.password);
    const query = buildLedgerQuery(req.body);
    const rows = await Ledgerstud.find(query)
      .select("academicyear admissionyear regulation program programcode semester section student name regno user feegroup feecategory feeitem status balance colid")
      .sort({ academicyear: -1, programcode: 1, student: 1 })
      .limit(5000)
      .lean();
    const data = [];
    for (const row of rows) {
      const matchedUser = await matchUserForLedger(row);
      data.push({
        ...row,
        matched: matchedUser ? "Yes" : "No",
        matchedUserName: matchedUser?.name || "",
        matchedUserEmail: matchedUser?.email || "",
        matchedUserRegno: matchedUser?.regno || "",
        currentLedgerRegno: row.regno || "",
        willUpdate: matchedUser?.regno && matchedUser.regno !== row.regno ? "Yes" : "No"
      });
    }
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.updateLedgerRegno = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const colid = number(req.body.colid);
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [])
      .map(text)
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one ledger row" });

    const rows = await Ledgerstud.find({ colid, _id: { $in: ids } }).lean();
    const results = [];
    for (const row of rows) {
      const matchedUser = await matchUserForLedger(row);
      if (!matchedUser?.regno) {
        results.push({ id: row._id, status: "Skipped", message: "No matching Student user found" });
        continue;
      }
      await Ledgerstud.updateOne({ _id: row._id, colid }, { $set: { regno: matchedUser.regno } });
      results.push({ id: row._id, status: "Updated", oldRegno: row.regno || "", newRegno: matchedUser.regno, user: matchedUser.email || "" });
    }
    res.json({
      success: true,
      updated: results.filter((row) => row.status === "Updated").length,
      skipped: results.filter((row) => row.status !== "Updated").length,
      results
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
