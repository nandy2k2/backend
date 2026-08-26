const mongoose = require("mongoose");

const nepLmsAttendanceOtpSchema = new mongoose.Schema({
  classid: { type: mongoose.Schema.Types.ObjectId, required: true },
  otps: [{ type: String }],
  requiredotpcount: { type: Number, min: 1, max: 6, default: 6 },
  academicyear: { type: String },
  program: { type: String },
  programcode: { type: String },
  semester: { type: String },
  major: { type: String },
  faculty: { type: String },
  facultyemail: { type: String },
  course: { type: String },
  coursecode: { type: String },
  classdate: { type: String },
  classtime: { type: String },
  durationminutes: { type: Number, default: 0 },
  validfrom: { type: Date },
  validtill: { type: Date },
  type: { type: String, default: "Regular" },
  status: { type: String, default: "Active" },
  colid: { type: Number, required: true },
  user: { type: String },
  createdby: { type: String }
}, { timestamps: true });

nepLmsAttendanceOtpSchema.index({ colid: 1, classid: 1, type: 1, status: 1 });

module.exports = mongoose.model("NepLmsAttendanceOtp", nepLmsAttendanceOtpSchema);
