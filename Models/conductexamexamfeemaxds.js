const mongoose = require("mongoose");

const conductExamFeeMaxSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    regulation: { type: String, required: true, trim: true },
    program: { type: String, required: true, trim: true },
    programcode: { type: String, required: true, trim: true },
    exam: { type: String, required: true, trim: true },
    examcode: { type: String, required: true, trim: true },
    maxfees: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

conductExamFeeMaxSchema.index(
  { colid: 1, academicyear: 1, regulation: 1, programcode: 1, examcode: 1 },
  { unique: true }
);

module.exports = mongoose.model("conductexamexamfeemaxds", conductExamFeeMaxSchema);
