const mongoose = require("mongoose");

const programOutcomeSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    outcometype: { type: String, enum: ["PO", "PEO", "PSO"], required: true, index: true },
    outcomeno: { type: String, trim: true, default: "" },
    outcome: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "Active" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

programOutcomeSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, outcometype: 1, outcomeno: 1 });

module.exports = mongoose.models.programoutcomeds || mongoose.model("programoutcomeds", programOutcomeSchema);
