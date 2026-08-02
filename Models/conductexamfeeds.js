const mongoose = require("mongoose");

const conductExamFeeSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    regulation: { type: String, required: true, trim: true },
    exam: { type: String, required: true, trim: true },
    examcode: { type: String, required: true, trim: true },
    program: { type: String, required: true, trim: true },
    programcode: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    coursecode: { type: String, required: true, trim: true },
    regularfee: { type: Number, default: 0 },
    supplementaryfee: { type: Number, default: 0 },
    appealfee: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

conductExamFeeSchema.index({ colid: 1, academicyear: 1, examcode: 1, programcode: 1, semester: 1, coursecode: 1 }, { unique: true });

module.exports = mongoose.model("conductexamfeeds", conductExamFeeSchema);
