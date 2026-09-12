const mongoose = require("mongoose");

const timetableAiTrainingBatchSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  batchid: { type: String, required: true },
  filename: { type: String },
  sha256: { type: String },
  mode: { type: String, default: "append" },
  programs: { type: Number, default: 0 },
  faculties: { type: Number, default: 0 },
  rooms: { type: Number, default: 0 },
  courses: { type: Number, default: 0 },
  sections: { type: Number, default: 0 },
  section_courses: { type: Number, default: 0 },
  timeslots: { type: Number, default: 0 },
  historical_schedule: { type: Number, default: 0 },
  new_examples: { type: Number, default: 0 },
  total_examples: { type: Number, default: 0 },
  total_batches: { type: Number, default: 0 },
  holdout_accuracy: { type: Number },
  ragserver: { type: String },
  ragstatus: { type: String },
  name: { type: String },
  user: { type: String }
}, { timestamps: true });

timetableAiTrainingBatchSchema.index({ colid: 1, sha256: 1 });

module.exports = mongoose.model("timetableaitrainingbatchds", timetableAiTrainingBatchSchema);
