const mongoose = require("mongoose");

const mcaMarksheetSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, trim: true, required: true },
  regulation: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  course: { type: String, trim: true, default: "" },
  coursecode: { type: String, trim: true, required: true },
  student: { type: String, trim: true, default: "" },
  regno: { type: String, trim: true, required: true },
  abcid: { type: String, trim: true, default: "" },
  exam: { type: String, trim: true, default: "" },
  examcode: { type: String, trim: true, default: "" },
  specialization: { type: String, trim: true, default: "" },
  mediumofinstruction: { type: String, trim: true, default: "" },
  oldenrolmmentno: { type: String, trim: true, default: "" },
  credit: { type: Number, default: 0 },
  cceobtained: { type: Number, default: 0 },
  ccetotal: { type: Number, default: 0 },
  ccepercentage: { type: Number, default: 0 },
  ccegrade: { type: String, trim: true, default: "" },
  seetheoryobtained: { type: Number, default: 0 },
  seetheorytotal: { type: Number, default: 0 },
  seetheorypercentage: { type: Number, default: 0 },
  seetheorygrade: { type: String, trim: true, default: "" },
  seepracticalobtained: { type: Number, default: 0 },
  seepracticaltotal: { type: Number, default: 0 },
  seepracticalpercentage: { type: Number, default: 0 },
  seepracticalgrade: { type: String, trim: true, default: "" },
  overallobtained: { type: Number, default: 0 },
  overalltotal: { type: Number, default: 0 },
  overallpercentage: { type: Number, default: 0 },
  overallgrade: { type: String, trim: true, default: "" },
  gradepoint: { type: Number, default: 0 },
  overallgradepoints: { type: Number, default: 0 },
  status: { type: String, trim: true, default: "Active" },
  name: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

mcaMarksheetSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  regulation: 1,
  programcode: 1,
  semester: 1,
  regno: 1,
  coursecode: 1
}, { unique: true });

module.exports = mongoose.models.mcamarksheetds || mongoose.model("mcamarksheetds", mcaMarksheetSchema);
