const mongoose = require("mongoose");

const conductExamDatesSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  exam: { type: String, required: true, trim: true },
  examcode: { type: String, required: true, trim: true },
  startdate: Date,
  enddate: Date,
  marksentrystartdate: Date,
  marksentryenddate: Date,
  resulttargetdate: Date,
  resultpublishdate: Date,
  revalstartdate: Date,
  revalenddate: Date,
  atktenddate: Date,
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamDatesSchema.index({ colid: 1, academicyear: 1, regulation: 1, examcode: 1 }, { unique: true });

module.exports = mongoose.model("conductexamdatesds", conductExamDatesSchema);
