const mongoose = require("mongoose");

const nbaMcaSarResponseSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    sarformat: { type: String, trim: true, default: "NBA SAR Tier 1 MCA" },
    academicyear: { type: String, trim: true, required: true, index: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true, index: true },
    criterion: { type: String, trim: true, required: true },
    questionno: { type: String, trim: true, required: true },
    question: { type: String, trim: true, required: true },
    maxmarks: { type: Number, default: 0 },
    erpsource: { type: String, trim: true, default: "" },
    data: { type: String, trim: true, default: "" },
    numericvalue: { type: Number, default: 0 },
    evidenceurl: { type: String, trim: true, default: "" },
    remarks: { type: String, trim: true, default: "" },
    datapulled: { type: String, enum: ["Yes", "No"], default: "No" },
    status: { type: String, enum: ["Draft", "Submitted", "Reviewed", "Approved"], default: "Draft" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

nbaMcaSarResponseSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  questionno: 1
});

module.exports = mongoose.models.nbamcasarresponseds || mongoose.model("nbamcasarresponseds", nbaMcaSarResponseSchema);
