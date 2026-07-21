const mongoose = require("mongoose");

const nepLmsLoginAttendanceSchema = new mongoose.Schema({
  academicyear: { type: String },
  program: { type: String },
  programcode: { type: String },
  course: { type: String },
  coursecode: { type: String },
  student: { type: String },
  studentemail: { type: String },
  regno: { type: String },
  activitydate: { type: String },
  activitytime: { type: String },
  activitydatetime: { type: Date },
  colid: { type: Number, required: true },
  user: { type: String }
}, { timestamps: true });

nepLmsLoginAttendanceSchema.index(
  { colid: 1, regno: 1, academicyear: 1, coursecode: 1, activitydate: 1 },
  { unique: true }
);

module.exports = mongoose.model("NepLmsLoginAttendance", nepLmsLoginAttendanceSchema);
