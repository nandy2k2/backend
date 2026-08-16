const mongoose = require("mongoose");

const MoocValueAddedCourseMasterSchema = new mongoose.Schema({
  colid: Number,
  academicyear: String,
  valueaddedcourse: String,
  vaccode: String,
  department: String,
  description: String,
  coursetype: String,
  category: String,
  provider: String,
  credittype: String,
  credit: Number,
  name: String,
  user: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: "moocvalueaddedcoursemasterds" });

MoocValueAddedCourseMasterSchema.pre("save", function markUpdated(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.moocvalueaddedcoursemasterds || mongoose.model("moocvalueaddedcoursemasterds", MoocValueAddedCourseMasterSchema);
