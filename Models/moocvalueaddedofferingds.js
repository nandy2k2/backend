const mongoose = require("mongoose");

const MoocSyllabusSchema = new mongoose.Schema({
  module: String,
  topics: String,
  description: String,
  order: Number
}, { _id: true });

const MoocValueAddedOfferingSchema = new mongoose.Schema({
  colid: Number,
  academicyear: String,
  category: String,
  courseid: String,
  valueaddedcourse: String,
  vaccode: String,
  coursetype: String,
  provider: String,
  credittype: String,
  credit: Number,
  startdate: Date,
  enddate: Date,
  syllabus: [MoocSyllabusSchema],
  name: String,
  user: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: "moocvalueaddedofferingds" });

MoocValueAddedOfferingSchema.pre("save", function markUpdated(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.moocvalueaddedofferingds || mongoose.model("moocvalueaddedofferingds", MoocValueAddedOfferingSchema);
