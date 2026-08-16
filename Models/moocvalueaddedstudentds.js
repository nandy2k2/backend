const mongoose = require("mongoose");

const MoocValueAddedStudentSchema = new mongoose.Schema({
  colid: Number,
  offeringid: String,
  academicyear: String,
  regulation: String,
  program: String,
  programcode: String,
  semester: String,
  department: String,
  valueaddedcoursecategory: String,
  valueaddedcourse: String,
  vaccode: String,
  student: String,
  regno: String,
  marksobtained: Number,
  totalmarks: Number,
  status: String,
  name: String,
  user: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: "moocvalueaddedstudentds" });

MoocValueAddedStudentSchema.pre("save", function markUpdated(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.moocvalueaddedstudentds || mongoose.model("moocvalueaddedstudentds", MoocValueAddedStudentSchema);
