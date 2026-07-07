const mongoose = require("mongoose");

const conductExamStudentViewControlSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    exam: { type: String, required: true, trim: true },
    examcode: { type: String, required: true, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    admitcard: { type: String, enum: ["Yes", "No"], default: "No" },
    result: { type: String, enum: ["Yes", "No"], default: "No" },
    reeval: { type: String, enum: ["Yes", "No"], default: "No" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamStudentViewControlSchema.index(
  { colid: 1, academicyear: 1, examcode: 1, regulation: 1, programcode: 1 },
  { unique: true }
);

module.exports = mongoose.model("conductexamstudentviewcontrolds", conductExamStudentViewControlSchema);
