const express = require("express");
const mongoose = require("mongoose");
const Roll = require("../Models/conductexamrollds");
const Exam = require("../Models/conductexamds");
const router = express.Router();
const text = value => String(value ?? "").trim();
const wrap = handler => async (req, res) => { try {
  const source = req.method === "GET" ? req.query : req.body;
  const colid = Number(source.colid);
  if (!(colid > 0)) return res.status(400).json({ message: "Institution is required" });
  await handler(req, res, colid, source);
} catch (error) { res.status(error.status || 500).json({ message: error.message }); } };
const invalid = message => { const error = new Error(message); error.status = 400; throw error; };
const scope = (source, colid, programs = false) => {
  const academicyear = text(source.academicyear), examcode = text(source.examcode);
  if (!academicyear || !examcode) invalid("Select academic year and exam");
  const query = { colid, academicyear, examcode };
  if (programs) {
    if (!Array.isArray(source.programs) || !source.programs.length || source.programs.length > 1000) invalid("Select one or more programs");
    query.$or = source.programs.map(row => {
      if (!text(row.program) || !text(row.programcode)) invalid("Select valid programs and program codes");
      return { program: text(row.program), programcode: text(row.programcode) };
    });
  }
  return query;
};
router.get("/exams", wrap(async (req, res, colid) => res.json({ data: await Exam.find({ colid }).select("academicyear examname examcode").sort({ academicyear: -1, examname: 1 }).lean() })));
router.get("/programs", wrap(async (req, res, colid, source) => {
  const data = await Roll.aggregate([{ $match: scope(source, colid) }, { $group: { _id: { program: "$program", programcode: "$programcode" } } }, { $sort: { "_id.program": 1, "_id.programcode": 1 } }]);
  res.json({ data: data.map(row => row._id).filter(row => row.program && row.programcode) });
}));
router.post("/students", wrap(async (req, res, colid, source) => {
  const data = await Roll.find(scope(source, colid, true)).select("academicyear exam examcode program programcode semester course coursecode student regno email examdate examslot building examroom seatno blockno").sort({ programcode: 1, student: 1, coursecode: 1 }).lean();
  res.json({ data });
}));
router.post("/assign", wrap(async (req, res, colid, source) => {
  const query = scope(source, colid, true), blockno = text(source.blockno);
  const ids = [...new Set(Array.isArray(source.ids) ? source.ids : [])];
  if (!blockno || blockno.length > 100) invalid("Enter a block number (up to 100 characters)");
  if (!ids.length || ids.length > 10000 || ids.some(id => !mongoose.Types.ObjectId.isValid(id))) invalid("Select between 1 and 10000 valid examroll rows");
  query._id = { $in: ids };
  const result = await Roll.updateMany(query, { $set: { blockno } }, { runValidators: true });
  const matched = result.matchedCount ?? result.n ?? 0;
  res.json({ matched, modified: result.modifiedCount ?? result.nModified ?? 0, skipped: ids.length - matched });
}));
module.exports = router;
