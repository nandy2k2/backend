const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "extracurriculareventds", required: true, index: true },
  event: { type: String, trim: true },
  activity: { type: String, trim: true },
  activitytype: { type: String, trim: true },
  attendancedate: { type: String, trim: true, index: true },
  studentid: { type: mongoose.Schema.Types.ObjectId },
  student: { type: String, trim: true },
  studentemail: { type: String, trim: true },
  regno: { type: String, trim: true, index: true },
  attendance: { type: Number, enum: [0, 1], default: 0 },
  status: { type: String, trim: true, default: "Absent" },
  user: { type: String, trim: true }
}, { timestamps: true });

schema.index({ colid: 1, eventid: 1, regno: 1, attendancedate: 1 }, { unique: true });

module.exports = mongoose.models.extracurricularattendanceds || mongoose.model("extracurricularattendanceds", schema);
