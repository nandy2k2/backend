const mongoose = require("mongoose");

const EventReportRagBatchSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  batchid: { type: String, required: true, trim: true },
  filename: { type: String, trim: true, default: "" },
  sha256: { type: String, required: true, trim: true },
  mode: { type: String, enum: ["append", "reset"], default: "append" },
  new_reports: { type: Number, default: 0 },
  total_reports: { type: Number, default: 0 },
  total_batches: { type: Number, default: 0 },
  vocabulary_size: { type: Number, default: 0 },
  ragserver: { type: String, trim: true, default: "" },
  ragstatus: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Completed" },
  name: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

EventReportRagBatchSchema.index({ colid: 1, sha256: 1 }, { unique: true });

module.exports = mongoose.model("eventreportragbatchds", EventReportRagBatchSchema);
