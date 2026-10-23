const express = require("express");
const mongoose = require("mongoose");
const User = require("../Models/user");
const router = express.Router();
const fields = ["academicyear", "regulation", "program", "programcode", "semester", "section", "name", "regno", "rollno", "email"];
const text = value => String(value ?? "").trim();
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const wrap = handler => async (req, res) => { try {
  const colid = Number(req.query.colid || req.body.colid);
  if (!(colid > 0)) return res.status(400).json({ message: "Institution is required" });
  await handler(req, res, colid);
} catch (error) { res.status(500).json({ message: error.message }); } };
const base = colid => ({ colid, role: /^Student$/i });
router.get("/options", wrap(async (req, res, colid) => {
  const options = {};
  for (const field of fields) options[field] = (await User.distinct(field, base(colid))).map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const programs = await User.aggregate([{ $match: base(colid) }, { $group: { _id: { program: "$program", programcode: "$programcode" } } }]);
  res.json({ fields, options, programs: programs.map(row => row._id) });
}));
router.post("/students", wrap(async (req, res, colid) => {
  const filters = Array.isArray(req.body.filters) ? req.body.filters : [];
  const clauses = [];
  for (const filter of filters) {
    if (!fields.includes(filter.field)) continue;
    const values = (Array.isArray(filter.value) ? filter.value : [filter.value]).map(text).filter(Boolean);
    if (values.length) clauses.push({ [filter.field]: { $in: values } });
  }
  if (!clauses.length) return res.status(400).json({ message: "Apply at least one student filter before loading" });
  const query = { ...base(colid), $and: clauses };
  const [data, total] = await Promise.all([User.find(query).select("academicyear regulation program programcode section semester name regno rollno email photo").sort({ programcode: 1, semester: 1, section: 1, name: 1 }).limit(5000).lean(), User.countDocuments(query)]);
  res.json({ data, total, limit: 5000 });
}));
router.post("/save", wrap(async (req, res, colid) => {
  const field = req.body.field, rows = req.body.rows;
  if (!["regno", "rollno", "photo"].includes(field) || !Array.isArray(rows) || !rows.length || rows.length > 5000) return res.status(400).json({ message: "Select a valid field and between 1 and 5000 changed students" });
  if (rows.some(row => !mongoose.Types.ObjectId.isValid(row.id) || typeof row.value !== "string" || row.value.length > (field === "photo" ? 4000 : 200))) return res.status(400).json({ message: "Invalid student or update value" });
  const results = [], counts = new Map();
  if (field === "regno") for (const row of rows) counts.set(text(row.value).toLowerCase(), (counts.get(text(row.value).toLowerCase()) || 0) + 1);
  for (const row of rows) {
    const value = text(row.value), oldvalue = text(row.oldvalue);
    const query = { ...base(colid), _id: row.id };
    const student = await User.findOne(query).select(field).lean();
    if (!student) { results.push({ id: row.id, status: "error", message: "Student not found in this institution" }); continue; }
    if (text(student[field]) !== oldvalue) { results.push({ id: row.id, status: "error", message: "Value changed since loading. Reload before editing." }); continue; }
    if (value === oldvalue) { results.push({ id: row.id, status: "unchanged", value }); continue; }
    if (field === "regno" && (!value || counts.get(value.toLowerCase()) > 1 || await User.exists({ colid, role: /^Student$/i, _id: { $ne: row.id }, regno: exact(value) }))) { results.push({ id: row.id, status: "error", message: "Regno is required and must be unique within this institution" }); continue; }
    if (field === "photo" && value && !/^https?:\/\//i.test(value)) { results.push({ id: row.id, status: "error", message: "Photo must be an http or https URL" }); continue; }
    const previous = student[field];
    const result = await User.updateOne({ ...query, ...(previous == null || previous === "" ? { $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: "" }] } : { [field]: previous }) }, { $set: { [field]: value } }, { runValidators: true });
    results.push({ id: row.id, status: (result.matchedCount ?? result.n ?? 0) ? "saved" : "error", value, message: (result.matchedCount ?? result.n ?? 0) ? "Updated" : "Student changed while saving. Reload." });
  }
  res.json({ results, saved: results.filter(row => row.status === "saved").length });
}));
module.exports = router;
