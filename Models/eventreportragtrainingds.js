const mongoose = require("mongoose");

const EventReportRagTrainingSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  batchid: { type: String, trim: true, default: "" },
  report_id: { type: String, trim: true, default: "" },
  event_title: { type: String, trim: true, default: "" },
  event_type: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  department: { type: String, trim: true, default: "" },
  audience: { type: String, trim: true, default: "" },
  tone: { type: String, trim: true, default: "formal" },
  objectives: { type: String, default: "" },
  summary: { type: String, default: "" },
  activities: { type: String, default: "" },
  outcomes: { type: String, default: "" },
  feedback: { type: String, default: "" },
  conclusion: { type: String, default: "" },
  sourcefile: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

EventReportRagTrainingSchema.index({ colid: 1, report_id: 1 });
EventReportRagTrainingSchema.index({ colid: 1, event_type: 1, program: 1, department: 1 });

module.exports = mongoose.model("eventreportragtrainingds", EventReportRagTrainingSchema);
