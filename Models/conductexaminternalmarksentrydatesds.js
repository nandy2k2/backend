const mongoose = require("mongoose");

const conductExamInternalMarksEntryDatesSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  exam: { type: String, trim: true, default: "" },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  startdate: { type: String, required: true, trim: true },
  enddate: { type: String, required: true, trim: true },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

conductExamInternalMarksEntryDatesSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  examcode: 1,
  programcode: 1,
  semester: 1
}, { unique: true });

module.exports = mongoose.model("conductexaminternalmarksentrydatesds", conductExamInternalMarksEntryDatesSchema);
