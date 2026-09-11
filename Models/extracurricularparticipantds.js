const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "extracurriculareventds", required: true, index: true },
  event: { type: String, trim: true },
  activity: { type: String, trim: true },
  activitytype: { type: String, trim: true },
  studentid: { type: mongoose.Schema.Types.ObjectId },
  student: { type: String, trim: true },
  studentemail: { type: String, trim: true },
  regno: { type: String, trim: true, index: true },
  academicyear: { type: String, trim: true },
  regulation: { type: String, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true },
  semester: { type: String, trim: true },
  section: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true }
}, { timestamps: true });

schema.index({ colid: 1, eventid: 1, regno: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.extracurricularparticipantds || mongoose.model("extracurricularparticipantds", schema);
