const mongoose = require("mongoose");

const sportsNssEventAttendanceSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "sportsnsseventds", required: true },
  groupid: { type: mongoose.Schema.Types.ObjectId, ref: "sportsnssgroupds" },
  activity: { type: String },
  activitytype: { type: String },
  groupname: { type: String },
  event: { type: String },
  studentid: { type: mongoose.Schema.Types.ObjectId },
  student: { type: String },
  studentemail: { type: String },
  regno: { type: String },
  academicyear: { type: String },
  regulation: { type: String },
  program: { type: String },
  programcode: { type: String },
  semester: { type: String },
  section: { type: String },
  attendancedate: { type: String },
  status: { type: String, default: "Absent" },
  markedby: { type: String },
  markedbyemail: { type: String }
}, { timestamps: true });

sportsNssEventAttendanceSchema.index({ colid: 1, eventid: 1, regno: 1, attendancedate: 1 });

module.exports = mongoose.model("sportsnsseventattendanceds", sportsNssEventAttendanceSchema);
