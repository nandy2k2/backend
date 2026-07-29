const mongoose = require("mongoose");

const conductExamFlyingSquadSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    exam: { type: String, trim: true, required: true },
    examcode: { type: String, trim: true, required: true },
    squadname: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamFlyingSquadSchema.index({ colid: 1, academicyear: 1, examcode: 1, squadname: 1 }, { unique: true });

module.exports = mongoose.models.conductexamflyingsquadds || mongoose.model("conductexamflyingsquadds", conductExamFlyingSquadSchema);
