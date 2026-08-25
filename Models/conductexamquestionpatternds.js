const mongoose = require("mongoose");

const conductExamQuestionPatternSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  pattern: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  name: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamQuestionPatternSchema.index({ colid: 1, academicyear: 1, programcode: 1, pattern: 1 }, { unique: true });

module.exports = mongoose.models.conductexamquestionpatternds || mongoose.model("conductexamquestionpatternds", conductExamQuestionPatternSchema);
