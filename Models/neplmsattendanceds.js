const mongoose = require("mongoose");

const nepLmsAttendanceSchema = new mongoose.Schema({
  classid: { type: mongoose.Schema.Types.ObjectId },
  studentid: { type: mongoose.Schema.Types.ObjectId },
  student: { type: String },
  studentemail: { type: String },
  studentphone: { type: String },
  regno: { type: String },
  rollno: { type: String },
  program: { type: String },
  programcode: { type: String },
  academicyear: { type: String },
  semester: { type: String },
  section: { type: String },
  classgroup: { type: String },
  enrollmentgroup: { type: String },
  enrollmentgroupid: { type: mongoose.Schema.Types.ObjectId },
  specialization: { type: String },
  major: { type: String },
  faculty: { type: String },
  facultyemail: { type: String },
  course: { type: String },
  coursecode: { type: String },
  classdate: { type: String },
  classtime: { type: String },
  attendance: { type: Number, enum: [0, 1], default: 1 },
  type: { type: String, default: "Regular" },
  comments: { type: String },
  changereason: { type: String },
  changedby: { type: String },
  changedat: { type: Date },
  colid: { type: Number, required: true },
  user: { type: String }
}, { timestamps: true });

nepLmsAttendanceSchema.index({ colid: 1, classid: 1, studentid: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("NepLmsAttendance", nepLmsAttendanceSchema);
