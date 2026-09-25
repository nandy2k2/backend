const mongoose = require("mongoose");
const Ledgerstud = require("../Models/ledgerstud");
const User = require("../Models/user");
const CounterFee2Transaction = require("../Models/counterfee2transactionds");

const PASSWORD = "kumropatash";
const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactRegex = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");
const sameText = (left, right) => text(left).toLowerCase() === text(right).toLowerCase();
const uniqueText = (values = []) => [...new Set(values.map(text).filter(Boolean))];

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

const requiredValue = (source, field) => {
  const value = text(source[field]);
  if (!value) {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  return value;
};

const buildMandatoryCriteria = (source = {}, includeProgram = false) => {
  const colid = number(source.colid);
  if (colid === undefined) {
    const error = new Error("colid is required");
    error.statusCode = 400;
    throw error;
  }
  const criteria = {
    colid,
    academicyear: requiredValue(source, "academicyear"),
    programcode: requiredValue(source, "programcode"),
    semester: requiredValue(source, "semester")
  };
  if (includeProgram) criteria.program = requiredValue(source, "program");
  return criteria;
};

const distinctSorted = async (Model, field, query) => {
  const values = await Model.distinct(field, query);
  return values.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const programPairs = async (colid) => {
  const rows = await User.find({ colid, role: /^student$/i })
    .select("program programcode")
    .lean();
  const seen = new Set();
  return rows
    .map((row) => ({ program: text(row.program), programcode: text(row.programcode) }))
    .filter((row) => row.program && row.programcode)
    .filter((row) => {
      const key = `${row.program.toLowerCase()}||${row.programcode.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.program.localeCompare(b.program) || a.programcode.localeCompare(b.programcode, undefined, { numeric: true }));
};

const userToLedgerRows = async (criteria) => {
  const users = await User.find({
    colid: criteria.colid,
    role: /^student$/i,
    academicyear: exactRegex(criteria.academicyear),
    program: exactRegex(criteria.program),
    programcode: exactRegex(criteria.programcode),
    semester: exactRegex(criteria.semester)
  }).select("name email regno academicyear regulation program programcode semester section rollno").sort({ name: 1 }).lean();

  const rows = [];
  for (const user of users) {
    const ledgers = await Ledgerstud.find({
      colid: criteria.colid,
      academicyear: exactRegex(criteria.academicyear),
      programcode: exactRegex(criteria.programcode),
      semester: exactRegex(criteria.semester),
      student: exactRegex(user.name)
    }).select("_id student name regno feegroup feeitem balance status").lean();
    const ledgerRegnos = [...new Set(ledgers.map((row) => text(row.regno)).filter(Boolean))];
    const ledgerRegnoText = ledgerRegnos.join(", ");
    const hasMismatch = !ledgers.length || ledgerRegnos.some((regno) => !sameText(regno, user.regno)) || (ledgerRegnos.length === 0 && text(user.regno));
    rows.push({
      id: String(user._id),
      userId: String(user._id),
      academicyear: user.academicyear || criteria.academicyear,
      regulation: user.regulation || "",
      program: user.program || criteria.program,
      programcode: user.programcode || criteria.programcode,
      semester: user.semester || criteria.semester,
      section: user.section || "",
      studentname: user.name || "",
      useremail: user.email || "",
      userRegno: user.regno || "",
      ledgerRegno: ledgerRegnoText,
      ledgerRows: ledgers.length,
      matching: hasMismatch ? "No" : "Yes",
      canUpdate: ledgers.length && text(user.regno) && hasMismatch ? "Yes" : "No"
    });
  }
  return rows;
};

const ledgerToUserRows = async (criteria) => {
  const ledgers = await Ledgerstud.find({
    colid: criteria.colid,
    academicyear: exactRegex(criteria.academicyear),
    programcode: exactRegex(criteria.programcode),
    semester: exactRegex(criteria.semester)
  }).select("_id academicyear regulation programcode semester student name regno user feegroup feeitem balance status").sort({ student: 1 }).lean();

  const grouped = new Map();
  ledgers.forEach((ledger) => {
    const studentname = text(ledger.student || ledger.name);
    const key = studentname.toLowerCase();
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, { studentname, ledgers: [], ledgerRegnos: new Set() });
    const group = grouped.get(key);
    group.ledgers.push(ledger);
    if (text(ledger.regno)) group.ledgerRegnos.add(text(ledger.regno));
  });

  const rows = [];
  for (const [key, group] of grouped.entries()) {
    const user = await User.findOne({
      colid: criteria.colid,
      role: /^student$/i,
      academicyear: exactRegex(criteria.academicyear),
      ...(text(criteria.program) ? { program: exactRegex(criteria.program) } : {}),
      programcode: exactRegex(criteria.programcode),
      semester: exactRegex(criteria.semester),
      name: exactRegex(group.studentname)
    }).select("_id name email regno academicyear regulation program programcode semester section rollno").lean();
    const ledgerRegnos = Array.from(group.ledgerRegnos);
    const preferredLedgerRegno = ledgerRegnos[0] || "";
    const hasMismatch = !user || !sameText(user.regno, preferredLedgerRegno);
    rows.push({
      id: key,
      ledgerKey: key,
      userId: user?._id ? String(user._id) : "",
      academicyear: criteria.academicyear,
      regulation: user?.regulation || group.ledgers[0]?.regulation || "",
      program: user?.program || "",
      programcode: criteria.programcode,
      semester: criteria.semester,
      section: user?.section || "",
      studentname: group.studentname,
      useremail: user?.email || "",
      userRegno: user?.regno || "",
      ledgerRegno: ledgerRegnos.join(", "),
      selectedLedgerRegno: preferredLedgerRegno,
      ledgerRows: group.ledgers.length,
      matching: hasMismatch ? "No" : "Yes",
      canUpdate: user?._id && preferredLedgerRegno && hasMismatch ? "Yes" : "No"
    });
  }
  return rows;
};

exports.regnoCompareOptions = async (req, res) => {
  try {
    requirePassword(req.query.password);
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [userYears, ledgerYears, programs, userProgramcodes, ledgerProgramcodes, userSemesters, ledgerSemesters, pairs] = await Promise.all([
      distinctSorted(User, "academicyear", { colid, role: /^student$/i }),
      distinctSorted(Ledgerstud, "academicyear", { colid }),
      distinctSorted(User, "program", { colid, role: /^student$/i }),
      distinctSorted(User, "programcode", { colid, role: /^student$/i }),
      distinctSorted(Ledgerstud, "programcode", { colid }),
      distinctSorted(User, "semester", { colid, role: /^student$/i }),
      distinctSorted(Ledgerstud, "semester", { colid }),
      programPairs(colid)
    ]);
    res.json({
      success: true,
      options: {
        academicyear: [...new Set([...userYears, ...ledgerYears])],
        program: programs,
        programcode: [...new Set([...userProgramcodes, ...ledgerProgramcodes])],
        programPairs: pairs,
        semester: [...new Set([...userSemesters, ...ledgerSemesters])]
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.listUserToLedgerRegno = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const criteria = buildMandatoryCriteria(req.body, true);
    const rows = await userToLedgerRows(criteria);
    const mismatchOnly = String(req.body.mismatchOnly || "").toLowerCase() === "true";
    const data = mismatchOnly ? rows.filter((row) => row.matching !== "Yes") : rows;
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.updateUserToLedgerRegno = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const criteria = buildMandatoryCriteria(req.body, true);
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(text).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const users = await User.find({ _id: { $in: ids }, colid: criteria.colid, role: /^student$/i }).select("_id name regno").lean();
    let updated = 0;
    let skipped = 0;
    const results = [];
    for (const user of users) {
      if (!text(user.regno) || !text(user.name)) {
        skipped += 1;
        results.push({ studentname: user.name || "", status: "Skipped", message: "User regno or name missing" });
        continue;
      }
      const result = await Ledgerstud.updateMany({
        colid: criteria.colid,
        academicyear: exactRegex(criteria.academicyear),
        programcode: exactRegex(criteria.programcode),
        semester: exactRegex(criteria.semester),
        student: exactRegex(user.name)
      }, { $set: { regno: user.regno } });
      const count = result.modifiedCount || result.nModified || 0;
      updated += count;
      if (!count) skipped += 1;
      results.push({ studentname: user.name, regno: user.regno, status: count ? "Updated" : "Skipped", ledgerRowsUpdated: count });
    }
    res.json({ success: true, updated, skipped, results });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.listLedgerToUserRegno = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const criteria = buildMandatoryCriteria(req.body, true);
    const rows = await ledgerToUserRows(criteria);
    const mismatchOnly = String(req.body.mismatchOnly || "").toLowerCase() === "true";
    const data = mismatchOnly ? rows.filter((row) => row.matching !== "Yes") : rows;
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.updateLedgerToUserRegno = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const criteria = buildMandatoryCriteria(req.body, true);
    const keys = (Array.isArray(req.body.keys) ? req.body.keys : []).map(text).filter(Boolean);
    if (!keys.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const rows = await ledgerToUserRows(criteria);
    const selected = rows.filter((row) => keys.includes(row.ledgerKey));
    let updated = 0;
    let skipped = 0;
    const results = [];
    for (const row of selected) {
      if (!row.userId || !text(row.selectedLedgerRegno)) {
        skipped += 1;
        results.push({ studentname: row.studentname, status: "Skipped", message: "Matching user or ledger regno missing" });
        continue;
      }
      const result = await User.updateOne({ _id: row.userId, colid: criteria.colid, role: /^student$/i }, { $set: { regno: row.selectedLedgerRegno } });
      const count = result.modifiedCount || result.nModified || 0;
      updated += count;
      if (!count) skipped += 1;
      results.push({ studentname: row.studentname, regno: row.selectedLedgerRegno, status: count ? "Updated" : "Skipped" });
    }
    res.json({ success: true, updated, skipped, results });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const optionalExact = (query, source, field) => {
  const value = text(source[field]);
  if (value) query[field] = exactRegex(value);
};

exports.duplicateFeesOptions = async (req, res) => {
  try {
    requirePassword(req.query.password);
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [academicyear, programcode, semester] = await Promise.all([
      distinctSorted(Ledgerstud, "academicyear", { colid }),
      distinctSorted(Ledgerstud, "programcode", { colid }),
      distinctSorted(Ledgerstud, "semester", { colid })
    ]);
    res.json({ success: true, options: { academicyear, programcode, semester } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.listDuplicateFees = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const colid = number(req.body.colid);
    const academicyear = text(req.body.academicyear);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!academicyear) return res.status(400).json({ success: false, message: "Academic year is required" });

    const query = { colid, academicyear: exactRegex(academicyear) };
    optionalExact(query, req.body, "programcode");
    optionalExact(query, req.body, "semester");

    const groups = await Ledgerstud.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            academicyear: "$academicyear",
            regno: "$regno",
            student: "$student",
            programcode: "$programcode",
            semester: "$semester",
            feegroup: "$feegroup",
            feecategory: "$feecategory",
            feeitem: "$feeitem"
          },
          rowCount: { $sum: 1 },
          totalamount: { $sum: { $ifNull: ["$amount", 0] } },
          totalpaid: { $sum: { $ifNull: ["$paid", 0] } },
          totalconcession: { $sum: { $ifNull: ["$concession", 0] } },
          totalbalance: { $sum: { $ifNull: ["$balance", 0] } },
          ledgerIds: { $push: "$_id" },
          firstLedger: { $first: "$$ROOT" },
          lastApplied: { $max: "$createdAt" }
        }
      },
      { $match: { rowCount: { $gt: 1 }, "_id.regno": { $nin: [null, ""] }, "_id.feeitem": { $nin: [null, ""] } } },
      { $sort: { "_id.programcode": 1, "_id.semester": 1, "_id.student": 1, "_id.feeitem": 1 } },
      { $limit: 10000 }
    ]);

    const regnos = [...new Set(groups.map((row) => text(row._id.regno)).filter(Boolean))];
    const users = regnos.length
      ? await User.find({ colid, role: /^student$/i, regno: { $in: regnos } })
        .select("name email regno rollno academicyear admissionyear regulation program programcode semester section category phone")
        .lean()
      : [];
    const userMap = new Map(users.map((user) => [text(user.regno).toLowerCase(), user]));

    const data = groups.map((row, index) => {
      const first = row.firstLedger || {};
      const user = userMap.get(text(row._id.regno).toLowerCase()) || {};
      return {
        id: `${row._id.regno || "blank"}-${row._id.feeitem || "item"}-${index}`,
        academicyear: row._id.academicyear || academicyear,
        regulation: user.regulation || first.regulation || "",
        program: user.program || first.program || "",
        programcode: user.programcode || row._id.programcode || first.programcode || "",
        semester: user.semester || row._id.semester || first.semester || "",
        section: user.section || first.section || "",
        student: user.name || row._id.student || first.student || first.name || "",
        email: user.email || first.user || "",
        phone: user.phone || "",
        rollno: user.rollno || "",
        regno: row._id.regno || "",
        feegroup: row._id.feegroup || "",
        feecategory: row._id.feecategory || "",
        feeitem: row._id.feeitem || "",
        duplicatecount: row.rowCount || 0,
        totalamount: row.totalamount || 0,
        totalpaid: row.totalpaid || 0,
        totalconcession: row.totalconcession || 0,
        totalbalance: row.totalbalance || 0,
        ledgerids: (row.ledgerIds || []).map((id) => String(id)).join(", "),
        lastapplied: row.lastApplied || ""
      };
    });

    const summary = data.reduce((sum, row) => ({
      students: sum.students.add(text(row.regno).toLowerCase()),
      duplicategroups: sum.duplicategroups + 1,
      duplicateledgerrows: sum.duplicateledgerrows + row.duplicatecount,
      totalamount: sum.totalamount + row.totalamount,
      totalpaid: sum.totalpaid + row.totalpaid,
      totalbalance: sum.totalbalance + row.totalbalance
    }), { students: new Set(), duplicategroups: 0, duplicateledgerrows: 0, totalamount: 0, totalpaid: 0, totalbalance: 0 });

    res.json({
      success: true,
      count: data.length,
      summary: {
        students: summary.students.size,
        duplicategroups: summary.duplicategroups,
        duplicateledgerrows: summary.duplicateledgerrows,
        totalamount: summary.totalamount,
        totalpaid: summary.totalpaid,
        totalbalance: summary.totalbalance
      },
      data
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const counterFeeUserQuery = (criteria, user) => {
  const branches = [];
  if (text(user.name)) branches.push({ student: exactRegex(user.name) }, { "items.student": exactRegex(user.name) });
  if (text(user.email)) branches.push({ email: exactRegex(user.email) }, { "items.email": exactRegex(user.email) });
  return {
    colid: criteria.colid,
    academicyear: exactRegex(criteria.academicyear),
    programcode: exactRegex(criteria.programcode),
    semester: exactRegex(criteria.semester),
    ...(branches.length ? { $or: branches } : { _id: null })
  };
};

const counterFeeRegnosForUser = (transactions, user) => {
  const regnos = [];
  transactions.forEach((tx) => {
    if (sameText(tx.student, user.name) || sameText(tx.email, user.email)) regnos.push(tx.regno);
    (tx.items || []).forEach((item) => {
      if (sameText(item.student, user.name) || sameText(item.email, user.email)) regnos.push(item.regno);
    });
  });
  return uniqueText(regnos);
};

const userToCounterFeeRows = async (criteria) => {
  const users = await User.find({
    colid: criteria.colid,
    role: /^student$/i,
    academicyear: exactRegex(criteria.academicyear),
    program: exactRegex(criteria.program),
    programcode: exactRegex(criteria.programcode),
    semester: exactRegex(criteria.semester)
  }).select("_id name email regno rollno academicyear regulation program programcode semester section").sort({ name: 1 }).lean();

  const rows = [];
  for (const user of users) {
    const transactions = await CounterFee2Transaction.find(counterFeeUserQuery(criteria, user))
      .select("_id transactionid paiddate student email regno items.student items.email items.regno items.feeitem items.feegroup")
      .lean();
    const counterRegnos = counterFeeRegnosForUser(transactions, user);
    const matching = transactions.length && text(user.regno) && counterRegnos.length && counterRegnos.every((regno) => sameText(regno, user.regno)) ? "Yes" : "No";
    rows.push({
      id: String(user._id),
      userId: String(user._id),
      academicyear: user.academicyear || criteria.academicyear,
      regulation: user.regulation || "",
      program: user.program || criteria.program,
      programcode: user.programcode || criteria.programcode,
      semester: user.semester || criteria.semester,
      section: user.section || "",
      studentname: user.name || "",
      useremail: user.email || "",
      rollno: user.rollno || "",
      userRegno: user.regno || "",
      counterFeeRegno: counterRegnos.join(", "),
      transactionCount: transactions.length,
      itemCount: transactions.reduce((sum, tx) => sum + (tx.items || []).filter((item) => sameText(item.student, user.name) || sameText(item.email, user.email)).length, 0),
      transactionIds: transactions.map((tx) => tx.transactionid).filter(Boolean).join(", "),
      matching,
      canUpdate: transactions.length && text(user.regno) && matching !== "Yes" ? "Yes" : "No"
    });
  }
  return rows;
};

exports.userToCounterFeeOptions = async (req, res) => {
  try {
    requirePassword(req.query.password);
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const [userYears, counterYears, programs, userProgramcodes, counterProgramcodes, userSemesters, counterSemesters, pairs] = await Promise.all([
      distinctSorted(User, "academicyear", { colid, role: /^student$/i }),
      distinctSorted(CounterFee2Transaction, "academicyear", { colid }),
      distinctSorted(User, "program", { colid, role: /^student$/i }),
      distinctSorted(User, "programcode", { colid, role: /^student$/i }),
      distinctSorted(CounterFee2Transaction, "programcode", { colid }),
      distinctSorted(User, "semester", { colid, role: /^student$/i }),
      distinctSorted(CounterFee2Transaction, "semester", { colid }),
      programPairs(colid)
    ]);
    res.json({
      success: true,
      options: {
        academicyear: [...new Set([...userYears, ...counterYears])],
        program: programs,
        programcode: [...new Set([...userProgramcodes, ...counterProgramcodes])],
        programPairs: pairs,
        semester: [...new Set([...userSemesters, ...counterSemesters])]
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.listUserToCounterFee = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const criteria = buildMandatoryCriteria(req.body, true);
    const rows = await userToCounterFeeRows(criteria);
    const mode = text(req.body.matchMode || "all").toLowerCase();
    const data = mode === "match"
      ? rows.filter((row) => row.matching === "Yes")
      : mode === "mismatch"
        ? rows.filter((row) => row.matching !== "Yes")
        : rows;
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.updateUserToCounterFee = async (req, res) => {
  try {
    requirePassword(req.body.password);
    const criteria = buildMandatoryCriteria(req.body, true);
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(text).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one student" });
    const users = await User.find({ _id: { $in: ids }, colid: criteria.colid, role: /^student$/i })
      .select("_id name email regno")
      .lean();
    let updated = 0;
    let skipped = 0;
    const results = [];
    for (const user of users) {
      if (!text(user.regno) || (!text(user.name) && !text(user.email))) {
        skipped += 1;
        results.push({ studentname: user.name || "", status: "Skipped", message: "User regno and name/email are required" });
        continue;
      }
      const query = counterFeeUserQuery(criteria, user);
      const rootBranches = [];
      if (text(user.name)) rootBranches.push({ student: exactRegex(user.name) });
      if (text(user.email)) rootBranches.push({ email: exactRegex(user.email) });

      let rootModified = 0;
      if (rootBranches.length) {
        const rootResult = await CounterFee2Transaction.updateMany(
          { ...query, $or: rootBranches },
          { $set: { regno: user.regno } }
        );
        rootModified = rootResult.modifiedCount || rootResult.nModified || 0;
      }

      let itemModified = 0;
      if (text(user.name)) {
        const itemByName = await CounterFee2Transaction.updateMany(
          query,
          { $set: { "items.$[elem].regno": user.regno } },
          { arrayFilters: [{ "elem.student": exactRegex(user.name) }] }
        );
        itemModified += itemByName.modifiedCount || itemByName.nModified || 0;
      }
      if (text(user.email)) {
        const itemByEmail = await CounterFee2Transaction.updateMany(
          query,
          { $set: { "items.$[elem].regno": user.regno } },
          { arrayFilters: [{ "elem.email": exactRegex(user.email) }] }
        );
        itemModified += itemByEmail.modifiedCount || itemByEmail.nModified || 0;
      }

      const count = rootModified + itemModified;
      if (count) updated += count;
      else skipped += 1;
      results.push({
        studentname: user.name || "",
        regno: user.regno,
        status: count ? "Updated" : "Skipped",
        transactionRootUpdates: rootModified,
        itemUpdates: itemModified
      });
    }
    res.json({ success: true, updated, skipped, results });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
