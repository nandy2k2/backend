const mongoose = require("mongoose");

const timetableAiGeneratedSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  generationid: { type: String, required: true },
  academicyear: { type: String },
  regulation: { type: String },
  programcodes: [{ type: String }],
  semesters: [{ type: String }],
  startdate: { type: String },
  enddate: { type: String },
  status: { type: String, default: "Preview" },
  quality_score: { type: Number },
  timetable: { type: Array, default: [] },
  expandedrows: { type: Array, default: [] },
  faculty_workload: { type: Array, default: [] },
  unscheduled: { type: Array, default: [] },
  request_json: { type: Object },
  ragserver: { type: String },
  insertedcount: { type: Number, default: 0 },
  name: { type: String },
  user: { type: String }
}, { timestamps: true });

timetableAiGeneratedSchema.index({ colid: 1, generationid: 1 });

module.exports = mongoose.model("timetableaigeneratedds", timetableAiGeneratedSchema);
