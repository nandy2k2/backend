const mongoose = require("mongoose");

const studentEventAttendanceRequestSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
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
  eventdate: { type: String, required: true },
  eventname: { type: String, required: true },
  eventtype: { type: String },
  organizer: { type: String },
  venue: { type: String },
  reason: { type: String },
  remarks: { type: String },
  documentlinks: [{ title: String, link: String }],
  status: { type: String, default: "Open", index: true },
  welfarecomment: { type: String },
  welfaredocumentlinks: [{ title: String, link: String }],
  reviewedby: { type: String },
  reviewedbyemail: { type: String },
  reviewedat: { type: Date },
  attendancemodifiedcount: { type: Number, default: 0 },
  user: { type: String },
  namecreated: { type: String }
}, { timestamps: true });

studentEventAttendanceRequestSchema.index({ colid: 1, studentemail: 1, eventdate: 1, eventname: 1 });

module.exports = mongoose.model("studenteventattendancerequestds", studentEventAttendanceRequestSchema);
