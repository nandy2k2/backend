const mongoose = require("mongoose");

const conductExamScholarshipSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    regulation: { type: String, required: true, trim: true },
    exam: { type: String, required: true, trim: true },
    examcode: { type: String, required: true, trim: true },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    student: { type: String, required: true, trim: true },
    regno: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

conductExamScholarshipSchema.index(
  { colid: 1, academicyear: 1, regulation: 1, examcode: 1, programcode: 1, semester: 1, regno: 1 },
  { unique: true }
);

module.exports = mongoose.model("conductexamscholarshipds", conductExamScholarshipSchema);
