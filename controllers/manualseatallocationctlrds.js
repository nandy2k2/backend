const express = require("express");
const mongoose = require("mongoose");
const Roll = require("../Models/conductexamrollds");
const Course = require("../Models/conductexamcourseds");
const Room = require("../Models/conductexamroomds");
const router = express.Router();
const keys = ["academicyear", "regulation", "examcode", "program", "programcode", "course", "coursecode"];
const text = value => String(value ?? "").trim();
router.post("/allocate", async (req, res) => {
  try {
    const colid = Number(req.body.colid), capacity = Number(req.body.noofseats), skip = Number(req.body.skip);
    const scope = Object.fromEntries(keys.map(key => [key, text(req.body[key])]));
    const ids = [...new Set(Array.isArray(req.body.ids) ? req.body.ids : [])];
    const building = text(req.body.building), examroom = text(req.body.room);
    const blockno = text(req.body.blockno);
    if (blockno.length > 100) return res.status(400).json({ message: "Block number must be at most 100 characters." });
    if (!(colid > 0) || Object.values(scope).some(value => !value) || !building || !examroom || !ids.length || ids.length > 5000 || ids.some(id => !mongoose.Types.ObjectId.isValid(id)) || !Number.isInteger(capacity) || capacity < 1 || ![0, 1, 2, 3].includes(skip)) return res.status(400).json({ message: "Select exam, program, course, students, building, room, valid capacity and skip rule." });
    const { regulation: selectedRegulation, ...populatedCourseScope } = scope;
    if (!await Course.exists({ colid, ...populatedCourseScope })) return res.status(400).json({ message: "The selected course is not populated for this exam." });
    const room = req.body.roomid ? await Room.findOne({ colid, _id: req.body.roomid }).lean() : null;
    if (req.body.roomid && (!room || room.building !== building || room.room !== examroom)) return res.status(400).json({ message: "Room does not match the selected building." });
    if (room && capacity > room.noofseats) return res.status(400).json({ message: "Capacity exceeds the configured room capacity." });
    const rows = await Roll.find({ colid, ...populatedCourseScope, _id: { $in: ids } }).sort({ regno: 1, _id: 1 }).lean();
    if (rows.length !== ids.length) return res.status(400).json({ message: "Some students no longer match the selection. Reload students." });
    const assignments = [], groups = new Map();
    for (const row of rows) {
      const key = JSON.stringify([row.examdate || "", row.examslot || ""]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const group of groups.values()) {
      const sample = group[0];
      // Seats belong to the exam session and room, not to an individual program or course.
      const occupied = await Roll.find({ colid, examcode: scope.examcode, building, examroom, examdate: sample.examdate || "", examslot: sample.examslot || "", _id: { $nin: ids } }).select("seatno").lean();
      const used = new Set(occupied.map(row => Number(String(row.seatno || "").replace(/^Seat\s*/i, ""))).filter(Number.isFinite));
      let seat = 1;
      for (const row of group) {
        while (seat <= capacity && [...used].some(taken => Math.abs(taken - seat) <= skip)) seat += 1;
        if (seat > capacity) return res.status(400).json({ message: `Not enough available seats for ${sample.examdate || "undated"} ${sample.examslot || ""} with skip rule ${skip}. No students were updated.` });
        assignments.push({ id: row._id, seatno: `Seat ${seat}` });
        used.add(seat); seat += skip + 1;
      }
    }
    const result = await Roll.bulkWrite(assignments.map(row => ({ updateOne: { filter: { _id: row.id, colid, ...populatedCourseScope }, update: { $set: { building, examroom, seatno: row.seatno, ...(room?.campus ? { campus: room.campus } : {}), ...(blockno ? { blockno } : {}) } } } })));
    res.json({ allocated: result.modifiedCount ?? assignments.length });
  } catch (error) { res.status(500).json({ message: error.message }); }
});
module.exports = router;
