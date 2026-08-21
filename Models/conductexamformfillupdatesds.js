const mongoose = require("mongoose");

const conductExamFormFillupDatesSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  examfee: { type: Number, default: 0 },
  lastdate: Date,
  lastdatefine1: Date,
  lastdatefine1amount: { type: Number, default: 0 },
  lastdatefine2: Date,
  lastdatefine2amount: { type: Number, default: 0 },
  lastdatefine3: Date,
  lastdatefine3amount: { type: Number, default: 0 },
  iafillingdate: Date,
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamFormFillupDatesSchema.index({ colid: 1, academicyear: 1, programcode: 1 }, { unique: true });

module.exports = mongoose.model("conductexamformfillupdatesds", conductExamFormFillupDatesSchema);
