const mongoose = require("mongoose");

const conductExamQuestionPatternDetailSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  patternid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamquestionpatternds", required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  pattern: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  question: { type: String, required: true, trim: true },
  group: { type: String, trim: true },
  subquestion: { type: String, trim: true },
  order: { type: Number, default: 0 },
  marks: { type: Number, default: 0 },
  instructions: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  name: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamQuestionPatternDetailSchema.index({ colid: 1, patternid: 1, section: 1, question: 1, group: 1, subquestion: 1 });

module.exports = mongoose.models.conductexamquestionpatterndetailds || mongoose.model("conductexamquestionpatterndetailds", conductExamQuestionPatternDetailSchema);
