const mongoose = require("mongoose");

const academicProgramOutcomeSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, index: true },
    regulation: { type: String, trim: true, index: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, index: true },
    pocode: { type: String, trim: true },
    po: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

academicProgramOutcomeSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, pocode: 1 });

module.exports = mongoose.models.academicprogramoutcomeds || mongoose.model("academicprogramoutcomeds", academicProgramOutcomeSchema);
